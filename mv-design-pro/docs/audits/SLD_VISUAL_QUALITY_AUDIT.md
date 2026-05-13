# SLD_VISUAL_QUALITY_AUDIT — Audyt jakości wizualnej SLD

**Status:** AKTUALNY (audyt 2026-05-13)
**Wersja:** 1.0
**Data:** 2026-05-13
**Ocena ogólna:** 5/10 (proof-of-concept / atrapa z klocków)
**Target:** 9/10 (klasa przemysłowa SCADA/CAD)
**Powiązane:**
- `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` — opis stanu docelowego
- `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` — konkretne kryteria akceptacji
- `docs/plan/PLAN_SLD_REWORK.md` — fazowany plan reworku F1–F5
- `docs/audit/AUDYT_BRAKI_2026-05.md` § 7 — pełna diagnoza

---

## 1. Definicja „atrapy" (red flags — musi nie być prawdą)

System jest „atrapą z klocków" jeśli SPEŁNIA którekolwiek z poniższych:

| # | Cecha „atrapy" | Stan aktualny | Werdykt |
|---|----------------|----------------|---------|
| 1 | Tor mocy nie jest czytelny | TR 110/15 kV i tor SN nie jest podkreślony wizualnie, mieszają się z control | **PRAWDA** — defekt |
| 2 | Stacje wyglądają jak klocki | StationOnRunRenderer rysuje prostokąt z napisem | **PRAWDA** — defekt |
| 3 | GPZ nie wygląda jak rozdzielnia z TR + sekcjami + polami | GpzSwitchgearRenderer rysuje pola, ale brak czytelnego rozróżnienia sekcji, brak ring/double busbar primitivu | **PRAWDA** częściowa |
| 4 | Pola SN nie wynikają z katalogowych szablonów producentów | BayConfigurator istnieje, ale catalog binding nie ma vendor templates (ABB UniGear / Siemens 8DJH / ZPUE) | **PRAWDA** — brak templates |
| 5 | Symbole aparatów mieszają się / nie mają znaczenia elektrycznego | 32 symbole są OK kanonicznie, ale brak port-based binding — symbol nie wiąże się z portem elektrycznym | **PRAWDA** częściowa |
| 6 | Etykiety nachodzą na siebie | LabelDeclutter.ts istnieje, ale przy zoom < 0.5× labelki nakładają się | **PRAWDA** — defekt |
| 7 | Odcinki nie wychodzą z głowic/portów | KRYTYCZNE — phase4_route_all_edges() konsumuje współrzędne, nie ports.json | **PRAWDA** — defekt KRYTYCZNY |
| 8 | LOD ukrywa znaczenie elektryczne | Brak LOD policy — wszystko renderuje się na każdym zoom | **PRAWDA** — brak LOD |
| 9 | Kliknięcia i menu kontekstowe są martwe lub programistyczne | Częściowo — SldCommandService istnieje (10 menu), ale niektóre akcje SLD nie wywołują executeDomainOp | **PRAWDA** częściowa |

**Wynik:** 7/9 cech „atrapy" jest PRAWDĄ. System WYMAGA reworku. Plan w `PLAN_SLD_REWORK.md`.

---

## 2. Pięć krytycznych przyczyn (KRYTYCZNE)

### 2.1 Brak port-based routing (KRYTYCZNE — P0)

**Plik:** `frontend/src/ui/sld/core/layoutPipeline.ts` ~750–900 (funkcja `phase4_route_all_edges()`)

**Problem:** Routing łączy współrzędne (np. `{x: 100, y: 200}`) zamiast portów symboli. `ports.json` jest zignorowany w pipeline. Skutek: linie zaczynają się w środku symbolu zamiast z portu. **Główna wizualna przyczyna „amatorskiego" wyglądu.**

**Plan naprawy:** PLAN_SLD_REWORK F2 (LayoutEngine + port-based routing, 25 OD).

### 2.2 GpzSwitchgearRenderer monolit 3392 linii bez LOD (UX degradation)

**Plik:** `frontend/src/ui/sld/v2/renderer/GpzSwitchgearRenderer.tsx`

**Problem:** Każde pole (bay) renderuje **wszystkie detale** (CB, DS, CT, VT, 5–8 badge'ów) **zawsze**, niezależnie od zoom. Na zoom 0.1× 200 pól zajmuje 20px ekranowych — nieprzeglądalne.

**Plan naprawy:** PLAN_SLD_REWORK F3 (LOD + warstwy + refaktor GpzSwitchgearRenderer na 6 plików, 15 OD).

### 2.3 Brak ring / double busbar primitives (topology limitation)

**Plik:** `frontend/src/ui/sld/canonical_symbols/busbar.svg` (single only)

**Problem:** GPZ może być Single / Ring (S1–S2) / Double (z couplerem). Logical_views rozróżniają topologię, ale renderer rysuje wszystko jako single busbar. Operator nie widzi topologii GPZ.

**Plan naprawy:** PLAN_SLD_REWORK F1 + F2 (`ring_busbar.svg`, `double_busbar.svg`, extension layout engine).

### 2.4 40+ hardcoded inline styles (limited customization)

**Pliki:** `GpzSwitchgearRenderer.tsx`, `DeviceRenderer.tsx`, inne

**Problem:** ~40 miejsc `style={{...}}` z hardcoded `strokeWidth`, `fill`. Operator nie zmieni koloru bez recompile. Brak CSS variables.

**Plan naprawy:** PLAN_SLD_REWORK F3 + F4 (tokens.ts extension, CSS variables, theme provider).

### 2.5 Brak eksportu PDF/SVG/DXF (usability break)

**Plik:** `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx` (renderuje SVG, ale brak download)

**Problem:** Diagram żyje tylko w przeglądarce. Operator nie może wydrukować, przesłać, archiwizować. ETAP/DIgSILENT: `File → Export → PDF/DXF` w 2 kliknięciach.

**Plan naprawy:** PLAN_SLD_REWORK F4 (SVG export, PDF vector, DXF roadmap).

---

## 3. Konkretna ocena 9 obszarów wizualnych (z dokładnymi referencjami do plików)

### 3.1 Tor mocy (power flow path)

**Stan:** 4/10
- ✅ `TrunkSpineRenderer.tsx` rysuje magistralę SN
- ❌ Brak emphasis dla głównej osi (TR 110/15 + busbar + trunk)
- ❌ Brak strzałki kierunku domyślnie

**Naprawa:** F3 visual_emphasis + F4 power-flow overlay

### 3.2 Stacje

**Stan:** 3/10
- ✅ `StationOnRunRenderer.tsx` istnieje
- ❌ Stacja renderowana jako prostokąt z napisem (klocek)
- ❌ Brak inline expansion przy zoom (powinno: zoom → wnętrze stacji)
- ✅ `StationInternalView.tsx` ma topology classifier, ale niedopięty do głównego SLD

**Naprawa:** F3 LOD-3/LOD-4 z inline expansion stacji + StationInternalView w głównym SLD

### 3.3 GPZ jako rozdzielnia

**Stan:** 5/10
- ✅ `GpzSwitchgearRenderer.tsx` rysuje TR, busbar, pola
- ❌ Brak ring/double busbar primitive
- ❌ Brak compartment envelopes per pole (ABB-style)
- ❌ Brak czytelnego rozróżnienia: pole liniowe / TR / pomiarowe / sprzęgło

**Naprawa:** F1 + F2 + F3

### 3.4 Pola SN

**Stan:** 4/10
- ✅ `BayConfigurator` z 8 sekcjami
- ❌ Brak vendor templates (ABB UniGear ZS1 / Siemens 8DJH / ZPUE WROCŁAW Włoszczowa)
- ❌ Pole renderowane jako generic (3392-linijka monolit)

**Naprawa:** F1 (vendor symbol library) + F3 (split renderer)

### 3.5 Symbole aparatów

**Stan:** 6/10
- ✅ 32 symbole kanoniczne (busbar, CB, DS, ES, fuse, CT, VT, surge, capacitor, reactor, motor...)
- ❌ ports.json zignorowane w routing (§ 2.1)
- ❌ IEC 60617 parity 58% (target 90%, brakuje 18+ symboli)

**Naprawa:** F1 (extension biblioteki) + F2 (port-binding)

### 3.6 Etykiety

**Stan:** 5/10
- ✅ FONT_SIZES 13 ról
- ✅ `LabelDeclutter.ts` istnieje
- ❌ Przy zoom < 0.5× labelki nakładają się
- ❌ Brak hierarchii wizualnej (wszystkie tej samej wagi)

**Naprawa:** F3 typografia + collision avoidance

### 3.7 Głowice / porty / odcinki

**Stan:** 3/10
- ❌ Linie nie wychodzą z portów (§ 2.1 — KRYTYCZNE)
- ✅ `cable_head_triangle.svg` istnieje (głowica kabla)
- ❌ Brak rendering głowic na końcach kabli automatically

**Naprawa:** F2 port-based + F1 head primitive

### 3.8 LOD i znaczenie elektryczne

**Stan:** 2/10
- ❌ Brak LOD policy
- ❌ Brak warstw toggle'owalnych

**Naprawa:** F3 (LOD 5 poziomów + 13 warstw)

### 3.9 Kliknięcia / menu kontekstowe

**Stan:** 6/10
- ✅ `SldCommandService` z 10 menu kontekstowych
- ✅ `COMMAND_FEEDBACK_PL` (polskie komunikaty)
- ⚠️ Częściowo: niektóre akcje SLD nie wywołują `executeDomainOp` (martwy klik)

**Naprawa:** Wymagana inwentaryzacja dead-clicków (audit dead_click_guard.py + manual E2E)

---

## 4. Inwentaryzacja parellnych pipeline'ów renderowania (chaos!)

| Pipeline | Lokalizacja | Linie | Status |
|----------|-------------|-------|--------|
| Legacy 6-fazowa | `core/layoutPipeline.ts` | ~1200 | DO KEEP jako fallback |
| Strategy Dispatch | `v2/builder/LayoutStrategyDispatch.ts` (4 strategie) | ~600 | DO KEEP — główna |
| GpzSwitchgearRenderer monolith | `v2/renderer/GpzSwitchgearRenderer.tsx` | 3392 | DO REFAKTOR (F3) |
| GpzCanonicalRenderer | `v2/renderer/GpzCanonicalRenderer.tsx` | 1776 | DO KONSOLIDACJA z GpzSwitchgearRenderer |

**Rezultat reworku:** 1 kanoniczny pipeline (`hierarchical-port-based`), 1 GPZ renderer (`GpzIndustrialRenderer.tsx`), reszta `@deprecated`.

---

## 5. Performance / determinism

| Metryka | Aktualny stan | Target |
|---------|---------------|--------|
| Render 200 pól (initial) | nie zmierzone | < 500 ms |
| Pan/zoom 200 pól | nie zmierzone | < 50 ms per frame |
| Deterministic render hash | ✅ stabilny dla 4 sieci referencyjnych | utrzymać |
| Visual regression w CI | ❌ BRAK | 60 snapshots (15 fixtures × 4 LOD) |

---

## 6. Top 5 rekomendacji

1. **F2: port-based routing** (P0, KRYTYCZNE) — bez tego SLD zawsze będzie wyglądał amatorsko
2. **F3: LOD policy + refaktor GpzSwitchgearRenderer** (P0) — bez tego SLD nieprzeglądalne dla > 50 pól
3. **F1: extension biblioteki symboli IEC 60617** (P0) — ring/double busbar + 18 brakujących symboli
4. **F4: eksport SVG/PDF** (P1) — bez tego diagram nie istnieje poza przeglądarką
5. **F5: visual regression w CI** (P1) — bez tego każda zmiana ryzykuje regresję

---

**KONIEC AUDYTU JAKOŚCI WIZUALNEJ SLD**
