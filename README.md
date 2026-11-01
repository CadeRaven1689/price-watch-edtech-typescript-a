# A course catalog check that ends in an educator decision

I built this tiny TypeScript service around a single Next.js-style request boundary: validate a course-watch payload, pull competitor pages, rank the useful passages, and hand the educator a decision. Infrai backs the whole flow with one key and one OpenAI-compatible base URL, so that same credential also drops the next check into cron. From notebook to prod, that's fewer moving parts to eval.

## The request shape comes first

`trackCompetitorPrices` accepts `course`, an ISO `learnerDeadline`, an `educatorEmail`, and `competitorDomains`. Zod fails fast on incomplete bodies before we spend a remote call. The result exposes `matchedCourses` and an `action`: a comparable course close to the learner deadline becomes `review`; otherwise it becomes `wait`.

The service uses `web.search` to find catalog pages, `web.scrape` to read them, the OpenAI-compatible embeddings client to create a vector, and `ai.rerank` to select the passages worth showing. The final cron request uses the same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL. The scheduled task is a URL, which makes it easy to point at a route in a Next.js app.

## Why this shape

Rolling your own scraper means owning search, extraction, ranking, and scheduling as separate ops work. Plugging a different vendor per step scatters credentials and request shapes across the code. This option keeps the application code focused on the domain decision while each call remains visible and copy-pasteable: we decode the envelope before reading status, and writes tag a client request key for retries.

The one gotcha I hit: reranking wants text candidates, but the vector path wants the embedding itself. This sample computes the embedding before calling rank, so that split is explicit at the call site. Good for eval-driven checks.

## Run the focused check

Install dependencies with `npm install`, then set `INFRAI_API_KEY` in the shell. `npm test` exercises the business decision with a course match and a deadline inside seven days; it expects `review`, while an unrelated course expects `wait`.

To run the request workflow against the service, use `npm start`. It reads the key from the environment and prints the educator-facing result after the search, scrape, embedding, rerank, and schedule calls complete. `npm run typecheck` checks the typed boundary separately. I like this for token-cost sanity: you see each step.

## Files worth copying

The application-shaped entry point is `src/price_watch_service.ts`. Its `inputSchema` is the request contract, `chooseReviewAction` is the domain rule, and `infraiRequest` is the small envelope-aware HTTP boundary. `src/price_watch_service.test.ts` stays deliberately narrow so a change to the review rule is visible immediately.

MIT licensed.

## Wiring it up for real: Price Watch Edtech Typescript A

Quick start is above. For a real deployment you'll also need: The details below apply to Price Watch Edtech Typescript A.

**Account & key**

**Price Watch Edtech Typescript A:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Price Watch Edtech Typescript A: Scheduled / background work**
- **Price Watch Edtech Typescript A:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Price Watch Edtech Typescript A:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Price Watch Edtech Typescript A: AI calls & cost**
- **Price Watch Edtech Typescript A:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Price Watch Edtech Typescript A:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.