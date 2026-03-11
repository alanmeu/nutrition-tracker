import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import ChatThread from "../../components/ChatThread";
import GraphWeight from "../../components/GraphWeight";
import MenuDay from "../../components/MenuDay";
import NotificationsPanel from "../../components/NotificationsPanel";
import { createEmptyWeeklyPlan, DAY_KEYS, getMondayOfCurrentWeek } from "../../utils/mealPlanner";
import { BMR_METHODS, calcBMR, calcDeficit, calcMacros, calcTDEE, getBmrMethodLabel } from "../../utils/nutrition";
import { addPdfBranding } from "../../utils/pdfBranding";

function buildBilan(client, overrides = {}) {
  const weight = Number(overrides.weight ?? client.weight ?? 70);
  const height = Number(overrides.height ?? client.height ?? 170);
  const age = Number(overrides.age ?? client.age ?? 30);
  const sex = overrides.sex ?? client.sex ?? "male";
  const bmrMethod = overrides.bmrMethod ?? client.bmrMethod ?? "mifflin";
  const nap = Number(overrides.nap ?? client.nap ?? 1.4);
  const deficitPercentage = Number(overrides.deficit ?? client.deficit ?? 20);
  const bmr = calcBMR(
    weight,
    height,
    age,
    sex,
    bmrMethod
  );
  const tdee = calcTDEE(bmr, nap);
  const deficitCalories = calcDeficit(tdee, deficitPercentage);
  const macros = calcMacros(weight, deficitCalories);
  const bmi = height > 0 ? weight / ((height / 100) ** 2) : null;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficitCalories: Math.round(deficitCalories),
    macros,
    bmi: Number.isFinite(bmi) ? Number(bmi.toFixed(1)) : null,
    nap: Number.isFinite(nap) ? Number(nap.toFixed(2)) : 1.4,
    deficitPercentage: Number.isFinite(deficitPercentage) ? deficitPercentage : 20,
    bmrMethod
  };
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

function buildMenuSummary(menu) {
  if (!menu) return { weekStart: "", text: "Aucun menu hebdomadaire enregistre." };
  const plan = menu.plan || {};
  const daySummaries = DAY_KEYS.map((day) => {
    const meals = plan[day.key] || {};
    const filled = Object.values(meals).filter((value) => String(value || "").trim()).length;
    return `${day.label}: ${filled}/4 repas renseignes`;
  });
  const note = String(menu.notes || "").trim();
  return {
    weekStart: menu.weekStart || "",
    text: `${daySummaries.join(" | ")}${note ? ` | Notes: ${note}` : ""}`
  };
}

function buildProgressSnapshot(client) {
  const history = Array.isArray(client.history) ? [...client.history] : [];
  history.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const firstWeight = history[0]?.weight ? Number(history[0].weight) : null;
  const lastWeight = history[history.length - 1]?.weight ? Number(history[history.length - 1].weight) : null;
  const deltaWeight =
    Number.isFinite(firstWeight) && Number.isFinite(lastWeight)
      ? Number((lastWeight - firstWeight).toFixed(1))
      : null;

  const latestCheckin = Array.isArray(client.checkins) && client.checkins.length > 0 ? client.checkins[0] : null;
  const latestGoals = Array.isArray(client.goals) && client.goals.length > 0 ? client.goals[0] : null;
  const goalsCount = Array.isArray(latestGoals?.goals) ? latestGoals.goals.length : 0;
  const goalsDone = Array.isArray(latestGoals?.goals)
    ? latestGoals.goals.filter((goal) => Boolean(goal?.done)).length
    : 0;

  return {
    firstWeight,
    lastWeight,
    deltaWeight,
    latestCheckinScore: latestCheckin?.score ?? null,
    latestCheckinWeek: latestCheckin?.weekStart ?? "",
    goalsDone,
    goalsCount,
    goalsWeek: latestGoals?.weekStart || ""
  };
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function parseCsvText(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rows.length) return [];
  const delimiter = rows[0].includes(";") ? ";" : ",";
  const headers = parseCsvLine(rows[0], delimiter).map((value) => value.toLowerCase());
  return rows.slice(1).map((row) => {
    const values = parseCsvLine(row, delimiter);
    const mapped = {};
    headers.forEach((header, index) => {
      mapped[header] = values[index] || "";
    });
    return mapped;
  });
}

function getCsvField(row, aliases) {
  for (const key of aliases) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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
  onRestoreArchivedClient,
  notifications,
  onMarkNotificationRead,
  onDeleteNotification,
  onDeletePhoto,
  onUpdateAppointment,
  onCancelAppointment,
  onSaveBlogPost,
  onDeleteBlogPost,
  onUploadBlogCover,
  chatMessages,
  onSendChatMessage,
  onMarkChatRead,
  onDeleteChatHistory,
  forcedView,
  onChangeView
}) {
  const [deficitByClientId, setDeficitByClientId] = useState({});
  const [napByClientId, setNapByClientId] = useState({});
  const [bmrMethodByClientId, setBmrMethodByClientId] = useState({});
  const [reportDraftByClientId, setReportDraftByClientId] = useState({});
  const [menuDraftByClientId, setMenuDraftByClientId] = useState({});
  const [appointmentDraftByClientId, setAppointmentDraftByClientId] = useState({});
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeAppointmentClientId, setActiveAppointmentClientId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => monthStartLocal(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toDateKeyLocal(new Date()));
  const [coachView, setCoachView] = useState("clients");
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
  const [blogCsvFile, setBlogCsvFile] = useState(null);
  const [blogCsvStatus, setBlogCsvStatus] = useState("");

  const setCoachViewSynced = (nextView) => {
    setCoachView(nextView);
    if (typeof onChangeView === "function") {
      onChangeView(nextView);
    }
  };

  useEffect(() => {
    if (forcedView && forcedView !== coachView) {
      setCoachView(forcedView);
    }
  }, [forcedView, coachView]);

  useEffect(() => {
    setDeficitByClientId(
      Object.fromEntries(clients.map((client) => [client.id, client.deficit ?? 20]))
    );
    setNapByClientId(
      Object.fromEntries(clients.map((client) => [client.id, client.nap ?? 1.4]))
    );
    setBmrMethodByClientId(
      Object.fromEntries(clients.map((client) => [client.id, client.bmrMethod || "mifflin"]))
    );
    setReportDraftByClientId((prev) => {
      const next = { ...prev };
      for (const client of clients) {
        if (!next[client.id]) {
          next[client.id] = {
            sessionNotes: client.coachMessage || "",
            objectives: ""
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

    if (clients.length === 0) {
      setSelectedClientId("");
      setActiveAppointmentClientId("");
    } else if (!clients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(clients[0].id);
    }

    if (activeAppointmentClientId && !clients.some((client) => client.id === activeAppointmentClientId)) {
      setActiveAppointmentClientId("");
    }
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

  const selectedClientMetabolicPreview = useMemo(() => {
    if (!selectedClient) return null;
    return buildBilan(selectedClient, {
      nap: napByClientId[selectedClient.id] ?? selectedClient.nap ?? 1.4,
      deficit: deficitByClientId[selectedClient.id] ?? selectedClient.deficit ?? 20,
      bmrMethod: bmrMethodByClientId[selectedClient.id] || selectedClient.bmrMethod || "mifflin"
    });
  }, [selectedClient, napByClientId, deficitByClientId, bmrMethodByClientId]);

  const selectedClientChatMessages = useMemo(() => {
    if (!selectedClient) return [];
    const fromGlobal = (Array.isArray(chatMessages) ? chatMessages : []).filter(
      (entry) => entry.clientId === selectedClient.id
    );
    if (fromGlobal.length > 0) return fromGlobal;
    return Array.isArray(selectedClient.chatMessages) ? selectedClient.chatMessages : [];
  }, [chatMessages, selectedClient]);

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
    const draft = reportDraftByClientId[client.id] || { sessionNotes: "", objectives: "" };
    const sessionNotes = (draft.sessionNotes || "").trim();
    const objectives = (draft.objectives || "").trim();
    const message = sessionNotes || client.coachMessage || "";
    const bilan = buildBilan(client);
    const menuSummary = buildMenuSummary(menuDraftByClientId[client.id] || client.weeklyMenus?.[0] || null);
    const progress = buildProgressSnapshot(client);
    const mensurations = {
      waistCm: client.waistCm ?? null,
      hipCm: client.hipCm ?? null,
      chestCm: client.chestCm ?? null,
      armCm: client.armCm ?? null,
      thighCm: client.thighCm ?? null
    };
    const bilanPayload = {
      ...bilan,
      sessionNotes,
      objectives,
      mensurations,
      menuSummary,
      progress
    };

    await onCreateReport({
      clientId: client.id,
      message,
      bilan: bilanPayload
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
    doc.text(`BMR: ${bilanPayload.bmr} kcal`, 14, 74 + offset);
    doc.text(`TDEE: ${bilanPayload.tdee} kcal`, 14, 84 + offset);
    doc.text(`Calories cible: ${bilanPayload.deficitCalories} kcal`, 14, 94 + offset);
    doc.text(
      `Macros: Proteines ${bilanPayload.macros.protein}g / Lipides ${bilanPayload.macros.fat}g / Glucides ${bilanPayload.macros.carbs}g`,
      14,
      104 + offset
    );
    let y = 118 + offset;
    const writeWrapped = (label, value) => {
      const lines = doc.splitTextToSize(`${label}: ${value || "-"}`, 180);
      doc.text(lines, 14, y);
      y += 6 * lines.length + 2;
    };
    writeWrapped("Notes de seance", message || "-");
    writeWrapped("Objectifs fixes", objectives || "-");
    writeWrapped("Menu donne", menuSummary.text || "-");
    writeWrapped(
      "Progression",
      `${progress.firstWeight ?? "-"} kg -> ${progress.lastWeight ?? "-"} kg (delta ${
        progress.deltaWeight ?? "-"
      } kg), Check-in ${progress.latestCheckinScore ?? "-"} (${
        progress.latestCheckinWeek || "-"
      }), Objectifs ${progress.goalsDone}/${progress.goalsCount} (${progress.goalsWeek || "-"})`
    );
    writeWrapped(
      "Mensurations (cm)",
      `Taille ${mensurations.waistCm ?? "-"} | Hanches ${mensurations.hipCm ?? "-"} | Poitrine ${
        mensurations.chestCm ?? "-"
      } | Bras ${mensurations.armCm ?? "-"} | Cuisse ${mensurations.thighCm ?? "-"}`
    );
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
        status: appointment.status === "cancelled" ? "cancelled" : "confirmed",
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

  const slugify = (value) =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);

  const importBlogCsv = async () => {
    if (!blogCsvFile) return;
    try {
      setBlogCsvStatus("Import en cours...");
      const text = await blogCsvFile.text();
      const rows = parseCsvText(text);
      if (!rows.length) {
        setBlogCsvStatus("CSV vide ou invalide.");
        return;
      }

      let imported = 0;
      for (const row of rows) {
        const title = getCsvField(row, ["title", "titre", "name", "nom"]);
        const content = getCsvField(row, ["content", "contenu", "body"]);
        if (!title || !content) continue;

        const excerpt =
          getCsvField(row, ["excerpt", "resume", "résumé", "summary"]) || content.slice(0, 180);
        const category = getCsvField(row, ["category", "categorie", "catégorie"]) || "Astuces";
        const readMinutesRaw = Number(
          getCsvField(row, ["readminutes", "read_minutes", "temps", "reading_time"])
        );
        const readMinutes = Number.isFinite(readMinutesRaw) && readMinutesRaw > 0 ? readMinutesRaw : 4;
        const coverImageUrl = getCsvField(row, ["coverimageurl", "cover_image_url", "image", "cover"]);
        const publishedRaw = getCsvField(row, ["published", "publie", "publié", "is_published"]).toLowerCase();
        const isPublished = !["0", "false", "non", "no"].includes(publishedRaw);

        await onSaveBlogPost({
          title,
          slug: `${slugify(title) || "article"}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
          excerpt,
          content,
          category,
          readMinutes,
          coverImageUrl,
          isPublished
        });
        imported += 1;
      }

      setBlogCsvStatus(
        imported > 0 ? `${imported} article(s) importe(s).` : "Aucun article valide trouve dans le CSV."
      );
      setBlogCsvFile(null);
    } catch {
      setBlogCsvStatus("Erreur pendant l'import CSV.");
    }
  };

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

      {clientsWithBilan.length > 0 ? (
        <section className="panel coach-client-picker">
          <label>
            Client selectionne
            <select
              value={selectedClientId}
              onChange={(event) => setSelectedClientId(event.target.value)}
              disabled={busy}
            >
              {clientsWithBilan.map((client) => (
                <option key={`pick-${client.id}`} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {coachView === "clients" && clientsWithBilan.length > 0 ? (
        <article className="panel client-detail-panel">
          {selectedClient ? (
            <>
              <div className="row-between">
                <h3>{selectedClient.name}</h3>
                <span>{selectedClient.email}</span>
              </div>
              <div className="detail-top-actions">
                <button className="danger" type="button" disabled={busy} onClick={() => archiveClient(selectedClient)}>
                  Archiver + Supprimer
                </button>
              </div>

              <section className="section-block">
                <h4>Bilan de seance</h4>
                <label>
                  Ce qu'on s'est dit
                  <textarea
                    value={reportDraftByClientId[selectedClient.id]?.sessionNotes || ""}
                    onChange={(event) =>
                      setReportDraftByClientId((prev) => ({
                        ...prev,
                        [selectedClient.id]: {
                          ...(prev[selectedClient.id] || {}),
                          sessionNotes: event.target.value
                        }
                      }))
                    }
                    placeholder="Resume de la consultation, points importants..."
                    disabled={busy}
                  />
                </label>
                <label>
                  Objectifs fixes
                  <textarea
                    value={reportDraftByClientId[selectedClient.id]?.objectives || ""}
                    onChange={(event) =>
                      setReportDraftByClientId((prev) => ({
                        ...prev,
                        [selectedClient.id]: {
                          ...(prev[selectedClient.id] || {}),
                          objectives: event.target.value
                        }
                      }))
                    }
                    placeholder="Ex: 2L d'eau/jour, 10k pas, 3 repas structures..."
                    disabled={busy}
                  />
                </label>
                <button className="primary" type="button" disabled={busy} onClick={() => createReport(selectedClient)}>
                  Enregistrer et generer bilan PDF
                </button>
              </section>

              <section className="section-block">
                <h4>Nutrition</h4>
                {selectedClientMetabolicPreview ? (
                  <section className="metric-grid">
                    <article>
                      <small>Poids actuel</small>
                      <p>{selectedClient.weight ? `${Number(selectedClient.weight).toFixed(1)} kg` : "—"}</p>
                    </article>
                    <article>
                      <small>IMC</small>
                      <p>{selectedClientMetabolicPreview.bmi ? `${selectedClientMetabolicPreview.bmi}` : "—"}</p>
                    </article>
                    <article>
                      <small>NAP</small>
                      <p>{selectedClientMetabolicPreview.nap}</p>
                    </article>
                    <article>
                      <small>BMR ({getBmrMethodLabel(selectedClientMetabolicPreview.bmrMethod)})</small>
                      <p>{selectedClientMetabolicPreview.bmr} kcal</p>
                    </article>
                    <article>
                      <small>TDEE</small>
                      <p>{selectedClientMetabolicPreview.tdee} kcal</p>
                    </article>
                    <article>
                      <small>Cible avec deficit ({selectedClientMetabolicPreview.deficitPercentage}%)</small>
                      <p>{selectedClientMetabolicPreview.deficitCalories} kcal</p>
                    </article>
                  </section>
                ) : null}
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
              </section>

              <section className="section-block">
                <h4>Photos du client</h4>
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
            </>
          ) : (
            <section className="section-block">
              <p>Selectionne un client.</p>
            </section>
          )}
        </article>
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
        </article>
      ) : null}

      {coachView === "menus" && clientsWithBilan.length === 0 ? (
        <article className="panel">
          <p>Aucun client inscrit.</p>
        </article>
      ) : null}

      {coachView === "messages" ? (
      <article className="panel coach-view-panel">
        <div className="row-between">
          <h3>Messagerie coach-client</h3>
          <small>{selectedClient ? selectedClient.name : "Aucun client"}</small>
        </div>
        {selectedClient ? (
          <ChatThread
            title={`Chat avec ${selectedClient.name}`}
            currentUserId={coach.id}
            messages={selectedClientChatMessages}
            busy={busy}
            placeholder="Ecris un message au client..."
            onSend={(message) => onSendChatMessage?.({ clientId: selectedClient.id, message })}
            onMarkRead={() => onMarkChatRead?.(selectedClient.id)}
            onDeleteHistory={() => onDeleteChatHistory?.(selectedClient.id)}
          />
        ) : (
          <p>Selectionne un client pour ouvrir la messagerie.</p>
        )}
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
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setBlogCsvFile(event.target.files?.[0] || null)}
                disabled={busy}
              />
              <button className="ghost" type="button" disabled={busy || !blogCsvFile} onClick={importBlogCsv}>
                Import CSV
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
            {blogCsvStatus ? <p className="muted">{blogCsvStatus}</p> : null}
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
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.status || "confirmed"}
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
                  setCoachViewSynced("clients");
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
