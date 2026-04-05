import api from './client'

export interface CalendarHoliday {
  id: number
  date: string
  holiday_name: string | null
  working_hours: number
}

export interface HolidayCreate {
  date: string
  holiday_name?: string
  working_hours?: number
}

export const calendarApi = {
  list: (year?: number, month?: number) =>
    api.get<CalendarHoliday[]>('/calendar', { params: { year, month } }),
  create: (data: HolidayCreate) => api.post<CalendarHoliday>('/calendar/holidays', data),
  delete: (date: string) => api.delete(`/calendar/holidays/${date}`),
  generate: (year: number) =>
    api.post('/calendar/generate', null, { params: { year } }),
}
