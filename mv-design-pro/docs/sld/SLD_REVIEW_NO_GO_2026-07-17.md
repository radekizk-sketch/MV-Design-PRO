# Recenzja inżynierska schematu — NO-GO (właściciel, 2026-07-17) — rejestr ustaleń i plan

Status: **WIĄŻĄCE**. Źródło: pełna recenzja właściciela (16 punktów, decyzja NO-GO,
10 błędów krytycznych) renderu `docs/audit/visual/sld_gpz_feeder_L2.png`.
Ten dokument utrwala KAŻDY punkt z pomiarem stanu i przypisaną naprawą.
Wykonanie: sesja 2026-07-17 (runda 6) — kolumna „Status".

Zasada nadrzędna (pkt 10 recenzji): reguły wdrażane GLOBALNIE — w spec
(`SLD_CAD_SPEC_V3.md`), generatorze sceny, modelu danych, walidatorze — nie
jako ręczna korekta jednego rysunku.

| # | Ustalenie (skrót) | Pomiar stanu | Naprawa | Status |
|---|---|---|---|---|
| 1 | KRYTYCZNE: kable z 2 pól GPZ krzyżują się na granicy obiektu; kabel biegnie PO przerywanej granicy GPZ | objazd magistrali `belowY = bbox+GRID` pokrywa się z ramą strefy; pion feederu przecina poziom magistrali bez CZYTELNEGO mostka | separacja korytarzy: objazd magistrali głębiej pod strefą (+3×GRID), poziom feederów na ODRĘBNYM poziomie (sztafeta poziomów per ciąg); mostek §22.1 na pozostałych przecięciach (już liczony — weryfikacja wizualna) | WYKONANE (runda 6) |
| 2 | KRYTYCZNE: Sk″=250 MVA + Ik″=9,62 kA + „110 kV" wzajemnie sprzeczne | POMIAR: dane źródła SĄ spójne przy 15 kV (Ik″=250/(√3·15)=9,62 kA); `Source.bus_ref`=szyna SN, `source_side:"SN"`, `voltage_rating_kv:15` — to EKWIWALENT NA SZYNACH SN; rysunek drukował tabliczkę przy szynie 110 kV (fałsz prezentacji, nie danych) | tabliczka źródła przy WŁAŚCIWEJ stronie: napięcie ZE ŹRÓDŁA (15 kV), nie z szyny WN; strzałka WN bez danych zwarciowych gdy źródło jest SN-side; walidator spójności Sk″/Ik″/U (backend) | WYKONANE (prezentacja+walidator) |
| 3 | Identyfikacja: „Źródło GPZ 15 kV" przy szynie 110 kV; tytuł „GPZ GPZ 15 kV" z duplikacją | nagłówek strefy = „GPZ " + `name` (name już zaczyna się od „GPZ") | etykieta ekwiwalentu: „Ekwiwalent sieci · 15 kV" przy symbolu źródła na szynie SN; przyłącze WN opisane „przyłącze systemowe 110 kV" bez tabliczki; nagłówek bez duplikacji prefiksu | WYKONANE |
| 4 | Model TR 110/15 niekompletny na rysunku (uk%, Pk, zaczepy, punkt neutralny) | ENM MA uk=11%, Pk=120 kW, i0=0,2% (`materialized` z katalogu); zaczepy/punkt neutralny = null | tabliczka TR1 rozszerzona o uk%/Pk z danych; zaczepy + punkt neutralny + Z0 = DOMENA (wymaga danych katalogowych/decyzji — wpis planu, wymóg jawnego określenia punktu neutralnego w walidatorze readiness) | CZĘŚCIOWE (tabliczka); reszta → plan |
| 5 | Szablon pól liniowych stacji = kopia pola GPZ (DS+CB+CT) zamiast RMU (rozłącznik+uziemnik) | konwencja §12.4 `compose/station.ts` jednolita dla wszystkich pól | dedykowane szablony technologiczne pól (RMU liniowe, liniowe wyłącznikowe, trafo bezpiecznikowe/wyłącznikowe, pomiarowe, sprzęgłowe) — PROGRAM zmiany konwencji rysunkowej (dotyka 53 stacji substrate + wszystkich wyroczni geometrii) | PLAN (osobna sesja — projekt niżej) |
| 6 | Pole trafo niekompletne; tor kończy się na zacisku dolnym TR; brak węzła 0,4 kV i odbioru | kompozycja MA `#lv-bus`/`#lv-drop`; moc TR (630 kVA) JEST w paśmie nazwy stacji; brak etykiety przekładni/0,4 kV przy TR i odbioru P/Q | etykieta T1 „15/0,4 kV" przy symbolu + szyna nN opisana napięciem = NOWY kanał danych stacji (adapter→measure→compose, rezerwacje geometrii) — razem z odbiorem 0,4 kV do §2 planu | PLAN (świadoma decyzja zakresu rundy 6 — moc TR już widoczna) |
| 7 | „Stacja przelotowa" niezgodna z topologią (drugie pole = wiszący koniec) | etykieta typu z `station_type` (dane), nie z topologii; `classifyStationTopologicalType` ISTNIEJE | typ PREZENTOWANY wyprowadzany z topologii (przelotowa ⇔ oba pola liniowe połączone); rozjazd danych → topologii = jawny stopNote | WYKONANE |
| 8 | Pola bez nagłówków funkcyjnych i bez wskazania drugiego końca (S02 w ogóle) | podpisy kierunku wymagają nazwy line-run; feeder ma nazwę korytarza | numeracja pól GPZ: dane (`bay_number`→`feeder_short_name`) z OSTATNIM fallbackiem deterministycznym F01/FT1/FS1/FP1 (`gpzFieldOrdinalDesignation`, compose/gpz.ts — pole bez żadnego oznacznika przestaje być anonimowe); nagłówki funkcyjne pól STACJI + kierunek per feeder → plan | CZĘŚCIOWE (numeracja GPZ-fallback; stacje → plan) |
| 9 | Q1/Q2/QE1 powtarzalne bez kontekstu; QE1 zakotwiczone przy głowicy zamiast przy uziemniku | POMIAR: etykieta lateralu kotwiczona na `stackLeftX` (kolumna identyfikatorów toru głównego) — „QE1" lądowało obok aparatu głównego tej wysokości (głowicy) | kotwica QE1 = POD WŁASNYM symbolem ES (compose/station.ts, `placement:'below'` — jog biegnie nad symbolem, pas pod nim wolny); identyfikator GLOBALNY `⟨stacja⟩.⟨pole⟩.⟨aparat⟩` w inspektorze → plan | WYKONANE (kotwica); globalne ID → plan |
| 10 | Uziemniki: gałąź wygląda jak trwałe połączenie z ziemią; brak rozróżnienia typów uziemień | §18.1 ES poza osią JEST; styk ruchomy/stan w glifie | glif ES ze stykiem + stan; typologia uziemień (ekrany/konstrukcja/punkt neutralny) → DOMENA (plan); blokady stanów → walidator (plan) | PLAN |
| 11 | Legenda: głowica (▲) nieopisana; NO nieużyte przy końcach; „M" mylące; brak symbolu źródła | legenda w `sheet/Frame.tsx` | dopisane pozycje: głowica kablowa, słupek „koniec otwarty" (próbka z prostopadłym słupkiem, jawnie odróżniona od NO), źródło/ekwiwalent sieci; glif miernika niesie literę WIELKOŚCI (A prąd z CT / V napięcie z VT — `meterQuantity` z `Measurement.measurement_type`, kanał adapter→compose→glif), „M" tylko przy braku danych + wpis legendy rozstrzygający | WYKONANE |
| 12 | CT/VT: rozróżnienie, VT nie w torze; brak pomiaru napięcia szyn 15 kV | vt_parallel_probe (§18.2) pilnuje VT poza torem | pomiar U szyn GPZ + 3U0 = DOMENA/dane (plan) | PLAN |
| 13 | Opisy kabli daleko od tras; brak identyfikatora odcinka z parą końców | etykiety w slotach przęseł | format `L⟨nr⟩: ⟨A⟩ ↔ ⟨B⟩ — typ, przekrój, długość` + pozycjonowanie przy trasie — wymaga zmian silnika etykiet (plan); napięcie izolacji kabla z katalogu | PLAN |
| 14 | Nazwy stacji nieunikatowe („Stacja B" ×2) | backend nadaje nazwę z typu | nazwa domyślna z KODEM stacji (unikatowa) u ŹRÓDŁA (backend insert_station) | WYKONANE |
| 15 | Brak prezentacji stanów/wyników (zasilenie, NO, P/Q, U/I) | nakładka P-A ISTNIEJE (badge, energizacja, kierunki — render `sld_substrate_53_PA_tor.png`); stany łączników w glifach | bez zmian kodu — do odbioru z nakładką; wartości U/I/obciążeń per element → rozszerzenie nakładki (plan) | CZĘŚCIOWE (istnieje) |
| 16 | Kompozycja: stacje za małe względem pustego arkusza | stała skala świata, kamera fit | skala/kompaktowanie arkusza → program kompozycji (plan; siatka arkusza już opcjonalna poza wydrukiem — kamera) | PLAN |

## Projekt dla pozycji PLAN (do wykonania w kolejnych sesjach, kolejność wg wagi)

1. **Szablony technologiczne pól (pkt 5)** — nowa sekcja spec §12.5: słownik
   szablonów pola (RMU-liniowe: rozłącznik+uziemnik+głowica; liniowe
   wyłącznikowe: DS+CB+CT+ES+głowica; trafo bezpiecznikowe: rozłącznik z
   bezpiecznikami+ES+TR; trafo wyłącznikowe; pomiarowe: VT równolegle;
   sprzęgłowe), wybór z DANYCH (`Bay.bay_type`/katalog rozdzielnicy), fallback
   konwencji per TYP STACJI (stacja 630 kVA przelotowa → RMU), wyrocznia
   `bay_template_probe` + negatyw; przebudowa baseline'ów substrate.
2. **Odbiory 0,4 kV (pkt 6)** — agregat P/Q ze zbioru `loads` stacji; węzeł
   0,4 kV zawsze opisany; „granica modelu" jawna, gdy odbiorów brak.
3. **Identyfikatory globalne (pkt 9)** — `⟨stacja⟩.⟨pole⟩.⟨aparat⟩` w modelu
   (BayPrimaryDevice.designation, DOMAIN F10.6) + inspektor; rysunek zostaje
   przy krótkich w obrębie opisanego pola.
4. **Typologia uziemień + blokady (pkt 10)** — rozróżnienie uziemnika pola /
   ekranów / konstrukcji / punktu neutralnego w DOMENIE; walidator kombinacji
   stanów (łącznik główny vs uziemnik).
5. **Pomiary U/3U0 GPZ (pkt 12)** i **etykiety odcinków przy trasie (pkt 13)**
   oraz **skala kompozycji (pkt 16)** — osobne, dobrze odgraniczone zadania.
