import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import nutriCloudLogo from "./assets/nutri-cloud-logo.svg";
import Login from "./pages/Login";
import DashboardClient from "./pages/client/DashboardClient";
import BlogClient from "./pages/client/BlogClient";
import MenuClient from "./pages/client/MenuClient";
import DashboardCoach from "./pages/coach/DashboardCoach";
import SubscriptionGate from "./pages/client/SubscriptionGate";
import {
  addWeightEntry,
  archiveAndDeleteClient,
  bookMyAppointment,
  cancelAppointment,
  createDailySnapshots,
  createStripeCheckout,
  createStripePortal,
  createClientReport,
  deleteBlogPost,
  deleteClientPhoto,
  deleteNotification,
  getSession,
  isOwnerCoachProfile,
  loadCurrentUserData,
  listBusyAppointmentSlots,
  onAuthStateChange,
  restoreArchivedClient,
  saveBlogPost,
  saveWeeklyGoals,
  saveWeeklyCheckin,
  saveWeeklyMenu,
  signOut,
  subscribeRealtimeForProfile,
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
  const [loading, setLoading] = useState(true);
  const [clientPage, setClientPage] = useState("suivi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const realtimeRefreshTimeoutRef = useRef(null);
  const snapshotsInitRef = useRef(false);
  const sessionRef = useRef(null);
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
      setLoading(false);
      setClientPage("suivi");
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
    await hydrate(session, { silent: true });
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
      await refresh();
    });
  };

  const handleAddWeight = async (entry) => {
    if (!profile) return;

    await withBusy(async () => {
      await addWeightEntry(profile.id, entry);
      await refresh();
    });
  };

  const handleUpdateClientPlan = async (clientId, updates) => {
    await withBusy(async () => {
      await updateClientPlan(clientId, updates);
      await refresh();
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
      await refresh();
    });
  };

  const handleArchiveClient = async (clientId) => {
    await withBusy(async () => {
      await archiveAndDeleteClient(clientId);
      await refresh();
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
      await refresh();
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
      await refresh();
    });
  };

  const handleSaveWeeklyCheckin = async (payload) => {
    if (!profile) return;
    await withBusy(async () => {
      await saveWeeklyCheckin({
        clientId: profile.id,
        ...payload
      });
      await refresh();
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
      await refresh();
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
      await refresh();
    });
  };

  const handleRestoreArchivedClient = async (archiveId) => {
    await withBusy(async () => {
      await restoreArchivedClient(archiveId);
      await refresh();
    });
  };

  const handleBookAppointment = async (payload) => {
    if (!profile) return;
    await withBusy(async () => {
      await bookMyAppointment({
        clientId: profile.id,
        ...payload
      });
      await refresh();
    });
  };

  const handleUpdateAppointmentByCoach = async (payload) => {
    await withBusy(async () => {
      await updateAppointmentByCoach(payload);
      await refresh();
    });
  };

  const handleCancelAppointment = async (appointmentId) => {
    await withBusy(async () => {
      await cancelAppointment({ appointmentId });
      await refresh();
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

  const handleSaveBlogPost = async (payload) => {
    let saved = null;
    await withBusy(async () => {
      saved = await saveBlogPost(payload);
      await refresh();
    });
    return saved;
  };

  const handleDeleteBlogPost = async (postId) => {
    await withBusy(async () => {
      await deleteBlogPost(postId);
      await refresh();
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
    if (!profile || isOwnerCoachProfile(profile)) {
      setClientPage("suivi");
    }
  }, [profile]);

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

  const hasActiveSubscription = Boolean(
    subscription &&
      ["active", "trialing", "past_due"].includes((subscription.status || "").toLowerCase())
  );

  if (!isOwnerCoachProfile(profile) && !hasActiveSubscription) {
    return (
      <SubscriptionGate
        user={profile}
        subscription={subscription}
        busy={busy}
        error={error}
        onSubscribe={handleSubscribe}
        onManageSubscription={handleManageSubscription}
        onSignOut={() => withBusy(signOut)}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <img src={nutriCloudLogo} alt="Nutri Cloud" className="brand-logo" />
          <h1>{headerTitle}</h1>
          <p className="brand-tagline">Coaching nutrition intelligent et humain</p>
        </div>

        <div className="header-actions">
          {!isOwnerCoachProfile(profile) ? (
            <div className="client-nav">
              <button
                className={clientPage === "suivi" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setClientPage("suivi")}
              >
                Suivi
              </button>
              <button
                className={clientPage === "menu" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setClientPage("menu")}
              >
                Menu hebdo
              </button>
              <button
                className={clientPage === "blog" ? "primary" : "ghost"}
                type="button"
                disabled={busy}
                onClick={() => setClientPage("blog")}
              >
                Blog & Astuces
              </button>
            </div>
          ) : null}
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

      <main className={`container ${!isOwnerCoachProfile(profile) && (clientPage === "menu" || clientPage === "blog") ? "container-wide" : ""}`}>
        {error ? <p className="error-banner">{error}</p> : null}

        {isOwnerCoachProfile(profile) ? (
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
          />
        ) : (
          clientPage === "blog" ? (
            <BlogClient posts={blogPosts} />
          ) : clientPage === "menu" ? (
            <MenuClient weeklyMenus={weeklyMenus} />
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
              onCancelAppointment={handleCancelAppointment}
              onManageSubscription={handleManageSubscription}
            />
          )
        )}
      </main>
    </div>
  );
}
