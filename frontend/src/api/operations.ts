import api from './client'

export interface Operation {
  id: number
  order_id: number
  order_number: string
  product_name: string
  customer_name: string | null
  machine_id: number
  machine_name: string
  process_name: string | null
  sequence: number
  duration_hours: number
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  actual_hours: number | null
  op_status: 'not_started' | 'in_progress' | 'done' | 'on_hold'
  worker: string | null
  actual_note: string | null
  is_urgent: boolean
  due_date: string
}

export const operationsApi = {
  list: (params?: { target_date?: string; machine_id?: number; status?: string }) =>
    api.get<Operation[]>('/operations', { params }),

  today: (machine_id?: number) =>
    api.get<Operation[]>('/operations/today', { params: machine_id ? { machine_id } : undefined }),

  get: (id: number) =>
    api.get<Operation>(`/operations/${id}`),

  start: (id: number, worker?: string) =>
    api.post<Operation>(`/operations/${id}/start`, { worker }),

  complete: (id: number, data?: { actual_hours?: number; actual_note?: string; worker?: string }) =>
    api.post<Operation>(`/operations/${id}/complete`, data ?? {}),

  hold: (id: number, actual_note?: string) =>
    api.post<Operation>(`/operations/${id}/hold`, { actual_note }),

  updateNote: (id: number, data: { worker?: string; actual_note?: string }) =>
    api.patch<Operation>(`/operations/${id}/note`, data),
}
