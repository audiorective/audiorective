# Skill evals

Test sets for the agent skills in [`skills/`](../skills). One directory per skill:

| File                | What it checks                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `trigger_eval.json` | Whether the skill's `description` makes an agent open the skill for the right requests and leave it alone for near-misses. |
| `evals.json`        | Whether an agent _with_ the skill produces correct output: realistic prompts, each with verifiable expectations.           |

Both files follow the [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) schemas, which the ElevenLabs skills repo also uses, so any harness built for that format runs them.

## Running trigger evals

`run_trigger_evals.mjs` sends every query to Claude Code (`claude -p`) from a throwaway project whose `.claude/skills/` holds only the skill under test, so the outcome depends on the description alone. A query counts as triggered when Claude calls the Skill tool for it in at least half of its runs.

```sh
node evals/run_trigger_evals.mjs audiorective
node evals/run_trigger_evals.mjs audio-processor-authoring --runs 5 --json /tmp/authoring.json

# compare against another version of the skill (e.g. a checkout of main)
node evals/run_trigger_evals.mjs audiorective --skill-dir ../audiorective-main/skills/audiorective
```

It needs the Claude Code CLI on `PATH` and a login. Options: `--runs` (3), `--concurrency` (8), `--timeout` seconds (120), `--json <file>` for machine-readable results, `--limit <n>` for a smoke test. The exit code is non-zero when any query fails.

Report both directions. A description that fires on everything scores perfectly on the positives and is still wrong, so a change that lifts the should-trigger rate has to hold the shouldn't-trigger rate.

## Running functional evals

Run each prompt in `evals.json` with the skill installed in a scratch workspace, then grade the transcript and outputs against `expectations` (skill-creator's `agents/grader.md` describes the grading pass). Compare against the same prompt without the skill, or with the previous version of the skill, to see what the skill actually changes.

## Maintaining the sets

- When a public API is added or changed, add or update the eval that exercises it in the same change as the docs and `CHANGELOG.md` entry.
- Positive trigger queries should read like real requests — file paths, framework names, a bit of backstory — and cover phrasings that never say "audiorective".
- Negative trigger queries should be near-misses (a Tone.js question that isn't about migrating, a JUCE `AudioProcessor`, an SSR `window is not defined` from another library), not obviously unrelated tasks.
- Expectations must be checkable from the output: name the API, the file, or the structural property, not "the code is good".
