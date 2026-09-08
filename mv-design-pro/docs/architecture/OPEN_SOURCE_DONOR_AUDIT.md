# OPEN-SOURCE DONOR AUDIT — MV-DESIGN-PRO

> **HIERARCHIA PRAWDY PAKIETU AUDYTU (obowiązuje przy każdym konflikcie):**
> **1. KANONICZNE** — `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia) · `DONOR_DECISION_MATRIX.md`
> (decyzje) · `DONOR_ADOPTION_ARCHITECTURE.md` (architektura) · `DONOR_IMPLEMENTATION_BACKLOG.md`
> (karty). **2. DOWODY/CHECKPOINT** — `DONOR_AUDIT_CHECKPOINT.md` (pomiary F-1…F-22; zawiera
> bloki jawnie oznaczone jako WYCOFANE — czytaj znaczniki). **3. NIEWIĄŻĄCE** — `donor-raw/**`
> (surowe raporty subagentów i przegląd adwersaryjny; **nie są decyzją**, zawierają twierdzenia
> obalone przy weryfikacji).
> Konflikt rozstrzyga poziom wyższy. Cały pakiet jest **podrzędny** wobec kanonu V12.xx,
> `DECISION_FREEZE_REGISTER.md` (DT-1…DT-16) i `CANONICAL_TWIN_ARCHITECTURE.md`.


**Status:** KANONICZNY dla decyzji o transplantacjach open-source. Podrzędny wobec kanonu V12.xx,
`DECISION_FREEZE_REGISTER.md` (DT-1…DT-16) i `CANONICAL_TWIN_ARCHITECTURE.md`.
**Data:** 2026-09-07 · **Baza:** `5adc958d` (CV-4.3 K6) · **Gałąź:** `claude/mv-design-pro-donor-audit-vnuqd1`
**Decyzje:** `DONOR_DECISION_MATRIX.md` · **Architektura docelowa:** `DONOR_ADOPTION_ARCHITECTURE.md`
**Kolejność prac:** `DONOR_IMPLEMENTATION_BACKLOG.md` · **Pomiary własne:** `DONOR_AUDIT_CHECKPOINT.md`
**Materiał surowy agentów:** `donor-raw/` (NIEwiążący)

---

## 0. Co to jest i czym nie jest

To jest **technical due diligence**, nie lista życzeń. Lista donorów od właściciela była
**hipotezą wejściową**; każdą pozycję rozebrano do poziomu konkretnych plików i funkcji,
porównano ze stanem faktycznym MV-DESIGN-PRO i oceniono osobno per podsystem.

**Dwie hipotezy wejściowe upadły przy kontakcie z kodem** (§2), **jedna zmieniła znaczenie**
i **jedna kategoria donorów okazała się zablokowana licencyjnie** (§3). Audyt **nie zmienia**
kolejności konwergencji: K7 (`S''_kQmin`) pozostaje następną kartą CV-4.3 (§8).

## 1. Ustalenie bazy — czego NIE wolno było założyć

| Ustalenie | Stan faktyczny |
|---|---|
| Checkpoint `5adc958d` | Nieobecny w klonie sesji (klon płytki). Po `--unshallow` **potwierdzony**. |
| `claude/mv-design-pro-twin-audit-u4lhy0` | = **dokładnie `5adc958d`**. HEAD Fable **nie poszedł dalej**; K6 nadal ostatni. |
| Gałąź mandatu `…donor-audit-vnuqd1` | Miała **zero własnych commitów** (= `origin/main`). |
| Relacja gałęzi | `twin-audit` wyprzedza `main` o **183 commity** (CV-0 → K6, niescalone). |
| Działanie | `--ff-only` gałęzi pustej na `5adc958d`. Nic nie nadpisane, K5/K6 nietknięte. |

## 2. Dwie hipotezy właściciela, które upadły

### 2.1 „VoltWeave — kandydat najwyższego priorytetu na SLD kernel" → **NIE**
Pomiar: `src/` to **11 plików czystego JavaScriptu, 1152 linie łącznie**
(`app.js` 397, `model.js` 208, `analysis-worker.js` **6**). Zero TypeScriptu.
Warstwa SLD MV to **~183 000 linii TypeScriptu** — VoltWeave to **~0,6 %** objętości tego,
co miałby zastąpić. To nie jest kernel, tylko zwięzła demonstracja.

Co więcej, jego kod **łamie prawo MV 3.4**: `connect()` odrzuca połączenie placementów z różnych
stron („Drawn connections need two placements on the same page"), a `deleteSelection()` kasuje
**całe połączenie**, gdy zniknie placement. **Skasowanie rysunku kasuje połączenie elektryczne** —
dokładna odwrotność wymagania, że SLD ma być kasowalne bez zmiany modelu.

**Ale wartość jest realna i leży gdzie indziej:** `model.js` rozdziela
`devices` · `functions` · `pins` · `placements` · `connections`, gdzie
`connection = {from: pinId, to: pinId}` (semantyka) niesie **osobny**
`route = {pageId, fromPlacementId, toPlacementId, waypoints}` (grafika).
**Wzorzec przyjmujemy. Kodu nie.**

### 2.2 „sldeditor — donor wtórny dla UX" → **jest LEPSZYM donorem niż VoltWeave**
Pomiar: **26 332 linie TypeScriptu**, z `model/`, `compiler/`, `canvas/`, `store/`,
`element-library/`. Test decydujący (czy connectivity zależy od geometrii) — **zdany**:
- `export type WireEnd = TerminalRef | BusId | JunctionId` — **wyłącznie referencje symboliczne,
  zero współrzędnych**;
- `Wire { ends: [WireEnd, WireEnd]; path?: [number,number][] }` — „Optional manual route path.
  **Absent → auto-route**": trasa ręczna jest nakładką na połączenie, nie jego definicją;
- `compiler/union-find.ts` scala **`connections`** w klasy `ConnectivityNode` — z jawnych relacji;
- `SymbolStandard`: „Terminal coordinates, connectivity, wiring and layout are identical in both…
  Flipping the standard on a finished drawing must never move or re-route anything."

Słownictwo pokrywa się z MV (`Bus` jako hiperkrawędź ≈ DT-3 `Bus` ≡ `ConnectivityNode`).
**Jeden wyjątek do odrzucenia:** `drop-on-bus.ts` tworzy `Wire` po upuszczeniu w promieniu
`PROXIMITY_PX = 30` — cichy domysł z geometrii (prawo 3.3). Jeden odosobniony plik; warstwa UX
odcina się od niego czysto.

## 3. Bloker licencyjny — rozstrzygnięcie właściciela, nie moje

Licencje zweryfikowane **osobiście, w sklonowanych drzewach, przy podanych SHA** (nie z README):

| Donor | SHA | Licencja | Skutek |
|---|---|---|---|
| wieslawsoltes/VoltWeave | `0384b23` | MIT | kopiowanie dozwolone |
| NovaShang/sldeditor | `9e1bba0` | MIT | kopiowanie dozwolone |
| xyflow/xyflow | `0a1f957` | MIT | — |
| e2nIEE/pandapower | `fd7346f` | BSD-3-Clause | zależność OK |
| cool-japan/oxigrid | `1f46bc6` | Apache-2.0 | — |
| PowerGridModel/power-grid-model | `e50f161` | MPL-2.0 | copyleft **plikowy** |
| powsybl/powsybl-diagram | `952186b` | MPL-2.0 | copyleft **plikowy** |
| kieler/elkjs | `cc80083` | EPL-2.0 (lub GPL-3.0+) | copyleft plikowy |
| Roger-GO/TENSA | `caca7d5` | **GPL-3.0** | **kopiowanie zablokowane** |
| manuvarkey/GElectrical | `47082c7` | **GPL-3.0-or-later** | **kopiowanie zablokowane** |
| sandialabs/Protection-settings-optimizer | `44fe954` | **GPL-3.0** | **kopiowanie zablokowane** |

**MV-DESIGN-PRO nie ma własnej licencji**: brak pliku `LICENSE` w repo i brak pola `license`
w `backend/pyproject.toml` oraz `frontend/package.json` → domyślnie „wszelkie prawa zastrzeżone".

Rejestracja zobowiązania i ryzyka (**nie opinia prawna**): skopiowanie kodu GPL-3.0 do dzieła
bez deklaracji licencyjnej rozciągnęłoby na nie warunki GPL — to **zmiana sposobu dystrybucji**,
więc zgodnie z §11 mandatu **nie kopiuję** i **rejestruję blokera**.
Dozwolone bez decyzji właściciela: STUDY_ONLY, benchmark behawioralny, REWRITE_CLEAN_ROOM.
MPL-2.0/EPL-2.0 zarażają **plikowo**: użycie jako niemodyfikowanej **zależności** jest czyste,
przepisanie pliku zostawia go pod MPL/EPL z obowiązkiem udostępnienia.

**Wniosek strukturalny:** trzej donorzy o największej pozornej atrakcyjności (runtime TENSA,
wzorzec integracji GElectrical, optymalizator nastaw Sandia) są **zablokowani do kopiowania**.
Ich wartość to **wzorzec i przypadki testowe**, nie kod.

## 4. Stan faktyczny MV — czego donorzy NIE muszą dostarczać

Zmierzone, nie założone (szczegóły i liczby: `DONOR_AUDIT_CHECKPOINT.md` F-1…F-18):

- **Tożsamość i porty w ENM już są.** `Port` (15 rodzajów `PortKind`, `occupied_by`), `PortRef`,
  `ConnectionNode`, plus rewizje, dziennik zmian i pięć ortogonalnych haszy. Donor proponujący
  „persistent identity / pins / terminals" **duplikuje istniejący podsystem**.
- **Świeżość wyników jest wdrożona.** `application/result_freshness.py` porównuje
  `model_revision` **i** `snapshot_hash` z bieżącymi. Reguła „ENM się zmienił ⇒ nie FRESH"
  jest egzekwowana (ADR-018). Donor runtime tego nie wnosi.
- **SLD v3 ma żywy router ortogonalny** z omijaniem przeszkód (`v3/layout/route.ts`,
  `buildRoute` 2 konsumentów produkcyjnych). „Manhattan routing" nie jest nową zdolnością.
- **Zabezpieczenia NIE są cienkie.** Katalog `src/protection/` ma ~1,1k linii, ale **realna
  powierzchnia zabezpieczeń to ~23 800 linii w 85 plikach** + ~19 000 linii w 49 plikach testów
  (solwery, pasma krzywych nN, warstwa aplikacyjna, TCC, API z 50/51/50N/51N, przekładnia CT,
  kierunkowość). Pierwotna teza „to główna luka" była **błędna co do rozmiaru** — luki są
  węższe i konkretne (§5).
- **Most pandapower istnieje** (K3b) i jest używany jako wyrocznia.

## 5. Luki potwierdzone — i to one wyznaczają, co warto brać

| # | Luka | Dowód |
|---|---|---|
| L1 | **Brak trwałego magazynu placement/route** | Scena v3 w całości pochodna ENM (`buildScene.ts`); `application/sld/` liczy układ, nie przechowuje. Ręczne rozmieszczenie i wierzchołki tras nie przeżywają przeliczenia. |
| L2 | **Zawężona** — brak **strony** i jawnego porządku rysowania | KOREKTA po bramce §17: `Bay` **ma** `bay_number` (`models.py:969`), więc numeracja pola istnieje. Nie ma natomiast strony (góra/dół szyny) ani jawnego porządku prezentacji — te wynikają nadal z kolejności kolekcji. Luka jest **węższa**, niż zapisałem pierwotnie. |
| ~~L3~~ | **WYCOFANA — to NIE jest luka** | KOREKTA po bramce §17. Sprawdziłem tylko `topology_ops.py` i orzekłem brak. Faktycznie MV **ma** ekstrakcję: `application/analyses/lv_domain/graph_view.py` niesie `BoundaryLink` (linia 105) i `hops_from_root` (linie 135, 223) — sąsiedztwo o ograniczonej głębokości z **jawnym pierścieniem granicznym**, na kanonicznym jądrze `network_model/core/topologia.py::przeglad_wszerz_od`. Dodatkowo `NetworkGraph.podgraf` (`graph.py:638`) ma 2 konsumentów produkcyjnych. **Karta D-9 była propozycją duplikatu i zostaje odrzucona.** |
| L4 | **`ExecutionBackend` (DT-12) niewdrożony** | Zero trafień `ExecutionBackend`/`ProcessPool`/`concurrent.futures`; Celery = stub 26 linii **bez importerów**. Biegi idą synchronicznie. |
| L5 | **Zawężona** — parowanie po indeksie w JEDNYM miejscu, choć wyprowadzenie z topologii ISTNIEJE | `analyzer.py:545` paruje aparaty po indeksie listy (komentarz: zakłada uporządkowanie od odbioru do źródła) — defekt realny. KOREKTA po bramce §17: MV **ma już** wyprowadzanie aparatu chroniącego z topologii — `application/analyses/protection/czas_wylaczenia_galezi.py:195::znajdz_aparat_chroniacy` (BFS, pomija łączniki otwarte, deterministyczne, **nie zakłada sieci promieniowej**). Zadaniem nie jest więc budowa od zera, tylko **przepięcie `analyzer.py` na istniejące wyprowadzenie** i rozszerzenie go o pary główna/rezerwowa. |
| L6 | **Zawężona** — brak stempla wersji **pandapower** | KOREKTA po bramce §17: `solver_version` **istnieje** w torze kanonicznym (`canonical_analysis.py:1441, 2357, 2450`). Brakuje wyłącznie zapisu `pandapower.__version__` przy wyniku wyroczni oraz asercji rozjazdu wersji: referencje IEEE deklarują `3.4.0`, CI instaluje `3.5.4`, **nic tego nie sprawdza**. |
| L7 | **Potwierdzona — ale POLICZYŁEM JĄ ŹLE** | KOREKTA po bramce §17. Napisałem „7 z 8 eksportów, żywy `snapToGrid` (12 konsumentów)". Prawda jest **ostrzejsza**: moduł ma **19 eksportów**, a **ŻADEN plik produkcyjny go nie importuje** — jedyne odwołania to własny test i `v2/__tests__/scadaComplianceContract.test.ts:154`, który przypina **istnienie pliku po nazwie**. Moje „12 konsumentów" liczyło **wystąpienia nazwy**, nie importy modułu — i przez to **przegapiłem realne znalezisko**: `snapToGrid` istnieje w **TRZECH** niezależnych kopiach (`v2/theme/tokens.ts:342`, `v2/geometry/cadRoutingContract.ts:82`, `v3/core/grid.ts:11`), z czego żywe są dwie. |

## 6. Lekcja K6 podniesiona do kontraktu adaptera

K6 naprawił mapowanie `Z_Q` (współczynnik `c` wg IEC 60909-0:2016 §6.2.1 eq. 6). Defekt
**przeżył parytet z pandapower**, bo most karmił pandapower wielkością zrekonstruowaną
z **własnej, źle zmapowanej impedancji MV** — obie strony liczyły tę samą złą sieć i zgadzały się
co do 1e-4.

**Wniosek nienegocjowalny:** parytet solverów dowodzi **zgodności numerycznej na jednej
zmapowanej sieci** i **nie dowodzi niczego o mapowaniu**. Każdy adapter potrzebuje **dwóch**
asercji: (1) mapowania — wartość podana solverowi zewnętrznemu wyprowadzona z **zadeklarowanego
pola ENM**, nie z pośredniego wyniku MV; (2) numerycznej. Dziś asercję (1) ma **wyłącznie** test
z K6.

## 7. Sprzeczności wykryte przy weryfikacji twierdzeń agentów

Wnioski subagentów **nie były przyjmowane na słowo** (§16 mandatu). Trzy korekty:

1. **Rząd wielkości regresji SC — TU POMYLIŁEM SIĘ JA, nie agent (korekta po bramce §17).**
   Napisałem najpierw, że algebra liniowa to ~0,2 % kosztu i że przyczyna jest niezdiagnozowana.
   **Oba zdania były nieprawdziwe.** Sprofilowałem realny bieg zamiast ekstrapolować prymityw:
   306 węzłów zwarciowych, **1530 wywołań `build_zbus` = 5 na węzeł** (nie 1, jak napisałem),
   `np.linalg.inv` 1,758 s ≈ 3 %, a **przyczynę nazywa jeden `cProfile`**:
   `_niefinitowe_na_none` (`canonical_analysis.py:127`) — **8 381 870 wywołań, 15,07 s tottime**
   (~26–32 %) — oraz `_build_branch_contributions_for_inverters` (cumtime 16,54 s, ~28 %).
   Wymiar Y-bus **144×144 był poprawny**; błędna była liczba wywołań i wniosek.
   Agent SOLVERS mylił się co do mechanizmu (założył n≈1200), ale **jego struktura była bliżej
   prawdy niż moje odrzucenie**. Szczegóły: `DONOR_AUDIT_CHECKPOINT.md` F-19.
   **Decyzja się nie zmienia i jest teraz lepiej udowodniona:** dwa dominujące koszty to własna
   sanityzacja JSON-a i własne składanie wkładów falowników — **żaden zewnętrzny solver ich nie
   dotyka**.

2. **„Zabezpieczenia to główna luka" — skorygowane w moim własnym briefie** (§4): realna
   powierzchnia to ~23 800 linii, nie 1,1k. Agent PROTECTION wykrył ten błąd i go nazwał.
3. **`elkjs` — nieweryfikowalny przy tym SHA.** Algorytmy nie są w repo (`src/` to 4 pliki Java
   + 3 opakowania JS; `org.eclipse.elk.alg.layered` ciągnięte z zewnętrznego checkoutu przy
   budowie). Determinizm, ograniczenia portów i stabilność relayoutu **nieocenione** — a dla
   potoku bramkowanego determinizmem sama ta nieweryfikowalność jest podstawą do REJECT.

## 8. Relacja do CV-4.3 — audyt niczego nie wywłaszcza

- **K5 i K6 pozostają zamknięte** zgodnie z repo. Skasowane trasy legacy **nie wracają** —
  żadna adopcja tego nie wymaga.
- **K7 (`S''_kQmin`) pozostaje następną kartą.** **Żadna** transplantacja nie ma zależności
  technicznej od K7 ani K7 od niej. Nie wstawiam niczego przed K7 dlatego, że jest ciekawe.
- **Regresja czasu SC** (32 s → 170,9 s, margines 1,40× do budżetu 240 s) pozostaje **osobnym
  problemem wydajności**, do profilowania — nie do rozwiązania donorem (§7 pkt 1).
- Cała adopcja jest planowana **PO CV-4.3**, z jednym wyjątkiem oznaczonym w
  `DONOR_IMPLEMENTATION_BACKLOG.md` jako niezależny od toru zwarciowego.

## 9. Znaleziska uboczne w MV (Zero-Debt)

| # | Znalezisko | Status |
|---|---|---|
| Z1 | **Wyścig: podwójne wykonanie tego samego biegu.** `execute_run` nie miał `RUNNING` w zbiorze blokującym i sprawdzał status osobnym odczytem (TOCTOU). Dwa równoległe `POST …/execute` liczyły solver dwa razy. Okno ~171 s. | **NAPRAWIONE** w tym mandacie (atomowy `claim_for_execution`, 6 testów wątkowych; na kodzie sprzed naprawy test pokazuje „policzona 8 razy zamiast 1"). |
| Z2 | **Krzywa `RI` to w rzeczywistości Long-Time Inverse.** `protection_iec60255.py`: `RI = (120.0, 1.0)`, etykieta „Odwrotna RI (120)", LaTeX `t = TMS·120/(M−1)`. To jest IEC 60255-151 **Long-Time Inverse** — i własny `protection/curves/iec_curves.py` nazywa tę samą parę `LONG_TIME_INVERSE`. Prawdziwa RI to `t = TMS/(0,339 − 0,236/M)`. Jedna krzywa, dwie nazwy, jedna normatywnie błędna i **widoczna w dowodach**. | **BLOKER B-01** — zmiana dotyka zamrożonego rdzenia solvera i treści dowodów (golden). Karta w backlogu, decyzja właściciela. |
| Z3 | Martwy `cadRoutingContract.ts` (L7) — druga implementacja trasowania bez konsumentów. | Karta kasacyjna w backlogu. |
| Z4 | `ui/sld-editor` to sam `types.ts` (56 linii); CLAUDE.md opisuje go jako pełny moduł edycji. | Korekta opisu w backlogu. |
| Z5 | **Drugi mapper pandapower.** `application/reference_networks/pandapower_bridge.py` ma **zero konsumentów produkcyjnych** — potwierdzone przeze mnie: `grep -rn pandapower_bridge src/` poza samym plikiem zwraca **pusto**; referencje tylko z `tests/application/reference_networks/test_pandapower_bridge.py` i `test_wymagane.py`. Wstrzykuje ciche domyślne (`vkr_percent=0.5`, `pfe_kw=0.5`, `i0_percent=0.1`, `max_i_ka=1.0`, „rough conversion" `r_pu*100`, `b_pu*10`), a jego testy sprawdzają kształt, nie zgodność z solverem MV. Żywą wyrocznią jest `tests/golden/wyrocznie/pandapower.py`. | Karta kasacyjna w backlogu — procedurą siedmiu kroków (`test_wymagane.py` wymusza jego istnienie, więc kasacja musi zdjąć też to wymaganie). |
| Z6 | **Narzędzie, które kłamało o tym, co robi.** `scripts/regenerate_expected_values.py` deklarowało „uruchamia aktualny solver", a w ciele miało `# In a real implementation we would invoke the actual solver here` + `write_text(json.dumps(existing))` i meldowało „✓ Normalized JSON formatting". **Przepisywało plik, który przed chwilą wczytało.** Groźne, bo **dwa miejsca wskazywały je jako procedurę naprawczą**: `scripts/solver_output_drift_guard.py:78` przy wykrytym dryfie i `api/reference_networks.py:272`. Guard kierował do no-opa, który meldował sukces. | **NAPRAWIONE** w tym mandacie: skrypt skasowany, obie instrukcje mówią prawdę (wartości odniesienia to dane normatywne z literatury, zmieniane świadomie z diffem). Prawdziwa regeneracja z solvera pozostaje treścią karty D-2. |
| Z7 | **`line_runs` i `connection_nodes` poza `_ELEMENT_KEYS`.** To kolekcje najwyższego poziomu `EnergyNetworkModel`, ale nie ma ich w `_ELEMENT_KEYS` (`enm/hash.py:33`), więc `_kopia_pod_hash` **nie zdejmuje z nich `id`** przed haszowaniem — inaczej niż z pozostałych kolekcji elementów. Dziś deterministyczne (identyfikatory są stabilne), więc **nie jest to defekt czynny**; jest to niespójność, której **nic nie pilnuje**: element z losowym `uuid4` w którejkolwiek z tych kolekcji zacząłby zmieniać hasz migawki przy każdym zapisie. | **NAZWANE, nienaprawione świadomie.** Naprawa zmienia wejście haszy, czyli unieważnia zapisane hasze w istniejących bazach — to zmiana wymagająca migracji i przeliczenia plików golden, a nie sprzątanie przy okazji audytu. Karta do execplanu. Znalezisko z bramki §17, zweryfikowane. |
