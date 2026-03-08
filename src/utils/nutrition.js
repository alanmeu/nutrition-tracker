// utils/nutrition.js

export const BMR_METHODS = [
  { value: "mifflin", label: "Mifflin-St Jeor" },
  { value: "harris", label: "Harris-Benedict (revised)" }
];

export function getBmrMethodLabel(method) {
  return BMR_METHODS.find((entry) => entry.value === method)?.label || "Mifflin-St Jeor";
}

export function calcBMR(weight, height, age, sex, method = "mifflin") {
  if (method === "harris") {
    if (sex === "male") {
      return 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
    }
    return 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age;
  }

  // Mifflin-St Jeor
  if (sex === "male") {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  }
  return 10 * weight + 6.25 * height - 5 * age - 161;
}

export function calcTDEE(bmr, nap = 1.4) {
  return bmr * nap;
}

export function calcDeficit(tdee, deficitPercentage = 20) {
  return tdee * (1 - deficitPercentage / 100);
}

export function calcMacros(weight, calories, proteinPerKg = 1.6, fatRatio = 0.28) {
  const protein = weight * proteinPerKg;
  const proteinCalories = protein * 4;
  const fatCalories = calories * fatRatio;
  const fat = fatCalories / 9;
  const carbCalories = calories - (proteinCalories + fatCalories);
  const carbs = carbCalories / 4;

  return {
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs)
  };
}
