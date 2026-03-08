import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Field, GhostButton, PrimaryButton, Screen, Title } from "../../components/ui";
import { addWeightEntry, deleteWeightEntry, listMyWeeklyCheckins, listMyWeights, saveWeeklyCheckin, updateMyProfile } from "../../lib/api";
import { calcBMR, calcDeficit, calcMacros, calcTDEE } from "../../lib/nutrition";
import type { Profile, WeightEntry } from "../../types/models";

function mondayOfCurrentWeekIso() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function clampScore(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function computeCheckinScore(payload: { energy: number; hunger: number; sleep: number; stress: number; adherence: number }) {
  const values = [payload.energy, payload.hunger, payload.sleep, payload.stress, payload.adherence].map(Number);
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

export function ClientHomeScreen({
  profile,
  onRefresh,
  profileExpanded,
  onProfileExpandedChange
}: {
  profile: Profile;
  onRefresh: () => Promise<void>;
  profileExpanded: boolean;
  onProfileExpandedChange: (expanded: boolean) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [weightInput, setWeightInput] = useState(String(profile.weight || ""));
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [checkinDraft, setCheckinDraft] = useState({
    weekStart: mondayOfCurrentWeekIso(),
    energy: 7,
    hunger: 6,
    sleep: 7,
    stress: 5,
    adherence: 7,
    notes: ""
  });
  const [lastCheckinScore, setLastCheckinScore] = useState<number | null>(null);

  React.useEffect(() => {
    setDraft(profile);
    setWeightInput(String(profile.weight || ""));
  }, [profile]);

  React.useEffect(() => {
    (async () => {
      try {
        const rows = await listMyWeights(profile.id);
        setWeights(rows);
      } catch {
        setWeights([]);
      }
    })();
  }, [profile.id]);

  React.useEffect(() => {
    (async () => {
      try {
        const rows = await listMyWeeklyCheckins(profile.id);
        const latest = rows
          .slice()
          .sort((a: any, b: any) => {
            const aTs = new Date(a?.updatedAt || `${a?.weekStart || ""}T12:00:00`).getTime();
            const bTs = new Date(b?.updatedAt || `${b?.weekStart || ""}T12:00:00`).getTime();
            return bTs - aTs;
          })[0];
        setLastCheckinScore(typeof latest?.score === "number" ? latest.score : null);
      } catch {
        setLastCheckinScore(null);
      }
    })();
  }, [profile.id]);

  const bilan = useMemo(() => {
    const bmr = calcBMR(Number(draft.weight), Number(draft.height), Number(draft.age), draft.sex);
    const tdee = calcTDEE(bmr, Number(draft.nap));
    const calories = calcDeficit(tdee, Number(draft.deficit));
    const macros = calcMacros(Number(draft.weight), calories);
    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      calories: Math.round(calories),
      macros
    };
  }, [draft]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await updateMyProfile(profile.id, draft);
      await onRefresh();
      onProfileExpandedChange(false);
    } catch (err: any) {
      setError(err?.message || "Impossible de sauvegarder.");
    } finally {
      setBusy(false);
    }
  };

  const onAddWeight = async () => {
    const w = Number(weightInput);
    if (!w || w <= 0) {
      setError("Entre un poids valide.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addWeightEntry(profile.id, new Date().toISOString().slice(0, 10), w);
      setDraft((prev) => ({ ...prev, weight: w }));
      const rows = await listMyWeights(profile.id);
      setWeights(rows);
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || "Impossible d'ajouter le poids.");
    } finally {
      setBusy(false);
    }
  };

  const onSaveCheckin = async () => {
    setBusy(true);
    setError("");
    try {
      await saveWeeklyCheckin(profile.id, checkinDraft);
      setLastCheckinScore(computeCheckinScore(checkinDraft));
      const rows = await listMyWeeklyCheckins(profile.id);
      const latest = rows
        .slice()
        .sort((a: any, b: any) => {
          const aTs = new Date(a?.updatedAt || `${a?.weekStart || ""}T12:00:00`).getTime();
          const bTs = new Date(b?.updatedAt || `${b?.weekStart || ""}T12:00:00`).getTime();
          return bTs - aTs;
        })[0];
      setLastCheckinScore(typeof latest?.score === "number" ? latest.score : null);
    } catch (err: any) {
      setError(err?.message || "Impossible d'enregistrer le ressenti.");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteWeight = async (weightId: string) => {
    setBusy(true);
    setError("");
    try {
      await deleteWeightEntry(profile.id, weightId);
      setWeights((prev) => prev.filter((w) => w.id !== weightId));
      const rows = await listMyWeights(profile.id);
      setWeights(rows);
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || "Impossible de supprimer le poids.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Card>
          <Title>Bilan nutrition</Title>
          <Text style={styles.metric}>BMR: {bilan.bmr} kcal</Text>
          <Text style={styles.metric}>TDEE: {bilan.tdee} kcal</Text>
          <Text style={styles.metric}>Calories cible: {bilan.calories} kcal</Text>
          <Text style={styles.metric}>Proteines: {bilan.macros.protein}g</Text>
          <Text style={styles.metric}>Lipides: {bilan.macros.fat}g</Text>
          <Text style={styles.metric}>Glucides: {bilan.macros.carbs}g</Text>
          <Text style={styles.coachMsg}>Message coach: {profile.coachMessage || "Aucun message."}</Text>
        </Card>

        <Card>
          <Title>Mon profil</Title>
          {profileExpanded ? (
            <>
              <View style={styles.group}>
                <Text style={styles.label}>Nom</Text>
                <Field value={draft.name} onChangeText={(v) => setDraft((p) => ({ ...p, name: v }))} />
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.label}>Age</Text>
                  <Field value={String(draft.age)} keyboardType="numeric" onChangeText={(v) => setDraft((p) => ({ ...p, age: Number(v) || 0 }))} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.label}>Sexe</Text>
                  <View style={styles.row}>
                    <GhostButton label={draft.sex === "male" ? "Homme ✓" : "Homme"} onPress={() => setDraft((p) => ({ ...p, sex: "male" }))} disabled={busy} />
                    <GhostButton label={draft.sex === "female" ? "Femme ✓" : "Femme"} onPress={() => setDraft((p) => ({ ...p, sex: "female" }))} disabled={busy} />
                  </View>
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.label}>Taille (cm)</Text>
                  <Field value={String(draft.height)} keyboardType="numeric" onChangeText={(v) => setDraft((p) => ({ ...p, height: Number(v) || 0 }))} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.label}>Poids (kg)</Text>
                  <Field value={String(draft.weight)} keyboardType="numeric" onChangeText={(v) => setDraft((p) => ({ ...p, weight: Number(v) || 0 }))} />
                </View>
              </View>
              <View style={styles.group}>
                <Text style={styles.label}>Objectif</Text>
                <Field value={draft.goal} onChangeText={(v) => setDraft((p) => ({ ...p, goal: v }))} />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton label={busy ? "Sauvegarde..." : "Sauvegarder"} onPress={save} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={styles.coachMsg}>
                Profil enregistre: {draft.name}, {draft.age} ans, {draft.weight} kg.
              </Text>
              <GhostButton label="Modifier" onPress={() => onProfileExpandedChange(true)} disabled={busy} />
            </>
          )}
        </Card>

        <Card>
          <Title>Changement de poids</Title>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Poids du jour (kg)</Text>
              <Field value={weightInput} keyboardType="numeric" onChangeText={setWeightInput} placeholder="Ex: 72.4" />
            </View>
            <PrimaryButton label={busy ? "Ajout..." : "Ajouter"} onPress={onAddWeight} disabled={busy} />
          </View>
          {!weights.length ? <Text style={styles.coachMsg}>Aucun historique de poids.</Text> : null}
          {weights.slice(0, 6).map((w) => (
            <View key={w.id} style={styles.weightRow}>
              <Text style={styles.metric}>{w.date}: {w.weight} kg</Text>
              <GhostButton label="✕" onPress={() => onDeleteWeight(w.id)} disabled={busy} />
            </View>
          ))}
        </Card>

        <Card>
          <Title>Ressenti de la semaine</Title>
          <Text style={styles.coachMsg}>De 1 (faible) a 10 (excellent).</Text>
          <View style={styles.stepperGrid}>
            <View style={styles.stepperCol}>
              <View style={styles.stepperRow}>
                <Text style={styles.label}>Energie: {checkinDraft.energy}/10</Text>
                <View style={styles.stepperControls}>
                  <GhostButton label="−" onPress={() => setCheckinDraft((p) => ({ ...p, energy: clampScore(p.energy - 1) }))} disabled={busy} />
                  <GhostButton label="+" onPress={() => setCheckinDraft((p) => ({ ...p, energy: clampScore(p.energy + 1) }))} disabled={busy} />
                </View>
              </View>
            </View>
            <View style={styles.stepperCol}>
              <View style={styles.stepperRow}>
                <Text style={styles.label}>Faim: {checkinDraft.hunger}/10</Text>
                <View style={styles.stepperControls}>
                  <GhostButton label="−" onPress={() => setCheckinDraft((p) => ({ ...p, hunger: clampScore(p.hunger - 1) }))} disabled={busy} />
                  <GhostButton label="+" onPress={() => setCheckinDraft((p) => ({ ...p, hunger: clampScore(p.hunger + 1) }))} disabled={busy} />
                </View>
              </View>
            </View>
            <View style={styles.stepperCol}>
              <View style={styles.stepperRow}>
                <Text style={styles.label}>Sommeil: {checkinDraft.sleep}/10</Text>
                <View style={styles.stepperControls}>
                  <GhostButton label="−" onPress={() => setCheckinDraft((p) => ({ ...p, sleep: clampScore(p.sleep - 1) }))} disabled={busy} />
                  <GhostButton label="+" onPress={() => setCheckinDraft((p) => ({ ...p, sleep: clampScore(p.sleep + 1) }))} disabled={busy} />
                </View>
              </View>
            </View>
            <View style={styles.stepperCol}>
              <View style={styles.stepperRow}>
                <Text style={styles.label}>Stress (gere): {checkinDraft.stress}/10</Text>
                <View style={styles.stepperControls}>
                  <GhostButton label="−" onPress={() => setCheckinDraft((p) => ({ ...p, stress: clampScore(p.stress - 1) }))} disabled={busy} />
                  <GhostButton label="+" onPress={() => setCheckinDraft((p) => ({ ...p, stress: clampScore(p.stress + 1) }))} disabled={busy} />
                </View>
              </View>
            </View>
            <View style={styles.stepperColFull}>
              <View style={styles.stepperRow}>
                <Text style={styles.label}>Suivi du plan: {checkinDraft.adherence}/10</Text>
                <View style={styles.stepperControls}>
                  <GhostButton label="−" onPress={() => setCheckinDraft((p) => ({ ...p, adherence: clampScore(p.adherence - 1) }))} disabled={busy} />
                  <GhostButton label="+" onPress={() => setCheckinDraft((p) => ({ ...p, adherence: clampScore(p.adherence + 1) }))} disabled={busy} />
                </View>
              </View>
            </View>
          </View>
          <Field
            value={checkinDraft.notes}
            onChangeText={(v) => setCheckinDraft((p) => ({ ...p, notes: v }))}
            placeholder="Commentaire (optionnel)"
          />
          {typeof lastCheckinScore === "number" ? <Text style={styles.metric}>Dernier score: {lastCheckinScore}/10</Text> : null}
          <PrimaryButton label={busy ? "Enregistrement..." : "Enregistrer mon ressenti"} onPress={onSaveCheckin} disabled={busy} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 12,
    gap: 12
  },
  metric: {
    color: "#1f2f45",
    fontWeight: "600"
  },
  coachMsg: {
    color: "#415570"
  },
  group: {
    gap: 6
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end"
  },
  weightRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  stepperRow: {
    borderWidth: 1,
    borderColor: "#dde6f0",
    borderRadius: 10,
    padding: 8,
    gap: 8
  },
  stepperGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stepperCol: { width: "48%" },
  stepperColFull: { width: "100%" },
  stepperControls: {
    flexDirection: "row",
    gap: 8
  },
  flex: {
    flex: 1,
    gap: 6
  },
  label: {
    color: "#456",
    fontWeight: "600"
  },
  error: {
    color: "#b4232f"
  }
});
