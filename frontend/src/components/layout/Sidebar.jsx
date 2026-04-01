import { NavLink } from 'react-router-dom'
import { useState } from 'react'

const NAV_ITEMS = [
  { to: '/execute',   label: 'Execute',    icon: '▶' },
  { to: '/tasks',     label: 'Tasks',      icon: '✓' },
  { to: '/calendar',  label: 'Calendar',   icon: '◫' },
  { to: '/plan',      label: 'Plan',       icon: '◑' },
  { to: '/analytics', label: 'Analytics',  icon: '▦' },
  { to: '/settings',  label: 'Settings',   icon: '⚙' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`flex flex-col flex-shrink-0 transition-all duration-200 ${collapsed ? 'w-12' : 'w-48'}`}
      style={{ background: 'var(--color-notion-surface)', borderRight: '1px solid var(--color-notion-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-4" style={{ borderBottom: '1px solid var(--color-notion-border)' }}>
        {!collapsed && (
          <span className="text-sm font-semibold text-notion-text tracking-tight truncate">FocusLab</span>
        )}
        {collapsed && (
          <span className="text-sm font-semibold text-indigo-400 tracking-tight">FL</span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col gap-0.5 p-1.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-notion-hover text-notion-text font-medium'
                  : 'text-notion-muted hover:bg-notion-hover hover:text-notion-text'
              }`
            }
          >
            <span className="text-sm leading-none w-4 flex-shrink-0 text-center opacity-70">{icon}</span>
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(p => !p)}
        className="flex items-center justify-center py-2.5 text-notion-muted hover:text-notion-text transition-colors text-xs"
        style={{ borderTop: '1px solid var(--color-notion-border)' }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>
    </aside>
  )
}
