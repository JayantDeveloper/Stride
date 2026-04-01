import { useEffect } from 'react'

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handle = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${sizeClasses[size] ?? sizeClasses.md} rounded-xl shadow-2xl`}
        style={{ background: 'var(--color-notion-surface)', border: '1px solid var(--color-notion-border)' }}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-notion-border)' }}>
            <h2 className="text-sm font-semibold text-notion-text">{title}</h2>
            <button
              onClick={onClose}
              className="text-notion-muted hover:text-notion-text text-xl leading-none transition-colors"
            >
              ×
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
