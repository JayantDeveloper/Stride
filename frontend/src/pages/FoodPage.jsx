// FoodPage — the temporary bulk menu, shown until the dining plan takes over.
//
// Deliberately not a tracker: nothing is logged and nothing is checked off. It
// answers one question — "what am I eating next, and what goes in it" — because
// that is the only job it needs to do for the three days it exists.
import { useMemo } from 'react'
import { DINING_PLAN_STARTS, MENU, SAFETY_NET } from '../constants/bulkMenu'

const DAY_LABEL = { weekday: 'long', month: 'short', day: 'numeric' }

function todayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Minutes since midnight, for deciding which meal is next. */
function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function daysUntil(iso) {
  const target = new Date(`${iso}T00:00:00`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

function Stat({ value, unit, label, accent }) {
  return (
    <div className="flex flex-col">
      <div className="text-lg font-semibold tabular-nums" style={{ color: accent || 'var(--color-notion-text)' }}>
        {value}<span className="text-xs font-normal ml-0.5" style={{ color: 'var(--color-notion-muted)' }}>{unit}</span>
      </div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-notion-muted)' }}>{label}</div>
    </div>
  )
}

function MealRow({ meal, state, accent }) {
  const dim = state === 'past'
  return (
    <div
      className="flex gap-3 px-3 py-2.5 rounded-md transition-colors"
      style={{
        background: state === 'next' ? `${accent}14` : 'transparent',
        boxShadow: state === 'next' ? `inset 0 0 0 1px ${accent}66` : 'none',
        opacity: dim ? 0.45 : 1,
      }}
    >
      <div className="w-20 flex-shrink-0 pt-0.5">
        <div className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--color-notion-text)' }}>
          {fmtTime(meal.time)}
        </div>
        {state === 'next' && (
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>Up next</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-notion-text)' }}>
            {meal.name || meal.label}
          </span>
          {meal.name && (
            <span className="text-[11px]" style={{ color: 'var(--color-notion-muted)' }}>{meal.label}</span>
          )}
        </div>
        <ul className="mt-1 space-y-0.5">
          {meal.items.map((item) => (
            <li key={item} className="text-[12px] leading-snug flex gap-1.5" style={{ color: 'var(--color-notion-muted)' }}>
              <span style={{ color: accent }}>·</span>{item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-shrink-0 text-right">
        <div className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--color-notion-text)' }}>
          {meal.kcal}<span className="text-[10px] font-normal"> kcal</span>
        </div>
        {meal.protein != null && (
          <div className="text-[11px] tabular-nums" style={{ color: accent }}>{meal.protein}g protein</div>
        )}
      </div>
    </div>
  )
}

export default function FoodPage() {
  const today = todayISO()
  const remaining = daysUntil(DINING_PLAN_STARTS)
  const minutes = nowMinutes()

  // The next meal is only meaningful on today's card.
  const nextMealTime = useMemo(() => {
    const day = MENU.find((d) => d.date === today)
    if (!day) return null
    const upcoming = day.meals.filter((m) => toMinutes(m.time) >= minutes)
    return upcoming.length ? upcoming[0].time : null
  }, [today, minutes])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-notion-text)' }}>Bulk Menu</h2>
          <span className="text-xs" style={{ color: 'var(--color-notion-muted)' }}>
            {remaining > 0
              ? `Temporary — dining plan takes over in ${remaining} day${remaining === 1 ? '' : 's'}`
              : 'Dining plan is active — this menu has expired'}
          </span>
        </div>

        {remaining <= 0 && (
          <div className="mt-3 rounded-md px-3 py-2 text-[12px]"
               style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}>
            Your dining plan started on {new Date(`${DINING_PLAN_STARTS}T00:00:00`).toLocaleDateString([], DAY_LABEL)}.
            This page is kept for reference only.
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {MENU.map((day, i) => {
            const isToday = day.date === today
            const isPast = day.date < today
            return (
              <section
                key={day.date}
                className="rounded-lg border overflow-hidden"
                style={{
                  borderColor: isToday ? day.accent : 'var(--color-notion-border)',
                  boxShadow: isToday ? `inset 0 0 0 1px ${day.accent}` : 'none',
                  opacity: isPast ? 0.55 : 1,
                }}
              >
                <header className="flex items-center justify-between gap-3 px-3 py-2.5 flex-wrap"
                        style={{ background: `${day.accent}0F`, borderBottom: '1px solid var(--color-notion-border)' }}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: day.accent }} />
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--color-notion-text)' }}>
                        Day {i + 1} · {day.title}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--color-notion-muted)' }}>
                        {new Date(`${day.date}T00:00:00`).toLocaleDateString([], DAY_LABEL)}
                        {isToday && <span className="ml-1.5 font-bold" style={{ color: day.accent }}>· TODAY</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <Stat value={day.kcal.toLocaleString()} unit="kcal" label="Calories" />
                    <Stat value={day.protein} unit="g" label="Protein" accent={day.accent} />
                  </div>
                </header>

                <div className="p-1.5 flex flex-col gap-0.5">
                  {day.meals.map((meal) => (
                    <MealRow
                      key={meal.time}
                      meal={meal}
                      accent={day.accent}
                      state={
                        isToday && meal.time === nextMealTime ? 'next'
                        : isPast || (isToday && toMinutes(meal.time) < minutes) ? 'past'
                        : 'upcoming'
                      }
                    />
                  ))}
                </div>

                {day.note && (
                  <div className="px-3 py-2 text-[11px]"
                       style={{ borderTop: '1px solid var(--color-notion-border)', color: 'var(--color-notion-muted)' }}>
                    {day.note}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        <section className="mt-4 rounded-lg border p-3" style={{ borderColor: 'var(--color-notion-border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-notion-text)' }}>Safety net stock</div>
          <div className="text-[11px] mb-2" style={{ color: 'var(--color-notion-muted)' }}>
            Standby calories if you scale up gym output, or roll into a fourth day.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SAFETY_NET.map((item) => (
              <span key={item} className="text-[11px] px-2 py-1 rounded"
                    style={{ background: 'var(--color-notion-hover)', color: 'var(--color-notion-text)' }}>
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
