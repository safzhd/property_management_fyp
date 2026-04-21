interface StubTabProps {
  label: string
}

export function StubTab({ label }: StubTabProps) {
  return (
    <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-gray-300 bg-white">
      <p className="text-sm font-medium text-gray-400">{label} — coming soon</p>
    </div>
  )
}
