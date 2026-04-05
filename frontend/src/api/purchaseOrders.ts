import api from './client'

export interface PurchaseOrder {
  id: number
  material_id: number
  material_code: string
  material_name: string
  unit: string
  po_number: string
  supplier_name: string
  quantity: number
  unit_price: number | null
  order_date: string
  expected_delivery_date: string
  actual_delivery_date: string | null
  received_quantity: number | null
  status: 'ordered' | 'partial' | 'received' | 'cancelled'
  note: string | null
  is_overdue: boolean
}

export interface PurchaseOrderIn {
  material_id: number
  supplier_name: string
  quantity: number
  unit_price?: number
  order_date: string
  expected_delivery_date: string
  note?: string
}

export const purchaseOrdersApi = {
  list: (params?: { status?: string; material_id?: number; days_ahead?: number }) =>
    api.get<PurchaseOrder[]>('/purchase-orders', { params }),
  schedule: (days_ahead = 30) =>
    api.get<PurchaseOrder[]>('/purchase-orders/schedule', { params: { days_ahead } }),
  create: (data: PurchaseOrderIn) => api.post<PurchaseOrder>('/purchase-orders', data),
  update: (id: number, data: Partial<PurchaseOrderIn & { status: string }>) =>
    api.put<PurchaseOrder>(`/purchase-orders/${id}`, data),
  receive: (id: number, received_quantity: number, actual_delivery_date: string, note?: string) =>
    api.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, { received_quantity, actual_delivery_date, note }),
  cancel: (id: number) => api.delete(`/purchase-orders/${id}`),
}
