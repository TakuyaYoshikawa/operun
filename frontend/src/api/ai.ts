import api from './client'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ParsedOrder {
  product_name: string | null
  product_code: string | null
  quantity: number | null
  due_date: string | null
  priority: number
  customer_id: number | null
  note: string | null
  missing_fields: string[]
}

export const aiApi = {
  chat: (messages: ChatMessage[], context?: string) =>
    api.post<{ reply: string }>('/ai/chat', { messages, context }),

  parseOrder: (text: string) =>
    api.post<
      | { type: 'single'; order: ParsedOrder }
      | { type: 'multiple'; orders: ParsedOrder[] }
    >('/ai/parse-order', { text }),

  explainSimulation: (result: Record<string, unknown>) =>
    api.post<{ message: string }>('/ai/explain-simulation', { result }),

  ganttSummary: () =>
    api.post<{ context: string }>('/ai/gantt-summary'),

  agent: (messages: ChatMessage[]) =>
    api.post<{ reply: string; tool_calls: { tool: string; input: Record<string, unknown>; result: unknown }[] }>('/ai/agent', { messages }),

  constraintsSummary: () =>
    api.get<{
      machine_groups: { type: string; machines: string[] }[]
      active_machine_count: number
      inactive_machines: { id: number; name: string; type: string | null }[]
      upcoming_maintenance: { machine: string; start: string; end: string; reason: string | null }[]
      calendar_exceptions: { date: string; working_hours: number; name: string | null; type: string }[]
      locked_operations: { id: number; order_number: string; sequence: number; planned_start: string | null; planned_end: string | null }[]
      locked_operations_count: number
      machine_locked_count: number
    }>('/ai/constraints'),
}
