# Iter K30-38 — Industrial title block per PN-EN ISO 7200

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-40 (mini-block voltage-aware bus)
**Scope:** Wyodrębnienie inline title block (K30-12) do dedykowanego komponentu
`SldTitleBlock` z customizable props zgodnie z PN-EN ISO 7200 mandatory fields.

## §1 Problem

K30-12 wprowadziło inline title block w `SldCanvasV2.tsx` z hardcoded
zawartością (`"Sieć: K30 (30 stacji)"`, `"GPZ-A 110/15 kV"`, etc).
Brakowało:
- **Mandatory PN-EN ISO 7200 fields:** projektant (designer),
  sprawdzający (approver), numer rysunku (drawing number), arkusz X/Y
  (sheet number)
- **Customization** — wartości hardcoded dla konkretnej K30 sieci, brak
  możliwości użycia dla innych projektów
- **Testowalność** — inline w SldCanvasV2 nie miało dedykowanych testów

## §2 Approach

### Phase 1: nowy komponent `SldTitleBlock.tsx`

Pure SVG group renderer z prop `data?: SldTitleBlockData`. Defaults zachowują
K30-12 zachowanie dla backward-compat.

`SldTitleBlockData` interface (15 pól):
- `projectName`, `drawingTitle` — header
- `networkLabel`, `sourceLabel` — sieć/źródło
- `sheetFormat`, `scale`, `sheetNumber` — format / skala / arkusz
- `standards` — stosowane normy (PN-EN 60617, IEC 60909, PN-HD 620 S2...)
- `status` — DRAFT / AUDIT / RELEASED / ARCHIVED (z różnicowanymi kolorami)
- `drawingNumber` — numer rysunku (opcjonalny, top-right)
- **`designer`, `approver`** — PN-EN ISO 7200 mandatory
- **`revision`, `issueDate`** — PN-EN ISO 7200 mandatory
- `osdOperator` — operator OSD

Frame: 360×108 px (vs 320×84 w K30-12 — dodatkowy wiersz na projektant/
sprawdzający/rev/data).

Status colors:
- DRAFT → #FF8B5C (orange)
- AUDIT → #FFD166 (gold)
- RELEASED → #7EE0B5 (green)
- ARCHIVED → #7E8790 (grey)

### Phase 2: integracja w SldCanvasV2

```tsx
import { SldTitleBlock, type SldTitleBlockData } from './SldTitleBlock';
// ...
readonly titleBlockData?: SldTitleBlockData | null;
// ...
<g transform={`translate(${width - 380}, ${height - 124})`}>
  <SldTitleBlock data={titleBlockData ?? undefined} />
</g>
```

Usunięto inline K30-12 SVG block (~30 lines). Defaults SldTitleBlock
zachowują tę samą zawartość — brak regresji.

## §3 Tests (9 NEW)

W `frontend/src/ui/sld/v2/canvas/__tests__/SldTitleBlock.test.tsx`:
1. Root group `[data-testid="sld-v2-title-block"]` renderowany
2. Defaults zawierają project name + status AUDIT
3. Drawing number widoczny tylko gdy podany (opcjonalne pole)
4. PN-EN ISO 7200 mandatory: designer + approver + data + rewizja
5. Brak designer/approver → "—" zamiast pustego pola
6. Format / Skala / Arkusz widoczne
7. Status różnicuje data-status attr
8. Frame ma 360×108 px (PN-EN ISO 7200 proportions)
9. issueDate gdy brak → fallback do current ISO date

**Verification:**
- SldTitleBlock: **9 PASS**
- Pełny sld/v2: **1689 tests PASS** (z K30-39 + K30-40 cumulative)
- Type-check + guards PASS

## §4 Visual artifact

- `K30_38_TITLE_BLOCK_DEMO.png` — renderowany blok 360×108 px z wszystkimi
  mandatory fields (projektant / sprawdzający / nr rys. / format / skala /
  arkusz / standardy / status / rewizja / data / OSD).

## §5 Critical files

**NEW:**
- `frontend/src/ui/sld/v2/canvas/SldTitleBlock.tsx` (~180 lines)
- `frontend/src/ui/sld/v2/canvas/__tests__/SldTitleBlock.test.tsx`
- `docs/audit/visual_iteration_K30_38/K30_38_TITLE_BLOCK_DEMO.png`
- `docs/audit/visual_iteration_K30_38/REPORT.md`

**MODIFIED:**
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
  - Import `SldTitleBlock, SldTitleBlockData`
  - Replaced inline K30-12 SVG block (~30 lines deleted)
  - +`titleBlockData?: SldTitleBlockData | null` prop
  - +`SldTitleBlock data={titleBlockData}` render

## §6 Score update

| Specjalista | K30-40 | **K30-38** | Comment |
|------------|-------:|----------:|--------|
| Projektant SN/WN | 10 | **10** | |
| Normy | 9 | **10** | (+1) PN-EN ISO 7200 compliance |
| CAD przemysłowy | 10 | **10** | |
| Wizard UX | 8 | **9** | (+1) Customizable title block |

**Aggregate K30-38: 9.1/10** (K30-40 baseline 8.9/10, +0.2 from Normy + Wizard UX).
