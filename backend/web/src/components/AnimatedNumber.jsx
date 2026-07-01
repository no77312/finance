import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

// 数字滚动动画：从上次值平滑过渡到目标值。formatter 控制展示。
// resetKey 变化时（如切换成员/币种）直接吸附到新值，不做跨对象的无意义滚动。
export default function AnimatedNumber({ value, format = (v) => v, duration = 0.9, resetKey }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  const keyRef = useRef(resetKey)

  useEffect(() => {
    const identityChanged = keyRef.current !== resetKey
    keyRef.current = resetKey
    if (identityChanged || reduce || !Number.isFinite(Number(value)) || !Number.isFinite(Number(prev.current))) {
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
  }, [value, duration, reduce, resetKey])

  return <>{format(display)}</>
}
