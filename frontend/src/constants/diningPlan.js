// diningPlan.js — the Anytime Dining plan that replaced the temporary bulk menu
// on 2026-08-27.
//
// Hours are per weekday index (0 = Sunday) as [openHHMM, closeHHMM], or null
// where UMD Dining does not publish a figure this file can vouch for. The UI
// renders null as "check hours" rather than guessing, because a wrong close
// time is worse than no close time when you are walking across campus.
export const HALLS = [
  {
    name: 'Yahentamitsi',
    where: 'Denton community, north campus',
    hours: [['10:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['10:00', '21:00']],
  },
  {
    name: 'South Campus Dining Hall',
    where: 'South campus, near the Hill',
    hours: [['10:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['10:00', '21:00']],
  },
  {
    name: '251 North',
    where: 'North campus, Denton/Ellicott side',
    // Friday's close is not published in a form worth pinning down here.
    hours: [['08:00', '19:00'], ['08:00', '22:00'], ['08:00', '22:00'], ['08:00', '22:00'], ['08:00', '22:00'], ['08:00', null], ['08:00', '19:00']],
  },
]

// Anytime Dining is unlimited swipes, so the constraint is what you put on the
// plate, never how many times you go back.
export const PLATE_RULES = [
  'Lead with the grill or carvery. Protein first, twice, before anything else lands on the plate.',
  'Then starch: rice, pasta, potatoes. Bulking is where the carbs earn their place.',
  'Vegetables last and generously, so fibre does not crowd out the calories.',
  'Second plate is free. Going back is the entire point of Anytime Dining.',
  'Grab a yogurt or milk on the way out to cover the gap to the next meal.',
]

export const TARGET = { kcal: 2500, protein: 150 }

export const MEALS = [
  { time: '09:15', label: 'Breakfast', note: 'Bag packed first. You are not coming back to the room.' },
  { time: '12:35', label: 'Lunch', note: 'Away from the laptop.' },
  { time: '18:20', label: 'Dinner', note: 'Biggest protein hit of the day.' },
]

export const SOURCE = 'https://dining.umd.edu/hours-locations/dining-halls'
