# Iter K30-36 — DispatcherStationSymbol bay-role labels (LOD3+ overview)

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-33 (cable variant visualization)
**Scope:** etykiety roli pola (WE/WY/TR/ODG/SPR/POM) pod polygon diamond
w widoku dyspozytorskim (LOD ≥ 3).

## §1 Problem

Z K30-31 § 7 deferred items:
> "StationOnRunRenderer DispatcherStationSymbol refactor (LOD3+ — overview map)"

`DispatcherStationSymbol` (LOD3+, `lod >= 3` → najdetaliczniejszy widok)
renderował polygon diamonds bez identyfikacji **roli pola**. Operator
widział kilka identycznych diamentów na szynie, bez podpowiedzi:
- które pole to wejście (WE — od strony GPZ),
- które wyjście (WY — do następnej stacji),
- które transformator (TR),
- które sprzęgło sekcyjne (SPR).

Industrial dispatcher screens (Energa / Tauron / PSE) zawsze podpisują pole
krótkim oznaczeniem roli — bez tego rozplanowanie staje się czytelne tylko
dla osoby znającej topologię stacji.

## §2 Approach

### Phase 1: nowy prop `bayRoleByColumn` (opcjonalny)

```typescript
readonly bayRoleByColumn?: ReadonlyArray<
  'WE' | 'WY' | 'TR' | 'ODG' | 'SPR' | 'POM'
>;
```

Index per `connectionColumns(topologicalType)` — adapter może podać explicit
mapowanie z rzeczywistych `bay.bay_role` (FEEDER/IN/OUT/COUPLER/MEASUREMENT)
lub pozostawić undefined → renderer wyprowadza domyślne z `topologicalType`.

### Phase 2: helper `defaultBayRoleForColumn`

| topologicalType | Default labels (po kolumnach) |
|-----------------|-------------------------------|
| `końcowa`       | `['WE']`                       |
| `przelotowa`    | `['WE', 'WY']`                 |
| `odgałęźna` (3) | `['WE', 'TR', 'WY']`           |
| `sekcyjna`      | `['SPR', 'WE']`                |

### Phase 3: rendering w `DispatcherStationSymbol`

W każdej kolumnie połączenia (`connectionXs.map`):
- Pobiera `bayRoleLabel` z propsa lub defaultu
- Renderuje `<text>` 9px bold powyżej polygon diamond (`y = busY − 40`)
- Stroke `#05070A` 2.5px paint-order=stroke dla czytelności nad dowolnym tłem
- letterSpacing 0.4 — typografia industrial drawing
- Wpięte `data-testid="sld-v2-station-bay-role-{id}-{index}"` dla audytu
- `data-bay-role` na connector group (downstream queries)

### Phase 4: testy (4 NEW)

W `renderers.test.tsx`:
1. *"stacja przelotowa default → bay-role labels WE + WY"*
2. *"stacja odgałęźna 3-kolumnowa → WE / TR / WY"*
3. *"stacja sekcyjna default → SPR + WE"*
4. *"explicit bayRoleByColumn override defaults"*

## §3 Tests

- `renderers.test.tsx`: **62 PASS** (was 58 — +4 K30-36)
- Pełny SLD v2 suite: **82 plików / 1650 tests PASS** (was 1646)
- Type-check: clean
- Guards: `forbidden_ui_terms` / `no_codenames` / `sld_determinism` PASS

## §4 Visual artifacts

- `K30_36_BAY_ROLE_LABELS_DEMO.png` — paleta wszystkich 4 topology types
  side-by-side, z widocznymi labelami WE / WY / TR / SPR.
- `K30_36_LOD0_HD.png`, `K30_36_LOD3_4K.png`, `K30_36_LOD4_8K.png` — multi-LOD
  live captures K30 sieci (Note: bieżący SldCanvas zoom-fit renderuje
  MiniBlockRmu, NIE Dispatcher; Dispatcher aktywuje się przy LOD ≥ 3 — po
  zoom-in w UI. Demo synthetic potwierdza rendering.)

DOM evidence (jednostkowe testy):
```
data-testid="sld-v2-station-bay-role-st-pl-0" textContent="WE"
data-testid="sld-v2-station-bay-role-st-pl-1" textContent="WY"
data-testid="sld-v2-station-bay-role-st-od-1" textContent="TR"
data-testid="sld-v2-station-bay-role-st-sk-0" textContent="SPR"
```

## §5 13-specjalist score update post-K30-36

| Specjalista | K30-33 | **K30-36** | Comment |
|------------|-------:|----------:|--------|
| Projektant SN/WN | 8 | **9** | (+1) Role labels jednoznaczne |
| Prof. energetyki | 9 | **9** | |
| OZE | 8 | **8** | |
| NC RfG | 7 | **7** | |
| Zabezpieczenia | 7 | **7** | |
| Schematy 60617 | 9 | **9** | |
| Normy | 9 | **9** | |
| SCADA HMI | 9 | **9** | |
| CAD przemysłowy | 9 | **9** | |
| Eksploatator | 9 | **9** | |
| Kabel nN/SN | 8 | **8** | (K30-33 baseline) |
| Wizard UX | 8 | **8** | |
| Catalog quality | 9 | **9** | |

**Aggregate K30-36: 8.5/10** (K30-33 baseline 8.4/10, +0.1 from Projektant SN/WN).

## §6 Critical files

**MODIFIED:**
- `frontend/src/ui/sld/v2/renderer/StationOnRunRenderer.tsx`
  - +`bayRoleByColumn` prop (15-line doc + type)
  - +bay-role label rendering w connector group (~18 lines)
  - +`defaultBayRoleForColumn(topologicalType, index, totalColumns)` helper (~30 lines)
- `frontend/src/ui/sld/v2/__tests__/renderers.test.tsx`
  - +4 K30-36 testy bay-role labels

**NEW artifacts:**
- `docs/audit/visual_iteration_K30_36/K30_36_BAY_ROLE_LABELS_DEMO.png`
- `docs/audit/visual_iteration_K30_36/K30_36_LOD{0,3,4}_*.png`
- `docs/audit/visual_iteration_K30_36/REPORT.md`

## §7 Out of scope (potencjalne next iter)

- Voltage-level color coding bus (110kV red / 15kV green / 0.4kV blue)
- Subtle station envelope frame dla zoom-out visibility
- Adapter plumb `bay.bay_role` → `bayRoleByColumn` (gdy seed ma explicit
  bays — K30 obecnie nie ma)
- LOD-aware zoom integration (canvas zoom controls)
- Industrial title block / project metadata frame
- SLD legend overlay (key showing cable variants + apparatus + DER)
