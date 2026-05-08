import {
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  format, parseISO, isWithinInterval
} from 'date-fns'

const WEEK_OPTIONS = { weekStartsOn: 1 as const }

export function thisWeekStart(): Date {
  return startOfWeek(new Date(), WEEK_OPTIONS)
}

export function weekStart(date: Date): Date {
  return startOfWeek(date, WEEK_OPTIONS)
}

export function weekEnd(date: Date): Date {
  return endOfWeek(date, WEEK_OPTIONS)
}

export function prevWeek(ws: Date): Date {
  return subWeeks(ws, 1)
}

export function nextWeek(ws: Date): Date {
  return addWeeks(ws, 1)
}

export function weekKey(ws: Date): string {
  return format(ws, 'yyyy-MM-dd')
}

export function weekLabel(ws: Date): string {
  const end = weekEnd(ws)
  if (ws.getMonth() === end.getMonth()) {
    return `${format(ws, 'MMM d')} – ${format(end, 'd')}`
  }
  return `${format(ws, 'MMM d')} – ${format(end, 'MMM d')}`
}

export function dateInWeek(dateStr: string, ws: Date): boolean {
  const d = parseISO(dateStr)
  return isWithinInterval(d, { start: ws, end: weekEnd(ws) })
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
