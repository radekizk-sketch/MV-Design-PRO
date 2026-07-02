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

```ts
// frontend/src/ui/sld/v2/geometry/layoutContract.ts (NOWY)
export type LayoutMode = 'topological' | 'geo';
export type LodLevel = 'L0' | 'L1' | 'L2';  // L0 przegląd sieci / L1 stacja-ciąg / L2 pole-szczegół — JEDNA prawda geometrii (zagnieżdżona), trzy poziomy detalu

export interface PortAnchor {
  portId: string;            // ENM PortRef.port_id (np. "...FEEDER.BRANCH")
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

**Rozszerzony próg §7.3 (LOD, dodane 2026-05-29):** 12) **L0 czytelny dla ≥50 stacji** —
stacje rozróżnialne, zero mikro-znaczków, kadr ≥75%; 13) **L2** pełna aparatura + głowice +
wyniki bez nachodzenia; 14) **przejścia LOD płynne** (sekwencja zrzutów / nagranie, bez
migotania); 15) **etykiety/wyniki widoczne tylko na poziomie, gdzie się mieszczą** (zero
nachodzenia przez LOD, nie wyłącznie przez collision-avoidance); 16) **klik nawiguje
blok→stacja→pole**, hit-box=symbol na każdym poziomie. Werdykt ≥8/10 (B-02) oceniany na
WSZYSTKICH trzech poziomach (L0/L1/L2), nie jednym.

## 7. Level of Detail (LOD) — trzy poziomy, JEDNA prawda geometrii (rozszerzenie 2026-05-29)

LOD = dwie SPRZĘŻONE warstwy (obie wymagane): **graficzny** (zoom geometryczny — ten sam
obiekt, różny detal wizualny) + **danych** (semantyczny — ILE informacji; sprzężony z 4
warstwami §7.1 topologia/wyniki/stan/chrome i etykietami-slotami §7.2). Bez LOD schemat
≥50 stacji jest nieczytelny niezależnie od jakości layoutu (dowód: 52 stacje jako
mikro-znaczki). **JEDNA prawda:** geometria jest ZAGNIEŻDŻONA (`NodeGeometry.children`) —
stacja (L0) zawiera pola (L1) zawierają aparaty (L2); LOD wybiera GŁĘBOKOŚĆ renderu +
widoczność warstw, NIE liczy trzech osobnych prawd o pozycjach.

| Poziom | Topologia | Wyniki | Etykiety | Porty / krawędzie |
|--------|-----------|--------|----------|-------------------|
| **L0** przegląd | stacje jako BLOKI (bbox dzieci), magistrala + laterale | brak / agregat per ciąg | nazwa stacji + status gotowości | brzegowe stacja→stacja, zakotwiczone |
| **L1** stacja/ciąg | pola, transformatory, sprzęgła (rozwinięcie bloku) | kluczowe (Ik″ szyna, obciążenie ciągu) | nazwa pola, rola IN/OUT/TR/FEEDER, stan łącznika | brzegowe pole→pole, zakotwiczone |
| **L2** pole/szczegół | pełna aparatura (CB/DS/ES, przekładniki, GŁOWICE) | pełne (Ik″/ip/Ith, prądy, spadki) | katalogowe (typ/przekrój/długość), wynik per węzeł | głowica→terminal (V-07 pełne) |

**Reguły wiążące:**
- **Widoczność warstw sterowana LOD** rozwiązuje nachodzenie etykiet (A-01/A-03)
  STRUKTURALNIE: etykiety/wyniki nie istnieją tam, gdzie i tak by się nachodziły (L0 =
  topologia + stan; wyniki i większość etykiet dopiero L1/L2). NIE polegamy wyłącznie na
  collision-avoidance.
- **Port-anchoring (V-07) na KAŻDYM poziomie:** L2 głowica→terminal; L0/L1 uproszczone, ale
  WCIĄŻ zakotwiczone do portów brzegowych (zero wiszących na każdym poziomie).
- **Klikalność (V-08) na KAŻDYM poziomie:** klik blok L0 → zoom L1; klik pole L1 → L2 +
  inspektor. Hit-box = symbol na każdym poziomie.
- **Przejścia PŁYNNE:** fade/interpolacja zoom→LodLevel, bez migotania/skoku.
- **Override:** użytkownik może wymusić poziom (jak warstwy §7.6).
- **Wydajność/wirtualizacja:** L0 dla ≥50 stacji NIE renderuje pełnej aparatury (to cała
  poanta); render TYLKO widocznego viewportu (>100 węzłów płynnie, §7B.7).

**`lod-controller`** (nowy moduł, `engine/sld-layout/lodController.ts`): progi
zoom→`LodLevel`, płynne przejścia, polityka widoczności warstw per poziom, wirtualizacja
viewportu. Czyta z `LayoutResult` (NIE liczy pozycji — jedna prawda geometrii).

---
*Kontrakt wiążący dla przebudowy SLD. Implementacja iteruje na substracie 52 stacji,
zrzutami, do progu §7.3 w obu trybach. Tryb geo czeka na źródło współrzędnych.*
