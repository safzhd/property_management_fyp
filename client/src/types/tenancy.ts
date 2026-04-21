export type LifecycleStatus =
  | 'pending'
  | 'onboarding'
  | 'active'
  | 'notice'
  | 'offboarding'
  | 'ended'
  | 'cancelled'

export type TenancyType = 'periodic' | 'fixed' | 'statutory_periodic'
export type RentFrequency = 'weekly' | 'fortnightly' | 'monthly'
export type DepositScheme = 'DPS' | 'MyDeposits' | 'TDS' | 'other'

export interface TenantUser {
  id: string
  email: string
  givenName: string
  middleName: string | null
  lastName: string
  phone: string | null
  isActive: boolean
  createdAt: string
}

export interface Tenancy {
  id: string
  tenantId: string
  propertyId: string
  roomId: string | null
  tenant: { name: string; email: string }
  property: { name: string | null; address: string; postcode: string }
  roomName: string | null
  startDate: string
  endDate: string | null
  tenancyType: TenancyType
  noticePeriodWeeks: number
  lifecycleStatus: LifecycleStatus
  noticeServedDate: string | null
  noticeServedBy: 'landlord' | 'tenant' | null
  evictionGrounds: string | null
  rentAmount: number
  rentFrequency: RentFrequency
  rentDueDay: number
  depositAmount: number | null
  depositScheme: DepositScheme | null
  depositReference: string | null
  depositProtectedDate: string | null
  depositPaidDate: string | null
  depositReturnedDate: string | null
  depositReturnedAmount: number | null
  tenantInfoSheetProvided: boolean
  tenantInfoSheetDate: string | null
  howToRentGuideProvided: boolean
  petRequestReceived: boolean
  petRequestDecision: string | null
  petRequestReason: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTenancyPayload {
  tenantId: string
  propertyId: string
  roomId?: string
  startDate: string
  endDate?: string
  tenancyType: TenancyType
  noticePeriodWeeks: number
  rentAmount: number
  rentFrequency: RentFrequency
  rentDueDay: number
  depositAmount?: number
  depositScheme?: DepositScheme
  depositReference?: string
  depositPaidDate?: string
}

export interface CreateTenantPayload {
  givenName: string
  middleName?: string
  lastName: string
  email: string
  phone?: string
  password: string
}
