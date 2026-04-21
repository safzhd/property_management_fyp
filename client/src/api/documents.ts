import { api } from '@/lib/axios'

export type DocumentType =
  | 'hmo_licence'
  | 'gas_certificate'
  | 'eicr_certificate'
  | 'epc_certificate'
  | 'fire_risk_assessment'
  | 'tenancy_agreement'
  | 'inventory'
  | 'deposit_protection'
  | 'how_to_rent_guide'
  | 'tenant_info_sheet'
  | 'id_document'
  | 'reference'
  | 'invoice'
  | 'receipt'
  | 'photo'
  | 'other'

export interface Document {
  id: string
  propertyId: string | null
  roomId: string | null
  tenancyId: string | null
  documentType: DocumentType
  fileName: string
  fileSize: number
  mimeType: string
  storagePath: string
  description: string | null
  uploadedBy: string
  createdAt: string
  updatedAt: string
}

export async function getPropertyDocuments(propertyId: string): Promise<Document[]> {
  const { data } = await api.get<{ documents: Document[] }>(`/documents/property/${propertyId}`)
  return data.documents
}

export async function uploadDocument(
  propertyId: string,
  file: File,
  documentType: DocumentType,
  description?: string,
  roomId?: string
): Promise<Document> {
  const form = new FormData()
  form.append('file', file)
  form.append('propertyId', propertyId)
  form.append('documentType', documentType)
  if (description) form.append('description', description)
  if (roomId) form.append('roomId', roomId)

  const { data } = await api.post<{ document: Document }>('/documents/upload', form)
  return data.document
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/documents/${id}`)
}

export function getFileUrl(id: string): string {
  return `/api/documents/file/${id}`
}
