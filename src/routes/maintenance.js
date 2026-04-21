const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');

const createMaintenanceSchema = z.object({
  propertyId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  category: z.enum(['plumbing', 'electrical', 'heating', 'structural', 'appliance', 'pest', 'damp_mould', 'security', 'garden', 'cleaning', 'other']),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'emergency']).default('medium')
});

const updateMaintenanceSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'scheduled', 'in_progress', 'awaiting_parts', 'resolved', 'closed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'emergency']).optional(),
  scheduledDate: z.string().optional(),
  contractorName: z.string().optional(),
  contractorPhone: z.string().optional(),
  quotedCost: z.number().optional(),
  actualCost: z.number().optional(),
  landlordNotes: z.string().optional(),
  contractorNotes: z.string().optional()
});

async function maintenanceRoutes(fastify, options) {
  // Get all maintenance requests
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all maintenance requests',
      tags: ['Maintenance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const { propertyId, status, priority } = request.query;
      const isLandlord = request.user.role === 'landlord';
      const isTenant = request.user.role === 'tenant';

      let query = `
        SELECT m.*,
               p.property_name, p.address_line_1, p.landlord_id,
               r.room_name,
               u.given_name as tenant_given_name, u.last_name as tenant_last_name
        FROM maintenance_requests m
        JOIN properties p ON m.property_id = p.id
        LEFT JOIN rooms r ON m.room_id = r.id
        LEFT JOIN users u ON m.tenant_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (isLandlord) {
        query += ' AND p.landlord_id = ?';
        params.push(request.user.id);
      } else if (isTenant) {
        query += ' AND m.tenant_id = ?';
        params.push(request.user.id);
      }

      if (propertyId) {
        query += ' AND m.property_id = ?';
        params.push(propertyId);
      }

      if (status) {
        query += ' AND m.status = ?';
        params.push(status);
      }

      if (priority) {
        query += ' AND m.priority = ?';
        params.push(priority);
      }

      query += ' ORDER BY FIELD(m.priority, "emergency", "urgent", "high", "medium", "low"), m.reported_date DESC';

      const [requests] = await pool.query(query, params);

      return reply.send({
        maintenanceRequests: requests.map(formatMaintenance)
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch maintenance requests' });
    }
  });

  // Get maintenance request by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get maintenance request by ID',
      tags: ['Maintenance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [requests] = await pool.query(
        `SELECT m.*,
                p.property_name, p.address_line_1, p.landlord_id,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name
         FROM maintenance_requests m
         JOIN properties p ON m.property_id = p.id
         LEFT JOIN rooms r ON m.room_id = r.id
         LEFT JOIN users u ON m.tenant_id = u.id
         WHERE m.id = ?`,
        [request.params.id]
      );

      if (requests.length === 0) {
        return reply.code(404).send({ error: 'Maintenance request not found' });
      }

      const m = requests[0];

      // Check access
      if (request.user.role !== 'admin' &&
          m.landlord_id !== request.user.id &&
          m.tenant_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({ maintenanceRequest: formatMaintenance(m) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch maintenance request' });
    }
  });

  // Create maintenance request
  fastify.post('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Create a new maintenance request',
      tags: ['Maintenance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createMaintenanceSchema.parse(request.body);

      // Verify property access
      const [properties] = await pool.query(
        'SELECT landlord_id FROM properties WHERE id = ?',
        [validated.propertyId]
      );

      if (properties.length === 0) {
        return reply.code(404).send({ error: 'Property not found' });
      }

      // Tenants can only create requests for properties they're in
      if (request.user.role === 'tenant') {
        const [tenancies] = await pool.query(
          `SELECT id FROM tenancies WHERE tenant_id = ? AND property_id = ? AND lifecycle_status IN ('active', 'notice')`,
          [request.user.id, validated.propertyId]
        );
        if (tenancies.length === 0) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
      } else if (request.user.role === 'landlord' && properties[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const id = generateUUID();
      const tenantId = request.user.role === 'tenant' ? request.user.id : null;

      await pool.query(
        `INSERT INTO maintenance_requests (
          id, property_id, room_id, tenant_id,
          category, title, description, priority, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
          id,
          validated.propertyId,
          validated.roomId || null,
          tenantId,
          validated.category,
          validated.title,
          validated.description,
          validated.priority
        ]
      );

      const [created] = await pool.query(
        `SELECT m.*,
                p.property_name, p.address_line_1,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name
         FROM maintenance_requests m
         JOIN properties p ON m.property_id = p.id
         LEFT JOIN rooms r ON m.room_id = r.id
         LEFT JOIN users u ON m.tenant_id = u.id
         WHERE m.id = ?`,
        [id]
      );

      return reply.code(201).send({
        message: 'Maintenance request created successfully',
        maintenanceRequest: formatMaintenance(created[0])
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create maintenance request' });
    }
  });

  // Update maintenance request
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update a maintenance request',
      tags: ['Maintenance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [requests] = await pool.query(
        `SELECT m.*, p.landlord_id
         FROM maintenance_requests m
         JOIN properties p ON m.property_id = p.id
         WHERE m.id = ?`,
        [request.params.id]
      );

      if (requests.length === 0) {
        return reply.code(404).send({ error: 'Maintenance request not found' });
      }

      // Only landlords/admins can update
      if (request.user.role !== 'admin' && requests[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const validated = updateMaintenanceSchema.parse(request.body);
      const current = requests[0];

      const updates = [];
      const values = [];

      if (validated.status) {
        updates.push('status = ?');
        values.push(validated.status);

        // Track timestamps
        if (validated.status === 'acknowledged' && !current.acknowledged_date) {
          updates.push('acknowledged_date = NOW()');
          const hoursElapsed = Math.floor((Date.now() - new Date(current.reported_date).getTime()) / (1000 * 60 * 60));
          updates.push('initial_response_hours = ?');
          values.push(hoursElapsed);
        }
        if (validated.status === 'resolved' && !current.resolved_date) {
          updates.push('resolved_date = NOW()');
          const hoursElapsed = Math.floor((Date.now() - new Date(current.reported_date).getTime()) / (1000 * 60 * 60));
          updates.push('resolution_hours = ?');
          values.push(hoursElapsed);
        }
        if (validated.status === 'closed') {
          updates.push('closed_date = NOW()');
        }
      }

      const fieldMap = {
        priority: 'priority',
        scheduledDate: 'scheduled_date',
        contractorName: 'contractor_name',
        contractorPhone: 'contractor_phone',
        quotedCost: 'quoted_cost',
        actualCost: 'actual_cost',
        landlordNotes: 'landlord_notes',
        contractorNotes: 'contractor_notes'
      };

      for (const [key, column] of Object.entries(fieldMap)) {
        if (validated[key] !== undefined) {
          updates.push(`${column} = ?`);
          values.push(validated[key]);
        }
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await pool.query(
          `UPDATE maintenance_requests SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      const [updated] = await pool.query(
        `SELECT m.*,
                p.property_name, p.address_line_1,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name
         FROM maintenance_requests m
         JOIN properties p ON m.property_id = p.id
         LEFT JOIN rooms r ON m.room_id = r.id
         LEFT JOIN users u ON m.tenant_id = u.id
         WHERE m.id = ?`,
        [request.params.id]
      );

      return reply.send({
        message: 'Maintenance request updated successfully',
        maintenanceRequest: formatMaintenance(updated[0])
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update maintenance request' });
    }
  });

  // Add tenant feedback
  fastify.post('/:id/feedback', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Add tenant feedback to resolved request',
      tags: ['Maintenance'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          feedback: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { feedback, rating } = request.body;

      const [requests] = await pool.query(
        'SELECT tenant_id, status FROM maintenance_requests WHERE id = ?',
        [request.params.id]
      );

      if (requests.length === 0) {
        return reply.code(404).send({ error: 'Maintenance request not found' });
      }

      if (requests[0].tenant_id !== request.user.id) {
        return reply.code(403).send({ error: 'Only the reporting tenant can add feedback' });
      }

      if (!['resolved', 'closed'].includes(requests[0].status)) {
        return reply.code(400).send({ error: 'Can only add feedback to resolved requests' });
      }

      await pool.query(
        'UPDATE maintenance_requests SET tenant_feedback = ?, tenant_rating = ? WHERE id = ?',
        [feedback || null, rating || null, request.params.id]
      );

      return reply.send({ message: 'Feedback added successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to add feedback' });
    }
  });
}

function formatMaintenance(m) {
  return {
    id: m.id,
    propertyId: m.property_id,
    roomId: m.room_id,
    tenantId: m.tenant_id,
    property: {
      name: m.property_name,
      address: m.address_line_1
    },
    roomName: m.room_name,
    tenant: m.tenant_given_name ? {
      name: `${m.tenant_given_name} ${m.tenant_last_name}`
    } : null,
    category: m.category,
    title: m.title,
    description: m.description,
    priority: m.priority,
    status: m.status,
    reportedDate: m.reported_date,
    acknowledgedDate: m.acknowledged_date,
    scheduledDate: m.scheduled_date,
    resolvedDate: m.resolved_date,
    closedDate: m.closed_date,
    initialResponseHours: m.initial_response_hours,
    resolutionHours: m.resolution_hours,
    contractorName: m.contractor_name,
    contractorPhone: m.contractor_phone,
    quotedCost: m.quoted_cost,
    actualCost: m.actual_cost,
    landlordNotes: m.landlord_notes,
    contractorNotes: m.contractor_notes,
    tenantFeedback: m.tenant_feedback,
    tenantRating: m.tenant_rating,
    createdAt: m.created_at,
    updatedAt: m.updated_at
  };
}

module.exports = maintenanceRoutes;
