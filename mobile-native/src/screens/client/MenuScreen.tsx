import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, GhostButton, Screen, Title } from "../../components/ui";
import { listMyWeeklyMenus } from "../../lib/api";
import type { Profile, WeeklyMenu } from "../../types/models";

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche"
};

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Petit-dejeuner",
  lunch: "Dejeuner",
  dinner: "Diner",
  snack: "Collation"
};

function getDayEntries(plan: any): Array<{ key: string; label: string; meals: any }> {
  if (!plan || typeof plan !== "object") return [];
  const mapped = DAY_ORDER.map((key) => ({
    key,
    label: DAY_LABELS[key] || key,
    meals: plan?.[key]
  }));
  return mapped.filter((item) => item.meals && typeof item.meals === "object");
}

function mondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekTag(weekStart: string) {
  const current = mondayOfCurrentWeek().toISOString().slice(0, 10);
  const next = new Date(mondayOfCurrentWeek());
  next.setDate(next.getDate() + 7);
  const prev = new Date(mondayOfCurrentWeek());
  prev.setDate(prev.getDate() - 7);
  const nextIso = next.toISOString().slice(0, 10);
  const prevIso = prev.toISOString().slice(0, 10);
  if (weekStart === current) return "Cette semaine";
  if (weekStart === nextIso) return "Semaine prochaine";
  if (weekStart === prevIso) return "Semaine precedente";
  return "Menu";
}

function weekRangeLabel(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(start.getTime())) return weekStart;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} - ${end.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`;
}

export function MenuScreen({ profile }: { profile: Profile }) {
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [selected, setSelected] = useState<WeeklyMenu | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string>("monday");
  const [error, setError] = useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const rows = await listMyWeeklyMenus(profile.id);
        setMenus(rows);
        setSelected(rows[0] || null);
        setSelectedDayKey("monday");
      } catch (err: any) {
        setError(err?.message || "Impossible de charger les menus.");
      }
    })();
  }, [profile.id]);

  const days = useMemo(() => {
    return getDayEntries(selected?.plan);
  }, [selected]);

  const selectedDay = useMemo(() => {
    if (!days.length) return null;
    return days.find((d) => d.key === selectedDayKey) || days[0];
  }, [days, selectedDayKey]);

  const meals = useMemo(() => {
    if (!selectedDay?.meals || typeof selectedDay.meals !== "object") return [];
    return MEAL_ORDER.map((key) => ({
      key,
      label: MEAL_LABELS[key] || key,
      value: typeof selectedDay.meals[key] === "string" ? selectedDay.meals[key].trim() : ""
    }));
  }, [selectedDay]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>Menu hebdo</Title>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!menus.length ? <Text style={styles.hint}>Aucun menu disponible.</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            {menus.map((menu) => (
              <Pressable
                key={menu.id}
                onPress={() => {
                  setSelected(menu);
                  setSelectedDayKey("monday");
                }}
                style={[
                  styles.weekCard,
                  selected?.id === menu.id ? styles.weekCardActive : null
                ]}
              >
                <Text style={styles.weekTag}>{weekTag(menu.weekStart)}</Text>
                <Text style={styles.weekRange}>{weekRangeLabel(menu.weekStart)}</Text>
                <Text style={styles.weekDate}>{menu.weekStart}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Card>

        {selected ? (
          <Card>
            <Title>Semaine du {selected.weekStart}</Title>
            {selected.notes ? <Text style={styles.hint}>{selected.notes}</Text> : null}
            {!days.length ? <Text style={styles.hint}>Plan non renseigne.</Text> : null}

            {days.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayPills}>
                {days.map((day) => (
                  <GhostButton
                    key={day.key}
                    label={selectedDay?.key === day.key ? `${day.label} ✓` : day.label}
                    onPress={() => setSelectedDayKey(day.key)}
                  />
                ))}
              </ScrollView>
            ) : null}

            {selectedDay ? (
              <View style={styles.block}>
                <Text style={styles.day}>{selectedDay.label}</Text>
                {meals.map((meal) => (
                  <View key={meal.key} style={styles.mealCard}>
                    <Text style={styles.mealLabel}>{meal.label}</Text>
                    <Text style={styles.mealValue}>{meal.value || "Non renseigne"}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  error: { color: "#b4232f" },
  hint: { color: "#5f738e", marginTop: 4 },
  pills: { gap: 8, paddingRight: 8, paddingTop: 6 },
  weekCard: {
    minWidth: 160,
    borderWidth: 1,
    borderColor: "#d9e4f1",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#f8fbff",
    gap: 3
  },
  weekCardActive: {
    borderColor: "#0b63ce",
    backgroundColor: "#eef5ff"
  },
  weekTag: { color: "#0f4e9e", fontWeight: "800", fontSize: 12 },
  weekRange: { color: "#10253b", fontWeight: "700" },
  weekDate: { color: "#5f738e", fontSize: 12 },
  dayPills: { gap: 8, paddingTop: 10, paddingRight: 8 },
  block: { borderWidth: 1, borderColor: "#e1e8f1", borderRadius: 14, padding: 10, gap: 8, marginTop: 10, backgroundColor: "#f8fbff" },
  day: { fontWeight: "800", color: "#10253b", fontSize: 16, marginBottom: 4 },
  mealCard: { borderWidth: 1, borderColor: "#dce5f1", borderRadius: 12, padding: 10, backgroundColor: "#fff", gap: 4 },
  mealLabel: { fontWeight: "700", color: "#1d3552", fontSize: 13 },
  mealValue: { color: "#425b77", lineHeight: 20 }
});
