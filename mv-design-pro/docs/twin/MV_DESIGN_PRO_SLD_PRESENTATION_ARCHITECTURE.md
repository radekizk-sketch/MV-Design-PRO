# MV-DESIGN-PRO — SLD PRESENTATION ARCHITECTURE: CAD / SCADA / ENGINEERING (FAZA E; pakiet §179 poz. 9)

> **Status od 2026-09-04 (kontrakt MAX PLATFORM):** materiał wejściowy i dowodowy programu konwergencji. Źródło kanoniczne architektury: `../architecture/PRODUCT_CAPABILITY_CONSTITUTION.md`, `../architecture/CAPABILITY_ARCHITECTURE_MATRIX.md`, `../architecture/CANONICAL_TWIN_ARCHITECTURE.md`, `../architecture/CONVERGENCE_ROADMAP.md`, `../architecture/DECISION_FREEZE_REGISTER.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`. Przy rozbieżności obowiązuje dokument kanoniczny; w szczególności: nie powstaje nowa klasa `TwinModel` (Canonical Project Twin = rozwinięty ENM), `network_model` jest pochodnym IR, program nie zatrzymuje się po M0, lecz prowadzi konwergencję wycinkami CV-0…CV-6 z bramkami B-01/B-02 i procedurą kasacji.


**Status:** PROPOZYCJA DO PRZEGLĄDU WŁAŚCICIELA (mandat §96–§113, §144, §159–§160). Nie jest kanonem do czasu decyzji.
Werdykt wizualny SLD (B-02) należy wyłącznie do właściciela — ten dokument opisuje architekturę i dowody techniczne, nie wystawia ocen wizualnych.
**Data:** 2026-09-02 · **Autor:** Fable · **Nadrzędny:** `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` (§19, §3 PRESENTATION STATE)
**Wejścia:** audyt A7 (SLD), A2 (topologia), A11 (nN) — `MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md`; kanon prezentacji nN `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` (rewizja 3.0.0) i rejestr `docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md` (R2.1, geometria ze schematu referencyjnego właściciela) — oba ZACHOWANE jako fundament; plan symboli: `SLD_SYMBOL_SYSTEM_PLAN.md`.

---

## 0. Diagnoza (skrót A7) i odpowiedź

| Klasa defektu | Dowód | Odpowiedź (sekcja) |
|---|---|---|
| Projekcja SN w 100 % w kliencie: chain-walk kabli w `enmToSldAdapter.ts` (6 585 LOC), graf terminali w `electrical/terminalGraph.ts`, drzewo w `engine/sld-layout` — 0 LOC projekcji SN w backendzie; nN ma projekcję backendową 3.0.0 | A7-01, §13 audytu | jedna warstwa projekcji semantycznej w backendzie dla SN i nN (§2, L1) |
| Dwie rodziny symboli na jednym ekranie: 33 glify SN (stan przez wypełnienie) vs 19 symboli CAD nN (stan przez geometrię noża); 6 rejestrów, 53 SVG nieużywane | A7-02, A7-05 | jeden `ElectricalCadSymbolRegistry` (model R2) dla SN+nN (§4) |
| Trzy geometrie per LOD w SN (dryf 24–224 px), nN: jedna geometria + filtr | A7-07 | jedna geometria zagnieżdżona + LOD jako filtr/kolaps (§7) |
| Polityki CAD/SCADA/ENGINEERING deklarowane w kontrakcie, nieistniejące w kodzie | A7-04 | `PresentationPolicy` jako parametr renderu (§3) |
| Brak edycji layoutu w UI; API nadpisań geometrii osierocone (0 wywołań) | A7-06 | `LayoutDocument` + overrides + gesty (§6) |
| ~54 k LOC martwego kodu SLD; silnik v2 liczony i odrzucany; CI testuje nieistniejący plik | A7-03, A7-13 | kasacja per tabela §11; bramki na realnej scenie (§10) |
| Nastawy zabezpieczeń zaszyte literałami w szufladzie; brak przejścia do TCC | A7-09 | szuflada = inspektor twin, akcje z rejestru domenowego (§9) |
| Energizacja SN liczona w kliencie (`SupplyPathHighlighter`), nN w backendzie | A2-08, A7 D9 | energizacja wyłącznie z `TopologyView` (§2) |
| Druk: tylko A3, tabliczka tylko w eksporcie, nN bez arkusza | A7-08 | `SheetDocument` wspólny (§8) |

---

## 1. Inwarianty prezentacji

| # | Inwariant | Egzekwowanie |
|---|---|---|
| P-01 | Scena semantyczna (elementy, zaciski, węzły, kontenery, kolejność, stany, energizacja, wyspy, wyniki, komunikaty audytu) powstaje w backendzie z `CanonicalNetworkSnapshot` + `TopologyView`; klient nie czyta surowego modelu do rysunku. | guard „zero BFS / zero odczytu `branches[]` w `ui/sld/**`" (rozszerzenie R4 z `lv_domain_projection_guard.py` na SN) |
| P-02 | Jedna rodzina symboli dla SN i nN; stan łączeniowy niesie geometria (kąt noża), nigdy wypełnienie ani tekst; symbol wybierany z DANYCH (klasa funkcjonalna z katalogu/typu), nigdy z domysłu. | rejestr z `verificationStatus`; test „liczba wypełnień identyczna w każdym stanie"; snapshot glifu per (symbol × stan) |
| P-03 | Jedna geometria per sieć; LOD = filtr warstw + kolaps kontenerów na tej samej geometrii; kotwica każdego elementu identyczna na wszystkich LOD. | test kotwic per element × LOD |
| P-04 | Layout ≠ topologia: edycja położenia zapisuje `LayoutDocument`, nigdy model; zmiana modelu nie kasuje zatwierdzonych pozycji poza poddrzewem zmiany. | testy stabilności (§7); komendy prezentacji osobne od komend domenowych |
| P-05 | Polityka prezentacji (CAD / SCADA / ENGINEERING) zmienia wyłącznie warstwy, paletę, etykiety i stan pokazywany — nigdy scenę ani geometrię. | odcisk sceny/layoutu niezależny od polityki |
| P-06 | Wyniki na rysunku pochodzą z `ResultSetV2` przez tożsamości twin, z provenance i świeżością; nieaktualne = widoczne jako nieaktualne. | kontrakt nakładek; brak literałów jednostek/wartości w JSX |
| P-07 | Zero fabrykacji: brak aparatu w danych = tor niekompletny z jawnym znacznikiem (`NOT_MODELED`), nigdy aparat „z konwencji". | znacznik w scenie + komunikat audytu; usunięcie ścieżki `apparatusSource='konwencja'` |
| P-08 | Determinizm: scena, layout, eksport mają hash; te same wejścia = bajt-identyczny plik. | istniejące `accept:sld-v3` i odciski bajtowe — utrzymane na nowej ścieżce |
| P-09 | Zero fizyki w prezentacji (energizacja, wyspy, impedancje, werdykty — z backendu). | `ui_no_physics_guard` + guard topologii |
| P-10 | Werdykt wizualny wystawia właściciel; kod dostarcza dowody: kadry, porównanie z rysunkiem referencyjnym, pomiary czytelności. | bramka B-02 w procesie, nie w CI |

---

## 2. Warstwy prezentacji

```
L1  PROJECTION (backend, Python)     SceneSemantics = f(snapshot, scenario, result_set?, lod_hint?)      deterministyczna, hash
L2  LAYOUT (silnik deterministyczny) SceneGeometry = layout(SceneSemantics, LayoutDocument, sheet)       stabilny, przyrostowy, z nadpisaniami
L3  SYMBOLS (rejestr)                ElectricalCadSymbolRegistry — glify, zaciski, kotwice, stany, LOD-policy, status weryfikacji
L4  RENDER (kanwa SVG)               render(SceneGeometry, PresentationPolicy, theme, overlays)
L5  INTERACTION                      hit-areas, temat menu = kotwica modelu, akcje z rejestru domenowego, selekcja wspólna z inspektorem
L6  DOCUMENT                         SheetDocument (ramka, strefy, tabliczka, legenda, rewizje, wielostronicowość) → PDF/SVG/DXF
```

### 2.1 L1 — projekcja semantyczna (backend)
Jeden kontrakt dla obu domen, dwie projekcje tej samej sieci (zachowana decyzja kanonu nN: „jedna sieć obliczeniowa, dwie projekcje prezentacyjne"):

```python
class SceneSemanticsV1(BaseModel):                 # wspólny kształt dla SnDomainProjection i LvDomainProjection (3.x)
    contract_version: str; projection_hash: str
    model_snapshot: {revision_id, scenario_revision_id, operational_state_id, snapshot_hash}
    containers: list[SceneContainer]               # stacja / poziom napięcia / pole / sekcja szyn / linia (ciąg) / rozdzielnica nN — z kluczami porządkowania
    elements: list[SceneElement]                   # asset_id, ref_id, designation, functional_class (z katalogu), symbol_hint (klasa funkcjonalna, NIE id glifu), terminals[], state, lifecycle
    nodes: list[SceneNode]                         # węzły łączności (CN) i zaciski; TN dla nakładek
    order: OrderKeys                               # kolejność stacji na ciągach, laterale (rekurencyjne), kolejność pól/odpływów z klucza domenowego (designation → ref_id)
    topology: {energization per terminal/segment, islands, supply_paths, open_points, feeders}   # z TopologyView (nigdy liczone w kliencie)
    overlays: ResultOverlay | None                 # wartości z ResultSetV2 po asset_id/terminal_id + provenance + freshness
    validation_messages: list[ValidationMessage]   # NN-AUD-* (zachowane) + SN-AUD-* (nowe) — jeden znacznik na komunikat
    not_modeled: list[NotModeledMarker]            # tor bez aparatu w danych (P-07)
```
- **SN:** `SnDomainProjectionV1` = przeniesienie do backendu logiki dziś w kliencie: kolejność stacji na ciągach (dzisiejszy `buildSldLineRunsForLayout`), laterale zagnieżdżone (dziś STOP-notatka F6a), graf terminali i 9 inwariantów napięciowych (`electrical/invariants.ts` → Python), energizacja (koniec `SupplyPathHighlighter`), stos aparatów pola wyłącznie z danych (`Bay.primary_devices`/urządzenia w polu twin).
- **nN:** `LvDomainProjectionV1` 3.x — zachowana; rozszerzenia addytywne 3.1.0: tabliczka gałęzi (typ, przekrój, długość, Iz′, `n_parallel`), `BoundaryLink.kind`, `t_a` w SWZ, pola doboru/arkusza (audyt A11-12, A11-01).
- Po migracji na twin (terminale) obie projekcje czytają `TopologyView` bezpośrednio; do tego czasu — most z ENM.

### 2.2 L2 — layout
- **Silnik SN** (`sheet layout`): pasma napięć, kolumny stacji, trasowanie ortogonalne, etykiety, łamanie arkusza — to, co dziś robi `v3/layout/*` (4 372 LOC) — ZACHOWAĆ algorytmy; wejściem staje się `SceneSemantics`, nie `EnergyNetworkModel`.
- **Silnik nN** (`board layout`): rangi pionowe + sloty — dzisiejszy `composeLvDomainScene` — ZACHOWAĆ.
- **Wspólne prymitywy:** siatka, sloty, trasowanie ortogonalne, rozmieszczanie etykiet/declutter, `sheetRows`, metryki przesunięć.
- **`LayoutDocument`** (PRESENTATION STATE, trwały, per widok/projekt): `{scene_hash_basis, overrides: [MoveDelta | Pin | ReorderField | LabelMove | SpacingOverride], approved_positions}` kluczowane `asset_id`; istniejąca domena `geometry_overrides.py` (MOVE_DELTA/REORDER_FIELD/MOVE_LABEL, hash kanoniczny) i 4 trasy `sld-overrides` — REUŻYĆ, wpiąć w klienta (A7-06).
- **Przyrostowość:** zmiana lokalna = przesunięcie tylko w poddrzewie; metryka `anchorDisplacement` jako bramka CI (istnieje pin — podnieść do progu).
- Miejsce silnika: TS (deterministyczny, testowany w Node) z możliwością uruchomienia w backendzie do eksportu wsadowego — decyzja ADR-023 (rekomendacja: TS, bo istnieje i ma wyrocznie; kontrakt wejścia/wyjścia w JSON, żeby przeniesienie było możliwe).

### 2.3 L3 — symbole
`ElectricalCadSymbolRegistry` = model R2 (`CadSymbolDef`: `domainType`, `functionalClass`, `standardReference`, `verificationStatus`, `terminals` na siatce, `anchors`, `body` z linii/łuków/okręgów/ścieżek, `states` przez geometrię, `minimumSizePx`, `lodPolicy`) rozszerzony na SN. Szczegóły i lista 40 symboli: `SLD_SYMBOL_SYSTEM_PLAN.md`. Rejestry R1 (glify SN), R4 (53 SVG), R5, R6, pakiety `reference/*.json` — do kasacji po migracji.

### 2.4 L4 — render i polityki (§3).

### 2.5 L5 — interakcja
- Trafienia dwupiętrowe (`hitAreas.ts`) i temat menu = kotwica modelu (`canvasMenuSubject.ts`) — ZACHOWAĆ.
- Rejestr akcji z typu domenowego (§74 mandatu): kabel → TRACE / CALCULATE / SIZE / REPLACE / COMPARE / FAULT / SWZ / RESULTS; TR → LOAD FLOW / SC / SIZE / TAP / COMPARE / PROTECTION; QF → DEVICE / PROTECTION / TCC / STATE; DER → punkt przyłączenia / RfG / Q(U) / SC / hosting; punkt przyłączenia → DER / RfG / PQ. Akcje wynikają z `MACIERZ_INTERAKCJI` (istnieje, guard) — uzupełnić o brakujące (TCC, punkt przyłączenia) i usunąć dead-endy.
- Szuflada elementu = `FULL ENGINEERING INSPECTOR` (mandat §73) czytający twin i wyniki — jeden komponent dla SLD i drzewa (koniec `SldDetailDrawer` z literałami).
- Selekcja wspólna: SLD ↔ drzewo ↔ inspektor ↔ wyniki (dziś częściowo przez `ui2/events`).

### 2.6 L6 — dokument (§8).

---

## 3. Polityki prezentacji (mandat §96–§99, §101)

| Aspekt | CAD | SCADA | ENGINEERING |
|---|---|---|---|
| cel | dokumentacja projektowa (rysunek do zatwierdzenia/druku) | obraz ruchowy (stan faktyczny/efektywny) | praca inżyniera (dane + wyniki + ostrzeżenia) |
| stan łączników | REST (położenie normalne projektowe, `OperationalState.normal_position`) | ACTUAL/EFFECTIVE (OPEN/CLOSED/TRIPPED/INTERMEDIATE/UNKNOWN/EARTHED) | EFFECTIVE scenariusza |
| energizacja | brak | tak (z `TopologyView`) + wyspy + konflikt | tak |
| nakładki wyników | brak | telemetria/pomiary (gdy są), alarmy, jakość danych, tryb zdalny/lokalny | wyniki z provenance i świeżością, marginesy, werdykty, znaczniki audytu |
| paleta | mono (jeden tusz), grubości wg hierarchii | kolor stanu/energizacji wg jednej tabeli (klasa napięcia + energizacja) | motyw ekranowy (dark_scada/light_technical) |
| etykiety | oznaczenia projektowe (IEC 81346), tabliczki znamionowe, numery pól | oznaczenia dyspozytorskie, stany, alarmy | oznaczenia + dane katalogowe + wyniki |
| arkusz | ramka, tabliczka, legenda, tabela rewizji, wielostronicowość | bez ramki (ekran) | ramka opcjonalna |
| eksport | PDF/SVG/DXF (domyślny druk) | PDF z legendą kolorów (bez legendy = zabronione) | jak CAD + nakładki |
| źródło stanu SCADA | — | `OperationalState` bieżący (import/wpis ręczny/przyszła telemetria); brak źródła = UNKNOWN, nigdy domysł | — |

Polityka jest parametrem `render(...)` i przełącznikiem w toolbarze; eksport CAD wymusza mono. Scena i geometria są identyczne dla wszystkich polityk (P-05).

---

## 4. Stany symboli (mandat §101)

`SwitchVisualState ∈ {REST, OPEN, CLOSED, TRIPPED, INTERMEDIATE, UNKNOWN}` + `EARTHED` (wynik zamkniętego uziemnika na węźle) + `DISCREPANCY` (znacznik rozbieżności położenie normalne ≠ bieżące) + `FAULT` (awaria napędu). Mapowanie z `OperationalState` (jeden słownik zamiast dzisiejszych 8 reprezentacji — A2-03/A1-07) w projekcji (backend), nie w kanwie. Nośnik: geometria noża (0° / −30° / −15° z kreską przerywaną) wg rejestru R2.1; TRIPPED = nóż otwarty + znacznik wyzwolenia; INTERMEDIATE = kąt pośredni ciągły; REST = położenie normalne. Wkładka i przewód nie mają stanu łączeniowego (przepalenie = zdarzenie).

---

## 5. Gramatyka pola i pełny tor prądu (mandat §104–§105)
- Pole rysuje się z łączności twin (terminal-centric): `głowica → uziemnik → odłącznik → CT → wyłącznik → szyna` tylko, gdy te urządzenia są w modelu; brak = tor niekompletny ze znacznikiem `NOT_MODELED` i komunikatem audytu (zamiast dzisiejszej konwencji per rola z `apparatusSource='konwencja'`).
- Kabel kończy się na głowicy/zacisku urządzenia (istniejące wyrocznie `allFieldEntryConnectionsReachCableHead`, `allSceneSegmentEndpointsAnchored` — ZACHOWAĆ jako testy kontraktu), nigdy w szynie.
- nN: `szyna → aparat → kabel → zacisk → odbiór/DER/podrozdzielnica` (jak dziś w 3.0.0).
- Porty rysunku = zaciski twin (`terminal_id`), nie sloty geometrii.

## 6. Produktywność CAD (mandat §106)
Gesty: przeciągnij stację/blok/pole (MoveDelta), przypnij (Pin), zmień kolejność pól/odpływów (ReorderField), przesuń etykietę (LabelMove), zmień odstęp (SpacingOverride); snap do siatki; trasowanie ortogonalne po zmianie; wskaźnik „przypięte ręcznie"; reset do auto. Zapis do `LayoutDocument` przez komendy prezentacji (nie komendy domenowe); walidacja kolizji po nałożeniu; nadpisania kluczowane `asset_id` przeżywają zmiany modelu w innych poddrzewach.

## 7. Auto-layout, gęste sieci, LOD (mandat §107–§108, §144)
- Deterministyczny, przyrostowy, skalowalny; laterale rekurencyjne (koniec STOP-notatek F6a); metryki: `anchorDisplacement` po wstawieniu/usunięciu stacji ≤ próg poza poddrzewem.
- Jedna geometria zagnieżdżona: LOD 0 = kontenery zwinięte (stacja jako blok o tej samej kotwicy), LOD 1 = pola/TR/sprzęgła/kluczowe wyniki, LOD 2 = pełna aparatura; wzorzec `REJESTR_ELEMENTOW_KANWY` z nN rozciągnięty na SN; progi LOD z hysterezą (`camera.ts`) — ZACHOWAĆ.
- Culling po indeksie prostokątów względem kadru; minimalna szerokość pola (nie „zmieść 20 pól w kadrze"); pan/zoom/fokus/wyszukiwanie; budżety: scena SN 315 szyn < 100 ms, klatka ≥ 30 fps przy 160 stacjach (pomiar w Playwright, nie jsdom).

## 8. Dokument, druk, eksport (mandat §109)
`SheetDocument` wspólny dla SN, nN i podglądu kreatora: ramka + strefy + tabliczka (PN-EN ISO 7200, dane wyłącznie realne — istniejący `sheetTitleBlock.tsx` ZACHOWAĆ) + legenda symboli + tabela rewizji rysunku (rewizja rysunku = `DocumentProvenance` powiązana z rewizją twin) + wielostronicowość (rozszerzenie `sheetRows` na strony z odsyłaczami). Formaty A4–A0; PDF/SVG/DXF (warstwy wg klasy napięcia/opisów/wyników, bloki symboli z rejestru); mono jako domyślny druk; nN dostaje arkusz i eksport (dziś brak). Deterministyczne nazwy i bajty (istniejąca reguła).

## 9. SLD jako nawigacja i ślady (mandat §110–§113)
- Klik = otwarcie inspektora twin na właściwej zakładce (design/results/SWZ/SC/protection/TCC/documents) — akcje z rejestru §2.5; brak dead-endów (TCC podłączone do `protection-coordination`; punkt przyłączenia jako obiekt umowy — architektura §17).
- TRACE SUPPLY / TRACE PROTECTION / TRACE CALCULATION jako polecenia na scenie: podświetlenie toru z `supply_paths` (backend), łańcucha ochrony z kontekstu Protection, i przejście do White Box z `trace_ref` wyniku.

## 10. Determinizm, testy, dowody wizualne
- ZACHOWAĆ: `accept:sld-v3` (~60 wyroczni geometrii), odciski bajtowe `kosztSceny.test.ts`, 18 scenariuszy nN generowanych z backendu (JSON == backend), snapshoty rejestru symboli, `sld-determinism.yml` (po naprawie kroku wskazującego nieistniejący `StationInternalView.test.tsx` — A7-13).
- NOWE: parytet sceny SN z projekcji backendu vs dzisiejszy adapter (odcisk) jako bramka migracji; test kotwic per element × LOD; test „polityka nie zmienia sceny"; harness pakietu symboli z porównaniem wektorowym do rysunku referencyjnego właściciela (R2.1 — zachować i rozszerzyć na SN).
- Werdykt: wyłącznie właściciel (B-02); rejestr werdyktów w jednym pliku (dziś rozproszone po 13 dokumentach — tabela w audycie A7 §12).

## 11. Mapowanie stanu obecnego (skrót; LOC z audytu A7)

| Element | Los |
|---|---|
| `v3/layout/*`, `v3/scene/buildScene.ts` (potok measure→bands→columns→route→label), `v3/canvas/SldCanvasV3*`, `hitAreas`, `canvasMenuSubject`, `sheetRows`, `camera`, `sheetTitleBlock`, `formats`, `export*` | KEEP (wejście = projekcja backendu zamiast ENM) |
| `application/analyses/lv_domain/*` (2 607 LOC), `lv-domain/{composeLvDomainScene,visualGrammar,symbolRegistry,projectionApi,LvDomainView}`, `cad/cadSymbolRegistry.ts` + `CadSymbol.tsx` | KEEP (wzorzec; rejestr R2 → rejestr wspólny) |
| `electrical/{terminalGraph,invariants}.ts` | przenieść do backendu (Python), zachować semantykę |
| `v2/canvas/enmToSldAdapter.ts` (6 585), `enmToCanonicalGpzAdapter.ts` (839), `core/topologyInputReader.ts` (1 128), `engine/sld-layout/**` (1 537), `v2/renderer/*` (≈12 923 render-dead), `v2/station-rozdzielnia/**` (23 735 harness/dead), `v2/canvas/{SupplyPathHighlighter, SldTitleBlock, SldLegendOverlay, …}`, `modules/sld/cdse` (1 365), `canonical_symbols/` (53 SVG), `reference/`, `sld-overlay` DEAD (908), `v3/symbols/glyphs.tsx` (R1 po migracji) | DELETE (≈54 k LOC prod) — po parytecie sceny |
| backend `application/sld/*` DEAD (1 555), `network_model/sld_projection.py`, diagram SLD w DB (`domain/sld.py`, `layout.py`, `sld_repository`, `api/sld.py`) | DELETE (0 konsumentów UI) |
| `domain/geometry_overrides.py` + `api/sld_overrides.py` | KEEP, wpiąć (`LayoutDocument`) |
| `ui2/kreatory/stacja/generatorSldPola.ts` (trzeci generator sceny) | REPLACE: podgląd w kreatorze = `composeStation` na modelu roboczym |
| dokumenty `docs/sld/*` (98) | 1 kanon prezentacji (ten dokument + `PROJEKCJA_SN_NN_PORTAL_V1.md` rozszerzony o SN) + 1 rejestr symboli + 1 kontrakt eksportu; reszta ZASTĄPIONE/archiwum (plan w `MV_DESIGN_PRO_MIGRATION_PLAN.md`) |

## 12. Kroki migracji (skrót; pełny plan w `MV_DESIGN_PRO_MIGRATION_PLAN.md`)
1. `SnDomainProjectionV1` w backendzie z parytetem odcisku sceny na fixturach (`sldSubstrate52s`, `sldNetwork53`) — bez zmiany rysunku.
2. `buildSceneV3` przyjmuje projekcję; kasacja adaptera v2, silnika L4, `SupplyPathHighlighter`, rendererów v2.
3. Rejestr wspólny: SN na `CadSymbol`; owner approval pakietu symboli (jak R2 §21/§27) PRZED migracją renderera; kasacja R1/R4/R5/R6.
4. Jedna geometria + LOD filtr w SN; testy kotwic.
5. `PresentationPolicy` + `SheetDocument` + `LayoutDocument` (overrides) + akcje bez dead-endów.
6. Kasacja potoku backendowego SLD v1 i diagramu DB; naprawa workflow CI.

## 13. Decyzje właściciela
1. Zatwierdzenie pakietu symboli wspólnego SN+nN (rozszerzenie R2.1) przed migracją renderera SN.
2. Jedna geometria zagnieżdżona (kontrakt V1, dyrektywa właściciela) vs trzy sceny per LOD (SPEC V3 §7) — rekomendacja: jedna geometria.
3. Miejsce silnika layoutu (TS z kontraktem JSON — rekomendacja) i zakres jego uruchamiania w backendzie (eksport wsadowy).
4. Kasacja ≈54 k LOC SLD legacy po parytecie (harnessy archetypów: fixtury czy kosz?).
5. Źródło stanu dla polityki SCADA: import/wpis ręczny teraz, telemetria później — bez sterowania (mandat §119).
