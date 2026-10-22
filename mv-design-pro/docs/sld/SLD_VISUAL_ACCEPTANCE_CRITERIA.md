# SLD_VISUAL_ACCEPTANCE_CRITERIA — Kryteria akceptacji wizualnej SLD

**Status:** AKTUALNY (binding acceptance criteria)
**Wersja:** 1.0
**Data:** 2026-05-13
**Powiązane:**
- `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` — opis docelowego SLD
- `docs/audit/SLD_VISUAL_QUALITY_AUDIT.md` — audyt aktualnego stanu
- `docs/plan/PLAN_SLD_REWORK.md` — plan adresacji

---

## 1. Zasada nadrzędna

**SLD MUSI wyglądać jak system klasy przemysłowej (ETAP / DIgSILENT / ABB MicroSCADA), nie atrapa z klocków.**

Kryteria poniżej są **BINDING** — visual regression w CI musi je weryfikować. Jeśli któreś nie jest spełnione — SLD jest atrapą.

Skala oceny: 1 (atrapa) – 10 (industrial-grade ABB/Siemens). Akceptacja: **≥ 8/10** dla wszystkich kategorii.

---

## 2. Kryteria binding — 12 punktów

### AC-01: Tor mocy czytelny

**Wymóg:** Tor mocy (110 kV → TR → busbar SN → trunk SN → stacje) MUSI być wizualnie podkreślony grubością linii i/lub kolorystyką:
- 110 kV: stroke 5 px (najgrubsza)
- TR: stroke 4 px + symbol prominentny
- Busbar SN: stroke 4 px (gruba)
- Trunk SN (magistrala): stroke 3 px
- Branch: stroke 2 px
- Cable run wewnątrz stacji: stroke 1.5 px

**Test:** Visual snapshot 4 sieci ref × dark_scada theme; manual review przez inżyniera SN ≥ 8/10.

**Plan:** PLAN_SLD_REWORK F3 (visual_emphasis).

### AC-02: Stacje wyglądają jak rozdzielnia, nie klocek

**Wymóg:** Przy zoom ≥ 1× stacja MUSI rozwinąć się inline do mini-RMU/RM6 z:
- Wyraźnym symbolem szyny SN (pojedyncza pozioma)
- 2+ polami (liniowe + transformator)
- TR z grupą przekładni (np. „Dyn11")
- Sekcja NN (jeśli typ SN/nN) — szyna NN + odbiory

**Czego NIE wolno:** prostokąt z napisem „Stacja X" — to atrapa.

**Test:** Visual snapshot stacji przy zoom 1.0× — operator widzi internals.

**Plan:** F3 (LOD-3 + StationInternalView w głównym SLD).

### AC-03: GPZ jako pełna rozdzielnia

**Wymóg:** GPZ przy zoom > 0.7× MUSI pokazać:
- Linia 110 kV przychodząca (jedna lub dwie)
- TR (jeden lub dwa) z grupą przekładni + tap changer marker
- **Topologia busbar** widoczna: single / double / ring — wizualnie odróżnione
- Sekcje SN (separated by section marker)
- Sprzęgło (coupler) między sekcjami (jeśli double busbar)
- Pola SN: rozróżnienie liniowe / TR / pomiarowe / sprzęgłowe / DER (kolor + ikona)
- Annotation: tag IEC pola (Q01...), nominał, kierunek mocy

**Czego NIE wolno:**
- Prostokąt z napisem „GPZ 110/15 kV"
- Brak rozróżnienia sekcji
- Brak TR jako separate symbol

**Test:** Visual snapshot „GPZ-12-bay" fixture × dark_scada/light_technical themes.

**Plan:** F1 (ring/double busbar primitives) + F2 (busbar-first placement) + F3 (visual_emphasis).

### AC-04: Pola SN — wyposażenie zgodne z modelem i technologią

**Wymóg nadrzędny:** symbole wynikają z `Bay.primary_devices`, portów i rzeczywistej konfiguracji rozdzielnicy. Nie istnieje obowiązek stosowania CB + DS + CT + VT w każdym polu. Dawne kryterium minimalne sprzeczne było z wyższymi kontraktami `STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md` oraz `SLD_CAD_SPEC_V3.md` §12.1–12.4.

- Pole liniowe RMU: rozłącznik + uziemnik + głowica, jeśli występują w danych lub jawnej konwencji szablonu.
- Pole wyłącznikowe: rzeczywiste wyłączniki/odłączniki/przekładniki zgodnie z `placement`; brak automatycznego dorysowania CT lub VT.
- Pole transformatorowe: technologia bezpiecznikowa albo wyłącznikowa stosownie do wyposażenia i katalogu; transformator z właściwymi terminalami.
- Pole pomiarowe: brak domyślnego CB tylko dlatego, że taki aparat jest w innym rodzaju pola.
- Nazwa producenta nie upoważnia do przyjęcia zestawu aparatów bez potwierdzonej konfiguracji.

**Zakazy:** brakujący aparat zastąpiony fikcyjnym; uziemnik z fałszywym stanem; CT/VT w błędnym torze; kabel bez portu/głowicy; identyfikator Q1 bez wskazania konkretnego pola.

**Testy pozytywne i negatywne:**
1. RMU-L: `LOAD_SWITCH + ES + CABLE_HEAD`; 0 dopowiedzianych `CB/CT/VT`.
2. Pole wyłącznikowe: aparat, `device_ref`, `placement` i port w zgodzie z ENM.
3. Pole TR: rozdzielenie pola bezpiecznikowego od wyłącznikowego; terminale TR zgodne z modelowaniem.
4. Pole pomiarowe: 0 wyłączników wstawionych bez danych.
5. Brak aparatu w modelu: jawny stan niekompletny lub konwencja oznaczona proweniencją, nigdy pozorna kompletność.
6. Kliknięcie aparatu w L2 zwraca ten sam `device_ref` i `bay_ref` w modelu, kanwie oraz inspektorze.

**PASS:** wszystkie aparaty mają zgodny typ, rolę i przypisanie, 0 urządzeń udających faktyczny montaż, 0 niezakotwiczonych kabli; niepełność jest jawna.

### AC-05: Symbole aparatów jednoznaczne i klikalne

**Wymóg:**
- Każdy aparat ma symbol IEC 60617 (lub ANSI 315 alt mode)
- Każdy aparat ma `ports.json` entry
- Klik na aparat otwiera Element Inspector
- Status (closed/open/fault) wyraźny wizualnie

**Czego NIE wolno:**
- Mieszanie symboli IEC i ANSI bez explicit theme toggle
- Symbole bez znaczenia elektrycznego (dekoracyjne)
- Aparaty bez klikalności (dead element)

**Test:** Library audit: ≥ 50 symboli, parity IEC 60617 ≥ 90%. E2E click test: każdy symbol w 4 ref sieciach klikalny.

**Plan:** F1 (extension do 50+ symboli) + audit `dead_click_guard.py`.

### AC-06: Etykiety nie nachodzą na siebie

**Wymóg:**
- Przy każdym zoom level (LOD-0 do LOD-4) etykiety MUSZĄ NIE nakładać się
- Rozsuwanie etykiet działa w potoku sceny v3 (`frontend/src/ui/sld/v3/layout/declutter.ts`, wołane z `v3/scene/buildScene.ts`); dawny moduł v2 `LabelDeclutter.ts` skasowany 2026-10-21 (karta GPZ-PARYTET cz. 3) — zasilał wyłącznie pola widoku adaptera bez czytelnika rysunku

**Czego NIE wolno:** Czytelnie nachodzące się labelki (typowo: 4-5 pól w GPZ na zoom 0.3× nakładają się).

**Test:** Visual snapshot 4 ref sieci × 4 LOD; manual review per LOD. Acceptable: 0 nakładających się labelek.

**Plan:** F3 (label collision avoidance + LOD-aware sizing).

### AC-07: Odcinki wychodzą z głowic/portów

**Wymóg:** Linia/kabel MUSI zaczynać się i kończyć w PORCIE symbolu (`port_id` zdefiniowany w `ports.json`).

**Czego NIE wolno:** Routing łączący współrzędne bbox (środek symbolu).

**Test:** `port_binding_guard.py` PASS dla 100% edges w 4 ref sieciach + visual snapshot.

**Plan:** F2 (port-based routing) — **P0 KRYTYCZNE**.

### AC-08: LOD wzmacnia znaczenie elektryczne

**Wymóg:** 5 poziomów LOD:
- **LOD-0 (overview, zoom < 0.3×):** outline GPZ + magistrala — bez pól (mapa)
- **LOD-1 (planview, 0.3–0.7×):** + pola jako prostokąty z nazwą, mini-RMU compact
- **LOD-2 (standard, 0.7–1.5×):** + CB, DS w polach, główne pomiary, mini-RMU detail
- **LOD-3 (technical, 1.5–3.0×):** + CT/VT, badge'e SPZ/SCO/OWG, DER sub-tree
- **LOD-4 (diagnostyka, > 3.0×):** wszystko + footnoty, snapshot info

Source of truth: `LOD_ZOOM_THRESHOLDS` w `frontend/src/ui/sld/v2/lod/LodPolicy.ts`.

**Czego NIE wolno:**
- Brak LOD (wszystko na każdym zoom)
- LOD ukrywa znaczenie elektryczne (np. przy zoom > 1× nie ma CT/VT)

**Test:** Visual snapshot 4 ref sieci × 4 LOD = 16 snapshotów.

**Plan:** F3 (LOD policy).

### AC-09: Kliknięcia i menu kontekstowe pełne

**Wymóg:**
- Każdy interaktywny element ma sensowne menu kontekstowe (PCM/PPM)
- Brak dead clicków
- Komunikaty po polsku (zgodnie z V12.xx canon)

**Czego NIE wolno:**
- Klik na element bez efektu
- Menu z opcjami programistycznymi („executeDomainOp")
- Komunikaty angielskie

**Test:** E2E `dead_click_guard.py` rozszerzony + manual click test.

**Plan:** Audit dead clicków + P1 fix (PLAN_E2E_INDUSTRIAL § 4.0).

### AC-10: Eksport SVG + PDF działa

**Wymóg:**
- Przycisk „Pobierz SVG" — działa, plik vector-clean
- Przycisk „Pobierz PDF" — działa, plik vector PDF (nie raster)
- Eksport zawsze w motywie `light_technical`
- Eksport deterministyczny (SHA-256 stabilny dla tej samej sieci + caseId)

**Czego NIE wolno:** Brak przycisku / nieaktywny przycisk / raster PDF.

**Test:** E2E test eksportu dla 4 ref sieci. Deterministyczność: 2 runy → identyczny hash.

**Plan:** F4 (eksport).

### AC-11: Visual regression w CI

**Wymóg:**
- Geometria SLD v3 pinowana wyroczniami per LOD (`npm run accept:sld-v3`) — regresja geometrii = FAIL joba.
- Rendery dowodowe (W2c: PV + BESS + TR z kolizją etykiet = FAIL; role L1 z nakładką zasilania
  z produkcyjnego `buildEnergizationOverlay(enm)`) generowane w CI i publikowane jako artefakty
  `sld-w2c-visual-evidence` i `sld-v3-role-evidence` (14 dni).
- Werdykt wizualny wystawia właściciel (bramka B-02) na podstawie artefaktów; CI nie certyfikuje wyglądu.

**Test:** `.github/workflows/sld-determinism.yml` job „sld-contract-tests": kroki
„Run SLD v3 render-odbiór acceptance (F7/F8b-2)", „Run W2c label-plan evidence", „Render operator L1 using
production ENM energization overlay" PASS.

Korekta 2026-10-21: dawne brzmienie (60 snapshotów pikselowych, job „visual-regression") wskazywało
job, który nie istnieje — mechanizm pikselowy został usunięty 2026-07-17
(`SLD_VISUAL_REGRESSION_CONTRACT.md`, status HISTORYCZNY).

**Plan:** F5.

### AC-12: 2 motywy: dark_scada + light_technical

**Wymóg:**
- `dark_scada` (V12K-007): #101316 BG, #F2F4F6 line primary, neon accents — dla ekranu
- `light_technical`: #FFFFFF BG, #000000 line primary — dla eksportu / druku
- Toggle theme via CSS variables (instant switch bez re-render)
- Eksport ZAWSZE w light_technical

**Czego NIE wolno:** Jeden motyw (tylko dark) bez możliwości druku.

**Test:** Visual snapshot 4 ref sieci × 2 motywy = 8 snapshotów.

**Plan:** F4 (theme system).

---

## 3. Performance criteria

| Metryka | Threshold |
|---------|-----------|
| Initial render (200 pól) | < 500 ms |
| Pan/zoom (200 pól) | < 50 ms per frame |
| Memory footprint (200 pól) | < 100 MB JS heap |
| Bundle size SLD module | < 500 KB gzipped |

**Test:** Lighthouse + Chrome DevTools profiler dla 4 ref sieci.

---

## 4. Determinism criteria

| Metryka | Wymóg |
|---------|-------|
| Render hash | SHA-256 stabilny dla tej samej sieci + theme + LOD |
| Layout deterministic | 100 iteracji = identyczny output |
| Export deterministic | 2 runy SVG/PDF = identyczny hash |

**Test:** `trace_determinism_guard.py` + `sld_determinism_guards.py` PASS.

---

## 5. Acceptance gate (Definition of Done dla rework SLD)

Rework SLD osiąga industrial-grade gdy:

| Gate | Kryterium | Test |
|------|-----------|------|
| **AC-01..AC-12** | Wszystkie 12 punktów PASS | Visual snapshots + manual review ≥ 8/10 |
| **Performance** | 4 metryki w threshold | Lighthouse + profiler |
| **Determinism** | 3 metryki w threshold | Guards CI |
| **Tests** | E2E `critical-run-flow` + `sld-editor-real-backend-flex` PASS | CI |
| **Guards** | `port_binding_guard`, `sld_determinism_guards`, `station_not_rectangle` PASS | CI |
| **Manual review** | Inżynier SN przegląd 4 ref sieci × 2 motywy × 4 LOD = 32 widoków, ≥ 8/10 średnia | Manualny |

---

## 6. Co JEDNOZNACZNIE NIE jest klasą przemysłową (red flags)

Jeśli WIDOCZNE — system jest atrapą i NIE może być wydany jako industrial-grade:

- 🚩 Tor mocy nie jest podkreślony (wszystko tej samej grubości linii)
- 🚩 Stacje renderowane jako prostokąt z napisem
- 🚩 GPZ bez TR jako separate symbol
- 🚩 Pola SN bez CT/VT (brak znaczenia elektrycznego)
- 🚩 Linie łączą się ze środkiem symboli (nie z portami)
- 🚩 Etykiety nakładające się na zoom 0.3× lub 1.0×
- 🚩 Brak LOD (wszystko renderowane zawsze)
- 🚩 Brak eksportu PDF/SVG
- 🚩 Tylko 1 motyw (tylko dark)
- 🚩 Brak visual regression w CI
- 🚩 Dead clicki w UI
- 🚩 Komunikaty angielskie / programistyczne

---

**KONIEC KRYTERIÓW AKCEPTACJI WIZUALNEJ SLD**
