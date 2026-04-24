const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');

const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum([
    'payment_due',
    'payment_received',
    'payment_overdue',
    'maintenance_new',
    'maintenance_update',
    'maintenance_resolved',
    'compliance_expiring',
    'compliance_expired',
    'tenancy_ending',
    'tenancy_started',
    'document_uploaded',
    'message',
    'system'
  ]),
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  relatedEntityType: z.enum(['property', 'tenancy', 'payment', 'maintenance', 'compliance', 'document']).optional(),
  relatedEntityId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  sendEmail: z.boolean().default(false)
});

async function notificationsRoutes(fastify, options) {
  // Get all notifications for current user
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all notifications for current user',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          unreadOnly: { type: 'boolean' },
          type: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { unreadOnly, type, limit = 50 } = request.query;

      let query = `
        SELECT * FROM notifications
        WHERE user_id = ?
      `;
      const params = [request.user.id];

      if (unreadOnly) {
        query += ' AND read_at IS NULL';
      }

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const [notifications] = await pool.query(query, params);

      // Get unread count
      const [countResult] = await pool.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL',
        [request.user.id]
      );

      return reply.send({
        notifications: notifications.map(formatNotification),
        unreadCount: countResult[0].count
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch notifications' });
    }
  });

  // Get notification by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get notification by ID',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [notifications] = await pool.query(
        'SELECT * FROM notifications WHERE id = ?',
        [request.params.id]
      );

      if (notifications.length === 0) {
        return reply.code(404).send({ error: 'Notification not found' });
      }

      if (notifications[0].user_id !== request.user.id && request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({ notification: formatNotification(notifications[0]) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch notification' });
    }
  });

  // Mark notification as read
  fastify.patch('/:id/read', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Mark notification as read',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [notifications] = await pool.query(
        'SELECT * FROM notifications WHERE id = ?',
        [request.params.id]
      );

      if (notifications.length === 0) {
        return reply.code(404).send({ error: 'Notification not found' });
      }

      if (notifications[0].user_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await pool.query(
        'UPDATE notifications SET read_at = NOW() WHERE id = ?',
        [request.params.id]
      );

      return reply.send({ message: 'Notification marked as read' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update notification' });
    }
  });

  // Mark all notifications as read
  fastify.patch('/read-all', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Mark all notifications as read',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [result] = await pool.query(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
        [request.user.id]
      );

      return reply.send({
        message: 'All notifications marked as read',
        count: result.affectedRows
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update notifications' });
    }
  });

  // Delete notification
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a notification',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [notifications] = await pool.query(
        'SELECT * FROM notifications WHERE id = ?',
        [request.params.id]
      );

      if (notifications.length === 0) {
        return reply.code(404).send({ error: 'Notification not found' });
      }

      if (notifications[0].user_id !== request.user.id && request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await pool.query('DELETE FROM notifications WHERE id = ?', [request.params.id]);

      return reply.send({ message: 'Notification deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete notification' });
    }
  });

  // Create notification (internal/admin use)
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin'])],
    schema: {
      description: 'Create a notification (admin only)',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createNotificationSchema.parse(request.body);

      const notification = await createNotification(validated);

      return reply.code(201).send({
        message: 'Notification created successfully',
        notification
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create notification' });
    }
  });

  // Get notification preferences
  fastify.get('/preferences', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get notification preferences',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [users] = await pool.query(
        'SELECT notification_preferences FROM users WHERE id = ?',
        [request.user.id]
      );

      const defaults = {
        email: {
          payment_due: true,
          payment_overdue: true,
          compliance_expiring: true,
          compliance_expired: true,
          maintenance_new: true,
          maintenance_update: false,
          tenancy_ending: true
        },
        push: {
          payment_due: true,
          payment_overdue: true,
          compliance_expiring: true,
          compliance_expired: true,
          maintenance_new: true,
          maintenance_update: true,
          tenancy_ending: true
        }
      };

      const preferences = users[0]?.notification_preferences || defaults;

      return reply.send({ preferences });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch preferences' });
    }
  });

  // Update notification preferences
  fastify.patch('/preferences', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update notification preferences',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const { preferences } = request.body;

      await pool.query(
        'UPDATE users SET notification_preferences = ? WHERE id = ?',
        [JSON.stringify(preferences), request.user.id]
      );

      return reply.send({
        message: 'Preferences updated successfully',
        preferences
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update preferences' });
    }
  });

  // Smart notifications — derived live from tenancy data (no storage needed)
  fastify.get('/smart', {
    onRequest: [fastify.authenticate],
    schema: { description: 'Get smart derived notifications from tenancy data', tags: ['Notifications'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const userId = request.user.id;
      const role   = request.user.role;

      const tenancyQuery = role === 'admin'
        ? `SELECT t.id, t.lifecycle_status, t.start_date, t.end_date,
                  t.tenant_info_sheet_provided, t.how_to_rent_guide_provided, t.deposit_protected_date,
                  t.notice_served_date, t.eviction_grounds, t.created_at,
                  CONCAT(u.given_name, ' ', u.last_name) AS tenant_name,
                  COALESCE(p.property_name, p.address_line_1) AS property_name
           FROM tenancies t
           JOIN properties p ON t.property_id = p.id
           JOIN users u ON t.tenant_id = u.id
           WHERE t.lifecycle_status NOT IN ('ended','cancelled')`
        : `SELECT t.id, t.lifecycle_status, t.start_date, t.end_date,
                  t.tenant_info_sheet_provided, t.how_to_rent_guide_provided, t.deposit_protected_date,
                  t.notice_served_date, t.eviction_grounds, t.created_at,
                  CONCAT(u.given_name, ' ', u.last_name) AS tenant_name,
                  COALESCE(p.property_name, p.address_line_1) AS property_name
           FROM tenancies t
           JOIN properties p ON t.property_id = p.id
           JOIN users u ON t.tenant_id = u.id
           WHERE p.landlord_id = ? AND t.lifecycle_status NOT IN ('ended','cancelled')`;

      const [tenancies] = await pool.query(tenancyQuery, role === 'admin' ? [] : [userId]);

      const alerts = [];
      const now = new Date();

      for (const t of tenancies) {
        // Draft not progressed after 3 days
        if (t.lifecycle_status === 'pending') {
          const ageDays = (now - new Date(t.created_at)) / 86400000;
          if (ageDays >= 3) {
            alerts.push({
              id: `draft-${t.id}`,
              type: 'tenancy_draft',
              severity: 'warning',
              title: 'Draft Tenancy Not Progressed',
              message: `${t.tenant_name} at ${t.property_name} has been in Draft for ${Math.floor(ageDays)} days.`,
              tenancyId: t.id,
              createdAt: t.created_at,
            });
          }
        }

        // Compliance items missing (onboarding)
        if (t.lifecycle_status === 'onboarding') {
          const missing = [];
          if (!t.how_to_rent_guide_provided) missing.push('How to Rent Guide');
          if (!t.tenant_info_sheet_provided)  missing.push('Tenant Info Sheet');
          if (!t.deposit_protected_date)       missing.push('Deposit Protection Date');
          if (missing.length > 0) {
            alerts.push({
              id: `compliance-${t.id}`,
              type: 'compliance_incomplete',
              severity: 'warning',
              title: 'Compliance Items Outstanding',
              message: `${t.tenant_name} — still missing: ${missing.join(', ')}.`,
              tenancyId: t.id,
              createdAt: t.created_at,
            });
          }
        }

        // Section 8 notice active
        if (t.lifecycle_status === 'notice') {
          alerts.push({
            id: `notice-${t.id}`,
            type: 'tenancy_notice',
            severity: 'high',
            title: 'Section 8 Notice Active',
            message: `Notice served on ${t.tenant_name} at ${t.property_name}${t.eviction_grounds ? ` (${t.eviction_grounds})` : ''}.`,
            tenancyId: t.id,
            createdAt: t.notice_served_date || t.created_at,
          });
        }

        // Fixed-term ending within 60 days
        if (t.end_date) {
          const daysLeft = (new Date(t.end_date) - now) / 86400000;
          if (daysLeft >= 0 && daysLeft <= 60) {
            alerts.push({
              id: `ending-${t.id}`,
              type: 'tenancy_ending',
              severity: daysLeft <= 14 ? 'high' : 'normal',
              title: 'Fixed-Term Tenancy Ending Soon',
              message: `${t.tenant_name} at ${t.property_name} ends in ${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) !== 1 ? 's' : ''}.`,
              tenancyId: t.id,
              createdAt: t.created_at,
            });
          }
        }
      }

      // Sort high severity first
      const order = { high: 0, warning: 1, normal: 2, low: 3 };
      alerts.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));

      return reply.send({ alerts, count: alerts.length });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to generate smart notifications' });
    }
  });

  // Get unread count
  fastify.get('/unread-count', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get unread notification count',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [result] = await pool.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL',
        [request.user.id]
      );

      return reply.send({ unreadCount: result[0].count });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch count' });
    }
  });
}

// Helper function to create notifications (exported for use in other modules)
async function createNotification(data) {
  const id = generateUUID();

  await pool.query(
    `INSERT INTO notifications (
      id, user_id, type, title, message,
      related_entity_type, related_entity_id, priority
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.userId,
      data.type,
      data.title,
      data.message,
      data.relatedEntityType || null,
      data.relatedEntityId || null,
      data.priority || 'normal'
    ]
  );

  // TODO: Send email if sendEmail is true
  // This would integrate with an email service like AWS SES

  const [created] = await pool.query(
    'SELECT * FROM notifications WHERE id = ?',
    [id]
  );

  return formatNotification(created[0]);
}

// Bulk create notifications (for system events)
async function createBulkNotifications(notifications) {
  const results = [];
  for (const data of notifications) {
    const notification = await createNotification(data);
    results.push(notification);
  }
  return results;
}

function formatNotification(n) {
  return {
    id: n.id,
    userId: n.user_id,
    type: n.type,
    title: n.title,
    message: n.message,
    relatedEntityType: n.related_entity_type,
    relatedEntityId: n.related_entity_id,
    priority: n.priority,
    readAt: n.read_at,
    isRead: n.read_at !== null,
    createdAt: n.created_at
  };
}

module.exports = notificationsRoutes;
module.exports.createNotification = createNotification;
module.exports.createBulkNotifications = createBulkNotifications;
