import { addDays, differenceInCalendarDays, format, isWithinInterval, parseISO } from 'date-fns'

const CYCLE_DAYS = 14

export function currentCycleStart(anchor: string): Date {
  const anchorDate = parseISO(anchor)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = differenceInCalendarDays(today, anchorDate)
  if (diff < 0) return anchorDate
  const elapsed = Math.floor(diff / CYCLE_DAYS)
  return addDays(anchorDate, elapsed * CYCLE_DAYS)
}

export function cycleEnd(start: Date): Date {
  return addDays(start, CYCLE_DAYS - 1)
}

export function prevCycle(start: Date): Date {
  return addDays(start, -CYCLE_DAYS)
}

export function nextCycle(start: Date): Date {
  return addDays(start, CYCLE_DAYS)
}

export function cycleKey(start: Date): string {
  return format(start, 'yyyy-MM-dd')
}

export function cycleLabel(start: Date): string {
  const end = cycleEnd(start)
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'MMM d')} – ${format(end, 'd')}`
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
}

export function dateInCycle(dateStr: string, cycleStart: Date): boolean {
  const d = parseISO(dateStr)
  return isWithinInterval(d, { start: cycleStart, end: cycleEnd(cycleStart) })
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
