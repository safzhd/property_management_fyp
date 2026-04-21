const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');

const createPaymentSchema = z.object({
  tenancyId: z.string().uuid(),
  amount: z.number().positive(),
  paymentType: z.enum(['rent', 'deposit', 'fee', 'arrears', 'other']),
  dueDate: z.string(),
  paymentDate: z.string().optional(),
  paymentMethod: z.enum(['bank_transfer', 'standing_order', 'card', 'cash', 'cheque', 'other']).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'partial', 'late', 'failed', 'refunded']).default('pending'),
  reference: z.string().max(100).optional(),
  transactionId: z.string().max(100).optional(),
  notes: z.string().optional(),
  // Deposit-specific fields (for payment_type = 'deposit')
  depositScheme: z.enum(['DPS', 'MyDeposits', 'TDS', 'other']).optional(),
  depositCertificateNumber: z.string().max(100).optional()
});

async function paymentsRoutes(fastify, options) {
  // Get all payments
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all payments',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const { tenancyId, paymentStatus, paymentType } = request.query;

      let query = `
        SELECT pay.*,
               t.rent_amount as tenancy_rent,
               p.property_name, p.landlord_id,
               r.room_name,
               u.given_name as tenant_given_name, u.last_name as tenant_last_name
        FROM payments pay
        JOIN tenancies t ON pay.tenancy_id = t.id
        JOIN properties p ON t.property_id = p.id
        LEFT JOIN rooms r ON t.room_id = r.id
        JOIN users u ON t.tenant_id = u.id
        WHERE p.landlord_id = ?
      `;
      const params = [request.user.id];

      if (tenancyId) {
        query += ' AND pay.tenancy_id = ?';
        params.push(tenancyId);
      }

      if (paymentStatus) {
        query += ' AND pay.payment_status = ?';
        params.push(paymentStatus);
      }

      if (paymentType) {
        query += ' AND pay.payment_type = ?';
        params.push(paymentType);
      }

      query += ' ORDER BY pay.due_date DESC';

      const [payments] = await pool.query(query, params);

      return reply.send({
        payments: payments.map(formatPayment)
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch payments' });
    }
  });

  // Get payment summary/dashboard
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get payment summary',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [summary] = await pool.query(`
        SELECT
          SUM(CASE WHEN pay.payment_status = 'paid' THEN pay.amount ELSE 0 END) as total_received,
          SUM(CASE WHEN pay.payment_status IN ('pending', 'late') THEN pay.amount ELSE 0 END) as total_outstanding,
          SUM(CASE WHEN pay.payment_status = 'late' THEN pay.amount ELSE 0 END) as total_arrears,
          COUNT(CASE WHEN pay.payment_status = 'pending' AND pay.due_date <= CURDATE() THEN 1 END) as overdue_count
        FROM payments pay
        JOIN tenancies t ON pay.tenancy_id = t.id
        JOIN properties p ON t.property_id = p.id
        WHERE p.landlord_id = ?
      `, [request.user.id]);

      // Get upcoming payments
      const [upcoming] = await pool.query(`
        SELECT pay.*,
               p.property_name,
               r.room_name,
               u.given_name as tenant_given_name, u.last_name as tenant_last_name
        FROM payments pay
        JOIN tenancies t ON pay.tenancy_id = t.id
        JOIN properties p ON t.property_id = p.id
        LEFT JOIN rooms r ON t.room_id = r.id
        JOIN users u ON t.tenant_id = u.id
        WHERE p.landlord_id = ?
          AND pay.payment_status = 'pending'
          AND pay.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ORDER BY pay.due_date ASC
        LIMIT 10
      `, [request.user.id]);

      // Get overdue payments
      const [overdue] = await pool.query(`
        SELECT pay.*,
               p.property_name,
               r.room_name,
               u.given_name as tenant_given_name, u.last_name as tenant_last_name
        FROM payments pay
        JOIN tenancies t ON pay.tenancy_id = t.id
        JOIN properties p ON t.property_id = p.id
        LEFT JOIN rooms r ON t.room_id = r.id
        JOIN users u ON t.tenant_id = u.id
        WHERE p.landlord_id = ?
          AND pay.payment_status IN ('pending', 'late')
          AND pay.due_date < CURDATE()
        ORDER BY pay.due_date ASC
      `, [request.user.id]);

      return reply.send({
        summary: summary[0],
        upcoming: upcoming.map(formatPayment),
        overdue: overdue.map(formatPayment)
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch summary' });
    }
  });

  // Get payment by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get payment by ID',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [payments] = await pool.query(
        `SELECT pay.*,
                p.property_name, p.landlord_id,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name
         FROM payments pay
         JOIN tenancies t ON pay.tenancy_id = t.id
         JOIN properties p ON t.property_id = p.id
         LEFT JOIN rooms r ON t.room_id = r.id
         JOIN users u ON t.tenant_id = u.id
         WHERE pay.id = ?`,
        [request.params.id]
      );

      if (payments.length === 0) {
        return reply.code(404).send({ error: 'Payment not found' });
      }

      const pay = payments[0];

      if (request.user.role !== 'admin' && pay.landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({ payment: formatPayment(pay) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch payment' });
    }
  });

  // Create payment record
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Create a payment record',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createPaymentSchema.parse(request.body);

      // Verify tenancy ownership
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

      if (request.user.role !== 'admin' && tenancies[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const id = generateUUID();

      await pool.query(
        `INSERT INTO payments (
          id, tenancy_id, paid_by_user_id, amount, payment_type,
          due_date, payment_date, payment_method, payment_status,
          reference, transaction_id, notes, deposit_scheme, deposit_certificate_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          validated.tenancyId,
          validated.paymentStatus === 'paid' ? tenancies[0].tenant_id : null,
          validated.amount,
          validated.paymentType,
          validated.dueDate,
          validated.paymentDate || null,
          validated.paymentMethod || null,
          validated.paymentStatus,
          validated.reference || null,
          validated.transactionId || null,
          validated.notes || null,
          validated.depositScheme || null,
          validated.depositCertificateNumber || null
        ]
      );

      const [created] = await pool.query(
        `SELECT pay.*,
                p.property_name,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name
         FROM payments pay
         JOIN tenancies t ON pay.tenancy_id = t.id
         JOIN properties p ON t.property_id = p.id
         LEFT JOIN rooms r ON t.room_id = r.id
         JOIN users u ON t.tenant_id = u.id
         WHERE pay.id = ?`,
        [id]
      );

      return reply.code(201).send({
        message: 'Payment record created successfully',
        payment: formatPayment(created[0])
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create payment' });
    }
  });

  // Record payment received
  fastify.post('/:id/receive', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Record payment as received',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          paymentDate: { type: 'string', format: 'date' },
          paymentMethod: { type: 'string' },
          reference: { type: 'string' },
          transactionId: { type: 'string' },
          notes: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { paymentDate, paymentMethod, reference, transactionId, notes } = request.body;

      const [payments] = await pool.query(
        `SELECT pay.*, p.landlord_id, t.tenant_id
         FROM payments pay
         JOIN tenancies t ON pay.tenancy_id = t.id
         JOIN properties p ON t.property_id = p.id
         WHERE pay.id = ?`,
        [request.params.id]
      );

      if (payments.length === 0) {
        return reply.code(404).send({ error: 'Payment not found' });
      }

      if (request.user.role !== 'admin' && payments[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await pool.query(
        `UPDATE payments SET
          payment_status = 'paid',
          payment_date = ?,
          payment_method = COALESCE(?, payment_method),
          reference = COALESCE(?, reference),
          transaction_id = COALESCE(?, transaction_id),
          notes = COALESCE(?, notes),
          paid_by_user_id = ?
        WHERE id = ?`,
        [
          paymentDate || new Date().toISOString().split('T')[0],
          paymentMethod,
          reference,
          transactionId,
          notes,
          payments[0].tenant_id,
          request.params.id
        ]
      );

      return reply.send({ message: 'Payment recorded successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to record payment' });
    }
  });

  // Update payment
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update a payment record',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [payments] = await pool.query(
        `SELECT pay.*, p.landlord_id
         FROM payments pay
         JOIN tenancies t ON pay.tenancy_id = t.id
         JOIN properties p ON t.property_id = p.id
         WHERE pay.id = ?`,
        [request.params.id]
      );

      if (payments.length === 0) {
        return reply.code(404).send({ error: 'Payment not found' });
      }

      if (request.user.role !== 'admin' && payments[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const data = request.body;
      const updates = [];
      const values = [];

      const fieldMap = {
        amount: 'amount',
        paymentType: 'payment_type',
        dueDate: 'due_date',
        paymentDate: 'payment_date',
        paymentMethod: 'payment_method',
        paymentStatus: 'payment_status',
        reference: 'reference',
        transactionId: 'transaction_id',
        notes: 'notes',
        depositScheme: 'deposit_scheme',
        depositCertificateNumber: 'deposit_certificate_number'
      };

      for (const [key, column] of Object.entries(fieldMap)) {
        if (data[key] !== undefined) {
          updates.push(`${column} = ?`);
          values.push(data[key]);
        }
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await pool.query(
          `UPDATE payments SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      const [updated] = await pool.query(
        `SELECT pay.*,
                p.property_name,
                r.room_name,
                u.given_name as tenant_given_name, u.last_name as tenant_last_name
         FROM payments pay
         JOIN tenancies t ON pay.tenancy_id = t.id
         JOIN properties p ON t.property_id = p.id
         LEFT JOIN rooms r ON t.room_id = r.id
         JOIN users u ON t.tenant_id = u.id
         WHERE pay.id = ?`,
        [request.params.id]
      );

      return reply.send({
        message: 'Payment updated successfully',
        payment: formatPayment(updated[0])
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update payment' });
    }
  });

  // Delete payment
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a payment record',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [payments] = await pool.query(
        `SELECT pay.*, p.landlord_id
         FROM payments pay
         JOIN tenancies t ON pay.tenancy_id = t.id
         JOIN properties p ON t.property_id = p.id
         WHERE pay.id = ?`,
        [request.params.id]
      );

      if (payments.length === 0) {
        return reply.code(404).send({ error: 'Payment not found' });
      }

      if (request.user.role !== 'admin' && payments[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await pool.query('DELETE FROM payments WHERE id = ?', [request.params.id]);

      return reply.send({ message: 'Payment deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete payment' });
    }
  });

  // Generate rent payments for a tenancy
  fastify.post('/generate', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Generate scheduled rent payments for a tenancy',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tenancyId', 'months'],
        properties: {
          tenancyId: { type: 'string', format: 'uuid' },
          months: { type: 'integer', minimum: 1, maximum: 12 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenancyId, months } = request.body;

      const [tenancies] = await pool.query(
        `SELECT t.*, p.landlord_id
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         WHERE t.id = ?`,
        [tenancyId]
      );

      if (tenancies.length === 0) {
        return reply.code(404).send({ error: 'Tenancy not found' });
      }

      if (request.user.role !== 'admin' && tenancies[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const tenancy = tenancies[0];
      const payments = [];

      // Generate payment records for each month
      const startDate = new Date();
      for (let i = 0; i < months; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        dueDate.setDate(tenancy.rent_due_day || 1);

        const id = generateUUID();
        await pool.query(
          `INSERT INTO payments (id, tenancy_id, amount, payment_type, due_date, payment_status)
           VALUES (?, ?, ?, 'rent', ?, 'pending')`,
          [id, tenancyId, tenancy.rent_amount, dueDate.toISOString().split('T')[0]]
        );
        payments.push(id);
      }

      return reply.code(201).send({
        message: `Generated ${months} rent payment records`,
        count: payments.length
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to generate payments' });
    }
  });
}

function formatPayment(pay) {
  const now = new Date();
  const dueDate = new Date(pay.due_date);
  const isOverdue = pay.payment_status === 'pending' && dueDate < now;

  return {
    id: pay.id,
    tenancyId: pay.tenancy_id,
    paidByUserId: pay.paid_by_user_id,
    property: pay.property_name ? {
      name: pay.property_name
    } : undefined,
    roomName: pay.room_name,
    tenant: pay.tenant_given_name ? {
      name: `${pay.tenant_given_name} ${pay.tenant_last_name}`
    } : undefined,
    amount: pay.amount,
    paymentType: pay.payment_type,
    dueDate: pay.due_date,
    paymentDate: pay.payment_date,
    paymentMethod: pay.payment_method,
    paymentStatus: isOverdue ? 'late' : pay.payment_status,
    isOverdue,
    reference: pay.reference,
    transactionId: pay.transaction_id,
    notes: pay.notes,
    // Deposit-specific fields
    depositScheme: pay.deposit_scheme,
    depositCertificateNumber: pay.deposit_certificate_number,
    createdAt: pay.created_at,
    updatedAt: pay.updated_at
  };
}

module.exports = paymentsRoutes;
