import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Plus, BedDouble, Bath, CheckCircle, XCircle,
  Pencil, Trash2, Loader2, X, Check, Camera, ChevronRight,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import { getPropertyDocuments, uploadDocument, deleteDocument } from '@/api/documents'
import type { Document as PropertyDocument } from '@/api/documents'
import { AuthImage } from '@/components/AuthImage'
import type { PhotoPreview } from '@/components/PhotoUploader'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Room {
  id: string
  propertyId: string
  roomName: string | null
  roomNumber: number | null
  floorLevel: number
  roomSizeSqm: number | null
  maxOccupancy: number
  roomType: string | null
  bathroomType: string
  amenities: string[]
  rentAmount: number | null
  billsIncluded: boolean
  depositAmount: number | null
  isAvailable: boolean
  isFurnished: boolean
}

interface RoomPatch {
  roomName?: string
  roomNumber?: number
  floorLevel?: number
  roomSizeSqm?: number
  maxOccupancy?: number
  roomType?: string
  bathroomType?: string
  amenities?: string[]
  rentAmount?: number
  billsIncluded?: boolean
  depositAmount?: number
  isAvailable?: boolean
  isFurnished?: boolean
}

async function getRooms(propertyId: string): Promise<Room[]> {
  const { data } = await api.get<{ rooms: Room[] }>('/rooms', { params: { propertyId } })
  return data.rooms
}

async function patchRoom(id: string, body: RoomPatch): Promise<Room> {
  const { data } = await api.patch<{ room: Room }>(`/rooms/${id}`, body)
  return data.room
}

async function deleteRoom(id: string): Promise<void> {
  await api.delete(`/rooms/${id}`)
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOM_TYPES = ['single', 'double', 'studio', 'other']
const BATHROOM_TYPES = [
  { value: 'shared',  label: 'Shared' },
  { value: 'ensuite', label: 'Ensuite' },
  { value: 'private', label: 'Private' },
]
const AMENITIES_OPTIONS = [
  'Desk', 'Wardrobe', 'Chest of drawers', 'TV point', 'Sink in room',
  'Fridge', 'Microwave', 'Internet / Wi-Fi', 'Curtains / blinds', 'Central heating',
]

// ── Small helpers ─────────────────────────────────────────────────────────────

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function FieldInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function inp(extra?: string) {
  return `w-full h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent ${extra ?? ''}`
}

function sel(extra?: string) {
  return `w-full h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent appearance-none ${extra ?? ''}`
}


// ── Photo manager (edit mode) ─────────────────────────────────────────────────

function PhotoManager({
  existingPhotos,
  newPhotos,
  onNewPhotosChange,
  markedForDeletion,
  onToggleDelete,
}: {
  existingPhotos: PropertyDocument[]
  newPhotos: PhotoPreview[]
  onNewPhotosChange: (photos: PhotoPreview[]) => void
  markedForDeletion: Set<string>
  onToggleDelete: (id: string) => void
}) {
  return (
    <FieldInput label="Photos">
      <div className="flex flex-wrap gap-2 mt-1">
        {/* Existing photos — hide any marked for deletion */}
        {existingPhotos.filter(doc => !markedForDeletion.has(doc.id)).map(doc => (
          <div
            key={doc.id}
            className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group shrink-0"
          >
            <AuthImage docId={doc.id} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onToggleDelete(doc.id)}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove photo"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {/* New photos */}
        {newPhotos.map((p, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-sky-200 group shrink-0">
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(p.url)
                onNewPhotosChange(newPhotos.filter((_, j) => j !== i))
              }}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {/* Add button */}
        <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 hover:border-sky-300 hover:bg-sky-50 flex flex-col items-center justify-center gap-1 transition-colors shrink-0 cursor-pointer">
          <Camera className="w-4 h-4 text-gray-300" />
          <span className="text-xs text-gray-400">Add</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => {
              const files = e.target.files
              if (!files) return
              const added: PhotoPreview[] = Array.from(files)
                .filter(f => f.type.startsWith('image/'))
                .map(file => ({ file, url: URL.createObjectURL(file) }))
              onNewPhotosChange([...newPhotos, ...added])
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </FieldInput>
  )
}

// ── Landlord inline edit form ─────────────────────────────────────────────────

function EditForm({
  room,
  existingPhotos,
  onClose,
  onDocsChange,
}: {
  room: Room
  existingPhotos: PropertyDocument[]
  onClose: () => void
  onDocsChange: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState({
    roomName:     room.roomName ?? '',
    roomNumber:   room.roomNumber?.toString() ?? '',
    floorLevel:   room.floorLevel.toString(),
    roomType:     room.roomType ?? '',
    bathroomType: room.bathroomType,
    roomSizeSqm:  room.roomSizeSqm?.toString() ?? '',
    maxOccupancy: room.maxOccupancy.toString(),
    rentAmount:   room.rentAmount?.toString() ?? '',
    depositAmount:room.depositAmount?.toString() ?? '',
    billsIncluded:room.billsIncluded,
    isFurnished:  room.isFurnished,
    isAvailable:  room.isAvailable,
    amenities:    [...room.amenities],
  })
  const [newPhotos, setNewPhotos] = useState<PhotoPreview[]>([])
  const [markedForDeletion, setMarkedForDeletion] = useState<Set<string>>(new Set())

  const set = (k: string, v: string | boolean | string[]) =>
    setDraft(prev => ({ ...prev, [k]: v }))

  const toggleAmenity = (item: string) => {
    set('amenities', draft.amenities.includes(item)
      ? draft.amenities.filter(a => a !== item)
      : [...draft.amenities, item])
  }

  const toggleDelete = (id: string) => {
    setMarkedForDeletion(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const mutation = useMutation({
    mutationFn: async ({ toDelete, toUpload }: { toDelete: string[]; toUpload: PhotoPreview[] }) => {
      await patchRoom(room.id, {
        roomName:     draft.roomName.trim() || undefined,
        roomNumber:   draft.roomNumber   ? parseInt(draft.roomNumber)    : undefined,
        floorLevel:   parseInt(draft.floorLevel) || 0,
        roomType:     draft.roomType     || undefined,
        bathroomType: draft.bathroomType,
        roomSizeSqm:  draft.roomSizeSqm  ? parseFloat(draft.roomSizeSqm) : undefined,
        maxOccupancy: parseInt(draft.maxOccupancy) || 1,
        rentAmount:   draft.rentAmount   ? parseFloat(draft.rentAmount)   : undefined,
        depositAmount:draft.depositAmount? parseFloat(draft.depositAmount): undefined,
        billsIncluded:draft.billsIncluded,
        isFurnished:  draft.isFurnished,
        isAvailable:  draft.isAvailable,
        amenities:    draft.amenities,
      })
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map(id => deleteDocument(id)))
      }
      if (toUpload.length > 0) {
        await Promise.all(toUpload.map(p =>
          uploadDocument(room.propertyId, p.file, 'photo', undefined, room.id).catch(() => null)
        ))
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', room.propertyId] })
      queryClient.invalidateQueries({ queryKey: ['documents', room.propertyId] })
      onDocsChange()
      toast('Room updated', {
        style: { background: '#e0f4fa', border: '1px solid #7ab8d0', color: '#1e6a85', fontWeight: '500' },
      })
      onClose()
    },
    onError: () => toast.error('Failed to save changes — please try again'),
  })

  const Toggle = ({ field, label }: { field: 'billsIncluded' | 'isFurnished' | 'isAvailable'; label: string }) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => set(field, !draft[field])}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 ${draft[field] ? 'bg-sky-300' : 'bg-gray-200'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${draft[field] ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-xs text-gray-700">{label}</span>
    </label>
  )

  return (
    <div className="border-t border-gray-100 mt-3 pt-4 space-y-4">

      {/* Row 1 */}
      <div className="grid grid-cols-3 gap-3">
        <FieldInput label="Room name">
          <input className={inp()} value={draft.roomName} onChange={e => set('roomName', e.target.value)} placeholder="e.g. Room 1" />
        </FieldInput>
        <FieldInput label="Room number">
          <input className={inp()} type="number" min={1} value={draft.roomNumber} onChange={e => set('roomNumber', e.target.value)} />
        </FieldInput>
        <FieldInput label="Floor level">
          <input className={inp()} type="number" min={0} value={draft.floorLevel} onChange={e => set('floorLevel', e.target.value)} />
        </FieldInput>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-4 gap-3">
        <FieldInput label="Room type">
          <select className={sel()} value={draft.roomType} onChange={e => set('roomType', e.target.value)}>
            <option value="">Select…</option>
            {ROOM_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
          </select>
        </FieldInput>
        <FieldInput label="Bathroom">
          <select className={sel()} value={draft.bathroomType} onChange={e => set('bathroomType', e.target.value)}>
            {BATHROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FieldInput>
        <FieldInput label="Size (m²)">
          <input className={inp()} type="number" step="0.1" min={0} value={draft.roomSizeSqm} onChange={e => set('roomSizeSqm', e.target.value)} placeholder="e.g. 9.5" />
        </FieldInput>
        <FieldInput label="Max occupancy">
          <input className={inp()} type="number" min={1} value={draft.maxOccupancy} onChange={e => set('maxOccupancy', e.target.value)} />
        </FieldInput>
      </div>

      {/* Row 3 — Pricing + toggles */}
      <div className="grid grid-cols-3 gap-3">
        <FieldInput label="Rent PCM (£)">
          <input className={inp()} type="number" step="0.01" min={0} value={draft.rentAmount} onChange={e => set('rentAmount', e.target.value)} />
        </FieldInput>
        <FieldInput label="Deposit (£)">
          <input className={inp()} type="number" step="0.01" min={0} value={draft.depositAmount} onChange={e => set('depositAmount', e.target.value)} />
        </FieldInput>
        <FieldInput label="Options">
          <div className="flex flex-col gap-1.5 pt-0.5">
            <Toggle field="billsIncluded" label="Bills included" />
            <Toggle field="isFurnished"   label="Furnished" />
            <Toggle field="isAvailable"   label="Available" />
          </div>
        </FieldInput>
      </div>

      {/* Amenities */}
      <FieldInput label="Amenities">
        <div className="flex flex-wrap gap-1.5 mt-1">
          {AMENITIES_OPTIONS.map(item => {
            const active = draft.amenities.includes(item)
            return (
              <button key={item} type="button" onClick={() => toggleAmenity(item)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {item}
              </button>
            )
          })}
        </div>
      </FieldInput>

      {/* Photos */}
      <PhotoManager
        existingPhotos={existingPhotos}
        newPhotos={newPhotos}
        onNewPhotosChange={setNewPhotos}
        markedForDeletion={markedForDeletion}
        onToggleDelete={toggleDelete}
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ toDelete: [...markedForDeletion], toUpload: newPhotos })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-xs font-semibold transition-colors disabled:opacity-60">
          {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save changes
        </button>
      </div>
    </div>
  )
}

// ── Detail row (for modal read view) ─────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-start py-2.5 border-b border-gray-100 last:border-0">
      <span className="w-40 shrink-0 text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}

// ── Room detail modal ─────────────────────────────────────────────────────────

function RoomDetailModal({
  room,
  roomPhotos,
  isLandlord,
  onClose,
  onEdit,
}: {
  room: Room
  roomPhotos: PropertyDocument[]
  isLandlord: boolean
  onClose: () => void
  onEdit: () => void
}) {
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const displayName = room.roomName ?? (room.roomNumber ? `Room ${room.roomNumber}` : 'Room')

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
        onClick={handleBackdrop}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-50 shrink-0">
                <BedDouble className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {room.roomType ? cap(room.roomType) : 'Room'}
                  {room.roomSizeSqm ? ` · ${room.roomSizeSqm} m²` : ''}
                  {room.floorLevel !== null ? ` · Floor ${room.floorLevel}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                room.isAvailable
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {room.isAvailable ? 'Available' : 'Occupied'}
              </span>
              {isLandlord && (
                <button
                  onClick={() => { onClose(); onEdit() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
              <button
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal body */}
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

            {/* Details */}
            <div className="bg-gray-50 rounded-xl px-4">
              <DetailRow label="Room number"   value={room.roomNumber} />
              <DetailRow label="Floor"         value={room.floorLevel !== null ? `Floor ${room.floorLevel}` : null} />
              <DetailRow label="Room type"     value={room.roomType ? cap(room.roomType) : null} />
              <DetailRow label="Bathroom"      value={room.bathroomType ? cap(room.bathroomType) : null} />
              <DetailRow label="Size"          value={room.roomSizeSqm ? `${room.roomSizeSqm} m²` : null} />
              <DetailRow label="Max occupancy" value={room.maxOccupancy} />
              <DetailRow label="Furnished"     value={room.isFurnished ? 'Yes' : 'No'} />
            </div>

            {/* Pricing */}
            <div className="bg-gray-50 rounded-xl px-4">
              <DetailRow
                label="Rent PCM"
                value={room.rentAmount != null
                  ? <span>£{Number(room.rentAmount).toLocaleString()}{room.billsIncluded && <span className="ml-2 text-xs text-sky-500 font-normal">Bills included</span>}</span>
                  : null}
              />
              <DetailRow
                label="Deposit"
                value={room.depositAmount != null ? `£${Number(room.depositAmount).toLocaleString()}` : null}
              />
            </div>

            {/* Amenities */}
            {room.amenities?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {room.amenities.map(a => (
                    <span key={a} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Photos */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                Photos {roomPhotos.length > 0 ? `(${roomPhotos.length})` : ''}
              </p>
              {roomPhotos.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {roomPhotos.map(doc => (
                    <AuthImage
                      key={doc.id}
                      docId={doc.id}
                      className="w-28 h-28 rounded-xl object-cover border border-gray-200 cursor-pointer hover:opacity-85 transition-opacity"
                      onClick={() => setLightboxId(doc.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  {isLandlord ? 'No photos, please add some now.' : 'No photos added.'}
                </p>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxId(null)}
        >
          <button
            onClick={() => setLightboxId(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div onClick={e => e.stopPropagation()}>
            <AuthImage docId={lightboxId} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </>
  )
}

// ── Room card ─────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  isLandlord,
  propertyId,
  roomPhotos,
  onDocsChange,
}: {
  room: Room
  isLandlord: boolean
  propertyId: string
  roomPhotos: PropertyDocument[]
  onDocsChange: () => void
}) {
  const queryClient = useQueryClient()
  const [showDetail, setShowDetail] = useState(false)
  const [editing, setEditing] = useState(false)

  const displayName = room.roomName ?? (room.roomNumber ? `Room ${room.roomNumber}` : 'Room')

  const deleteMutation = useMutation({
    mutationFn: () => deleteRoom(room.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success('Room deleted')
    },
    onError: () => toast.error('Failed to delete room'),
  })

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Clickable card body → opens detail modal */}
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="w-full text-left p-4 group hover:bg-gray-50/60 transition-colors"
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-50 shrink-0">
                <BedDouble className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {room.roomType ? cap(room.roomType) : 'Room'}
                  {room.roomSizeSqm ? ` · ${room.roomSizeSqm} m²` : ''}
                  {room.floorLevel !== null ? ` · Floor ${room.floorLevel}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                room.isAvailable
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {room.isAvailable ? 'Available' : 'Occupied'}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-sky-400 transition-colors" />
            </div>
          </div>

          {/* Details row */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Bath className="w-3.5 h-3.5" />
              <span className="capitalize">{room.bathroomType}</span>
            </div>
            {room.rentAmount != null && (
              <div className="text-xs text-gray-600 font-medium">
                £{Number(room.rentAmount).toLocaleString()} PCM
                {room.billsIncluded && <span className="ml-1 text-sky-500 font-normal">· Bills incl.</span>}
              </div>
            )}
            {room.depositAmount != null && (
              <div className="text-xs text-gray-500">Deposit £{Number(room.depositAmount).toLocaleString()}</div>
            )}
            {room.maxOccupancy > 1 && (
              <div className="text-xs text-gray-500">{room.maxOccupancy} max occupants</div>
            )}
            <div className={`text-xs font-medium ${room.isFurnished ? 'text-sky-500' : 'text-gray-400'}`}>
              {room.isFurnished ? 'Furnished' : 'Unfurnished'}
            </div>
          </div>

          {/* Amenities */}
          {room.amenities?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {room.amenities.map(a => (
                <span key={a} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs">{a}</span>
              ))}
            </div>
          )}

          {/* Photo count indicator */}
          {roomPhotos.length > 0 && (
            <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
              <Camera className="w-3 h-3" />
              <span>{roomPhotos.length} {roomPhotos.length === 1 ? 'photo' : 'photos'}</span>
            </div>
          )}
        </button>

        {/* Action bar (landlord only) */}
        {isLandlord && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50/50">
            {/* No photos nudge */}
            {roomPhotos.length === 0 ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-xs text-sky-500 hover:text-sky-700 transition-colors"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span className="underline underline-offset-2">No photos, please add some now.</span>
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-gray-500 hover:text-sky-600 hover:bg-sky-50 text-xs font-medium transition-colors"
                title="Edit room"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${displayName}"?`)) deleteMutation.mutate() }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 text-xs font-medium transition-colors"
                title="Delete room"
              >
                {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Inline edit form */}
        {editing && (
          <div className="border-t border-gray-200 p-4">
            <EditForm
              room={room}
              existingPhotos={roomPhotos}
              onClose={() => setEditing(false)}
              onDocsChange={onDocsChange}
            />
          </div>
        )}
      </div>

      {/* Detail modal */}
      {showDetail && (
        <RoomDetailModal
          room={room}
          roomPhotos={roomPhotos}
          isLandlord={isLandlord}
          onClose={() => setShowDetail(false)}
          onEdit={() => setEditing(true)}
        />
      )}
    </>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function RoomsTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const isLandlord = role === 'landlord' || role === 'admin'

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['rooms', propertyId],
    queryFn: () => getRooms(propertyId),
  })

  const { data: allDocs = [] } = useQuery({
    queryKey: ['documents', propertyId],
    queryFn: () => getPropertyDocuments(propertyId),
  })

  const photoDocs = allDocs.filter(d => d.documentType === 'photo' && d.roomId)

  const refreshDocs = () => queryClient.invalidateQueries({ queryKey: ['documents', propertyId] })

  const available = rooms.filter(r => r.isAvailable).length
  const occupied  = rooms.filter(r => !r.isAvailable).length

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-gray-700">Rooms</p>
          {rooms.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" />{available} available
              </span>
              <span className="flex items-center gap-1 text-gray-400">
                <XCircle className="w-3.5 h-3.5" />{occupied} occupied
              </span>
            </div>
          )}
        </div>
        {isLandlord && (
          <button
            onClick={() => navigate(`/app/properties/${propertyId}/rooms/new`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add rooms
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-100 rounded w-1/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center h-52 rounded-xl border border-dashed border-gray-300 bg-white gap-3">
          <BedDouble className="w-8 h-8 text-gray-300" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-400">No rooms yet</p>
            <p className="text-xs text-gray-400 mt-1">Add rooms to start managing this HMO.</p>
          </div>
          {isLandlord && (
            <button
              onClick={() => navigate(`/app/properties/${propertyId}/rooms/new`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add rooms
            </button>
          )}
        </div>
      )}

      {/* Room cards */}
      {!isLoading && rooms.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
              isLandlord={isLandlord}
              propertyId={propertyId}
              roomPhotos={photoDocs.filter(d => d.roomId === room.id)}
              onDocsChange={refreshDocs}
            />
          ))}
        </div>
      )}
    </div>
  )
}
