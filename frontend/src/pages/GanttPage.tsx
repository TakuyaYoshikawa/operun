import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scheduleApi } from '../api/schedule'
import { machinesApi } from '../api/machines'
import { settingsApi } from '../api/settings'
import { aiApi } from '../api/ai'
import { OrderModal } from '../components/OrderModal'
import type { ChatMessage } from '../api/ai'
import type { GanttTask } from '../api/schedule'

const DRAFT_BANNER_CLASS = 'bg-yellow-50 border-yellow-300 text-yellow-800'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// オーダーごとの色パレット（12色）
const ORDER_COLORS = [
  '#4f86c6', '#6ab187', '#e8a838', '#c0604b', '#8e6bbf',
  '#4abfbf', '#d4864e', '#5e9e6e', '#b35898', '#3d7abf',
  '#c9a227', '#697a8d',
]
const getOrderColor = (orderId: number) => ORDER_COLORS[orderId % ORDER_COLORS.length]

const PRIORITY_LABEL: Record<number, string> = { 1: '特急', 2: '高', 3: '通常' }

function fmtDt(s: string) {
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

// ── ホバーツールチップ ────────────────────────────────────────────────────────

interface TooltipState {
  task: GanttTask
  x: number
  y: number
}

function Tooltip({ state }: { state: TooltipState }) {
  const { task, x, y } = state
  const [orderNum, productName] = task.text.includes(' / ')
    ? task.text.split(' / ')
    : [null, task.text]

  // 画面右端に近いときは左側に表示
  const left = x + 220 > window.innerWidth ? x - 228 : x + 12
  const top  = y + 10

  return (
    <div
      className="fixed z-50 bg-gray-900 text-white text-xs rounded-xl shadow-2xl pointer-events-none p-3 w-52"
      style={{ left, top }}
    >
      <div className="font-bold text-sm mb-2 leading-tight">{productName ?? task.text}</div>
      {orderNum && <div className="text-gray-300 mb-2">{orderNum}</div>}
      <div className="space-y-1 text-gray-200">
        <div className="flex justify-between">
          <span className="text-gray-400">設備</span>
          <span>{task.resource}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">開始</span>
          <span>{fmtDt(task.start_date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">終了</span>
          <span>{fmtDt(task.end_date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">納期</span>
          <span className={task.is_delayed ? 'text-red-400 font-medium' : ''}>{task.due_date}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">優先度</span>
          <span>{PRIORITY_LABEL[task.priority] ?? task.priority}</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-700 flex gap-2 flex-wrap">
        {task.op_status === 'done'        && <span className="px-1.5 py-0.5 rounded bg-green-700 text-white text-xs">✓ 完了</span>}
        {task.op_status === 'in_progress' && <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-xs">作業中</span>}
        {task.is_urgent                   && <span className="px-1.5 py-0.5 rounded bg-orange-500 text-white text-xs">特急</span>}
        {task.is_delayed                  && <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-xs">⚠ 納期超過</span>}
      </div>
    </div>
  )
}

// ── ガントバー ────────────────────────────────────────────────────────────────

function GanttBar({
  task, dayWidth, startDay, onHover, onLeave, onClick, onMouseDown, onResizeStart, draftMode, isDragging,
}: {
  task: GanttTask
  dayWidth: number
  startDay: Date
  onHover: (task: GanttTask, x: number, y: number) => void
  onLeave: () => void
  onClick?: (task: GanttTask) => void
  onMouseDown?: (task: GanttTask, e: React.MouseEvent) => void
  onResizeStart?: (task: GanttTask, e: React.MouseEvent) => void
  draftMode?: boolean
  isDragging?: boolean
}) {
  const start = new Date(task.start_date)
  const end   = new Date(task.end_date)
  const offsetDays  = (start.getTime() - startDay.getTime()) / 86400000
  const durationDays = (end.getTime() - start.getTime()) / 86400000
  const left  = offsetDays * dayWidth
  const width = Math.max(durationDays * dayWidth, 6)

  const color      = getOrderColor(task.order_id)
  const productName = task.text.includes(' / ') ? task.text.split(' / ')[1] : task.text
  const isDone      = task.op_status === 'done'
  const isInProgress = task.op_status === 'in_progress'
  const draggable   = !task.is_locked && !isDone && !isInProgress

  return (
    <div
      onMouseMove={e => { if (!isDragging) onHover(task, e.clientX, e.clientY) }}
      onMouseLeave={onLeave}
      onClick={() => onClick?.(task)}
      onMouseDown={draggable ? e => onMouseDown?.(task, e) : undefined}
      style={{
        left,
        width,
        backgroundColor: color,
        opacity: isDone ? 0.5 : isDragging ? 0 : 1,
        outline: task.is_delayed ? '2px solid #ef4444' : (draftMode ? '1.5px dashed rgba(255,255,255,0.6)' : undefined),
        outlineOffset: task.is_delayed ? '-1px' : undefined,
        cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        position: 'absolute',
        backgroundImage: isInProgress
          ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 4px, transparent 4px, transparent 10px)'
          : undefined,
      }}
      className="top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden transition-opacity select-none"
    >
      {isDone && <span className="mr-1">✓</span>}
      {isInProgress && <span className="mr-1">▶</span>}
      {task.is_locked && !isDone && !isInProgress && <span className="mr-1 opacity-80">🔒</span>}
      {task.is_urgent && !isDone && !isInProgress && <span className="mr-1 text-yellow-200 font-bold">!</span>}
      {draftMode && !isDragging && <span className="mr-1 opacity-70">✎</span>}
      <span className="truncate flex-1 min-w-0">{productName}</span>
      {draggable && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
          onMouseDown={e => { e.stopPropagation(); onResizeStart?.(task, e) }}
        />
      )}
    </div>
  )
}

// ── AIアシスタント（制約調整チャット） ───────────────────────────────────────

const QUICK_PROMPTS = [
  '現在のスケジュール状況を教えて',
  'メンテナンスの予定を確認したい',
  '稼働設備の一覧を見せて',
  'ロック中の工程を解除したい',
]

function GanttAiAssistant({ onScheduleChanged }: { onScheduleChanged: () => void }) {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [toolLog, setToolLog] = useState<{ tool: string; label: string }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const MUTATING_TOOLS = new Set([
    'add_maintenance', 'delete_maintenance', 'update_machine_status',
    'add_calendar_exception', 'delete_calendar_exception',
    'toggle_operation_lock', 'update_machine_daily_hours',
    'update_machine_saturday_off',
  ])

  const TOOL_LABEL: Record<string, string> = {
    get_schedule_summary: 'スケジュール確認',
    get_constraints_summary: '制約確認',
    search_machines: '設備検索',
    get_machine_detail: '設備詳細取得',
    add_maintenance: 'メンテナンス追加',
    delete_maintenance: 'メンテナンス削除',
    update_machine_status: '設備状態変更',
    add_calendar_exception: 'カレンダー例外追加',
    delete_calendar_exception: 'カレンダー例外削除',
    toggle_operation_lock: '工程ロック切替',
    update_machine_daily_hours: '稼働時間変更',
    update_machine_saturday_off: '土曜稼働変更',
  }

  const sendMut = useMutation({
    mutationFn: (msgs: ChatMessage[]) => aiApi.agent(msgs),
    onSuccess: (res, msgs) => {
      setMessages([...msgs, { role: 'assistant', content: res.data.reply }])
      const calls = res.data.tool_calls ?? []
      if (calls.length > 0) {
        setToolLog(calls.map(c => ({ tool: c.tool, label: TOOL_LABEL[c.tool] ?? c.tool })))
        const hasMutation = calls.some(c => MUTATING_TOOLS.has(c.tool))
        if (hasMutation) {
          qc.invalidateQueries({ queryKey: ['machines'] })
          onScheduleChanged()
        }
      }
    },
    onError: () => {
      setMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。再度お試しください。' }])
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = (text: string) => {
    if (!text.trim() || sendMut.isPending) return
    const newMsgs: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(newMsgs)
    setInput('')
    setToolLog([])
    sendMut.mutate(newMsgs)
  }

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <h2 className="text-sm font-semibold text-gray-700">AIスケジュールアシスタント</h2>
          <span className="text-xs text-gray-400">設備制約・メンテナンス・ロックの調整ができます</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setToolLog([]) }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            会話をリセット
          </button>
        )}
      </div>

      {/* クイックアクション（会話がない時） */}
      {messages.length === 0 && (
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs text-gray-400 mb-2">よく使う操作：</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map(p => (
              <button
                key={p}
                onClick={() => handleSend(p)}
                disabled={sendMut.isPending}
                className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* メッセージ一覧 */}
      {messages.length > 0 && (
        <div className="px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {/* ツール実行ログ */}
          {sendMut.isPending && toolLog.length === 0 && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full" />
                考えています...
              </div>
            </div>
          )}
          {sendMut.isPending && toolLog.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-gray-500 space-y-0.5">
                {toolLog.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    {t.label}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full" />
                  <span className="text-gray-400">応答を生成中...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 入力エリア */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(input)
            }
          }}
          placeholder="例：旋盤Aを来週月火でメンテナンスにして　/ 納期超過中の工程を確認して"
          rows={2}
          disabled={sendMut.isPending}
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
        />
        <button
          onClick={() => handleSend(input)}
          disabled={sendMut.isPending || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex-shrink-0 h-[72px] flex items-center"
        >
          送信
        </button>
      </div>
    </div>
  )
}


// ── 下書き工程編集モーダル ────────────────────────────────────────────────────

function toLocalInput(dt: string) {
  // "YYYY-MM-DD HH:mm" → datetime-local value
  return dt.replace(' ', 'T')
}
function fromLocalInput(s: string) {
  return s.replace('T', ' ')
}

function DraftEditModal({
  task,
  onClose,
  onSave,
}: {
  task: GanttTask
  onClose: () => void
  onSave: (opId: number, start: string, end: string, machineId: number) => void
}) {
  const [start, setStart] = useState(toLocalInput(task.start_date))
  const [end, setEnd]     = useState(toLocalInput(task.end_date))
  const [machineId, setMachineId] = useState(task.machine_id)

  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list({ is_active: true }).then(r => r.data),
  })

  const productName = task.text.includes(' / ') ? task.text.split(' / ')[1] : task.text
  const orderNum    = task.text.includes(' / ') ? task.text.split(' / ')[0] : ''
  const opId        = parseInt(task.id.replace('op-', ''), 10)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-base font-bold text-gray-800 mb-1">工程を編集（下書き）</h3>
        <p className="text-xs text-gray-400 mb-4">{orderNum} / {productName}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日時</label>
            <input
              type="datetime-local"
              value={start}
              onChange={e => setStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">終了日時</label>
            <input
              type="datetime-local"
              value={end}
              onChange={e => setEnd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">設備</label>
            <select
              value={machineId}
              onChange={e => setMachineId(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              {machines?.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            キャンセル
          </button>
          <button
            onClick={() => onSave(opId, fromLocalInput(start), fromLocalInput(end), machineId)}
            className="flex-1 bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ── メインページ ──────────────────────────────────────────────────────────────

type ViewMode = 'day' | 'hour'
type RowView = 'machine' | 'order'

export default function GanttPage() {
  const qc = useQueryClient()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [viewDraft, setViewDraft] = useState(false)
  const [editTask, setEditTask] = useState<GanttTask | null>(null)
  const [orderModalId, setOrderModalId] = useState<number | null>(null)
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [rowView, setRowView] = useState<RowView>('machine')
  const [rangePreset, setRangePreset] = useState<'2w' | '4w' | '3m' | 'all'>('all')
  const [windowStart, setWindowStart] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [confirmCopyOpen, setConfirmCopyOpen] = useState(false)

  // ── DnD ─────────────────────────────────────────────────────────────────────
  type DragState = {
    mode: 'move' | 'resize'
    task: GanttTask
    barOffsetX: number   // move: click offset from bar left edge to mousedown point
    barLeft: number      // bar left edge in scroll-content coordinates (px)
    durationPx: number   // initial bar duration width in px
    startX: number; startY: number
    srRectLeft: number   // scrollRef.getBoundingClientRect().left — cached at drag start
    srRectTop: number    // scrollRef.getBoundingClientRect().top  — cached at drag start
    // updated live during drag (mutated directly, no React re-render):
    ghostLeft: number; ghostWidth: number
    targetMachine: string; isValid: boolean
  }
  const scrollRef   = useRef<HTMLDivElement>(null)
  const dragRef     = useRef<DragState | null>(null)
  const ghostElRef  = useRef<HTMLDivElement | null>(null)
  const didDragRef  = useRef(false)
  // Only used for row highlight (fires when target row changes, not every frame)
  const [dragTarget, setDragTarget] = useState<{ machine: string; isValid: boolean; taskId: string } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gantt'] })
    qc.invalidateQueries({ queryKey: ['gantt-draft'] })
  }

  const { data, isLoading } = useQuery({
    queryKey: viewDraft ? ['gantt-draft'] : ['gantt'],
    queryFn: () => scheduleApi.getGantt(viewDraft).then(r => r.data),
  })

  // has_draft はバックエンドが draft_start != null の有無を常に返すため、
  // 現行・下書きどちらのクエリでも同じ値になる
  const hasDraft = data?.has_draft ?? false

  const createDraftMut = useMutation({
    mutationFn: scheduleApi.createDraft,
    onSuccess: () => { invalidate(); setViewDraft(true) },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail ?? '現行スケジュールのコピーに失敗しました')
    },
  })

  const runMut = useMutation({
    mutationFn: scheduleApi.runSchedule,
    onSuccess: (res) => {
      invalidate()
      const scheduled = res.data?.scheduled ?? 0
      if (scheduled === 0) {
        alert('スケジュールする工程がありません。\n受注管理で各受注に「工程」（設備・所要時間）を追加してください。')
        return
      }
      setViewDraft(true)
    },
    onError: () => alert('スケジュール実行に失敗しました。'),
  })

  const commitMut = useMutation({
    mutationFn: scheduleApi.commitDraft,
    onSuccess: () => { invalidate(); setViewDraft(false) },
  })

  const discardMut = useMutation({
    mutationFn: scheduleApi.discardDraft,
    onSuccess: () => { invalidate(); setViewDraft(false) },
  })

  const updateDraftMut = useMutation({
    mutationFn: ({ opId, payload }: { opId: number; payload: { draft_start: string; draft_end: string; draft_machine_id?: number } }) =>
      scheduleApi.updateDraftOp(opId, payload),
    onSuccess: () => { setEditTask(null); qc.invalidateQueries({ queryKey: ['gantt-draft'] }) },
  })




  // ★ 早期returnより前に全フックを呼ぶ (React rules of hooks)
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => settingsApi.get().then(r => r.data),
  })

  // 設備マスターの表示順を取得（ガントの行並び順に使用）
  const { data: machinesMaster } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list().then(r => r.data),
  })

  // 負荷グラフ（一時非表示）
  // const { data: loadData } = useQuery({
  //   queryKey: ['load-chart', viewDraft],
  //   queryFn: () => scheduleApi.getLoadChart(21, viewDraft).then(r => r.data),
  // })

  // ── DnD: document-level mouse handlers ──────────────────────────────────────
  // 現在のレンダリング値をrefで保持（closureのstale問題を回避）
  const gsRef = useRef({
    machines: [] as string[],
    machineTypeMap: new Map<string, string | null>(),
    machineIdMap: new Map<string, number>(),
    viewMode: 'day' as ViewMode,
    dayWidth: 80,
    minDate: new Date(),
    days: [] as Date[],
    WORK_START: 8,
    WORK_HOURS: 8,
    hourWidth: 60,
    rowHeight: 48,
    hasDraft: false,
    toWorkingX: (_dt: Date): number => 0,
  })

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const dr = dragRef.current
      if (!dr || !scrollRef.current || !ghostElRef.current) return

      const moved = Math.hypot(e.clientX - dr.startX, e.clientY - dr.startY)
      if (moved < 5) return
      didDragRef.current = true

      const sr  = scrollRef.current
      const gs  = gsRef.current
      const el  = ghostElRef.current
      const headerH = gs.viewMode === 'hour' ? 44 : 40

      // srRectLeft/Top はドラッグ開始時にキャッシュ済み → getBoundingClientRect() 呼ばない
      if (dr.mode === 'move') {
        const ghostLeft = Math.max(0, e.clientX - dr.srRectLeft + sr.scrollLeft - dr.barOffsetX)
        const relY = e.clientY - dr.srRectTop - headerH
        const rowIdx = Math.max(0, Math.min(gs.machines.length - 1, Math.floor(relY / gs.rowHeight)))
        const targetMachine = gs.machines[rowIdx] ?? dr.task.resource

        const srcType = gs.machineTypeMap.get(dr.task.resource) ?? null
        const tgtType = gs.machineTypeMap.get(targetMachine) ?? null
        const isValid = srcType === null
          ? targetMachine === dr.task.resource
          : srcType === tgtType

        const ghostTop = headerH + rowIdx * gs.rowHeight + 6  // +6 ≈ top-1.5

        dr.ghostLeft = ghostLeft
        dr.targetMachine = targetMachine
        dr.isValid = isValid

        // transform: translate3d → GPU合成レイヤー、Layoutをスキップ
        // RAF なし → mousemove で直接書き込み（ブラウザが自動バッチ、1フレーム遅延なし）
        el.style.display = 'block'
        el.style.transform = `translate3d(${ghostLeft}px, ${ghostTop}px, 0)`
        el.style.width = `${dr.durationPx}px`
        el.style.opacity = isValid ? '0.7' : '0.3'
        el.style.outline = isValid ? '2px solid rgba(255,255,255,0.8)' : '2px solid #ef4444'

        // React state: ターゲット行が変わったときのみ更新（行ハイライト用）
        setDragTarget(prev => {
          if (prev?.machine === targetMachine && prev?.isValid === isValid) return prev
          return { machine: targetMachine, isValid, taskId: dr.task.id }
        })
      } else {
        // resize mode: 右端のみ移動
        const deltaX = e.clientX - dr.startX
        const minW = gs.viewMode === 'hour' ? gs.hourWidth * 0.5 : gs.dayWidth * 0.1
        const newWidth = Math.max(minW, dr.durationPx + deltaX)
        const rowIdx = gs.machines.indexOf(dr.task.resource)
        const ghostTop = headerH + (rowIdx >= 0 ? rowIdx : 0) * gs.rowHeight + 6

        dr.ghostWidth = newWidth

        el.style.display = 'block'
        el.style.transform = `translate3d(${dr.barLeft}px, ${ghostTop}px, 0)`
        el.style.width = `${newWidth}px`
        el.style.opacity = '0.75'
        el.style.outline = '2px solid rgba(255,255,255,0.9)'
      }
    }

    const onMouseUp = async () => {
      const dr = dragRef.current
      dragRef.current = null
      if (ghostElRef.current) {
        ghostElRef.current.style.display = 'none'
        ghostElRef.current.style.willChange = 'auto'  // GPUレイヤーを解放
      }
      setDragTarget(null)

      if (!dr || !didDragRef.current) return

      const gs = gsRef.current

      const fmt = (d: Date) => {
        const p = (n: number) => n.toString().padStart(2, '0')
        return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
      }

      // ピクセル → 日時変換（30分スナップ）
      const pixelToDate = (px: number): Date => {
        if (gs.viewMode === 'day') {
          const ms = gs.minDate.getTime() + (px / gs.dayWidth) * 86400000
          return new Date(Math.round(ms / (30 * 60000)) * (30 * 60000))
        } else {
          const dayIdx = Math.min(gs.days.length - 1, Math.max(0, Math.floor(px / gs.dayWidth)))
          const hourOff = (px % gs.dayWidth) / gs.hourWidth
          const d = new Date(gs.days[dayIdx])
          const totalH = gs.WORK_START + hourOff
          const h = Math.floor(totalH)
          const m = Math.round((totalH - h) * 2) * 30
          d.setHours(h, m >= 60 ? 0 : m, 0, 0)
          if (m >= 60) d.setHours(h + 1, 0, 0, 0)
          return d
        }
      }

      const opId = parseInt(dr.task.id.replace('op-', ''), 10)

      if (dr.mode === 'move') {
        if (!dr.isValid) return
        const newStart = pixelToDate(dr.ghostLeft)
        const durMs = new Date(dr.task.end_date).getTime() - new Date(dr.task.start_date).getTime()
        const newEnd = new Date(newStart.getTime() + durMs)
        const newMachineId = gs.machineIdMap.get(dr.targetMachine) ?? dr.task.machine_id
        const payload = { draft_start: fmt(newStart), draft_end: fmt(newEnd), draft_machine_id: newMachineId }
        if (!gs.hasDraft) { await createDraftMut.mutateAsync(); setViewDraft(true) }
        updateDraftMut.mutate({ opId, payload })
      } else {
        // resize: compute new end from ghostWidth
        const newEnd = pixelToDate(dr.barLeft + dr.ghostWidth)
        const newStart = new Date(dr.task.start_date)
        if (newEnd <= newStart) return
        const payload = { draft_start: fmt(newStart), draft_end: fmt(newEnd) }
        if (!gs.hasDraft) { await createDraftMut.mutateAsync(); setViewDraft(true) }
        updateDraftMut.mutate({ opId, payload })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])  // マウント時1回のみ登録

  const handleBarMouseDown = (task: GanttTask, e: React.MouseEvent) => {
    if (task.is_locked || task.op_status === 'done') return
    e.preventDefault()
    e.stopPropagation()
    didDragRef.current = false

    const barEl   = e.currentTarget as HTMLElement
    const barRect = barEl.getBoundingClientRect()
    const barOffsetX = e.clientX - barRect.left

    // getBoundingClientRect をここで1回だけ呼んでキャッシュ（mousemove 中は使わない）
    const sr = scrollRef.current
    const srRect = sr?.getBoundingClientRect() ?? new DOMRect()

    const gs = gsRef.current
    const startD = new Date(task.start_date)
    const endD   = new Date(task.end_date)
    let barLeft: number, durationPx: number
    if (gs.viewMode === 'day') {
      barLeft    = ((startD.getTime() - gs.minDate.getTime()) / 86400000) * gs.dayWidth
      durationPx = ((endD.getTime() - startD.getTime()) / 86400000) * gs.dayWidth
    } else {
      barLeft    = gs.toWorkingX(startD)
      durationPx = Math.max(gs.toWorkingX(endD) - barLeft, 4)
    }

    // ゴーストの初期スタイルをここで設定（色・サイズ固定部分）
    const el = ghostElRef.current
    if (el) {
      el.style.backgroundColor = getOrderColor(task.order_id)
      el.style.willChange = 'transform'  // GPUレイヤーに昇格
    }

    dragRef.current = {
      mode: 'move', task, barOffsetX, barLeft, durationPx,
      startX: e.clientX, startY: e.clientY,
      srRectLeft: srRect.left, srRectTop: srRect.top,
      ghostLeft: barLeft, ghostWidth: durationPx,
      targetMachine: task.resource, isValid: true,
    }
  }

  const handleResizeMouseDown = (task: GanttTask, e: React.MouseEvent) => {
    if (task.is_locked || task.op_status === 'done') return
    e.preventDefault()
    e.stopPropagation()
    didDragRef.current = false

    const sr = scrollRef.current
    const srRect = sr?.getBoundingClientRect() ?? new DOMRect()

    const gs = gsRef.current
    const startD = new Date(task.start_date)
    const endD   = new Date(task.end_date)
    let barLeft: number, durationPx: number
    if (gs.viewMode === 'day') {
      barLeft    = ((startD.getTime() - gs.minDate.getTime()) / 86400000) * gs.dayWidth
      durationPx = ((endD.getTime() - startD.getTime()) / 86400000) * gs.dayWidth
    } else {
      barLeft    = gs.toWorkingX(startD)
      durationPx = Math.max(gs.toWorkingX(endD) - barLeft, 4)
    }

    const el = ghostElRef.current
    if (el) {
      el.style.backgroundColor = getOrderColor(task.order_id)
      el.style.willChange = 'transform'
    }

    dragRef.current = {
      mode: 'resize', task, barOffsetX: 0, barLeft, durationPx,
      startX: e.clientX, startY: e.clientY,
      srRectLeft: srRect.left, srRectTop: srRect.top,
      ghostLeft: barLeft, ghostWidth: durationPx,
      targetMachine: task.resource, isValid: true,
    }
  }

  const handleBarClick = (task: GanttTask) => {
    if (didDragRef.current) return   // ドラッグ後はクリック扱いしない
    if (viewDraft) {
      setEditTask(task)
    } else {
      setOrderModalId(task.order_id)
    }
  }

  const handleSaveDraftOp = (opId: number, start: string, end: string, machineId: number) => {
    updateDraftMut.mutate({ opId, payload: { draft_start: start, draft_end: end, draft_machine_id: machineId } })
  }

  const tasks = data?.tasks ?? []

  if (isLoading || runMut.isPending) return <div className="p-6 text-gray-500 text-sm">読み込み中...</div>

  if (tasks.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">ガントチャート</h1>
          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
          >
            {runMut.isPending ? '計算中...' : 'スケジュール実行'}
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-gray-400 text-sm">スケジュールデータがありません</p>
          <p className="text-gray-400 text-xs mt-1">受注と設備を登録してからスケジュール実行してください</p>
        </div>
      </div>
    )
  }

  // 表示期間
  const allDates = tasks.flatMap(t => [new Date(t.start_date), new Date(t.end_date)])
  const taskMinDate = new Date(Math.min(...allDates.map(d => d.getTime())))
  const taskMaxDate = new Date(Math.max(...allDates.map(d => d.getTime())))

  const PRESET_DAYS: Record<string, number> = { '2w': 14, '4w': 28, '3m': 90 }
  const minDate = (() => {
    if (rangePreset === 'all') { const d = new Date(taskMinDate); d.setDate(d.getDate() - 1); return d }
    return new Date(windowStart)
  })()
  const maxDate = (() => {
    if (rangePreset === 'all') { const d = new Date(taskMaxDate); d.setDate(d.getDate() + 2); return d }
    const d = new Date(windowStart); d.setDate(d.getDate() + PRESET_DAYS[rangePreset]); return d
  })()

  const shiftWindow = (dir: 1 | -1) => {
    const n = PRESET_DAYS[rangePreset] ?? 14
    setWindowStart(d => { const nd = new Date(d); nd.setDate(nd.getDate() + dir * n); return nd })
  }
  const goToday = () => { const d = new Date(); d.setHours(0,0,0,0); setWindowStart(d) }

  const days: Date[] = []
  const cur = new Date(minDate)
  while (cur <= maxDate) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  const WORK_START = tenantSettings?.work_start_hour ?? 8
  const WORK_HOURS = tenantSettings?.work_hours_per_day ?? 8
  const hourWidth  = 30  // 時間モード: 1時間あたりのpx
  const dayWidth   = viewMode === 'hour' ? hourWidth * WORK_HOURS : 80
  const rowHeight  = 48
  // マスターの sort_order に従って設備を並び替え
  const machinesInTasks = [...new Set(tasks.map(t => t.resource))]
  const masterOrder = machinesMaster?.map(m => m.name) ?? []
  const machines = [
    ...machinesInTasks.filter(name => masterOrder.includes(name))
      .sort((a, b) => masterOrder.indexOf(a) - masterOrder.indexOf(b)),
    ...machinesInTasks.filter(name => !masterOrder.includes(name)),
  ]

  // 設備名 → machine_type / machine_id のマップ（DnD同一グループ判定に使用）
  const machineTypeMap = new Map(tasks.map(t => [t.resource, t.machine_type]))
  const machineIdMap   = new Map(tasks.map(t => [t.resource, t.machine_id]))

  // 受注ビュー用: 受注ごとにグループ化して納期順にソート
  const orderRows = (() => {
    const map = new Map<number, { orderId: number; label: string; due_date: string; color: string; tasks: GanttTask[] }>()
    for (const t of tasks) {
      if (!map.has(t.order_id)) {
        const [orderNum, productName] = t.text.includes(' / ') ? t.text.split(' / ') : [null, t.text]
        map.set(t.order_id, {
          orderId: t.order_id,
          label: orderNum ? `${orderNum} ${productName}` : productName,
          due_date: t.due_date,
          color: getOrderColor(t.order_id),
          tasks: [],
        })
      }
      map.get(t.order_id)!.tasks.push(t)
    }
    return [...map.values()].sort((a, b) => a.due_date.localeCompare(b.due_date))
  })()

  const labelColWidth = rowView === 'order' ? 176 : 144  // 受注ビューは少し広め

  // 時間モード: 稼働時間内のオフセット計算
  const toWorkingX = (dt: Date): number => {
    const dayIdx = Math.floor((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
      - new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime()) / 86400000)
    const h = dt.getHours() + dt.getMinutes() / 60
    const clampedH = Math.max(WORK_START, Math.min(WORK_START + WORK_HOURS, h))
    return dayIdx * dayWidth + (clampedH - WORK_START) * hourWidth
  }

  // DnDハンドラが参照する最新値をrefに同期
  gsRef.current = {
    machines, machineTypeMap, machineIdMap,
    viewMode, dayWidth, minDate, days,
    WORK_START, WORK_HOURS, hourWidth, rowHeight,
    hasDraft, toWorkingX,
  }

  return (
    <div className="p-6" onMouseLeave={() => setTooltip(null)}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ガントチャート</h1>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
            <span className="text-gray-400">! = 特急</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border-2 border-red-500" /> = 納期超過
            </span>
            <span className="flex items-center gap-1">🔒 = スケジュールロック</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 現行 / 下書き 切替 */}
          {hasDraft && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-sm">
              <button
                onClick={() => setViewDraft(false)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${!viewDraft ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
              >現行</button>
              <button
                onClick={() => setViewDraft(true)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${viewDraft ? 'bg-yellow-100 shadow text-yellow-800' : 'text-gray-500'}`}
              >下書き ✏️</button>
            </div>
          )}
          {/* 現行をコピーして下書き作成（非ドラフトモード時のみ表示） */}
          {!viewDraft && (
            <button
              onClick={() => hasDraft ? setConfirmCopyOpen(true) : createDraftMut.mutate()}
              disabled={createDraftMut.isPending}
              className="border border-yellow-400 text-yellow-700 bg-yellow-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-100 disabled:opacity-60"
            >
              {createDraftMut.isPending ? '作成中...' : '✏️ 現行をコピーして編集'}
            </button>
          )}
          {/* 表示期間フィルター */}
          <div className="flex items-center gap-1">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-sm">
              {(['2w', '4w', '3m', 'all'] as const).map(p => (
                <button key={p}
                  onClick={() => { setRangePreset(p); if (p !== 'all') goToday() }}
                  className={`px-2.5 py-1.5 rounded-md font-medium transition-colors text-xs ${rangePreset === p ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
                >{{ '2w': '2週', '4w': '4週', '3m': '3ヶ月', 'all': '全期間' }[p]}</button>
              ))}
            </div>
            {rangePreset !== 'all' && (
              <div className="flex gap-1">
                <button onClick={() => shiftWindow(-1)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm">‹</button>
                <button onClick={goToday} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-medium">今日</button>
                <button onClick={() => shiftWindow(1)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm">›</button>
              </div>
            )}
          </div>
          {/* 設備/受注 ビュー切替 */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-sm">
            <button
              onClick={() => setRowView('machine')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${rowView === 'machine' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >設備</button>
            <button
              onClick={() => setRowView('order')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${rowView === 'order' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >受注</button>
          </div>
          {/* 日/時間 切替 */}
          {(
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-sm">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'day' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >日</button>
            <button
              onClick={() => setViewMode('hour')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'hour' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >時間</button>
          </div>
          )}
          {/* 新規受注 */}
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="border border-blue-400 text-blue-600 bg-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50"
          >
            ＋ 新規受注
          </button>
          {/* スケジュール最適化 */}
          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending || commitMut.isPending || discardMut.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {runMut.isPending ? '計算中...' : 'スケジュール最適化'}
          </button>
        </div>
      </div>

      {/* 下書き確定バナー */}
      {viewDraft && hasDraft && (
        <div className={`mb-4 border rounded-xl px-4 py-3 flex items-center justify-between gap-4 ${DRAFT_BANNER_CLASS}`}>
          <div className="text-sm font-medium">
            ✏️ 下書き編集中。バーをドラッグして移動、クリックして詳細編集できます。
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <button
              onClick={() => setConfirmCopyOpen(true)}
              disabled={createDraftMut.isPending || discardMut.isPending || commitMut.isPending}
              className="px-3 py-1.5 border border-yellow-300 bg-white text-yellow-600 rounded-lg text-sm hover:bg-yellow-50 disabled:opacity-50"
              title="現行スケジュールをコピーして下書きをやり直す"
            >
              現行に戻す
            </button>
            <button
              onClick={() => discardMut.mutate()}
              disabled={discardMut.isPending || commitMut.isPending}
              className="px-4 py-1.5 border border-yellow-400 bg-white text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-50 disabled:opacity-50"
            >
              {discardMut.isPending ? '破棄中...' : '破棄'}
            </button>
            <button
              onClick={() => commitMut.mutate()}
              disabled={commitMut.isPending || discardMut.isPending}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {commitMut.isPending ? '確定中...' : '✓ 確定'}
            </button>
          </div>
        </div>
      )}

      {/* 下書きがある旨の通知（現行表示中） */}
      {!viewDraft && hasDraft && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm text-yellow-700">
          <span>✏️ 未確定の下書きスケジュールがあります。</span>
          <button onClick={() => setViewDraft(true)} className="underline font-medium">確認する</button>
        </div>
      )}

      {/* 負荷グラフ（一時非表示） */}

      {/* ガントチャート本体 */}
      {(<>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex">
          {/* ラベル列（設備ビュー / 受注ビュー共通） */}
          <div className="flex-shrink-0 border-r border-gray-200" style={{ width: labelColWidth }}>
            <div className="h-10 border-b border-gray-200 bg-gray-50 flex items-center px-3 text-xs font-medium text-gray-500">
              {rowView === 'machine' ? '設備' : '受注'}
            </div>
            {rowView === 'machine'
              ? machines.map(m => (
                  <div key={m} style={{ height: rowHeight }}
                    className="flex items-center px-3 text-sm font-medium text-gray-700 border-b border-gray-100 truncate">
                    {m}
                  </div>
                ))
              : orderRows.map(row => (
                  <div key={row.orderId} style={{ height: rowHeight }}
                    className="flex items-center gap-2 px-3 border-b border-gray-100 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: row.color }} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-700 truncate leading-tight">{row.label}</div>
                      <div className={`text-[10px] leading-tight ${row.tasks.some(t => t.is_delayed) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        納期 {row.due_date}
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* スクロール可能なガントエリア */}
          <div ref={scrollRef} className="overflow-x-auto flex-1 relative" style={{ cursor: dragTarget ? (dragTarget.isValid ? 'grabbing' : 'not-allowed') : undefined }}>
            {viewMode === 'day' ? (
              <>
                {/* 日単位ヘッダー */}
                <div className="flex border-b border-gray-200 bg-gray-50" style={{ width: days.length * dayWidth, height: 40 }}>
                  {days.map(d => (
                    <div
                      key={d.toISOString()}
                      style={{ width: dayWidth }}
                      className={`flex-shrink-0 flex flex-col items-center justify-center text-xs border-r border-gray-200 ${
                        d.getDay() === 0 ? 'bg-red-50 text-red-400' :
                        d.getDay() === 6 ? 'bg-blue-50 text-blue-400' : 'text-gray-500'
                      }`}
                    >
                      <span>{d.getMonth() + 1}/{d.getDate()}</span>
                      <span>{WEEKDAYS[d.getDay()]}</span>
                    </div>
                  ))}
                </div>
                {/* 各行（日モード） */}
                {rowView === 'machine'
                  ? machines.map(machineName => {
                      const isTargetRow = dragTarget?.machine === machineName
                      const rowBg = isTargetRow ? (dragTarget!.isValid ? 'bg-green-50' : 'bg-red-50') : ''
                      return (
                        <div key={machineName} style={{ height: rowHeight, width: days.length * dayWidth }}
                          className={`relative border-b border-gray-100 transition-colors ${rowBg}`}>
                          {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                            <div key={i} style={{ left: i * dayWidth, width: dayWidth }}
                              className={`absolute top-0 bottom-0 opacity-30 ${d.getDay() === 0 ? 'bg-red-100' : 'bg-blue-100'}`} />
                          ))}
                          {tasks.filter(t => t.resource === machineName).map(t => (
                            <GanttBar key={t.id} task={t} dayWidth={dayWidth} startDay={minDate}
                              onHover={(task, x, y) => setTooltip({ task, x, y })} onLeave={() => setTooltip(null)}
                              onClick={handleBarClick} onMouseDown={handleBarMouseDown}
                              onResizeStart={handleResizeMouseDown}
                              draftMode={viewDraft} isDragging={dragTarget?.taskId === t.id} />
                          ))}
                          {dragTarget?.machine === machineName && !dragTarget.isValid && (
                            <div className="absolute top-1 right-2 text-xs text-red-500 font-medium pointer-events-none z-20">✕ 別グループ</div>
                          )}
                        </div>
                      )
                    })
                  : orderRows.map(row => (
                      <div key={row.orderId} style={{ height: rowHeight, width: days.length * dayWidth }}
                        className="relative border-b border-gray-100">
                        {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                          <div key={i} style={{ left: i * dayWidth, width: dayWidth }}
                            className={`absolute top-0 bottom-0 opacity-30 ${d.getDay() === 0 ? 'bg-red-100' : 'bg-blue-100'}`} />
                        ))}
                        {/* 納期ライン */}
                        {(() => {
                          const dueX = (new Date(row.due_date).getTime() - minDate.getTime()) / 86400000 * dayWidth
                          return dueX >= 0 && dueX <= days.length * dayWidth
                            ? <div style={{ left: dueX, top: 4, bottom: 4 }}
                                className="absolute w-px bg-red-400 opacity-60 pointer-events-none z-10" />
                            : null
                        })()}
                        {row.tasks.map(t => {
                          const s = new Date(t.start_date)
                          const e = new Date(t.end_date)
                          const left  = Math.round((s.getTime() - minDate.getTime()) / 86400000 * dayWidth)
                          const width = Math.max(Math.round((e.getTime() - s.getTime()) / 86400000 * dayWidth), 4)
                          const isDone = t.op_status === 'done'
                          return (
                            <div key={t.id}
                              onMouseMove={ev => setTooltip({ task: t, x: ev.clientX, y: ev.clientY })}
                              onMouseLeave={() => setTooltip(null)}
                              onClick={() => handleBarClick(t)}
                              style={{ left, width, backgroundColor: row.color, opacity: isDone ? 0.45 : 1 }}
                              className="absolute top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden cursor-pointer select-none"
                            >
                              {isDone && <span className="mr-1 flex-shrink-0">✓</span>}
                              {t.is_locked && !isDone && <span className="mr-1 flex-shrink-0 opacity-80">🔒</span>}
                              {t.is_urgent && !isDone && <span className="mr-1 flex-shrink-0 text-yellow-200 font-bold">!</span>}
                              <span className="truncate">{t.resource}</span>
                            </div>
                          )
                        })}
                      </div>
                    ))
                }
              </>
            ) : (
              <>
                {/* 時間単位ヘッダー（2行：日付 + 時刻） */}
                {(() => {
                  const totalW = days.length * dayWidth
                  const hours = Array.from({ length: WORK_HOURS }, (_, i) => WORK_START + i)
                  return (
                    <div style={{ width: totalW }}>
                      {/* 日付行 */}
                      <div className="flex border-b border-gray-200 bg-gray-50" style={{ height: 22 }}>
                        {days.map(d => (
                          <div key={d.toISOString()} style={{ width: dayWidth, flexShrink: 0 }}
                            className={`flex items-center justify-center text-xs border-r border-gray-200 font-medium ${
                              d.getDay() === 0 ? 'bg-red-50 text-red-400' :
                              d.getDay() === 6 ? 'bg-blue-50 text-blue-400' : 'text-gray-600'}`}>
                            {d.getMonth()+1}/{d.getDate()}({WEEKDAYS[d.getDay()]})
                          </div>
                        ))}
                      </div>
                      {/* 時刻行 */}
                      <div className="flex border-b border-gray-200 bg-gray-50" style={{ height: 22 }}>
                        {days.map(d => hours.map(h => (
                          <div key={`${d.toISOString()}-${h}`} style={{ width: hourWidth, flexShrink: 0 }}
                            className={`flex items-center justify-center text-[10px] border-r border-gray-100 text-gray-400 ${
                              d.getDay() === 0 ? 'bg-red-50' : d.getDay() === 6 ? 'bg-blue-50' : ''}`}>
                            {h}
                          </div>
                        )))}
                      </div>
                    </div>
                  )
                })()}
                {/* 各行（時間モード） */}
                {rowView === 'machine' ? machines.map(machineName => {
                  const totalW = days.length * dayWidth
                  const hours  = Array.from({ length: WORK_HOURS }, (_, i) => WORK_START + i)
                  const isTargetRow = dragTarget?.machine === machineName
                  const rowBg = isTargetRow
                    ? dragTarget!.isValid ? 'bg-green-50' : 'bg-red-50'
                    : ''
                  return (
                    <div key={machineName} style={{ height: rowHeight, width: totalW }}
                      className={`relative border-b border-gray-100 transition-colors ${rowBg}`}
                    >
                      {/* 時間グリッド */}
                      {days.map((d, di) => (
                        <div key={d.toISOString()}>
                          {(d.getDay() === 0 || d.getDay() === 6) && (
                            <div style={{ left: di * dayWidth, width: dayWidth }}
                              className={`absolute top-0 bottom-0 opacity-20 ${d.getDay() === 0 ? 'bg-red-100' : 'bg-blue-100'}`} />
                          )}
                          {hours.map((_, hi) => (
                            <div key={hi} style={{ left: di * dayWidth + hi * hourWidth, width: hourWidth }}
                              className="absolute top-0 bottom-0 border-r border-gray-100" />
                          ))}
                        </div>
                      ))}
                      {/* バー（時間モード：toWorkingX で位置計算） */}
                      {tasks.filter(t => t.resource === machineName).map(t => {
                        const s     = new Date(t.start_date)
                        const eDate = new Date(t.end_date)
                        const left  = toWorkingX(s)
                        const width = Math.max(toWorkingX(eDate) - left, 4)
                        const color = getOrderColor(t.order_id)
                        const productName = t.text.includes(' / ') ? t.text.split(' / ')[1] : t.text
                        const isDone = t.op_status === 'done'
                        const draggable = !t.is_locked && !isDone
                        const isDragging = dragTarget?.taskId === t.id
                        return (
                          <div key={t.id}
                            onMouseMove={ev => { if (!dragTarget) setTooltip({ task: t, x: ev.clientX, y: ev.clientY }) }}
                            onMouseLeave={() => setTooltip(null)}
                            onClick={() => handleBarClick(t)}
                            onMouseDown={draggable ? e => handleBarMouseDown(t, e) : undefined}
                            style={{ left, width, backgroundColor: color,
                              opacity: isDone ? 0.5 : isDragging ? 0 : 1,
                              cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
                              outline: t.is_delayed ? '2px solid #ef4444' : (viewDraft ? '1.5px dashed rgba(255,255,255,0.6)' : undefined),
                              outlineOffset: t.is_delayed ? '-1px' : undefined,
                              position: 'absolute' }}
                            className="top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden select-none">
                            {isDone && <span className="mr-1">✓</span>}
                            {t.is_locked && !isDone && <span className="mr-1 opacity-80">🔒</span>}
                            {t.is_urgent && !isDone && <span className="mr-1 text-yellow-200 font-bold">!</span>}
                            {viewDraft && !isDragging && <span className="mr-1 opacity-70">✎</span>}
                            <span className="truncate flex-1 min-w-0">{productName}</span>
                            {draggable && (
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex-shrink-0"
                                style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
                                onMouseDown={e => { e.stopPropagation(); handleResizeMouseDown(t, e) }}
                              />
                            )}
                          </div>
                        )
                      })}
                      {/* ドロップ不可バッジ */}
                      {dragTarget?.machine === machineName && !dragTarget.isValid && (
                        <div className="absolute top-1 right-2 text-xs text-red-500 font-medium pointer-events-none z-20">
                          ✕ 別グループ
                        </div>
                      )}
                    </div>
                  )
                }) : orderRows.map(row => {
                  const totalW = days.length * dayWidth
                  const hours  = Array.from({ length: WORK_HOURS }, (_, i) => WORK_START + i)
                  return (
                    <div key={row.orderId} style={{ height: rowHeight, width: totalW }}
                      className="relative border-b border-gray-100">
                      {days.map((d, di) => (
                        <div key={d.toISOString()}>
                          {(d.getDay() === 0 || d.getDay() === 6) && (
                            <div style={{ left: di * dayWidth, width: dayWidth }}
                              className={`absolute top-0 bottom-0 opacity-20 ${d.getDay() === 0 ? 'bg-red-100' : 'bg-blue-100'}`} />
                          )}
                          {hours.map((_, hi) => (
                            <div key={hi} style={{ left: di * dayWidth + hi * hourWidth, width: hourWidth }}
                              className="absolute top-0 bottom-0 border-r border-gray-100" />
                          ))}
                        </div>
                      ))}
                      {/* 納期ライン */}
                      {(() => {
                        const dueX = toWorkingX(new Date(row.due_date))
                        return dueX >= 0 && dueX <= totalW
                          ? <div style={{ left: dueX, top: 4, bottom: 4 }}
                              className="absolute w-px bg-red-400 opacity-60 pointer-events-none z-10" />
                          : null
                      })()}
                      {row.tasks.map(t => {
                        const s = new Date(t.start_date)
                        const e = new Date(t.end_date)
                        const left  = toWorkingX(s)
                        const width = Math.max(toWorkingX(e) - left, 4)
                        const isDone = t.op_status === 'done'
                        return (
                          <div key={t.id}
                            onMouseMove={ev => setTooltip({ task: t, x: ev.clientX, y: ev.clientY })}
                            onMouseLeave={() => setTooltip(null)}
                            onClick={() => handleBarClick(t)}
                            style={{ left, width, backgroundColor: row.color, opacity: isDone ? 0.45 : 1, position: 'absolute' }}
                            className="top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden cursor-pointer select-none">
                            {isDone && <span className="mr-1 flex-shrink-0">✓</span>}
                            {t.is_locked && !isDone && <span className="mr-1 flex-shrink-0 opacity-80">🔒</span>}
                            {t.is_urgent && !isDone && <span className="mr-1 flex-shrink-0 text-yellow-200 font-bold">!</span>}
                            <span className="truncate">{t.resource}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )}

            {/* ゴーストバー: style はReactに渡さずDOMで直接管理（再レンダーで上書きされない） */}
            <div
              ref={el => {
                ghostElRef.current = el
                if (el) {
                  el.style.display = 'none'
                  el.style.position = 'absolute'
                  el.style.top = '0'
                  el.style.left = '0'
                }
              }}
              className="h-7 rounded pointer-events-none z-30"
            />
          </div>
        </div>
      </div>

      {/* 遅延サマリ */}
      {tasks.some(t => t.is_delayed) && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">⚠️ 納期超過の受注</p>
          <div className="space-y-1">
            {[...new Map(tasks.filter(t => t.is_delayed).map(t => [t.order_id, t])).values()].map(t => {
              const [orderNum, productName] = t.text.includes(' / ') ? t.text.split(' / ') : [null, t.text]
              return (
                <div key={t.order_id} className="text-xs text-red-600 flex gap-3 items-center">
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: getOrderColor(t.order_id) }}
                  />
                  <span className="font-medium">{productName}</span>
                  {orderNum && <span className="text-red-400">{orderNum}</span>}
                  <span>納期: {t.due_date}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AIアシスタントパネル */}
      <GanttAiAssistant onScheduleChanged={invalidate} />

      </>)} {/* ガントタブ終了 */}

      {/* ツールチップ */}
      {tooltip && <Tooltip state={tooltip} />}

      {/* 下書き編集モーダル */}
      {editTask && (
        <DraftEditModal
          task={editTask}
          onClose={() => setEditTask(null)}
          onSave={handleSaveDraftOp}
        />
      )}

      {/* 受注詳細モーダル（バークリック） */}
      {orderModalId && (
        <OrderModal
          orderId={orderModalId}
          onClose={() => setOrderModalId(null)}
          onChanged={invalidate}
        />
      )}

      {/* 新規受注モーダル */}
      {showNewOrderModal && (
        <OrderModal
          onClose={() => setShowNewOrderModal(false)}
          onChanged={invalidate}
        />
      )}

      {/* 現行スケジュールからコピー確認ダイアログ */}
      {confirmCopyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmCopyOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-base font-bold text-gray-800 mb-2">現行スケジュールをコピー</h3>
            <p className="text-sm text-gray-600 mb-1">
              確定済みの現行スケジュールをそのままコピーして、下書きとして編集できます。
            </p>
            {hasDraft && (
              <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-4">
                ⚠️ 現在の下書き編集内容は破棄されます。
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setConfirmCopyOpen(false)}
                className="flex-1 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  setConfirmCopyOpen(false)
                  createDraftMut.mutate()
                }}
                disabled={createDraftMut.isPending}
                className="flex-1 bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-60"
              >
                コピーして編集開始
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
