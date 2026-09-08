# DONOR IMPLEMENTATION BACKLOG — MV-DESIGN-PRO

> **HIERARCHIA PRAWDY PAKIETU AUDYTU (obowiązuje przy każdym konflikcie):**
> **1. KANONICZNE** — `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia) · `DONOR_DECISION_MATRIX.md`
> (decyzje) · `DONOR_ADOPTION_ARCHITECTURE.md` (architektura) · `DONOR_IMPLEMENTATION_BACKLOG.md`
> (karty). **2. DOWODY/CHECKPOINT** — `DONOR_AUDIT_CHECKPOINT.md` (pomiary F-1…F-22; zawiera
> bloki jawnie oznaczone jako WYCOFANE — czytaj znaczniki). **3. NIEWIĄŻĄCE** — `donor-raw/**`
> (surowe raporty subagentów i przegląd adwersaryjny; **nie są decyzją**, zawierają twierdzenia
> obalone przy weryfikacji).
> Konflikt rozstrzyga poziom wyższy. Cały pakiet jest **podrzędny** wobec kanonu V12.xx,
> `DECISION_FREEZE_REGISTER.md` (DT-1…DT-16) i `CANONICAL_TWIN_ARCHITECTURE.md`.


**Data:** 2026-09-07 · **Baza:** `5adc958d` (CV-4.3 K6)
**Decyzje:** `DONOR_DECISION_MATRIX.md` · **Architektura:** `DONOR_ADOPTION_ARCHITECTURE.md`

**Zasada wykonania (§20 mandatu):** jeden podsystem → jeden jawny kontrakt → skupione wdrożenie
→ skupione testy → pełna regresja → dowód → commit. **Bez masowej transplantacji.**
Każdy commit adopcyjny musi nazwać: donora, przejrzany SHA donora, co dokładnie wykorzystano,
dlaczego, jaka licencja ma zastosowanie i które niezmienniki zachowano.

---

## 0. Ochrona przed eksplozją zakresu (§12 mandatu)

Przejrzano 11 donorów i **~50 podsystemów**. Adoptujemy **trzy**. To jest celowe.

### TOP 3 — ADOPTUJEMY

| # | Co | Klasa | Dlaczego TERAZ | Luka |
|---|---|---|---|---|
| **1** | **Trwały magazyn rozmieszczenia i tras (SLD Presentation Store)** | REWRITE_CLEAN_ROOM (wzorzec: sldeditor `9e1bba0` + VoltWeave `0384b23` + PowSyBl `952186b`) | Jedyna luka SLD, której MV faktycznie nie ma. Dziś ręczne rozmieszczenie i wierzchołki tras **nie przeżywają przeliczenia** — projektant traci pracę. Trzej niezależni donorzy rozwiązali to **tym samym** wzorcem, co jest mocną przesłanką. | L1 |
| **2** | **Proweniencja i asercja mapowania w wyroczni pandapower** | HARDEN (pandapower `fd7346f`, BSD-3) | **Lekcja K6, nie nowa funkcja.** Błąd `Z_Q` przeżył parytet, bo obie strony liczyły tę samą złą sieć. Dopóki adapter nie publikuje wersji i nie ma asercji mapowania, każdy zielony parytet jest **słabszym dowodem, niż wygląda**. Najtańsza karta o największym wpływie na wiarygodność. | L6 |
| **3** | **Wyprowadzenie par zabezpieczeń z topologii** | REWRITE_CLEAN_ROOM (wzorzec: Sandia `44fe954`, GPL → tylko clean-room) | `analyzer.py:545` paruje aparaty **po indeksie listy** („assuming ordered downstream to upstream"). Koordynacja stoi na założeniu, którego nikt nie sprawdza; przy pierścieniu SN lub DER jest po prostu nieprawdziwe. | L5 |

### TOP 3 — ODRZUCAMY / ODKŁADAMY ŚWIADOMIE

| # | Co | Decyzja | Dlaczego |
|---|---|---|---|
| **1** | **Power Grid Model jako drugi solver** | REJECT / P2 z warunkiem | Nieinstalowalny (Python ≥3.12, numpy ≥2.0 wobec 3.11.15 / 1.26.4 zamkniętego dla haszy golden). Jako wyrocznia różni się **systematycznie** (`c_max` nN 1,10 vs 1,05; ±3 % z napięcia źródła; wymaga sieci uziemionej). Argument wydajnościowy **obalony profilem**: dominują `_niefinitowe_na_none` (~26–32 %) i składanie wkładów falowników (~28 %) — **własny kod MV**; sama algebra to ~3 %. Warunek wznowienia: MV na Pythonie ≥3.12 **i** numpy ≥2.0. |
| **2** | **VoltWeave jako „SLD kernel"** | REJECT (kod) | 1152 linie JavaScriptu wobec ~183 000 linii TypeScriptu warstwy SLD MV. Jego `deleteSelection()` kasuje **połączenie elektryczne** przy usunięciu rysunku — odwrotność prawa 3.4. Bierzemy **wzorzec** (poz. 1 wyżej), nie kod. |
| **3** | **Migracja biegów na workery procesowe (TENSA)** | STUDY_ONLY / P2 | Nie naprawia odczuwanego problemu (171 s to CPU solvera, nie blokada pętli — pętla **nie jest** blokowana). Wysoki promień rażenia: `enm/store.py` chroni zapis `threading.RLock`, który **między procesami nie działa**; ADR-028 zostawia Postgres jako PROPOSED. GPL-3.0 blokuje kopiowanie. Odczuwany objaw naprawia **anulowanie** (D-4, P1). |

## 1. Relacja do CV-4.3 — kiedy to robimy

| Karta | Kiedy | Uzasadnienie |
|---|---|---|
| **K7 (`S''_kQmin`)** | **NAJPIERW, bez zmian** | Żadna karta donorowa nie ma zależności technicznej od K7 ani K7 od nich. Nie wstawiam niczego przed K7 dlatego, że jest ciekawe (§13 mandatu). |
| D-2 (proweniencja wyroczni) | **RÓWNOLEGLE do K7 dopuszczalne** | Dotyka `tests/golden/wyrocznie/` i rekordu biegu, **nie** dotyka solvera ani `assembler.py`. K7 zmienia model źródła — kolizji plików brak. Jedyna karta z realną przesłanką „w trakcie K7". |
| D-1 (Presentation Store) | **PO CV-4.3** | Warstwa frontu + nowa trwałość; zero związku ze zwarciami. |
| D-3 (pary zabezpieczeń) | **PO CV-4.3** | Otwiera program ZAB; zbyt duży, żeby wchodzić w tor zwarciowy. |
| Karty porządkowe (D-6…D-9) | **PO CV-4.3**, dowolnie | Kasacje i korekty. |
| Profil regresji SC | **niezależny** | Osobny problem wydajności; **nie jest kartą donorową** — żaden donor go nie naprawia. |

## 2. Karty

### D-1 · SLD Presentation Store — trwałe rozmieszczenie i trasy · **P0** · PO CV-4.3
**Donor / wzorzec:** sldeditor `9e1bba0` (MIT) — `WireEnd = TerminalRef|BusId|JunctionId`,
`Wire.path?` jako opcjonalna nakładka; PowSyBl `952186b` (MPL-2.0, **clean-room z opisu**) —
side-car kluczowany `getEquipmentId()`, zapis **tylko wierzchołków wewnętrznych**, cichy powrót
do auto-układu przy braku wpisu; VoltWeave `0384b23` (MIT) — dekompozycja `placement`/`route`.
**Cel:** osobny agregat trwały **poza** `EnergyNetworkModel`, kluczowany `ref_id`.
**Promień rażenia:** nowy magazyn + odczyt w `buildScene`; ENM **nietknięty**.

**Kolejność wewnątrz karty (test prawa PRZED funkcją):**
1. Test niezmiennika (A4) — **pisany pierwszy, musi być zielony przed i po**.
2. Kontrakt agregatu + trwałość.
3. Odczyt w `buildScene` z cichym powrotem do układu wyliczonego.
4. Zapis z edytora.

**Kryteria odbioru (mierzalne, nie opisowe):**
- [ ] Pełny relayout **nie zmienia** topologii ENM ani `snapshot_hash` — test.
- [ ] **Skasowanie całego magazynu** przywraca scenę wyliczoną; model bez zmian — test.
- [ ] Zerwana referencja (`ref_id` bez odpowiednika) jest **odrzucana przy odczycie**,
      bez błędu i bez wiszącej trasy — test.
- [ ] `compute_semantic_hash`, `compute_input_hash`, `hash_migawki_enm` **bit w bit** takie same
      dla modelu z magazynem i bez — test (to jest pin dla F-16, nie deklaracja).
- [ ] Przesunięcie symbolu **nie** przestawia wyniku na nieaktualny (`result_freshness`) — test.
- [ ] Zapisywane są **wyłącznie wierzchołki wewnętrzne**; oba końce liczone przy renderze — test.
- [ ] `npm run type-check`, `lint`, pełny vitest, guardy SLD i determinizmu — zielone.
**Ograniczenie wdrożeniowe wyprowadzone z kodu (nie do pominięcia):** `buildSceneV3`
(`v3/scene/buildScene.ts`) jest **czystą funkcją** `EnergyNetworkModel` + LOD → `SceneV3`,
z zadeklarowanym „zero DOM/losowości/Date — to samo wejście ⇒ identyczny wynik", i **jawnie
ignoruje** pozycje `x`/`y` z adaptera v2 („są WSZĘDZIE IGNOROWANE; ta funkcja liczy WŁASNĄ
geometrię"). Magazyn **nie może** wskrzeszać tej zignorowanej ścieżki v2 — musi wejść jako
**nowe, jawne wejście** funkcji scenowej, a determinizm ma obowiązywać dla pary
(model, magazyn): to samo wejście **wraz z magazynem** ⇒ identyczna scena. Inaczej złamiemy
własność, na której stoją bramki determinizmu SLD.

**Ryzyko:** dziś prawo 3.4 zachodzi trywialnie (scena w całości pochodna). To zmiana najbardziej
podatna na erozję tego prawa — stąd test prawa jako **pierwszy** krok, nie ostatni.

### D-2 · Proweniencja wyroczni + asercja mapowania · **P0** · dopuszczalna równolegle z K7
**Donor:** pandapower `fd7346f` (BSD-3) — utrzymanie, nie nowa integracja.
**Cel:** `tests/golden/wyrocznie/pandapower.py` + rekord biegu.
**Kryteria odbioru:**
- [ ] Wyrocznia publikuje `pandapower.__version__` i wersję mappera; wersja **zapisana** przy wyniku.
- [ ] Rozjazd wersji pandapower wobec zapisanej w referencjach IEEE **wywala test**
      (dziś referencje mówią `3.4.0`, CI instaluje `3.5.4`, **nic tego nie sprawdza**).
- [ ] Dla **każdej** wielkości podawanej pandapowerowi istnieje asercja, że pochodzi
      z **zadeklarowanego pola ENM**, nie z pośredniego wyniku MV (wzorzec: test z K6).
- [ ] Brak wyroczni dla 2F+G **nazwany wprost** w rejestrze (pandapower: `NotImplementedError`) —
      uczciwy brak zamiast cichej luki.
- [x] **ZROBIONE w mandacie audytu:** `scripts/regenerate_expected_values.py` — docstring mówił,
      że przelicza solverem, a ciało zawierało „In a real implementation we would invoke the actual
      solver here" i **przepisywało plik, który właśnie wczytało**, meldując sukces. Groźne, bo
      `solver_output_drift_guard.py:78` i `api/reference_networks.py:272` wskazywały je jako
      **procedurę naprawczą**. Skrypt skasowany, obie instrukcje mówią prawdę.
      **Zostaje w tej karcie:** prawdziwa regeneracja z solvera — z zapisem wersji pandapower
      i diffem wartości golden pod przeglądem. To zmiana danych normatywnych, nie sprzątanie.

### D-3 · Pary zabezpieczeń z topologii · **P0 programu ZAB** · PO CV-4.3
**Donor / wzorzec:** Sandia `44fe954` (**GPL-3.0 → wyłącznie clean-room, zero kodu**).
**Cel:** `src/protection/` + analiza koordynacji.
**Zakres zawężony po bramce §17:** MV **ma już** wyprowadzanie aparatu chroniącego z topologii —
`application/analyses/protection/czas_wylaczenia_galezi.py:195::znajdz_aparat_chroniacy`
(BFS, pomija łączniki otwarte, deterministyczne, **nie zakłada sieci promieniowej** — czyli
spełnia najtrudniejsze kryterium tej karty, którego wzorzec Sandia NIE spełnia).
Karta **nie buduje tego od zera**: przepina `analyzer.py` na istniejące wyprowadzenie
i rozszerza je o pary główna/rezerwowa oraz przypadki zwarciowe per strefa.
**Kryteria odbioru:**
- [ ] Pary główna/rezerwowa **wyprowadzone z topologii ENM**, nie z kolejności listy,
      **na istniejącym wyprowadzeniu** — bez drugiego przeglądu grafu (DT-8).
- [ ] Poprawne dla **pierścienia SN** (nie tylko sieci promieniowej — `nx.shortest_path` donora
      zakłada promieniową; nasze wyprowadzenie **nie może**).
- [ ] Poprawne przy DER wnoszącym prąd zwarciowy z drugiej strony.
- [ ] `analyzer.py:545` („assuming ordered downstream to upstream") **usunięty**, nie obudowany.
- [ ] Zero niedeterminizmu: brak silnika genetycznego bez ziarna (prawo 7).
- [ ] Prąd zwarciowy **wyłącznie** z solvera MV (prawo 5 / NOT-A-SOLVER).

### D-4 · Anulowanie biegu (kooperatywne) · **P1** · PO CV-4.3
**Donor:** TENSA `caca7d5` (**GPL-3.0 → clean-room**).
**Uzasadnienie:** front woła `executeRun` gołym `fetch` **bez `AbortController` i bez limitu
czasu**, przy biegu trwającym 171 s. To jest odczuwany problem — nie brak workerów.
**Kryteria odbioru:** anulowanie kończy bieg statusem jawnym (nie `FAILED` udającym awarię);
brak wyniku-sieroty; `AbortController` po stronie frontu; test wykonywalny.

### D-5 · Taksonomia awarii biegu · **P1** · PO CV-4.3
`FAILED` + `error_message` zastąpione powodem klasyfikowalnym maszynowo. Bez fizyki w warstwie.

### D-6 · Kasacja martwego `cadRoutingContract.ts` + **konsolidacja trzech kopii `snapToGrid`** · **P1** · PO CV-4.3
**Karta poprawiona po bramce §17 — pierwotna wersja tworzyła czwartą kopię.**
Stan zmierzony: moduł ma **19 eksportów** i **żaden plik produkcyjny go nie importuje**.
Jedyne odwołania: własny test oraz `v2/__tests__/scadaComplianceContract.test.ts:154`,
który przypina **istnienie pliku po nazwie** — kasacja musi zdjąć także ten pin
(ta sama pułapka, którą nazwałem dla `test_wymagane.py`).
**Znalezisko właściwe (klasa, nie instancja):** `snapToGrid` istnieje w **TRZECH** kopiach —
`v2/theme/tokens.ts:342` (żywa: `ViewportController`, `geometry/routing.ts`),
`v2/geometry/cadRoutingContract.ts:82` (martwa), `v3/core/grid.ts:11` (żywa: `buildScene`,
`compose/*`, `layout/*`). Karta ma **skonsolidować prymityw**, nie przenieść martwą kopię.
Uwaga: v2 i v3 mogą mieć różne stałe siatki — przed scaleniem **udowodnić równoważność
liczbową**, inaczej konsolidacja zmieni geometrię i złamie bramki determinizmu SLD.
`findNearestPort` + `PORT_SNAP_THRESHOLD_PX` kasujemy **świadomie**: to geometryczne kojarzenie
portów, które wpięte kiedykolwiek do tworzenia połączeń złamałoby prawo 3.3.

### D-7 · Kasacja drugiego mappera pandapower · **P1** · PO CV-4.3
Znalezisko Z5: `application/reference_networks/pandapower_bridge.py` — **zero konsumentów
produkcyjnych** (zweryfikowane), ciche domyślne (`vkr_percent=0.5`, `pfe_kw=0.5`, `i0_percent=0.1`,
`max_i_ka=1.0`, „rough conversion"), testy sprawdzają kształt zamiast zgodności z solverem.
Kasacja procedurą siedmiu kroków; `test_wymagane.py` wymusza jego istnienie — zdjąć też wymaganie.

### D-8 · Podpowiedzi **strony** i porządku rysowania pola · **P2** · PO CV-4.3
**Zakres zawężony po bramce §17:** `Bay.bay_number` **już istnieje** (`models.py:969`) —
numeracji nie dodajemy. Brakuje **strony** (góra/dół szyny) i jawnego porządku prezentacji.
Wzorzec: PowSyBl `ConnectablePosition` (order + TOP/BOTTOM, **bez geometrii**).
**Bramka poprawiona:** wcześniej napisałem „hasz-neutralność przez `exclude_none`" — to było
mylące. `exclude_none` nie decyduje; decyduje **jawne wykluczenie w `enm/hash.py`**
(precedens: `connection_conditions` w `_POLA_NAGLOWKA_POZA_HASHEM`). Warunek dopuszczenia:
albo pole ląduje w Presentation Store (domyślnie preferowane), albo wchodzi do ENM z jawnym
wykluczeniem **przypiętym testem** porównującym `hash_migawki_enm` przed i po.

### ~~D-9 · Lokalny wycinek sieci~~ · **KARTA WYCOFANA** (bramka §17)
**To była propozycja duplikatu.** MV ma tę zdolność: `application/analyses/lv_domain/graph_view.py`
z `BoundaryLink` (105) i `hops_from_root` (135, 223) — sąsiedztwo o ograniczonej głębokości
z jawnym pierścieniem granicznym, zbudowane na kanonicznym jądrze
`network_model/core/topologia.py::przeglad_wszerz_od`; plus `NetworkGraph.podgraf`
(`graph.py:638`, 2 konsumentów produkcyjnych). Wdrożenie PowSyBl-owego wariantu utworzyłoby
**drugi przegląd grafu** wbrew DT-8 (jedna implementacja topologii).
Jeśli fokus SLD kiedykolwiek będzie potrzebny, **rozszerzamy istniejące wyprowadzenie**
(dziś wyspecjalizowane dla domeny nN), nie budujemy nowego.

### D-10 · Korekta opisu `ui/sld-editor` w CLAUDE.md · **P2**
Znalezisko Z4: katalog zawiera sam `types.ts` (56 linii) z komentarzem „pełny moduł poza tym
worktree", a CLAUDE.md opisuje go jako „Edycja SLD (geometria CAD, przeciąganie, trasowanie)".
Opis niezgodny ze stanem repo.

### D-11 · Migracja polityki haszowania kolekcji ENM (Z7) · **P2** · PO CV-4.3
**Znalezisko zweryfikowane pomiarem:** `EnergyNetworkModel` ma **16 kolekcji listowych**,
`enm/hash.py::_ELEMENT_KEYS` zna **14**. Poza polityką stoją **`connection_nodes`** i
**`line_runs`**, więc `_kopia_pod_hash` **nie zdejmuje z nich `id`** przed haszowaniem —
inaczej niż z pozostałych elementów. `_ELEMENT_KEYS` nie zawiera wpisów martwych (0 nazw
bez odpowiednika w modelu).

**Dlaczego to NIE jest defekt czynny:** identyfikatory w obu kolekcjach są dziś stabilne,
więc hasz jest deterministyczny. To **niespójność polityki**, nie błąd wyniku.

**Dlaczego NIE naprawiam tego przy okazji audytu:** dopisanie dwóch nazw do `_ELEMENT_KEYS`
**zmienia wejście hasza**. Skutki, które trzeba obsłużyć razem, nie pojedynczo:
- unieważnia `snapshot_hash` **zapisane w istniejących bazach** (`canonical_runs.snapshot_hash`),
- przez `application/result_freshness.py` (porównanie `snapshot_hash`) oznaczy **wszystkie
  istniejące wyniki jako nieaktualne**, mimo że fizyka się nie zmieniła,
- wymaga **przeliczenia plików golden** i wpisów parytetu, które niosą hasze,
- wymaga decyzji, czy stare hasze migrujemy, czy akceptujemy jednorazowe unieważnienie.

**Zabezpieczenie wdrożone TERAZ (żeby dług nie urósł):**
`tests/enm/test_polityka_hash_kolekcji.py` — zbiór wyjątków jest **ZAMKNIĘTY**:
każda **nowa** kolekcja poza `_ELEMENT_KEYS` wywala test z instrukcją, a wyjątek, który
przestał być potrzebny, też wywala (żeby lista nie udawała długu, którego nie ma).
Zweryfikowane iniekcją: dodanie kolekcji `testowe_kolekcje` → test **FAILED**.

**Kryteria odbioru karty:**
- [ ] Decyzja: migrujemy hasze czy akceptujemy jednorazowe unieważnienie (**właściciel**).
- [ ] `connection_nodes` i `line_runs` w `_ELEMENT_KEYS`; wyjątki w teście **puste**.
- [ ] Golden i wpisy parytetu przeliczone, diff **w przeglądzie**, nie automatem.
- [ ] Pomiar PRZED/PO: ile zapisanych biegów zmieniło `snapshot_hash`.

## 3. Karty ZABLOKOWANE — decyzja właściciela, nie moja

### B-LIC · Licencja MV-DESIGN-PRO a donorzy GPL-3.0
MV **nie ma pliku `LICENSE`** ani pola `license` (`pyproject.toml`, `package.json`) → domyślnie
„wszelkie prawa zastrzeżone". Trzej donorzy są GPL-3.0: **TENSA**, **GElectrical**, **Sandia PSO**.
Skopiowanie ich kodu rozciągnęłoby GPL na dzieło — **zmiana sposobu dystrybucji**.
**Do rozstrzygnięcia przez właściciela:** czy MV kiedykolwiek dopuści kod GPL.
**Do czasu decyzji:** wszystkie karty z tych donorów są `REWRITE_CLEAN_ROOM` lub `STUDY_ONLY`
i **żadna nie jest przez to zablokowana** — clean-room daje pełną wartość. Rejestracja
zobowiązania i ryzyka, **nie opinia prawna**.

### B-01-RI · Krzywa `RI` to w rzeczywistości Long-Time Inverse
`protection_iec60255.py`: `IEC60255CurveType.RI = (120.0, 1.0)`, etykieta „Odwrotna RI (120)",
LaTeX `t = TMS·120/(M−1)`. To są stałe **Long-Time Inverse** wg IEC 60255-151 — i własny
`protection/curves/iec_curves.py` nazywa tę samą parę `LONG_TIME_INVERSE`. Prawdziwa
charakterystyka RI to `t = TMS/(0,339 − 0,236/M)` (ABB, spoza IEC 60255-151).
**Skutek:** jedna krzywa pod dwiema nazwami w dwóch modułach, jedna z nich **normatywnie błędna
i widoczna w dowodach** (etykieta + LaTeX trafiają do ProofDocument).
**Dlaczego stop:** zmiana dotyka **zamrożonego rdzenia solvera** (DT-9) oraz **treści dowodów**
i plików golden → **bramka B-01**, zgoda właściciela.
**Weryfikacja ponowna (2026-09-08):** ustalenie potwierdzone. `RI = (120.0, 1.0)`,
etykieta `"Odwrotna RI (120)"`, LaTeX `t = TMS·120/(M−1)`. Prawdziwej charakterystyki RI
(`t = TMS/(0,339 − 0,236/M)`) **nie ma nigdzie w repo** — MV jej po prostu nie oferuje.
Etykieta i wzór **trafiają do dowodu**: `protection_iec60255.py:531` (`formula_latex`) i
`:542` (`curve_label_pl`), więc błędna nazwa jest widoczna dla odbiorcy dokumentacji.

**ROZDZIELENIE, na którym stoi ta karta:** to defekt **nazewnictwa/normy**, **NIE** defekt
numeryczny. Zwracana wartość jest **poprawna dla Long-Time Inverse**; żaden wynik nie jest
dziś liczbowo zły. Dlatego karta nie jest pilna, ale jest **normatywna**.

**Wariant A (zalecany, minimalny):** przemianować `RI` → `LONG_TIME_INVERSE`, **bez zmiany
liczb**. Dotyka: enum, etykiety PL, LaTeX, snapshot OpenAPI, zapisane nastawy używające
identyfikatora `"RI"`, pliki golden dowodów. Wymaga migracji wartości `"RI"` w danych.
**Wariant B (osobno, tylko jeśli potrzebne produktowo):** dodać **prawdziwą** RI jako nową
charakterystykę (`t = TMS/(0,339 − 0,236/M)`) — to nowa fizyka krzywej, własne testy i
sanity-bounds, nie część przemianowania.
**Bramka:** B-01 (rdzeń FROZEN + treść dowodów + golden) — decyzja właściciela.
