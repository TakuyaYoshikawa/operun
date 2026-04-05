import api from './client'

export interface Material {
  id: number
  material_code: string
  material_name: string
  unit: string
  stock_quantity: number
  reorder_point: number
  unit_price: number
  supplier_name: string | null
  lead_days: number
  note: string | null
  is_low_stock: boolean
}

export interface MaterialIn {
  material_code: string
  material_name: string
  unit: string
  stock_quantity: number
  reorder_point: number
  unit_price: number
  supplier_name?: string
  lead_days: number
  note?: string
}

export const materialsApi = {
  list: (lowStockOnly = false) =>
    api.get<Material[]>('/materials', { params: { low_stock_only: lowStockOnly } }),
  create: (data: MaterialIn) => api.post<Material>('/materials', data),
  update: (id: number, data: Partial<MaterialIn>) => api.put<Material>(`/materials/${id}`, data),
  delete: (id: number) => api.delete(`/materials/${id}`),
  receive: (id: number, quantity: number, note?: string) =>
    api.post<Material>(`/materials/${id}/receive`, { quantity, note }),
  issue: (id: number, quantity: number, note?: string) =>
    api.post<Material>(`/materials/${id}/issue`, { quantity, note }),
  alerts: () => api.get<Material[]>('/materials/alerts'),
}
