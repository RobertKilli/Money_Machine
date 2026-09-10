"use client";

import { useActionState } from "react";

import { submitVirtualDeposit } from "@/app/dashboard/actions";

export function DepositForm({ financialAccountId, currencyCode, initialIdempotencyKey }: { readonly financialAccountId: string; readonly currencyCode: string; readonly initialIdempotencyKey: string }) {
  const [state, action, pending] = useActionState(submitVirtualDeposit, { status: "idle", idempotencyKey: initialIdempotencyKey });
  // A key belongs to one browser intent and stays stable for a retry.

  return (
    <form action={action} className="mt-5 space-y-3">
      <input name="financialAccountId" type="hidden" value={financialAccountId} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <label className="block text-sm font-medium" htmlFor="virtual-deposit-amount">Amount ({currencyCode})</label>
      <input className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" defaultValue="1000.00" id="virtual-deposit-amount" inputMode="decimal" name="amount" pattern="[0-9]+([.][0-9]{1,2})?" required />
      <button className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#07120f] disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Recording virtual deposit…" : `Deposit virtual ${currencyCode}`}
      </button>
      <p aria-live="polite" className={state.status === "error" ? "text-sm text-red-300" : "text-sm text-[var(--muted)]"}>
        {state.message ?? "SIMULATION · VIRTUAL MONEY · NO REAL FUNDS"}
      </p>
    </form>
  );
}
