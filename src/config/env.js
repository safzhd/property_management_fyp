/**
 * Environment Configuration & Validation
 * Fail fast if required environment variables are missing
 */

const requiredVars = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'JWT_SECRET'
];

const optionalVars = {
  PORT: '3000',
  NODE_ENV: 'development',
  DB_PORT: '3306',
  DB_PASSWORD: '',
  JWT_EXPIRES_IN: '7d',
  JWT_REFRESH_EXPIRES_IN: '30d',
  FRONTEND_URL: 'http://localhost:5173',
  MAX_FILE_SIZE: '10485760',
  UPLOAD_DIR: './uploads'
};

function validateEnv() {
  const missing = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nCopy .env.example to .env and configure all required values.\n');
    process.exit(1);
  }

  // Set defaults for optional vars
  for (const [varName, defaultValue] of Object.entries(optionalVars)) {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
    }
  }

  // Validate JWT_SECRET is not the default/weak value
  if (process.env.JWT_SECRET.length < 32) {
    console.error('\n❌ JWT_SECRET must be at least 32 characters long for security.\n');
    process.exit(1);
  }

  // Warn about production settings
  if (process.env.NODE_ENV === 'production') {
    if (process.env.FRONTEND_URL === 'http://localhost:5173') {
      console.warn('⚠️  Warning: FRONTEND_URL is set to localhost in production');
    }
  }
}

const config = {
  get port() { return parseInt(process.env.PORT, 10); },
  get nodeEnv() { return process.env.NODE_ENV; },
  get isProduction() { return process.env.NODE_ENV === 'production'; },
  get isDevelopment() { return process.env.NODE_ENV === 'development'; },

  db: {
    get host() { return process.env.DB_HOST; },
    get port() { return parseInt(process.env.DB_PORT, 10); },
    get name() { return process.env.DB_NAME; },
    get user() { return process.env.DB_USER; },
    get password() { return process.env.DB_PASSWORD; }
  },

  jwt: {
    get secret() { return process.env.JWT_SECRET; },
    get expiresIn() { return process.env.JWT_EXPIRES_IN; },
    get refreshExpiresIn() { return process.env.JWT_REFRESH_EXPIRES_IN; }
  },

  get frontendUrl() { return process.env.FRONTEND_URL; },
  get maxFileSize() { return parseInt(process.env.MAX_FILE_SIZE, 10); },
  get uploadDir() { return process.env.UPLOAD_DIR; }
};

module.exports = { validateEnv, config };
