import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { operationsApi } from '../api/operations'
import type { Operation } from '../api/operations'
import { machinesApi } from '../api/machines'

// ── 定数 ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  not_started: { label: '未着手', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  in_progress: { label: '作業中', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500 animate-pulse' },
  done:        { label: '完了',   color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  on_hold:     { label: '中断',   color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
} as const

function fmtTime(dt: string | null) {
  if (!dt) return '--:--'
  return new Date(dt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(dt: string | null) {
  if (!dt) return '---'
  return new Date(dt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

function elapsed(start: string | null) {
  if (!start) return null
  const ms = Date.now() - new Date(start).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}時間${m}分経過`
}

// ── アクションモーダル ────────────────────────────────────────────────────────

function ActionModal({
  op,
  onClose,
  onMutate,
}: {
  op: Operation
  onClose: () => void
  onMutate: () => void
}) {
  const qc = useQueryClient()
  const [worker, setWorker] = useState(op.worker ?? '')
  const [note, setNote] = useState('')
  const [actualHours, setActualHours] = useState('')
  const [view, setView] = useState<'main' | 'complete' | 'hold'>('main')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ops-today'] })
    qc.invalidateQueries({ queryKey: ['operations'] })
    onMutate()
    onClose()
  }

  const startMut = useMutation({
    mutationFn: () => operationsApi.start(op.id, worker || undefined),
    onSuccess: invalidate,
  })

  const completeMut = useMutation({
    mutationFn: () => operationsApi.complete(op.id, {
      actual_hours: actualHours ? Number(actualHours) : undefined,
      actual_note: note || undefined,
      worker: worker || undefined,
    }),
    onSuccess: invalidate,
  })

  const holdMut = useMutation({
    mutationFn: () => operationsApi.hold(op.id, note || undefined),
    onSuccess: invalidate,
  })

  const isPending = startMut.isPending || completeMut.isPending || holdMut.isPending

  const statusCfg = STATUS_CONFIG[op.op_status]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {statusCfg.label}
              </span>
              {op.is_urgent && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">特急</span>}
            </div>
            <div className="text-base font-bold text-gray-800">{op.product_name}</div>
            <div className="text-sm text-gray-500">{op.order_number} · {op.machine_name}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        {view === 'main' && (
          <>
            {/* 作業者名 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">作業者名</label>
              <input
                value={worker}
                onChange={e => setWorker(e.target.value)}
                placeholder="（任意）"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            {/* アクションボタン */}
            <div className="space-y-2.5">
              {op.op_status !== 'in_progress' && op.op_status !== 'done' && (
                <button
                  onClick={() => startMut.mutate()}
                  disabled={isPending}
                  className="w-full bg-blue-600 text-white py-3.5 rounded-xl text-base font-bold hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-transform"
                >
                  ▶ 作業開始
                </button>
              )}
              {(op.op_status === 'in_progress' || op.op_status === 'on_hold') && (
                <button
                  onClick={() => setView('complete')}
                  disabled={isPending}
                  className="w-full bg-green-600 text-white py-3.5 rounded-xl text-base font-bold hover:bg-green-700 disabled:opacity-50 active:scale-95 transition-transform"
                >
                  ✓ 作業完了
                </button>
              )}
              {op.op_status === 'in_progress' && (
                <button
                  onClick={() => setView('hold')}
                  disabled={isPending}
                  className="w-full bg-yellow-500 text-white py-3.5 rounded-xl text-base font-bold hover:bg-yellow-600 disabled:opacity-50 active:scale-95 transition-transform"
                >
                  ⏸ 作業中断
                </button>
              )}
            </div>

            {/* 実績時刻表示 */}
            {(op.actual_start || op.actual_end) && (
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm text-gray-600">
                <div>開始: <span className="font-medium">{fmtTime(op.actual_start)}</span></div>
                {op.actual_end && <div>完了: <span className="font-medium">{fmtTime(op.actual_end)}</span></div>}
                {op.op_status === 'in_progress' && op.actual_start && (
                  <div className="col-span-2 text-blue-600 text-xs">{elapsed(op.actual_start)}</div>
                )}
              </div>
            )}
          </>
        )}

        {view === 'complete' && (
          <>
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">実績時間（時間）</label>
                <input
                  type="number" min="0" step="0.1"
                  value={actualHours}
                  onChange={e => setActualHours(e.target.value)}
                  placeholder={op.actual_start ? `（省略時: 自動計算）` : `例: ${op.duration_hours}`}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">完了メモ（任意）</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="特記事項があれば入力"
                  rows={2}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setView('main')} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-600">戻る</button>
              <button
                onClick={() => completeMut.mutate()}
                disabled={isPending}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50"
              >
                完了登録
              </button>
            </div>
          </>
        )}

        {view === 'hold' && (
          <>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">中断理由（任意）</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="例：材料待ち、設備トラブル"
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setView('main')} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-600">戻る</button>
              <button
                onClick={() => holdMut.mutate()}
                disabled={isPending}
                className="flex-1 bg-yellow-500 text-white py-3 rounded-xl text-sm font-bold hover:bg-yellow-600 disabled:opacity-50"
              >
                中断登録
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── 工程カード ────────────────────────────────────────────────────────────────

function OperationCard({ op, onTap }: { op: Operation; onTap: () => void }) {
  const statusCfg = STATUS_CONFIG[op.op_status]
  const overdue = new Date(op.due_date) < new Date()

  return (
    <button
      onClick={onTap}
      className={`w-full text-left bg-white rounded-2xl shadow-sm border p-4 active:scale-98 transition-transform ${
        op.op_status === 'in_progress' ? 'border-blue-300 ring-1 ring-blue-200' :
        op.op_status === 'done' ? 'border-gray-200 opacity-60' :
        'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
            {op.is_urgent && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">特急</span>
            )}
            {overdue && op.op_status !== 'done' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-600">期限超過</span>
            )}
          </div>

          <div className="font-bold text-gray-800 text-base truncate">{op.product_name}</div>
          <div className="text-sm text-gray-500 mt-0.5">{op.order_number} {op.customer_name ? `· ${op.customer_name}` : ''}</div>
          <div className="text-xs text-gray-400 mt-1">{op.machine_name}{op.process_name ? ` / ${op.process_name}` : ''}</div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-400">計画</div>
          <div className="text-sm font-medium text-gray-700">
            {fmtTime(op.planned_start)} – {fmtTime(op.planned_end)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {op.duration_hours}h · 納期 {fmtDate(op.due_date)}
          </div>
          {op.op_status === 'in_progress' && op.actual_start && (
            <div className="text-xs text-blue-500 mt-1">{elapsed(op.actual_start)}</div>
          )}
          {op.op_status === 'done' && op.actual_hours && (
            <div className="text-xs text-green-600 mt-1">実績 {op.actual_hours}h</div>
          )}
        </div>
      </div>

      {op.actual_note && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 truncate">
          📝 {op.actual_note}
        </div>
      )}
    </button>
  )
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function WorkPage() {
  const qc = useQueryClient()
  const [selectedMachineId, setSelectedMachineId] = useState<number | undefined>()
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  )
  const [showDone, setShowDone] = useState(false)
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null)
  const [useToday, setUseToday] = useState(true)

  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list().then(r => r.data),
  })
  const machineList = machines?.filter(m => m.is_active && !m.is_outsource) ?? []

  const { data: ops = [], refetch } = useQuery({
    queryKey: useToday ? ['ops-today', selectedMachineId] : ['operations', selectedDate, selectedMachineId],
    queryFn: () =>
      useToday
        ? operationsApi.today(selectedMachineId).then(r => r.data)
        : operationsApi.list({ target_date: selectedDate, machine_id: selectedMachineId }).then(r => r.data),
    refetchInterval: 30_000,
  })

  // 表示中の日付を工程から推定（直近稼働日モード時）
  const displayedDate = useToday && ops.length > 0
    ? (() => {
        const d = ops.find(o => o.planned_start)?.planned_start
        return d ? new Date(d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }) : null
      })()
    : null

  const displayed = showDone ? ops : ops.filter(o => o.op_status !== 'done')

  const inProgressCount = ops.filter(o => o.op_status === 'in_progress').length
  const doneCount = ops.filter(o => o.op_status === 'done').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-800">工程実績</h1>
            {useToday && displayedDate && (
              <div className="text-xs text-gray-400 mt-0.5">表示中: {displayedDate}</div>
            )}
          </div>
          <button
            onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['ops-today'] }) }}
            className="text-blue-600 text-sm font-medium"
          >
            更新
          </button>
        </div>

        {/* 設備フィルタ */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedMachineId(undefined)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !selectedMachineId ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            すべて
          </button>
          {machineList.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMachineId(m.id === selectedMachineId ? undefined : m.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedMachineId === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* 日付切替 */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setUseToday(true)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${useToday ? 'bg-blue-100 text-blue-700' : 'text-gray-500 bg-gray-100'}`}
          >
            今日
          </button>
          <button
            onClick={() => setUseToday(false)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${!useToday ? 'bg-blue-100 text-blue-700' : 'text-gray-500 bg-gray-100'}`}
          >
            日付指定
          </button>
          {!useToday && (
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
            />
          )}
        </div>
      </div>

      {/* サマリーバー */}
      <div className="px-4 py-2 bg-white border-b border-gray-100 flex gap-4 text-xs text-gray-500">
        <span>全 {ops.length} 件</span>
        {inProgressCount > 0 && <span className="text-blue-600 font-medium">作業中 {inProgressCount} 件</span>}
        <span>完了 {doneCount} 件</span>
        <button
          onClick={() => setShowDone(v => !v)}
          className="ml-auto text-blue-600"
        >
          {showDone ? '完了を非表示' : '完了も表示'}
        </button>
      </div>

      {/* カードリスト */}
      <div className="px-4 py-3 space-y-3 pb-20">
        {displayed.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">
            {ops.length === 0 ? (
              <>
                <div className="text-3xl mb-2">📋</div>
                スケジュールされた工程がありません<br />
                <span className="text-xs">管理画面でスケジュールを実行してください</span>
              </>
            ) : (
              <>完了済みの工程は非表示にしています</>
            )}
          </div>
        ) : (
          displayed.map(op => (
            <OperationCard key={op.id} op={op} onTap={() => setSelectedOp(op)} />
          ))
        )}
      </div>

      {/* アクションモーダル */}
      {selectedOp && (
        <ActionModal
          op={selectedOp}
          onClose={() => setSelectedOp(null)}
          onMutate={() => setSelectedOp(null)}
        />
      )}
    </div>
  )
}
