import { api } from '@/lib/axios'
import type { Property, CreatePropertyRequest, UpdatePropertyRequest } from '@/types/property'

export async function getProperties(params?: {
  status?: string
}): Promise<Property[]> {
  const { data } = await api.get<{ properties: Property[] }>('/properties', { params })
  return data.properties
}

export async function getProperty(id: string): Promise<Property> {
  const { data } = await api.get<{ property: Property }>(`/properties/${id}`)
  return data.property
}

export async function createProperty(body: CreatePropertyRequest): Promise<Property> {
  const { data } = await api.post<{ property: Property }>('/properties', body)
  return data.property
}

export async function updateProperty(id: string, body: UpdatePropertyRequest): Promise<Property> {
  const { data } = await api.patch<{ property: Property }>(`/properties/${id}`, body)
  return data.property
}

export async function deleteProperty(id: string): Promise<void> {
  await api.delete(`/properties/${id}`)
}
