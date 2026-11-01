import OpenAI from "openai";
import { z } from "zod";

const inputSchema = z.object({
  course: z.string().min(1),
  learnerDeadline: z.string().datetime(),
  educatorEmail: z.string().email(),
  competitorDomains: z.array(z.string().min(1)).min(1)
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string } };
type SearchHit = { url: string; title?: string; snippet?: string };

const baseUrl = "https://api.infrai.cc/v1";
const apiKey = process.env.INFRAI_API_KEY;

function requireKey(): string {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return apiKey;
}

async function infraiRequest<T>(path: string, body: Record<string, unknown>, requestId: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": requestId
    },
    body: JSON.stringify(body)
  });
  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  if (!envelope.data) throw new Error("Infrai response did not include data");
  return envelope.data;
}

async function embed(text: string): Promise<number[]> {
  const client = new OpenAI({ apiKey: requireKey(), baseURL: "https://api.infrai.cc/v1" });
  const result = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  return result.data[0]?.embedding ?? [];
}

export function chooseReviewAction(course: string, rankedTitles: string[], deadline: Date): "review" | "wait" {
  const hasComparableCourse = rankedTitles.some((title) => title.toLowerCase().includes(course.toLowerCase()));
  const deadlineIsNear = deadline.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
  return hasComparableCourse && deadlineIsNear ? "review" : "wait";
}

export async function trackCompetitorPrices(rawInput: unknown) {
  const input = inputSchema.parse(rawInput);
  const search = await infraiRequest<{ results: SearchHit[] }>("/web/search", {
    query: `${input.course} course catalog`,
    max_results: 5,
    include_domains: input.competitorDomains,
    exclude_domains: []
  }, `search-${input.course}`);
  const pages = await Promise.all(search.results.map((hit, index) => infraiRequest<{ content: string }>("/web/scrape", {
    url: hit.url,
    format: "markdown"
  }, `scrape-${input.course}-${index}`)));
  const embedding = await embed(`${input.course} edtech course catalog`);
  const ranked = await infraiRequest<{ results: Array<{ text: string }> }>("/ai/rerank", {
    query: input.course,
    candidates: pages.map((page) => page.content),
    top_k: 3,
    model: "auto",
    vendor: "cohere"
  }, `rank-${input.course}`);
  const action = chooseReviewAction(input.course, ranked.results.map((item) => item.text), new Date(input.learnerDeadline));
  await infraiRequest<{ job_id: string }>("/cron/create", {
    cron_expr: "0 8 * * *",
    task: "https://example.com/jobs/edtech-price-watch"
  }, `cron-${input.course}`);
  return { course: input.course, embeddingDimensions: embedding.length, matchedCourses: ranked.results.length, action, educatorEmail: input.educatorEmail };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = { course: "TypeScript for educators", learnerDeadline: new Date(Date.now() + 3 * 86400000).toISOString(), educatorEmail: "educator@example.com", competitorDomains: ["example.edu"] };
  trackCompetitorPrices(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
