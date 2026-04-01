import { useEffect, useRef, useState } from 'react'

function fmt(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function QuickCreatePopover({ x, y, slot, onSave, onMoreOptions, onClose }) {
  const [title, setTitle] = useState('')
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && title.trim()) handleSave()
    if (e.key === 'Escape') onClose()
  }

  async function handleSave() {
    if (!title.trim()) return
    await onSave({ title: title.trim(), ...slot })
    onClose()
  }

  // Clamp to viewport
  const popW = 272
  const popH = 160
  const clampedX = Math.min(x + 8, window.innerWidth - popW - 12)
  const clampedY = Math.min(y, window.innerHeight - popH - 12)

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'fixed',
        top: clampedY,
        left: clampedX,
        width: popW,
        zIndex: 1000,
        background: 'var(--color-notion-surface)',
        border: '1px solid var(--color-notion-border)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        padding: '14px',
      }}
    >
      {/* Time label */}
      <p style={{ fontSize: 11, color: 'var(--color-notion-muted)', marginBottom: 8 }}>
        {fmt(slot?.start_time)} – {fmt(slot?.end_time)}
      </p>

      {/* Title input */}
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Event title"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--color-notion-border)',
          outline: 'none',
          color: 'var(--color-notion-text)',
          fontSize: 14,
          fontWeight: 600,
          paddingBottom: 6,
          marginBottom: 12,
        }}
      />

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => onMoreOptions({ title: title.trim(), ...slot })}
          style={{ fontSize: 12, color: 'var(--color-notion-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-notion-text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-notion-muted)'}
        >
          More options
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--color-notion-border)',
              color: 'var(--color-notion-muted)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: title.trim() ? 'pointer' : 'default',
              background: title.trim() ? '#4F46E5' : 'rgba(79,70,229,0.3)',
              border: 'none', color: '#fff', fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
