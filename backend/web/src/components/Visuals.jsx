import { motion } from 'framer-motion'
import { formatPercent } from '../utils/format.js'

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
export function WeightBar({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="weight-bar">
      <motion.div
        className="weight-fill"
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
