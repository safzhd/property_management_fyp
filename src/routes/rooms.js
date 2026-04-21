const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');
const { z } = require('zod');

const createRoomSchema = z.object({
  propertyId: z.string().uuid(),
  roomName: z.string().max(100).optional(),
  roomNumber: z.number().int().optional(),
  floorLevel: z.number().int().default(0),
  roomSizeSqm: z.number().positive().optional(),
  maxOccupancy: z.number().int().positive().default(1),
  roomType: z.enum(['single', 'double', 'studio', 'other']).optional(),
  bathroomType: z.enum(['ensuite', 'shared', 'private']).default('shared'),
  amenities: z.array(z.string()).default([]),
  rentAmount: z.number().positive().optional(),
  billsIncluded: z.boolean().default(false),
  depositAmount: z.number().positive().optional(),
  isAvailable: z.boolean().default(true),
  isFurnished: z.boolean().default(false)
});

const updateRoomSchema = createRoomSchema.omit({ propertyId: true }).partial();

async function roomsRoutes(fastify, options) {
  // Get all rooms for a property
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all rooms (optionally filtered by property)',
      tags: ['Rooms'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          propertyId: { type: 'string', format: 'uuid' },
          isAvailable: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { propertyId, isAvailable } = request.query;

      let query = `
        SELECT r.*, p.property_name, p.landlord_id
        FROM rooms r
        JOIN properties p ON r.property_id = p.id
        WHERE p.landlord_id = ?
      `;
      const params = [request.user.id];

      if (propertyId) {
        query += ' AND r.property_id = ?';
        params.push(propertyId);
      }

      if (isAvailable !== undefined) {
        query += ' AND r.is_available = ?';
        params.push(isAvailable);
      }

      query += ' ORDER BY p.property_name, r.room_number, r.room_name';

      const [rooms] = await pool.query(query, params);

      return reply.send({
        rooms: rooms.map(r => ({
          id: r.id,
          propertyId: r.property_id,
          propertyName: r.property_name,
          roomName: r.room_name,
          roomNumber: r.room_number,
          floorLevel: r.floor_level,
          roomSizeSqm: r.room_size_sqm,
          maxOccupancy: r.max_occupancy,
          roomType: r.room_type,
          bathroomType: r.bathroom_type,
          amenities: r.amenities || [],
          rentAmount: r.rent_amount,
          billsIncluded: Boolean(r.bills_included),
          depositAmount: r.deposit_amount,
          isAvailable: Boolean(r.is_available),
          isFurnished: Boolean(r.is_furnished),
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }))
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch rooms' });
    }
  });

  // Get room by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get room by ID',
      tags: ['Rooms'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [rooms] = await pool.query(
        `SELECT r.*, p.property_name, p.landlord_id
         FROM rooms r
         JOIN properties p ON r.property_id = p.id
         WHERE r.id = ?`,
        [request.params.id]
      );

      if (rooms.length === 0) {
        return reply.code(404).send({ error: 'Room not found' });
      }

      const r = rooms[0];

      // Check ownership
      if (request.user.role !== 'admin' && r.landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({
        room: {
          id: r.id,
          propertyId: r.property_id,
          propertyName: r.property_name,
          roomName: r.room_name,
          roomNumber: r.room_number,
          floorLevel: r.floor_level,
          roomSizeSqm: r.room_size_sqm,
          maxOccupancy: r.max_occupancy,
          roomType: r.room_type,
          bathroomType: r.bathroom_type,
          amenities: r.amenities || [],
          rentAmount: r.rent_amount,
          billsIncluded: Boolean(r.bills_included),
          depositAmount: r.deposit_amount,
          isAvailable: Boolean(r.is_available),
          isFurnished: Boolean(r.is_furnished),
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch room' });
    }
  });

  // Create room
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Create a new room',
      tags: ['Rooms'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const validated = createRoomSchema.parse(request.body);

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

      const id = generateUUID();

      await pool.query(
        `INSERT INTO rooms (
          id, property_id, room_name, room_number, floor_level,
          room_size_sqm, max_occupancy, room_type, bathroom_type, amenities,
          rent_amount, bills_included, deposit_amount, is_available, is_furnished
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          validated.propertyId,
          validated.roomName || null,
          validated.roomNumber || null,
          validated.floorLevel,
          validated.roomSizeSqm || null,
          validated.maxOccupancy,
          validated.roomType || null,
          validated.bathroomType,
          JSON.stringify(validated.amenities),
          validated.rentAmount || null,
          validated.billsIncluded,
          validated.depositAmount || null,
          validated.isAvailable,
          validated.isFurnished
        ]
      );

      // Update property room count
      await pool.query(
        'UPDATE properties SET total_rooms = total_rooms + 1 WHERE id = ?',
        [validated.propertyId]
      );

      const [rooms] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);

      return reply.code(201).send({
        message: 'Room created successfully',
        room: {
          id: rooms[0].id,
          propertyId: rooms[0].property_id,
          roomName: rooms[0].room_name,
          roomNumber: rooms[0].room_number,
          floorLevel: rooms[0].floor_level,
          roomSizeSqm: rooms[0].room_size_sqm,
          maxOccupancy: rooms[0].max_occupancy,
          roomType: rooms[0].room_type,
          bathroomType: rooms[0].bathroom_type,
          amenities: rooms[0].amenities || [],
          rentAmount: rooms[0].rent_amount,
          billsIncluded: Boolean(rooms[0].bills_included),
          depositAmount: rooms[0].deposit_amount,
          isAvailable: Boolean(rooms[0].is_available),
          isFurnished: Boolean(rooms[0].is_furnished),
          createdAt: rooms[0].created_at,
          updatedAt: rooms[0].updated_at
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create room' });
    }
  });

  // Update room
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update a room',
      tags: ['Rooms'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [rooms] = await pool.query(
        `SELECT r.*, p.landlord_id
         FROM rooms r
         JOIN properties p ON r.property_id = p.id
         WHERE r.id = ?`,
        [request.params.id]
      );

      if (rooms.length === 0) {
        return reply.code(404).send({ error: 'Room not found' });
      }

      if (request.user.role !== 'admin' && rooms[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const validated = updateRoomSchema.parse(request.body);

      const updates = [];
      const values = [];

      const fieldMap = {
        roomName: 'room_name',
        roomNumber: 'room_number',
        floorLevel: 'floor_level',
        roomSizeSqm: 'room_size_sqm',
        maxOccupancy: 'max_occupancy',
        roomType: 'room_type',
        bathroomType: 'bathroom_type',
        rentAmount: 'rent_amount',
        billsIncluded: 'bills_included',
        depositAmount: 'deposit_amount',
        isAvailable: 'is_available',
        isFurnished: 'is_furnished'
      };

      for (const [key, column] of Object.entries(fieldMap)) {
        if (validated[key] !== undefined) {
          updates.push(`${column} = ?`);
          values.push(validated[key]);
        }
      }

      if (validated.amenities !== undefined) {
        updates.push('amenities = ?');
        values.push(JSON.stringify(validated.amenities));
      }

      if (updates.length > 0) {
        values.push(request.params.id);
        await pool.query(
          `UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      const [updated] = await pool.query('SELECT * FROM rooms WHERE id = ?', [request.params.id]);

      return reply.send({
        message: 'Room updated successfully',
        room: {
          id: updated[0].id,
          propertyId: updated[0].property_id,
          roomName: updated[0].room_name,
          roomNumber: updated[0].room_number,
          floorLevel: updated[0].floor_level,
          roomSizeSqm: updated[0].room_size_sqm,
          maxOccupancy: updated[0].max_occupancy,
          roomType: updated[0].room_type,
          bathroomType: updated[0].bathroom_type,
          amenities: updated[0].amenities || [],
          rentAmount: updated[0].rent_amount,
          billsIncluded: Boolean(updated[0].bills_included),
          depositAmount: updated[0].deposit_amount,
          isAvailable: Boolean(updated[0].is_available),
          createdAt: updated[0].created_at,
          updatedAt: updated[0].updated_at
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update room' });
    }
  });

  // Delete room
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a room',
      tags: ['Rooms'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const [rooms] = await pool.query(
        `SELECT r.*, p.landlord_id
         FROM rooms r
         JOIN properties p ON r.property_id = p.id
         WHERE r.id = ?`,
        [request.params.id]
      );

      if (rooms.length === 0) {
        return reply.code(404).send({ error: 'Room not found' });
      }

      if (request.user.role !== 'admin' && rooms[0].landlord_id !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      // Check for active tenancies
      const [tenancies] = await pool.query(
        `SELECT id FROM tenancies WHERE room_id = ? AND lifecycle_status NOT IN ('ended', 'cancelled')`,
        [request.params.id]
      );

      if (tenancies.length > 0) {
        return reply.code(400).send({ error: 'Cannot delete room with active tenancies' });
      }

      await pool.query('DELETE FROM rooms WHERE id = ?', [request.params.id]);

      // Update property room count
      await pool.query(
        'UPDATE properties SET total_rooms = total_rooms - 1 WHERE id = ?',
        [rooms[0].property_id]
      );

      return reply.send({ message: 'Room deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete room' });
    }
  });
}

module.exports = roomsRoutes;
