# Offline-demo for evidence review queue

Start den lokale appen med `npm run dev`, og åpne `/intelligence/events/review/offline-demo`.

Ruten og server-side fixture-loaderen kjører bare når `NODE_ENV` er nøyaktig `development`. Andre verdier gir not-found før fixture-generering eller composition. Den vanlige `/intelligence/events/review`-ruten og dens blokkerte production-loader er ikke endret.

Demoen bruker faste syntetiske nyhetsrecords og cutoff `2026-10-03T12:00:00.000Z`, oppretter kandidater gjennom den eksisterende discovery-factoryen og sender candidate-bound routing-material gjennom eksisterende queue-composition og view-model-projeksjon. Den viser tre separate scenarioer: åpen issuer-mapping-review, blokkert rights-review og unresolved correction med lineage-review. Historical-markering og cutoff kommer fra den projiserte modellen. Hvert scenario forklarer hvorfor det vises, hva som mangler og hva en reviewer må undersøke; neste handling er veiledende tekst, ikke en knapp eller godkjenning. En kompakt oversikt sammenligner scenarioenes faktiske status, prioritet og årsaker.

Demoen er offline og read-only. Den inneholder ingen live nyheter, godkjente events, review-completion, rights-approval, signaler eller trading. Scenario-routing-fakta er syntetiske caller-inputs, ikke policy application eller applied authority. Den oppretter ingen autentisk correction-lifecycle-kjede.

Hvert scenario har også en tastaturbetjent **View synthetic source context**-seksjon med en liten, fast presentasjons-DTO: syntetisk kildemerking/type, fixture-ID, faste mottaks-, publiserings- og oppdagelsestidspunkter, tittel, sammendrag, utvalgte metadata og relevansforklaring. Dette er kuratert demo-kontekst, ikke en serialisert discovery-record, kilde-URL eller domeneautoritet. Innholdet viser ikke kilde-sannhet, rettigheter, godkjenning eller en lifecycle-relasjon, og har ingen handlingskontroller. Native `<details>/<summary>` gir åpne/lukke-interaksjonen uten dialog eller egen fokuslogikk.

Kjente begrensninger i queue conflict-precedence, routing-mapping/classifier-alignment og retraction-semantikk er ikke endret. Demoen etablerer ikke issuer-/reviewer-authorization, milestone-evidence, provenance completeness eller producer-authority. Den samme view-modelen som eksisterende read-only workspace bruker, er eneste domain-data som sendes til klienten.

## Samlet syntetisk review-kø

I development er også `/intelligence/events/review/offline-demo/combined` tilgjengelig fra scenariooversikten. Den bygger de samme tre faste syntetiske fixture-kandidatene ved cutoff `2026-10-03T12:00:00.000Z` og sender dem samlet gjennom én eksisterende queue-composition og én view-model-projeksjon. Den viser composition-status, queue-status og antall fra den projiserte modellen i det eksisterende read-only workspace-et. Queueens runtime-sortering beholdes; rekkefølgen uttrykker review-behov, ikke investeringsverdi.

Rights er en kandidatspesifikk blocker i denne compositionen, så den blandede køen kan vise correction, rights og mapping samtidig uten å omgå rights-gaten. Ved gjeldende fixtures forventes correction `BLOCKED / URGENT_CORRECTION_REVIEW`, rights `BLOCKED / BLOCKED_RIGHTS` og issuer mapping `OPEN / MAPPING_REQUIRED`; de er historical ved den felles cutoffen. Disse resultatene er fortsatt `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`, og source-, policy-, review- eller producer-authority etableres ikke. Den vanlige review-ruten forblir blokkert utenfor development.

Den samlede ruten bruker ikke source-context-panelene og sender ingen discovery-, routing- eller queue-domainobjekter til klienten. Filtervalg endrer bare presentasjonen av den ene projiserte køen. Den faktiske verifikasjonen for denne utvidelsen står nedenfor.

## Verifikasjon

### Samlet kø-utvidelse

De nye integrasjonstestene bekrefter én faktisk composition med tre autentiske syntetiske candidates og én view-model-projeksjon: correction `BLOCKED / URGENT_CORRECTION_REVIEW`, rights `BLOCKED / BLOCKED_RIGHTS` og issuer mapping `OPEN / MAPPING_REQUIRED`, i denne runtime-sorteringen. Alle tre er historical ved cutoffen. Route- og direkte-loader-gatene avviser miljøer utenfor eksakt `development` før fixture-builder eller composition. Full suite, typecheck og lint består. `npm ls --all` avslutter med kode 0 og viser manglende valgfrie plattformintegrasjoner; Vite viser den eksisterende extensionless-helper-advarselen.

En egen lokal Edge headless-sesjon mot loopback bekreftet navigasjon fra oversikten til den samlede køen og tilbake, tre viste rader, status-/årsakstekster, felles cutoff, OPEN-filterets delmengde, filterets lokale tomtilstand og gjenoppretting av alle radene etter at filtrene ble tømt. Correction var synlig som standard. Ved 390 px var `scrollWidth` 390 px. Den vanlige review-ruten viste fortsatt blokkert tilstand. Nettverk utenfor loopback ble blokkert. `agent-browser`-CLI var ikke installert; interaksjonskontrollen ble gjort gjennom Edge DevTools Protocol. Dette var nettleserkontroll, ikke bare SSR/HTTP.

Loader-/rute-gate og fixture-til-view-model-integrasjon testes med repoets Vitest-oppsett. Interaksjoner for workspace-filtrene ble kontrollert manuelt i en isolert Edge-nettleser i den foregående presentasjonsslicen. For kildematerialvisningen i denne oppdateringen bestod SSR-testene, og en lokal loopback-HTTP-kontroll ga 200 med alle tre disclosure-panelene, correction og historical-markering. Edge startet ikke headless i denne gjennomgangen, så tastaturinteraksjon og mobil-/desktop-layout for de nye panelene ble ikke visuelt kontrollert. Native `<summary>` er fokusérbar og støtter nettleserens standard tastaturaktivering. Vitest-miljøet er `node` og mangler DOM-/React-testadaptere; ingen nye dependencies ble lagt til. Full unit-suite, typecheck, lint, dependency-tree og security audit er kjørt for kildematerialoppdateringen.
