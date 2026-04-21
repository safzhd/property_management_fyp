const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'property_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL connection failed:', error.message);
    return false;
  }
}

module.exports = { pool, testConnection };
