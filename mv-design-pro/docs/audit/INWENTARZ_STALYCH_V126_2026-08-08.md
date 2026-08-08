# Inwentarz stałych-zastępników w solverze V12.6 (karta QU-FABRYKACJA)

**Data pomiaru:** 2026-08-08 · **Plik:** `backend/src/network_model/solvers/v126_academic.py`
(2022 wiersze, 24 funkcje analizy) · **Metoda:** przejście drzewa składni po WSZYSTKICH
literałach liczbowych (bez 0/1/2/3/100/1000 i wykładników numerycznych), potem
rozstrzygnięcie każdej pozycji wobec pytania z karty: **czy model niesie odpowiadającą daną?**

Inwentarz powstał, bo reguła KLASA §1 zabrania naprawiania instancji nazwanej w karcie
bez wypisania całej klasy. Karta nazwała dwa współczynniki w jednej funkcji; przejście
całego pliku znalazło ich rodzeństwo w ośmiu kolejnych.

## Kryterium rozstrzygnięcia

| Werdykt | Znaczenie |
|---|---|
| **FABRYKACJA** | stała stoi w miejscu danej, którą model NIESIE — naprawa obowiązkowa |
| **BRAK DANYCH** | stała stoi w miejscu danej, której model NIE NIESIE — wielkości nie wolno podawać jako pomiaru |
| **NORMA** | stała pochodzi z normy albo z opublikowanego wzoru z cytowaniem — to NIE jest fabrykacja |
| **PARAMETR METODY** | stała opisuje sposób liczenia (siatka, zaokrąglenie, kondycjonowanie), nie dane wejściowe |
| **PARAMETR PROJEKTOWY** | wartość domyślna pola, które użytkownik podaje przez `parameters` i które ma kontrolkę w oknie |

## Pozycje naprawione w tej karcie

| # | Miejsce | Stała | Zastępowała | Czy model niesie daną | Werdykt | Naprawa |
|---|---|---|---|---|---|---|
| 1 | `_voltage_stability` | `0,35 · P` | moc bierną odbioru | **TAK** — `bus.load_mvar`, użyte 60 wierszy niżej w `_branch_current_a`; niesie ją 20 z 20 obciążonych szyn `sldSubstrate52s` i 12 z 12 `demo_oze_sc` | FABRYKACJA | wielkość wycofana (patrz niżej — margines jest różnicą, a drugi człon nie ma danych) |
| 2 | `_voltage_stability` | `0,15 · P` | zdolność wytwórczą mocy biernej | **NIE** — `V126BusInput` i `V126ConverterInput` nie mają pola zdolności biernej; w ENM `limits.q_min/max_mvar` ma 0 z 35 wytwórców, `pq_curve` 0 z 35, `cosphi_min` 0 z 35, `materialized_params.qmin_mvar` 7 z 35 (20 %) i most ENM→V12.6 tego nie przenosi | BRAK DANYCH | wielkość niewyznaczana, `None` + powód |
| 3 | `_voltage_stability` | `max(25; U_n · 10)` | moc zwarciową węzła | **TAK, ale prawie zawsze pusta** — `fault_level_mva` podane dla **1 z 315** szyn (`sldSubstrate52s`) i **1 z 93** (`demo_oze_sc`) | FABRYKACJA (wejście wspólne dla wszystkich 4 wielkości analizy) | brak wartości zastępczej |
| 4 | `_voltage_stability` | `2,5` i `20,0` w `λ_max` | krzywą P–U z rozpływu | rozpływu w tej analizie nie ma | BRAK DANYCH | wielkość niewyznaczana (domyka dług nazwany w V126-WYGASZENIE) |
| 5 | `_voltage_stability` | `0,7` i `0,12` w `u_at_max` | napięcie w punkcie krytycznym | j.w. | BRAK DANYCH | wielkość niewyznaczana |
| 6 | `_voltage_stability` | `· 4,0` i obcięcie `0,98` we wskaźniku L | opublikowany wskaźnik L | Kessel–Glavitsch (1986) liczy L z macierzy F na Y-bus przy zbieżnym rozpływie; mnożnika 4 nie ma ani w danych, ani w normie — do tego `voltage_pu ≠ 1,0` dla **0 z 408** szyn, więc ważenie napięciem też stało na wartości domyślnej kontraktu | BRAK DANYCH + fałszywy rodowód | wielkość niewyznaczana |
| 7 | `_z_conv_components` | `w_base = 2π · 50,0` | częstotliwość podstawową sieci | **TAK** — `V126AcademicInput.base_frequency_hz`, czytane w TYM SAMYM pliku w 4 innych miejscach (jakość energii, przemiatanie SSCI, ślad, projekt uziemienia punktu neutralnego) | FABRYKACJA | podstawa jest argumentem nazwanym **bez wartości domyślnej** — nowe wywołanie nie powstanie bez jej podania |

## Pozycje pozostawione — z uzasadnieniem merytorycznym

„Poza zakresem karty" uzasadnieniem nie jest; każdy wiersz podaje powód rzeczowy.

| Miejsce | Stałe | Werdykt | Uzasadnienie |
|---|---|---|---|
| `_power_quality` | `8,0` · `5,0` · `5,0` | NORMA | limity THD_U wg PN-EN 50160 i THD/TDD wg IEEE 519 — cytowane w kodzie i na ekranie |
| `_earthing` | `0,8` · `0,6` · `0,172` · `0,157` · `16` · `20` · `1000` · `1,5` · `6` | NORMA | współczynniki równań siatki uziomowej IEEE 80 / PN-EN 50522 (K_m, K_s, K_i, napięcia dopuszczalne) |
| `_insulation` | tabela `(12; 75; 28) … (36; 170; 70)`, `1,05`, `1,25`, `1,4` / `1,15` | NORMA | typoszereg BIL i współczynniki doboru ogranicznika wg IEC 60071 |
| `_ssci_frequencies_hz` | `1,0 … 250,0`, `61` | PARAMETR METODY | siatka przemiatania częstotliwości, udokumentowana i stała (deterministyczna) |
| `_ybus`, `_driving_point_impedance` | `1e6` | PARAMETR METODY | kondycjonowanie węzła odniesienia, nie dana sieci |
| `_round(..., n)` w całym pliku | cyfry zaokrągleń | PARAMETR METODY | determinizm zapisu, nie wielkość fizyczna |
| `_transient`, `_opf_loss_lcc`, `_hosting_capacity` | `trv_natural_frequency_hz` `12000`, `trv_tau_s` `0,00018`, `inrush_multiple_in` `8,0`, cena energii `0,65`, stopa `0,05`, `30` lat, `0,72` kg CO₂/kWh, `4000` h/rok, `hosting_monte_carlo_n` | PARAMETR PROJEKTOWY | wszystkie czytane przez `model.parameters.get(...)` i **mające kontrolkę w oknie** — parytet pilnuje `tests/ci/test_v126_rodzaje_parytet.py::test_kazdy_czytany_parametr_ma_kontrolke`; wartość domyślna jest wyborem użytkownika do nadpisania, nie podstawionym pomiarem |

## Dług nazwany — pozycje wymagające decyzji poza tą kartą

Zgodnie z Zero-Debt pkt 4 (dług nienaprawialny w bieżącej sesji) — z pomiarem, przyczyną
i planem, nigdy cicho. Żadna z tych pozycji nie została „opisana i zostawiona" w kodzie
jako uzasadniona: wszystkie są tu wypisane jako otwarte.

| Miejsce | Stała | Co zastępuje | Dlaczego nie w tej karcie | Plan |
|---|---|---|---|---|
| `_source_impedance` | `complex(0,1; 0,4)` | impedancję źródła, gdy nie ma ani mocy zwarciowej, ani gałęzi zasilającej | zmiana dotyka `_motor_starting` i `_hosting_capacity` (inne rodziny wyników i inne fikstury złote); karta dotyczy stabilności napięciowej | doprowadzić moc zwarciową węzła do kontraktu; przy jej braku meldować brak zamiast impedancji zastępczej |
| `_source_impedance`, `_grid_source_shunt_admittance` | `0,15 · z` + `0,99 · z` | stosunek R/X źródła | kontrakt nie niesie R/X źródła; dodanie pola to zmiana mostu ENM→V12.6 i osobny przebieg regresji SSCI | dodać R/X do `V126BusInput` z mostu (`Source.rx_ratio`), meldować brak przy braku |
| `_motor_starting` | `0,9` w `I_n` | iloczyn sprawności i cos φ silnika | `V126MotorInput` nie ma pola sprawności ani cos φ znamionowego (ma tylko `start_power_factor`) | rozszerzyć kontrakt silnika o dane znamionowe z karty katalogowej |
| `_reliability` | `0,12 · SAIFI` | wskaźnik przerw krótkich MAIFI | model nie niesie intensywności przerw przemijających (ma tylko `failure_rate_per_year` przerw trwałych) | albo wprowadzić intensywność przerw przemijających do modelu gałęzi, albo przestać podawać MAIFI |
| `_reliability` | `branches[:80]` | — | ciche obcięcie zbioru par N-2: wynik zależy od limitu spoza danych (ta sama klasa, co `slice(0,8)` naprawiane kartą V126-OKNA w UI) | limit z danych albo jawny meldunek o obcięciu z liczbą pominiętych par |
| `_uncertainty` | `ranked[:20]`, `0,10`, `0,05` | ranking i współczynniki wrażliwości | współczynniki wpływu nie mają pokrycia w danych ani w metodzie GUM zastosowanej wprost | policzyć wrażliwości numerycznie (perturbacja wejść) albo wycofać wielkość |
| `_opf_loss_lcc` | `0,45²` | współczynnik obciążenia transformatora | model niesie moce odbiorów i `sn_mva` transformatora, więc obciążenie jest WYPROWADZALNE — to najbliższa krewna pozycji nr 1 z tabeli napraw | policzyć obciążenie z przepływu przez transformator zamiast przyjmować 45 % |
| `_hosting_capacity` | `betavariate(5; 2)`, `gauss(0,75; 0,15)` | rozkłady obciążenia i produkcji PV | model nie niesie profili ani ich parametrów statystycznych | wprowadzić profile do modelu albo nazwać wielkość analizą scenariuszową o zadanych rozkładach (z kontrolkami) |
| `_insulation` | `mcov · 2,8` | napięcie obniżone ogranicznika przy braku karty | most `build_v126_insulation_from_enm` przenosi `u_residual_at_10ka_kv` z katalogu, gdy karta istnieje; przy braku karty solver wykonuje udokumentowany dobór wstępny | oznaczyć wynik doboru wstępnego jako oszacowanie w kontrakcie odpowiedzi (osobne pole jakości), nie jako pomiar |

## Rodowody nazw — trzeci rodzaj defektu tej klasy

Poza stałą bez pokrycia karta nazwała **fałszywy rodowód**: nazwa mówiąca, SKĄD liczba
pochodzi, gdy nie jest to prawdą. Znalezione w tym pliku i domknięte:

* „krzywa Q–U" — we wzorze nie występowało napięcie w żadnej postaci (był to statyczny
  bilans mocy biernej); nazwa zdjęta z ekranu i ze śladu;
* „krzywa P–U z rozpływu" — rozpływu w tej analizie nie ma; zdjęta kartą V126-WYGASZENIE,
  teraz zdjęta także wartość;
* „wskaźnik L" — nazwa opublikowanego wskaźnika przy zupełnie innym wzorze;
* „najmniejsza wartość własna macierzy wrażliwości" — nazwa poprawiona przy odbiorze
  V126-WYGASZENIE, wielkość wycofana tą kartą.

Pin na całym zbiorze tekstów prezentacji:
`frontend/src/ui2/wyniki/akademickie/__tests__/wygaszenie.test.tsx` —
„żaden projekt ekranu nie obiecuje krzywej Q–U ani P–U" (skan po `JSON.stringify(PREZENTACJA)`,
z kontrolą dodatnią, żeby pusty obiekt nie fałszował wyniku).
