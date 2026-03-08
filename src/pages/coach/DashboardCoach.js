import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import GraphWeight from "../../components/GraphWeight";
import MenuDay from "../../components/MenuDay";
import NotificationsPanel from "../../components/NotificationsPanel";
import { createEmptyWeeklyPlan, DAY_KEYS, getMondayOfCurrentWeek } from "../../utils/mealPlanner";
import { BMR_METHODS, calcBMR, calcDeficit, calcMacros, calcTDEE, getBmrMethodLabel } from "../../utils/nutrition";
import { addPdfBranding } from "../../utils/pdfBranding";

function getScoreTone(score) {
  if (Number(score) >= 7.5) return "good";
  if (Number(score) >= 5) return "medium";
  return "low";
}

function buildBilan(client) {
  const bmr = calcBMR(
    client.weight || 70,
    client.height || 170,
    client.age || 30,
    client.sex || "male",
    client.bmrMethod || "mifflin"
  );
  const tdee = calcTDEE(bmr, client.nap || 1.4);
  const deficitCalories = calcDeficit(tdee, client.deficit || 20);
  const macros = calcMacros(client.weight || 70, deficitCalories);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficitCalories: Math.round(deficitCalories),
    macros
  };
}

function getClientCardName(name) {
  if (!name) return "Client";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ");
}

function toDateKeyLocal(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartLocal(value) {
  const date = value instanceof Date ? new Date(value) : new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addMonthsLocal(value, months) {
  const date = monthStartLocal(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

export default function DashboardCoach({
  coach,
  clients,
  archivedClients,
  blogPosts,
  busy,
  onUpdateClientPlan,
  onCreateReport,
  onArchiveClient,
  onSaveWeeklyMenu,
  onSaveWeeklyGoals,
  onRestoreArchivedClient,
  notifications,
  onMarkNotificationRead,
  onDeleteNotification,
  onDeletePhoto,
  onUpdateAppointment,
  onCancelAppointment,
  onSaveBlogPost,
  onDeleteBlogPost,
  onUploadBlogCover
}) {
  const [messageByClientId, setMessageByClientId] = useState({});
  const [deficitByClientId, setDeficitByClientId] = useState({});
  const [napByClientId, setNapByClientId] = useState({});
  const [bmrMethodByClientId, setBmrMethodByClientId] = useState({});
  const [menuDraftByClientId, setMenuDraftByClientId] = useState({});
  const [goalsDraftByClientId, setGoalsDraftByClientId] = useState({});
  const [appointmentDraftByClientId, setAppointmentDraftByClientId] = useState({});
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeAppointmentClientId, setActiveAppointmentClientId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => monthStartLocal(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toDateKeyLocal(new Date()));
  const [coachView, setCoachView] = useState("clients");
  const [openSectionsByClientId, setOpenSectionsByClientId] = useState({});
  const [isCreatingBlogPost, setIsCreatingBlogPost] = useState(false);
  const [blogDraft, setBlogDraft] = useState({
    id: "",
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    category: "Astuces",
    readMinutes: 4,
    isPublished: true,
    coverImageUrl: ""
  });
  const [blogCoverFile, setBlogCoverFile] = useState(null);

  useEffect(() => {
    setMessageByClientId(
      Object.fromEntries(clients.map((client) => [client.id, client.coachMessage || ""]))
    );
    setDeficitByClientId(
      Object.fromEntries(clients.map((client) => [client.id, client.deficit ?? 20]))
    );
    setNapByClientId(
      Object.fromEntries(clients.map((client) => [client.id, client.nap ?? 1.4]))
    );
    setBmrMethodByClientId(
      Object.fromEntries(clients.map((client) => [client.id, client.bmrMethod || "mifflin"]))
    );

    const drafts = Object.fromEntries(
      clients.map((client) => {
        const latestMenu = client.weeklyMenus?.[0];
        return [
          client.id,
          latestMenu
            ? {
                weekStart: latestMenu.weekStart,
                notes: latestMenu.notes || "",
                plan: latestMenu.plan || createEmptyWeeklyPlan()
              }
            : {
                weekStart: getMondayOfCurrentWeek(),
                notes: "",
                plan: createEmptyWeeklyPlan()
              }
        ];
      })
    );
    setMenuDraftByClientId(drafts);

    const goalsDrafts = Object.fromEntries(
      clients.map((client) => {
        const latestGoals = client.goals?.[0];
        return [
          client.id,
          latestGoals
            ? { weekStart: latestGoals.weekStart, goals: latestGoals.goals || [] }
            : {
                weekStart: getMondayOfCurrentWeek(),
                goals: [
                  { title: "Objectif 1", target: "", done: false },
                  { title: "Objectif 2", target: "", done: false },
                  { title: "Objectif 3", target: "", done: false }
                ]
              }
        ];
      })
    );
    setGoalsDraftByClientId(goalsDrafts);

    if (clients.length === 0) {
      setSelectedClientId("");
      setActiveAppointmentClientId("");
    } else if (!clients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(clients[0].id);
    }

    if (activeAppointmentClientId && !clients.some((client) => client.id === activeAppointmentClientId)) {
      setActiveAppointmentClientId("");
    }

    setOpenSectionsByClientId((prev) => {
      const next = { ...prev };
      for (const client of clients) {
        if (!next[client.id]) {
          next[client.id] = {
            nutrition: true,
            goals: true,
            message: true,
            checkins: true,
            food: true,
            appointments: true,
            menu: false,
            photos: false
          };
        }
      }
      for (const clientId of Object.keys(next)) {
        if (!clients.some((client) => client.id === clientId)) {
          delete next[clientId];
        }
      }
      return next;
    });
  }, [clients, selectedClientId, activeAppointmentClientId]);

  useEffect(() => {
    if (!blogPosts?.length) {
      setBlogDraft((prev) => ({
        ...prev,
        id: "",
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        category: "Astuces",
        readMinutes: 4,
        isPublished: true,
        coverImageUrl: ""
      }));
      return;
    }

    if (!isCreatingBlogPost && (!blogDraft.id || !blogPosts.some((post) => post.id === blogDraft.id))) {
      const first = blogPosts[0];
      setBlogDraft({
        id: first.id,
        title: first.title || "",
        slug: first.slug || "",
        excerpt: first.excerpt || "",
        content: first.content || "",
        category: first.category || "Astuces",
        readMinutes: first.readMinutes || 4,
        isPublished: Boolean(first.isPublished),
        coverImageUrl: first.coverImageUrl || ""
      });
    }
  }, [blogPosts, blogDraft.id, isCreatingBlogPost]);

  const clientsWithBilan = useMemo(
    () => clients.map((client) => ({ ...client, bilan: buildBilan(client) })),
    [clients]
  );

  const selectedClient = useMemo(
    () => clientsWithBilan.find((client) => client.id === selectedClientId) || clientsWithBilan[0] || null,
    [clientsWithBilan, selectedClientId]
  );

  const selectedClientFoodByDay = useMemo(() => {
    if (!selectedClient?.foodLogs?.length) return [];
    const groups = new Map();
    for (const entry of selectedClient.foodLogs) {
      const key = entry.consumedOn;
      const current = groups.get(key) || [];
      current.push(entry);
      groups.set(key, current);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, entries]) => {
        const totals = entries.reduce(
          (acc, item) => {
            acc.calories += Number(item.calories || 0);
            acc.protein += Number(item.protein || 0);
            acc.carbs += Number(item.carbs || 0);
            acc.fat += Number(item.fat || 0);
            return acc;
          },
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
        return {
          day,
          entries: entries
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
          totals: {
            calories: Number(totals.calories.toFixed(0)),
            protein: Number(totals.protein.toFixed(1)),
            carbs: Number(totals.carbs.toFixed(1)),
            fat: Number(totals.fat.toFixed(1))
          }
        };
      });
  }, [selectedClient]);

  const selectedClientFoodWeek = useMemo(() => {
    if (!selectedClient?.foodLogs?.length) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const monday = new Date(getMondayOfCurrentWeek());
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const start = monday.getTime();
    const end = sunday.getTime();
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const entry of selectedClient.foodLogs) {
      const day = new Date(`${entry.consumedOn}T12:00:00`).getTime();
      if (day < start || day > end) continue;
      totals.calories += Number(entry.calories || 0);
      totals.protein += Number(entry.protein || 0);
      totals.carbs += Number(entry.carbs || 0);
      totals.fat += Number(entry.fat || 0);
    }
    return {
      calories: Number(totals.calories.toFixed(0)),
      protein: Number(totals.protein.toFixed(1)),
      carbs: Number(totals.carbs.toFixed(1)),
      fat: Number(totals.fat.toFixed(1))
    };
  }, [selectedClient]);

  const allAppointments = useMemo(
    () =>
      clientsWithBilan
        .flatMap((client) =>
          (client.appointments || []).map((appointment) => ({
            ...appointment,
            clientName: client.name,
            clientEmail: client.email,
            clientId: client.id
          }))
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [clientsWithBilan]
  );

  const activeAppointmentClient = useMemo(
    () => clientsWithBilan.find((client) => client.id === activeAppointmentClientId) || null,
    [clientsWithBilan, activeAppointmentClientId]
  );

  const appointmentsByDate = useMemo(() => {
    const map = new Map();
    for (const appointment of allAppointments) {
      const key = toDateKeyLocal(appointment.startsAt);
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(appointment);
      map.set(key, current);
    }
    return map;
  }, [allAppointments]);

  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    [calendarMonth]
  );

  const calendarCells = useMemo(() => {
    const start = monthStartLocal(calendarMonth);
    const year = start.getFullYear();
    const month = start.getMonth();
    const firstWeekday = (start.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];

    for (let i = firstWeekday - 1; i >= 0; i -= 1) {
      const day = daysInPrevMonth - i;
      const date = new Date(year, month - 1, day, 12, 0, 0, 0);
      cells.push({ dateKey: toDateKeyLocal(date), day, inMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12, 0, 0, 0);
      cells.push({ dateKey: toDateKeyLocal(date), day, inMonth: true });
    }

    let nextDay = 1;
    while (cells.length < 42) {
      const date = new Date(year, month + 1, nextDay, 12, 0, 0, 0);
      cells.push({ dateKey: toDateKeyLocal(date), day: nextDay, inMonth: false });
      nextDay += 1;
    }

    return cells;
  }, [calendarMonth]);

  const selectedDayAppointments = useMemo(
    () => appointmentsByDate.get(selectedCalendarDate) || [],
    [appointmentsByDate, selectedCalendarDate]
  );

  const saveDeficit = async (clientId) => {
    const rawValue = deficitByClientId[clientId];
    const deficit = Number(rawValue);
    if (Number.isNaN(deficit)) return;
    await onUpdateClientPlan(clientId, { deficit });
  };

  const saveMessage = async (client) => {
    await onUpdateClientPlan(client.id, {
      coachMessage: messageByClientId[client.id] || ""
    });
  };

  const saveMetabolicProfile = async (clientId) => {
    const nap = Number(napByClientId[clientId]);
    if (Number.isNaN(nap)) return;
    const bmrMethod = bmrMethodByClientId[clientId] || "mifflin";

    await onUpdateClientPlan(clientId, {
      nap,
      bmrMethod
    });
  };

  const createReport = async (client) => {
    const message = messageByClientId[client.id] || "";
    const bilan = buildBilan(client);

    await onCreateReport({
      clientId: client.id,
      message,
      bilan
    });

    const doc = new jsPDF();
    const contentStartY = await addPdfBranding(doc);
    const offset = contentStartY - 20;
    doc.setFontSize(17);
    doc.text(`Bilan coach - ${client.name}`, 14, 20 + offset);
    doc.setFontSize(12);
    doc.text(`Coach: ${coach.name}`, 14, 34 + offset);
    doc.text(`Objectif: ${client.goal || "-"}`, 14, 44 + offset);
    doc.text(`Poids: ${client.weight || "-"} kg`, 14, 54 + offset);
    doc.text(`Deficit: ${client.deficit || 20}%`, 14, 64 + offset);
    doc.text(`BMR: ${bilan.bmr} kcal`, 14, 74 + offset);
    doc.text(`TDEE: ${bilan.tdee} kcal`, 14, 84 + offset);
    doc.text(`Calories cible: ${bilan.deficitCalories} kcal`, 14, 94 + offset);
    doc.text(
      `Macros: Proteines ${bilan.macros.protein}g / Lipides ${bilan.macros.fat}g / Glucides ${bilan.macros.carbs}g`,
      14,
      104 + offset
    );
    doc.text(`Message: ${message || "-"}`, 14, 118 + offset, { maxWidth: 180 });
    doc.save(`bilan-coach-${client.name}.pdf`);
  };

  const archiveClient = async (client) => {
    const ok = window.confirm(
      `Archiver et supprimer ${client.name} ?\\nSes donnees seront conservees dans les archives.`
    );
    if (!ok) return;
    await onArchiveClient(client.id);
  };

  const setMenuDraft = (clientId, updater) => {
    setMenuDraftByClientId((prev) => {
      const current =
        prev[clientId] || {
          weekStart: getMondayOfCurrentWeek(),
          notes: "",
          plan: createEmptyWeeklyPlan()
        };
      return {
        ...prev,
        [clientId]: typeof updater === "function" ? updater(current) : updater
      };
    });
  };

  const updateMeal = (clientId, dayKey, mealKey, value) => {
    setMenuDraft(clientId, (draft) => ({
      ...draft,
      plan: {
        ...draft.plan,
        [dayKey]: {
          ...draft.plan[dayKey],
          [mealKey]: value
        }
      }
    }));
  };

  const saveWeeklyMenuForClient = async (client) => {
    const draft = menuDraftByClientId[client.id];
    if (!draft?.weekStart) return;
    await onSaveWeeklyMenu({
      clientId: client.id,
      weekStart: draft.weekStart,
      notes: draft.notes || "",
      plan: draft.plan || createEmptyWeeklyPlan()
    });
  };

  const updateGoal = (clientId, index, field, value) => {
    setGoalsDraftByClientId((prev) => {
      const current = prev[clientId] || { weekStart: getMondayOfCurrentWeek(), goals: [] };
      const goals = [...(current.goals || [])];
      const existing = goals[index] || { title: "", target: "", done: false };
      goals[index] = { ...existing, [field]: value };
      return {
        ...prev,
        [clientId]: {
          ...current,
          goals
        }
      };
    });
  };

  const saveWeeklyGoalsForClient = async (client) => {
    const draft = goalsDraftByClientId[client.id];
    if (!draft?.weekStart) return;
    await onSaveWeeklyGoals({
      clientId: client.id,
      weekStart: draft.weekStart,
      goals: draft.goals || []
    });
  };

  const loadAppointmentDraft = (clientId, appointment) => {
    if (!appointment) return;
    const starts = new Date(appointment.startsAt);
    const offset = starts.getTimezoneOffset() * 60000;
    const local = new Date(starts.getTime() - offset).toISOString().slice(0, 16);
    const duration = Math.max(15, Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000));
    setAppointmentDraftByClientId((prev) => ({
      ...prev,
      [clientId]: {
        appointmentId: appointment.id,
        startsAtLocal: local,
        durationMinutes: duration,
        status: appointment.status || "requested",
        meetUrl: appointment.meetUrl || "",
        notes: appointment.notes || ""
      }
    }));
    setActiveAppointmentClientId(clientId);
  };

  const saveAppointmentForClient = async (client) => {
    const draft = appointmentDraftByClientId[client.id];
    if (!draft?.appointmentId || !draft.startsAtLocal) return;
    const starts = new Date(draft.startsAtLocal);
    if (Number.isNaN(starts.getTime())) return;
    const duration = Number(draft.durationMinutes) || 45;
    const ends = new Date(starts.getTime() + duration * 60000);
    await onUpdateAppointment({
      appointmentId: draft.appointmentId,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      status: draft.status,
      meetUrl: draft.meetUrl,
      notes: draft.notes
    });
  };

  const restoreArchived = async (archiveId) => {
    const ok = window.confirm("Restaurer ce client archive ?");
    if (!ok) return;
    await onRestoreArchivedClient(archiveId);
  };

  const toggleSection = (clientId, sectionKey) => {
    setOpenSectionsByClientId((prev) => ({
      ...prev,
      [clientId]: {
        ...(prev[clientId] || {}),
        [sectionKey]: !(prev[clientId] || {})[sectionKey]
      }
    }));
  };

  const slugify = (value) =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);

  const loadBlogPost = (post) => {
    setIsCreatingBlogPost(false);
    setBlogDraft({
      id: post.id,
      title: post.title || "",
      slug: post.slug || "",
      excerpt: post.excerpt || "",
      content: post.content || "",
      category: post.category || "Astuces",
      readMinutes: post.readMinutes || 4,
      isPublished: Boolean(post.isPublished),
      coverImageUrl: post.coverImageUrl || ""
    });
  };

  const createNewBlogDraft = () => {
    setIsCreatingBlogPost(true);
    setBlogDraft({
      id: "",
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      category: "Astuces",
      readMinutes: 4,
      isPublished: true,
      coverImageUrl: ""
    });
    setBlogCoverFile(null);
  };

  const saveCurrentBlogPost = async () => {
    const baseSlug = blogDraft.slug || slugify(blogDraft.title);
    const slug = blogDraft.id ? baseSlug : `${baseSlug || "article"}-${Date.now().toString().slice(-6)}`;
    const saved = await onSaveBlogPost({
      ...blogDraft,
      slug
    });
    if (saved) {
      setBlogDraft((prev) => ({
        ...prev,
        id: saved.id,
        slug: saved.slug || prev.slug
      }));
      setIsCreatingBlogPost(false);
    }
  };

  const removeCurrentBlogPost = async () => {
    if (!blogDraft.id) return;
    const ok = window.confirm("Supprimer cet article ?");
    if (!ok) return;
    await onDeleteBlogPost(blogDraft.id);
    createNewBlogDraft();
  };

  const uploadCover = async () => {
    if (!blogCoverFile) return;
    const url = await onUploadBlogCover(blogCoverFile);
    if (url) {
      setBlogDraft((prev) => ({ ...prev, coverImageUrl: url }));
      setBlogCoverFile(null);
    }
  };

  return (
    <section className="coach-stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Coach</p>
          <h2>{coach.name}</h2>
        </div>
      </div>

      <NotificationsPanel
        items={notifications}
        busy={busy}
        onMarkRead={onMarkNotificationRead}
        onDelete={onDeleteNotification}
        title="Notifications coach"
      />

      <section className="panel coach-nav">
        <button
          className={coachView === "clients" ? "primary" : "ghost"}
          type="button"
          onClick={() => setCoachView("clients")}
        >
          Clients
        </button>
        <button
          className={coachView === "menus" ? "primary" : "ghost"}
          type="button"
          onClick={() => setCoachView("menus")}
        >
          Menus
        </button>
        <button
          className={coachView === "appointments" ? "primary" : "ghost"}
          type="button"
          onClick={() => setCoachView("appointments")}
        >
          Rendez-vous
        </button>
        <button
          className={coachView === "blog" ? "primary" : "ghost"}
          type="button"
          onClick={() => setCoachView("blog")}
        >
          Blog
        </button>
        <button
          className={coachView === "archives" ? "primary" : "ghost"}
          type="button"
          onClick={() => setCoachView("archives")}
        >
          Archives
        </button>
      </section>

      <section className="coach-kpis">
        <article className="panel coach-kpi">
          <small>Clients actifs</small>
          <p>{clientsWithBilan.length}</p>
        </article>
        <article className="panel coach-kpi">
          <small>Articles blog</small>
          <p>{(blogPosts || []).length}</p>
        </article>
        <article className="panel coach-kpi">
          <small>Clients archives</small>
          <p>{(archivedClients || []).length}</p>
        </article>
      </section>

      {coachView === "clients" && clientsWithBilan.length > 0 ? (
        <div className="coach-layout">
          <aside className="panel coach-clients-aside">
            <h3>Clients</h3>
            <div className="client-card-grid">
              {clientsWithBilan.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className={`client-mini-card ${selectedClient?.id === client.id ? "is-active" : ""}`}
                  onClick={() => setSelectedClientId(client.id)}
                >
                  <strong>{getClientCardName(client.name)}</strong>
                </button>
              ))}
            </div>
          </aside>

          {selectedClient ? (
            <article className="panel client-detail-panel">
              <div className="row-between">
                <h3>{selectedClient.name}</h3>
                <span>{selectedClient.email}</span>
              </div>
              <div className="detail-top-actions">
                <button className="primary" type="button" disabled={busy} onClick={() => createReport(selectedClient)}>
                  Generer bilan PDF
                </button>
                <button className="danger" type="button" disabled={busy} onClick={() => archiveClient(selectedClient)}>
                  Archiver + Supprimer
                </button>
              </div>

              <div className="metric-grid">
                <article>
                  <small>BMR</small>
                  <p>{selectedClient.bilan.bmr} kcal</p>
                </article>
                <article>
                  <small>TDEE</small>
                  <p>{selectedClient.bilan.tdee} kcal</p>
                </article>
                <article>
                  <small>Calories cible</small>
                  <p>{selectedClient.bilan.deficitCalories} kcal</p>
                </article>
                <article>
                  <small>Macros</small>
                  <p>
                    Proteines {selectedClient.bilan.macros.protein} / Lipides {selectedClient.bilan.macros.fat} / Glucides {selectedClient.bilan.macros.carbs}
                  </p>
                </article>
              </div>
              <p>
                <strong>Parametres MB:</strong> NAP {selectedClient.nap} / {getBmrMethodLabel(selectedClient.bmrMethod)}
              </p>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "nutrition")}
                >
                  <strong>Nutrition</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.nutrition ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.nutrition ? (
                  <div className="accordion-content">
                    {selectedClient.history?.length ? <GraphWeight data={selectedClient.history} /> : <p>Pas encore de poids enregistres.</p>}

                    <section className="section-block">
                      <label>
                        Deficit calorique (%)
                        <input
                          type="number"
                          min="5"
                          max="40"
                          value={deficitByClientId[selectedClient.id] ?? 20}
                          onChange={(event) =>
                            setDeficitByClientId((prev) => ({
                              ...prev,
                              [selectedClient.id]: event.target.value
                            }))
                          }
                          disabled={busy}
                        />
                      </label>
                      <button className="ghost" type="button" disabled={busy} onClick={() => saveDeficit(selectedClient.id)}>
                        Enregistrer deficit
                      </button>
                    </section>

                    <section className="section-block section-inline-grid">
                      <label>
                        NAP du client
                        <input
                          type="number"
                          step="0.05"
                          min="1.2"
                          max="2.2"
                          value={napByClientId[selectedClient.id] ?? 1.4}
                          onChange={(event) =>
                            setNapByClientId((prev) => ({
                              ...prev,
                              [selectedClient.id]: event.target.value
                            }))
                          }
                          disabled={busy}
                        />
                      </label>

                      <label>
                        Methode de calcul MB
                        <select
                          value={bmrMethodByClientId[selectedClient.id] || "mifflin"}
                          onChange={(event) =>
                            setBmrMethodByClientId((prev) => ({
                              ...prev,
                              [selectedClient.id]: event.target.value
                            }))
                          }
                          disabled={busy}
                        >
                          {BMR_METHODS.map((method) => (
                            <option key={method.value} value={method.value}>
                              {method.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="ghost" type="button" disabled={busy} onClick={() => saveMetabolicProfile(selectedClient.id)}>
                        Enregistrer NAP + methode MB
                      </button>
                    </section>
                  </div>
                ) : null}
              </section>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "goals")}
                >
                  <strong>Objectifs</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.goals ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.goals ? (
                  <div className="accordion-content">
                    <section className="section-block">
                      <label>
                        Semaine (lundi)
                        <input
                          type="date"
                          value={goalsDraftByClientId[selectedClient.id]?.weekStart || getMondayOfCurrentWeek()}
                          onChange={(event) =>
                            setGoalsDraftByClientId((prev) => ({
                              ...prev,
                              [selectedClient.id]: {
                                ...(prev[selectedClient.id] || {}),
                                weekStart: event.target.value
                              }
                            }))
                          }
                          disabled={busy}
                        />
                      </label>
                      <div className="checkin-list">
                        {[0, 1, 2].map((index) => (
                          <article key={`goal-${index}`} className="checkin-item">
                            <label>
                              Titre objectif {index + 1}
                              <input
                                type="text"
                                value={goalsDraftByClientId[selectedClient.id]?.goals?.[index]?.title || ""}
                                onChange={(event) => updateGoal(selectedClient.id, index, "title", event.target.value)}
                                disabled={busy}
                              />
                            </label>
                            <label>
                              Cible mesurable
                              <input
                                type="text"
                                value={goalsDraftByClientId[selectedClient.id]?.goals?.[index]?.target || ""}
                                onChange={(event) => updateGoal(selectedClient.id, index, "target", event.target.value)}
                                placeholder="Ex: 3 seances / 10k pas"
                                disabled={busy}
                              />
                            </label>
                          </article>
                        ))}
                      </div>
                      <button className="ghost" type="button" disabled={busy} onClick={() => saveWeeklyGoalsForClient(selectedClient)}>
                        Enregistrer objectifs hebdo
                      </button>
                    </section>
                  </div>
                ) : null}
              </section>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "checkins")}
                >
                  <strong>Check-ins</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.checkins ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.checkins ? (
                  <div className="accordion-content">
                    {(selectedClient.checkins || []).length ? (
                      <>
                        <p className="checkin-score">
                          Dernier score:{" "}
                          <strong className={`score-chip tone-${getScoreTone(selectedClient.checkins[0].score)}`}>
                            {selectedClient.checkins[0].score}/10
                          </strong>{" "}
                          ({selectedClient.checkins[0].weekStart})
                        </p>
                        <div className="checkin-list">
                          {selectedClient.checkins.slice(0, 8).map((entry) => (
                            <article key={entry.id} className="checkin-item">
                              <div className="row-between">
                                <strong>{entry.weekStart}</strong>
                                <strong className={`score-chip tone-${getScoreTone(entry.score)}`}>{entry.score}/10</strong>
                              </div>
                              <small>
                                Energie {entry.energy} | Faim {entry.hunger} | Sommeil {entry.sleep} | Stress {entry.stress} | Adherence {entry.adherence}
                              </small>
                              {entry.notes ? <p>{entry.notes}</p> : null}
                            </article>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p>Aucun check-in recu pour ce client.</p>
                    )}
                  </div>
                ) : null}
              </section>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "food")}
                >
                  <strong>Journal alimentaire</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.food ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.food ? (
                  <div className="accordion-content">
                    <p className="macro-line">
                      Semaine en cours: {selectedClientFoodWeek.calories} kcal | Proteines {selectedClientFoodWeek.protein}g | Glucides {selectedClientFoodWeek.carbs}g | Lipides {selectedClientFoodWeek.fat}g
                    </p>
                    {!selectedClientFoodByDay.length ? <p>Aucune entree alimentaire pour ce client.</p> : null}
                    <div className="checkin-list">
                      {selectedClientFoodByDay.slice(0, 10).map((day) => (
                        <article key={day.day} className="checkin-item">
                          <div className="row-between">
                            <strong>{new Date(`${day.day}T12:00:00`).toLocaleDateString()}</strong>
                            <small>
                              {day.totals.calories} kcal | P {day.totals.protein} | G {day.totals.carbs} | L {day.totals.fat}
                            </small>
                          </div>
                          <ul className="simple-list">
                            {day.entries.map((entry) => (
                              <li key={entry.id} className="row-between">
                                <span>{entry.foodName} ({entry.quantityG}g)</span>
                                <small>{Math.round(entry.calories)} kcal</small>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "appointments")}
                >
                  <strong>Rendez-vous visio</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.appointments ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.appointments ? (
                  <div className="accordion-content">
                    {(selectedClient.appointments || []).length ? (
                      <div className="checkin-list">
                        {selectedClient.appointments.map((appointment) => (
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
                                  Ouvrir Google Meet
                                </a>
                              ) : (
                                <small>Pas encore de lien visio</small>
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
                              <button
                                className="ghost"
                                type="button"
                                disabled={busy}
                                onClick={() => loadAppointmentDraft(selectedClient.id, appointment)}
                              >
                                Modifier
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>Aucun rendez-vous reserve pour ce client.</p>
                    )}

                    {appointmentDraftByClientId[selectedClient.id]?.appointmentId ? (
                      <section className="section-block">
                        <h4>Edition du rendez-vous</h4>
                        <label>
                          Date et heure
                          <input
                            type="datetime-local"
                            value={appointmentDraftByClientId[selectedClient.id]?.startsAtLocal || ""}
                            onChange={(event) =>
                              setAppointmentDraftByClientId((prev) => ({
                                ...prev,
                                [selectedClient.id]: {
                                  ...(prev[selectedClient.id] || {}),
                                  startsAtLocal: event.target.value
                                }
                              }))
                            }
                            disabled={busy}
                          />
                        </label>
                        <label>
                          Duree
                          <select
                            value={appointmentDraftByClientId[selectedClient.id]?.durationMinutes || 45}
                            onChange={(event) =>
                              setAppointmentDraftByClientId((prev) => ({
                                ...prev,
                                [selectedClient.id]: {
                                  ...(prev[selectedClient.id] || {}),
                                  durationMinutes: Number(event.target.value)
                                }
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
                          Statut
                          <select
                            value={appointmentDraftByClientId[selectedClient.id]?.status || "requested"}
                            onChange={(event) =>
                              setAppointmentDraftByClientId((prev) => ({
                                ...prev,
                                [selectedClient.id]: {
                                  ...(prev[selectedClient.id] || {}),
                                  status: event.target.value
                                }
                              }))
                            }
                            disabled={busy}
                          >
                            <option value="requested">requested</option>
                            <option value="confirmed">confirmed</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        </label>
                        <label>
                          Lien visio
                          <input
                            type="url"
                            value={appointmentDraftByClientId[selectedClient.id]?.meetUrl || ""}
                            onChange={(event) =>
                              setAppointmentDraftByClientId((prev) => ({
                                ...prev,
                                [selectedClient.id]: {
                                  ...(prev[selectedClient.id] || {}),
                                  meetUrl: event.target.value
                                }
                              }))
                            }
                            placeholder="https://meet.google.com/..."
                            disabled={busy}
                          />
                        </label>
                        <button
                          className="ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => window.open("https://meet.new", "_blank", "noopener,noreferrer")}
                        >
                          Creer un Google Meet
                        </button>
                        <label>
                          Notes
                          <textarea
                            value={appointmentDraftByClientId[selectedClient.id]?.notes || ""}
                            onChange={(event) =>
                              setAppointmentDraftByClientId((prev) => ({
                                ...prev,
                                [selectedClient.id]: {
                                  ...(prev[selectedClient.id] || {}),
                                  notes: event.target.value
                                }
                              }))
                            }
                            disabled={busy}
                          />
                        </label>
                        <button className="primary" type="button" disabled={busy} onClick={() => saveAppointmentForClient(selectedClient)}>
                          Enregistrer rendez-vous
                        </button>
                        <button
                          className="danger"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            onCancelAppointment(appointmentDraftByClientId[selectedClient.id]?.appointmentId)
                          }
                        >
                          Annuler ce rendez-vous
                        </button>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "message")}
                >
                  <strong>Message</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.message ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.message ? (
                  <div className="accordion-content">
                    <section className="section-block">
                      <label>
                        Message du coach
                        <textarea
                          value={messageByClientId[selectedClient.id] || ""}
                          onChange={(event) =>
                            setMessageByClientId((prev) => ({
                              ...prev,
                              [selectedClient.id]: event.target.value
                            }))
                          }
                          placeholder="Consignes de la semaine"
                        />
                      </label>
                      <button className="ghost" type="button" disabled={busy} onClick={() => saveMessage(selectedClient)}>
                        Enregistrer message
                      </button>
                    </section>
                  </div>
                ) : null}
              </section>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "menu")}
                >
                  <strong>Menu hebdomadaire</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.menu ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.menu ? (
                  <div className="accordion-content">
                    <section className="menu-builder">
                      <div className="row-between">
                        <h4>Planning repas</h4>
                        <input
                          type="date"
                          value={menuDraftByClientId[selectedClient.id]?.weekStart || getMondayOfCurrentWeek()}
                          onChange={(event) =>
                            setMenuDraft(selectedClient.id, (draft) => ({ ...draft, weekStart: event.target.value }))
                          }
                          disabled={busy}
                        />
                      </div>

                      <label>
                        Notes du coach
                        <textarea
                          value={menuDraftByClientId[selectedClient.id]?.notes || ""}
                          onChange={(event) =>
                            setMenuDraft(selectedClient.id, (draft) => ({ ...draft, notes: event.target.value }))
                          }
                          placeholder="Consignes generales de la semaine"
                        />
                      </label>

                      <div className="menu-days-stack">
                        {DAY_KEYS.map((day) => (
                          <MenuDay
                            key={day.key}
                            dayLabel={day.label}
                            meals={menuDraftByClientId[selectedClient.id]?.plan?.[day.key]}
                            onChangeMeal={(mealKey, value) => updateMeal(selectedClient.id, day.key, mealKey, value)}
                          />
                        ))}
                      </div>

                      <button
                        className="primary"
                        type="button"
                        disabled={busy}
                        onClick={() => saveWeeklyMenuForClient(selectedClient)}
                      >
                        Enregistrer menu hebdomadaire
                      </button>
                    </section>
                  </div>
                ) : null}
              </section>

              <section className="accordion-block">
                <button
                  className="accordion-toggle"
                  type="button"
                  onClick={() => toggleSection(selectedClient.id, "photos")}
                >
                  <strong>Photos</strong>
                  <span>{openSectionsByClientId[selectedClient.id]?.photos ? "−" : "+"}</span>
                </button>
                {openSectionsByClientId[selectedClient.id]?.photos ? (
                  <div className="accordion-content">
                    <section className="photo-review">
                      <h4>Photos envoyees par le client</h4>
                      {selectedClient.photos?.length ? null : <p>Aucune photo recue.</p>}
                      <div className="photo-grid">
                        {(selectedClient.photos || []).map((photo) => (
                          <figure key={photo.id} className="photo-card">
                            <img
                              src={photo.imageUrl}
                              alt={`Progression de ${selectedClient.name}`}
                              loading="lazy"
                              decoding="async"
                            />
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
                    </section>
                  </div>
                ) : null}
              </section>
            </article>
          ) : null}
        </div>
      ) : null}

      {coachView === "clients" && clientsWithBilan.length === 0 ? (
        <article className="panel">
          <p>Aucun client inscrit.</p>
        </article>
      ) : null}

      {coachView === "menus" && clientsWithBilan.length > 0 ? (
        <article className="panel coach-view-panel">
          <div className="row-between">
            <h3>Menus hebdomadaires</h3>
            <small>{clientsWithBilan.length} clients</small>
          </div>
          <div className="coach-layout">
            <aside className="panel coach-clients-aside">
              <h4>Clients</h4>
              <div className="client-card-grid">
                {clientsWithBilan.map((client) => (
                  <button
                    key={`menu-${client.id}`}
                    type="button"
                    className={`client-mini-card ${selectedClient?.id === client.id ? "is-active" : ""}`}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <strong>{getClientCardName(client.name)}</strong>
                  </button>
                ))}
              </div>
            </aside>

            {selectedClient ? (
              <section className="section-block">
                <div className="row-between">
                  <h4>Menu de {selectedClient.name}</h4>
                  <input
                    type="date"
                    value={menuDraftByClientId[selectedClient.id]?.weekStart || getMondayOfCurrentWeek()}
                    onChange={(event) =>
                      setMenuDraft(selectedClient.id, (draft) => ({ ...draft, weekStart: event.target.value }))
                    }
                    disabled={busy}
                  />
                </div>

                <label>
                  Notes du coach
                  <textarea
                    value={menuDraftByClientId[selectedClient.id]?.notes || ""}
                    onChange={(event) =>
                      setMenuDraft(selectedClient.id, (draft) => ({ ...draft, notes: event.target.value }))
                    }
                    placeholder="Consignes generales de la semaine"
                  />
                </label>

                <div className="menu-days-stack">
                  {DAY_KEYS.map((day) => (
                    <MenuDay
                      key={`menu-tab-${day.key}`}
                      dayLabel={day.label}
                      meals={menuDraftByClientId[selectedClient.id]?.plan?.[day.key]}
                      onChangeMeal={(mealKey, value) => updateMeal(selectedClient.id, day.key, mealKey, value)}
                    />
                  ))}
                </div>

                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={() => saveWeeklyMenuForClient(selectedClient)}
                >
                  Enregistrer menu hebdomadaire
                </button>
              </section>
            ) : (
              <section className="section-block">
                <p>Selectionne un client pour modifier son menu.</p>
              </section>
            )}
          </div>
        </article>
      ) : null}

      {coachView === "menus" && clientsWithBilan.length === 0 ? (
        <article className="panel">
          <p>Aucun client inscrit.</p>
        </article>
      ) : null}

      {coachView === "blog" ? (
      <article className="panel">
        <div className="row-between">
          <h3>Blog & Astuces</h3>
          <button className="ghost" type="button" disabled={busy} onClick={createNewBlogDraft}>
            Nouvel article
          </button>
        </div>
        <div className="coach-layout">
          <aside className="panel">
            <h4>Articles</h4>
            <div className="client-card-grid">
              {(blogPosts || []).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  className={`client-mini-card ${blogDraft.id === post.id ? "is-active" : ""}`}
                  onClick={() => loadBlogPost(post)}
                >
                  <strong>{post.title}</strong>
                </button>
              ))}
            </div>
          </aside>

          <section className="section-block">
            <label>
              Titre
              <input
                type="text"
                value={blogDraft.title}
                onChange={(event) =>
                  setBlogDraft((prev) => ({
                    ...prev,
                    title: event.target.value,
                    slug: prev.id ? prev.slug : slugify(event.target.value)
                  }))
                }
                disabled={busy}
              />
            </label>
            <label>
              Slug
              <input
                type="text"
                value={blogDraft.slug}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, slug: slugify(event.target.value) }))}
                disabled={busy}
              />
            </label>
            <label>
              Categorie
              <select
                value={blogDraft.category}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, category: event.target.value }))}
                disabled={busy}
              >
                <option value="Astuces">Astuces</option>
                <option value="Recettes">Recettes</option>
                <option value="Sport">Sport</option>
              </select>
            </label>
            <label>
              Temps de lecture (min)
              <input
                type="number"
                min="1"
                max="60"
                value={blogDraft.readMinutes}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, readMinutes: Number(event.target.value) || 4 }))}
                disabled={busy}
              />
            </label>
            <label>
              Resume
              <textarea
                value={blogDraft.excerpt}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, excerpt: event.target.value }))}
                disabled={busy}
              />
            </label>
            <label>
              Contenu
              <textarea
                value={blogDraft.content}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, content: event.target.value }))}
                disabled={busy}
              />
            </label>
            <label>
              Image de couverture (URL)
              <input
                type="url"
                value={blogDraft.coverImageUrl}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, coverImageUrl: event.target.value }))}
                placeholder="https://..."
                disabled={busy}
              />
            </label>
            {blogDraft.coverImageUrl ? (
              <img
                className="blog-cover-preview"
                src={blogDraft.coverImageUrl}
                alt="Couverture article"
                loading="lazy"
                decoding="async"
              />
            ) : null}
            <label>
              Ou upload une image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setBlogCoverFile(event.target.files?.[0] || null)}
                disabled={busy}
              />
            </label>
            <div className="row-actions">
              <button className="ghost" type="button" disabled={busy || !blogCoverFile} onClick={uploadCover}>
                Upload image
              </button>
              <label className="goal-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(blogDraft.isPublished)}
                  onChange={(event) => setBlogDraft((prev) => ({ ...prev, isPublished: event.target.checked }))}
                  disabled={busy}
                />
                <span>Publie</span>
              </label>
            </div>
            <div className="row-actions">
              <button className="primary" type="button" disabled={busy} onClick={saveCurrentBlogPost}>
                Enregistrer article
              </button>
              {blogDraft.id ? (
                <button className="danger" type="button" disabled={busy} onClick={removeCurrentBlogPost}>
                  Supprimer article
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </article>
      ) : null}

      {coachView === "archives" ? (
      <article className="panel">
        <h3>Clients archives</h3>
        {archivedClients?.length ? null : <p>Aucun client archive.</p>}
        <ul className="simple-list">
          {(archivedClients || []).map((client) => (
            <li key={client.id} className="row-between">
              <span>{client.name} ({client.email || "sans email"})</span>
              <div className="row-actions">
                <small>{new Date(client.archivedAt).toLocaleDateString()}</small>
                <button className="ghost" type="button" disabled={busy} onClick={() => restoreArchived(client.id)}>
                  Restaurer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </article>
      ) : null}

      {coachView === "appointments" ? (
      <article className="panel coach-view-panel">
        <div className="row-between">
          <h3>Rendez-vous visio</h3>
          <small>{allAppointments.length} rendez-vous</small>
        </div>

        <section className="calendar-shell">
          <div className="calendar-head">
            <button
              className="ghost"
              type="button"
              onClick={() => setCalendarMonth((prev) => addMonthsLocal(prev, -1))}
              disabled={busy}
            >
              Mois precedent
            </button>
            <strong>{calendarMonthLabel}</strong>
            <button
              className="ghost"
              type="button"
              onClick={() => setCalendarMonth((prev) => addMonthsLocal(prev, 1))}
              disabled={busy}
            >
              Mois suivant
            </button>
          </div>

          <div className="calendar-grid">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
              <div key={label} className="calendar-weekday">{label}</div>
            ))}
            {calendarCells.map((cell) => {
              const count = (appointmentsByDate.get(cell.dateKey) || []).length;
              const isSelected = selectedCalendarDate === cell.dateKey;
              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  className={`calendar-day${cell.inMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${count > 0 ? " has-events" : ""}`}
                  onClick={() => setSelectedCalendarDate(cell.dateKey)}
                >
                  <span>{cell.day}</span>
                  {count > 0 ? <small className="calendar-dot">{count}</small> : null}
                </button>
              );
            })}
          </div>

          <div className="calendar-day-list">
            <strong>Rendez-vous du {new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString("fr-FR")}</strong>
            {!selectedDayAppointments.length ? <p>Aucun rendez-vous ce jour.</p> : null}
            <ul className="simple-list">
              {selectedDayAppointments.map((appointment) => (
                <li key={`day-${appointment.id}`} className="row-between">
                  <span>{new Date(appointment.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {appointment.clientName}</span>
                  <button className="ghost" type="button" onClick={() => loadAppointmentDraft(appointment.clientId, appointment)}>
                    Editer
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {allAppointments.length === 0 ? <p>Aucun rendez-vous programme.</p> : null}
        <div className="checkin-list appointment-master-list">
          {allAppointments.map((appointment) => (
            <article key={appointment.id} className="checkin-item">
              <div className="row-between">
                <strong>{new Date(appointment.startsAt).toLocaleString()}</strong>
                <span className={`score-chip tone-${appointment.status === "confirmed" ? "good" : appointment.status === "cancelled" ? "low" : "medium"}`}>
                  {appointment.status}
                </span>
              </div>
              <p>
                <strong>{appointment.clientName}</strong> {appointment.clientEmail ? `(${appointment.clientEmail})` : ""}
              </p>
              {appointment.notes ? <p>{appointment.notes}</p> : null}
              <div className="row-actions">
                {appointment.meetUrl ? (
                  <a className="primary-link" href={appointment.meetUrl} target="_blank" rel="noreferrer">
                    Ouvrir Google Meet
                  </a>
                ) : (
                  <small>Pas encore de lien visio</small>
                )}
                <button
                  className="ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => loadAppointmentDraft(appointment.clientId, appointment)}
                >
                  Modifier
                </button>
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

        {activeAppointmentClient && appointmentDraftByClientId[activeAppointmentClient.id]?.appointmentId ? (
          <section className="section-block" style={{ marginTop: 12 }}>
            <h4>
              Edition du rendez-vous - {activeAppointmentClient.name}
            </h4>
            <label>
              Date et heure
              <input
                type="datetime-local"
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.startsAtLocal || ""}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      startsAtLocal: event.target.value
                    }
                  }))
                }
                disabled={busy}
              />
            </label>
            <label>
              Duree
              <select
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.durationMinutes || 45}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      durationMinutes: Number(event.target.value)
                    }
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
              Statut
              <select
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.status || "requested"}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      status: event.target.value
                    }
                  }))
                }
                disabled={busy}
              >
                <option value="requested">requested</option>
                <option value="confirmed">confirmed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label>
              Lien visio
              <input
                type="url"
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.meetUrl || ""}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      meetUrl: event.target.value
                    }
                  }))
                }
                placeholder="https://meet.google.com/..."
                disabled={busy}
              />
            </label>
            <button
              className="ghost"
              type="button"
              disabled={busy}
              onClick={() => window.open("https://meet.new", "_blank", "noopener,noreferrer")}
            >
              Creer un Google Meet
            </button>
            <label>
              Notes
              <textarea
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.notes || ""}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      notes: event.target.value
                    }
                  }))
                }
                disabled={busy}
              />
            </label>
            <div className="row-actions">
              <button className="primary" type="button" disabled={busy} onClick={() => saveAppointmentForClient(activeAppointmentClient)}>
                Enregistrer rendez-vous
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelectedClientId(activeAppointmentClient.id);
                  setCoachView("clients");
                }}
              >
                Ouvrir fiche client
              </button>
            </div>
          </section>
        ) : null}
      </article>
      ) : null}
    </section>
  );
}
