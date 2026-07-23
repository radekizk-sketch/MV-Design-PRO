# SCHEMAT-10 S5 (FINAŁ) — MACIERZ PARYTETU FUNKCJI (2026-07-23) — DOWÓD DOMKNIĘCIA

Karta S5 = FINAŁ programu SCHEMAT-10 (`docs/plan/PLAN_SLD_REWORK.md` §0):
**dowód domknięcia, nie nowe funkcje.** Ten dokument dowodzi „parytetu funkcji
testami" (kryterium odbioru S5): każda funkcja SLD v3 ma REALNY dowód
(plik testu/sondy + nazwa testu/bloku + liczba testów + status na HEAD).

Metoda: liczby testów i nazwy bloków zebrane WPROST z kodu na HEAD
(`9e9d5ead`, gałąź `claude/power-network-design-ui-ir91mv`). Bramka odbioru
całości SLD v3 — `npm run accept:sld-v3` — na HEAD: **ALL PASS** (wszystkie
wyrocznie spec §11/§9/§16 na L0/L1/L2 zielone, bez regeneracji goldenów).

Legenda statusu: **PASS** = dowód uruchomiony zielony na HEAD.

---

## Macierz

| # | Funkcja | Dostawca (kod) | Dowód (plik testu/sondy · blok/nazwa) | Testy | Status HEAD |
|---|---------|----------------|----------------------------------------|-------|-------------|
| 1 | **Overlay przepływu mocy** | `sld/v3/canvas/overlay.ts` (`buildFlowOverlayFromScene`, `flowOverlayValuesTraceToPayload`, bramka `singleHop`); render `SldCanvasV3.tsx` (`computeFlowOverlayPlacements`, warstwa `sld-v3-flow-overlay`) | `sld/v3/canvas/__tests__/overlay.test.ts` — blok „flowOverlayValuesTraceToPayload (flow_overlay_probe §11.13)" + „singleHopSegmentRefs" (kontrakt jednokawałkowy, negatyw „ref poza singleHop ⇒ zero wpisu"); `sld/v3/canvas/__tests__/sldCanvasV3.test.tsx` — blok „F9.5: nakładka przepływu mocy (§14.2)" ((a) grot+etykieta, format PL); sonda `accept:sld-v3` `flow_overlay_probe` | overlay.test.ts: 55 · sldCanvasV3.test.tsx: 51 (bloki dot. przepływu) | **PASS** |
| 2 | **Overlay zwarciowy + strzałki jednokawałkowe** | `sld/v3/canvas/overlay.ts` (`buildFaultFlowOverlayFromScene`, bramka F-1 `singleHop`) | `overlay.test.ts` — blok „buildFaultFlowOverlayFromScene (karta S-B)": input=null ⇒ pusto (zero atrap), „bramka F-1: ref poza singleHop ⇒ zero wpisu (kierunek geometrycznie nieudowodniony)", „strzałka na przęśle jednokawałkowym: zachowanie jak przed GAP (regresja)" | część z 55 (overlay.test.ts) | **PASS** |
| 3 | **Strzałki wielokawałkowe (V12K-133)** | `sld/v3/canvas/overlay.ts` (`multiHopFaultFlowSegmentRefs`) — dowód łańcucha po TOŻSAMOŚCI WĘZŁA (busRef), przedstawiciel grupy = 1 strzałka/przęsło; `SldCanvasV3Workspace.tsx` | `overlay.test.ts` — blok „multiHopFaultFlowSegmentRefs (GAP V12K-121, karta SLD-W)": „łańcuch 2 kawałki: przedstawicielem JEDEN człon (nie cała grupa)", „przedstawiciel grupy 4-członowej dostaje strzałkę; pozostałe 3 zero", negatywy przez minimalną mutację (T-węzeł, odwrócony człon → 0), „singleHopSegmentRefs(52s) niezmienione: 45", „przepływ mocy niezmieniony" | część z 55 (overlay.test.ts) | **PASS** |
| 4 | **Znacznik punktu zwarcia (pulse) (V12K-131)** | `sld/v3/canvas/overlay.ts` (`faultPointMarkerRef`), `SldCanvasV3.tsx` (`computeFaultPointMarkerPlacement`, `SceneFaultPointMarkerNode` — kropka + pulsujący pierścień NATYWNĄ animacją SVG, zero globalnego CSS) | `sldCanvasV3.test.tsx` — blok „karta SLD-P: znacznik pulse punktu zwarcia (GAP V12K-120/121)": (a) `sld-v3-fault-point-marker-pulse` cx/cy == geometria sceny, (c) brak overlay/ref ⇒ warstwa bez znacznika (zero atrap), „computeFaultPointMarkerPlacement: brak/nieznany ref ⇒ null (nie fabrykuje)", „pomija elementKind protectionAnnotation" | część z 51 (sldCanvasV3.test.tsx) | **PASS** |
| 5 | **Overlay/badge OLTC** | `sld/v3/canvas/overlay.ts` (`buildOltcOverlayFromScene`, V12K-092); `SldCanvasV3.tsx` (`computeOltcBadgePlacements`, `formatOltcBadgeLabel`, warstwa nakładki wyników) | `overlay.test.ts` — blok „buildOltcOverlayFromScene (V12K-092, badge wynikowy OLTC §14.2/§3.5)"; `sldCanvasV3.test.tsx` — placement/format badge OLTC (`computeOltcBadgePlacements`) | część z 55 + 51 | **PASS** |
| 6 | **Menu kontekstowe (w tym DER: show-ncrfg / show-results)** | `context-menu/*` (`actionMenuBuilders`, `SldContextMenuController`), `sld/v3/canvas/{contextMenu,actionExecutor}`, `sld/shared/{SldCommandService,SldContextMenuController}`; DER: generyczny kind `der` z realnymi akcjami show-ncrfg (zgodność przyłączeniowa, preselekcja generatora) + show-results (rozpływ, preselekcja po ref) | `context-menu/__tests__/actionMenuBuilders.test.ts` (49); `context-menu/__tests__/SldContextMenuController.test.tsx` (8); `sld/v3/canvas/__tests__/contextMenu.test.tsx` (3); `sld/v3/canvas/__tests__/actionExecutor.test.tsx` (4); DER: `sld/shared/__tests__/sldActionExecutorNcRfg.test.tsx` (3, „deep-link do zakładki ncrfg z nazwą generatora ze snapshotu"; „generator nieznany ⇒ surowy ref, zero fabrykacji"; separacja show-frt-hvrt), `sldActionExecutorShowResults.test.tsx` (5) | 49+8+3+4+3+5 = **72** | **PASS** |
| 7 | **Selekcja + centrowanie + deep-linki** | selekcja: `SldCanvasV3Workspace.tsx` (klik → `useSelectionStore`, typ z `elementKind`); centrowanie: `canvas/camera.ts` (`computeInitialCameraState` z `focusPoint` GPZ, recentrowanie przy zoomie/refit); deep-linki: `sld/shared` action executory | selekcja: `sld/v3/canvas/__tests__/sldCanvasV3Workspace.test.tsx` — „klik w symbol woła globalną selekcję (useSelectionStore) z id z testId" + blok „F8b-1 B — selekcja z realnym typem (elementKind → ElementType)"; centrowanie: `sld/v3/canvas/__tests__/camera.test.ts` (kamera wycentrowana na środku świata; zoom z kursorem recentruje; refit z focusPoint); deep-linki: `sldActionExecutorShowResults.test.tsx` (5) + `sldActionExecutorNcRfg.test.tsx` (3) | selekcja+typ: ~6 · camera.test.ts: (centrowanie) · deep-link: 8 | **PASS** |
| 8 | **Wiązanie kreatorów ze schematem (selekcjaPoOperacji)** | `ui2/kreatory/rama` (`selekcjaPoOperacji`) — po operacji kreatora (pole SN/nN, łącznik sekcyjny, źródło OZE, edycja parametrów, przypisanie katalogu, ogranicznik) selekcja przenosi się na wynikowy element schematu | `ui2/kreatory/rama/__tests__/selekcjaPoOperacji.test.tsx` | **8** | **PASS** |
| 9 | **Edycja CAD** | `sld/v2/geometry/cadRoutingContract.ts` — siatka CAD (`snapToGrid`/`snapPointToGrid`, `CAD_GRID_BASE_PX=8`), magnetyczny snap portów (`findNearestPort`, `PORT_SNAP_THRESHOLD_PX=12`), routing ortogonalny (`buildOrthogonalRoute` L-shape + waypoints), walidacja ortogonalności (`isOrthogonalRoute`), warstwy (`CAD_LAYER_COLOR`/`CAD_LAYER_Z_ORDER`) | `sld/v2/geometry/__tests__/cadRoutingContract.test.ts` — „snapToGrid + snapPointToGrid — siatka CAD", „findNearestPort — magnetic snap", „buildOrthogonalRoute — ortogonalne L-shape + waypoints (100% ortogonalny, snap do grid)", „isOrthogonalRoute — walidacja" | **33** | **PASS** |
| 10 | **Eksport (jasny motyw + kadr)** | jasny motyw: `sld/v3/export/exportPalette.ts` (`toLightTechnicalExportSvg`, `LIGHT_TECHNICAL_V3`); kadr: `sld/v3/export/exportFrame.ts` (`computeContentFitFrame` = bbox treści + `FRAME_MARGIN`, `contentFitRatio` — martwe pola ≤20%) | jasny motyw: `sld/v3/export/__tests__/exportPalette.test.tsx` (9, w tym integracja na realnym markupie kanwy: „ZERO wartości ciemnych po transformacji", „tło jasne obecne", „parytet elementów segmenty/symbole/etykiety identyczne przed/po" na L0/L1/L2); kadr: `sld/v3/export/__tests__/exportFrame.test.ts` (5, `computeContentFitFrame`/`contentFitRatio` — kadr = bbox+margines, dead ≤20%) | 9 + 5 = **14** | **PASS** |
| 11 | **Reguła 18 gramatyki mini-RMU** — „JEDNA gramatyka w CAŁYM systemie (SLD, wyniki, zwarcia, rozpływ, eksport, wydruki, porównania) — zero lokalnych wyjątków" (`GRAMATYKA_MINI_RMU_2026-07.md` reguła 18) | Gramatyka z JEDNEGO źródła (`symbols/miniRmuGrammar.ts` `MINI_RMU`); powierzchnia eksportu reużywa markup kanwy (`toLightTechnicalExportSvg` = klon → paleta → kadr), nie ma drugiego renderera | **PRZED S5: LUKA** — reguła 18 nie miała wyroczni (reguła 13–14 miała `symbols.test.tsx` „geometria WYŁĄCZNIE z MINI_RMU"; parytet LICZNOŚCI eksportu — `exportPalette.test.tsx`; ale cross-powierzchniowej TOŻSAMOŚCI gramatyki — brak). **DOPISANE w S5** (jedyny dozwolony nowy test funkcjonalny): `sld/v3/export/__tests__/grammarRule18.test.tsx` — geometria/struktura eksportu == kanwy po zdjęciu literałów koloru, BAJT-IDENTYCZNIE na L0/L1/L2 (dowód: eksport różni się WYŁĄCZNIE paletą+tłem, zero lokalnego wyjątku w geometrii) + wyrocznia gryzie (realna podmiana palety) | **4** (nowe) | **PASS** |

---

## Podsumowanie parytetu

- **Wierszy z realnym dowodem na HEAD: 11 / 11.**
- **Luk pozostawionych (bez dowodu): 0.**
- **Luka naprawiona w S5: 1** — reguła 18 gramatyki mini-RMU (dopisany test
  `grammarRule18.test.tsx`, 4 testy, PASS; jedyny nowy test funkcjonalny karty).

Bramka całości `accept:sld-v3` na HEAD: **ALL PASS** (bez regeneracji goldenów —
patrz dostawa 1 karty S5, dowód świeżości goldenów).

## Uwagi (poza zakresem S5, zarejestrowane — nie zamiatane)

- Rejestr `V12K-133` odnotowuje teoretyczną lukę F-1 dla przęsła
  JEDNOkawałkowego przy odwróconej deklaracji `from/to` (kontraktowo
  niewystępującą na 45 realnych przęsłach fixtury referencyjnej) — ewentualna
  osobna karta, nie blokuje parytetu S5.
- Rejestr `V12K-131` odnotowuje `show-frt-hvrt` w menu DER jako kandydata na
  osobną kartę (po weryfikacji preselekcji E-26) — świadomie NIE przeniesiony,
  żeby nie zgadywać celu; obecne pozycje DER (show-ncrfg/show-results) mają
  realnych dostawców i dowody (wiersz 6).
