# AGENTS.md — how to work in this repo (Cairn)

You are a coding agent. Read this file, then the relevant spec and decisions in the
Cairn **memory store** (see `## Memory`) before touching code. Follow the loop. Don't skip Challenge.

Memory: `/Users/vladpopov/Documents/ai-tools/cairn/memory/task-manager`

## Loop
Request -> Spec -> Challenge -> Plan -> Implement -> Review -> Complete
- Never write code before the spec's acceptance criteria exist.
- Never plan before the Challenge gate is resolved.
- Implement one plan step per change; keep the build green after each.

Commands (Claude Code): /cairn:spec  /cairn:challenge  /cairn:plan  /cairn:next  /cairn:review  /cairn:decide

## Delegation & coding rules
- Teach first: default output is an instruction (what / where / why + copy-paste example), not a commit. You implement; the agent reviews.
- Small pieces only. Split into the smallest green steps.
- Obvious small piece -> ask (AskUserQuestion); only after approval may a subagent write it.
- Subagents get a strict, minimal brief: one task, exact files, acceptance check, only the needed context.
- Subagents own their slice's quality; the main agent validates every output and owns the full picture.
- Delegate mainly at Implement (one subagent per step) and Review (a fresh, no-context reviewer).
- Reuse existing patterns, libraries, and utilities before adding new ones.
- Match the surrounding style; don't reformat unrelated code.
- No new dependency without a one-line justification (and a decision record if it's load-bearing).
- Smallest change that satisfies the acceptance criteria. No speculative abstraction.
- Leave the build green: typecheck, lint, and tests pass before you stop.

## Review rules
- Re-read the spec's acceptance criteria; check the diff against each, one by one.
- Confirm no rule above was violated and the blast radius matches the plan.
- State clearly: PASS (Complete) or the specific fixes still needed.

## Confidence rules
- Before acting on anything ambiguous, state confidence: High / Medium / Low.
- Medium or Low on anything hard to revert or wide-reaching -> STOP and ask.
- Prefer one good question over a wrong assumption. Don't guess silently.

## Blast-radius rules
- Small  = one file / local effect -> proceed, small steps.
- Medium = a module / several files -> plan first, list affected files.
- Large  = shared utils, data shape, public API, auth, payments, migrations, deletes
           -> mandatory Challenge + decision record + explicit human confirmation before Implement.
- Bigger blast radius => more challenge, smaller steps, slower commits.

## Memory (durable — central)
- Specs, decisions, learnings live in the Cairn memory store at the `Memory:` path above, under this project's folder. This repo stays clean.
- Every entry is tagged (frontmatter: project, type, slug, tags, status, date). Reuse tags before adding new ones.
- Recall is automatic at Spec/Challenge (search memory first). Writes are approval-gated (AskUserQuestion confirms each entry).
- Distill a learning at Complete. Plans are disposable; specs/decisions/learnings are durable.
