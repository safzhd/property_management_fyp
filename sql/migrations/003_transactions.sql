-- =============================================
-- MIGRATION 003: Replace payments with transactions
-- Covers rent, bills, utilities, council tax, all expenses
-- Categories aligned to HMRC allowable expense categories
-- =============================================

-- ── 1. Create transactions table ─────────────────────────────────────────────

CREATE TABLE transactions (
    id CHAR(36) PRIMARY KEY,

    -- Associations
    property_id CHAR(36) NOT NULL,
    tenancy_id  CHAR(36),
    room_id     CHAR(36),

    -- Type & category
    type ENUM(
        'income',
        'expense'
    ) NOT NULL,

    category ENUM(
        -- Income
        'rent',
        'deposit',
        'other_income',
        -- Expenses (HMRC allowable)
        'council_tax',
        'utility_gas',
        'utility_electricity',
        'utility_water',
        'utility_internet',
        'insurance',
        'repairs_maintenance',
        'letting_agent_fees',
        'mortgage_interest',
        'ground_rent_service_charge',
        'professional_fees',
        'travel',
        'other_expense'
    ) NOT NULL,

    -- Amount & date
    amount      DECIMAL(10,2) NOT NULL,
    date        DATE NOT NULL,

    -- Details
    description VARCHAR(255),
    supplier    VARCHAR(255),   -- who was paid (utility company, contractor, etc.)
    reference   VARCHAR(100),   -- invoice / receipt number

    -- Who paid (for income: the tenant; for expenses: landlord by default)
    paid_by_user_id CHAR(36),

    -- Method & status
    payment_method  ENUM('bank_transfer', 'standing_order', 'card', 'cash', 'cheque', 'other'),
    status          ENUM('pending', 'paid', 'partial', 'late', 'failed', 'refunded', 'reconciled') DEFAULT 'pending',

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id)      REFERENCES properties(id),
    FOREIGN KEY (tenancy_id)       REFERENCES tenancies(id),
    FOREIGN KEY (room_id)          REFERENCES rooms(id),
    FOREIGN KEY (paid_by_user_id)  REFERENCES users(id),

    INDEX idx_transactions_property  (property_id),
    INDEX idx_transactions_tenancy   (tenancy_id),
    INDEX idx_transactions_type      (type),
    INDEX idx_transactions_category  (category),
    INDEX idx_transactions_date      (date),
    INDEX idx_transactions_status    (status)
) ENGINE=InnoDB;


-- ── 2. Migrate existing payments into transactions ────────────────────────────

INSERT INTO transactions (
    id,
    property_id,
    tenancy_id,
    room_id,
    type,
    category,
    amount,
    date,
    description,
    reference,
    paid_by_user_id,
    payment_method,
    status,
    notes,
    created_at,
    updated_at
)
SELECT
    p.id,
    t.property_id,
    p.tenancy_id,
    t.room_id,
    'income' AS type,
    CASE p.payment_type
        WHEN 'rent'     THEN 'rent'
        WHEN 'deposit'  THEN 'deposit'
        WHEN 'fee'      THEN 'letting_agent_fees'
        WHEN 'arrears'  THEN 'rent'
        ELSE 'other_income'
    END AS category,
    p.amount,
    COALESCE(p.payment_date, p.due_date) AS date,
    CONCAT(p.payment_type, ' payment') AS description,
    p.reference,
    p.paid_by_user_id,
    p.payment_method,
    CASE p.payment_status
        WHEN 'paid'     THEN 'paid'
        WHEN 'partial'  THEN 'partial'
        WHEN 'late'     THEN 'late'
        WHEN 'failed'   THEN 'failed'
        WHEN 'refunded' THEN 'refunded'
        ELSE 'pending'
    END AS status,
    p.notes,
    p.created_at,
    p.updated_at
FROM payments p
JOIN tenancies t ON t.id = p.tenancy_id;


-- ── 3. Drop old payments table ────────────────────────────────────────────────

DROP TABLE payments;
