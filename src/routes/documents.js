const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/env');

const createDocumentSchema = z.object({
  propertyId: z.string().uuid().optional(),
  tenancyId: z.string().uuid().optional(),
  complianceCertificateId: z.string().uuid().optional(),
  documentType: z.enum([
    'tenancy_agreement',
    'inventory',
    'gas_certificate',
    'eicr_certificate',
    'epc_certificate',
    'hmo_licence',
    'fire_risk_assessment',
    'tenant_info_sheet',
    'deposit_protection',
    'how_to_rent_guide',
    'id_document',
    'reference',
    'invoice',
    'receipt',
    'photo',
    'other'
  ]),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().max(100),
  storagePath: z.string().max(500),
  description: z.string().optional()
});

async function documentsRoutes(fastify, options) {
  // Get all documents
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all documents',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          propertyId: { type: 'string', format: 'uuid' },
          tenancyId: { type: 'string', format: 'uuid' },
          documentType: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { propertyId, tenancyId, documentType } = request.query;
      const isLandlord = request.user.role === 'landlord';
      const isTenant = request.user.role === 'tenant';

      let query = `
        SELECT d.*,
               p.property_name, p.landlord_id,
               t.tenant_id
        FROM documents d
        LEFT JOIN properties p ON d.property_id = p.id
        LEFT JOIN tenancies t ON d.tenancy_id = t.id
        WHERE 1=1
      `;
      const params = [];

      if (isLandlord) {
        query += ` AND (p.landlord_id = ? OR d.uploaded_by = ?)`;
        params.push(request.user.id, request.user.id);
      } else if (isTenant) {
        query += ` AND (t.tenant_id = ? OR d.uploaded_by = ?)`;
        params.push(request.user.id, request.user.id);
      }

      if (propertyId) {
        query += ' AND d.property_id = ?';
        params.push(propertyId);
      }

      if (tenancyId) {
        query += ' AND d.tenancy_id = ?';
        params.push(tenancyId);
      }

      if (documentType) {
        query += ' AND d.document_type = ?';
        params.push(documentType);
      }

      query += ' ORDER BY d.created_at DESC';

      const [documents] = await pool.query(query, params);

      return reply.send({
        documents: documents.map(formatDocument)
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch documents' });
    }
  });

  // Get document by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get document by ID',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [documents] = await pool.query(
        `SELECT d.*,
                p.property_name, p.landlord_id,
                t.tenant_id
         FROM documents d
         LEFT JOIN properties p ON d.property_id = p.id
         LEFT JOIN tenancies t ON d.tenancy_id = t.id
         WHERE d.id = ?`,
        [request.params.id]
      );

      if (documents.length === 0) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const d = documents[0];

      // Check access
      const hasAccess =
        request.user.role === 'admin' ||
        d.landlord_id === request.user.id ||
        d.tenant_id === request.user.id ||
        d.uploaded_by === request.user.id;

      if (!hasAccess) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({ document: formatDocument(d) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch document' });
    }
  });

  // Create document record (after file upload)
  fastify.post('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Create a document record',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createDocumentSchema.parse(request.body);

      // Verify access to property/tenancy if specified
      if (validated.propertyId) {
        const [properties] = await pool.query(
          'SELECT landlord_id FROM properties WHERE id = ?',
          [validated.propertyId]
        );

        if (properties.length === 0) {
          return reply.code(404).send({ error: 'Property not found' });
        }

        if (request.user.role === 'landlord' && properties[0].landlord_id !== request.user.id) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
      }

      if (validated.tenancyId) {
        const [tenancies] = await pool.query(
          `SELECT t.tenant_id, p.landlord_id
           FROM tenancies t
           JOIN properties p ON t.property_id = p.id
           WHERE t.id = ?`,
          [validated.tenancyId]
        );

        if (tenancies.length === 0) {
          return reply.code(404).send({ error: 'Tenancy not found' });
        }

        const hasAccess =
          request.user.role === 'admin' ||
          tenancies[0].landlord_id === request.user.id ||
          tenancies[0].tenant_id === request.user.id;

        if (!hasAccess) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
      }

      const id = generateUUID();

      await pool.query(
        `INSERT INTO documents (
          id, property_id, tenancy_id, compliance_certificate_id,
          document_type, file_name, file_size, mime_type,
          storage_path, description, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          validated.propertyId || null,
          validated.tenancyId || null,
          validated.complianceCertificateId || null,
          validated.documentType,
          validated.fileName,
          validated.fileSize,
          validated.mimeType,
          validated.storagePath,
          validated.description || null,
          request.user.id
        ]
      );

      // Update compliance certificate if linked
      if (validated.complianceCertificateId) {
        await pool.query(
          'UPDATE compliance_certificates SET document_id = ? WHERE id = ?',
          [id, validated.complianceCertificateId]
        );
      }

      const [created] = await pool.query(
        `SELECT d.*, p.property_name
         FROM documents d
         LEFT JOIN properties p ON d.property_id = p.id
         WHERE d.id = ?`,
        [id]
      );

      return reply.code(201).send({
        message: 'Document created successfully',
        document: formatDocument(created[0])
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create document' });
    }
  });

  // Update document metadata
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update document metadata',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [documents] = await pool.query(
        `SELECT d.*, p.landlord_id
         FROM documents d
         LEFT JOIN properties p ON d.property_id = p.id
         WHERE d.id = ?`,
        [request.params.id]
      );

      if (documents.length === 0) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const d = documents[0];

      // Only uploader or property owner can update
      if (request.user.role !== 'admin' &&
          d.uploaded_by !== request.user.id &&
          d.landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const { description, documentType } = request.body;
      const updates = [];
      const values = [];

      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }

      if (documentType !== undefined) {
        updates.push('document_type = ?');
        values.push(documentType);
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await pool.query(
          `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      const [updated] = await pool.query(
        `SELECT d.*, p.property_name
         FROM documents d
         LEFT JOIN properties p ON d.property_id = p.id
         WHERE d.id = ?`,
        [request.params.id]
      );

      return reply.send({
        message: 'Document updated successfully',
        document: formatDocument(updated[0])
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update document' });
    }
  });

  // Delete document
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a document',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [documents] = await pool.query(
        `SELECT d.*, p.landlord_id
         FROM documents d
         LEFT JOIN properties p ON d.property_id = p.id
         WHERE d.id = ?`,
        [request.params.id]
      );

      if (documents.length === 0) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const d = documents[0];

      // Only uploader or property owner can delete
      if (request.user.role !== 'admin' &&
          d.uploaded_by !== request.user.id &&
          d.landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await pool.query('DELETE FROM documents WHERE id = ?', [request.params.id]);

      // Delete file from disk
      try {
        const filePath = path.resolve(config.uploadDir, d.storage_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) { /* non-fatal */ }

      return reply.send({ message: 'Document deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete document' });
    }
  });

  // Upload a file and create document record
  fastify.post('/upload', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      // Use parts() to read all multipart fields + file in one pass
      const parts = request.parts();
      let fileBuffer = null;
      let fileName = null;
      let mimeType = null;
      let propertyId = null;
      let roomId = null;
      let documentType = 'other';
      let description = null;

      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          fileName   = part.filename;
          mimeType   = part.mimetype;
        } else {
          if (part.fieldname === 'propertyId')   propertyId   = part.value;
          if (part.fieldname === 'roomId')        roomId       = part.value || null;
          if (part.fieldname === 'documentType') documentType = part.value;
          if (part.fieldname === 'description')  description  = part.value || null;
        }
      }

      if (!fileBuffer || !fileName) {
        return reply.code(400).send({ error: 'No file provided' });
      }

      // Verify property access
      if (propertyId) {
        const [props] = await pool.query(
          'SELECT landlord_id FROM properties WHERE id = ?',
          [propertyId]
        );
        if (props.length === 0) return reply.code(404).send({ error: 'Property not found' });
        if (request.user.role === 'landlord' && props[0].landlord_id !== request.user.id) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
      }

      // Ensure upload directory exists
      const uploadDir = path.resolve(config.uploadDir, propertyId || 'general');
      fs.mkdirSync(uploadDir, { recursive: true });

      const ext        = path.extname(fileName) || '';
      const uniqueName = `${generateUUID()}${ext}`;
      const filePath   = path.join(uploadDir, uniqueName);
      const storagePath = path.join(propertyId || 'general', uniqueName);

      fs.writeFileSync(filePath, fileBuffer);

      const id = generateUUID();
      await pool.query(
        `INSERT INTO documents (
          id, property_id, room_id, document_type, file_name, file_size,
          mime_type, storage_path, description, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          propertyId || null,
          roomId || null,
          documentType,
          fileName,
          fileBuffer.length,
          mimeType,
          storagePath,
          description,
          request.user.id
        ]
      );

      const [created] = await pool.query(
        `SELECT d.*, p.property_name FROM documents d
         LEFT JOIN properties p ON d.property_id = p.id
         WHERE d.id = ?`,
        [id]
      );

      return reply.code(201).send({
        message: 'File uploaded successfully',
        document: formatDocument(created[0])
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to upload file', detail: error.message });
    }
  });

  // Serve / download a file
  fastify.get('/file/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const [documents] = await pool.query(
        `SELECT d.*, p.landlord_id FROM documents d
         LEFT JOIN properties p ON d.property_id = p.id
         WHERE d.id = ?`,
        [request.params.id]
      );

      if (documents.length === 0) return reply.code(404).send({ error: 'Document not found' });

      const d = documents[0];
      const hasAccess =
        request.user.role === 'admin' ||
        d.landlord_id === request.user.id ||
        d.uploaded_by === request.user.id;
      if (!hasAccess) return reply.code(403).send({ error: 'Forbidden' });

      const filePath = path.resolve(config.uploadDir, d.storage_path);
      if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found on disk' });

      const stream = fs.createReadStream(filePath);
      reply.header('Content-Type', d.mime_type || 'application/octet-stream');
      const disposition = (d.mime_type || '').startsWith('image/') ? 'inline' : 'attachment';
      reply.header('Content-Disposition', `${disposition}; filename="${d.file_name}"`);
      return reply.send(stream);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to serve file' });
    }
  });

  // Get documents for a property
  fastify.get('/property/:propertyId', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all documents for a property',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [properties] = await pool.query(
        'SELECT landlord_id FROM properties WHERE id = ?',
        [request.params.propertyId]
      );

      if (properties.length === 0) {
        return reply.code(404).send({ error: 'Property not found' });
      }

      if (request.user.role !== 'admin' && properties[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const [documents] = await pool.query(
        `SELECT d.*, cc.certificate_type
         FROM documents d
         LEFT JOIN compliance_certificates cc ON d.compliance_certificate_id = cc.id
         WHERE d.property_id = ?
         ORDER BY d.created_at DESC`,
        [request.params.propertyId]
      );

      // Group by type
      const grouped = documents.reduce((acc, d) => {
        const type = d.document_type;
        if (!acc[type]) acc[type] = [];
        acc[type].push(formatDocument(d));
        return acc;
      }, {});

      return reply.send({
        propertyId: request.params.propertyId,
        documents: documents.map(formatDocument),
        byType: grouped
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch documents' });
    }
  });

  // Get documents for a tenancy
  fastify.get('/tenancy/:tenancyId', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all documents for a tenancy',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [tenancies] = await pool.query(
        `SELECT t.tenant_id, p.landlord_id
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         WHERE t.id = ?`,
        [request.params.tenancyId]
      );

      if (tenancies.length === 0) {
        return reply.code(404).send({ error: 'Tenancy not found' });
      }

      const hasAccess =
        request.user.role === 'admin' ||
        tenancies[0].landlord_id === request.user.id ||
        tenancies[0].tenant_id === request.user.id;

      if (!hasAccess) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const [documents] = await pool.query(
        `SELECT * FROM documents
         WHERE tenancy_id = ?
         ORDER BY document_type, created_at DESC`,
        [request.params.tenancyId]
      );

      return reply.send({
        tenancyId: request.params.tenancyId,
        documents: documents.map(formatDocument)
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch documents' });
    }
  });
}

function formatDocument(d) {
  return {
    id: d.id,
    propertyId: d.property_id,
    propertyName: d.property_name,
    tenancyId: d.tenancy_id,
    roomId: d.room_id,
    complianceCertificateId: d.compliance_certificate_id,
    documentType: d.document_type,
    fileName: d.file_name,
    fileSize: d.file_size,
    mimeType: d.mime_type,
    storagePath: d.storage_path,
    description: d.description,
    uploadedBy: d.uploaded_by,
    createdAt: d.created_at,
    updatedAt: d.updated_at
  };
}

module.exports = documentsRoutes;
