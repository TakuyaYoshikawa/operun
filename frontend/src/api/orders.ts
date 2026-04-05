import api from './client'

export type OrderStatus = 'pending' | 'in_progress' | 'done'

export interface Operation {
  id: number
  sequence: number
  machine_id: number
  process_id: number | null
  duration_hours: number
  is_urgent: boolean
  planned_start: string | null
  planned_end: string | null
  op_status: string
  actual_start: string | null
  actual_end: string | null
  actual_hours: number | null
  worker: string | null
}

export interface Order {
  id: number
  order_number: string
  product_name: string
  product_code: string
  quantity: number
  due_date: string
  priority: 1 | 2 | 3
  status: OrderStatus
  note?: string
  customer_id?: number | null
  created_at: string
  operations: Operation[]
}

export interface OrderCreate {
  order_number: string
  product_name: string
  product_code: string
  quantity: number
  due_date: string
  priority: 1 | 2 | 3
  status?: OrderStatus
  note?: string
  customer_id?: number | null
}

export interface OperationCreate {
  machine_id: number
  process_id?: number | null
  duration_hours: number
  is_urgent?: boolean
}

export const ordersApi = {
  list: (params?: { status?: string; priority?: number }) =>
    api.get<{ total: number; items: Order[] }>('/orders', { params }),
  get: (id: number) => api.get<Order>(`/orders/${id}`),
  create: (data: OrderCreate) => api.post<Order>('/orders', data),
  update: (id: number, data: Partial<OrderCreate>) =>
    api.put<Order>(`/orders/${id}`, data),
  delete: (id: number) => api.delete(`/orders/${id}`),

  operations: {
    list: (orderId: number) =>
      api.get<Operation[]>(`/orders/${orderId}/operations`),
    add: (orderId: number, data: OperationCreate) =>
      api.post<Operation>(`/orders/${orderId}/operations`, data),
    update: (orderId: number, opId: number, data: Partial<OperationCreate>) =>
      api.put<Operation>(`/orders/${orderId}/operations/${opId}`, data),
    delete: (orderId: number, opId: number) =>
      api.delete(`/orders/${orderId}/operations/${opId}`),
    start: (orderId: number, opId: number) =>
      api.post(`/orders/${orderId}/operations/${opId}/start`),
    finish: (orderId: number, opId: number) =>
      api.post(`/orders/${orderId}/operations/${opId}/finish`),
  },
}
