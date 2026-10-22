# Macierz odbiorowa IEC 60909-0:2016 / 2026 i selektora profili

Status: **specyfikacja testów**. Nie oznaczono PASS bez uruchomienia. Dane liczbowe do wyroczni produkcyjnej mają pochodzić z niezależnych obliczeń/IEC TR 60909-4, a nie z kopiowania wyników obecnego solvera.

## 1. Bateria fizyczna (niezależna od interfejsu)

| ID | Przypadek | Wymagany dowód |
|---|---|---|
| NORM-SC-T01 | 1 źródło, sieć 1-węzłowa, 3F | `I''k=c·Un/(√3·|Z1|)`, wartość zespolona i jednostki |
| NORM-SC-T02 | 1 źródło, 2F | `I''k,2F=c·Un/|Z1+Z2|`, fazy i znaki |
| NORM-SC-T03 | 1F-Z, uziemienie przez skończoną impedancję | `I1=I2=I0=Uf/(Z1+Z2+Z0+3Zf)`; `Ia=3I0`, ślad `3ZE` tylko raz |
| NORM-SC-T04 | 2F-Z | równoległe połączenie sekwencji 2/0; kompleksowe `I0,I1,I2`, transformacja fazowa i niezależna wyrocznia |
| NORM-SC-T05 | 1F-Z: sieć izolowana / kompensowana, profil 2026 | status `OUTSIDE_STANDARD_SCOPE`; brak fałszywego wyniku `0 A` jako wyniku normowego |
| NORM-SC-T06 | granica zastosowania pojemności Z0 w 2016 | `earth_fault_factor` odpowiednio mniejszy, równy i większy niż 1,4; test `>` a nie `>=`, przy spełnionych pozostałych warunkach 5.2(f) |
| NORM-SC-T07 | reguła pojemności Z0 w 2026 | scenariusze wprowadzić z pełnego 5.2.4; NIE pożyczać automatycznie T06 |
| NORM-SC-T08 | 2 odcinki SN, zmienna pojemność i długość | poprawna admitancja `jωC0'l` i stempel π; bilans prądowy |
| NORM-SC-T09 | transformator Dyn11, Yyn, nieuziemione neutralne | właściwe drogi składowej zerowej, brak przejścia przez zablokowane układy |
| NORM-SC-T10 | 2/3 uzwojenia transformatora | `KT` i różne poziomy napięcia, właściwa baza pu i numeracja uzwojeń |
| NORM-SC-T11 | linia dwuodcinkowa + odgałęzienie + drugi zasilacz | prądy zespolone w obu kierunkach w każdej gałęzi; KCL w każdym węźle |
| NORM-SC-T12 | pierścień z otwartym/zamkniętym łącznikiem | zmiana topologii i odcisku; brak prądu przez otwarty łącznik |
| NORM-SC-T13 | MAX/MIN w nN i SN | lokalny dobór `c`, prawidłowa korekcja R temperaturą i brak podwójnego zastosowania `c` |
| NORM-SC-T14 | 1F-Z dla `Z0` kompleksowego o dużej reaktancji | poprawny kąt `I0`, nie samo modułowe dzielenie prądu |
| NORM-SC-T15 | PV/BESS z przekształtnikiem, DFIG/FSC, synchroniczny | udziały źródeł z odpowiednich modeli normowych, bez podwójnego zliczenia |
| NORM-SC-T16 | `ip, Ib, Ik, Ith, I²t` | niezależne wyrocznie dla odpowiednich rozdziałów wydania i zgodność jednostek |
| NORM-SC-T17 | brak `Z0`/nieznane uziemienie | odmowa raportowania wyniku jako zweryfikowanego; wskazanie brakującej danej |
| NORM-SC-T18 | przypadki `c` podane spoza tabeli | jawny tryb nadpisania, rejestr uzasadnienia, właściwy status dowodu |
| NORM-SC-T19 | materiałowy kabel 1x240/25 i różne uziemienia ekranów | Z0 z rzeczywistego toru powrotnego; nie zastępować `C0'` pojedynczą pojemnością katalogową bez walidacji |
| NORM-SC-T20 | dwa wydania, identyczna wyrocznia fizyczna | równe wyniki tylko w obszarze poświadczonej identyczności reguł; brak wymuszonego sztucznego rozjazdu |

Równania T01–T04 są analitycznymi kontrolami obwodów idealizowanych, a nie kompletnymi formułami wyznaczania wyników wieloźródłowych dla każdego rodzaju urządzenia w IEC 60909. Wyrocznie wydania 2026 uzyskać dopiero po potwierdzeniu normowym.

## 2. Bateria selektora i śladu wyników

| ID | Zachowanie | Warunek akceptacji |
|---|---|---|
| NORM-SC-S01 | utworzenie przypadku bez jawnego wyboru | dotychczasowy tryb 2016 zachowuje semantykę; brak nieprawdziwego oznaczenia historycznych wyników |
| NORM-SC-S02 | serializacja i odczyt przypadku | `short_circuit_standard_id` identyczny po zapisie i odczycie |
| NORM-SC-S03 | zmiana profilu | aktualny przypadek dostaje nowy hash i zależne wyniki są nieważne |
| NORM-SC-S04 | odczyt starego biegu | wynik nadal wskazuje wydanie faktycznie użyte, nie aktualny selektor |
| NORM-SC-S05 | aktywacja niewalidowanego 2026 przez podmieniony request | backend odmawia; brak fallback do 2016 |
| NORM-SC-S06 | raport i Proof/Trace | wydanie, reguły, wersja solvera, wyrocznia, hash dowodu i jednostki |
| NORM-SC-S07 | różne wydania w porównaniu | jawne `Δ` i etykiety wydań, stan NIEPORÓWNYWALNE dla braków |
| NORM-SC-S08 | nakładka SLD / EAZ | wyłącznie wyniki aktywnej, zgodnej migawki; brak starej nakładki |
| NORM-SC-S09 | 100 powtórzeń tego samego przebiegu | identyczne wyniki i odciski po wyłączeniu zmiennych losowych / znaczników czasu |
| NORM-SC-S10 | awaria źródła dowodu / brak tabeli 2026 | `BRAK_PODSTAWY`, a nie `ZGODNY` |
| NORM-SC-S11 | jasny/ciemny motyw, uruchomienie bez obejścia API | natywna droga użytkownika, czytelny wybór; zrzuty do werdyktu właściciela |
| NORM-SC-S12 | niepoprawny identyfikator normy | walidacja 4xx, zero silent mapping |
| NORM-SC-S13 | stary wynik bez śledzonej edycji | `WYDANIE NIEUSTALONE`, o ile brak dowodu 2016 |
| NORM-SC-S14 | brak fikcji 2026 | w UI i raporcie nie da się uzyskać `norm_verified=True` bez dowodów |

## 3. Warunek przekrojowego odbioru

Dla każdego przypadku testowego zachować:
- reprezentację modelu SN–TR–nN / PCC i stany łączników,
- wejściowe impedancje zespolone `Z1,Z2,Z0`, uzwojenia/neutralne, korekty, parametry źródeł,
- bilans mocy i prądów (osobno wyniki rozpływu i zwarcia),
- macierze sekwencji lub audytowalne odpowiedniki, prądy gałęziowe i fazowe,
- prąd w miejscu zwarcia i rozdział wkładów źródeł,
- wyrocznię niezależną z jednostkami i tolerancją dobraną do metody,
- mapę `wydanie → punkt → wzór → ślad → wynik`,
- rezultat backendu, API, persystencji, interfejsu, SLD, EAZ, White-Box i raportu,
- dowód negatywny przypadków poza zakresem normy.

**Tolerancja:** nie narzucać jednego `1e-6` wszystkim prądom bez analizy kondycji sieci, sposobu zaokrąglenia danych katalogowych i referencyjnej dokładności wyroczni. Protokół testowy rejestruje tolerancję bezwzględną i względną oraz uzasadnienie.

**Werdykt na datę sporządzenia:** wszystkie T/S są wymaganiami odbiorowymi, **bez statusu PASS**.
