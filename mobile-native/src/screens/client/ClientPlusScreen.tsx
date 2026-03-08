import React, { useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import {
  createStripeCheckout,
  createStripePortal,
  deleteNotification,
  deleteClientPhoto,
  listMyNotifications,
  listMyPhotos,
  listMyReports,
  listMySubscription,
  listMyWeeklyGoals,
  markNotificationRead,
  updateWeeklyGoalsProgress,
  uploadClientPhoto
} from "../../lib/api";
import type { ClientPhoto, NotificationItem, Profile, ReportEntry, Subscription, WeeklyGoals } from "../../types/models";
import { Card, GhostButton, PrimaryButton, Screen, Title } from "../../components/ui";

export function ClientPlusScreen({ profile }: { profile: Profile }) {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [goals, setGoals] = useState<WeeklyGoals[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadAll = async () => {
    setBusy(true);
    setError("");
    try {
      const [r, g, n, s, p] = await Promise.all([
        listMyReports(profile.id),
        listMyWeeklyGoals(profile.id),
        listMyNotifications(profile.id),
        listMySubscription(profile.id),
        listMyPhotos(profile.id)
      ]);
      setReports(r);
      setGoals(g);
      setNotifications(n);
      setSubscription(s);
      setPhotos(p);
    } catch (err: any) {
      setError(err?.message || "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    loadAll();
  }, [profile.id]);

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadAll();
      }
    });
    return () => sub.remove();
  }, [profile.id]);

  const latestGoals = goals[0] || null;
  const stripeSuccessUrl = React.useMemo(() => Linking.createURL("stripe-success"), []);
  const stripeCancelUrl = React.useMemo(() => Linking.createURL("stripe-cancel"), []);
  const hasActiveSubscription = Boolean(
    subscription && ["active", "trialing", "past_due"].includes((subscription.status || "").toLowerCase())
  );

  const onToggleGoal = async (index: number) => {
    if (!latestGoals) return;
    const next = [...latestGoals.goals];
    next[index] = { ...next[index], done: !next[index]?.done };
    setBusy(true);
    try {
      await updateWeeklyGoalsProgress(profile.id, latestGoals.weekStart, next);
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const onSubscribe = async (planCode: "essential" | "premium") => {
    setBusy(true);
    try {
      const url = await createStripeCheckout(planCode, {
        successUrl: stripeSuccessUrl,
        cancelUrl: stripeCancelUrl
      });
      await WebBrowser.openAuthSessionAsync(url, stripeSuccessUrl);
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const onManageSub = async () => {
    setBusy(true);
    try {
      const url = await createStripePortal(stripeSuccessUrl);
      await WebBrowser.openAuthSessionAsync(url, stripeSuccessUrl);
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const onUploadPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Permission photos refusee.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setBusy(true);
    try {
      await uploadClientPhoto(profile.id, res.assets[0].uri, "Photo progression");
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Card>
          <Title>Abonnement</Title>
          <Text style={styles.meta}>Statut: {subscription?.status || "inactive"}</Text>
          <Text style={styles.meta}>Plan: {!subscription ? "-" : subscription.planCode === "premium" ? "Premium (79€)" : "Essentiel (29€)"}</Text>
          <PrimaryButton label="Essentiel 29€ • 1 visio/mois" onPress={() => onSubscribe("essential")} disabled={busy} />
          <PrimaryButton label="Premium 79€ • 4 visios/mois + WhatsApp" onPress={() => onSubscribe("premium")} disabled={busy} />
          {hasActiveSubscription ? <GhostButton label="Gerer" onPress={onManageSub} disabled={busy} /> : null}
        </Card>

        {hasActiveSubscription ? <Card>
          <Title>Rapports coach</Title>
          {!reports.length ? <Text style={styles.meta}>Aucun rapport.</Text> : null}
          {reports.slice(0, 10).map((r) => (
            <View key={r.id} style={styles.block}>
              <Text style={styles.line}>{r.date}</Text>
              <Text style={styles.meta}>{r.message || "-"}</Text>
            </View>
          ))}
        </Card> : null}

        {hasActiveSubscription ? <Card>
          <Title>Objectifs hebdo</Title>
          {!latestGoals ? <Text style={styles.meta}>Aucun objectif.</Text> : null}
          {latestGoals?.goals?.map((goal, idx) => (
            <View key={`${latestGoals.id}-${idx}`} style={styles.goalRow}>
              <Text style={styles.line}>{goal.title || `Objectif ${idx + 1}`}</Text>
              <GhostButton label={goal.done ? "Fait ✓" : "A faire"} onPress={() => onToggleGoal(idx)} disabled={busy} />
            </View>
          ))}
        </Card> : null}

        {hasActiveSubscription ? <Card>
          <Title>Photos progression</Title>
          <PrimaryButton label="Ajouter photo" onPress={onUploadPhoto} disabled={busy} />
          {photos.map((photo) => (
            <View key={photo.id} style={styles.goalRow}>
              <Text style={styles.meta}>{new Date(photo.createdAt).toLocaleDateString("fr-FR")} • {photo.caption || "Photo"}</Text>
              <GhostButton label="Suppr." onPress={() => deleteClientPhoto(photo.id).then(loadAll)} disabled={busy} />
            </View>
          ))}
        </Card> : null}

        {hasActiveSubscription ? <Card>
          <Title>Notifications</Title>
          {!notifications.length ? <Text style={styles.meta}>Aucune notification.</Text> : null}
          {notifications.slice(0, 20).map((n) => (
            <View key={n.id} style={styles.block}>
              <Text style={styles.line}>{n.title}</Text>
              <Text style={styles.meta}>{n.body}</Text>
              <View style={styles.row}>
                <GhostButton label={n.readAt ? "Lue" : "Marquer lue"} onPress={() => markNotificationRead(n.id).then(loadAll)} disabled={busy || Boolean(n.readAt)} />
                <GhostButton label="Suppr." onPress={() => deleteNotification(n.id).then(loadAll)} disabled={busy} />
              </View>
            </View>
          ))}
        </Card> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  block: { borderWidth: 1, borderColor: "#dde6f0", borderRadius: 10, padding: 8, gap: 4 },
  goalRow: { borderWidth: 1, borderColor: "#dde6f0", borderRadius: 10, padding: 8, gap: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  line: { color: "#18314c", fontWeight: "600" },
  meta: { color: "#60748e" },
  error: { color: "#b4232f", paddingHorizontal: 12 }
});
