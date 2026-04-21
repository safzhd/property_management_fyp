-- =============================================
-- MIGRATION 002: Schema Improvements
-- Date: 13 Apr 2026
-- Changes:
--   1. Add bathroom_type enum to rooms (ensuite/shared/private)
--   2. Keep tenancy lifecycle_status as-is (current terms work)
--   3. Add deposit_paid_date and deposit_returned_date to tenancies
--   4. Add deposit tracking fields to payments
-- =============================================

USE property_management;

-- =============================================
-- 1. ROOMS: Add bathroom_type field (industry standard)
-- =============================================
-- ensuite = bathroom in the room
-- shared = shared with other tenants
-- private = exclusive use but not in room
ALTER TABLE rooms
ADD COLUMN bathroom_type ENUM('ensuite', 'shared', 'private') DEFAULT 'shared' AFTER room_type;

-- Update existing rooms: if room_type is 'ensuite', set bathroom_type to ensuite
UPDATE rooms SET bathroom_type = 'ensuite' WHERE room_type = 'ensuite';

-- =============================================
-- 2. TENANCIES: Add deposit date fields
-- =============================================
ALTER TABLE tenancies
ADD COLUMN deposit_paid_date DATE AFTER deposit_protected_date,
ADD COLUMN deposit_returned_date DATE AFTER deposit_paid_date,
ADD COLUMN deposit_returned_amount DECIMAL(10,2) AFTER deposit_returned_date;

-- =============================================
-- 3. COMPLIANCE: Add index for document_id (already exists in schema)
-- =============================================
-- document_id CHAR(36) already in compliance_certificates
-- Adding index for faster lookups
CREATE INDEX idx_compliance_document ON compliance_certificates(document_id);

-- =============================================
-- 4. PAYMENTS: Add deposit tracking fields
-- =============================================
ALTER TABLE payments
ADD COLUMN deposit_scheme ENUM('DPS', 'MyDeposits', 'TDS', 'other') AFTER payment_method,
ADD COLUMN deposit_certificate_number VARCHAR(100) AFTER deposit_scheme;

-- =============================================
-- VERIFICATION
-- =============================================
DESCRIBE rooms;
DESCRIBE tenancies;
DESCRIBE payments;

SELECT 'Migration 002 completed successfully' AS status;
