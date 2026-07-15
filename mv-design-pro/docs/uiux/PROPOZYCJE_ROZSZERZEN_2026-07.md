# PROPOZYCJE ROZSZERZEŃ — CZEGO JESZCZE POTRZEBUJE INŻYNIER (2026-07)

**Status:** ZATWIERDZONE ZASADĄ „NA MAX" (decyzja właściciela 2026-07-15: „zawsze robimy na max —
jeśli czegokolwiek brakuje, od razu rozbuduj, jeśli trzeba, rozbuduj backend"). Wszystkie pozycje
wchodzą do backlogu epików; właściciel zachowuje prawo weta i zmiany kolejności (Program §2.0).
**Data:** 2026-07-15
**Zakres backendowy:** delta backendowa jest w zakresie programu (Program §2.0 pkt 2) —
z zachowaniem kanonu fizyki (WHITE BOX, warstwy, katalog-first, determinizm, FROZEN Result API).

---

## Grupa I — odsłonięcie istniejących możliwości backendu (szybkie zwycięstwa)

| # | Propozycja | Uzasadnienie inżynierskie | Stan backendu | Epik |
|---|---|---|---|---|
| P1 | **Panel jakości energii: harmoniczne** | ocena THD przy falownikach OZE — wymagana przy przyłączeniach | jest (`power_quality_harmonics` w rejestrze zdolności, ekrany V12.6) | E11 |
| P2 | **Zdolność przyłączeniowa (hosting capacity)** | „ile jeszcze OZE zmieści się w tej sieci" — pytanie nr 1 projektanta OZE | jest (`hosting_capacity`) | E11 |
| P3 | **Rozruch silników** | spadki napięcia przy rozruchu dużych napędów (stacje przemysłowe) | jest (`motor_starting`) | E8 |
| P4 | **Niezawodność / awarie N-1** (SAIDI/SAIFI, warianty zasilania) | uzasadnienie pierścieni i NOP twardymi wskaźnikami | jest (`reliability_contingency`) | E8 |
| P5 | **Bezpieczeństwo uziemień** (napięcia dotykowe/rażeniowe, dobór uziemienia punktu neutralnego) | obowiązkowe przy projektach stacji; dziś głęboko ukryte | jest (`earthing_safety`, `neutral_earthing_design`, `earth_fault_detection`) | E10 |
| P6 | **Koordynacja izolacji + przepięcia łączeniowe (TRV)** | dobór ograniczników i aparatów przy sieciach kablowych z OZE | jest (`insulation_coordination`, `transient_trv`) | E10 |

## Grupa II — warsztat projektanta (nowe funkcje UI na istniejących danych)

| # | Propozycja | Uzasadnienie inżynierskie | Nakład | Epik |
|---|---|---|---|---|
| P7 | **Profile obciążeń i generacji** (dobowe/sezonowe, typ odbiorcy; profil PV/FW wg lokalizacji) | rozpływ „na szczycie" to za mało przy OZE — potrzebne 8760 h albo profile charakterystyczne | UI + dane profili; rozpływ istnieje | E8 |
| P8 | **Automatyczny dobór przekroju kabla/linii** (kryteria: obciążalność, ΔU, I″k, I²t; propozycja z katalogu z uzasadnieniem WHITE BOX) | najczęstsza czynność projektanta; dziś ręczna pętla | logika doboru = analiza (bez fizyki nowej), katalog istnieje | E3/E4 |
| P9 | **Karta doboru aparatu** (porównanie parametrów granicznych aparatu z wynikami: I″k vs I_dyn/I_th, obciążenie vs In) | dowód „aparatura dobrana poprawnie" do projektu — dziś rozproszone | UI nad istniejącymi wynikami + katalogiem (proof Equipment istnieje) | E4/E9 |
| P10 | **Generator kompletu do wniosku OSD** (jeden przycisk: bilans mocy, zwarcia, zgodność NC RfG, schemat, zestawienia → paczka PDF) | cel końcowy większości projektów OZE; dziś składane ręcznie z kilku raportów | UI/raporty nad istniejącymi eksportami | E13 |
| P11 | **Rewizje modelu + porównanie rewizji** („co się zmieniło od wersji do OSD": diff elementów i parametrów) | audytowalność projektu w czasie; snapshot/archiwum już wersjonowane | UI + diff (archive_diff w API istnieje, niewpięty) | E2 |
| P12 | **Biblioteka wymagań OSD** (profile wymagań operatorów: poziomy napięć, granice cosφ, wymogi NC RfG per moc) | te same dane wpisywane w kółko; różnice między OSD są źródłem błędów | dane + UI; profile operatora częściowo w NC RfG | E11 |

## Grupa III — realizacja po U5 (największy nakład; w zakresie zasadą „na max", kolejność na końcu)

- **Optymalizacja rozcięć i OPF/straty–koszty (LCC)** — backend `opf_loss_lcc` istnieje;
  pełny warsztat optymalizacyjny to osobny wątek produktowy.
- **Analiza niepewności** (`uncertainty_sensitivity` istnieje) — pasmo wyników zamiast punktu.
- **Import podkładu GIS / trasy kablowe po mapie** — duży temat; wymaga decyzji o formatach
  (GML/SHP) i prawach do podkładów.
- **Eksport/import formatów wymiany** (CIM/CGMES, pandapower) — interoperacyjność z narzędziami
  OSD; duża delta backendowa (w zakresie zasadą „na max"; kolejność po U5).
- **Tryb wariantowania „co-jeśli"** (drzewo wariantów projektu z porównaniem zbiorczym) —
  naturalne rozszerzenie przypadków; do projektu po U3.

## Grupa IV — dalsze ulepszenia per specjalista (runda 2, 2026-07-15; zatwierdzone zasadą „na max")

| # | Specjalista | Propozycja | Uzasadnienie | Epik |
|---|---|---|---|---|
| P13 | Zabezpieczeniowiec | **Kreator nastaw zabezpieczeń** — automatyczna propozycja nastaw I>/I>>/I0> z warunkami czułości i selektywności, dowód WHITE BOX doboru; tabela nastaw do eksportu (arkusz nastawień dla przekaźników) | dobór nastaw to dziś ręczna iteracja po TCC; metoda doboru już w backendzie (dobór wg Hoppela) | E10 |
| P14 | Zabezpieczeniowiec | **Weryfikacja czułości ziemnozwarciowej** — dobór i sprawdzenie zabezpieczeń ziemnozwarciowych wg sposobu uziemienia punktu neutralnego | sieci kompensowane/uziemione przez rezystor wymagają odrębnej weryfikacji; backend ma detekcję ziemnozwarciową | E10 |
| P15 | Pomiarowiec | **Dobór przekładników** — klasa, moc, sprawdzenie nasycenia przekładnika prądowego przy zwarciu (współczynnik graniczny dokładności vs I″k), obwody wtórne | błędny dobór przekładnika unieważnia zabezpieczenia; wyniki zwarciowe już są | E4/E10 |
| P16 | Eksploatacja / dyspozytor | **Tryb przełączeń** — symulacja kolejności łączeń na schemacie (otwórz/zamknij krok po kroku), warunki blokad, generowana instrukcja przełączeń | most między projektem a eksploatacją; stany łączników i warianty już w modelu | E14/E7 |
| P17 | Kosztorysant | **Przedmiar i kosztorys** — z zestawień materiałowych (typy katalogowe × ceny jednostkowe), koszt strat rocznych z rozpływu | zestawienia już istnieją; cennik jako dane katalogowe | E13 |
| P18 | Projektant nn | **Ciąg nn od stacji do odbioru** — spadki napięć end-to-end (SN+nn), selektywność zabezpieczeń nn (bezpiecznik–wyłącznik), warunek samoczynnego wyłączenia per obwód | pętla zwarciowa IEC 60364 już w solverach; brakuje warsztatu obwodowego | E10 |
| P19 | Developer OZE | **Ranking punktów przyłączenia** — porównanie wariantów miejsca przyłączenia źródła (zdolność, straty, koszt przyłącza, wymogi NC RfG) w jednej tabeli | pytanie „gdzie najtaniej przyłączyć" — dziś wiele ręcznych przebiegów; silniki analiz są | E11 |
| P20 | Wszyscy | **Asystent braków** — panel „co jeszcze musisz uzupełnić, żeby osiągnąć cel X" (analiza / raport / wniosek OSD) z listą kroków i głębokimi linkami | odwrócenie gotowości: od celu do brakujących danych | E6 |
| P21 | Audytor / OSD | **Dziennik projektu** — automatyczny zapis decyzji (operacje, zmiany nastaw, rewizje) z podpisem czasowym, eksport do dokumentacji | audytowalność end-to-end; operacje domenowe już są zdarzeniami | E2/E13 |
| P22 | Profesor / dydaktyka | **Tryb objaśnień** — przełącznik „pokaż teorię": przy każdym wyniku skrót teoretyczny (wzory, założenia, odsyłacz do normy) rozszerzający dowód WHITE BOX | istnieje warstwa akademicka V12.6; spiąć ją z codziennym warsztatem | E9 |

## Grupa V — runda 3 (2026-07-15): poziom profesorski dla czterech specjalności

Zatwierdzone zasadą „na max". „Δbackend" = wymaga delty backendowej (nowa analiza/rozszerzenie —
w zakresie programu, kanon fizyki obowiązuje: WHITE BOX, warstwy, determinizm).

### Profesor energetyki — rygor naukowy wyników

| # | Propozycja | Treść inżynierska | Δbackend | Epik |
|---|---|---|---|---|
| P23 | **Propagacja niepewności do wyników** | tolerancje parametrów katalogowych (±ΔR, ±Δuk), temperatura, klasa danych wejściowych → pasmo ufności na każdej wielkości wynikowej (I″k = 12,84 kA ± 0,31); wykresy z pasmami; rozwija istniejące `uncertainty_sensitivity` | częściowa | E8/E9 |
| P24 | **Walidacja metodą niezależną** | automatyczny cross-check: rozpływ NR vs GS vs FD (zbieżność do tolerancji), zwarcia metodą IEC vs superpozycją z rozpływem; raport rozbieżności z progiem alarmu; rozwija `benchmark_validation` | częściowa | E8 |
| P25 | **Rejestr założeń projektu** | każde założenie (c, temperatura, stan łączeń, uproszczenia modelu) w jednym rejestrze z konsekwencjami („zawyża I″k po stronie bezpiecznej") i odsyłaczem do rozdziału normy; dowody cytują rejestr zamiast rozpraszać założenia | nie | E9 |
| P26 | **Automatyczna analiza wymiarowa** | każdy krok dowodu z kontrolą jednostek (symbolicznie: [A]=[V]/[Ω]); błąd wymiarowy = blokada publikacji dowodu | częściowa | E9 |

### Specjalista analiz sieciowych — głębia obliczeniowa

| # | Propozycja | Treść inżynierska | Δbackend | Epik |
|---|---|---|---|---|
| P27 | **Analiza wielookresowa (profile czasowe)** | rozpływ sekwencyjny na profilach (typowe doby / 8760 h): histogramy napięć per szyna, krzywe uporządkowane obciążeń, energia strat rocznych, liczba godzin naruszeń; fundament dla P7 i wymiarowania BESS | TAK | E8 |
| P28 | **Systematyczny skan kontyngencji N-1** | automatyczne wyłączanie każdej gałęzi → ranking krytyczności (przeciążenia, napięcia, niedostarczona moc); mapa słabych punktów sieci; rozwija `reliability_contingency` | częściowa | E8 |
| P29 | **Współczynniki wrażliwości węzłowych** | macierze dV/dP, dV/dQ per węzeł (z Jacobianu — WHITE BOX już go eksponuje), wpływ 1 MW/1 MVar w węźle X na profil; tabela „gdzie interwencja da najwięcej" | częściowa | E8 |
| P30 | **Obszary bezpiecznej pracy P–Q** | wykres zdolności P–Q w punkcie przyłączenia (ograniczenia: napięcia, obciążalność, zwarcia) + mapy U–Q per szyna; rozwija `reactive_adequacy` | częściowa | E11 |

### Projektant sieci i stacji

| # | Propozycja | Treść inżynierska | Δbackend | Epik |
|---|---|---|---|---|
| P31 | **Weryfikacja kaskady zasilania end-to-end** | jeden przebieg: GPZ→magistrala→stacja→nn→odbiór; kaskadowa kontrola przekrojów, aparatów, zabezpieczeń i spadków z raportem zgodności per ciąg; łączy P8/P9/P18 w jedną operację | częściowa | E3/E10 |
| P32 | **Optymalizacja punktu podziału (NOP)** | ranking lokalizacji NOP wg strat, SAIDI, prądów wyrównawczych przy przełączeniach; warianty jako przypadki pochodne | TAK | E8 |
| P33 | **Projekt uziomu stacji** | siatka uziomowa: rezystancja wypadkowa, napięcia krokowe i dotykowe (PN-EN 50522), dobór przewodów uziomowych do I″k1 i czasu wyłączenia; rozwija `earthing_safety` do warstwy projektowej | TAK | E10 |
| P34 | **Dobór ograniczników przepięć** | energia, napięcie trwałej pracy, odległość ochronna od chronionego aparatu; spina `insulation_coordination` z katalogiem ograniczników | częściowa | E10 |

### Specjalista OZE

| # | Propozycja | Treść inżynierska | Δbackend | Epik |
|---|---|---|---|---|
| P35 | **Studium przyłączenia end-to-end** | kreator studium: warianty punktu przyłączenia → wymagane analizy w sekwencji (zwarcia, rozpływ, zdolność, NC RfG, harmoniczne) → dokument studium wykonalności przyłączenia; spina P2/P10/P19 w przepływ | częściowa | E11/E13 |
| P36 | **Strategie pracy magazynu** | symulacja BESS na profilach: ścinanie szczytu, ograniczanie oddawania, współpraca z PV (autokonsumpcja), praca wyspowa; wynik: wymiarowanie mocy/pojemności z uzasadnieniem | TAK (po P27) | E11 |
| P37 | **Migotanie i szybkie zmiany napięcia** | ocena flickera (Pst/Plt) i szybkich zmian napięcia od FW/PV wg IEC 61000-3-7 w punkcie przyłączenia; uzupełnia harmoniczne o pełną jakość energii | TAK | E11 |
| P38 | **Walidacja modelu falownika testami** | porównanie odpowiedzi modelu FRT/regulatorów z przebiegami testów zgodności NC RfG (obwiednie); werdykt „model odzwierciedla urządzenie" do studium | częściowa | E11 |

Okna dla P23–P38 dostają identyfikatory W-… przy rozpisywaniu kart (zarządca aktualizuje deltę
rejestru w AUDYT_RADY_SPECJALISTOW / MODEL_INTERAKCJI §4).

## Grupa VI — runda 4 (2026-07-15): specjalista OZE / NC RfG NA MAKSIMUM

Dyrektywa właściciela: „rozwijamy maksymalnie specjalistę OZE/NC RfG". Strumień OZE dostaje
PRIORYTET w kolejności realizacji (patrz niżej). Zatwierdzone zasadą „na max".

| # | Propozycja | Treść inżynierska | Δbackend | Epik |
|---|---|---|---|---|
| P39 | **Macierz wymogów NC RfG per moduł** | pełna, interaktywna macierz wymagań modułu B/C/D (wg mocy i napięcia przyłączenia): wymóg → test → werdykt → dowód → dokument; „certyfikat zgodności projektu" generowany z macierzy; braki → asystent braków | częściowa | E11 |
| P40 | **Odpowiedź na polecenia OSD** | symulacja zachowań sterowanych: ograniczenie mocy czynnej, zadana Q/cosφ/U, tryby LFSM-O/LFSM-U (odpowiedź częstotliwościowa z statyzmem), priorytet mocy czynnej vs biernej przy zapadzie | TAK | E11 |
| P41 | **Rzeczywiste krzywe zdolności falowników** | import krzywych P–Q producenta (zależnych od U i temperatury) do katalogu; weryfikacja, czy rzeczywista krzywa pokrywa wymaganą przez OSD w całym zakresie | częściowa | E4/E11 |
| P42 | **Dobór kompensacji farmy** | automatyczny dobór kompensacji (dławik/bateria/Q falowników) dla spełnienia cosφ w punkcie przyłączenia z uwzględnieniem generacji Q kabli przy niskiej generacji (noc) | TAK | E11 |
| P43 | **Zapady wielokrotne i praca przy słabej sieci** | sekwencje FRT wielokrotnych zapadów, zachowanie przy niskim SCR (słaba sieć), wsparcie ride-through z magazynu | TAK | E11 |
| P44 | **Energia niedostarczona (curtailment)** | szacowanie rocznej energii traconej przez ograniczenia sieciowe na profilach (wymaga P27) + wpływ na ekonomię przyłączenia; porównanie wariantów punktu przyłączenia o tę oś | TAK (po P27) | E11 |
| P45 | **Zgodność powykonawcza** | import pomiarów z obiektu (rejestratory, CSV) → porównanie z modelem i wymogami → raport rozbieżności; domyka pętlę projekt → budowa → odbiór | TAK | E11/E13 |
| P46 | **Ochrona przed pracą wyspową (LoM)** | dobór i weryfikacja zabezpieczeń od utraty sieci (ROCOF, przesunięcie wektora), koordynacja z automatyką SPZ w głębi sieci — fałszywe wyspy vs zbędne wyłączenia | TAK | E10/E11 |
| P47 | **Pulpit instalacji OZE** | jeden ekran per źródło: stan zgodności NC RfG (z macierzy P39), zdolność punktu, jakość energii (harmoniczne+flicker), praca magazynu, dokumenty — kokpit specjalisty OZE | nie (agregacja) | E11 |

### Priorytet strumienia OZE (dyrektywa 2026-07-15)
Strumień OZE/NC RfG realizowany jako PIERWSZY wątek specjalistyczny U4 i kontynuowany po U5:
kolejność wewnętrzna: P39 → P47 → P2/P19 (już w U4) → P41 → P30 → P35 → P38 → P40 → P42 →
P43 → P46 → P37 → (po P27:) P44 → P45. Pozostałe strumienie wg kolejności ogólnej.

## Kolejność realizacji (zarządca; właściciel może zmienić)

1. **U3:** P3, P4, P20 (wyniki + gotowość) · 2. **U4:** P1, P2, P5, P6, P9, P10, P13, P14, P15, P18 (zabezpieczenia, OZE, dokumentacja) · 3. **po U4 / U5:** P7, P8, P11, P12, P16, P17, P19, P21, P22, następnie runda 3 w kolejności: najpierw bez delty backendowej i „częściowe" (P25, P26, P24, P23, P29, P28, P30, P31, P34, P35, P38), potem pełne delty (P27 → P36, P32, P33, P37) oraz grupa III.
Każda pozycja wchodzi wyłącznie kartą zadania z pełnymi bramkami; nowe funkcje obliczeniowe
dopisywane do INWENTARZA (macierz pokrycia rośnie, nigdy nie maleje).
