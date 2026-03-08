import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Field, GhostButton, PrimaryButton, Screen, Title, Card } from "../components/ui";
import { signIn, signUp } from "../lib/api";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"client" | "coach">("client");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password.trim()) return false;
    if (mode === "signup" && !name.trim()) return false;
    return true;
  }, [email, mode, name, password]);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(name, email, password, role);
      }
      onAuthenticated();
    } catch (err: any) {
      setError(err?.message || "Erreur d'authentification.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.authCard}>
            <View style={styles.brandRow}>
              <View style={styles.brandLogo}>
                <View style={styles.logoLeafMain} />
                <View style={styles.logoLeafAccent} />
              </View>
              <View>
                <Title>Nutri Cloud</Title>
                <Text style={styles.subtitle}>Connexion a ton espace mobile.</Text>
              </View>
            </View>

            {mode === "signup" ? (
              <View style={styles.group}>
                <Text style={styles.label}>Nom</Text>
                <Field value={name} onChangeText={setName} placeholder="Ex: Alan" autoCapitalize="words" />
              </View>
            ) : null}

            <View style={styles.group}>
              <Text style={styles.label}>Email</Text>
              <Field value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="ton@email.com" />
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Mot de passe</Text>
              <Field value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
            </View>

            {mode === "signup" ? (
              <View style={styles.row}>
                <GhostButton label={role === "client" ? "Client ✓" : "Client"} onPress={() => setRole("client")} disabled={busy} />
                <GhostButton label={role === "coach" ? "Coach ✓" : "Coach"} onPress={() => setRole("coach")} disabled={busy} />
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <PrimaryButton label={busy ? "Chargement..." : mode === "signin" ? "Se connecter" : "Creer un compte"} onPress={submit} disabled={busy || !canSubmit} />
            <GhostButton
              label={mode === "signin" ? "Pas de compte ? Creer" : "Deja un compte ? Connexion"}
              onPress={() => {
                setError("");
                setMode((prev) => (prev === "signin" ? "signup" : "signin"));
              }}
              disabled={busy}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16
  },
  authCard: {
    gap: 12
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden"
  },
  logoLeafMain: {
    width: 17,
    height: 12,
    borderTopLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: "#e7fff8",
    transform: [{ rotate: "-30deg" }]
  },
  logoLeafAccent: {
    width: 10,
    height: 7,
    borderTopLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    backgroundColor: "#b8f4df",
    position: "absolute",
    right: 8,
    top: 12,
    transform: [{ rotate: "18deg" }]
  },
  subtitle: {
    color: "#5e6e84"
  },
  group: {
    gap: 6
  },
  label: {
    color: "#42566f",
    fontWeight: "600"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  error: {
    color: "#b4232f"
  }
});
