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
  color: string
}

export interface DeliverySimResult {
  feasible: boolean
  completion_date: string | null
  completion_datetime: string | null
  business_days: number | null
  on_time: boolean | null
  affected_orders: string[]
  affected_count: number
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
    machine_id: number
    duration_hours: number
    due_date: string
    priority: number
    is_urgent: boolean
  }) => api.post<DeliverySimResult>('/schedule/simulate/delivery', payload),
}
