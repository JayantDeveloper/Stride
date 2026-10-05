import { useState, useEffect } from 'react'
import { usePlans } from '../hooks/usePlans'
import { Spinner } from '../components/shared/Spinner'

function renderMarkdown(md) {
  const lines = md.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold text-notion-text mb-4 mt-2">{line.slice(2)}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-sm font-semibold text-notion-text uppercase tracking-wide mt-6 mb-2 border-b border-notion-border pb-1">{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-notion-text mt-4 mb-1">{line.slice(4)}</h3>)
    } else if (line.startsWith('> ')) {
      elements.push(
        <div key={i} className="border-l-2 border-indigo-300 pl-3 py-0.5 my-2 text-notion-muted text-xs italic">
          {line.slice(2)}
        </div>
      )
    } else if (line.startsWith('| ')) {
      // collect table rows
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const rows = tableLines.filter(l => !/^\|[-| ]+\|$/.test(l.trim()))
      elements.push(
        <div key={`table-${i}`} className="my-3 overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            {rows.map((row, ri) => {
              const cells = row.split('|').slice(1, -1).map(c => c.trim())
              return (
                <tr key={ri} className={ri === 0 ? 'border-b border-notion-border' : 'border-b border-notion-border/50'}>
                  {cells.map((cell, ci) => (
                    ri === 0
                      ? <th key={ci} className="py-1 px-2 text-left text-notion-muted font-medium whitespace-nowrap">{cell}</th>
                      : <td key={ci} className="py-1 px-2 text-notion-text">{cell}</td>
                  ))}
                </tr>
              )
            })}
          </table>
        </div>
      )
      continue
    } else if (/^\d+\.\s/.test(line) || line.startsWith('- ')) {
      // collect list items
      const listLines = []
      const isOrdered = /^\d+\./.test(line)
      while (i < lines.length && (lines[i].startsWith('- ') || /^\d+\.\s/.test(lines[i]))) {
        listLines.push(lines[i].replace(/^[\d]+\.\s/, '').replace(/^- /, ''))
        i++
      }
      const Tag = isOrdered ? 'ol' : 'ul'
      elements.push(
        <Tag key={`list-${i}`} className={`my-2 pl-4 space-y-0.5 text-sm text-notion-text ${isOrdered ? 'list-decimal' : 'list-disc'}`}>
          {listLines.map((item, li) => <li key={li}>{item}</li>)}
        </Tag>
      )
      continue
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-sm text-notion-text leading-relaxed">{line}</p>)
    }

    i++
  }

  return elements
}

export default function PlansPage() {
  const { plans, loading, getPlan, deletePlan } = usePlans()
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function selectPlan(slug) {
    if (selected === slug) return
    setSelected(slug)
    setContentLoading(true)
    try {
      const data = await getPlan(slug)
      setContent(data.content ?? '')
    } finally {
      setContentLoading(false)
    }
  }

  useEffect(() => {
    if (plans.length > 0 && !selected) {
      void selectPlan(plans[0].slug)
    }
  }, [plans])

  async function handleDelete(slug) {
    await deletePlan(slug)
    setConfirmDelete(null)
    if (selected === slug) {
      setSelected(null)
      setContent('')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (plans.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-notion-muted">
        <span className="text-3xl">📋</span>
        <p className="text-sm">No plan files yet.</p>
        <p className="text-xs">Use <code className="bg-notion-hover px-1.5 py-0.5 rounded font-mono">/todo add &lt;task&gt;</code> to create one.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-notion-border flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-notion-border">
          <span className="text-xs font-semibold text-notion-muted uppercase tracking-wide">Plans</span>
          <span className="ml-2 text-xs text-notion-muted">{plans.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {plans.map(p => (
            <button
              key={p.slug}
              onClick={() => selectPlan(p.slug)}
              className={`w-full text-left px-4 py-2.5 transition-colors group ${
                selected === p.slug
                  ? 'bg-notion-hover'
                  : 'hover:bg-notion-hover/60'
              }`}
            >
              <div className="text-sm text-notion-text font-medium leading-snug line-clamp-2">{p.title}</div>
              {p.added && (
                <div className="text-xs text-notion-muted mt-0.5">{p.added}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content pane */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {selected && (
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-notion-border flex-shrink-0">
            <span className="text-xs text-notion-muted font-mono">~/.stride/plans/{selected}.md</span>
            <button
              onClick={() => setConfirmDelete(selected)}
              className="text-xs text-red-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 py-6 max-w-3xl">
          {contentLoading ? (
            <div className="flex items-center justify-center pt-16">
              <Spinner />
            </div>
          ) : (
            <div className="prose-sm">{renderMarkdown(content)}</div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-notion-surface border border-notion-border rounded-xl shadow-2xl p-6 w-80">
            <p className="text-sm text-notion-text font-medium mb-1">Delete this plan file?</p>
            <p className="text-xs text-notion-muted mb-5 font-mono">{confirmDelete}.md</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-xs text-notion-muted hover:text-notion-text hover:bg-notion-hover rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
