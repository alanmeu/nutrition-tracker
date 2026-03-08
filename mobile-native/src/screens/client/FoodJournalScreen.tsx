import React, { useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { addFoodLogEntry, deleteFoodLogEntry, getFoodByBarcode, listMyFoodLogs, searchFoods } from "../../lib/api";
import type { FoodLog, FoodSearchItem, Profile } from "../../types/models";
import { Card, Field, GhostButton, PrimaryButton, Screen, Title } from "../../components/ui";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function FoodJournalScreen({ profile, startScannerOnMount = false }: { profile: Profile; startScannerOnMount?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchItem[]>([]);
  const [selected, setSelected] = useState<FoodSearchItem | null>(null);
  const [grams, setGrams] = useState("100");
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const autoScanTriggeredRef = useRef(false);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const rows = await listMyFoodLogs(profile.id);
      setLogs(rows);
    } catch (err: any) {
      setError(err?.message || "Erreur de chargement.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const todayLogs = useMemo(() => logs.filter((x) => x.consumedOn === todayIso()), [logs]);

  const todayTotals = useMemo(() => {
    return todayLogs.reduce(
      (acc, item) => {
        acc.calories += item.calories;
        acc.protein += item.protein;
        acc.carbs += item.carbs;
        acc.fat += item.fat;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todayLogs]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError("");
    try {
      const items = await searchFoods(q);
      setResults(items);
      if (items.length) setSelected(items[0]);
    } catch (err: any) {
      setError(err?.message || "Recherche impossible.");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!selected) return;
    const qty = Number(grams);
    if (!qty || qty <= 0) {
      setError("Quantite invalide.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addFoodLogEntry(profile.id, todayIso(), selected, qty);
      await load();
      setGrams("100");
    } catch (err: any) {
      setError(err?.message || "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteFoodLogEntry(id);
      await load();
    } catch (err: any) {
      Alert.alert("Erreur", err?.message || "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  };

  const onBarcode = async (raw: string) => {
    if (!raw) return;
    setScannerOpen(false);
    setBusy(true);
    setError("");
    try {
      const found = await getFoodByBarcode(raw);
      if (!found) {
        setError("Produit non trouve pour ce code-barres.");
        return;
      }
      setSelected(found);
      setResults([found]);
      setQuery(found.description);
    } catch (err: any) {
      setError(err?.message || "Lecture code-barres impossible.");
    } finally {
      setBusy(false);
    }
  };

  const openScanner = async () => {
    const res = await requestPermission();
    if (!res.granted) {
      setError("Permission camera refusee.");
      return;
    }
    setScannerOpen(true);
  };

  React.useEffect(() => {
    if (!startScannerOnMount) return;
    if (autoScanTriggeredRef.current) return;
    autoScanTriggeredRef.current = true;
    openScanner();
  }, [startScannerOnMount]);

  const selectedPreview = useMemo(() => {
    if (!selected) return null;
    const qty = Number(grams) || 0;
    const ratio = qty / 100;
    return {
      calories: Math.round(selected.caloriesPer100g * ratio),
      protein: (selected.proteinPer100g * ratio).toFixed(1),
      carbs: (selected.carbsPer100g * ratio).toFixed(1),
      fat: (selected.fatPer100g * ratio).toFixed(1)
    };
  }, [selected, grams]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>Journal alimentaire</Title>
          <Text style={styles.hint}>Recherche aliment ou scanne le code-barres.</Text>
          <PrimaryButton label="Scanner maintenant" onPress={openScanner} disabled={busy} />

          <Field value={query} onChangeText={setQuery} placeholder="Ex: patate douce" />
          <View style={styles.row}>
            <PrimaryButton label={busy ? "Recherche..." : "Rechercher"} onPress={runSearch} disabled={busy || !query.trim()} />
          </View>

          {results.map((item) => (
            <Pressable key={`${item.source}-${item.fdcId}-${item.description}`} onPress={() => setSelected(item)} style={[styles.result, selected?.description === item.description && styles.resultActive]}>
              <Text style={styles.resultTitle}>{item.description}</Text>
              <Text style={styles.resultMeta}>
                {item.caloriesPer100g} kcal | P {item.proteinPer100g}g | G {item.carbsPer100g}g | L {item.fatPer100g}g /100g
              </Text>
            </Pressable>
          ))}

          {selected ? (
            <View style={styles.addBox}>
              <Text style={styles.resultTitle}>{selected.description}</Text>
              <Field value={grams} onChangeText={setGrams} keyboardType="numeric" placeholder="Quantite en g" />
              {selectedPreview ? (
                <Text style={styles.preview}>
                  {selectedPreview.calories} kcal | Proteines {selectedPreview.protein}g | Glucides {selectedPreview.carbs}g | Lipides {selectedPreview.fat}g
                </Text>
              ) : null}
              <PrimaryButton label={busy ? "Ajout..." : "Ajouter au jour"} onPress={add} disabled={busy} />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>

        <Card>
          <Title>Aujourd'hui</Title>
          <Text style={styles.preview}>
            {Math.round(todayTotals.calories)} kcal | Proteines {todayTotals.protein.toFixed(1)}g | Glucides {todayTotals.carbs.toFixed(1)}g | Lipides {todayTotals.fat.toFixed(1)}g
          </Text>
          {!todayLogs.length ? <Text style={styles.hint}>Aucun aliment aujourd'hui.</Text> : null}
          {todayLogs.map((entry) => (
            <View key={entry.id} style={styles.logItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle}>{entry.foodName}</Text>
                <Text style={styles.resultMeta}>
                  {entry.quantityG}g • {Math.round(entry.calories)} kcal • P {entry.protein} • G {entry.carbs} • L {entry.fat}
                </Text>
              </View>
              <GhostButton label="Suppr." onPress={() => remove(entry.id)} disabled={busy} />
            </View>
          ))}
        </Card>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.modalWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"]
            }}
            onBarcodeScanned={(event) => onBarcode(event.data)}
          />
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Cadre le code-barres</Text>
            <GhostButton label="Fermer" onPress={() => setScannerOpen(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 12,
    gap: 12
  },
  hint: {
    color: "#5a6c83"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  result: {
    borderWidth: 1,
    borderColor: "#d7e0ed",
    borderRadius: 10,
    padding: 10,
    gap: 2,
    backgroundColor: "#fff"
  },
  resultActive: {
    borderColor: "#8eb8b2",
    backgroundColor: "#f2fbfa"
  },
  resultTitle: {
    fontWeight: "700",
    color: "#112335"
  },
  resultMeta: {
    color: "#50637d",
    fontSize: 12
  },
  addBox: {
    borderWidth: 1,
    borderColor: "#d7e0ed",
    borderRadius: 10,
    padding: 10,
    gap: 8
  },
  preview: {
    color: "#1f3b54",
    fontWeight: "600"
  },
  logItem: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e1e7ef",
    borderRadius: 10,
    padding: 8
  },
  error: {
    color: "#b4232f"
  },
  modalWrap: {
    flex: 1,
    backgroundColor: "black"
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  overlayText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center"
  }
});
