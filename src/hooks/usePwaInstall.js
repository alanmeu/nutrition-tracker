import { useEffect, useMemo, useState } from "react";

function isStandaloneDisplay() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
}

export default function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandaloneDisplay());

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const canInstallPrompt = Boolean(deferredPrompt) && !installed;
  const needsIosManualInstall = isIosDevice() && !installed && !deferredPrompt;

  const installLabel = useMemo(() => {
    if (canInstallPrompt) return "Installer l'app";
    if (needsIosManualInstall) return "Installer sur iPhone";
    return "";
  }, [canInstallPrompt, needsIosManualInstall]);

  const promptInstall = async () => {
    if (!deferredPrompt) return { outcome: "unavailable" };
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return result;
  };

  return {
    installed,
    canInstallPrompt,
    needsIosManualInstall,
    installLabel,
    promptInstall
  };
}
