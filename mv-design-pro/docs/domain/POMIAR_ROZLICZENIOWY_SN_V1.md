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
- Etap 2 (karta POMIAR-ODGAŁĘZIENIE, do zlecenia): tryb aplikacji szablonu
  klasy B jako odgałęzienie (`start_branch_segment_sn` + stacja końcowa)
  zamiast wcięcia przelotowego; kompozycja rysunku gałęzi klienta za polem
  pomiarowym (klasa C); scenariusz sieci pokazowej bez stacji klienckich
  wciętych w tranzyt.

## 5. Rejestr zmian

- 2026-08-06: V1 — utworzony po korekcie właściciela (dwukrotnej) do
  V12K-329/330; źródło: [E-UP].
