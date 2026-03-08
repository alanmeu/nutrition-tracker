import React, { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_APP_URL || "").trim();

export function WebParityScreen() {
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [webKey, setWebKey] = useState(1);

  const isConfigured = useMemo(() => /^https?:\/\//i.test(WEB_APP_URL), []);

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Mode Parite Exacte</Text>
        <Text style={styles.text}>Ajoute EXPO_PUBLIC_WEB_APP_URL dans .env (URL publique de ton app web).</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topbar}>
        <Pressable style={styles.btn} disabled={!canGoBack} onPress={() => setWebKey((k) => k + 0)}>
          <Text style={[styles.btnText, !canGoBack && styles.disabled]}>Retour</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => setWebKey((k) => k + 1)}>
          <Text style={styles.btnText}>Actualiser</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => Linking.openURL(WEB_APP_URL)}>
          <Text style={styles.btnText}>Ouvrir Safari/Chrome</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.text}>Chargement app web...</Text>
        </View>
      ) : null}

      <WebView
        key={webKey}
        source={{ uri: WEB_APP_URL }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        originWhitelist={["*"]}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "#f4f7fb" },
  loader: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 60,
    zIndex: 3,
    alignItems: "center",
    gap: 6
  },
  title: { color: "#10263f", fontSize: 20, fontWeight: "700", marginBottom: 10 },
  text: { color: "#5d728c", textAlign: "center" },
  topbar: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#d9e3f0",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around"
  },
  btn: { paddingHorizontal: 8, paddingVertical: 6 },
  btnText: { color: "#0f2944", fontWeight: "700", fontSize: 13 },
  disabled: { color: "#9aabc0" }
});
