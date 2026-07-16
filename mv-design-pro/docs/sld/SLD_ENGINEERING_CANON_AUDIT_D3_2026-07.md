# Audyt kanonu energetycznego schematu SLD v3 — dyrektywa D3 (2026-07-16)

Status: WIĄŻĄCY dla fazy F13 (plan: `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` §F13)
Wejście: ocena właściciela 7/10 z trzema ustaleniami + polecenie pełnego audytu
„szerokiego grona ekspertów" pod kątem kanonu energetycznego i fizyki obrazu.
Metoda: każda perspektywa ekspercka osobno; KAŻDE ustalenie poparte dowodem
(pomiar na scenie `sldSubstrate52s` L2 / kadr renderu / rekord ENM). Zero ocen
bez dowodu.

## 0. Dowody bazowe (pomiary nadzorcy, 2026-07-16)

- P-1: sonda przecięć toru mocy (H×V, przecięcie ścisłe wewnętrzne, warstwy
  adnotacji wyłączone): **24 przecięcia**, wszystkie pion odgałęzienia ×
  poziom przęsła magistrali (11 w korytarzu y=344 + kaskady niżej). Rysowane
  gołą kreską — bez kropki węzłowej i bez mostka.
- P-2: sonda zakończeń tras zewnętrznych: 106/106 zakończeń `seg/*` ląduje
  przy głowicy kablowej pola (0 wprost na szynie) — struktura poprawna;
  problem jest WIZUALNY (prowadzenie korytarzy, patrz D3-4).
- P-3: ENM niesie stronę WN GPZ jako rekordy pierwszoklasowe:
  `Transformer 110/15 kV, 25 MVA, Yd11` (`transformer_refs[0]`), szyna
  `.../transformer/001/bus_110` (w `bus_refs`), źródło `model=
  short_circuit_power, sk3_mva=250, ik3_ka=9.62, catalog_role=GPZ_110_SN`.
  `gpz_hv_sections=[]` (grupowanie layoutu puste), ale relacje istnieją —
  scena v3 NIE rysuje NIC z tego (kadr `d3_gpz.png`: jedna szyna SN + jedno
  pole liniowe).
- P-4: kadry `d3_gpz.png` / `d3_crossing.png` / `d3_station_entry.png`
  (scratchpad v3_png) + render pełny `projektant_L2_full.png`.

## 1. Perspektywa: projektant rozdzielni WN/SN

- **D3-1 [KRYTYCZNE] Strona 110 kV GPZ nierysowana mimo danych.** Kanon:
  GPZ = stacja WN/SN; schemat MUSI pokazywać tor: przyłącze systemowe WN →
  pole WN → transformator WN/SN (z grupą połączeń i mocą) → sekcje SN.
  Stan: rysowana wyłącznie szyna SN z polem liniowym; transformator 110/15,
  szyna 110 kV i parametry systemu (P-3) pominięte. Naprawa: wywiedzenie
  kolumny WN z relacji pierwszoklasowych (`transformer_refs` × `uhv_kv>60`,
  szyna WN z `bus_refs`, źródło po `incoming_source_ref`/`bus_ref`) —
  projekcja białoskrzynkowa, nie zgadywanie; `gpz_hv_sections` (gdy
  niepuste) pozostaje nadrzędnym grupowaniem.
- **D3-2 [KRYTYCZNE] GPZ bez dominacji kompozycyjnej.** Kanon OSD: GPZ jest
  dominantą schematu (źródło systemu) — większa szyna, wydzielona strefa,
  tytuł rozdzielni, dane systemowe. Stan: blok GPZ wizualnie MNIEJSZY od
  przeciętnej stacji SN/nN (kadr P-4). Naprawa: strefa GPZ (rama + nagłówek
  z nazwą), szyna sekcji SN grubsza/dłuższa niż szyny stacji, kolumna WN nad
  sekcjami, tabliczka danych systemowych.
- **D3-8 [ŚREDNIE] Tabliczka danych systemu.** Sk″=250 MVA, Ik3″=9,62 kA,
  110/15 kV, TR 25 MVA Yd11 — wszystkie w ENM (P-3), żadnej na rysunku.
  Kanon: dane przyłącza systemowego przy źródle (blok tekstowy przy strzałce
  systemu). Naprawa razem z D3-1.

## 2. Perspektywa: inżynier sieci SN (kanon schematów jednokreskowych)

- **D3-3 [KRYTYCZNE] Przecięcia toru mocy bez rozróżnienia
  połączenie/przecięcie.** 24 pomierzone przecięcia (P-1) gołą kreską.
  Kanon (IEC 60617 / praktyka OSD): połączenie elektryczne = kropka węzłowa;
  skrzyżowanie bez połączenia = mostek (półłuk) na linii przechodzącej ALBO
  unikanie skrzyżowania routingiem. Dziś odbiorca nie umie odróżnić
  odgałęzienia od przelotu. Naprawa dwuetapowa: (a) routing redukujący —
  pion odgałęzienia schodzi z węzła magistrali W DÓŁ poza przęsłami, nie
  przez nie; (b) każde pozostałe skrzyżowanie dostaje mostek półkolisty
  (linia pionowa przeskakuje poziomą) — element RENDERU trasy, geometria
  węzłów nietknięta. Wyrocznia `crossing_probe`: 0 przecięć bez
  mostka-lub-kropki; test negatywny obowiązkowy.
- **D3-5 [WYSOKIE] Kropka węzłowa ⇔ realny węzeł ENM.** Kropka może
  występować WYŁĄCZNIE tam, gdzie ENM ma węzeł (rozgałęzienie
  `branch_segment`/`ConnectionNode`); nigdzie indziej. Wyrocznia
  `junction_dot_probe` z dwiema stronami: (a) każde realne rozgałęzienie ma
  kropkę, (b) żadna kropka bez węzła ENM.
- **D3-4 [WYSOKIE] Korytarz magistrali prowadzony NAD pasmem szyn stacji —
  odczyt „linia wchodzi z góry na szynę".** Struktura jest poprawna (P-2:
  zakończenia w głowicach), ale piony tras przecinają wysokość pasa szyn i
  opadają przy krawędzi szyny (kadr P-4), więc odczyt inżynierski sugeruje
  wejście na szynę z pominięciem pola. Kanon: tor wejściowy czytany OD DOŁU
  pola liniowego (głowica ▲ na dole → aparaty → szyna u góry); korytarze
  tras między rzędami stacji, zakaz prowadzenia pionów przez pas Y szyny
  (poza własnym zejściem pola). Naprawa: strefa ochronna szyny (bus-band
  clearance) w routingu + wyrocznia `bus_band_clearance_probe` (0 obcych
  pionów w pasie ±N px od osi każdej szyny, poza własnymi zejściami pól tej
  szyny).

## 3. Perspektywa: operator dyspozycji (SCADA)

- **D3-6 [ŚREDNIE] Rozróżnialność pól kierunkowych magistrali od odgałęzień
  jednym rzutem oka.** Podpisy `Magistrala 01 · kier. X` / `Odgałęzienie SN
  kablowe · odg. Y` są (F10.2), sylwetki §14.3 są — ale przy 118 polach
  liniowych L2 pierwszeństwo czytania kierunku zasilania wymaga akcentu
  grubości toru magistralnego względem odgałęźnego (kanon: magistrala
  grubsza). Naprawa: klasa grubości `sn-trunk` > `sn-branch` (dziś jedna
  grubość 1.6).
- **D3-10 [NISKIE] Strzałka systemu bez nazwy źródła.** `meta.source_id=
  "GPZ Referencyjny 15 kV"` istnieje — podpisać przyłącze systemowe.

## 4. Perspektywa: normalista IEC 60617 / PN-EN

- **D3-9 [ŚREDNIE] Transformator WN/SN:** po D3-1 symbol dwuuzwojeniowy z
  grupą połączeń (Yd11) i przekładnią 110/15 kV przy symbolu (konwencja jak
  zrealizowana dla TR SN/nN w F8c-K30). Zero nowych glifów — `transformer2W`
  istnieje.
- **D3-11 [NISKIE] Mostek skrzyżowania:** półłuk po stronie linii PIONOWEJ
  (jednolita konwencja w całym rysunku — wybór: pion przeskakuje poziom),
  promień = GRID/2, zakaz mostka na szynie (szyna nigdy nie jest linią
  przechodzącą — przecięcie z szyną ma być niemożliwe po D3-4).

## 5. Perspektywa: kartograf CAD (kompozycja arkusza)

- **D3-2bis [WYSOKIE]** (spina D3-2): hierarchia wielkości: GPZ > stacja
  węzłowa > stacja przelotowa/końcowa > ZK/słup. Dziś wszystkie bloki tej
  samej rangi. Minimalny krok: strefa GPZ + większa szyna (bez przebudowy
  siatki stacji — tapX/stationBlockWidth NIETYKALNE bez pełnej
  re-walidacji).
- **D3-12 [NISKIE] Pas tytułowy strefy GPZ** (nazwa rozdzielni, poziomy
  napięć) zamiast luźnych etykiet.

## 6. Perspektywa: fizyk obwodów

- **D3-13 [WYSOKIE — potwierdzenie]** Po D3-3/D3-5: graf narysowany =
  graf elektryczny (każde dotknięcie linii na rysunku odpowiada węzłowi ENM
  albo jest jawnie zaprzeczone mostkiem). To jest WARUNEK odczytu fizyki z
  rysunku; wyrocznie z D3-3/D3-5 są jego realizacją.

## 7. Plan naprawczy — fazy F13 (kolejność wiążąca)

| Faza | Zakres | Ustalenia | Priorytet |
|---|---|---|---|
| F13.1 | GPZ WN/SN: kolumna WN (przyłącze systemowe z nazwą i danymi Sk″/Ik3″ → szyna WN → TR WN/SN z Yd11/25 MVA/110/15 → sekcje SN), strefa GPZ z nagłówkiem, szyna GPZ grubsza | D3-1, D3-2, D3-8, D3-9, D3-10, D3-12 | KRYTYCZNY |
| F13.2 | Skrzyżowania: routing redukujący + mostki półłukowe + `crossing_probe` + `junction_dot_probe` (obie z negatywami) | D3-3, D3-5, D3-11, D3-13 | KRYTYCZNY |
| F13.3 | Strefa ochronna szyn: korytarze tras poza pasmem Y szyn, wejścia czytane od dołu pola; `bus_band_clearance_probe` | D3-4 | WYSOKI |
| F13.4 | Grubość magistrala>odgałęzienie (`sn-trunk`/`sn-branch`) | D3-6 | ŚREDNI |
| F13.5 | Rendery odbioru + aktualizacja macierzy wyroczni + raport | wszystkie | — |

Reguły: spec-first (każda faza dopisuje §§ do SLD_CAD_SPEC_V3 przed kodem);
baseline'y §15.1 wolno podnieść WYŁĄCZNIE z uzasadnieniem liczbowym w treści
commitu (D3-1/D3-3 zwiększą piony — to koszt poprawności kanonicznej, nie
regresja); tapX/stationBlockWidth nietykalne; każda wyrocznia z testem
negatywnym; DoD wizualne na PNG per faza.
