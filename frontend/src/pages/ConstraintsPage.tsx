import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiApi } from '../api/ai'
import { machinesApi } from '../api/machines'
import { calendarApi } from '../api/calendar'

type Tab = 'summary' | 'machines' | 'maintenance' | 'calendar'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'summary',     label: '制約サマリー',     icon: '📋' },
  { id: 'machines',    label: '設備稼働状態',     icon: '🏭' },
  { id: 'maintenance', label: 'メンテナンス管理', icon: '🔧' },
  { id: 'calendar',    label: 'カレンダー例外',   icon: '📅' },
]

export default function ConstraintsPage() {
  const [tab, setTab] = useState<Tab>('summary')

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">制約設定</h1>
        <p className="text-xs text-gray-400 mt-0.5">スケジューリングに影響する制約の確認・手動設定</p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              tab === t.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'summary'     && <SummaryTab />}
      {tab === 'machines'    && <MachinesTab />}
      {tab === 'maintenance' && <MaintenanceTab />}
      {tab === 'calendar'    && <CalendarTab />}
    </div>
  )
}

// ── 制約サマリー ────────────────────────────────────────────────────────────

function SummaryTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['constraints-summary'],
    queryFn: () => aiApi.constraintsSummary().then(r => r.data),
    staleTime: 30_000,
  })

  if (isLoading) return <Loading />
  if (isError || !data) return <ErrorMsg />

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => refetch()} className="text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50">
          更新
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="稼働中設備"      value={data.active_machine_count}      unit="台"  color="green" />
        <SummaryCard label="停止中設備"      value={data.inactive_machines.length}  unit="台"  color={data.inactive_machines.length > 0 ? 'red' : 'gray'} />
        <SummaryCard label="今後のメンテ"    value={data.upcoming_maintenance.length} unit="件" color={data.upcoming_maintenance.length > 0 ? 'orange' : 'gray'} />
        <SummaryCard label="スケジュールロック" value={data.locked_operations_count} unit="工程" color={data.locked_operations_count > 0 ? 'blue' : 'gray'} />
      </div>

      {data.machine_groups.length > 0 && (
        <Section title="設備グループ（代替自動選択）" icon="🔄">
          <div className="space-y-2">
            {data.machine_groups.map(g => (
              <div key={g.type} className="flex items-start gap-3 text-sm">
                <span className="font-medium text-gray-700 w-28 flex-shrink-0">{g.type}</span>
                <div className="flex flex-wrap gap-1.5">
                  {g.machines.map(m => (
                    <span key={m} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{m}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.inactive_machines.length > 0 && (
        <Section title="停止中の設備" icon="🚫" accent="red">
          {data.inactive_machines.map(m => (
            <div key={m.id} className="flex items-center gap-3 text-sm py-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="font-medium text-gray-800">{m.name}</span>
              {m.type && <span className="text-gray-400 text-xs">{m.type}</span>}
            </div>
          ))}
        </Section>
      )}

      {data.upcoming_maintenance.length > 0 && (
        <Section title="今後のメンテナンス予定" icon="🔧" accent="orange">
          {data.upcoming_maintenance.map((mw, i) => (
            <div key={i} className="text-sm py-1">
              <div className="font-medium text-gray-800">{mw.machine}{mw.reason && <span className="text-gray-400 font-normal ml-2 text-xs">— {mw.reason}</span>}</div>
              <div className="text-gray-500 text-xs">{mw.start} 〜 {mw.end}</div>
            </div>
          ))}
        </Section>
      )}

      {data.calendar_exceptions.length > 0 && (
        <Section title="カレンダー例外（今後3ヶ月）" icon="📅">
          <div className="space-y-1.5">
            {data.calendar_exceptions.map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-24 flex-shrink-0">{h.date}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${h.working_hours === 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {h.type}
                </span>
                {h.name && <span className="text-gray-600">{h.name}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.locked_operations_count > 0 && (
        <Section title={`スケジュールロック済み工程（${data.locked_operations_count}件）`} icon="🔒" accent="blue">
          {data.locked_operations.map(op => (
            <div key={op.id} className="flex items-center gap-3 text-sm py-0.5">
              <span className="font-medium text-gray-800">{op.order_number}</span>
              <span className="text-gray-400 text-xs">工程 #{op.sequence}</span>
              {op.planned_start && <span className="text-gray-500 text-xs ml-auto">{op.planned_start} 〜 {op.planned_end}</span>}
            </div>
          ))}
          {data.locked_operations_count > data.locked_operations.length && (
            <p className="text-xs text-gray-400 mt-2">他 {data.locked_operations_count - data.locked_operations.length} 件</p>
          )}
        </Section>
      )}
    </div>
  )
}

// ── 設備稼働状態 ────────────────────────────────────────────────────────────

function MachinesTab() {
  const qc = useQueryClient()
  const { data: machines, isLoading } = useQuery({
    queryKey: ['machines-all'],
    queryFn: () => machinesApi.list().then(r => r.data),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      machinesApi.update(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines-all'] })
      qc.invalidateQueries({ queryKey: ['constraints-summary'] })
    },
  })

  if (isLoading) return <Loading />

  const active   = machines?.filter(m => m.is_active)  ?? []
  const inactive = machines?.filter(m => !m.is_active) ?? []

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        停止中の設備にはスケジュールが割り当てられません。
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          稼働中（{active.length}台）
        </div>
        {active.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">稼働中の設備がありません</div>
        ) : (
          active.map(m => (
            <MachineRow key={m.id} machine={m} onToggle={id => toggleMut.mutate({ id, is_active: false })} loading={toggleMut.isPending} />
          ))
        )}
      </div>

      {inactive.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-xs font-semibold text-red-500 uppercase tracking-wider">
            停止中（{inactive.length}台）
          </div>
          {inactive.map(m => (
            <MachineRow key={m.id} machine={m} onToggle={id => toggleMut.mutate({ id, is_active: true })} loading={toggleMut.isPending} stopped />
          ))}
        </div>
      )}
    </div>
  )
}

function MachineRow({ machine, onToggle, loading, stopped }: {
  machine: import('../api/machines').Machine
  onToggle: (id: number) => void
  loading: boolean
  stopped?: boolean
}) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-800">{machine.name}</div>
        <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
          <span>{machine.code}</span>
          {machine.machine_type && <span>タイプ: {machine.machine_type}</span>}
          {machine.is_outsource && <span className="text-purple-500">外注</span>}
        </div>
      </div>
      <button
        onClick={() => onToggle(machine.id)}
        disabled={loading}
        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
          stopped
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-red-100 text-red-700 hover:bg-red-200'
        }`}
      >
        {stopped ? '稼働再開' : '停止する'}
      </button>
    </div>
  )
}

// ── メンテナンス管理 ────────────────────────────────────────────────────────

function MaintenanceTab() {
  const qc = useQueryClient()
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null)
  const [form, setForm] = useState({ start: '', end: '', reason: '' })
  const [showForm, setShowForm] = useState(false)

  const { data: machines } = useQuery({
    queryKey: ['machines-all'],
    queryFn: () => machinesApi.list().then(r => r.data),
  })

  const { data: maintList, isLoading } = useQuery({
    queryKey: ['maintenance', selectedMachineId],
    queryFn: () => machinesApi.maintenance.list(selectedMachineId!).then(r => r.data),
    enabled: selectedMachineId !== null,
  })

  const createMut = useMutation({
    mutationFn: () => machinesApi.maintenance.create(selectedMachineId!, {
      start_datetime: form.start.replace('T', ' '),
      end_datetime:   form.end.replace('T', ' '),
      reason: form.reason || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance', selectedMachineId] })
      qc.invalidateQueries({ queryKey: ['constraints-summary'] })
      setForm({ start: '', end: '', reason: '' })
      setShowForm(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (maintId: number) => machinesApi.maintenance.delete(selectedMachineId!, maintId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance', selectedMachineId] })
      qc.invalidateQueries({ queryKey: ['constraints-summary'] })
    },
  })

  return (
    <div className="space-y-4">
      {/* 設備選択 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">対象設備を選択</label>
        <select
          value={selectedMachineId ?? ''}
          onChange={e => { setSelectedMachineId(Number(e.target.value) || null); setShowForm(false) }}
          className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">-- 設備を選んでください --</option>
          {machines?.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {selectedMachineId && (
        <>
          {/* メンテナンス一覧 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">メンテナンス予定</span>
              <button
                onClick={() => setShowForm(v => !v)}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
              >
                + 追加
              </button>
            </div>

            {/* 追加フォーム */}
            {showForm && (
              <div className="p-4 border-b border-gray-100 bg-blue-50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">開始日時</label>
                    <input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">終了日時</label>
                    <input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">理由（任意）</label>
                  <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="定期点検、修理など"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-white">
                    キャンセル
                  </button>
                  <button
                    onClick={() => createMut.mutate()}
                    disabled={!form.start || !form.end || createMut.isPending}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createMut.isPending ? '登録中...' : '登録'}
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="p-4 text-sm text-gray-400 text-center">読み込み中...</div>
            ) : maintList?.length === 0 ? (
              <div className="p-4 text-sm text-gray-400 text-center">メンテナンス予定はありません</div>
            ) : (
              maintList?.map(mw => (
                <div key={mw.id} className="flex items-center px-4 py-3 border-b border-gray-100 last:border-0">
                  <div className="flex-1 text-sm">
                    <div className="text-gray-800">
                      {mw.start_datetime.replace('T', ' ').slice(0, 16)} 〜 {mw.end_datetime.replace('T', ' ').slice(0, 16)}
                    </div>
                    {mw.reason && <div className="text-gray-400 text-xs mt-0.5">{mw.reason}</div>}
                  </div>
                  <button
                    onClick={() => deleteMut.mutate(mw.id)}
                    disabled={deleteMut.isPending}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── カレンダー例外 ──────────────────────────────────────────────────────────

function CalendarTab() {
  const qc = useQueryClient()
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [form, setForm]   = useState({ date: '', holiday_name: '', working_hours: '0' })
  const [showForm, setShowForm] = useState(false)

  const { data: holidays, isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => calendarApi.list(year, month).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => calendarApi.create({
      date: form.date,
      holiday_name: form.holiday_name || undefined,
      working_hours: parseFloat(form.working_hours),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['constraints-summary'] })
      setForm({ date: '', holiday_name: '', working_hours: '0' })
      setShowForm(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (date: string) => calendarApi.delete(date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['constraints-summary'] })
    },
  })

  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

  return (
    <div className="space-y-4">
      {/* 月ナビ */}
      <div className="flex items-center gap-3">
        <button onClick={() => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">‹</button>
        <span className="text-sm font-medium text-gray-700">{year}年 {months[month - 1]}</span>
        <button onClick={() => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">›</button>
        <button
          onClick={() => setShowForm(v => !v)}
          className="ml-auto text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + 追加
        </button>
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">日付</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">稼働時間</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="24" step="0.5" value={form.working_hours}
                  onChange={e => setForm(f => ({ ...f, working_hours: e.target.value }))}
                  className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <span className="text-sm text-gray-500">時間（0=全休）</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">名前（任意）</label>
            <input type="text" value={form.holiday_name} onChange={e => setForm(f => ({ ...f, holiday_name: e.target.value }))}
              placeholder="お盆、創業記念日など"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-white">
              キャンセル
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!form.date || createMut.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createMut.isPending ? '登録中...' : '登録'}
            </button>
          </div>
        </div>
      )}

      {/* 一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
          {year}年 {months[month - 1]}の例外日
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-gray-400 text-center">読み込み中...</div>
        ) : holidays?.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">この月の例外日はありません</div>
        ) : (
          holidays?.map(h => (
            <div key={h.id} className="flex items-center px-4 py-3 border-b border-gray-100 last:border-0">
              <div className="flex-1 flex items-center gap-3 text-sm">
                <span className="text-gray-700 w-24">{h.date}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${h.working_hours === 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {h.working_hours === 0 ? '全休' : `短縮 ${h.working_hours}h`}
                </span>
                {h.holiday_name && <span className="text-gray-500">{h.holiday_name}</span>}
              </div>
              <button
                onClick={() => deleteMut.mutate(h.date)}
                disabled={deleteMut.isPending}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── 共通コンポーネント ──────────────────────────────────────────────────────

function SummaryCard({ label, value, unit, color }: {
  label: string; value: number; unit: string
  color: 'green' | 'red' | 'orange' | 'blue' | 'gray'
}) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red:   'bg-red-50 text-red-700 border-red-200',
    orange:'bg-orange-50 text-orange-700 border-orange-200',
    blue:  'bg-blue-50 text-blue-700 border-blue-200',
    gray:  'bg-gray-50 text-gray-500 border-gray-200',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}<span className="text-sm font-normal ml-1">{unit}</span></div>
      <div className="text-xs mt-0.5 opacity-80">{label}</div>
    </div>
  )
}

function Section({ title, icon, accent, children }: {
  title: string; icon: string; accent?: 'red' | 'orange' | 'blue'; children: React.ReactNode
}) {
  const borderColors = { red: 'border-red-200', orange: 'border-orange-200', blue: 'border-blue-200' }
  return (
    <div className={`bg-white rounded-xl border ${accent ? borderColors[accent] : 'border-gray-200'} p-4 shadow-sm`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return <div className="p-6 text-center text-gray-400 text-sm">読み込み中...</div>
}
function ErrorMsg() {
  return <div className="p-6 text-red-500 text-sm">データの取得に失敗しました。</div>
}
