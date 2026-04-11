import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { machinesApi } from '../api/machines'
import { scheduleApi } from '../api/schedule'
import type { DeliverySimResult, DeliverySimScenario } from '../api/schedule'

interface SimOp {
  machine_id: number
  duration_hours: number
}

function ScenarioResult({
  label,
  scenario,
  dueDate,
  accent,
}: {
  label: string
  scenario: DeliverySimScenario
  dueDate: string
  accent: 'normal' | 'urgent'
}) {
  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const isOnTime   = scenario.feasible && scenario.on_time
  const isOver     = scenario.feasible && !scenario.on_time
  const borderCls  = isOnTime ? 'border-green-200 bg-green-50'
    : isOver ? 'border-yellow-200 bg-yellow-50'
    : 'border-red-200 bg-red-50'
  const accentCls  = accent === 'urgent' ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-gray-100 text-gray-600 border-gray-300'

  return (
    <div className={`rounded-xl border p-4 ${borderCls}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${accentCls}`}>{label}</span>
        <span className="text-base font-bold text-gray-800">
          {isOnTime ? '✅ 納期内' : isOver ? '⚠️ 納期超過' : '❌ スケジュール不可'}
        </span>
      </div>

      {scenario.completion_date && (
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">完成予定</span>
            <span className="font-semibold text-gray-800">{scenario.completion_date}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">所要営業日数</span>
            <span className="font-semibold text-gray-800">{scenario.business_days} 日</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">希望納期</span>
            <span className={`font-semibold ${isOnTime ? 'text-green-700' : 'text-red-600'}`}>{dueDate}</span>
          </div>
        </div>
      )}

      {/* 工程スケジュール */}
      {scenario.operations.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 mb-3">
          {scenario.operations.map(op => (
            <div key={op.sequence} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                {op.sequence}
              </span>
              <span className="font-medium text-gray-700 flex-1">{op.machine_name}</span>
              <span className="text-gray-400">{formatTime(op.planned_start)} 〜 {formatTime(op.planned_end)}</span>
            </div>
          ))}
        </div>
      )}

      {scenario.affected_count > 0 && (
        <div className="text-xs text-orange-700">
          <span className="font-medium">影響を受ける受注：{scenario.affected_count} 件</span>
          <span className="text-orange-500 ml-1">（{scenario.affected_orders.slice(0, 3).join(', ')}{scenario.affected_count > 3 ? ' …' : ''}）</span>
        </div>
      )}
      {scenario.affected_count === 0 && scenario.feasible && (
        <p className="text-xs text-green-700">既存受注への影響なし</p>
      )}
    </div>
  )
}

export default function DeliverySimPage() {
  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list({ is_active: true }).then(r => r.data),
  })

  const [productName, setProductName] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [priority, setPriority] = useState(3)
  const [ops, setOps] = useState<SimOp[]>([{ machine_id: 0, duration_hours: 1 }])
  const [result, setResult] = useState<DeliverySimResult | null>(null)

  const machineGroups = (() => {
    if (!machines) return []
    const seen = new Map<string | null, typeof machines>()
    for (const m of machines) {
      const key = m.machine_type
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(m)
    }
    return Array.from(seen.entries()).map(([type, ms]) => ({ type, machines: ms }))
  })()

  const sim = useMutation({
    mutationFn: scheduleApi.simulateDelivery,
    onSuccess: data => setResult(data.data),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ? `シミュレーション失敗: ${msg}` : '設備を選択してください。')
    },
  })

  const updateOp = (i: number, patch: Partial<SimOp>) =>
    setOps(prev => prev.map((op, idx) => idx === i ? { ...op, ...patch } : op))
  const addOp    = () => setOps(prev => [...prev, { machine_id: 0, duration_hours: 1 }])
  const removeOp = (i: number) => setOps(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (ops.some(op => op.machine_id === 0)) { alert('全ての工程で設備を選択してください'); return }
    setResult(null)
    sim.mutate({ product_name: productName, due_date: dueDate, priority, is_urgent: priority === 1, operations: ops })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">納期シミュレーター</h1>
      <p className="text-sm text-gray-500 mb-6">新規受注を差し込んだ場合の完成予定日を確認します</p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">品名</label>
            <input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="部品A"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                工程 <span className="text-gray-400 font-normal text-xs ml-1">— 上から順に加工</span>
              </label>
              <button type="button" onClick={addOp} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                ＋ 工程を追加
              </button>
            </div>
            <div className="space-y-2">
              {ops.map((op, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <select
                    required value={op.machine_id}
                    onChange={e => updateOp(i, { machine_id: Number(e.target.value) })}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value={0} disabled>設備を選択</option>
                    {machineGroups.map(({ type, machines: ms }) =>
                      type
                        ? <optgroup key={type} label={type}>
                            {ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </optgroup>
                        : ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                    )}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      required type="number" min={0.5} step={0.5} value={op.duration_hours}
                      onChange={e => updateOp(i, { duration_hours: Number(e.target.value) })}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <span className="text-xs text-gray-400">h</span>
                  </div>
                  {ops.length > 1 && (
                    <button type="button" onClick={() => removeOp(i)} className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">希望納期 *</label>
            <input
              required type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">優先度</label>
            <div className="flex gap-4">
              {[{ v: 3, l: '通常' }, { v: 2, l: '高' }, { v: 1, l: '特急' }].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="priority" value={v} checked={priority === v}
                    onChange={() => setPriority(v)} className="accent-blue-600" />
                  <span className={v === 1 ? 'text-red-600 font-medium' : ''}>{l}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit" disabled={sim.isPending}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {sim.isPending ? '計算中...' : '納期を確認する'}
          </button>
        </form>
      </div>

      {result && (
        <div className="mt-6 space-y-4">
          {/* 通常優先度 */}
          <ScenarioResult
            label={`優先度：${priority === 1 ? '特急' : priority === 2 ? '高' : '通常'}`}
            scenario={result}
            dueDate={dueDate}
            accent="normal"
          />

          {/* 最優先シナリオ（通常・高の場合のみ表示） */}
          {priority !== 1 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <span className="inline-block w-4 border-t border-dashed border-gray-300" />
                既存スケジュールを崩して最優先（特急扱い）にした場合
                <span className="inline-block flex-1 border-t border-dashed border-gray-300" />
              </p>
              <ScenarioResult
                label="特急扱いの場合"
                scenario={result.urgent}
                dueDate={dueDate}
                accent="urgent"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
