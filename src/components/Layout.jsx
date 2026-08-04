import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  BarChart3, CalendarCheck, ChevronDown, ClipboardList,
  Factory, LogOut,
} from 'lucide-react'
import { useState } from 'react'

const menu = [
  { label: '통합현황', path: '/overview', icon: BarChart3 },
  { label: '발주관리', path: '/po', icon: ClipboardList },
  { label: '현장현황', path: '/site-status', icon: Factory },
  { label: '월말반영', path: '/monthly-close', icon: CalendarCheck },
]

export default function Layout({ user }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className={`${collapsed ? 'w-16' : 'w-52'} bg-white border-r border-blue-200 flex flex-col transition-all duration-200 shrink-0`}>
        <div className="h-14 flex items-center px-4 border-b-2 border-blue-600 shrink-0">
          {!collapsed && <span className="text-[#15385f] font-extrabold text-sm">ZAKANG 원자재</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-[#15385f] hover:text-blue-700" aria-label="메뉴 접기">
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>

        <nav className="flex-1 py-3">
          {menu.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-[#15385f] font-semibold hover:bg-blue-50 hover:text-blue-800'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-blue-200 p-4 shrink-0">
          {!collapsed && <p className="text-[#15385f] font-medium text-xs truncate mb-2">{user?.email}</p>}
          <button onClick={logout} className="flex items-center gap-2 text-[#15385f] font-semibold hover:text-red-700 text-sm">
            <LogOut className="w-4 h-4" />
            {!collapsed && '로그아웃'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
