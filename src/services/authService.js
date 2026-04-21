const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');

const SALT_ROUNDS = 12;

class AuthService {
  async register({ email, password, givenName, middleName, lastName, phone, role = 'landlord' }) {
    const id = generateUUID();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [existingUser] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (existingUser.length > 0) {
      throw new Error('Email already registered');
    }

    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, given_name, middle_name, last_name, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email.toLowerCase(), passwordHash, role, givenName, middleName || null, lastName, phone || null]
    );

    return this.getUserById(id);
  }

  async login(email, password) {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );

    return this.sanitizeUser(user);
  }

  async getUserById(id) {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return null;
    }

    return this.sanitizeUser(users[0]);
  }

  async getUserByEmail(email) {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      return null;
    }

    return this.sanitizeUser(users[0]);
  }

  async updatePassword(userId, currentPassword, newPassword) {
    const [users] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const validPassword = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!validPassword) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
    );

    return true;
  }

  async createPasswordResetToken(email) {
    const user = await this.getUserByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return null;
    }

    const token = generateUUID();
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [generateUUID(), user.id, tokenHash, expiresAt]
    );

    return { token, userId: user.id };
  }

  async resetPassword(token, newPassword) {
    const [resets] = await pool.query(
      `SELECT pr.*, u.id as user_id
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.used_at IS NULL AND pr.expires_at > NOW()
       ORDER BY pr.created_at DESC
       LIMIT 10`
    );

    // Check token against all recent reset requests
    for (const reset of resets) {
      const validToken = await bcrypt.compare(token, reset.token_hash);
      if (validToken) {
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await pool.query(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [newPasswordHash, reset.user_id]
        );

        await pool.query(
          'UPDATE password_resets SET used_at = NOW() WHERE id = ?',
          [reset.id]
        );

        return true;
      }
    }

    throw new Error('Invalid or expired reset token');
  }

  async storeRefreshToken(userId, tokenHash, expiresAt) {
    const id = generateUUID();
    await pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [id, userId, tokenHash, expiresAt]
    );
    return id;
  }

  async revokeRefreshToken(tokenId) {
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?',
      [tokenId]
    );
  }

  async revokeAllUserTokens(userId) {
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [userId]
    );
  }

  sanitizeUser(user) {
    const { password_hash, ...sanitized } = user;
    return {
      id: sanitized.id,
      email: sanitized.email,
      role: sanitized.role,
      givenName: sanitized.given_name,
      middleName: sanitized.middle_name,
      lastName: sanitized.last_name,
      phone: sanitized.phone,
      profileImageUrl: sanitized.profile_image_url,
      isActive: sanitized.is_active,
      emailVerified: sanitized.email_verified,
      createdAt: sanitized.created_at,
      updatedAt: sanitized.updated_at,
      lastLoginAt: sanitized.last_login_at
    };
  }
}

module.exports = new AuthService();
