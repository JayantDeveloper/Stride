// Renders AI schedule as a vertical timeline

export function AIPlanDisplay({ plan }) {
  if (!plan?.schedule?.length) return null

  const typeColors = {
    task:   'border-l-indigo-500 bg-indigo-950/40',
    break:  'border-l-teal-600 bg-teal-950/30',
    buffer: 'border-l-gray-600 bg-gray-800/40',
  }

  return (
    <div className="flex flex-col gap-1">
      {plan.summary && (
        <div className="bg-gray-800 rounded-lg px-4 py-3 mb-3 text-sm text-gray-300 italic">
          {plan.summary}
        </div>
      )}
      {plan.schedule.map((block, i) => (
        <div key={i} className={`flex gap-3 items-start pl-3 border-l-2 py-2 rounded-r-lg ${typeColors[block.type] ?? typeColors.task}`}>
          <span className="text-xs text-gray-500 w-24 flex-shrink-0 pt-0.5 tabular-nums">
            {block.start_time} – {block.end_time}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200">{block.title}</p>
            {block.notes && <p className="text-xs text-gray-500 mt-0.5">{block.notes}</p>}
          </div>
          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
            block.type === 'task' ? 'bg-indigo-900 text-indigo-300' :
            block.type === 'break' ? 'bg-teal-900 text-teal-300' :
            'bg-gray-800 text-gray-500'
          }`}>
            {block.type}
          </span>
        </div>
      ))}
    </div>
  )
}
