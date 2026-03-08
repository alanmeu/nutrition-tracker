import React from "react";

export default function MealCard({ label, value, onChange, readOnly = false }) {
  return (
    <label className="meal-card">
      <span>{label}</span>
      {readOnly ? (
        <p className="meal-readonly">{value || "-"}</p>
      ) : (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ex: omelette + fruits"
        />
      )}
    </label>
  );
}
