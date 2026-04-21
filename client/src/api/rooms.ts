import { api } from '@/lib/axios'

export interface Room {
  id: string
  propertyId: string
  propertyName?: string
  roomName: string | null
  roomNumber: number | null
  floorLevel: number
  roomSizeSqm: number | null
  maxOccupancy: number
  roomType: 'single' | 'double' | 'studio' | 'other' | null
  bathroomType: 'ensuite' | 'shared' | 'private'
  amenities: string[]
  rentAmount: number | null
  billsIncluded: boolean
  depositAmount: number | null
  isAvailable: boolean
  isFurnished: boolean
  createdAt: string
  updatedAt: string
}

export async function getRooms(params?: {
  propertyId?: string
  isAvailable?: boolean
}): Promise<Room[]> {
  const { data } = await api.get<{ rooms: Room[] }>('/rooms', { params })
  return data.rooms
}
