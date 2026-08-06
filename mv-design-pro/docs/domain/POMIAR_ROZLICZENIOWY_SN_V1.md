# Pomiar rozliczeniowy odbiorcy SN — kontrakt domenowy V1 (BINDING)

Status: WIĄŻĄCY (dyrektywa właściciela 2026-08-06, rejestr V12K-333).
Źródło branżowe: Standard ENEA Operator sp. z o.o. „Układy pomiarowe energii
elektrycznej" (wersja 05.2022-2, obowiązuje od 02.04.2024) — dalej [E-UP];
zeszyty standardów sieci Enei Operator (stacje SN, złącza kablowe SN).

## 1. Zasada nadrzędna

**Układ pomiarowo-rozliczeniowy odbiorcy SN mierzy CAŁY i WYŁĄCZNIE pobór
(lub oddanie) tego odbiorcy.** Pomiar rozliczeniowy NIGDY nie obejmuje
tranzytu magistrali OSD. Rysunek, model i szablony, które stawiają pole
pomiarowe „w szeregu" z tranzytem magistrali, kłamią o fizyce układu
pomiarowego — taka konfiguracja jest ZAKAZANA.

Dowód wprost ze standardu [E-UP], zał. 5 (tabele przekładników):
przekładniki prądowe „POLE POMIAROWE W ROZDZIELNI EOP / ODBIORCA" mają
przekładnie **5/5 A i 15/5 A** (maks. 50–100/5 dla pól liniowych
odbiorca-wytwórca). To są prądy PRZYŁĄCZA KLIENTA — magistrala SN prowadzi
setki amperów; przekładnik 5/5 w torze tranzytu nie ma sensu fizycznego.

## 2. Miejsce układu pomiarowego (za [E-UP] §7 tab. 1 poz. 3 i §10.1)

Dla obiektów przyłączonych do SN układ jest POŚREDNI, a przekładniki
instaluje się w jednym z miejsc **na przyłączu klienta, przy granicy
stron/własności**:
- złącze kablowe SN z układem pomiarowo-rozliczeniowym,
- złącze pomiarowe SN,
- słup linii napowietrznej SN z układem pomiarowo-rozliczeniowym,
- pole SN/WN stacji 110 kV/SN (przyłącza z rozdzielni OSD),
- pole WN rozdzielni 110 kV klienta.

Konsekwencja topologiczna: **stacja/złącze klienta wisi w ODGAŁĘZIENIU od
toru magistrali** (albo jest zasilane bezpośrednio z pola rozdzielni OSD).
Pomiar leży w szeregu z GAŁĘZIĄ KLIENTA — między granicą stron a częścią
odbiorczą (transformatorem/rozdzielnicą klienta).

## 3. Klasy przyłączeń w modelu (mapowanie na ENM)

| Klasa | Kształt | Pola SN (kolejność od zasilania) | Pomiar |
|---|---|---|---|
| **A. Stacja dystrybucyjna OSD** (przelotowa w ciągu magistrali) | wcięcie w magistralę (`insert_station_on_segment_sn`) | [LINIA_IN, LINIA_OUT, (LINIA_ODG…), TRANSFORMATOROWE] | **BRAK pola pomiarowego rozliczeniowego** (bilans OSD jest w GPZ; pomiary nN u odbiorców komunalnych wg [E-UP] §8–9) |
| **B. Stacja abonencka końcowa** (klient SN w odgałęzieniu) | odgałęzienie od magistrali (`start_branch_segment_sn` + stacja na końcu gałęzi) | [LINIA_IN (dopływ), POMIAROWE, TRANSFORMATOROWE, (rezerwy)] | pomiar w szeregu z dopływem — mierzy całość poboru stacji |
| **C. Złącze kablowe SN z pomiarem** (pętla OSD + klient) | wcięcie w magistralę (pętla) | [LINIA_IN, LINIA_OUT (pętla OSD), POMIAROWE (odpływ do klienta), część kliencka za pomiarem] | pole pomiarowe jest POLEM ODPŁYWOWYM gałęzi klienta — tranzyt pętli NIE przechodzi przez pomiar |

Reguły twarde:
1. Szablon deklarujący pole POMIAROWE opisuje przyłącze KLIENTA (klasa B
   lub C) — nigdy czysto dystrybucyjną stację OSD.
2. W klasie B zestaw ról NIE zawiera pary tranzytowej (IN+OUT magistrali);
   pomiar leży bezpośrednio za polem dopływowym.
3. W klasie C para IN/OUT to pętla OSD, a pomiar jest polem gałęzi klienta;
   część kliencka (TR, rozdzielnica klienta) leży ZA pomiarem w tej gałęzi.
4. Kolejność na rysunku = kolejność `field_specs` z danych (V12K-330);
   dane muszą spełniać pkt 1–3.

## 4. Stan wdrożenia

- Etap 1 (ten dokument + V12K-333): szablony klienckie doprowadzone do
  klas B/C; testy klasy przypięte (patrz
  `tests/application/station_templates/test_station_templates.py`).
- Etap 2 (karta POMIAR-ODGAŁĘZIENIE, WDROŻONY): aplikacja szablonu klasy B
  buduje ODGAŁĘZIENIE zamiast wcięcia przelotowego. Droga zabudowy wybierana
  z KLASY, a klasa — z zestawu ról pól, który zostanie zbudowany
  (`_klasa_przylaczenia`, `application/station_templates/apply.py`), nigdy
  z nazwy ani kategorii szablonu:

  | Klasa | Droga zabudowy |
  |---|---|
  | A | `insert_station_on_segment_sn` (wcięcie przelotowe) |
  | B | punkt odgałęzienia na odcinku (ZKSN dla kabla / słup rozgałęźny dla linii) → `start_branch_segment_sn` → `append_station_on_endpoint` (stacja KOŃCOWA) |
  | C | `insert_station_on_segment_sn` (wcięcie — pętla OSD, pkt 3 wyżej) |

  Parametry gałęzi są JAWNE: `branch_length_m` (domyślnie 1000 m — wzorzec
  kreatora odgałęzienia `DANE_DOMYSLNE.dlugosc_km = 1`),
  `branch_segment_catalog_ref` (domyślnie pozycja katalogowa odcinka
  MACIERZYSTEGO — wzorzec `KontekstOdgalezienia.initial_catalog_ref`),
  `branch_point_catalog_ref` (domyślnie referencyjna pozycja katalogu dla
  ośrodka odcinka). Brak pozycji katalogowej odcinka macierzystego BEZ
  wskazania projektanta = błąd, nigdy podstawiony typ kabla.

  Zakres rozstrzygnięty przy karcie: karta mówiła „klasa B/C ⇒ odgałęzienie",
  ale §3 tego kontraktu (dokument wyższy w hierarchii) przypisuje klasie C
  WCIĘCIE (pętla OSD) — wygrywa kontrakt, klasa C zostaje przy wcięciu.

  BRAMA DOMENOWA (ta sama reguła na każdej drodze wejścia): operacja
  `insert_station_on_segment_sn` ROZCINA odcinek, więc z definicji prowadzi
  tranzyt przez szynę tworzonej stacji — odmawia zestawu pól z polem
  POMIAROWYM bez pary tranzytowej (`station.insert.pomiar_w_torze_tranzytu`).
  Dzięki temu reguła nie żyje wyłącznie w warstwie szablonów: surowe API
  operacji, kreator stacji i seedy przechodzą przez tę samą bramę.
  Stacja KOŃCOWA (`append_station_on_endpoint`) bramy nie potrzebuje — nie ma
  czego tranzytować za rozdzielnicą klienta.

- Etap 3 (karta ODG-RYSUNEK, WDROŻONY): scena SLD v3 RYSUJE punkty odgałęźne
  (`branch_points`) na torze magistrali i całe ciągi za nimi — stacja klienta
  przyłączona odgałęzieniem trafia na rysunek.

  | Element rysunku | Skąd pochodzi (zero fabrykacji) |
  |---|---|
  | Położenie punktu na torze | człon ciągu, którego `toTerminal.busRef` == `BranchPointSN.bus_ref`; tor jest w tym punkcie ROZCINANY, więc punkt jest stykiem końców dwóch członów, a nie glifem na przewodzie |
  | Kanał zejścia odgałęzienia | szczelina kolumnowa węzła POPRZEDZAJĄCEGO punkt na ciągu — ta sama formuła co dla lateralu z pola odgałęźnego stacji (jeden allocator) |
  | Symbol | `BranchPointSN.branch_point_type`: `zksn` → złącze kablowe SN, `branch_pole` → słup rozgałęźny (osobne glify, rozróżnialne kształtem) |
  | Etykieta | `BranchPointSN.name` (L1/L2; na L0 obowiązuje polityka przeglądu — same kody stacji) |
  | Trafialność | warstwa trafień S9-4, własny rodzaj obiektu „punkt odgałęźny" |

  Wyrocznia pokrycia (`branchPointCoverageGaps`, `scene/buildScene.ts`): dla
  KAŻDEGO `branch_point` w modelu (a) punkt ma symbol na scenie i (b) KAŻDA
  stacja stojąca za nim jest w `meta.drawnStationIds`. Sam licznik stacji
  (`meta.stationCount`) tego nie łapał — mówił „ile", nie „które", więc scena z
  pominiętą stacją klienta wyglądała na kompletną.

  POZA zakresem etapu (świadomie, `docs/v12xx/REJESTR_KONFLIKTOW.md` wiersz
  `ODG-RYSUNEK`): punkt odgałęźny, którego węzłem poprzedzającym jest GPZ
  (leżący na przęśle GPZ → pierwsza stacja) — kanał musiałby biec pasem dzielonym
  z rynną łącznika wierszy arkusza i ramą strefy GPZ, co jest osobną decyzją
  geometryczną. Scena zgłasza taki punkt imiennym `stopNote` i wykazuje jako lukę
  pokrycia — jest mierzalny, nie przemilczany.

  Sieć pokazowa etapu (`frontend/scripts/demo-siec-pokazowa/`): magistrala OSD z
  trzema stacjami dystrybucyjnymi przelotowymi (630/400/1250 kVA) + odcinek
  napowietrzny, dwaj klienci SN w odgałęzieniach — po jednym za ZKSN (odcinek
  kablowy) i za słupem rozgałęźnym (odcinek napowietrzny). Zrzuty odbioru:
  `docs/sld/audyt-2026-08/odg-rysunek-po-{l0,l2}-{ciemny,jasny}.png`.

## 5. Rejestr zmian

- 2026-08-06: V1 — utworzony po korekcie właściciela (dwukrotnej) do
  V12K-329/330; źródło: [E-UP].
- 2026-08-06: etap 2 (POMIAR-ODGAŁĘZIENIE) — droga odgałęzienia dla klasy B,
  jeden słownik ról pól SN w operacjach domenowych, kolejność pól z danych;
  nazwany etap 3 (rysunek odgałęzień z punktów ZKSN/słupa).
- 2026-08-06: etap 3 (ODG-RYSUNEK) — scena SLD v3 rysuje punkty odgałęźne i
  ciągi za nimi; punkt odgałęźny jest pełnoprawnym węzłem wiersza (symbol z
  rodzaju modelu, etykieta z danych, obszar trafienia, tor rozcinany w punkcie),
  wyrocznia pokrycia porównuje model z rysunkiem po TOŻSAMOŚCI, nie po liczniku.
