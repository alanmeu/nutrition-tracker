export const DAY_KEYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" }
];

export const MEAL_KEYS = [
  { key: "breakfast", label: "Petit-dejeuner" },
  { key: "lunch", label: "Dejeuner" },
  { key: "dinner", label: "Diner" },
  { key: "snack", label: "Collation" }
];

export function createEmptyWeeklyPlan() {
  return DAY_KEYS.reduce((acc, day) => {
    acc[day.key] = MEAL_KEYS.reduce((meals, meal) => {
      meals[meal.key] = "";
      return meals;
    }, {});
    return acc;
  }, {});
}

export function normalizeWeeklyPlan(rawPlan) {
  const base = createEmptyWeeklyPlan();
  if (!rawPlan || typeof rawPlan !== "object") return base;

  for (const day of DAY_KEYS) {
    for (const meal of MEAL_KEYS) {
      const value = rawPlan?.[day.key]?.[meal.key];
      base[day.key][meal.key] = typeof value === "string" ? value : "";
    }
  }

  return base;
}

export function getMondayOfCurrentWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
