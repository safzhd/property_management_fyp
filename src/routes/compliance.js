const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');

const createCertificateSchema = z.object({
  propertyId: z.string().uuid(),
  certificateType: z.enum(['gas_safety', 'eicr', 'epc', 'hmo_licence', 'fire_risk', 'legionella', 'smoke_co_alarm', 'pat_testing', 'asbestos', 'other']),
  certificateNumber: z.string().max(100).optional(),
  issueDate: z.string(),
  expiryDate: z.string().optional(),
  contractorName: z.string().max(255).optional(),
  contractorCompany: z.string().max(255).optional(),
  contractorRegistration: z.string().max(100).optional(),
  contractorPhone: z.string().max(20).optional(),
  contractorEmail: z.string().email().optional(),
  cost: z.number().positive().optional(),
  reminderDaysBefore: z.number().int().positive().default(30),
  notes: z.string().optional()
});

// Certificate validity periods (in days)
const CERTIFICATE_VALIDITY = {
  gas_safety: 365,
  eicr: 365 * 5,
  epc: 365 * 10,
  hmo_licence: 365 * 5,
  fire_risk: 365,
  legionella: 365 * 2,
  smoke_co_alarm: 365,
  pat_testing: 365,
  asbestos: null, // No expiry
  other: null
};

async function complianceRoutes(fastify, options) {
  // Get all certificates
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all compliance certificates',
      tags: ['Compliance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const { propertyId, certificateType, status } = request.query;

      let query = `
        SELECT c.*, p.property_name, p.address_line_1, p.postcode
        FROM compliance_certificates c
        JOIN properties p ON c.property_id = p.id
        WHERE p.landlord_id = ?
      `;
      const params = [request.user.id];

      if (propertyId) {
        query += ' AND c.property_id = ?';
        params.push(propertyId);
      }

      if (certificateType) {
        query += ' AND c.certificate_type = ?';
        params.push(certificateType);
      }

      if (status) {
        query += ' AND c.status = ?';
        params.push(status);
      }

      query += ' ORDER BY c.expiry_date ASC';

      const [certificates] = await pool.query(query, params);

      // Update statuses based on current date
      const now = new Date();
      const updated = certificates.map(c => {
        let status = 'valid';
        if (c.expiry_date) {
          const expiry = new Date(c.expiry_date);
          const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
          if (daysUntilExpiry < 0) {
            status = 'expired';
          } else if (daysUntilExpiry <= c.reminder_days_before) {
            status = 'expiring_soon';
          }
        }
        return { ...c, computed_status: status };
      });

      return reply.send({
        certificates: updated.map(formatCertificate)
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch certificates' });
    }
  });

  // Get dashboard summary
  fastify.get('/dashboard', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get compliance dashboard summary',
      tags: ['Compliance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [summary] = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN c.expiry_date < CURDATE() THEN 1 ELSE 0 END) as expired,
          SUM(CASE WHEN c.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as expiring_soon,
          SUM(CASE WHEN c.expiry_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY) OR c.expiry_date IS NULL THEN 1 ELSE 0 END) as valid
        FROM compliance_certificates c
        JOIN properties p ON c.property_id = p.id
        WHERE p.landlord_id = ?
      `, [request.user.id]);

      const [upcoming] = await pool.query(`
        SELECT c.*, p.property_name, p.address_line_1
        FROM compliance_certificates c
        JOIN properties p ON c.property_id = p.id
        WHERE p.landlord_id = ?
          AND c.expiry_date IS NOT NULL
          AND c.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
        ORDER BY c.expiry_date ASC
        LIMIT 10
      `, [request.user.id]);

      const [expired] = await pool.query(`
        SELECT c.*, p.property_name, p.address_line_1
        FROM compliance_certificates c
        JOIN properties p ON c.property_id = p.id
        WHERE p.landlord_id = ? AND c.expiry_date < CURDATE()
        ORDER BY c.expiry_date ASC
      `, [request.user.id]);

      return reply.send({
        summary: summary[0],
        upcoming: upcoming.map(formatCertificate),
        expired: expired.map(formatCertificate)
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch dashboard' });
    }
  });

  // Get certificate by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get certificate by ID',
      tags: ['Compliance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [certificates] = await pool.query(
        `SELECT c.*, p.property_name, p.address_line_1, p.postcode, p.landlord_id
         FROM compliance_certificates c
         JOIN properties p ON c.property_id = p.id
         WHERE c.id = ?`,
        [request.params.id]
      );

      if (certificates.length === 0) {
        return reply.code(404).send({ error: 'Certificate not found' });
      }

      const c = certificates[0];

      if (request.user.role !== 'admin' && c.landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({ certificate: formatCertificate(c) });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch certificate' });
    }
  });

  // Create certificate
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Create a new compliance certificate',
      tags: ['Compliance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createCertificateSchema.parse(request.body);

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

      // Calculate expiry date if not provided
      let expiryDate = validated.expiryDate;
      if (!expiryDate && CERTIFICATE_VALIDITY[validated.certificateType]) {
        const issueDate = new Date(validated.issueDate);
        issueDate.setDate(issueDate.getDate() + CERTIFICATE_VALIDITY[validated.certificateType]);
        expiryDate = issueDate.toISOString().split('T')[0];
      }

      const id = generateUUID();

      await pool.query(
        `INSERT INTO compliance_certificates (
          id, property_id, certificate_type, certificate_number,
          issue_date, expiry_date,
          contractor_name, contractor_company, contractor_registration,
          contractor_phone, contractor_email,
          cost, reminder_days_before, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid')`,
        [
          id,
          validated.propertyId,
          validated.certificateType,
          validated.certificateNumber || null,
          validated.issueDate,
          expiryDate || null,
          validated.contractorName || null,
          validated.contractorCompany || null,
          validated.contractorRegistration || null,
          validated.contractorPhone || null,
          validated.contractorEmail || null,
          validated.cost || null,
          validated.reminderDaysBefore,
          validated.notes || null
        ]
      );

      const [created] = await pool.query(
        `SELECT c.*, p.property_name, p.address_line_1, p.postcode
         FROM compliance_certificates c
         JOIN properties p ON c.property_id = p.id
         WHERE c.id = ?`,
        [id]
      );

      return reply.code(201).send({
        message: 'Certificate created successfully',
        certificate: formatCertificate(created[0])
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create certificate' });
    }
  });

  // Update certificate
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update a certificate',
      tags: ['Compliance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [certificates] = await pool.query(
        `SELECT c.*, p.landlord_id
         FROM compliance_certificates c
         JOIN properties p ON c.property_id = p.id
         WHERE c.id = ?`,
        [request.params.id]
      );

      if (certificates.length === 0) {
        return reply.code(404).send({ error: 'Certificate not found' });
      }

      if (request.user.role !== 'admin' && certificates[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const data = request.body;
      const updates = [];
      const values = [];

      const fieldMap = {
        certificateNumber: 'certificate_number',
        issueDate: 'issue_date',
        expiryDate: 'expiry_date',
        contractorName: 'contractor_name',
        contractorCompany: 'contractor_company',
        contractorRegistration: 'contractor_registration',
        contractorPhone: 'contractor_phone',
        contractorEmail: 'contractor_email',
        cost: 'cost',
        reminderDaysBefore: 'reminder_days_before',
        notes: 'notes',
        reminderSent: 'reminder_sent'
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
          `UPDATE compliance_certificates SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      const [updated] = await pool.query(
        `SELECT c.*, p.property_name, p.address_line_1, p.postcode
         FROM compliance_certificates c
         JOIN properties p ON c.property_id = p.id
         WHERE c.id = ?`,
        [request.params.id]
      );

      return reply.send({
        message: 'Certificate updated successfully',
        certificate: formatCertificate(updated[0])
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update certificate' });
    }
  });

  // Delete certificate
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a certificate',
      tags: ['Compliance'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [certificates] = await pool.query(
        `SELECT c.*, p.landlord_id
         FROM compliance_certificates c
         JOIN properties p ON c.property_id = p.id
         WHERE c.id = ?`,
        [request.params.id]
      );

      if (certificates.length === 0) {
        return reply.code(404).send({ error: 'Certificate not found' });
      }

      if (request.user.role !== 'admin' && certificates[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await pool.query('DELETE FROM compliance_certificates WHERE id = ?', [request.params.id]);

      return reply.send({ message: 'Certificate deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete certificate' });
    }
  });
}

function formatCertificate(c) {
  const now = new Date();
  let status = 'valid';
  let daysUntilExpiry = null;

  if (c.expiry_date) {
    const expiry = new Date(c.expiry_date);
    daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) {
      status = 'expired';
    } else if (daysUntilExpiry <= (c.reminder_days_before || 30)) {
      status = 'expiring_soon';
    }
  }

  return {
    id: c.id,
    propertyId: c.property_id,
    property: c.property_name ? {
      name: c.property_name,
      address: c.address_line_1,
      postcode: c.postcode
    } : undefined,
    certificateType: c.certificate_type,
    certificateNumber: c.certificate_number,
    issueDate: c.issue_date,
    expiryDate: c.expiry_date,
    daysUntilExpiry,
    status,
    contractor: {
      name: c.contractor_name,
      company: c.contractor_company,
      registration: c.contractor_registration,
      phone: c.contractor_phone,
      email: c.contractor_email
    },
    cost: c.cost,
    documentId: c.document_id,
    reminderDaysBefore: c.reminder_days_before,
    reminderSent: Boolean(c.reminder_sent),
    notes: c.notes,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  };
}

module.exports = complianceRoutes;
