import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, User, Home, MapPin, Calendar, PoundSterling,
  ShieldCheck, ChevronRight, CheckCircle2, Circle, AlertCircle, X, Check,
  Mail, FileSignature, Upload, Copy, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getTenancy, transitionTenancy, updateTenancyCompliance } from '@/api/tenancies'
import { uploadDocument, getPropertyDocuments } from '@/api/documents'
import { getSmartAlerts } from '@/api/notifications'
import { getTransactions } from '@/api/transactions'
import type { Tenancy, LifecycleStatus } from '@/types/tenancy'
import type { Transaction } from '@/types/transaction'

// ── Email template ────────────────────────────────────────────────────────────

function buildContractEmail(tenancy: Tenancy): { subject: string; body: string } {
  const propertyDisplay = tenancy.property.name || tenancy.property.address
  const fullAddress = `${propertyDisplay}, ${tenancy.property.postcode}`
  const roomLine = tenancy.roomName ? `\nRoom: ${tenancy.roomName}` : ''
  const rentLine = `£${Number(tenancy.rentAmount).toLocaleString('en-GB')} per ${tenancy.rentFrequency}`
  const depositLine = tenancy.depositAmount
    ? `£${Number(tenancy.depositAmount).toLocaleString('en-GB')}`
    : 'N/A'
  const startDate = new Date(tenancy.startDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const subject = `Your Tenancy Agreement – ${propertyDisplay}`

  const body = `Dear ${tenancy.tenant.name},

I hope this message finds you well.

Please find attached your Assured Shorthold Tenancy Agreement (AST) for the property detailed below. Kindly read through the agreement in full before signing.

─────────────────────────────
TENANCY DETAILS
─────────────────────────────
Property:    ${fullAddress}${roomLine}
Start date:  ${startDate}${tenancy.endDate ? `\nEnd date:    ${new Date(tenancy.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : '\nTenancy type: Periodic (rolling)'}
Rent:        ${rentLine}
Deposit:     ${depositLine}
─────────────────────────────

TO PROCEED:
1. Read the attached tenancy agreement carefully.
2. Sign all pages where indicated and initial any amendments.
3. Return a signed copy to this email address.
4. Ensure your deposit of ${depositLine} is paid prior to your move-in date.

If you have any questions regarding the agreement or any of the terms, please do not hesitate to get in touch before signing.

We look forward to welcoming you as a tenant.

Kind regards,
[Landlord Name]
[Contact Number]
[Email Address]`

  return { subject, body }
}

// ── Contract email modal ──────────────────────────────────────────────────────

function ContractEmailModal({
  tenancy,
  onClose,
}: {
  tenancy: Tenancy
  onClose: () => void
}) {
  const { subject, body } = buildContractEmail(tenancy)
  const mailtoHref = `mailto:${tenancy.tenant.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  function copyBody() {
    navigator.clipboard.writeText(body)
    toast.success('Email body copied to clipboard')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-semibold text-gray-900">Contract email — draft</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Email preview */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
            <p className="text-xs text-gray-400">To</p>
            <p className="text-sm text-gray-800">{tenancy.tenant.email}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
            <p className="text-xs text-gray-400">Subject</p>
            <p className="text-sm text-gray-800">{subject}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400 mb-2">Body</p>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{body}</pre>
          </div>
          <p className="text-xs text-gray-400 italic">
            Remember to attach the signed tenancy agreement PDF before sending.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={copyBody}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy body
          </button>
          <a
            href={mailtoHref}
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors"
          >
            <Mail className="w-4 h-4" />
            Open in email client
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Section 8 grounds (Serve Notice) ─────────────────────────────────────────

interface S8Ground {
  value: string
  label: string
  groundRef: string
  type: 'mandatory' | 'discretionary'
  noticeWeeks: number
  courtRequired: boolean
  requiredDocs: string[]
  detailLabel: string
  detailPlaceholder: string
  legalNote: string
}

const S8_GROUNDS: S8Ground[] = [
  {
    value: 'ground_8',
    label: 'Rent Arrears (2+ Months)',
    groundRef: 'Ground 8 — Mandatory',
    type: 'mandatory',
    noticeWeeks: 4,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Rent account statement showing arrears'],
    detailLabel: 'Total Rent Arrears (£)',
    detailPlaceholder: 'e.g. 2400',
    legalNote: 'Arrears must be at least 2 months (monthly tenancy) at both notice date and court hearing date. Court must grant possession if proved.',
  },
  {
    value: 'ground_10_11',
    label: 'Rent Arrears (Persistent / Less Than 2 Months)',
    groundRef: 'Grounds 10 & 11 — Discretionary',
    type: 'discretionary',
    noticeWeeks: 4,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Rent account statement', 'Payment history showing persistent late payment'],
    detailLabel: 'Description Of Arrears / Late Payment History',
    detailPlaceholder: 'Describe the pattern of late payments and current arrears amount…',
    legalNote: 'Discretionary — court may refuse possession even if proved. Strongest with documented history of persistent late payment.',
  },
  {
    value: 'ground_7a',
    label: 'Serious Anti-Social Behaviour / Criminal Conviction',
    groundRef: 'Ground 7A — Mandatory (Absolute)',
    type: 'mandatory',
    noticeWeeks: 0,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Evidence of conviction or closure order or noise abatement notice'],
    detailLabel: 'Description Of Behaviour And Supporting Evidence',
    detailPlaceholder: 'Reference any conviction, ASB order, noise abatement notice, or closure order…',
    legalNote: 'Absolute mandatory ground — court has no discretion. Requires a relevant conviction or statutory order. Notice can be immediate for most triggers.',
  },
  {
    value: 'ground_14',
    label: 'Anti-Social Behaviour / Nuisance (No Conviction)',
    groundRef: 'Ground 14 — Discretionary',
    type: 'discretionary',
    noticeWeeks: 2,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Incident logs with dates and times', 'Witness statements if available', 'Correspondence with tenant about behaviour'],
    detailLabel: 'Details Of Incidents',
    detailPlaceholder: 'Log each incident with date, time, nature of behaviour, and any witnesses…',
    legalNote: 'Discretionary. Courts expect evidence of persistent behaviour and that the landlord has first warned the tenant in writing.',
  },
  {
    value: 'ground_13',
    label: 'Deterioration Of Property / Damage',
    groundRef: 'Ground 13 — Discretionary',
    type: 'discretionary',
    noticeWeeks: 4,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Inventory / check-in report', 'Dated photographs of damage', 'Repair cost estimates'],
    detailLabel: 'Description Of Damage',
    detailPlaceholder: 'Describe the damage, areas affected, and estimated cost of repair…',
    legalNote: 'Discretionary. Condition must have deteriorated through neglect or deliberate damage by tenant or visitors. Evidence of original condition (inventory) is essential.',
  },
  {
    value: 'ground_12',
    label: 'Breach Of Tenancy Agreement',
    groundRef: 'Ground 12 — Discretionary',
    type: 'discretionary',
    noticeWeeks: 4,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Copy of tenancy agreement', 'Written evidence of breach', 'Written warning(s) sent to tenant'],
    detailLabel: 'Which Clause(s) Were Breached And How',
    detailPlaceholder: 'Quote the specific clause and describe the breach with dates…',
    legalNote: 'Discretionary. Includes illegal subletting. Courts expect the landlord to have issued a written warning before seeking possession.',
  },
  {
    value: 'ground_1',
    label: 'Landlord Or Family Member Requires Property',
    groundRef: 'Ground 1 — Mandatory',
    type: 'mandatory',
    noticeWeeks: 16,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Written statement of intention to occupy', 'Evidence of relationship (if family member)'],
    detailLabel: 'Who Is Moving In And Their Relationship To The Landlord',
    detailPlaceholder: 'e.g. Landlord intends to return to occupy as main residence / landlord\'s daughter…',
    legalNote: 'Mandatory — 4 months minimum notice required (Renters\' Rights Act 2025). Landlord must genuinely intend to occupy. Cannot be used to re-let immediately.',
  },
  {
    value: 'ground_1a',
    label: 'Landlord Intends To Sell',
    groundRef: 'Ground 1A — Mandatory (Renters\' Rights Act 2025)',
    type: 'mandatory',
    noticeWeeks: 16,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Evidence of intent to sell (e.g. estate agent instruction letter)', 'Written confirmation property will be marketed'],
    detailLabel: 'Details Of Intended Sale',
    detailPlaceholder: 'Describe the intention to sell, expected timeline, and any estate agent involvement…',
    legalNote: 'New mandatory ground under the Renters\' Rights Act 2025. 4 months minimum notice. Landlord cannot re-let for at least 3 months after possession.',
  },
  {
    value: 'ground_6',
    label: 'Redevelopment Or Major Structural Works',
    groundRef: 'Ground 6 — Mandatory',
    type: 'mandatory',
    noticeWeeks: 16,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Planning permission or building regulations approval', 'Architect/contractor confirmation works cannot proceed with tenant in occupation'],
    detailLabel: 'Description Of Planned Works',
    detailPlaceholder: 'Describe the works, why vacant possession is required, and expected timeline…',
    legalNote: '4 months minimum notice. Works must require vacant possession — cannot use this ground for minor repairs. Planning permission or equivalent should be in place.',
  },
  {
    value: 'ground_17',
    label: 'Tenancy Obtained By False Statement',
    groundRef: 'Ground 17 — Discretionary',
    type: 'discretionary',
    noticeWeeks: 4,
    courtRequired: true,
    requiredDocs: ['Section 8 Notice (Form 3)', 'Copy of original tenancy application', 'Evidence of false statement (e.g. forged references, false income declaration)'],
    detailLabel: 'Details Of The False Statement',
    detailPlaceholder: 'Describe what was falsely stated and how it was discovered…',
    legalNote: 'Discretionary. The false statement must have been made by the tenant (or at their instigation) to induce the landlord to grant the tenancy.',
  },
]

// ── Serve Notice modal ────────────────────────────────────────────────────────

function ServeNoticeModal({
  tenancy,
  onConfirm,
  onClose,
  isSubmitting,
}: {
  tenancy: Tenancy
  onConfirm: (ground: string, details: string, noticeDateServed: string) => void
  onClose: () => void
  isSubmitting: boolean
}) {
  const [groundValue, setGroundValue] = useState('')
  const [details, setDetails]         = useState('')
  const [servedDate, setServedDate]   = useState(new Date().toISOString().split('T')[0])
  const [confirmed, setConfirmed]     = useState(false)

  const ground = S8_GROUNDS.find(g => g.value === groundValue)

  const earliestPossession = ground && servedDate
    ? (() => {
        const d = new Date(servedDate)
        d.setDate(d.getDate() + ground.noticeWeeks * 7)
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      })()
    : null

  const canSubmit = groundValue && details.trim().length >= 10 && servedDate && confirmed

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Serve Notice — Section 8</h2>
            <p className="text-xs text-gray-400 mt-0.5">{tenancy.tenant.name} · {tenancy.property.name || tenancy.property.address}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Legal warning */}
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Important:</strong> Section 21 no-fault eviction is abolished (Renters' Rights Act 2025).
              All notices must use Section 8 with a valid legal ground. Changing locks or harassing a tenant to leave
              is a criminal offence under the Protection from Eviction Act 1977.
            </span>
          </div>

          {/* Ground selection */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Legal Ground <span className="text-red-400">*</span>
            </label>
            <select
              value={groundValue}
              onChange={e => { setGroundValue(e.target.value); setDetails('') }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
            >
              <option value="">— Select Legal Ground —</option>
              <optgroup label="Mandatory Grounds (Court Must Grant Possession)">
                {S8_GROUNDS.filter(g => g.type === 'mandatory').map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </optgroup>
              <optgroup label="Discretionary Grounds (Court May Grant Possession)">
                {S8_GROUNDS.filter(g => g.type === 'discretionary').map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Ground info card */}
          {ground && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-orange-700">{ground.groundRef}</span>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  ground.type === 'mandatory'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                )}>
                  {ground.type === 'mandatory' ? 'Mandatory' : 'Discretionary'}
                </span>
              </div>
              <p className="text-xs text-orange-700">{ground.legalNote}</p>
              <div className="flex items-center gap-4 pt-1 border-t border-orange-200">
                <div>
                  <p className="text-xs text-orange-500">Min. Notice Period</p>
                  <p className="text-xs font-semibold text-orange-800">
                    {ground.noticeWeeks === 0 ? 'Immediate (check with solicitor)' : `${ground.noticeWeeks} weeks`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-orange-500">Court Order Required</p>
                  <p className="text-xs font-semibold text-orange-800">{ground.courtRequired ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Required documents */}
          {ground && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Required Documents To Serve</p>
              <ul className="space-y-1">
                {ground.requiredDocs.map(doc => (
                  <li key={doc} className="flex items-start gap-2 text-xs text-gray-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0 mt-1.5" />
                    {doc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detail field */}
          {ground && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {ground.detailLabel} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder={ground.detailPlaceholder}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
            </div>
          )}

          {/* Date notice served */}
          {ground && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date Notice Served <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={servedDate}
                onChange={e => setServedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              {earliestPossession && (
                <p className="text-xs text-gray-500 mt-1">
                  Earliest possession date: <strong className="text-gray-700">{earliestPossession}</strong>
                </p>
              )}
            </div>
          )}

          {/* Confirmation checkbox */}
          {ground && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <span className="text-xs text-gray-600">
                I confirm I have served the Section 8 notice in writing to the tenant, using Form 3,
                and that I understand a court order is required before the tenant is legally required to vacate.
                I will not attempt to remove the tenant, change locks, or cut off utilities.
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(
              `${ground!.groundRef}: ${details}`,
              details,
              servedDate
            )}
            disabled={!canSubmit || isSubmitting}
            className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Recording…' : 'Record Notice Served'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cancel modal (admin only — not eviction) ──────────────────────────────────

const CANCEL_REASONS = [
  {
    value: 'mutual_surrender',
    label: 'Mutual Agreement / Early Surrender',
    detailLabel: 'Agreed Terms Of Surrender',
    detailPlaceholder: 'Summarise what was agreed between landlord and tenant. A Deed of Surrender should be signed by both parties.',
    legalNote: 'Both parties must agree in writing. A signed Deed of Surrender should be uploaded to documents.',
  },
  {
    value: 'entered_in_error',
    label: 'Entered In Error',
    detailLabel: 'Explanation',
    detailPlaceholder: 'Explain why this tenancy record should be removed…',
    legalNote: 'Use only if the tenancy was never legally formed or was entered incorrectly.',
  },
  {
    value: 'never_started',
    label: 'Tenancy Never Commenced',
    detailLabel: 'Reason',
    detailPlaceholder: 'Explain why the tenancy did not commence (e.g. tenant withdrew before move-in)…',
    legalNote: 'Use only if the tenant never took up occupation. If rent was paid, a formal surrender may be required.',
  },
]

function CancelModal({
  onConfirm,
  onClose,
  isSubmitting,
}: {
  onConfirm: (reason: string, details: string, description: string) => void
  onClose: () => void
  isSubmitting: boolean
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [description, setDescription] = useState('')

  const selected = CANCEL_REASONS.find(r => r.value === reason)
  const canSubmit = reason && details.trim().length >= 5 && description.trim().length >= 5

  function handleReasonChange(v: string) {
    setReason(v)
    setDetails('')
    setDescription('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Cancel Tenancy</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Legal note */}
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>This is not an eviction tool.</strong> If you need to end a tenancy where the tenant has not agreed to leave, use <strong>Serve Notice</strong> instead.
              Cancellation is only for admin situations where no legal notice is required.
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reason For Cancellation <span className="text-red-400">*</span>
            </label>
            <select
              value={reason}
              onChange={e => handleReasonChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
            >
              <option value="">— Select A Reason —</option>
              {CANCEL_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {selected && (
            <>
              {/* Legal note for selected reason */}
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {selected.legalNote}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {selected.detailLabel} <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder={selected.detailPlaceholder}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Any additional notes for the record…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors">
            Keep Tenancy
          </button>
          <button
            onClick={() => onConfirm(selected!.label, details, description)}
            disabled={!canSubmit || isSubmitting}
            className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Cancelling…' : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(n)
}

// ── Lifecycle tracker ─────────────────────────────────────────────────────────

const LIFECYCLE: LifecycleStatus[] = [
  'pending', 'onboarding', 'active', 'notice', 'offboarding', 'ended',
]

const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  pending:     'Pending',
  onboarding:  'Onboarding',
  active:      'Active',
  notice:      'Notice',
  offboarding: 'Offboarding',
  ended:       'Ended',
  cancelled:   'Cancelled',
}

const LIFECYCLE_COLOURS: Record<LifecycleStatus, string> = {
  pending:     'bg-yellow-400',
  onboarding:  'bg-blue-400',
  active:      'bg-emerald-500',
  notice:      'bg-orange-400',
  offboarding: 'bg-purple-400',
  ended:       'bg-gray-400',
  cancelled:   'bg-red-400',
}

function getComplianceBlockers(tenancy: Tenancy, hasSignedContract: boolean): string[] {
  if (tenancy.lifecycleStatus !== 'pending' && tenancy.lifecycleStatus !== 'onboarding') return []
  const blockers: string[] = []
  if (!tenancy.howToRentGuideProvided) blockers.push('How to Rent guide has not been provided')
  if (!tenancy.tenantInfoSheetProvided) blockers.push('Tenant Information Sheet has not been provided')
  if (tenancy.depositAmount && !tenancy.depositProtectedDate) blockers.push('Deposit has not been registered with a protection scheme')
  if (tenancy.lifecycleStatus === 'onboarding' && !hasSignedContract) blockers.push('Signed tenancy agreement has not been uploaded')
  return blockers
}

function LifecycleTracker({
  tenancy,
  onTransition,
  onCancel,
  onServeNotice,
  isTransitioning,
  hasSignedContract,
}: {
  tenancy: Tenancy
  onTransition: (next: LifecycleStatus) => void
  onCancel: () => void
  onServeNotice: () => void
  isTransitioning: boolean
  hasSignedContract: boolean
}) {
  const current = tenancy.lifecycleStatus

  if (current === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 shrink-0" />
        This tenancy has been cancelled.
      </div>
    )
  }

  const currentIdx = LIFECYCLE.indexOf(current)
  const nextStatus = LIFECYCLE[currentIdx + 1] as LifecycleStatus | undefined
  const blockers = getComplianceBlockers(tenancy, hasSignedContract)
  const isBlocked = blockers.length > 0

  return (
    <div className="space-y-3">
      {/* Track */}
      <div className="flex items-center gap-0">
        {LIFECYCLE.map((status, i) => {
          const done = i < currentIdx
          const isCurrent = i === currentIdx
          return (
            <div key={status} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center transition-colors',
                  done
                    ? 'bg-emerald-500'
                    : isCurrent
                      ? LIFECYCLE_COLOURS[status]
                      : 'bg-gray-200'
                )}>
                  {done
                    ? <Check className="w-3.5 h-3.5 text-white" />
                    : isCurrent
                      ? <div className="w-2.5 h-2.5 rounded-full bg-white" />
                      : null}
                </div>
                <span className={cn(
                  'text-xs whitespace-nowrap mt-0.5',
                  isCurrent ? 'font-bold text-gray-900' : done ? 'text-gray-400' : 'text-gray-300'
                )}>
                  {LIFECYCLE_LABELS[status]}
                </span>
              </div>
              {i < LIFECYCLE.length - 1 && (
                <div className={cn('flex-1 h-px mx-0.5 mb-4', done ? 'bg-emerald-300' : 'bg-gray-200')} />
              )}
            </div>
          )
        })}
      </div>

      {/* Advance button — hidden when Active (serving notice is a deliberate action, not a step forward) */}
      {nextStatus && current !== 'active' && (
        <div className="relative group">
          <button
            onClick={() => !isBlocked && onTransition(nextStatus)}
            disabled={isTransitioning || isBlocked}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors',
              isBlocked
                ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                : 'border-sky-300 text-sky-600 hover:bg-sky-50 disabled:opacity-50'
            )}
          >
            {isTransitioning ? 'Updating…' : `Advance to ${LIFECYCLE_LABELS[nextStatus]}`}
            {!isTransitioning && <ChevronRight className="w-4 h-4" />}
          </button>

          {/* Hover tooltip showing blockers */}
          {isBlocked && (
            <div className="absolute top-full left-0 right-0 mt-2 hidden group-hover:block z-50 pointer-events-none">
              {/* Arrow */}
              <div className="flex justify-center mb-[-1px]">
                <div className="w-3 h-3 bg-orange-50 border-l border-t border-orange-300 rotate-45" />
              </div>
              <div className="bg-orange-50 border border-orange-300 rounded-xl shadow-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-orange-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Complete before advancing:
                </div>
                <ul className="space-y-1 pl-5">
                  {blockers.map(b => (
                    <li key={b} className="text-xs text-orange-600 list-disc">{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom actions — always visible when tenancy is not ended */}
      {current !== 'ended' && (
        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Serve notice — only available when active */}
          {current === 'active' ? (
            <button
              onClick={() => onServeNotice()}
              disabled={isTransitioning}
              className="text-xs text-orange-500 hover:text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Serve notice
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onCancel}
            disabled={isTransitioning}
            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel tenancy
          </button>
        </div>
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 shrink-0 w-36">{label}</span>
      <span className="text-xs font-medium text-gray-900 text-right">{value ?? '—'}</span>
    </div>
  )
}

// ── Compliance checklist ──────────────────────────────────────────────────────

function ComplianceCheck({
  label,
  done,
  date,
  onToggle,
  isUpdating,
}: {
  label: string
  done: boolean
  date?: string | null
  onToggle: () => void
  isUpdating: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2">
        {done
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
        <div>
          <p className="text-xs font-medium text-gray-800">{label}</p>
          {done && date && <p className="text-xs text-gray-400">{fmtDate(date)}</p>}
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={isUpdating}
        className={cn(
          'text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors',
          done
            ? 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
            : 'border-sky-300 text-sky-600 hover:bg-sky-50'
        )}
      >
        {done ? 'Undo' : 'Mark done'}
      </button>
    </div>
  )
}

// ── Payment history ───────────────────────────────────────────────────────────

function isPaidLate(tx: Transaction): boolean {
  if (tx.status !== 'paid' && tx.status !== 'reconciled') return false
  return (new Date(tx.createdAt).getTime() - new Date(tx.date).getTime()) / 86400000 > 5
}

const TX_CHIP: Record<string, { label: string; cls: string }> = {
  paid:       { label: 'Paid',     cls: 'bg-emerald-100 text-emerald-700' },
  reconciled: { label: 'Paid',     cls: 'bg-emerald-100 text-emerald-700' },
  pending:    { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
  late:       { label: 'Overdue',  cls: 'bg-red-100 text-red-600' },
  partial:    { label: 'Partial',  cls: 'bg-blue-100 text-blue-700' },
  failed:     { label: 'Failed',   cls: 'bg-red-100 text-red-600' },
  refunded:   { label: 'Refunded', cls: 'bg-purple-100 text-purple-700' },
}

function RentPaymentHistory({ transactions }: { transactions: Transaction[] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const shown = expanded ? sorted : sorted.slice(0, 4)

  if (sorted.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-gray-400">No payment records yet.</p>
      </div>
    )
  }

  return (
    <>
      <div className="divide-y divide-gray-100">
        {shown.map(tx => {
          const late = isPaidLate(tx)
          const chip = late
            ? { label: 'Paid Late', cls: 'bg-yellow-100 text-yellow-700' }
            : TX_CHIP[tx.status] ?? { label: tx.status, cls: 'bg-gray-100 text-gray-600' }
          return (
            <div key={tx.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                  tx.status === 'paid' || tx.status === 'reconciled' ? 'bg-emerald-50' : 'bg-gray-100'
                )}>
                  <PoundSterling className={cn(
                    'w-3 h-3',
                    tx.status === 'paid' || tx.status === 'reconciled' ? 'text-emerald-600' : 'text-gray-400'
                  )} />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-800">
                    {tx.description || 'Rent Payment'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', chip.cls)}>
                  {chip.label}
                </span>
                <p className="text-xs font-bold text-gray-800 w-14 text-right">
                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(tx.amount)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      {sorted.length > 4 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-center gap-1 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 border-t border-gray-100 transition-colors"
        >
          {expanded ? 'Show less' : `Show ${sorted.length - 4} more`}
        </button>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TenancyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCancelModal, setShowCancelModal]       = useState(false)
  const [showContractModal, setShowContractModal]   = useState(false)
  const [showNoticeModal, setShowNoticeModal]       = useState(false)
  const [uploadingContract, setUploadingContract]   = useState(false)

  const { data: tenancy, isLoading, isError, error } = useQuery({
    queryKey: ['tenancy', id],
    queryFn: () => getTenancy(id!),
    enabled: Boolean(id),
    retry: false,
  })

  const { data: tenancyDocs = [] } = useQuery({
    queryKey: ['documents', tenancy?.propertyId],
    queryFn: () => getPropertyDocuments(tenancy!.propertyId),
    enabled: Boolean(tenancy?.propertyId),
  })

  const { data: alertsData } = useQuery({
    queryKey: ['smart-alerts'],
    queryFn: () => getSmartAlerts(),
  })

  const { data: rentTransactions = [] } = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => getTransactions({ tenancyId: id }),
    enabled: Boolean(id),
  })

  const rentOverdueAlert = (alertsData?.alerts ?? []).find(
    a => a.type === 'rent_overdue' && a.tenancyId === id
  )

  const signedContract = tenancyDocs.find(
    d => d.documentType === 'tenancy_agreement' && (d.tenancyId === id || d.tenancyId == null)
  )

  async function handleContractUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tenancy) return
    setUploadingContract(true)
    try {
      await uploadDocument(tenancy.propertyId, file, 'tenancy_agreement', 'Signed tenancy agreement', undefined, tenancy.id)
      queryClient.invalidateQueries({ queryKey: ['documents', tenancy.propertyId] })
      toast.success('Signed contract uploaded to documents')
    } catch {
      toast.error('Failed to upload contract')
    } finally {
      setUploadingContract(false)
      e.target.value = ''
    }
  }

  const transitionMutation = useMutation({
    mutationFn: ({ status, evictionGrounds, noticeServedDate, noticeServedBy }: {
      status: LifecycleStatus
      evictionGrounds?: string
      noticeServedDate?: string
      noticeServedBy?: string
    }) =>
      transitionTenancy(id!, status, { evictionGrounds, noticeServedDate, noticeServedBy }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenancy', id], updated)
      queryClient.invalidateQueries({ queryKey: ['tenancies'] })
      toast.success(`Tenancy moved to ${LIFECYCLE_LABELS[updated.lifecycleStatus]}`)
      setShowCancelModal(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to update status')
    },
  })

  const complianceMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateTenancyCompliance>[1]) =>
      updateTenancyCompliance(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenancy', id] })
      toast.success('Compliance updated')
    },
    onError: () => toast.error('Failed to update compliance'),
  })

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  if (isError) {
    const msg = (error as any)?.response?.data?.error ?? (error as any)?.message ?? 'Unknown error'
    return (
      <div className="p-6 text-center text-gray-400">
        <p className="font-medium text-gray-600">Failed to load tenancy</p>
        <p className="text-sm mt-1">{msg}</p>
      </div>
    )
  }

  if (!tenancy) {
    return (
      <div className="p-6 text-center text-gray-400">Tenancy not found.</div>
    )
  }

  const propertyDisplay = tenancy.property.name || tenancy.property.address

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {showCancelModal && (
        <CancelModal
          onConfirm={(reasonLabel, details, description) =>
            transitionMutation.mutate({
              status: 'cancelled',
              evictionGrounds: `${reasonLabel}: ${details}. ${description}`,
            })
          }
          onClose={() => setShowCancelModal(false)}
          isSubmitting={transitionMutation.isPending}
        />
      )}
      {showContractModal && tenancy && (
        <ContractEmailModal tenancy={tenancy} onClose={() => setShowContractModal(false)} />
      )}
      {showNoticeModal && tenancy && (
        <ServeNoticeModal
          tenancy={tenancy}
          onConfirm={(groundDetail, _details, noticeDateServed) =>
            transitionMutation.mutate({
              status: 'notice',
              evictionGrounds: groundDetail,
              noticeServedDate: noticeDateServed,
              noticeServedBy: 'landlord',
            })
          }
          onClose={() => setShowNoticeModal(false)}
          isSubmitting={transitionMutation.isPending}
        />
      )}
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/app/tenancies')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to tenancies
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-sky-50 shrink-0">
              <User className="w-5 h-5 text-sky-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{tenancy.tenant.name}</h1>
              <p className="text-sm text-gray-500">{tenancy.tenant.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Property quick info */}
      <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600">
        <div className="flex items-center gap-1.5">
          <Home className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-900">{propertyDisplay}</span>
          {tenancy.roomName && <span className="text-gray-400">— {tenancy.roomName}</span>}
        </div>
        <div className="flex items-center gap-1.5 text-gray-400">
          <MapPin className="w-3.5 h-3.5" />
          <span>{tenancy.property.postcode}</span>
        </div>
      </div>

      {/* Rent overdue warning banner */}
      {rentOverdueAlert && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">{rentOverdueAlert.title}</p>
            <p className="text-xs text-red-500 mt-0.5">{rentOverdueAlert.message}</p>
          </div>
          <span className="ml-auto text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0">
            {rentOverdueAlert.severity === 'high' ? 'High Priority' : 'Warning'}
          </span>
        </div>
      )}

      {/* Lifecycle — overflow-visible so the hover tooltip isn't clipped */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 rounded-t-xl">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tenancy Status</h2>
        </div>
        <div className="px-5 py-4 space-y-2">
          <LifecycleTracker
            tenancy={tenancy}
            onTransition={(status) => transitionMutation.mutate({ status })}
            onCancel={() => setShowCancelModal(true)}
            onServeNotice={() => setShowNoticeModal(true)}
            isTransitioning={transitionMutation.isPending}
            hasSignedContract={Boolean(signedContract)}
          />
        </div>
      </div>

      {/* Onboarding actions panel */}
      {tenancy.lifecycleStatus === 'onboarding' && (
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
          <div className="bg-blue-50 px-5 py-3 border-b border-blue-200">
            <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Onboarding Actions</h2>
          </div>
          <div className="px-5 py-4 space-y-4">

            {/* Step 1 — Send contract */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  'bg-sky-100'
                )}>
                  <Mail className="w-3.5 h-3.5 text-sky-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Send tenancy contract</p>
                  <p className="text-xs text-gray-400 mt-0.5">Email the AST to {tenancy.tenant.name} for signing</p>
                </div>
              </div>
              <button
                onClick={() => setShowContractModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold transition-colors shrink-0"
              >
                <Mail className="w-3 h-3" />
                Preview & send
              </button>
            </div>

            <div className="border-t border-gray-100" />

            {/* Step 2 — Upload signed contract */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  signedContract ? 'bg-emerald-100' : 'bg-gray-100'
                )}>
                  {signedContract
                    ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                    : <FileSignature className="w-3.5 h-3.5 text-gray-400" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Upload signed contract</p>
                  {signedContract
                    ? <p className="text-xs text-emerald-600 mt-0.5">Uploaded — saved to Documents</p>
                    : <p className="text-xs text-gray-400 mt-0.5">Once the tenant returns the signed copy, upload it here</p>}
                </div>
              </div>
              {!signedContract && (
                <label className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shrink-0 cursor-pointer',
                  uploadingContract
                    ? 'border-gray-200 text-gray-400'
                    : 'border-sky-300 text-sky-600 hover:bg-sky-50'
                )}>
                  <Upload className="w-3 h-3" />
                  {uploadingContract ? 'Uploading…' : 'Upload PDF'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    disabled={uploadingContract}
                    onChange={handleContractUpload}
                  />
                </label>
              )}
            </div>

            {/* Info note */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-500">
              Once you have uploaded the signed contract and completed the compliance checklist below, click <span className="font-medium text-gray-700">Advance to Active</span> to confirm the tenancy is live.
            </div>
          </div>
        </div>
      )}

      {/* Tenancy details */}
      <Section title="Tenancy Details">
        <div className="flex items-center gap-1.5 mb-2 text-gray-400">
          <Calendar className="w-3.5 h-3.5" />
          <span className="text-xs">Dates & terms</span>
        </div>
        <DetailRow label="Start date" value={fmtDate(tenancy.startDate)} />
        <DetailRow label="End date" value={tenancy.endDate ? fmtDate(tenancy.endDate) : 'Periodic (rolling)'} />
        <DetailRow label="Tenancy type" value={tenancy.tenancyType === 'fixed' ? 'Fixed term' : tenancy.tenancyType === 'periodic' ? 'Periodic (rolling)' : 'Statutory periodic'} />
        <DetailRow label="Notice period" value={`${tenancy.noticePeriodWeeks} weeks`} />
        {tenancy.noticeServedDate && (
          <>
            <DetailRow label="Notice served" value={fmtDate(tenancy.noticeServedDate)} />
            <DetailRow label="Served by" value={tenancy.noticeServedBy ?? '—'} />
          </>
        )}
      </Section>

      {/* Rent */}
      <Section title="Rent">
        <div className="flex items-center gap-1.5 mb-2 text-gray-400">
          <PoundSterling className="w-3.5 h-3.5" />
          <span className="text-xs">Payment details</span>
        </div>
        <DetailRow
          label="Rent amount"
          value={<span className="text-base font-bold text-gray-900">{fmtCurrency(tenancy.rentAmount)}</span>}
        />
        <DetailRow label="Frequency" value={tenancy.rentFrequency.charAt(0).toUpperCase() + tenancy.rentFrequency.slice(1)} />
        <DetailRow label="Due day" value={`${tenancy.rentDueDay}${tenancy.rentFrequency === 'monthly' ? ' of month' : ''}`} />
      </Section>

      {/* Payment History */}
      <Section title={`Payment History${rentTransactions.length > 0 ? ` · ${rentTransactions.length} payment${rentTransactions.length !== 1 ? 's' : ''}` : ''}`}>
        <RentPaymentHistory transactions={rentTransactions} />
      </Section>

      {/* Deposit */}
      {(tenancy.depositAmount || tenancy.depositScheme) && (
        <Section title="Deposit">
          <DetailRow label="Amount" value={fmtCurrency(tenancy.depositAmount)} />
          <DetailRow label="Scheme" value={tenancy.depositScheme ?? '—'} />
          <DetailRow label="Reference" value={tenancy.depositReference ?? '—'} />
          <DetailRow label="Date received" value={fmtDate(tenancy.depositPaidDate)} />
          <DetailRow label="Protected on" value={fmtDate(tenancy.depositProtectedDate)} />
          <DetailRow label="Returned on" value={fmtDate(tenancy.depositReturnedDate)} />
          {tenancy.depositReturnedAmount && (
            <DetailRow label="Amount returned" value={fmtCurrency(tenancy.depositReturnedAmount)} />
          )}
        </Section>
      )}

      {/* Compliance — Renters' Rights Act */}
      <Section title="Compliance — Renters' Rights Act 2025">
        <div className="flex items-center gap-1.5 mb-2 text-gray-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="text-xs">Required documentation</span>
        </div>
        <ComplianceCheck
          label="How to Rent guide provided"
          done={tenancy.howToRentGuideProvided}
          onToggle={() =>
            complianceMutation.mutate({ howToRentGuideProvided: !tenancy.howToRentGuideProvided })
          }
          isUpdating={complianceMutation.isPending}
        />
        <ComplianceCheck
          label="Tenant Information Sheet provided"
          done={tenancy.tenantInfoSheetProvided}
          date={tenancy.tenantInfoSheetDate}
          onToggle={() =>
            complianceMutation.mutate({ tenantInfoSheetProvided: !tenancy.tenantInfoSheetProvided })
          }
          isUpdating={complianceMutation.isPending}
        />
        {tenancy.depositAmount && (
          <ComplianceCheck
            label="Deposit registered with scheme"
            done={!!tenancy.depositProtectedDate}
            date={tenancy.depositProtectedDate}
            onToggle={() => {
              const today = new Date().toISOString().split('T')[0]
              complianceMutation.mutate({
                depositProtectedDate: tenancy.depositProtectedDate ? null : today,
              })
            }}
            isUpdating={complianceMutation.isPending}
          />
        )}
      </Section>
    </div>
  )
}
