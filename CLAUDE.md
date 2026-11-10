# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project rules live in [AGENTS.md](AGENTS.md) (explain in Vietnamese, plan before non-trivial changes, one focused task at a time, no schema/infrastructure changes without approval). `apps/web/CLAUDE.md` only re-exports `apps/web/AGENTS.md`, which carries a Next.js warning: this Next version has breaking changes relative to training data — read `apps/web/node_modules/next/dist/docs/` before writing web code.

## Layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 App Router frontend (React 19, Tailwind 4). Route groups `(auth)`, `(customer)`, `(merchant)`; feature code in `src/features/<feature>`; one API client in `src/lib/api.ts`. |
| `services/commerce` | Express 4 + TypeScript backend (ESM `NodeNext`, `.js` import suffixes required). Owns `commerce_db`. |
| `services/ai-worker` | Python Lambda adapter + pure comment processor. No database; talks to Commerce only via SQS result messages. |
| `services/realtime` | Not implemented — contains only `.gitkeep`. Outbox publisher degrades to logging when `REALTIME_EVENTS_URL` is unset. |
| `contracts` | `examples/comment-created.v1.json` is the canonical Worker input; `test-fixtures/` are invalid-event fixtures; `proposed/**` is **PROPOSED / NOT IMPLEMENTED** and must not be treated as a shipped API. |
| `infra/postgres/init.sql` | Runs once, only on an empty volume: creates `commerce_db` and `realtime_db`. |
| `database/*.sql` | Legacy per-service schema reference (pre-monorepo), not executed by the running service. Applied schema truth is `services/commerce/migrations/`. |
| `docs/design/draft-order-reservation/` | Reference design for order/reservation business rules (`QĐ-*` decisions, `BẪY-*` traps, TTL tiers). Code + approved docs are source of truth; this is draft — refer here but verify in the implementation. |

Docker Compose starts **infrastructure only** (PostgreSQL on `${POSTGRES_PORT:-5432}`, pgAdmin on 5050). Services run on the host.

## Commands

Python: 3.11+ (CI uses 3.13). Node: 22.

### Infrastructure and local dev
```sh
docker compose up -d
docker compose down -v          # destroys volumes — only after init.sql changes
scripts/start-local-dev.bat     # or .ps1: waits for Postgres, starts backend :8000 then web :3000
```

### Commerce service (`services/commerce`)
```sh
npm ci
npm run dev                     # tsx watch, listens on :8000, runs migrations at startup
npm run typecheck
npm run migrate                 # apply services/commerce/migrations/*.sql using COMMERCE_DATABASE_URL / DATABASE_URL
npm test                        # vitest run
npm run test:coverage           # 90% statements/branches/functions/lines gate — this is what CI runs
npx vitest run tests/unit/orders/draft-order-races.test.ts
npx vitest run -t "partial test name"
npm run smoke                   # scripted end-to-end order loop against a running service
npm run seed:demo               # or seed:product-catalog
```

Database URL precedence: `COMMERCE_DATABASE_URL` → `DATABASE_URL` → `postgresql://postgres:postgres@localhost:5432/commerce_db`. The README's `:5433` example is stale; Compose defaults to 5432.

Vitest uses `postgresql://…/commerce_test_db` locally (CI uses `DATABASE_URL`). Tests **do not create schema**: create/migrate the test DB first, e.g. `COMMERCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/commerce_test_db npm run migrate`. `tests/global-setup.ts` truncates tables after the run, but refuses to truncate unless `CI` is set or the DB name contains `_test`; `KEEP_TEST_DATA=1` skips cleanup. Unit tests mock pg; integration tests hit the real database.

### AI Worker (`services/ai-worker`)
```sh
pip install -r services/ai-worker/requirements.txt
python -X utf8 -B services/ai-worker/read_example.py --offline            # demo CLI, default contract fixture
python -X utf8 -B services/ai-worker/read_example.py --offline --file services/ai-worker/examples/needs-clarification.json
python -B -m pytest services/ai-worker/tests -q --tb=short                # from Git root
python -B -m pytest services/ai-worker/tests/test_parse_intent.py -q
python -X utf8 -B services/ai-worker/smoke_gemini.py --dry-run            # offline preview; --allow-ai is opt-in only
python -X utf8 -B services/ai-worker/scripts/build_lambda_zip.py --output <new-zip-path>
```
`read_example.py` / `smoke_gemini.py` default to offline (`use_ai=False`); only `--allow-ai` permits real Gemini calls. Tests are hermetic: `tests/conftest.py` blocks sockets and `time.sleep` and clears `GEMINI_API_KEY`. The README recommends `-p no:cacheprovider` plus a fresh temp `--basetemp` outside the repo to avoid leaving artifacts. Root `tests/contracts/` validates the proposed schemas and is **not** executed by CI.

### Web (`apps/web`)
```sh
npm ci
npm run dev                     # :3000
npm run typecheck               # next typegen && tsc --noEmit
npm run lint
npm run build                   # required before npm test — Playwright starts `npm run start -- --port 3100`
npm test                        # Playwright, desktop + mobile projects
npx playwright test tests/orders.spec.ts
npx playwright test -g "order"  # by title
```
`playwright.config.ts` runs against the production build on port 3100 with 2 workers and one retry; a red-then-green run signals contention, not a UI bug. Web calls `${NEXT_PUBLIC_COMMERCE_API_URL}/api` with `cache: "no-store"`.

### Git and CI
Branches: `feature/*` or `chore/*` → PR into `dev` → PR into `main`. CI (`.github/workflows/ci.yml`) runs on PR/push to `dev`/`main`: commitlint (Conventional Commits, types limited to feat/fix/docs/refactor/test/chore/style/perf/revert), Gitleaks, web typecheck+lint, web Playwright build+E2E, AI Worker pytest, Commerce typecheck + `test:coverage`. Contract tests, Docker builds, and Lambda deploy are not covered by CI.

## Known drifts — do not trust blindly

README contains several outdated claims:
- Port `:5433` is stale; actual default is `:5432` (see docker-compose.yml).
- "Seed 5 sản phẩm mẫu vào `commerce_db`" is false — `infra/postgres/init.sql` creates schema only, no INSERT.
- Link to `docs/frontend-guide.md` is dead.
- Lambda handler "calls processor with `use_ai=False` always" was outdated; corrected in CLAUDE.md above.
- Earlier docs listed "seven modules" in Lambda ZIP; actual count is eight (includes `catalog.py`).

## Architecture

### Commerce service
Express monolith split into feature modules under `src/modules/<feature>` with the same four/five layers everywhere: `routes` → `controllers` → `services` → `repositories`, plus `schemas` (zod) and `types`. Every module's `index.ts` re-exports its public surface.

`src/app.ts` exposes `createApp(...)`: dependencies (repositories, S3/IVS/local storage) are positional optional constructor-style arguments so tests inject fakes. Routers mount under `config.apiPrefix` (`/api`). `src/server.ts` is the real entry point: migrations → start background jobs → listen, with SIGTERM/SIGINT shutting jobs down before the pool.

Background jobs (all in `modules/order/jobs`):
- `ExpireOrdersJob` — releases inventory holds past `expires_at`.
- `ExpirePurchaseRequestsJob` — releases stock held by review-queue requests nobody acted on.
- `PublishOutboxJob` — transactional-outbox relay, at-least-once, claims rows with a lease, retries with backoff, moves to `FAILED` after `maxAttempts`. Events in `outbox_events` are written in the **same transaction** as the domain change; payloads carry current state, not deltas, so consumers can tolerate reordering.

Orders: one comment can produce a multi-line draft order (`order_items`, not one SKU per order), idempotent via `order_idempotency_keys` (`Idempotency-Key` header) and unique constraints, inventory holds in `reservations`/`inventory`, risk scoring in `customer_risk`. Config knobs for the rules below are in `.env.example` and `config.ts`: `REVIEW_QTY_THRESHOLD`, `MAX_HELD_PER_CUSTOMER_PER_SESSION` (must stay comfortably above the review threshold), `RISK_SCORE_THRESHOLD`, and the three hold TTLs `HOLD_SOFT_SECONDS` (300) → `HOLD_CONFIRM_SECONDS` (900) with hard cap `HOLD_MAX_SECONDS` (1800).

Payments (`modules/payment/gateways`) support `mock` (default, self-contained), VNPAY, MoMo, ZaloPay — **sandbox only**. `assertSandbox()` rejects any non-sandbox host at construction time; never point gateways at production URLs.

Shared code is in `src/shared`: `database/database.ts` (pg pool + `runMigrations`, tracks `schema_migrations`, applies new `.sql` files from `services/commerce/migrations` in sorted order, and adopts a pre-existing `livestreams` table), `errors/domain.errors.ts`, `middleware/merchant.middleware.ts` (requires `X-Merchant-Id` header for livestream routes; TODO to replace with JWT), `storage/` (S3 presign or local disk), `ivs/` (AWS IVS, pinned to `ap-northeast-1` because it is unavailable in `ap-southeast-1`).

### Do not touch without approval
- `services/commerce/app/` — legacy FastAPI Python backend (purpose unconfirmed, may be precursor to Express rewrite or reference implementation). Git-tracked but not executed in any running service. Ask before modifying or deleting.
- `database/*.sql` — pre-monorepo schema reference, not executed by services. Source of truth is `services/commerce/migrations/`.
- `contracts/proposed/**` — PROPOSED and NOT IMPLEMENTED. Do not treat as shipped API or depend on.
- `apps/web/AGENTS.md` — auto-generated by Next.js; changes to parent `CLAUDE.md` will be reflected next startup. Do not edit directly.

### AI Worker
`process_comment_event(event, *, use_ai=True, catalog=None)` in `process_comment.py` is the whole domain logic and knows nothing about transport. Pipeline: contract validation (`comment.created`, `schema_version` 1, required string IDs, ISO-8601 `occurred_at`) → `intent_policy.guard_comment` (NFC normalization, casefold; blocks negation, questions, conditionals, multiple product codes) → regex extraction in `parse_intent.py` → Gemini only when regex confidence is low **and** AI is allowed → `intent_policy.apply_decision`.

Output `intent.decision` is one of `no_purchase`, `needs_clarification`, `purchase_candidate`, with machine-readable `reason_codes`. `status=ok` means "processed without a technical error", not "order created"; `has_intent`/`confidence` are legacy signals, not order authorization. A candidate still needs SKU resolution, price, and stock in Commerce. Gemini failures stay `status=error` with `error_type` and are never downgraded to clarification.

`gemini_client.py` holds `gemini-3.8-flash`, default 3 attempts (2 retries), 10 s HTTP timeout, 30 s cooperative budget; `GEMINI_MAX_RETRIES` accepts only `0|1|2` and any other value yields `ai_configuration` before SDK use. `lambda_handler.handler` reads each `Records[].body`, calls the processor with `use_ai=False` by default (controlled by `AI_WORKER_USE_AI` env var; note: ZIP lacks `gemini_client.py`, so setting `use_ai=True` causes `ImportError`), returns `batchItemFailures` keyed by real SQS `messageId`, and optionally publishes `ai-worker.intent-result` v1 to `COMMERCE_RESULT_QUEUE_URL` via boto3 (imported lazily; provided by the Lambda runtime). Publish is at-least-once — Commerce must dedupe on `event_id`. Logs are structured JSON with IDs redacted unless they match the opaque-ID charset; comment content is never logged.

The Lambda ZIP contains exactly eight modules (`lambda_handler`, `process_comment`, `parse_intent`, `intent_policy`, `quantity_parser`, `product_codes`, `ai_errors`, `catalog`) and no third-party packages. The Docker image (`services/ai-worker/Dockerfile`) is an offline demo CLI only, runs non-root with `-S`, and rejects `--allow-ai`.

### Web
Feature UI and its API wrappers live together in `src/features/<feature>/api/`. Most features independently read `NEXT_PUBLIC_COMMERCE_API_URL`; only orders/payments/review-queue use the shared `src/lib/api.ts` client. Merchant pages live under `/shop/...`, customer pages at `/`, auth at `/login` and `/register`. Tests in `apps/web/tests/*.spec.ts` are Playwright against the built app; they mock all API calls via `stubApi()` fixture and do not depend on `NEXT_PUBLIC_DEFAULT_MERCHANT_ID`.

## Environment and conventions

### Database
Database URL precedence: `COMMERCE_DATABASE_URL` → `DATABASE_URL` → `postgresql://postgres:postgres@localhost:5432/commerce_db`. Not created by init: `commerce_test_db` (see test setup above).

### Environment variables
| Variable | Service | Default | Note |
|----------|---------|---------|------|
| `COMMERCE_DATABASE_URL` | Commerce | see above | overrides `DATABASE_URL` |
| `DATABASE_URL` | Commerce | see above | fallback after `COMMERCE_DATABASE_URL` |
| `AI_WORKER_USE_AI` | Lambda handler | `false` | set to `true` to enable Gemini; ZIP has no `gemini_client.py` so will fail |
| `GEMINI_MAX_RETRIES` | AI Worker | `2` | accepts `0`, `1`, `2` only; any other value fails at startup |
| `COMMERCE_RESULT_QUEUE_URL` | AI Worker | unset | SQS URL for publishing intent results; if unset, no publish |
| `REALTIME_EVENTS_URL` | Commerce outbox | unset | EventTransport publishes here; if unset, logs only |
| `NEXT_PUBLIC_COMMERCE_API_URL` | Web | required | backend origin for API calls |
| `NEXT_PUBLIC_DEFAULT_MERCHANT_ID` | Web | unset | unused by tests; set for demo UI |
| `KEEP_TEST_DATA` | Commerce tests | unset | set to `1` to skip truncate after test run |

### API conventions
- **Merchant auth**: `X-Merchant-Id` header (UUID string) required for livestream/upload/product routes. TODO: replace with JWT claim.
- **Idempotency**: `Idempotency-Key` header (≥8 chars, typically `event.id`) required for draft order creation.
- **Base path**: all Commerce endpoints under `/api`.
- **Errors**: responses use shape `{error, message}` (zod validation errors also include `issues`).
- **Static files**: `uploads/products/` served locally; in production, route through S3 presigner.
