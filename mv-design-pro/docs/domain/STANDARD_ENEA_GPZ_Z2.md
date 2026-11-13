# Standard ENEA — stacje jednotransformatorowe 110 kV/SN (Zeszyt 2) — kontrakt wiążący produktu

Status: **BINDING** (dyrektywa właściciela 2026-11-12: „zapamiętaj standardy ENEA i stosuj globalnie”;
karta ENEA-WIEDZA 2026-11-13, grupa C).
Źródło: ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 2. Stacje jednotransformatorowe
110 kV/SN”, wersja 09.2022, obowiązuje od 01.01.2023 (uchwała Zarządu nr 364/2022; zastępuje wersję
07.2019), 16 stron (8 stron tekstu i 8 rysunków załączników), URL:
https://www.operator.enea.pl/media/676/0204stacje-elektroenergetyczne-110-kv-zeszyt-2-stacje-jednotransformatorowe-110-kvsn ,
SHA-256 pliku zaczyna się od `9e53bf35` i kończy na `caad` (pełny skrót w
`STANDARDY_ENEA_INDEKS.md`). PDF i rysunki NIE są w repozytorium (prawa ENEA). Dokument zawiera numery
punktów, wartości i własne sformułowania, nie cytaty.

## 1. Zakres stosowania w produkcie

Zeszyt 2 jest wariantem Zeszytu 1 (`STANDARD_ENEA_GPZ_Z1.md`) dla GPZ z jednym transformatorem: we
wszystkim, czego Zeszyt 2 nie zmienia, obowiązuje Zeszyt 1 (§3, §3.2, §5, §6). Miejsca łańcucha:
kreator GPZ (szablony stacji 110/SN), model ENM (stacja, sekcje, pola SN, transformator WN/SN),
schemat jednokreskowy (skład i kolejność pól SN), ocena doboru (moc transformatora), zabezpieczenia
i automatyka (lista funkcji nieobowiązujących), raport (opis układu zasilania 110 kV).
Strona 110 kV nie jest modelowana (decyzja właściciela 2026-11-12, `STANDARD_ENEA_GPZ_Z1.md` §2) —
wiersze E2-04…E2-07 są informacją do opisu warunków zasilania.

## 2. Wymagania potwierdzone w tekście standardu

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| E2-01 | §3 | Nowa stacja jednotransformatorowa jest pierwszym etapem stacji docelowej w układzie H5; projekt minimalizuje liczbę elementów do demontażu przy rozbudowie. |
| E2-02 | §3 | Moc transformatora 110 kV/SN dostosowana do obciążenia i nie większa niż 10 MVA. |
| E2-03 | §3, §3.2, §5, §6 | W zakresie niezmienionym obowiązują wymagania Zeszytu 1 (rozdzielnia SN — Zeszyt 1 §13; obwody wtórne — Zeszyt 1 §26 z wyjątkami E2-12; pozostałe — Zeszyt 1 punkty 32–38). |
| E2-04 | §3.1 | Teren stacji umożliwia rozbudowę do H5; wymagania katalogu pól Zeszytu 1 §11.1.1 dotyczą wszystkich pól 110 kV. Uproszczenie polega na ograniczonym wyposażeniu pól liniowych i łącznika szyn oraz braku wyposażenia pola transformatora nr 2; w pełni wyposażone jest wyłącznie pole transformatorowe 110 kV (Zeszyt 1 §11.1.1.2, §12, Z.6). |
| E2-05 | §3.1.1, Z.1, Z.3, Z.4 | Wariant 1 — rozdzielnia jako wcięcie w linię 110 kV. Każde z dwóch pól liniowych (kierunki stacji „A” i „B”): odłącznik liniowy z uziemnikiem (jako uziemnik linii), dwa komplety izolatorów wsporczych, komplet ograniczników przepięć. Pole łącznika szyn: trzy komplety izolatorów wsporczych (bez aparatów). Pole transformatorowe: odłącznik szynowy z uziemnikiem (jako uziemnik pola), wyłącznik, komplet przekładników prądowo-napięciowych, komplet ograniczników przepięć. |
| E2-06 | §3.1.2, Z.5, Z.3 | Wariant 2 — zasilanie ze stacji sąsiedniej linią dedykowaną 110 kV. Pole liniowe: odłącznik liniowy z uziemnikiem, dwa komplety izolatorów wsporczych, komplet ograniczników przepięć 110 kV. Pole transformatorowe: jak w wariancie 1. Plany stacji — Zeszyt 7. |
| E2-07 | Z.1, Z.5 (odczyt rysunku) | Wartości na schematach zasadniczych: odłączniki liniowe i szynowy 1600 A, wyłącznik pola transformatora 3150 A; ograniczniki 110 kV Ur ≥ 96 kV, Uc ≥ 77 kV, 10 kA, ≥ 2 kJ/kV, Upl ≤ 346 kV; przekładnik prądowy pola transformatora 150-300/1/1/1/1 A (rdzeń I 1–2,5 VA kl. 0,2 FS5, rdzenie II–IV 5 VA kl. 5P20); przekładnik napięciowy 110/√3 / 0,1/√3 / 0,1/√3 kV (I 5 VA kl. 0,5, II 5 VA kl. 0,5/3P); punkt neutralny transformatora: odłącznik 72,5 kV i ogranicznik Ur ≥ 60 kV, Uc ≥ 48 kV, 10 kA, ≥ 2 kJ/kV, Upl ≤ 250 kV. Szyny 110 kV sekcji A i B — część linkowa (AFL) i rurowa (AR); pola przyszłe jako rezerwa miejsca. |
| E2-08 | §3.2 | Rozdzielnica SN jednosystemowa, wnętrzowa, osłonięta, zgodna z Zeszytem 1; wyposażona w pole linii zasilającej jako alternatywne zasilanie dla transformatora 110 kV/SN. |
| E2-09 | §3.2, Z.7 | Typy pól SN: pole transformatorowe (Z.11), pole zasilania zespołu uziemiającego (Zeszyt 1 Z.13, Z.14 albo Z.15), pole pomiaru napięcia (Zeszyt 1 Z.17), pole baterii kondensatorów (Zeszyt 1 Z.16), pole linii zasilającej (Zeszyt 1 Z.11), pola liniowe w liczbie według potrzeb (Zeszyt 1 Z.10), pole rezerwowe do zasilania transformatora SN/nn ZU2 (rezerwowe zasilanie potrzeb własnych 230/400 V AC). |
| E2-10 | Z.7 (odczyt rysunku) | Schemat zasadniczy rozdzielni SN: jedna sekcja „A”, numeracja nieparzysta: 1 TR 1, 3 POMIAR 1, 5 BKR 1, 7 ZU 1, 9 LINIA ZASILAJĄCA, 11 LINIA z pomiarem rozliczeniowym energii, 13 LINIA z pomiarem napięcia zwrotnego, 15–21 LINIA, 23 ZU 2. Uwagi rysunku: lokalizacja pól pokazana z uwagi na przeznaczenie; aparaty pól według schematów zasadniczych pól; liczba pól liniowych według potrzeb. |
| E2-11 | §3.2 | Pomieszczenie rozdzielni SN dla co najmniej 32 pól docelowo; rezerwowe zasilanie ZU2 potrzeb własnych instaluje się na wypadek uszkodzenia albo odstawienia pola ZU1. |
| E2-12 | §5 | Nie stosuje się punktów Zeszytu 1: §26.7.2 (zabezpieczenia linii 110 kV), §26.7.4 (łącznik szyn 110 kV), §26.7.5 (ZS z LRW 110 kV), §26.8.1 (SPZ 110 kV), §26.8.2 (praca współbieżna zabezpieczeń linii 110 kV), §26.8.3 (kontrola synchronizmu), §26.8.4 (SZR 110 kV), §26.9.5 (zabezpieczenia łącznika szyn SN), §26.10.4 (w tekście Zeszytu 2 opisany jako „SZR SN” — patrz L2-01). |
| E2-13 | §5 | Stany położenia i zdalne sterowanie łącznikami pól liniowych 110 kV realizuje sterownik polowy pola transformatora 110 kV/SN (Z.9 dla wariantu 1, Z.10 dla wariantu 2 — rysunek usunięty). |
| E2-14 | Z.9 (odczyt rysunku) | Pole transformatora strona 110 kV: rdzeń I przekładnika prądowego — pomiary lokalne, rdzeń II — sterownik pola (I>>, I>), rdzeń III — zabezpieczenie różnicowe transformatora, rdzeń IV — rezerwa; uzwojenie I przekładnika napięciowego — pomiary lokalne i regulator napięcia, uzwojenie II — sterownik pola. Zabezpieczenia fabryczne transformatora: BPZ, BT 1 st., BT 2 st., TK 1 st., TK 2 st., ZUB, ZOK; regulator napięcia z napędem przełącznika zaczepów (zaczep w górę/w dół, numer zaczepu, odstawienie ARN). Transformator: uzwojenie 110 kV w gwiazdę z punktem neutralnym przez ogranicznik i uziemnik, uzwojenie SN w trójkąt. |
| E2-15 | Z.11 (odczyt rysunku) | Pole transformatora strona SN, od szyny: wskaźnik napięcia, odłącznik z uziemnikiem (z blokadą), wyłącznik z napędem silnikowym (OW1, OW2, ZW), odgałęzienie przekładnika napięciowego z odłączeniem i uziemieniem, przekładnik prądowy, wskaźnik napięcia, głowica, ogranicznik przepięć, transformator. Przekładnik napięciowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3: I 0–10 VA kl. 0,2; II 7,5 VA kl. 0,5; III 7,5 VA kl. 0,5/3P. Przekładnik prądowy …/5/5/5/5 A: I 10 VA kl. 0,2S FS5 — układ pomiarowy bilansowo-kontrolny i analizator jakości energii; II 10 VA kl. 0,2 FS5 — pomiary lokalne strony SN i ARN; III 15 VA kl. 5P20 — zabezpieczenie różnicowe transformatora; IV 15 VA kl. 5P20 — sterownik pola (I>, I>>, IZS>>, LRW). Prąd pierwotny przekładnika uzgadnia się z ENEA według mocy transformatora. Sterownik pola przyjmuje m.in. sygnał „wyłączenie pól SN z generacją”. |
| E2-16 | §5 | Bez zmian obowiązują Zeszyt 1 §27 (potrzeby własne), §28 (rejestracja zakłóceń), §29 (centralna sygnalizacja), §30 (telemechanika), §31 (węzeł teletransmisyjny). |

Rozdziały formalne i budowlane (tylko spis): §1 — zakres tematyczny zeszytu; §2 — nowe stacje oraz
rozbudowa i przebudowa istniejących, etap projektowania i budowy; §4 — infrastruktura: teren, drogi
(pełna droga dojazdowa i objazdowa jako bariera ogniowa), kanalizacja kablowa ograniczona do pól
z urządzeniami, chodniki tylko przy polu transformatorowym i poosiowym polu liniowym, brak osłon
rurowych SN na terenie rozdzielni 110 kV, siatka uziemiająca i budynek jak dla H5 (Zeszyt 7);
§7 — wykaz załączników (Z.2, Z.6, Z.7.1, Z.8, Z.10 usunięte z wersji publicznej).

## 3. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

Kolejność pól na schemacie produktu, odstępy, szerokość pola na rysunku, symbole aparatów
i kolory są standardem wizualnym produktu (dyspozycja B-02), nie wymaganiem Zeszytu 2. Odczyty
rysunków (E2-07, E2-10, E2-14, E2-15) są wymaganiem tylko w zakresie składu, kolejności i wartości
widocznych na rysunku; nie wynika z nich układ graficzny schematu produktu.

## 4. Luki i niejednoznaczności

| Nr | Miejsce | Opis |
|----|---------|------|
| L2-01 | §5 | Zeszyt 2 wyłącza „pkt 26.10.4. Automatyka SZR SN”, a w Zeszycie 1 punkt 26.10.4 to „tryb pracy pola linii SN”, SZR SN to 26.10.5. Nie wiadomo, czy wyłączono tryb pracy linii (sprzeczne z polem linii z pomiarem napięcia zwrotnego na Z.7), czy SZR (zgodne z jedną sekcją). Przyjęcie robocze: wyłączony jest SZR SN (26.10.5) — interpretacja do potwierdzenia przez ENEA. |
| L2-02 | §3.2 a Z.7 | Tekst mówi o rezerwowym zasilaniu ZU2 „przez sekcję 2”, a rysunek Z.7 pokazuje jedną sekcję „A”. Standard nie rozstrzyga, czy rozdzielnica jednotransformatorowa ma jedną czy dwie sekcje. |
| L2-03 | Z.1, Z.5 | Ograniczniki strony SN transformatora są na rysunku bez parametrów; standard nie podaje ich wartości (Zeszyt 1 i standard aparatury WN dotyczą 110 kV). |
| L2-04 | §5 | Odsyłacz „pkt. 28. Układ centralnej sygnalizacji stacji” — w Zeszycie 1 to punkt 29 (omyłka numeracji). |
| L2-05 | §6 a Zeszyt 7 §14 | Zeszyt 2 i Zeszyt 3 odsyłają do Zeszytu 1 „punkty 32÷38”, a Zeszyt 7 do „punktów 33–39”; zakresy różnią się o jeden punkt (32 System ochrony technicznej, 39 Literatura). |
| L2-06 | §3 | Standard nie mówi, czy limit 10 MVA dotyczy także rezerwowego zasilania z pola linii zasilającej SN. |

## 5. Mapa wdrożenia — miejsca w kodzie (stan `main` 2026-11-13, odczyt bez edycji)

Ścieżki względem `mv-design-pro/backend/src/`.

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| E2-02 | `application/station_templates/templates/gpz_110_sn.py:83` (liczba transformatorów od 1) z ofertą `application/station_templates/_choices.py:69`–`:87` (10–63 MVA) | Sprzeczne: GPZ z jednym transformatorem można zbudować z transformatorem 16–63 MVA; standard dopuszcza najwyżej 10 MVA. |
| E2-09, E2-10, L2-02 | `application/station_templates/apply.py:158`–`:162`, `:232` (sekcje zawsze 2) | Sprzeczne: GPZ jednotransformatorowy dostaje dwie sekcje i sprzęgło, a Z.7 pokazuje jedną sekcję bez łącznika szyn (E2-12 wyłącza §26.9.5). |
| E2-08, E2-09 | `network_model/catalog/bay_templates.py:73` (role pól) | Do wpięcia: brak roli „linia zasilająca” (alternatywne zasilanie transformatora), roli ZU i BKR. |
| E2-12 | `application/protection_settings/engine.py` (dobór nastaw pól SN) | Do wpięcia: wariant jednotransformatorowy bez funkcji łącznika szyn SN i bez SZR. |
| E2-15 | `network_model/catalog/bay_templates.py:230` (pole TR) | Do wpięcia: przekładnie i klasy rdzeni pola transformatora strony SN. |
