import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import AddWeight from "../../components/AddWeight";
import ChatThread from "../../components/ChatThread";
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

const CHECKIN_METRICS = [
  { key: "energy", label: "Energie", hint: "Ton niveau de forme global." },
  { key: "hunger", label: "Faim", hint: "Comment tu as ressenti la faim." },
  { key: "sleep", label: "Sommeil", hint: "Qualite de ton sommeil cette semaine." },
  { key: "stress", label: "Stress", hint: "Ton niveau de stress global." },
  { key: "adherence", label: "Adherence", hint: "Respect du plan nutrition." }
];

export default function DashboardClient({
  user,
  subscription,
  history,
  reports,
  clientPhotos,
  weeklyCheckins,
  weeklyGoals,
  chatMessages,
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
  onRescheduleAppointment,
  onManageSubscription,
  onMarkNotificationRead,
  onDeleteNotification,
  onDeletePhoto,
  onCancelAppointment,
  onSendChatMessage,
  onMarkChatRead,
  onDeleteChatHistory,
  visibleSections
}) {
  const visibleSectionSet = useMemo(() => {
    if (!Array.isArray(visibleSections) || visibleSections.length === 0) return null;
    return new Set(visibleSections);
  }, [visibleSections]);

  const isSectionVisible = (sectionKey) => {
    if (!visibleSectionSet) return true;
    return visibleSectionSet.has(sectionKey);
  };
  const appointmentsVisible = isSectionVisible("appointments");

  const [profile, setProfile] = useState({
    name: user.name,
    age: user.age,
    sex: user.sex,
    height: user.height,
    weight: user.weight,
    waistCm: user.waistCm ?? "",
    hipCm: user.hipCm ?? "",
    chestCm: user.chestCm ?? "",
    armCm: user.armCm ?? "",
    thighCm: user.thighCm ?? "",
    goal: user.goal
  });

  useEffect(() => {
    setProfile({
      name: user.name,
      age: user.age,
      sex: user.sex,
      height: user.height,
      weight: user.weight,
      waistCm: user.waistCm ?? "",
      hipCm: user.hipCm ?? "",
      chestCm: user.chestCm ?? "",
      armCm: user.armCm ?? "",
      thighCm: user.thighCm ?? "",
      goal: user.goal
    });
  }, [user]);

  const bilan = useMemo(() => {
    const weight = Number(profile.weight);
    const height = Number(profile.height);
    const bmr = calcBMR(
      weight,
      height,
      Number(profile.age),
      profile.sex,
      user.bmrMethod
    );
    const tdee = calcTDEE(bmr, Number(user.nap));
    const deficitCalories = calcDeficit(tdee, user.deficit || 20);
    const macros = calcMacros(weight, deficitCalories);
    const bmi = height > 0 ? weight / ((height / 100) ** 2) : null;

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      deficitCalories: Math.round(deficitCalories),
      macros,
      bmi: Number.isFinite(bmi) ? Number(bmi.toFixed(1)) : null
    };
  }, [profile, user.bmrMethod, user.nap, user.deficit]);

  const saveProfile = async () => {
    await onSaveProfile(profile);
    setOpenSections((prev) => ({ ...prev, profile: false }));
  };

  const [photoFile, setPhotoFile] = useState(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [checkin, setCheckin] = useState({
    weekStart: getMondayOfCurrentWeek(),
    energy: 7,
    hunger: 6,
    sleep: 7,
    stress: 5,
    adherence: 7,
    notes: ""
  });
  const [checkinStepIndex, setCheckinStepIndex] = useState(0);
  const [selectedGoalsWeek, setSelectedGoalsWeek] = useState("");
  const [appointmentDraft, setAppointmentDraft] = useState({
    appointmentId: "",
    startsAt: nextWeeklySlotLocal(),
    durationMinutes: 45,
    notes: ""
  });
  const [openSections, setOpenSections] = useState({
    profile: false,
    billing: true,
    weight: true,
    nutrition: false,
    reports: false,
    checkins: true,
    photos: false,
    messages: true,
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

  useEffect(() => {
    if (!visibleSectionSet) return;
    const messagingOnly =
      visibleSectionSet.has("messages") &&
      visibleSectionSet.has("photos") &&
      visibleSectionSet.has("reports") &&
      visibleSectionSet.size === 3;
    if (!messagingOnly) return;
    setOpenSections((prev) => ({
      ...prev,
      messages: true,
      photos: true,
      reports: true
    }));
  }, [visibleSectionSet]);

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
  const myChatMessages = useMemo(() => (Array.isArray(chatMessages) ? chatMessages : []), [chatMessages]);
  const unreadNotificationsCount = useMemo(
    () => (Array.isArray(notifications) ? notifications.filter((item) => !item.readAt).length : 0),
    [notifications]
  );
  const latestWeightEntry = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return null;
    const sorted = [...history].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    return sorted[sorted.length - 1] || null;
  }, [history]);
  const nextAppointment = useMemo(() => {
    const now = Date.now();
    return myAppointments.find(
      (entry) => entry.status !== "cancelled" && new Date(entry.startsAt).getTime() >= now
    ) || null;
  }, [myAppointments]);

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
    const sessionNotes = report?.bilan?.sessionNotes || report?.message || "";
    const objectives = report?.bilan?.objectives || "";
    const menuSummary = report?.bilan?.menuSummary?.text || "";
    const progress = report?.bilan?.progress || null;
    const mensurations = report?.bilan?.mensurations || null;
    doc.setFontSize(17);
    doc.text(`Bilan nutritionnel - ${user.name}`, 14, 20 + offset);
    doc.setFontSize(12);
    doc.text(`Date: ${report.date}`, 14, 36 + offset);
    let y = 48 + offset;
    const writeSection = (title) => {
      doc.setFontSize(12);
      doc.text(title, 14, y);
      y += 7;
    };
    const writeWrapped = (label, value) => {
      const lines = doc.splitTextToSize(`${label}: ${value || "-"}`, 180);
      doc.text(lines, 14, y);
      y += 6 * lines.length + 2;
    };
    writeSection("Synthese seance");
    writeWrapped("Ce qu'on s'est dit", sessionNotes || "-");
    writeWrapped("Objectifs fixes", objectives || "-");
    writeWrapped("Menu donne", menuSummary || "-");
    writeSection("Progression");
    if (progress) {
      writeWrapped(
        "Progression",
        `${progress.firstWeight ?? "-"} kg -> ${progress.lastWeight ?? "-"} kg (delta ${
          progress.deltaWeight ?? "-"
        } kg), Check-in ${progress.latestCheckinScore ?? "-"} (${progress.latestCheckinWeek || "-"}), Objectifs ${
          progress.goalsDone ?? "-"
        }/${progress.goalsCount ?? "-"} (${progress.goalsWeek || "-"})`
      );
    }
    if (mensurations) {
      writeWrapped(
        "Mensurations (cm)",
        `Taille ${mensurations.waistCm ?? "-"} | Hanches ${mensurations.hipCm ?? "-"} | Poitrine ${
          mensurations.chestCm ?? "-"
        } | Bras ${mensurations.armCm ?? "-"} | Cuisse ${mensurations.thighCm ?? "-"}`
      );
    }
    writeSection("Repere nutrition");
    writeWrapped("BMR", `${report.bilan.bmr} kcal`);
    writeWrapped("TDEE", `${report.bilan.tdee} kcal`);
    writeWrapped("Calories cible", `${report.bilan.deficitCalories} kcal`);
    writeWrapped(
      "Macros",
      `Proteines ${report.bilan.macros.protein}g / Lipides ${report.bilan.macros.fat}g / Glucides ${report.bilan.macros.carbs}g`
    );
    doc.save(`bilan-${user.name}-${report.date}.pdf`);
  };

  const uploadPhoto = async () => {
    if (!photoFile) return;
    await onUploadPhoto({ file: photoFile, caption: photoCaption });
    setPhotoFile(null);
    setPhotoCaption("");
  };

  const openGalleryPicker = () => {
    if (busy) return;
    galleryInputRef.current?.click();
  };

  const openCameraPicker = () => {
    if (busy) return;
    cameraInputRef.current?.click();
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
  const checkinSteps = useMemo(
    () => [...CHECKIN_METRICS.map((metric) => ({ ...metric, type: "metric" })), { key: "notes", label: "Notes", type: "notes", hint: "Ton ressenti libre de la semaine." }],
    []
  );
  const activeCheckinStep = checkinSteps[Math.min(checkinStepIndex, checkinSteps.length - 1)];
  const isLastCheckinStep = checkinStepIndex >= checkinSteps.length - 1;
  const checkinProgress = Math.round(((checkinStepIndex + 1) / checkinSteps.length) * 100);

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

    if (appointmentDraft.appointmentId) {
      await onRescheduleAppointment({
        appointmentId: appointmentDraft.appointmentId,
        startsAt: startsAtDate.toISOString(),
        endsAt: endsAtDate.toISOString(),
        notes: appointmentDraft.notes
      });
    } else {
      await onBookAppointment({
        startsAt: startsAtDate.toISOString(),
        endsAt: endsAtDate.toISOString(),
        notes: appointmentDraft.notes
      });
    }
    setAppointmentDraft({
      appointmentId: "",
      startsAt: nextWeeklySlotLocal(),
      durationMinutes: 45,
      notes: ""
    });
  };

  const startReschedule = (appointment) => {
    const startLocal = toDatetimeLocalValue(appointment.startsAt);
    const durationMinutes = Math.max(
      15,
      Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000)
    );
    setAppointmentDraft({
      appointmentId: appointment.id,
      startsAt: startLocal || nextWeeklySlotLocal(),
      durationMinutes,
      notes: appointment.notes || ""
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
      {!visibleSectionSet || ["profile", "weight", "nutrition", "checkins"].some((key) => visibleSectionSet.has(key)) ? (
        <section className="panel panel-highlight overview-panel">
          <div className="row-between">
            <div>
              <p className="eyebrow">Vue d'ensemble</p>
              <h3>Ton suivi en un coup d'oeil</h3>
            </div>
          </div>
          <div className="overview-grid">
            {appointmentsVisible ? (
              <article className="overview-card">
                <small>Prochain rendez-vous</small>
                <strong>{nextAppointment ? new Date(nextAppointment.startsAt).toLocaleDateString() : "A planifier"}</strong>
                <p>{nextAppointment ? new Date(nextAppointment.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Aucun creneau reserve"}</p>
              </article>
            ) : null}
            <article className="overview-card">
              <small>Dernier poids</small>
              <strong>{latestWeightEntry ? `${Number(latestWeightEntry.weight).toFixed(1)} kg` : "A renseigner"}</strong>
              <p>{latestWeightEntry?.date || "Pas encore de mesure"}</p>
            </article>
            <article className="overview-card">
              <small>Mes reperes nutrition</small>
              <strong>{bilan.deficitCalories} kcal</strong>
              <p>IMC {bilan.bmi ?? "—"} • BMR {bilan.bmr} • TDEE {bilan.tdee}</p>
              <p>Deficit coach: {Number(user.deficit || 20)}%</p>
              <p>P {bilan.macros.protein}g • L {bilan.macros.fat}g • G {bilan.macros.carbs}g</p>
            </article>
            <article className="overview-card">
              <small>Notifications</small>
              <strong>{unreadNotificationsCount}</strong>
              <p>{unreadNotificationsCount ? "non lue(s)" : "Tout est a jour"}</p>
            </article>
          </div>
        </section>
      ) : null}

      {isSectionVisible("notifications") ? (
        <NotificationsPanel
          items={notifications}
          busy={busy}
          onMarkRead={onMarkNotificationRead}
          onDelete={onDeleteNotification}
          title="Mes notifications"
        />
      ) : null}

      {isSectionVisible("profile") ? (
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
              <label>
                Tour de taille (cm)
                <input
                  type="number"
                  value={profile.waistCm}
                  onChange={(event) => setProfile({ ...profile, waistCm: event.target.value })}
                />
              </label>
              <label>
                Tour de hanches (cm)
                <input
                  type="number"
                  value={profile.hipCm}
                  onChange={(event) => setProfile({ ...profile, hipCm: event.target.value })}
                />
              </label>
              <label>
                Tour de poitrine (cm)
                <input
                  type="number"
                  value={profile.chestCm}
                  onChange={(event) => setProfile({ ...profile, chestCm: event.target.value })}
                />
              </label>
              <label>
                Tour de bras (cm)
                <input
                  type="number"
                  value={profile.armCm}
                  onChange={(event) => setProfile({ ...profile, armCm: event.target.value })}
                />
              </label>
              <label>
                Tour de cuisse (cm)
                <input
                  type="number"
                  value={profile.thighCm}
                  onChange={(event) => setProfile({ ...profile, thighCm: event.target.value })}
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
            <p>
              Mensurations: taille {profile.waistCm || "-"} cm, hanches {profile.hipCm || "-"} cm, poitrine {profile.chestCm || "-"} cm.
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
      ) : null}

      {isSectionVisible("billing") ? (
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
      ) : null}

      {isSectionVisible("weight") ? (
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
      ) : null}

      {isSectionVisible("reports") ? (
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
      ) : null}

      {isSectionVisible("checkins") ? (
      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("checkins")}>
          <strong>Check-in hebdomadaire</strong>
          <span>{openSections.checkins ? "−" : "+"}</span>
        </button>
        {openSections.checkins ? (
          <div className="accordion-content">
            <div className="section-block">
              <label>
                Semaine (lundi)
                <input
                  type="date"
                  value={checkin.weekStart}
                  onChange={(event) => setCheckin({ ...checkin, weekStart: event.target.value })}
                  disabled={busy}
                />
              </label>
            </div>
            <div className="section-block checkin-wizard">
              <div className="row-between">
                <strong>{activeCheckinStep.label}</strong>
                <small>{checkinStepIndex + 1}/{checkinSteps.length}</small>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div className="progress-track-fill" style={{ width: `${checkinProgress}%` }} />
              </div>
              <p className="info-text">{activeCheckinStep.hint}</p>
              {activeCheckinStep.type === "metric" ? (
                <label>
                  Note (1-10)
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={Number(checkin[activeCheckinStep.key]) || 1}
                    onChange={(event) => setCheckin({ ...checkin, [activeCheckinStep.key]: Number(event.target.value) })}
                    disabled={busy}
                  />
                  <strong>{Number(checkin[activeCheckinStep.key]) || 1}/10</strong>
                </label>
              ) : (
                <label className="checkin-notes">
                  Notes
                  <textarea
                    value={checkin.notes}
                    onChange={(event) => setCheckin({ ...checkin, notes: event.target.value })}
                    placeholder="Ressenti de la semaine, ecarts, energie..."
                    disabled={busy}
                  />
                </label>
              )}
              <div className="row-actions">
                <button
                  className="ghost"
                  type="button"
                  disabled={busy || checkinStepIndex === 0}
                  onClick={() => setCheckinStepIndex((prev) => Math.max(0, prev - 1))}
                >
                  Precedent
                </button>
                <button
                  className="ghost"
                  type="button"
                  disabled={busy || isLastCheckinStep}
                  onClick={() => setCheckinStepIndex((prev) => Math.min(checkinSteps.length - 1, prev + 1))}
                >
                  Suivant
                </button>
              </div>
            </div>
            <p className={`checkin-score tone-${getScoreTone(Number(checkinScore))}`}>Score global: {checkinScore}/10</p>
            <button className="primary" type="button" disabled={busy || !isLastCheckinStep} onClick={saveCheckin}>
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
      ) : null}

      {isSectionVisible("photos") ? (
      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("photos")}>
          <strong>Photos pour le coach</strong>
          <span>{openSections.photos ? "−" : "+"}</span>
        </button>
        {openSections.photos ? (
          <div className="accordion-content">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
              disabled={busy}
              style={{ display: "none" }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
              disabled={busy}
              style={{ display: "none" }}
            />
            <div className="photo-upload-actions">
              <button className="ghost" type="button" disabled={busy} onClick={openCameraPicker}>
                Prendre une photo
              </button>
              <button className="ghost" type="button" disabled={busy} onClick={openGalleryPicker}>
                Choisir depuis la galerie
              </button>
            </div>
            {photoFile ? <p className="info-text">Photo selectionnee: {photoFile.name}</p> : null}
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
      ) : null}

      {isSectionVisible("messages") ? (
      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("messages")}>
          <strong>Messagerie coach</strong>
          <span>{openSections.messages ? "−" : "+"}</span>
        </button>
        {openSections.messages ? (
          <div className="accordion-content">
            <ChatThread
              title="Conversation"
              currentUserId={user.id}
              messages={myChatMessages}
              busy={busy}
              placeholder="Ecris ton message pour ton coach..."
              onSend={(message) => onSendChatMessage?.({ clientId: user.id, message })}
              onMarkRead={() => onMarkChatRead?.(user.id)}
              onDeleteHistory={() => onDeleteChatHistory?.(user.id)}
            />
          </div>
        ) : null}
      </section>
      ) : null}

      {isSectionVisible("appointments") ? (
      <section className="panel accordion-block">
        <button className="accordion-toggle" type="button" onClick={() => toggleSection("appointments")}>
          <strong>Rendez-vous visio</strong>
          <span>{openSections.appointments ? "−" : "+"}</span>
        </button>
        {openSections.appointments ? (
          <div className="accordion-content">
            <p className="info-text">Tu peux reserver un seul rendez-vous par semaine. Les creneaux deja pris ne sont pas disponibles.</p>
            <div className="section-block">
              {appointmentDraft.appointmentId ? (
                <p className="info-text">Mode replanification active. Choisis un nouveau creneau puis valide.</p>
              ) : null}
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
                {appointmentDraft.appointmentId ? "Valider la replanification" : "Prendre rendez-vous"}
              </button>
              {appointmentDraft.appointmentId ? (
                <button
                  className="ghost"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setAppointmentDraft({
                      appointmentId: "",
                      startsAt: nextWeeklySlotLocal(),
                      durationMinutes: 45,
                      notes: ""
                    })
                  }
                >
                  Annuler la replanification
                </button>
              ) : null}
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
                        className="ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => startReschedule(appointment)}
                      >
                        Replanifier
                      </button>
                    ) : null}
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
      ) : null}

      {isSectionVisible("goals") ? (
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
      ) : null}

    </div>
  );
}
