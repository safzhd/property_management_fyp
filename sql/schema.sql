-- =============================================
-- SAPHYROO HMO PROPERTY MANAGEMENT PLATFORM
-- Database Schema v1.0
-- MySQL / Aurora
-- =============================================

-- Create database
CREATE DATABASE IF NOT EXISTS property_management
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE property_management;

-- =============================================
-- CORE: USERS & AUTHENTICATION
-- =============================================

CREATE TABLE users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'landlord', 'tenant') NOT NULL,

    -- Personal details
    given_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    profile_image_url TEXT,

    -- Account status
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at DATETIME,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at DATETIME,

    INDEX idx_users_email (email),
    INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_refresh_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE password_resets (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_reset_user (user_id)
) ENGINE=InnoDB;

-- =============================================
-- PROPERTIES & ROOMS
-- =============================================

CREATE TABLE properties (
    id CHAR(36) PRIMARY KEY,
    landlord_id CHAR(36) NOT NULL,

    -- Basic info
    property_name VARCHAR(255),
    property_type ENUM('house', 'flat', 'hmo', 'other') NOT NULL,

    -- Address
    door_number VARCHAR(20),
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    county VARCHAR(100),
    postcode VARCHAR(10) NOT NULL,
    country VARCHAR(50) DEFAULT 'United Kingdom',

    -- HMO specific
    is_hmo BOOLEAN DEFAULT FALSE,
    hmo_licence_required BOOLEAN DEFAULT FALSE,
    hmo_licence_number VARCHAR(100),
    hmo_licence_expiry DATE,
    hmo_max_occupants INT,

    -- PRS Database (Renters' Rights Act 2025)
    prs_registered BOOLEAN DEFAULT FALSE,
    prs_registration_number VARCHAR(100),
    prs_registration_date DATE,

    -- Property details
    total_rooms INT DEFAULT 0,
    total_bathrooms INT DEFAULT 0,

    -- Status
    status ENUM('active', 'inactive', 'archived') DEFAULT 'active',

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (landlord_id) REFERENCES users(id),
    INDEX idx_properties_landlord (landlord_id),
    INDEX idx_properties_postcode (postcode),
    INDEX idx_properties_status (status)
) ENGINE=InnoDB;

CREATE TABLE rooms (
    id CHAR(36) PRIMARY KEY,
    property_id CHAR(36) NOT NULL,

    -- Room details
    room_name VARCHAR(100) NOT NULL,
    room_number INT,
    floor_level INT DEFAULT 0,

    -- Size (UK HMO requirements: >= 7.0 sqm for adults, 6.0 for children)
    room_size_sqm DECIMAL(6,2),
    max_occupancy INT DEFAULT 1,
    room_type ENUM('single', 'double', 'ensuite', 'studio', 'other'),

    -- Amenities (JSON)
    amenities JSON,

    -- Pricing
    rent_amount DECIMAL(10,2),
    bills_included BOOLEAN DEFAULT FALSE,
    deposit_amount DECIMAL(10,2),

    -- Status
    is_available BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_rooms_property (property_id),
    INDEX idx_rooms_available (is_available)
) ENGINE=InnoDB;

-- =============================================
-- TENANCIES
-- =============================================

CREATE TABLE tenancies (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    property_id CHAR(36) NOT NULL,
    room_id CHAR(36),

    -- Tenancy dates
    start_date DATE NOT NULL,
    end_date DATE,

    -- Tenancy type (Renters' Rights Act 2025)
    tenancy_type ENUM('periodic', 'fixed', 'statutory_periodic') DEFAULT 'periodic',
    notice_period_weeks INT DEFAULT 4,

    -- Lifecycle status
    lifecycle_status ENUM('pending', 'onboarding', 'active', 'notice', 'offboarding', 'ended', 'cancelled') DEFAULT 'pending',

    -- Notice tracking
    notice_served_date DATE,
    notice_served_by ENUM('landlord', 'tenant'),
    eviction_grounds VARCHAR(100),

    -- Financial
    rent_amount DECIMAL(10,2) NOT NULL,
    rent_frequency ENUM('weekly', 'fortnightly', 'monthly') DEFAULT 'monthly',
    rent_due_day INT DEFAULT 1,

    -- Deposit
    deposit_amount DECIMAL(10,2),
    deposit_scheme ENUM('DPS', 'MyDeposits', 'TDS', 'other'),
    deposit_reference VARCHAR(100),
    deposit_protected_date DATE,

    -- Renters' Rights Act 2025 compliance
    tenant_info_sheet_provided BOOLEAN DEFAULT FALSE,
    tenant_info_sheet_date DATE,
    how_to_rent_guide_provided BOOLEAN DEFAULT FALSE,

    -- Pet policy
    pet_request_received BOOLEAN DEFAULT FALSE,
    pet_request_decision ENUM('approved', 'denied', 'pending'),
    pet_request_reason TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES users(id),
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    INDEX idx_tenancies_tenant (tenant_id),
    INDEX idx_tenancies_property (property_id),
    INDEX idx_tenancies_room (room_id),
    INDEX idx_tenancies_status (lifecycle_status),
    INDEX idx_tenancies_dates (start_date, end_date)
) ENGINE=InnoDB;

-- =============================================
-- COMPLIANCE CERTIFICATES
-- =============================================

CREATE TABLE compliance_certificates (
    id CHAR(36) PRIMARY KEY,
    property_id CHAR(36) NOT NULL,

    -- Certificate type
    certificate_type ENUM(
        'gas_safety',
        'eicr',
        'epc',
        'hmo_licence',
        'fire_risk',
        'legionella',
        'smoke_co_alarm',
        'pat_testing',
        'asbestos',
        'other'
    ) NOT NULL,

    -- Certificate details
    certificate_number VARCHAR(100),
    issue_date DATE NOT NULL,
    expiry_date DATE,

    -- Contractor
    contractor_name VARCHAR(255),
    contractor_company VARCHAR(255),
    contractor_registration VARCHAR(100),
    contractor_phone VARCHAR(20),
    contractor_email VARCHAR(255),

    -- Cost tracking
    cost DECIMAL(10,2),

    -- Linked document
    document_id CHAR(36),

    -- Status
    status ENUM('valid', 'expiring_soon', 'expired') DEFAULT 'valid',

    -- Reminder settings
    reminder_days_before INT DEFAULT 30,
    reminder_sent BOOLEAN DEFAULT FALSE,

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_compliance_property (property_id),
    INDEX idx_compliance_type (certificate_type),
    INDEX idx_compliance_expiry (expiry_date),
    INDEX idx_compliance_status (status)
) ENGINE=InnoDB;

-- =============================================
-- MAINTENANCE REQUESTS
-- =============================================

CREATE TABLE maintenance_requests (
    id CHAR(36) PRIMARY KEY,
    property_id CHAR(36) NOT NULL,
    room_id CHAR(36),
    tenant_id CHAR(36),

    -- Request details
    category ENUM(
        'plumbing', 'electrical', 'heating', 'structural',
        'appliance', 'pest', 'damp_mould', 'security',
        'garden', 'cleaning', 'other'
    ) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,

    -- Priority & status
    priority ENUM('low', 'medium', 'high', 'urgent', 'emergency') DEFAULT 'medium',
    status ENUM(
        'open', 'acknowledged', 'scheduled', 'in_progress',
        'awaiting_parts', 'resolved', 'closed', 'cancelled'
    ) DEFAULT 'open',

    -- Dates
    reported_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_date DATETIME,
    scheduled_date DATE,
    resolved_date DATETIME,
    closed_date DATETIME,

    -- Response tracking (Awaab's Law)
    initial_response_hours INT,
    resolution_hours INT,

    -- Contractor
    contractor_name VARCHAR(255),
    contractor_phone VARCHAR(20),
    quoted_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),

    -- Notes
    landlord_notes TEXT,
    contractor_notes TEXT,
    tenant_feedback TEXT,
    tenant_rating TINYINT CHECK (tenant_rating BETWEEN 1 AND 5),

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (tenant_id) REFERENCES users(id),
    INDEX idx_maintenance_property (property_id),
    INDEX idx_maintenance_tenant (tenant_id),
    INDEX idx_maintenance_status (status),
    INDEX idx_maintenance_priority (priority)
) ENGINE=InnoDB;

-- =============================================
-- PAYMENTS
-- =============================================

CREATE TABLE payments (
    id CHAR(36) PRIMARY KEY,
    tenancy_id CHAR(36) NOT NULL,
    paid_by_user_id CHAR(36),

    -- Payment details
    amount DECIMAL(10,2) NOT NULL,
    payment_type ENUM('rent', 'deposit', 'fee', 'arrears', 'other') NOT NULL,

    -- Dates
    due_date DATE NOT NULL,
    payment_date DATE,

    -- Method & status
    payment_method ENUM('bank_transfer', 'standing_order', 'card', 'cash', 'cheque', 'other'),
    payment_status ENUM('pending', 'paid', 'partial', 'late', 'failed', 'refunded') DEFAULT 'pending',

    -- Reference
    reference VARCHAR(100),
    transaction_id VARCHAR(100),

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tenancy_id) REFERENCES tenancies(id),
    FOREIGN KEY (paid_by_user_id) REFERENCES users(id),
    INDEX idx_payments_tenancy (tenancy_id),
    INDEX idx_payments_due_date (due_date),
    INDEX idx_payments_status (payment_status)
) ENGINE=InnoDB;

-- =============================================
-- DOCUMENTS
-- =============================================

CREATE TABLE documents (
    id CHAR(36) PRIMARY KEY,

    -- Associations
    property_id CHAR(36),
    tenancy_id CHAR(36),
    compliance_certificate_id CHAR(36),
    maintenance_request_id CHAR(36),

    -- Upload info
    uploaded_by CHAR(36) NOT NULL,

    -- File details
    file_name VARCHAR(255) NOT NULL,
    document_type ENUM(
        'tenancy_agreement', 'tenant_info_sheet', 'how_to_rent_guide',
        'inventory', 'checkout_report', 'reference',
        'gas_certificate', 'eicr_certificate', 'epc_certificate',
        'hmo_licence', 'fire_risk_assessment',
        'id_document', 'proof_of_address', 'deposit_protection',
        'invoice', 'receipt', 'quote',
        'photo', 'other'
    ) NOT NULL,

    -- Storage
    storage_path TEXT NOT NULL,
    file_size INT,
    mime_type VARCHAR(100),
    description TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (tenancy_id) REFERENCES tenancies(id),
    FOREIGN KEY (uploaded_by) REFERENCES users(id),
    INDEX idx_documents_property (property_id),
    INDEX idx_documents_tenancy (tenancy_id)
) ENGINE=InnoDB;

-- Add foreign key for compliance_certificates.document_id
ALTER TABLE compliance_certificates
ADD CONSTRAINT fk_certificate_document
FOREIGN KEY (document_id) REFERENCES documents(id);

-- =============================================
-- NOTIFICATIONS
-- =============================================

CREATE TABLE notifications (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,

    -- Notification content
    type ENUM(
        'payment_due', 'payment_received', 'payment_overdue',
        'maintenance_new', 'maintenance_update', 'maintenance_resolved',
        'compliance_expiring', 'compliance_expired',
        'tenancy_ending', 'tenancy_started',
        'document_uploaded', 'message', 'system'
    ) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',

    -- Related entities (generic)
    related_entity_type ENUM('property', 'tenancy', 'payment', 'maintenance', 'compliance', 'document'),
    related_entity_id CHAR(36),

    -- Status
    read_at DATETIME,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notifications_user (user_id),
    INDEX idx_notifications_read (read_at),
    INDEX idx_notifications_type (type)
) ENGINE=InnoDB;

-- =============================================
-- AUDIT LOG (GDPR & Ombudsman compliance)
-- =============================================

CREATE TABLE audit_log (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),

    -- Action details
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id CHAR(36),

    -- Change tracking
    old_values JSON,
    new_values JSON,

    -- Request context
    ip_address VARCHAR(45),
    user_agent TEXT,

    -- Timestamp
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;
