# M3 Intelligence Foundation Evidence

Status: PASS

The foundation contract is `intelligence-foundation/v1`. Provider and dataset identities are explicit and pinnable. News, market and macro records carry typed published/observed, available and ingested timestamps; historical reads filter only `availableAt <= asOf` and select the latest available revision deterministically. Revision 1 is never rewritten when a correction arrives.

`InMemoryIntelligenceStore` provides deterministic ingestion, idempotency, immutable conflict rejection, dataset-scoped temporal queries, and provenance-preserving mappings. Content posture is metadata-first; no real provider or news connector was added and no copyrighted body text is stored.

Migration `20260911000000_m3_intelligence_foundation.sql` adds typed provider, dataset, news revision, market observation, macro observation and mapping tables. RLS is enabled with no browser policies: ingestion and reads are server-mediated only. Append-only triggers reject updates/deletes of historical intelligence evidence. No financial, ledger, strategy, risk, execution, fill, portfolio or backtest table is touched by M3.

ROB-49 hosted validation applied the guarded migration only to `flsfallpputejojncyue`, verified schema presence, and ran the pure replay/count non-mutation probe. Full M1B–M2 hosted regression remains green (33 executed, one intentional skip). Security Advisor reports six intentional RLS-no-policy INFO findings for server-only tables plus the pre-existing leaked-password warning. Performance Advisor reports the pre-existing 13 unindexed-FK INFO findings; no new correctness blocker was introduced.

Local M3 tests: 73/73 PASS. Typecheck, lint and build PASS. M4 scoring, sentiment, AI interpretation, source connectors and strategy integration remain out of scope.
