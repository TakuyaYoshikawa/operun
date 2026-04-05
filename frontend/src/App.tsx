import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from './api/client'
import LoginPage from './pages/LoginPage'
import OrdersPage from './pages/OrdersPage'
import MastersPage from './pages/MastersPage'
import GanttPage from './pages/GanttPage'
import DeliverySimPage from './pages/DeliverySimPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

type Page = 'gantt' | 'orders' | 'masters' | 'delivery'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'gantt',    label: 'ガントチャート',      icon: '📊' },
  { id: 'orders',   label: '受注管理',            icon: '📋' },
  { id: 'masters',  label: 'マスタ管理',          icon: '⚙️' },
  { id: 'delivery', label: '納期シミュレーター',  icon: '🔍' },
]

function Layout({ page, setPage, onLogout }: {
  page: Page
  setPage: (p: Page) => void
  onLogout: () => void
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-52 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="text-lg font-bold text-blue-700 tracking-tight">Operun</div>
          <div className="text-xs text-gray-400 mt-0.5">生産スケジューラ</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                page === n.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              }`}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-gray-100">
          <button
            onClick={onLogout}
            className="w-full px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg text-left transition-colors"
          >
            ログアウト
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {page === 'gantt'    && <GanttPage />}
        {page === 'orders'   && <OrdersPage />}
        {page === 'masters'  && <MastersPage />}
        {page === 'delivery' && <DeliverySimPage />}
      </main>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('operun_token')
  )
  const [page, setPage] = useState<Page>('gantt')

  const handleLogin = (t: string) => {
    localStorage.setItem('operun_token', t)
    api.defaults.headers.common['Authorization'] = `Bearer ${t}`
    setToken(t)
  }

  const handleLogout = () => {
    localStorage.removeItem('operun_token')
    delete api.defaults.headers.common['Authorization']
    queryClient.clear()
    setToken(null)
  }

  // 初回ロード時にトークンをaxiosに設定
  if (token && !api.defaults.headers.common['Authorization']) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  if (!token) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginPage onLogin={handleLogin} />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Layout page={page} setPage={setPage} onLogout={handleLogout} />
    </QueryClientProvider>
  )
}
