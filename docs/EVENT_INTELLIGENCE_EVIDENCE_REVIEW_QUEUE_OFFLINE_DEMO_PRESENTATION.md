# Offline-demo for evidence review queue

Start den lokale appen med `npm run dev`, og åpne `/intelligence/events/review/offline-demo`.

Ruten og server-side fixture-loaderen kjører bare når `NODE_ENV` er nøyaktig `development`. Andre verdier gir not-found før fixture-generering eller composition. Den vanlige `/intelligence/events/review`-ruten og dens blokkerte production-loader er ikke endret.

Demoen bruker faste syntetiske nyhetsrecords og cutoff `2026-10-03T12:00:00.000Z`, oppretter kandidater gjennom den eksisterende discovery-factoryen og sender candidate-bound routing-material gjennom eksisterende queue-composition og view-model-projeksjon. Den viser tre separate scenarioer: åpen issuer-mapping-review, blokkert rights-review og unresolved correction med lineage-review. Historical-markering og cutoff kommer fra den projiserte modellen.

Demoen er offline og read-only. Den inneholder ingen live nyheter, godkjente events, review-completion, rights-approval, signaler eller trading. Scenario-routing-fakta er syntetiske caller-inputs, ikke policy application eller applied authority. Den oppretter ingen autentisk correction-lifecycle-kjede.

Kjente begrensninger i queue conflict-precedence, routing-mapping/classifier-alignment og retraction-semantikk er ikke endret. Demoen etablerer ikke issuer-/reviewer-authorization, milestone-evidence, provenance completeness eller producer-authority. Den samme view-modelen som eksisterende read-only workspace bruker, er eneste domain-data som sendes til klienten.

## Verifikasjon

Loader-/rute-gate og fixture-til-view-model-integrasjon testes med repoets Vitest-oppsett. Full unit-suite, typecheck, lint, dependency-tree og security audit kjøres som del av denne slicen. En lokal loopback-kontroll verifiserer at demo- og vanlig review-rute svarer og viser forventet innhold uten login eller database. Nettleserautomatisering er ikke tilgjengelig i child-worktreen; desktop-/mobilskjermbilder er derfor ikke utført.
