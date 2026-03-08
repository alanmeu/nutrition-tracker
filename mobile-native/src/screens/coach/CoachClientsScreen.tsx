import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  archiveAndDeleteClient,
  createClientReport,
  deleteAppointment,
  deleteClientReport,
  deleteWeeklyCheckin,
  deleteWeightEntry,
  loadCoachClientsWithData,
  markNotificationRead,
  restoreArchivedClient,
  saveWeeklyGoalsByCoach,
  updateClientPlan
} from "../../lib/api";
import type { Profile } from "../../types/models";
import { Card, Field, GhostButton, PrimaryButton, Screen, Title } from "../../components/ui";
import { calcBMR, calcDeficit, calcMacros, calcTDEE } from "../../lib/nutrition";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function mondayIso() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(text: string) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPdfLogoDataUri() {
  const logoSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="92" viewBox="0 0 320 92" fill="none">
      <rect x="2" y="2" width="88" height="88" rx="24" fill="#0F766E"/>
      <path d="M47.8 57.2c10.8-1.9 20.9-11.7 24.8-24.2-12.5 3.9-22.3 14-24.2 24.8-3.4-2.7-7.4-4.7-11.7-5.8 1 5.1 3.4 9.8 6.9 13.6 1.5-3 2.9-5.6 4.2-8.4z" fill="#E7FFF8"/>
      <path d="M58.5 37.5c-3.3 1.7-7 4.8-10.2 8.6" stroke="#B8F4DF" stroke-width="4" stroke-linecap="round"/>
      <text x="108" y="44" fill="#0F2136" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif" font-size="30" font-weight="800">Nutri Cloud</text>
      <text x="108" y="68" fill="#5E6E84" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">Rapport nutritionnel</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(logoSvg)}`;
}

function statusLabel(status: string) {
  if (status === "confirmed") return "Confirme";
  if (status === "cancelled") return "Annule";
  return "En attente";
}

function toEventTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function CoachClientsScreen({
  coach,
  selectedClientId,
  onSelectedClientChange
}: {
  coach: Profile;
  selectedClientId?: string;
  onSelectedClientChange?: (clientId: string) => void;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [archived, setArchived] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [notif, setNotif] = useState<any[]>([]);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planDeficit, setPlanDeficit] = useState("20");
  const [planNap, setPlanNap] = useState("1.4");
  const [planMessage, setPlanMessage] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [goalsWeekStart, setGoalsWeekStart] = useState(mondayIso());
  const [goalsDraft, setGoalsDraft] = useState<Array<{ title: string; target?: string; done?: boolean }>>([
    { title: "Marcher 8000 pas", target: "", done: false }
  ]);

  const applySelectedClient = (client: any | null, notify = true) => {
    setSelected(client);
    if (notify) onSelectedClientChange?.(client?.id || "");
    if (!client) return;
    setPlanDeficit(String(client.deficit || 20));
    setPlanNap(String(client.nap || 1.4));
    setPlanMessage(client.coachMessage || "");
    setGoalsWeekStart(client.goals?.[0]?.weekStart || mondayIso());
    setGoalsDraft(
      (client.goals?.[0]?.goals || [{ title: "Objectif 1", done: false }]).map((g: any, idx: number) => ({
        title: String(g?.title || `Objectif ${idx + 1}`),
        target: typeof g?.target === "string" ? g.target : "",
        done: Boolean(g?.done)
      }))
    );
  };

  const load = async (preserveClientId?: string) => {
    setBusy(true);
    setError("");
    try {
      const data = await loadCoachClientsWithData(coach.id);
      const c = data.clients || [];
      setClients(c);
      setArchived(data.archivedClients || []);
      setNotif(data.notifications || []);
      const targetClientId = preserveClientId || selectedClientId;
      const preserved = targetClientId ? c.find((x: any) => x.id === targetClientId) : null;
      const nextSelected = preserved || c[0] || null;
      applySelectedClient(nextSelected);
      if (!nextSelected) {
        setGoalsWeekStart(mondayIso());
        setGoalsDraft([{ title: "Marcher 8000 pas", target: "", done: false }]);
      }
    } catch (err: any) {
      setError(err?.message || "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    load();
  }, [coach.id]);

  React.useEffect(() => {
    if (!selectedClientId || !clients.length) return;
    if (selected?.id === selectedClientId) return;
    const match = clients.find((c: any) => c.id === selectedClientId) || null;
    if (match) applySelectedClient(match, false);
  }, [selectedClientId, clients, selected?.id]);

  const clientBilan = useMemo(() => {
    if (!selected) return null;
    const bmr = calcBMR(selected.weight, selected.height, selected.age, selected.sex);
    const tdee = calcTDEE(bmr, Number(planNap || selected.nap));
    const cals = calcDeficit(tdee, Number(planDeficit || selected.deficit));
    const macros = calcMacros(selected.weight, cals);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), deficitCalories: Math.round(cals), macros };
  }, [selected, planDeficit, planNap]);

  const clientTimeline = useMemo(() => {
    if (!selected) return [];
    const events: Array<{ id: string; time: number; title: string; detail: string; sourceType: "weight" | "checkin" | "report" | "appointment"; sourceId: string }> = [];
    for (const w of selected.history || []) {
      events.push({
        id: `w-${w.id}`,
        time: toEventTime(`${w.date}T12:00:00`),
        title: "Poids",
        detail: `${w.date} • ${w.weight} kg`,
        sourceType: "weight",
        sourceId: w.id
      });
    }
    for (const c of selected.checkins || []) {
      events.push({
        id: `c-${c.id}`,
        time: toEventTime(`${c.weekStart}T12:00:00`),
        title: "Ressenti",
        detail: `${c.weekStart} • score ${c.score}/10`,
        sourceType: "checkin",
        sourceId: c.id
      });
    }
    for (const r of selected.reports || []) {
      events.push({
        id: `r-${r.id}`,
        time: toEventTime(`${r.date}T12:00:00`),
        title: "Rapport",
        detail: `${r.date} • ${r.message || "-"}`,
        sourceType: "report",
        sourceId: r.id
      });
    }
    for (const a of selected.appointments || []) {
      events.push({
        id: `a-${a.id}`,
        time: toEventTime(a.startsAt),
        title: "Rendez-vous",
        detail: `${new Date(a.startsAt).toLocaleString("fr-FR")} • ${statusLabel(a.status || "requested")}`,
        sourceType: "appointment",
        sourceId: a.id
      });
    }
    return events.sort((x, y) => y.time - x.time).slice(0, 12);
  }, [selected]);

  const latestWeight = useMemo(() => {
    if (!selected) return null;
    const rows = (selected.history || []).slice().sort((a: any, b: any) => {
      const aTs = new Date(a?.createdAt || `${a?.date || ""}T12:00:00`).getTime();
      const bTs = new Date(b?.createdAt || `${b?.date || ""}T12:00:00`).getTime();
      return bTs - aTs;
    });
    return rows[0] || null;
  }, [selected]);

  const latestCheckin = useMemo(() => {
    if (!selected) return null;
    const rows = (selected.checkins || []).slice().sort((a: any, b: any) => {
      const aTs = new Date(a?.updatedAt || `${a?.weekStart || ""}T12:00:00`).getTime();
      const bTs = new Date(b?.updatedAt || `${b?.weekStart || ""}T12:00:00`).getTime();
      return bTs - aTs;
    });
    return rows[0] || null;
  }, [selected]);

  const savePlan = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateClientPlan(selected.id, {
        deficit: Number(planDeficit),
        nap: Number(planNap),
        coachMessage: planMessage
      });
      await load(selected.id);
      Alert.alert("Plan client", "Plan sauvegarde.");
    } catch (err: any) {
      setError(err?.message || "Sauvegarde plan impossible.");
    } finally {
      setBusy(false);
    }
  };

  const createReport = async () => {
    if (!selected || !clientBilan) return;
    setBusy(true);
    try {
      await createClientReport(coach.id, selected.id, todayIso(), reportMessage, clientBilan);
      const logoDataUri = getPdfLogoDataUri();
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #0f2136; }
              .header { border-bottom: 1px solid #dbe6f0; padding-bottom: 14px; margin-bottom: 16px; }
              .logo { width: 240px; max-width: 100%; height: auto; display: block; }
              h1 { margin: 0 0 10px; font-size: 22px; }
              .muted { color: #60748e; margin-bottom: 16px; }
              .card { border: 1px solid #dbe6f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
              .line { margin: 6px 0; }
            </style>
          </head>
          <body>
            <div class="header">
              <img class="logo" src="${logoDataUri}" alt="Nutri Cloud" />
            </div>
            <h1>Bilan coach - ${escapeHtml(selected.name || selected.email || "Client")}</h1>
            <div class="muted">Date: ${escapeHtml(todayIso())}</div>
            <div class="card">
              <div class="line"><strong>BMR:</strong> ${clientBilan.bmr} kcal</div>
              <div class="line"><strong>TDEE:</strong> ${clientBilan.tdee} kcal</div>
              <div class="line"><strong>Calories cible:</strong> ${clientBilan.deficitCalories} kcal</div>
              <div class="line"><strong>Deficit:</strong> ${escapeHtml(planDeficit)}%</div>
              <div class="line"><strong>Macros:</strong> Proteines ${clientBilan.macros.protein}g / Lipides ${clientBilan.macros.fat}g / Glucides ${clientBilan.macros.carbs}g</div>
            </div>
            <div class="card">
              <div class="line"><strong>Message coach:</strong></div>
              <div class="line">${escapeHtml(reportMessage || "-")}</div>
            </div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Partager le bilan PDF"
        });
      } else {
        Alert.alert("PDF cree", `Fichier genere: ${uri}`);
      }
      setReportMessage("");
      await load(selected.id);
      Alert.alert("Rapport cree", "Le rapport est enregistre et le PDF est genere.");
    } catch (err: any) {
      setError(err?.message || "Creation du rapport impossible.");
    } finally {
      setBusy(false);
    }
  };

  const saveGoals = async () => {
    if (!selected) return;
    const normalized = (goalsDraft || [])
      .map((g, idx) => ({
        title: String(g?.title || "").trim() || `Objectif ${idx + 1}`,
        done: Boolean(g?.done),
        target: String(g?.target || "").trim()
      }))
      .filter((g) => Boolean(g.title));
    if (!normalized.length) {
      setError("Ajoute au moins un objectif.");
      return;
    }
    setBusy(true);
    try {
      await saveWeeklyGoalsByCoach(coach.id, selected.id, goalsWeekStart || mondayIso(), normalized);
      await load(selected.id);
      Alert.alert("Objectifs", "Objectifs hebdo sauvegardes.");
    } catch (err: any) {
      setError(err?.message || "Sauvegarde objectifs impossible.");
    } finally {
      setBusy(false);
    }
  };

  const removeTimelineItem = async (event: { sourceType: "weight" | "checkin" | "report" | "appointment"; sourceId: string }) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      if (event.sourceType === "weight") await deleteWeightEntry(selected.id, event.sourceId);
      if (event.sourceType === "checkin") await deleteWeeklyCheckin(selected.id, event.sourceId);
      if (event.sourceType === "report") await deleteClientReport(event.sourceId);
      if (event.sourceType === "appointment") await deleteAppointment(event.sourceId);
      await load(selected.id);
    } catch (err: any) {
      setError(err?.message || "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  };

  const removeReportItem = async (reportId: string) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await deleteClientReport(reportId);
      await load(selected.id);
    } catch (err: any) {
      setError(err?.message || "Suppression du rapport impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Card>
          <Title>Clients</Title>
          {!clients.length ? <Text style={styles.meta}>Aucun client.</Text> : null}
          {clients.length ? (
            <View style={styles.dropdownWrap}>
              <Pressable
                style={styles.dropdownTrigger}
                onPress={() => setClientMenuOpen((v) => !v)}
                disabled={busy}
              >
                <Text style={styles.dropdownLabel}>{selected?.name || selected?.email || "Selectionner un client"}</Text>
                <Text style={styles.dropdownChevron}>{clientMenuOpen ? "▴" : "▾"}</Text>
              </Pressable>
              {clientMenuOpen ? (
                <View style={styles.dropdownMenu}>
                  {clients.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[styles.dropdownItem, selected?.id === c.id && styles.dropdownItemActive]}
                      onPress={() => {
                        applySelectedClient(c);
                        setClientMenuOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>
                        {c.name || c.email}
                        {selected?.id === c.id ? " ✓" : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {selected ? (
            <GhostButton
              label="Archiver client"
              onPress={() => archiveAndDeleteClient(selected.id).then(() => load())}
              disabled={busy}
            />
          ) : null}
        </Card>

        <Card>
          <Title>Synthese client connectee</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected ? (
            <>
              <Text style={styles.line}>Client: {selected.name || selected.email}</Text>
              <Text style={styles.meta}>
                Dernier poids: {latestWeight?.weight ?? selected.weight} kg ({latestWeight?.date || "profil"})
              </Text>
              <Text style={styles.meta}>
                Dernier ressenti: {latestCheckin ? `${latestCheckin.score}/10 (${latestCheckin.weekStart})` : "aucun"}
              </Text>
              <Text style={styles.meta}>
                Objectifs semaine: {selected.goals?.[0]?.goals?.length || 0}
              </Text>
              <Text style={styles.meta}>
                Rapports: {selected.reports?.length || 0} • Photos: {selected.photos?.length || 0}
              </Text>
              <Text style={styles.meta}>
                Rendez-vous: {selected.appointments?.length || 0}
              </Text>
            </>
          ) : null}
        </Card>

        <Card>
          <Title>Bilan metabolique</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected && clientBilan ? (
            <>
              <Text style={styles.line}>BMR: {clientBilan.bmr} kcal</Text>
              <Text style={styles.line}>TDEE: {clientBilan.tdee} kcal</Text>
              <Text style={styles.line}>Calories cible: {clientBilan.deficitCalories} kcal</Text>
              <Text style={styles.meta}>Deficit: {planDeficit}%</Text>
              <Text style={styles.meta}>
                Macros: Proteines {clientBilan.macros.protein}g / Lipides {clientBilan.macros.fat}g / Glucides {clientBilan.macros.carbs}g
              </Text>
              <Text style={styles.meta}>Parametres: NAP {planNap} / Methode MB {selected.bmrMethod || "mifflin"}</Text>
            </>
          ) : null}
        </Card>

        <Card>
          <Title>Timeline client</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected && !clientTimeline.length ? <Text style={styles.meta}>Aucun evenement.</Text> : null}
          {clientTimeline.map((event) => (
            <View key={event.id} style={styles.timelineRow}>
              <View style={styles.inlineBetween}>
                <Text style={styles.timelineTitle}>{event.title}</Text>
                <GhostButton label="✕" onPress={() => removeTimelineItem(event)} disabled={busy} />
              </View>
              <Text style={styles.meta}>{event.detail}</Text>
            </View>
          ))}
        </Card>

        <Card>
          <Title>Rapports client</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected && !(selected.reports || []).length ? <Text style={styles.meta}>Aucun rapport.</Text> : null}
          {(selected?.reports || []).slice(0, 8).map((entry: any) => (
            <View key={entry.id} style={styles.block}>
              <View style={styles.inlineBetween}>
                <Text style={styles.line}>{entry.date}</Text>
                <GhostButton label="✕" onPress={() => removeReportItem(entry.id)} disabled={busy} />
              </View>
              <Text style={styles.meta}>{entry.message || "-"}</Text>
            </View>
          ))}
        </Card>

        <Card>
          <Title>Rendez-vous client</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected && !(selected.appointments || []).length ? <Text style={styles.meta}>Aucun rendez-vous.</Text> : null}
          {(selected?.appointments || []).slice(0, 12).map((entry: any) => (
            <View key={entry.id} style={styles.block}>
              <View style={styles.row}>
                <Text style={styles.line}>{new Date(entry.startsAt).toLocaleString("fr-FR")}</Text>
                <View
                  style={[
                    styles.statusPill,
                    entry.status === "confirmed"
                      ? styles.statusConfirmed
                      : entry.status === "cancelled"
                        ? styles.statusCancelled
                        : styles.statusRequested
                  ]}
                >
                  <Text style={styles.statusPillText}>{statusLabel(entry.status || "requested")}</Text>
                </View>
              </View>
              {entry.notes ? <Text style={styles.meta}>{entry.notes}</Text> : null}
            </View>
          ))}
        </Card>

        <Card>
          <Title>Photos client</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected ? <Text style={styles.meta}>Total photos: {(selected.photos || []).length}</Text> : null}
          {(selected?.photos || []).slice(0, 8).map((entry: any) => (
            <Text key={entry.id} style={styles.line}>
              {new Date(entry.createdAt).toLocaleDateString("fr-FR")} - {entry.caption || "Photo progression"}
            </Text>
          ))}
        </Card>

        <Card>
          <Title>Plan client</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected ? (
            <>
              <Text style={styles.meta}>Deficit rapide</Text>
              <View style={styles.quickRow}>
                {[15, 20, 25, 30].map((v) => (
                  <GhostButton key={`d-${v}`} label={`${v}%`} onPress={() => setPlanDeficit(String(v))} disabled={busy} />
                ))}
              </View>
              <Text style={styles.meta}>NAP rapide</Text>
              <View style={styles.quickRow}>
                {[1.3, 1.4, 1.5, 1.6].map((v) => (
                  <GhostButton key={`n-${v}`} label={String(v)} onPress={() => setPlanNap(String(v))} disabled={busy} />
                ))}
              </View>
              <Field value={planDeficit} onChangeText={setPlanDeficit} keyboardType="numeric" placeholder="Deficit %" />
              <Field value={planNap} onChangeText={setPlanNap} keyboardType="numeric" placeholder="NAP" />
              <Field value={planMessage} onChangeText={setPlanMessage} placeholder="Message coach" />
              <PrimaryButton label="Sauvegarder plan" onPress={savePlan} disabled={busy} />
            </>
          ) : null}
        </Card>

        <Card>
          <Title>Rapport</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected ? (
            <>
              <Text style={styles.meta}>Templates message</Text>
              <View style={styles.quickRow}>
                <GhostButton label="Bravo semaine" onPress={() => setReportMessage("Excellente semaine, continue comme ca.")} disabled={busy} />
                <GhostButton label="Ajustement calories" onPress={() => setReportMessage("On ajuste legerement les calories pour optimiser la progression.")} disabled={busy} />
              </View>
              <View style={styles.quickRow}>
                <GhostButton label="Focus sommeil" onPress={() => setReportMessage("Priorite au sommeil et a la regularite cette semaine.")} disabled={busy} />
                <GhostButton label="Hydratation + pas" onPress={() => setReportMessage("Objectif: hydratation reguliere et marche quotidienne.")} disabled={busy} />
              </View>
              <Field value={reportMessage} onChangeText={setReportMessage} placeholder="Message du rapport" />
              <PrimaryButton label="Creer rapport" onPress={createReport} disabled={busy} />
            </>
          ) : null}
        </Card>

        <Card>
          <Title>Objectifs hebdo</Title>
          {!selected ? <Text style={styles.meta}>Selectionne un client.</Text> : null}
          {selected ? (
            <>
              <Field value={goalsWeekStart} onChangeText={setGoalsWeekStart} placeholder="Semaine (YYYY-MM-DD)" />
              {(goalsDraft || []).map((goal, idx) => (
                <View key={`goal-${idx}`} style={styles.goalEditRow}>
                  <Field
                    value={goal.title}
                    onChangeText={(v) =>
                      setGoalsDraft((prev) => prev.map((g, i) => (i === idx ? { ...g, title: v } : g)))
                    }
                    placeholder={`Objectif ${idx + 1}`}
                  />
                  <Field
                    value={goal.target || ""}
                    onChangeText={(v) =>
                      setGoalsDraft((prev) => prev.map((g, i) => (i === idx ? { ...g, target: v } : g)))
                    }
                    placeholder="Cible (optionnel)"
                  />
                  <View style={styles.row}>
                    <GhostButton
                      label={goal.done ? "Fait ✓" : "Pas fait"}
                      onPress={() => setGoalsDraft((prev) => prev.map((g, i) => (i === idx ? { ...g, done: !g.done } : g)))}
                      disabled={busy}
                    />
                    <GhostButton
                      label="Supprimer"
                      onPress={() => setGoalsDraft((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={busy || goalsDraft.length <= 1}
                    />
                  </View>
                </View>
              ))}
              <GhostButton
                label="Ajouter un objectif"
                onPress={() => setGoalsDraft((prev) => [...prev, { title: "", target: "", done: false }])}
                disabled={busy}
              />
              <PrimaryButton label="Sauvegarder objectifs" onPress={saveGoals} disabled={busy} />
            </>
          ) : null}
        </Card>

        <Card>
          <Title>Clients archives</Title>
          {!archived.length ? <Text style={styles.meta}>Aucun archive.</Text> : null}
          {archived.map((a) => (
            <View key={a.id} style={styles.row}>
              <Text style={styles.line}>{a.profile?.name || "Client"} • {a.archived_at?.slice(0, 10)}</Text>
              <GhostButton label="Restaurer" onPress={() => restoreArchivedClient(a.id).then(() => load())} disabled={busy} />
            </View>
          ))}
        </Card>

        <Card>
          <Title>Notifications coach</Title>
          {!notif.length ? <Text style={styles.meta}>Aucune notification.</Text> : null}
          {notif.slice(0, 20).map((n) => (
            <View key={n.id} style={styles.block}>
              <Text style={styles.line}>{n.title}</Text>
              <Text style={styles.meta}>{n.body}</Text>
              <GhostButton label={n.readAt ? "Lue" : "Marquer lue"} onPress={() => markNotificationRead(n.id).then(() => load())} disabled={busy || Boolean(n.readAt)} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  dropdownWrap: { gap: 6 },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: "#dbe6f0",
    borderRadius: 10,
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  dropdownLabel: { color: "#18314c", fontWeight: "700", flex: 1, paddingRight: 8 },
  dropdownChevron: { color: "#60748e", fontWeight: "800" },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: "#dbe6f0",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  dropdownItem: { paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#edf2f7" },
  dropdownItemActive: { backgroundColor: "#eef5ff" },
  dropdownItemText: { color: "#18314c", fontWeight: "600" },
  row: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between" },
  inlineBetween: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between" },
  quickRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  timelineRow: { borderTopWidth: 1, borderTopColor: "#eef2f7", paddingTop: 8, marginTop: 8, gap: 2 },
  timelineTitle: { color: "#18314c", fontWeight: "700" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusConfirmed: { backgroundColor: "#e8f7ee" },
  statusCancelled: { backgroundColor: "#fdeced" },
  statusRequested: { backgroundColor: "#eef3fb" },
  statusPillText: { fontSize: 12, fontWeight: "800", color: "#27415f" },
  goalEditRow: { borderWidth: 1, borderColor: "#dde6f0", borderRadius: 10, padding: 8, gap: 8 },
  block: { borderWidth: 1, borderColor: "#dde6f0", borderRadius: 10, padding: 8, gap: 4 },
  line: { color: "#18314c", fontWeight: "600", flex: 1 },
  meta: { color: "#60748e" },
  error: { color: "#b4232f", paddingHorizontal: 12 }
});
