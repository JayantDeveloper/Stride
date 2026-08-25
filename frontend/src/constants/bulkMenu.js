// constants/bulkMenu.js — the temporary three-day bulk menu.
//
// A stopgap that expires when the dining plan activates on Thursday 28 Aug 2026.
// Day 1 is Monday 24 Aug, so the three days land Mon/Tue/Wed and the dining plan
// picks up on Thursday.
//
// Breakfast is listed at 9:15, not the 8:45 in the original plan: the morning
// routine gained gym commutes, which pushed breakfast back. The times here match
// the calendar blocks so the two do not disagree.

export const DINING_PLAN_STARTS = '2026-08-27'   // Thursday

export const MENU = [
  {
    date: '2026-08-24',
    title: 'High-Carb Fuel Day',
    accent: '#F59E0B',
    kcal: 2830,
    protein: 174,
    note: 'Dinner was not eaten — the shrimp fried rice moved to Day 2.',
    meals: [
      { time: '07:05', label: 'Pre-Gym Fuel', kcal: 160, protein: 5,
        items: ['1 slice white bread', '1 tbsp peanut butter'] },
      { time: '09:15', label: 'Breakfast', name: 'Paneer Paratha with Eggs', kcal: 820, protein: 42,
        items: ['1 paratha cooked in butter', '2 fried eggs', '12 oz chocolate milk'] },
      { time: '13:00', label: 'Lunch', name: 'The Double PB&J Power-up', kcal: 750, protein: 32,
        items: ['2 full PB&J sandwiches', '1 protein bar'] },
      { time: '16:00', label: 'Afternoon Snack', kcal: 250, protein: 37,
        items: ['1 Chobani strawberry yogurt', '1 scoop protein shake'] },
      { time: '19:00', label: 'Dinner', name: "Trader Joe's Chicken & Shrimp Fried Rice", kcal: 850, protein: 58,
        items: ['Whole bag TJ shrimp fried rice', 'Half bag TJ grilled chicken strips', '1 egg scrambled in'] },
    ],
  },
  {
    date: '2026-08-25',
    title: 'Thai Peanut & Chicken Day',
    accent: '#10B981',
    kcal: 2518,
    protein: 147,
    meals: [
      { time: '07:05', label: 'Pre-Gym Fuel', kcal: 160, protein: 5,
        items: ['1 slice white bread', '1 tbsp peanut butter'] },
      { time: '09:15', label: 'Breakfast', name: 'Loaded Avocado Toast & Eggs', kcal: 808, protein: 32,
        items: ['2 slices sourdough', '1 mashed avocado', '2 scrambled eggs in butter', 'Chocolate milk'] },
      { time: '13:00', label: 'Lunch', name: 'PB&J + Yogurt Stack', kcal: 560, protein: 27,
        items: ['1 heavy PB&J sandwich', '1 Chobani strawberry yogurt', '1 protein bar'] },
      { time: '19:00', label: 'Dinner', name: "Trader Joe's Chicken & Shrimp Fried Rice", kcal: 850, protein: 58,
        items: ['Whole bag TJ shrimp fried rice', 'Half bag TJ grilled chicken strips', '1 egg scrambled in'] },
      { time: '22:00', label: 'Late Night Shake', kcal: 140, protein: 25,
        items: ['1 protein shake'] },
    ],
  },
  {
    date: '2026-08-26',
    title: 'Cheesy Italian Pasta Bulk',
    accent: '#8B5CF6',
    kcal: 2440,
    protein: 98,
    note: 'Protein shown excludes the grilled chicken in the satay noodles, which the plan never quantified. Add a shake if you feel short.',
    meals: [
      { time: '07:05', label: 'Pre-Gym Fuel', kcal: 160, protein: 5,
        items: ['1 slice white bread', '1 tbsp peanut butter'] },
      { time: '09:15', label: 'Breakfast', name: 'The Ultimate Combo', kcal: 950, protein: 46,
        items: ['1 paneer paratha', '1 slice sourdough avocado toast', '2 fried eggs', 'Chocolate milk'] },
      { time: '13:00', label: 'Lunch', name: 'Protein Penne Pasta', kcal: 700, protein: 35,
        items: ['Penne tossed with butter and cheese', '1 protein bar on the side'] },
      { time: '16:00', label: 'Afternoon Snack', kcal: 110, protein: 12,
        items: ['1 Chobani strawberry yogurt'] },
      { time: '19:00', label: 'Dinner', name: 'Ultimate Peanut Satay Chicken Noodles', kcal: 520, protein: null,
        items: ['Peanut Satay Thai Noodles packet', 'Remaining half bag TJ grilled chicken, tossed in hot'] },
    ],
  },
]

export const SAFETY_NET = [
  'Cheesy Egg Maggi Hack (2 Maggi + 2 eggs + cheese) — freed up by the dinner shuffle',
  '2 packs Maruchan instant ramen',
  '2 packs Chobani strawberry yogurt',
  'Protein bars',
  'Protein shakes',
]
