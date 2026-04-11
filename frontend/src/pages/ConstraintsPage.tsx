import { useQuery } from '@tanstack/react-query'
import { aiApi } from '../api/ai'

export default function ConstraintsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['constraints-summary'],
    queryFn: () => aiApi.constraintsSummary().then(r => r.data),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full text-gray-400 text-sm">
        読み込み中...
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="p-6 text-red-500 text-sm">制約情報の取得に失敗しました。</div>
    )
  }

  const totalIssues =
    data.inactive_machines.length +
    data.upcoming_maintenance.length +
    data.locked_operations_count

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">制約設定の確認</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            現在スケジューリングに影響している制約の一覧
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50"
        >
          更新
        </button>
      </div>

      {/* サマリーバッジ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="稼働中設備"
          value={data.active_machine_count}
          unit="台"
          color="green"
        />
        <SummaryCard
          label="停止中設備"
          value={data.inactive_machines.length}
          unit="台"
          color={data.inactive_machines.length > 0 ? 'red' : 'gray'}
        />
        <SummaryCard
          label="今後のメンテ"
          value={data.upcoming_maintenance.length}
          unit="件"
          color={data.upcoming_maintenance.length > 0 ? 'orange' : 'gray'}
        />
        <SummaryCard
          label="スケジュールロック"
          value={data.locked_operations_count}
          unit="工程"
          color={data.locked_operations_count > 0 ? 'blue' : 'gray'}
        />
      </div>

      {totalIssues === 0 && data.calendar_exceptions.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
          特別な制約は設定されていません。通常のスケジュールで稼働しています。
        </div>
      )}

      {/* 設備グループ */}
      {data.machine_groups.length > 0 && (
        <Section title="設備グループ（代替自動選択）" icon="🔄">
          <div className="space-y-2">
            {data.machine_groups.map(g => (
              <div key={g.type} className="flex items-start gap-3 text-sm">
                <span className="font-medium text-gray-700 w-32 flex-shrink-0">{g.type}</span>
                <div className="flex flex-wrap gap-1.5">
                  {g.machines.map(m => (
                    <span key={m} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            同グループの設備は最も早く空いているものに自動割り当てされます
          </p>
        </Section>
      )}

      {/* 停止中設備 */}
      {data.inactive_machines.length > 0 && (
        <Section title="停止中の設備" icon="🚫" accent="red">
          <div className="space-y-2">
            {data.inactive_machines.map(m => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                <span className="font-medium text-gray-800">{m.name}</span>
                {m.type && <span className="text-gray-400 text-xs">{m.type}</span>}
                <span className="ml-auto text-red-500 text-xs">スケジュール割り当て不可</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* メンテナンス枠 */}
      {data.upcoming_maintenance.length > 0 && (
        <Section title="今後のメンテナンス予定" icon="🔧" accent="orange">
          <div className="space-y-3">
            {data.upcoming_maintenance.map((mw, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{mw.machine}</span>
                  {mw.reason && (
                    <span className="text-xs text-gray-400">— {mw.reason}</span>
                  )}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">
                  {mw.start} 〜 {mw.end}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* カレンダー例外 */}
      {data.calendar_exceptions.length > 0 && (
        <Section title="カレンダー例外（今後3ヶ月）" icon="📅">
          <div className="space-y-2">
            {data.calendar_exceptions.map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-24 flex-shrink-0">{h.date}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  h.working_hours === 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {h.type}
                </span>
                {h.name && <span className="text-gray-600">{h.name}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* スケジュールロック工程 */}
      {data.locked_operations_count > 0 && (
        <Section title={`スケジュールロック済み工程（${data.locked_operations_count}件）`} icon="🔒" accent="blue">
          <div className="space-y-2">
            {data.locked_operations.map(op => (
              <div key={op.id} className="text-sm flex items-center gap-3">
                <span className="font-medium text-gray-800">{op.order_number}</span>
                <span className="text-gray-400 text-xs">工程 #{op.sequence}</span>
                {op.planned_start && (
                  <span className="text-gray-500 text-xs ml-auto">
                    {op.planned_start} 〜 {op.planned_end}
                  </span>
                )}
              </div>
            ))}
            {data.locked_operations_count > data.locked_operations.length && (
              <p className="text-xs text-gray-400">
                他 {data.locked_operations_count - data.locked_operations.length} 件のロック工程があります
              </p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            ロック工程は再スケジュール実行時に日時・設備が変更されません
          </p>
        </Section>
      )}

      {/* 設備固定工程 */}
      {data.machine_locked_count > 0 && (
        <Section title={`設備固定工程（${data.machine_locked_count}件）`} icon="📌">
          <p className="text-sm text-gray-600">
            {data.machine_locked_count} 件の工程に設備固定が設定されています。
            グループ内の代替設備には割り当てられません。
          </p>
        </Section>
      )}
    </div>
  )
}

function SummaryCard({
  label, value, unit, color,
}: {
  label: string
  value: number
  unit: string
  color: 'green' | 'red' | 'orange' | 'blue' | 'gray'
}) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-50 text-gray-500 border-gray-200',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="text-2xl font-bold">
        {value}
        <span className="text-sm font-normal ml-1">{unit}</span>
      </div>
      <div className="text-xs mt-0.5 opacity-80">{label}</div>
    </div>
  )
}

function Section({
  title, icon, accent, children,
}: {
  title: string
  icon: string
  accent?: 'red' | 'orange' | 'blue'
  children: React.ReactNode
}) {
  const borderColors = {
    red: 'border-red-200',
    orange: 'border-orange-200',
    blue: 'border-blue-200',
  }
  const border = accent ? borderColors[accent] : 'border-gray-200'
  return (
    <div className={`bg-white rounded-xl border ${border} p-4 shadow-sm`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      {children}
    </div>
  )
}
