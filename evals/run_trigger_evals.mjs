#!/usr/bin/env node
// Trigger evals: does a skill's description make Claude Code open the skill for
// the queries in evals/<skill>/trigger_eval.json, and leave it alone for the rest?
//
//   node evals/run_trigger_evals.mjs audiorective
//   node evals/run_trigger_evals.mjs audiorective --skill-dir /path/to/old/skill --runs 5
//
// Each query is sent to `claude -p` in a throwaway project whose .claude/skills/
// holds only the skill under test, so triggering depends on the description
// alone. A query counts as triggered when Claude calls the Skill tool for it in
// at least half of its runs. Requires the Claude Code CLI on PATH and a login.
//
// Options: --skill-dir <dir>  (default skills/<name>)   --runs <n> (3)
//          --concurrency <n> (8)   --timeout <seconds> (120)   --json <out-file>
//          --limit <n>  (only the first n queries — for a smoke test)

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const args = process.argv.slice(2);
const skillName = args.find((a) => !a.startsWith("--"));
if (!skillName) {
  console.error("usage: node evals/run_trigger_evals.mjs <skill-name> [options]");
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const usage = (msg) => {
  console.error(`error: ${msg}`);
  console.error(
    "usage: node evals/run_trigger_evals.mjs <skill-name> [--skill-dir d] [--runs n] [--concurrency n] [--timeout s] [--json f] [--limit n]",
  );
  process.exit(2);
};
const positiveInt = (name, fallback) => {
  const raw = opt(name, fallback);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) usage(`--${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  return n;
};
const skillDir = resolve(opt("skill-dir", join(repoRoot, "skills", skillName)));
const runs = positiveInt("runs", 3);
const concurrency = positiveInt("concurrency", 8);
const timeoutSeconds = Number(opt("timeout", 120));
if (!(timeoutSeconds > 0) || !Number.isFinite(timeoutSeconds)) usage(`--timeout must be a positive number of seconds`);
const timeoutMs = timeoutSeconds * 1000;
const jsonOut = opt("json", null);
const limit = args.includes("--limit") ? positiveInt("limit") : Infinity;

const evalSet = JSON.parse(readFileSync(join(here, skillName, "trigger_eval.json"), "utf8")).slice(0, limit);
if (evalSet.length === 0) usage(`no queries in evals/${skillName}/trigger_eval.json`);
const skillMd = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const description = (skillMd.match(/^description:\s*>?\s*\n?([\s\S]*?)\n(?=[a-z-]+:|---)/m)?.[1] ?? "").replace(/\n\s+/g, " ").trim();

// Stage the skill in an empty project so nothing else in this repo influences the run.
const project = mkdtempSync(join(tmpdir(), "trigger-eval-"));
mkdirSync(join(project, ".claude", "skills", skillName), { recursive: true });
copyFileSync(join(skillDir, "SKILL.md"), join(project, ".claude", "skills", skillName, "SKILL.md"));

const env = { ...process.env };
delete env.CLAUDECODE; // allow nesting claude -p inside a Claude Code session

// One `claude -p` run. Resolves to { hit: true } when Claude called the Skill tool
// for this skill, { hit: false } when the run completed without doing so, and
// { error } when the run did not complete — a timeout, a CLI failure such as a
// missing login or a rate limit, or an exit with no result event. Errors are never
// counted as non-triggers: a negative query must not pass because the CLI failed.
function runOnce(query) {
  return new Promise((done) => {
    const child = spawn("claude", ["-p", query, "--output-format", "stream-json", "--verbose", "--max-turns", "1"], {
      cwd: project,
      env,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    let triggered = false;
    let result = null; // the final `result` event, if the run got that far
    let timedOut = false;
    let spawnError = null;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (err) => (spawnError = err));
    child.stdout.on("data", (chunk) => {
      out += chunk;
      let nl;
      while ((nl = out.indexOf("\n")) !== -1) {
        const line = out.slice(0, nl);
        out = out.slice(nl + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "result") result = event;
        const blocks = event?.message?.content;
        if (event.type !== "assistant" || !Array.isArray(blocks)) continue;
        for (const b of blocks) {
          if (b.type !== "tool_use" || b.name !== "Skill") continue;
          const target = String(b.input?.skill ?? b.input?.command ?? JSON.stringify(b.input ?? ""));
          if (target.includes(skillName)) triggered = true;
        }
        if (triggered) child.kill("SIGTERM"); // the answer is known; don't wait for the turn
      }
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (triggered) return done({ hit: true });
      if (spawnError) return done({ error: `could not start claude: ${spawnError.message}` });
      if (timedOut) return done({ error: `timed out after ${timeoutSeconds}s` });
      // A completed run ends in a `result` event. `error_max_turns` is still a completed
      // run: Claude spent its one turn on some other tool, which is a genuine non-trigger.
      if (result && (result.subtype === "success" || result.subtype === "error_max_turns")) return done({ hit: false });
      if (result) return done({ error: `claude reported ${result.subtype}${result.result ? `: ${String(result.result).slice(0, 120)}` : ""}` });
      return done({ error: `claude exited without a result (code ${code}, signal ${signal})` });
    });
  });
}

async function pool(tasks, size) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    }),
  );
  return results;
}

console.error(`skill: ${skillName}  (${skillDir})`);
console.error(`description: ${description}\n`);
console.error(`${evalSet.length} queries × ${runs} runs, concurrency ${concurrency}…`);

const tasks = [];
for (const [qi, item] of evalSet.entries()) for (let r = 0; r < runs; r++) tasks.push(async () => ({ qi, ...(await runOnce(item.query)) }));
const flat = await pool(tasks, concurrency);

const results = evalSet.map((item, qi) => {
  const mine = flat.filter((x) => x.qi === qi);
  const errors = mine.filter((x) => x.error).map((x) => x.error);
  const hits = mine.filter((x) => x.hit).length;
  const rate = hits / runs;
  const triggered = rate >= 0.5;
  // A query with any failed run has no trustworthy rate, so it fails regardless of direction.
  return { ...item, hits, runs, rate, errors, pass: errors.length === 0 && triggered === item.should_trigger };
});
rmSync(project, { recursive: true, force: true });

const positives = results.filter((r) => r.should_trigger);
const negatives = results.filter((r) => !r.should_trigger);
const pct = (xs) => (xs.length ? Math.round((100 * xs.filter((r) => r.pass).length) / xs.length) : 0);

for (const r of results) {
  const mark = r.errors.length ? "ERROR" : r.pass ? "PASS " : "FAIL ";
  console.log(`${mark} ${r.hits}/${r.runs}  ${r.should_trigger ? "should   " : "shouldn't"}  ${r.query.slice(0, 90)}`);
  for (const e of new Set(r.errors)) console.log(`        ${e}`);
}
const failedRuns = flat.filter((x) => x.error).length;
if (failedRuns) console.log(`\n${failedRuns} of ${flat.length} runs failed to complete; their queries count as failures.`);
console.log(`\nshould-trigger:    ${pct(positives)}% (${positives.filter((r) => r.pass).length}/${positives.length})`);
console.log(`shouldn't-trigger: ${pct(negatives)}% (${negatives.filter((r) => r.pass).length}/${negatives.length})`);
console.log(`overall:           ${pct(results)}% (${results.filter((r) => r.pass).length}/${results.length})`);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ skill: skillName, skillDir, description, results }, null, 2) + "\n");
process.exit(results.every((r) => r.pass) ? 0 : 1);
