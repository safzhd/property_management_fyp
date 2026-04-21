import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  UploadCloud, FileText, FileImage, File, Trash2,
  Download, Plus, X, Loader2,
} from 'lucide-react'
import {
  getPropertyDocuments, uploadDocument, deleteDocument, getFileUrl,
  type Document, type DocumentType,
} from '@/api/documents'
import { cn } from '@/lib/utils'

// ── Document type config ──────────────────────────────────────────────────────

const DOC_TYPES: { value: DocumentType; label: string; hmoRequired?: boolean }[] = [
  { value: 'hmo_licence',         label: 'HMO Licence',           hmoRequired: true },
  { value: 'gas_certificate',     label: 'Gas Safety Certificate', hmoRequired: true },
  { value: 'eicr_certificate',    label: 'EICR (Electrical)',      hmoRequired: true },
  { value: 'epc_certificate',     label: 'EPC Certificate',        hmoRequired: true },
  { value: 'fire_risk_assessment',label: 'Fire Risk Assessment',   hmoRequired: true },
  { value: 'tenancy_agreement',   label: 'Tenancy Agreement' },
  { value: 'inventory',           label: 'Inventory' },
  { value: 'deposit_protection',  label: 'Deposit Protection' },
  { value: 'how_to_rent_guide',   label: 'How to Rent Guide' },
  { value: 'tenant_info_sheet',   label: 'Tenant Info Sheet' },
  { value: 'id_document',         label: 'ID Document' },
  { value: 'reference',           label: 'Reference' },
  { value: 'invoice',             label: 'Invoice' },
  { value: 'receipt',             label: 'Receipt' },
  { value: 'photo',               label: 'Photo' },
  { value: 'other',               label: 'Other' },
]

const TYPE_LABEL: Record<DocumentType, string> = Object.fromEntries(
  DOC_TYPES.map(t => [t.value, t.label])
) as Record<DocumentType, string>

const HMO_REQUIRED_TYPES = DOC_TYPES.filter(t => t.hmoRequired).map(t => t.value)

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith('image/'))
    return <FileImage className={cn('text-purple-400', className)} />
  if (mimeType === 'application/pdf')
    return <FileText className={cn('text-red-400', className)} />
  return <File className={cn('text-gray-400', className)} />
}

// ── Upload panel ─────────────────────────────────────────────────────────────

function UploadPanel({
  propertyId,
  isHmo,
  onClose,
}: {
  propertyId: string
  isHmo: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<DocumentType>(isHmo ? 'hmo_licence' : 'other')
  const [description, setDescription] = useState('')

  const mutation = useMutation({
    mutationFn: () => uploadDocument(propertyId, selectedFile!, docType, description || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', propertyId] })
      toast('Document uploaded successfully', {
        style: { background: '#e0f4fa', border: '1px solid #7ab8d0', color: '#1e6a85', fontWeight: '500' },
      })
      onClose()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string; detail?: string } } })
          ?.response?.data?.error ?? 'Failed to upload document. Please try again.'
      toast.error(msg)
    },
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Upload document</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
          dragging ? 'border-sky-300 bg-sky-50' : 'border-gray-200 hover:border-sky-200 hover:bg-gray-50'
        )}
      >
        <UploadCloud className={cn('w-8 h-8', dragging ? 'text-sky-400' : 'text-gray-300')} />
        {selectedFile ? (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">{selectedFile.name}</p>
            <p className="text-xs text-gray-400">{formatBytes(selectedFile.size)}</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600">Drop a file here or <span className="text-sky-500">browse</span></p>
            <p className="text-xs text-gray-400 mt-0.5">PDF, images, Word docs — up to 10 MB</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls"
          onChange={e => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]) }}
        />
      </div>

      {/* Type + description */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Document type</label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value as DocumentType)}
            className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent appearance-none"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Expires Jan 2026"
            className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!selectedFile || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</> : 'Upload'}
        </button>
      </div>
    </div>
  )
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({ doc, propertyId }: { doc: Document; propertyId: string }) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(doc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', propertyId] })
      toast.success('Document removed')
    },
    onError: () => toast.error('Failed to delete document'),
  })

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors group">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 shrink-0">
        <FileIcon mimeType={doc.mimeType} className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatBytes(doc.fileSize)}
          {doc.description && ` · ${doc.description}`}
          {` · ${new Date(doc.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={getFileUrl(doc.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
        <button
          onClick={() => {
            if (confirm(`Delete "${doc.fileName}"?`)) deleteMutation.mutate()
          }}
          disabled={deleteMutation.isPending}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete"
        >
          {deleteMutation.isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ── Section group ─────────────────────────────────────────────────────────────

function DocGroup({
  title,
  docs,
  propertyId,
  required,
}: {
  title: string
  docs: Document[]
  propertyId: string
  required?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</p>
          {required && docs.length === 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
              Required
            </span>
          )}
          {docs.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {docs.length}
            </span>
          )}
        </div>
      </div>
      {docs.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-3">No documents uploaded yet</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {docs.map(d => <DocRow key={d.id} doc={d} propertyId={propertyId} />)}
        </div>
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function DocumentsTab({ propertyId, isHmo }: { propertyId: string; isHmo: boolean }) {
  const [showUpload, setShowUpload] = useState(false)

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', propertyId],
    queryFn: () => getPropertyDocuments(propertyId),
  })

  // Group by type
  const byType = documents.reduce<Record<string, Document[]>>((acc, d) => {
    if (!acc[d.documentType]) acc[d.documentType] = []
    acc[d.documentType].push(d)
    return acc
  }, {})

  // Which types have docs
  const hmoRequired = HMO_REQUIRED_TYPES.map(type => ({
    type,
    label: TYPE_LABEL[type],
    docs: byType[type] ?? [],
  }))

  const otherTypes = Object.entries(byType)
    .filter(([type]) => !HMO_REQUIRED_TYPES.includes(type as DocumentType))
    .map(([type, docs]) => ({ type: type as DocumentType, label: TYPE_LABEL[type as DocumentType] ?? type, docs }))

  const hmoMissingCount = isHmo ? hmoRequired.filter(g => g.docs.length === 0).length : 0

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-700">Documents</p>
          {isHmo && hmoMissingCount > 0 && (
            <p className="text-xs text-orange-600 mt-0.5">
              {hmoMissingCount} required HMO {hmoMissingCount === 1 ? 'document' : 'documents'} missing
            </p>
          )}
        </div>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Upload
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <UploadPanel
          propertyId={propertyId}
          isHmo={isHmo}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* HMO required section */}
      {isHmo && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Required HMO documents</p>
          {hmoRequired.map(g => (
            <DocGroup
              key={g.type}
              title={g.label}
              docs={g.docs}
              propertyId={propertyId}
              required
            />
          ))}
        </div>
      )}

      {/* Other documents */}
      {otherTypes.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Other documents</p>
          {otherTypes.map(g => (
            <DocGroup
              key={g.type}
              title={g.label}
              docs={g.docs}
              propertyId={propertyId}
            />
          ))}
        </div>
      )}

      {/* Empty state (non-HMO or no docs at all) */}
      {!isLoading && documents.length === 0 && !isHmo && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-gray-200 bg-white gap-3">
          <FileText className="w-8 h-8 text-gray-300" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-400">No documents yet</p>
            <p className="text-xs text-gray-400 mt-1">Upload contracts, certificates or photos.</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Upload document
          </button>
        </div>
      )}
    </div>
  )
}
