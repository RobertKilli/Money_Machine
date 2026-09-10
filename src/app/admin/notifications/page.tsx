import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/current-user";
import { NotificationControls } from "@/components/notification-controls";
export const dynamic = "force-dynamic";
export default async function AdminNotificationsPage() { try { await requireAdminUser(); } catch { redirect("/dashboard"); } return <main className="mx-auto min-h-screen max-w-4xl px-5 py-10"><p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">MONEY MACHINE / ADMIN</p><h1 className="mt-3 text-3xl font-semibold">Notifications</h1><p className="mt-3 text-sm text-[var(--muted)]">Read-only evidence alerts. Alerts are not recommendations or trading instructions.</p><NotificationControls /></main>; }
