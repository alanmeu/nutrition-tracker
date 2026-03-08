import React, { useState } from "react";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AddWeight({ onAdd, busy }) {
  const [weight, setWeight] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!weight) return;

    await onAdd({
      date: todayIso(),
      weight: Number(weight)
    });

    setWeight("");
  };

  return (
    <form onSubmit={handleSubmit} className="inline-form">
      <input
        type="number"
        step="0.1"
        min="20"
        max="400"
        placeholder="Poids en kg"
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
        required
      />
      <button className="primary" type="submit" disabled={busy}>
        Ajouter
      </button>
    </form>
  );
}
