import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RoleGate } from '@/components/auth/RoleGate'
import LoginPage from '@/features/auth/LoginPage'
import AppShell from '@/components/layout/AppShell'
import { useAuthStore } from '@/store/authStore'
import PropertiesPage from '@/features/properties/PropertiesPage'
import AddPropertyPage from '@/features/properties/AddPropertyPage'
import PropertyDetailPage from '@/features/properties/PropertyDetailPage'
import AddRoomsPage from '@/features/properties/AddRoomsPage'
import TenanciesPage from '@/features/tenancies/TenanciesPage'
import AddTenancyPage from '@/features/tenancies/AddTenancyPage'
import TenancyDetailPage from '@/features/tenancies/TenancyDetailPage'
import TransactionsPage from '@/features/transactions/TransactionsPage'

// ── Stub pages (replaced one by one as we build) ────────────────────────────
const Stub = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-gray-300 bg-white">
    <p className="text-sm font-medium text-gray-400">{label} — coming soon</p>
  </div>
)

const DashboardPage      = () => <Stub label="Dashboard" />
const RoomsPage          = () => <Stub label="Rooms" />
const PaymentsPage       = () => <Stub label="Payments" />  // legacy stub
const MaintenancePage    = () => <Stub label="Maintenance" />
const CompliancePage     = () => <Stub label="Compliance" />
const DocumentsPage      = () => <Stub label="Documents" />
const NotificationsPage  = () => <Stub label="Notifications" />
const MyTenancyPage      = () => <Stub label="My Tenancy" />
const AdminPage          = () => <Stub label="Admin" />
const UnauthorizedPage   = () => (
  <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
    <p className="text-2xl font-semibold">403</p>
    <p className="text-gray-500">You don't have permission to view this page.</p>
  </div>
)

// ── DEV PREVIEW — seeds a fake landlord session so the shell is visible ──────
function PreviewShell() {
  const login = useAuthStore((s) => s.login)

  useEffect(() => {
    login(
      {
        id: 'preview-id',
        email: 'landlord@preview.com',
        givenName: 'Safiyyah',
        lastName: 'Demo',
        role: 'landlord',
        createdAt: new Date().toISOString(),
      },
      'preview-token'
    )
  }, [login])

  return <AppShell />
}

// ── Router ───────────────────────────────────────────────────────────────────
export const router = createBrowserRouter([
  // Public
  { path: '/login', element: <LoginPage /> },

  // DEV ONLY — preview the shell without a real login
  {
    path: '/dev',
    element: <PreviewShell />,
    children: [
      { index: true, element: <Navigate to="/dev/dashboard" replace /> },
      { path: 'dashboard',     element: <DashboardPage /> },
      { path: 'properties',    element: <PropertiesPage /> },
      { path: 'properties/new', element: <AddPropertyPage /> },
      { path: 'properties/:id',           element: <PropertyDetailPage /> },
      { path: 'properties/:id/rooms/new', element: <AddRoomsPage /> },
      { path: 'rooms',               element: <RoomsPage /> },
      { path: 'tenancies',           element: <TenanciesPage /> },
      { path: 'tenancies/new',       element: <AddTenancyPage /> },
      { path: 'tenancies/:id',       element: <TenancyDetailPage /> },
      { path: 'transactions',  element: <TransactionsPage /> },
      { path: 'payments',      element: <PaymentsPage /> },
      { path: 'compliance',    element: <CompliancePage /> },
      { path: 'maintenance',   element: <MaintenancePage /> },
      { path: 'documents',     element: <DocumentsPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
    ],
  },

  // All authenticated users
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/app/dashboard" replace /> },

          // ── Landlord + Admin ───────────────────────────────────────────
          {
            path: 'dashboard',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <DashboardPage />
              </RoleGate>
            ),
          },
          {
            path: 'properties',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <PropertiesPage />
              </RoleGate>
            ),
          },
          {
            path: 'properties/new',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <AddPropertyPage />
              </RoleGate>
            ),
          },
          {
            path: 'properties/:id',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <PropertyDetailPage />
              </RoleGate>
            ),
          },
          {
            path: 'properties/:id/rooms/new',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <AddRoomsPage />
              </RoleGate>
            ),
          },
          {
            path: 'rooms',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <RoomsPage />
              </RoleGate>
            ),
          },
          {
            path: 'tenancies',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <TenanciesPage />
              </RoleGate>
            ),
          },
          {
            path: 'tenancies/new',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <AddTenancyPage />
              </RoleGate>
            ),
          },
          {
            path: 'tenancies/:id',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <TenancyDetailPage />
              </RoleGate>
            ),
          },
          {
            path: 'transactions',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <TransactionsPage />
              </RoleGate>
            ),
          },
          {
            path: 'compliance',
            element: (
              <RoleGate allowedRoles={['admin', 'landlord']}>
                <CompliancePage />
              </RoleGate>
            ),
          },

          // ── All roles ─────────────────────────────────────────────────
          { path: 'maintenance',   element: <MaintenancePage /> },
          { path: 'documents',     element: <DocumentsPage /> },
          { path: 'notifications', element: <NotificationsPage /> },

          // ── Tenant only ───────────────────────────────────────────────
          {
            path: 'my-tenancy',
            element: (
              <RoleGate allowedRoles={['tenant']} redirectTo="/app/dashboard">
                <MyTenancyPage />
              </RoleGate>
            ),
          },

          // ── Admin only ────────────────────────────────────────────────
          {
            path: 'admin',
            element: (
              <RoleGate allowedRoles={['admin']}>
                <AdminPage />
              </RoleGate>
            ),
          },

          // ── 403 ───────────────────────────────────────────────────────
          { path: 'unauthorized', element: <UnauthorizedPage /> },
        ],
      },
    ],
  },

  // Catch-all
  { path: '*', element: <Navigate to="/login" replace /> },
])
