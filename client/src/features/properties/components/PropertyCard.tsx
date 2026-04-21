import { useNavigate } from 'react-router-dom'
import { Building2, MapPin, BedDouble, Bath, ChevronRight, AlertCircle, Plus, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Property, PropertyType, PropertyStatus } from '@/types/property'

const typeLabel: Record<PropertyType, string> = {
  house: 'House',
  flat:  'Flat',
  hmo:   'HMO',
  other: 'Other',
}

const typeStyle: Record<PropertyType, string> = {
  house: 'bg-blue-50 text-blue-700 border border-blue-200',
  flat:  'bg-purple-50 text-purple-700 border border-purple-200',
  hmo:   'bg-amber-50 text-amber-700 border border-amber-200',
  other: 'bg-gray-100 text-gray-600 border border-gray-200',
}

const statusStyle: Record<PropertyStatus, string> = {
  active:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  inactive: 'bg-gray-100 text-gray-500 border border-gray-200',
  archived: 'bg-red-50 text-red-600 border border-red-200',
}

interface PropertyCardProps {
  property: Property
}

export function PropertyCard({ property }: PropertyCardProps) {
  const navigate = useNavigate()

  const displayName = property.propertyName
    ?? `${property.doorNumber ? property.doorNumber + ' ' : ''}${property.addressLine1}`

  const isHmo = property.propertyType === 'hmo' || property.isHmo
  const isIncomplete = isHmo && (property.roomCount ?? 0) === 0
  const noPhotos = (property.photoCount ?? 0) === 0

  return (
    <div className={cn(
      'w-full text-left bg-white rounded-xl border transition-all',
      isIncomplete
        ? 'border-orange-200'
        : isHmo
          ? 'border-amber-200 hover:shadow-md hover:border-sky-200'
          : 'border-gray-200 hover:shadow-md hover:border-sky-200',
    )}>
      {/* Top accent bar */}
      {isIncomplete ? (
        <div className="h-1 w-full rounded-t-xl bg-gradient-to-r from-orange-300 to-orange-400" />
      ) : isHmo ? (
        <div className="h-1 w-full rounded-t-xl bg-gradient-to-r from-amber-300 to-amber-400" />
      ) : null}

      {/* Clickable card body */}
      <button
        onClick={() => navigate(`/app/properties/${property.id}`)}
        className="w-full text-left group p-5"
      >
        {/* Top row — name + badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              'flex items-center justify-center w-9 h-9 rounded-lg shrink-0',
              isIncomplete ? 'bg-orange-50' : isHmo ? 'bg-amber-50' : 'bg-sky-50'
            )}>
              <Building2 className={cn(
                'w-4 h-4',
                isIncomplete ? 'text-orange-400' : isHmo ? 'text-amber-500' : 'text-sky-400'
              )} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{displayName}</p>
              {property.propertyName && (
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {property.doorNumber ? property.doorNumber + ' ' : ''}{property.addressLine1}
                </p>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isIncomplete && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Incomplete
              </span>
            )}
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', typeStyle[property.propertyType])}>
              {typeLabel[property.propertyType]}
            </span>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusStyle[property.status])}>
              {property.status.charAt(0).toUpperCase() + property.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Address */}
        <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{property.city}, {property.postcode}</span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <BedDouble className="w-3.5 h-3.5" />
              <span>
                {isHmo
                  ? `${property.roomCount ?? 0} ${(property.roomCount ?? 0) === 1 ? 'room' : 'rooms'} added`
                  : `${property.totalRooms} ${property.totalRooms === 1 ? 'room' : 'rooms'}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Bath className="w-3.5 h-3.5" />
              <span>{property.totalBathrooms} {property.totalBathrooms === 1 ? 'bathroom' : 'bathrooms'}</span>
            </div>
            {isHmo && !isIncomplete && property.hmoLicenceNumber && (
              <span className="text-xs text-amber-600 font-medium">Licensed</span>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-sky-400 transition-colors" />
        </div>
      </button>

      {/* Incomplete call-to-action */}
      {isIncomplete && (
        <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-orange-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>No rooms added yet — rooms are required for an HMO.</span>
          </div>
          <button
            onClick={() => navigate(`/app/properties/${property.id}/rooms/new`)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-400 hover:bg-orange-500 text-white text-xs font-semibold transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
            Add rooms
          </button>
        </div>
      )}

      {/* No photos nudge */}
      {noPhotos && (
        <div className="mx-5 mb-5 flex items-center justify-between gap-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-sky-700">
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span>No photos, please add some now.</span>
          </div>
          <button
            onClick={() => navigate(`/app/properties/${property.id}`, { state: { tab: isHmo ? 'rooms' : 'overview' } })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-300 hover:bg-sky-400 text-white text-xs font-semibold transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
            Add photos
          </button>
        </div>
      )}
    </div>
  )
}
