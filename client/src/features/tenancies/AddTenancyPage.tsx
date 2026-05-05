import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Check, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getProperties } from '@/api/properties'
import { getRooms } from '@/api/rooms'
import { getTenantUsers, createTenantUser, createTenancy } from '@/api/tenancies'
import type { Property } from '@/types/property'
import type { Room } from '@/api/rooms'
import type { TenantUser, CreateTenancyPayload, TenancyType, RentFrequency, DepositScheme } from '@/types/tenancy'

// ── helpers ───────────────────────────────────────────────────────────────────

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white',
        props.disabled ? 'bg-gray-50 text-gray-400' : 'border-gray-200',
        props.className
      )}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={cn(
        'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white',
        props.className
      )}
    />
  )
}

// ── step types ────────────────────────────────────────────────────────────────

type TenantMode = 'new' | 'existing'

interface FormState {
  // Step 1 — Tenant
  tenantMode: TenantMode
  existingTenantId: string
  givenName: string
  middleName: string
  lastName: string
  email: string
  phone: string
  password: string
  // resolved after step 1 save
  resolvedTenantId: string
  resolvedTenantName: string

  // Step 2 — Property & Room
  propertyId: string
  roomId: string

  // Step 3 — Terms
  startDate: string
  endDate: string
  tenancyType: TenancyType
  noticePeriodWeeks: number

  // Step 4 — Rent & Deposit
  rentAmount: string
  rentFrequency: RentFrequency
  rentDueDay: number
  depositAmount: string
  depositScheme: DepositScheme | ''
  depositReference: string
  depositPaidDate: string
}

const INITIAL: FormState = {
  tenantMode: 'new',
  existingTenantId: '',
  givenName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  resolvedTenantId: '',
  resolvedTenantName: '',

  propertyId: '',
  roomId: '',

  startDate: '',
  endDate: '',
  tenancyType: 'periodic',
  noticePeriodWeeks: 4,

  rentAmount: '',
  rentFrequency: 'monthly',
  rentDueDay: 1,
  depositAmount: '',
  depositScheme: '',
  depositReference: '',
  depositPaidDate: '',
}

const STEPS = ['Tenant', 'Property & Room', 'Tenancy Terms', 'Rent & Deposit', 'Review']

// ── Step 1: Tenant ────────────────────────────────────────────────────────────

function Step1Tenant({
  form,
  setForm,
  tenants,
  onNext,
  isCreating,
  draftCreated,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  tenants: TenantUser[]
  onNext: () => void
  isCreating: boolean
  draftCreated: boolean
}) {
  const [showPass, setShowPass] = useState(false)
  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const canProceed =
    form.tenantMode === 'existing'
      ? Boolean(form.existingTenantId)
      : Boolean(form.givenName && form.lastName && form.email && form.phone && form.password.length >= 8)

  return (
    <div className="space-y-5">
      {/* Draft notice — shown when a tenant was already created in this session */}
      {draftCreated && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <span className="shrink-0 mt-0.5">ℹ</span>
          <span>
            A tenant account was already created for <strong>{form.resolvedTenantName}</strong>. Find them under <strong>Existing tenants</strong> to continue without creating a duplicate.
          </span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['new', 'existing'] as TenantMode[]).map(m => (
          <button
            key={m}
            onClick={() => setForm(f => ({ ...f, tenantMode: m }))}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
              form.tenantMode === m
                ? 'bg-sky-500 text-white border-sky-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'
            )}
          >
            {m === 'new' ? 'New tenant' : 'Existing tenant'}
          </button>
        ))}
      </div>

      {form.tenantMode === 'existing' ? (
        <div>
          <FieldLabel required>Select tenant</FieldLabel>
          <Select value={form.existingTenantId} onChange={set('existingTenantId')}>
            <option value="">— choose a tenant —</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>
                {t.givenName} {t.lastName} — {t.email}
              </option>
            ))}
          </Select>
          {tenants.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No tenant accounts found. Create a new one instead.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>First name</FieldLabel>
              <Input value={form.givenName} onChange={set('givenName')} placeholder="e.g. Sarah" />
            </div>
            <div>
              <FieldLabel>Middle name</FieldLabel>
              <Input value={form.middleName} onChange={set('middleName')} placeholder="Optional" />
            </div>
          </div>
          <div>
            <FieldLabel required>Last name</FieldLabel>
            <Input value={form.lastName} onChange={set('lastName')} placeholder="e.g. Johnson" />
          </div>
          <div>
            <FieldLabel required>Email address</FieldLabel>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="tenant@example.com" />
          </div>
          <div>
            <FieldLabel required>Phone</FieldLabel>
            <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="e.g. 07700 900000" />
          </div>
          <div>
            <FieldLabel required>Temporary password</FieldLabel>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, password: generatePassword() }))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-sky-300 hover:text-sky-600 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Generate
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Share this with the tenant — they can change it after logging in.</p>
          </div>
        </div>
      )}

      <div className="pt-2">
        <button
          onClick={onNext}
          disabled={!canProceed || isCreating}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating tenant…' : 'Continue'}
          {!isCreating && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Property & Room ───────────────────────────────────────────────────

function Step2Property({
  form,
  setForm,
  properties,
  rooms,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  properties: Property[]
  rooms: Room[]
}) {
  const selectedProperty = properties.find(p => p.id === form.propertyId)
  const isHmo = selectedProperty?.propertyType === 'hmo' || selectedProperty?.isHmo
  const allPropertyRooms = rooms.filter(r => r.propertyId === form.propertyId)
  const availableRooms = allPropertyRooms.filter(r => r.isAvailable)
  const occupiedRooms = allPropertyRooms.filter(r => !r.isAvailable)

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Property</FieldLabel>
        <Select
          value={form.propertyId}
          onChange={e => setForm(f => ({ ...f, propertyId: e.target.value, roomId: '' }))}
        >
          <option value="">— select a property —</option>
          {properties.filter(p => p.status === 'active').map(p => (
            <option key={p.id} value={p.id}>
              {p.propertyName ?? `${p.doorNumber ? p.doorNumber + ' ' : ''}${p.addressLine1}`}, {p.city}
            </option>
          ))}
        </Select>
      </div>

      {isHmo && (
        <div>
          <FieldLabel required>Room</FieldLabel>
          <Select
            value={form.roomId}
            onChange={e => setForm(f => ({ ...f, roomId: e.target.value }))}
            disabled={allPropertyRooms.length === 0}
          >
            <option value="">— select a room —</option>
            {availableRooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.roomName ?? `Room ${r.roomNumber}`}
                {r.rentAmount ? ` — £${r.rentAmount}/mo` : ''}
              </option>
            ))}
            {occupiedRooms.length > 0 && (
              <optgroup label="Currently occupied">
                {occupiedRooms.map(r => (
                  <option key={r.id} value={r.id} disabled>
                    {r.roomName ?? `Room ${r.roomNumber}`} (Occupied)
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          {availableRooms.length === 0 && allPropertyRooms.length > 0 && form.propertyId && (
            <p className="text-xs text-orange-500 mt-1">All rooms in this property are currently occupied.</p>
          )}
          {allPropertyRooms.length === 0 && form.propertyId && (
            <p className="text-xs text-orange-500 mt-1">No rooms found for this property.</p>
          )}
          {form.roomId && availableRooms.find(r => r.id === form.roomId)?.rentAmount && (
            <p className="text-xs text-gray-500 mt-1">
              Room rent: £{availableRooms.find(r => r.id === form.roomId)!.rentAmount}/mo
            </p>
          )}
        </div>
      )}

      {form.propertyId && (
        <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-xs text-sky-700">
          Tenant: <span className="font-semibold">{form.resolvedTenantName}</span>
        </div>
      )}
    </div>
  )
}

// ── Step 3: Tenancy Terms ─────────────────────────────────────────────────────

function Step3Terms({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Tenancy type</FieldLabel>
        <div className="flex gap-2">
          {([
            { value: 'periodic', label: 'Periodic', sub: 'Rolling, no fixed end' },
            { value: 'fixed',    label: 'Fixed term', sub: 'Set end date' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, tenancyType: opt.value, endDate: opt.value === 'periodic' ? '' : f.endDate }))}
              className={cn(
                'flex-1 px-3 py-2.5 rounded-lg border text-left transition-colors',
                form.tenancyType === opt.value
                  ? 'border-sky-400 bg-sky-50'
                  : 'border-gray-200 hover:border-sky-200'
              )}
            >
              <p className={cn('text-sm font-medium', form.tenancyType === opt.value ? 'text-sky-700' : 'text-gray-800')}>
                {opt.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
            </button>
          ))}
        </div>
      </div>

      <div className={form.tenancyType === 'fixed' ? 'grid grid-cols-2 gap-3' : ''}>
        <div>
          <FieldLabel required>Start date</FieldLabel>
          <Input type="date" value={form.startDate} onChange={set('startDate')} />
        </div>
        {form.tenancyType === 'fixed' && (
          <div>
            <FieldLabel required>End date</FieldLabel>
            <Input
              type="date"
              value={form.endDate}
              onChange={set('endDate')}
              min={form.startDate}
            />
          </div>
        )}
      </div>


      <div>
        <FieldLabel required>Notice period</FieldLabel>
        <Select
          value={form.noticePeriodWeeks}
          onChange={e => setForm(f => ({ ...f, noticePeriodWeeks: Number(e.target.value) }))}
        >
          <option value={2}>2 weeks</option>
          <option value={4}>4 weeks (standard)</option>
          <option value={8}>8 weeks</option>
          <option value={12}>12 weeks</option>
          <option value={13}>13 weeks (3 months)</option>
        </Select>
      </div>
    </div>
  )
}

// ── Step 4: Rent & Deposit ────────────────────────────────────────────────────

function Step4Rent({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div className="space-y-5">
      {/* Rent section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Rent</h3>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Rent amount (£)</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.rentAmount}
              onChange={set('rentAmount')}
              placeholder="e.g. 750"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Frequency</FieldLabel>
              <Select value={form.rentFrequency} onChange={set('rentFrequency')}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
              </Select>
            </div>
            <div>
              <FieldLabel required>Due day of month</FieldLabel>
              <Input
                type="number"
                min={1}
                max={28}
                value={form.rentDueDay}
                onChange={e => setForm(f => ({ ...f, rentDueDay: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Deposit section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Deposit</h3>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Deposit amount (£)</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.depositAmount}
              onChange={set('depositAmount')}
              placeholder="e.g. 1500"
            />
          </div>
          <div>
            <FieldLabel required>Deposit scheme</FieldLabel>
            <Select value={form.depositScheme} onChange={set('depositScheme')}>
              <option value="">— select scheme —</option>
              <option value="DPS">Deposit Protection Service (DPS)</option>
              <option value="MyDeposits">MyDeposits</option>
              <option value="TDS">Tenancy Deposit Scheme (TDS)</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <FieldLabel required>Deposit reference</FieldLabel>
            <Input
              value={form.depositReference}
              onChange={set('depositReference')}
              placeholder="Scheme reference number"
            />
          </div>
          <div>
            <FieldLabel>Date deposit received</FieldLabel>
            <Input type="date" value={form.depositPaidDate} onChange={set('depositPaidDate')} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 5: Review ────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-900 text-right">{value || '—'}</span>
    </div>
  )
}

function Step5Review({ form, properties, rooms }: { form: FormState; properties: Property[]; rooms: Room[] }) {
  const property = properties.find(p => p.id === form.propertyId)
  const room = rooms.find(r => r.id === form.roomId)
  const propertyDisplay = property
    ? (property.propertyName ?? `${property.doorNumber ? property.doorNumber + ' ' : ''}${property.addressLine1}`)
    : '—'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Tenant
        </div>
        <div className="px-4 py-1">
          <ReviewRow label="Name" value={form.resolvedTenantName} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Property
        </div>
        <div className="px-4 py-1">
          <ReviewRow label="Property" value={propertyDisplay} />
          {room && <ReviewRow label="Room" value={room.roomName ?? `Room ${room.roomNumber}`} />}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Tenancy Terms
        </div>
        <div className="px-4 py-1">
          <ReviewRow label="Start date" value={form.startDate} />
          <ReviewRow label="End date" value={form.endDate || (form.tenancyType === 'periodic' ? 'Rolling — no fixed end' : '—')} />
          <ReviewRow label="Tenancy type" value={form.tenancyType === 'fixed' ? 'Fixed term' : 'Periodic (rolling)'} />
          <ReviewRow label="Notice period" value={`${form.noticePeriodWeeks} weeks`} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Rent & Deposit
        </div>
        <div className="px-4 py-1">
          <ReviewRow label="Rent" value={`£${form.rentAmount} / ${form.rentFrequency}`} />
          <ReviewRow label="Due day" value={`${form.rentDueDay}${form.rentFrequency === 'monthly' ? 'st/nd/rd of month' : ''}`} />
          {form.depositAmount && (
            <>
              <ReviewRow label="Deposit" value={`£${form.depositAmount}`} />
              {form.depositScheme && <ReviewRow label="Scheme" value={form.depositScheme} />}
              {form.depositReference && <ReviewRow label="Reference" value={form.depositReference} />}
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Tenancy will be created with status <span className="font-semibold text-yellow-600">Pending</span>. You can advance it to Onboarding once documents are signed.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AddTenancyPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>({ ...INITIAL, password: generatePassword() })

  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties(),
  })

  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: getTenantUsers,
  })

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => getRooms(),
  })

  // Create tenant user mutation (runs when moving from step 1 for 'new' mode)
  const createTenantMutation = useMutation({
    mutationFn: createTenantUser,
    onSuccess: (user) => {
      setForm(f => ({
        ...f,
        resolvedTenantId: user.id,
        resolvedTenantName: `${user.givenName} ${user.lastName}`,
      }))
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setStep(1)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to create tenant account')
    },
  })

  // Create tenancy mutation (final submit)
  const createTenancyMutation = useMutation({
    mutationFn: createTenancy,
    onSuccess: (tenancy) => {
      queryClient.invalidateQueries({ queryKey: ['tenancies'] })
      toast.success('Tenancy created successfully')
      navigate(`/app/tenancies/${tenancy.id}`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to create tenancy')
    },
  })

  // ── Step navigation ──────────────────────────────────────────────────────────

  function handleStep0Next() {
    if (form.tenantMode === 'existing') {
      const tenant = tenants.find(t => t.id === form.existingTenantId)!
      setForm(f => ({
        ...f,
        resolvedTenantId: tenant.id,
        resolvedTenantName: `${tenant.givenName} ${tenant.lastName}`,
      }))
      setStep(1)
    } else {
      createTenantMutation.mutate({
        givenName: form.givenName,
        middleName: form.middleName || undefined,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      })
    }
  }

  function handleSubmit() {
    const payload: CreateTenancyPayload = {
      tenantId: form.resolvedTenantId,
      propertyId: form.propertyId,
      roomId: form.roomId || undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      tenancyType: form.tenancyType,
      noticePeriodWeeks: form.noticePeriodWeeks,
      rentAmount: parseFloat(form.rentAmount),
      rentFrequency: form.rentFrequency,
      rentDueDay: form.rentDueDay,
      depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
      depositScheme: (form.depositScheme as DepositScheme) || undefined,
      depositReference: form.depositReference || undefined,
      depositPaidDate: form.depositPaidDate || undefined,
    }
    createTenancyMutation.mutate(payload)
  }

  // ── Validation per step ──────────────────────────────────────────────────────

  const selectedPropertyForValidation = properties.find(p => p.id === form.propertyId)
  const isHmoProperty = selectedPropertyForValidation?.propertyType === 'hmo' || selectedPropertyForValidation?.isHmo
  const step2Valid = Boolean(form.propertyId) && (!isHmoProperty || Boolean(form.roomId))
  const step3Valid = Boolean(form.startDate)
  const step4Valid = Boolean(
    form.rentAmount && parseFloat(form.rentAmount) > 0 &&
    form.depositAmount && parseFloat(form.depositAmount) > 0 &&
    form.depositScheme &&
    form.depositReference.trim()
  )

  function canAdvance() {
    if (step === 1) return step2Valid
    if (step === 2) return step3Valid
    if (step === 3) return step4Valid
    return true
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/app/tenancies')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to tenancies
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-6">New tenancy</h1>

      {/* Step progress */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((label, i) => {
          const isComplete = i < step
          const isCurrent = i === step
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => isComplete && setStep(i)}
                  disabled={!isComplete}
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    isComplete
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer'
                      : isCurrent
                        ? 'bg-sky-500 text-white cursor-default'
                        : 'bg-gray-100 text-gray-400 cursor-default'
                  )}
                  title={isComplete ? `Go back to ${label}` : undefined}
                >
                  {isComplete ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </button>
                <span className={cn(
                  'text-xs whitespace-nowrap',
                  isCurrent ? 'text-sky-600 font-medium' : isComplete ? 'text-emerald-600' : 'text-gray-400'
                )}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-px mx-1 mb-4', isComplete ? 'bg-emerald-300' : 'bg-gray-200')} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {step === 0 && (
          <Step1Tenant
            form={form}
            setForm={setForm}
            tenants={tenants}
            onNext={handleStep0Next}
            isCreating={createTenantMutation.isPending}
            draftCreated={Boolean(form.resolvedTenantId) && form.tenantMode === 'new'}
          />
        )}
        {step === 1 && (
          <Step2Property form={form} setForm={setForm} properties={properties} rooms={rooms} />
        )}
        {step === 2 && (
          <Step3Terms form={form} setForm={setForm} />
        )}
        {step === 3 && (
          <Step4Rent form={form} setForm={setForm} />
        )}
        {step === 4 && (
          <Step5Review form={form} properties={properties} rooms={rooms} />
        )}

        {/* Nav buttons (steps 1–4) */}
        {step > 0 && (
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={createTenancyMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {createTenancyMutation.isPending ? 'Creating…' : 'Create tenancy'}
                {!createTenancyMutation.isPending && <Check className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
