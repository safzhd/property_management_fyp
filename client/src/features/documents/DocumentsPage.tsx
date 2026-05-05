import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Trash2, Download, Plus, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getAllDocuments, uploadDocument, deleteDocument, getFileUrl } from '@/api/documents'
import { getProperties } from '@/api/properties'
import type { Document, DocumentType } from '@/api/documents'

// ── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',          label: 'All' },
  { key: 'compliance',   label: 'Compliance' },
  { key: 'maintenance',  label: 'Maintenance' },
  { key: 'landlord',     label: 'Landlord Docs' },
] as const

type TabKey = (typeof TABS)[number]['key']

const TAB_TYPES: Record<TabKey, DocumentType[]> = {
  all:         [],
  compliance:  ['gas_certificate', 'eicr_certificate', 'epc_certificate', 'fire_risk_assessment', 'hmo_licence'],
  maintenance: ['invoice', 'receipt'],
  landlord:    ['tenancy_agreement', 'inventory', 'deposit_protection', 'how_to_rent_guide', 'tenant_info_sheet', 'id_document', 'reference'],
}

// ── Upload modal type groups ─────────────────────────────────────────────────

const UPLOAD_GROUPS: { label: string; types: { value: DocumentType; label: string }[] }[] = [
  {
    label: 'Compliance',
    types: [
      { value: 'gas_certificate',      label: 'Gas Safety Certificate' },
      { value: 'eicr_certificate',     label: 'EICR Certificate' },
      { value: 'epc_certificate',      label: 'EPC Certificate' },
      { value: 'fire_risk_assessment', label: 'Fire Risk Assessment' },
      { value: 'hmo_licence',          label: 'HMO Licence' },
    ],
  },
  {
    label: 'Maintenance',
    types: [
      { value: 'invoice', label: 'Invoice' },
      { value: 'receipt', label: 'Receipt' },
    ],
  },
  {
    label: 'Landlord Docs',
    types: [
      { value: 'tenancy_agreement',  label: 'Tenancy Agreement' },
      { value: 'inventory',          label: 'Inventory' },
      { value: 'deposit_protection', label: 'Deposit Protection' },
      { value: 'how_to_rent_guide',  label: 'How to Rent Guide' },
      { value: 'tenant_info_sheet',  label: 'Tenant Info Sheet' },
      { value: 'id_document',        label: 'ID Document' },
      { value: 'reference',          label: 'Reference' },
    ],
  },
]

const ALL_TYPE_LABELS: Record<DocumentType, string> = Object.fromEntries(
  UPLOAD_GROUPS.flatMap(g => g.types.map(t => [t.value, t.label]))
) as Record<DocumentType, string>

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocCard({ doc, onDelete }: { doc: Document; onDelete: (id: string) => void }) {
  const [armed, setArmed] = useState(false)

  async function handleDownload() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(getFileUrl(doc.id), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 3000)
      return
    }
    onDelete(doc.id)
  }

  return (
    <div className="group flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-sky-200 hover:shadow-sm transition-all">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-50 shrink-0">
          <FileText className="w-4 h-4 text-sky-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {ALL_TYPE_LABELS[doc.documentType] ?? doc.documentType}
            {doc.description ? ` · ${doc.description}` : ''}
            {' · '}{formatBytes(doc.fileSize)}
            {' · '}{formatDate(doc.createdAt)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleDownload}
          title="Download"
          className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleDelete}
          title={armed ? 'Confirm delete' : 'Delete'}
          className={cn(
            'p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100',
            armed
              ? 'bg-red-500 text-white opacity-100'
              : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          )}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Upload modal ───────────────────────────────────────────────────────────────

function UploadModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<DocumentType>('other')
  const [propertyId, setPropertyId] = useState('')
  const [description, setDescription] = useState('')

  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties(),
  })

  const uploadMutation = useMutation({
    mutationFn: () => uploadDocument(propertyId || undefined, file!, docType, description || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document uploaded')
      onClose()
    },
    onError: () => toast.error('Upload failed'),
  })

  const canSubmit = file && docType

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Upload Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* File picker */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">File *</label>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 p-5 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
          >
            <Upload className="w-5 h-5 text-gray-400" />
            {file
              ? <p className="text-sm font-medium text-gray-700">{file.name}</p>
              : <p className="text-sm text-gray-400">Click to select a file</p>
            }
            {file && <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>}
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </div>

        {/* Document type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Document Type *</label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value as DocumentType)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            {UPLOAD_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.types.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Property */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Property (Optional)</label>
          <select
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            <option value="">No property</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.propertyName || p.addressLine1}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Description (Optional)</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Annual gas check 2025"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!canSubmit || uploadMutation.isPending}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-sky-500 rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [showUpload, setShowUpload] = useState(false)

  const EXCLUDED_TYPES: DocumentType[] = ['photo', 'other']

  const { data: rawDocuments = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => getAllDocuments(),
  })

  const documents = rawDocuments.filter(d => !EXCLUDED_TYPES.includes(d.documentType))

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document deleted')
    },
    onError: () => toast.error('Failed to delete document'),
  })

  const filtered = activeTab === 'all'
    ? documents
    : documents.filter(d => TAB_TYPES[activeTab].includes(d.documentType))

  return (
    <div className="space-y-5">
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(tab => {
          const count = tab.key === 'all'
            ? documents.length
            : documents.filter(d => TAB_TYPES[tab.key].includes(d.documentType)).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-sky-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-300'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-xs', activeTab === tab.key ? 'bg-white/20' : 'bg-gray-100 text-gray-500')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-gray-200 bg-white">
          <FolderOpen className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-500">
            {documents.length === 0 ? 'No documents uploaded yet' : `No ${activeTab} documents`}
          </p>
          {documents.length === 0 && (
            <button onClick={() => setShowUpload(true)} className="mt-2 text-xs text-sky-500 hover:text-sky-700 font-medium">
              Upload your first document
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <DocCard key={doc.id} doc={doc} onDelete={id => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
