import React, { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Field, GhostButton, PrimaryButton, Screen, Title } from "../../components/ui";
import {
  deleteBlogPostByCoach,
  listAllBlogPostsForCoach,
  listCoachClients,
  listMyWeeklyMenus,
  saveBlogPostByCoach,
  saveWeeklyMenuByCoach,
  uploadBlogCoverByCoach
} from "../../lib/api";
import type { BlogPost, Profile } from "../../types/models";

function toIsoDateLocal(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayIso() {
  return toMondayIso(toIsoDateLocal(new Date()));
}

function toMondayIso(inputIso: string) {
  const d = new Date(`${inputIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return toIsoDateLocal(new Date());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDateLocal(d);
}

function formatWeekRangeFr(weekStartIso: string) {
  const start = new Date(`${weekStartIso}T12:00:00`);
  if (Number.isNaN(start.getTime())) return "Semaine invalide";
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `Semaine du ${fmt(start)} au ${fmt(end)}`;
}

function shiftWeekIso(weekStartIso: string, deltaWeeks: number) {
  const base = new Date(`${toMondayIso(weekStartIso)}T12:00:00`);
  if (Number.isNaN(base.getTime())) return mondayIso();
  base.setDate(base.getDate() + deltaWeeks * 7);
  return toMondayIso(toIsoDateLocal(base));
}

function formatWeekShortFr(weekStartIso: string) {
  const start = new Date(`${weekStartIso}T12:00:00`);
  if (Number.isNaN(start.getTime())) return "Semaine";
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `${fmt(start)} - ${fmt(end)}`;
}

const MENU_TEMPLATES: Record<string, { label: string; notes: string; plan: any }> = {
  reequilibrage: {
    label: "Reequilibrage",
    notes: "Hydratation 2L/jour, 1 fruit en collation, legumes a chaque repas.",
    plan: {
      monday: { breakfast: "Skyr + flocons d'avoine + fruits rouges", lunch: "Poulet + quinoa + brocoli", dinner: "Saumon + legumes + riz complet", snack: "Pomme + amandes" },
      tuesday: { breakfast: "Omelette + pain complet + kiwi", lunch: "Dinde + patate douce + salade", dinner: "Cabillaud + haricots verts + pommes de terre", snack: "Fromage blanc + cannelle" },
      wednesday: { breakfast: "Yaourt nature + granola maison + banane", lunch: "Boeuf 5% + riz + courgettes", dinner: "Tofu + wok legumes + nouilles riz", snack: "Orange + noix" },
      thursday: { breakfast: "Porridge + lait demi-ecreme + myrtilles", lunch: "Poulet + lentilles + carottes", dinner: "Omelette + salade composee + pain complet", snack: "Skyr + fraises" },
      friday: { breakfast: "Pain complet + beurre cacahuete + banane", lunch: "Saumon + quinoa + epinards", dinner: "Dinde + riz complet + legumes", snack: "Yaourt nature + amandes" },
      saturday: { breakfast: "Pancakes avoine + fromage blanc", lunch: "Poulet + pates completes + salade", dinner: "Poisson blanc + pommes de terre + legumes", snack: "Fruit + noix" },
      sunday: { breakfast: "Oeufs brouilles + pain complet + fruit", lunch: "Boeuf 5% + patate douce + brocoli", dinner: "Soupe legumes + tartines proteinees", snack: "Skyr + fruit" }
    }
  },
  perte: {
    label: "Perte de poids",
    notes: "Portions glucides legerement reduites, priorite proteines et legumes.",
    plan: {
      monday: { breakfast: "Omelette 2 oeufs + fruit", lunch: "Poulet + grande salade + quinoa", dinner: "Cabillaud + legumes verts", snack: "Skyr nature" },
      tuesday: { breakfast: "Skyr + graines + fruits rouges", lunch: "Dinde + courgettes + riz complet (petite portion)", dinner: "Soupe legumes + oeufs durs", snack: "Pomme" },
      wednesday: { breakfast: "Fromage blanc + flocons d'avoine", lunch: "Thon + salade composee + pois chiches", dinner: "Saumon + brocoli", snack: "Amandes (petite poignee)" },
      thursday: { breakfast: "Oeufs + avocat + tomate", lunch: "Poulet + haricots verts + patate douce", dinner: "Tofu + wok legumes", snack: "Yaourt nature" },
      friday: { breakfast: "Porridge eau/lait + cannelle", lunch: "Boeuf 5% + legumes + quinoa", dinner: "Poisson blanc + salade", snack: "Orange" },
      saturday: { breakfast: "Skyr + kiwi", lunch: "Dinde + lentilles + legumes", dinner: "Omelette + salade", snack: "Noix" },
      sunday: { breakfast: "Pain complet + fromage blanc", lunch: "Poulet + legumes rôtis", dinner: "Soupe + poisson", snack: "Fruit" }
    }
  },
  masse: {
    label: "Prise de masse",
    notes: "Augmentation progressive des glucides complexes et portions proteinees.",
    plan: {
      monday: { breakfast: "Porridge + lait + banane + beurre cacahuete", lunch: "Poulet + riz + avocat", dinner: "Saumon + pates completes + legumes", snack: "Skyr + granola" },
      tuesday: { breakfast: "Omelette + pain complet + fruit", lunch: "Boeuf 5% + patate douce + legumes", dinner: "Dinde + quinoa + legumes", snack: "Fromage blanc + noix" },
      wednesday: { breakfast: "Yaourt + avoine + miel + fruits", lunch: "Poulet + riz complet + legumes", dinner: "Cabillaud + pommes de terre + salade", snack: "Banane + amandes" },
      thursday: { breakfast: "Pancakes avoine + skyr", lunch: "Saumon + quinoa + legumes", dinner: "Boeuf + riz + legumes", snack: "Yaourt + fruits secs" },
      friday: { breakfast: "Oeufs + pain complet + avocat", lunch: "Dinde + pates + legumes", dinner: "Poisson + riz + legumes", snack: "Smoothie maison" },
      saturday: { breakfast: "Porridge + fruit + graines", lunch: "Poulet + patate douce + legumes", dinner: "Omelette + riz + salade", snack: "Skyr + noix" },
      sunday: { breakfast: "Pain complet + beurre cacahuete + fruit", lunch: "Boeuf + quinoa + legumes", dinner: "Saumon + pommes de terre + legumes", snack: "Fromage blanc + granola" }
    }
  }
};

const DAY_KEYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" }
] as const;

const MEAL_KEYS = [
  { key: "breakfast", label: "Petit-dejeuner" },
  { key: "lunch", label: "Dejeuner" },
  { key: "dinner", label: "Diner" },
  { key: "snack", label: "Collation" }
] as const;

const BLOG_CATEGORIES = ["Astuces", "Recettes", "Sport"] as const;

function createEmptyPlan() {
  const plan: any = {};
  for (const day of DAY_KEYS) {
    plan[day.key] = {};
    for (const meal of MEAL_KEYS) {
      plan[day.key][meal.key] = "";
    }
  }
  return plan;
}

function normalizePlan(input: any) {
  const base = createEmptyPlan();
  if (!input || typeof input !== "object") return base;
  for (const day of DAY_KEYS) {
    for (const meal of MEAL_KEYS) {
      const value = input?.[day.key]?.[meal.key];
      base[day.key][meal.key] = typeof value === "string" ? value : "";
    }
  }
  return base;
}

export function CoachManageScreen({
  coach,
  initialMode = "blog",
  selectedClientId: selectedClientIdProp = ""
}: {
  coach: Profile;
  initialMode?: "menu" | "blog";
  selectedClientId?: string;
}) {
  const [mode, setMode] = useState<"menu" | "blog">(initialMode);
  const [clients, setClients] = useState<Profile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [weekStart, setWeekStart] = useState(mondayIso());
  const [menuNotes, setMenuNotes] = useState("");
  const [menuPlan, setMenuPlan] = useState<any>(() => createEmptyPlan());
  const [menuTemplateKey, setMenuTemplateKey] = useState<keyof typeof MENU_TEMPLATES>("reequilibrage");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [draft, setDraft] = useState<Partial<BlogPost>>({ title: "", content: "", category: "Astuces", readMinutes: 4 });
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const weekOptions = React.useMemo(() => {
    const start = mondayIso();
    return Array.from({ length: 3 }, (_, i) => shiftWeekIso(start, i));
  }, []);

  React.useEffect(() => {
    if (selectedClientIdProp) setSelectedClientId(selectedClientIdProp);
  }, [selectedClientIdProp]);

  const loadBase = async () => {
    setBusy(true);
    setError("");
    try {
      const [clientRows, postRows] = await Promise.all([listCoachClients(), listAllBlogPostsForCoach()]);
      setClients(clientRows);
      const preferredClientId = selectedClientIdProp || selectedClientId;
      if (clientRows.length) {
        const hasPreferred = preferredClientId && clientRows.some((c) => c.id === preferredClientId);
        if (hasPreferred) setSelectedClientId(preferredClientId);
        else if (!selectedClientId) setSelectedClientId(clientRows[0].id);
      }
      setPosts(postRows);
    } catch (err: any) {
      setError(err?.message || "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    loadBase();
  }, []);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  React.useEffect(() => {
    const loadMenuForClient = async () => {
      if (!selectedClientId || mode !== "menu") return;
      setMenuLoading(true);
      setError("");
      try {
        const rows = await listMyWeeklyMenus(selectedClientId);
        const latest = rows[0];
        if (latest) {
          setWeekStart(toMondayIso(latest.weekStart || mondayIso()));
          setMenuNotes(latest.notes || "");
          setMenuPlan(normalizePlan(latest.plan));
        } else {
          setWeekStart(mondayIso());
          setMenuNotes("");
          setMenuPlan(createEmptyPlan());
        }
      } catch (err: any) {
        setError(err?.message || "Chargement menu client impossible.");
      } finally {
        setMenuLoading(false);
      }
    };
    loadMenuForClient();
  }, [selectedClientId, mode]);

  React.useEffect(() => {
    const loadSelectedWeekMenu = async () => {
      if (!selectedClientId || mode !== "menu") return;
      setMenuLoading(true);
      setError("");
      try {
        const rows = await listMyWeeklyMenus(selectedClientId);
        const normalizedWeek = toMondayIso(weekStart);
        const weekRow = rows.find((row) => toMondayIso(row.weekStart) === normalizedWeek);
        if (weekRow) {
          setMenuNotes(weekRow.notes || "");
          setMenuPlan(normalizePlan(weekRow.plan));
        } else {
          setMenuNotes("");
          setMenuPlan(createEmptyPlan());
        }
      } catch (err: any) {
        setError(err?.message || "Chargement menu semaine impossible.");
      } finally {
        setMenuLoading(false);
      }
    };
    loadSelectedWeekMenu();
  }, [selectedClientId, mode, weekStart]);

  const saveMenu = async () => {
    if (!selectedClientId) {
      setError("Choisis un client.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const normalizedWeekStart = toMondayIso(weekStart);
      await saveWeeklyMenuByCoach(coach.id, selectedClientId, normalizedWeekStart, menuNotes, normalizePlan(menuPlan));
      const rows = await listMyWeeklyMenus(selectedClientId);
      const savedWeek = rows.find((row) => toMondayIso(row.weekStart) === normalizedWeekStart);
      if (savedWeek) {
        setWeekStart(normalizedWeekStart);
        setMenuNotes(savedWeek.notes || "");
        setMenuPlan(normalizePlan(savedWeek.plan));
      }
      Alert.alert("Menu", "Menu enregistre pour le client selectionne.");
    } catch (err: any) {
      setError(err?.message || "Enregistrement menu impossible.");
    } finally {
      setBusy(false);
    }
  };

  const applyTemplate = (key: keyof typeof MENU_TEMPLATES) => {
    const tpl = MENU_TEMPLATES[key];
    if (!tpl) return;
    setMenuTemplateKey(key);
    setMenuNotes(tpl.notes);
    setMenuPlan(normalizePlan(tpl.plan));
  };

  const savePost = async () => {
    if (!draft.title || !draft.content) {
      setError("Titre et contenu requis.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveBlogPostByCoach({
        ...draft,
        title: draft.title,
        content: draft.content
      });
      setDraft({ title: "", content: "", category: "Astuces", readMinutes: 4 });
      const refreshed = await listAllBlogPostsForCoach();
      setPosts(refreshed);
    } catch (err: any) {
      setError(err?.message || "Publication impossible.");
    } finally {
      setBusy(false);
    }
  };

  const pickBlogCover = async () => {
    setError("");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Permission photos refusee.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;

    setBusy(true);
    try {
      const url = await uploadBlogCoverByCoach(res.assets[0].uri);
      setDraft((p) => ({ ...p, coverImageUrl: url }));
    } catch (err: any) {
      setError(err?.message || "Upload image impossible.");
    } finally {
      setBusy(false);
    }
  };

  const removePost = async (postId: string) => {
    setBusy(true);
    try {
      await deleteBlogPostByCoach(postId);
      const refreshed = await listAllBlogPostsForCoach();
      setPosts(refreshed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>Blog & Menus</Title>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>

        {mode === "menu" ? (
          <Card>
            <Title>Menu hebdo client</Title>
            <Text style={styles.label}>Client: {clients.find((c) => c.id === selectedClientId)?.name || clients.find((c) => c.id === selectedClientId)?.email || "Aucun"}</Text>
            {!selectedClientId ? <Text style={styles.label}>Selectionne un client dans l'onglet Suivi client.</Text> : null}
            {menuLoading ? <Text style={styles.label}>Chargement menu du client...</Text> : null}
            <Text style={styles.label}>{formatWeekRangeFr(weekStart)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekChipsRow}>
              {weekOptions.map((ws) => (
                <Pressable
                  key={ws}
                  onPress={() => setWeekStart(toMondayIso(ws))}
                  style={[styles.weekChip, ws === weekStart ? styles.weekChipActive : null]}
                >
                  <Text style={[styles.weekChipText, ws === weekStart ? styles.weekChipTextActive : null]}>{formatWeekShortFr(ws)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>Template rapide</Text>
            <View style={styles.stack}>
              {(Object.keys(MENU_TEMPLATES) as Array<keyof typeof MENU_TEMPLATES>).map((key) => (
                <GhostButton
                  key={key}
                  label={menuTemplateKey === key ? `${MENU_TEMPLATES[key].label} ✓` : MENU_TEMPLATES[key].label}
                  onPress={() => applyTemplate(key)}
                  disabled={busy}
                />
              ))}
            </View>
            <Text style={styles.label}>Notes</Text>
            <Field value={menuNotes} onChangeText={setMenuNotes} placeholder="Notes coach" />
            <Text style={styles.label}>Plan de la semaine</Text>
            {DAY_KEYS.map((day) => (
              <View key={day.key} style={styles.dayBlock}>
                <Text style={styles.dayTitle}>{day.label}</Text>
                {MEAL_KEYS.map((meal) => (
                  <View key={`${day.key}-${meal.key}`} style={styles.stack}>
                    <Text style={styles.mealLabel}>{meal.label}</Text>
                    <Field
                      value={menuPlan?.[day.key]?.[meal.key] || ""}
                      onChangeText={(v) =>
                        setMenuPlan((prev: any) => ({
                          ...prev,
                          [day.key]: {
                            ...(prev?.[day.key] || {}),
                            [meal.key]: v
                          }
                        }))
                      }
                      placeholder={`Ex: ${meal.label}`}
                    />
                  </View>
                ))}
              </View>
            ))}
            <PrimaryButton label={busy ? "Enregistrement..." : "Enregistrer menu"} onPress={saveMenu} disabled={busy} />
          </Card>
        ) : (
          <Card>
            <Title>Articles blog</Title>
            <Text style={styles.label}>Titre</Text>
            <Field value={draft.title || ""} onChangeText={(v) => setDraft((p) => ({ ...p, title: v }))} />
            <Text style={styles.label}>Categorie</Text>
            <Pressable style={styles.select} onPress={() => setCategoryOpen((v) => !v)}>
              <Text style={styles.selectText}>{draft.category || "Astuces"}</Text>
              <Text style={styles.selectChevron}>{categoryOpen ? "▲" : "▼"}</Text>
            </Pressable>
            <View style={[styles.selectMenu, !categoryOpen && styles.hidden]}>
              {BLOG_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  style={styles.selectItem}
                  onPress={() => {
                    setDraft((p) => ({ ...p, category }));
                    setCategoryOpen(false);
                  }}
                >
                  <Text style={styles.selectItemText}>
                    {category}
                    {(draft.category || "Astuces") === category ? " ✓" : ""}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Cover URL</Text>
            <Field value={draft.coverImageUrl || ""} onChangeText={(v) => setDraft((p) => ({ ...p, coverImageUrl: v }))} />
            <GhostButton label={busy ? "Upload..." : "Choisir image"} onPress={pickBlogCover} disabled={busy} />
            {draft.coverImageUrl ? (
              <Image source={{ uri: draft.coverImageUrl }} style={styles.coverPreview} resizeMode="cover" />
            ) : null}
            <Text style={styles.label}>Extrait</Text>
            <Field value={draft.excerpt || ""} onChangeText={(v) => setDraft((p) => ({ ...p, excerpt: v }))} />
            <Text style={styles.label}>Contenu</Text>
            <Field value={draft.content || ""} onChangeText={(v) => setDraft((p) => ({ ...p, content: v }))} multiline style={{ minHeight: 160 }} />
            <View style={styles.row}>
              <GhostButton label={draft.isPublished ? "Publie ✓" : "Publie"} onPress={() => setDraft((p) => ({ ...p, isPublished: !p.isPublished }))} />
              <PrimaryButton label={busy ? "Sauvegarde..." : "Sauvegarder article"} onPress={savePost} disabled={busy} />
            </View>

            <View style={styles.stack}>
              {posts.map((post) => (
                <View key={post.id} style={styles.postItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postTitle}>{post.title}</Text>
                    <Text style={styles.postMeta}>{post.category} • {post.isPublished ? "publie" : "brouillon"}</Text>
                  </View>
                  <GhostButton label="Edit" onPress={() => setDraft(post)} />
                  <GhostButton label="Suppr." onPress={() => removePost(post.id)} />
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  row: { flexDirection: "row", gap: 8 },
  label: { color: "#49607a", fontWeight: "600" },
  stack: { gap: 8 },
  weekNavRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  weekChipsRow: { gap: 8, paddingVertical: 4 },
  weekChip: {
    borderWidth: 1,
    borderColor: "#dbe5f0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#f8fbff"
  },
  weekChipActive: {
    borderColor: "#0f766e",
    backgroundColor: "#e7fbf5"
  },
  weekChipText: {
    color: "#4b6079",
    fontWeight: "600"
  },
  weekChipTextActive: {
    color: "#0f766e",
    fontWeight: "800"
  },
  error: { color: "#b4232f" },
  hidden: { display: "none" },
  select: {
    borderWidth: 1,
    borderColor: "#dbe5f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f8fbff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  selectText: { color: "#172f49", fontWeight: "700" },
  selectChevron: { color: "#5f7289", fontWeight: "700" },
  selectMenu: {
    borderWidth: 1,
    borderColor: "#dbe5f0",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#ffffff"
  },
  selectItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef3f8"
  },
  selectItemText: { color: "#1f354f", fontWeight: "600" },
  dayBlock: { borderWidth: 1, borderColor: "#dde6f0", borderRadius: 10, padding: 10, gap: 8 },
  dayTitle: { color: "#172f49", fontWeight: "800" },
  mealLabel: { color: "#49607a", fontWeight: "600" },
  coverPreview: { width: "100%", height: 180, borderRadius: 10, borderWidth: 1, borderColor: "#dde6f0", backgroundColor: "#f4f7fb" },
  postItem: { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderColor: "#dde6f0", borderRadius: 10, padding: 8 },
  postTitle: { color: "#172f49", fontWeight: "700" },
  postMeta: { color: "#627793" }
});
