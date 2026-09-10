# M8 scheduler evidence

ROB-62 adds `POST /api/internal/notifications/process` as a separate machine-authenticated boundary. It requires `Authorization: Bearer <NOTIFICATION_SCHEDULER_SECRET>` and resolves the owner only from server-side `NOTIFICATION_SCHEDULER_ADMIN_USER_ID`. The manual admin endpoint remains unchanged.

The route invokes the existing processor use case with one explicit `asOf`, persisted notification state, durable claims, and Web Push. Zero-candidate runs are successful. Responses and logs are bounded and redacted.

No deployment provider is configured in this repository (no Vercel, Netlify, Railway, Render, Fly, Docker deployment, or GitHub Actions scheduler configuration). No remote deployment was changed. A future 5–15 minute cadence is recommended subject to provider limits. `EXTERNAL_SCHEDULER_HOOK_REQUIRED` remains.

Hosted unattended scheduled runs were not observed because no provider or external scheduler is configured: `SCHEDULER_IMPLEMENTATION_READY` / `HOSTED_UNATTENDED_PROOF_PENDING`.
