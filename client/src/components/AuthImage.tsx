import { useEffect, useState } from 'react'
import { api } from '@/lib/axios'

interface AuthImageProps {
  docId: string
  alt?: string
  className?: string
  onClick?: () => void
}

/**
 * Fetches a protected image using the axios auth interceptor and renders it
 * via a temporary blob URL. Needed because <img src> doesn't send Bearer tokens.
 */
export function AuthImage({ docId, alt = '', className, onClick }: AuthImageProps) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    api
      .get(`/documents/file/${docId}`, { responseType: 'blob' })
      .then(res => {
        url = URL.createObjectURL(res.data)
        setBlobSrc(url)
      })
      .catch(() => {})
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [docId])

  if (!blobSrc) {
    return <div className={`bg-gray-100 animate-pulse rounded-lg ${className ?? ''}`} />
  }

  return (
    <img
      src={blobSrc}
      alt={alt}
      className={className}
      onClick={onClick}
    />
  )
}
