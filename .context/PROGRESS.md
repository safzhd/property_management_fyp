# Development Progress

## Session History

### Session 1 - Initial Backend (Previous)
- Set up Fastify server with MySQL
- Created all route files: auth, users, properties, rooms, tenancies, maintenance, compliance, payments
- Created database schema with UK HMO compliance fields

### Session 2 - Completion & Hardening (13 Apr 2026)
#### Completed
1. **Created missing routes**
   - `src/routes/documents.js` - Document metadata storage
   - `src/routes/notifications.js` - In-app notification system

2. **Security fixes**
   - Fixed npm audit vulnerabilities (upgraded to Fastify 5.8.4, @fastify/jwt 10.0.0)
   - Removed JWT secret fallback - now requires proper secret
   - Added environment validation with fail-fast (`src/config/env.js`)

3. **Production hardening**
   - Added global error handler for Zod, Fastify, JWT, and DB errors
   - Added graceful shutdown on SIGTERM/SIGINT
   - Added request ID tracing for debugging
   - Health check now includes database status

4. **Schema fixes**
   - Fixed documents table: `document_name` → `file_name`, `file_path` → `storage_path`, added `description`
   - Fixed notifications table: updated type enum, added `priority`, `related_entity_type/id`

5. **Full lifecycle test completed**
   - Created property: 106 London Road, RH1 2JJ
   - Created 6 rooms with rent £500-£600
   - Tested full tenant lifecycle: pending → onboarding → active → notice → offboarding → ended
   - Verified room availability updates correctly
   - Tested maintenance, payments, compliance workflows

6. **Schema improvements (Migration 002)**
   - Added `bathroom_type` ENUM to rooms: 'ensuite', 'shared', 'private'
   - Added deposit date fields to tenancies: `deposit_paid_date`, `deposit_returned_date`, `deposit_returned_amount`
   - Added deposit tracking to payments: `deposit_scheme`, `deposit_certificate_number`
   - Updated all routes to support new fields

#### In Progress
- **React Frontend** - Building responsive UI

#### Pending
- Finalise product name (Saphyroo guidelines)
- E2E testing
- Documentation

## Test Data in Database

### Property
- ID: d15a35b5-f32a-48dd-8580-499d8682962b
- Address: 106 London Road, RH1 2JJ
- Type: HMO
- 6 rooms

### Rooms (106 London Road)
| Room | Rent | Size | Type | Bathroom |
|------|------|------|------|----------|
| Room 1 | £500 | 10 sqm | Double | Shared |
| Room 2 | £500 | 10 sqm | Double | Shared |
| Room 3 | £520 | 11 sqm | Double | Shared |
| Room 4 | £550 | 12 sqm | Double | Ensuite |
| Room 5 | £570 | 11 sqm | Double | Shared |
| Room 6 | £580 | 13 sqm | Double | Ensuite |

### Test User
- Email: john.smith@tenant.com
- Role: Tenant
- Lifecycle completed: pending → ended (former)

## Known Issues
- None currently - all identified issues have been fixed

## Important Notes
- **NEVER drop or delete database/files without explicit user permission**
- Save context regularly to prevent loss
- Server runs on port 3000, frontend will be on 5173

## Migration Files
- `sql/migrations/002_schema_improvements.sql` - bathroom_type, deposit dates
