import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  cancelAppointment,
  listClientAppointmentsForCoach,
  listClientWeeklyCheckinsForCoach,
  listCoachClients,
  updateAppointmentByCoach
} from "../../lib/api";
import type { Appointment, Profile, WeeklyCheckin } from "../../types/models";
import { Card, GhostButton, Screen, Title } from "../../components/ui";

export function CoachDashboardScreen() {
  const [clients, setClients] = useState<Profile[]>([]);
  const [selectedClient, setSelectedClient] = useState<Profile | null>(null);
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadClients = async () => {
    setBusy(true);
    setError("");
    try {
      const rows = await listCoachClients();
      setClients(rows);
      const first = rows[0] || null;
      setSelectedClient(first);
      if (first) {
        const [weekly, appts] = await Promise.all([
          listClientWeeklyCheckinsForCoach(first.id),
          listClientAppointmentsForCoach(first.id)
        ]);
        setCheckins(weekly);
        setAppointments(appts);
      } else {
        setCheckins([]);
        setAppointments([]);
      }
    } catch (err: any) {
      setError(err?.message || "Chargement coach impossible.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    loadClients();
  }, []);

  const reloadSelectedClientData = async (client: Profile) => {
    const [weekly, appts] = await Promise.all([
      listClientWeeklyCheckinsForCoach(client.id),
      listClientAppointmentsForCoach(client.id)
    ]);
    setCheckins(weekly);
    setAppointments(appts);
  };

  const selectClient = async (client: Profile) => {
    setSelectedClient(client);
    setBusy(true);
    try {
      await reloadSelectedClientData(client);
    } finally {
      setBusy(false);
    }
  };

  const onConfirmAppointment = async (apt: Appointment) => {
    if (!selectedClient) return;
    setBusy(true);
    try {
      await updateAppointmentByCoach({ appointmentId: apt.id, status: "confirmed" });
      await reloadSelectedClientData(selectedClient);
    } finally {
      setBusy(false);
    }
  };

  const onCancelAppointmentByCoach = async (apt: Appointment) => {
    if (!selectedClient) return;
    setBusy(true);
    try {
      await cancelAppointment(apt.id);
      await reloadSelectedClientData(selectedClient);
    } finally {
      setBusy(false);
    }
  };

  const latestCheckin = useMemo(() => checkins[0] || null, [checkins]);
  const upcomingAppointments = useMemo(
    () => appointments.filter((apt) => new Date(apt.startsAt).getTime() >= Date.now() && apt.status !== "cancelled"),
    [appointments]
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>Espace coach</Title>
          <Text style={styles.hint}>Selectionne un client pour suivre ses ressentis hebdo et ses rendez-vous.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Clients</Text>
              <Text style={styles.statValue}>{clients.length}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>RDV a venir</Text>
              <Text style={styles.statValue}>{upcomingAppointments.length}</Text>
            </View>
          </View>
          <View style={styles.clientWrap}>
            {clients.map((client) => (
              <GhostButton key={client.id} label={selectedClient?.id === client.id ? `${client.name || client.email} ✓` : client.name || client.email} onPress={() => selectClient(client)} disabled={busy} />
            ))}
          </View>
        </Card>

        <Card>
          <Title>Ressenti hebdomadaire</Title>
          {selectedClient ? <Text style={styles.hint}>Client: {selectedClient.name || selectedClient.email}</Text> : null}
          {!latestCheckin ? <Text style={styles.hint}>Aucun ressenti enregistre.</Text> : null}
          {latestCheckin ? (
            <View style={styles.dayBlock}>
              <Text style={styles.dayTitle}>Dernier score: {latestCheckin.score}/10 ({latestCheckin.weekStart})</Text>
              <Text style={styles.line}>Energie: {latestCheckin.energy}/10</Text>
              <Text style={styles.line}>Faim: {latestCheckin.hunger}/10</Text>
              <Text style={styles.line}>Sommeil: {latestCheckin.sleep}/10</Text>
              <Text style={styles.line}>Stress: {latestCheckin.stress}/10</Text>
              <Text style={styles.line}>Suivi plan: {latestCheckin.adherence}/10</Text>
              {latestCheckin.notes ? <Text style={styles.line}>Notes: {latestCheckin.notes}</Text> : null}
            </View>
          ) : null}
          {checkins.slice(1, 5).map((c) => (
            <Text key={c.id} style={styles.hint}>- {c.weekStart}: {c.score}/10</Text>
          ))}
        </Card>

        <Card>
          <Title>Rendez-vous client</Title>
          {!appointments.length ? <Text style={styles.hint}>Aucun rendez-vous.</Text> : null}
          {appointments.map((apt) => (
            <View key={apt.id} style={styles.dayBlock}>
              <Text style={styles.dayTitle}>{new Date(apt.startsAt).toLocaleString("fr-FR")}</Text>
              <Text style={styles.line}>Statut: {apt.status}</Text>
              {apt.meetUrl ? <Text style={styles.line}>Meet: {apt.meetUrl}</Text> : null}
              <View style={styles.actionsRow}>
                {apt.status !== "confirmed" && apt.status !== "cancelled" ? (
                  <GhostButton label="Confirmer" onPress={() => onConfirmAppointment(apt)} disabled={busy} />
                ) : null}
                {apt.status !== "cancelled" ? (
                  <GhostButton label="Annuler" onPress={() => onCancelAppointmentByCoach(apt)} disabled={busy} />
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  hint: { color: "#5f738e" },
  error: { color: "#b4232f" },
  clientWrap: { gap: 8, marginTop: 10 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  statBox: { flex: 1, borderWidth: 1, borderColor: "#dbe4f0", borderRadius: 10, padding: 8, backgroundColor: "#f7fbff" },
  statLabel: { color: "#60748e", fontSize: 12, fontWeight: "600" },
  statValue: { color: "#1f354f", fontWeight: "800", fontSize: 18 },
  metric: { color: "#1f354f", fontWeight: "700" },
  dayBlock: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 10,
    padding: 8,
    gap: 2
  },
  dayTitle: { color: "#132a44", fontWeight: "700" },
  line: { color: "#4f627d" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 6 }
});
