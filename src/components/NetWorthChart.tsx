import { useRef, useState } from 'react'
import { formatMoney } from '../lib/money'

interface NetWorthChartProps {
  dataPoints: Array<{ label: string; netWorth: number }>
}

const W = 400
const H = 120
const LABEL_H = 16
const CHART_H = H - LABEL_H

export function NetWorthChart({ dataPoints }: NetWorthChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const n = dataPoints.length
  if (n < 2) return null

  const values = dataPoints.map(d => d.netWorth)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const rawRange = rawMax - rawMin === 0 ? 1 : rawMax - rawMin
  const pad = rawRange * 0.1
  const minVal = rawMin - pad
  const maxVal = rawMax + pad
  const range = maxVal - minVal

  function toX(i: number): number {
    return (i / (n - 1)) * W
  }

  function toY(v: number): number {
    return CHART_H - ((v - minVal) / range) * CHART_H
  }

  const points = dataPoints.map((d, i) => ({ x: toX(i), y: toY(d.netWorth) }))

  function buildPath(): string {
    const parts: string[] = []
    parts.push(`M ${points[0].x},${points[0].y}`)
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx = (prev.x + curr.x) / 2
      parts.push(`C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`)
    }
    return parts.join(' ')
  }

  function buildFillPath(): string {
    const line = buildPath()
    const last = points[points.length - 1]
    const first = points[0]
    return `${line} L ${last.x},${CHART_H} L ${first.x},${CHART_H} Z`
  }

  const linePath = buildPath()
  const fillPath = buildFillPath()

  const hasZeroCross = rawMin < 0 && rawMax > 0
  const zeroY = toY(0)

  function getIndexFromClientX(clientX: number): number {
    if (!svgRef.current) return 0
    const rect = svgRef.current.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const idx = Math.round(relX * (n - 1))
    return Math.max(0, Math.min(n - 1, idx))
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    setHoveredIndex(getIndexFromClientX(e.clientX))
  }

  function handleTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    if (e.touches.length > 0) {
      setHoveredIndex(getIndexFromClientX(e.touches[0].clientX))
    }
  }

  const hovered = hoveredIndex !== null ? dataPoints[hoveredIndex] : null
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null

  const tooltipValue = hovered ? hovered.netWorth : null
  const tooltipLabel = hovered ? hovered.label : null

  let tooltipLeft: string | undefined
  let tooltipRight: string | undefined
  if (hoveredIndex !== null) {
    const pct = hoveredIndex / (n - 1)
    if (pct < 0.5) {
      tooltipLeft = `${(pct * 100).toFixed(1)}%`
    } else {
      tooltipRight = `${((1 - pct) * 100).toFixed(1)}%`
    }
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoveredIndex(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {hasZeroCross && (
          <line
            x1={0} y1={zeroY}
            x2={W} y2={zeroY}
            stroke="#6B7280"
            strokeWidth="0.75"
            strokeDasharray="4 3"
          />
        )}

        <path d={fillPath} fill="url(#nw-grad)" />
        <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredIndex === i ? 3.5 : 2}
            fill="#3B82F6"
            opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.4}
          />
        ))}

        {hoveredPoint && (
          <line
            x1={hoveredPoint.x} y1={0}
            x2={hoveredPoint.x} y2={CHART_H}
            stroke="#6B7280"
            strokeWidth="0.75"
            strokeDasharray="3 3"
          />
        )}

        {dataPoints.map((d, i) => {
          if (i % 2 !== 0) return null
          const x = toX(i)
          const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
          return (
            <text
              key={i}
              x={x}
              y={H - 2}
              fontSize={9}
              fill="#6B7280"
              textAnchor={anchor}
            >
              {d.label}
            </text>
          )
        })}
      </svg>

      {hovered && hoveredPoint && tooltipValue !== null && tooltipLabel !== null && (
        <div
          className="absolute top-0 pointer-events-none z-10"
          style={tooltipLeft !== undefined ? { left: tooltipLeft } : { right: tooltipRight }}
        >
          <div className="bg-elev border border-border rounded px-2 py-1 shadow-md whitespace-nowrap">
            <p className="text-xs text-muted">{tooltipLabel}</p>
            <p className={`text-xs font-mono font-medium tabular-nums ${tooltipValue >= 0 ? 'text-success' : 'text-danger'}`}>
              {tooltipValue >= 0 ? '' : '-'}{formatMoney(Math.abs(tooltipValue))}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
