// pages/client/ProfilClient.js
import React, { useState, useEffect } from "react";

export default function ProfilClient({ user, onUpdateUser }) {
  const [name, setName] = useState(user.name || "");
  const [age, setAge] = useState(user.age || "");
  const [height, setHeight] = useState(user.height || "");
  const [weight, setWeight] = useState(user.weight || "");
  const [goal, setGoal] = useState(user.goal || "");

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("userData"));
    if (storedUser) {
      setName(storedUser.name || "");
      setAge(storedUser.age || "");
      setHeight(storedUser.height || "");
      setWeight(storedUser.weight || "");
      setGoal(storedUser.goal || "");
    }
  }, []);

  const handleSave = () => {
    const updatedUser = { name, age, height, weight, goal, history: user.history || [], pdfs: user.pdfs || [] };
    localStorage.setItem("userData", JSON.stringify(updatedUser));
    onUpdateUser(updatedUser);
    alert("Profil sauvegardé !");
  };

  return (
    <div className="container">
      <h2>Mon Profil</h2>
      <div className="card">
        <input type="text" placeholder="Nom" value={name} onChange={e => setName(e.target.value)} />
        <input type="number" placeholder="Âge" value={age} onChange={e => setAge(e.target.value)} />
        <input type="number" placeholder="Taille (cm)" value={height} onChange={e => setHeight(e.target.value)} />
        <input type="number" placeholder="Poids actuel (kg)" value={weight} onChange={e => setWeight(e.target.value)} />
        <input type="text" placeholder="Objectif" value={goal} onChange={e => setGoal(e.target.value)} />
        <button className="primary" onClick={handleSave}>Sauvegarder</button>
      </div>
    </div>
  );
}