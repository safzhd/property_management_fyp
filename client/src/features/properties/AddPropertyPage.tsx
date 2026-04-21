import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { createProperty } from '@/api/properties'
import { uploadDocument } from '@/api/documents'
import { PhotoUploader, type PhotoPreview } from '@/components/PhotoUploader'

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z.object({
  // Basic
  propertyName:  z.string().max(255).optional(),
  propertyType:  z.enum(['house', 'flat', 'hmo', 'other']),
  status:        z.enum(['active', 'inactive', 'archived']),
  isHmo:         z.boolean(),

  // Address
  doorNumber:    z.string().max(20).optional(),
  addressLine1:  z.string().min(1, 'Address line 1 is required'),
  addressLine2:  z.string().optional(),
  city:          z.string().min(1, 'City is required'),
  county:        z.string().optional(),
  postcode:      z.string().min(1, 'Postcode is required').max(10),
  country:       z.string(),

  // HMO
  hmoLicenceRequired:  z.boolean(),
  hmoLicenceNumber:    z.string().max(100).optional(),
  hmoLicenceExpiry:    z.string().optional(),
  hmoMaxOccupants:     z.preprocess(
    v => (v === '' || v === null || v === undefined) ? undefined : Number(v),
    z.number().int().positive().optional()
  ),

  // PRS
  prsRegistered:           z.boolean(),
  prsRegistrationNumber:   z.string().max(100).optional(),
  prsRegistrationDate:     z.string().optional(),

  // Details
  totalRooms:     z.coerce.number().int().min(0),
  totalBathrooms: z.coerce.number().int().min(0),
})

type FormData = z.infer<typeof schema>

// ── Small reusable field components ──────────────────────────────────────────
function Field({ label, error, required, children }: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function TextInput({ error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      {...props}
      className={`w-full h-10 px-3 rounded-lg border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent transition ${
        error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
      }`}
    />
  )
}

function Select({ error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select
      {...props}
      className={`w-full h-10 px-3 rounded-lg border text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent transition appearance-none bg-white ${
        error ? 'border-red-400' : 'border-gray-300'
      }`}
    >
      {children}
    </select>
  )
}

function Toggle({ label, description, checked, onChange }: {
  label: string
  description?: string
  checked: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 ${
          checked ? 'bg-sky-300' : 'bg-gray-200'
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  )
}

function Section({ title, children, collapsible = false }: {
  title: string
  children: React.ReactNode
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-6 py-4 ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {collapsible && (open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AddPropertyPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [photos, setPhotos] = useState<PhotoPreview[]>([])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      status: 'active',
      isHmo: false,
      hmoLicenceRequired: false,
      prsRegistered: false,
      totalRooms: 0,
      totalBathrooms: 0,
      country: 'United Kingdom',
    },
  })

  const propertyType      = watch('propertyType')
  const isHmo             = propertyType === 'hmo'
  const hmoLicRequired    = watch('hmoLicenceRequired')
  const prsRegistered     = watch('prsRegistered')

  const mutation = useMutation({
    mutationFn: createProperty,
    onSuccess: async (property) => {
      // Upload any photos after property is created
      if (photos.length > 0) {
        await Promise.all(
          photos.map(p => uploadDocument(property.id, p.file, 'photo').catch(() => null))
        )
      }
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast('Property Created Successfully', {
        style: {
          background: '#e0f4fa',
          border: '1px solid #7ab8d0',
          color: '#1e6a85',
          fontWeight: '500',
        },
      })
      navigate('/app/properties')
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string; message?: string } } })
          ?.response?.data?.error ??
        (err as { response?: { data?: { error?: string; message?: string } } })
          ?.response?.data?.message ??
        'Failed to add property. Please try again.'
      toast.error(message)
    },
  })

  const onSubmit = (data: FormData & Record<string, unknown>) => {
    mutation.mutate({
      ...data,
      // isHmo derived from propertyType
      isHmo,
      // Strip HMO fields if not HMO
      hmoLicenceRequired: isHmo ? data.hmoLicenceRequired : undefined,
      hmoLicenceNumber:   isHmo ? (data.hmoLicenceNumber || undefined) : undefined,
      hmoLicenceExpiry:   isHmo ? (data.hmoLicenceExpiry || undefined)  : undefined,
      hmoMaxOccupants:    isHmo ? data.hmoMaxOccupants    : undefined,
      // Strip PRS fields if not registered
      prsRegistrationNumber: prsRegistered ? (data.prsRegistrationNumber || undefined) : undefined,
      prsRegistrationDate:   prsRegistered ? (data.prsRegistrationDate || undefined)   : undefined,
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Add property</h2>
          <p className="text-sm text-gray-500">Fill in the details below to add a new property.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* ── Basic Info ──────────────────────────────────────────────── */}
        <Section title="Basic information">
          <Field label="Property name" error={errors.propertyName?.message}>
            <TextInput
              {...register('propertyName')}
              placeholder="e.g. Maple House"
              error={errors.propertyName?.message}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Property type" required error={errors.propertyType?.message}>
              <Select {...register('propertyType')} error={errors.propertyType?.message}>
                <option value="">Select type…</option>
                <option value="house">House</option>
                <option value="flat">Flat</option>
                <option value="hmo">HMO</option>
                <option value="other">Other</option>
              </Select>
            </Field>

            <Field label="Status" error={errors.status?.message}>
              <Select {...register('status')} error={errors.status?.message}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>

        </Section>

        {/* ── Address ─────────────────────────────────────────────────── */}
        <Section title="Address">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Door / flat no." error={errors.doorNumber?.message}>
              <TextInput
                {...register('doorNumber')}
                placeholder="e.g. 12A"
                error={errors.doorNumber?.message}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Address line 1" required error={errors.addressLine1?.message}>
                <TextInput
                  {...register('addressLine1')}
                  placeholder="Street name"
                  error={errors.addressLine1?.message}
                />
              </Field>
            </div>
          </div>

          <Field label="Address line 2" error={errors.addressLine2?.message}>
            <TextInput
              {...register('addressLine2')}
              placeholder="Area, district (optional)"
              error={errors.addressLine2?.message}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City" required error={errors.city?.message}>
              <TextInput
                {...register('city')}
                placeholder="e.g. Manchester"
                error={errors.city?.message}
              />
            </Field>
            <Field label="County" error={errors.county?.message}>
              <TextInput
                {...register('county')}
                placeholder="e.g. Greater Manchester"
                error={errors.county?.message}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Postcode" required error={errors.postcode?.message}>
              <TextInput
                {...register('postcode')}
                placeholder="e.g. M1 1AA"
                className="uppercase"
                error={errors.postcode?.message}
              />
            </Field>
            <Field label="Country" error={errors.country?.message}>
              <TextInput
                {...register('country')}
                error={errors.country?.message}
              />
            </Field>
          </div>
        </Section>

        {/* ── HMO Details (conditional) ────────────────────────────────── */}
        {isHmo && (
          <Section title="HMO details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Max occupants" error={errors.hmoMaxOccupants?.message}>
                <TextInput
                  type="number"
                  min={1}
                  {...register('hmoMaxOccupants')}
                  placeholder="e.g. 6"
                  error={errors.hmoMaxOccupants?.message}
                />
              </Field>
            </div>

            <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg px-4">
              <Toggle
                label="HMO licence required"
                description="Mandatory for properties with 5+ tenants (large HMO)"
                checked={hmoLicRequired}
                onChange={(v) => setValue('hmoLicenceRequired', v)}
              />
            </div>

            {hmoLicRequired && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Licence number" error={errors.hmoLicenceNumber?.message}>
                  <TextInput
                    {...register('hmoLicenceNumber')}
                    placeholder="e.g. HMO/2024/001234"
                    error={errors.hmoLicenceNumber?.message}
                  />
                </Field>
                <Field label="Licence expiry" error={errors.hmoLicenceExpiry?.message}>
                  <TextInput
                    type="date"
                    {...register('hmoLicenceExpiry')}
                    error={errors.hmoLicenceExpiry?.message}
                  />
                </Field>
              </div>
            )}
          </Section>
        )}

        {/* ── PRS Registration ─────────────────────────────────────────── */}
        <Section title="PRS Registration" collapsible>
          <p className="text-xs text-gray-500 -mt-2">
            Required under the Renters' Rights Act 2025. Landlords must register all properties on the government's Private Rented Sector database.
          </p>

          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg px-4">
            <Toggle
              label="Registered on PRS database"
              checked={prsRegistered}
              onChange={(v) => setValue('prsRegistered', v)}
            />
          </div>

          {prsRegistered && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Registration number" error={errors.prsRegistrationNumber?.message}>
                <TextInput
                  {...register('prsRegistrationNumber')}
                  placeholder="e.g. PRS-2024-001234"
                  error={errors.prsRegistrationNumber?.message}
                />
              </Field>
              <Field label="Registration date" error={errors.prsRegistrationDate?.message}>
                <TextInput
                  type="date"
                  {...register('prsRegistrationDate')}
                  error={errors.prsRegistrationDate?.message}
                />
              </Field>
            </div>
          )}
        </Section>

        {/* ── Property details — hidden for HMO (rooms managed separately) */}
        {!isHmo && (
          <Section title="Property details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Total rooms" error={errors.totalRooms?.message}>
                <TextInput
                  type="number"
                  min={0}
                  {...register('totalRooms')}
                  error={errors.totalRooms?.message}
                />
              </Field>
              <Field label="Total bathrooms" error={errors.totalBathrooms?.message}>
                <TextInput
                  type="number"
                  min={0}
                  {...register('totalBathrooms')}
                  error={errors.totalBathrooms?.message}
                />
              </Field>
            </div>
          </Section>
        )}

        {isHmo && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-sky-50 border border-sky-200 text-sm text-sky-700">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
            </svg>
            Rooms and bathrooms are managed individually for HMO properties and can be added after saving.
          </div>
        )}

        {/* ── Photos ───────────────────────────────────────────────────── */}
        <Section title="Property photos">
          <p className="text-xs text-gray-500 -mt-2">Upload exterior and interior photos of the property.</p>
          <PhotoUploader photos={photos} onChange={setPhotos} label="" />
        </Section>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pb-6">
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
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Add property'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
