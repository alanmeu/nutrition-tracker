import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import ChatThread from "../../components/ChatThread";
import GraphWeight from "../../components/GraphWeight";
import MenuDay from "../../components/MenuDay";
import NotificationsPanel from "../../components/NotificationsPanel";
import { createEmptyWeeklyPlan, DAY_KEYS, getMondayOfCurrentWeek } from "../../utils/mealPlanner";
import { BMR_METHODS, calcBMR, calcDeficit, calcMacros, calcTDEE, getBmrMethodLabel } from "../../utils/nutrition";
import { addPdfBranding } from "../../utils/pdfBranding";

function buildBilan(client, overrides = {}) {
  const weight = Number(overrides.weight ?? client.weight ?? 70);
  const height = Number(overrides.height ?? client.height ?? 170);
  const age = Number(overrides.age ?? client.age ?? 30);
  const sex = overrides.sex ?? client.sex ?? "male";
  const bmrMethod = overrides.bmrMethod ?? client.bmrMethod ?? "mifflin";
  const nap = Number(overrides.nap ?? client.nap ?? 1.4);
  const deficitPercentage = Number(overrides.deficit ?? client.deficit ?? 20);
  const bmr = calcBMR(
    weight,
    height,
    age,
    sex,
    bmrMethod
  );
  const tdee = calcTDEE(bmr, nap);
  const deficitCalories = calcDeficit(tdee, deficitPercentage);
  const macros = calcMacros(weight, deficitCalories);
  const bmi = height > 0 ? weight / ((height / 100) ** 2) : null;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficitCalories: Math.round(deficitCalories),
    macros,
    bmi: Number.isFinite(bmi) ? Number(bmi.toFixed(1)) : null,
    nap: Number.isFinite(nap) ? Number(nap.toFixed(2)) : 1.4,
    deficitPercentage: Number.isFinite(deficitPercentage) ? deficitPercentage : 20,
    bmrMethod
  };
}

function getNapReferenceLabel(value) {
  const nap = Number(value);
  if (!Number.isFinite(nap)) return "Repere NAP: 1.2 sedentaire • 1.35 peu actif • 1.5 modere • 1.7 actif • 1.9 tres actif";
  if (nap < 1.3) return "Sedentaire (peu de mouvement)";
  if (nap < 1.45) return "Peu actif";
  if (nap < 1.65) return "Activite moderee";
  if (nap < 1.85) return "Actif";
  return "Tres actif";
}

function toDateKeyLocal(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartLocal(value) {
  const date = value instanceof Date ? new Date(value) : new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addMonthsLocal(value, months) {
  const date = monthStartLocal(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

function mondayOfWeek(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value || new Date());
  if (Number.isNaN(date.getTime())) return toDateKeyLocal(new Date());
  const day = date.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + shift);
  return toDateKeyLocal(date);
}

function buildMenuWeekOptions(existingMenus, selectedWeek) {
  const set = new Set();
  const now = new Date();
  const currentMonday = mondayOfWeek(now);
  set.add(currentMonday);

  const cursor = new Date(currentMonday);
  for (let i = 1; i <= 11; i += 1) {
    cursor.setDate(cursor.getDate() + 7);
    set.add(toDateKeyLocal(cursor));
  }

  (existingMenus || []).forEach((entry) => {
    if (entry?.weekStart) set.add(entry.weekStart);
  });
  if (selectedWeek) set.add(selectedWeek);

  return Array.from(set).sort((a, b) => String(b).localeCompare(String(a)));
}

function buildMenuSummary(menu) {
  if (!menu) return { weekStart: "", text: "Aucun menu hebdomadaire enregistre." };
  const plan = menu.plan || {};
  const daySummaries = DAY_KEYS.map((day) => {
    const meals = plan[day.key] || {};
    const filled = Object.values(meals).filter((value) => String(value || "").trim()).length;
    return `${day.label}: ${filled}/4 repas renseignes`;
  });
  const note = String(menu.notes || "").trim();
  return {
    weekStart: menu.weekStart || "",
    text: `${daySummaries.join(" | ")}${note ? ` | Notes: ${note}` : ""}`
  };
}

function buildProgressSnapshot(client) {
  const history = Array.isArray(client.history) ? [...client.history] : [];
  history.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const firstWeight = history[0]?.weight ? Number(history[0].weight) : null;
  const lastWeight = history[history.length - 1]?.weight ? Number(history[history.length - 1].weight) : null;
  const deltaWeight =
    Number.isFinite(firstWeight) && Number.isFinite(lastWeight)
      ? Number((lastWeight - firstWeight).toFixed(1))
      : null;

  const latestCheckin = Array.isArray(client.checkins) && client.checkins.length > 0 ? client.checkins[0] : null;
  const latestGoals = Array.isArray(client.goals) && client.goals.length > 0 ? client.goals[0] : null;
  const goalsCount = Array.isArray(latestGoals?.goals) ? latestGoals.goals.length : 0;
  const goalsDone = Array.isArray(latestGoals?.goals)
    ? latestGoals.goals.filter((goal) => Boolean(goal?.done)).length
    : 0;

  return {
    firstWeight,
    lastWeight,
    deltaWeight,
    latestCheckinScore: latestCheckin?.score ?? null,
    latestCheckinWeek: latestCheckin?.weekStart ?? "",
    goalsDone,
    goalsCount,
    goalsWeek: latestGoals?.weekStart || ""
  };
}

function buildMensurationEvolution(client) {
  const history = Array.isArray(client.mensurationHistory) ? [...client.mensurationHistory] : [];
  history.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const metrics = [
    { key: "waistCm", label: "Taille" },
    { key: "hipCm", label: "Hanches" },
    { key: "chestCm", label: "Poitrine" },
    { key: "armCm", label: "Bras" },
    { key: "thighCm", label: "Cuisse" }
  ];

  const items = metrics
    .map((metric) => {
      const points = history
        .map((entry) => ({ date: entry.date, value: Number(entry?.[metric.key]) }))
        .filter((entry) => Number.isFinite(entry.value));
      if (points.length < 2) return null;
      const first = points[0];
      const last = points[points.length - 1];
      const delta = Number((last.value - first.value).toFixed(1));
      return {
        key: metric.key,
        label: metric.label,
        start: first.value,
        end: last.value,
        delta
      };
    })
    .filter(Boolean);

  return {
    items,
    hasData: items.length > 0,
    summary: items
      .map((item) => `${item.label} ${item.start} -> ${item.end} cm (${item.delta > 0 ? "+" : ""}${item.delta} cm)`)
      .join(" | ")
  };
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function parseCsvText(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rows.length) return [];
  const delimiter = rows[0].includes(";") ? ";" : ",";
  const headers = parseCsvLine(rows[0], delimiter).map((value) => value.toLowerCase());
  return rows.slice(1).map((row) => {
    const values = parseCsvLine(row, delimiter);
    const mapped = {};
    headers.forEach((header, index) => {
      mapped[header] = values[index] || "";
    });
    return mapped;
  });
}

function getCsvField(row, aliases) {
  for (const key of aliases) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeCsvDayKey(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const map = {
    monday: "monday",
    lundi: "monday",
    tuesday: "tuesday",
    mardi: "tuesday",
    wednesday: "wednesday",
    mercredi: "wednesday",
    thursday: "thursday",
    jeudi: "thursday",
    friday: "friday",
    vendredi: "friday",
    saturday: "saturday",
    samedi: "saturday",
    sunday: "sunday",
    dimanche: "sunday"
  };
  return map[normalized] || "";
}

function parseMenuCsvToWeeklyPlan(text) {
  const rows = parseCsvText(text);
  if (!rows.length) {
    return { ok: false, error: "CSV vide ou invalide." };
  }

  const plan = createEmptyWeeklyPlan();
  let filled = 0;

  for (const row of rows) {
    const dayRaw = getCsvField(row, ["day", "jour"]);
    const dayKey = normalizeCsvDayKey(dayRaw);
    if (!dayKey) continue;

    const breakfast = getCsvField(row, ["breakfast", "petit_dejeuner", "petit-dejeuner", "petitdej"]);
    const lunch = getCsvField(row, ["lunch", "dejeuner", "dej"]);
    const dinner = getCsvField(row, ["dinner", "diner", "souper"]);
    const snack = getCsvField(row, ["snack", "collation"]);

    if (breakfast) {
      plan[dayKey].breakfast = breakfast;
      filled += 1;
    }
    if (lunch) {
      plan[dayKey].lunch = lunch;
      filled += 1;
    }
    if (dinner) {
      plan[dayKey].dinner = dinner;
      filled += 1;
    }
    if (snack) {
      plan[dayKey].snack = snack;
      filled += 1;
    }
  }

  if (filled === 0) {
    return {
      ok: false,
      error: "Aucune ligne valide. Colonnes attendues: day,breakfast,lunch,dinner,snack"
    };
  }

  return { ok: true, plan, filled };
}

const MENU_GENERATOR_OPTIONS = [
  { key: "economique", label: "Economique" },
  { key: "vegetarien", label: "Vegetarien" },
  { key: "vegan", label: "Vegan" },
  { key: "mediterraneen", label: "Mediterraneen" },
  { key: "rapide", label: "Rapide" }
];

const MENU_MODE_PROFILES = {
  economique: {
    proteins: [
      { name: "poulet cuit", p: 31, c: 0, f: 3.6, min: 90, max: 260 },
      { name: "thon naturel egoutte", p: 26, c: 0, f: 1, min: 90, max: 240 },
      { name: "oeufs entiers", p: 13, c: 1.1, f: 11, min: 120, max: 260 },
      { name: "lentilles cuites", p: 9, c: 20, f: 0.4, min: 120, max: 380 }
    ],
    breakfastProteins: [
      { name: "fromage blanc 0%", p: 8, c: 4, f: 0.2, min: 120, max: 420 }
    ],
    carbs: [
      { name: "riz cuit", p: 2.7, c: 28, f: 0.3, min: 90, max: 420 },
      { name: "pates completes cuites", p: 5.2, c: 30, f: 1.4, min: 90, max: 420 },
      { name: "pommes de terre cuites", p: 2, c: 18, f: 0.1, min: 120, max: 520 },
      { name: "flocons d'avoine", p: 13.5, c: 58.7, f: 7, min: 35, max: 130 }
    ],
    fats: [
      { name: "huile d'olive", p: 0, c: 0, f: 100, min: 5, max: 28, step: 1 },
      { name: "cacahuetes", p: 26, c: 16, f: 49, min: 8, max: 35, step: 1 }
    ],
    fruits: ["banane", "pomme", "poire", "orange"],
    vegetables: ["poelee de legumes surgeles", "brocoli vapeur", "haricots verts", "ratatouille maison"]
  },
  vegetarien: {
    proteins: [
      { name: "tofu ferme", p: 14, c: 2, f: 8, min: 120, max: 320 },
      { name: "oeufs entiers", p: 13, c: 1.1, f: 11, min: 120, max: 260 },
      { name: "skyr nature", p: 11, c: 3.5, f: 0.2, min: 140, max: 420 },
      { name: "lentilles cuites", p: 9, c: 20, f: 0.4, min: 120, max: 380 }
    ],
    breakfastProteins: [
      { name: "skyr nature", p: 11, c: 3.5, f: 0.2, min: 160, max: 420 },
      { name: "fromage blanc 0%", p: 8, c: 4, f: 0.2, min: 140, max: 420 }
    ],
    carbs: [
      { name: "riz cuit", p: 2.7, c: 28, f: 0.3, min: 90, max: 420 },
      { name: "quinoa cuit", p: 4.4, c: 21, f: 1.9, min: 100, max: 420 },
      { name: "pates completes cuites", p: 5.2, c: 30, f: 1.4, min: 90, max: 420 },
      { name: "flocons d'avoine", p: 13.5, c: 58.7, f: 7, min: 35, max: 130 }
    ],
    fats: [
      { name: "huile d'olive", p: 0, c: 0, f: 100, min: 5, max: 28, step: 1 },
      { name: "amandes", p: 21.1, c: 9.1, f: 49.9, min: 8, max: 35, step: 1 }
    ],
    fruits: ["banane", "pomme", "kiwi", "fruits rouges"],
    vegetables: ["brocoli vapeur", "courgettes poelees", "carottes vapeur", "haricots verts"]
  },
  vegan: {
    proteins: [
      { name: "tofu ferme", p: 14, c: 2, f: 8, min: 120, max: 340 },
      { name: "tempeh", p: 19, c: 9, f: 11, min: 100, max: 280 },
      { name: "seitan", p: 25, c: 6, f: 2, min: 90, max: 260 },
      { name: "lentilles cuites", p: 9, c: 20, f: 0.4, min: 140, max: 420 }
    ],
    breakfastProteins: [
      { name: "yaourt soja nature", p: 4, c: 2, f: 2.2, min: 180, max: 500 },
      { name: "tofu brouille", p: 14, c: 2, f: 8, min: 100, max: 260 }
    ],
    carbs: [
      { name: "riz cuit", p: 2.7, c: 28, f: 0.3, min: 100, max: 450 },
      { name: "pates completes cuites", p: 5.2, c: 30, f: 1.4, min: 100, max: 450 },
      { name: "pommes de terre cuites", p: 2, c: 18, f: 0.1, min: 150, max: 560 },
      { name: "flocons d'avoine", p: 13.5, c: 58.7, f: 7, min: 40, max: 140 }
    ],
    fats: [
      { name: "huile d'olive", p: 0, c: 0, f: 100, min: 6, max: 30, step: 1 },
      { name: "graines de chia", p: 17, c: 7, f: 31, min: 8, max: 30, step: 1 },
      { name: "amandes", p: 21.1, c: 9.1, f: 49.9, min: 8, max: 32, step: 1 }
    ],
    fruits: ["banane", "pomme", "poire", "mangue"],
    vegetables: ["brocoli vapeur", "epinards poeles", "courgettes poelees", "poelee poivrons oignons"]
  },
  mediterraneen: {
    proteins: [
      { name: "saumon cuit", p: 20.4, c: 0, f: 13.4, min: 90, max: 220 },
      { name: "thon naturel egoutte", p: 26, c: 0, f: 1, min: 90, max: 220 },
      { name: "poulet cuit", p: 31, c: 0, f: 3.6, min: 90, max: 240 },
      { name: "pois chiches cuits", p: 8.9, c: 27.4, f: 2.6, min: 120, max: 360 }
    ],
    breakfastProteins: [
      { name: "skyr nature", p: 11, c: 3.5, f: 0.2, min: 140, max: 420 }
    ],
    carbs: [
      { name: "quinoa cuit", p: 4.4, c: 21, f: 1.9, min: 100, max: 420 },
      { name: "riz complet cuit", p: 2.7, c: 25.6, f: 1, min: 100, max: 420 },
      { name: "pommes de terre cuites", p: 2, c: 18, f: 0.1, min: 120, max: 520 },
      { name: "pain complet", p: 9.5, c: 41.2, f: 3.3, min: 45, max: 220 }
    ],
    fats: [
      { name: "huile d'olive", p: 0, c: 0, f: 100, min: 6, max: 30, step: 1 },
      { name: "noix", p: 15.2, c: 7, f: 65.2, min: 8, max: 26, step: 1 },
      { name: "avocat", p: 2, c: 8.5, f: 14.7, min: 40, max: 160, step: 5 }
    ],
    fruits: ["orange", "pomme", "kiwi", "fruits rouges"],
    vegetables: ["ratatouille", "legumes grilles", "salade concombre tomate", "haricots verts"]
  },
  rapide: {
    proteins: [
      { name: "poulet cuit", p: 31, c: 0, f: 3.6, min: 90, max: 240 },
      { name: "thon naturel egoutte", p: 26, c: 0, f: 1, min: 90, max: 220 },
      { name: "tofu ferme", p: 14, c: 2, f: 8, min: 120, max: 300 },
      { name: "oeufs entiers", p: 13, c: 1.1, f: 11, min: 120, max: 240 }
    ],
    breakfastProteins: [
      { name: "skyr nature", p: 11, c: 3.5, f: 0.2, min: 140, max: 420 },
      { name: "yaourt soja nature", p: 4, c: 2, f: 2.2, min: 180, max: 500 }
    ],
    carbs: [
      { name: "flocons d'avoine", p: 13.5, c: 58.7, f: 7, min: 35, max: 130 },
      { name: "riz cuisson rapide cuit", p: 2.7, c: 28, f: 0.3, min: 100, max: 420 },
      { name: "pain complet", p: 9.5, c: 41.2, f: 3.3, min: 45, max: 220 },
      { name: "pates cuites", p: 5, c: 25, f: 1.1, min: 90, max: 420 }
    ],
    fats: [
      { name: "huile d'olive", p: 0, c: 0, f: 100, min: 5, max: 25, step: 1 },
      { name: "beurre de cacahuete", p: 25, c: 20, f: 50, min: 8, max: 30, step: 1 }
    ],
    fruits: ["banane", "pomme", "orange", "poire"],
    vegetables: ["salade composee", "poelee de legumes surgeles", "courgettes poelees", "wok de legumes"]
  }
};

const MENU_MEAL_TEMPLATES = {
  economique: {
    breakfast: [
      { proteinPool: "breakfastProteins", protein: "fromage blanc 0%", carb: "flocons d'avoine", fat: "cacahuetes", title: "Bol proteine" }
    ],
    main: [
      { protein: "poulet cuit", carb: "riz cuit", fat: "huile d'olive", veg: "poelee de legumes surgeles" },
      { protein: "thon naturel egoutte", carb: "pommes de terre cuites", fat: "huile d'olive", veg: "haricots verts" },
      { protein: "lentilles cuites", carb: "riz cuit", fat: "huile d'olive", veg: "ratatouille maison" }
    ],
    snack: [
      { proteinPool: "breakfastProteins", protein: "fromage blanc 0%", fat: "cacahuetes", title: "Collation simple" }
    ]
  },
  vegetarien: {
    breakfast: [
      { proteinPool: "breakfastProteins", protein: "skyr nature", carb: "flocons d'avoine", fat: "amandes", title: "Bol skyr" },
      { proteinPool: "breakfastProteins", protein: "fromage blanc 0%", carb: "flocons d'avoine", fat: "amandes", title: "Bol fromage blanc" }
    ],
    main: [
      { protein: "tofu ferme", carb: "riz cuit", fat: "huile d'olive", veg: "courgettes poelees" },
      { protein: "oeufs entiers", carb: "pates completes cuites", fat: "huile d'olive", veg: "brocoli vapeur" },
      { protein: "lentilles cuites", carb: "quinoa cuit", fat: "huile d'olive", veg: "carottes vapeur" }
    ],
    snack: [
      { proteinPool: "breakfastProteins", protein: "skyr nature", fat: "amandes", title: "Collation proteinee" }
    ]
  },
  vegan: {
    breakfast: [
      { proteinPool: "breakfastProteins", protein: "yaourt soja nature", carb: "flocons d'avoine", fat: "graines de chia", title: "Bol soja" },
      { proteinPool: "breakfastProteins", protein: "tofu brouille", carb: "pommes de terre cuites", fat: "huile d'olive", title: "Tofu brouille" }
    ],
    main: [
      { protein: "tofu ferme", carb: "riz cuit", fat: "huile d'olive", veg: "brocoli vapeur" },
      { protein: "tempeh", carb: "pates completes cuites", fat: "huile d'olive", veg: "epinards poeles" },
      { protein: "lentilles cuites", carb: "pommes de terre cuites", fat: "huile d'olive", veg: "poelee poivrons oignons" }
    ],
    snack: [
      { proteinPool: "breakfastProteins", protein: "yaourt soja nature", fat: "amandes", title: "Collation vegan" }
    ]
  },
  mediterraneen: {
    breakfast: [
      { proteinPool: "breakfastProteins", protein: "skyr nature", carb: "pain complet", fat: "noix", title: "Tartine + skyr" }
    ],
    main: [
      { protein: "saumon cuit", carb: "quinoa cuit", fat: "huile d'olive", veg: "legumes grilles" },
      { protein: "poulet cuit", carb: "pommes de terre cuites", fat: "huile d'olive", veg: "ratatouille" },
      { protein: "pois chiches cuits", carb: "riz complet cuit", fat: "huile d'olive", veg: "haricots verts" }
    ],
    snack: [
      { proteinPool: "breakfastProteins", protein: "skyr nature", fat: "noix", title: "Collation mediterraneenne" }
    ]
  },
  rapide: {
    breakfast: [
      { proteinPool: "breakfastProteins", protein: "skyr nature", carb: "flocons d'avoine", fat: "beurre de cacahuete", title: "Overnight bowl" },
      { proteinPool: "breakfastProteins", protein: "yaourt soja nature", carb: "flocons d'avoine", fat: "beurre de cacahuete", title: "Bol express" }
    ],
    main: [
      { protein: "poulet cuit", carb: "riz cuisson rapide cuit", fat: "huile d'olive", veg: "poelee de legumes surgeles" },
      { protein: "thon naturel egoutte", carb: "pates cuites", fat: "huile d'olive", veg: "salade composee" },
      { protein: "tofu ferme", carb: "riz cuisson rapide cuit", fat: "huile d'olive", veg: "wok de legumes" }
    ],
    snack: [
      { proteinPool: "breakfastProteins", protein: "skyr nature", fat: "beurre de cacahuete", title: "Collation express" }
    ]
  }
};

const MEAL_MACRO_SPLIT = {
  breakfast: 0.25,
  lunch: 0.34,
  dinner: 0.31,
  snack: 0.1
};

function hashStringToSeed(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) || 1;
}

function createSeededRandom(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickRandom(items, random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(random() * items.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, step = 5) {
  const safeStep = step > 0 ? step : 1;
  return Math.round(value / safeStep) * safeStep;
}

function computePortionGrams(targetMacro, macroPer100, min, max, step = 5) {
  const density = Number(macroPer100);
  if (!Number.isFinite(density) || density <= 0) {
    return clamp(roundToStep(min || 0, step), min || 0, max || 0);
  }
  const raw = (Math.max(0, Number(targetMacro) || 0) / density) * 100;
  const bounded = clamp(raw, min, max);
  return roundToStep(bounded, step);
}

function formatIngredient(item, grams) {
  return `${item.name} ${Math.max(0, Math.round(grams))} g`;
}

function mealTargetsFromDailyMacros(macros) {
  const protein = Number(macros?.protein || 0);
  const carbs = Number(macros?.carbs || 0);
  const fat = Number(macros?.fat || 0);
  return {
    breakfast: {
      p: Math.round(protein * MEAL_MACRO_SPLIT.breakfast),
      c: Math.round(carbs * MEAL_MACRO_SPLIT.breakfast),
      f: Math.round(fat * MEAL_MACRO_SPLIT.breakfast)
    },
    lunch: {
      p: Math.round(protein * MEAL_MACRO_SPLIT.lunch),
      c: Math.round(carbs * MEAL_MACRO_SPLIT.lunch),
      f: Math.round(fat * MEAL_MACRO_SPLIT.lunch)
    },
    dinner: {
      p: Math.round(protein * MEAL_MACRO_SPLIT.dinner),
      c: Math.round(carbs * MEAL_MACRO_SPLIT.dinner),
      f: Math.round(fat * MEAL_MACRO_SPLIT.dinner)
    },
    snack: {
      p: Math.round(protein * MEAL_MACRO_SPLIT.snack),
      c: Math.round(carbs * MEAL_MACRO_SPLIT.snack),
      f: Math.round(fat * MEAL_MACRO_SPLIT.snack)
    }
  };
}

function resolveSource(profile, poolName, preferredName, random) {
  const pool = Array.isArray(profile?.[poolName]) ? profile[poolName] : [];
  if (preferredName) {
    const exact = pool.find((item) => item?.name === preferredName);
    if (exact) return exact;
  }
  return pickRandom(pool, random) || pool[0] || null;
}

function gramsForItem(targetMacro, item, minFallback = 60, maxFallback = 300, stepFallback = 5) {
  if (!item) return 0;
  return computePortionGrams(
    targetMacro,
    item.p || item.c || item.f || 0,
    item.min || minFallback,
    item.max || maxFallback,
    item.step || stepFallback
  );
}

function createMainMeal(target, profile, random, modeKey) {
  const template = pickRandom(MENU_MEAL_TEMPLATES[modeKey]?.main || [], random) || {};
  const proteinSource = resolveSource(profile, "proteins", template.protein, random);
  const carbSource = resolveSource(profile, "carbs", template.carb, random);
  const fatSource = resolveSource(profile, "fats", template.fat, random);
  const veg = template.veg || pickRandom(profile.vegetables, random) || "legumes cuits";

  const proteinGrams = gramsForItem(Math.max(14, target.p * 0.78), proteinSource, 90, 280, 5);
  const carbGrams = gramsForItem(Math.max(18, target.c * 0.88), carbSource, 90, 480, 5);
  const fatGrams = gramsForItem(Math.max(4, target.f * 0.82), fatSource, 5, 30, 1);

  return `Assiette: ${formatIngredient(proteinSource, proteinGrams)} + ${formatIngredient(carbSource, carbGrams)} + ${veg} 250 g + ${formatIngredient(fatSource, fatGrams)}`;
}

function createBreakfast(target, profile, random, modeKey) {
  const template = pickRandom(MENU_MEAL_TEMPLATES[modeKey]?.breakfast || [], random) || {};
  const proteinPool = template.proteinPool || "breakfastProteins";
  const proteinSource = resolveSource(profile, proteinPool, template.protein, random);
  const carbSource = resolveSource(profile, "carbs", template.carb, random);
  const fatSource = template.fat ? resolveSource(profile, "fats", template.fat, random) : null;
  const fruit = pickRandom(profile.fruits, random) || "fruit";

  const proteinGrams = gramsForItem(Math.max(12, target.p * 0.8), proteinSource, 120, 420, 5);
  const carbGrams = gramsForItem(Math.max(18, target.c * 0.78), carbSource, 35, 160, 5);
  const fatText = fatSource
    ? ` + ${formatIngredient(fatSource, gramsForItem(Math.max(3, target.f * 0.55), fatSource, 8, 30, 1))}`
    : "";

  return `Petit-dejeuner: ${formatIngredient(proteinSource, proteinGrams)} + ${formatIngredient(carbSource, carbGrams)}${fatText} + ${fruit}`;
}

function createSnack(target, profile, random, modeKey) {
  const template = pickRandom(MENU_MEAL_TEMPLATES[modeKey]?.snack || [], random) || {};
  const proteinPool = template.proteinPool || "breakfastProteins";
  const proteinSource =
    resolveSource(profile, proteinPool, template.protein, random) ||
    resolveSource(profile, "proteins", template.protein, random);
  const fatSource = template.fat ? resolveSource(profile, "fats", template.fat, random) : resolveSource(profile, "fats", "", random);
  const fruit = pickRandom(profile.fruits, random) || "fruit";

  const proteinGrams = gramsForItem(Math.max(10, target.p * 0.9), proteinSource, 100, 350, 5);
  const fatGrams = gramsForItem(Math.max(3, target.f * 0.85), fatSource, 8, 30, 1);

  return `Collation: ${formatIngredient(proteinSource, proteinGrams)} + ${fruit} + ${formatIngredient(fatSource, fatGrams)}`;
}

function generateMenuProposal({ clientId, weekStart, mode, variant, macros, calories }) {
  const normalizedMode = MENU_MODE_PROFILES[mode] ? mode : "economique";
  const profile = MENU_MODE_PROFILES[normalizedMode];
  const optionLabel = MENU_GENERATOR_OPTIONS.find((item) => item.key === normalizedMode)?.label || "Economique";
  const safeMacros = {
    protein: Math.max(90, Number(macros?.protein || 0)),
    carbs: Math.max(80, Number(macros?.carbs || 0)),
    fat: Math.max(30, Number(macros?.fat || 0))
  };
  const dailyTargets = mealTargetsFromDailyMacros(safeMacros);
  const seed = hashStringToSeed(`${clientId}:${weekStart}:${normalizedMode}:${variant}`);
  const random = createSeededRandom(seed);
  const plan = createEmptyWeeklyPlan();

  for (const day of DAY_KEYS) {
    plan[day.key] = {
      breakfast: createBreakfast(dailyTargets.breakfast, profile, random, normalizedMode),
      lunch: createMainMeal(dailyTargets.lunch, profile, random, normalizedMode),
      dinner: createMainMeal(dailyTargets.dinner, profile, random, normalizedMode),
      snack: createSnack(dailyTargets.snack, profile, random, normalizedMode)
    };
  }

  const notes =
    `Menu auto ${optionLabel} (variante ${variant + 1}). ` +
    `Cible: ${Math.round(Number(calories || 0))} kcal | ` +
    `P ${safeMacros.protein} g | G ${safeMacros.carbs} g | L ${safeMacros.fat} g. ` +
    "Ajuster +/-10% les portions selon faim, adherence et evolution du poids.";

  return { plan, notes };
}

export default function DashboardCoach({
  coach,
  clients,
  archivedClients,
  blogPosts,
  busy,
  onUpdateClientPlan,
  onCreateReport,
  onArchiveClient,
  onSaveWeeklyMenu,
  onRestoreArchivedClient,
  notifications,
  onMarkNotificationRead,
  onDeleteNotification,
  onOpenNotification,
  onDeletePhoto,
  onUpdateAppointment,
  onCancelAppointment,
  onSaveBlogPost,
  onDeleteBlogPost,
  onUploadBlogCover,
  chatMessages,
  onSendChatMessage,
  onMarkChatRead,
  onDeleteChatHistory,
  forcedView,
  onChangeView,
  forcedClientId
}) {
  const [deficitByClientId, setDeficitByClientId] = useState({});
  const [napByClientId, setNapByClientId] = useState({});
  const [bmrMethodByClientId, setBmrMethodByClientId] = useState({});
  const [reportDraftByClientId, setReportDraftByClientId] = useState({});
  const [menuDraftByClientId, setMenuDraftByClientId] = useState({});
  const [menuCsvTextByClientId, setMenuCsvTextByClientId] = useState({});
  const [menuCsvStatusByClientId, setMenuCsvStatusByClientId] = useState({});
  const [menuGeneratorModeByClientId, setMenuGeneratorModeByClientId] = useState({});
  const [menuGeneratorVariantByClientId, setMenuGeneratorVariantByClientId] = useState({});
  const [appointmentDraftByClientId, setAppointmentDraftByClientId] = useState({});
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeAppointmentClientId, setActiveAppointmentClientId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => monthStartLocal(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toDateKeyLocal(new Date()));
  const [coachView, setCoachView] = useState("clients");
  const [isCreatingBlogPost, setIsCreatingBlogPost] = useState(false);
  const [blogDraft, setBlogDraft] = useState({
    id: "",
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    category: "Astuces",
    readMinutes: 4,
    isPublished: true,
    coverImageUrl: ""
  });
  const [blogCoverFile, setBlogCoverFile] = useState(null);
  const [blogCsvFile, setBlogCsvFile] = useState(null);
  const [blogCsvStatus, setBlogCsvStatus] = useState("");
  const [saveFeedbackByClientId, setSaveFeedbackByClientId] = useState({});
  const feedbackTimeoutsRef = useRef({});

  const setCoachViewSynced = (nextView) => {
    setCoachView(nextView);
    if (typeof onChangeView === "function") {
      onChangeView(nextView);
    }
  };

  useEffect(() => {
    if (forcedView && forcedView !== coachView) {
      setCoachView(forcedView);
    }
  }, [forcedView, coachView]);

  useEffect(() => {
    return () => {
      Object.values(feedbackTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      feedbackTimeoutsRef.current = {};
    };
  }, []);

  const showSaveFeedback = (clientId, key, message) => {
    const timeoutKey = `${clientId}:${key}`;
    if (feedbackTimeoutsRef.current[timeoutKey]) {
      clearTimeout(feedbackTimeoutsRef.current[timeoutKey]);
    }
    setSaveFeedbackByClientId((prev) => ({
      ...prev,
      [timeoutKey]: message
    }));
    feedbackTimeoutsRef.current[timeoutKey] = setTimeout(() => {
      setSaveFeedbackByClientId((prev) => {
        const next = { ...prev };
        delete next[timeoutKey];
        return next;
      });
      delete feedbackTimeoutsRef.current[timeoutKey];
    }, 2200);
  };

  useEffect(() => {
    if (!forcedClientId) return;
    if (!clients.some((client) => client.id === forcedClientId)) return;
    setSelectedClientId(forcedClientId);
  }, [forcedClientId, clients]);

  useEffect(() => {
    setDeficitByClientId((prev) => {
      const next = {};
      for (const client of clients) {
        next[client.id] = Object.prototype.hasOwnProperty.call(prev, client.id)
          ? prev[client.id]
          : (client.deficit ?? 20);
      }
      return next;
    });
    setNapByClientId((prev) => {
      const next = {};
      for (const client of clients) {
        next[client.id] = Object.prototype.hasOwnProperty.call(prev, client.id)
          ? prev[client.id]
          : (client.nap ?? 1.4);
      }
      return next;
    });
    setBmrMethodByClientId((prev) => {
      const next = {};
      for (const client of clients) {
        next[client.id] = Object.prototype.hasOwnProperty.call(prev, client.id)
          ? prev[client.id]
          : (client.bmrMethod || "mifflin");
      }
      return next;
    });
    setReportDraftByClientId((prev) => {
      const next = { ...prev };
      for (const client of clients) {
        if (!next[client.id]) {
          next[client.id] = {
            sessionNotes: "",
            objectives: ""
          };
        }
      }
      for (const clientId of Object.keys(next)) {
        if (!clients.some((client) => client.id === clientId)) {
          delete next[clientId];
        }
      }
      return next;
    });

    setMenuDraftByClientId((prev) => {
      const next = {};
      for (const client of clients) {
        if (prev[client.id]) {
          // Keep local draft while typing to avoid wiping in-progress edits on realtime refresh.
          next[client.id] = prev[client.id];
          continue;
        }
        const latestMenu = client.weeklyMenus?.[0];
        next[client.id] = latestMenu
          ? {
              weekStart: latestMenu.weekStart,
              notes: latestMenu.notes || "",
              plan: latestMenu.plan || createEmptyWeeklyPlan()
            }
          : {
              weekStart: getMondayOfCurrentWeek(),
              notes: "",
              plan: createEmptyWeeklyPlan()
            };
      }
      return next;
    });
    setMenuGeneratorModeByClientId((prev) => {
      const next = {};
      for (const client of clients) {
        next[client.id] = prev[client.id] || "economique";
      }
      return next;
    });
    setMenuGeneratorVariantByClientId((prev) => {
      const next = {};
      for (const client of clients) {
        next[client.id] = Number.isFinite(prev[client.id]) ? prev[client.id] : 0;
      }
      return next;
    });

    if (clients.length === 0) {
      setSelectedClientId("");
      setActiveAppointmentClientId("");
    } else if (!clients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(clients[0].id);
    }

    if (activeAppointmentClientId && !clients.some((client) => client.id === activeAppointmentClientId)) {
      setActiveAppointmentClientId("");
    }
  }, [clients, selectedClientId, activeAppointmentClientId]);

  useEffect(() => {
    if (!blogPosts?.length) {
      setBlogDraft((prev) => ({
        ...prev,
        id: "",
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        category: "Astuces",
        readMinutes: 4,
        isPublished: true,
        coverImageUrl: ""
      }));
      return;
    }

    if (!isCreatingBlogPost && (!blogDraft.id || !blogPosts.some((post) => post.id === blogDraft.id))) {
      const first = blogPosts[0];
      setBlogDraft({
        id: first.id,
        title: first.title || "",
        slug: first.slug || "",
        excerpt: first.excerpt || "",
        content: first.content || "",
        category: first.category || "Astuces",
        readMinutes: first.readMinutes || 4,
        isPublished: Boolean(first.isPublished),
        coverImageUrl: first.coverImageUrl || ""
      });
    }
  }, [blogPosts, blogDraft.id, isCreatingBlogPost]);

  const clientsWithBilan = useMemo(
    () => clients.map((client) => ({ ...client, bilan: buildBilan(client) })),
    [clients]
  );

  const selectedClient = useMemo(
    () => clientsWithBilan.find((client) => client.id === selectedClientId) || clientsWithBilan[0] || null,
    [clientsWithBilan, selectedClientId]
  );

  const selectedClientMenuWeekOptions = useMemo(() => {
    if (!selectedClient) return [];
    const draftWeek = menuDraftByClientId[selectedClient.id]?.weekStart;
    return buildMenuWeekOptions(selectedClient.weeklyMenus, draftWeek);
  }, [selectedClient, menuDraftByClientId]);

  const selectedClientMetabolicPreview = useMemo(() => {
    if (!selectedClient) return null;
    return buildBilan(selectedClient, {
      nap: napByClientId[selectedClient.id] ?? selectedClient.nap ?? 1.4,
      deficit: deficitByClientId[selectedClient.id] ?? selectedClient.deficit ?? 20,
      bmrMethod: bmrMethodByClientId[selectedClient.id] || selectedClient.bmrMethod || "mifflin"
    });
  }, [selectedClient, napByClientId, deficitByClientId, bmrMethodByClientId]);

  const selectedClientMensurationEvolution = useMemo(() => {
    if (!selectedClient) return { hasData: false, items: [], summary: "" };
    return buildMensurationEvolution(selectedClient);
  }, [selectedClient]);

  const selectedClientChatMessages = useMemo(() => {
    if (!selectedClient) return [];
    const fromGlobal = (Array.isArray(chatMessages) ? chatMessages : []).filter(
      (entry) => entry.clientId === selectedClient.id
    );
    if (fromGlobal.length > 0) return fromGlobal;
    return Array.isArray(selectedClient.chatMessages) ? selectedClient.chatMessages : [];
  }, [chatMessages, selectedClient]);

  const allAppointments = useMemo(
    () =>
      clientsWithBilan
        .flatMap((client) =>
          (client.appointments || []).map((appointment) => ({
            ...appointment,
            clientName: client.name,
            clientEmail: client.email,
            clientId: client.id
          }))
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [clientsWithBilan]
  );

  const activeAppointmentClient = useMemo(
    () => clientsWithBilan.find((client) => client.id === activeAppointmentClientId) || null,
    [clientsWithBilan, activeAppointmentClientId]
  );

  const appointmentsByDate = useMemo(() => {
    const map = new Map();
    for (const appointment of allAppointments) {
      const key = toDateKeyLocal(appointment.startsAt);
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(appointment);
      map.set(key, current);
    }
    return map;
  }, [allAppointments]);

  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    [calendarMonth]
  );

  const calendarCells = useMemo(() => {
    const start = monthStartLocal(calendarMonth);
    const year = start.getFullYear();
    const month = start.getMonth();
    const firstWeekday = (start.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];

    for (let i = firstWeekday - 1; i >= 0; i -= 1) {
      const day = daysInPrevMonth - i;
      const date = new Date(year, month - 1, day, 12, 0, 0, 0);
      cells.push({ dateKey: toDateKeyLocal(date), day, inMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12, 0, 0, 0);
      cells.push({ dateKey: toDateKeyLocal(date), day, inMonth: true });
    }

    let nextDay = 1;
    while (cells.length < 42) {
      const date = new Date(year, month + 1, nextDay, 12, 0, 0, 0);
      cells.push({ dateKey: toDateKeyLocal(date), day: nextDay, inMonth: false });
      nextDay += 1;
    }

    return cells;
  }, [calendarMonth]);

  const selectedDayAppointments = useMemo(
    () => appointmentsByDate.get(selectedCalendarDate) || [],
    [appointmentsByDate, selectedCalendarDate]
  );

  const saveDeficit = async (clientId) => {
    const rawValue = deficitByClientId[clientId];
    const deficit = Number(rawValue);
    if (Number.isNaN(deficit)) return;
    await onUpdateClientPlan(clientId, { deficit });
    showSaveFeedback(clientId, "deficit", "Deficit enregistre.");
  };

  const saveMetabolicProfile = async (clientId) => {
    const nap = Number(napByClientId[clientId]);
    if (Number.isNaN(nap)) return;
    const bmrMethod = bmrMethodByClientId[clientId] || "mifflin";

    await onUpdateClientPlan(clientId, {
      nap,
      bmrMethod
    });
    showSaveFeedback(clientId, "metabolic", "NAP + methode MB enregistres.");
  };

  const createReport = async (client) => {
    const draft = reportDraftByClientId[client.id] || { sessionNotes: "", objectives: "" };
    const sessionNotes = (draft.sessionNotes || "").trim();
    const objectives = (draft.objectives || "").trim();
    const message = sessionNotes || client.coachMessage || "";
    const bilan = buildBilan(client);
    const menuSummary = buildMenuSummary(menuDraftByClientId[client.id] || client.weeklyMenus?.[0] || null);
    const progress = buildProgressSnapshot(client);
    const mensurationsEvolution = buildMensurationEvolution(client);
    const mensurations = {
      waistCm: client.waistCm ?? null,
      hipCm: client.hipCm ?? null,
      chestCm: client.chestCm ?? null,
      armCm: client.armCm ?? null,
      thighCm: client.thighCm ?? null
    };
    const bilanPayload = {
      ...bilan,
      sessionNotes,
      objectives,
      mensurations,
      mensurationsEvolution,
      menuSummary,
      progress
    };

    await onCreateReport({
      clientId: client.id,
      message,
      bilan: bilanPayload
    });

    const doc = new jsPDF();
    const contentStartY = await addPdfBranding(doc);
    const offset = contentStartY - 20;
    doc.setFontSize(17);
    doc.text(`Bilan coach - ${client.name}`, 14, 20 + offset);
    doc.setFontSize(12);
    doc.text(`Coach: ${coach.name}`, 14, 34 + offset);
    doc.text(`Objectif: ${client.goal || "-"}`, 14, 44 + offset);
    doc.text(`Poids: ${client.weight || "-"} kg`, 14, 54 + offset);
    doc.text(`Deficit: ${client.deficit || 20}%`, 14, 64 + offset);
    doc.text(`BMR: ${bilanPayload.bmr} kcal`, 14, 74 + offset);
    doc.text(`TDEE: ${bilanPayload.tdee} kcal`, 14, 84 + offset);
    doc.text(`Calories cible: ${bilanPayload.deficitCalories} kcal`, 14, 94 + offset);
    doc.text(
      `Macros: Proteines ${bilanPayload.macros.protein}g / Lipides ${bilanPayload.macros.fat}g / Glucides ${bilanPayload.macros.carbs}g`,
      14,
      104 + offset
    );
    let y = 118 + offset;
    const writeSection = (title) => {
      doc.setFontSize(12);
      doc.text(title, 14, y);
      y += 7;
    };
    const writeWrapped = (label, value) => {
      const lines = doc.splitTextToSize(`${label}: ${value || "-"}`, 180);
      doc.text(lines, 14, y);
      y += 6 * lines.length + 2;
    };
    writeSection("Synthese seance");
    writeWrapped("Notes de seance", message || "-");
    writeWrapped("Objectifs fixes", objectives || "-");
    writeWrapped("Menu donne", menuSummary.text || "-");
    writeSection("Progression client");
    writeWrapped(
      "Progression",
      `${progress.firstWeight ?? "-"} kg -> ${progress.lastWeight ?? "-"} kg (delta ${
        progress.deltaWeight ?? "-"
      } kg), Check-in ${progress.latestCheckinScore ?? "-"} (${
        progress.latestCheckinWeek || "-"
      }), Objectifs ${progress.goalsDone}/${progress.goalsCount} (${progress.goalsWeek || "-"})`
    );
    writeWrapped(
      "Mensurations (cm)",
      `Taille ${mensurations.waistCm ?? "-"} | Hanches ${mensurations.hipCm ?? "-"} | Poitrine ${
        mensurations.chestCm ?? "-"
      } | Bras ${mensurations.armCm ?? "-"} | Cuisse ${mensurations.thighCm ?? "-"}`
    );
    if (mensurationsEvolution.hasData) {
      writeWrapped("Evolution mensurations", mensurationsEvolution.summary);
    }
    doc.save(`bilan-coach-${client.name}.pdf`);

    setReportDraftByClientId((prev) => ({
      ...prev,
      [client.id]: {
        sessionNotes: "",
        objectives: ""
      }
    }));
  };

  const archiveClient = async (client) => {
    const ok = window.confirm(
      `Archiver et supprimer ${client.name} ?\\nSes donnees seront conservees dans les archives.`
    );
    if (!ok) return;
    await onArchiveClient(client.id);
  };

  const setMenuDraft = (clientId, updater) => {
    setMenuDraftByClientId((prev) => {
      const current =
        prev[clientId] || {
          weekStart: getMondayOfCurrentWeek(),
          notes: "",
          plan: createEmptyWeeklyPlan()
        };
      return {
        ...prev,
        [clientId]: typeof updater === "function" ? updater(current) : updater
      };
    });
  };

  const updateMeal = (clientId, dayKey, mealKey, value) => {
    setMenuDraft(clientId, (draft) => ({
      ...draft,
      plan: {
        ...draft.plan,
        [dayKey]: {
          ...draft.plan[dayKey],
          [mealKey]: value
        }
      }
    }));
  };

  const buildBilanWithCurrentSettings = (client) =>
    buildBilan(client, {
      nap: napByClientId[client.id] ?? client.nap ?? 1.4,
      deficit: deficitByClientId[client.id] ?? client.deficit ?? 20,
      bmrMethod: bmrMethodByClientId[client.id] || client.bmrMethod || "mifflin"
    });

  const applyGeneratedMenu = (client, nextVariant) => {
    const draft = menuDraftByClientId[client.id];
    const weekStart = draft?.weekStart || getMondayOfCurrentWeek();
    const mode = menuGeneratorModeByClientId[client.id] || "economique";
    const bilan = buildBilanWithCurrentSettings(client);
    const generated = generateMenuProposal({
      clientId: client.id,
      weekStart,
      mode,
      variant: nextVariant,
      macros: bilan.macros,
      calories: bilan.deficitCalories
    });
    setMenuDraft(client.id, (currentDraft) => ({
      ...currentDraft,
      weekStart,
      plan: generated.plan,
      notes: generated.notes
    }));
    showSaveFeedback(client.id, "menuGen", `Proposition ${nextVariant + 1} appliquee.`);
  };

  const generateMenuForClient = (client) => {
    const currentVariant = menuGeneratorVariantByClientId[client.id] || 0;
    applyGeneratedMenu(client, currentVariant);
  };

  const generateAlternativeMenuForClient = (client) => {
    const nextVariant = (menuGeneratorVariantByClientId[client.id] || 0) + 1;
    setMenuGeneratorVariantByClientId((prev) => ({ ...prev, [client.id]: nextVariant }));
    applyGeneratedMenu(client, nextVariant);
  };

  const importMenuCsvForClient = (client) => {
    const raw = menuCsvTextByClientId[client.id] || "";
    const parsed = parseMenuCsvToWeeklyPlan(raw);
    if (!parsed.ok) {
      setMenuCsvStatusByClientId((prev) => ({ ...prev, [client.id]: parsed.error }));
      return;
    }
    const weekStart = menuDraftByClientId[client.id]?.weekStart || getMondayOfCurrentWeek();
    setMenuDraft(client.id, (draft) => ({
      ...draft,
      weekStart,
      plan: parsed.plan
    }));
    setMenuCsvStatusByClientId((prev) => ({
      ...prev,
      [client.id]: `${parsed.filled} repas importes depuis le CSV.`
    }));
  };

  const saveWeeklyMenuForClient = async (client) => {
    const draft = menuDraftByClientId[client.id];
    if (!draft?.weekStart) return;
    await onSaveWeeklyMenu({
      clientId: client.id,
      weekStart: draft.weekStart,
      notes: draft.notes || "",
      plan: draft.plan || createEmptyWeeklyPlan()
    });
  };

  const loadAppointmentDraft = (clientId, appointment) => {
    if (!appointment) return;
    const starts = new Date(appointment.startsAt);
    const offset = starts.getTimezoneOffset() * 60000;
    const local = new Date(starts.getTime() - offset).toISOString().slice(0, 16);
    const duration = Math.max(15, Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000));
    setAppointmentDraftByClientId((prev) => ({
      ...prev,
      [clientId]: {
        appointmentId: appointment.id,
        startsAtLocal: local,
        durationMinutes: duration,
        status: appointment.status === "cancelled" ? "cancelled" : "confirmed",
        meetUrl: appointment.meetUrl || "",
        notes: appointment.notes || ""
      }
    }));
    setActiveAppointmentClientId(clientId);
  };

  const saveAppointmentForClient = async (client) => {
    const draft = appointmentDraftByClientId[client.id];
    if (!draft?.appointmentId || !draft.startsAtLocal) return;
    const starts = new Date(draft.startsAtLocal);
    if (Number.isNaN(starts.getTime())) return;
    const duration = Number(draft.durationMinutes) || 45;
    const ends = new Date(starts.getTime() + duration * 60000);
    await onUpdateAppointment({
      appointmentId: draft.appointmentId,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      status: draft.status,
      meetUrl: draft.meetUrl,
      notes: draft.notes
    });
  };

  const restoreArchived = async (archiveId) => {
    const ok = window.confirm("Restaurer ce client archive ?");
    if (!ok) return;
    await onRestoreArchivedClient(archiveId);
  };

  const slugify = (value) =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);

  const importBlogCsv = async () => {
    if (!blogCsvFile) return;
    try {
      setBlogCsvStatus("Import en cours...");
      const text = await blogCsvFile.text();
      const rows = parseCsvText(text);
      if (!rows.length) {
        setBlogCsvStatus("CSV vide ou invalide.");
        return;
      }

      let imported = 0;
      for (const row of rows) {
        const title = getCsvField(row, ["title", "titre", "name", "nom"]);
        const content = getCsvField(row, ["content", "contenu", "body"]);
        if (!title || !content) continue;

        const excerpt =
          getCsvField(row, ["excerpt", "resume", "résumé", "summary"]) || content.slice(0, 180);
        const category = getCsvField(row, ["category", "categorie", "catégorie"]) || "Astuces";
        const readMinutesRaw = Number(
          getCsvField(row, ["readminutes", "read_minutes", "temps", "reading_time"])
        );
        const readMinutes = Number.isFinite(readMinutesRaw) && readMinutesRaw > 0 ? readMinutesRaw : 4;
        const coverImageUrl = getCsvField(row, ["coverimageurl", "cover_image_url", "image", "cover"]);
        const publishedRaw = getCsvField(row, ["published", "publie", "publié", "is_published"]).toLowerCase();
        const isPublished = !["0", "false", "non", "no"].includes(publishedRaw);

        await onSaveBlogPost({
          title,
          slug: `${slugify(title) || "article"}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
          excerpt,
          content,
          category,
          readMinutes,
          coverImageUrl,
          isPublished
        });
        imported += 1;
      }

      setBlogCsvStatus(
        imported > 0 ? `${imported} article(s) importe(s).` : "Aucun article valide trouve dans le CSV."
      );
      setBlogCsvFile(null);
    } catch {
      setBlogCsvStatus("Erreur pendant l'import CSV.");
    }
  };

  const loadBlogPost = (post) => {
    setIsCreatingBlogPost(false);
    setBlogDraft({
      id: post.id,
      title: post.title || "",
      slug: post.slug || "",
      excerpt: post.excerpt || "",
      content: post.content || "",
      category: post.category || "Astuces",
      readMinutes: post.readMinutes || 4,
      isPublished: Boolean(post.isPublished),
      coverImageUrl: post.coverImageUrl || ""
    });
  };

  const createNewBlogDraft = () => {
    setIsCreatingBlogPost(true);
    setBlogDraft({
      id: "",
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      category: "Astuces",
      readMinutes: 4,
      isPublished: true,
      coverImageUrl: ""
    });
    setBlogCoverFile(null);
  };

  const saveCurrentBlogPost = async () => {
    const normalizedExcerpt = String(blogDraft.excerpt || "").trim();
    const normalizedContent = String(blogDraft.content || "").trim();
    const autoExcerpt = normalizedContent ? normalizedContent.slice(0, 180) : "";
    const baseSlug = blogDraft.slug || slugify(blogDraft.title);
    const slug = blogDraft.id ? baseSlug : `${baseSlug || "article"}-${Date.now().toString().slice(-6)}`;
    const saved = await onSaveBlogPost({
      ...blogDraft,
      excerpt: normalizedExcerpt || autoExcerpt,
      slug
    });
    if (saved) {
      setBlogDraft((prev) => ({
        ...prev,
        id: saved.id,
        slug: saved.slug || prev.slug
      }));
      setIsCreatingBlogPost(false);
    }
  };

  const removeCurrentBlogPost = async () => {
    await removeBlogPostById(blogDraft.id);
  };

  const removeBlogPostById = async (postId) => {
    if (!postId) return;
    const ok = window.confirm("Supprimer cet article ?");
    if (!ok) return;
    await onDeleteBlogPost(postId);
    if (blogDraft.id === postId) {
      createNewBlogDraft();
    }
  };

  const uploadCover = async () => {
    if (!blogCoverFile) return;
    const url = await onUploadBlogCover(blogCoverFile);
    if (url) {
      setBlogDraft((prev) => ({ ...prev, coverImageUrl: url }));
      setBlogCoverFile(null);
    }
  };

  return (
    <section className="coach-stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Coach</p>
          <h2>{coach.name}</h2>
        </div>
      </div>

      <NotificationsPanel
        items={notifications}
        busy={busy}
        onMarkRead={onMarkNotificationRead}
        onDelete={onDeleteNotification}
        onOpen={onOpenNotification}
        title="Notifications coach"
      />

      {clientsWithBilan.length > 0 ? (
        <section className="panel coach-client-picker">
          <div className="coach-client-picker-row">
            <label>
              Client selectionne
              <select
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                disabled={busy}
              >
                {clientsWithBilan.map((client) => (
                  <option key={`pick-${client.id}`} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            {coachView === "clients" ? (
              <div className="coach-kpis-compact-line">
                <span>
                  <strong>{clientsWithBilan.length}</strong> clients actifs
                </span>
                <span className="coach-kpi-sep">•</span>
                <span>
                  <strong>{(blogPosts || []).length}</strong> articles blog
                </span>
                <span className="coach-kpi-sep">•</span>
                <span>
                  <strong>{(archivedClients || []).length}</strong> archives
                </span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {coachView === "clients" && clientsWithBilan.length > 0 ? (
        <article className="panel client-detail-panel">
          {selectedClient ? (
            <>
              <div className="row-between">
                <h3>{selectedClient.name}</h3>
                <span>{selectedClient.email}</span>
              </div>
              <div className="detail-top-actions">
                <button className="danger" type="button" disabled={busy} onClick={() => archiveClient(selectedClient)}>
                  Archiver + Supprimer
                </button>
              </div>

              <section className="section-block">
                <h4>Nutrition</h4>
                {selectedClientMetabolicPreview ? (
                  <section className="metric-grid">
                    <article>
                      <small>Poids actuel</small>
                      <p>{selectedClient.weight ? `${Number(selectedClient.weight).toFixed(1)} kg` : "—"}</p>
                    </article>
                    <article>
                      <small>Age</small>
                      <p>{selectedClient.age ?? "—"}</p>
                    </article>
                    <article>
                      <small>Taille (cm)</small>
                      <p>{selectedClient.height ?? "—"}</p>
                    </article>
                    <article>
                      <small>IMC</small>
                      <p>{selectedClientMetabolicPreview.bmi ? `${selectedClientMetabolicPreview.bmi}` : "—"}</p>
                    </article>
                    <article>
                      <small>NAP</small>
                      <p>{selectedClientMetabolicPreview.nap}</p>
                    </article>
                    <article>
                      <small>BMR ({getBmrMethodLabel(selectedClientMetabolicPreview.bmrMethod)})</small>
                      <p>{selectedClientMetabolicPreview.bmr} kcal</p>
                    </article>
                    <article>
                      <small>TDEE</small>
                      <p>{selectedClientMetabolicPreview.tdee} kcal</p>
                    </article>
                    <article>
                      <small>Cible avec deficit ({selectedClientMetabolicPreview.deficitPercentage}%)</small>
                      <p>{selectedClientMetabolicPreview.deficitCalories} kcal</p>
                    </article>
                    <article>
                      <small>Proteines</small>
                      <p>{selectedClientMetabolicPreview.macros.protein} g</p>
                    </article>
                    <article>
                      <small>Lipides</small>
                      <p>{selectedClientMetabolicPreview.macros.fat} g</p>
                    </article>
                    <article>
                      <small>Glucides</small>
                      <p>{selectedClientMetabolicPreview.macros.carbs} g</p>
                    </article>
                    <article>
                      <small>Tour de taille (cm)</small>
                      <p>{selectedClient.waistCm ?? "—"}</p>
                    </article>
                    <article>
                      <small>Hanches (cm)</small>
                      <p>{selectedClient.hipCm ?? "—"}</p>
                    </article>
                    <article>
                      <small>Poitrine (cm)</small>
                      <p>{selectedClient.chestCm ?? "—"}</p>
                    </article>
                    <article>
                      <small>Bras (cm)</small>
                      <p>{selectedClient.armCm ?? "—"}</p>
                    </article>
                    <article>
                      <small>Cuisse (cm)</small>
                      <p>{selectedClient.thighCm ?? "—"}</p>
                    </article>
                  </section>
                ) : null}
                <p className="info-text">
                  {selectedClientMensurationEvolution.hasData
                    ? `Evolution mensurations: ${selectedClientMensurationEvolution.summary}`
                    : "Evolution mensurations: renseigne les mensurations sur plusieurs dates pour voir le delta."}
                </p>

                <section className="coach-progress-layout">
                  <section className="section-block">
                    <h4>Courbe de poids</h4>
                    {selectedClient.history?.length ? <GraphWeight data={selectedClient.history} /> : <p>Pas encore de poids enregistres.</p>}
                  </section>

                  <section className="section-block coach-metabolic-panel">
                    <h4>Deficit / NAP / MB</h4>
                    <label>
                      Deficit calorique (%)
                      <input
                        type="number"
                        min="5"
                        max="40"
                        value={deficitByClientId[selectedClient.id] ?? 20}
                        onChange={(event) =>
                          setDeficitByClientId((prev) => ({
                            ...prev,
                            [selectedClient.id]: event.target.value
                          }))
                        }
                        disabled={busy}
                      />
                    </label>
                    <button className="ghost" type="button" disabled={busy} onClick={() => saveDeficit(selectedClient.id)}>
                      Enregistrer deficit
                    </button>
                    {saveFeedbackByClientId[`${selectedClient.id}:deficit`] ? (
                      <p className="info-text">{saveFeedbackByClientId[`${selectedClient.id}:deficit`]}</p>
                    ) : null}

                    <section className="section-inline-grid">
                      <label>
                        NAP du client
                        <input
                          type="number"
                          step="0.05"
                          min="1.2"
                          max="2.2"
                          value={napByClientId[selectedClient.id] ?? 1.4}
                          onChange={(event) =>
                            setNapByClientId((prev) => ({
                              ...prev,
                              [selectedClient.id]: event.target.value
                            }))
                          }
                          disabled={busy}
                        />
                        <p className="info-text">Repere: {getNapReferenceLabel(napByClientId[selectedClient.id])}</p>
                      </label>

                      <label>
                        Methode de calcul MB
                        <select
                          value={bmrMethodByClientId[selectedClient.id] || "mifflin"}
                          onChange={(event) =>
                            setBmrMethodByClientId((prev) => ({
                              ...prev,
                              [selectedClient.id]: event.target.value
                            }))
                          }
                          disabled={busy}
                        >
                          {BMR_METHODS.map((method) => (
                            <option key={method.value} value={method.value}>
                              {method.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </section>
                    <button className="ghost" type="button" disabled={busy} onClick={() => saveMetabolicProfile(selectedClient.id)}>
                      Enregistrer NAP + methode MB
                    </button>
                    {saveFeedbackByClientId[`${selectedClient.id}:metabolic`] ? (
                      <p className="info-text">{saveFeedbackByClientId[`${selectedClient.id}:metabolic`]}</p>
                    ) : null}
                  </section>
                </section>
              </section>

              <section className="section-block">
                <h4>Photos du client</h4>
                {selectedClient.photos?.length ? null : <p>Aucune photo recue.</p>}
                <div className="photo-grid">
                  {(selectedClient.photos || []).map((photo) => (
                    <figure key={photo.id} className="photo-card">
                      <img
                        src={photo.imageUrl}
                        alt={`Progression de ${selectedClient.name}`}
                        loading="lazy"
                        decoding="async"
                      />
                      <figcaption>
                        <small>{new Date(photo.createdAt).toLocaleDateString()}</small>
                        {photo.caption ? <p>{photo.caption}</p> : null}
                        <button
                          className="danger"
                          type="button"
                          disabled={busy}
                          onClick={() => onDeletePhoto(photo.id)}
                        >
                          Supprimer
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>

              <section className="section-block">
                <h4>Bilan de seance</h4>
                <label>
                  Ce qu'on s'est dit
                  <textarea
                    value={reportDraftByClientId[selectedClient.id]?.sessionNotes || ""}
                    onChange={(event) =>
                      setReportDraftByClientId((prev) => ({
                        ...prev,
                        [selectedClient.id]: {
                          ...(prev[selectedClient.id] || {}),
                          sessionNotes: event.target.value
                        }
                      }))
                    }
                    placeholder="Resume de la consultation, points importants..."
                    disabled={busy}
                  />
                </label>
                <label>
                  Objectifs fixes
                  <textarea
                    value={reportDraftByClientId[selectedClient.id]?.objectives || ""}
                    onChange={(event) =>
                      setReportDraftByClientId((prev) => ({
                        ...prev,
                        [selectedClient.id]: {
                          ...(prev[selectedClient.id] || {}),
                          objectives: event.target.value
                        }
                      }))
                    }
                    placeholder="Ex: 2L d'eau/jour, 10k pas, 3 repas structures..."
                    disabled={busy}
                  />
                </label>
                <button className="primary" type="button" disabled={busy} onClick={() => createReport(selectedClient)}>
                  Enregistrer et generer bilan PDF
                </button>
              </section>
            </>
          ) : (
            <section className="section-block">
              <p>Selectionne un client.</p>
            </section>
          )}
        </article>
      ) : null}

      {coachView === "clients" && clientsWithBilan.length === 0 ? (
        <article className="panel">
          <p>Aucun client inscrit.</p>
        </article>
      ) : null}

      {coachView === "menus" && clientsWithBilan.length > 0 ? (
        <article className="panel coach-view-panel">
          <div className="row-between">
            <h3>Menus hebdomadaires</h3>
            <small>{clientsWithBilan.length} clients</small>
          </div>
          {selectedClient ? (
            <section className="section-block">
              <div className="row-between">
                <h4>Menu de {selectedClient.name}</h4>
                <div className="row-actions">
                  <select
                    className="menu-week-select"
                    value={menuDraftByClientId[selectedClient.id]?.weekStart || getMondayOfCurrentWeek()}
                    onChange={(event) =>
                      setMenuDraft(selectedClient.id, (draft) => ({ ...draft, weekStart: event.target.value }))
                    }
                    disabled={busy}
                  >
                    {selectedClientMenuWeekOptions.map((weekStart) => (
                      <option key={`coach-week-${weekStart}`} value={weekStart}>
                        Semaine du {weekStart}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label>
                Notes du coach
                <textarea
                  value={menuDraftByClientId[selectedClient.id]?.notes || ""}
                  onChange={(event) =>
                    setMenuDraft(selectedClient.id, (draft) => ({ ...draft, notes: event.target.value }))
                  }
                  placeholder="Consignes generales de la semaine"
                />
              </label>

              <div className="row-actions">
                <label>
                  Categorie
                  <select
                    value={menuGeneratorModeByClientId[selectedClient.id] || "economique"}
                    onChange={(event) => {
                      const mode = event.target.value;
                      setMenuGeneratorModeByClientId((prev) => ({
                        ...prev,
                        [selectedClient.id]: mode
                      }));
                      setMenuGeneratorVariantByClientId((prev) => ({
                        ...prev,
                        [selectedClient.id]: 0
                      }));
                    }}
                    disabled={busy}
                  >
                    {MENU_GENERATOR_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => generateMenuForClient(selectedClient)}
                >
                  Generer menu auto
                </button>
                <button
                  className="ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => generateAlternativeMenuForClient(selectedClient)}
                >
                  Autre proposition
                </button>
              </div>
              {saveFeedbackByClientId[`${selectedClient.id}:menuGen`] ? (
                <p className="info-text">{saveFeedbackByClientId[`${selectedClient.id}:menuGen`]}</p>
              ) : null}

              <label>
                Coller CSV menu (format: day,breakfast,lunch,dinner,snack)
                <textarea
                  value={menuCsvTextByClientId[selectedClient.id] || ""}
                  onChange={(event) =>
                    setMenuCsvTextByClientId((prev) => ({
                      ...prev,
                      [selectedClient.id]: event.target.value
                    }))
                  }
                  placeholder={"day,breakfast,lunch,dinner,snack\nmonday,Skyr + avoine,Riz + poulet,Saumon + legumes,Fruit + noix"}
                  disabled={busy}
                />
              </label>
              <div className="row-actions">
                <button
                  className="ghost"
                  type="button"
                  disabled={busy || !String(menuCsvTextByClientId[selectedClient.id] || "").trim()}
                  onClick={() => importMenuCsvForClient(selectedClient)}
                >
                  Importer CSV dans ce menu
                </button>
              </div>
              {menuCsvStatusByClientId[selectedClient.id] ? (
                <p className="info-text">{menuCsvStatusByClientId[selectedClient.id]}</p>
              ) : null}

              <div className="menu-days-stack">
                {DAY_KEYS.map((day) => (
                  <MenuDay
                    key={`menu-tab-${day.key}`}
                    dayLabel={day.label}
                    meals={menuDraftByClientId[selectedClient.id]?.plan?.[day.key]}
                    onChangeMeal={(mealKey, value) => updateMeal(selectedClient.id, day.key, mealKey, value)}
                  />
                ))}
              </div>

              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => saveWeeklyMenuForClient(selectedClient)}
              >
                Enregistrer menu hebdomadaire
              </button>
            </section>
          ) : (
            <section className="section-block">
              <p>Selectionne un client pour modifier son menu.</p>
            </section>
          )}
        </article>
      ) : null}

      {coachView === "menus" && clientsWithBilan.length === 0 ? (
        <article className="panel">
          <p>Aucun client inscrit.</p>
        </article>
      ) : null}

      {coachView === "messages" ? (
      <article className="panel coach-view-panel">
        <div className="row-between">
          <h3>Messagerie coach-client</h3>
          <small>{selectedClient ? selectedClient.name : "Aucun client"}</small>
        </div>
        {selectedClient ? (
          <ChatThread
            title={`Chat avec ${selectedClient.name}`}
            currentUserId={coach.id}
            messages={selectedClientChatMessages}
            busy={busy}
            placeholder="Ecris un message au client..."
            onSend={(message) => onSendChatMessage?.({ clientId: selectedClient.id, message })}
            onMarkRead={() => onMarkChatRead?.(selectedClient.id)}
            onDeleteHistory={() => onDeleteChatHistory?.(selectedClient.id)}
          />
        ) : (
          <p>Selectionne un client pour ouvrir la messagerie.</p>
        )}
      </article>
      ) : null}

      {coachView === "blog" ? (
      <article className="panel">
        <div className="row-between">
          <h3>Blog & Astuces</h3>
          <button className="ghost" type="button" disabled={busy} onClick={createNewBlogDraft}>
            Nouvel article
          </button>
        </div>
        <div className="coach-layout">
          <aside className="panel">
            <h4>Articles</h4>
            <div className="client-card-grid">
              {(blogPosts || []).map((post) => (
                <div key={post.id} className={`client-mini-card blog-list-item ${blogDraft.id === post.id ? "is-active" : ""}`}>
                  <button
                    type="button"
                    className="blog-list-main"
                    onClick={() => loadBlogPost(post)}
                    disabled={busy}
                  >
                    <strong>{post.title}</strong>
                    <small>{post.isPublished ? "Publie" : "Brouillon"}</small>
                  </button>
                  <button
                    type="button"
                    className="blog-delete-cross"
                    aria-label={`Supprimer ${post.title}`}
                    onClick={() => removeBlogPostById(post.id)}
                    disabled={busy}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <section className="section-block blog-editor">
            <div className="blog-list-header">
              <strong>{blogDraft.id ? "Modifier l'article" : "Nouvel article"}</strong>
              <small>Champs essentiels d'abord, options avancees en bas.</small>
            </div>
            <label>
              Titre
              <input
                type="text"
                value={blogDraft.title}
                onChange={(event) =>
                  setBlogDraft((prev) => ({
                    ...prev,
                    title: event.target.value,
                    slug: prev.id ? prev.slug : slugify(event.target.value)
                  }))
                }
                placeholder="Ex: 5 astuces pour mieux gerer ses collations"
                disabled={busy}
              />
            </label>
            <div className="blog-form-grid">
              <label>
                Categorie
                <select
                  value={blogDraft.category}
                  onChange={(event) => setBlogDraft((prev) => ({ ...prev, category: event.target.value }))}
                  disabled={busy}
                >
                  <option value="Astuces">Astuces</option>
                  <option value="Recettes">Recettes</option>
                  <option value="Sport">Sport</option>
                </select>
              </label>
              <label>
                Temps de lecture (min)
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={blogDraft.readMinutes}
                  onChange={(event) => setBlogDraft((prev) => ({ ...prev, readMinutes: Number(event.target.value) || 4 }))}
                  disabled={busy}
                />
              </label>
              <label className="goal-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(blogDraft.isPublished)}
                  onChange={(event) => setBlogDraft((prev) => ({ ...prev, isPublished: event.target.checked }))}
                  disabled={busy}
                />
                <span>Publie</span>
              </label>
            </div>
            <label>
              Contenu
              <textarea
                value={blogDraft.content}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, content: event.target.value }))}
                disabled={busy}
                rows={10}
                placeholder="Ecris ici ton article..."
              />
            </label>
            <label>
              Resume (optionnel)
              <textarea
                value={blogDraft.excerpt}
                onChange={(event) => setBlogDraft((prev) => ({ ...prev, excerpt: event.target.value }))}
                disabled={busy}
                rows={3}
                placeholder="Si vide, un resume automatique sera genere."
              />
            </label>
            <details className="blog-advanced">
              <summary>Options avancees</summary>
              <label>
                Slug
                <input
                  type="text"
                  value={blogDraft.slug}
                  onChange={(event) => setBlogDraft((prev) => ({ ...prev, slug: slugify(event.target.value) }))}
                  disabled={busy}
                />
              </label>
              <label>
                Image de couverture (URL)
                <input
                  type="url"
                  value={blogDraft.coverImageUrl}
                  onChange={(event) => setBlogDraft((prev) => ({ ...prev, coverImageUrl: event.target.value }))}
                  placeholder="https://..."
                  disabled={busy}
                />
              </label>
              <label>
                Ou upload une image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setBlogCoverFile(event.target.files?.[0] || null)}
                  disabled={busy}
                />
              </label>
              <div className="row-actions">
                <button className="ghost" type="button" disabled={busy || !blogCoverFile} onClick={uploadCover}>
                  Upload image
                </button>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setBlogCsvFile(event.target.files?.[0] || null)}
                  disabled={busy}
                />
                <button className="ghost" type="button" disabled={busy || !blogCsvFile} onClick={importBlogCsv}>
                  Import CSV
                </button>
              </div>
            </details>
            {blogDraft.coverImageUrl ? (
              <img
                className="blog-cover-preview"
                src={blogDraft.coverImageUrl}
                alt="Couverture article"
                loading="lazy"
                decoding="async"
              />
            ) : null}
            {blogCsvStatus ? <p className="muted">{blogCsvStatus}</p> : null}
            <div className="row-actions">
              <button className="primary" type="button" disabled={busy} onClick={saveCurrentBlogPost}>
                Enregistrer article
              </button>
              {blogDraft.id ? (
                <button className="danger" type="button" disabled={busy} onClick={removeCurrentBlogPost}>
                  Supprimer article
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </article>
      ) : null}

      {coachView === "archives" ? (
      <article className="panel">
        <h3>Clients archives</h3>
        {archivedClients?.length ? null : <p>Aucun client archive.</p>}
        <ul className="simple-list">
          {(archivedClients || []).map((client) => (
            <li key={client.id} className="row-between">
              <span>{client.name} ({client.email || "sans email"})</span>
              <div className="row-actions">
                <small>{new Date(client.archivedAt).toLocaleDateString()}</small>
                <button className="ghost" type="button" disabled={busy} onClick={() => restoreArchived(client.id)}>
                  Restaurer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </article>
      ) : null}

      {coachView === "appointments" ? (
      <article className="panel coach-view-panel">
        <div className="row-between">
          <h3>Rendez-vous visio</h3>
          <small>{allAppointments.length} rendez-vous</small>
        </div>

        <section className="calendar-shell">
          <div className="calendar-head">
            <button
              className="ghost"
              type="button"
              onClick={() => setCalendarMonth((prev) => addMonthsLocal(prev, -1))}
              disabled={busy}
            >
              Mois precedent
            </button>
            <strong>{calendarMonthLabel}</strong>
            <button
              className="ghost"
              type="button"
              onClick={() => setCalendarMonth((prev) => addMonthsLocal(prev, 1))}
              disabled={busy}
            >
              Mois suivant
            </button>
          </div>

          <div className="calendar-grid">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
              <div key={label} className="calendar-weekday">{label}</div>
            ))}
            {calendarCells.map((cell) => {
              const count = (appointmentsByDate.get(cell.dateKey) || []).length;
              const isSelected = selectedCalendarDate === cell.dateKey;
              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  className={`calendar-day${cell.inMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${count > 0 ? " has-events" : ""}`}
                  onClick={() => setSelectedCalendarDate(cell.dateKey)}
                >
                  <span>{cell.day}</span>
                  {count > 0 ? <small className="calendar-dot">{count}</small> : null}
                </button>
              );
            })}
          </div>

          <div className="calendar-day-list">
            <strong>Rendez-vous du {new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString("fr-FR")}</strong>
            {!selectedDayAppointments.length ? <p>Aucun rendez-vous ce jour.</p> : null}
            <ul className="simple-list">
              {selectedDayAppointments.map((appointment) => (
                <li key={`day-${appointment.id}`} className="row-between">
                  <span>{new Date(appointment.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {appointment.clientName}</span>
                  <button className="ghost" type="button" onClick={() => loadAppointmentDraft(appointment.clientId, appointment)}>
                    Editer
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {allAppointments.length === 0 ? <p>Aucun rendez-vous programme.</p> : null}
        <div className="checkin-list appointment-master-list">
          {allAppointments.map((appointment) => (
            <article key={appointment.id} className="checkin-item">
              <div className="row-between">
                <strong>{new Date(appointment.startsAt).toLocaleString()}</strong>
                <span className={`score-chip tone-${appointment.status === "confirmed" ? "good" : appointment.status === "cancelled" ? "low" : "medium"}`}>
                  {appointment.status}
                </span>
              </div>
              <p>
                <strong>{appointment.clientName}</strong> {appointment.clientEmail ? `(${appointment.clientEmail})` : ""}
              </p>
              {appointment.notes ? <p>{appointment.notes}</p> : null}
              <div className="row-actions">
                {appointment.meetUrl ? (
                  <a className="primary-link" href={appointment.meetUrl} target="_blank" rel="noreferrer">
                    Ouvrir Google Meet
                  </a>
                ) : (
                  <small>Pas encore de lien visio</small>
                )}
                <button
                  className="ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => loadAppointmentDraft(appointment.clientId, appointment)}
                >
                  Modifier
                </button>
                {appointment.status !== "cancelled" ? (
                  <button
                    className="danger"
                    type="button"
                    disabled={busy}
                    onClick={() => onCancelAppointment(appointment.id)}
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        {activeAppointmentClient && appointmentDraftByClientId[activeAppointmentClient.id]?.appointmentId ? (
          <section className="section-block" style={{ marginTop: 12 }}>
            <h4>
              Edition du rendez-vous - {activeAppointmentClient.name}
            </h4>
            <label>
              Date et heure
              <input
                type="datetime-local"
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.startsAtLocal || ""}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      startsAtLocal: event.target.value
                    }
                  }))
                }
                disabled={busy}
              />
            </label>
            <label>
              Duree
              <select
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.durationMinutes || 45}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      durationMinutes: Number(event.target.value)
                    }
                  }))
                }
                disabled={busy}
              >
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </label>
            <label>
              Statut
              <select
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.status || "confirmed"}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      status: event.target.value
                    }
                  }))
                }
                disabled={busy}
              >
                <option value="confirmed">confirmed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label>
              Lien visio
              <input
                type="url"
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.meetUrl || ""}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      meetUrl: event.target.value
                    }
                  }))
                }
                placeholder="https://meet.google.com/..."
                disabled={busy}
              />
            </label>
            <button
              className="ghost"
              type="button"
              disabled={busy}
              onClick={() => window.open("https://meet.new", "_blank", "noopener,noreferrer")}
            >
              Creer un Google Meet
            </button>
            <label>
              Notes
              <textarea
                value={appointmentDraftByClientId[activeAppointmentClient.id]?.notes || ""}
                onChange={(event) =>
                  setAppointmentDraftByClientId((prev) => ({
                    ...prev,
                    [activeAppointmentClient.id]: {
                      ...(prev[activeAppointmentClient.id] || {}),
                      notes: event.target.value
                    }
                  }))
                }
                disabled={busy}
              />
            </label>
            <div className="row-actions">
              <button className="primary" type="button" disabled={busy} onClick={() => saveAppointmentForClient(activeAppointmentClient)}>
                Enregistrer rendez-vous
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelectedClientId(activeAppointmentClient.id);
                  setCoachViewSynced("clients");
                }}
              >
                Ouvrir fiche client
              </button>
            </div>
          </section>
        ) : null}
      </article>
      ) : null}
    </section>
  );
}
