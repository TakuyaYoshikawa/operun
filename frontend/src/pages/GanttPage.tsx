import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scheduleApi } from '../api/schedule'
import { machinesApi } from '../api/machines'
import { settingsApi } from '../api/settings'
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
      {(task.is_delayed || task.is_urgent) && (
        <div className="mt-2 pt-2 border-t border-gray-700 flex gap-2 flex-wrap">
          {task.is_urgent  && <span className="px-1.5 py-0.5 rounded bg-orange-500 text-white text-xs">特急</span>}
          {task.is_delayed && <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-xs">⚠ 納期超過</span>}
        </div>
      )}
    </div>
  )
}

// ── ガントバー ────────────────────────────────────────────────────────────────

function GanttBar({
  task, dayWidth, startDay, onHover, onLeave, onClick, draftMode,
}: {
  task: GanttTask
  dayWidth: number
  startDay: Date
  onHover: (task: GanttTask, x: number, y: number) => void
  onLeave: () => void
  onClick?: (task: GanttTask) => void
  draftMode?: boolean
}) {
  const start = new Date(task.start_date)
  const end   = new Date(task.end_date)
  const offsetDays  = (start.getTime() - startDay.getTime()) / 86400000
  const durationDays = (end.getTime() - start.getTime()) / 86400000
  const left  = offsetDays * dayWidth
  const width = Math.max(durationDays * dayWidth, 6)

  const color   = getOrderColor(task.order_id)
  const productName = task.text.includes(' / ') ? task.text.split(' / ')[1] : task.text

  return (
    <div
      onMouseMove={e => onHover(task, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      onClick={() => onClick?.(task)}
      style={{
        left,
        width,
        backgroundColor: color,
        outline: task.is_delayed ? '2px solid #ef4444' : (draftMode ? '1.5px dashed rgba(255,255,255,0.6)' : undefined),
        outlineOffset: task.is_delayed ? '-1px' : undefined,
      }}
      className="absolute top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden cursor-pointer hover:brightness-90 transition-all select-none"
    >
      {task.is_urgent && <span className="mr-1 text-yellow-200 font-bold">!</span>}
      {draftMode && <span className="mr-1 opacity-70">✎</span>}
      <span className="truncate">{productName}</span>
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

export default function GanttPage() {
  const qc = useQueryClient()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [viewDraft, setViewDraft] = useState(false)
  const [editTask, setEditTask] = useState<GanttTask | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('day')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gantt'] })
    qc.invalidateQueries({ queryKey: ['gantt-draft'] })
  }

  const { data, isLoading } = useQuery({
    queryKey: viewDraft ? ['gantt-draft'] : ['gantt'],
    queryFn: () => scheduleApi.getGantt(viewDraft).then(r => r.data),
  })

  // 下書きの有無を確認（currentDataが必要な場合のみ）
  const { data: currentData } = useQuery({
    queryKey: ['gantt'],
    queryFn: () => scheduleApi.getGantt(false).then(r => r.data),
    enabled: viewDraft,
  })
  const hasDraft = data?.has_draft ?? currentData?.has_draft ?? false

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

  const handleBarClick = (task: GanttTask) => {
    if (viewDraft) setEditTask(task)
  }

  const handleSaveDraftOp = (opId: number, start: string, end: string, machineId: number) => {
    updateDraftMut.mutate({ opId, payload: { draft_start: start, draft_end: end, draft_machine_id: machineId } })
  }

  if (isLoading) return <div className="p-6 text-gray-500 text-sm">読み込み中...</div>

  const tasks = data?.tasks ?? []

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

  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => settingsApi.get().then(r => r.data),
  })
  const WORK_START = tenantSettings?.work_start_hour ?? 8
  const WORK_HOURS = tenantSettings?.work_hours_per_day ?? 8
  const hourWidth  = 60  // 時間モード: 1時間あたりのpx
  const dayWidth   = viewMode === 'hour' ? hourWidth * WORK_HOURS : 80
  const rowHeight  = 48
  const machines   = [...new Set(tasks.map(t => t.resource))]

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
          {/* 下書き作成（現行スケジュールをそのまま下書きへ） */}
          {!hasDraft && (
            <button
              onClick={() => createDraftMut.mutate()}
              disabled={createDraftMut.isPending}
              className="border border-yellow-400 text-yellow-700 bg-yellow-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-100 disabled:opacity-60"
            >
              {createDraftMut.isPending ? '作成中...' : '✏️ 下書き作成'}
            </button>
          )}
          {/* 日/時間 切替 */}
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
            ✏️ 下書き編集中。バーをクリックして日時・設備を変更できます。確認後「確定」で反映してください。
          </div>
          <div className="flex gap-2 flex-shrink-0">
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
          <div className="overflow-x-auto flex-1">
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
                {machines.map(machineName => (
                  <div key={machineName} style={{ height: rowHeight, width: days.length * dayWidth }} className="relative border-b border-gray-100">
                    {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                      <div key={i} style={{ left: i * dayWidth, width: dayWidth }}
                        className={`absolute top-0 bottom-0 opacity-30 ${d.getDay() === 0 ? 'bg-red-100' : 'bg-blue-100'}`} />
                    ))}
                    {tasks.filter(t => t.resource === machineName).map(t => (
                      <GanttBar key={t.id} task={t} dayWidth={dayWidth} startDay={minDate}
                        onHover={(task, x, y) => setTooltip({ task, x, y })} onLeave={() => setTooltip(null)}
                        onClick={handleBarClick} draftMode={viewDraft} />
                    ))}
                  </div>
                ))}
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
                  const hours = Array.from({ length: WORK_HOURS }, (_, i) => WORK_START + i)
                  return (
                    <div key={machineName} style={{ height: rowHeight, width: totalW }} className="relative border-b border-gray-100">
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
                        const s = new Date(t.start_date)
                        const e = new Date(t.end_date)
                        const left  = toWorkingX(s)
                        const width = Math.max(toWorkingX(e) - left, 4)
                        const color = getOrderColor(t.order_id)
                        const productName = t.text.includes(' / ') ? t.text.split(' / ')[1] : t.text
                        return (
                          <div key={t.id}
                            onMouseMove={ev => setTooltip({ task: t, x: ev.clientX, y: ev.clientY })}
                            onMouseLeave={() => setTooltip(null)}
                            onClick={() => handleBarClick(t)}
                            style={{ left, width, backgroundColor: color,
                              outline: t.is_delayed ? '2px solid #ef4444' : (viewDraft ? '1.5px dashed rgba(255,255,255,0.6)' : undefined),
                              outlineOffset: t.is_delayed ? '-1px' : undefined }}
                            className="absolute top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden cursor-pointer hover:brightness-90 transition-all select-none">
                            {t.is_urgent && <span className="mr-1 text-yellow-200 font-bold">!</span>}
                            {viewDraft && <span className="mr-1 opacity-70">✎</span>}
                            <span className="truncate">{productName}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )}
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
    </div>
  )
}
