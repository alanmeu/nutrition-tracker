import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { listArchivedClients, restoreArchivedClient } from "../../lib/api";
import { Card, GhostButton, Screen, Title } from "../../components/ui";

export function CoachArchivesScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await listArchivedClients();
      setRows(data || []);
    } catch (err: any) {
      setError(err?.message || "Impossible de charger les archives.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const restore = async (archiveId: string) => {
    setBusy(true);
    setError("");
    try {
      await restoreArchivedClient(archiveId);
      await load();
    } catch (err: any) {
      setError(err?.message || "Restauration impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>Clients archives</Title>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!rows.length ? <Text style={styles.meta}>Aucun client archive.</Text> : null}
          {rows.map((row) => (
            <View key={row.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.line}>{row.profile?.name || "Client"}</Text>
                <Text style={styles.meta}>{row.profile?.email || ""}</Text>
                <Text style={styles.meta}>Archive le {new Date(row.archived_at).toLocaleDateString("fr-FR")}</Text>
              </View>
              <GhostButton label="Restaurer" onPress={() => restore(row.id)} disabled={busy} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  item: { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderColor: "#dde6f0", borderRadius: 10, padding: 8 },
  line: { color: "#18314c", fontWeight: "700" },
  meta: { color: "#60748e" },
  error: { color: "#b4232f" }
});
