import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, ClipboardList, Wrench, Truck,
  Package, Receipt, CreditCard, Search,
  Building2, MapPin, FileText, LogOut, ChevronDown, FileSpreadsheet
} from 'lucide-react'
import { useState } from 'react'

const menu = [
  {
    group: '대시보드',
    items: [
      { label: '대표이사', path: '/dashboard/ceo',     icon: LayoutDashboard },
      { label: '자금팀', path: '/dashboard/finance', icon: CreditCard },
      { label: '관리팀', path: '/dashboard/manager', icon: ClipboardList },
    ],
  },
  {
    group: '업무',
    items: [
      { label: '발주관리',  path: '/po',        icon: ClipboardList },
      { label: '작업내역',  path: '/workorder', icon: Wrench },
      { label: '출고관리',  path: '/delivery',  icon: Truck },
      { label: '재고현황',  path: '/inventory', icon: Package },
      { label: '매입관리',  path: '/purchase',  icon: Receipt },
      { label: '지급관리',  path: '/payment',   icon: CreditCard },
    ],
  },
  {
    group: '조회',
    items: [
      { label: '소재 추적', path: '/trace', icon: Search },
    ],
  },
  {
    group: '기준정보',
    items: [
      { label: '업체관리', path: '/vendors', icon: Building2 },
      { label: '현장관리', path: '/sites',   icon: MapPin },
    ],
  },
  {
    group: '시스템',
    items: [
      { label: '엑셀업로드', path: '/excel-import', icon: FileSpreadsheet },
      { label: '변경이력',   path: '/audit',        icon: FileText },
    ],
  },
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
      {/* 사이드바 */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-[#1e3a5f] flex flex-col transition-all duration-200 shrink-0`}>
        {/* 로고 */}
        <div className="h-14 flex items-center px-4 border-b border-blue-800">
          {!collapsed && <span className="text-white font-bold text-sm">🏭 MES-Lite 판재관리</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-blue-300 hover:text-white">
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 overflow-y-auto py-3">
          {menu.map(({ group, items }) => (
            <div key={group} className="mb-2">
              {!collapsed && (
                <p className="text-blue-400 text-xs font-semibold px-4 py-1 uppercase tracking-wider">{group}</p>
              )}
              {items.map(({ label, path, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* 사용자 */}
        <div className="border-t border-blue-800 p-4">
          {!collapsed && (
            <p className="text-blue-300 text-xs truncate mb-2">{user?.email}</p>
          )}
          <button onClick={logout} className="flex items-center gap-2 text-blue-300 hover:text-white text-sm">
            <LogOut className="w-4 h-4" />
            {!collapsed && '로그아웃'}
          </button>
        </div>
      </aside>

      {/* 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
