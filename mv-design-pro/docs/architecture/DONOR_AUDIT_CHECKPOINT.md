# DONOR AUDIT — CHECKPOINT (odporność na limit kontekstu, §15 mandatu)

**Status:** ŻYWY. Aktualizowany po każdej partii donorów. Punkt wejścia dla następnej sesji.

## CP-1 — 2026-09-07, ustalenie baseline

### CURRENT HEAD
- Gałąź pracy: `claude/mv-design-pro-donor-audit-vnuqd1`
- HEAD po ustaleniu bazy: `5adc958d0fed5f783fd6c78d7e407d00354e5a54` (CV-4.3 K6)
- Working tree: czysty

### USTALENIE BAZY — CO FAKTYCZNIE ZASTAŁEM (weryfikacja, nie założenie)
1. Checkpoint właściciela `5adc958d` **NIE ISTNIAŁ** w klonie sesji — klon był płytki (`--depth`),
   a gałąź `claude/mv-design-pro-twin-audit-u4lhy0` nie była pobrana. `git cat-file` zwracał błąd.
   To NIE oznaczało utraty pracy — po `git fetch --unshallow` obiekt jest obecny.
2. `origin/claude/mv-design-pro-twin-audit-u4lhy0` = **dokładnie `5adc958d`**. HEAD gałęzi Fable
   NIE poszedł dalej. K6 jest nadal ostatnim commitem konwergencji.
3. Gałąź wyznaczona mandatem (`claude/mv-design-pro-donor-audit-vnuqd1`) była utworzona z `main`
   i miała **zero własnych commitów** (`7e84753a` = `origin/main` co do znaku).
4. `twin-audit` wyprzedza `main` o **183 commity** (CV-0 → CV-4.3 K6, niescalone),
   `main` nie wyprzedza `twin-audit` o nic; `merge-base` = `7e84753a`.
5. **Decyzja:** gałąź donor-audit przewinięta `--ff-only` na `5adc958d`. To fast-forward gałęzi
   pustej — NIC nie zostało nadpisane, cofnięte ani zresetowane. K5/K6 i wszystkie dowody
   konwergencji zachowane w całości. Bez rebase, bez force.
   Uzasadnienie: dokumenty audytu muszą powstać w drzewie zawierającym
   `docs/architecture/CONVERGENCE_ROADMAP.md`, `docs/evidence/CONVERGENCE_EVIDENCE.md`
   i `docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` — na `main` tych plików NIE MA.

### STAN KONWERGENCJI (odczytany z repo, nie z pamięci)
- Ostatnia zamknięta karta: **CV-4.3 K6** — Z_Q zasilania systemowego ze współczynnikiem c
  wg IEC 60909-0:2016 §6.2.1 eq. (6) + ślad White Box wyprowadzenia Z_Q.
- Następna znana karta: **K7 — S''_kQmin w modelu**, scenariusz MIN bez cichego S''_kQmax.
- Osobny problem wydajności: **PERF-SC-50** (czas zwarcia dla sieci ~50 stacji).
- K5 skasował trasy legacy `/api/cases/{id}/runs/{short-circuit,power-flow}` — **nie przywracać**.
- Most pandapower **JUŻ ISTNIEJE** (K3b): `application/reference_networks/pandapower_bridge.py`
  + wyrocznie `tests/golden/wyrocznie/pandapower.py`. Nie jest „nowym odkryciem".

### DONORS REVIEWED
Partia 1 uruchomiona równolegle (agenci ECAD / PROJECTION / SOLVERS / PROTECTION / RUNTIME).
Wyniki i dokładne SHA — patrz `OPEN_SOURCE_DONOR_AUDIT.md` po domknięciu partii.

### NEXT EXACT STEP
Odbiór raportów partii 1 → niezależna weryfikacja dowodów (nie przyjmować wniosków subagenta
bez sprawdzenia) → macierz decyzji → przegląd adwersaryjny → artefakty w repo.

## CP-2 — 2026-09-07, niezależny pomiar strony MV (przed odbiorem raportów donorów)

Wykonany OSOBIŚCIE (nie przez subagenta), żeby móc weryfikować twierdzenia donorów, a nie
przyjmować je na słowo.

### F-1. Regresja czasu zwarcia — liczby z repo (korekta etykiety właściciela)
Etykieta „PERF-SC-50" **nie występuje w repo** — to nazwa robocza właściciela. Dług jest
zapisany w `docs/evidence/CONVERGENCE_EVIDENCE.md` bez tego identyfikatora, z pomiarem:
- `POST /api/execution/runs/{id}/execute`, bieg SC sieci 50 stacji: **170 866,7 ms**
- kalibracja 2026-07-29: **~32 s** → regresja **~5,3×**
- budżet 240 000 ms, margines **1,40×** (wobec ~7× przy kalibracji)
- próg NIE podniesiony (Zero-Debt); przyczyna **niezdiagnozowana**, wymaga osobnego profilowania
- wykluczono: kontencję CPU (cichy host, load < 3,0) oraz różnicę BLAS/OpenBLAS (0.3.23 identyczny)
Wniosek dla audytu: to problem **wydajności solvera/assemblera**, nie responsywności procesu.
Izolacja workera go NIE naprawi (§9 mandatu) — donor runtime nie może być sprzedany jako lek na to.

### F-2. SLD v3 ma ŻYWY router ortogonalny — to NIE jest luka
`frontend/src/ui/sld/v3/layout/route.ts` jest wpięty w produkt (pomiar konsumentów poza testami):
`buildRoute` = 2, `routeOrthogonal` = 1, `endsAtPorts` = 2, `classifyRouteNodes` = 2,
`routeAvoidsObstacles` = 1. Zawiera `RoutePort`, `RouteVertex`, `RouteNode`, omijanie przeszkód,
kontrolę siatki. Donor oferujący „Manhattan routing + obstacle avoidance" **nie wnosi nowej
zdolności** — musiałby udowodnić przewagę nad tym, co działa.

### F-3. DŁUG WYKRYTY UBOCZNIE — druga, martwa implementacja trasowania (v2)
`frontend/src/ui/sld/v2/geometry/cadRoutingContract.ts` to **kontrakt z testami bez ścieżki
produktowej**. Pomiar konsumentów produkcyjnych (z wyłączeniem samego pliku i `__tests__`):

| Eksport | Konsumenci produkcyjni |
|---|---|
| `buildOrthogonalRoute` | 0 |
| `PositionedSymbol` | 0 |
| `isOrthogonalRoute` | 0 |
| `manhattanLength` | 0 |
| `getAbsolutePortPosition` | 0 |
| `CAD_LAYER_COLOR` | 0 |
| `findNearestPort` | 0 (tylko test) |
| `RouteLockState` | 0 |
| `snapToGrid` | 12 (jedyny żywy) |

To jest dokładnie wzorzec zakazany przez ZASADĘ NR 1 („funkcja istniejąca tylko w testach,
niewpięta w ścieżkę użytkownika, to dług") oraz ZASADĘ NR 3 („dwie ścieżki tej samej fizyki →
naprawione od razu"), z precedensem kasacji `getMvNeutralGrounding` (commit `f8b93d6c`,
„test bez produktu to dług"). **Dwa niezależne routery ortogonalne w jednym froncie.**
`findNearestPort` + `PORT_SNAP_THRESHOLD_PX` to dodatkowo geometryczne kojarzenie portów —
gdyby zostało kiedyś wpięte do tworzenia połączeń, złamałoby prawo 3.3 (geometria nie tworzy
connectivity). Dziś nie jest wpięte, więc prawo nie jest złamane — ale kontrakt zaprasza do
złamania. Karta naprawcza: patrz `DONOR_IMPLEMENTATION_BACKLOG.md`.

### F-4. `ui/sld-editor` NIE ISTNIEJE jako moduł
Zawiera wyłącznie `types.ts` (56 linii) z jawnym komentarzem: „Pełny moduł `sld-editor`
(komponenty, runtime) jest poza tym worktree". CLAUDE.md opisuje go jako „Edycja SLD (geometria
CAD, przeciąganie, trasowanie)" — **opis nie odpowiada stanowi repo**.

### F-5. Trwałe placement/route — LUKA POTWIERDZONA
Brak w backendzie magazynu placement/route dla SLD. `application/sld/` zawiera `layout.py`,
`internal_layout.py`, `station_geometry.py` — czyli **wyliczanie** układu, nie jego trwałe
przechowywanie. Scena v3 jest w całości pochodną ENM (`v3/scene/buildScene.ts`).
Konsekwencja: ręczne rozmieszczenie i ręczne wierzchołki trasy **nie są trwałymi danymi
domenowymi** i nie przeżywają przeliczenia. To jest realna luka, na którą donor ECAD może
odpowiadać — i jedyna z obszaru SLD, której MV faktycznie nie ma.

### F-6. ENM ma już tożsamość portu i węzeł przyłączenia
`Port` (15 rodzajów `PortKind`, `occupied_by`), `PortRef` (adres niemutowalny), `ConnectionNode`
(`bay|bus|der_terminal|branch_point`) — plus rewizje, dziennik zmian, hasze
(`compute_semantic_hash`, `compute_input_hash`, `compute_switching_snapshot_hash`,
`compute_enm_hash`). Donor proponujący „persistent identity / ports / terminals" jako nowość
**duplikuje istniejący podsystem**.

### F-7. Świeżość wyników JEST wdrożona — donor runtime tego nie wnosi
`backend/src/application/result_freshness.py:292` porównuje `envelope.model_revision` z rewizją
bieżącą ORAZ `envelope.snapshot_hash` z haszem bieżącym. Konsumenci m.in.
`analyses/werdykt_projektowy.py:702`, `wytrzymalosc_cieplna_przewodow.py:460`,
`nn_circuit_sheet.py:861-864` (`aktualny = bieg.snapshot_hash == model_hash`).
Reguła „wynik po zmianie ENM nie może być prezentowany jako FRESH" (§9 mandatu) jest już
egzekwowana — ADR-018 wdrożony. Donor proponujący to jako nowość **duplikuje istniejący podsystem**.

### F-8. Celery NIE JEST wpięty — biegi są synchroniczne
`backend/src/api/celery_app.py` ma **26 linii** i **zero importerów** w `src/`
(`grep -rn celery_app src/ --include=*.py` poza samym plikiem: pusto).
Stos deklaruje „Task Queue: Celery" — faktycznie kolejka zadań nie obsługuje biegów analiz.
Wykonanie idzie synchronicznie przez `POST /api/execution/runs/{id}/execute`.
To jest realna luka runtime — ALE jej wagę wyznacza F-1: bieg SC 50 stacji trwa 171 s
synchronicznie. Worker poprawi responsywność, anulowanie i izolację awarii; **nie skróci
tych 171 s**. Obie rzeczy trzeba trzymać rozdzielnie (§9 mandatu).

### F-9. Z-bus jest przeliczany OD NOWA dla KAŻDEGO węzła zwarciowego (potwierdzone z kodu)
`network_model/solvers/short_circuit_core.py:78` — `compute_equivalent_impedance()` woła
`build_zbus(graph)` przy **każdym wywołaniu**, a `build_zbus` (linia 46-55) robi
`AdmittanceMatrixBuilder(graph).build()` + `np.linalg.inv(y_bus)`. Dla skanu N węzłów
zwarciowych daje to N pełnych budów Y-bus i N pełnych inwersji gęstych.
Dodatkowe wywołania `build_zbus`: `short_circuit_iec60909.py:644`, `:785`,
`machine_sc_iec60909.py:184`. **Zero `scipy.sparse`** w całym katalogu solverów.

### F-10. KOREKTA: gęsta algebra NIE jest dominującym kosztem (pomiar, nie domysł)
`docs/evidence/PERFORMANCE_BASELINE.md` przypisuje wolne zwarcia G00 „gęstej algebrze".
**Pomiar tego nie potwierdza.** Zmierzony izolowany prymityw (numpy, ta maszyna):

| Operacja | Czas | ×315 wywołań |
|---|---|---|
| `np.linalg.inv(315×315)` complex | 4,31 ms | **1,4 s** |
| `np.linalg.inv(630×630)` complex | 23,14 ms | 7,3 s |

G00 ma 315 szyn / 260 gałęzi. Budowa Y-bus jest liniowa względem gałęzi i węzłów
(`core/ybus.py`: union-find + jedna pętla po gałęziach), więc `build_zbus` ≈ jednostki ms.
Nawet powtórzone dla każdego węzła daje to **rząd 1-2 s, nie 171 s**.

**Wniosek:** dominujący koszt biegu SC 50 stacji **leży poza rdzeniem algebry liniowej** —
kandydaci do profilowania: składanie migawki/assembler, walidacja, rozwiązywanie katalogu,
budowa śladu White Box per węzeł zwarciowy, warstwa API/persystencji. Nie zdiagnozowane.
**Zastrzeżenie uczciwości:** zmierzyłem wyłącznie wyizolowany prymityw, NIE pełną ścieżkę
`POST /api/execution/runs/{id}/execute` (brak zainstalowanego środowiska backendu w tej sesji).
To wyklucza jedną hipotezę, nie wskazuje sprawcy.

**Konsekwencja dla audytu donorów (kluczowa):** argument „przyjmijmy Power Grid Model /
inny solver, bo jest szybszy" **nie ma pokrycia w pomiarze** — wąskie gardło nie jest
udowodnione jako matematyka solvera. Wymiana solvera na szybszy nie naprawi kosztu leżącego
w assemblerze/śladzie/API. Najpierw profil, potem ewentualnie donor.
Powtórzenie `build_zbus` per węzeł (F-9) zostaje realnym, tanim usprawnieniem — ale rdzeń
jest FROZEN (B-01, patrz `enm/assembler.py:496`), więc wymaga zgody właściciela.

### F-11. DT-12 to decyzja ZAMROŻONA i NIEWDROŻONA — donor runtime trafia w istniejącą lukę
`DECISION_FREEZE_REGISTER.md` DT-12: „`ExecutionBackend` (**pula procesów teraz**, kolejka
później); jeden rejestr biegów", uzasadnienie: „N-1/optymalizacja/QSTS: wsady równoległe;
dynamika: długie biegi jako zadania z postępem; skala L: backend kolejkowy bez zmiany
orkiestratora".
Pomiar: `grep -rn "ExecutionBackend\|ProcessPool\|concurrent.futures" src/ --include=*.py`
→ **zero trafień**. Razem z F-8 (Celery = stub bez importerów) znaczy to, że biegi analiz
wykonują się **synchronicznie w procesie API**, wbrew własnej zamrożonej decyzji.
**Konsekwencja:** architektura worker/job NIE jest nową decyzją architektoniczną do podjęcia —
jest realizacją DT-12. Donor runtime nie wymaga zatem zgody właściciela na kierunek, tylko
dowodu, że wzorzec jest lepszy niż napisanie tego wprost.

### F-12. DT-14 ogranicza donorów ECAD twardo
DT-14: „SLD = projekcja twin; **backend semantyka, frontend geometria**; IEC 60617; IEC 81346
przez profil". Donor, który trzyma semantykę elektryczną we froncie (model połączeń w warstwie
React/Canvas), łamie DT-14 niezależnie od jakości kodu. To jest kryterium odrzucenia
rozstrzygane PRZED oceną ergonomii.
Pozostałe wiążące: DT-9 (rdzenie solverów FROZEN + bramka B-01), DT-10 (`ResultSetV1` FROZEN,
zmiana = `ResultSetV2`), DT-8 (jeden assembler, jedna implementacja `TopologyService`),
DT-1 (brak nowej klasy modelu obok ENM).

### F-13. LICENCJE ZWERYFIKOWANE OSOBIŚCIE przy dokładnych SHA (§11 — zero zgadywania)
Sprawdzone przeze mnie bezpośrednio w sklonowanych drzewach, nie przez subagenta,
nie z README, nie z opisu właściciela:

| Donor | SHA zweryfikowany | Licencja |
|---|---|---|
| wieslawsoltes/VoltWeave | `0384b23` | **MIT** |
| NovaShang/sldeditor | `9e1bba0` | **MIT** |
| xyflow/xyflow | `0a1f957` | **MIT** |
| e2nIEE/pandapower | `fd7346f` | **BSD-3-Clause** |
| cool-japan/oxigrid | `1f46bc6` | **Apache-2.0** |
| PowerGridModel/power-grid-model | `e50f161` | **MPL-2.0** |
| powsybl/powsybl-diagram | `952186b` | **MPL-2.0** |
| kieler/elkjs | `cc80083` | **EPL-2.0** |
| Roger-GO/TENSA | `caca7d5` | **GPL-3.0** |
| manuvarkey/GElectrical | `47082c7` | **GPL-3.0** |
| sandialabs/Protection-settings-optimizer | `44fe954` | **GPL-3.0** |

### F-14. BLOKER LICENCYJNY — MV-DESIGN-PRO nie ma własnej licencji
Pomiar: brak pliku `LICENSE` w `/home/user/MV-Design-PRO` i w `mv-design-pro/`; brak pola
`license` w `backend/pyproject.toml` i w `frontend/package.json`.
Brak deklaracji = domyślnie „wszelkie prawa zastrzeżone" (własnościowe).

Konsekwencje, które z tego wynikają (rejestracja zobowiązania i ryzyka — **nie opinia prawna**):
- **GPL-3.0** (TENSA, GElectrical, Sandia PSO): skopiowanie kodu do dzieła bez licencji
  rozciągnęłoby na nie warunki GPL-3.0. Dla projektu bez deklaracji licencyjnej to
  **zmiana sposobu dystrybucji** → zgodnie z §11 mandatu **NIE kopiuję kodu z tych trzech
  donorów** i rejestruję blokera. Dozwolone bez decyzji właściciela: STUDY_ONLY, benchmark
  behawioralny, REWRITE_CLEAN_ROOM z normy/dokumentacji.
  **To jest jedna z niewielu rzeczy w tym audycie wymagających decyzji WŁAŚCICIELA, nie mojej.**
- **MPL-2.0 / EPL-2.0** (power-grid-model, powsybl-diagram, elkjs): copyleft plikowy.
  Użycie jako **niemodyfikowanej zależności** nie zaraża własnego kodu; skopiowanie
  pojedynczych plików źródłowych zostawia je pod MPL/EPL z obowiązkiem udostępnienia.
  → INTEGRATE realne, COPY ograniczone i wymagające świadomej ewidencji plików.
- **MIT / BSD-3** (VoltWeave, sldeditor, xyflow, pandapower): permisywne, COPY/PORT wykonalne
  przy zachowaniu noty o prawach autorskich i tekstu licencji (NOTICE).

**Wniosek strukturalny audytu:** trzej donorzy o największej pozornej atrakcyjności
funkcjonalnej (runtime TENSA, wzorzec integracji GElectrical, optymalizator nastaw Sandia)
są **zablokowani licencyjnie do kopiowania**. Ich wartość dla MV-DESIGN-PRO jest wartością
**wzorca i zestawu przypadków testowych**, nie kodu. Odwrotnie: donor o najwyższym priorytecie
(VoltWeave) jest MIT, czyli licencyjnie otwarty — o jego losie decyduje wyłącznie technika.

### F-15. VoltWeave — pomiar obala hipotezę „kandydat na nasz SLD kernel" (weryfikacja własna)
**Skala (zmierzona, `wc -l`):** `src/` to **11 plików czystego JavaScriptu, łącznie 1152 linie**.
Zero TypeScriptu. Największy plik `app.js` = 397 linii; `model.js` = 208; `routing.js` = 70;
`renderer.js` = 99; `scene.js` = 80; `persistence.js` = 25; `reports.js` = 23;
`analysis-worker.js` = **6 linii**.
Porównanie: warstwa SLD MV-DESIGN-PRO to ~183 000 linii TypeScriptu.
**VoltWeave to ~0,6 % objętości tego, co miałby zastąpić.** Nie jest „kernelem" ani frameworkiem —
jest zwięzłą, jednoosobową demonstracją. Hipoteza wejściowa właściciela („kandydat najwyższego
priorytetu na Semantic ECAD / SLD kernel") **nie broni się przy kontakcie z kodem**.

**ALE — model pojęciowy jest dokładnie tym, czego szukamy, i to jest prawdziwa wartość donora.**
`model.js` rozdziela kolekcje: `devices` · `functions` · `pins` · `placements` · `connections`.
- `device` = tożsamość urządzenia (tag, part, manufacturer) — trwała, niezależna;
  `rebindDevice()` przepina funkcję na inne urządzenie bez ruszania rysunku
- `function` = funkcja elektryczna wskazująca `deviceId` (wiele funkcji ↔ jedno urządzenie)
- `pin` = tożsamość zacisku, należy do funkcji
- `placement` = graficzne wystąpienie funkcji na stronie (`x`, `y`, `rotation`)
- `connection` = **`{from: pinId, to: pinId}`** — semantyka na zaciskach — z ZAGNIEŻDŻONYM,
  osobnym `route: {pageId, fromPlacementId, toPlacementId, waypoints}`
To jest dosłownie rozdzielenie wymagane przez prawo 3.2: **końce połączenia to piny (semantyka),
trasa to osobna struktura wskazująca placementy (grafika)**. Potwierdzone z kodu, nie z README.

**Wada dyskwalifikująca kod (dwa miejsca, oba w `model.js`):**
1. `connect()` odrzuca połączenie, gdy placementy są na różnych stronach:
   „Drawn connections need two placements on the same page". Akt **semantyczny** jest
   bramkowany warunkiem **graficznym**.
2. `deleteSelection()` kasuje `connection`, gdy zniknie placement:
   „A route cannot refer to a deleted representation" — usuwa CAŁE połączenie, nie samą trasę.
   Czyli **skasowanie rysunku kasuje połączenie elektryczne** — wprost przeciwnie do prawa 3.4
   (SLD ma być kasowalne i przeliczalne bez zmiany modelu kanonicznego).

**Werdykt wyprowadzony:** przyjmujemy **wzorzec dekompozycji**, odrzucamy **kod i jego
sprzężenia**. Ponieważ ENM ma już `Port`/`PortRef`/`ConnectionNode` (F-6), brakującym ogniwem
jest wyłącznie warstwa `placement` + `route` z trwałością (F-5) — czyli dokładnie ta część,
którą VoltWeave modeluje. Kierunek: `REWRITE_CLEAN_ROOM` inspirowany wzorcem (mimo licencji MIT
pozwalającej na kopiowanie — kopiowanie 1152 linii JS do 183 000 linii TS byłoby regresją).

### F-16. ROZSTRZYGNIĘCIE ARCHITEKTONICZNE — placement/route NIE MOŻE trafić do ENM
Wyprowadzone z kodu haszowania, nie z preferencji.

`enm/hash.py` ma dwie różne reguły:
- `_semantic_payload()` (linia 157) to **biała lista** — jawna projekcja 9 kolekcji przez
  `_SEMANTIC_INCLUDE_*`. Nowa kolekcja NIE weszłaby do `semantic_hash`. ✔
- `_input_payload()` (linia 179) i `hash_migawki_enm()` (linia 282) to **pełny zrzut modelu**.
  `_kopia_pod_hash()` przepisuje **WSZYSTKIE** klucze migawki, usuwając jedynie zmienne pola
  nagłówka i `id` elementów. Każda nowa kolekcja najwyższego poziomu w `EnergyNetworkModel`
  **wchodzi do hasza migawki**. ✘

`snapshot_hash` biegu jest właśnie tym haszem, a `application/result_freshness.py:292`
porównuje go z bieżącym, żeby oznaczyć wyniki jako nieaktualne.

**Wniosek nieunikniony:** gdyby `placements` / `routes` dodać jako kolekcje ENM,
**przesunięcie symbolu na schemacie unieważniłoby wszystkie wyniki obliczeń** — bo zmieniłoby
`snapshot_hash`. To jest dokładnie to, czego zakazuje prawo 3.2 i 3.4. Wariant „dodajmy
addytywnie do ENM, przecież pola opcjonalne nie psują payloadów" jest **technicznie błędny**
i zostaje odrzucony na podstawie pomiaru.

**Poprawna docelowa architektura (i zgodna z już zamrożonym DT-14 „backend semantyka,
frontend geometria" oraz ADR-023 polityk prezentacji):**
trwała warstwa prezentacji jako **osobny agregat**, poza `EnergyNetworkModel`, kluczowany
przez `ref_id` elementów ENM i identyfikatory portów:

```
ENM (kanoniczna prawda elektryczna)         SLD Presentation Store (osobny agregat)
  Port / PortRef / ConnectionNode    <——ref_id——   Placement {element_ref, x, y, rotation, sheet}
  Bus / Branch / Bay / Substation                  Route     {connection_ref, waypoints[], locked}
  → wchodzi do snapshot_hash                       → NIE wchodzi do snapshot_hash
  → zmiana unieważnia wyniki                       → zmiana NIE unieważnia wyników
```
Zerwane referencje (`ref_id` bez odpowiednika po zmianie modelu) są **odrzucane przy odczycie**,
a scena spada do układu wyliczonego (`buildScene`) — nigdy odwrotnie. To realizuje prawo 3.4:
warstwę prezentacji można skasować w całości bez dotknięcia modelu.
Nie tworzy to „drugiego źródła prawdy" (DT-1), bo agregat nie przechowuje żadnej informacji
elektrycznej — wyłącznie współrzędne i wierzchołki tras.

### F-17. sldeditor przechodzi test geometrii — i wypada LEPIEJ niż VoltWeave (weryfikacja własna)
Mandat kazał sprawdzić, czy connectivity donora jest geometry-dependent, i odrzucić tę część,
jeśli jest. **Sprawdziłem w kodzie — nie jest.**

Skala: `src/` = **26 332 linie TypeScriptu** (82 pliki `.ts`, 39 `.tsx`) + biblioteka elementów
w JSON. Katalogi: `model/`, `compiler/`, `canvas/`, `store/`, `element-library/`, `hooks/`, `i18n/`.
To jest ~23× więcej kodu niż VoltWeave i **we właściwym języku** (front MV = TypeScript strict).

**Dowód rozdzielenia semantyki od geometrii (`src/model/types.ts`):**
- `export type WireEnd = TerminalRef | BusId | JunctionId;` — końce przewodu to **wyłącznie
  referencje symboliczne, ZERO współrzędnych**.
- `interface Wire { ends: [WireEnd, WireEnd]; path?: [number,number][] }` — komentarz autora:
  „Optional manual route path. **Absent → auto-route**". Trasa ręczna jest opcjonalną nakładką
  na połączenie semantyczne, nie jego definicją. Dokładnie model, którego MV potrzebuje (F-5).
- `interface Placement { at, rot?, mirror? }` — rozmieszczenie jako osobny byt.
- `label` i `color` opisane wprost jako „Pure decoration — has no effect on routing or
  connectivity" oraz „routing and connectivity ignore it".
- `compiler/union-find.ts`: scala **`connections`** w klasy równoważności **`ConnectivityNode`** —
  czyli z jawnych relacji, nie z przecięć linii ani bliskości XY.
- `SymbolStandard = 'iec' | 'ansi'`: „Terminal coordinates, connectivity, wiring and layout are
  identical in both, by construction… Flipping the standard on a finished drawing must never
  move or re-route anything."

**To jest to samo prawo, które MV ma w konstytucji (3.2, 3.3, 3.4) — donor egzekwuje je w kodzie.**
Dodatkowo słownictwo jest zbieżne z MV: `Bus` jako hiperkrawędź („Each bus is a hyperedge node,
not an element") odpowiada DT-3 (`Bus` ≡ `ConnectivityNode`).

**Korekta hipotezy wejściowej właściciela.** Mandat stawiał VoltWeave jako „kandydata najwyższego
priorytetu", a sldeditor jako donora wtórnego dla UX. Pomiar odwraca tę kolejność:
VoltWeave (1152 linie JS, sprzężenie kasowania rysunku z kasowaniem połączenia — F-15) jest
SŁABSZYM donorem niż sldeditor (26 332 linie TS, jawne connectivity, MIT, rozdzielone
placement/route, eksport DXF). Dla wzorca `connection ≠ route` **sldeditor jest lepszym
źródłem odniesienia**, a jego licencja (MIT, SHA `9e1bba0`) nie stawia przeszkód.

## CP-3 — 2026-09-07, weryfikacja twierdzeń subagentów (nie przyjmuję ich na słowo, §16)

### F-18. POMIAR ROZSTRZYGAJĄCY — macierz Y-bus sieci 52 stacji ma 144×144, nie ~1200
Agent SOLVERS wyprowadził dla powtarzanego `build_zbus` złożoność O(N⁴) i oszacował
n=1200 → 164,5 ms × 1200 = **197,4 s**, uznając to za wyjaśnienie zmierzonych 170,9 s.
**Sprawdziłem to bezpośrednio na substracie `sld_substrate_52s` i twierdzenie się nie broni.**

Pomiar (`map_enm_to_network_graph` → `AdmittanceMatrixBuilder`, ta maszyna):

| Wielkość | Wartość |
|---|---|
| Stacje / szyny ENM / gałęzie ENM | 53 / **315** / 261 |
| Węzły grafu / gałęzie / **łączniki** | 315 / 143 / **172** |
| **Wymiar Y-bus** | **144 × 144** |
| `AdmittanceMatrixBuilder.build()` | **1,0 ms** |
| `np.linalg.inv` | **2,3 ms** |
| `build_zbus` (build + inv) razem | **2,5 ms** |
| `build_zbus` × 144 węzłów zwarciowych | **0,4 s** |

Powód rozbieżności: **łączniki scalają węzły**. 172 łączniki redukują 315 węzłów grafu do
144 klas równoważności (union-find w `core/ybus.py::_build_merged_node_map`). Macierz jest
budowana na klasach, nie na szynach ENM. Oszacowanie n≈1200 nie ma oparcia w tej sieci.

**Wniosek — F-10 zostaje w mocy i jest teraz zmierzony bezpośrednio, nie ekstrapolowany:**
cała algebra liniowa zwarć na tej sieci to **rząd 0,4 s wobec zmierzonych 170,9 s (~0,2 %)**.
Powtarzane `build_zbus` per węzeł (F-9) jest realnym marnotrawstwem i rośnie kwadratowo,
więc warto je usunąć — ale **nie jest przyczyną** regresji wydajności. Przyczyna pozostaje
niezdiagnozowana i wymaga profilu pełnej ścieżki `execute`, dokładnie jak zapisano w
`CONVERGENCE_EVIDENCE.md`. Żaden donor solverowy tego nie naprawia.

**Korekta w drugą stronę (uczciwość §21):** agent SOLVERS ma rację co do STRUKTURY defektu
(`compute_equivalent_impedance` przelicza Z-bus od zera przy każdym wywołaniu, a `z0_bus`/
`z2_bus` są już podnoszone przez wołającego — pominięto tylko `z1`). Myli się co do RZĘDU
WIELKOŚCI, bo przyjął wymiar macierzy bez pomiaru. Struktura: potwierdzona. Magnituda: obalona.
