import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import api from './api/client'
import { ErrorBoundary } from './ErrorBoundary'
import LoginPage from './pages/LoginPage'
import OrdersPage from './pages/OrdersPage'
import MastersPage from './pages/MastersPage'
import GanttPage from './pages/GanttPage'
import DeliverySimPage from './pages/DeliverySimPage'
import WorkPage from './pages/WorkPage'
import AIChatPage from './pages/AIChatPage'
import ConstraintsPage from './pages/ConstraintsPage'
import ContactPage from './pages/ContactPage'
import { settingsApi } from './api/settings'
import type { TrialInfo } from './api/settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, throwOnError: false },
    mutations: { throwOnError: false },
  },
})

type Page = 'gantt' | 'orders' | 'masters' | 'delivery' | 'work' | 'ai' | 'constraints' | 'contact'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'gantt',    label: 'ガントチャート',     icon: '📊' },
  { id: 'work',     label: '工程実績',           icon: '🔧' },
  { id: 'orders',   label: '受注管理',           icon: '📋' },
  { id: 'delivery', label: '納期シミュレーター', icon: '🔍' },
]

// プロ版機能（未実装・クリック不可）
const PRO_NAV: { label: string; icon: string }[] = [
  { label: '在庫管理', icon: '📦' },
  { label: '人員管理', icon: '👷' },
]

// 設定メニュー（サイドバー下部・ドロワー内に分離）
const SETTINGS_NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'constraints', label: '制約設定の確認', icon: '🔒' },
  { id: 'masters',     label: 'マスタ管理',     icon: '⚙️' },
  { id: 'contact',     label: 'お問い合わせ',   icon: '✉️' },
]

// モバイル下部ナビに表示する項目
const BOTTOM_NAV: Page[] = ['gantt', 'orders', 'delivery', 'work']

// ── トライアルバッジ ───────────────────────────────────────────────────────────
function TrialBadge({ info }: { info: TrialInfo }) {
  if (info.days_remaining > 30) return null
  const urgent = info.days_remaining <= 7
  return (
    <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
      urgent
        ? 'bg-red-50 text-red-600 border-red-200'
        : 'bg-yellow-50 text-yellow-700 border-yellow-200'
    }`}>
      トライアル残り{info.days_remaining}日
    </div>
  )
}

// ── トライアル期限切れ画面 ────────────────────────────────────────────────────
function TrialExpiredScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
        <div className="text-4xl">⏰</div>
        <h1 className="text-xl font-bold text-gray-800">無料トライアル期間が終了しました</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          3ヶ月間の無料トライアルが終了しました。<br />
          引き続きご利用いただくには、プランへのご加入をお願いします。
        </p>
        <div className="bg-gray-50 rounded-xl p-4 text-left space-y-1">
          <p className="text-xs font-semibold text-gray-600">お問い合わせ</p>
          <p className="text-xs text-gray-500">support@operun.jp</p>
        </div>
        <button
          onClick={onLogout}
          className="w-full border border-gray-300 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50"
        >
          ログアウト
        </button>
      </div>
    </div>
  )
}

function PageContent({ page }: { page: Page }) {
  return (
    <>
      {page === 'gantt'       && <GanttPage />}
      {page === 'orders'      && <OrdersPage />}
      {page === 'masters'     && <MastersPage />}
      {page === 'delivery'    && <DeliverySimPage />}
      {page === 'work'        && <WorkPage />}
      {page === 'ai'          && <AIChatPage />}
      {page === 'constraints' && <ConstraintsPage />}
      {page === 'contact'     && <ContactPage />}
    </>
  )
}

function Layout({ page, setPage, onLogout }: {
  page: Page
  setPage: (p: Page) => void
  onLogout: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)

  const { data: trialInfo } = useQuery<TrialInfo>({
    queryKey: ['trial'],
    queryFn: () => settingsApi.getTrial().then(r => r.data),
    refetchInterval: 60_000,
  })

  const navigate = (p: Page) => {
    setPage(p)
    setMoreOpen(false)
  }

  if (trialInfo?.is_expired) {
    return <TrialExpiredScreen onLogout={onLogout} />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── デスクトップ: 左サイドバー (md以上) ── */}
      <aside className="hidden md:flex w-52 bg-white border-r border-gray-200 flex-col flex-shrink-0 h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-blue-700 tracking-tight">Operun</div>
            {trialInfo && <TrialBadge info={trialInfo} />}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">生産スケジューラ</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
          {/* プロ版機能（未実装・クリック不可） */}
          <div className="pt-2">
            <div className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider px-2 mb-1">Pro</div>
            {PRO_NAV.map(n => (
              <div
                key={n.label}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left cursor-not-allowed select-none"
              >
                <span className="opacity-40">{n.icon}</span>
                <div className="flex flex-col">
                  <span className="text-gray-300">{n.label}</span>
                  <span className="text-[10px] text-gray-300 font-normal">（プロ版機能）</span>
                </div>
              </div>
            ))}
          </div>
        </nav>
        {/* 設定セクション（ログアウトと分離） */}
        <div className="px-3 pt-3 pb-1 border-t border-gray-100">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">設定</div>
          <div className="space-y-1">
            {SETTINGS_NAV.map(n => (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  page === n.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <span>{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* ログアウト（最下部に独立） */}
        <div className="px-3 py-3 border-t border-gray-100">
          <button
            onClick={onLogout}
            className="w-full px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg text-left transition-colors"
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* ── コンテンツ ── */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <PageContent page={page} />
      </main>

      {/* ── モバイル: 下部ナビゲーション (md未満) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40 flex">
        {BOTTOM_NAV.map(id => {
          const n = NAV.find(x => x.id === id)!
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                page === id ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <span className="text-xl leading-none">{n.icon}</span>
              <span>{n.label}</span>
              {page === id && <span className="absolute bottom-0 w-8 h-0.5 bg-blue-600 rounded-full" />}
            </button>
          )
        })}
        {/* その他ボタン */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
            moreOpen ? 'text-blue-600' : 'text-gray-500'
          }`}
        >
          <span className="text-xl leading-none">☰</span>
          <span>その他</span>
        </button>
      </nav>

      {/* ── モバイル: その他ドロワー ── */}
      {moreOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMoreOpen(false)} />
          <div className="md:hidden fixed bottom-16 inset-x-0 bg-white rounded-t-2xl shadow-xl z-50 p-4">
            <div className="text-xs font-medium text-gray-400 mb-2 px-1">設定</div>
            <div className="space-y-1">
              {SETTINGS_NAV.map(n => (
                <button
                  key={n.id}
                  onClick={() => navigate(n.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors text-left ${
                    page === n.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg">{n.icon}</span>
                  <span>{n.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => { setMoreOpen(false); onLogout() }}
                className="w-full px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 rounded-xl text-left"
              >
                ログアウト
              </button>
            </div>
          </div>
        </>
      )}
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
    setToken(t)
  }

  const handleLogout = () => {
    localStorage.removeItem('operun_token')
    delete api.defaults.headers.common['Authorization']
    queryClient.clear()
    setToken(null)
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
      <ErrorBoundary>
        <Layout page={page} setPage={setPage} onLogout={handleLogout} />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}
