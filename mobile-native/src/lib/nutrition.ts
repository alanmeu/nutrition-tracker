export function calcBMR(weightKg: number, heightCm: number, age: number, sex: "male" | "female") {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function calcTDEE(bmr: number, nap: number) {
  return bmr * nap;
}

export function calcDeficit(tdee: number, deficitPercent: number) {
  return tdee * (1 - deficitPercent / 100);
}

export function calcMacros(weightKg: number, calories: number) {
  const protein = Math.round(weightKg * 2);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, fat, carbs };
}

export function mondayOf(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
