import React, { useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { cancelAppointment, deleteAppointment, listClientAppointmentsForCoach, listCoachClients, updateAppointmentByCoach } from "../../lib/api";
import type { Appointment, Profile } from "../../types/models";
import { Card, Field, GhostButton, PrimaryButton, Screen, Title } from "../../components/ui";

type AppointmentWithClient = Appointment & {
  clientName: string;
  clientEmail: string;
};

function statusLabel(status: string) {
  if (status === "confirmed") return "Confirme";
  if (status === "cancelled") return "Annule";
  return "En attente";
}

function isWithinCoachAvailability(start: Date, end: Date) {
  const day = start.getDay();
  const allowedDays = new Set([1, 2, 4, 5, 6]); // lun, mar, jeu, ven, sam
  if (!allowedDays.has(day)) return false;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return startMinutes >= 9 * 60 + 30 && endMinutes <= 20 * 60 && end > start;
}

function toDatetimeLocalValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - timezoneOffset);
  return local.toISOString().slice(0, 16);
}

function toDayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonthsLocal(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function mondayStartIndex(jsDay: number) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function buildCalendarCells(month: Date) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = mondayStartIndex(firstOfMonth.getDay());
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startOffset);
  return Array.from({ length: 42 }).map((_, idx) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + idx);
    return {
      dateKey: toDayKey(d.toISOString()),
      day: d.getDate(),
      inMonth: d.getMonth() === month.getMonth()
    };
  });
}

export function CoachAppointmentsScreen() {
  const [clients, setClients] = useState<Profile[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithClient[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AppointmentWithClient | null>(null);
  const [startsAtLocalDraft, setStartsAtLocalDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("45");
  const [statusDraft, setStatusDraft] = useState("requested");
  const [meetUrlDraft, setMeetUrlDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toDayKey(new Date().toISOString()));

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const rows = await listCoachClients();
      setClients(rows);
      const byClient = await Promise.all(rows.map(async (client) => {
        const appts = await listClientAppointmentsForCoach(client.id);
        return appts.map((apt) => ({
          ...apt,
          clientName: client.name || "Client",
          clientEmail: client.email || ""
        }));
      }));
      const flattened = byClient.flat().sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      setAppointments(flattened);
    } catch (err: any) {
      setError(err?.message || "Impossible de charger les rendez-vous.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const openEdit = (apt: AppointmentWithClient) => {
    setEditing(apt);
    setStartsAtLocalDraft(toDatetimeLocalValue(apt.startsAt));
    const duration = Math.max(15, Math.round((new Date(apt.endsAt).getTime() - new Date(apt.startsAt).getTime()) / 60000));
    setDurationDraft(String(duration));
    setStatusDraft(apt.status || "requested");
    setMeetUrlDraft(apt.meetUrl || "");
    setNotesDraft(apt.notes || "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!startsAtLocalDraft) {
      setError("Date/heure du rendez-vous requise.");
      return;
    }
    const startDate = new Date(startsAtLocalDraft);
    if (Number.isNaN(startDate.getTime())) {
      setError("Format date/heure invalide. Utilise YYYY-MM-DDTHH:mm");
      return;
    }
    const duration = Math.max(15, Number(durationDraft) || 45);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    if (!isWithinCoachAvailability(startDate, endDate)) {
      setError("Disponibilites: lun, mar, jeu, ven, sam de 09:30 a 20:00.");
      return;
    }
    const trimmedMeet = meetUrlDraft.trim();
    if (trimmedMeet) {
      const normalized = /^https?:\/\//i.test(trimmedMeet) ? trimmedMeet : `https://${trimmedMeet}`;
      let parsed: URL;
      try {
        parsed = new URL(normalized);
      } catch {
        setError("Lien Google Meet invalide.");
        return;
      }
      const host = parsed.hostname.toLowerCase();
      if (host !== "meet.google.com" && !host.endsWith(".meet.google.com")) {
        setError("Le lien doit etre un Google Meet (meet.google.com).");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await updateAppointmentByCoach({
        appointmentId: editing.id,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        status: statusDraft,
        meetUrl: meetUrlDraft,
        notes: notesDraft
      });
      setEditing(null);
      await load();
      Alert.alert("Rendez-vous", "Rendez-vous mis a jour.");
    } catch (err: any) {
      setError(err?.message || "Mise a jour rendez-vous impossible.");
    } finally {
      setBusy(false);
    }
  };

  const cancelByCoach = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await cancelAppointment(editing.id);
      setEditing(null);
      await load();
      Alert.alert("Rendez-vous", "Rendez-vous annule.");
    } catch (err: any) {
      setError(err?.message || "Annulation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const deleteByCoach = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await deleteAppointment(editing.id);
      setEditing(null);
      await load();
      Alert.alert("Rendez-vous", "Rendez-vous supprime.");
    } catch (err: any) {
      setError(err?.message || "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  };

  const cancelFromList = async (appointmentId: string) => {
    setBusy(true);
    setError("");
    try {
      await cancelAppointment(appointmentId);
      await load();
      Alert.alert("Rendez-vous", "Rendez-vous annule.");
    } catch (err: any) {
      setError(err?.message || "Annulation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AppointmentWithClient[]>();
    for (const apt of appointments) {
      const key = toDayKey(apt.startsAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(apt);
    }
    return map;
  }, [appointments]);

  const upcomingCount = useMemo(
    () => appointments.filter((apt) => new Date(apt.startsAt).getTime() >= Date.now() && apt.status !== "cancelled").length,
    [appointments]
  );
  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    [calendarMonth]
  );
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
  const selectedDayAppointments = useMemo(
    () => (appointmentsByDate.get(selectedCalendarDate) || []).slice().sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointmentsByDate, selectedCalendarDate]
  );
  const allAppointmentsDesc = useMemo(
    () => appointments.slice().sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    [appointments]
  );

  const openMeet = async (url: string) => {
    try {
      const raw = (url || "").trim();
      if (!raw) return;
      const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      await Linking.openURL(value);
    } catch {
      Alert.alert("Lien Meet", "Impossible d'ouvrir ce lien Meet.");
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>Rendez-vous visio</Title>
          <Text style={styles.hint}>{appointments.length} rendez-vous</Text>
          <View style={styles.monthHead}>
            <GhostButton label="Mois precedent" onPress={() => setCalendarMonth((prev) => addMonthsLocal(prev, -1))} disabled={busy} />
            <Text style={styles.monthLabel}>{calendarMonthLabel}</Text>
            <GhostButton label="Mois suivant" onPress={() => setCalendarMonth((prev) => addMonthsLocal(prev, 1))} disabled={busy} />
          </View>
          <View style={styles.weekRow}>
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
              <Text key={label} style={styles.weekLabel}>{label}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendarCells.map((cell) => {
              const count = (appointmentsByDate.get(cell.dateKey) || []).length;
              const selected = cell.dateKey === selectedCalendarDate;
              return (
                <Pressable
                  key={cell.dateKey}
                  onPress={() => setSelectedCalendarDate(cell.dateKey)}
                  style={[
                    styles.dayCell,
                    !cell.inMonth && styles.dayOutside,
                    selected && styles.daySelected
                  ]}
                  disabled={busy}
                >
                  <Text style={[styles.dayText, !cell.inMonth && styles.dayTextOutside]}>{cell.day}</Text>
                  {count > 0 ? <Text style={styles.dayCount}>{count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.dayTitle}>
            Rendez-vous du {new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString("fr-FR")}
          </Text>
          {!selectedDayAppointments.length ? <Text style={styles.hint}>Aucun rendez-vous ce jour.</Text> : null}
          {selectedDayAppointments.map((apt) => (
            <View key={`day-${apt.id}`} style={styles.dayListRow}>
              <Text style={styles.line}>
                {new Date(apt.startsAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} - {apt.clientName}
              </Text>
              <GhostButton label="Editer" onPress={() => openEdit(apt)} disabled={busy} />
            </View>
          ))}
          {busy ? <Text style={styles.hint}>Chargement...</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.hint}>Clients: {clients.length} • RDV a venir: {upcomingCount}</Text>
        </Card>

        {!allAppointmentsDesc.length && !busy ? <Text style={styles.hint}>Aucun rendez-vous programme.</Text> : null}
        {allAppointmentsDesc.map((apt) => (
          <Card key={apt.id}>
            <View style={styles.rowBetween}>
              <Text style={styles.time}>{new Date(apt.startsAt).toLocaleString("fr-FR")}</Text>
              <View
                style={[
                  styles.statusPill,
                  apt.status === "confirmed"
                    ? styles.statusConfirmed
                    : apt.status === "cancelled"
                      ? styles.statusCancelled
                      : styles.statusRequested
                ]}
              >
                <Text style={styles.statusPillText}>{statusLabel(apt.status || "requested")}</Text>
              </View>
            </View>
            <Text style={styles.client}>{apt.clientName}{apt.clientEmail ? ` (${apt.clientEmail})` : ""}</Text>
            {apt.notes ? <Text style={styles.meta}>{apt.notes}</Text> : null}
            <View style={styles.actionsInline}>
              {apt.meetUrl ? <GhostButton label="Ouvrir Google Meet" onPress={() => openMeet(apt.meetUrl)} disabled={busy} /> : <Text style={styles.hint}>Pas encore de lien visio</Text>}
              <GhostButton label="Modifier" onPress={() => openEdit(apt)} disabled={busy} />
              {apt.status !== "cancelled" ? (
                <GhostButton label="Annuler" onPress={() => cancelFromList(apt.id)} disabled={busy} />
              ) : null}
            </View>
          </Card>
        ))}

        {editing ? (
          <Card>
            <Title>Edition rendez-vous</Title>
            <Text style={styles.meta}>{editing.clientName} • {new Date(editing.startsAt).toLocaleString("fr-FR")}</Text>
            <Text style={styles.label}>Date et heure (YYYY-MM-DDTHH:mm)</Text>
            <Field value={startsAtLocalDraft} onChangeText={setStartsAtLocalDraft} placeholder="2026-03-10T10:00" />
            <Text style={styles.label}>Duree (minutes)</Text>
            <Field value={durationDraft} onChangeText={setDurationDraft} keyboardType="numeric" />
            <Text style={styles.label}>Statut</Text>
            <View style={styles.statusRow}>
              <GhostButton label={statusDraft === "requested" ? "requested ✓" : "requested"} onPress={() => setStatusDraft("requested")} disabled={busy} />
              <GhostButton label={statusDraft === "confirmed" ? "confirmed ✓" : "confirmed"} onPress={() => setStatusDraft("confirmed")} disabled={busy} />
              <GhostButton label={statusDraft === "cancelled" ? "cancelled ✓" : "cancelled"} onPress={() => setStatusDraft("cancelled")} disabled={busy} />
            </View>
            <Text style={styles.label}>Lien Google Meet</Text>
            <Field value={meetUrlDraft} onChangeText={setMeetUrlDraft} placeholder="https://meet.google.com/..." />
            <Text style={styles.label}>Notes coach</Text>
            <Field value={notesDraft} onChangeText={setNotesDraft} placeholder="Notes..." multiline style={{ minHeight: 90 }} />
            <View style={styles.actionsRow}>
              <PrimaryButton label={busy ? "Sauvegarde..." : "Enregistrer rendez-vous"} onPress={saveEdit} disabled={busy} />
              <GhostButton label="Annuler ce rendez-vous" onPress={cancelByCoach} disabled={busy} />
              <GhostButton label="Supprimer le rendez-vous" onPress={deleteByCoach} disabled={busy} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  hint: { color: "#5f738e" },
  error: { color: "#b4232f" },
  monthHead: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  monthLabel: { color: "#10253b", fontWeight: "800", textTransform: "capitalize" },
  weekRow: { marginTop: 8, flexDirection: "row", justifyContent: "space-between" },
  weekLabel: { width: "13%", color: "#5f738e", fontWeight: "700", textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  dayCell: { width: "13%", minHeight: 44, borderColor: "#dbe4f0", borderWidth: 1, borderRadius: 8, justifyContent: "center", alignItems: "center", paddingVertical: 4 },
  dayOutside: { opacity: 0.45 },
  daySelected: { borderColor: "#0b63ce", backgroundColor: "#eef5ff" },
  dayText: { textAlign: "center", fontSize: 12, lineHeight: 14 },
  dayCount: { textAlign: "center", fontSize: 11, lineHeight: 13, color: "#0b63ce", fontWeight: "700" },
  dayTextOutside: { color: "#7f90a4" },
  dayTitle: { color: "#193451", fontWeight: "800", marginTop: 10, marginBottom: 6 },
  dayListRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: "#eef2f7", paddingTop: 8, marginTop: 8 },
  line: { color: "#193451", fontWeight: "600", flex: 1 },
  label: { color: "#49607a", fontWeight: "600" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" },
  time: { color: "#10253b", fontWeight: "800" },
  client: { color: "#193451", fontWeight: "700" },
  meta: { color: "#516783" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusConfirmed: { backgroundColor: "#e8f7ee" },
  statusCancelled: { backgroundColor: "#fdeced" },
  statusRequested: { backgroundColor: "#eef3fb" },
  statusPillText: { fontSize: 12, fontWeight: "800", color: "#27415f" },
  statusRow: { flexDirection: "row", gap: 8 },
  actionsInline: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" },
  actionsRow: { gap: 8 }
});
