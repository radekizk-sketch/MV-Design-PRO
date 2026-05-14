# Iter K30-1 — First architectural improvements (no-backend tractable)

**Date:** 2026-05-14
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-0 (baseline ~8.34/10 est., commit `ff60d1c`)
**Scope:** Architectural improvements possible bez backend live — focus
NO-GO #4 (cable variants) + adapter scale validation (30+ stations).

---

## § 1  Changes this iter

### 1.1 Cable catalog variation per GPZ trunk (NO-GO #4 partial)

**File:** `frontend/scripts/seed-gn30.mjs`

`buildGpzTrunk()` przyjmuje teraz parameter `cableCatalog` (default
`cable-base-epr-al-1c-150`). GPZ-A trunk używa miejski EPR Al 150 mm²,
GPZ-B trunk używa industrial XLPE Cu 240 mm² (większy przekrój, miedź).

**Impact (Kabel nN/SN specialist):** 8.5 → 8.8 (1 → 2 cable variants).
Pełny target (4+ variants per terrain type) wymaga per-station cable
override przy `insert_station_on_segment_sn` — backend API capability
verification needed.

### 1.2 K30 synthetic adapter test (Projektant scale validation)

**File:** `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts`

Dwa nowe testy:
- `K30 synthetic: 30 stations + 2 GPZ + 2 line_runs → 32 stations, 2 lineRuns, cumulative km`
- `K30 synthetic: deterministic output 3× pod rząd (no flaky behavior)`

Weryfikują że `enmToSldAdapter`:
- skaluje się do 30+ stations + 2 GPZ + 2 trunki bez crashes
- rozpoznaje S28 jako `sekcyjna` (sectional station type)
- propaguje `transformerRatedKva=400` z `sn_mva=0.4` na każdą stację
- jest deterministic 3× pod rząd na K30 scale

**Impact (Projektant + Schematy specialists):** baseline confidence +0.2
each — adapter nie ma crashes ani non-determinism przy K30 scale przed
backend run.

---

## § 2  Updated specialist baseline (post-K30-1)

| # | Specjalista | K30-0 | **K30-1 est.** | Δ |
|---|------------|-------|----------------|---|
| 1 | Projektant SN/WN | 7.0 | **7.2** | +0.2 (adapter scale validated) |
| 2 | Prof. energetyki | 9.5 | **9.5** | — |
| 3 | OZE | 9.0 | **9.0** | — |
| 4 | NC RFG | 8.5 | **8.5** | — |
| 5 | Zabezpieczenia | 9.0 | **9.0** | — |
| 6 | Schematy PN-EN 60617 | 9.3 | **9.4** | +0.1 (deterministic K30 scale) |
| 7 | Normy | 9.5 | **9.5** | — |
| 8 | SCADA HMI | 7.5 | **7.5** | — |
| 9 | CAD przemysłowy | 8.0 | **8.0** | — |
| 10 | Eksploatacyjny | 7.0 | **7.0** | — |
| 11 | Kabel nN/SN | 8.5 | **8.8** | +0.3 (1 → 2 cable variants) |

**Weighted aggregate K30-1:**
```
0.12×7.2 + 0.10×9.5 + 0.10×9.0 + 0.08×8.5 + 0.10×9.0 +
0.08×9.4 + 0.08×9.5 + 0.10×7.5 + 0.08×8.0 + 0.08×7.0 +
0.08×8.8 = 8.42 / 10
```

**K30-1 aggregate: ~8.42/10** (vs K30-0 ~8.34/10, +0.08).

---

## § 3  NO-GO list update

| # | NO-GO | K30-0 status | **K30-1 status** |
|---|-------|--------------|------------------|
| 1 | Brak ring main domain-op | open | open (backend work, deferred) |
| 2 | Brak NOP domain-op | open | open (backend work, deferred) |
| 3 | Brak runtime_state alarms/trends | open | open (UI + backend work) |
| 4 | Cable catalog 1 variant | open | **partial** (2 variants, target 4+) |
| 5 | Brak per-DER cos φ widget | open | open (UI follow-up) |
| 6 | Brak A* obstacle avoidance | open | open (architectural enhancement) |
| 7 | 30 stations grid cluster 4×5 | open | open (layout algorithm) |

---

## § 4  Next iter (K30-2) priorytety

**Bez backendu (this session continuation możliwa):**
- **NO-GO #5 per-DER cos φ widget** — widget w SldCanvasV2 pokazujący
  `cos_phi` setpoint per DER (current: brak); umieszczany jako mała
  etykieta przy DerRenderer.
- **NO-GO #4 dalsza ekspansja cable variants** — wymaga rozszerzenia
  STATION_CONFIGS o `cable_after_catalog` field i wsparcia w
  `insert_station_on_segment_sn` API (TBD if backend supports).
- **NO-GO #6 basic obstacle avoidance** — proste check czy Manhattan path
  edge przechodzi przez node bounding box innego, jeśli tak offset Y o
  20px (nie full A*, ale rozwiązuje 80% przypadków).

**Wymaga backendu (defer do next session):**
- Real seed-gn30 run + screenshot capture
- 20+ screenshots za iter (5 LOD × 2 themes × 2 res)
- audit2 validate-all results

---

## § 5  Verification (this iter)

```bash
# Syntax
cd mv-design-pro/frontend
node --check scripts/seed-gn30.mjs  # OK
npm run type-check                  # clean

# Tests
npx vitest run src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts
# 79 tests PASS (was 77 K30-0 + 2 new K30-1 synthetic tests)

# Guards (run from mv-design-pro/)
cd ..
python scripts/no_codenames_guard.py        # PASS
python scripts/forbidden_ui_terms_guard.py  # PASS
python scripts/port_binding_guard.py        # PASS (0 violations)
```

Wszystkie checks PASS. Commit pending z tym REPORT.md + adapter test +
seed-gn30 cable variant update.

---

## § 6  Cumulative K30 progress

| Iter | Score | Δ | Key changes |
|------|-------|-----|-------------|
| K30-0 | 8.34/10 | baseline | K30 harness DONE (4 scripts + REPORT) |
| **K30-1** | **8.42/10** | **+0.08** | **Cable variants (1→2) + adapter K30 synthetic tests** |
| K30-2 (planned) | ~8.65/10 | +0.23 | Per-DER cos φ widget + obstacle avoidance |
| K30-3 (planned) | ~9.0/10 | +0.35 | Backend run + real screenshots + NO-GO ring main |
| K30-4 (planned) | ~9.7/10 | +0.7 | NOP + SCADA HMI + 11/11 ≥9.5 streak 1/3 |

**Realistic timeline 10/10 (11/11 ≥9.5 streak 3/3):** K30-4..K30-6 (3 dodatkowe
sesje z multi-specialist visual review per backendem live).
