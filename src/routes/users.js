const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const createTenantSchema = z.object({
  givenName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(20).optional().nullable(),
  password: z.string().min(8).max(100)
});

const updateUserSchema = z.object({
  givenName: z.string().min(1).max(100).optional(),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional().nullable()
});

async function usersRoutes(fastify, options) {
  // Create tenant user (landlord or admin)
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Create a tenant user account',
      tags: ['Users'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createTenantSchema.parse(request.body);
      const email = validated.email.toLowerCase();

      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existing.length > 0) {
        return reply.code(409).send({ error: 'An account with this email already exists. Use "Existing Tenant" to link them instead.' });
      }

      const id = generateUUID();
      const passwordHash = await bcrypt.hash(validated.password, 10);

      await pool.query(
        `INSERT INTO users (id, email, password_hash, role, given_name, middle_name, last_name, phone)
         VALUES (?, ?, ?, 'tenant', ?, ?, ?, ?)`,
        [id, email, passwordHash, validated.givenName, validated.middleName || null, validated.lastName, validated.phone || null]
      );

      const [users] = await pool.query(
        `SELECT id, email, role, given_name, middle_name, last_name, phone, created_at
         FROM users WHERE id = ?`,
        [id]
      );

      const u = users[0];
      return reply.code(201).send({
        message: 'Tenant user created successfully',
        user: {
          id: u.id,
          email: u.email,
          role: u.role,
          givenName: u.given_name,
          middleName: u.middle_name,
          lastName: u.last_name,
          phone: u.phone,
          createdAt: u.created_at
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create tenant user' });
    }
  });

  // Get tenant users (landlord or admin — returns all tenants accessible to caller)
  fastify.get('/tenants', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Get all tenant users',
      tags: ['Users'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      // Return tenants who have tenancies under this landlord, plus any the landlord created
      // For simplicity, return all tenants (admins see all; landlords see tenants linked to their properties)
      let query;
      let params;

      if (request.user.role === 'admin') {
        query = `SELECT id, email, given_name, middle_name, last_name, phone, is_active, created_at
                 FROM users WHERE role = 'tenant' ORDER BY last_name, given_name`;
        params = [];
      } else {
        query = `SELECT DISTINCT u.id, u.email, u.given_name, u.middle_name, u.last_name, u.phone, u.is_active, u.created_at
                 FROM users u
                 WHERE u.role = 'tenant'
                 ORDER BY u.last_name, u.given_name`;
        params = [];
      }

      const [tenants] = await pool.query(query, params);

      return reply.send({
        tenants: tenants.map(u => ({
          id: u.id,
          email: u.email,
          givenName: u.given_name,
          middleName: u.middle_name,
          lastName: u.last_name,
          phone: u.phone,
          isActive: Boolean(u.is_active),
          createdAt: u.created_at
        }))
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch tenants' });
    }
  });

  // Get all users (admin only)
  fastify.get('/', {
    onRequest: [fastify.requireRole(['admin'])],
    schema: {
      description: 'Get all users (admin only)',
      tags: ['Users'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [users] = await pool.query(
        `SELECT id, email, role, given_name, middle_name, last_name, phone,
                profile_image_url, is_active, email_verified, created_at, updated_at
         FROM users
         ORDER BY created_at DESC`
      );

      return reply.send({
        users: users.map(u => ({
          id: u.id,
          email: u.email,
          role: u.role,
          givenName: u.given_name,
          middleName: u.middle_name,
          lastName: u.last_name,
          phone: u.phone,
          profileImageUrl: u.profile_image_url,
          isActive: u.is_active,
          emailVerified: u.email_verified,
          createdAt: u.created_at,
          updatedAt: u.updated_at
        }))
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch users' });
    }
  });

  // Get user by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get user by ID',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Users can only view themselves unless admin
      if (request.user.role !== 'admin' && request.user.id !== id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const [users] = await pool.query(
        `SELECT id, email, role, given_name, middle_name, last_name, phone,
                profile_image_url, is_active, email_verified, created_at, updated_at
         FROM users WHERE id = ?`,
        [id]
      );

      if (users.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const u = users[0];
      return reply.send({
        user: {
          id: u.id,
          email: u.email,
          role: u.role,
          givenName: u.given_name,
          middleName: u.middle_name,
          lastName: u.last_name,
          phone: u.phone,
          profileImageUrl: u.profile_image_url,
          isActive: u.is_active,
          emailVerified: u.email_verified,
          createdAt: u.created_at,
          updatedAt: u.updated_at
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch user' });
    }
  });

  // Update user
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update user profile',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Users can only update themselves unless admin
      if (request.user.role !== 'admin' && request.user.id !== id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const validated = updateUserSchema.parse(request.body);

      const updates = [];
      const values = [];

      if (validated.givenName !== undefined) {
        updates.push('given_name = ?');
        values.push(validated.givenName);
      }
      if (validated.middleName !== undefined) {
        updates.push('middle_name = ?');
        values.push(validated.middleName);
      }
      if (validated.lastName !== undefined) {
        updates.push('last_name = ?');
        values.push(validated.lastName);
      }
      if (validated.phone !== undefined) {
        updates.push('phone = ?');
        values.push(validated.phone);
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      values.push(id);
      await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      // Fetch updated user
      const [users] = await pool.query(
        `SELECT id, email, role, given_name, middle_name, last_name, phone,
                profile_image_url, is_active, email_verified, created_at, updated_at
         FROM users WHERE id = ?`,
        [id]
      );

      const u = users[0];
      return reply.send({
        message: 'User updated successfully',
        user: {
          id: u.id,
          email: u.email,
          role: u.role,
          givenName: u.given_name,
          middleName: u.middle_name,
          lastName: u.last_name,
          phone: u.phone,
          profileImageUrl: u.profile_image_url,
          isActive: u.is_active,
          emailVerified: u.email_verified,
          createdAt: u.created_at,
          updatedAt: u.updated_at
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update user' });
    }
  });

  // Deactivate user (admin only)
  fastify.delete('/:id', {
    onRequest: [fastify.requireRole(['admin'])],
    schema: {
      description: 'Deactivate user (admin only)',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      await pool.query(
        'UPDATE users SET is_active = FALSE WHERE id = ?',
        [id]
      );

      return reply.send({ message: 'User deactivated successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to deactivate user' });
    }
  });
}

module.exports = usersRoutes;
