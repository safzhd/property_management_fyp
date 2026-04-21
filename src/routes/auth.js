const authService = require('../services/authService');
const { z } = require('zod');

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  givenName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  role: z.enum(['landlord', 'tenant']).default('landlord')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100)
});

const resetRequestSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().uuid(),
  newPassword: z.string().min(8).max(100)
});

async function authRoutes(fastify, options) {
  // Register
  fastify.post('/register', {
    schema: {
      description: 'Register a new user',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password', 'givenName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          givenName: { type: 'string' },
          middleName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['landlord', 'tenant'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const validated = registerSchema.parse(request.body);
      const user = await authService.register(validated);

      const token = fastify.jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return reply.code(201).send({
        message: 'User registered successfully',
        user,
        token
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      if (error.message === 'Email already registered') {
        return reply.code(409).send({ error: error.message });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Registration failed' });
    }
  });

  // Login
  fastify.post('/login', {
    schema: {
      description: 'Login with email and password',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const validated = loginSchema.parse(request.body);
      const user = await authService.login(validated.email, validated.password);

      const token = fastify.jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      const refreshToken = fastify.jwt.sign(
        { id: user.id, type: 'refresh' },
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
      );

      return reply.send({
        message: 'Login successful',
        user,
        token,
        refreshToken
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      if (error.message === 'Invalid email or password') {
        return reply.code(401).send({ error: error.message });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Login failed' });
    }
  });

  // Get current user
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get current authenticated user',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const user = await authService.getUserById(request.user.id);
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      return reply.send({ user });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to get user' });
    }
  });

  // Change password
  fastify.post('/change-password', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Change password for authenticated user',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const validated = changePasswordSchema.parse(request.body);
      await authService.updatePassword(
        request.user.id,
        validated.currentPassword,
        validated.newPassword
      );
      return reply.send({ message: 'Password changed successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      if (error.message === 'Current password is incorrect') {
        return reply.code(401).send({ error: error.message });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to change password' });
    }
  });

  // Request password reset
  fastify.post('/forgot-password', {
    schema: {
      description: 'Request password reset email',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const validated = resetRequestSchema.parse(request.body);
      const result = await authService.createPasswordResetToken(validated.email);

      // TODO: Send email with reset link
      // For now, just return success (don't reveal if email exists)
      if (result) {
        fastify.log.info(`Password reset token generated for user ${result.userId}`);
        // In production, send email here
      }

      return reply.send({
        message: 'If an account exists with this email, a reset link will be sent'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to process request' });
    }
  });

  // Reset password with token
  fastify.post('/reset-password', {
    schema: {
      description: 'Reset password using reset token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string', format: 'uuid' },
          newPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const validated = resetPasswordSchema.parse(request.body);
      await authService.resetPassword(validated.token, validated.newPassword);
      return reply.send({ message: 'Password reset successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      if (error.message === 'Invalid or expired reset token') {
        return reply.code(400).send({ error: error.message });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to reset password' });
    }
  });

  // Refresh token
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh access token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { refreshToken } = request.body;

      const decoded = fastify.jwt.verify(refreshToken);
      if (decoded.type !== 'refresh') {
        return reply.code(401).send({ error: 'Invalid token type' });
      }

      const user = await authService.getUserById(decoded.id);
      if (!user) {
        return reply.code(401).send({ error: 'User not found' });
      }

      const newToken = fastify.jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return reply.send({ token: newToken });
    } catch (error) {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }
  });

  // Logout (client-side, but can invalidate refresh token)
  fastify.post('/logout', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Logout user (invalidate tokens)',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      await authService.revokeAllUserTokens(request.user.id);
      return reply.send({ message: 'Logged out successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Logout failed' });
    }
  });
}

module.exports = authRoutes;
