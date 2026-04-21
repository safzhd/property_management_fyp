const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');

const INCOME_CATEGORIES = ['rent', 'deposit', 'other_income'];
const EXPENSE_CATEGORIES = [
  'council_tax', 'utility_gas', 'utility_electricity', 'utility_water', 'utility_internet',
  'insurance', 'repairs_maintenance', 'letting_agent_fees', 'mortgage_interest',
  'ground_rent_service_charge', 'professional_fees', 'travel', 'other_expense'
];
const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

const createTransactionSchema = z.object({
  propertyId:      z.string().uuid(),
  tenancyId:       z.string().uuid().optional(),
  roomId:          z.string().uuid().optional(),
  type:            z.enum(['income', 'expense']),
  category:        z.enum(ALL_CATEGORIES),
  amount:          z.number().positive(),
  date:            z.string(),
  description:     z.string().max(255).optional(),
  supplier:        z.string().max(255).optional(),
  reference:       z.string().max(100).optional(),
  paymentMethod:   z.enum(['bank_transfer', 'standing_order', 'card', 'cash', 'cheque', 'other']).optional(),
  status:          z.enum(['pending', 'paid', 'partial', 'late', 'failed', 'refunded', 'reconciled']).default('pending'),
  notes:           z.string().optional(),
});

async function transactionsRoutes(fastify, options) {

  // ── GET / ─────────────────────────────────────────────────────────────────
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: { description: 'Get all transactions', tags: ['Transactions'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const { propertyId, tenancyId, type, category, status, year } = request.query;

      let query = `
        SELECT tx.*,
               p.property_name, p.address_line_1,
               r.room_name,
               u.given_name AS tenant_given_name, u.last_name AS tenant_last_name
        FROM transactions tx
        JOIN properties p ON tx.property_id = p.id
        LEFT JOIN rooms r ON tx.room_id = r.id
        LEFT JOIN tenancies t ON tx.tenancy_id = t.id
        LEFT JOIN users u ON t.tenant_id = u.id
        WHERE p.landlord_id = ?
      `;
      const params = [request.user.id];

      if (propertyId) { query += ' AND tx.property_id = ?'; params.push(propertyId); }
      if (tenancyId)  { query += ' AND tx.tenancy_id = ?';  params.push(tenancyId); }
      if (type)       { query += ' AND tx.type = ?';        params.push(type); }
      if (category)   { query += ' AND tx.category = ?';    params.push(category); }
      if (status)     { query += ' AND tx.status = ?';      params.push(status); }
      if (year)       { query += ' AND YEAR(tx.date) = ?';  params.push(year); }

      query += ' ORDER BY tx.date DESC';

      const [rows] = await pool.query(query, params);
      return reply.send({ transactions: rows.map(formatTransaction) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch transactions' });
    }
  });

  // ── GET /summary ──────────────────────────────────────────────────────────
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
    schema: { description: 'Income vs expense summary + P&L per property', tags: ['Transactions'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const { year = new Date().getFullYear() } = request.query;

      // Overall P&L
      const [totals] = await pool.query(`
        SELECT
          SUM(CASE WHEN tx.type = 'income'  AND tx.status = 'paid' THEN tx.amount ELSE 0 END) AS total_income,
          SUM(CASE WHEN tx.type = 'expense' AND tx.status = 'paid' THEN tx.amount ELSE 0 END) AS total_expenses,
          SUM(CASE WHEN tx.type = 'income'  AND tx.status = 'paid' THEN tx.amount
                   WHEN tx.type = 'expense' AND tx.status = 'paid' THEN -tx.amount ELSE 0 END) AS net_profit,
          SUM(CASE WHEN tx.status IN ('pending','late') THEN tx.amount ELSE 0 END) AS outstanding
        FROM transactions tx
        JOIN properties p ON tx.property_id = p.id
        WHERE p.landlord_id = ? AND YEAR(tx.date) = ?
      `, [request.user.id, year]);

      // Per-property breakdown
      const [byProperty] = await pool.query(`
        SELECT
          p.id AS property_id,
          COALESCE(p.property_name, p.address_line_1) AS property_name,
          SUM(CASE WHEN tx.type = 'income'  AND tx.status = 'paid' THEN tx.amount ELSE 0 END) AS income,
          SUM(CASE WHEN tx.type = 'expense' AND tx.status = 'paid' THEN tx.amount ELSE 0 END) AS expenses,
          SUM(CASE WHEN tx.type = 'income'  AND tx.status = 'paid' THEN tx.amount
                   WHEN tx.type = 'expense' AND tx.status = 'paid' THEN -tx.amount ELSE 0 END) AS net_profit
        FROM transactions tx
        JOIN properties p ON tx.property_id = p.id
        WHERE p.landlord_id = ? AND YEAR(tx.date) = ?
        GROUP BY p.id, p.property_name, p.address_line_1
      `, [request.user.id, year]);

      // Upcoming / overdue income
      const [upcoming] = await pool.query(`
        SELECT tx.*, p.property_name, r.room_name,
               u.given_name AS tenant_given_name, u.last_name AS tenant_last_name
        FROM transactions tx
        JOIN properties p ON tx.property_id = p.id
        LEFT JOIN rooms r ON tx.room_id = r.id
        LEFT JOIN tenancies t ON tx.tenancy_id = t.id
        LEFT JOIN users u ON t.tenant_id = u.id
        WHERE p.landlord_id = ?
          AND tx.type = 'income'
          AND tx.status = 'pending'
          AND tx.date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ORDER BY tx.date ASC LIMIT 10
      `, [request.user.id]);

      return reply.send({
        year: Number(year),
        summary: totals[0],
        byProperty,
        upcoming: upcoming.map(formatTransaction),
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch summary' });
    }
  });

  // ── GET /export ───────────────────────────────────────────────────────────
  // Returns CSV — accountant opens in Google Sheets
  fastify.get('/export', {
    onRequest: [fastify.authenticate],
    schema: { description: 'Export transactions as CSV', tags: ['Transactions'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const { year = new Date().getFullYear(), propertyId } = request.query;

      let query = `
        SELECT tx.date, tx.type, tx.category, tx.description, tx.supplier,
               tx.amount, tx.status, tx.reference, tx.payment_method,
               COALESCE(p.property_name, p.address_line_1) AS property,
               r.room_name
        FROM transactions tx
        JOIN properties p ON tx.property_id = p.id
        LEFT JOIN rooms r ON tx.room_id = r.id
        WHERE p.landlord_id = ? AND YEAR(tx.date) = ?
      `;
      const params = [request.user.id, year];

      if (propertyId) { query += ' AND tx.property_id = ?'; params.push(propertyId); }
      query += ' ORDER BY tx.date ASC';

      const [rows] = await pool.query(query, params);

      const header = 'Date,Type,Category,Description,Supplier,Amount,Status,Reference,Payment Method,Property,Room\n';
      const csv = rows.map(r =>
        [r.date?.toISOString?.().split('T')[0] ?? r.date, r.type, r.category,
         `"${(r.description || '').replace(/"/g, '""')}"`,
         `"${(r.supplier || '').replace(/"/g, '""')}"`,
         r.amount, r.status, r.reference || '', r.payment_method || '',
         `"${(r.property || '').replace(/"/g, '""')}"`,
         r.room_name || ''
        ].join(',')
      ).join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="transactions-${year}.csv"`);
      return reply.send(header + csv);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to export' });
    }
  });

  // ── GET /:id ──────────────────────────────────────────────────────────────
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: { description: 'Get transaction by ID', tags: ['Transactions'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const [rows] = await pool.query(`
        SELECT tx.*, p.property_name, p.address_line_1, p.landlord_id,
               r.room_name, u.given_name AS tenant_given_name, u.last_name AS tenant_last_name
        FROM transactions tx
        JOIN properties p ON tx.property_id = p.id
        LEFT JOIN rooms r ON tx.room_id = r.id
        LEFT JOIN tenancies t ON tx.tenancy_id = t.id
        LEFT JOIN users u ON t.tenant_id = u.id
        WHERE tx.id = ?
      `, [request.params.id]);

      if (rows.length === 0) return reply.code(404).send({ error: 'Transaction not found' });
      if (request.user.role !== 'admin' && rows[0].landlord_id !== request.user.id)
        return reply.code(403).send({ error: 'Forbidden' });

      return reply.send({ transaction: formatTransaction(rows[0]) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch transaction' });
    }
  });

  // ── POST / ────────────────────────────────────────────────────────────────
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: { description: 'Create a transaction', tags: ['Transactions'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const v = createTransactionSchema.parse(request.body);

      // Verify property ownership
      const [props] = await pool.query('SELECT landlord_id FROM properties WHERE id = ?', [v.propertyId]);
      if (props.length === 0) return reply.code(404).send({ error: 'Property not found' });
      if (request.user.role !== 'admin' && props[0].landlord_id !== request.user.id)
        return reply.code(403).send({ error: 'Forbidden' });

      const id = generateUUID();
      await pool.query(`
        INSERT INTO transactions
          (id, property_id, tenancy_id, room_id, type, category, amount, date,
           description, supplier, reference, paid_by_user_id, payment_method, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, v.propertyId, v.tenancyId || null, v.roomId || null,
        v.type, v.category, v.amount, v.date,
        v.description || null, v.supplier || null, v.reference || null,
        null, v.paymentMethod || null, v.status, v.notes || null
      ]);

      const [created] = await pool.query(`
        SELECT tx.*, p.property_name, p.address_line_1, r.room_name
        FROM transactions tx
        JOIN properties p ON tx.property_id = p.id
        LEFT JOIN rooms r ON tx.room_id = r.id
        WHERE tx.id = ?
      `, [id]);

      return reply.code(201).send({ message: 'Transaction created', transaction: formatTransaction(created[0]) });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create transaction' });
    }
  });

  // ── PATCH /:id ────────────────────────────────────────────────────────────
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: { description: 'Update a transaction', tags: ['Transactions'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const [rows] = await pool.query(
        'SELECT tx.*, p.landlord_id FROM transactions tx JOIN properties p ON tx.property_id = p.id WHERE tx.id = ?',
        [request.params.id]
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Transaction not found' });
      if (request.user.role !== 'admin' && rows[0].landlord_id !== request.user.id)
        return reply.code(403).send({ error: 'Forbidden' });

      const fieldMap = {
        type: 'type', category: 'category', amount: 'amount', date: 'date',
        description: 'description', supplier: 'supplier', reference: 'reference',
        paymentMethod: 'payment_method', status: 'status', notes: 'notes'
      };

      const updates = [], values = [];
      for (const [key, col] of Object.entries(fieldMap)) {
        if (request.body[key] !== undefined) { updates.push(`${col} = ?`); values.push(request.body[key]); }
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await pool.query(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, values);
      }

      return reply.send({ message: 'Transaction updated' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update transaction' });
    }
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: { description: 'Delete a transaction', tags: ['Transactions'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    try {
      const [rows] = await pool.query(
        'SELECT tx.*, p.landlord_id FROM transactions tx JOIN properties p ON tx.property_id = p.id WHERE tx.id = ?',
        [request.params.id]
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Transaction not found' });
      if (request.user.role !== 'admin' && rows[0].landlord_id !== request.user.id)
        return reply.code(403).send({ error: 'Forbidden' });

      await pool.query('DELETE FROM transactions WHERE id = ?', [request.params.id]);
      return reply.send({ message: 'Transaction deleted' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete transaction' });
    }
  });

  // ── POST /generate-rent ───────────────────────────────────────────────────
  // Generate scheduled rent income rows for a tenancy
  fastify.post('/generate-rent', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Generate scheduled rent transactions for a tenancy',
      tags: ['Transactions'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tenancyId', 'months'],
        properties: {
          tenancyId: { type: 'string', format: 'uuid' },
          months:    { type: 'integer', minimum: 1, maximum: 24 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenancyId, months } = request.body;

      const [rows] = await pool.query(
        'SELECT t.*, p.landlord_id FROM tenancies t JOIN properties p ON t.property_id = p.id WHERE t.id = ?',
        [tenancyId]
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Tenancy not found' });
      if (request.user.role !== 'admin' && rows[0].landlord_id !== request.user.id)
        return reply.code(403).send({ error: 'Forbidden' });

      const tenancy = rows[0];
      const start = new Date();

      for (let i = 0; i < months; i++) {
        const d = new Date(start);
        d.setMonth(d.getMonth() + i);
        d.setDate(tenancy.rent_due_day || 1);

        await pool.query(`
          INSERT INTO transactions (id, property_id, tenancy_id, room_id, type, category, amount, date, description, status)
          VALUES (?, ?, ?, ?, 'income', 'rent', ?, ?, 'Rent payment', 'pending')
        `, [generateUUID(), tenancy.property_id, tenancyId, tenancy.room_id || null,
            tenancy.rent_amount, d.toISOString().split('T')[0]]);
      }

      return reply.code(201).send({ message: `Generated ${months} rent transactions` });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to generate rent transactions' });
    }
  });
}

function formatTransaction(tx) {
  const isOverdue = tx.status === 'pending' && new Date(tx.date) < new Date();
  return {
    id:            tx.id,
    propertyId:    tx.property_id,
    tenancyId:     tx.tenancy_id,
    roomId:        tx.room_id,
    type:          tx.type,
    category:      tx.category,
    amount:        tx.amount,
    date:          tx.date,
    description:   tx.description,
    supplier:      tx.supplier,
    reference:     tx.reference,
    paymentMethod: tx.payment_method,
    status:        isOverdue ? 'late' : tx.status,
    isOverdue,
    notes:         tx.notes,
    property:      tx.property_name ?? tx.address_line_1 ?? undefined,
    roomName:      tx.room_name ?? undefined,
    tenant:        tx.tenant_given_name ? `${tx.tenant_given_name} ${tx.tenant_last_name}` : undefined,
    createdAt:     tx.created_at,
    updatedAt:     tx.updated_at,
  };
}

module.exports = transactionsRoutes;
