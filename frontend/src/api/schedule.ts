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
  runSchedule: () => api.post('/schedule/run'),
  getGantt: () => api.get<{ tasks: GanttTask[]; total: number }>('/schedule/gantt'),
  simulateDelivery: (payload: {
    product_name: string
    machine_id: number
    duration_hours: number
    due_date: string
    priority: number
    is_urgent: boolean
  }) => api.post<DeliverySimResult>('/schedule/simulate/delivery', payload),
}
