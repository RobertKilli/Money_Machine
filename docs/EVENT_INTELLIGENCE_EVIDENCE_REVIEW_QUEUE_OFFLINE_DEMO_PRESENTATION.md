# Offline-demo for evidence review queue

Start den lokale appen med `npm run dev`, og åpne `/intelligence/events/review/offline-demo`.

Ruten og server-side fixture-loaderen kjører bare når `NODE_ENV` er nøyaktig `development`. Andre verdier gir not-found før fixture-generering eller composition. Den vanlige `/intelligence/events/review`-ruten og dens blokkerte production-loader er ikke endret.

Demoen bruker faste syntetiske nyhetsrecords og cutoff `2026-10-03T12:00:00.000Z`, oppretter kandidater gjennom den eksisterende discovery-factoryen og sender candidate-bound routing-material gjennom eksisterende queue-composition og view-model-projeksjon. Den viser tre separate scenarioer: åpen issuer-mapping-review, blokkert rights-review og unresolved correction med lineage-review. Historical-markering og cutoff kommer fra den projiserte modellen. Hvert scenario forklarer hvorfor det vises, hva som mangler og hva en reviewer må undersøke; neste handling er veiledende tekst, ikke en knapp eller godkjenning. En kompakt oversikt sammenligner scenarioenes faktiske status, prioritet og årsaker.

Demoen er offline og read-only. Den inneholder ingen live nyheter, godkjente events, review-completion, rights-approval, signaler eller trading. Scenario-routing-fakta er syntetiske caller-inputs, ikke policy application eller applied authority. Den oppretter ingen autentisk correction-lifecycle-kjede.

Kjente begrensninger i queue conflict-precedence, routing-mapping/classifier-alignment og retraction-semantikk er ikke endret. Demoen etablerer ikke issuer-/reviewer-authorization, milestone-evidence, provenance completeness eller producer-authority. Den samme view-modelen som eksisterende read-only workspace bruker, er eneste domain-data som sendes til klienten.

## Verifikasjon

Loader-/rute-gate og fixture-til-view-model-integrasjon testes med repoets Vitest-oppsett. Interaksjoner ble i tillegg kontrollert manuelt i en isolert Edge-nettleser mot childens loopback-server: issuer-filteret ga lokal tomtilstand, rights- og correction-workspace beholdt innhold og filtervalg, og reset viste issuer-raden igjen. Correction var synlig med standardfiltre, og et eksisterende detaljpanel kunne åpnes. Ved 390 px var dokumentbredden lik viewporten uten horisontal overflow; desktop og mobil ble visuelt kontrollert. Nettleserforespørsler var begrenset til loopback. Vitest-miljøet er `node` og mangler DOM-/React-testadaptere, så interaksjonsdekningen er manuell, ikke automatisert. Full unit-suite, typecheck, lint, dependency-tree og security audit kjøres som del av denne slicen.
