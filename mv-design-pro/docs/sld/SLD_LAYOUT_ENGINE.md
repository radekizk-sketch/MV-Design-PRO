# SLD Layout Engine — kontrakt kanoniczny

**Status:** kanon BINDING
**Wersja:** v1.0

---

## 1. Cel

Layout Engine produkuje **deterministyczne** współrzędne SLD z modelu domenowego (ENM). Dwie warstwy:

1. **LayoutResult** — wynik auto-layoutu, immutable, deterministyczny (hash SHA-256 stabilny dla danego inputu).
2. **GeometryOverrides** — addytywne delty użytkownika (przesunięcie obiektu, reorder pola, przesunięcie etykiety).

Renderer dostaje `EffectiveLayout = LayoutResult ⊕ Overrides`.

---

## 2. Pipeline (6 faz)

Implementacja: `frontend/src/engine/sld-layout/pipeline.ts` + `frontend/src/ui/sld/core/layoutPipeline.ts`.

| Faza | Plik | Co robi |
|---|---|---|
| **F1 — voltage bands** | `phase1-voltage-bands.ts` | przydziela poziomy napięcia (WN/SN/nN), buduje pasma Y |
| **F2 — bay detection** | `phase2-bay-detection.ts` | rozpoznaje pola w GPZ i stacjach z `Substation.bay_refs` |
| **F3 — crossing minimization** | `phase3-crossing-min.ts` | minimalizuje krzyżowania połączeń heurystyką barycentrum |
| **F4 — coordinates** | `phase4-coordinates.ts` | kanonizuje X/Y na siatkę `GRID_BASE=20` |
| **F5 — routing** | `phase5-routing.ts` | trasuje krawędzie ortogonalnie, A* z avoidance |
| **F6 — finalize hash** | `layoutPipeline.ts` (etap 6) | liczy `LayoutResultV1.hash` (SHA-256) |

---

## 3. Inwarianty determinizmu

1. Ten sam input ENM (snapshot fingerprint) → identyczny `LayoutResult`.
2. Współrzędne X i Y są wielokrotnościami `GRID_BASE=20`.
3. Magistrala główna SN biegnie zawsze na `Y_MAIN=400`.
4. Stacje na magistrali są w odstępach `GRID_SPACING_MAIN=280`.
5. Pola w stacji są w odstępach `OFFSET_POLE=60`.
6. Brak niecałkowitych współrzędnych.
7. Brak łuków i linii diagonalnych — wyłącznie ortogonalne.
8. Hash `LayoutResult` jest stabilny między wersjami minor (zmiana algorytmu = bump major).

Test: `frontend/src/ui/sld/core/__tests__/determinism.test.ts`, `layoutPipeline.test.ts`, `industrialAestheticsLayout.test.ts`.

---

## 4. Geometria bazowa vs nakładki

### 4.1 LayoutResult (auto)

- Immutable.
- Zawiera world coordinates każdego węzła i krawędzi.
- Zawiera `hash` SHA-256.
- NIE zawiera danych użytkownika (delty).

### 4.2 GeometryOverrides (delty)

Plik: `frontend/src/ui/sld/core/geometryOverrides.ts`.

Operacje:
- `MOVE_DELTA(target, dx, dy)` — przesunięcie obiektu o wektor
- `REORDER_FIELD(stationId, fieldId, newIndex)` — reorder pola w stacji
- `MOVE_LABEL(target, dx, dy)` — przesunięcie etykiety

Gwarancja: nakładki **nie mutują** `LayoutResult` ani jego hash.

### 4.3 EffectiveLayout

Plik: `frontend/src/ui/sld/core/applyOverrides.ts`.

`EffectiveLayout = LayoutResult ⊕ Overrides`.

---

## 5. Edycja przyrostowa (no-jump)

Reguła: zmiana modelu (dodanie pola, dodanie stacji) **nie może** spowodować skoku globalnego layoutu. Algorytm:

1. Próbujemy najpierw rozszerzyć istniejący layout (insert-mode).
2. Jeżeli niemożliwe (np. niewystarczający slot), zapraszamy użytkownika do potwierdzenia rebuild-u.
3. Po rebuild-zie zapisujemy `Overrides.MOVE_DELTA` dla obiektów, które użytkownik chce zachować.

Implementacja: PR-12+ (poza zakresem PR-0).

---

## 6. Granica: Layout vs Render

- Layout NIE zna stylów, kolorów, czcionek, klasy CSS.
- Layout zna wyłącznie geometrię (pozycje, krawędzie, ortogonalne ścieżki).
- Render dostaje `EffectiveLayout` + `SymbolLibrary` + `Theme` i produkuje SVG.

---

**Koniec dokumentu.**
