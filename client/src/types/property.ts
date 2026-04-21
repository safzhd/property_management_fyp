export type PropertyType = 'house' | 'flat' | 'hmo' | 'other'
export type PropertyStatus = 'active' | 'inactive' | 'archived'

export interface Property {
  id: string
  landlordId: string

  // Basic
  propertyName: string | null
  propertyType: PropertyType
  status: PropertyStatus

  // Address
  doorNumber: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  county: string | null
  postcode: string
  country: string

  // HMO
  isHmo: boolean
  hmoLicenceRequired: boolean
  hmoLicenceNumber: string | null
  hmoLicenceExpiry: string | null
  hmoMaxOccupants: number | null

  // PRS
  prsRegistered: boolean
  prsRegistrationNumber: string | null
  prsRegistrationDate: string | null

  // Details
  totalRooms: number
  totalBathrooms: number
  roomCount: number
  photoCount: number

  createdAt: string
  updatedAt: string
}

export interface CreatePropertyRequest {
  propertyName?: string
  propertyType: PropertyType
  status?: PropertyStatus

  doorNumber?: string
  addressLine1: string
  addressLine2?: string
  city: string
  county?: string
  postcode: string
  country?: string

  isHmo?: boolean
  hmoLicenceRequired?: boolean
  hmoLicenceNumber?: string
  hmoLicenceExpiry?: string
  hmoMaxOccupants?: number

  prsRegistered?: boolean
  prsRegistrationNumber?: string
  prsRegistrationDate?: string

  totalRooms?: number
  totalBathrooms?: number
}

export type UpdatePropertyRequest = Partial<CreatePropertyRequest>
