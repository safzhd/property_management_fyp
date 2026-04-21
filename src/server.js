require('dotenv').config();

const { validateEnv, config } = require('./config/env');

// Validate environment before anything else
validateEnv();

const fastify = require('fastify')({
  logger: {
    level: config.isProduction ? 'info' : 'debug',
    ...(config.isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    })
  },
  // Generate request IDs for tracing
  genReqId: () => require('crypto').randomUUID()
});

const { testConnection, pool } = require('./config/database');

// =============================================
// GLOBAL ERROR HANDLER
// =============================================
fastify.setErrorHandler((error, request, reply) => {
  // Log the full error
  request.log.error({
    err: error,
    reqId: request.id,
    url: request.url,
    method: request.method
  });

  // Zod validation errors
  if (error.name === 'ZodError') {
    return reply.code(400).send({
      error: 'Validation Error',
      message: 'Request validation failed',
      details: error.errors
    });
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation
    });
  }

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token'
    });
  }

  // Database errors
  if (error.code && error.code.startsWith('ER_')) {
    return reply.code(500).send({
      error: 'Database Error',
      message: config.isProduction ? 'A database error occurred' : error.message
    });
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  reply.code(statusCode).send({
    error: error.name || 'Internal Server Error',
    message: config.isProduction ? 'An unexpected error occurred' : error.message,
    ...(config.isDevelopment && { stack: error.stack })
  });
});

// =============================================
// NOT FOUND HANDLER
// =============================================
fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: 'Not Found',
    message: `Route ${request.method}:${request.url} not found`,
    statusCode: 404
  });
});

// =============================================
// REGISTER PLUGINS
// =============================================
async function registerPlugins() {
  // CORS
  await fastify.register(require('@fastify/cors'), {
    origin: config.isProduction
      ? config.frontendUrl
      : [config.frontendUrl, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // Security headers
  await fastify.register(require('@fastify/helmet'), {
    contentSecurityPolicy: config.isProduction ? undefined : false
  });

  // Rate limiting - per IP
  await fastify.register(require('@fastify/rate-limit'), {
    max: config.isProduction ? 100 : 1000,
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => ({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      statusCode: 429
    })
  });

  // JWT - NO FALLBACK SECRET
  await fastify.register(require('@fastify/jwt'), {
    secret: config.jwt.secret
  });

  // Multipart for file uploads
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: config.maxFileSize
    }
  });

  // Swagger documentation (disabled in production)
  if (!config.isProduction) {
    await fastify.register(require('@fastify/swagger'), {
      openapi: {
        info: {
          title: 'HMO Property Management API',
          description: 'HMO Property Management Platform for UK Landlords',
          version: '1.0.0'
        },
        servers: [
          { url: `http://localhost:${config.port}` }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        }
      }
    });

    await fastify.register(require('@fastify/swagger-ui'), {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      }
    });
  }
}

// =============================================
// AUTHENTICATION DECORATORS
// =============================================
fastify.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
});

fastify.decorate('requireRole', function (roles) {
  return async function (request, reply) {
    await fastify.authenticate(request, reply);
    if (reply.sent) return; // Auth failed

    if (!roles.includes(request.user.role)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }
  };
});

// =============================================
// REGISTER ROUTES
// =============================================
async function registerRoutes() {
  // Health check - includes DB status
  fastify.get('/health', async (request, reply) => {
    let dbStatus = 'unknown';
    try {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = 'disconnected';
    }

    const health = {
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      environment: config.nodeEnv
    };

    const statusCode = dbStatus === 'connected' ? 200 : 503;
    return reply.code(statusCode).send(health);
  });

  // API info
  fastify.get('/', async () => ({
    name: 'HMO Property Management API',
    version: '1.0.0',
    docs: config.isProduction ? null : '/docs',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      properties: '/api/properties',
      rooms: '/api/rooms',
      tenancies: '/api/tenancies',
      maintenance: '/api/maintenance',
      compliance: '/api/compliance',
      transactions: '/api/transactions',
      documents: '/api/documents',
      notifications: '/api/notifications'
    }
  }));

  // Register API routes
  await fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
  await fastify.register(require('./routes/users'), { prefix: '/api/users' });
  await fastify.register(require('./routes/properties'), { prefix: '/api/properties' });
  await fastify.register(require('./routes/rooms'), { prefix: '/api/rooms' });
  await fastify.register(require('./routes/tenancies'), { prefix: '/api/tenancies' });
  await fastify.register(require('./routes/maintenance'), { prefix: '/api/maintenance' });
  await fastify.register(require('./routes/compliance'), { prefix: '/api/compliance' });
  await fastify.register(require('./routes/transactions'), { prefix: '/api/transactions' });
  await fastify.register(require('./routes/documents'), { prefix: '/api/documents' });
  await fastify.register(require('./routes/notifications'), { prefix: '/api/notifications' });
}

// =============================================
// GRACEFUL SHUTDOWN
// =============================================
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Stop accepting new connections
    await fastify.close();
    console.log('HTTP server closed.');

    // Close database pool
    await pool.end();
    console.log('Database connections closed.');

    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// =============================================
// START SERVER
// =============================================
async function start() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Exiting...');
      process.exit(1);
    }

    await registerPlugins();
    await registerRoutes();

    await fastify.listen({ port: config.port, host: '0.0.0.0' });

    console.log(`\n✅ Server running at http://localhost:${config.port}`);
    if (!config.isProduction) {
      console.log(`📚 API docs at http://localhost:${config.port}/docs`);
    }
    console.log(`🏥 Health check at http://localhost:${config.port}/health\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
