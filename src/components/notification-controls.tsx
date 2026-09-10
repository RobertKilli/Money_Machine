"use client";
import { useEffect, useState } from "react";
type State = "UNSUPPORTED" | "PERMISSION_REQUIRED" | "DENIED" | "NOT_SUBSCRIBED" | "SUBSCRIBED" | "ERROR";
export function NotificationControls() {
  const [state, setState] = useState<State>("NOT_SUBSCRIBED");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const update = () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setState("UNSUPPORTED"); return; }
      if (Notification.permission === "denied") { setState("DENIED"); return; }
      if (Notification.permission === "default") { setState("PERMISSION_REQUIRED"); return; }
      void navigator.serviceWorker.getRegistration("/sw.js").then(r => setState(r ? "NOT_SUBSCRIBED" : "ERROR")).catch(() => setState("ERROR"));
    };
    queueMicrotask(update);
  }, []);
  const enable = async () => { try { const registration = await navigator.serviceWorker.register("/sw.js"); const permission = await Notification.requestPermission(); if (permission === "denied") { setState("DENIED"); return; } if (permission !== "granted") { setState("PERMISSION_REQUIRED"); return; } const keyResponse = await fetch("/api/admin/notifications/public-key"); const { publicKey } = await keyResponse.json(); const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey }); const response = await fetch("/api/admin/notifications/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh: subscription.toJSON().keys?.p256dh, auth: subscription.toJSON().keys?.auth } }) }); if (!response.ok) throw new Error("SUBSCRIBE_FAILED"); setState("SUBSCRIBED"); setMessage("Push subscription saved."); } catch { setState("ERROR"); setMessage("Push is unavailable on this device."); } };
  const test = async () => { const r = await fetch("/api/admin/notifications/test", { method: "POST" }); setMessage(r.ok ? "TEST notification requested." : "TEST notification unavailable."); };
  return <section className="mt-8 space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6"><p className="text-sm">Push status: <strong>{state}</strong></p><div className="flex gap-3"><button type="button" onClick={enable} disabled={state === "UNSUPPORTED" || state === "DENIED"} className="rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)]">Enable push</button><button type="button" onClick={test} disabled={state !== "SUBSCRIBED"} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Send TEST notification</button></div>{message && <p className="text-sm text-[var(--muted)]">{message}</p>}<p className="text-xs text-[var(--muted)]">SIMULATION / ADMIN ONLY. Browser permission and service-worker support are required.</p></section>;
}
