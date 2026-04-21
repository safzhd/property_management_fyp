import { useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'

export interface PhotoPreview {
  file: File
  url: string
}

interface PhotoUploaderProps {
  photos: PhotoPreview[]
  onChange: (photos: PhotoPreview[]) => void
  label?: string
}

export function PhotoUploader({ photos, onChange, label = 'Photos' }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const newPhotos: PhotoPreview[] = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(file => ({ file, url: URL.createObjectURL(file) }))
    onChange([...photos, ...newPhotos])
  }

  const remove = (index: number) => {
    URL.revokeObjectURL(photos[index].url)
    onChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>

      <div className="flex flex-wrap gap-3">
        {/* Thumbnails */}
        {photos.map((p, i) => (
          <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group shrink-0">
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Add button */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 hover:border-sky-300 hover:bg-sky-50 flex flex-col items-center justify-center gap-1 transition-colors shrink-0"
        >
          <ImagePlus className="w-5 h-5 text-gray-300" />
          <span className="text-xs text-gray-400">Add photo</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {photos.length === 0 && (
        <p className="text-xs text-gray-400 mt-2">Drag and drop images or click Add photo.</p>
      )}
    </div>
  )
}
