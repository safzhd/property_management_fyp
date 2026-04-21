export type TransactionType = 'income' | 'expense'

export type TransactionCategory =
  | 'rent'
  | 'deposit'
  | 'other_income'
  | 'council_tax'
  | 'utility_gas'
  | 'utility_electricity'
  | 'utility_water'
  | 'utility_internet'
  | 'insurance'
  | 'repairs_maintenance'
  | 'letting_agent_fees'
  | 'mortgage_interest'
  | 'ground_rent_service_charge'
  | 'professional_fees'
  | 'travel'
  | 'other_expense'

export type TransactionStatus =
  | 'pending'
  | 'paid'
  | 'partial'
  | 'late'
  | 'failed'
  | 'refunded'
  | 'reconciled'

export type PaymentMethod =
  | 'bank_transfer'
  | 'standing_order'
  | 'card'
  | 'cash'
  | 'cheque'
  | 'other'

export interface Transaction {
  id: string
  propertyId: string
  tenancyId:  string | null
  roomId:     string | null
  type:       TransactionType
  category:   TransactionCategory
  amount:     number
  date:       string
  description: string | null
  supplier:    string | null
  reference:   string | null
  paymentMethod: PaymentMethod | null
  status:      TransactionStatus
  isOverdue:   boolean
  notes:       string | null
  property?:   string
  roomName?:   string
  tenant?:     string
  createdAt:   string
  updatedAt:   string
}

export interface TransactionSummary {
  total_income:   number
  total_expenses: number
  net_profit:     number
  outstanding:    number
}

export interface PropertyPnL {
  property_id:   string
  property_name: string
  income:        number
  expenses:      number
  net_profit:    number
}

export interface CreateTransactionPayload {
  propertyId:    string
  tenancyId?:    string
  roomId?:       string
  type:          TransactionType
  category:      TransactionCategory
  amount:        number
  date:          string
  description?:  string
  supplier?:     string
  reference?:    string
  paymentMethod?: PaymentMethod
  status?:       TransactionStatus
  notes?:        string
}

export const INCOME_CATEGORIES: { value: TransactionCategory; label: string }[] = [
  { value: 'rent',         label: 'Rent' },
  { value: 'deposit',      label: 'Deposit' },
  { value: 'other_income', label: 'Other Income' },
]

export const EXPENSE_CATEGORIES: { value: TransactionCategory; label: string }[] = [
  { value: 'council_tax',               label: 'Council Tax' },
  { value: 'utility_gas',               label: 'Gas' },
  { value: 'utility_electricity',        label: 'Electricity' },
  { value: 'utility_water',             label: 'Water' },
  { value: 'utility_internet',          label: 'Internet' },
  { value: 'insurance',                 label: 'Insurance' },
  { value: 'repairs_maintenance',       label: 'Repairs & Maintenance' },
  { value: 'letting_agent_fees',        label: 'Letting Agent Fees' },
  { value: 'mortgage_interest',         label: 'Mortgage Interest' },
  { value: 'ground_rent_service_charge', label: 'Ground Rent / Service Charge' },
  { value: 'professional_fees',         label: 'Professional Fees' },
  { value: 'travel',                    label: 'Travel' },
  { value: 'other_expense',             label: 'Other Expense' },
]

export const ALL_CATEGORY_LABELS: Record<TransactionCategory, string> = {
  rent:                      'Rent',
  deposit:                   'Deposit',
  other_income:              'Other Income',
  council_tax:               'Council Tax',
  utility_gas:               'Gas',
  utility_electricity:       'Electricity',
  utility_water:             'Water',
  utility_internet:          'Internet',
  insurance:                 'Insurance',
  repairs_maintenance:       'Repairs & Maintenance',
  letting_agent_fees:        'Letting Agent Fees',
  mortgage_interest:         'Mortgage Interest',
  ground_rent_service_charge:'Ground Rent / Service Charge',
  professional_fees:         'Professional Fees',
  travel:                    'Travel',
  other_expense:             'Other Expense',
}
