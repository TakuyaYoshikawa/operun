import api from './client'

export interface TemplateOperation {
  id: number
  sequence: number
  machine_id: number
  machine_name: string
  process_id: number | null
  process_name: string | null
  hours_per_unit: number
}

export interface ProductTemplate {
  id: number
  product_code: string
  product_name: string
  note: string | null
  operations: TemplateOperation[]
}

export interface TemplateOperationIn {
  sequence: number
  machine_id: number
  process_id?: number | null
  hours_per_unit: number
}

export interface ProductTemplateIn {
  product_code: string
  product_name: string
  note?: string
  operations: TemplateOperationIn[]
}

export const productTemplatesApi = {
  list: () => api.get<ProductTemplate[]>('/product-templates'),
  getByCode: (code: string) => api.get<ProductTemplate>(`/product-templates/${code}`),
  create: (data: ProductTemplateIn) => api.post<ProductTemplate>('/product-templates', data),
  update: (id: number, data: Partial<ProductTemplateIn>) =>
    api.put<ProductTemplate>(`/product-templates/${id}`, data),
  delete: (id: number) => api.delete(`/product-templates/${id}`),
}
