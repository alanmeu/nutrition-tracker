const STORAGE_KEY = "nutrition_tracker_state_v1";

const todayIso = () => new Date().toISOString().slice(0, 10);

const seedUsers = [
  {
    id: "coach-1",
    role: "coach",
    name: "Coach Marion",
    email: "coach@demo.fr"
  },
  {
    id: "client-1",
    role: "client",
    name: "Alan",
    email: "alan@demo.fr",
    age: 32,
    sex: "male",
    height: 178,
    weight: 84,
    goal: "Perte de gras",
    nap: 1.45,
    deficit: 20,
    history: [
      { date: "2026-02-10", weight: 87 },
      { date: "2026-02-20", weight: 85.5 },
      { date: "2026-03-01", weight: 84 }
    ],
    coachMessage: "On continue la régularité: 8k pas/jour minimum.",
    reports: []
  },
  {
    id: "client-2",
    role: "client",
    name: "Sarah",
    email: "sarah@demo.fr",
    age: 28,
    sex: "female",
    height: 165,
    weight: 64,
    goal: "Recomposition",
    nap: 1.55,
    deficit: 12,
    history: [
      { date: "2026-02-10", weight: 65 },
      { date: "2026-02-20", weight: 64.5 },
      { date: "2026-03-01", weight: 64 }
    ],
    coachMessage: "Priorise 2 repas riches en protéines.",
    reports: []
  }
];

const defaultState = {
  users: seedUsers,
  session: {
    userId: null
  },
  metadata: {
    createdAt: todayIso()
  }
};

export function loadAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
      return defaultState;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.users || !Array.isArray(parsed.users)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
      return defaultState;
    }

    return parsed;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return defaultState;
  }
}

export function saveAppState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  return nextState;
}

export function resetAppState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
  return defaultState;
}

export function getUserById(state, userId) {
  return state.users.find((user) => user.id === userId) || null;
}

export function upsertUser(state, userId, updates) {
  return {
    ...state,
    users: state.users.map((user) =>
      user.id === userId ? { ...user, ...updates } : user
    )
  };
}
