# Technical Architecture

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Fastify (chosen over Express for performance)
- **Database**: MySQL / AWS Aurora (Saphyroo standard)
- **Authentication**: JWT with refresh tokens
- **Validation**: Zod schemas

### Frontend (Planned)
- **Framework**: React
- **Responsive**: Mobile-first design
- **State**: TBD (React Query likely for server state)

### Infrastructure (Production)
- **Database**: AWS Aurora MySQL-compatible
- **Storage**: AWS S3 for documents
- **Email**: AWS SES for notifications

## Project Structure

```
property-management-app-v2/
├── .context/                    # Project memory files
│   ├── PRODUCT.md              # Product context
│   ├── UK_COMPLIANCE.md        # Compliance requirements
│   ├── TECHNICAL.md            # This file
│   └── FEATURES.md             # Feature specifications
├── sql/
│   └── schema.sql              # MySQL database schema
├── src/
│   ├── config/
│   │   └── database.js         # MySQL connection pool
│   ├── routes/
│   │   ├── auth.js             # Authentication endpoints
│   │   ├── users.js            # User management
│   │   ├── properties.js       # Property CRUD
│   │   ├── rooms.js            # Room CRUD (HMO-specific)
│   │   ├── tenancies.js        # Tenancy lifecycle
│   │   ├── maintenance.js      # Maintenance requests
│   │   ├── compliance.js       # Compliance certificates
│   │   ├── payments.js         # Rent & payments
│   │   ├── documents.js        # Document storage
│   │   └── notifications.js    # In-app notifications
│   ├── services/
│   │   ├── authService.js      # Auth business logic
│   │   └── propertyService.js  # Property business logic
│   ├── utils/
│   │   └── uuid.js             # UUID generation
│   └── server.js               # Fastify server setup
├── .env.example                # Environment variables template
└── package.json                # Dependencies
```

## Database Schema

### Core Tables
1. **users** - All user accounts (landlord, tenant, admin)
2. **properties** - HMO properties with compliance fields
3. **rooms** - Individual rooms within HMOs
4. **tenancies** - Tenant-room assignments with lifecycle
5. **payments** - Rent payments and tracking
6. **maintenance_requests** - Repair requests
7. **compliance_certificates** - Compliance documents
8. **documents** - File metadata
9. **notifications** - In-app notifications
10. **audit_log** - Action tracking

### Key Relationships
- Property → Rooms (1:many)
- Room → Tenancies (1:many over time)
- Tenancy → Payments (1:many)
- Property → Compliance Certificates (1:many)
- All entities → Documents (polymorphic)

## Authentication System

### JWT Structure
- Access token: 15 minutes expiry
- Refresh token: 7 days expiry, stored in DB

### Roles
- **admin**: Full system access
- **landlord**: Own properties, rooms, tenants
- **tenant**: Own tenancy, payments, maintenance requests

### Auth Endpoints
- `POST /api/auth/register` - New user registration
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/me` - Current user profile
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Invalidate refresh token
- `POST /api/auth/forgot-password` - Request reset
- `POST /api/auth/reset-password` - Complete reset
- `PATCH /api/auth/change-password` - Authenticated change

## Tenancy Lifecycle

```
pending → onboarding → active → notice → offboarding → ended
                                    ↓
                               cancelled
```

### States
- **pending**: Application received, not yet approved
- **onboarding**: Approved, completing move-in tasks
- **active**: Tenant in residence
- **notice**: Notice period (either party)
- **offboarding**: Completing move-out tasks
- **ended**: Tenancy complete
- **cancelled**: Tenancy cancelled before activation

### Lifecycle Rules
- Can only transition forward (except to cancelled)
- Dates tracked: start_date, actual_move_in, notice_date, notice_end_date, actual_move_out

## Compliance Tracking

### Certificate Types
- `gas_safety` - CP12 (annual)
- `eicr` - Electrical (5 years)
- `epc` - Energy (10 years)
- `hmo_licence` - HMO Licence (5 years)
- `fire_risk` - Fire Assessment (annual)
- `legionella` - Water Risk (2 years)
- `smoke_co_alarm` - Alarms (annual)
- `pat_testing` - Appliances (annual)
- `asbestos` - Survey (no expiry)

### Status Calculation
- **valid**: expiry_date > today + reminder_days
- **expiring_soon**: expiry_date within reminder_days
- **expired**: expiry_date < today

## API Conventions

### Response Format
```json
{
  "entity": { ... },
  "message": "Operation successful"
}
```

### Error Format
```json
{
  "error": "Error type",
  "message": "Human readable message",
  "details": [] // For validation errors
}
```

### HTTP Status Codes
- 200: Success
- 201: Created
- 400: Bad Request (validation)
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=property_management
DB_USER=root
DB_PASSWORD=

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Server
PORT=3000
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

## Running the Application

```bash
# Install dependencies
npm install

# Set up MySQL database
mysql -u root -p < sql/schema.sql

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start development server
npm run dev

# Production
npm start
```

## Testing Strategy (Planned)
- Unit tests: Vitest for service functions
- Integration tests: Supertest for API routes
- E2E tests: Playwright for frontend flows
