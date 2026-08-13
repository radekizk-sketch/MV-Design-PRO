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

## 5. Pomiar pola POMIAROWEGO: funkcja pola i rodzaj układu pomiarowego energii (V12K-335 pkt 2, korekta właściciela V12K-336, karta POMIAR-RODZAJ)

### 5.1 Funkcja pola pomiarowego — rozróżnienie klasowe (V12K-336 pkt 4)

Pole o roli POMIAROWE pełni jedną z DWÓCH funkcji (klucz **`funkcja_pomiaru`**
w specyfikacji pola `field_specs`, addytywny — wyłącznie dla pola POMIAROWE):

| Funkcja | Znaczenie | Brama tranzytu |
|---|---|---|
| `UKLAD_ENERGII` | układ pomiarowy energii elektrycznej ([E-UP] pkt 3) — towarzyszy granicy stron w gałęzi klienta; niesie rodzaj układu (`rodzaj_pomiaru`) | PODLEGA — §1 tego kontraktu |
| `NAPIECIA_SZYN` | pole pomiaru napięcia szyn rozdzielni (przekładniki napięciowe sekcji — np. pole pomiarowe GPZ); NIE jest układem pomiarowym energii i nie niesie rodzaju rozliczenia | NIE podlega — wolne na każdej drodze i w każdej topologii |

To rozróżnienie zastępuje dawny „wyjątek GPZ": pole pomiarowe na szynie
rozdzielni GPZ jest legalne, bo jest pomiarem NAPIĘCIA szyn, a nie układem
pomiarowym energii (pin `test_add_sn_bay_pin_gpz_pomiar_napiecia_szyn_wolny`).

### 5.2 Rodzaj układu pomiarowego energii — lista ZAMKNIĘTA ze standardu

Rodzaje układów pomiarowych energii elektrycznej wprost z **[E-UP] pkt 3**
(definicja „Układy pomiarowe energii elektrycznej", zgodna z IRiESD) — klucz
**`rodzaj_pomiaru`**, wyłącznie dla `funkcja_pomiaru='UKLAD_ENERGII'`:

| Wartość | Układ ze standardu |
|---|---|
| `PODSTAWOWY` | układ pomiarowo-rozliczeniowy podstawowy (obowiązkowy układ punktu rozliczeniowego) |
| `REZERWOWY` | układ pomiarowo-rozliczeniowy rezerwowy |
| `ROWNOWAZNY` | układ pomiarowo-rozliczeniowy równoważny |
| `KONTROLNY` | układ pomiarowo-kontrolny |

Żadnych innych wartości (V12K-336 pkt 1). **Układ pomiarowo-kontrolny stosuje
się dla obiektów o mocy przyłączeniowej POWYŻEJ 5 MW** (dyrektywa właściciela
w zw. z IRiESD) — to WALIDACJA NORMATYWNA w warstwie zgodności (reguła
`osd_enea.metering.control_metering_above_5mw` pakietu OSD Enea; moc z
`header.connection_conditions`, bramki danych w opisie reguły), NIE twarda
brama domenowa.

### 5.3 Rozstrzygnięcie pomiaru (jedno źródło: `rozstrzygnij_pomiar_pola`)

Funkcja i rodzaj wynikają z deklaracji; bez deklaracji rozstrzyga KONTRAKT
drogi wejścia — jedno pytanie: **czy operacja deklaruje przyłącze klienta?**

- **Drogi budowy stacji** (`insert_station_on_segment_sn`,
  `append_station_on_endpoint`, aplikacja szablonu) — deklaracja stacji z polem
  POMIAROWYM opisuje przyłącze KLIENTA (§3 reguła 1), więc pole bez deklaracji
  jest **układem pomiarowym ENERGII** (`FUNKCJA_POMIARU_DOMYSLNA_BUDOWY_STACJI`).
  Skutek: surowe payloady sprzed atrybutów zachowują dotychczasową semantykę
  bramy — zero cichego poluzowania. Szablony biblioteki NIE korzystają z tej
  reguły: każdy szablon z pomiarem deklaruje JAWNIE `UKLAD_ENERGII` +
  `PODSTAWOWY` (`_resolve_sn_field_specs`, pin
  `test_kazdy_szablon_z_pomiarem_deklaruje_uklad_podstawowy_jawnie`).
- **Droga dokładania pojedynczego pola** (`add_sn_bay`, w tym rekonfiguracja
  `existing_field_ref`) — operacja NIE deklaruje przyłącza: pole pomiarowe
  dokładane do istniejącej rozdzielni (GPZ, stacja OSD) to konstrukcyjnie pole
  pomiaru NAPIĘCIA SZYN (`FUNKCJA_POMIARU_DOMYSLNA_POLA_DOKLADANEGO`). Status
  układu pomiarowego ENERGII ma skutki kontraktowe (granica stron, brama
  tranzytu) i **nigdy nie powstaje z domysłu** — wymaga JAWNEJ deklaracji
  (funkcji `UKLAD_ENERGII` albo rodzaju układu).
- **Rodzaj układu**: deklaracja rodzaju implikuje funkcję `UKLAD_ENERGII`;
  funkcja `UKLAD_ENERGII` bez rodzaju ⇒ **`PODSTAWOWY`**
  (`RODZAJ_UKLADU_DOMYSLNY`) — to reguła standardu, nie domysł: układ
  podstawowy jest obowiązkowym układem każdego punktu rozliczeniowego
  ([E-UP] pkt 3; pozostałe są układami DODATKOWYMI). Jedna reguła wszystkich
  dróg wejścia.

Kody błędów (te same na każdej operacji): `sn.funkcja_pomiaru_nieznana`,
`sn.rodzaj_pomiaru_nieznany` (wartości spoza słowników — także dawne pojęcie
„ROZLICZENIOWY" sprzed korekty V12K-336), `sn.rodzaj_pomiaru_poza_ukladem_energii`
(rodzaj przy pomiarze napięcia szyn), `sn.pomiar_poza_polem_pomiarowym`
(deklaracja na polu innej roli). Pole rekonfigurowane na rolę niepomiarową
TRACI oba atrybuty.

### 5.4 Brama — jedna reguła, wszystkie drogi

Brama odmawia **KAŻDEGO układu pomiarowego energii** (wszystkich czterech
rodzajów — kontrolny też, bo towarzyszy rozliczeniowemu w gałęzi klienta przy
granicy stron; V12K-336 pkt 3) i mieszka w JEDNEJ funkcji źródłowej
`enm.domain_operations.blad_pomiaru_w_torze_tranzytu` (reguła KLASA §3 —
predykaty parami z jednego źródła). Pomiar napięcia szyn bramie nie podlega.
Reguła pozycyjna (uściślenie reguł twardych §3 pkt 2–3): układ pomiarowy
energii na szynie prowadzącej tranzyt jest legalny WYŁĄCZNIE, gdy przed nim
(od strony zasilania) stoi **czysta pętla OSD** — prefiks sekwencji pól
zawiera pole odpływowe i nic spoza pary {dopływ, odpływ} (klasa C). Prefiks
bez odpływu = klasa B (odmowa jak dotąd); prefiks z polem spoza pętli (TR,
odgałęzienie, inny pomiar) = pomiar nie mierzy całego poboru za sobą (odmowa
— dawna brama „klasa == B" ten układ przepuszczała).

Prawda o tranzycie (druga połowa pary predykatów, udokumentowana w
`szyna_prowadzi_tranzyt_sn`):

| Droga wejścia | Tranzyt | Kod odmowy |
|---|---|---|
| `insert_station_on_segment_sn` (wcięcie; szablony klasy C, kreator stacji) | ZAWSZE — operacja rozcina odcinek | `station.insert.pomiar_w_torze_tranzytu` |
| `append_station_on_endpoint` (stacja końcowa; szablony klasy B, kreator) | NIGDY — wolny terminal, brama nie woła | — |
| `add_sn_bay` (nowe pole i rekonfiguracja; kreator „Dodaj pole SN") | z pary tranzytowej ról pól PO operacji (dopływ+odpływ) | `sn.pomiar_w_torze_tranzytu` |

Rozdzielnia GPZ nie ma pola dopływowego SN (zasila ją transformator 110/SN),
więc nie jest torem tranzytu — na szynie GPZ wolny jest i pomiar napięcia
szyn, i układ pomiarowy energii przyłącza z rozdzielni OSD (§2). Sekwencję
`add_sn_bay` ocenia się PO operacji: pole rekonfigurowane na swojej pozycji,
pole nowe na końcu; dokładanie pola na końcu nie zmienia prefiksu żadnego
istniejącego pomiaru (pin
`test_add_sn_bay_pole_za_pomiarem_nie_rusza_istniejacego_pomiaru`). Wpisy
historyczne bez funkcji ocenia operacja, która je stworzyła.

Granica mechanizmu (nazwana, nie przemilczana): brama ocenia operację
WPROWADZAJĄCĄ układ pomiarowy energii; edycja ról ISTNIEJĄCYCH pól, która
mogłaby unieważnić legalny pomiar (np. rozbrojenie pętli OSD złącza klasy C),
to zakres walidacji modelu — rejestr `docs/v12xx/REJESTR_KONFLIKTOW.md`,
wiersz POMIAR-RODZAJ.

Deklaracja w UI: kreator „Dodaj pole SN" (`ui2/kreatory/pole`) ma wybór
„Rodzaj pomiaru" (pomiar napięcia szyn / układ pomiarowy energii —
podstawowy, rezerwowy, równoważny, pomiarowo-kontrolny), widoczny wyłącznie
dla pola pomiarowego i mapowany 1:1 na `funkcja_pomiaru` + `rodzaj_pomiaru`
payloadu `add_sn_bay` (zero fantomów).

## 6. Rejestr zmian

- 2026-08-06: V1 — utworzony po korekcie właściciela (dwukrotnej) do
  V12K-329/330; źródło: [E-UP].
- 2026-08-06: etap 2 (POMIAR-ODGAŁĘZIENIE) — droga odgałęzienia dla klasy B,
  jeden słownik ról pól SN w operacjach domenowych, kolejność pól z danych;
  nazwany etap 3 (rysunek odgałęzień z punktów ZKSN/słupa).
- 2026-08-06: etap 3 (ODG-RYSUNEK) — scena SLD v3 rysuje punkty odgałęźne i
  ciągi za nimi; punkt odgałęźny jest pełnoprawnym węzłem wiersza (symbol z
  rodzaju modelu, etykieta z danych, obszar trafienia, tor rozcinany w punkcie),
  wyrocznia pokrycia porównuje model z rysunkiem po TOŻSAMOŚCI, nie po liczniku.
- 2026-08-07: §5 (karta POMIAR-RODZAJ, decyzja właściciela V12K-335 pkt 2 +
  KOREKTA WŁAŚCICIELA nr 4, V12K-336) — taksonomia pomiaru ZE STANDARDU:
  funkcja pola (`funkcja_pomiaru`: układ pomiarowy energii vs pomiar napięcia
  szyn — rozróżnienie klasowe zamiast „wyjątku GPZ") oraz rodzaj układu
  pomiarowego energii (`rodzaj_pomiaru`: PODSTAWOWY/REZERWOWY/ROWNOWAZNY/
  KONTROLNY — lista zamknięta z [E-UP] pkt 3, IRiESD; pierwotne pojęcie
  „rozliczeniowy vs kontrolny/ruchowy OSD" z V12K-335 było błędną interpretacją
  i zostało wycofane). Brama tranzytu odmawia KAŻDEGO układu pomiarowego
  energii jedną funkcją źródłową (`blad_pomiaru_w_torze_tranzytu`; reguła
  pozycyjna „czysta pętla OSD przed pomiarem" — uściślenie reguł twardych §3,
  dawna brama „klasa == B" przepuszczała prefiks z TR przed pomiarem); pomiar
  napięcia szyn wolny wszędzie; szablony klienckie deklarują jawnie
  UKLAD_ENERGII+PODSTAWOWY; kreator „Dodaj pole SN" deklaruje wybór z polską
  etykietą; walidacja normatywna „obiekt > 5 MW wymaga układu
  pomiarowo-kontrolnego" w warstwie zgodności
  (`osd_enea.metering.control_metering_above_5mw`). Przy okazji naprawiony
  defekt utrwalania `header.connection_conditions` (pole niezadeklarowane
  w `ENMHeader` gubione przy każdej walidacji modelu; teraz zadeklarowane
  i wykluczone z odcisków ENM jak pozostałe pola zmienne nagłówka).
