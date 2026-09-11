# MV-DESIGN-PRO — handoff packet templates

## OPUS_TASK.md

```text
ROLE: EXECUTOR
GOAL:
SCOPE:
FORBIDDEN:
ACCEPTANCE TESTS:
REQUIRED RAW EVIDENCE:
OUTPUT:
- changed files
- commands run
- measurements
- unresolved issues
- clean worktree state
```

## SOL_CODEX_REVIEW_PACKET.md

```text
ROLE: INDEPENDENT EXECUTABLE VERIFIER
CLAIM TO VERIFY:
REFERENCE SHA/PR:
REPRO COMMANDS:
EXPECTED INVARIANTS:
KNOWN RISKS:
DO NOT FIX.
RETURN:
- confirmed facts
- reproduced defects
- P0/P1 unresolved questions
- whether Astra review is justified
```

## ASTRA_REVIEW_PACKET.md

```text
ROLE: BOUNDED PRINCIPAL REVIEWER
ONE CLAIM TO REVIEW:
WHY IT MATTERS:
RELEVANT EQUATIONS:
MINIMAL CODE EXCERPTS:
MEASURED EVIDENCE:
CONTRARY EVIDENCE:
QUESTIONS (max 5):

DO NOT:
- explore the whole repository
- implement
- run broad CI
- use subagents
- repeat factual discovery already supplied

CLASSIFY CLAIMS:
PROVEN / SUPPORTED_NOT_PROVEN / UNRESOLVED / REFUTED

RETURN:
1. strongest 3 findings
2. strongest counterexample
3. decisive missing experiment
4. ACCEPT / CONDITIONAL / REJECT
5. max 10 next actions
```

## FABLE_DECISION_PACKET.md

```text
ROLE: FINAL ARCHITECTURAL AUTHORITY
DECISION REQUIRED:
CURRENT CANON:
OPUS EXECUTION SUMMARY:
SOL/CODEX VERIFICATION SUMMARY:
ASTRA OPINION (if used):
CONFLICTS BETWEEN REVIEWERS:
MEASURED OPTIONS A/B/C:
INVARIANTS THAT MUST NOT CHANGE:

RETURN:
- canonical decision
- accepted/rejected alternatives
- migration order
- production/research boundary
- explicit acceptance gates
```

## Routing rule

```text
Need to build/change/test broadly?        -> OPUS
Need to reproduce/check/compress facts?   -> SOL_CODEX
Hard unresolved P0/P1 reasoning problem?  -> ASTRA
Need to establish canonical architecture? -> FABLE
Need to apply accepted decision?          -> OPUS
```
