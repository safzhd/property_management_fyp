import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export default function AppShell() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar — fixed left */}
      <Sidebar />

      {/* Right side — header + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
