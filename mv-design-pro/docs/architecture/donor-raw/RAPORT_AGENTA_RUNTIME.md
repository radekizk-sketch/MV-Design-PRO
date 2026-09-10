> **MATERIAŁ SUROWY SUBAGENTA — NIE JEST DECYZJĄ.**
> Raport agenta RUNTIME z audytu donorów 2026-09-07. Zachowany w repo jako dowód i ślad
> rozumowania (§14/§15 mandatu). **Twierdzenia w tym pliku NIE są zweryfikowane w całości.**
> Wiążące są: `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia zweryfikowane),
> `DONOR_DECISION_MATRIX.md` (decyzje) i `DONOR_AUDIT_CHECKPOINT.md` (pomiary własne).
> Gdzie ten plik jest sprzeczny z tamtymi — **tamte wygrywają**; sprzeczności wykryte
> przy weryfikacji są nazwane w `OPEN_SOURCE_DONOR_AUDIT.md` §7.

# REPORT_RUNTIME — donor audit, execution runtime subsystem

Agent: AGENT RUNTIME. Date: 2026-09-07.
Baseline read in full: `donor/MV_BASELINE.md` (MV HEAD 5adc958d, CV-4.3 K6).

---

## 0. Donor identity + license (verified, not from README)

| Field | Value |
|---|---|
| Donor | TENSA — "interactive web workbench for power system simulation, built on ANDES" |
| URL | https://github.com/Roger-GO/TENSA |
| Clone | `git clone --depth 1` into `donor/src/TENSA` — **succeeded** |
| **Commit SHA reviewed** | **`caca7d5b5f325878f14b4e6c9c37b8c92ea3e20e`** (2026-07-11, "paper: revise all sections against JOSS 2026 criteria") |
| Version | `server/pyproject.toml` `version = "0.4.0"`; classifier `Development Status :: 2 - Pre-Alpha` |
| Size measured | server Python 42,434 LOC incl. tests; `core/` + `api/` + `mcp_server.py` + `security/` = 23,431 LOC; 67 backend test files |
| Author | single author (Roger Gracia), JOSS paper in `paper/` |

### License — verified at commit `caca7d5b`
- `LICENSE` (674 lines) = verbatim **GNU General Public License v3, 29 June 2007**.
- `server/pyproject.toml:10` `license = { file = "../LICENSE" }`; `:19` classifier `GPLv3+`.
- `web/package.json:7` `"license": "GPL-3.0-or-later"`; `CITATION.cff:13` `GPL-3.0-or-later`.
- **No SPDX-License-Identifier headers anywhere** in the repo (`grep` over `.py/.ts/.tsx/.toml/.json` = 0 hits). The license is asserted at repo + package level only.

**License verified at commit `caca7d5b5f325878f14b4e6c9c37b8c92ea3e20e`: GPL-3.0-or-later.**

**Obligations and risk (no legal opinion).** GPL-3.0-or-later is strong copyleft with no linking exception. Copying or porting TENSA source into MV-DESIGN-PRO would carry the obligation to license the resulting combined work under GPL-3.0-or-later and to offer corresponding source to recipients. MV-DESIGN-PRO carries no LICENSE file at repo root (measured) and is operated as a proprietary product; that combination is the risk. Practical consequence for this audit: **every decision below that is not REJECT is `REWRITE_CLEAN_ROOM` or `STUDY_ONLY`.** No `COPY` and no `PORT` decision is proposed for any TENSA subsystem — not because the code is bad (it is unusually well documented) but because the license makes ingestion a licensing event, not an engineering one. A clean-room rewrite must be specified from the *behaviour* described in this report, not from the donor source; whoever writes it should not have the donor tree open.

---

## 1. What MV's execution runtime ACTUALLY is today (measured, before any recommendation)

This section is evidence, not narrative. Every claim has a path.

### 1.1 The canonical run path exists and is already two-phase at the REST boundary
`backend/src/api/execution_runs.py` (265 LOC) exposes exactly four operations:

| Route | Handler | Behaviour |
|---|---|---|
| `POST /api/execution/study-cases/{case_id}/runs` | `create_run` | validates snapshot, computes hashes, persists a run in status `CREATED` → wire `PENDING`. No solver. |
| `POST /api/execution/runs/{run_id}/execute` | `execute_run` | **runs the solver inline and blocks until done** |
| `GET /api/execution/runs/{run_id}` | `get_run` | status poll (`to_execution_dict`) |
| `GET /api/execution/runs/{run_id}/results` | `get_run_results` | 409 unless `status == FINISHED` |

So the *contract shape* `CanonicalRun -> job -> result -> freshness -> publish` is **already there**. What is missing is only that `execute` performs the work in-band instead of handing it to an executor.

### 1.2 Execution is synchronous — but it does NOT block the event loop
`enm/canonical_analysis.py::execute_run` (line 1139) is a plain `def`, and `api/execution_runs.py::execute_run` is a plain `def` route. FastAPI therefore dispatches it to the anyio worker threadpool. This is deliberate and **pinned by a dedicated test**: `backend/tests/api/test_wspolbieznosc_biegow.py` (622 lines) measures parallel speedup *and* time-window overlap of concurrent runs, explicitly to catch a regression to `async def` with a blocking body. Its docstring names the mechanism verbatim: *"`execute_run` ... jest funkcja PLAIN `def` (nie `async def`) — FastAPI sam odklada taka funkcje do puli watkow"*.

> **Correction to a common assumption:** "MV's server freezes during a solve" is **false**. The event loop stays free; other requests, including `GET /runs/{id}`, are served during a solve. Any proposal that sells worker processes as the cure for a frozen server is selling a problem MV does not have.

### 1.3 Run state is persisted around the solve, so polling already works
`execute_run` writes `status=RUNNING` + `started_at` **before** dispatch and `FINISHED`/`FAILED` + `finished_at` **after**, each via `_save_run` → `canonical_run_repository_scope()` → SQLAlchemy (`infrastructure/persistence/repositories/canonical_run_repository.py`, 418 LOC). Timestamps are wall-clock `datetime.now(UTC)`. A client that drops the `execute` connection can still read terminal status from `GET /runs/{id}`.

### 1.4 Celery is wired to NOTHING — dead infrastructure, and it is a Zero-Debt item
- `backend/src/api/celery_app.py` is 26 lines: a `Celery(...)` object plus `app.autodiscover_tasks(["api"])`.
- `grep -rn "@app.task|@shared_task|\.delay\(|apply_async"` over `backend/src` **and** `backend/tests` returns **zero hits**.
- `docker-compose.yml:103-108` runs a `celery-worker` service executing `celery -A src.api.celery_app worker` — a worker with **no registered tasks**.
- Redis + Celery are declared in `pyproject.toml` (`redis = "^5.0.1"`, `celery = "^5.3.6"`).

**Verdict: Celery/Redis is nominal only. It has never executed an analysis.** It is a live-looking task queue that would mislead any future reader into thinking async execution exists. Named as debt, not silently passed over: either delete `celery_app.py` + the compose service + the two dependencies, or make it the real executor. Leaving it as-is is the one option Zero-Debt forbids.

### 1.5 There is no async machinery of any kind in the backend
`grep -rn "BackgroundTasks|create_task|run_in_executor|ThreadPoolExecutor|ProcessPool|multiprocessing"` over `backend/src` = **zero hits**. `grep` for `WebSocket|websocket|EventSourceResponse|StreamingResponse|text/event-stream` over `backend/src` = **zero hits**. `grep` for `new WebSocket|EventSource(` over `frontend/src` = **zero hits**. MV is pure request/response REST.

### 1.6 The frontend awaits the blocking call, and there is no cancel
`frontend/src/ui/study-cases/api.ts:255` — `executeRun` is a bare `fetch(..., {method:'POST'})` with **no `AbortController`, no `signal`, no timeout**. `frontend/src/ui/study-cases/runStore.ts::createAndExecuteRun` does `await api.executeRun(run.id)` and only then reloads the list. `ui2/spaces/obliczenia/uruchomObliczenie.ts` calls `pollRunStatus` *after* `createAndExecuteRun` has already returned — the poll is a reconciliation step, not a replacement for waiting.

### 1.7 The measured cost of that blocking call
From `docs/donor/DONOR_AUDIT_CHECKPOINT.md` §F-1, sourced from `docs/evidence/CONVERGENCE_EVIDENCE.md` (CV-4.3-A4/K5 row, quoting the backend log verbatim):

```
HTTP POST /api/execution/runs/{id}/execute -> 200 (170866.7ms)
```

- SC run, 50-station network: **170,866.7 ms ≈ 171 s**, in one blocking HTTP request the UI awaits with no cancel and no progress.
- Calibration 2026-07-29 was ~32 s ⇒ **~5.3× regression**.
- e2e budget 240,000 ms ⇒ margin only **1.40×** (was ~7× at calibration).
- Threshold deliberately NOT raised (Zero-Debt). CPU contention excluded (quiet host, load < 3.0); BLAS/OpenBLAS 0.3.23 identical via `numpy.show_config()`. **Cause undiagnosed.**
- Note on the label: `PERF-SC-50` does not appear anywhere in the repo — it is the owner's working name for this measured debt.

### 1.8 What MV already records on a run (so nothing below proposes a duplicate)
`enm/canonical_analysis.py::CanonicalRun` (line 492) + `enm/envelope.py::RevisionEnvelope`:

| Required by the mandate | MV today | Where |
|---|---|---|
| project / case identity | **YES** | `CanonicalRun.project_id`, `.case_id` |
| ENM revision | **YES** | `RevisionEnvelope.model_revision` |
| ENM hash | **YES** | `CanonicalRun.snapshot_hash` (effective snapshot) + `envelope.snapshot_hash` (project HEAD basis); `enm/hash.py::compute_enm_hash` |
| analysis type | **YES** | `CanonicalRun.analysis_type`, `.solver_kind` |
| **solver identity + version** | **NO** — not a field of the run or the envelope. `solver_version` exists only scattered in proof-pack payloads, PF traces and exports (`api/proof_pack.py:33`, `api/v125_contracts.py:321`, `network_model/reporting/power_flow_export.py:87`). ADR-018 proposes it under `ResultSetV2`; `grep "ResultSetV2"` over `backend/src` = **0 hits** ⇒ not implemented. | gap |
| **mapping version** | **NO** — `snapshot_mapping_version` exists on the *catalog type* (`network_model/catalog/types.py:463`), not on the run. | gap |
| started_at / finished_at | **YES**, wall-clock UTC, persisted | `execute_run` lines 1157-1172 |
| result status | **YES** (`status`, `result_status`) plus a **derived** freshness verdict | `application/result_freshness.py` |

### 1.9 The "if ENM changed, the result is not FRESH" rule — MV already enforces it, and better than the donor
`backend/src/application/result_freshness.py` is a *derived* freshness evaluator, not a written flag. Its own module docstring documents the three prior places that faked it (a literal `"FRESH"` in `api/protection_runs.py`; a `result_status` default of `"VALID"` no code ever changed, in a different vocabulary than the consumer compared against; and `/analysis-runs/{id}/overlay` dropping the field so the client re-added `'VALID'` by hand). The current mechanism:
- `ResultFreshness = NONE | FRESH | OUTDATED`, with machine-stable reason codes (`FreshnessReason`: `model-zmieniony`, `katalog-zmieniony`, `koperta-rewizji-niespojna`, `scenariusz-zmieniony`, `brak-odcisku-modelu-w-biegu`, …).
- Freshness is computed by comparing the run's `RevisionEnvelope` (model revision + catalog fingerprint + options hash + optional scenario ref/hash) against current project state. `enm/envelope.py::RevisionEnvelope.spojna` re-derives `semantic_fingerprint` so a hand-edited envelope reads as inconsistent rather than fresh.
- **Honest-on-missing-data:** a run with no anchor cannot read FRESH — it gets `OUTDATED` + `brak-odcisku-modelu-w-biegu`.
- On `model_revision` mismatch it returns the **list of journal entries** (`enm/dziennik_zmian.wpisy_od`) that invalidated the result.
- Single source of truth for both sides: `compute_enm_hash` stamps the run and evaluates freshness (predicates-in-pairs rule, satisfied).

**TENSA has no equivalent at all.** `grep -rin "stale|dirty|invalidat"` over the whole TENSA server yields only ANDES DAE-state dirtiness (`EigDirtyDaeError`) and unsaved-file dirtiness (`case.dirty`). Its `PflowResult.run_id` is `uuid.uuid4().hex` minted **in the route** (`api/routes/pflow.py:141`) and is bound to no model hash. Its `JobRecord.started_at`/`ended_at` are `time.monotonic()` (`core/jobs.py`) — **not wall-clock**, therefore useless as provenance across processes or restarts. On result provenance and freshness, **MV is materially ahead of the donor and must not import from it.**

### 1.10 Two live defects found while establishing the above (named, not deferred)
1. **Double-execution race on the same run.** `enm/canonical_analysis.py::execute_run` guards only `if run.status in {"FINISHED","FAILED"}: return run`. `RUNNING` is **not** in that set, and there is no lock anywhere on the run path (`grep "Lock|blokada"` over `canonical_analysis.py` and `execution_runs.py` = 0 hits). Two concurrent `POST /api/execution/runs/{id}/execute` for the same `run_id` both pass the guard, both run the solver, and both write results — last writer wins, with two `started_at` overwrites. Fix location: `execute_run`, add `RUNNING` to the early-return set **and** take the per-twin lock, so the entry predicate and the exit predicate come from one source of truth.
2. **Dead Celery stack** — §1.4 above.

Both are pre-existing and outside the diff of this audit, but per the repo's Zero-Debt rule they are recorded here with an exact fix location rather than passed over.

### 1.11 The one structural fact that constrains every worker recommendation
- ENM lives in `enm/store.py`: an **in-process dict cache** `_enm_store` (line 88) over a **file-backed** store (`.enm_store/`), with concurrency controlled by **`threading.RLock` per twin** (`_blokady_twin`, line 92).
- ADR-028's own implementation-status section states plainly: *"Pozostanie przy SQLite w produkcji: brak FK i **współbieżności międzyprocesowej**."*

`threading.RLock` provides **no cross-process mutual exclusion**. Move analysis execution into a second OS process and every ENM-store invariant currently held by that RLock silently stops holding — while all tests keep passing, because they run in one process. This is exactly the *KLASA, NIE INSTANCJA* failure mode the repo's own 2026-08-01 review names ("blokowano jeden z czterech cykli zapisu"). **Any worker-process migration must first replace the ENM store's intra-process locking and SQLite with cross-process-safe primitives.** That is the real cost of the donor's architecture here, and it is not visible in the donor's code.

---

## 2. THE DISTINCTION THE MANDATE REQUIRES: worker isolation ≠ solver performance

Stated explicitly, as required.

**A worker/process architecture cannot make MV's short-circuit solver faster.** The 170,866.7 ms is CPU time spent inside the solver and the snapshot assembler on a 50-station network. Moving that identical CPU work from a FastAPI threadpool thread into a `multiprocessing.Process` changes *where* the seconds are spent, not *how many*. The engineer still waits ~171 s for the answer.

What a worker architecture *does* buy, precisely:
- **Cancellation** — the engineer can abandon a run they no longer want. MV has none today.
- **Progress** — a long run can report where it is. MV has none today.
- **Hard-failure isolation** — a segfault/OOM inside numpy/scipy/BLAS currently kills the uvicorn process and every other in-flight request with it. Python-level exceptions are already caught by `execute_run`'s `except Exception`, so this covers only native crashes and OOM-kills.
- **Bounded resource use** — an explicit run-concurrency cap instead of "up to the anyio threadpool default", each run holding a full ENM snapshot in memory.

What it does *not* buy: throughput on a single run, event-loop responsiveness (already present, §1.2), or any reduction in the 5.3× regression.

**PERF-SC-50 must be profiled separately** — a `cProfile`/`py-spy` run over `_execute_short_circuit` and `enm/assembler.py` on the 50-station reference network, bisected against the 2026-07-29 baseline. That is a distinct work item with a distinct method. Nothing in this report should be read as addressing it, and I have not recommended workers as a remedy for it. If a later document cites this audit as justification for treating the async-job layer as the PERF-SC-50 fix, that citation is wrong.

---

## 3. Decision matrix — one row per subsystem

| # | Subsystem | Donor | Commit | License | Decision | Priority | Target MV module |
|---|---|---|---|---|---|---|---|
| S1 | Job registry + lifecycle (submit/track/complete) | TENSA | caca7d5b | GPL-3.0-or-later | **STUDY_ONLY** | P2 | — (MV `canonical_runs` already is R1) |
| S2 | Per-session subprocess worker + process isolation | TENSA | caca7d5b | GPL-3.0-or-later | **STUDY_ONLY** | **P2** | `application/analysis_run/` (future) |
| S3 | Job-lifecycle context manager (`_run_as_job`) | TENSA | caca7d5b | GPL-3.0-or-later | **REJECT** | — | — |
| S4 | Cooperative cancellation / abort | TENSA | caca7d5b | GPL-3.0-or-later | **REWRITE_CLEAN_ROOM** | **P1** | `enm/canonical_analysis.py` + `api/execution_runs.py` |
| S5 | Dead-worker liveness sweeper | TENSA | caca7d5b | GPL-3.0-or-later | **STUDY_ONLY** | P2 | — (conditional on S2) |
| S6 | Result streaming (Arrow IPC over WS + resume) | TENSA | caca7d5b | GPL-3.0-or-later | **REJECT** | — | — |
| S7 | REST/WS split + live job-event feed | TENSA | caca7d5b | GPL-3.0-or-later | **REJECT** | — | — |
| S8 | Clone-on-write model editing | TENSA | caca7d5b | GPL-3.0-or-later | **REJECT** | — | — |
| S9 | Result provenance / freshness | TENSA | caca7d5b | GPL-3.0-or-later | **REJECT** (MV ahead) | — | — |
| S10 | MCP interface | TENSA | caca7d5b | GPL-3.0-or-later | **STUDY_ONLY** | P2 | — |
| S11 | Structured error taxonomy → ProblemDetails + recovery | TENSA | caca7d5b | GPL-3.0-or-later | **REWRITE_CLEAN_ROOM** | **P1** | `api/exception_handlers.py` + `CanonicalRun` |
| S12 | Session gating (busy / max_sessions / idle reap) | TENSA | caca7d5b | GPL-3.0-or-later | **REWRITE_CLEAN_ROOM** (narrow) | **P1** | `enm/canonical_analysis.py::execute_run` |
| S13 | React Flow SLD graph derivation | TENSA | caca7d5b | GPL-3.0-or-later | **REJECT** | — | — |

---

## 4. Per-subsystem detail

Each block carries: files/symbols **actually read**, capability, MV equivalent, gap, benefit, decision, target module, runtime impact, migration risk, test strategy, priority — and, adversarially, **what would make adopting it a mistake**.

### S1 — Job registry + lifecycle
**Files/symbols read:** `server/src/tensa/core/jobs.py` (357 LOC, read in full) — `JobKind` (37 literals), `JobStatus`, `JobRecord`, `_JobRegistry.{register_job,mark_running,mark_done,mark_failed,mark_cancelled,update_progress,get_job,list_jobs,_evict_if_over_cap}`, `_failure_signature`, `_copy_record`, consts `MAX_FAILED_DISTINCT=20 / MAX_SUCCESSFUL=50 / MAX_TOTAL=100`. Also `core/session.py::{list_session_jobs,get_session_job,_global_job_registry}` and `api/routes/jobs.py` (302 LOC, symbols enumerated).
**Capability:** thread-safe in-memory ring of every invocation with semantic retention: in-flight records never evicted; failures coalesced by `(kind, category, detail)` signature with a `repeated_count` so failure #1's diagnostic survives a cascade instead of being FIFO'd out by symptom #21; per-session registry plus a manager-wide registry for session-mutating jobs stamped with `origin_session_id` to prevent cross-session leakage.
**MV equivalent:** `canonical_runs` (R1, ADR-028) — **already the single run registry**, and strictly better in the ways that matter: SQL-persisted (survives restart), wall-clock timestamps, project/case identity, revision envelope. `list_runs_for_case` / `list_runs_for_project`, and `CanonicalRunZListy` already does lazy loading of heavy columns (a measured fix: `list_by_project` was 18–27 s on a 50-station network purely from deserializing artifacts nobody opened).
**Gap:** MV has no *cross-analysis-type activity view* and no failure-signature coalescing. Minor.
**Benefit:** low. The retention policy is a nice idea for an in-memory log; MV's log is a database, where retention is a query concern.
**Decision:** STUDY_ONLY. **Target:** none. **Runtime impact:** none. **Migration risk:** n/a. **Test strategy:** n/a. **Priority:** P2.
**What would make adopting it a mistake:** introducing a second run registry alongside `canonical_runs` — directly violating ADR-028's "one run registry" decision, which MV has already paid to converge on (K5 folded V12.6's private `_runs` dict into R1). Adding TENSA's in-memory registry would recreate exactly the debt K5 removed.

### S2 — Per-session subprocess worker + process isolation
**Files/symbols read:** `core/worker.py` (1,322 LOC — read the module docstring/wire protocol, `_set_parent_death_signal` (prctl `PR_SET_PDEATHSIG`), `_spawn_orphan_detector` (macOS `getppid()==1` poll), `_install_strict_fs_audit_hook` (PEP 578), `_serialize_dataclass`, the `HANDLERS` dispatch table, and `worker_main` in full). `core/session.py` (1,930 LOC — `_Session`, `SessionManager.__init__` (`mp.get_context("spawn")`, `max_sessions=4`, `idle_timeout=180`), `create_session`, `_close_session`, `_raise_worker_died`, `invoke`, `signal_abort`, `_reap_loop`, `_liveness_loop`).
**Capability:** one `multiprocessing.Process` per session, `spawn` context (chosen because numpy/scipy/sympy are not reliably fork-safe: BLAS thread pools, signal handlers), two duplex `Pipe`s (`ctrl` parent→worker, `data` worker→parent), a shared `mp.Event` for abort. Parent-death handling is per-platform: `prctl(PR_SET_PDEATHSIG, SIGTERM)` on Linux, an orphan-detector thread on Darwin — so a killed parent never leaves orphaned solver processes. A torn pipe (`EOFError/BrokenPipeError/ConnectionResetError/OSError`) is translated by `_raise_worker_died` into a structured `WorkerDiedError`, the session is dropped from the registry so later calls fast-fail with a *reason*, and teardown escalates `terminate()` → `join(1.0)` → `kill()`. **A crashed solve does not kill the server.**
**MV equivalent:** none. MV runs solvers in the API process, in the anyio threadpool (§1.2). MV *does* already have durable run state (§1.3) and a derived freshness verdict (§1.9), which is the hard half of an async architecture.
**Gap:** no process isolation; no protection from native crashes/OOM in numpy/scipy/BLAS; no run-concurrency cap.
**Benefit:** genuine but narrow — hard-failure isolation and a resource ceiling. **Not** speed (§2).
**Decision:** STUDY_ONLY (the architecture is worth understanding; the code cannot be taken).
**Target MV module (if ever built):** `application/analysis_run/` executing `enm.canonical_analysis.execute_run` out of process, with results written to `canonical_runs` and the existing `GET /runs/{id}` poll unchanged.
**Runtime impact:** large. New process supervisor, IPC serialization of the ENM snapshot (measured at ~80 kB gzipped per revision at 54 stations, so payload size is not the obstacle), new failure modes, new deployment topology.
**Migration risk: HIGH, and higher than it looks.** (a) `enm/store.py` guards writes with **`threading.RLock`**, which does nothing across processes — §1.11; (b) ADR-028 records SQLite in production with **no cross-process concurrency**; (c) MV's current tests all run single-process and would keep passing while the invariant silently broke. Sequencing is non-negotiable: cross-process-safe ENM store + Postgres **before** any worker process, not alongside it.
**Test strategy:** kill the worker mid-run and assert the run lands `FAILED` with a named reason (never stuck `RUNNING`); OOM a worker and assert the API stays up; determinism — same input across in-process and out-of-process execution must yield byte-identical `snapshot_hash` and artifact; the existing `test_wspolbieznosc_biegow.py` overlap property must still hold; a cross-process ENM-store contention test as an **iloczyn cech** (`{read, write} × {same twin, different twin} × {in-process, cross-process}`) — a test that only exercises the in-process leg proves nothing.
**Priority: P2.** MV is mid-convergence (CV-4.3). This has a large blast radius, it does not fix the problem the owner is actually feeling (the 171 s), and its prerequisites (Postgres, cross-process locking) are themselves PROPOSED-not-decided in ADR-028 pending owner decision W-D1.
**What would make adopting it a mistake:** (1) building it before the ENM store is cross-process safe — you get silent model corruption under concurrent edit+run, invisible to the entire existing test suite; (2) building it to "make SC faster" — it will not, and the 171 s will still be there afterwards with a much larger system to debug; (3) copying the per-**session** model. TENSA's worker is per-session because ANDES holds mutable global `System` state per case. MV's `execute_run` is a pure function of a persisted snapshot — the natural unit is **per-run**, not per-session. Importing the session abstraction would add a lifecycle (create/reap/idle-timeout/session-expired) that MV's stateless run model does not need and would then have to maintain.

### S3 — Job-lifecycle context manager (`_run_as_job`)
**Files/symbols read:** `api/_run_as_job.py` (207 LOC, read in full) — `_run_as_job`, `_internal_error_problem`, `_broadcast`, `WORKER_INTERNAL_CATEGORY`; plus `api/routes/pflow.py` (read in full) to see it in use.
**Capability:** an `asynccontextmanager` wrapping `mgr.invoke` that drives `register → running → done|failed` and broadcasts each transition. Careful details: catches `Exception` not `BaseException` (so `CancelledError`/`SystemExit` stay lifecycle signals); on coalesced failure it broadcasts the **survivor** id *and* synthesizes a terminal envelope for the swallowed id, so a client watching the original id doesn't spin forever.
**MV equivalent:** `execute_run`'s try/except already performs the same RUNNING→FINISHED|FAILED transition with persistence.
**Gap:** none of consequence.
**Benefit:** none — and the abstraction is a **false friend**. Reading `routes/pflow.py::run_pflow` shows `_run_as_job` wraps a call that still **blocks the HTTP request** for the whole solve. TENSA's PF/EIG/CPF/SE are *synchronous HTTP with job-lifecycle telemetry attached*; only streaming TDS and sweeps are genuinely backgrounded (its own docstring says so: *"Scope (feasibility F3): `_run_as_job` covers `mgr.invoke` ONLY"*). Anyone skimming TENSA for "how to do async jobs" will import an observability wrapper believing it is a job queue.
**Decision:** REJECT. **Priority:** —.
**What would make adopting it a mistake:** adopting it *at all* — it would add ceremony to `execute_run` while leaving the request just as blocking, and would create the appearance of an async layer that does not exist.

### S4 — Cooperative cancellation / abort
**Files/symbols read:** `core/session.py::signal_abort` (line 739), `::cancel_session_job` (line 1453, read in full), `core/worker.py::worker_main` abort-thread contract + `_handle_run_tds`/`_handle_run_sweep` dispatch, `POST /sessions/{id}/abort` behaviour as pinned by `server/tests/acceptance/test_abort.py` (254 LOC, read the contract docstring).
**Capability:** an out-of-band `mp.Event` the solver's per-step callback polls; setting it makes the integration loop exit early. `cancel_session_job` is explicit that a record flip alone would be **cosmetic** — it triggers the real abort (set `abort_event` for TDS kinds, `task.cancel()` for sweeps) *before* marking the record, and only the owning session may cancel a global job. Honest about coverage: `can_cancel=False` by default, because `mgr.invoke` routines have no cooperative-abort path — **TENSA cannot cancel a power flow either.**
**MV equivalent:** **none.** `grep "cancel|anuluj|przerwij|abort"` over `api/execution_runs.py` and `enm/canonical_analysis.py` = 0 hits. Frontend `executeRun` has no `AbortController` (§1.6).
**Gap:** an engineer who starts a 171 s SC run on the wrong case has no way to stop it and no way to know how far it got.
**Benefit:** **high, and it is the single most defensible runtime improvement in this report** — because unlike everything else here it addresses a problem MV demonstrably has *today*, at *today's* measured runtime.
**Decision:** REWRITE_CLEAN_ROOM. The pattern (cooperative flag polled at a natural iteration boundary; never a forced kill mid-write) is textbook and needs no donor code. Do **not** read TENSA's implementation while writing it.
**Target MV module:** a cancellation token threaded from `api/execution_runs.py` into `enm/canonical_analysis.py::execute_run` → `_wykonaj_analize_biegu`, polled at existing loop boundaries — per-fault-node in `_execute_short_circuit`, per-iteration in the PF solvers, per-island in `rozplyw_wysp.py`. Plus `DELETE /api/execution/runs/{run_id}` (or `POST .../cancel`) and an `AbortController` in `frontend/src/ui/study-cases/api.ts`.
**Runtime impact:** small and additive. New terminal status `CANCELLED` alongside `FINISHED`/`FAILED`.
**Migration risk: MEDIUM — and concentrated in exactly one place: determinism.** A cancellation check inside a solver loop must not perturb the numerical path, must not become a "silent default"/heuristic, and must leave **no partial artifact**. A cancelled run must produce **no** result, not a truncated one; it must never be presentable as FRESH. The `no_direct_fault_params_guard` budget (`B:_execute_short_circuit: 1`) and the FROZEN solver tree (`network_model/solvers/**`, gate B-01) constrain where the check may live — prefer the **orchestration** layer (`canonical_analysis`, `rozplyw_wysp`) over the frozen solver core; if a poll must enter a solver, that is a B-01 owner decision, not an agent decision.
**Test strategy:** iloczyn cech, not the one example — `{SC, PF, protection, phase_state} × {cancel before start, cancel mid-run, cancel after finish} × {single island, multi-island} × {scenario, normal state}`. Assert for every cell: terminal status is `CANCELLED`; `GET /results` 409s; no artifact row is written; freshness of the *previous* run is unchanged; and — the class test, not the instance — **an uncancelled run of the same input is byte-identical to one run with the cancellation machinery compiled in but never triggered** (same `snapshot_hash`, same artifact). Also the §1.10.1 double-execute race must be closed in the same card, since both are the same missing predicate on `RUNNING`.
**Priority: P1.**
**What would make adopting it a mistake:** implementing it as a forced thread/process kill instead of a cooperative flag (leaves half-written rows in `canonical_runs` and possibly a torn ENM store); or letting a cancelled run persist a partial artifact that later reads as a result. Also a mistake: gating cancellation behind the S2 worker migration. Cooperative cancellation is *independent* of process isolation and must not be held hostage to it — that would be exactly the "later / separate pass" deferral the repo's rules forbid.

### S5 — Dead-worker liveness sweeper
**Files/symbols read:** `core/session.py::_liveness_loop` (1772), `::sweep_dead_worker_jobs` (1786), `_worker_died_problem` (1905), const `JOB_LIVENESS_TICK=10.0`, `WORKER_DIED_CATEGORY`; test `server/tests/integration/test_jobs_liveness.py` (listed, not read).
**Capability:** every 10 s, scan sessions with `running` jobs and mark as `failed`/`WorkerDied` any whose process is gone — so a job can never sit `running` forever against a dead worker. Paired honestly with `_run_as_job`'s own note that the sweeper would *not* catch an exception that escaped in a live worker, which is why both mechanisms exist.
**MV equivalent:** none needed today — MV has no workers, and if the API process dies, nothing is left to be stuck. But note the latent flaw MV *does* have: if uvicorn is killed mid-`execute_run`, the run stays `RUNNING` in `canonical_runs` **forever** (no reconciliation on startup). Small, real, and cheap to fix independently: reconcile orphaned `RUNNING` rows at startup.
**Gap:** startup reconciliation of orphaned `RUNNING` runs.
**Benefit:** low today; becomes mandatory the day S2 ships.
**Decision:** STUDY_ONLY. **Target:** — (the startup-reconciliation fix is MV's own, not a donor adoption). **Runtime impact:** none. **Migration risk:** n/a. **Test strategy:** kill the process mid-run, restart, assert the run is not `RUNNING`. **Priority:** P2.
**What would make adopting it a mistake:** building a liveness sweeper before there is anything whose liveness can differ from the API process's own — pure speculative machinery.

### S6 — Result streaming (Arrow IPC over WebSocket + resume window)
**Files/symbols read:** `core/stream.py` (778 LOC — docstring, `VarGroup`/`VAR_GROUPS`/`DEFAULT_VARS`, `DecimationAlgorithm`, `make_bus_voltage_schema`, `StreamAggregator`, `encode_batch`); `api/routes/ws.py` (357 LOC — `ws_tds_stream`, `_handle_resume`, `_stream_run_to_websocket`, WS close codes); `core/session.py::{start_streaming_run,_drive_streaming_run,attach_to_run,_RunBuffer}`.
**Capability:** time-domain simulation frames encoded as self-contained Arrow IPC batches over WS, with configurable decimation. Two points of real craft: the run continues with **no client attached** (frames buffer server-side, `attach_to_run(last_seq)` resumes), and the decimation math is **declared honestly** — on ANDES's adaptive-step integrator the boxcar mean is labelled `"boxcar-mean-best-effort"` in the stream metadata rather than claiming anti-aliasing it cannot deliver. That honesty-about-limits is a cultural match for MV's WHITE BOX rule and is the most transferable idea in the donor.
**MV equivalent:** none — no WS anywhere (§1.5).
**Gap:** MV cannot stream anything. But MV's analyses are steady-state (SC, PF, protection): a single result set, not a time series. MV *does* have `network_model/solvers/stability_rms/` and `frt_hvrt/`, which are the only plausible future consumers.
**Benefit:** **near zero for MV's current product.** Streaming solves "show a 20-second transient as it computes". MV's problem is "one 171-second answer with no progress bar" — which needs a **progress percentage**, not a frame stream.
**Decision:** REJECT (for the runtime program). Revisit only if RMS stability becomes a first-class interactive surface, and then as a fresh design.
**Priority:** —.
**What would make adopting it a mistake:** taking WS + Arrow to solve the progress-reporting problem. That is a sledgehammer: it adds a second transport, a second protocol, a resume/buffer subsystem, a pyarrow dependency, and a whole class of connection-state bugs — to deliver a number between 0 and 1 that a poll on the existing `GET /runs/{id}` could carry.

### S7 — REST/WS split + live job-event feed
**Files/symbols read:** `core/session.py::{subscribe_job_events,broadcast_job_event,job_event_subscribers}`, `_job_event_envelope` (185), `api/routes/jobs.py`, `web/src/store/jobs.ts` (read the module contract), `web/src/api/useSessionRecovery.ts` (listed).
**Capability:** REST for commands and history, a multiplexed `/jobs/events` WS for live transitions. Every subscriber gets its own `asyncio.Queue`; broadcast is non-blocking and drops on a full queue, with `GET /jobs` as the re-sync path (correct choice — a slow subscriber degrades to polling rather than back-pressuring the server). Reap pushes a `__closed__` sentinel so parked generators unblock instead of leaking half-open sockets. Client-side, `store/jobs.ts` reconciles two write paths (optimistic mutation placeholder, canonical WS event) by `job_id`, and explicitly refuses to persist `request_summary`/`problem`/`result_ref` to localStorage.
**MV equivalent:** none (no WS); MV polls.
**Gap:** no live push.
**Benefit:** low. MV has ~4 concurrent runs at most, from one engineer, on runs measured in tens of seconds to minutes. Polling `GET /runs/{id}` at 1 Hz is entirely adequate and is already implemented (`pollRunStatus`).
**Decision:** REJECT. **Priority:** —.
**What would make adopting it a mistake:** adding a WebSocket transport to a single-user desktop-shaped application. It introduces connection lifecycle, reconnect/resume, auth-over-WS, and dual-write reconciliation — permanently — to save a poll that already works. The one genuinely portable idea (drop-on-full + re-sync via REST rather than back-pressure) is a one-line design principle, not an adoption.

### S8 — Clone-on-write model editing
**Files/symbols read:** `core/clone_manager.py` (697 LOC — docstring, `CloneSnapshot`, `CloneEditResult`, `CloneManager.{init_clone,apply_edit,undo,redo,save_as,reset_clone,clone_diff,_reload_from_clone,_assert_within_workspace}`, `UNDO_STACK_CAP=50`); `core/clone_writers/{raw_writer,dyr_writer,xlsx_writer}.py` (listed).
**Capability:** on first edit, copy the ANDES case **files** (`.raw`/`.dyr`/`.xlsx`) to a per-session scratch dir; each edit rewrites the clone file and re-runs `andes.load(setup=False) → setup()`. Undo/redo is a **byte-level file diff stack** (cap 50).
**MV equivalent:** vastly better and already built — `enm/rewizje.py` (full immutable revision snapshots, content-addressed `<digest>.rev/<n>.json.gz`, `checkout(klucz, n)`), `enm/dziennik_zmian.py` (append-only change journal with `hash_sha256`, `rodzic`, full command payload), `enm/scenariusze.py` (typed scenario deltas, ADR-016), plus the revision envelope on every run.
**Gap:** none. TENSA's design is a **workaround for a donor-specific constraint** — ANDES has no editable in-memory model, so files are the only mutation surface.
**Decision:** REJECT.
**What would make adopting it a mistake:** introducing a file-clone editing path would create a **second source of model truth** beside ENM — a direct violation of canonical law #1 and of the Single Model Rule. This is the clearest REJECT in the report.

### S9 — Result provenance / freshness
**Files/symbols read (donor):** `core/jobs.py::JobRecord` (`started_at`/`ended_at` are `time.monotonic()`), `api/routes/pflow.py::run_pflow` (`run_id = uuid.uuid4().hex`, minted in the route), `api/schemas.py::PflowResult` (fields enumerated), plus an exhaustive `grep -rin "stale|dirty|invalidat"` across `server/src/tensa`.
**Capability (donor):** **none.** No model hash on a result, no revision, no freshness state, no invalidation on edit. Monotonic timestamps are not usable provenance.
**MV equivalent:** §1.8 + §1.9 — `RevisionEnvelope`, `compute_enm_hash`, `application/result_freshness.py` with derived `NONE/FRESH/OUTDATED` + machine-stable reason codes + the invalidating journal entries.
**Gap (MV, precisely, and only these two):** `solver_id`/`solver_version` and `mapping_version` are **not** fields of `CanonicalRun` or `RevisionEnvelope`. A solver code change today does **not** invalidate a stored result — a run computed by yesterday's IEC 60909 implementation still reads `FRESH` against an unchanged model. ADR-018 anticipates exactly this (`Provenance{… solver_id, solver_version, settings_hash …}`) but is **PROPOSED**, and `ResultSetV2` has zero occurrences in `backend/src`.
**Benefit of closing the MV gap:** high and cheap — additive fields on the envelope, folded into `_odcisk_semantyczny`. **This is MV's own ADR-018 debt, not a donor adoption.**
**Decision:** REJECT (donor). MV must not import anything here; MV should close its own two-field gap.
**Priority for MV's own gap:** P1, and it belongs in the same card as S11 (both touch the run record's honesty).
**What would make adopting it a mistake:** copying anything from the donor's result shape — it would be a strict downgrade, and a `uuid4` run id unbound to a model hash is precisely the "result presents as current when it isn't" failure that `result_freshness.py`'s docstring was written to end. Separately, a mistake in MV's own fix: bumping the envelope's semantic fingerprint payload **without** versioning it — `wersja_koperty` exists exactly so v1 envelopes stay bit-identical; adding solver identity must produce a **version 3** envelope, leaving stored v1/v2 fingerprints untouched and migration-free.

### S10 — MCP interface
**Files/symbols read:** `mcp_server.py` (226 LOC, read in full) — `FastMCP("tensa", instructions=…)`, `_api`, and the 13 `@mcp.tool()` functions (`list_workspace_files`, `create_session`, `close_session`, `load_case`, `reload_case`, `get_topology`, `add_fault`, `add_toggle`, `add_alter`, `get_alterable_params`, `run_pflow`, `run_tds`, `get_operating_point`, `run_eig`), `_free_port`.
**Capability:** a thin `urllib` wrapper exposing the HTTP API as MCP tools, in two modes (attach to a running server, or spawn a private one on an ephemeral loopback port). The instructive part is not the code but the `instructions=` string, which encodes the **legal call order** (`create_session → load_case → disturbances → run_pflow → run_tds`) — i.e. the state machine is documented to the agent rather than discovered by trial and error.
**MV equivalent:** none. MV has no MCP surface.
**Gap:** MV cannot be driven by an agent runtime.
**Benefit:** speculative. It is not a product requirement in any active program (UI/UX 2026-07, SLD rework, 10x).
**Decision:** STUDY_ONLY — and the transferable lesson is one sentence: *if MV ever exposes an agent surface, ship the ordering constraints as tool instructions.* The code itself is ~200 lines of `urllib` and would be rewritten in an afternoon.
**Runtime impact:** none. **Migration risk:** low. **Test strategy:** n/a. **Priority:** P2.
**What would make adopting it a mistake:** building an MCP surface over an API whose long operations cannot be cancelled and have no progress. An agent that fires a 171 s SC run it cannot abort, behind a 330 s client timeout (TENSA's own `urlopen(..., timeout=330)` is sized for exactly this), is a denial-of-service generator. MCP is downstream of S4, not parallel to it.

### S11 — Structured error taxonomy → ProblemDetails + recovery descriptor
**Files/symbols read:** `api/error_mapping.py` (231 LOC — docstring, `WORKER_ERROR_HTTP_MAP`, `recovery_for`, `map_worker_error`, the `AndesAppError.__subclasses__()` registry and the load-bearing import block); `core/errors.py` (398 LOC — `AndesAppError` hierarchy, `recovery_kind` class attribute); `api/_run_as_job.py::_internal_error_problem`; `web/src/components/error/{ProblemDetailsErrorSurface.tsx,RecoveryActionButton.tsx,routineErrorDetails.ts}` (listed).
**Capability:** every failure carries a machine-readable `category`, an HTTP status from one explicit table, and a typed `RecoveryDescriptor` — a named call-to-action the UI renders as a button (e.g. `{"kind":"reload-case","label":"Reload the case"}`). Two properties worth naming: the recovery kind is a **class attribute on the exception**, so status and recovery cannot drift; and the failure record stores the **true** category (a blocked delete is recorded as its own 422, not masquerading as a 500), which is what makes failure-signature coalescing meaningful.
**MV equivalent:** thin. `api/exception_handlers.py` is 74 LOC of generic 500/422/404 with Polish prose details. On the run path, failure is `run.error_message = str(exc)` — **free text**. The frontend (`ui2/.../uruchomObliczenie.ts::isFailedAnalysisRun`) can tell *that* a run failed but not *why* in any machine-readable way, and has no recovery affordance. Note MV *does* already have machine-stable reason codes on the freshness side (`FreshnessReason`) — so this is a proven pattern in-repo, just not applied to run failure.
**Gap:** no failure taxonomy and no recovery affordance on the run path.
**Benefit:** high relative to cost. A 171 s run that fails with `str(exc)` is the worst possible failure UX, and this is a small additive change.
**Decision:** REWRITE_CLEAN_ROOM — mirror MV's own existing `FreshnessReason` idiom, not the donor's classes.
**Target MV module:** additive `failure_category: str | None` + `recovery_hint: str | None` on `CanonicalRun` (written in `execute_run`'s except arm), a `FailureReason` StrEnum next to `FreshnessReason`, surfaced through `to_execution_dict()`; consumed in `ui2/spaces/obliczenia`.
**Runtime impact:** small, additive; no FROZEN contract touched (new optional fields, `exclude_none`).
**Migration risk: LOW**, with one named trap: `to_execution_dict()` feeds the OpenAPI snapshot (K5 measured it at 315 paths) — new fields must be optional so the snapshot diff is additive only.
**Test strategy:** iloczyn cech — `{SC, PF, protection, phase_state, v126} × {validation failure, readiness gate, solver non-convergence, missing uow_factory, unexpected exception}`; assert every cell yields a category from the closed enum and never the catch-all. Per rule 4 of KLASA-NIE-INSTANCJA: if the enum's docstring says "closed list", that claim needs a **pinned test** asserting no `execute_run` failure path can produce a category outside it.
**Priority: P1.**
**What would make adopting it a mistake:** importing TENSA's 30+ ANDES-specific categories, or the `__subclasses__()`-walking registry — the donor's own docstring flags that registry as fragile ("Drop a module and the registry silently stops covering its errors"). MV should use an explicit enum. Also a mistake: adding a `recovery` CTA whose action does not exist in MV's UI — that is a phantom control, banned by the owner directives.

### S12 — Session/run gating (busy, concurrency cap, idle reap)
**Files/symbols read:** `core/session.py::invoke` (539, read in full — the non-blocking `sess.lock.acquire(blocking=False)` gate), `SessionBusyError`, `SweepInProgressError`, `_current_inflight_job` (168), `create_session`'s `max_sessions` cap → HTTP 429, `_reap_loop` (1734) + `IDLE_REAP_TICK`.
**Capability:** at most one in-flight operation per session, enforced by a **non-blocking** try-acquire on an executor thread — a second concurrent request **fails fast with 409 and the identity of the in-flight job** rather than queueing behind it. A session cap yields 429. Sweeps hold an explicit gate returning 503 + `Retry-After` + iteration progress.
**MV equivalent:** **none, and this is the gap behind live defect §1.10.1.** `execute_run` guards only `{FINISHED, FAILED}`; `RUNNING` is not in the set and there is no lock — two concurrent `POST /execute` on the same `run_id` both run the solver and both write results.
**Gap:** no re-entrancy guard on run execution; no concurrency cap (each run holds an anyio threadpool thread and a full ENM snapshot in memory; the default pool is 40).
**Benefit:** high per unit of effort — it closes a real correctness defect, not just an ergonomics one.
**Decision:** REWRITE_CLEAN_ROOM (narrow) — take only the *predicate*, not the session abstraction.
**Target MV module:** `enm/canonical_analysis.py::execute_run` — add `RUNNING` to the early-return set and take the per-twin lock from `enm/store.py::_blokady_twin`, so entry and exit predicates share one source of truth (KLASA-NIE-INSTANCJA rule 3). Surface a 409 with the in-flight run id from `api/execution_runs.py`.
**Runtime impact:** minimal.
**Migration risk: LOW — with one honest caveat that must be written into the card, not discovered later:** the per-twin lock is `threading.RLock` and is therefore correct **only while MV is single-process**. If S2 ever ships, this guard silently stops guarding. The docstring for this fix must state that dependency explicitly and, per rule 4, carry a pinned test — otherwise it becomes a false assurance, which is worse than the defect.
**Test strategy:** two concurrent `POST /execute` on one `run_id` → exactly one execution, one artifact, second gets 409 naming the in-flight run. As an iloczyn cech: `{same run_id, different run_id same case, different case same project} × {SC, PF} × {sequential, concurrent}`.
**Priority: P1.**
**What would make adopting it a mistake:** importing sessions, idle reaping, or `max_sessions` — MV has no session concept and does not need one; its runs are stateless over a persisted snapshot. Adding a session lifecycle to get a re-entrancy guard would be importing an abstraction to solve a one-line predicate bug.

### S13 — React Flow SLD graph derivation (assessed as asked; outside the runtime program)
**Files/symbols read:** `web/src/components/sld/graph.ts` (docstring + `Side`, `SOURCE_HANDLE`/`TARGET_HANDLE`, `STRIDE_PIXELS`), `components/sld/{sidecar.ts,layout.ts,overlay.ts,SldCanvas.tsx}` and `curated/{ieee14,ieee39}.layout.json` (listed), `store/layout.ts` (listed); `@xyflow/react` imports enumerated across `components/sld/{nodes,edges}`.
**Capability:** React Flow nodes/edges are **derived** — `graph.ts` is explicitly "pure helpers that translate a `TopologySummary` + coordinate map into the React Flow shape", with coordinates supplied by a separate sidecar/curated-layout JSON. Topology comes from the server; geometry is a sidecar. That is architecturally **compatible** with MV's canonical law (geometry never creates connectivity).
**MV equivalent:** SLD v3 already does this, at far greater scale — `frontend/src/ui/sld/v3/scene/buildScene.ts` computes the scene from ENM; `ui/sld/**` is ~183k LOC.
**Gap:** none in the direction of the donor. (MV's measured SLD gap — no persisted placement/route store — is a *different* problem, and TENSA's curated static layout JSON does not solve it.)
**Decision:** REJECT. **Priority:** —.
**What would make adopting it a mistake:** replacing a 183k-LOC purpose-built SLD with a general-purpose graph library, and inheriting React Flow's node/edge model as a de-facto second topology representation.

---

## 5. Answering the mandate's direct question: does MV need an async job layer right now?

**No. It is P2.** Reasons, in order of weight:

1. **It does not solve the problem the owner is feeling.** The felt pain is 171 s. Workers do not reduce 171 s (§2). Shipping workers and still waiting 171 s would be a large migration that changes nothing the engineer notices.
2. **The symptom that *looks* like it needs workers is already handled.** The event loop is not blocked; concurrency is real and pinned by a test (§1.2). The "unresponsive server" argument for workers does not apply to MV.
3. **The prerequisites are not decided.** ADR-028 leaves Postgres+Alembic PROPOSED pending owner decision W-D1, and records SQLite-in-production with **no cross-process concurrency**. Building a multi-process runtime on top of a `threading.RLock`-guarded ENM store and SQLite would create a correctness hole invisible to the entire current test suite (§1.11). That is the KLASA-NIE-INSTANCJA failure mode, pre-diagnosed.
4. **Blast radius vs. CV-4.3.** MV is mid-convergence; K5 has just finished collapsing four run registries into R1 and deleting legacy dispatch. Introducing a process boundary now competes directly with that convergence.
5. **The valuable parts are separable and cheap.** Cancellation (S4), a failure taxonomy (S11), and the re-entrancy guard (S12) each deliver most of the felt benefit, are additive, carry LOW–MEDIUM risk, and require **no** process boundary. Doing these is not deferral of S2 — they are the correct-order subset, and S2 is P2 on its own merits regardless.

**Recommended sequence (all independent of the donor, none requiring S2):**
1. **P1** — S12 re-entrancy guard + §1.10.1 double-execute fix (same card; one predicate).
2. **P1** — S4 cooperative cancellation + frontend `AbortController` + `CANCELLED` status.
3. **P1** — S11 failure taxonomy + recovery hint on the run record; **and** MV's own ADR-018 gap: `solver_id`/`solver_version`/`mapping_version` into a version-3 `RevisionEnvelope` (S9).
4. **P1, separate discipline** — profile PERF-SC-50 (`py-spy`/`cProfile` over `_execute_short_circuit` + `enm/assembler.py`, bisect against 2026-07-29). Not a runtime-architecture item.
5. **P2** — decide W-D1 (Postgres), make the ENM store cross-process safe, **then and only then** reconsider S2.
6. **Housekeeping** — resolve the dead Celery stack (§1.4) in one direction or the other.

---

## 6. Adversarial summary — what would make THIS REPORT wrong

- **If MV's deployment is or becomes multi-tenant / server-hosted with concurrent engineers**, the calculus for S2 changes materially: an unbounded run concurrency with 40 threadpool slots and a full ENM snapshot each becomes a memory and fairness problem, and native-crash isolation stops being theoretical. I assessed MV as effectively single-user/desktop-shaped from the code (no auth in the run path, SQLite in production per ADR-028, `max_sessions`-style concepts entirely absent). **I did not verify the deployment topology** — it is listed as unverified below.
- **If PERF-SC-50 profiling shows the 171 s is dominated by memory pressure or GC**, process isolation could *incidentally* help (a fresh process per run bounds heap growth). That would be a genuine reason to revisit S2 — but only *after* profiling, and it would still be a side effect, not the fix.
- **If cancellation cannot be threaded without touching `network_model/solvers/**`**, S4's risk rises from MEDIUM and it becomes a B-01 owner gate rather than an agent task. I read the orchestration layer and believe island/fault-node/iteration boundaries in `canonical_analysis.py` and `rozplyw_wysp.py` suffice, but **I did not attempt the implementation**, so this is a design judgement, not a proven one.

---

## 7. Unverified / not done — stated explicitly

- **I did not execute TENSA.** No `pip install`, no server run, no test suite executed. All donor claims come from reading source at `caca7d5b`; where I cite behaviour (e.g. abort semantics) I cite the file and symbol that implements or pins it.
- **Shallow clone (`--depth 1`)** — no history, so I cannot speak to the donor's commit cadence, contributor count, or maintenance trajectory beyond `CHANGELOG.md` (latest release 0.4.0, 2026-07-05) and the `Pre-Alpha` classifier.
- **`core/wrapper.py` (4,957 LOC) read only partially** — I read the sections reachable from the worker dispatch and the clone manager. It is the ANDES adapter and is out of runtime scope; no decision in this report depends on its unread parts.
- **TENSA's frontend read selectively** — `store/jobs.ts` contract, `components/sld/graph.ts`, the error components' file list. I did not audit the web app as a whole (another agent covers projection/SLD donors).
- **Deployment topology of MV not verified** — single-user vs. hosted. This is the single assumption most load-bearing on the S2 = P2 verdict (§6).
- **I did not benchmark MV.** The 170,866.7 ms figure is quoted from `docs/donor/DONOR_AUDIT_CHECKPOINT.md` §F-1 citing `docs/evidence/CONVERGENCE_EVIDENCE.md`; I read those documents but did not re-run the measurement.
- **`docs/evidence/PERFORMANCE_BASELINE.md` and `performance_baseline.json` exist and were not read** — they may contain a finer breakdown relevant to PERF-SC-50 profiling.
- **No legal opinion given** on GPL-3.0-or-later. §0 states obligations and risk only; the licensing decision is the owner's.
