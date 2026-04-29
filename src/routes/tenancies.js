const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');

const createTenancySchema = z.object({
  tenantId: z.string().uuid(),
  propertyId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  startDate: z.string(), // Date string
  endDate: z.string().optional(),
  tenancyType: z.enum(['periodic', 'fixed', 'statutory_periodic']).default('periodic'),
  noticePeriodWeeks: z.number().int().positive().default(4),
  rentAmount: z.number().positive(),
  rentFrequency: z.enum(['weekly', 'fortnightly', 'monthly']).default('monthly'),
  rentDueDay: z.number().int().min(1).max(31).default(1),
  depositAmount: z.number().positive(),
  depositScheme: z.enum(['DPS', 'MyDeposits', 'TDS', 'other']),
  depositReference: z.string().max(100),
  depositPaidDate: z.string().optional(),
  depositReturnedDate: z.string().optional(),
  depositReturnedAmount: z.number().positive().optional()
});

const updateTenancySchema = createTenancySchema.partial();

const LIFECYCLE_ORDER = ['pending', 'onboarding', 'active', 'notice', 'offboarding', 'ended', 'cancelled'];

async function tenanciesRoutes(fastify, options) {
  // Get all tenancies
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all tenancies',
      tags: ['Tenancies'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          propertyId: { type: 'string', format: 'uuid' },
          tenantId: { type: 'string', format: 'uuid' },
          lifecycleStatus: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { propertyId, tenantId, lifecycleStatus } = request.query;

      let query = `
        SELECT t.*,
               p.property_name, p.address_line_1, p.postcode,
               r.room_name,
               u.given_name as tenant_given_name, u.last_name as tenant_last_name, u.email as tenant_email
        FROM tenancies t
        JOIN properties p ON t.property_id = p.id
        JOIN users u ON t.tenant_id = u.id
        LEFT JOIN rooms r ON t.room_id = r.id
        WHERE 1=1
      `;
      const params = [];

      if (request.user.role === 'tenant') {
        query += ' AND t.tenant_id = ?';
        params.push(request.user.id);
      } else {
        query += ' AND p.landlord_id = ?';
        params.push(request.user.id);
        if (propertyId) { query += ' AND t.property_id = ?'; params.push(propertyId); }
        if (tenantId)   { query += ' AND t.tenant_id = ?';   params.push(tenantId); }
      }

      if (lifecycleStatus) {
        query += ' AND t.lifecycle_status = ?';
        params.push(lifecycleStatus);
      }

      query += ' ORDER BY t.start_date DESC';

      const [tenancies] = await pool.query(query, params);

      return reply.send({
        tenancies: tenancies.map(t => formatTenancy(t))
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch tenancies' });
    }
  });

  // Get tenancy by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get tenancy by ID',
      tags: ['Tenancies'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [tenancies] = await pool.query(
        `SELECT t.*,
                p.property_name, p.address_line_1, p.postcode, p.landlord_id,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name, u.email as tenant_email
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         JOIN users u ON t.tenant_id = u.id
         LEFT JOIN rooms r ON t.room_id = r.id
         WHERE t.id = ?`,
        [request.params.id]
      );

      if (tenancies.length === 0) {
        return reply.code(404).send({ error: 'Tenancy not found' });
      }

      const t = tenancies[0];

      // Check ownership or tenant access
      if (request.user.role !== 'admin' &&
          t.landlord_id !== request.user.id &&
          t.tenant_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({ tenancy: formatTenancy(t) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch tenancy' });
    }
  });

  // Create tenancy
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Create a new tenancy',
      tags: ['Tenancies'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createTenancySchema.parse(request.body);

      // Verify property ownership
      const [properties] = await pool.query(
        'SELECT landlord_id FROM properties WHERE id = ?',
        [validated.propertyId]
      );

      if (properties.length === 0) {
        return reply.code(404).send({ error: 'Property not found' });
      }

      if (request.user.role !== 'admin' && properties[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      // Verify tenant exists
      const [tenants] = await pool.query(
        'SELECT id FROM users WHERE id = ? AND role = ?',
        [validated.tenantId, 'tenant']
      );

      if (tenants.length === 0) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      // If room specified, verify it belongs to the property and is available
      if (validated.roomId) {
        const [rooms] = await pool.query(
          'SELECT is_available FROM rooms WHERE id = ? AND property_id = ?',
          [validated.roomId, validated.propertyId]
        );

        if (rooms.length === 0) {
          return reply.code(404).send({ error: 'Room not found in this property' });
        }

        if (!rooms[0].is_available) {
          return reply.code(400).send({ error: 'Room is not available' });
        }
      }

      const id = generateUUID();

      await pool.query(
        `INSERT INTO tenancies (
          id, tenant_id, property_id, room_id,
          start_date, end_date, tenancy_type, notice_period_weeks,
          rent_amount, rent_frequency, rent_due_day,
          deposit_amount, deposit_scheme, deposit_reference,
          lifecycle_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          validated.tenantId,
          validated.propertyId,
          validated.roomId || null,
          validated.startDate,
          validated.endDate || null,
          validated.tenancyType,
          validated.noticePeriodWeeks,
          validated.rentAmount,
          validated.rentFrequency,
          validated.rentDueDay,
          validated.depositAmount || null,
          validated.depositScheme || null,
          validated.depositReference || null,
          'pending'
        ]
      );

      // Mark room as unavailable if specified
      if (validated.roomId) {
        await pool.query(
          'UPDATE rooms SET is_available = FALSE WHERE id = ?',
          [validated.roomId]
        );
      }

      const [created] = await pool.query(
        `SELECT t.*,
                p.property_name, p.address_line_1, p.postcode,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name, u.email as tenant_email
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         JOIN users u ON t.tenant_id = u.id
         LEFT JOIN rooms r ON t.room_id = r.id
         WHERE t.id = ?`,
        [id]
      );

      return reply.code(201).send({
        message: 'Tenancy created successfully',
        tenancy: formatTenancy(created[0])
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create tenancy' });
    }
  });

  // Update tenancy lifecycle status
  fastify.post('/:id/transition', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Transition tenancy to next lifecycle status',
      tags: ['Tenancies'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: LIFECYCLE_ORDER },
          noticeServedBy: { type: 'string', enum: ['landlord', 'tenant'] },
          evictionGrounds: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { status, noticeServedBy, evictionGrounds } = request.body;

      const [tenancies] = await pool.query(
        `SELECT t.*, p.landlord_id
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         WHERE t.id = ?`,
        [request.params.id]
      );

      if (tenancies.length === 0) {
        return reply.code(404).send({ error: 'Tenancy not found' });
      }

      const tenancy = tenancies[0];

      // Check ownership
      if (request.user.role !== 'admin' && tenancy.landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      // Validate transition
      const currentIndex = LIFECYCLE_ORDER.indexOf(tenancy.lifecycle_status);
      const newIndex = LIFECYCLE_ORDER.indexOf(status);

      if (status === 'cancelled' || newIndex === currentIndex + 1) {
        // Valid transition
        const updates = ['lifecycle_status = ?'];
        const values = [status];

        if (status === 'notice') {
          updates.push('notice_served_date = CURDATE()');
          if (noticeServedBy) {
            updates.push('notice_served_by = ?');
            values.push(noticeServedBy);
          }
          if (evictionGrounds) {
            updates.push('eviction_grounds = ?');
            values.push(evictionGrounds);
          }
        }

        if (status === 'cancelled' && evictionGrounds) {
          updates.push('eviction_grounds = ?');
          values.push(evictionGrounds);
        }

        if (status === 'ended' || status === 'cancelled') {
          // Mark room as available again
          if (tenancy.room_id) {
            await pool.query(
              'UPDATE rooms SET is_available = TRUE WHERE id = ?',
              [tenancy.room_id]
            );
          }
        }

        values.push(request.params.id);
        await pool.query(
          `UPDATE tenancies SET ${updates.join(', ')} WHERE id = ?`,
          values
        );

        const [updated] = await pool.query(
          `SELECT t.*,
                  p.property_name, p.address_line_1, p.postcode,
                  r.room_name,
                  u.given_name as tenant_given_name, u.last_name as tenant_last_name, u.email as tenant_email
           FROM tenancies t
           JOIN properties p ON t.property_id = p.id
           JOIN users u ON t.tenant_id = u.id
           LEFT JOIN rooms r ON t.room_id = r.id
           WHERE t.id = ?`,
          [request.params.id]
        );

        return reply.send({
          message: `Tenancy transitioned to ${status}`,
          tenancy: formatTenancy(updated[0])
        });
      } else {
        return reply.code(400).send({
          error: 'Invalid transition',
          message: `Cannot transition from ${tenancy.lifecycle_status} to ${status}`
        });
      }
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to transition tenancy' });
    }
  });

  // Update tenancy details
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update tenancy details',
      tags: ['Tenancies'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [tenancies] = await pool.query(
        `SELECT t.*, p.landlord_id
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         WHERE t.id = ?`,
        [request.params.id]
      );

      if (tenancies.length === 0) {
        return reply.code(404).send({ error: 'Tenancy not found' });
      }

      if (request.user.role !== 'admin' && tenancies[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const validated = updateTenancySchema.parse(request.body);

      const fieldMap = {
        startDate: 'start_date',
        endDate: 'end_date',
        tenancyType: 'tenancy_type',
        noticePeriodWeeks: 'notice_period_weeks',
        rentAmount: 'rent_amount',
        rentFrequency: 'rent_frequency',
        rentDueDay: 'rent_due_day',
        depositAmount: 'deposit_amount',
        depositScheme: 'deposit_scheme',
        depositReference: 'deposit_reference',
        depositPaidDate: 'deposit_paid_date',
        depositReturnedDate: 'deposit_returned_date',
        depositReturnedAmount: 'deposit_returned_amount'
      };

      const updates = [];
      const values = [];

      for (const [key, column] of Object.entries(fieldMap)) {
        if (validated[key] !== undefined) {
          updates.push(`${column} = ?`);
          values.push(validated[key]);
        }
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await pool.query(
          `UPDATE tenancies SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      const [updated] = await pool.query(
        `SELECT t.*,
                p.property_name, p.address_line_1, p.postcode,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name, u.email as tenant_email
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         JOIN users u ON t.tenant_id = u.id
         LEFT JOIN rooms r ON t.room_id = r.id
         WHERE t.id = ?`,
        [request.params.id]
      );

      return reply.send({
        message: 'Tenancy updated successfully',
        tenancy: formatTenancy(updated[0])
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update tenancy' });
    }
  });

  // Mark Renters' Rights Act compliance
  fastify.post('/:id/compliance', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update Renters Rights Act compliance',
      tags: ['Tenancies'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          tenantInfoSheetProvided: { type: 'boolean' },
          howToRentGuideProvided: { type: 'boolean' },
          depositProtectedDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenantInfoSheetProvided, howToRentGuideProvided, depositProtectedDate } = request.body;

      const [tenancies] = await pool.query(
        `SELECT t.*, p.landlord_id
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         WHERE t.id = ?`,
        [request.params.id]
      );

      if (tenancies.length === 0) {
        return reply.code(404).send({ error: 'Tenancy not found' });
      }

      if (request.user.role !== 'admin' && tenancies[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const updates = [];
      const values = [];

      if (tenantInfoSheetProvided !== undefined) {
        updates.push('tenant_info_sheet_provided = ?');
        values.push(tenantInfoSheetProvided);
        if (tenantInfoSheetProvided) {
          updates.push('tenant_info_sheet_date = CURDATE()');
        }
      }

      if (howToRentGuideProvided !== undefined) {
        updates.push('how_to_rent_guide_provided = ?');
        values.push(howToRentGuideProvided);
      }

      if (depositProtectedDate) {
        updates.push('deposit_protected_date = ?');
        values.push(depositProtectedDate);
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await pool.query(
          `UPDATE tenancies SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      return reply.send({ message: 'Compliance updated successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update compliance' });
    }
  });

  // Delete tenancy (admin or owning landlord)
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Permanently delete a tenancy',
      tags: ['Tenancies'],
      security: [{ bearerAuth: [] }],
    }
  }, async (request, reply) => {
    try {
      const [rows] = await pool.query(
        `SELECT t.id, p.landlord_id
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         WHERE t.id = ?`,
        [request.params.id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Tenancy not found' });
      }

      if (request.user.role !== 'admin' && rows[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const id = request.params.id;
      const conn = await pool.getConnection();
      try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        await conn.query('DELETE FROM tenancies WHERE id = ?', [id]);
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      } finally {
        conn.release();
      }

      return reply.send({ message: 'Tenancy deleted' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete tenancy' });
    }
  });
}

function formatTenancy(t) {
  return {
    id: t.id,
    tenantId: t.tenant_id,
    propertyId: t.property_id,
    roomId: t.room_id,
    tenant: {
      name: `${t.tenant_given_name} ${t.tenant_last_name}`,
      email: t.tenant_email
    },
    property: {
      name: t.property_name,
      address: t.address_line_1,
      postcode: t.postcode
    },
    roomName: t.room_name,
    startDate: t.start_date,
    endDate: t.end_date,
    tenancyType: t.tenancy_type,
    noticePeriodWeeks: t.notice_period_weeks,
    lifecycleStatus: t.lifecycle_status,
    noticeServedDate: t.notice_served_date,
    noticeServedBy: t.notice_served_by,
    evictionGrounds: t.eviction_grounds,
    rentAmount: t.rent_amount,
    rentFrequency: t.rent_frequency,
    rentDueDay: t.rent_due_day,
    depositAmount: t.deposit_amount,
    depositScheme: t.deposit_scheme,
    depositReference: t.deposit_reference,
    depositProtectedDate: t.deposit_protected_date,
    depositPaidDate: t.deposit_paid_date,
    depositReturnedDate: t.deposit_returned_date,
    depositReturnedAmount: t.deposit_returned_amount,
    tenantInfoSheetProvided: Boolean(t.tenant_info_sheet_provided),
    tenantInfoSheetDate: t.tenant_info_sheet_date,
    howToRentGuideProvided: Boolean(t.how_to_rent_guide_provided),
    petRequestReceived: Boolean(t.pet_request_received),
    petRequestDecision: t.pet_request_decision,
    petRequestReason: t.pet_request_reason,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

module.exports = tenanciesRoutes;
