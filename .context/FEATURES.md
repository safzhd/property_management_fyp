# Feature Specifications

## Module Overview

| Module | Status | Description |
|--------|--------|-------------|
| Authentication | ✅ Complete | JWT auth with RBAC |
| Users | ✅ Complete | User management |
| Properties | ✅ Complete | HMO property CRUD |
| Rooms | ✅ Complete | Room-level management |
| Tenancies | ✅ Complete | Lifecycle management |
| Maintenance | ✅ Complete | Request tracking |
| Compliance | ✅ Complete | Certificate tracking |
| Payments | ✅ Complete | Rent & payment tracking |
| Documents | ✅ Complete | File management |
| Notifications | ✅ Complete | In-app alerts |
| Frontend | ⏳ Pending | React responsive UI |

---

## 1. Authentication Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | New user registration |
| POST | /api/auth/login | Email/password login |
| GET | /api/auth/me | Current user profile |
| POST | /api/auth/refresh | Refresh access token |
| POST | /api/auth/logout | Logout (invalidate refresh) |
| POST | /api/auth/forgot-password | Request password reset |
| POST | /api/auth/reset-password | Complete password reset |
| PATCH | /api/auth/change-password | Change password (authed) |

### Features
- [x] JWT access tokens (15 min)
- [x] Refresh tokens (7 days)
- [x] Password hashing (bcrypt)
- [x] Role-based access control
- [x] Password reset flow
- [x] Token invalidation on logout

---

## 2. Properties Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/properties | List all properties |
| GET | /api/properties/:id | Get property details |
| POST | /api/properties | Create property |
| PATCH | /api/properties/:id | Update property |
| DELETE | /api/properties/:id | Delete property |
| GET | /api/properties/:id/dashboard | Property dashboard |

### Features
- [x] Full property CRUD
- [x] Landlord ownership enforcement
- [x] HMO-specific fields (licence, PRS registration)
- [x] Property dashboard with stats
- [x] Vacancy tracking
- [x] Address fields (UK format)

### Property Fields
- Basic: name, type (hmo_shared, hmo_bedsit, etc.)
- Address: line_1, line_2, city, county, postcode
- Stats: total_rooms, occupied_rooms, total_beds
- Financial: monthly_costs, annual_insurance
- Compliance: hmo_licence_number, prs_registered
- Dates: purchase_date, created_at, updated_at

---

## 3. Rooms Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/rooms | List rooms (filter by property) |
| GET | /api/rooms/:id | Get room details |
| POST | /api/rooms | Create room |
| PATCH | /api/rooms/:id | Update room |
| DELETE | /api/rooms/:id | Delete room |

### Features
- [x] Full room CRUD
- [x] Property relationship
- [x] Availability tracking
- [x] Amenities list (JSON)
- [x] UK room size requirements
- [x] Rent amount per room
- [x] Block delete if active tenancy

### Room Fields
- Identity: name, number, floor_level
- Size: room_size_sqm, max_occupancy
- Type: single, double, ensuite, studio, other
- Financial: rent_amount, bills_included, deposit_amount
- Amenities: JSON array (wifi, ensuite, furnished, etc.)
- Status: is_available

---

## 4. Tenancies Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tenancies | List tenancies |
| GET | /api/tenancies/:id | Get tenancy details |
| POST | /api/tenancies | Create tenancy |
| PATCH | /api/tenancies/:id | Update tenancy |
| PATCH | /api/tenancies/:id/lifecycle | Transition lifecycle |
| DELETE | /api/tenancies/:id | Delete tenancy |
| GET | /api/tenancies/:id/compliance-checklist | RRA 2025 checklist |

### Lifecycle States
```
pending → onboarding → active → notice → offboarding → ended
                                    ↘ cancelled
```

### Features
- [x] Full tenancy CRUD
- [x] Lifecycle state machine
- [x] Tenant assignment
- [x] Room assignment
- [x] Date tracking (all milestones)
- [x] Deposit protection tracking
- [x] Renters' Rights Act checklist
- [x] Multiple tenants per room support

### Tenancy Fields
- Links: property_id, room_id, tenant_id
- Dates: start_date, end_date, actual_move_in/out
- Financial: rent_amount, deposit_amount, payment_day
- Deposit: deposit_protected, deposit_scheme, deposit_certificate
- Compliance: tenant_info_sheet_sent, how_to_rent_sent

---

## 5. Maintenance Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/maintenance | List requests |
| GET | /api/maintenance/:id | Get request details |
| POST | /api/maintenance | Create request |
| PATCH | /api/maintenance/:id | Update request |
| POST | /api/maintenance/:id/feedback | Add tenant feedback |

### Request States
```
open → acknowledged → scheduled → in_progress → awaiting_parts → resolved → closed
                                                                              ↓
                                                                        cancelled
```

### Features
- [x] Tenant can create requests
- [x] Landlord manages workflow
- [x] Priority levels (emergency to low)
- [x] Category classification
- [x] Contractor tracking
- [x] Cost tracking (quoted vs actual)
- [x] Response time metrics
- [x] Tenant feedback/rating

### Categories
plumbing, electrical, heating, structural, appliance, pest, damp_mould, security, garden, cleaning, other

---

## 6. Compliance Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/compliance | List certificates |
| GET | /api/compliance/:id | Get certificate |
| POST | /api/compliance | Create certificate |
| PATCH | /api/compliance/:id | Update certificate |
| DELETE | /api/compliance/:id | Delete certificate |
| GET | /api/compliance/dashboard | Compliance dashboard |

### Certificate Types
| Type | Validity | Code |
|------|----------|------|
| Gas Safety (CP12) | 1 year | gas_safety |
| EICR | 5 years | eicr |
| EPC | 10 years | epc |
| HMO Licence | 5 years | hmo_licence |
| Fire Risk | 1 year | fire_risk |
| Legionella | 2 years | legionella |
| Smoke/CO Alarms | 1 year | smoke_co_alarm |
| PAT Testing | 1 year | pat_testing |
| Asbestos | No expiry | asbestos |

### Features
- [x] Certificate CRUD
- [x] Auto-calculate expiry from issue date
- [x] Status tracking (valid, expiring_soon, expired)
- [x] Configurable reminder days
- [x] Contractor details storage
- [x] Dashboard with upcoming/expired counts
- [x] Document linking

---

## 7. Payments Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/payments | List payments |
| GET | /api/payments/:id | Get payment |
| POST | /api/payments | Record payment |
| PATCH | /api/payments/:id | Update payment |
| DELETE | /api/payments/:id | Delete payment |
| GET | /api/payments/summary | Financial summary |
| POST | /api/payments/generate-rent | Generate rent schedules |

### Payment Types
- rent
- deposit
- deposit_return
- utility_bill
- maintenance_charge
- late_fee
- other

### Payment Methods
- bank_transfer, standing_order, direct_debit, cash, cheque, card, other

### Features
- [x] Payment CRUD
- [x] Tenancy linking
- [x] Overdue detection
- [x] Financial summary (totals, by month)
- [x] Rent schedule generation
- [x] Late payment tracking
- [x] Payment method recording

---

## 8. Documents Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/documents | List documents |
| GET | /api/documents/:id | Get document |
| POST | /api/documents | Create document record |
| PATCH | /api/documents/:id | Update metadata |
| DELETE | /api/documents/:id | Delete document |
| GET | /api/documents/property/:id | Property documents |
| GET | /api/documents/tenancy/:id | Tenancy documents |

### Document Types
- Tenancy: tenancy_agreement, inventory, tenant_info_sheet, deposit_protection, how_to_rent_guide
- Compliance: gas_certificate, eicr_certificate, epc_certificate, hmo_licence, fire_risk_assessment
- Other: id_document, reference, invoice, receipt, photo, other

### Features
- [x] Document metadata storage
- [x] Property/tenancy linking
- [x] Compliance certificate linking
- [x] Grouped retrieval
- [x] File type tracking
- [x] Uploader tracking

---

## 9. Notifications Module

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/notifications | List notifications |
| GET | /api/notifications/:id | Get notification |
| PATCH | /api/notifications/:id/read | Mark as read |
| PATCH | /api/notifications/read-all | Mark all as read |
| DELETE | /api/notifications/:id | Delete notification |
| GET | /api/notifications/unread-count | Get unread count |
| GET | /api/notifications/preferences | Get preferences |
| PATCH | /api/notifications/preferences | Update preferences |

### Notification Types
- Payment: payment_due, payment_received, payment_overdue
- Maintenance: maintenance_new, maintenance_update, maintenance_resolved
- Compliance: compliance_expiring, compliance_expired
- Tenancy: tenancy_ending, tenancy_started
- Other: document_uploaded, message, system

### Features
- [x] In-app notifications
- [x] Read/unread tracking
- [x] Bulk mark as read
- [x] Type filtering
- [x] User preferences
- [x] Priority levels
- [ ] Email notifications (infrastructure needed)

---

## 10. Frontend (Planned)

### Key Screens
- Dashboard (overview of all properties)
- Property list & detail
- Room management
- Tenancy timeline view
- Maintenance queue
- Compliance calendar
- Payment tracker
- Document library
- Settings

### Design Principles
- Mobile-first responsive
- Minimal, clean UI (Saphyroo style)
- Quick actions on dashboard
- Visual status indicators
- Calendar views for dates
- Table views with filters
