import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import AddWeight from "../../components/AddWeight";
import GraphWeight from "../../components/GraphWeight";
import NotificationsPanel from "../../components/NotificationsPanel";
import { getMondayOfCurrentWeek } from "../../utils/mealPlanner";
import { calcBMR, calcDeficit, calcMacros, calcTDEE } from "../../utils/nutrition";
import { addPdfBranding } from "../../utils/pdfBranding";

function getScoreTone(score) {
  if (score >= 7.5) return "good";
  if (score >= 5) return "medium";
  return "low";
}

function toDatetimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - timezoneOffset);
  return local.toISOString().slice(0, 16);
}

function nextWeeklySlotLocal() {
  const now = new Date();
  now.setDate(now.getDate() + 2);
  now.setHours(10, 0, 0, 0);
  return toDatetimeLocalValue(now.toISOString());
}

function isWithinCoachAvailability(startDate, endDate) {
  const day = startDate.getDay();
  const allowedDays = new Set([1, 2, 4, 5, 6]); // lun, mar, jeu, ven, sam
  if (!allowedDays.has(day)) return false;
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
  return startMinutes >= 9 * 60 + 30 && endMinutes <= 20 * 60 && endDate > startDate;
}

export default function DashboardClient({
  user,
  subscription,
  history,
  reports,
  clientPhotos,
  weeklyCheckins,
  weeklyGoals,
  appointments,
  busyAppointmentSlots,
  notifications,
  busy,
  onSaveProfile,
  onAddWeight,
  onUploadPhoto,
  onSaveWeeklyCheckin,
  onUpdateWeeklyGoalsProgress,
  onBookAppointment,
  onManageSubscription,
  onMarkNotificationRead,
  onDeleteNotification,
  onDeletePhoto,
  onCancelAppointment
}) {
  const [profile, setProfile] = useState({
    name: user.name,
    age: user.age,
    sex: user.sex,
    height: user.height,
    weight: user.weight,
    goal: user.goal
  });

  useEffect(() => {
    setProfile({
      name: user.name,
      age: user.age,
      sex: user.sex,
      height: user.height,
      weight: user.weight,
      goal: user.goal
    });
  }, [user]);

  const bilan = useMemo(() => {
    const bmr = calcBMR(
      Number(profile.weight),
      Number(profile.height),
      Number(profile.age),
      profile.sex,
      user.bmrMethod
    );
    const tdee = calcTDEE(bmr, Number(user.nap));
    const deficitCalories = calcDeficit(tdee, user.deficit || 20);
    const macros = calcMacros(Number(profile.weight), deficitCalories);

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      deficitCalories: Math.round(deficitCalories),
      macros
    };
  }, [profile, user.bmrMethod, user.nap, user.deficit]);

  const saveProfile = async () => {
    await onSaveProfile(profile);
    setOpenSections((prev) => ({ ...prev, profile: false }));
  };

  const [photoFile, setPhotoFile] = useState(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [checkin, setCheckin] = useState({
    weekStart: getMondayOfCurrentWeek(),
    energy: 7,
    hunger: 6,
    sleep: 7,
    stress: 5,
    adherence: 7,
    notes: ""
  });
  const [selectedGoalsWeek, setSelectedGoalsWeek] = useState("");
  const [appointmentDraft, setAppointmentDraft] = useState({
    startsAt: nextWeeklySlotLocal(),
    durationMinutes: 45,
    notes: ""
  });
  const [openSections, setOpenSections] = useState({
    profile: true,
    billing: true,
    weight: true,
    nutrition: true,
    reports: false,
    checkins: true,
    photos: false,
    appointments: true,
    goals: true
  });

  useEffect(() => {
    if (!weeklyGoals?.length) {
      setSelectedGoalsWeek("");
      return;
    }
    setSelectedGoalsWeek(weeklyGoals[0].weekStart);
  }, [weeklyGoals]);

  const selectedGoals = useMemo(() => {
    if (!weeklyGoals?.length) return null;
    return weeklyGoals.find((entry) => entry.weekStart === selectedGoalsWeek) || weeklyGoals[0];
  }, [weeklyGoals, selectedGoalsWeek]);

  useEffect(() => {
    const currentWeek = getMondayOfCurrentWeek();
    const existing = (weeklyCheckins || []).find((entry) => entry.weekStart === currentWeek);
    if (existing) {
      setCheckin({
        weekStart: existing.weekStart,
        energy: existing.energy,
        hunger: existing.hunger,
        sleep: existing.sleep,
        stress: existing.stress,
        adherence: existing.adherence,
        notes: existing.notes || ""
      });
      return;
    }

    setCheckin((prev) => ({
      ...prev,
      weekStart: currentWeek
    }));
  }, [weeklyCheckins]);

  const checkinScore = useMemo(() => {
    const values = [checkin.energy, checkin.hunger, checkin.sleep, checkin.stress, checkin.adherence].map(Number);
    return (values.reduce((acc, current) => acc + current, 0) / values.length).toFixed(1);
  }, [checkin]);

  const myAppointments = useMemo(
    () =>
      (appointments || [])
        .slice()
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments]
  );

  const takenSlotKeys = useMemo(
    () => new Set((busyAppointmentSlots || []).map((slot) => toDatetimeLocalValue(slot.startsAt)).filter(Boolean)),
    [busyAppointmentSlots]
  );

  const selectedSlotIsTaken = Boolean(
    appointmentDraft.startsAt && takenSlotKeys.has(appointmentDraft.startsAt)
  );

  const upcomingTakenSlots = useMemo(
    () =>
      (busyAppointmentSlots || [])
        .slice()
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .slice(0, 8),
    [busyAppointmentSlots]
  );

  const downloadReport = async (report) => {
    const doc = new jsPDF();
    const contentStartY = await addPdfBranding(doc);
    const offset = contentStartY - 20;
    doc.setFontSize(17);
    doc.text(`Bilan nutritionnel - ${user.name}`, 14, 20 + offset);
    doc.setFontSize(12);
    doc.text(`Date: ${report.date}`, 14, 36 + offset);
    doc.text(`Message coach: ${report.message || "-"}`, 14, 48 + offset, { maxWidth: 180 });
    doc.text(`BMR: ${report.bilan.bmr} kcal`, 14, 68 + offset);
    doc.text(`TDEE: ${report.bilan.tdee} kcal`, 14, 78 + offset);
    doc.text(`Calories cible: ${report.bilan.deficitCalories} kcal`, 14, 88 + offset);
    doc.text(
      `Macros: Proteines ${report.bilan.macros.protein}g / Lipides ${report.bilan.macros.fat}g / Glucides ${report.bilan.macros.carbs}g`,
      14,
      98 + offset
    );
    doc.save(`bilan-${user.name}-${report.date}.pdf`);
  };

  const uploadPhoto = async () => {
    if (!photoFile) return;
    await onUploadPhoto({ file: photoFile, caption: photoCaption });
    setPhotoFile(null);
    setPhotoCaption("");
  };

  const saveCheckin = async () => {
    await onSaveWeeklyCheckin({
      weekStart: checkin.weekStart,
      energy: checkin.energy,
      hunger: checkin.hunger,
      sleep: checkin.sleep,
      stress: checkin.stress,
      adherence: checkin.adherence,
      notes: checkin.notes
    });
  };

  const toggleGoal = async (index) => {
    if (!selectedGoals) return;
    const nextGoals = selectedGoals.goals.map((goal, goalIndex) =>
      goalIndex === index ? { ...goal, done: !goal.done } : goal
    );
    await onUpdateWeeklyGoalsProgress({
      weekStart: selectedGoals.weekStart,
      goals: nextGoals
    });
  };

  const submitAppointment = async () => {
    if (!appointmentDraft.startsAt) return;
    if (selectedSlotIsTaken) return;
    const startsAtDate = new Date(appointmentDraft.startsAt);
    if (Number.isNaN(startsAtDate.getTime())) return;
    const duration = Number(appointmentDraft.durationMinutes) || 45;
    const endsAtDate = new Date(startsAtDate.getTime() + duration * 60000);
    if (!isWithinCoachAvailability(startsAtDate, endsAtDate)) {
      return;
    }

    await onBookAppointment({
      startsAt: startsAtDate.toISOString(),
      endsAt: endsAtDate.toISOString(),
      notes: appointmentDraft.notes
    });
  };

  const toggleSection = (sectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const subscriptionStatus = (subscription?.status || "inactive").toLowerCase();
  const subscriptionStatusLabel = {
    active: "Actif",
    trialing: "Essai en cours",
    past_due: "Paiement en retard",
    canceled: "Resilie",
    unpaid: "Impayee",
    incomplete: "Incomplet",
    incomplete_expired: "Expire",
    paused: "En pause",
    inactive: "Inactif"
  }[subscriptionStatus] || subscriptionStatus;
  const subscriptionEndLabel = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="dashboard-grid">
      <NotificationsPanel
        items={notifications}
        busy={busy}
        onMarkRead={onMarkNotificationRead}
        onDelete={onDeleteNotification}
        title="Mes notifications"
      />

      <section className="panel panel-highlight accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("profile")}>
          <div>
            <p className="eyebrow">Profil</p>
            <h3>{user.name}</h3>
          </div>
          <span>{openSections.profile ? "−" : "+"}</span>
        </button>
        {openSections.profile ? (
          <div className="accordion-content">
            <div className="form-grid">
              <label>
                Nom
                <input
                  type="text"
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                />
              </label>
              <label>
                Age
                <input
                  type="number"
                  value={profile.age}
                  onChange={(event) => setProfile({ ...profile, age: Number(event.target.value) })}
                />
              </label>
              <label>
                Sexe
                <select
                  value={profile.sex}
                  onChange={(event) => setProfile({ ...profile, sex: event.target.value })}
                >
                  <option value="male">Homme</option>
                  <option value="female">Femme</option>
                </select>
              </label>
              <label>
                Taille (cm)
                <input
                  type="number"
                  value={profile.height}
                  onChange={(event) => setProfile({ ...profile, height: Number(event.target.value) })}
                />
              </label>
              <label>
                Poids (kg)
                <input
                  type="number"
                  value={profile.weight}
                  onChange={(event) => setProfile({ ...profile, weight: Number(event.target.value) })}
                />
              </label>
              <label>
                Objectif
                <input
                  type="text"
                  value={profile.goal}
                  onChange={(event) => setProfile({ ...profile, goal: event.target.value })}
                />
              </label>
            </div>

            <button className="primary" type="button" disabled={busy} onClick={saveProfile}>
              Enregistrer le profil
            </button>
          </div>
        ) : (
          <div className="accordion-content">
            <p>
              Profil enregistre: {profile.name}, {profile.age} ans, {profile.weight} kg, objectif "{profile.goal || "-"}".
            </p>
            <button
              className="ghost"
              type="button"
              disabled={busy}
              onClick={() => setOpenSections((prev) => ({ ...prev, profile: true }))}
            >
              Modifier
            </button>
          </div>
        )}
      </section>

      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("billing")}>
          <strong>Facturation</strong>
          <span>{openSections.billing ? "−" : "+"}</span>
        </button>
        {openSections.billing ? (
          <div className="accordion-content">
            <div className="row-between">
              <span>Statut abonnement</span>
              <strong className={`score-chip tone-${subscriptionStatus === "active" || subscriptionStatus === "trialing" ? "good" : subscriptionStatus === "past_due" ? "medium" : "low"}`}>
                {subscriptionStatusLabel}
              </strong>
            </div>
            {subscriptionEndLabel ? (
              <p>
                <strong>Prochaine echeance:</strong> {subscriptionEndLabel}
              </p>
            ) : (
              <p>Prochaine echeance indisponible pour le moment.</p>
            )}
            <button className="primary" type="button" disabled={busy} onClick={onManageSubscription}>
              Gerer l'abonnement
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("weight")}>
          <strong>Suivi du poids</strong>
          <span>{openSections.weight ? "−" : "+"}</span>
        </button>
        {openSections.weight ? (
          <div className="accordion-content">
            <AddWeight busy={busy} onAdd={onAddWeight} />
            {history.length > 0 ? <GraphWeight data={history} /> : <p>Aucune mesure enregistree.</p>}
          </div>
        ) : null}
      </section>

      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("nutrition")}>
          <strong>Bilan nutrition</strong>
          <span>{openSections.nutrition ? "−" : "+"}</span>
        </button>
        {openSections.nutrition ? (
          <div className="accordion-content">
            <div className="metric-grid">
              <article>
                <small>BMR</small>
                <p>{bilan.bmr} kcal</p>
              </article>
              <article>
                <small>TDEE</small>
                <p>{bilan.tdee} kcal</p>
              </article>
              <article>
                <small>Calories cible</small>
                <p>{bilan.deficitCalories} kcal</p>
              </article>
            </div>
            <p className="macro-line">
              Macros: Proteines {bilan.macros.protein}g / Lipides {bilan.macros.fat}g / Glucides {bilan.macros.carbs}g
            </p>
            <p>
              <strong>Message coach:</strong> {user.coachMessage || "Aucun message."}
            </p>
          </div>
        ) : null}
      </section>

      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("reports")}>
          <strong>Bilans recus</strong>
          <span>{openSections.reports ? "−" : "+"}</span>
        </button>
        {openSections.reports ? (
          <div className="accordion-content">
            {reports.length === 0 ? <p>Aucun bilan disponible.</p> : null}
            <ul className="simple-list">
              {reports.map((report) => (
                <li key={report.id} className="row-between">
                  <span>{report.date}</span>
                  <button className="ghost" type="button" onClick={() => downloadReport(report)}>
                    PDF
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("checkins")}>
          <strong>Check-in hebdomadaire</strong>
          <span>{openSections.checkins ? "−" : "+"}</span>
        </button>
        {openSections.checkins ? (
          <div className="accordion-content">
            <div className="checkin-grid">
              <label>
                Semaine (lundi)
                <input
                  type="date"
                  value={checkin.weekStart}
                  onChange={(event) => setCheckin({ ...checkin, weekStart: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label>
                Energie (1-10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={checkin.energy}
                  onChange={(event) => setCheckin({ ...checkin, energy: Number(event.target.value) })}
                  disabled={busy}
                />
              </label>
              <label>
                Faim (1-10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={checkin.hunger}
                  onChange={(event) => setCheckin({ ...checkin, hunger: Number(event.target.value) })}
                  disabled={busy}
                />
              </label>
              <label>
                Sommeil (1-10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={checkin.sleep}
                  onChange={(event) => setCheckin({ ...checkin, sleep: Number(event.target.value) })}
                  disabled={busy}
                />
              </label>
              <label>
                Stress (1-10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={checkin.stress}
                  onChange={(event) => setCheckin({ ...checkin, stress: Number(event.target.value) })}
                  disabled={busy}
                />
              </label>
              <label>
                Adherence (1-10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={checkin.adherence}
                  onChange={(event) => setCheckin({ ...checkin, adherence: Number(event.target.value) })}
                  disabled={busy}
                />
              </label>
              <label className="checkin-notes">
                Notes
                <textarea
                  value={checkin.notes}
                  onChange={(event) => setCheckin({ ...checkin, notes: event.target.value })}
                  placeholder="Ressenti de la semaine, ecarts, energie..."
                />
              </label>
            </div>
            <p className={`checkin-score tone-${getScoreTone(Number(checkinScore))}`}>Score global: {checkinScore}/10</p>
            <button className="primary" type="button" disabled={busy} onClick={saveCheckin}>
              Envoyer check-in
            </button>

            <ul className="simple-list">
              {(weeklyCheckins || []).slice(0, 6).map((entry) => (
                <li key={entry.id} className="row-between">
                  <span>{entry.weekStart}</span>
                  <strong className={`score-chip tone-${getScoreTone(entry.score)}`}>{entry.score}/10</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("photos")}>
          <strong>Photos pour le coach</strong>
          <span>{openSections.photos ? "−" : "+"}</span>
        </button>
        {openSections.photos ? (
          <div className="accordion-content">
            <label>
              Ajouter une photo de progression
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                disabled={busy}
              />
            </label>
            <label>
              Commentaire (optionnel)
              <input
                type="text"
                value={photoCaption}
                onChange={(event) => setPhotoCaption(event.target.value)}
                placeholder="Ex: check du vendredi"
                disabled={busy}
              />
            </label>
            <button className="primary" type="button" disabled={busy || !photoFile} onClick={uploadPhoto}>
              Envoyer la photo
            </button>

            <div className="photo-grid">
              {(clientPhotos || []).map((photo) => (
                <figure key={photo.id} className="photo-card">
                  <img src={photo.imageUrl} alt="Progression client" loading="lazy" decoding="async" />
                  <figcaption>
                    <small>{new Date(photo.createdAt).toLocaleDateString()}</small>
                    {photo.caption ? <p>{photo.caption}</p> : null}
                    <button
                      className="danger"
                      type="button"
                      disabled={busy}
                      onClick={() => onDeletePhoto(photo.id)}
                    >
                      Supprimer
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("appointments")}>
          <strong>Rendez-vous visio</strong>
          <span>{openSections.appointments ? "−" : "+"}</span>
        </button>
        {openSections.appointments ? (
          <div className="accordion-content">
            <p className="info-text">Tu peux reserver un seul rendez-vous par semaine. Les creneaux deja pris ne sont pas disponibles.</p>
            <div className="section-block">
              <label>
                Date et heure
                <input
                  type="datetime-local"
                  value={appointmentDraft.startsAt}
                  onChange={(event) =>
                    setAppointmentDraft((prev) => ({ ...prev, startsAt: event.target.value }))
                  }
                  disabled={busy}
                />
              </label>
              <label>
                Duree
                <select
                  value={appointmentDraft.durationMinutes}
                  onChange={(event) =>
                    setAppointmentDraft((prev) => ({
                      ...prev,
                      durationMinutes: Number(event.target.value)
                    }))
                  }
                  disabled={busy}
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </label>
              <label>
                Notes pour le coach
                <textarea
                  value={appointmentDraft.notes}
                  onChange={(event) =>
                    setAppointmentDraft((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="Ex: points a aborder"
                  disabled={busy}
                />
              </label>
              <button className="primary" type="button" disabled={busy || selectedSlotIsTaken} onClick={submitAppointment}>
                Prendre rendez-vous
              </button>
              {selectedSlotIsTaken ? (
                <p className="error-text">Ce creneau est deja reserve. Choisis un autre horaire.</p>
              ) : null}
              {appointmentDraft.startsAt ? (
                (() => {
                  const start = new Date(appointmentDraft.startsAt);
                  const end = new Date(start.getTime() + (Number(appointmentDraft.durationMinutes) || 45) * 60000);
                  if (Number.isNaN(start.getTime()) || isWithinCoachAvailability(start, end)) return null;
                  return <p className="error-text">Disponibilites: lun, mar, jeu, ven, sam de 09:30 a 20:00.</p>;
                })()
              ) : null}
            </div>

            {upcomingTakenSlots.length ? (
              <div className="appointment-slot-list">
                <strong>Creneaux deja pris</strong>
                <ul className="simple-list">
                  {upcomingTakenSlots.map((slot) => (
                    <li key={`${slot.startsAt}-${slot.endsAt}`} className="row-between">
                      <span>{new Date(slot.startsAt).toLocaleString()}</span>
                      <small>occupe</small>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {myAppointments.length === 0 ? <p>Aucun rendez-vous programme.</p> : null}
            <div className="checkin-list">
              {myAppointments.map((appointment) => (
                <article key={appointment.id} className="checkin-item">
                  <div className="row-between">
                    <strong>{new Date(appointment.startsAt).toLocaleString()}</strong>
                    <span className={`score-chip tone-${appointment.status === "confirmed" ? "good" : appointment.status === "cancelled" ? "low" : "medium"}`}>
                      {appointment.status}
                    </span>
                  </div>
                  {appointment.notes ? <p>{appointment.notes}</p> : null}
                  <div className="row-actions">
                    {appointment.meetUrl ? (
                      <a className="primary-link" href={appointment.meetUrl} target="_blank" rel="noreferrer">
                        Rejoindre Google Meet
                      </a>
                    ) : (
                      <small>Lien visio en attente de confirmation coach</small>
                    )}
                    {appointment.status !== "cancelled" ? (
                      <button
                        className="danger"
                        type="button"
                        disabled={busy}
                        onClick={() => onCancelAppointment(appointment.id)}
                      >
                        Annuler
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel panel-highlight accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("goals")}>
          <strong>Objectifs hebdomadaires</strong>
          <span>{openSections.goals ? "−" : "+"}</span>
        </button>
        {openSections.goals ? (
          <div className="accordion-content">
            <div className="row-between">
              <span />
              {weeklyGoals?.length ? (
                <select
                  className="menu-week-select"
                  value={selectedGoals?.weekStart || ""}
                  onChange={(event) => setSelectedGoalsWeek(event.target.value)}
                >
                  {weeklyGoals.map((entry) => (
                    <option key={entry.id} value={entry.weekStart}>
                      Semaine du {entry.weekStart}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {!selectedGoals ? (
              <p>Aucun objectif defini par ton coach.</p>
            ) : (
              <ul className="simple-list">
                {selectedGoals.goals?.map((goal, index) => (
                  <li key={`${selectedGoals.id}-${index}`} className="goal-row">
                    <label className="goal-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(goal.done)}
                        onChange={() => toggleGoal(index)}
                        disabled={busy}
                      />
                      <span>
                        <strong>{goal.title || "Objectif"}</strong>
                        {goal.target ? <small>{goal.target}</small> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

    </div>
  );
}
