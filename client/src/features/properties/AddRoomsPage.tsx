import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Loader2, BedDouble } from 'lucide-react'
import { getProperty } from '@/api/properties'
import { uploadDocument } from '@/api/documents'
import { PhotoUploader, type PhotoPreview } from '@/components/PhotoUploader'
import { api } from '@/lib/axios'

// ── Types ─────────────────────────────────────────────────────────────────────
interface RoomDraft {
  roomName: string
  roomNumber: string
  floorLevel: string
  roomType: string
  bathroomType: string
  roomSizeSqm: string
  maxOccupancy: string
  amenities: string[]
  rentAmount: string
  billsIncluded: boolean
  depositAmount: string
  isAvailable: boolean
  isFurnished: boolean
  photos: PhotoPreview[]
}

const AMENITIES_OPTIONS = [
  'Desk',
  'Wardrobe',
  'Chest of drawers',
  'TV point',
  'Sink in room',
  'Fridge',
  'Microwave',
  'Internet / Wi-Fi',
  'Curtains / blinds',
  'Central heating',
]

const ROOM_TYPES = [
  { value: '',       label: 'Select…' },
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'studio', label: 'Studio' },
  { value: 'other',  label: 'Other' },
]

const BATHROOM_TYPES = [
  { value: 'shared',  label: 'Shared' },
  { value: 'ensuite', label: 'Ensuite (in room)' },
  { value: 'private', label: 'Private (exclusive use)' },
]

function emptyRoom(): RoomDraft {
  return {
    roomName:     '',
    roomNumber:   '',
    floorLevel:   '0',
    roomType:     '',
    bathroomType: 'shared',
    roomSizeSqm:  '',
    maxOccupancy: '1',
    amenities:    [],
    rentAmount:   '',
    billsIncluded: false,
    depositAmount: '',
    isAvailable:  true,
    isFurnished:  false,
    photos:       [],
  }
}

// ── Small components ──────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent transition ${props.className ?? ''}`}
    />
  )
}

function SelectInput({ children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent transition appearance-none ${className ?? ''}`}
    >
      {children}
    </select>
  )
}

function Toggle({ checked, onChange, label, required }: { checked: boolean; onChange: (v: boolean) => void; label: string; required?: boolean }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 ${checked ? 'bg-sky-300' : 'bg-gray-200'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-gray-700">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
    </label>
  )
}

// ── Single room form section ───────────────────────────────────────────────────
function RoomSection({
  index,
  room,
  onChange,
  onRemove,
  canRemove,
  errors,
}: {
  index: number
  room: RoomDraft
  onChange: (updated: RoomDraft) => void
  onRemove: () => void
  canRemove: boolean
  errors: Partial<Record<keyof RoomDraft, string>>
}) {
  const set = (field: keyof RoomDraft, value: string | boolean | string[] | PhotoPreview[]) =>
    onChange({ ...room, [field]: value })

  const toggleAmenity = (item: string) => {
    const next = room.amenities.includes(item)
      ? room.amenities.filter(a => a !== item)
      : [...room.amenities, item]
    set('amenities', next)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-100">
            <BedDouble className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <span className="text-sm font-semibold text-gray-800">
            {room.roomName || (room.roomNumber ? `Room ${room.roomNumber}` : `Room ${index + 1}`)}
          </span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">

        {/* Row 1 — Name, Number, Floor */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <Label>Room name</Label>
            <TextInput
              value={room.roomName}
              onChange={e => set('roomName', e.target.value)}
              placeholder="e.g. Room 1"
            />
          </div>
          <div>
            <Label required>Room number</Label>
            <TextInput
              type="number"
              min={1}
              value={room.roomNumber}
              onChange={e => set('roomNumber', e.target.value)}
              placeholder="e.g. 1"
              className={errors.roomNumber ? 'border-red-400 bg-red-50' : ''}
            />
            {errors.roomNumber && <p className="mt-1 text-xs text-red-600">{errors.roomNumber}</p>}
          </div>
          <div>
            <Label>Floor level</Label>
            <TextInput
              type="number"
              min={0}
              value={room.floorLevel}
              onChange={e => set('floorLevel', e.target.value)}
            />
          </div>
        </div>

        {/* Row 2 — Type, Bathroom, Size, Occupancy */}
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label required>Room type</Label>
            <SelectInput
              value={room.roomType}
              onChange={e => set('roomType', e.target.value)}
              className={errors.roomType ? 'border-red-400' : ''}
            >
              {ROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SelectInput>
            {errors.roomType && <p className="mt-1 text-xs text-red-600">{errors.roomType}</p>}
          </div>
          <div>
            <Label required>Bathroom</Label>
            <SelectInput value={room.bathroomType} onChange={e => set('bathroomType', e.target.value)}>
              {BATHROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SelectInput>
          </div>
          <div>
            <Label>Size (m²)</Label>
            <TextInput
              type="number"
              step="0.1"
              min={0}
              value={room.roomSizeSqm}
              onChange={e => set('roomSizeSqm', e.target.value)}
              placeholder="e.g. 9.5"
            />
            {room.roomSizeSqm && parseFloat(room.roomSizeSqm) < 6.51 && (
              <p className="mt-1 text-xs text-amber-600">Below UK HMO min (6.51m²)</p>
            )}
          </div>
          <div>
            <Label required>Max occupancy</Label>
            <TextInput
              type="number"
              min={1}
              value={room.maxOccupancy}
              onChange={e => set('maxOccupancy', e.target.value)}
              className={errors.maxOccupancy ? 'border-red-400 bg-red-50' : ''}
            />
            {errors.maxOccupancy && <p className="mt-1 text-xs text-red-600">{errors.maxOccupancy}</p>}
          </div>
        </div>

        {/* Row 3 — Pricing */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label required>Rent PCM (£)</Label>
            <TextInput
              type="number"
              step="0.01"
              min={0}
              value={room.rentAmount}
              onChange={e => set('rentAmount', e.target.value)}
              placeholder="e.g. 600"
              className={errors.rentAmount ? 'border-red-400 bg-red-50' : ''}
            />
            {errors.rentAmount && <p className="mt-1 text-xs text-red-600">{errors.rentAmount}</p>}
          </div>
          <div>
            <Label required>Deposit (£)</Label>
            <TextInput
              type="number"
              step="0.01"
              min={0}
              value={room.depositAmount}
              onChange={e => set('depositAmount', e.target.value)}
              placeholder="e.g. 600"
              className={errors.depositAmount ? 'border-red-400 bg-red-50' : ''}
            />
            {errors.depositAmount && <p className="mt-1 text-xs text-red-600">{errors.depositAmount}</p>}
          </div>
          <div className="flex flex-col justify-end pb-1 gap-2">
            <Toggle
              checked={room.billsIncluded}
              onChange={v => set('billsIncluded', v)}
              label="Bills included"
              required
            />
            <Toggle
              checked={room.isFurnished}
              onChange={v => set('isFurnished', v)}
              label="Furnished"
              required
            />
            <Toggle
              checked={room.isAvailable}
              onChange={v => set('isAvailable', v)}
              label="Available now"
              required
            />
          </div>
        </div>

        {/* Amenities */}
        <div>
          <Label>Amenities</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {AMENITIES_OPTIONS.map(item => {
              const active = room.amenities.includes(item)
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleAmenity(item)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-sky-50 border-sky-300 text-sky-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>

        {/* Photos */}
        <PhotoUploader
          photos={room.photos}
          onChange={v => set('photos', v)}
          label="Room photos"
        />

      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AddRoomsPage() {
  const { id: propertyId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [rooms, setRooms] = useState<RoomDraft[]>([emptyRoom()])
  const [errors, setErrors] = useState<Partial<Record<keyof RoomDraft, string>>[]>([{}])

  const { data: property } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => getProperty(propertyId!),
    enabled: !!propertyId,
  })

  const updateRoom = (index: number, updated: RoomDraft) => {
    setRooms(prev => prev.map((r, i) => i === index ? updated : r))
  }

  const addRoom = () => {
    setRooms(prev => [...prev, emptyRoom()])
    setErrors(prev => [...prev, {}])
  }

  const removeRoom = (index: number) => {
    setRooms(prev => prev.filter((_, i) => i !== index))
    setErrors(prev => prev.filter((_, i) => i !== index))
  }

  const validate = (): boolean => {
    const newErrors = rooms.map(room => {
      const e: Partial<Record<keyof RoomDraft, string>> = {}
      if (!room.roomNumber.trim())   e.roomNumber   = 'Room number is required'
      if (!room.roomType)            e.roomType     = 'Room type is required'
      if (!room.maxOccupancy.trim()) e.maxOccupancy = 'Max occupancy is required'
      if (!room.rentAmount.trim())   e.rentAmount   = 'Rent is required'
      if (!room.depositAmount.trim()) e.depositAmount = 'Deposit is required'
      return e
    })
    setErrors(newErrors)
    return newErrors.every(e => Object.keys(e).length === 0)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      for (const room of rooms) {
        const { data } = await api.post<{ room: { id: string } }>('/rooms', {
          propertyId,
          roomName:     room.roomName.trim() || undefined,
          roomNumber:   room.roomNumber   ? parseInt(room.roomNumber)    : undefined,
          floorLevel:   room.floorLevel   ? parseInt(room.floorLevel)    : 0,
          roomType:     room.roomType     || undefined,
          bathroomType: room.bathroomType,
          roomSizeSqm:  room.roomSizeSqm  ? parseFloat(room.roomSizeSqm) : undefined,
          maxOccupancy: room.maxOccupancy ? parseInt(room.maxOccupancy)  : 1,
          amenities:    room.amenities,
          rentAmount:   room.rentAmount   ? parseFloat(room.rentAmount)  : undefined,
          billsIncluded: room.billsIncluded,
          depositAmount: room.depositAmount ? parseFloat(room.depositAmount) : undefined,
          isAvailable:  room.isAvailable,
          isFurnished:  room.isFurnished,
        })
        if (room.photos.length > 0) {
          await Promise.all(
            room.photos.map(p =>
              uploadDocument(propertyId!, p.file, 'photo', undefined, data.room.id).catch(() => null)
            )
          )
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      toast.success(
        rooms.length === 1
          ? '1 room added successfully'
          : `${rooms.length} rooms added successfully`
      )
      navigate(`/app/properties/${propertyId}`, { state: { tab: 'rooms' } })
    },
    onError: () => {
      toast.error('Failed to save rooms. Please try again.')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) mutation.mutate()
  }

  const displayName = property?.propertyName
    ?? (property ? `${property.doorNumber ? property.doorNumber + ' ' : ''}${property.addressLine1}` : 'Property')

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Add rooms</h2>
          {property && (
            <p className="text-sm text-gray-500 mt-0.5">
              Adding to <span className="font-medium text-gray-700">{displayName}</span>
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Room sections */}
        {rooms.map((room, index) => (
          <RoomSection
            key={index}
            index={index}
            room={room}
            onChange={updated => updateRoom(index, updated)}
            onRemove={() => removeRoom(index)}
            canRemove={rooms.length > 1}
            errors={errors[index] ?? {}}
          />
        ))}

        {/* Add another room */}
        <button
          type="button"
          onClick={addRoom}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-400 hover:border-sky-300 hover:text-sky-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add another room
        </button>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 pb-6">
          <p className="text-sm text-gray-400">
            {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} to add
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-sm font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
              ) : (
                `Save ${rooms.length === 1 ? 'room' : `${rooms.length} rooms`}`
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
