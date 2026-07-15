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

## Kolejność realizacji (zarządca; właściciel może zmienić)

1. **U3:** P3, P4, P20 (wyniki + gotowość) · 2. **U4:** P1, P2, P5, P6, P9, P10, P13, P14, P15, P18 (zabezpieczenia, OZE, dokumentacja) · 3. **po U4 / U5:** P7, P8, P11, P12, P16, P17, P19, P21, P22 oraz grupa III.
Każda pozycja wchodzi wyłącznie kartą zadania z pełnymi bramkami; nowe funkcje obliczeniowe
dopisywane do INWENTARZA (macierz pokrycia rośnie, nigdy nie maleje).
