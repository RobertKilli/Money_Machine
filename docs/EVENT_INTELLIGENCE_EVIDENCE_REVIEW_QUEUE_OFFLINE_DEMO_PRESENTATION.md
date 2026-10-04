# Offline-demo for evidence review queue

Start den lokale appen med `npm run dev`, og åpne `/intelligence/events/review/offline-demo`.

Ruten og server-side fixture-loaderen kjører bare når `NODE_ENV` er nøyaktig `development`. Andre verdier gir not-found før fixture-generering eller composition. Den vanlige `/intelligence/events/review`-ruten og dens blokkerte production-loader er ikke endret.

Demoen bruker faste syntetiske nyhetsrecords og cutoff `2026-10-03T12:00:00.000Z`, oppretter kandidater gjennom den eksisterende discovery-factoryen og sender candidate-bound routing-material gjennom eksisterende queue-composition og view-model-projeksjon. Den viser tre separate scenarioer: åpen issuer-mapping-review, blokkert rights-review og unresolved correction med lineage-review. Historical-markering og cutoff kommer fra den projiserte modellen. Hvert scenario forklarer hvorfor det vises, hva som mangler og hva en reviewer må undersøke; neste handling er veiledende tekst, ikke en knapp eller godkjenning. En kompakt oversikt sammenligner scenarioenes faktiske status, prioritet og årsaker.

Demoen er offline og read-only. Den inneholder ingen live nyheter, godkjente events, review-completion, rights-approval, signaler eller trading. Scenario-routing-fakta er syntetiske caller-inputs, ikke policy application eller applied authority. Den oppretter ingen autentisk correction-lifecycle-kjede.

Hvert scenario har også en tastaturbetjent **View synthetic source context**-seksjon med en liten, fast presentasjons-DTO: syntetisk kildemerking/type, fixture-ID, faste mottaks-, publiserings- og oppdagelsestidspunkter, tittel, sammendrag, utvalgte metadata og relevansforklaring. Dette er kuratert demo-kontekst, ikke en serialisert discovery-record, kilde-URL eller domeneautoritet. Innholdet viser ikke kilde-sannhet, rettigheter, godkjenning eller en lifecycle-relasjon, og har ingen handlingskontroller. Native `<details>/<summary>` gir åpne/lukke-interaksjonen uten dialog eller egen fokuslogikk.

Kjente begrensninger i queue conflict-precedence, routing-mapping/classifier-alignment og retraction-semantikk er ikke endret. Demoen etablerer ikke issuer-/reviewer-authorization, milestone-evidence, provenance completeness eller producer-authority. Den samme view-modelen som eksisterende read-only workspace bruker, er eneste domain-data som sendes til klienten.

## Verifikasjon

Loader-/rute-gate og fixture-til-view-model-integrasjon testes med repoets Vitest-oppsett. Interaksjoner for workspace-filtrene ble kontrollert manuelt i en isolert Edge-nettleser i den foregående presentasjonsslicen. For kildematerialvisningen i denne oppdateringen bestod SSR-testene, og en lokal loopback-HTTP-kontroll ga 200 med alle tre disclosure-panelene, correction og historical-markering. Edge startet ikke headless i denne gjennomgangen, så tastaturinteraksjon og mobil-/desktop-layout for de nye panelene ble ikke visuelt kontrollert. Native `<summary>` er fokusérbar og støtter nettleserens standard tastaturaktivering. Vitest-miljøet er `node` og mangler DOM-/React-testadaptere; ingen nye dependencies ble lagt til. Full unit-suite, typecheck, lint, dependency-tree og security audit er kjørt for kildematerialoppdateringen.
