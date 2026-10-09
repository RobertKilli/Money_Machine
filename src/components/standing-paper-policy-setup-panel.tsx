"use client";

import { useEffect, useState } from "react";
import { FIXTURE_ASSETS } from "@/domain/strategy/fixture-assets";

type EmptyPaperAccount = { financialAccountId: string };
type AccountState = { kind: "LOADING" } | { kind: "READY"; accounts: readonly EmptyPaperAccount[] } | { kind: "ERROR" };
const priceAges = [{ minutes: 15, label: "15 minutter" }, { minutes: 60, label: "1 time" }, { minutes: 1_440, label: "24 timer" }, { minutes: 10_080, label: "7 dager" }] as const;

async function readAccounts(): Promise<AccountState> {
  try {
    const response = await fetch("/api/dashboard/paper-policies", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return { kind: "ERROR" };
    const payload = await response.json() as { accounts?: unknown };
    if (!Array.isArray(payload.accounts) || payload.accounts.some(account => !account || typeof account !== "object" || typeof (account as Record<string, unknown>).financialAccountId !== "string" || !/^[0-9a-f-]{36}$/i.test((account as { financialAccountId: string }).financialAccountId))) return { kind: "ERROR" };
    return { kind: "READY", accounts: payload.accounts as EmptyPaperAccount[] };
  } catch { return { kind: "ERROR" }; }
}

function errorText(code: unknown): string {
  switch (code) {
    case "INVALID_LIMITS": return "Kontroller at grensene er innenfor de støttede NOK-beløpene og i riktig rekkefølge.";
    case "INVALID_REQUEST": return "Kontroller feltene og de valgte syntetiske instrumentene.";
    case "ACCOUNT_NOT_EMPTY": return "Kontoen har allerede ledgeraktivitet og kan ikke brukes til en ny paper-policy.";
    case "ACCOUNT_ALREADY_CONFIGURED": return "Kontoen har allerede en policy.";
    case "ACCOUNT_NOT_ELIGIBLE": return "Kontoen er ikke lenger en aktiv PAPER-konto i NOK.";
    case "NOT_FOUND": return "Den valgte kontoen er ikke tilgjengelig for brukeren din.";
    default: return "Policyutkastet kunne ikke lagres. Last inn siden på nytt og prøv igjen.";
  }
}

export function StandingPaperPolicySetupPanel({ onCreated }: { onCreated: () => Promise<void> }) {
  const [accountState, setAccountState] = useState<AccountState>({ kind: "LOADING" });
  const [accountId, setAccountId] = useState("");
  const [instruments, setInstruments] = useState<string[]>(FIXTURE_ASSETS.map(asset => asset.assetId));
  const [capitalBudgetNok, setCapitalBudgetNok] = useState("5000");
  const [maxOrderNok, setMaxOrderNok] = useState("500");
  const [maxPositionNok, setMaxPositionNok] = useState("1000");
  const [maxGrossExposureNok, setMaxGrossExposureNok] = useState("2000");
  const [maxLossNok, setMaxLossNok] = useState("250");
  const [maxPriceAgeMinutes, setMaxPriceAgeMinutes] = useState(60);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshAccounts = async () => {
    const next = await readAccounts();
    setAccountState(next);
    if (next.kind === "READY" && !next.accounts.some(account => account.financialAccountId === accountId)) setAccountId(next.accounts[0]?.financialAccountId ?? "");
  };
  useEffect(() => {
    let mounted = true;
    void readAccounts().then(next => {
      if (!mounted) return;
      setAccountState(next);
      if (next.kind === "READY") setAccountId(next.accounts[0]?.financialAccountId ?? "");
    });
    return () => { mounted = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dashboard/paper-policies", {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify({ financialAccountId: accountId, allowedInstrumentIds: instruments, capitalBudgetNok, maxOrderNok, maxPositionNok, maxGrossExposureNok, maxLossNok, maxPriceAgeMinutes }),
      });
      const payload = await response.json().catch(() => ({})) as { policyId?: unknown; status?: unknown; error?: unknown };
      if (!response.ok || typeof payload.policyId !== "string" || payload.status !== "DRAFT") {
        setMessage(errorText(payload.error));
        if (response.status === 409) await refreshAccounts();
        return;
      }
      setMessage("Policyutkastet er opprettet som DRAFT. Gå gjennom grensene på policykortet og bekreft aktivering separat.");
      await refreshAccounts();
      await onCreated();
    } catch { setMessage("Policyutkastet kunne ikke bekreftes. Oppdater status før du prøver igjen."); }
    finally { setPending(false); }
  }

  const accounts = accountState.kind === "READY" ? accountState.accounts : [];
  return <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-7" aria-labelledby="paper-policy-setup-title">
    <header className="mb-5">
      <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">PAPER_ONLY · SIMULERING</p>
      <h2 id="paper-policy-setup-title" className="mt-2 text-xl font-semibold">Opprett policyutkast</h2>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Velg en eksisterende, tom PAPER-konto og grensene som skal gjelde. Opprettelse lagrer bare DRAFT. Førstegangsaktivering krever en separat gjennomgang og bekreftelse av grensene.</p>
      <p className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-50">Kun syntetiske fixture-priser og simulerte fills. Ingen børsutførelse, live-priser eller worker startes her.</p>
    </header>
    {accountState.kind === "LOADING" ? <p role="status" className="text-sm text-[var(--muted)]">Henter ledige, eieravgrensede PAPER-kontoer …</p>
      : accountState.kind === "ERROR" ? <p role="status" className="text-sm text-rose-200">Kontolisten kunne ikke leses. Ingen konto er endret.</p>
        : accounts.length === 0 ? <p role="status" className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--muted)]">Ingen tom, ledig PAPER-konto i NOK er tilgjengelig. Denne siden oppretter ikke kontoer.</p>
          : <form onSubmit={event => void submit(event)} className="grid gap-5">
            <label className="grid gap-2 text-sm font-medium">Dedikert PAPER-konto
              <select required value={accountId} onChange={event => setAccountId(event.target.value)} className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
                {accounts.map(account => <option key={account.financialAccountId} value={account.financialAccountId}>PAPER-konto · {account.financialAccountId.slice(-8)}</option>)}
              </select>
              <span className="text-xs font-normal text-[var(--muted)]">Serveren kontrollerer eier, status og at ledgeren fortsatt er tom før lagring.</span>
            </label>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-semibold">Tillatte syntetiske instrumenter</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {FIXTURE_ASSETS.map(asset => <label key={asset.assetId} className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border)] px-3 text-sm">
                  <input type="checkbox" checked={instruments.includes(asset.assetId)} onChange={event => setInstruments(current => event.target.checked ? [...current, asset.assetId] : current.filter(id => id !== asset.assetId))} />
                  <span>{asset.symbol}<span className="block text-xs text-[var(--muted)]">Syntetisk fixture</span></span>
                </label>)}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AmountField label="Kapitalbudsjett (NOK)" value={capitalBudgetNok} setValue={setCapitalBudgetNok} />
              <AmountField label="Maks ordre (NOK)" value={maxOrderNok} setValue={setMaxOrderNok} />
              <AmountField label="Maks posisjon (NOK)" value={maxPositionNok} setValue={setMaxPositionNok} />
              <AmountField label="Maks samlet eksponering (NOK)" value={maxGrossExposureNok} setValue={setMaxGrossExposureNok} />
              <AmountField label="Maks innskuddsjustert tap (NOK)" value={maxLossNok} setValue={setMaxLossNok} />
              <label className="grid gap-2 text-sm font-medium">Maks prisalder
                <select value={maxPriceAgeMinutes} onChange={event => setMaxPriceAgeMinutes(Number(event.target.value))} className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
                  {priceAges.map(age => <option key={age.minutes} value={age.minutes}>{age.label}</option>)}
                </select>
              </label>
            </div>
            <p className="text-xs text-[var(--muted)]">NOK med opptil to desimaler. Kapitalbudsjettet må være 100–1 000 000 NOK. Maks ordre ≤ maks posisjon ≤ samlet eksponering ≤ kapitalbudsjett; tapsgrensen kan ikke overstige budsjettet.</p>
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-50">Alle priser er syntetiske fixture-data. Eventuelle fills blir simulerte, fullførte antakelser og er ikke børsutførelser.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={pending || !accountId || instruments.length === 0} className="min-h-11 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black disabled:cursor-wait disabled:opacity-60">{pending ? "Oppretter …" : "Opprett DRAFT-utkast"}</button>
              {message && <p role="status" className="text-sm text-[var(--muted)]">{message}</p>}
            </div>
          </form>}
  </section>;
}

function AmountField({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-medium">{label}
    <input required type="text" inputMode="decimal" value={value} onChange={event => setValue(event.target.value)} pattern="(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?" className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
    <span className="text-xs font-normal text-[var(--muted)]">NOK med opptil to desimaler, maks 1 000 000 NOK.</span>
  </label>;
}
