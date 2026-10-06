# Offline review workbench

## Recommended journey

Start at `/intelligence/events/review/offline-demo`. The overview explains the fixed synthetic data and links first to the combined queue. In that queue, open a candidate's explanation and synthetic source context, then return to the queue heading. Same-page fragment navigation keeps the current local filters in place. The total candidate count and filtered visible count are shown separately; reset is a local presentation control.

Use `/intelligence/events/review/offline-demo/replay` to compare two explicit synthetic input sets and their independently composed queues. The earlier set contains mapping and rights material; the later set adds unresolved correction material. This is not general historical retrieval or persistence.

Use `/intelligence/events/review/offline-demo/input-lab` only when you need to vary a bounded synthetic record. The form accepts up to three fixed mapping, rights, and correction profiles, include/omit selections, a short headline, four canonical UTC record times, a common cutoff, four jurisdiction values, and profile-compatible event hints. Submitted text remains a synthetic declaration even if it resembles a real headline. Each run creates fresh records in memory and calls the existing discovery factory and V2 composition (which uses the existing routing API), followed by the V2 projection. Parent discovery rejections remain rejections; no valid default record is substituted. The form is limited to three slots, a 160 UTF-16 code-unit headline, and 16 KiB of UTF-8 application fields. This application limit is not a network/request allocation bound. The Next Server Action runtime parses the request before application code and enforces its existing 1 MiB body limit (the repository's Next configuration does not override `serverActions.bodySizeLimit`); the 16 KiB application bound is enforced immediately after the action's development gate and before fixture/domain work. Reload clears the laboratory.

The parent V2 composer has no empty-queue representation: it rejects an empty candidate list with `COMPOSITION_INPUT_INVALID`. The input lab reports that actual bounded code and creates no queue or workspace. Non-empty records that survive discovery go through the existing V2 composer, which may still reject an invalid combined set; the page reports accepted, rejected, and composed counts separately.

The shared navigation places snapshot roundtrip, V1/V2 comparison, review session, and review readiness under the native “Teknisk innsikt” disclosure. Each page explains its question and limits before its technical metadata.

## Existing routes

| Route | Purpose |
| --- | --- |
| `/intelligence/events/review/offline-demo` | Entry point and the existing single-scenario examples; the validated `scenario` query remains supported. |
| `/intelligence/events/review/offline-demo/combined` | One authentic synthetic composition, candidate explanations, and server-bound synthetic source context. |
| `/intelligence/events/review/offline-demo/replay` | Two separate explicit input sets and their actual queue results; not point-in-time retrieval. |
| `/intelligence/events/review/offline-demo/snapshot` | In-memory codec and local scope-binding roundtrip; decoded payload does not regain domain trust. |
| `/intelligence/events/review/offline-demo/queue-v2` | Opt-in V1/V2 contract comparison; equal results demonstrate contract alignment, not changed behavior. |
| `/intelligence/events/review/offline-demo/review-session` | Evidence inventory owned by one exact in-memory session, not a global evidence history. |
| `/intelligence/events/review/offline-demo/review-readiness` | Local milestone result and actual queue blockers shown separately. Review routing context A to queue routing context B remains `NOT_ESTABLISHED`. |
| `/intelligence/events/review/offline-demo/input-lab` | Bounded development-only synthetic form; existing discovery, routing-through-V2-composition, and V2 projection determine actual accepted records and queue results. |

All demo routes and direct loaders require exact `NODE_ENV === "development"`. The ordinary `/intelligence/events/review` route continues to use its blocked production loader and displays no synthetic candidate rows.

## Boundaries

The examples use fixed synthetic fixtures and read-only presentation. Statuses, queue priority, `OPEN`, local `COMPLETED_PROCEED`, digests, and session results are not approval, investment ranking, a trading signal, lifecycle authority, policy application, or aggregate progression permission. Source context is curated synthetic presentation. Workspace filters change only the visible subset; they do not persist or alter composition.

The readiness page displays the actual queue status and blockers from its V2 composition. Its local milestone belongs to a separately bound review routing context. The relationship applying that review to the queue context is not established.

## Acceptance evidence

The consolidation retains the existing focused route, loader, composition, candidate-binding, and workspace tests, with additional semantic checks for the shared navigation destinations and active-page marker. On the current checkpoint, an isolated headless Microsoft Edge process and profile drove the local dev server over loopback using CDP; external host resolution was blocked. Native keyboard activation navigated from overview to combined queue, opened and returned from a candidate detail, preserved a one-row filter across detail navigation, produced the empty state, and reset via Space. Keyboard disclosure activation opened technical insight, followed by navigation to snapshot. Browser history traversal also returned from combined to overview and forward to combined. The browser opened the validated rights scenario URL, replay, V1/V2, session, readiness, and ordinary review routes. It confirmed correction/rights/mapping queue order, three historical rows, unique IDs and resolving ARIA/fragment references, independent V1/V2 filters, and no synthetic rows on ordinary review. At 1280 px desktop and 390 px mobile, overview, combined, replay, snapshot, V1/V2, session, readiness, scenario, and ordinary review pages had no horizontal overflow. These are local browser observations; the independent component/route tests remain the automated evidence. The `agent-browser` CLI was unavailable, so this acceptance used a separately launched Edge process with direct CDP instead.
