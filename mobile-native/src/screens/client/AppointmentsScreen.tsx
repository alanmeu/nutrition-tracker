import React, { useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { bookAppointment, cancelAppointment, deleteAppointment, listBusyAppointmentSlots, listMyAppointments } from "../../lib/api";
import type { Appointment, Profile } from "../../types/models";
import { Card, GhostButton, PrimaryButton, Screen, Title, Field } from "../../components/ui";

function toDatetimeLocalValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - timezoneOffset);
  return local.toISOString().slice(0, 16);
}

function nextWeeklySlotLocal() {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(9, 30, 0, 0);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1);
  }
  while (!isCoachWorkingDay(candidate)) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return toLocalIsoNoSeconds(candidate);
}

function toDayKeyFromDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
      dateKey: toDayKeyFromDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month.getMonth()
    };
  });
}

function toLocalIsoNoSeconds(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function statusLabel(status: string) {
  if (status === "confirmed") return "Confirme";
  if (status === "cancelled") return "Annule";
  return "En attente";
}

function isCoachWorkingDay(date: Date) {
  const day = date.getDay();
  return day === 1 || day === 2 || day === 4 || day === 5 || day === 6;
}

export function AppointmentsScreen({ profile }: { profile: Profile }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [busySlots, setBusySlots] = useState<Array<{ startsAt: string; endsAt: string }>>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() => {
    const seed = new Date(nextWeeklySlotLocal());
    return Number.isNaN(seed.getTime()) ? toDayKeyFromDate(new Date()) : toDayKeyFromDate(seed);
  });
  const [appointmentDraft, setAppointmentDraft] = useState({
    startsAtLocal: nextWeeklySlotLocal(),
    durationMinutes: 45,
    notes: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [mine, busy] = await Promise.all([listMyAppointments(profile.id), listBusyAppointmentSlots()]);
      setAppointments(mine);
      setBusySlots(
        (busy || [])
          .map((x: any) => ({
            startsAt: x.starts_at || x.startsAt,
            endsAt: x.ends_at || x.endsAt
          }))
          .filter((x: any) => Boolean(x.startsAt))
      );
    } catch (err: any) {
      setError(err?.message || "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const selectedSlotIsTaken = useMemo(() => {
    const selected = appointmentDraft.startsAtLocal;
    if (!selected) return false;
    const selectedDate = new Date(selected);
    if (Number.isNaN(selectedDate.getTime())) return false;
    const duration = Number(appointmentDraft.durationMinutes) || 45;
    const selectedStart = selectedDate.getTime();
    const selectedEnd = selectedStart + duration * 60000;
    return busySlots.some((slot) => {
      const s = new Date(slot.startsAt).getTime();
      const e = new Date(slot.endsAt).getTime();
      if (Number.isNaN(s) || Number.isNaN(e)) return false;
      return overlap(selectedStart, selectedEnd, s, e);
    });
  }, [appointmentDraft.startsAtLocal, appointmentDraft.durationMinutes, busySlots]);

  const monthLabel = useMemo(
    () => calendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    [calendarMonth]
  );
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
  const busyCountByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const slot of busySlots) {
      const d = new Date(slot.startsAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = toDayKeyFromDate(d);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [busySlots]);

  const daySlots = useMemo(() => {
    const [yy, mm, dd] = selectedDateKey.split("-").map((x) => Number(x));
    if (!yy || !mm || !dd) return [];
    const selectedDate = new Date(yy, mm - 1, dd, 12, 0, 0, 0);
    if (!isCoachWorkingDay(selectedDate)) return [];
    const duration = Number(appointmentDraft.durationMinutes) || 45;
    const result: Array<{ label: string; value: string; taken: boolean; selected: boolean }> = [];
    const firstSlot = new Date(yy, mm - 1, dd, 9, 30, 0, 0);
    const lastBoundary = new Date(yy, mm - 1, dd, 20, 0, 0, 0).getTime();
    for (let step = 0; step < 24; step += 1) {
      const start = new Date(firstSlot.getTime() + step * 30 * 60000);
      if (start.getTime() >= lastBoundary) break;
      const hour = start.getHours();
      const minute = start.getMinutes();
        const end = new Date(start.getTime() + duration * 60000);
        if (end.getTime() > lastBoundary) continue;
        const taken = busySlots.some((slot) => {
          const s = new Date(slot.startsAt).getTime();
          const e = new Date(slot.endsAt).getTime();
          if (Number.isNaN(s) || Number.isNaN(e)) return false;
          return overlap(start.getTime(), end.getTime(), s, e);
        });
        const value = toLocalIsoNoSeconds(start);
        result.push({
          label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
          value,
          taken,
          selected: appointmentDraft.startsAtLocal === value
        });
    }
    return result;
  }, [selectedDateKey, appointmentDraft.durationMinutes, appointmentDraft.startsAtLocal, busySlots]);

  const upcomingTakenSlots = useMemo(
    () =>
      busySlots
        .slice()
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .slice(0, 8),
    [busySlots]
  );

  const submitAppointment = async () => {
    if (!appointmentDraft.startsAtLocal) return;
    if (selectedSlotIsTaken) return;
    const startsAtDate = new Date(appointmentDraft.startsAtLocal);
    if (Number.isNaN(startsAtDate.getTime())) {
      setError("Format date/heure invalide. Utilise YYYY-MM-DDTHH:mm");
      return;
    }
    const duration = Number(appointmentDraft.durationMinutes) || 45;
    const endsAtDate = new Date(startsAtDate.getTime() + duration * 60000);
    setBusy(true);
    setError("");
    try {
      await bookAppointment(profile.id, startsAtDate.toISOString(), endsAtDate.toISOString(), appointmentDraft.notes);
      setAppointmentDraft({
        startsAtLocal: nextWeeklySlotLocal(),
        durationMinutes: 45,
        notes: ""
      });
      await load();
      Alert.alert("Rendez-vous", "Rendez-vous confirme et lien Meet cree.");
    } catch (err: any) {
      setError(err?.message || "Reservation impossible.");
    } finally {
      setBusy(false);
    }
  };

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
          <Title>Prendre un rendez-vous</Title>
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>1 rendez-vous par semaine max. Les creneaux occupes sont bloques.</Text>
          </View>
          <Text style={styles.label}>Choisis une date dans le calendrier</Text>
          <View style={styles.monthHead}>
            <GhostButton label="Mois precedent" onPress={() => setCalendarMonth((prev) => addMonthsLocal(prev, -1))} disabled={busy} />
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <GhostButton label="Mois suivant" onPress={() => setCalendarMonth((prev) => addMonthsLocal(prev, 1))} disabled={busy} />
          </View>
          <View style={styles.weekRow}>
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
              <Text key={label} style={styles.weekLabel}>{label}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendarCells.map((cell) => {
              const count = busyCountByDate.get(cell.dateKey) || 0;
              const selected = selectedDateKey === cell.dateKey;
              return (
                <Pressable
                  key={cell.dateKey}
                  onPress={() => {
                    setError("");
                    setSelectedDateKey(cell.dateKey);
                    if (appointmentDraft.startsAtLocal && !appointmentDraft.startsAtLocal.startsWith(cell.dateKey)) {
                      setAppointmentDraft((prev) => ({ ...prev, startsAtLocal: "" }));
                    }
                  }}
                  style={[
                    styles.dayCell,
                    !cell.inMonth && styles.dayOutside,
                    selected && styles.daySelected
                  ]}
                  disabled={busy}
                >
                  <Text style={[styles.dayText, !cell.inMonth && styles.dayTextOutside]}>{cell.day}</Text>
                  {count > 0 ? <Text style={styles.dayCount}>{count} pris</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>Choisis un creneau</Text>
          {!daySlots.length ? <Text style={styles.hint}>Disponibilites: lun, mar, jeu, ven, sam de 09:30 a 20:00.</Text> : null}
          <View style={styles.timeGrid}>
            {daySlots.map((slot) => (
              <Pressable
                key={slot.value}
                onPress={() => !slot.taken && setAppointmentDraft((prev) => ({ ...prev, startsAtLocal: slot.value }))}
                style={[
                  styles.timeCell,
                  slot.taken && styles.timeCellTaken,
                  slot.selected && styles.timeCellSelected
                ]}
                disabled={busy || slot.taken}
              >
                <Text style={[styles.timeText, slot.taken && styles.timeTextTaken]}>
                  {slot.label}{slot.taken ? " (occupe)" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
          {appointmentDraft.startsAtLocal ? (
            <View style={styles.selectionBox}>
              <Text style={styles.selectionLabel}>Selection</Text>
              <Text style={styles.selectionValue}>{new Date(appointmentDraft.startsAtLocal).toLocaleString("fr-FR")}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>Aucun creneau selectionne.</Text>
          )}
          <Text style={styles.label}>Duree (minutes)</Text>
          <View style={styles.durationRow}>
            {[30, 45, 60].map((duration) => {
              const selected = Number(appointmentDraft.durationMinutes) === duration;
              return (
                <Pressable
                  key={duration}
                  onPress={() => setAppointmentDraft((prev) => ({ ...prev, durationMinutes: duration }))}
                  style={[styles.durationChip, selected && styles.durationChipSelected]}
                >
                  <Text style={[styles.durationChipText, selected && styles.durationChipTextSelected]}>{duration} min</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>Notes (optionnel)</Text>
          <Field
            value={appointmentDraft.notes}
            onChangeText={(v) => setAppointmentDraft((prev) => ({ ...prev, notes: v }))}
            placeholder="Ex: points a aborder"
          />
          <PrimaryButton label="Prendre rendez-vous" onPress={submitAppointment} disabled={busy || selectedSlotIsTaken} />
          {selectedSlotIsTaken ? <Text style={styles.error}>Ce creneau est deja reserve. Choisis un autre horaire.</Text> : null}
          {upcomingTakenSlots.length ? (
            <View style={styles.slotList}>
              <Text style={styles.label}>Creneaux deja pris</Text>
              {upcomingTakenSlots.map((slot) => (
                <Text key={`${slot.startsAt}-${slot.endsAt}`} style={styles.meta}>
                  {new Date(slot.startsAt).toLocaleString("fr-FR")} (occupe)
                </Text>
              ))}
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>

        <Card>
          <Title>Mes rendez-vous</Title>
          {!appointments.length ? <Text style={styles.hint}>Aucun rendez-vous.</Text> : null}
          {appointments.map((apt) => (
            <View key={apt.id} style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.slotLabel}>{new Date(apt.startsAt).toLocaleString("fr-FR")}</Text>
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
              <View style={{ flex: 1 }}>
                {apt.meetUrl ? <Text style={styles.meta}>Meet: {apt.meetUrl}</Text> : null}
              </View>
              <View style={styles.itemActions}>
                {apt.meetUrl ? (
                  <GhostButton label="Rejoindre le Meet" onPress={() => openMeet(apt.meetUrl)} disabled={busy} />
                ) : null}
                {apt.status !== "cancelled" ? (
                  <GhostButton label="Annuler" onPress={() => cancelAppointment(apt.id).then(load).catch(() => {})} disabled={busy} />
                ) : null}
                <GhostButton label="Supprimer" onPress={() => deleteAppointment(apt.id).then(load).catch(() => {})} disabled={busy} />
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12, paddingBottom: 26 },
  hint: { color: "#60738c" },
  label: { color: "#2f455f", fontWeight: "800", marginTop: 4 },
  infoBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d7e3f3",
    backgroundColor: "#f5f9ff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6
  },
  infoBannerText: { color: "#27415f", fontWeight: "600" },
  monthHead: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  monthLabel: { color: "#10253b", fontWeight: "900", textTransform: "capitalize" },
  weekRow: { marginTop: 8, flexDirection: "row", justifyContent: "space-between" },
  weekLabel: { width: "13%", color: "#5f738e", fontWeight: "700", textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  dayCell: { width: "13%", minHeight: 46, borderColor: "#dbe4f0", borderWidth: 1, borderRadius: 8, justifyContent: "center", alignItems: "center", paddingVertical: 4, backgroundColor: "#ffffff" },
  dayOutside: { opacity: 0.45 },
  daySelected: { borderColor: "#0b63ce", backgroundColor: "#eaf3ff" },
  dayText: { textAlign: "center", fontSize: 12, lineHeight: 14 },
  dayTextOutside: { color: "#7f90a4" },
  dayCount: { textAlign: "center", fontSize: 9, lineHeight: 11, color: "#0b63ce", fontWeight: "800", marginTop: 2 },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  timeCell: { borderWidth: 1, borderColor: "#dbe4f0", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "#ffffff" },
  timeCellTaken: { backgroundColor: "#f3f5f8", borderColor: "#d4dbe5", opacity: 0.7 },
  timeCellSelected: { borderColor: "#0b63ce", backgroundColor: "#eaf3ff" },
  timeText: { color: "#1a2f45", fontWeight: "600" },
  timeTextTaken: { color: "#8a97a9" },
  selectionBox: {
    borderWidth: 1,
    borderColor: "#dbe6f3",
    borderRadius: 10,
    backgroundColor: "#f8fbff",
    padding: 10,
    gap: 2,
    marginTop: 2
  },
  selectionLabel: { color: "#5e7490", fontWeight: "700", fontSize: 12 },
  selectionValue: { color: "#10253b", fontWeight: "800" },
  durationRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  durationChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#fff"
  },
  durationChipSelected: {
    borderColor: "#0b63ce",
    backgroundColor: "#eaf3ff"
  },
  durationChipText: { color: "#29435f", fontWeight: "700" },
  durationChipTextSelected: { color: "#0b63ce", fontWeight: "800" },
  slotLabel: { flex: 1, color: "#1a2f45", fontWeight: "700" },
  item: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#e0e7f1",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#fcfdff"
  },
  itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusConfirmed: { backgroundColor: "#e8f7ee" },
  statusCancelled: { backgroundColor: "#fdeced" },
  statusRequested: { backgroundColor: "#eef3fb" },
  statusPillText: { fontSize: 12, fontWeight: "800", color: "#27415f" },
  itemActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  meta: { color: "#586c87" },
  slotList: { gap: 4, marginTop: 8 },
  error: { color: "#b4232f", fontWeight: "700" }
});
