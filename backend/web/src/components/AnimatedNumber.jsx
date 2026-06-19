import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

// 数字滚动动画：从上次值平滑过渡到目标值。formatter 控制展示。
export default function AnimatedNumber({ value, format = (v) => v, duration = 0.9 }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    if (reduce || !Number.isFinite(Number(value)) || !Number.isFinite(Number(prev.current))) {
      setDisplay(value)
      prev.current = value
      return
    }
    const controls = animate(Number(prev.current), Number(value), {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, duration, reduce])

  return <>{format(display)}</>
}
