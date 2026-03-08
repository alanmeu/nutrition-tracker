import React from "react";
import MealCard from "./MealCard";
import { MEAL_KEYS } from "../utils/mealPlanner";

export default function MenuDay({ dayLabel, meals, readOnly = false, onChangeMeal }) {
  return (
    <article className="menu-day">
      <h4>{dayLabel}</h4>
      <div className="menu-meals-grid">
        {MEAL_KEYS.map((meal) => (
          <MealCard
            key={meal.key}
            label={meal.label}
            value={meals?.[meal.key] || ""}
            readOnly={readOnly}
            onChange={(value) => onChangeMeal?.(meal.key, value)}
          />
        ))}
      </div>
    </article>
  );
}
