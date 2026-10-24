# MV-DESIGN PRO — ponowny audyt symboliki nN wobec ENEA i EPLAN
**Data:** 2026-10-24 · **Ocena właściciela:** 1/10 · **B-02:** ODRZUCONE · **Status:** AUDYT / NIE AKCEPTACJA.

## 0. Werdykt
Poprzedni atlas 37 autorskich symboli i wcześniejszy ekran rozdzielnicy **nie są podstawą wdrożenia**. Przyjęta wcześniej metoda była błędna: symbole urządzeń dobierano do efektownego podglądu, nie do typowego wyposażenia stacji ENEA; parametry, geometria montażowa i funkcjonalna symbolika mieszane; nie wykonano porównania z licencjonowanym EPLAN/IEC.

**Uwaga o dowodach:** ENEA standardy: pierwotne dokumenty publiczne oficjalnego operatora. EPLAN: publiczna dokumentacja narzędzia (nie licencjonowana baza symboli). IEC 60617: opis katalogu bazy (bez płatnych grafik). Żaden status NORMATIVE_VERIFIED ani „piksel w piksel” nie jest uzasadniony.

## 1. Weryfikowane dokumenty pierwotne

| ID | Dokument / stan | URL | Miejsca |
|---|---|---|---|
| E-630 | ENEA, Stacje elektroenergetyczne SN, Zeszyt 1, SN/nn do 630 kVA; obowiązuje 01.01.2025 | https://www.operator.enea.pl/media/683/stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-1-stacje-transformatorowe-kompaktowe | §4.2–4.5, rys. 1 (11/37), rys. 2 (16/37) |
| E-400 | ENEA, Stacje elektroenergetyczne SN, Zeszyt 2, SN/nn do 400 kVA uproszczone; obowiązuje 01.01.2025 | https://www.operator.enea.pl/media/684/stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-2-stacje-transformatorowe-kompaktowe | §4.4–4.5, rys. 1 i 2 |
| E-ZK | ENEA, Szafy kablowe oraz złącza kablowe nn z układem pomiarowo-rozliczeniowym; obowiązuje 01.02.2024 | https://www.operator.enea.pl/media/693/szafy-kablowe-oraz-zlacza-kablowe-nn-z-ukladem-pomiarowo-rozliczeniowym-energii | rys. 1 ZK1x-1P, rys. 3 ZK1-1Pp, rys. 4 SK3/ZK3; pkt 8 |
| E-GPZ | ENEA, Stacje elektroenergetyczne 110 kV, Zeszyt 1, H5; obowiązuje 02.04.2024 | https://www.operator.enea.pl/media/675/stacje-elektroenergetyczne-110-kv-zeszyt-1-stacje-dwutransformatorowe-110-kvsn-obowiazuje | załącznik Z.1 (110 kV) i Z.2 (SN): **nie są** wzorcem uniwersalnej rozdzielnicy nN |
| P-EPLAN | EPLAN Electric P8, Creating/Editing Symbols | https://eplan.help/en-us/Infoportal/Content/Plattform/2025/Content/htm/symboleditorgui_h_symboleanlegen.htm | siatka logiczna, punkt wstawienia, zaciski (numer/opis/funkcja) |
| P-EPLAN-V | EPLAN, Selecting Symbol Variants | https://www.eplan.help/en-US/Infoportal/Content/Plattform/2025/Content/htm/xsbgui_h_symbolvarianteausw.htm | warianty A–H, stała liczba punktów przyłączeniowych |
| IEC-DB | IEC 60617:2026 DB (baza symboli; publikacja 04.03.2026) | https://webstore.iec.ch/en/publication/2723 | właściwe normatywne źródło grafiki; **pełnego porównania nie wykonano** |

## 2. Konkretne odstępstwa od ENEA

| Wymaganie | Dokument / zapis | Poprzedni atlas | Oczekiwane działanie |
|---|---|---|---|
| Rozłącznik główny stacji do 630 kVA | E-630 §4.4.1: rozłącznik izolacyjny 1250 A | W demonstracji ACB 1000 A | Wycofać ACB jako model domyślny; stosować realny rodzaj i parametr 1250 A tylko dla tego profilu |
| Stacja do 400 kVA uproszczona | E-400 §4.4.1: 910 A, rozłącznik 3-biegunowy | Nie miała własnego wzorca | Oddzielny profil 400, bez dziedziczenia schematu 630 |
| Liczba miejsc | E-630 §4.4.1: 12; E-400 §4.4.1: 5 | Sztuczne 6 odpływów w przykładowej dwusekcyjnej rozdzielnicy | Parametryzowane pozycje; **pozycja dostępna ≠ zainstalowany aparat ENM** |
| Aparat odpływowy | E-630/E-400 §4.4.3: listwowy rozłącznik bezpiecznikowy wielkości 2, odłączanie jednobiegunowe | Jeden ogólny glif fuse switch bez pewnej semantyki biegunów | Funkcja 3 faz, 3 wkładki i niezależna praca jednobiegunowa, sprawdzić zaciski i tor prądowy |
| Szyny fazowe i PEN | E-630 §4.4.2: Cu cyn. 60×10 mm; E-400 §4.4.2: Cu cyn. 40×10 mm; rozstaw faz 185 mm | Poziomy przewód „BUS” i arbitralne węzły | Rozdzielić przewodniki L1/L2/L3 i PEN; rozstaw 185 mm to wymiar montażowy, nie odległość w pikselach SLD |
| Prąd znamionowy szyn | E-630 §4.5.2: 910 A (2 h 1100 A); E-400 §4.5.2: 630 A | Brak, pomieszanie z prądem aparatu głównego | Dwa oddzielne atrybuty: aparat główny vs szyny |
| Przekładniki | E-630 §4.4.8: 800:5, kl. 0,2s, 5 VA, FS5, **za głównym łącznikiem**; E-400 analogicznie | Losowe położenia pomiaru w przykładzie | Ująć 3 × CT i ich tor wtórny do listwy kontrolno-pomiarowej i AMI |
| Kondensator | E-630 §4.4.11 i E-400 §4.4.11: jeśli potrzeba kompensacji biegu jałowego, przez bezpiecznikowy aparat odpowiednio 00 / 000 | Symbole bez kontekstu | Warunkowy obwód i osobna gałąź, nie ozdoba i nie stały element każdego schematu |
| Sprzęgło i druga sekcja | Nie wynika ze standardowych rysunków RGNn 630/400 | Fikcyjne łączenie dwóch szyn | Usunąć z referencyjnych profili stacji; dopuszczać wyłącznie kiedy rzeczywiste ENM/projekt tego wymaga |
| Wzorce złączy | E-ZK rys.1,3,4: FG/F/FL/R/Wh/LP/LZ/PEN/V | Brak typów złączy i ich funkcji | Oddzielne biblioteki kompozytów ZK/SK, nie mieszane z GPZ ani RGnN |

## 3. Błędy samej koncepcji symboli

1. **Niepoprawne nazewnictwo:** ACB/MCCB to technologie wykonania wyłącznika; funkcja normowa może korzystać z jednej geometrii. Nie tworzyć różnych znaków dla każdego wyrobu bez podstawy.
2. **Zbyt mało biegunów:** symbol dwuportowy nie staje się poprawnym aparatem 3P przez dopisek „3~”. SLD może przedstawiać jeden znak reprezentujący trzy fazy, ale ENM i odwzorowanie aparatu muszą zachować wszystkie bieguny, przewody i stany.
3. **Niezweryfikowane kombinacje:** RCBO jako nałożony RCD+losowy znak, SPD w prostokącie, styki przełączne i cewki w atlasie mają status DRAFT; **nie wolno przenosić do produkcji**.
4. **Pomieszane rodzaje rysunków:** SLD jednokreskowy ≠ schemat wielokreskowy EPLAN ≠ rozmieszczenie fizyczne szafy ≠ schemat sterowania. Rys.2 ENEA 630/400 to rysunek rozmieszczenia, nie biblioteka wszystkich symboli IEC.
5. **Błędne porty semantyczne:** punkt grafiki `(x,y)` nie przesądza, czy zacisk jest L1, L2, L3, N, PE/PEN, stykiem pomocniczym czy przekładnikiem; potrzebne `terminalId/phase/potential/function/role`.
6. **Stan a typ styku:** „NO/NC” opisuje naturalny stan funkcji styku, ale „open/closed” może oznaczać bieżący stan urządzenia. Nie łączyć definicji funkcji ze stanem dynamicznym.
7. **Brak ewidencji tolerancji:** pomiary pikselowe wymagają referencji w rozdzielczości znormalizowanej, prześledzonej skali, zdefiniowanych odległości osi i kątów. Porównanie „około podobne” jest niedopuszczalne, natomiast dopóki nie ma prawa i dostępu do wzorca, żaden wynik nie jest „pixel-perfect”.
8. **Niezgodna ewidencja liczb:** lokalny atlas 37 wariantów ≠ repo 20 + 14; nie przedstawiać ich jako jednego kanonicznego zbioru.
9. **Brak dowodu E2E:** demonstracyjny HTML i same testy rejestru nie stanowią walidacji ENM → LvDomainProjectionV1 → SLD → analiz.
10. **Brak pełnego łańcucha pochodzenia źródła:** każdy symbol w przyszłej bibliotece musi mieć wersję, rysunek ENEA (dla kompozytu), numer IEC (dla geometrii), wynik oceny i stan akceptacji.

## 4. Nowa granica odpowiedzialności

**Warstwa A — Norma IEC (symbol atomowy):** geometria, funkcja, porty, warianty orientacji, stany. **Wymagana licencjonowana kontrola IEC DB przed NORMATIVE_VERIFIED.**

**Warstwa B — Standard ENEA (kompozyt aparatury):** zestawienie aparatu głównego, pomiarów, pól, układów PEN, złączy, listwowych rozłączników NH; osobna wersja schematu i osobna fizyczna elewacja rozdzielnicy.

**Warstwa C — ENM (konkretny projekt):** wyłącznie urządzenia obecne w sieci i w katalogu, z ich stanem, parametrami, pochodzeniem; rysunek w odpowiedniej projekcji `LvDomainProjectionV1`.

## 5. Wynik tej iteracji, bez naruszenia produkcji

- Dwa profile ENEA: `frontend/src/ui/sld/v3/cad/experimental/eneaLvProfiles.ts`, kontrola stałych w `__tests__/eneaLvProfiles.test.ts`.
- Porównawczy ekran źródłowy (typ stacji 630 i 400): `frontend/nn-enea-reference-review.html`, z tym samym rendererem `CadSymbol`.
- Poprzednia biblioteka demonstracyjna pozostaje **ODRZUCONA 1/10**. Kandydaci mają DRAFT. Żaden nie jest produkcyjnie aktywowany.
- Nie ma dowodu „piksel w piksel” względem EPLAN ani certyfikacji IEC; nie wykonano wiążącego odbioru wizualnego.

## 6. Bramka akceptacji

1. Każdy nowy znak ma parę: autoryzowana referencja IEC + własny wektor CAD + geometria, wymiary i porty porównane w tym samym układzie współrzędnych.
2. Każdy aparat 3P/4P ma dowód zgodności zacisków, potencjałów i stanów na rzeczywistym ENM.
3. Profile 630/400 oraz ZK1x/ZK1-1Pp/SK3 mają czytelne schematy i alternatywnie elewację fizyczną, bez mylenia obu.
4. Testy funkcji (OPEN/CLOSED/UNKNOWN, NO/NC), zweryfikowana ciągłość przewodu PEN oraz brak podszywania się odgałęzienia pod połączenie.
5. Regresja istniejącego `SldCanvasV3`, `LvDomainView`, obydwa motywy, druk A3/A4 i eksport wektorowy.
6. Ukończone weryfikacje CIs i zaakceptowane przez właściciela porównania wizualne. **Do czasu decyzji: B-02 ODRZUCONE.**
