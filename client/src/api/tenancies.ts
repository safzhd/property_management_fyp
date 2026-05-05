import { api } from '@/lib/axios'
import type { Tenancy, CreateTenancyPayload, TenantUser, CreateTenantPayload } from '@/types/tenancy'

// ── Tenancies ─────────────────────────────────────────────────────────────────

export async function getTenancies(params?: {
  propertyId?: string
  tenantId?: string
  lifecycleStatus?: string
}): Promise<Tenancy[]> {
  const { data } = await api.get<{ tenancies: Tenancy[] }>('/tenancies', { params })
  return data.tenancies
}

export async function getTenancy(id: string): Promise<Tenancy> {
  const { data } = await api.get<{ tenancy: Tenancy }>(`/tenancies/${id}`)
  return data.tenancy
}

export async function createTenancy(payload: CreateTenancyPayload): Promise<Tenancy> {
  const { data } = await api.post<{ tenancy: Tenancy }>('/tenancies', payload)
  return data.tenancy
}

export async function updateTenancy(id: string, payload: Partial<CreateTenancyPayload>): Promise<Tenancy> {
  const { data } = await api.patch<{ tenancy: Tenancy }>(`/tenancies/${id}`, payload)
  return data.tenancy
}

export async function transitionTenancy(
  id: string,
  status: string,
  extra?: { noticeServedBy?: string; evictionGrounds?: string; noticeServedDate?: string }
): Promise<Tenancy> {
  const { data } = await api.post<{ tenancy: Tenancy }>(`/tenancies/${id}/transition`, {
    status,
    ...extra,
  })
  return data.tenancy
}

export async function updateTenancyCompliance(
  id: string,
  payload: {
    tenantInfoSheetProvided?: boolean
    howToRentGuideProvided?: boolean
    depositProtectedDate?: string | null
  }
): Promise<void> {
  await api.post(`/tenancies/${id}/compliance`, payload)
}

// ── Tenant users ──────────────────────────────────────────────────────────────

export async function getTenantUsers(): Promise<TenantUser[]> {
  const { data } = await api.get<{ tenants: TenantUser[] }>('/users/tenants')
  return data.tenants
}

export async function createTenantUser(payload: CreateTenantPayload): Promise<TenantUser> {
  const { data } = await api.post<{ user: TenantUser }>('/users', payload)
  return data.user
}

export async function deleteTenancy(id: string): Promise<void> {
  await api.delete(`/tenancies/${id}`)
}
