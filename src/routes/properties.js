const propertyService = require('../services/propertyService');
const { z } = require('zod');

const createPropertySchema = z.object({
  propertyName: z.string().max(255).optional(),
  propertyType: z.enum(['house', 'flat', 'hmo', 'other']),
  doorNumber: z.string().max(20).optional(),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  county: z.string().max(100).optional(),
  postcode: z.string().min(1).max(10),
  country: z.string().max(50).default('United Kingdom'),
  isHmo: z.boolean().default(false),
  hmoLicenceRequired: z.boolean().default(false),
  hmoLicenceNumber: z.string().max(100).optional(),
  hmoLicenceExpiry: z.string().optional(), // Date string
  hmoMaxOccupants: z.number().int().positive().optional(),
  prsRegistered: z.boolean().default(false),
  prsRegistrationNumber: z.string().max(100).optional(),
  prsRegistrationDate: z.string().optional(),
  totalRooms: z.number().int().min(0).default(0),
  totalBathrooms: z.number().int().min(0).default(0),
  status: z.enum(['active', 'inactive', 'archived']).default('active')
});

const updatePropertySchema = createPropertySchema.partial();

async function propertiesRoutes(fastify, options) {
  // Get all properties for current landlord
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all properties for current user',
      tags: ['Properties'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
          isHmo: { type: 'boolean' },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { status, isHmo, limit, offset } = request.query;

      // Admin can see all, landlords see their own
      let landlordId = request.user.id;
      if (request.user.role === 'admin' && request.query.landlordId) {
        landlordId = request.query.landlordId;
      }

      const properties = await propertyService.getByLandlord(landlordId, {
        status,
        isHmo,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });

      const stats = await propertyService.getStats(landlordId);

      return reply.send({ properties, stats });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch properties' });
    }
  });

  // Get property by ID
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get property by ID',
      tags: ['Properties'],
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
      const property = await propertyService.getById(request.params.id);

      if (!property) {
        return reply.code(404).send({ error: 'Property not found' });
      }

      // Check ownership (unless admin)
      if (request.user.role !== 'admin' && property.landlordId !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return reply.send({ property });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch property' });
    }
  });

  // Create property
  fastify.post('/', {
    onRequest: [fastify.requireRole(['admin', 'landlord'])],
    schema: {
      description: 'Create a new property',
      tags: ['Properties'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['propertyType', 'addressLine1', 'city', 'postcode'],
        properties: {
          propertyName: { type: 'string' },
          propertyType: { type: 'string', enum: ['house', 'flat', 'hmo', 'other'] },
          doorNumber: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string' },
          city: { type: 'string' },
          county: { type: 'string' },
          postcode: { type: 'string' },
          country: { type: 'string' },
          isHmo: { type: 'boolean' },
          hmoLicenceRequired: { type: 'boolean' },
          hmoLicenceNumber: { type: 'string' },
          hmoLicenceExpiry: { type: 'string', format: 'date' },
          hmoMaxOccupants: { type: 'integer' },
          prsRegistered: { type: 'boolean' },
          prsRegistrationNumber: { type: 'string' },
          prsRegistrationDate: { type: 'string', format: 'date' },
          totalRooms: { type: 'integer' },
          totalBathrooms: { type: 'integer' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const validated = createPropertySchema.parse(request.body);
      const property = await propertyService.create(request.user.id, validated);

      return reply.code(201).send({
        message: 'Property created successfully',
        property
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create property' });
    }
  });

  // Update property
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update a property',
      tags: ['Properties'],
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
      const property = await propertyService.getById(request.params.id);

      if (!property) {
        return reply.code(404).send({ error: 'Property not found' });
      }

      // Check ownership (unless admin)
      if (request.user.role !== 'admin' && property.landlordId !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const validated = updatePropertySchema.parse(request.body);
      const updated = await propertyService.update(request.params.id, validated);

      return reply.send({
        message: 'Property updated successfully',
        property: updated
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update property' });
    }
  });

  // Delete (archive) property
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Archive a property',
      tags: ['Properties'],
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
      const property = await propertyService.getById(request.params.id);

      if (!property) {
        return reply.code(404).send({ error: 'Property not found' });
      }

      // Check ownership (unless admin)
      if (request.user.role !== 'admin' && property.landlordId !== request.user.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await propertyService.delete(request.params.id);

      return reply.send({ message: 'Property archived successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to archive property' });
    }
  });
}

module.exports = propertiesRoutes;
