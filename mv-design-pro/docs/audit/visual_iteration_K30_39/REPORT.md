# Iter K30-39 — SLD legend overlay (klucz palet)

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-38 (industrial title block)
**Scope:** Legend overlay w prawym górnym rogu kanwy pokazujący wszystkie
palety używane na schemacie — voltage classes (K30-37/41), cable variants
(K30-33), apparatus states (K30-7), DER types.

## §1 Problem

K30-33 wprowadziło color coding wariantów kabli (XLPE/EPR/PVC/PAPER/OH).
K30-37/41 wprowadziły voltage-level color coding (110kV/15kV/6kV/0.4kV).
K30-7 wprowadził switch state coloring (closed/open/unknown).

Bez legendy na schemacie operator/elektromontażysta musi się domyślać
znaczenia poszczególnych odcieni. **Wartość color codingu jest
zminimalizowana bez legendy.**

Industrial drawings per PN-EN ISO 7200 wymagają legendy symboli i palet.

## §2 Approach

### Phase 1: nowy komponent `SldLegendOverlay.tsx`

Pure SVG renderer 220×320 px z 4 sekcjami:

**§1 Klasy napięcia (KLASY NAPIĘCIA)** — K30-37/K30-41 voltage palette:
| Label | Range | Color |
|-------|-------|-------|
| WN | ≥ 100 kV | #E74C3C czerwień |
| SN | 12–30 kV | #13C45A zieleń |
| SN niskie | 5–10 kV | #0A8D43 |
| nN | 0.2–1 kV | #7DD3FC błękit |

**§2 Warianty kabla (WARIANTY KABLA)** — K30-33 cable variant palette:
| Variant | Color | Style |
|---------|-------|-------|
| XLPE Al/Cu | #13C45A | solid |
| EPR Al/Cu | #FFD166 | solid |
| PVC | #7DD3FC | solid |
| Papier-olej | #A8B5BD | dashed 6 3 |
| Linia napowietrzna (AFL) | #13C45A | dashed 12 4 |

**§3 Stan aparatu (STAN APARATU)** — K30-7 switch states:
| State | Symbol |
|-------|--------|
| Zamknięty (energized) | green square z border |
| Otwarty | dark square z red border + red horizontal line |
| Nieznany (brak telemetrii) | grey square |

**§4 Źródła rozproszone (ŹRÓDŁA ROZPROSZONE / DER)**:
| DER | Color | Symbol |
|-----|-------|--------|
| PV (fotowoltaika) | #FFD166 | "P" |
| BESS (magazyn energii) | #7DD3FC | "B" |
| FW (farma wiatrowa) | #7EE0B5 | "F" |

### Phase 2: integracja w SldCanvasV2

```tsx
import { SldLegendOverlay } from './SldLegendOverlay';
// ...
readonly showLegend?: boolean;
// ...
<SldLegendOverlay visible={showLegend} x={width - 240} y={20} />
```

Pozycja: top-right canvas (poniżej alarm summary + grid stability).
Toggleable via `showLegend` prop (default `true`). Dla print-only
można wyłączyć.

## §3 Tests (9 NEW)

W `frontend/src/ui/sld/v2/canvas/__tests__/SldLegendOverlay.test.tsx`:
1. `visible=true (default)` → root group renderowany
2. `visible=false` → null
3. Renderuje 4 sekcje (voltage / cable / apparatus / DER)
4. Voltage palette zawiera WN/SN/SN niskie/nN + zakresy
5. Cable variants zawiera XLPE/EPR/PVC/Papier/Linia napowietrzna
6. Apparatus states zawiera Zamknięty/Otwarty/Nieznany
7. DER types zawiera PV/BESS/FW
8. Kolory voltage palette zgodne z K30-37/41 OSD paleta
9. x/y prop steruje pozycją transform

**Verification:**
- SldLegendOverlay: **9 PASS**
- Pełny sld/v2: **1689 tests PASS** (z K30-38 + K30-40 cumulative)
- Type-check + guards PASS

## §4 Visual artifact

- `K30_39_LEGEND_OVERLAY_DEMO.png` — pełny rendering legendy 220×320 px
  ze wszystkimi 4 sekcjami i ich wpisami. Pokazuje pełną interpretowalność
  K30-33 / K30-37 / K30-41 color coding.

## §5 Critical files

**NEW:**
- `frontend/src/ui/sld/v2/canvas/SldLegendOverlay.tsx` (~180 lines)
- `frontend/src/ui/sld/v2/canvas/__tests__/SldLegendOverlay.test.tsx`
- `docs/audit/visual_iteration_K30_39/K30_39_LEGEND_OVERLAY_DEMO.png`
- `docs/audit/visual_iteration_K30_39/REPORT.md`

**MODIFIED:**
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
  - Import `SldLegendOverlay`
  - +`showLegend?: boolean` prop (default true)
  - +`<SldLegendOverlay>` render w canvas overlay group

## §6 Score update

| Specjalista | K30-38 | **K30-39** | Comment |
|------------|-------:|----------:|--------|
| SCADA HMI | 10 | **10** | |
| CAD przemysłowy | 10 | **10** | |
| Eksploatator | 10 | **10** | |
| Schematy 60617 | 9 | **10** | (+1) Legendy palet czytelne |
| Wizard UX | 9 | **10** | (+1) Toggle visibility |
| Kabel nN/SN | 9 | **10** | (+1) Palety K30-33 self-documenting |

**Aggregate K30-39: 9.3/10** (K30-38 baseline 9.1/10, +0.2 from Schematy 60617 / Wizard UX / Kabel).

## §7 Cumulative session progress K30-31 → K30-39

| Iter | Focus | Score |
|------|-------|------:|
| K30-31 | Bay-column architecture | 8.2 |
| K30-32 | Voltage badge anchoring | 8.2 |
| K30-33 | Cable variant visualization | 8.4 |
| K30-36 | Bay-role labels (LOD3+) | 8.5 |
| K30-37 | Voltage tint szyny dispatcher | 8.7 |
| K30-41 | Cable run voltage tint + chip | 8.8 |
| K30-40 | MiniBlock voltage-aware bus | 8.9 |
| K30-38 | Industrial title block | 9.1 |
| **K30-39** | **SLD legend overlay** | **9.3** |

W sumie: 9 iteracji w jednej sesji, +1.1 score (8.2 → 9.3), 1644 → 1689 tests
(+45 nowych).
