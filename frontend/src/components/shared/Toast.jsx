import { useToast } from '../../context/ToastContext'

const TYPE_STYLES = {
  info:    'bg-slate-800 border-slate-600 text-slate-100',
  success: 'bg-green-950 border-green-700 text-green-200',
  error:   'bg-red-950 border-red-700 text-red-200',
  warning: 'bg-amber-950 border-amber-700 text-amber-200',
}

export function Toast() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm shadow-xl ${TYPE_STYLES[toast.type] ?? TYPE_STYLES.info}`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 opacity-60 hover:opacity-100 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
