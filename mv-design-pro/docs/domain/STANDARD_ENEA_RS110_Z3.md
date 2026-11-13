# Standard ENEA — rozdzielnie sieciowe 110 kV (Zeszyt 3) — kontrakt wiążący produktu

Status: **BINDING** (dyrektywa właściciela 2026-11-12; karta ENEA-WIEDZA 2026-11-13, grupa C).
Źródło: ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 3. Rozdzielnie sieciowe 110 kV”,
wersja 09.2022, obowiązuje od 01.01.2023 (uchwała Zarządu nr 364/2022), 14 stron (8 stron tekstu
i 6 rysunków załączników), URL:
https://www.operator.enea.pl/media/677/0303stacje-elektroenergetyczne-110-kv-zeszyt-3-rozdzielnie-sieciowe-110-kv-obowiazuje-od ,
SHA-256 pliku zaczyna się od `bb4d19af` i kończy na `4ad2` (pełny skrót w `STANDARDY_ENEA_INDEKS.md`).
PDF i rysunki NIE są w repozytorium (prawa ENEA). Dokument zawiera numery punktów, wartości
i własne sformułowania, nie cytaty.

## 1. Zakres stosowania w produkcie

Rozdzielnia sieciowa 110 kV (RS 110 kV) to rozdzielnia ENEA bez transformatora 110 kV/SN, służąca do
przyłączenia podmiotu II grupy przyłączeniowej (odbiorcy albo wytwórcy) do sieci 110 kV. Produkt nie
modeluje rozdzielni 110 kV (decyzja właściciela 2026-11-12, `STANDARD_ENEA_GPZ_Z1.md` §2), więc
wymagania tego zeszytu są informacją dla: opisu warunków przyłączenia wytwórcy do 110 kV
(`ConnectionConditions` w `enm/models.py`, obiekt umowny „punkt przyłączenia” — ADR-027), granicy
stron (własność ENEA / podmiotu) w raporcie i we wniosku do OSD, listy funkcji zabezpieczeń pola
podmiotu w ocenie zgodności przyłączenia oraz pomiaru rozliczeniowego po stronie 110 kV.

Uwaga terminologiczna: „rozdzielnia sieciowa 110 kV” z Zeszytu 3 NIE jest kategorią szablonu
produktu „Rozdzielnie sieciowe RS/RSM — bez transformatora” (`api/station_templates.py:452`), która
dotyczy rozdzielni SN. Nie wolno wiązać wymagań E3-xx z szablonem SN.

## 2. Wymagania potwierdzone w tekście standardu

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| E3-01 | §1, §2 | Zeszyt dotyczy nowych rozdzielni sieciowych 110 kV oraz rozbudowy i przebudowy istniejących, przeznaczonych do przyłączenia podmiotów II grupy przyłączeniowej; etap projektu i budowy. |
| E3-02 | §3 | RS 110 kV spełnia Zeszyt 1 z uwzględnieniem Zeszytu 3. Dwie grupy: grupa 1 — z możliwością rozbudowy do stacji 110 kV/SN; grupa 2 — bez takiej możliwości. |
| E3-03 | §3.1 | Wymagania Zeszytu 1 §11 dotyczą wszystkich pól RS 110 kV; schematy rozróżniają elementy ENEA i podmiotu oraz sposoby przyłączenia. |
| E3-04 | §3.1.1, Z.1.1, Z.1.2 | Grupa 1, wyposażenie pól: pole liniowe w kierunku systemu — jak Zeszyt 1 Z.4.1 albo Z.5.1; pole transformatorowe — rezerwa miejsca; pole łącznika szyn — jak Zeszyt 1 Z.8; pole w kierunku podmiotu — Z.4 (granica stron na odłączniku szynowym) albo Z.5 (granica stron na odłączniku liniowym). |
| E3-05 | §3.1.2, Z.2.1, Z.2.2 | Grupa 2, wyposażenie pól: pole liniowe w kierunku systemu — Zeszyt 1 Z.4.1 albo Z.5.1; pole łącznika szyn — Zeszyt 1 Z.8; pole w kierunku podmiotu — Z.4 albo Z.5 jak w grupie 1. |
| E3-06 | Z.1.1 (odczyt rysunku) | Układ grupy 1 z granicą stron na odłączniku liniowym: dwusekcyjna rozdzielnica (sekcje A i B, pola 1–7), pola liniowe z odłącznikami 1600 A, wyłącznikami 3150 A i przekładnikami zespolonymi (rdzenie 800/1/1/1/1/1 A; w polu pomiaru rozliczeniowego przekładnia przełączalna 150-300_800 albo 75-150-300_800 A), łącznik szyn z wyłącznikiem 3150 A i odłącznikami 1600 A, ograniczniki Ur ≥ 96 kV, Uc ≥ 77 kV, 10 kA, ≥ 2 kJ/kV, Upl ≤ 346 kV; pola transformatorowe jako rezerwa; granica nieruchomości ENEA zaznaczona na rysunku. Wartości są tymi samymi parametrami co w standardzie aparatury WN (§6.2, §7.2, §10.3.2, §11.2.1). |
| E3-07 | §3.2 | Infrastruktura: teren jak dla stacji 110 kV/SN według Zeszytu 1; pełna droga dojazdowa i objazdowa (bariera ogniowa); kanalizacja kablowa nn tylko do pól z urządzeniami; siatka uziemiająca na całym terenie jak dla układu docelowego; oświetlenie drogi i dojścia do budynku; budynek według Zeszytu 7. |
| E3-08 | §4 | Potrzeby własne 230/400 V AC z dwóch spośród trzech źródeł: linia SN ze stacji SN (dedykowana albo z odczepu), potrzeby własne stacji podmiotu, agregat z autostartem. |
| E3-09 | §5.1.1 | Pole liniowe w kierunku systemu i pole łącznika szyn: wymagania Zeszytu 1 §25.1, §25.2, §26. Przy granicy stron na odłączniku szynowym te pola mają rozproszone zabezpieczenie szyn zbiorczych 110 kV z łączami światłowodowymi. |
| E3-10 | §5.1.2, Z.5 | Pole liniowe w kierunku podmiotu (granica na odłączniku liniowym): zabezpieczenie podstawowe różnicowe linii 110 kV z łączem światłowodowym na dedykowanych włóknach; rezerwowe odległościowe, zerowoprądowe, nadprądowe, częstotliwościowe, napięciowe; sterownik polowy z SPZ i kontrolą synchronizmu; zabezpieczenie szyn z LRW; układ pomiarowo-rozliczeniowy podstawowy z analizatorem jakości energii i rezerwowy; pomiary lokalne; system sterowania i nadzoru. |
| E3-11 | §5.2.1, Z.4 | Pole transformatora podmiotu (granica na odłączniku szynowym): zabezpieczenie nadprądowe, częstotliwościowe, napięciowe z funkcją sterownika polowego i kontrolą synchronizmu; jednostka polowa zabezpieczenia szyn 110 kV z LRW i łączem światłowodowym do jednostki centralnej; rozliczeniowy pomiar energii podstawowy i rezerwowy (własność ENEA); pomiary lokalne; system sterowania i nadzoru; zabezpieczenia i automatyka transformatora 110 kV/SN. |
| E3-12 | §5.2.2, Z.5 | Pole transformatora podmiotu (granica na odłączniku liniowym): zabezpieczenie podstawowe różnicowe linii 110 kV z łączem na dedykowanych włóknach; rezerwowe — dla podmiotu z generacją odległościowe, zerowoprądowe, nadprądowe, częstotliwościowe, napięciowe ze sterownikiem polowym, SPZ i kontrolą synchronizmu; dla podmiotu bez generacji zerowoprądowe i nadprądowe ze sterownikiem polowym; pomiary lokalne; system sterowania i nadzoru; zabezpieczenia i automatyka transformatora 110 kV/SN. |
| E3-13 | §5.2.3 | Konfiguracja i zasięgi stref zabezpieczenia różnicowego, odległościowego i sterownika pola zależą od wyposażenia pola po stronie podmiotu; strefy mogą obejmować transformator 110 kV/SN podmiotu. |
| E3-14 | §5.3 | Dla RS grupy 1 i 2 obowiązują Zeszyt 1 §27–§31 (potrzeby własne, rejestracja zakłóceń, centralna sygnalizacja, telemechanika, węzeł teletransmisyjny). |
| E3-15 | §6.1 | Granica stron obwodów wtórnych przy granicy na odłączniku szynowym: przełącznica światłowodowa podmiotu w RS (włókna ZS i LRW 110 kV, telekomunikacji i telemechaniki); zaciski listwy kontrolno-pomiarowej obwodów prądowych i napięciowych pomiaru rozliczeniowego w polu transformatora podmiotu; listwy zaciskowe szaf licznikowych dla napięć pomocniczych. |
| E3-16 | §6.2 | Granica stron obwodów wtórnych przy granicy na odłączniku liniowym: przełącznica światłowodowa podmiotu w RS (włókna zabezpieczenia różnicowego linii, telekomunikacji i telemechaniki); listwa obwodów prądowych i napięciowych oraz listwa napięć pomocniczych dla systemu pomiarowego regulacji mocy biernej jednostek wytwórczych. |

Rozdziały formalne (tylko spis): §7 — w pozostałym zakresie Zeszyt 1 punkty 32–38; §8 — wykaz
załączników (Z.1.3, Z.2.3 i Z.3 usunięte z wersji publicznej; Z.4 i Z.5 opisane jako przykładowe
rozwiązania obwodów wtórnych).

## 3. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

Linia granicy stron, kolory własności (ENEA/podmiot), przebieg granicy nieruchomości i układ pól na
rysunkach Z.1.x i Z.2.x są przedstawieniem standardu, nie wzorem schematu jednokreskowego produktu.
Produkt nie rysuje rozdzielni 110 kV; ewentualne oznaczenie granicy stron w raporcie jest decyzją
produktu (dyspozycja B-02). Rysunki Z.4 i Z.5 standard nazywa „przykładowymi rozwiązaniami” — wymagany
jest zestaw funkcji z §5, nie układ szaf z rysunku.

## 4. Luki i niejednoznaczności

| Nr | Miejsce | Opis |
|----|---------|------|
| L3-01 | §3.1.1 a §5.2 | Tekst nazywa pole w kierunku podmiotu „pole 110 kV w kierunku podmiotu”, a §5.2 „pole transformatora podmiotu”; dla podmiotu przyłączanego linią (bez transformatora w RS) standard nie rozdziela tych przypadków. |
| L3-02 | §5.2.2 | Kryterium „podmiot z generacją / bez generacji” nie jest zdefiniowane progiem mocy ani typem modułu (NC RfG); przyjmuje się obecność jakiejkolwiek jednostki wytwórczej po stronie podmiotu. |
| L3-03 | §7 a Zeszyt 7 §14 | Zakres odesłania do Zeszytu 1 „32÷38” różni się od Zeszytu 7 „33–39” (jak L2-05 w `STANDARD_ENEA_GPZ_Z2.md`). |
| L3-04 | Z.1.3, Z.2.3, Z.3 | Plany rozdzielni i budynku usunięte z wersji publicznej — wymiary RS niedostępne. |

## 5. Mapa wdrożenia — miejsca w kodzie (stan `main` 2026-11-13, odczyt bez edycji)

Ścieżki względem `mv-design-pro/backend/src/`.

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| E3-10…E3-13 | `enm/models.py` (`ConnectionConditions`), `application/analyses/wniosek_osd.py` | Do wpięcia: lista funkcji zabezpieczeń pola podmiotu 110 kV (z generacją / bez generacji) jako informacja we wniosku do OSD i w ocenie przyłączenia wytwórcy do 110 kV. |
| E3-15, E3-16 | `application/analyses/wniosek_osd.py` | Do wpięcia: opis granicy stron obwodów wtórnych dla przyłączenia do 110 kV. |
| Uwaga terminologiczna §1 | `api/station_templates.py:452`; `application/station_templates/templates/rozdzielnia_sieciowa.py` | Nie sprzeczne, ale grożące pomyleniem: kategoria „Rozdzielnie sieciowe RS/RSM” jest rozdzielnią SN; wymagania Zeszytu 3 jej nie dotyczą. |
