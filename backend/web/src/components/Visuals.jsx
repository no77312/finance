import { motion } from 'framer-motion'
import { formatPercent } from '../utils/format.js'
import { DONUT_COLORS } from '../utils/colors.js'

// 分配条：多色分段，宽度增长动画（数据可视化动效）
export function AllocationStrip({ slices = [], className = '' }) {
  return (
    <div className={`allocation-strip ${className}`}>
      {slices.map((slice, i) => (
        <motion.div
          key={slice.symbol ?? slice.key ?? i}
          className={`allocation-segment tone-${i % 6}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, (slice.weight ?? 0) * 100)}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
        />
      ))}
    </div>
  )
}

// 紧凑进度条，宽度增长动画
export function CompactProgress({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="compact-progress">
      <motion.div
        className="compact-progress-fill"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}

// 权重条
export function WeightBar({ value = 0, tone = 0 }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="weight-bar">
      <motion.div
        className={`weight-fill tone-${tone % 6}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}

// 图例 chip
export function LegendChips({ slices = [], max = 4 }) {
  return (
    <div className="allocation-legend">
      {slices.slice(0, max).map((slice, i) => (
        <span key={slice.symbol ?? i} className={`legend-chip tone-${i % 6}`}>
          {slice.symbol ?? slice.label} · {formatPercent(slice.weight ?? 0)}
        </span>
      ))}
    </div>
  )
}

// 环形图：市场/资产分布，带描边增长动画
export function DonutChart({ slices = [], size = 116, thickness = 16, centerLabel, centerValue }) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = slices.reduce((s, x) => s + (x.weight ?? 0), 0)
  const segments = slices
    .filter((s) => (s.weight ?? 0) > 0)
    .reduce((acc, slice, i) => {
      const fraction = total > 0 ? (slice.weight ?? 0) / total : 0
      const dash = fraction * circumference
      return {
        offset: acc.offset + dash,
        items: [
          ...acc.items,
          {
            ...slice,
            fraction,
            dash,
            offset: acc.offset,
            color: DONUT_COLORS[i % DONUT_COLORS.length],
          },
        ],
      }
    }, { offset: 0, items: [] }).items

  return (
    <div className="donut-chart" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(120,120,128,0.14)" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((seg, i) => (
            <motion.circle
              key={seg.market ?? seg.symbol ?? i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: -seg.offset }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 + i * 0.06 }}
            />
          ))}
        </g>
      </svg>
      {(centerValue || centerLabel) && (
        <div className="donut-center">
          {centerValue && <strong>{centerValue}</strong>}
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      )}
    </div>
  )
}
