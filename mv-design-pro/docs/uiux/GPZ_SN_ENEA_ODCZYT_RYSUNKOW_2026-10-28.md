# Odczyt rysunków Z.n — ENEA Operator, Stacje 110 kV, Zeszyt 1 (wersja 02.2023-2, uchwała 7/2024, obow. od 2024-04-02)
Źródło: oficjalny PDF operatora (99 stron; załączniki rastrowe s.77–99), adres w rejestrze źródeł PR #486 (`rejestr_zrodel.json`, id `enea_gp_110_z1`). Plik NIE jest w repozytorium (polityka `local_cache_only_not_commit_pdf`); poniżej odczyt własnymi słowami, bez kopii grafiki. Odczyt 2026-10-28 (render 150 dpi, fragmenty 300 dpi), weryfikacja niezależna Z.10 przez sesję główną.

**Status:** materiał wejściowy karty UX-04 (`PLANS.md` część A §C.1), bez własnego statusu. `[INTERPRETACJA]` = wniosek projektowy, nie treść normy. Sekcja „UZUPEŁNIENIE” na końcu koryguje wcześniejsze tezy (m.in. wycofana teza o uziemniku kablowym na Z.2) i ma pierwszeństwo.
Mapa stron (z liczności załączników, potwierdzona tytułami na odczytanych arkuszach): Z.2=s.78, Z.7=s.86, Z.10=s.89, Z.11=s.90, Z.11.1=s.91, Z.12=s.92, Z.13=s.93, Z.14=s.94, Z.15=s.95, Z.16=s.96, Z.17=s.97.
Z.11.1, Z.14, Z.15 — odczytane w sekcji „UZUPEŁNIENIE”.
Uwaga ogólna: na żadnym odczytanym rysunku NIE MA oznaczeń literowych aparatów (Q0, Q1, Q8, T1…). Kierunek „góra” = szyna.
[INTERPRETACJA] Wspólny „blok szynowy” każdego pola: (a) para styków rozłącznych w torze + obok symbol ziemi z kreską — odczytuję jako zestyk odłączający (człon wysuwny / odłącznik szynowy) ze stanem uziemienia; (b) kółko w torze z linią przerywaną do kwadratu z symbolem ziemi — napęd/łącznik w funkcji uziemienia (zgodne z §13: łącznik trójpołożeniowy, uziemienie przez zamknięty wyłącznik). Rysunek nie rozstrzyga wprost, czy człon jest wysuwny czy stały — §13 dopuszcza oba.

## Z.10 Pole linii odpływowej SN (s.89)
| poz | aparat | położenie | ozn. | uwagi | str |
|---|---|---|---|---|---|
|1|szyna SN L1,L2,L3|góra|—|—|89|
|2|zestyk odłączający + symbol uziemienia [INTERPRETACJA]|zaraz pod szyną|brak|—|89|
|3|kółko + przerywana do kwadratu z ziemią [INTERPRETACJA: napęd uziemienia/łącznik trójpołożeniowy]|pod poz.2|brak|—|89|
|4|wyłącznik z napędem silnikowym M (znak × na styku)|pod poz.3|brak|wysuwny/stały — NIE wynika z rysunku|89|
|5|przekładnik prądowy 1 rdzeń 200-400/5, 15 VA kl.5P20|P1 od wyłącznika, P2 od kabla|I|zasila I>, I>>, zab. ziemnozw.|89|
|6|wskaźnik napięcia (pojemnościowy)|pod CT, od strony kabla|—|—|89|
|7|głowica kablowa|pod wskaźnikiem|—|—|89|
|8|przekładnik Ferrantiego 1/100|na kablu za głowicą|—|do zab. ziemnozwarciowego|89|
|—|uziemnik od strony kabla|NIE narysowany na Z.10; na Z.2 przy polach liniowych widoczny ukośny łącznik z ziemią obok wyłącznika [INTERPRETACJA: uziemnik liniowy]|—|§13: wymóg uziemienia wyprowadzeń uziemnikami stałymi|78, druk 25/76|
Brak PN, brak ogranicznika przepięć, brak Holmgreena (wariant z Holmgreenem usunięty). Funkcje: I> (t1,t2), I>>, zab. ziemnozwarciowe (t1,t2, wejścia Io i U0 „Z,Zz”), ZS (blokowanie), LRW, SPZ (tSPZ), SCO1/SCO2/SCO-SPZ, sterownik pola. (s.89; §26.9.2 druk 52/76)

## Z.11 Pole linii SN z pomiarem rozliczeniowym energii i napięcia zwrotnego (s.90)
|poz|aparat|położenie|ozn.|uwagi|str|
|---|---|---|---|---|---|
|1|wskaźnik napięcia|bezpośrednio przy szynie|—|—|90|
|2|zestyk odłączający + ziemia [INTERPR.]|pod szyną|—|—|90|
|3|kółko/napęd uziemienia [INTERPR.]|—|—|—|90|
|4|wyłącznik z napędem M|—|—|—|90|
|5|odgałęzienie: łącznik z uziemieniem (symbol odłącznika z ziemią) → głowica/bezpiecznik? → PN 3-uzwojeniowy SN/√3 / 0,1/√3 ×3: I 0-10VA kl.0,2; II 7,5VA kl.0,2; III 7,5VA kl.0,5/3P|odgałęzienie między wyłącznikiem a CT|—|element czarny na odgałęzieniu — bezpiecznik lub głowica: NIECZYTELNE rozróżnienie|90|
|6|CT 200-400/5/5/5: I 10VA 0,2S FS5 (rozliczenie+AJEE); II 10VA 0,2 FS5 (układy regulacyjne); III 15VA 5P20 (zabezp.)|pod odgałęzieniem PN|—|—|90|
|7|wskaźnik napięcia, głowica kablowa, Ferranti 1/100|od strony kabla|—|—|90|
Funkcje: I>, I>>, zab. ziemnozw., U>, U<, f<, f>, df/dt, ZS (kierunkowe I>), LRW, SPZ, SPZE (tE), wył. od zab. TR, SCO. Uwagi na rysunku: dla kat. B3 dwa układy rozliczeniowe z jednego rdzenia; AJEE dla odbiorców >4 MW i wytwórców ≥200 kW.

## Z.7 Pole transformatora 110/SN strona SN (s.86)
Kolejność: szyna → wskaźnik napięcia → zestyk odłączający + ziemia [INTERPR.] → kółko/napęd uziemienia [INTERPR.] → wyłącznik z napędem M (OW1,OW2,ZW) → odgałęzienie PN SN/√3/0,1/√3 ×3 (I 0-10VA 0,2; II 7,5VA 0,5; III 7,5VA 0,5/3P) przez łącznik i element czarny (NIECZYTELNE: bezpiecznik/głowica), ze wskaźnikiem napięcia → CT 4 rdzenie 1000/5/5/5/5 (I 10VA 0,2S FS5 pomiar bilansowy+AJEE; II 10VA 0,2 FS5 pomiary lokalne/ARN; III 15VA 5P20 różnicowe TR; IV 15VA 5P20 I>,I>>,IZS>>) → wskaźnik napięcia → głowica → kabel → ogranicznik przepięć (przy transformatorze) → transformator Δ/Y (rysunek: górne uzwojenie trójkąt, dolne gwiazda). Przekładnie wg mocy: 1000/1600 (15 kV 25/40 MVA), 800/1200 (20 kV). Funkcje: I>, I>>, ZS (Izs>>), LRW, różnicowe, ARN, blokowanie/OW/ZW od SZR. (s.86; §26.9.4)

## Z.12 Pole łącznika szyn SN (s.92) — odpowiedź na pkt 5
Rysunek pokazuje JEDEN tor od szyny sekcji A do szyny sekcji B (bez rozbicia na dwie celki). §13 (druk 23/76): sprzęgło „w oparciu o jedną lub dwie celki” — obie wersje dopuszczone, rysunek nie wskazuje podziału.
Kolejność: szyna A → wskaźnik napięcia → zestyk odłączający + ziemia [INTERPR.] → kółko/napęd uziemienia [INTERPR.] → wyłącznik z napędem M → CT 2 rdzenie 1000/5/5 (I 15VA 5P20 → I>,I>>; II 15VA 5P20 → zab. ziemnozw.) → kółko/napęd uziemienia (symetrycznie) → zestyk odłączający + ziemia (od strony B) → wskaźnik napięcia → szyna B. Brak PN. Funkcje: I>, I>>, zab. ziemnozw., ZS, LRW. Przekładnie: 1000/1600/800/1200 jak Z.7.

## Z.2 Schemat zasadniczy rozdzielni SN (s.78) — odpowiedź na pkt 6
Rozdzielnica jednosystemowa, 2 sekcje (A pola nieparzyste 1…31, B parzyste 2…32), ustawienie dwurzędowe: rzędy naprzeciw, każda sekcja ma swoją szynę; pola odchodzą od szyny na zewnątrz (do kabla). Kolejność w sekcji A (B symetrycznie): 1/2 ŁS (łącznik szyn — połączenie przerywaną ramką między polami 1 i 2, tj. sprzęgło realizowane dwoma polami w dwóch rzędach na tym rysunku [INTERPRETACJA]; CT 1000(1600)A 15 kV / 800(1200)A 20 kV narysowany w polu 2), 3/4 BKR (CT 100 A, 3 rdzenie), 5/6 ZU (CT 100 A), 7/8 TR 1/TR 2 (z AJEE, PN, CT 1000(1600)A), 9/10 POMIAR 1/2 (PN), 11/12 LINIA* z AJEE (pomiar rozliczeniowy, PN), 13/14 LINIA** (napięcie zwrotne, PN), 15–32 linie 200–400 A (w polach 21 i 29 widnieje 630A). Każde pole ma Ferrantiego na kablu. Potrzeby własne: zasilane z ZU (Z.13 pokazuje uzwojenie potrzeb własnych 400/230 V transformatora uziemiającego) — brak osobnego pola PW. Uwagi na Z.2: wyposażenie wg schematów pól; liczba pól liniowych dostosowywana.

## Z.13 Pole ZU, dławik z automatyczną regulacją (s.93)
Szyna → zestyk odłączający+ziemia [INTERPR.] → napęd uziemienia [INTERPR.] → wyłącznik M → CT 100/5 15VA 5P20 (1 rdzeń) → ogranicznik przepięć → transformator uziemiający (ZN, + uzwojenie potrzeb własnych 400/230 V AC) → z punktu neutralnego: ogranicznik do ziemi, odłącznik → dławik z regulacją (zaczepy 500 V/100 V, przekładnik w obwodzie ziemi) + rezystor wymuszający z łącznikiem (AWSC). Funkcje: I>, I>>, Io>, Io>>, ZS, LRW, regulator dławika, ZAWSC, BTI/BTII, BDI/BDII.

## Z.16 Pole BKR (s.96)
Szyna → zestyk+ziemia [INTERPR.] → napęd uziemienia [INTERPR.] → wyłącznik z napędem → CT 100/5/5: I 10VA 0,2S FS5 (pomiar bilansowy), II/III 15VA 5P20 → wskaźnik napięcia → głowica → ogranicznik przepięć → bateria w podwójnej gwieździe z przekładnikiem niezrównoważenia między punktami gwiazd; 2 PN SN/0,1 kl.3P (L1-L2, L2-L3) jako rozładowcze/pomiar. Funkcje: I>, I>>, zab. ziemnozw., Ir> (niezrównoważenie), U>, ZS, LRW, sterowanie zegarem.

## Z.17 Pole pomiaru napięcia (s.97)
Szyna → zestyk odłączający+ziemia [INTERPR.] → napęd uziemienia [INTERPR.] → wskaźnik napięcia → głowica/element czarny (NIECZYTELNE: bezpiecznik czy głowica) → PN 3-uzwojeniowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 (I 0-10VA 0,2; II 15VA 0,5/3P; III 15VA 3P, otwarty trójkąt). Brak wyłącznika. Wtórnie wyłączniki nadmiarowe i bezpiecznik. Funkcje: U>, U<, Uo>, f<, df/dt, SCO1/2, SPZ po SCO, automatyka SZR, napięcie do pomiaru energii.

## §13 Rozdzielnia SN (druk s.23–26/76; z1.txt l.974–1100)
Jednosystemowa, dwusekcyjna, izolacja SF6 lub inna o zbliżonych właściwościach (w tym powietrzna), wnętrzowa osłonięta; pola: 2 TR, ŁS z 1 lub 2 celek, 2 ZU, 2 BKR, 2 pomiaru napięcia (po jednym na sekcję), linie wg potrzeb. Izolacja powietrzna dopuszczona w uzasadnionych przypadkach (rozbudowa): stały wyłącznik + odłącznik szynowy LUB poziomo wysuwny wyłącznik z wózkiem. Pola łukoodporne, przedziałowe (kablowy, łączników, szyn, pomocniczy; w gazowych kanał wydmuchowy). Blokady mechaniczne i elektryczne między wyłącznikiem, odłącznikiem, członem wysuwnym, uziemnikami i łącznikami trójpołożeniowymi; przy trójpołożeniowych dopuszczone uziemienie pola przez zamknięty wyłącznik. Wyłączniki próżniowe. Uziemienie każdego pola, szyn sekcji i wyprowadzeń uziemnikami stałymi, wspólny napęd 3-fazowy. Stacjonarne wskaźniki napięcia. Rozdzielnica 24 kV dla Un ≤20 kV; miejsce na co najmniej 32 pola; szerokość pola 60–80 cm (TR/ŁS do 100 cm); PN nie poza obrysem celki; SZR z przekaźnikiem w polu ŁS.

# UZUPEŁNIENIE (2026-10-28, render 300 dpi wycinków)

## Rozstrzygnięcie górnego aparatu (Z.10 s.89, Z.12 s.92; identyczny w Z.7, Z.11, Z.11.1, Z.13–Z.17)
Geometria (wycinek 300 dpi): tor od szyny kończy się krótką poziomą kreską zestyku stałego (lewy „⊥”). Obok, równolegle, drugi zestyk stały w kształcie „⊤” z symbolem ziemi nad nim (zestyk uziemiający). Poniżej, w osi toru, krótki odcinek ruchomego ostrza zaczyna się w PRZERWIE między tymi dwoma zestykami (nie dotyka żadnego) i schodzi do małego kółka (punkt obrotu ostrza). Od ostrza w bok biegnie linia przerywana (sprzężenie mechaniczne) do kwadratu (napęd); pod kwadratem przerywana pionowa kończy się poziomą kreską — NIECZYTELNE znaczenie (prawdopodobnie sprzężenie/blokada napędu, nie ziemia robocza).
Wniosek [INTERPRETACJA, zgodna z §13 druk 24/76 o łącznikach trójpołożeniowych]: łącznik trójpołożeniowy szynowy (zamknięty = ostrze na zestyku szyny; otwarty = pozycja środkowa, narysowana; uziemiony = ostrze na zestyku ziemi). Uziemia stronę ODpływową łącznika, czyli tor w kierunku wyłącznika; uziemienie kabla następuje przez zamknięty wyłącznik (§13 to dopuszcza). Osobnego uziemnika od strony kabla na rysunkach pól NIE MA.
Z.12: ten sam łącznik trójpołożeniowy po obu stronach wyłącznika, lustrzanie — od strony sekcji B zestyk szyny i zestyk ziemi są na dole, kółko obrotu nad nimi (wycinek dolny s.92). Uziemione mogą więc być obie strony wyłącznika sprzęgła.
Korekta Z.2 (s.78): ukośny łącznik z ziemią przy polach liniowych to ten sam łącznik trójpołożeniowy, nie oddzielny uziemnik kablowy (poprzednia interpretacja wycofana).

## Odgałęzienia PN (Z.7 s.86, Z.11 s.90, Z.11.1 s.91, Z.17 s.97)
Czarny prostokąt z półokręgiem to TEN SAM symbol co głowica kablowa w torze głównym (np. Z.10 nad Ferrantim). Odczytuję go jako głowicę/złącze konektorowe (PN przyłączony kablem lub wtykowo), NIE bezpiecznik [INTERPRETACJA — wyróżnionego symbolu bezpiecznika SN na odgałęzieniu brak]. Bezpieczniki występują tylko po stronie wtórnej (Z.17: wyłączniki nadprądowe i wkładka w obwodach 0,1 kV).
Z.7/Z.11/Z.11.1: odgałęzienie zaczyna się od węzła w torze ZA wyłącznikiem (między wyłącznikiem a przekładnikami prądowymi). Na odgałęzieniu: łącznik, którego ostrze ma punkt obrotu po stronie PN, a nad nim zestyk z ziemią — odłącznik z uziemieniem (trójpołożeniowy) [INTERPRETACJA]; dalej głowica/złącze, PN 3×jednofazowy. W Z.7 obok łącznika dodatkowy symbol ziemi poziomo.
Z.17: PN wpięty kablem (głowica) wprost do toru za łącznikiem trójpołożeniowym; brak wyłącznika i brak łącznika na odgałęzieniu.

## Z.7 — dodatkowo (s.86)
Uzwojenie przyłączone do kabla SN (górne na rysunku) = TRÓJKĄT; dolne (strona 110 kV) = GWIAZDA. Transformator i kabel narysowane przerywanie (poza rozdzielnicą). [INTERPRETACJA: SN w trójkącie, stąd potrzeba zespołu uziemiającego.]
Kolejność względem wyłącznika: wyłącznik → węzeł odgałęzienia PN → CT 4 rdzenie → wskaźnik napięcia → głowica → kabel → ogranicznik przepięć przy zaciskach transformatora (poza celką, na końcu kabla) → transformator.

## Z.11.1 Pole linii SN z pomiarem napięcia zwrotnego (s.91)
|poz|aparat|położenie|ozn.|uwagi|str|
|---|---|---|---|---|---|
|1|wskaźnik napięcia|przy szynie|—|—|91|
|2|łącznik trójpołożeniowy z napędem [INTERPR.]|pod szyną|—|—|91|
|3|wyłącznik z napędem M|—|—|—|91|
|4|odgałęzienie: odłącznik z uziemieniem → głowica/złącze → PN SN/√3 / 0,1/√3 ×3 (I 0-10VA 0,2; II 7,5VA 0,2; III 7,5VA 0,5/3P)|za wyłącznikiem, przed CT|—|napięcie zwrotne|91|
|5|CT 200-400/5, 1 rdzeń 15VA 5P20|pod odgałęzieniem|—|I>, I>>|91|
|6|wskaźnik napięcia, głowica, Ferranti 1/100|od kabla|—|zab. ziemnozw.|91|
Funkcje: I>, I>>, ziemnozw., U>, U<, f<, f>, df/dt, ZS (kierunkowe I>), LRW, SPZ, SPZE, wył. od zab. TR, SCO. Brak pomiaru rozliczeniowego.

## Z.14 ZU, układ równoległy dławik–rezystor (s.94)
Szyna → łącznik trójpołożeniowy [INTERPR.] → wyłącznik M → CT 100/5 15VA 5P20 → ogranicznik przepięć → transformator uziemiający (ZN + uzwojenie potrzeb własnych 230/400 V AC; BTI/BTII). Z punktu neutralnego: ogranicznik do ziemi; opcjonalny CT (gwiazdka: alternatywne położenie przekładnika prądowego); dwie gałęzie równoległe, każda przez odłącznik: (a) dławik z regulacją (500 V, BDI/BDII) do ziemi, (b) rezystor + przekładnik prądowy do ziemi (zab. Io>, Io>>). Funkcje: I>, I>>, Io>, Io>>, ZS, LRW, ZAWSC.

## Z.15 ZU, sieć uziemiona przez rezystor (s.95)
Szyna → łącznik trójpołożeniowy [INTERPR.] → wyłącznik M → CT 100/5 15VA 5P20 → ogranicznik → transformator uziemiający (+ potrzeby własne 400/230 V). Z punktu neutralnego: ogranicznik do ziemi; odłącznik → rezystor → przekładnik prądowy → ziemia. Funkcje: I>, I>>, Io>, Io>>, ZS, LRW, SPZ (zgodnie z §26.9.6: SPZ tylko przy rezystorze).

## Z.2 — dodatkowo (s.78)
Pola liniowe: 11 na sekcję (A: 11,13,15,…,31; B: 12,14,…,32), w tym 1 z pomiarem rozliczeniowym (11/12) i 1 z napięciem zwrotnym (13/14) oraz 9 zwykłych. Pole pomiaru napięcia (9/10) — BEZ wyłącznika: łącznik trójpołożeniowy, wskaźnik napięcia i PN (zgodnie z Z.17). Pole ZU 2 i BKR 2 w sekcji B — w torze rysunek pokazuje ukośny łącznik bez znaku wyłącznika — NIECZYTELNE przy 150 dpi, przyjmuję wyposażenie wg Z.13–Z.16 (z wyłącznikiem).

# Wnioski dla modelu ENM [INTERPRETACJA projektowa, nie treść normy]
Rodzaje aparatów (port we = strona szyny, port wy = strona odpływu):
1. Szyna sekcji SN (węzeł; sekcje A/B).
2. Łącznik trójpołożeniowy szynowy (we: szyna; wy: tor pola; stany ZAMKNIĘTY/OTWARTY/UZIEMIONY; uziemia stronę wy) — Z.10, Z.7, Z.12 (×2, po obu stronach wyłącznika), Z.17.
3. Wyłącznik z napędem silnikowym (we/wy; brak impedancji) — Z.10, Z.7, Z.12; w Z.17 brak.
4. Przekładnik prądowy wielordzeniowy (we/wy w torze; atrybut: przekładnia, lista rdzeni z mocą i klasą) — Z.10 (1 rdzeń), Z.7 (4), Z.12 (2), Z.11 (3).
5. Węzeł odgałęzienia + odłącznik z uziemieniem odgałęzienia (we: węzeł toru; wy: PN) — Z.7, Z.11, Z.11.1.
6. Przekładnik napięciowy (port jeden — końcówka odgałęzienia; uzwojenia z mocą/klasą; uzwojenie otwartego trójkąta w Z.17).
7. Wskaźnik napięcia pojemnościowy (odgałęzienie bez obciążenia, port jeden) — przy szynie i/lub od strony kabla.
8. Głowica kablowa/złącze (we: tor; wy: kabel) — Z.10, Z.7, Z.12 brak, Z.17 (do PN).
9. Przekładnik Ferrantiego (na kablu; port jeden pomiarowy, bez przerwy toru) — Z.10, Z.11, Z.11.1.
10. Ogranicznik przepięć (odgałęzienie do ziemi, port jeden) — Z.7 przy transformatorze, Z.13–Z.16.
11. Transformator 110/SN (strona SN Δ, 110 kV Y) — koniec toru Z.7 (przez kabel).
Pole Z.12 łączy dwie szyny (we: szyna A, wy: szyna B) — jeden obiekt pola lub dwie celki, obie opcje dozwolone (§13).

# Porównanie Z.10 / Z.11.1 / Z.11 i klasa pola liniowego (karta UX-04/POLE-LINIOWE-WZORZEC, 2026-10-28)

Odwzorowanie w modelu: `docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md` (macierze aparat → port → symbol). Poniżej różnice rysunków i wymagania klas własnymi słowami.

## Porównanie wykonań pola liniowego
| Cecha | Z.10 (s.89) | Z.11.1 (s.91) | Z.11 (s.90) |
|---|---|---|---|
| wskaźnik napięcia przy szynie | brak | jest | jest |
| łącznik szynowy | trójpołożeniowy [INTERPR.] | trójpołożeniowy [INTERPR.] | trójpołożeniowy [INTERPR.] |
| wyłącznik z napędem M | jest | jest | jest |
| odgałęzienie PN za wyłącznikiem, przed CT | brak | odłącznik z uziemieniem → głowica/złącze → PN SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 | jak Z.11.1 |
| uzwojenie I PN | — | 0-10 VA kl. 0,2 (napięcie zwrotne) | 0-10 VA kl. 0,2 (rozliczenie) |
| przekładnik prądowy | 200-400/5, 1 rdzeń 15 VA 5P20 | 200-400/5, 1 rdzeń 15 VA 5P20 | 200-400/5/5/5: 10 VA 0,2S FS5 (rozliczenie i AJEE), 10 VA 0,2 FS5 (regulacja), 15 VA 5P20 (zabezpieczenia) |
| wskaźnik napięcia od kabla, głowica, Ferranti 1/100 | jest | jest | jest |
| funkcje na rysunku | I>, I>>, ziemnozw., ZS, LRW, SPZ, SCO1/SCO2/SCO-SPZ | jak Z.10 + U>, U<, f<, f>, df/dt, kierunkowe I>, SPZE, wył. od zab. TR; brak SCO-SPZ | jak Z.11.1 |
| pomiar rozliczeniowy (AJEE) | brak | brak | jest — odbiorcy > 4 MW, wytwórcy ≥ 200 kW (uwaga rysunku) |

Wykonanie łączników (§13, druk 23–25) jest drugą, niezależną osią: łącznik trójpołożeniowy (podstawowe), wyłącznik stały z odłącznikiem szynowym albo wyłącznik poziomo wysuwny (izolacja powietrzna „w uzasadnionych przypadkach"); przy wyłączniku stałym i wysuwnym — uziemniki stałe wyprowadzenia i odgałęzienia PN (§13: uziemienie wyprowadzeń uziemnikami stałymi).

## Klasy pola liniowego SN (IRiESD ENEA Operator, wersja 2.3, II.4.5.4.2.1–2.3)
Źródło odczytu: IRiESD (tekst ujednolicony obowiązujący od 2026-10-19, s.51–55), katalog sygnałów telemechaniki ENEA (sekcje „Linia SN", „Linia SN z generacją"), Zeszyt 1 §26.9.2–26.9.3, §26.10.4. Pliki źródłowe NIE są w repozytorium.

| Funkcja (kod modelu) | ODBIORCZE (II.4.5.4.2.1) | MIESZANE (II.4.5.4.2.2) | DEDYKOWANE_WYTWORCY (II.4.5.4.2.3) |
|---|---|---|---|
| nadprądowe zwłoczne i zwarciowe (51, 50) | wymagane (pkt 1) | wymagane (pkt 1) | wymagane (pkt 1) |
| ziemnozwarciowe (67N) | wymagane (pkt 2) | wymagane (pkt 2) | wymagane (pkt 2) |
| SPZ (79) | wymagane w linii napowietrznej i napowietrzno-kablowej (pkt 3) | jw. (pkt 3) | **niedopuszczalne** — brak w liście; rozstrzygnięcie sesji głównej |
| SPZE | z rysunku Z.11/Z.11.1 | z rysunku | **niedopuszczalne** (jak SPZ) |
| współpraca z ZS i LRW (ZS, 50BF) | wymagana (pkt 4) | wymagana, wyłączają także linie z elektrowniami (pkt 4; II.4.5.4.7.1 pkt 3–4) | wymagana (pkt 3; II.4.5.4.7.1 pkt 3–4) |
| podczęstotliwościowe (81U) | wymagane, z blokadą zależną od kierunku przepływu mocy (pkt 5) | na żądanie OSD (pkt 5) | na żądanie OSD (pkt 4) |
| f>, df/dt (81O, 81R) | — | na żądanie OSD (pkt 5) | na żądanie OSD (pkt 4) |
| U<, U> (27, 59) z przekładników od strony linii | — | na żądanie OSD (pkt 6) | na żądanie OSD (pkt 5) |
| blokada załączenia przy napięciu w linii / synchronizm (NZ) | — | na żądanie OSD (pkt 7) | na żądanie OSD (pkt 6) |
| blokada kierunkowa wyłączenia (67) | — | na żądanie OSD (pkt 8) | brak w liście — pomijana |
| SCO, SPZ/SCO | SCO dopuszczalne, SPZ/SCO na żądanie OSD (pkt 6) | **niedopuszczalne** (II.4.5.4.7.1 pkt 1) | **niedopuszczalne** (II.4.5.4.7.1 pkt 1) |
| przekładnik napięciowy od strony linii | niewymagany | wymagany → wyłącznie Z.11.1 albo Z.11 | wymagany → wyłącznie Z.11.1 albo Z.11 |

Odwzorowanie w modelu (decyzja architekta 2026-10-30, karta UX-04/POLE-LINIOWE-WZORZEC §11.11
pkt B): wiersz „SCO, SPZ/SCO" jest JEDNĄ funkcją pola `SCO` — wyłączenie od stopni SCO1, SCO2
i ponowne załączenie po SCO (rysunki s.89, s.90, s.91 prowadzą obwody okrężne SCO1, SCO2
i „SCO/SPZ" do jednego sterownika pola, bez osobnego bloku „SPZ po SCO"). O udziale pola
w SCO z ponownym załączeniem decyduje operator (pkt 6: „SPZ/SCO — jeśli ENEA Operator tego
wymaga"; II.4.5.4.7.1 pkt 1–2), więc w klasie odbiorczej funkcja ma wymóg „na żądanie OSD";
w klasach z generacją pozostaje niedopuszczalna. Osobnego kodu „SPZ/SCO" słownik funkcji nie zna.

Typ modułu wytwarzania za polem (IRiESD, słownik pojęć): A 0,8 kW–< 200 kW, B 200 kW–< 10 MW, C 10–< 75 MW, D ≥ 75 MW lub przyłączenie ≥ 110 kV. [INTERPRETACJA] Próg AJEE wytwórcy ≥ 200 kW z rysunku Z.11 jest zbieżny z dolną granicą typu B.

Rozbieżności źródeł: (1) rysunek Z.10 nie wymienia zabezpieczenia podczęstotliwościowego, którego IRiESD II.4.5.4.2.1 pkt 5 wymaga w polu odbiorczym — model dopisuje 81U klasą odbiorczą; (2) Zeszyt 1 §26.9.3 i rysunki Z.11/Z.11.1 wymieniają SCO, a IRiESD II.4.5.4.7.1 pkt 1 zakazuje uruchamiania SCO w liniach z jednostkami wytwórczymi — model stosuje IRiESD (dokument nowszy i nadrzędny dla warunków przyłączenia) i usuwa SCO w klasach z generacją (opis: `docs/uiux/RAPORT_ROZBIEZNOSCI_GPT_GPZ_SN_2026-10-28.md` §13).
