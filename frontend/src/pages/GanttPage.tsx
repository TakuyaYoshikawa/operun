import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scheduleApi } from '../api/schedule'
import { machinesApi } from '../api/machines'
import { settingsApi } from '../api/settings'
import { operationsApi } from '../api/operations'
import type { GanttTask, MachineLoad } from '../api/schedule'

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

  const color   = getOrderColor(task.order_id)
  const productName = task.text.includes(' / ') ? task.text.split(' / ')[1] : task.text
  const isDone  = task.op_status === 'done'
  const draggable = !task.is_locked && !isDone

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
        opacity: isDone ? 0.5 : isDragging ? 0.3 : 1,
        outline: task.is_delayed ? '2px solid #ef4444' : (draftMode ? '1.5px dashed rgba(255,255,255,0.6)' : undefined),
        outlineOffset: task.is_delayed ? '-1px' : undefined,
        cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        position: 'absolute',
      }}
      className="top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden transition-opacity select-none"
    >
      {isDone && <span className="mr-1">✓</span>}
      {task.is_locked && !isDone && <span className="mr-1 opacity-80">🔒</span>}
      {task.is_urgent && !isDone && <span className="mr-1 text-yellow-200 font-bold">!</span>}
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

// ── 負荷グラフ ────────────────────────────────────────────────────────────────

function LoadChart({ data }: { data: MachineLoad[]; days?: number }) {
  const WEEKDAYS_SHORT = ['日', '月', '火', '水', '木', '金', '土']
  const machines = data.filter(m => !m.is_outsource)

  if (machines.length === 0) return (
    <div className="p-8 text-center text-gray-400 text-sm">設備データがありません</div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[600px]">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 bg-gray-50 border-b border-gray-200 font-medium text-gray-600 sticky left-0 z-10 w-32">設備</th>
            {machines[0].days.map(d => {
              const dt = new Date(d.date)
              const dow = dt.getDay()
              const isWeekend = dow === 0 || dow === 6
              const isHoliday = d.capacity_hours === 0
              return (
                <th key={d.date}
                  className={`text-center px-1 py-1.5 border-b border-gray-200 font-medium w-10 ${
                    isHoliday ? 'bg-gray-100 text-gray-300' :
                    isWeekend ? (dow === 0 ? 'bg-red-50 text-red-400' : 'bg-blue-50 text-blue-400') :
                    'bg-gray-50 text-gray-500'
                  }`}>
                  <div>{dt.getMonth()+1}/{dt.getDate()}</div>
                  <div className="text-[9px] opacity-70">{WEEKDAYS_SHORT[dow]}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {machines.map(m => (
            <tr key={m.machine_id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white border-r border-gray-100">{m.name}</td>
              {m.days.map(d => {
                const isHoliday = d.capacity_hours === 0
                if (isHoliday) return (
                  <td key={d.date} className="px-1 py-1.5 text-center bg-gray-50">
                    <div className="text-gray-300 text-[10px]">休</div>
                  </td>
                )
                const pct = Math.min(d.utilization * 100, 100)
                const color = d.over_capacity ? 'bg-red-500' :
                              pct >= 85 ? 'bg-orange-400' :
                              pct >= 50 ? 'bg-blue-400' : 'bg-blue-200'
                return (
                  <td key={d.date} className="px-1 py-1.5 text-center" title={`${d.load_hours.toFixed(1)}h / ${d.capacity_hours}h`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-7 h-5 bg-gray-100 rounded-sm overflow-hidden flex items-end">
                        <div
                          className={`w-full rounded-sm transition-all ${color}`}
                          style={{ height: `${Math.max(pct, d.load_hours > 0 ? 10 : 0)}%` }}
                        />
                      </div>
                      {d.load_hours > 0 && (
                        <span className={`text-[9px] font-medium tabular-nums ${d.over_capacity ? 'text-red-600' : 'text-gray-500'}`}>
                          {d.load_hours.toFixed(0)}h
                        </span>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block"/> 超過</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block"/> 高負荷(≥85%)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block"/> 中(≥50%)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block"/> 低(&lt;50%)</span>
      </div>
    </div>
  )
}

// ── 工程詳細 / 完了モーダル ──────────────────────────────────────────────────

const OP_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  not_started: { label: '未着手',     cls: 'bg-gray-100 text-gray-600' },
  in_progress:  { label: '作業中',    cls: 'bg-blue-100 text-blue-700' },
  done:         { label: '完了',      cls: 'bg-green-100 text-green-700' },
  on_hold:      { label: '保留中',    cls: 'bg-yellow-100 text-yellow-700' },
}

function OperationDetailModal({
  task,
  onClose,
  onChanged,
}: {
  task: GanttTask
  onClose: () => void
  onChanged: () => void
}) {
  const [actualHours, setActualHours] = useState('')
  const [note, setNote]               = useState('')
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  // ローカルのロック状態（楽観的更新用）
  const [isLocked, setIsLocked] = useState(task.is_locked)

  const opId        = parseInt(task.id.replace('op-', ''), 10)
  const productName = task.text.includes(' / ') ? task.text.split(' / ')[1] : task.text
  const orderNum    = task.text.includes(' / ') ? task.text.split(' / ')[0] : ''
  const status      = task.op_status ?? 'not_started'
  const statusInfo  = OP_STATUS_LABEL[status] ?? OP_STATUS_LABEL.not_started
  const isDone      = status === 'done'

  const completeMut = useMutation({
    mutationFn: () => operationsApi.complete(opId, {
      actual_hours: actualHours ? parseFloat(actualHours) : undefined,
      actual_note: note || undefined,
    }),
    onSuccess: () => { onChanged(); onClose() },
  })

  const lockMut = useMutation({
    mutationFn: () => scheduleApi.toggleLock(opId),
    onMutate: () => setIsLocked(v => !v),   // 楽観的更新
    onSuccess: () => { onChanged() },
    onError: () => setIsLocked(v => !v),    // 失敗時に戻す
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">

        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-800">{productName}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{orderNum}　工程 #{task.sequence}</p>
          </div>
          <div className="flex items-center gap-2">
            {isLocked && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">🔒 固定</span>
            )}
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.cls}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* 詳細情報 */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 mb-4 text-sm">
          <Row label="設備" value={task.resource} />
          <Row label="予定開始" value={fmtDt(task.start_date)} />
          <Row label="予定終了" value={fmtDt(task.end_date)} />
          <Row label="納期" value={task.due_date} accent={task.is_delayed ? 'red' : undefined} />
          {(task.is_urgent || task.is_delayed) && (
            <div className="pt-1 flex gap-2 flex-wrap">
              {task.is_urgent  && <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">特急</span>}
              {task.is_delayed && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">⚠ 納期超過</span>}
            </div>
          )}
        </div>

        {/* 固定の説明 */}
        {isLocked && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-xs text-indigo-700 mb-3">
            この工程はスケジュール最適化の対象外です。日時・設備が変更されません。
          </div>
        )}

        {/* 完了済みの場合 */}
        {isDone && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 text-center mb-4">
            ✓ この工程は完了済みです（自動固定）
          </div>
        )}

        {/* 完了入力フォーム */}
        {!isDone && showCompleteForm && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                実績時間（任意）
                <span className="text-gray-400 font-normal ml-1">省略時は予定時間を使用</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={actualHours}
                  onChange={e => setActualHours(e.target.value)}
                  placeholder="例: 8.5"
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <span className="text-sm text-gray-500">時間</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メモ（任意）</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="完了時のメモを入力..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              />
            </div>
          </div>
        )}

        {/* アクションボタン */}
        <div className="space-y-2">
          {/* 固定 / 固定解除（完了時は非表示。完了=自動固定のため） */}
          {!isDone && (
            <button
              onClick={() => lockMut.mutate()}
              disabled={lockMut.isPending}
              className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${
                isLocked
                  ? 'bg-indigo-50 border border-indigo-300 text-indigo-700 hover:bg-indigo-100'
                  : 'bg-gray-50 border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {lockMut.isPending
                ? '処理中...'
                : isLocked
                  ? '🔓 固定を解除する'
                  : '🔒 スケジュールを固定する'}
            </button>
          )}

          {/* 完了ボタン */}
          {!isDone && (
            !showCompleteForm ? (
              <button
                onClick={() => setShowCompleteForm(true)}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                ✓ 工程完了にする
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCompleteForm(false)}
                  className="flex-1 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  戻る
                </button>
                <button
                  onClick={() => completeMut.mutate()}
                  disabled={completeMut.isPending}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                >
                  {completeMut.isPending ? '処理中...' : '完了を確定'}
                </button>
              </div>
            )
          )}

          {completeMut.isError && (
            <p className="text-xs text-red-500 text-center">エラーが発生しました。再試行してください。</p>
          )}

          <button
            onClick={onClose}
            className="w-full border border-gray-200 text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: 'red' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium ${accent === 'red' ? 'text-red-500' : 'text-gray-700'}`}>{value}</span>
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
type TabMode = 'gantt' | 'load'

export default function GanttPage() {
  const qc = useQueryClient()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [viewDraft, setViewDraft] = useState(false)
  const [editTask, setEditTask] = useState<GanttTask | null>(null)
  const [detailTask, setDetailTask] = useState<GanttTask | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [tabMode, setTabMode] = useState<TabMode>('gantt')
  const [confirmCopyOpen, setConfirmCopyOpen] = useState(false)

  // ── DnD ─────────────────────────────────────────────────────────────────────
  type DragState = {
    mode: 'move' | 'resize'
    task: GanttTask
    barOffsetX: number   // move: click offset from bar left edge to mousedown point
    barLeft: number      // bar left edge in scroll-content coordinates (px)
    durationPx: number   // initial bar duration width in px
    startX: number; startY: number
    // updated live during drag (no React state, mutated directly):
    ghostLeft: number; ghostWidth: number
    targetMachine: string; isValid: boolean
  }
  const scrollRef   = useRef<HTMLDivElement>(null)
  const dragRef     = useRef<DragState | null>(null)
  const ghostElRef  = useRef<HTMLDivElement | null>(null)
  const rafRef      = useRef<number>(0)
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
  })

  const runMut = useMutation({
    mutationFn: scheduleApi.runSchedule,
    onSuccess: () => { invalidate(); setViewDraft(true) },
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

  const lockMut = useMutation({
    mutationFn: (opId: number) => scheduleApi.toggleLock(opId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gantt'] }); qc.invalidateQueries({ queryKey: ['gantt-draft'] }) },
  })

  // ★ 早期returnより前に全フックを呼ぶ (React rules of hooks)
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => settingsApi.get().then(r => r.data),
  })

  const { data: loadData } = useQuery({
    queryKey: ['load-chart', viewDraft],
    queryFn: () => scheduleApi.getLoadChart(21, viewDraft).then(r => r.data),
    enabled: tabMode === 'load',
  })

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

      const sr = scrollRef.current
      const srRect = sr.getBoundingClientRect()
      const gs = gsRef.current
      const headerH = gs.viewMode === 'hour' ? 44 : 40

      if (dr.mode === 'move') {
        const ghostLeft = Math.max(0, e.clientX - srRect.left + sr.scrollLeft - dr.barOffsetX)
        const relY = e.clientY - srRect.top - headerH
        const rowIdx = Math.max(0, Math.min(gs.machines.length - 1, Math.floor(relY / gs.rowHeight)))
        const targetMachine = gs.machines[rowIdx] ?? dr.task.resource

        const srcType = gs.machineTypeMap.get(dr.task.resource) ?? null
        const tgtType = gs.machineTypeMap.get(targetMachine) ?? null
        const isValid = srcType === null
          ? targetMachine === dr.task.resource
          : srcType === tgtType

        const ghostTop = headerH + rowIdx * gs.rowHeight + 6  // +6 ≈ top-1.5

        // Mutate drag state directly (no React re-render)
        dr.ghostLeft = ghostLeft
        dr.targetMachine = targetMachine
        dr.isValid = isValid

        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          const el = ghostElRef.current
          if (!el) return
          el.style.display = 'block'
          el.style.left = `${ghostLeft}px`
          el.style.top = `${ghostTop}px`
          el.style.width = `${dr.durationPx}px`
          el.style.backgroundColor = getOrderColor(dr.task.order_id)
          el.style.opacity = isValid ? '0.7' : '0.3'
          el.style.outline = isValid ? '2px solid rgba(255,255,255,0.8)' : '2px solid #ef4444'
        })

        // React state only when row/validity changes (1 re-render per row-change, not per frame)
        setDragTarget(prev => {
          if (prev?.machine === targetMachine && prev?.isValid === isValid) return prev
          return { machine: targetMachine, isValid, taskId: dr.task.id }
        })
      } else {
        // resize mode: only right edge moves
        const deltaX = e.clientX - dr.startX
        const minW = gs.viewMode === 'hour' ? gs.hourWidth * 0.5 : gs.dayWidth * 0.1
        const newWidth = Math.max(minW, dr.durationPx + deltaX)
        const rowIdx = gs.machines.indexOf(dr.task.resource)
        const ghostTop = headerH + (rowIdx >= 0 ? rowIdx : 0) * gs.rowHeight + 6

        dr.ghostWidth = newWidth

        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          const el = ghostElRef.current
          if (!el) return
          el.style.display = 'block'
          el.style.left = `${dr.barLeft}px`
          el.style.top = `${ghostTop}px`
          el.style.width = `${newWidth}px`
          el.style.backgroundColor = getOrderColor(dr.task.order_id)
          el.style.opacity = '0.75'
          el.style.outline = '2px solid rgba(255,255,255,0.9)'
        })
      }
    }

    const onMouseUp = async () => {
      const dr = dragRef.current
      dragRef.current = null
      cancelAnimationFrame(rafRef.current)
      if (ghostElRef.current) ghostElRef.current.style.display = 'none'
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

    dragRef.current = {
      mode: 'move', task, barOffsetX, barLeft, durationPx,
      startX: e.clientX, startY: e.clientY,
      ghostLeft: barLeft, ghostWidth: durationPx,
      targetMachine: task.resource, isValid: true,
    }
  }

  const handleResizeMouseDown = (task: GanttTask, e: React.MouseEvent) => {
    if (task.is_locked || task.op_status === 'done') return
    e.preventDefault()
    e.stopPropagation()
    didDragRef.current = false

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

    dragRef.current = {
      mode: 'resize', task, barOffsetX: 0, barLeft, durationPx,
      startX: e.clientX, startY: e.clientY,
      ghostLeft: barLeft, ghostWidth: durationPx,
      targetMachine: task.resource, isValid: true,
    }
  }

  const handleBarClick = (task: GanttTask) => {
    if (didDragRef.current) return   // ドラッグ後はクリック扱いしない
    if (viewDraft) {
      setEditTask(task)
    } else {
      setDetailTask(task)
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
  const minDate  = new Date(Math.min(...allDates.map(d => d.getTime())))
  const maxDate  = new Date(Math.max(...allDates.map(d => d.getTime())))
  minDate.setDate(minDate.getDate() - 1)
  maxDate.setDate(maxDate.getDate() + 2)

  const days: Date[] = []
  const cur = new Date(minDate)
  while (cur <= maxDate) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  const WORK_START = tenantSettings?.work_start_hour ?? 8
  const WORK_HOURS = tenantSettings?.work_hours_per_day ?? 8
  const hourWidth  = 60  // 時間モード: 1時間あたりのpx
  const dayWidth   = viewMode === 'hour' ? hourWidth * WORK_HOURS : 80
  const rowHeight  = 48
  const machines   = [...new Set(tasks.map(t => t.resource))]

  // 設備名 → machine_type / machine_id のマップ（DnD同一グループ判定に使用）
  const machineTypeMap = new Map(tasks.map(t => [t.resource, t.machine_type]))
  const machineIdMap   = new Map(tasks.map(t => [t.resource, t.machine_id]))

  // DnDハンドラが参照する最新値をrefに同期
  gsRef.current = {
    machines, machineTypeMap, machineIdMap,
    viewMode, dayWidth, minDate, days,
    WORK_START, WORK_HOURS, hourWidth, rowHeight,
    hasDraft, toWorkingX,
  }

  // 時間モード: 稼働時間内のオフセット計算
  const toWorkingX = (dt: Date): number => {
    const dayIdx = Math.floor((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
      - new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime()) / 86400000)
    const h = dt.getHours() + dt.getMinutes() / 60
    const clampedH = Math.max(WORK_START, Math.min(WORK_START + WORK_HOURS, h))
    return dayIdx * dayWidth + (clampedH - WORK_START) * hourWidth
  }

  // オーダー凡例（最大12件）
  const uniqueOrders = [...new Map(tasks.map(t => [t.order_id, t])).values()]
    .sort((a, b) => a.order_id - b.order_id)
    .slice(0, 12)

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
          {/* 現行スケジュールをコピーして下書き作成（常時表示） */}
          <button
            onClick={() => hasDraft ? setConfirmCopyOpen(true) : createDraftMut.mutate()}
            disabled={createDraftMut.isPending}
            className="border border-yellow-400 text-yellow-700 bg-yellow-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-100 disabled:opacity-60"
          >
            {createDraftMut.isPending ? '作成中...' : '✏️ 現行をコピーして編集'}
          </button>
          {/* ガント/負荷グラフ 切替 */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-sm">
            <button
              onClick={() => setTabMode('gantt')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${tabMode === 'gantt' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >ガント</button>
            <button
              onClick={() => setTabMode('load')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${tabMode === 'load' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >負荷グラフ</button>
          </div>
          {/* 日/時間 切替（ガントモード時のみ） */}
          {tabMode === 'gantt' && (
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

      {/* オーダー凡例 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {uniqueOrders.map(t => {
          const productName = t.text.includes(' / ') ? t.text.split(' / ')[1] : t.text
          const orderNum    = t.text.includes(' / ') ? t.text.split(' / ')[0] : ''
          return (
            <div key={t.order_id} className="flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getOrderColor(t.order_id) }} />
              <span className="text-gray-400">{orderNum}</span>
              <span className="font-medium">{productName}</span>
            </div>
          )
        })}
        {uniqueOrders.length < [...new Map(tasks.map(t => [t.order_id, t])).values()].length && (
          <div className="text-xs text-gray-400 flex items-center">他...</div>
        )}
      </div>

      {/* 負荷グラフタブ */}
      {tabMode === 'load' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">設備別負荷グラフ（21日間）</h2>
            <div className="text-xs text-gray-400">棒の高さ = 稼働率、数字 = 負荷時間</div>
          </div>
          {loadData ? (
            <LoadChart data={loadData.machines} days={21} />
          ) : (
            <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
          )}
        </div>
      )}

      {/* ガントチャート本体（ガントタブ時のみ） */}
      {tabMode === 'gantt' && (<>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex">
          {/* 設備ラベル列 */}
          <div className="flex-shrink-0 w-36 border-r border-gray-200">
            <div className="h-10 border-b border-gray-200 bg-gray-50 flex items-center px-3 text-xs font-medium text-gray-500">設備</div>
            {machines.map(m => (
              <div
                key={m}
                style={{ height: rowHeight }}
                className="flex items-center px-3 text-sm font-medium text-gray-700 border-b border-gray-100"
              >
                {m}
              </div>
            ))}
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
                {/* 各設備行（日モード） */}
                {machines.map(machineName => {
                  const isTargetRow = dragTarget?.machine === machineName
                  const rowBg = isTargetRow
                    ? dragTarget!.isValid ? 'bg-green-50' : 'bg-red-50'
                    : ''
                  return (
                    <div key={machineName} style={{ height: rowHeight, width: days.length * dayWidth }}
                      className={`relative border-b border-gray-100 transition-colors ${rowBg}`}
                    >
                      {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                        <div key={i} style={{ left: i * dayWidth, width: dayWidth }}
                          className={`absolute top-0 bottom-0 opacity-30 ${d.getDay() === 0 ? 'bg-red-100' : 'bg-blue-100'}`} />
                      ))}
                      {tasks.filter(t => t.resource === machineName).map(t => (
                        <GanttBar key={t.id} task={t} dayWidth={dayWidth} startDay={minDate}
                          onHover={(task, x, y) => setTooltip({ task, x, y })} onLeave={() => setTooltip(null)}
                          onClick={handleBarClick} onMouseDown={handleBarMouseDown}
                          onResizeStart={handleResizeMouseDown}
                          draftMode={viewDraft}
                          isDragging={dragTarget?.taskId === t.id} />
                      ))}
                      {/* ドロップ不可バッジ */}
                      {dragTarget?.machine === machineName && !dragTarget.isValid && (
                        <div className="absolute top-1 right-2 text-xs text-red-500 font-medium pointer-events-none z-20">
                          ✕ 別グループ
                        </div>
                      )}
                    </div>
                  )
                })}
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
                {/* 各設備行（時間モード） */}
                {machines.map(machineName => {
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
                              opacity: isDone ? 0.5 : isDragging ? 0.3 : 1,
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
                })}
              </>
            )}

            {/* ゴーストバー（DOMで直接操作、React再レンダーなし） */}
            <div
              ref={ghostElRef}
              className="absolute h-7 rounded pointer-events-none z-30"
              style={{ display: 'none', top: 0, left: 0 }}
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

      {/* スケジュールテーブル（工程単位） */}
      {(() => {
        const fmtDate = (s: string) => {
          const d = new Date(s)
          return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
        }
        const durationH = (s: string, e: string) =>
          ((new Date(e).getTime() - new Date(s).getTime()) / 3600000).toFixed(1)

        const sorted = [...tasks].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

        return (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">スケジュール一覧（工程別）</h2>
              {viewDraft && <span className="text-xs text-yellow-600 font-medium">✏️ 下書きモード — 編集ボタンで変更できます</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                    <th className="text-left px-3 py-2.5 font-medium w-4"></th>
                    <th className="text-left px-3 py-2.5 font-medium">受注番号</th>
                    <th className="text-left px-3 py-2.5 font-medium">品名</th>
                    <th className="text-left px-3 py-2.5 font-medium">設備</th>
                    <th className="text-left px-3 py-2.5 font-medium">開始予定</th>
                    <th className="text-left px-3 py-2.5 font-medium">終了予定</th>
                    <th className="text-right px-3 py-2.5 font-medium">作業時間</th>
                    <th className="text-left px-3 py-2.5 font-medium">納期</th>
                    <th className="text-left px-3 py-2.5 font-medium">状態</th>
                    <th className="px-3 py-2.5 text-center">ロック</th>
                    {viewDraft && <th className="px-3 py-2.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(t => {
                    const [orderNum, productName] = t.text.includes(' / ') ? t.text.split(' / ') : ['', t.text]
                    return (
                      <tr
                        key={t.id}
                        className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${t.is_delayed ? 'bg-red-50 hover:bg-red-100' : ''}`}
                      >
                        <td className="px-3 py-2.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getOrderColor(t.order_id) }} />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-700 whitespace-nowrap">{orderNum}</td>
                        <td className="px-3 py-2.5 text-gray-800">{productName}</td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{t.resource}</td>
                        <td className="px-3 py-2.5 text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(t.start_date)}</td>
                        <td className="px-3 py-2.5 text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(t.end_date)}</td>
                        <td className="px-3 py-2.5 text-gray-500 tabular-nums text-right whitespace-nowrap">{durationH(t.start_date, t.end_date)}h</td>
                        <td className={`px-3 py-2.5 tabular-nums whitespace-nowrap font-medium ${t.is_delayed ? 'text-red-600' : 'text-gray-600'}`}>{t.due_date}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            {t.is_urgent  && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">特急</span>}
                            {t.is_delayed && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">⚠ 遅延</span>}
                            {!t.is_urgent && !t.is_delayed && <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            title={t.is_locked ? 'ロック解除' : 'スケジュールをロック（再スケジュールで変更されなくなります）'}
                            onClick={() => {
                              const opId = parseInt(t.id.replace('op-', ''), 10)
                              lockMut.mutate(opId)
                            }}
                            disabled={lockMut.isPending}
                            className={`text-base transition-opacity hover:opacity-70 ${t.is_locked ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}
                          >
                            {t.is_locked ? '🔒' : '🔓'}
                          </button>
                        </td>
                        {viewDraft && (
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => setEditTask(t)}
                              className="px-2 py-1 rounded-md border border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-colors whitespace-nowrap"
                            >
                              ✎ 編集
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
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

      {/* 工程詳細 / 完了モーダル */}
      {detailTask && (
        <OperationDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
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
