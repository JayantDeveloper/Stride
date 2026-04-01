export function Button({ children, onClick, variant = 'primary', size = 'md', disabled = false, className = '', type = 'button', ...rest }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary:   'bg-indigo-600 hover:bg-indigo-500 text-white',
    secondary: 'bg-notion-surface hover:bg-notion-hover text-notion-text border border-notion-border',
    danger:    'bg-red-950 hover:bg-red-900 text-red-300 border border-red-900',
    ghost:     'hover:bg-notion-hover text-notion-muted hover:text-notion-text',
    success:   'bg-green-950 hover:bg-green-900 text-green-300 border border-green-900',
  }

  const sizes = {
    xs: 'text-xs px-2 py-1 gap-1',
    sm: 'text-sm px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant] ?? variants.primary} ${sizes[size] ?? sizes.md} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
