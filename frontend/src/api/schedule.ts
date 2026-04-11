import api from './client'

export interface GanttTask {
  id: string
  text: string
  start_date: string
  end_date: string
  resource: string
  machine_id: number
  order_id: number
  due_date: string
  priority: number
  is_urgent: boolean
  is_delayed: boolean
  is_locked: boolean
  op_status: 'not_started' | 'in_progress' | 'done' | 'on_hold'
  sequence: number
  machine_type: string | null
  color: string
}

export interface LoadDay {
  date: string
  load_hours: number
  capacity_hours: number
  utilization: number
  over_capacity: boolean
}

export interface MachineLoad {
  machine_id: number
  name: string
  code: string
  is_outsource: boolean
  days: LoadDay[]
}

export interface LoadChartData {
  machines: MachineLoad[]
  date_range: { start: string; end: string }
}

export interface DeliverySimOperation {
  sequence: number
  machine_id: number
  machine_name: string
  planned_start: string | null
  planned_end: string | null
}

export interface DeliverySimResult {
  feasible: boolean
  completion_date: string | null
  completion_datetime: string | null
  business_days: number | null
  on_time: boolean | null
  affected_orders: string[]
  affected_count: number
  operations: DeliverySimOperation[]
}

export const scheduleApi = {
  runSchedule: () => api.post<{ scheduled: number; delayed_count: number; draft: boolean; delayed_orders: { order_number: string; product_name: string; planned_end: string; due_date: string; delay_days: number }[] }>('/schedule/run'),
  createDraft: () => api.post<{ created: number }>('/schedule/create-draft'),
  commitDraft: () => api.post<{ committed: number }>('/schedule/commit'),
  discardDraft: () => api.post<{ discarded: number }>('/schedule/discard'),
  getGantt: (draft = false) => api.get<{ tasks: GanttTask[]; total: number; has_draft: boolean }>('/schedule/gantt', { params: draft ? { draft: true } : undefined }),
  updateDraftOp: (opId: number, payload: { draft_start: string; draft_end: string; draft_machine_id?: number }) =>
    api.patch<{ ok: boolean }>(`/schedule/draft/${opId}`, payload),
  simulateDelivery: (payload: {
    product_name: string
    due_date: string
    priority: number
    is_urgent: boolean
    operations: { machine_id: number; duration_hours: number; is_urgent?: boolean }[]
  }) => api.post<DeliverySimResult>('/schedule/simulate/delivery', payload),
  getLoadChart: (days = 21, draft = false) =>
    api.get<LoadChartData>('/schedule/load', { params: { days, draft } }),
  toggleLock: (operationId: number) =>
    api.post<{ operation_id: number; schedule_locked: boolean }>(`/schedule/operations/${operationId}/lock`),
}
