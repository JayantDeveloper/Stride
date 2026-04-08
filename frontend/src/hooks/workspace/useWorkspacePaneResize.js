import { useRef, useState } from 'react'

export function useWorkspacePaneResize() {
  const [rightPct, setRightPct] = useState(30)
  const containerRef = useRef(null)

  function handleDividerMouseDown(event) {
    event.preventDefault()

    const container = containerRef.current
    if (!container) return

    const onMove = moveEvent => {
      const rect = container.getBoundingClientRect()
      const pct = ((rect.right - moveEvent.clientX) / rect.width) * 100
      setRightPct(Math.min(55, Math.max(18, pct)))
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return {
    containerRef,
    rightPct,
    handleDividerMouseDown,
  }
}
