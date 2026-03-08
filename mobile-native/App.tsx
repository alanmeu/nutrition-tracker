import "react-native-gesture-handler";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthScreen } from "./src/screens/AuthScreen";
import { hasSupabaseConfig } from "./src/lib/supabase";
import { ensureProfile, getMyProfile, getSession, onAuthStateChange, signOut } from "./src/lib/api";
import type { Profile } from "./src/types/models";
import { ClientHomeScreen } from "./src/screens/client/ClientHomeScreen";
import { AppointmentsScreen } from "./src/screens/client/AppointmentsScreen";
import { MenuScreen } from "./src/screens/client/MenuScreen";
import { BlogScreen } from "./src/screens/client/BlogScreen";
import { GhostButton } from "./src/components/ui";
import { CoachManageScreen } from "./src/screens/coach/CoachManageScreen";
import { ClientPlusScreen } from "./src/screens/client/ClientPlusScreen";
import { CoachClientsScreen } from "./src/screens/coach/CoachClientsScreen";
import { CoachAppointmentsScreen } from "./src/screens/coach/CoachAppointmentsScreen";
import { CoachArchivesScreen } from "./src/screens/coach/CoachArchivesScreen";
import { listMySubscription } from "./src/lib/api";
import { WebParityScreen } from "./src/screens/WebParityScreen";
import { theme } from "./src/components/ui";

type CoachTabKey = "suivi" | "menu" | "rdv" | "blog" | "archives";
type ClientTabKey = "accueil" | "rdv" | "menu" | "blog" | "plus";

const coachTabs: Array<{ key: CoachTabKey; label: string }> = [
  { key: "suivi", label: "Suivi client" },
  { key: "menu", label: "Menu" },
  { key: "rdv", label: "Rendez-vous" },
  { key: "blog", label: "Blog" },
  { key: "archives", label: "Archives" }
];

const clientTabs: Array<{ key: ClientTabKey; label: string }> = [
  { key: "accueil", label: "Mon suivi" },
  { key: "rdv", label: "Rendez-vous" },
  { key: "menu", label: "Menu" },
  { key: "blog", label: "Blog" },
  { key: "plus", label: "Plus" }
];

function Header({ title, onSignOut }: { title: string; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.brandWrap}>
        <View style={styles.brandLogo}>
          <View style={styles.logoLeafMain} />
          <View style={styles.logoLeafAccent} />
        </View>
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandName}>Nutri Cloud</Text>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      </View>
      <GhostButton label="Deconnexion" onPress={onSignOut} />
    </View>
  );
}

function TopNav<T extends string>({
  items,
  active,
  onChange
}: {
  items: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.navWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <Pressable key={item.key} onPress={() => onChange(item.key)} style={styles.navButton}>
              <Text style={[styles.navText, isActive ? styles.navTextActive : null]}>{item.label}</Text>
              <View style={[styles.navUnderline, isActive ? styles.navUnderlineActive : null]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function App() {
  const forceWebParity = (process.env.EXPO_PUBLIC_FORCE_WEB_PARITY || "false").toLowerCase() !== "false";
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("inactive");
  const [error, setError] = useState("");
  const [coachTab, setCoachTab] = useState<CoachTabKey>("suivi");
  const [selectedCoachClientId, setSelectedCoachClientId] = useState("");
  const [clientTab, setClientTab] = useState<ClientTabKey>("accueil");
  const [clientProfileExpanded, setClientProfileExpanded] = useState(false);

  const hydrate = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user) {
        setProfile(null);
        setClientProfileExpanded(false);
        return;
      }
      await ensureProfile(session.user);
      const me = await getMyProfile(session.user);
      setProfile(me);
      if (me.role === "client") {
        const sub = await listMySubscription(me.id);
        setSubscriptionStatus((sub?.status || "inactive").toLowerCase());
      } else {
        setSubscriptionStatus("active");
      }
    } catch (err: any) {
      setError(err?.message || "Erreur de session.");
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setSessionReady(true);
      return;
    }
    hydrate();
    const { data: sub } = onAuthStateChange(async (session) => {
      if (!session?.user) {
        setProfile(null);
        setClientProfileExpanded(false);
        setSessionReady(true);
        return;
      }
      await hydrate();
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  useEffect(() => {
    if (!profile || profile.role !== "client") return;
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") return;
      try {
        const latest = await listMySubscription(profile.id);
        setSubscriptionStatus((latest?.status || "inactive").toLowerCase());
      } catch {
        // Keep last known status if refresh fails.
      }
    });
    return () => sub.remove();
  }, [profile]);

  const onSignOut = async () => {
    await signOut();
    setProfile(null);
    setSelectedCoachClientId("");
    setClientProfileExpanded(false);
  };

  const refreshProfile = useCallback(async () => {
    const session = await getSession();
    if (!session?.user) return;
    const me = await getMyProfile(session.user);
    setProfile(me);
  }, []);

  const headerTitle = useMemo(() => {
    if (!profile) return "Version mobile";
    return profile.role === "coach" ? "Espace coach" : `Bonjour ${profile.name || "Client"}`;
  }, [profile]);

  const hasActiveSubscription = Boolean(["active", "trialing", "past_due"].includes(subscriptionStatus));

  if (!hasSupabaseConfig) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <Text style={styles.errorText}>Configuration manquante</Text>
          <Text style={styles.help}>Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY.</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (forceWebParity) {
    return <WebParityScreen />;
  }

  if (!sessionReady) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.help}>Chargement...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Header title={headerTitle} onSignOut={onSignOut} />
      {error ? <Text style={styles.globalError}>{error}</Text> : null}
      {!profile ? (
        <AuthScreen onAuthenticated={hydrate} />
      ) : profile.role === "coach" ? (
        <>
          <TopNav items={coachTabs} active={coachTab} onChange={setCoachTab} />
          {coachTab === "suivi" ? (
            <CoachClientsScreen
              coach={profile}
              selectedClientId={selectedCoachClientId}
              onSelectedClientChange={setSelectedCoachClientId}
            />
          ) : null}
          {coachTab === "menu" ? (
            <CoachManageScreen coach={profile} initialMode="menu" selectedClientId={selectedCoachClientId} />
          ) : null}
          {coachTab === "rdv" ? <CoachAppointmentsScreen /> : null}
          {coachTab === "blog" ? <CoachManageScreen coach={profile} initialMode="blog" /> : null}
          {coachTab === "archives" ? <CoachArchivesScreen /> : null}
        </>
      ) : !hasActiveSubscription ? (
        <ClientPlusScreen profile={profile} />
      ) : (
        <>
          <TopNav items={clientTabs} active={clientTab} onChange={setClientTab} />
          {clientTab === "accueil" ? (
            <ClientHomeScreen
              profile={profile}
              onRefresh={refreshProfile}
              profileExpanded={clientProfileExpanded}
              onProfileExpandedChange={setClientProfileExpanded}
            />
          ) : null}
          {clientTab === "rdv" ? <AppointmentsScreen profile={profile} /> : null}
          {clientTab === "menu" ? <MenuScreen profile={profile} /> : null}
          {clientTab === "blog" ? <BlogScreen /> : null}
          {clientTab === "plus" ? <ClientPlusScreen profile={profile} /> : null}
        </>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#dde7f2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  brandWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden"
  },
  logoLeafMain: {
    width: 15,
    height: 11,
    borderTopLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: "#e7fff8",
    transform: [{ rotate: "-30deg" }]
  },
  logoLeafAccent: {
    width: 9,
    height: 7,
    borderTopLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    backgroundColor: "#b8f4df",
    position: "absolute",
    right: 7,
    top: 10,
    transform: [{ rotate: "18deg" }]
  },
  brandTextWrap: {
    flex: 1
  },
  brandName: {
    color: "#0f2136",
    fontSize: 15,
    fontWeight: "800"
  },
  headerTitle: {
    color: "#5d6f85",
    fontSize: 12,
    fontWeight: "600"
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 18,
    backgroundColor: "#f3f6fb"
  },
  errorText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#b4232f"
  },
  help: {
    color: "#5d6f85",
    textAlign: "center"
  },
  globalError: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fdecef",
    color: "#a02033"
  },
  navWrap: {
    borderBottomColor: "#dde7f2",
    borderBottomWidth: 1,
    backgroundColor: "#fff"
  },
  navRow: {
    paddingHorizontal: 8
  },
  navButton: {
    paddingHorizontal: 10,
    paddingTop: 10,
    marginRight: 8
  },
  navText: {
    color: "#73859a",
    fontSize: 13,
    fontWeight: "700"
  },
  navTextActive: {
    color: "#0f2136"
  },
  navUnderline: {
    height: 3,
    marginTop: 8,
    borderRadius: 2,
    backgroundColor: "transparent"
  },
  navUnderlineActive: {
    backgroundColor: theme.primary
  }
});
