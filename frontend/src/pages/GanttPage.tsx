import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scheduleApi } from '../api/schedule'
import type { GanttTask } from '../api/schedule'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function GanttBar({ task, dayWidth, startDay }: { task: GanttTask; dayWidth: number; startDay: Date }) {
  const start = new Date(task.start_date)
  const end = new Date(task.end_date)
  const offsetDays = (start.getTime() - startDay.getTime()) / 86400000
  const durationDays = (end.getTime() - start.getTime()) / 86400000
  const left = offsetDays * dayWidth
  const width = Math.max(durationDays * dayWidth, 4)

  return (
    <div
      title={`${task.text}\n開始: ${task.start_date}\n終了: ${task.end_date}\n納期: ${task.due_date}`}
      style={{ left, width, backgroundColor: task.color }}
      className="absolute top-1.5 h-7 rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden cursor-pointer hover:brightness-90 transition-all"
    >
      {task.text}
      {task.is_delayed && <span className="ml-1">⚠</span>}
    </div>
  )
}

export default function GanttPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gantt'],
    queryFn: () => scheduleApi.getGantt().then(r => r.data),
  })

  const runMut = useMutation({
    mutationFn: scheduleApi.runSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt'] }),
  })

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
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())))
  minDate.setDate(minDate.getDate() - 1)
  maxDate.setDate(maxDate.getDate() + 1)

  const days: Date[] = []
  const cur = new Date(minDate)
  while (cur <= maxDate) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  const dayWidth = 80
  const rowHeight = 48
  const machines = [...new Set(tasks.map(t => t.resource))]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ガントチャート</h1>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block"></span>通常</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block"></span>特急</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block"></span>納期超過</span>
          </div>
        </div>
        <button
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
        >
          {runMut.isPending ? '再計算中...' : '再スケジュール'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex">
          {/* 設備ラベル列 */}
          <div className="flex-shrink-0 w-36 border-r border-gray-200">
            <div className="h-10 border-b border-gray-200 bg-gray-50 flex items-center px-3 text-xs font-medium text-gray-500">設備</div>
            {machines.map(m => (
              <div key={m} style={{ height: rowHeight }} className="flex items-center px-3 text-sm font-medium text-gray-700 border-b border-gray-100">
                {m}
              </div>
            ))}
          </div>

          {/* スクロール可能なガントエリア */}
          <div className="overflow-x-auto flex-1">
            {/* 日付ヘッダー */}
            <div className="flex h-10 border-b border-gray-200 bg-gray-50" style={{ width: days.length * dayWidth }}>
              {days.map(d => (
                <div
                  key={d.toISOString()}
                  style={{ width: dayWidth }}
                  className={`flex-shrink-0 flex flex-col items-center justify-center text-xs border-r border-gray-200 ${d.getDay() === 0 ? 'bg-red-50 text-red-400' : d.getDay() === 6 ? 'bg-blue-50 text-blue-400' : 'text-gray-500'}`}
                >
                  <span>{d.getMonth() + 1}/{d.getDate()}</span>
                  <span>{WEEKDAYS[d.getDay()]}</span>
                </div>
              ))}
            </div>

            {/* 各設備行 */}
            {machines.map(machineName => (
              <div
                key={machineName}
                style={{ height: rowHeight, width: days.length * dayWidth }}
                className="relative border-b border-gray-100"
              >
                {/* 列の背景（土日） */}
                {days.map((d, i) => d.getDay() === 0 && (
                  <div key={i} style={{ left: i * dayWidth, width: dayWidth }} className="absolute top-0 bottom-0 bg-red-50 opacity-40" />
                ))}
                {tasks
                  .filter(t => t.resource === machineName)
                  .map(t => (
                    <GanttBar key={t.id} task={t} dayWidth={dayWidth} startDay={minDate} />
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 遅延サマリ */}
      {tasks.some(t => t.is_delayed) && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">⚠️ 納期超過の受注</p>
          <div className="space-y-1">
            {tasks.filter(t => t.is_delayed).map(t => (
              <div key={t.id} className="text-xs text-red-600 flex gap-4">
                <span>{t.text}</span>
                <span>終了予定: {t.end_date}</span>
                <span>納期: {t.due_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
