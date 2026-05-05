const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/env');

// ── Frequencies (days) ─────────────────────────────────────────────────────
const FREQUENCIES = {
  fire_alarm:         7,
  communal_area:      7,
  cleaning:           7,
  garden_exterior:    14,
  full_property:      90,
  hmo_compliance:     365,
  fire_co_alarm:      30,
  property_condition: 90,
};

// ── Validation ─────────────────────────────────────────────────────────────
const createSchema = z.object({
  propertyId:    z.string().uuid(),
  type:          z.enum(['fire_alarm', 'communal_area', 'cleaning', 'garden_exterior', 'full_property', 'hmo_compliance', 'fire_co_alarm', 'property_condition']),
  inspectorName: z.string().min(1).max(255),
  inspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overallResult:  z.enum(['pass', 'fail', 'issues_noted']),
  notes:          z.string().optional(),
  items:          z.array(z.object({
    itemLabel: z.string().min(1).max(255),
    result:    z.enum(['pass', 'fail']),
    notes:     z.string().optional(),
  })).min(1),
});

async function inspectionRoutes(fastify, options) {

  // ── GET /status — compliance overview per property ────────────────────────
  fastify.get('/status', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id: userId, role } = request.user;

      const pFilter = role === 'landlord' ? 'AND landlord_id = ?' : '';
      const [properties] = await pool.query(
        `SELECT id, COALESCE(property_name, address_line_1) AS name, is_hmo, property_type FROM properties WHERE 1=1 ${pFilter}`,
        role === 'landlord' ? [userId] : []
      );

      const iFilter = role === 'landlord' ? 'AND p.landlord_id = ?' : '';
      const [latest] = await pool.query(
        `SELECT i.property_id, i.type, MAX(i.inspection_date) AS last_date
         FROM inspections i
         JOIN properties p ON i.property_id = p.id
         WHERE 1=1 ${iFilter}
         GROUP BY i.property_id, i.type`,
        role === 'landlord' ? [userId] : []
      );

      const lastMap = {};
      for (const row of latest) {
        if (!lastMap[row.property_id]) lastMap[row.property_id] = {};
        lastMap[row.property_id][row.type] = row.last_date;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = properties.map(prop => {
        const types = {};
        for (const [type, freqDays] of Object.entries(FREQUENCIES)) {
          const raw = lastMap[prop.id]?.[type];
          if (!raw) {
            types[type] = { status: 'overdue', lastDate: null, nextDue: null };
          } else {
            const lastDate = raw instanceof Date ? raw : new Date(raw);
            const nextDue  = new Date(lastDate);
            nextDue.setDate(nextDue.getDate() + freqDays);
            const daysLeft = Math.ceil((nextDue - today) / 86400000);
            types[type] = {
              status:   daysLeft < 0 ? 'overdue' : daysLeft <= 2 ? 'due' : 'ok',
              lastDate: localDateStr(lastDate),
              nextDue:  localDateStr(nextDue),
            };
          }
        }
        return { propertyId: prop.id, propertyName: prop.name, isHmo: Boolean(prop.is_hmo) || prop.property_type === 'hmo', types };
      });

      return reply.send({ properties: result });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch inspection status' });
    }
  });

  // ── GET / — list inspections ───────────────────────────────────────────────
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { propertyId, type } = request.query;
      const { id: userId, role } = request.user;

      let query = `
        SELECT i.*,
               COALESCE(p.property_name, p.address_line_1) AS property_name,
               p.landlord_id,
               (SELECT COUNT(*) FROM inspection_items ii WHERE ii.inspection_id = i.id AND ii.result = 'fail') AS fail_count
        FROM inspections i
        JOIN properties p ON i.property_id = p.id
        WHERE 1=1
      `;
      const params = [];

      if (role === 'landlord') { query += ' AND p.landlord_id = ?'; params.push(userId); }
      if (propertyId)          { query += ' AND i.property_id = ?'; params.push(propertyId); }
      if (type)                { query += ' AND i.type = ?';        params.push(type); }

      query += ' ORDER BY i.inspection_date DESC, i.created_at DESC';

      const [rows] = await pool.query(query, params);
      return reply.send({ inspections: rows.map(fmt) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch inspections' });
    }
  });

  // ── GET /photos/:photoId — serve photo ────────────────────────────────────
  fastify.get('/photos/:photoId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const [photos] = await pool.query(
        `SELECT ip.*, p.landlord_id
         FROM inspection_photos ip
         JOIN inspections i ON ip.inspection_id = i.id
         JOIN properties p ON i.property_id = p.id
         WHERE ip.id = ?`,
        [request.params.photoId]
      );

      if (photos.length === 0) return reply.code(404).send({ error: 'Photo not found' });
      if (request.user.role === 'landlord' && photos[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const filePath = path.resolve(config.uploadDir, photos[0].storage_path);
      if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Photo file not found' });

      const ext = path.extname(photos[0].file_name).toLowerCase();
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      reply.header('Content-Type', mime[ext] || 'application/octet-stream');
      return reply.send(fs.createReadStream(filePath));
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to serve photo' });
    }
  });

  // ── GET /:id — inspection detail ──────────────────────────────────────────
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const [rows] = await pool.query(
        `SELECT i.*, COALESCE(p.property_name, p.address_line_1) AS property_name, p.landlord_id
         FROM inspections i JOIN properties p ON i.property_id = p.id WHERE i.id = ?`,
        [request.params.id]
      );

      if (rows.length === 0) return reply.code(404).send({ error: 'Inspection not found' });
      if (request.user.role === 'landlord' && rows[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const [items] = await pool.query(
        'SELECT * FROM inspection_items WHERE inspection_id = ? ORDER BY id',
        [request.params.id]
      );
      const [photos] = await pool.query(
        'SELECT * FROM inspection_photos WHERE inspection_id = ? ORDER BY created_at',
        [request.params.id]
      );

      return reply.send({
        inspection: {
          ...fmt(rows[0]),
          items: items.map(item => ({
            id:        item.id,
            itemLabel: item.item_label,
            result:    item.result,
            notes:     item.notes,
          })),
          photos: photos.map(p => ({
            id:       p.id,
            fileName: p.file_name,
            url:      `/api/inspections/photos/${p.id}`,
          })),
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch inspection' });
    }
  });

  // ── POST / — create inspection ────────────────────────────────────────────
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const validated = createSchema.parse(request.body);

      const [properties] = await pool.query(
        'SELECT landlord_id FROM properties WHERE id = ?',
        [validated.propertyId]
      );
      if (properties.length === 0) return reply.code(404).send({ error: 'Property not found' });
      if (request.user.role === 'landlord' && properties[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const id = generateUUID();
      await pool.query(
        `INSERT INTO inspections (id, property_id, type, inspector_name, inspection_date, overall_result, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, validated.propertyId, validated.type, validated.inspectorName,
         validated.inspectionDate, validated.overallResult, validated.notes || null, request.user.id]
      );

      for (const item of validated.items) {
        await pool.query(
          `INSERT INTO inspection_items (id, inspection_id, item_label, result, notes) VALUES (?, ?, ?, ?, ?)`,
          [generateUUID(), id, item.itemLabel, item.result, item.notes || null]
        );
      }

      return reply.code(201).send({ message: 'Inspection logged successfully', inspectionId: id });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create inspection' });
    }
  });

  // ── POST /:id/photos — upload photos ─────────────────────────────────────
  fastify.post('/:id/photos', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const [rows] = await pool.query(
        `SELECT i.id, p.landlord_id FROM inspections i
         JOIN properties p ON i.property_id = p.id WHERE i.id = ?`,
        [request.params.id]
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Inspection not found' });
      if (request.user.role === 'landlord' && rows[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const parts = request.parts();
      const uploaded = [];

      for await (const part of parts) {
        if (part.type !== 'file') continue;
        if (!part.mimetype.startsWith('image/')) continue;

        const fileBuffer = await part.toBuffer();
        const ext = path.extname(part.filename || 'photo.jpg') || '.jpg';
        const uniqueName = `${Date.now()}-${generateUUID()}${ext}`;
        const uploadDir = path.resolve(config.uploadDir, 'inspections', request.params.id);
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, uniqueName), fileBuffer);

        const storagePath = path.join('inspections', request.params.id, uniqueName);
        const photoId = generateUUID();
        await pool.query(
          'INSERT INTO inspection_photos (id, inspection_id, storage_path, file_name) VALUES (?, ?, ?, ?)',
          [photoId, request.params.id, storagePath, part.filename || uniqueName]
        );
        uploaded.push(photoId);
      }

      return reply.send({ message: `${uploaded.length} photo(s) uploaded`, photoIds: uploaded });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to upload photos' });
    }
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const [rows] = await pool.query(
        `SELECT i.id, p.landlord_id FROM inspections i
         JOIN properties p ON i.property_id = p.id WHERE i.id = ?`,
        [request.params.id]
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Inspection not found' });
      if (request.user.role !== 'admin' && rows[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const [photos] = await pool.query(
        'SELECT storage_path FROM inspection_photos WHERE inspection_id = ?',
        [request.params.id]
      );
      for (const p of photos) {
        const filePath = path.resolve(config.uploadDir, p.storage_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await pool.query('DELETE FROM inspections WHERE id = ?', [request.params.id]);
      return reply.send({ message: 'Inspection deleted' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete inspection' });
    }
  });
}

// Use local date components to avoid UTC offset stripping a day (e.g. BST midnight → UTC 23:00 prev day)
function localDateStr(d) {
  if (!(d instanceof Date)) return String(d).split('T')[0];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmt(i) {
  return {
    id:             i.id,
    propertyId:     i.property_id,
    propertyName:   i.property_name,
    type:           i.type,
    inspectorName:  i.inspector_name,
    inspectionDate: localDateStr(i.inspection_date),
    overallResult:  i.overall_result,
    notes:          i.notes,
    failCount:      i.fail_count !== undefined ? Number(i.fail_count) : undefined,
    createdAt:      i.created_at,
  };
}

module.exports = inspectionRoutes;
