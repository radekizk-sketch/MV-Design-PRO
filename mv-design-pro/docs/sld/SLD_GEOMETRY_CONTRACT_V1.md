# Kontrakt geometrii SLD + przebudowa layoutu (V1) — projekt wiążący

**Data:** 2026-05-28 · **Podstawa:** `ZADANIE_WERYFIKACJA_WIZUALNA.md` §7.6 (decyzje właściciela A/B/C/D)
**Cel:** zlikwidować „grzebień" (V-09), zakotwiczyć połączenia do portów (V-07), bez „drugiej prawdy".

> Ten dokument jest kontraktem, do którego implementuje się przebudowę. Powstał po
> dwóch diagnozach „dane czy render" (ta sama dyscyplina co przy 116 kA):

## 0. Wynik diagnoz (PRZED rysowaniem — wymóg §7.6.C / V-07)

| Pytanie | Werdykt | Dowód |
|---|---|---|
| V-07: przewody wiszą — brak modelu czy render? | **RENDER** | ENM ma `Port/PortRef/PortKind`, `endpoint_a_port/endpoint_b_port`, `starting_port_ref`, `external_ports` (`backend/src/enm/models.py`); `enmToSldAdapter.ts` liczy geometrię ze slotów `Y_RUN_BASE`/`X_STATIONS_START + j×pitch` |
| 7.6.C: czy ENM ma współrzędne geo? | **NIE — brak danych** | zero `latitude/longitude/wgs/epsg/puwg/crs/srid` w `backend/src`; `Substation` ma tylko pola logiczne + `position_km` (odległość wzdłuż kabla, nie geo) |
| Czy istnieje dedykowany silnik layoutu (Sugiyama)? | **NIE** | pozycje liczy `enmToSldAdapter.ts` ze sztywnych slotów; `engine/sld-layout/` nie istnieje |

**Konsekwencja:** tryb topologiczny budujemy teraz (model jest). **Tryb geo = DŁUG** —
brak współrzędnych; źródło do ustalenia (import GIS / ręczne / CGMES). Nie udajemy geo
na zmyślonych pozycjach (7.6.C).

## 1. Kontrakt geometrii (7.6.A) — jedyne źródło pozycji

Silnik layoutu zwraca pełną warstwę geometrii; adapter/renderer tylko ją czyta.

> Stan 2026-11-12 (karta SLD-SKALA-I-NAWIGACJA, pomiar grepem): kontrakt niżej i silnik
> `engine/sld-layout/layoutEngine.ts` nie mają konsumenta produkcyjnego — czytają je wyłącznie
> testy substratu (`v2/geometry/__tests__/*.substrate.test.ts`, krok workflowa SLD Determinism).
> Pole `lod` / typ `LodLevel` oznacza tu poziom hierarchii węzła (stacja / pole / aparat), nie
> poziom renderu zależny od skali; jedyny renderer `SldCanvasV3` rysuje jedną scenę w każdej skali
> (§7). Zgłoszone architektowi jako dług „funkcja tylko w testach".

```ts
// frontend/src/ui/sld/v2/geometry/layoutContract.ts (NOWY)
export type LayoutMode = 'topological' | 'geo';
export type LodLevel = 'L0' | 'L1' | 'L2';  // L0 przegląd sieci / L1 stacja-ciąg / L2 pole-szczegół — JEDNA prawda geometrii (zagnieżdżona), trzy poziomy detalu

export interface PortAnchor {
  portId: string;            // ENM PortRef.port_id — identyfikator portu z rejestru portów modelu (Port.id)
  ownerRef: string;          // pole/stacja/GPZ do którego port należy
  kind: PortKind;            // głowica odpływowa / wejściowa / DER / branch_point
  x: number; y: number;      // pozycja w world-space — JEDYNE źródło
  side: 'top'|'bottom'|'left'|'right'; // strona symbolu (kierunek wyjścia krawędzi)
}

export interface NodeGeometry {
  ref: string;               // ENM ref_id obiektu (GPZ/stacja/pole/węzeł)
  x: number; y: number;      // world-space (układ rodzica) — JEDYNE źródło
  width: number; height: number;
  rank: number;              // poziom w drzewie (0 = GPZ); dla geo: nieużywane
  lod: LodLevel;             // poziom, na którym węzeł jest osobnym obiektem: STACJA=L0, POLE=L1, APARAT=L2
  ports: readonly PortAnchor[];       // L2: głowice/terminale; L0/L1: porty brzegowe (zagregowane, WCIĄŻ zakotwiczone)
  children?: readonly NodeGeometry[]; // rozwinięcie na następny poziom (pola w stacji → aparaty w polu); zagnieżdżenie = JEDNA prawda, nie osobne pozycje
}

export interface EdgeGeometry {
  ref: string;               // ref kabla/linii
  lod: LodLevel;             // najniższy poziom, na którym krawędź jest osobna; L0/L1 = zagregowana stacja→stacja/pole→pole, L2 = port→port
  fromPortId: string; toPortId: string;   // krawędź port→port (NIE slot→slot); na L0/L1 porty brzegowe bloków
  polyline: ReadonlyArray<{ x: number; y: number }>; // routing ortogonalny
}

export interface LayoutResult {
  mode: LayoutMode;
  nodes: readonly NodeGeometry[];
  edges: readonly EdgeGeometry[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface LayoutEngine {
  // jedno źródło prawdy o geometrii dla danego trybu i tej samej topologii ENM
  layout(snapshot: EnmSnapshot, mode: LayoutMode): LayoutResult;
}
```

**Reguła wiążąca:** `CableRunRenderer`/odpływy NIE liczą geometrii. Rysują
`edge.polyline` między `fromPortId`→`toPortId`, których pozycje pochodzą z
`LayoutResult.nodes[].ports[]`. Zakotwiczenie V-07 = „zapytaj layout o port głowicy,
narysuj do portu terminala". Zmiana trybu/layoutu → porty dostają nowe `x,y` →
krawędzie podążają (jedna iteracja, zero podwójnej roboty — 7.6.A).

## 2. Tryb topologiczny — koniec „grzebienia" (7.6.B, V-01/V-03/V-09)

Algorytm (drzewo radialne, warianty Sugiyama dla rozdzielczej sieci SN):
1. **Korzeń** = GPZ (rank 0).
2. **Magistrala** = ścieżka główna (oś pozioma), stacje przelotowe na osi.
3. **Laterale** = odgałęzienia z pól FEEDER → osobne **ranki pionowe** (nad/pod osią,
   naprzemiennie), rekurencyjnie dla pod-odgałęzień.
4. **Rozłożenie w ranku** = minimalizacja skrzyżowań (barycenter/median) + równe odstępy.
5. **Wypełnienie kadru** = skala tak, by bbox zajął ≥75% (auto-fit, kontrakt §7.3.1).
6. **Porty** = pozycje głowic liczone względem symbolu pola (bottom dla odpływu w dół,
   itd.) i zwracane w `NodeGeometry.ports`.

Efekt: zamiast 52 stacji w jednym rzędzie — magistrala + laterale w rankach, drzewo
czytane od GPZ w dół/w prawo (V-03), wypełniające kadr (V-01).

## 3. Tryb geo-schematyczny — DŁUG (7.6.C)

Brak współrzędnych w ENM. **Nie implementujemy na atrapach.** Plan:
- przełącznik trybu (7.6.D) pokazuje tryb geo jako „niedostępny — brak współrzędnych";
- źródło współrzędnych do decyzji: import GIS (GeoJSON/SHP), ręczne pozycjonowanie,
  lub z CGMES (`DiagramLayout`/`PositionPoint` — wiąże się z D-02 CIM/CGMES);
- po dostarczeniu danych: ten sam `LayoutEngine.layout(snapshot, 'geo')`, ten sam
  kontrakt portów; linie prostowane (schematycznie), nie surowy GPS.

## 4. Migracja `enmToSldAdapter.ts` (bez „drugiej prawdy")

- USUŃ liczenie pozycji ze slotów (`Y_RUN_BASE`, `X_STATIONS_START + j×pitch`,
  `GPZ_FIELD_CABLE_HEAD_CLEARANCE_Y`).
- Adapter mapuje ENM→topologia (węzły/krawędzie/porty logiczne) i wywołuje
  `LayoutEngine.layout`. Pozycje (`x,y`, `pathPoints`) pochodzą z `LayoutResult`.
- Renderery (`GpzCanonicalRenderer`, `CableRunRenderer`, etykiety, hit-boxy) czytają
  z jednej warstwy geometrii → spójność trybu (Z15 rozszerzone na geometrię).

## 5. Substrate testowy (V-09/V-10) — wymóg przed oceną

Generator `generate-large-network.mjs` musi dawać **laterale** (nie tylko magistralę)
i **OZE** — obecnie `branch≈1`, `der=0` (payload `add_converter_source` do poprawy).
Bez lateralów i OZE nie udowodni się trybu drzewa ani V-10. To pierwszy krok
implementacji: lateralo- i OZE-bogata sieć ≥50 stacji.

## 6. Kryteria wyjścia (oba tryby, §7.3, ≥8/10)

Topologiczny: drzewo (nie grzebień), ≥75% kadru, port→port (zero wiszących), klikalność,
czytelność na ≥50 stacjach, wszystkie łańcuchy OZE, tryb prezentacyjny. Geo: dopiero po
dostarczeniu współrzędnych (inaczej jawny dług). Werdykt eksperta ≥8/10 na zrzucie PO.

**Rozszerzony próg §7.3 (skala, wersja 2026-11-12 — karta SLD-SKALA-I-NAWIGACJA; zastępuje próg
poziomów L0/L1/L2 z 2026-05-29):** 12) **kadr całej sieci ≥50 stacji czytelny** — każda stacja
i GPZ ma napis tożsamości albo dymek, tor kompletny, kadr ≥75 %; 13) **skala czytania (1,0)** —
pełna aparatura, głowice i wyniki bez nachodzenia; 14) **ciągłość kółka** — pozycja ekranowa
wskazanego aparatu ciągła w poprzek całego zakresu skali, bez skoku geometrii; 15) **napisy
danych widoczne tylko tam, gdzie są czytelne** (reguła gęstości R3) i bez nachodzenia;
16) **nawigacja jawna** — dwuklik w głąb, okruszki w górę, wskazanie jedną regułą. Werdykt
≥8/10 (B-02) oceniany w kadrze całej sieci, w skali pośredniej i w skali czytania.

## 7. Skala i gęstość informacji — JEDNA geometria (wersja 2026-11-12)

Kontrakt wiążący: `SLD_LOD_SPEC_OPERATOR_GRADE.md` v2.0 „Skala, gęstość informacji i nawigacja"
(R1–R9). Wersja z 2026-05-29 tego paragrafu opisywała trzy poziomy L0/L1/L2 (stacja jako blok
przeglądowy, rozwinięcie w pola, pełna aparatura), moduł `engine/sld-layout/lodController.ts`,
wymuszanie poziomu i przenikanie warstw — skasowane razem z modułem; konflikt w
`docs/v12xx/REJESTR_KONFLIKTOW.md`.

**Reguły wiążące (zgodne z v2.0):**
- **Jedna geometria w każdej skali.** Scena (`buildSceneV3`) nie zna skali; kamera jest czystym
  przekształceniem. Elementy toru są rysowane w każdej skali; skala steruje wyłącznie widocznością
  NAPISÓW wg ich rozmiaru na ekranie (R3) — nachodzenie etykiet rozwiązuje plan etykiet z regułą
  gęstości, a nie zmiana postaci obiektu.
- **Port-anchoring (V-07) w każdej skali** — geometria jest jedna, więc zakotwiczenie też.
- **Klikalność (V-08) w każdej skali:** cel kliku to najmniejszy obiekt hierarchii aparat → pole →
  stacja rozpoznawalny na ekranie (R6); dwuklik kadruje o poziom głębiej (R7).
- **Wydajność:** render tylko okna kamery z zapasem; symbol poniżej 3 px jako obrys bez wnętrza
  (R8); budżety węzłów DOM przypięte testem.

---
*Kontrakt wiążący dla przebudowy SLD. Implementacja iteruje na substracie 52 stacji,
zrzutami, do progu §7.3 w obu trybach. Tryb geo czeka na źródło współrzędnych.*
