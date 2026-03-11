import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import Login from "./pages/Login";
import DashboardClient from "./pages/client/DashboardClient";
import BlogClient from "./pages/client/BlogClient";
import MenuClient from "./pages/client/MenuClient";
import DashboardCoach from "./pages/coach/DashboardCoach";
import {
  addWeightEntry,
  archiveAndDeleteClient,
  bookMyAppointment,
  cancelAppointment,
  createDailySnapshots,
  createStripeCheckout,
  createStripePortal,
  createClientReport,
  deleteChatHistory,
  deleteBlogPost,
  deleteClientPhoto,
  deleteNotification,
  getSession,
  isOwnerCoachProfile,
  loadCurrentUserData,
  listBusyAppointmentSlots,
  onAuthStateChange,
  restoreArchivedClient,
  rescheduleMyAppointment,
  saveBlogPost,
  saveWeeklyGoals,
  saveWeeklyCheckin,
  saveWeeklyMenu,
  sendChatMessage,
  signOut,
  syncStripeSubscription,
  subscribeRealtimeForProfile,
  markChatMessagesRead,
  updateAppointmentByCoach,
  uploadClientPhoto,
  uploadBlogCover,
  updateClientPlan,
  markNotificationRead,
  updateWeeklyGoalsProgress,
  updateMyProfile
} from "./services";
import { hasSupabaseConfig } from "./utils/supabase";
import usePwaInstall from "./hooks/usePwaInstall";

const todayIso = () => new Date().toISOString().slice(0, 10);
const FREE_CLIENT_PAGES = new Set(["suivi", "menu", "blog", "messagerie"]);
const FREE_SAMPLE_WEEKLY_MENUS = [
  {
    id: "free-menu-type",
    weekStart: "Menu type",
    notes: "Version gratuite: ce menu est un exemple standard. Passe en Pro pour un menu 100% personnalise.",
    plan: {
      monday: {
        breakfast: "Skyr nature + flocons d'avoine + fruits rouges",
        lunch: "Poulet grille + quinoa + legumes verts",
        dinner: "Omelette + salade composee + pain complet",
        snack: "Amandes + fruit"
      },
      tuesday: {
        breakfast: "Yaourt grec + banane + graines de chia",
        lunch: "Saumon au four + riz complet + brocoli",
        dinner: "Soupe de legumes + tartines proteinees",
        snack: "Fromage blanc + cannelle"
      },
      wednesday: {
        breakfast: "Porridge avoine + pomme + beurre de cacahuete",
        lunch: "Dinde + patate douce + haricots verts",
        dinner: "Salade thon + avocat + tomates",
        snack: "Skyr + noix"
      },
      thursday: {
        breakfast: "Oeufs brouilles + pain complet + kiwi",
        lunch: "Boeuf 5% + semoule + courgettes",
        dinner: "Cabillaud + legumes rotis + quinoa",
        snack: "Yaourt nature + fruits"
      },
      friday: {
        breakfast: "Fromage blanc + muesli sans sucre + fraises",
        lunch: "Poulet curry maison + riz basmati + salade",
        dinner: "Wrap complet dinde + crudites",
        snack: "Fruit + poignee d'amandes"
      },
      saturday: {
        breakfast: "Smoothie proteine (lait + banane + avoine)",
        lunch: "Bowl tofu + legumes + riz complet",
        dinner: "Oeufs + pomme de terre vapeur + salade",
        snack: "Skyr + myrtilles"
      },
      sunday: {
        breakfast: "Pancakes avoine + yaourt + fruits",
        lunch: "Poisson blanc + lentilles + legumes",
        dinner: "Soupe + omelette + tranche de pain complet",
        snack: "Fromage blanc + noix"
      }
    }
  }
];

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [clients, setClients] = useState([]);
  const [history, setHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [archivedClients, setArchivedClients] = useState([]);
  const [weeklyMenus, setWeeklyMenus] = useState([]);
  const [clientPhotos, setClientPhotos] = useState([]);
  const [weeklyCheckins, setWeeklyCheckins] = useState([]);
  const [weeklyGoals, setWeeklyGoals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [busyAppointmentSlots, setBusyAppointmentSlots] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [blogPosts, setBlogPosts] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientPage, setClientPage] = useState("suivi");
  const [coachPage, setCoachPage] = useState("clients");
  const [processingSubscriptionReturn, setProcessingSubscriptionReturn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const realtimeRefreshTimeoutRef = useRef(null);
  const silentRefreshInFlightRef = useRef(false);
  const silentRefreshQueuedRef = useRef(false);
  const lastRealtimeRefreshAtRef = useRef(0);
  const snapshotsInitRef = useRef(false);
  const sessionRef = useRef(null);
  const checkoutSyncRef = useRef("");
  const { canInstallPrompt, needsIosManualInstall, installLabel, promptInstall } = usePwaInstall();

  const hydrate = useCallback(async (nextSession, options = {}) => {
    const silent = Boolean(options.silent);

    if (!nextSession?.user) {
      setSession(null);
      setProfile(null);
      setClients([]);
      setHistory([]);
      setReports([]);
      setArchivedClients([]);
      setWeeklyMenus([]);
      setClientPhotos([]);
      setWeeklyCheckins([]);
      setWeeklyGoals([]);
      setAppointments([]);
      setBusyAppointmentSlots([]);
      setNotifications([]);
      setSubscription(null);
      setBlogPosts([]);
      setChatMessages([]);
      setLoading(false);
      setClientPage("suivi");
      setCoachPage("clients");
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const data = await loadCurrentUserData(nextSession.user);
      setSession(nextSession);
      setProfile(data.profile);
      setClients(data.clients);
      setHistory(data.history);
      setReports(data.reports);
      setArchivedClients(data.archivedClients || []);
      setWeeklyMenus(data.weeklyMenus || []);
      setClientPhotos(data.clientPhotos || []);
      setWeeklyCheckins(data.weeklyCheckins || []);
      setWeeklyGoals(data.weeklyGoals || []);
      setAppointments(data.appointments || []);
      if (!isOwnerCoachProfile(data.profile)) {
        const busySlots = await listBusyAppointmentSlots();
        setBusyAppointmentSlots(busySlots);
      } else {
        setBusyAppointmentSlots([]);
      }
      setNotifications(data.notifications || []);
      setSubscription(data.subscription || null);
      setBlogPosts(data.blogPosts || []);
      setChatMessages(data.chatMessages || []);
    } catch (err) {
      setError(err.message || "Erreur de chargement des donnees.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    (async () => {
      try {
        const activeSession = await getSession();
        if (active) await hydrate(activeSession);
      } catch (err) {
        if (active) {
          setError(err.message || "Impossible d'ouvrir la session.");
          setLoading(false);
        }
      }
    })();

    const { data: listener } = onAuthStateChange((event, nextSession) => {
      // Avoid page-level re-hydration on tab focus/token refresh while editing forms.
      if (event === "TOKEN_REFRESHED") return;
      if (
        event === "SIGNED_IN" &&
        sessionRef.current?.user?.id &&
        nextSession?.user?.id === sessionRef.current.user.id
      ) {
        return;
      }
      hydrate(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [hydrate]);

  const refresh = useCallback(async () => {
    if (!session) return;
    await hydrate(session);
  }, [hydrate, session]);

  const refreshSilent = useCallback(async () => {
    if (!session) return;
    if (silentRefreshInFlightRef.current) {
      silentRefreshQueuedRef.current = true;
      return;
    }
    silentRefreshInFlightRef.current = true;
    try {
      do {
        silentRefreshQueuedRef.current = false;
        await hydrate(session, { silent: true });
      } while (silentRefreshQueuedRef.current);
    } finally {
      silentRefreshInFlightRef.current = false;
    }
  }, [hydrate, session]);

  useEffect(() => {
    if (!profile) return undefined;

    const realtimeIdentity = {
      id: profile.id,
      role: profile.role,
      email: profile.email
    };

    const scheduleRealtimeRefresh = () => {
      if (realtimeRefreshTimeoutRef.current) return;

      realtimeRefreshTimeoutRef.current = setTimeout(() => {
        realtimeRefreshTimeoutRef.current = null;
        lastRealtimeRefreshAtRef.current = Date.now();
        refreshSilent();
      }, 350);
    };

    const unsubscribe = subscribeRealtimeForProfile(realtimeIdentity, scheduleRealtimeRefresh);

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [profile, refreshSilent]);

  const withBusy = async (task) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (updates) => {
    if (!profile) return;

    await withBusy(async () => {
      await updateMyProfile(profile.id, updates);
      refreshSilent();
    });
  };

  const handleAddWeight = async (entry) => {
    if (!profile) return;

    await withBusy(async () => {
      await addWeightEntry(profile.id, entry);
      refreshSilent();
    });
  };

  const handleUpdateClientPlan = async (clientId, updates) => {
    await withBusy(async () => {
      await updateClientPlan(clientId, updates);
      refreshSilent();
    });
  };

  const handleCreateReport = async ({ clientId, message, bilan }) => {
    if (!profile) return;

    await withBusy(async () => {
      await createClientReport({
        coachId: profile.id,
        clientId,
        date: todayIso(),
        message,
        bilan
      });
      refreshSilent();
    });
  };

  const handleArchiveClient = async (clientId) => {
    await withBusy(async () => {
      await archiveAndDeleteClient(clientId);
      refreshSilent();
    });
  };

  const handleSaveWeeklyMenu = async ({ clientId, weekStart, notes, plan }) => {
    if (!profile) return;

    await withBusy(async () => {
      await saveWeeklyMenu({
        coachId: profile.id,
        clientId,
        weekStart,
        notes,
        plan
      });
      refreshSilent();
    });
  };

  const handleUploadClientPhoto = async ({ file, caption }) => {
    if (!profile) return;
    await withBusy(async () => {
      await uploadClientPhoto({
        clientId: profile.id,
        file,
        caption
      });
      refreshSilent();
    });
  };

  const handleSaveWeeklyCheckin = async (payload) => {
    if (!profile) return;
    await withBusy(async () => {
      await saveWeeklyCheckin({
        clientId: profile.id,
        ...payload
      });
      refreshSilent();
    });
  };

  const handleSaveWeeklyGoals = async ({ clientId, weekStart, goals }) => {
    if (!profile) return;
    await withBusy(async () => {
      await saveWeeklyGoals({
        coachId: profile.id,
        clientId,
        weekStart,
        goals
      });
      refreshSilent();
    });
  };

  const handleUpdateWeeklyGoalsProgress = async ({ weekStart, goals }) => {
    if (!profile) return;
    await withBusy(async () => {
      await updateWeeklyGoalsProgress({
        clientId: profile.id,
        weekStart,
        goals
      });
      refreshSilent();
    });
  };

  const handleRestoreArchivedClient = async (archiveId) => {
    await withBusy(async () => {
      await restoreArchivedClient(archiveId);
      refreshSilent();
    });
  };

  const handleBookAppointment = async (payload) => {
    if (!profile) return;
    await withBusy(async () => {
      await bookMyAppointment({
        clientId: profile.id,
        ...payload
      });
      refreshSilent();
    });
  };

  const handleRescheduleAppointment = async (payload) => {
    if (!profile) return;
    await withBusy(async () => {
      await rescheduleMyAppointment({
        clientId: profile.id,
        ...payload
      });
      refreshSilent();
    });
  };

  const handleUpdateAppointmentByCoach = async (payload) => {
    await withBusy(async () => {
      await updateAppointmentByCoach(payload);
      refreshSilent();
    });
  };

  const handleCancelAppointment = async (appointmentId) => {
    await withBusy(async () => {
      await cancelAppointment({ appointmentId });
      refreshSilent();
    });
  };

  const handleMarkNotificationRead = async (notificationId) => {
    await withBusy(async () => {
      await markNotificationRead(notificationId);
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, readAt } : item))
      );
    });
  };

  const handleDeleteNotification = async (notificationId) => {
    await withBusy(async () => {
      await deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    });
  };

  const handleDeletePhoto = async (photoId) => {
    await withBusy(async () => {
      await deleteClientPhoto(photoId);
      setClientPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
      setClients((prev) =>
        prev.map((client) => ({
          ...client,
          photos: (client.photos || []).filter((photo) => photo.id !== photoId)
        }))
      );
    });
  };

  const handleSendChatMessage = async ({ clientId, message }) => {
    try {
      setError("");
      const text = String(message || "").trim();
      if (!text) return;

      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic = {
        id: tempId,
        clientId,
        coachId: isOwnerCoachProfile(profile) ? profile.id : "",
        senderId: profile?.id || "",
        message: text,
        readAt: null,
        createdAt: new Date().toISOString()
      };
      setChatMessages((prev) => [...(Array.isArray(prev) ? prev : []), optimistic]);

      const saved = await sendChatMessage({ clientId, message: text });
      if (saved?.id) {
        setChatMessages((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const withoutTemp = list.filter((item) => item.id !== tempId);
          if (withoutTemp.some((item) => item.id === saved.id)) return withoutTemp;
          return [...withoutTemp, saved];
        });
      }
      refreshSilent();
    } catch (err) {
      setChatMessages((prev) =>
        (Array.isArray(prev) ? prev : []).filter((item) => !String(item.id || "").startsWith("tmp-"))
      );
      setError(err.message || "Impossible d'envoyer le message.");
      throw err;
    }
  };

  const handleMarkChatRead = async (clientId) => {
    try {
      setError("");
      const nowIso = new Date().toISOString();
      setChatMessages((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item.clientId === clientId && !item.readAt && item.senderId !== profile?.id
            ? { ...item, readAt: nowIso }
            : item
        )
      );
      await markChatMessagesRead({ clientId });
      refreshSilent();
    } catch (err) {
      setError(err.message || "Impossible de marquer les messages comme lus.");
      throw err;
    }
  };

  const handleDeleteChatHistory = async (clientId) => {
    await withBusy(async () => {
      await deleteChatHistory({ clientId });
      setChatMessages((prev) => (Array.isArray(prev) ? prev.filter((item) => item.clientId !== clientId) : []));
      refreshSilent();
    });
  };

  const handleSaveBlogPost = async (payload) => {
    let saved = null;
    await withBusy(async () => {
      saved = await saveBlogPost(payload);
      refreshSilent();
    });
    return saved;
  };

  const handleDeleteBlogPost = async (postId) => {
    await withBusy(async () => {
      await deleteBlogPost(postId);
      refreshSilent();
    });
  };

  const handleUploadBlogCover = async (file) => {
    let uploadedUrl = "";
    await withBusy(async () => {
      uploadedUrl = await uploadBlogCover(file);
    });
    return uploadedUrl;
  };

  const handleSubscribe = async (planCode) => {
    await withBusy(async () => {
      const url = await createStripeCheckout(planCode);
      window.location.assign(url);
    });
  };

  const handleManageSubscription = async () => {
    await withBusy(async () => {
      const url = await createStripePortal();
      window.location.assign(url);
    });
  };

  const handleInstallApp = async () => {
    if (canInstallPrompt) {
      await promptInstall();
      return;
    }
    if (needsIosManualInstall) {
      setIosInstallOpen((prev) => !prev);
    }
  };

  const headerTitle = useMemo(() => {
    if (!profile) return "Nutri Cloud";
    if (isOwnerCoachProfile(profile)) return "Espace Coach";
    const firstName = (profile.name || "").trim().split(/\s+/).filter(Boolean)[0];
    return firstName || "Espace Client";
  }, [profile]);

  useEffect(() => {
    if (!profile || !isOwnerCoachProfile(profile) || snapshotsInitRef.current) return;
    snapshotsInitRef.current = true;
    createDailySnapshots().catch(() => {});
  }, [profile]);

  useEffect(() => {
    if (!profile || isOwnerCoachProfile(profile)) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const source = params.get("source");
    if (checkout !== "success" || source !== "subscription") return;

    const syncKey = `${checkout}:${source}:${params.get("session_id") || ""}`;
    if (checkoutSyncRef.current === syncKey) return;
    checkoutSyncRef.current = syncKey;

    let cancelled = false;
    setProcessingSubscriptionReturn(true);
    setClientPage("suivi");
    const url = new URL(window.location.href);
    ["checkout", "source", "target", "session_id"].forEach((key) => {
      url.searchParams.delete(key);
    });
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

    (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await syncStripeSubscription();
          await refreshSilent();
          break;
        } catch (err) {
          if (attempt === 2 || cancelled) break;
          await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
        }
      }
      if (!cancelled) {
        setProcessingSubscriptionReturn(false);
      }
    })();

    return () => {
      cancelled = true;
      setProcessingSubscriptionReturn(false);
    };
  }, [profile, refreshSilent]);

  useEffect(() => {
    if (!profile || isOwnerCoachProfile(profile)) {
      setClientPage("suivi");
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || !isOwnerCoachProfile(profile)) {
      setCoachPage("clients");
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return undefined;
    const isMessagingView =
      (isOwnerCoachProfile(profile) && coachPage === "messages") ||
      (!isOwnerCoachProfile(profile) && clientPage === "messagerie");
    if (!isMessagingView) return undefined;

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastRealtimeRefreshAtRef.current < 2500) return;
      refreshSilent();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [profile, coachPage, clientPage, refreshSilent]);

  if (!hasSupabaseConfig) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <h1>Configuration Supabase requise</h1>
          <p>Ajoute ces variables dans `.env` puis redemarre `npm start`.</p>
          <pre>{`REACT_APP_SUPABASE_URL=https://xxxx.supabase.co\nREACT_APP_SUPABASE_ANON_KEY=xxxx\nREACT_APP_OWNER_COACH_EMAIL=ton-email-coach@domaine.com`}</pre>
          <p>Ensuite execute le SQL de `supabase/schema.sql` dans ton projet Supabase.</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <h1>Chargement...</h1>
          <p>Connexion a Supabase en cours.</p>
        </section>
      </main>
    );
  }

  if (!profile) {
    return <Login busy={busy} onError={setError} onSuccess={refresh} error={error} />;
  }

  const isCoach = isOwnerCoachProfile(profile);
  const hasActiveSubscription = Boolean(
    subscription &&
      ["active", "trialing", "past_due"].includes((subscription.status || "").toLowerCase())
  );
  const isFreeClient = !isCoach && !hasActiveSubscription;

  if (isFreeClient && processingSubscriptionReturn) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <h1>Activation de ton abonnement...</h1>
          <p>Un instant, on finalise ton acces puis on t'envoie sur ton suivi.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-inline">
          <img src="/brand-mark-v3.svg?v=20260311d" alt="Nutri Cloud" className="brand-logo" />
          <div>
            <h1>{headerTitle}</h1>
          </div>
          <p className="brand-tagline">Nutrition saine, humaine et durable</p>
        </div>

        <div className="header-actions">
          {!isCoach ? (
            <div className="client-nav">
              {isFreeClient ? (
                <>
                  <button
                    className={clientPage === "messagerie" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("messagerie")}
                  >
                    Messagerie
                  </button>
                  <button
                    className={clientPage === "suivi" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("suivi")}
                  >
                    Mon suivi
                  </button>
                  <button
                    className={clientPage === "menu" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("menu")}
                  >
                    Menu type
                  </button>
                  <button
                    className={clientPage === "blog" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("blog")}
                  >
                    Blog
                  </button>
                  <button className="primary" type="button" disabled={busy} onClick={() => handleSubscribe("premium")}>
                    Passer Pro
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={clientPage === "messagerie" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("messagerie")}
                  >
                    Messagerie
                  </button>
                  <button
                    className={clientPage === "menu" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("menu")}
                  >
                    Menu
                  </button>
                  <button
                    className={clientPage === "suivi" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("suivi")}
                  >
                    Mon suivi
                  </button>
                  <button
                    className={clientPage === "rdv" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("rdv")}
                  >
                    RDV
                  </button>
                  <button
                    className={clientPage === "blog" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("blog")}
                  >
                    Blog
                  </button>
                  <button
                    className={clientPage === "autre" ? "primary" : "ghost"}
                    type="button"
                    disabled={busy}
                    onClick={() => setClientPage("autre")}
                  >
                    Autre
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="client-nav">
              <button
                className={coachPage === "clients" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setCoachPage("clients")}
              >
                Clients
              </button>
              <button
                className={coachPage === "menus" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setCoachPage("menus")}
              >
                Menus
              </button>
              <button
                className={coachPage === "appointments" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setCoachPage("appointments")}
              >
                RDV
              </button>
              <button
                className={coachPage === "messages" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setCoachPage("messages")}
              >
                Messagerie
              </button>
              <button
                className={coachPage === "blog" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setCoachPage("blog")}
              >
                Blog
              </button>
              <button
                className={coachPage === "archives" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setCoachPage("archives")}
              >
                Archives
              </button>
            </div>
          )}
          {(canInstallPrompt || needsIosManualInstall) ? (
            <button
              className="ghost"
              type="button"
              disabled={busy}
              onClick={handleInstallApp}
            >
              {installLabel}
            </button>
          ) : null}
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => withBusy(signOut)}
          >
            Se deconnecter
          </button>
        </div>
      </header>
      {needsIosManualInstall && iosInstallOpen ? (
        <div className="install-hint">
          Sur iPhone: partage Safari puis <strong>Sur l'ecran d'accueil</strong>.
        </div>
      ) : null}

      <main className={`container ${((!isCoach && (clientPage === "menu" || clientPage === "blog")) || (isCoach && (coachPage === "menus" || coachPage === "blog"))) ? "container-wide" : ""}`}>
        {error ? <p className="error-banner">{error}</p> : null}

        {isCoach ? (
          <DashboardCoach
            coach={profile}
            clients={clients}
            archivedClients={archivedClients}
            blogPosts={blogPosts}
            busy={busy}
            onUpdateClientPlan={handleUpdateClientPlan}
            onCreateReport={handleCreateReport}
            onArchiveClient={handleArchiveClient}
            onSaveWeeklyMenu={handleSaveWeeklyMenu}
            onSaveWeeklyGoals={handleSaveWeeklyGoals}
            onRestoreArchivedClient={handleRestoreArchivedClient}
            notifications={notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            onDeleteNotification={handleDeleteNotification}
            onDeletePhoto={handleDeletePhoto}
            onUpdateAppointment={handleUpdateAppointmentByCoach}
            onCancelAppointment={handleCancelAppointment}
            onSaveBlogPost={handleSaveBlogPost}
            onDeleteBlogPost={handleDeleteBlogPost}
            onUploadBlogCover={handleUploadBlogCover}
            chatMessages={chatMessages}
            onSendChatMessage={handleSendChatMessage}
            onMarkChatRead={handleMarkChatRead}
            onDeleteChatHistory={handleDeleteChatHistory}
            forcedView={coachPage}
            onChangeView={setCoachPage}
          />
        ) : !hasActiveSubscription && !FREE_CLIENT_PAGES.has(clientPage) ? (
          <DashboardClient
            user={profile}
            subscription={subscription}
            history={history}
            reports={reports}
            clientPhotos={clientPhotos}
            weeklyCheckins={weeklyCheckins}
            weeklyGoals={weeklyGoals}
            notifications={notifications}
            busy={busy}
            onSaveProfile={handleSaveProfile}
            onAddWeight={handleAddWeight}
            onUploadPhoto={handleUploadClientPhoto}
            onSaveWeeklyCheckin={handleSaveWeeklyCheckin}
            onUpdateWeeklyGoalsProgress={handleUpdateWeeklyGoalsProgress}
            onMarkNotificationRead={handleMarkNotificationRead}
            onDeleteNotification={handleDeleteNotification}
            onDeletePhoto={handleDeletePhoto}
            appointments={appointments}
            busyAppointmentSlots={busyAppointmentSlots}
            onBookAppointment={handleBookAppointment}
            onRescheduleAppointment={handleRescheduleAppointment}
            onCancelAppointment={handleCancelAppointment}
            onManageSubscription={handleManageSubscription}
            chatMessages={chatMessages}
            onSendChatMessage={handleSendChatMessage}
            onMarkChatRead={handleMarkChatRead}
            onDeleteChatHistory={handleDeleteChatHistory}
            visibleSections={["profile"]}
          />
        ) : (
          clientPage === "messagerie" ? (
            <DashboardClient
              user={profile}
              subscription={subscription}
              history={history}
              reports={reports}
              clientPhotos={clientPhotos}
              weeklyCheckins={weeklyCheckins}
              weeklyGoals={weeklyGoals}
              notifications={notifications}
              busy={busy}
              onSaveProfile={handleSaveProfile}
              onAddWeight={handleAddWeight}
              onUploadPhoto={handleUploadClientPhoto}
              onSaveWeeklyCheckin={handleSaveWeeklyCheckin}
              onUpdateWeeklyGoalsProgress={handleUpdateWeeklyGoalsProgress}
              onMarkNotificationRead={handleMarkNotificationRead}
              onDeleteNotification={handleDeleteNotification}
              onDeletePhoto={handleDeletePhoto}
              appointments={appointments}
              busyAppointmentSlots={busyAppointmentSlots}
              onBookAppointment={handleBookAppointment}
              onRescheduleAppointment={handleRescheduleAppointment}
              onCancelAppointment={handleCancelAppointment}
              onManageSubscription={handleManageSubscription}
              chatMessages={chatMessages}
              onSendChatMessage={handleSendChatMessage}
              onMarkChatRead={handleMarkChatRead}
              onDeleteChatHistory={handleDeleteChatHistory}
              visibleSections={hasActiveSubscription ? ["messages", "photos", "reports"] : ["messages"]}
            />
          ) : clientPage === "menu" ? (
            <MenuClient weeklyMenus={hasActiveSubscription ? weeklyMenus : FREE_SAMPLE_WEEKLY_MENUS} />
          ) : clientPage === "rdv" ? (
            <DashboardClient
              user={profile}
              subscription={subscription}
              history={history}
              reports={reports}
              clientPhotos={clientPhotos}
              weeklyCheckins={weeklyCheckins}
              weeklyGoals={weeklyGoals}
              notifications={notifications}
              busy={busy}
              onSaveProfile={handleSaveProfile}
              onAddWeight={handleAddWeight}
              onUploadPhoto={handleUploadClientPhoto}
              onSaveWeeklyCheckin={handleSaveWeeklyCheckin}
              onUpdateWeeklyGoalsProgress={handleUpdateWeeklyGoalsProgress}
              onMarkNotificationRead={handleMarkNotificationRead}
              onDeleteNotification={handleDeleteNotification}
              onDeletePhoto={handleDeletePhoto}
              appointments={appointments}
              busyAppointmentSlots={busyAppointmentSlots}
              onBookAppointment={handleBookAppointment}
              onRescheduleAppointment={handleRescheduleAppointment}
              onCancelAppointment={handleCancelAppointment}
              onManageSubscription={handleManageSubscription}
              chatMessages={chatMessages}
              onSendChatMessage={handleSendChatMessage}
              onMarkChatRead={handleMarkChatRead}
              onDeleteChatHistory={handleDeleteChatHistory}
              visibleSections={["appointments"]}
            />
          ) : clientPage === "blog" ? (
            <BlogClient posts={blogPosts} />
          ) : clientPage === "autre" ? (
            <DashboardClient
              user={profile}
              subscription={subscription}
              history={history}
              reports={reports}
              clientPhotos={clientPhotos}
              weeklyCheckins={weeklyCheckins}
              weeklyGoals={weeklyGoals}
              notifications={notifications}
              busy={busy}
              onSaveProfile={handleSaveProfile}
              onAddWeight={handleAddWeight}
              onUploadPhoto={handleUploadClientPhoto}
              onSaveWeeklyCheckin={handleSaveWeeklyCheckin}
              onUpdateWeeklyGoalsProgress={handleUpdateWeeklyGoalsProgress}
              onMarkNotificationRead={handleMarkNotificationRead}
              onDeleteNotification={handleDeleteNotification}
              onDeletePhoto={handleDeletePhoto}
              appointments={appointments}
              busyAppointmentSlots={busyAppointmentSlots}
              onBookAppointment={handleBookAppointment}
              onRescheduleAppointment={handleRescheduleAppointment}
              onCancelAppointment={handleCancelAppointment}
              onManageSubscription={handleManageSubscription}
              chatMessages={chatMessages}
              onSendChatMessage={handleSendChatMessage}
              onMarkChatRead={handleMarkChatRead}
              onDeleteChatHistory={handleDeleteChatHistory}
              visibleSections={["notifications", "billing", "goals"]}
            />
          ) : (
            <DashboardClient
              user={profile}
              subscription={subscription}
              history={history}
              reports={reports}
              clientPhotos={clientPhotos}
              weeklyCheckins={weeklyCheckins}
              weeklyGoals={weeklyGoals}
              notifications={notifications}
              busy={busy}
              onSaveProfile={handleSaveProfile}
              onAddWeight={handleAddWeight}
              onUploadPhoto={handleUploadClientPhoto}
              onSaveWeeklyCheckin={handleSaveWeeklyCheckin}
              onUpdateWeeklyGoalsProgress={handleUpdateWeeklyGoalsProgress}
              onMarkNotificationRead={handleMarkNotificationRead}
              onDeleteNotification={handleDeleteNotification}
              onDeletePhoto={handleDeletePhoto}
              appointments={appointments}
              busyAppointmentSlots={busyAppointmentSlots}
              onBookAppointment={handleBookAppointment}
              onRescheduleAppointment={handleRescheduleAppointment}
              onCancelAppointment={handleCancelAppointment}
              onManageSubscription={handleManageSubscription}
              chatMessages={chatMessages}
              onSendChatMessage={handleSendChatMessage}
              onMarkChatRead={handleMarkChatRead}
              onDeleteChatHistory={handleDeleteChatHistory}
              visibleSections={hasActiveSubscription ? ["profile", "weight", "checkins"] : ["profile"]}
            />
          )
        )}
      </main>
    </div>
  );
}
