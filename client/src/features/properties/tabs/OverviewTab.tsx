import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, X, Loader2, CheckCircle, AlertCircle, Camera } from 'lucide-react'
import { updateProperty } from '@/api/properties'
import { getPropertyDocuments, uploadDocument, deleteDocument } from '@/api/documents'
import type { Document as PropertyDocument } from '@/api/documents'
import type { Property } from '@/types/property'
import { AuthImage } from '@/components/AuthImage'
import type { PhotoPreview } from '@/components/PhotoUploader'

// ── Helpers ───────────────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start py-3 border-b border-gray-100 last:border-0">
      <span className="w-48 shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value ?? <span className="text-gray-400 font-normal">—</span>}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: Property['status'] }) {
  const styles = {
    active:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
    inactive: 'bg-gray-100 text-gray-500 border border-gray-200',
    archived: 'bg-red-50 text-red-600 border border-red-200',
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function TypeBadge({ type }: { type: Property['propertyType'] }) {
  const styles: Record<string, string> = {
    house: 'bg-blue-50 text-blue-700 border border-blue-200',
    flat:  'bg-purple-50 text-purple-700 border border-purple-200',
    hmo:   'bg-amber-50 text-amber-700 border border-amber-200',
    other: 'bg-gray-100 text-gray-600 border border-gray-200',
  }
  const labels: Record<string, string> = { house: 'House', flat: 'Flat', hmo: 'HMO', other: 'Other' }
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${styles[type]}`}>
      {labels[type]}
    </span>
  )
}

function formatDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Edit schema ───────────────────────────────────────────────────────────────
const editSchema = z.object({
  propertyName:          z.string().max(255).optional(),
  propertyType:          z.enum(['house', 'flat', 'hmo', 'other']),
  status:                z.enum(['active', 'inactive', 'archived']),
  doorNumber:            z.string().max(20).optional(),
  addressLine1:          z.string().min(1, 'Required'),
  addressLine2:          z.string().optional(),
  city:                  z.string().min(1, 'Required'),
  county:                z.string().optional(),
  postcode:              z.string().min(1, 'Required').max(10),
  country:               z.string(),
  hmoLicenceRequired:    z.boolean(),
  hmoLicenceNumber:      z.string().max(100).optional(),
  hmoLicenceExpiry:      z.string().optional(),
  hmoMaxOccupants:       z.coerce.number().int().positive().optional(),
  prsRegistered:         z.boolean(),
  prsRegistrationNumber: z.string().max(100).optional(),
  prsRegistrationDate:   z.string().optional(),
  totalRooms:            z.coerce.number().int().min(0),
  totalBathrooms:        z.coerce.number().int().min(0),
})

type EditForm = z.infer<typeof editSchema>

function TextInput({ error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      {...props}
      className={`w-full h-9 px-3 rounded-lg border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent transition ${
        error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
      }`}
    />
  )
}

function SelectInput({ error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select
      {...props}
      className={`w-full h-9 px-3 rounded-lg border text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent transition appearance-none bg-white ${
        error ? 'border-red-400' : 'border-gray-300'
      }`}
    >
      {children}
    </select>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Edit form ─────────────────────────────────────────────────────────────────
function EditForm({
  property,
  existingPhotos,
  onCancel,
}: {
  property: Property
  existingPhotos: PropertyDocument[]
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [newPhotos, setNewPhotos] = useState<PhotoPreview[]>([])
  const [markedForDeletion, setMarkedForDeletion] = useState<Set<string>>(new Set())

  const toggleDelete = (id: string) => setMarkedForDeletion(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const { register, handleSubmit, watch, formState: { errors } } = useForm<EditForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(editSchema) as any,
    defaultValues: {
      propertyName:          property.propertyName ?? '',
      propertyType:          property.propertyType,
      status:                property.status,
      doorNumber:            property.doorNumber ?? '',
      addressLine1:          property.addressLine1,
      addressLine2:          property.addressLine2 ?? '',
      city:                  property.city,
      county:                property.county ?? '',
      postcode:              property.postcode,
      country:               property.country,
      hmoLicenceRequired:    property.hmoLicenceRequired,
      hmoLicenceNumber:      property.hmoLicenceNumber ?? '',
      hmoLicenceExpiry:      property.hmoLicenceExpiry ?? '',
      hmoMaxOccupants:       property.hmoMaxOccupants ?? undefined,
      prsRegistered:         property.prsRegistered,
      prsRegistrationNumber: property.prsRegistrationNumber ?? '',
      prsRegistrationDate:   property.prsRegistrationDate ?? '',
      totalRooms:            property.totalRooms,
      totalBathrooms:        property.totalBathrooms,
    },
  })

  const propertyType = watch('propertyType')
  const isHmo = propertyType === 'hmo'

  const mutation = useMutation({
    mutationFn: async (data: EditForm) => {
      const payload = {
        ...data,
        prsRegistrationDate: data.prsRegistrationDate
          ? data.prsRegistrationDate.split('T')[0]
          : data.prsRegistrationDate,
        hmoLicenceExpiry: data.hmoLicenceExpiry
          ? data.hmoLicenceExpiry.split('T')[0]
          : data.hmoLicenceExpiry,
      }
      await updateProperty(property.id, payload)
      if (markedForDeletion.size > 0) {
        await Promise.all([...markedForDeletion].map(id => deleteDocument(id)))
      }
      if (newPhotos.length > 0) {
        await Promise.all(newPhotos.map(p =>
          uploadDocument(property.id, p.file, 'photo').catch(() => null)
        ))
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', property.id] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['documents', property.id] })
      toast.success('Property updated')
      onCancel()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      const detail = err?.response?.data?.details
      const msg = detail ? JSON.stringify(detail) : (err?.response?.data?.error ?? err?.message ?? 'Unknown error')
      toast.error(`Update failed: ${msg}`)
    },
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6">

      {/* Basic */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Basic information</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Property name" error={errors.propertyName?.message}>
            <TextInput {...register('propertyName')} placeholder="e.g. Maple House" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" error={errors.propertyType?.message}>
              <SelectInput {...register('propertyType')}>
                <option value="house">House</option>
                <option value="flat">Flat</option>
                <option value="hmo">HMO</option>
                <option value="other">Other</option>
              </SelectInput>
            </Field>
            <Field label="Status" error={errors.status?.message}>
              <SelectInput {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </SelectInput>
            </Field>
          </div>
        </div>
      </div>

      {/* Address */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Address</p>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Door / flat no.">
              <TextInput {...register('doorNumber')} placeholder="12A" />
            </Field>
            <div className="col-span-3">
              <Field label="Address line 1" error={errors.addressLine1?.message}>
                <TextInput {...register('addressLine1')} />
              </Field>
            </div>
          </div>
          <Field label="Address line 2">
            <TextInput {...register('addressLine2')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" error={errors.city?.message}>
              <TextInput {...register('city')} />
            </Field>
            <Field label="County">
              <TextInput {...register('county')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Postcode" error={errors.postcode?.message}>
              <TextInput {...register('postcode')} className="uppercase" />
            </Field>
            <Field label="Country">
              <TextInput {...register('country')} />
            </Field>
          </div>
        </div>
      </div>

      {/* HMO */}
      {isHmo && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">HMO details</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Max occupants">
              <TextInput type="number" min={1} {...register('hmoMaxOccupants')} />
            </Field>
            <Field label="Licence number">
              <TextInput {...register('hmoLicenceNumber')} placeholder="HMO/2024/..." />
            </Field>
            <Field label="Licence expiry">
              <TextInput type="date" {...register('hmoLicenceExpiry')} />
            </Field>
          </div>
        </div>
      )}

      {/* PRS */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">PRS registration</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Registered">
            <SelectInput {...register('prsRegistered', { setValueAs: v => v === 'true' || v === true })}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </SelectInput>
          </Field>
          <Field label="Registration number">
            <TextInput {...register('prsRegistrationNumber')} />
          </Field>
          <Field label="Registration date">
            <TextInput type="date" {...register('prsRegistrationDate')} />
          </Field>
        </div>
      </div>

      {/* Details */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Property details</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Total rooms">
            <TextInput type="number" min={0} {...register('totalRooms')} />
          </Field>
          <Field label="Total bathrooms">
            <TextInput type="number" min={0} {...register('totalBathrooms')} />
          </Field>
        </div>
      </div>

      {/* Photos */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Property photos</p>
        <div className="flex flex-wrap gap-2">
          {/* Existing — hide any marked for deletion */}
          {existingPhotos.filter(doc => !markedForDeletion.has(doc.id)).map(doc => (
            <div
              key={doc.id}
              className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group shrink-0"
            >
              <AuthImage docId={doc.id} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => toggleDelete(doc.id)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove photo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* New photos */}
          {newPhotos.map((p, i) => (
            <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-sky-200 group shrink-0">
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(p.url)
                  setNewPhotos(prev => prev.filter((_, j) => j !== i))
                }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* Add button */}
          <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 hover:border-sky-300 hover:bg-sky-50 flex flex-col items-center justify-center gap-1 transition-colors shrink-0 cursor-pointer">
            <Camera className="w-5 h-5 text-gray-300" />
            <span className="text-xs text-gray-400">Add photo</span>
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
                setNewPhotos(prev => [...prev, ...added])
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {existingPhotos.length === 0 && newPhotos.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">No photos yet. Drag and drop or click Add photo.</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-sm font-semibold transition-colors disabled:opacity-70"
        >
          {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

// ── Overview read view ────────────────────────────────────────────────────────
export function OverviewTab({ property }: { property: Property }) {
  const [editing, setEditing] = useState(false)
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const isHmo = property.propertyType === 'hmo'

  const { data: allDocs = [] } = useQuery({
    queryKey: ['documents', property.id],
    queryFn: () => getPropertyDocuments(property.id),
  })
  // Property-level photos only (no roomId). Use !d.roomId to handle both null and undefined
  const propertyPhotos = allDocs.filter(d => d.documentType === 'photo' && !d.roomId)

  const fullAddress = [
    property.doorNumber,
    property.addressLine1,
    property.addressLine2,
    property.city,
    property.county,
    property.postcode,
    property.country,
  ].filter(Boolean).join(', ')

  return (
    <div className="space-y-5">

      {/* Edit / view toggle header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">{editing ? 'Edit property' : 'Property details'}</p>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
        {editing && (
          <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <EditForm
            property={property}
            existingPhotos={propertyPhotos}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="space-y-5">

          {/* Basic */}
          <div className="bg-white rounded-xl border border-gray-200 px-6">
            <Row label="Property name"  value={property.propertyName} />
            <Row label="Type"           value={<TypeBadge type={property.propertyType} />} />
            <Row label="Status"         value={<StatusBadge status={property.status} />} />
            <Row label="Full address"   value={fullAddress} />
            <Row label="Total rooms"    value={property.totalRooms} />
            <Row label="Total bathrooms" value={property.totalBathrooms} />
          </div>

          {/* HMO */}
          {isHmo && (
            <div className="bg-white rounded-xl border border-amber-200 px-6">
              <div className="py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">HMO details</p>
              </div>
              <Row label="Max occupants"     value={property.hmoMaxOccupants} />
              <Row label="Licence required"  value={property.hmoLicenceRequired ? 'Yes' : 'No'} />
              <Row label="Licence number"    value={property.hmoLicenceNumber} />
              <Row label="Licence expiry"    value={formatDate(property.hmoLicenceExpiry)} />
              {property.hmoLicenceRequired && !property.hmoLicenceNumber && (
                <div className="flex items-center gap-2 py-3 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  No licence number recorded — this property may not be legally compliant.
                </div>
              )}
            </div>
          )}

          {/* PRS */}
          <div className="bg-white rounded-xl border border-gray-200 px-6">
            <div className="py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">PRS registration</p>
            </div>
            <Row
              label="Registered"
              value={
                property.prsRegistered
                  ? <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle className="w-4 h-4" /> Registered</span>
                  : <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="w-4 h-4" /> Not registered</span>
              }
            />
            <Row label="Registration number" value={property.prsRegistrationNumber} />
            <Row label="Registration date"   value={formatDate(property.prsRegistrationDate)} />
          </div>

          {/* Property photos */}
          {propertyPhotos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                Property photos ({propertyPhotos.length})
              </p>
              <div className="flex flex-wrap gap-3">
                {propertyPhotos.map(doc => (
                  <AuthImage
                    key={doc.id}
                    docId={doc.id}
                    className="w-28 h-28 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-85 transition-opacity"
                    onClick={() => setLightboxId(doc.id)}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      )}

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
            <AuthImage
              docId={lightboxId}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}
