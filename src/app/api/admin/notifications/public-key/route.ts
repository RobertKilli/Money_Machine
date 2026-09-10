import { requireAdminUser } from "@/lib/auth/current-user";
export async function GET() { try { await requireAdminUser(); } catch { return Response.json({ error: "FORBIDDEN" }, { status: 403 }); } const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; return key ? Response.json({ publicKey: key }) : Response.json({ error: "WEB_PUSH_TRANSPORT_UNCONFIGURED" }, { status: 503 }); }
