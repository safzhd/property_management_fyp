import { api } from '@/lib/axios'

export type InspectionType = 'fire_alarm' | 'communal_area' | 'cleaning' | 'garden_exterior' | 'full_property' | 'hmo_compliance' | 'fire_co_alarm' | 'property_condition'
export type InspectionResult = 'pass' | 'fail' | 'issues_noted'
export type ItemResult = 'pass' | 'fail'
export type ComplianceStatus = 'ok' | 'due' | 'overdue'

export interface Inspection {
  id: string
  propertyId: string
  propertyName: string
  type: InspectionType
  inspectorName: string
  inspectionDate: string
  overallResult: InspectionResult
  notes: string | null
  failCount?: number
  createdAt: string
}

export interface InspectionItem {
  id: string
  itemLabel: string
  result: ItemResult
  notes: string | null
}

export interface InspectionDetail extends Inspection {
  items: InspectionItem[]
  photos: { id: string; fileName: string; url: string }[]
}

export interface TypeStatus {
  status: ComplianceStatus
  lastDate: string | null
  nextDue: string | null
}

export interface PropertyInspectionStatus {
  propertyId: string
  propertyName: string
  isHmo: boolean
  types: Record<InspectionType, TypeStatus>
}

// Types that apply to HMO properties only
export const HMO_TYPES: InspectionType[] = ['fire_alarm', 'communal_area', 'cleaning', 'garden_exterior', 'full_property', 'hmo_compliance']

// Types that apply to non-HMO (single let) properties
export const NON_HMO_TYPES: InspectionType[] = ['fire_co_alarm', 'property_condition', 'garden_exterior', 'full_property']

export function getTypesForProperty(isHmo: boolean): InspectionType[] {
  return isHmo ? HMO_TYPES : NON_HMO_TYPES
}

export const TYPE_LABELS: Record<InspectionType, string> = {
  fire_alarm:         'Fire Alarm',
  communal_area:      'Communal Areas',
  cleaning:           'Cleaning',
  garden_exterior:    'Garden & Exterior',
  full_property:      'Full Property',
  hmo_compliance:     'HMO Compliance',
  fire_co_alarm:      'Fire & CO Alarm',
  property_condition: 'Property Condition',
}

export const FREQUENCIES: Record<InspectionType, number> = {
  fire_alarm:         7,
  communal_area:      7,
  cleaning:           7,
  garden_exterior:    14,
  full_property:      90,
  hmo_compliance:     365,
  fire_co_alarm:      30,
  property_condition: 90,
}

export const FREQ_LABELS: Record<InspectionType, string> = {
  fire_alarm:         'Weekly',
  communal_area:      'Weekly',
  cleaning:           'Weekly',
  garden_exterior:    'Fortnightly',
  full_property:      'Quarterly',
  hmo_compliance:     'Annual',
  fire_co_alarm:      'Monthly',
  property_condition: 'Quarterly',
}

export const CHECKLISTS: Record<InspectionType, string[]> = {
  fire_alarm: [
    'All alarm zones sounded and tested',
    'Smoke detectors on each floor functional',
    'Heat detector in kitchen functional',
    'Emergency lighting tested and operational',
    'Fire extinguishers present and in date',
    'Fire doors self-closing and not propped open',
    'Escape routes clear of obstructions',
    'Evacuation plan displayed in property',
  ],
  communal_area: [
    'Hallways and corridors free of obstructions',
    'Fire doors operational and self-closing',
    'No hazards or trip hazards identified',
    'Communal lighting adequate throughout',
    'Common areas in satisfactory condition',
    'No signs of damage or vandalism',
  ],
  cleaning: [
    'Shared kitchen clean and hygienic',
    'Shared bathrooms clean',
    'Communal areas vacuumed and/or mopped',
    'Bins emptied and bin area clean',
    'No evidence of pests',
    'Shared fridge/freezer clean and not overloaded',
  ],
  garden_exterior: [
    'Garden maintained and grass cut',
    'Paths and walkways clear',
    'External lighting functional',
    'Bins stored correctly',
    'No fly-tipping or waste accumulation',
    'Exterior of property in good condition',
  ],
  full_property: [
    'All rooms inspected and accessible',
    'Structural condition satisfactory',
    'Plumbing and heating functioning correctly',
    'Electrical installations visually satisfactory',
    'No damp or mould identified',
    'Windows and doors secure and functional',
    'Smoke and CO alarms present and tested',
    'Tenant areas in acceptable condition',
  ],
  hmo_compliance: [
    'HMO licence displayed in property',
    'Maximum permitted occupancy not exceeded',
    'Gas safety certificate (CP12) in date',
    'EICR in date',
    'Energy Performance Certificate (EPC) in date',
    'Fire risk assessment up to date',
    'Required notices and information displayed',
    'Deposit protection certificates issued',
  ],
  fire_co_alarm: [
    'Smoke alarm on each floor tested and functional',
    'Carbon monoxide alarm present where required and functional',
    'Alarm batteries checked or mains power confirmed',
    'No obstruction around alarm units',
    'Tenant aware of alarm locations and testing procedure',
  ],
  property_condition: [
    'Overall property condition satisfactory',
    'No damp or mould identified',
    'Plumbing and heating functioning correctly',
    'Windows and doors secure and functional',
    'Electrical installations visually satisfactory',
    'No structural concerns identified',
    'Garden and exterior in acceptable condition',
    'Tenant areas in acceptable condition',
  ],
}

export async function getInspectionStatus(): Promise<{ properties: PropertyInspectionStatus[] }> {
  const { data } = await api.get('/inspections/status')
  return data
}

export async function getInspections(params?: { propertyId?: string; type?: InspectionType }): Promise<{ inspections: Inspection[] }> {
  const { data } = await api.get('/inspections', { params })
  return data
}

export async function getInspection(id: string): Promise<{ inspection: InspectionDetail }> {
  const { data } = await api.get(`/inspections/${id}`)
  return data
}

export async function createInspection(body: {
  propertyId: string
  type: InspectionType
  inspectorName: string
  inspectionDate: string
  overallResult: InspectionResult
  notes?: string
  items: { itemLabel: string; result: ItemResult; notes?: string }[]
}): Promise<{ inspectionId: string }> {
  const { data } = await api.post('/inspections', body)
  return data
}

export async function uploadInspectionPhotos(inspectionId: string, files: File[]): Promise<void> {
  const formData = new FormData()
  for (const file of files) formData.append('photos', file)
  await api.post(`/inspections/${inspectionId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export async function deleteInspection(id: string): Promise<void> {
  await api.delete(`/inspections/${id}`)
}
