# API Reference

Base URL: `http://localhost:3000/api`

## Authentication

All endpoints except `/auth/register`, `/auth/login`, `/auth/forgot-password`, and `/auth/reset-password` require Bearer token authentication.

```
Authorization: Bearer <access_token>
```

---

## Auth Routes `/api/auth`

### POST /register
Create a new user account.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "givenName": "John",
  "lastName": "Smith",
  "phone": "+447123456789",
  "role": "landlord"
}
```

**Response:** 201 Created
```json
{
  "message": "Registration successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "givenName": "John",
    "lastName": "Smith",
    "role": "landlord"
  },
  "accessToken": "jwt...",
  "refreshToken": "jwt..."
}
```

### POST /login
Authenticate user.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:** 200 OK
```json
{
  "accessToken": "jwt...",
  "refreshToken": "jwt...",
  "user": { ... }
}
```

### GET /me
Get current user profile. Requires auth.

### POST /refresh
Refresh access token.

**Body:**
```json
{
  "refreshToken": "jwt..."
}
```

### POST /logout
Invalidate refresh token. Requires auth.

---

## Properties `/api/properties`

### GET /
List all properties for authenticated landlord.

**Query params:**
- `type`: Filter by property type

### GET /:id
Get property by ID.

### POST /
Create new property. Requires landlord/admin role.

**Body:**
```json
{
  "propertyName": "123 High Street",
  "propertyType": "hmo_shared",
  "addressLine1": "123 High Street",
  "city": "London",
  "postcode": "E1 1AB",
  "totalRooms": 5,
  "totalBeds": 6
}
```

### PATCH /:id
Update property.

### DELETE /:id
Delete property. Fails if has active tenancies.

### GET /:id/dashboard
Get property dashboard with occupancy, compliance, and financial stats.

---

## Rooms `/api/rooms`

### GET /
List rooms. Filter by `propertyId` or `isAvailable`.

### GET /:id
Get room by ID.

### POST /
Create room. Requires landlord/admin.

**Body:**
```json
{
  "propertyId": "uuid",
  "roomName": "Room 1",
  "roomNumber": 1,
  "floorLevel": 0,
  "roomSizeSqm": 12.5,
  "maxOccupancy": 1,
  "roomType": "double",
  "amenities": ["ensuite", "furnished"],
  "rentAmount": 650,
  "billsIncluded": true,
  "depositAmount": 650,
  "isAvailable": true
}
```

### PATCH /:id
Update room.

### DELETE /:id
Delete room. Fails if has active tenancies.

---

## Tenancies `/api/tenancies`

### GET /
List tenancies. Filter by `propertyId`, `tenantId`, `status`.

### GET /:id
Get tenancy with full details.

### POST /
Create tenancy.

**Body:**
```json
{
  "propertyId": "uuid",
  "roomId": "uuid",
  "tenantId": "uuid",
  "startDate": "2024-01-01",
  "endDate": "2025-01-01",
  "rentAmount": 650,
  "paymentDay": 1,
  "depositAmount": 650
}
```

### PATCH /:id
Update tenancy fields.

### PATCH /:id/lifecycle
Transition tenancy lifecycle state.

**Body:**
```json
{
  "action": "activate",
  "actualMoveInDate": "2024-01-01"
}
```

**Actions:** `approve`, `activate`, `give_notice`, `start_offboarding`, `complete`, `cancel`

### GET /:id/compliance-checklist
Get Renters' Rights Act 2025 compliance checklist.

---

## Maintenance `/api/maintenance`

### GET /
List maintenance requests. Filter by `propertyId`, `status`, `priority`.

### GET /:id
Get request details.

### POST /
Create request.

**Body:**
```json
{
  "propertyId": "uuid",
  "roomId": "uuid",
  "category": "plumbing",
  "title": "Leaking tap",
  "description": "Kitchen tap is dripping constantly",
  "priority": "medium"
}
```

### PATCH /:id
Update request (landlord only).

**Body:**
```json
{
  "status": "scheduled",
  "scheduledDate": "2024-02-01",
  "contractorName": "ABC Plumbing",
  "quotedCost": 150
}
```

### POST /:id/feedback
Add tenant feedback (tenant only, after resolution).

**Body:**
```json
{
  "feedback": "Fixed quickly, very happy",
  "rating": 5
}
```

---

## Compliance `/api/compliance`

### GET /
List certificates. Filter by `propertyId`, `certificateType`, `status`.

### GET /dashboard
Get compliance summary: totals, upcoming expirations, expired certificates.

### GET /:id
Get certificate details.

### POST /
Create certificate.

**Body:**
```json
{
  "propertyId": "uuid",
  "certificateType": "gas_safety",
  "certificateNumber": "GAS-2024-001",
  "issueDate": "2024-01-15",
  "expiryDate": "2025-01-15",
  "contractorName": "John Gas",
  "contractorCompany": "Gas Safe Ltd",
  "contractorRegistration": "123456",
  "cost": 80,
  "reminderDaysBefore": 30
}
```

### PATCH /:id
Update certificate.

### DELETE /:id
Delete certificate.

---

## Payments `/api/payments`

### GET /
List payments. Filter by `tenancyId`, `status`, `type`, `startDate`, `endDate`.

### GET /summary
Get financial summary with totals and monthly breakdown.

### GET /:id
Get payment details.

### POST /
Record payment.

**Body:**
```json
{
  "tenancyId": "uuid",
  "paymentType": "rent",
  "amount": 650,
  "dueDate": "2024-02-01",
  "paidDate": "2024-02-01",
  "paymentMethod": "standing_order",
  "reference": "REF-001"
}
```

### PATCH /:id
Update payment.

### DELETE /:id
Delete payment (landlord only).

### POST /generate-rent
Generate rent payment schedules.

**Body:**
```json
{
  "tenancyId": "uuid",
  "startMonth": "2024-01",
  "numberOfMonths": 12
}
```

---

## Documents `/api/documents`

### GET /
List documents. Filter by `propertyId`, `tenancyId`, `documentType`.

### GET /:id
Get document details.

### POST /
Create document record (after file upload to storage).

**Body:**
```json
{
  "propertyId": "uuid",
  "tenancyId": "uuid",
  "documentType": "tenancy_agreement",
  "fileName": "agreement.pdf",
  "fileSize": 245678,
  "mimeType": "application/pdf",
  "storagePath": "s3://bucket/path/agreement.pdf",
  "description": "Signed tenancy agreement"
}
```

### PATCH /:id
Update document metadata.

### DELETE /:id
Delete document record.

### GET /property/:propertyId
Get all documents for a property, grouped by type.

### GET /tenancy/:tenancyId
Get all documents for a tenancy.

---

## Notifications `/api/notifications`

### GET /
List notifications. Query: `unreadOnly`, `type`, `limit`.

### GET /unread-count
Get count of unread notifications.

### GET /preferences
Get notification preferences.

### GET /:id
Get notification details.

### PATCH /:id/read
Mark notification as read.

### PATCH /read-all
Mark all notifications as read.

### PATCH /preferences
Update notification preferences.

### DELETE /:id
Delete notification.

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": ["email"],
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Property not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to fetch properties"
}
```
