import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { machinesApi } from '../api/machines'
import type { Machine, MachineMaintenance } from '../api/machines'
import { customersApi } from '../api/customers'
import type { Customer } from '../api/customers'
import { calendarApi } from '../api/calendar'
import type { CalendarHoliday } from '../api/calendar'
import { productTemplatesApi } from '../api/productTemplates'
import type { ProductTemplate, TemplateOperationIn } from '../api/productTemplates'
import { settingsApi } from '../api/settings'
import { aiApi } from '../api/ai'
import type { ChatMessage as AiChatMessage } from '../api/ai'
// ── 設備グループ オートコンプリート ───────────────────────────────────────────

function MachineTypeInput({ value, onChange, existingTypes }: {
  value: string
  onChange: (v: string) => void
  existingTypes: string[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = value.trim()
    ? existingTypes.filter(t => t.toLowerCase().includes(value.toLowerCase()) && t !== value)
    : existingTypes

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        placeholder="旋盤"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-sm">
          {filtered.map(t => (
            <li
              key={t}
              onMouseDown={() => { onChange(t); setOpen(false) }}
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-gray-700 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Tab = 'machines' | 'customers' | 'calendar' | 'templates' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'machines', label: '設備マスタ' },
  { id: 'customers', label: '顧客マスタ' },
  { id: 'calendar', label: 'カレンダー' },
  { id: 'templates', label: '品番テンプレート' },
  { id: 'settings', label: '稼働設定' },
]

function getApiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { detail?: string } } }).response
    if (res?.data?.detail) return res.data.detail
  }
  return '削除に失敗しました'
}

// ── AIアシスタントパネル ──────────────────────────────────────────────────────

const TAB_CONTEXT: Record<Tab, string> = {
  machines:  '設備マスタ（create_machine ツールで登録できます。設備名・コード・タイプ・段取り時間などを指定してください）',
  customers: '顧客マスタ（create_customer ツールで登録できます。会社名・コード・担当者名・電話・メールを指定してください）',
  calendar:  'カレンダー例外日（add_calendar_exception ツールで登録できます。日付・稼働時間・名前を指定してください）',
  templates: '品番テンプレート（現在AIから直接登録できません。手動フォームをご利用ください）',
  settings:  '稼働設定',
}

type AgentMsg = { role: 'user' | 'assistant'; content: string; tool_calls?: { tool: string; input: Record<string, unknown>; result: unknown }[] }

function AiPanel({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<AgentMsg[]>([
    { role: 'assistant', content: `マスタ登録AIアシスタントです。現在「${TAB_CONTEXT[tab].split('（')[0]}」タブが選択されています。\n\n登録したい内容を自然言語で教えてください。\n例：「旋盤2号機を追加して。コードはLAT-002、グループは旋盤、段取り30分」` },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: AgentMsg = { role: 'user', content: input }
    const nextMsgs = [...messages, userMsg]
    setMessages(nextMsgs)
    setInput('')
    setLoading(true)

    try {
      const apiMsgs: AiChatMessage[] = nextMsgs
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))
      const res = await aiApi.agent(apiMsgs)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.reply,
        tool_calls: res.data.tool_calls,
      }])
      // マスタ系クエリを再取得
      qc.invalidateQueries({ queryKey: ['machines'] })

      qc.invalidateQueries({ queryKey: ['customers'] })
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。再試行してください。' }])
    } finally {
      setLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  return (
    <div className="mb-5 border border-blue-200 rounded-xl bg-blue-50 overflow-hidden shadow-sm">
      {/* パネルヘッダー */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600 text-white">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>🤖</span>
          <span>AIアシスタントで登録</span>
          <span className="text-blue-200 text-xs font-normal">— {TAB_CONTEXT[tab].split('（')[0]}</span>
        </div>
        <button onClick={onClose} className="text-blue-200 hover:text-white text-lg leading-none">×</button>
      </div>

      {/* メッセージ */}
      <div className="h-56 overflow-y-auto p-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
            }`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.tool_calls && m.tool_calls.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {m.tool_calls.map((tc, j) => (
                    <div key={j} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-600">
                      <span className="font-medium text-blue-600">{tc.tool}</span>
                      {(() => {
                        const r = tc.result
                        if (r && typeof r === 'object' && 'message' in (r as object)) {
                          return <span className="ml-2 text-green-600">{String((r as Record<string, unknown>)['message'])}</span>
                        }
                        return null
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-400">考え中...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力 */}
      <div className="flex gap-2 px-3 pb-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="例：旋盤2号機を追加して。コードはLAT-002..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          送信
        </button>
      </div>
    </div>
  )
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function MastersPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('machines')
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  // ── 設備 ──────────────────────────────────────────────────────────────────
  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list().then(r => r.data),
  })
  const [mForm, setMForm] = useState({ name: '', code: '', machine_type: '', daily_capacity_hours: 8, setup_time_minutes: 30, batch_capacity: 1, work_start_hour: '' as string | number, is_active: true, is_outsource: false, outsource_supplier: null as string | null })
  const [mEditId, setMEditId] = useState<number | null>(null)
  const [maintMachineId, setMaintMachineId] = useState<number | null>(null)
  const [maintForm, setMaintForm] = useState({ start_datetime: '', end_datetime: '', reason: '' })
  const createM = useMutation({ mutationFn: machinesApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); resetM() } })
  const updateM = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Machine> }) => machinesApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); resetM() } })
  const deleteM = useMutation({ mutationFn: machinesApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['machines'] }), onError: (err) => alert(getApiError(err)) })
  const reorderM = useMutation({
    mutationFn: (ids: number[]) => machinesApi.reorder(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machines'] }),
  })
  const dragMachineId = useRef<number | null>(null)
  const [dragOverMachineId, setDragOverMachineId] = useState<number | null>(null)
  const resetM = () => { setMForm({ name: '', code: '', machine_type: '', daily_capacity_hours: 8, setup_time_minutes: 30, batch_capacity: 1, work_start_hour: '', is_active: true, is_outsource: false, outsource_supplier: null }); setMEditId(null) }
  const { data: maintList } = useQuery({
    queryKey: ['maintenance', maintMachineId],
    queryFn: () => maintMachineId ? machinesApi.maintenance.list(maintMachineId).then(r => r.data) : Promise.resolve([]),
    enabled: maintMachineId !== null,
  })
  const addMaint = useMutation({
    mutationFn: (data: { start_datetime: string; end_datetime: string; reason?: string }) =>
      machinesApi.maintenance.create(maintMachineId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance', maintMachineId] }); setMaintForm({ start_datetime: '', end_datetime: '', reason: '' }) },
  })
  const deleteMaint = useMutation({
    mutationFn: (maintId: number) => machinesApi.maintenance.delete(maintMachineId!, maintId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance', maintMachineId] }),
  })

  // ── 顧客 ──────────────────────────────────────────────────────────────────
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list().then(r => r.data),
  })
  const [cForm, setCForm] = useState({ code: '', name: '', contact_name: '', phone: '', email: '', note: '' })
  const [cEditId, setCEditId] = useState<number | null>(null)
  const createC = useMutation({ mutationFn: customersApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); resetC() } })
  const updateC = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Customer> }) => customersApi.update(id, data as Parameters<typeof customersApi.update>[1]), onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); resetC() } })
  const deleteC = useMutation({ mutationFn: customersApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }), onError: (err) => alert(getApiError(err)) })
  const resetC = () => { setCForm({ code: '', name: '', contact_name: '', phone: '', email: '', note: '' }); setCEditId(null) }

  // ── 品番テンプレート ────────────────────────────────────────────────────────
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => productTemplatesApi.list().then(r => r.data),
  })
  const [tForm, setTForm] = useState({ product_code: '', product_name: '', note: '' })
  const [tOps, setTOps] = useState<TemplateOperationIn[]>([])
  const [tEditId, setTEditId] = useState<number | null>(null)
  const createT = useMutation({
    mutationFn: () => productTemplatesApi.create({ ...tForm, note: tForm.note || undefined, operations: tOps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); resetT() },
  })
  const deleteT = useMutation({ mutationFn: productTemplatesApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }) })
  const resetT = () => { setTForm({ product_code: '', product_name: '', note: '' }); setTOps([]); setTEditId(null) }
  const addTOp = () => setTOps(ops => [...ops, { sequence: ops.length + 1, machine_id: machines?.[0]?.id ?? 0, hours_per_unit: 1.0 }])
  const removeTOp = (i: number) => setTOps(ops => ops.filter((_, idx) => idx !== i).map((op, idx) => ({ ...op, sequence: idx + 1 })))

  // ── カレンダー ─────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear()
  const [calYear, setCalYear] = useState(currentYear)
  const { data: holidays } = useQuery({
    queryKey: ['calendar', calYear],
    queryFn: () => calendarApi.list(calYear).then(r => r.data),
  })
  const [hForm, setHForm] = useState({ date: '', holiday_name: '', working_hours: 0 })
  const addHoliday = useMutation({
    mutationFn: calendarApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar'] }); setHForm({ date: '', holiday_name: '', working_hours: 0 }) },
  })
  const deleteHoliday = useMutation({
    mutationFn: calendarApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  })
  const generateHolidays = useMutation({
    mutationFn: calendarApi.generate,
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['calendar'] }); alert(res.data.message) },
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">マスタ管理</h1>
        <button
          onClick={() => setAiPanelOpen(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            aiPanelOpen
              ? 'bg-blue-600 text-white'
              : 'border border-blue-300 text-blue-700 hover:bg-blue-50'
          }`}
        >
          <span>🤖</span>
          <span>AIアシスタントで登録</span>
        </button>
      </div>

      {/* AIパネル */}
      {aiPanelOpen && <AiPanel tab={tab} onClose={() => setAiPanelOpen(false)} />}

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 設備マスタ */}
      {tab === 'machines' && (
        <div>
          <form
            onSubmit={e => {
              e.preventDefault()
              const data = { ...mForm, work_start_hour: mForm.work_start_hour === '' ? null : Number(mForm.work_start_hour) }
              mEditId ? updateM.mutate({ id: mEditId, data }) : createM.mutate(data as Parameters<typeof machinesApi.create>[0])
            }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-2 gap-4"
          >
            <h2 className="col-span-2 text-base font-semibold text-gray-700">{mEditId ? '設備編集' : '設備追加'}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">設備コード *</label>
              <input required value={mForm.code} disabled={!!mEditId} onChange={e => setMForm(f => ({ ...f, code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" placeholder="M01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">設備名 *</label>
              <input required value={mForm.name} onChange={e => setMForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="旋盤1号機" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                設備グループ
                <span className="ml-1 text-gray-400 font-normal">（同グループの設備はスケジュール時に自動選択）</span>
              </label>
              <MachineTypeInput
                value={mForm.machine_type}
                onChange={v => setMForm(f => ({ ...f, machine_type: v }))}
                existingTypes={[...new Set((machines ?? []).map(m => m.machine_type).filter(Boolean) as string[])]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">1日稼働時間（時間）</label>
              <input type="number" min={1} max={24} step={0.5} value={mForm.daily_capacity_hours}
                onChange={e => setMForm(f => ({ ...f, daily_capacity_hours: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">段取り時間（分）</label>
              <input type="number" min={0} value={mForm.setup_time_minutes}
                onChange={e => setMForm(f => ({ ...f, setup_time_minutes: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                バッチ処理数
                <span className="ml-1 text-gray-400 font-normal">（炉・焼入れ等の同時投入可能数）</span>
              </label>
              <input type="number" min={1} max={100} value={mForm.batch_capacity}
                onChange={e => setMForm(f => ({ ...f, batch_capacity: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                稼働開始時刻（時）
                <span className="ml-1 text-gray-400 font-normal">（空欄=テナント設定を使用）</span>
              </label>
              <input type="number" min={0} max={23} placeholder="例: 6"
                value={mForm.work_start_hour}
                onChange={e => setMForm(f => ({ ...f, work_start_hour: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              {mEditId && <button type="button" onClick={resetM} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>}
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {mEditId ? '更新' : '追加'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-2 py-3 w-6"></th>
                  <th className="px-4 py-3 text-left">コード</th>
                  <th className="px-4 py-3 text-left">設備名</th>
                  <th className="px-4 py-3 text-left">グループ</th>
                  <th className="px-4 py-3 text-right">稼働時間</th>
                  <th className="px-4 py-3 text-right">段取り(分)</th>
                  <th className="px-4 py-3 text-center">状態</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {machines?.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">設備データがありません</td></tr>
                )}
                {machines?.map(m => (
                  <tr
                    key={m.id}
                    draggable
                    onDragStart={() => { dragMachineId.current = m.id }}
                    onDragOver={e => { e.preventDefault(); setDragOverMachineId(m.id) }}
                    onDragLeave={() => setDragOverMachineId(null)}
                    onDrop={() => {
                      setDragOverMachineId(null)
                      const fromId = dragMachineId.current
                      if (!fromId || fromId === m.id || !machines) return
                      const ids = machines.map(x => x.id)
                      const fromIdx = ids.indexOf(fromId)
                      const toIdx   = ids.indexOf(m.id)
                      ids.splice(fromIdx, 1)
                      ids.splice(toIdx, 0, fromId)
                      reorderM.mutate(ids)
                    }}
                    onDragEnd={() => setDragOverMachineId(null)}
                    className={`hover:bg-gray-50 ${dragOverMachineId === m.id ? 'bg-blue-50 border-t-2 border-blue-400' : ''}`}
                  >
                    <td className="px-2 py-3 text-gray-300 cursor-grab active:cursor-grabbing select-none text-base text-center">≡</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{m.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {m.machine_type
                        ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{m.machine_type}</span>
                        : <span className="text-gray-300 text-xs">未設定</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{m.daily_capacity_hours}h</td>
                    <td className="px-4 py-3 text-right text-gray-600">{m.setup_time_minutes}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_active ? '稼働中' : '停止'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { setMForm({ name: m.name, code: m.code, machine_type: m.machine_type ?? '', daily_capacity_hours: m.daily_capacity_hours, setup_time_minutes: m.setup_time_minutes, batch_capacity: m.batch_capacity ?? 1, work_start_hour: m.work_start_hour ?? '', is_active: m.is_active, is_outsource: m.is_outsource, outsource_supplier: m.outsource_supplier }); setMEditId(m.id) }} className="text-blue-500 hover:text-blue-700 mr-3 text-xs">編集</button>
                      <button onClick={() => setMaintMachineId(maintMachineId === m.id ? null : m.id)} className="text-purple-400 hover:text-purple-600 mr-3 text-xs">メンテ</button>
                      <button onClick={() => { if (confirm('削除しますか？')) deleteM.mutate(m.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* メンテナンス枠パネル */}
          {maintMachineId !== null && (
            <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-purple-800 mb-3">
                {machines?.find(m => m.id === maintMachineId)?.name} — メンテナンス枠
              </h3>
              <form
                onSubmit={e => {
                  e.preventDefault()
                  addMaint.mutate({ start_datetime: maintForm.start_datetime, end_datetime: maintForm.end_datetime, reason: maintForm.reason || undefined })
                }}
                className="flex gap-2 items-end flex-wrap mb-4"
              >
                <div>
                  <label className="block text-xs text-gray-500 mb-1">開始日時 *</label>
                  <input required type="datetime-local" value={maintForm.start_datetime}
                    onChange={e => setMaintForm(f => ({ ...f, start_datetime: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">終了日時 *</label>
                  <input required type="datetime-local" value={maintForm.end_datetime}
                    onChange={e => setMaintForm(f => ({ ...f, end_datetime: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">理由</label>
                  <input type="text" placeholder="定期点検・修理等" value={maintForm.reason}
                    onChange={e => setMaintForm(f => ({ ...f, reason: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-32" />
                </div>
                <button type="submit" disabled={addMaint.isPending}
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60">
                  ＋ 登録
                </button>
              </form>
              {maintList && maintList.length > 0 ? (
                <div className="space-y-1">
                  {maintList.map((mw: MachineMaintenance) => (
                    <div key={mw.id} className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg text-sm border border-purple-100">
                      <span className="text-gray-700">{mw.start_datetime.slice(0, 16).replace('T', ' ')} 〜 {mw.end_datetime.slice(0, 16).replace('T', ' ')}</span>
                      {mw.reason && <span className="text-gray-500 text-xs bg-gray-100 px-2 py-0.5 rounded">{mw.reason}</span>}
                      <button onClick={() => deleteMaint.mutate(mw.id)} className="ml-auto text-red-300 hover:text-red-500 text-xs">削除</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">メンテナンス枠なし</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 顧客マスタ */}
      {tab === 'customers' && (
        <div>
          <form
            onSubmit={e => {
              e.preventDefault()
              const payload = {
                code: cForm.code,
                name: cForm.name,
                contact_name: cForm.contact_name || undefined,
                phone: cForm.phone || undefined,
                email: cForm.email || undefined,
                note: cForm.note || undefined,
              }
              cEditId ? updateC.mutate({ id: cEditId, data: payload }) : createC.mutate(payload)
            }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-2 gap-4"
          >
            <h2 className="col-span-2 text-base font-semibold text-gray-700">{cEditId ? '顧客編集' : '顧客追加'}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">顧客コード *</label>
              <input required value={cForm.code} disabled={!!cEditId} onChange={e => setCForm(f => ({ ...f, code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" placeholder="C001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">会社名 *</label>
              <input required value={cForm.name} onChange={e => setCForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="鈴木商事" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">担当者名</label>
              <input value={cForm.contact_name} onChange={e => setCForm(f => ({ ...f, contact_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="鈴木一郎" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
              <input value={cForm.phone} onChange={e => setCForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="03-1234-5678" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
              <input type="email" value={cForm.email} onChange={e => setCForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="info@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input value={cForm.note} onChange={e => setCForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              {cEditId && <button type="button" onClick={resetC} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>}
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {cEditId ? '更新' : '追加'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">コード</th>
                  <th className="px-4 py-3 text-left">会社名</th>
                  <th className="px-4 py-3 text-left">担当者</th>
                  <th className="px-4 py-3 text-left">電話</th>
                  <th className="px-4 py-3 text-left">メール</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers?.items?.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">顧客データがありません</td></tr>
                )}
                {customers?.items?.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{c.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setCForm({ code: c.code, name: c.name, contact_name: c.contact_name ?? '', phone: c.phone ?? '', email: c.email ?? '', note: c.note ?? '' })
                          setCEditId(c.id)
                        }}
                        className="text-blue-500 hover:text-blue-700 mr-3 text-xs"
                      >編集</button>
                      <button onClick={() => { if (confirm('削除しますか？')) deleteC.mutate(c.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 品番テンプレート */}
      {tab === 'templates' && (
        <div>
          {/* 登録フォーム */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-700 mb-4">{tEditId ? 'テンプレート編集' : 'テンプレート追加'}</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">品番 *</label>
                <input required value={tForm.product_code} onChange={e => setTForm(f => ({ ...f, product_code: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ABC-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">品名 *</label>
                <input required value={tForm.product_name} onChange={e => setTForm(f => ({ ...f, product_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="シャフトA" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
                <input value={tForm.note} onChange={e => setTForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">標準工程</span>
                <button type="button" onClick={addTOp} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ 工程追加</button>
              </div>
              {tOps.length === 0 && <p className="text-xs text-gray-400">工程を追加してください</p>}
              {tOps.map((op, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
                  <span className="text-xs text-gray-500">工程{op.sequence}</span>
                  <select value={op.machine_id} onChange={e => setTOps(ops => ops.map((o, idx) => idx === i ? { ...o, machine_id: Number(e.target.value) } : o))}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                    {machines?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0.1} step={0.1} value={op.hours_per_unit}
                      onChange={e => setTOps(ops => ops.map((o, idx) => idx === i ? { ...o, hours_per_unit: Number(e.target.value) } : o))}
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm w-20" />
                    <span className="text-xs text-gray-400">h/個</span>
                  </div>
                  <button type="button" onClick={() => removeTOp(i)} className="text-red-400 hover:text-red-600 text-xs text-left">削除</button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              {tEditId && <button type="button" onClick={resetT} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>}
              <button
                onClick={() => createT.mutate()}
                disabled={!tForm.product_code || !tForm.product_name}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {tEditId ? '更新' : '追加'}
              </button>
            </div>
          </div>

          {/* テンプレート一覧 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">品番</th>
                  <th className="px-4 py-3 text-left">品名</th>
                  <th className="px-4 py-3 text-left">標準工程</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">テンプレートがありません</td></tr>
                )}
                {templates?.map((t: ProductTemplate) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{t.product_code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{t.product_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {t.operations.length === 0 ? '—' : t.operations.map(op => `${op.machine_name}(${op.hours_per_unit}h/個)`).join(' → ')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { if (confirm('削除しますか？')) deleteT.mutate(t.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* カレンダー管理 */}
      {tab === 'calendar' && (
        <div>
          {/* 年選択 + 祝日自動生成 */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex items-center gap-2">
              <button onClick={() => setCalYear(y => y - 1)} className="px-2 py-1 border rounded text-sm hover:bg-gray-50">◀</button>
              <span className="font-semibold text-gray-700 w-16 text-center">{calYear}年</span>
              <button onClick={() => setCalYear(y => y + 1)} className="px-2 py-1 border rounded text-sm hover:bg-gray-50">▶</button>
            </div>
            <button
              onClick={() => { if (confirm(`${calYear}年の日本の祝日を自動登録しますか？`)) generateHolidays.mutate(calYear) }}
              disabled={generateHolidays.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {generateHolidays.isPending ? '生成中...' : '祝日を自動生成'}
            </button>
          </div>

          {/* 休日追加フォーム */}
          <form
            onSubmit={e => { e.preventDefault(); addHoliday.mutate({ date: hForm.date, holiday_name: hForm.holiday_name || undefined, working_hours: hForm.working_hours }) }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-3 gap-4"
          >
            <h2 className="col-span-3 text-base font-semibold text-gray-700">休日を手動追加</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">日付 *</label>
              <input type="date" required value={hForm.date} onChange={e => setHForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">休日名</label>
              <input value={hForm.holiday_name} onChange={e => setHForm(f => ({ ...f, holiday_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="お盆休み" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">稼働時間（0=全休 / 4=半日）</label>
              <select value={hForm.working_hours} onChange={e => setHForm(f => ({ ...f, working_hours: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value={0}>0h（全休）</option>
                <option value={4}>4h（半日）</option>
                <option value={8}>8h（通常稼働）</option>
              </select>
            </div>
            <div className="col-span-3 flex justify-end">
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">追加</button>
            </div>
          </form>

          {/* 休日一覧 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">日付</th>
                  <th className="px-4 py-3 text-left">休日名</th>
                  <th className="px-4 py-3 text-center">稼働時間</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    休日データがありません。「祝日を自動生成」ボタンで{calYear}年の祝日を一括登録できます。
                  </td></tr>
                )}
                {holidays?.map((h: CalendarHoliday) => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700">{h.date}</td>
                    <td className="px-4 py-3 text-gray-800">{h.holiday_name ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${h.working_hours === 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {h.working_hours === 0 ? '全休' : `${h.working_hours}h`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { if (confirm('削除しますか？')) deleteHoliday.mutate(h.date) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 稼働設定 */}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

function SettingsTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => settingsApi.get().then(r => r.data),
  })
  const [form, setForm] = useState<{ work_start_hour: number; work_hours_per_day: number; saturday_off: boolean } | null>(null)
  const current = form ?? data

  const mut = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-settings'] }); setForm(null) },
  })

  if (isLoading || !current) return <div className="text-sm text-gray-400 py-8 text-center">読み込み中...</div>

  const isDirty = form !== null

  return (
    <div className="max-w-md">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="text-sm font-semibold text-gray-700">工場稼働時間</h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">稼働開始時刻</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={12}
              value={current.work_start_hour}
              onChange={e => setForm(f => ({ ...(f ?? current), work_start_hour: Number(e.target.value) }))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span className="text-sm text-gray-500">時</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">例：8 → 8:00開始</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">1日の稼働時間</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={24} step={0.5}
              value={current.work_hours_per_day}
              onChange={e => setForm(f => ({ ...(f ?? current), work_hours_per_day: Number(e.target.value) }))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span className="text-sm text-gray-500">時間</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            例：8 → {current.work_start_hour}:00〜{current.work_start_hour + current.work_hours_per_day}:00
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">週休</label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={current.saturday_off ?? false}
                onChange={e => setForm(f => ({ ...(f ?? current), saturday_off: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700">土曜日を休日にする（週休2日）</span>
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-1">オフにすると土曜も稼働日として扱います（週休1日）</p>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={() => mut.mutate(current)}
            disabled={!isDirty || mut.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {mut.isPending ? '保存中...' : '保存'}
          </button>
          {isDirty && (
            <button onClick={() => setForm(null)} className="text-sm text-gray-400 hover:text-gray-600">
              リセット
            </button>
          )}
          {mut.isSuccess && !isDirty && (
            <span className="text-xs text-green-600">✓ 保存しました</span>
          )}
        </div>

        <div className="pt-2 border-t border-gray-100 text-xs text-gray-400 space-y-1">
          <p>※ この設定はスケジュール最適化時の稼働カレンダーに反映されます。</p>
          <p>※ 設備ごとの稼働時間は「設備マスタ」で個別に上書きできます。</p>
        </div>
      </div>
    </div>
  )
}
