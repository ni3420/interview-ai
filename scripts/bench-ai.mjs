#!/usr/bin/env node
/**
 * Benchmarks the text-model endpoints and prints p50/p95.
 *
 * Runs against a locally started AI service with a local Ollama provider:
 *   cd apps/ai-service && AI_PROVIDER=ollama AI_FALLBACK_PROVIDER= \
 *     uv run uvicorn app.main:app --port 8011
 *   SERVICE_API_KEY=... node scripts/bench-ai.mjs --scene plan --runs 10
 *
 * One warm-up run is discarded so the first (cold-model) number is reported
 * separately instead of skewing the percentiles.
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const baseUrl = arg("url", "http://localhost:8011").replace(/\/$/, "");
const ollamaUrl = arg("ollama", "http://localhost:11434").replace(/\/$/, "");
const runs = Number.parseInt(arg("runs", "10"), 10);
const scene = arg("scene", "all");
const key = process.env.SERVICE_API_KEY ?? process.env.AI_SERVICE_API_KEY ?? "";

const resume = (
  "Experienced backend engineer with 6 years building distributed systems in Go and Python. " +
  "Led migration of a payments ledger to event sourcing on Kafka, cut p95 latency 40%, owned on-call. " +
  "Built CI/CD, Terraform, PostgreSQL and Redis expertise. Mentored 4 engineers. "
).repeat(18);
const jobDescription =
  "Senior Backend Engineer. Must have Go, distributed systems, Kafka, PostgreSQL. Own reliability and latency of payment APIs.";

const qaPairs = [
  ["Walk me through the ledger migration.", "We moved from a mutable relational ledger to event sourcing, dual-wrote for six weeks, then cut over per tenant."],
  ["How did you measure the latency win?", "We tracked p50/p95 per endpoint in Grafana before and after, and held a 40 percent p95 reduction for a month."],
  ["How do you handle Kafka rebalances?", "Cooperative sticky assignment, idempotent consumers and a bounded retry queue per partition."],
  ["Describe an on-call incident.", "A consumer lag spike from a poison message; we quarantined the offset, added schema validation, and documented the runbook."],
  ["How do you review a schema change?", "Rehearse on staging with production-sized data, add indexes concurrently, and roll back behind a feature flag."],
  ["Why leave your last role?", "The platform is stable now and I want narrower ownership of reliability in a smaller team."],
].map(([question, answer]) => ({ question, answer }));

const scenes = {
  plan: () => ({
    url: `${baseUrl}/v1/interviews/plan`,
    body: { resume_text: resume, job_description: jobDescription },
    valid: (data) => Array.isArray(data.questions) && data.questions.length > 0,
  }),
  next: () => ({
    url: `${baseUrl}/v1/interviews/next-question`,
    body: {
      resume_text: resume,
      job_description: jobDescription,
      current_question: qaPairs[0].question,
      user_answer: qaPairs[0].answer,
      question_index: 0,
      previous_qa: [{ question: qaPairs[0].question, answer: qaPairs[0].answer }],
    },
    valid: (data) => typeof data.question === "string",
  }),
  evaluate: () => ({
    url: `${baseUrl}/v1/interviews/evaluate`,
    body: {
      resume_text: resume,
      job_description: jobDescription,
      qa_pairs: qaPairs,
    },
    valid: (data) => Array.isArray(data.question_scores),
  }),
  embed: () => ({
    url: `${ollamaUrl}/api/embed`,
    body: { model: "nomic-embed-text", input: resume },
    valid: (data) => Array.isArray(data.embeddings),
    noKey: true,
  }),
};

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function callOnce(sceneName) {
  const spec = scenes[sceneName]();
  const started = performance.now();
  const response = await fetch(spec.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(spec.noKey || !key ? {} : { "X-API-Key": key }),
    },
    body: JSON.stringify(spec.body),
    signal: AbortSignal.timeout(900_000),
  });
  const elapsed = performance.now() - started;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${sceneName}: HTTP ${response.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  if (!spec.valid(data)) {
    throw new Error(`${sceneName}: unexpected response shape`);
  }
  return elapsed;
}

async function runScene(sceneName) {
  const cold = await callOnce(sceneName);
  const samples = [];
  const errors = [];
  for (let index = 0; index < runs; index += 1) {
    try {
      samples.push(await callOnce(sceneName));
    } catch (error) {
      errors.push(String(error));
    }
  }
  samples.sort((a, b) => a - b);
  return {
    scene: sceneName,
    runs,
    errors: errors.length,
    coldMs: Math.round(cold),
    p50Ms: Math.round(percentile(samples, 50)),
    p95Ms: Math.round(percentile(samples, 95)),
    minMs: Math.round(samples[0] ?? 0),
    maxMs: Math.round(samples.at(-1) ?? 0),
  };
}

const selected = scene === "all" ? ["plan", "next", "evaluate"] : [scene];
if (!scenes[scene] && scene !== "all") {
  console.error(`Unknown scene: ${scene}. Use plan, next, evaluate, embed or all.`);
  process.exit(1);
}
if (!key && !selected.every((name) => scenes[name]().noKey)) {
  console.error("Missing SERVICE_API_KEY (or AI_SERVICE_API_KEY) in the environment.");
  process.exit(1);
}

const results = [];
for (const name of selected) {
  console.log(`Benchmarking ${name} (${runs} runs + 1 warm-up)...`);
  results.push(await runScene(name));
}

console.log("\n| scene | runs | errors | cold | p50 | p95 | min | max |");
console.log("|---|---|---|---|---|---|---|---|");
for (const row of results) {
  console.log(
    `| ${row.scene} | ${row.runs} | ${row.errors} | ${row.coldMs} ms | ${row.p50Ms} ms | ${row.p95Ms} ms | ${row.minMs} ms | ${row.maxMs} ms |`
  );
}
console.log(JSON.stringify({ results }));
