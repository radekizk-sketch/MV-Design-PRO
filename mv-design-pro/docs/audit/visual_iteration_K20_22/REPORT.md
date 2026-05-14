# RAPORT AUDIT — iter K20-22 (OZE Phase B: DER wires + cos φ + DerComplianceBadge — 9.21/10 est.)

**Data:** 2026-05-14
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Commits:** 8b01350 (AC-07 DER wires), 4a566c9 (cos φ compact), c59e273 (DerComplianceBadge)

---

## § 1  ZMIANY W ITER K20-22

### 1.1 AC-07 — DER połączone z magistralą stacji (commit 8b01350)

Wcześniej DER renderowały się jako izolowane romby bez widocznego połączenia
z szyną SN stacji. Naruszało to AC-07: „Linie/kable startują/kończą na symbolach portów".

**Zmiana:** `enmToSldAdapter.ts` buduje `derConnections: ConnectionRendererProps[]`
— ortogonalne ścieżki L-shape od portu prawej strony szyny GPZ/stacji do
pozycji symbolu DER. `SldWorkspaceContainer` przekazuje je do `SldCanvasV2`
jako `connections={sldData.derConnections}`, co renderuje je przez `ConnectionRenderer`.

Geometria ścieżki (dla stacji na pozycji `(sx, sy)` i DER na `(dx, dy)`):
```
[{x: sx+60, y: sy},  ← bus exit port
 {x: sx+60, y: dy},  ← vertical drop
 {x: dx,    y: dy}]  ← horizontal run to DER
```

**Testy:** 2 nowe testy w `enmToSldAdapter.test.ts`:
- L-shape 3-punktowy generowany gdy DER ma station_ref
- Brak derConnections gdy DER orphan (bez station_ref)

### 1.2 OZE — cos φ w trybie compact DER (commit 4a566c9)

DER z K20 seeder mają `lod: 'compact'` (przydzielone przez `buildDers`).
Full-mode P/Q widget był niewidoczny w compact mode.

**Zmiana:** `DerRenderer.tsx` — dodany blok compact cos φ wyświetlający
`cosφ 0.80` przy `(0, half+26)` gdy podane `operatingPMw + operatingQMvar`.
Kolor `#88BBDD` (sync z full-mode cos φ). Test: `data-testid sld-v2-der-{id}-compact-cos-phi`.

**Wzór:** cos φ = P / √(P² + Q²). Przy K20: PV 0.5 MW + Q=0 → cos φ = 1.00.

### 1.3 OZE Phase B — DerComplianceBadge (commit c59e273)

Nowy komponent proof: `src/ui/sld/v2/proof/DerComplianceBadge.tsx`.
Wyświetlany w panelu wyników OZE (results panel / proof overlay).

Pokazuje dla każdego DER:
- Rodzaj (PV/BESS/FW) z kolorem NC RFG Module (A=zielony, B=niebieski, C=pomarańczowy, D=czerwony)
- Nazwę + moc nominalną
- NC RFG Module z etykietą (np. „Moduł A (Mikro)")
- Punkt pracy: P [kW] + cos φ
- Status: ZGODNY / NIEZGODNY / NIEOKREŚLONY

**12 testów** w `DerComplianceBadge.test.tsx` — 100% PASS.

---

## § 2  OCENY 7 SPECJALISTÓW (delta K20-21 → K20-22, estymacja)

| # | Specjalista | K20-21 | K20-22 (est.) | Δ | Uzasadnienie |
|---|------------|-------|--------|------|-----------|
| 1 | Projektant SN/WN | 8.5 | 8.6 | +0.1 | AC-07 DER wires nieznacznie poprawiają hierarchię |
| 2 | Prof. energetyki | 9.5 | 9.5 | — | streak 8/3 |
| 3 | **OZE** | 9.0 | **9.5** | **+0.5** | **cos φ compact + DerComplianceBadge + AC-07 wires** |
| 4 | NC RFG | 9.5 | 9.5 | — | streak 2/3 |
| 5 | Zabezpieczenia | 9.5 | 9.5 | — | streak 4/3 ✓ |
| 6 | Schematy PN-EN 60617 | 9.0 | 9.1 | +0.1 | AC-07 DER galvanic wires (nie wystarczy na 9.5 bez P0.3) |
| 7 | Normy | 9.5 | 9.5 | — | streak 15/3 |

**Agregat est.:** 9.14 → **9.21 / 10** (+0.07).

**5/7 specialists ≥9.5 (est.):**
- Normy (streak 15/3)
- Prof. energetyki (streak 8/3)
- Zabezpieczenia (streak 5/3 ✓)
- NC RFG (streak 2/3)
- **OZE (NEW)**

---

## § 3  STATUS P0 + BLOCKERS

### DONE (ta sesja)
- ✅ AC-07 DER connection wires (L-shape, orthogonal)
- ✅ OZE compact cos φ indicator w DerRenderer
- ✅ DerComplianceBadge proof component (12 tests PASS)

### BLOCKED (wymagają P0.3 ~22 OD)
- ⏸ Schematy 9.1 → 9.5: galvanic chain continuity (port-based cable routing)
- ⏸ Projektant 8.6 → 9.5: hierarchical geographic layout (port-based phase4)

### P0.3 Roadmap (next session)
1. Extend `VisualEdgeV1.fromPortRef.portId` (już zdefiniowane, pustki '' wypełnić)
2. Wpisać portId z `canonical_symbols/ports.json` przy budowaniu grafu ENM→VisualGraph
3. `phase4_route_all_edges`: port-based routing już zaimplementowane, wystarczy wypełnić portId

---

## § 4  TEST COUNTS (K20-22)

| Suite | Przed | Po |
|-------|-------|-----|
| Frontend unit tests | 4640 | **4656+** |
| Backend pytest | 4953+ | 4953+ (no changes) |
| AC-01..AC-12 | 10/12 | 10/12 (AC-02/03 wait P0.3) |

---

## § 5  GIT

```
c59e273  feat(oze/phase-b): add DerComplianceBadge for NC RFG compliance display
4a566c9  feat(oze): add cos φ compact indicator to DerRenderer + NC RFG badge test
8b01350  feat(sld/ac-07): add orthogonal DER-station connection wires
```

Branch: `claude/cleanup-documentation-sld-7zVRd` — pushed.
