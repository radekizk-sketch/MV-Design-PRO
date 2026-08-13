# E — MACIERZ OBLICZEŃ nN (CALCULATION MATRIX)

Format wg §76 zlecenia: Obliczenie → Wejścia → Model → Solver → Wynik → Walidacja → Konsument.
„Solver" = JEDYNE miejsce fizyki (zero duplikacji formuł; UI/raport konsumują wynik+provenance).

| Obliczenie | Wejścia | Model | Solver (jedna fizyka) | Wynik | Walidacja | Konsument |
|---|---|---|---|---|---|---|
| **Ib** (prąd obliczeniowy obwodu) | P, Q, cosφ odbiorów, wsp. jednoczesności, przypadek | `Load`+`LoadType` per szyna/odpływ | rozpływ NR (przepływ gałęzi) — dla obwodu pojedynczego odbioru dopuszczalny odczyt z definicji obciążenia (bez nowej formuły w UI) | I per gałąź [A] | Ib≤Iz′, Ib≤In | tabela odcinków, dobór, proof P15/LV |
| **Iz′** (obciążalność skorygowana) | `LVCableType.i_max_a`, sposób ułożenia, θ_otoczenia/gruntu, grupowanie, n_parallel | meta odcinka `laying_conditions` | `cable_ampacity_derating` rozszerzony o zestawy PN-HD 60364-5-52 (dane: rejestr G) | Iz′ = Iz·k1·k2·… + ślad każdego k | Ib≤Iz′; W060 przy braku warunków | dobór przekroju, walidacje, raport |
| **U / rozpływ** (U, kąt, P, Q, I, loading, straty) | graf SN+nN, obciążenia (ZIP), źródła (InverterControl), tap, przypadek | jeden `NetworkGraph` (mapping ENM) | NR/GS/FD (`_base_scale` wielonapięciowy) | `PowerFlowResultV1` per szyna/gałąź | zakres U, przeciążenia, reverse-flow etykieta | profil U, tabela, overlay SLD, bilans RGnN |
| **ΔU** (per odcinek + skumulowany od źródła) | wyniki PF (U per szyna) + trasa elektryczna | ścieżka grafu źródło→odbiór | interpretacja z PF (analiza `voltage_profile` rozszerzona o dekompozycję per odcinek); preview pojedynczego kabla: `cable_voltage_drop` (sign-aware) | ΔU per odcinek, ΣΔU, U_końcowe, % | limit ΔU projektu/normy | wykres ΔU, tabela odcinków, proof VDROP (multi-segment) |
| **Ik″max nN** | graf SN+nN (upstream Thevenin, TR z K_T, kable nN), c_max per pasmo | jeden Zbus | IEC 60909 (FROZEN) + binding z c per pasmo węzła | Ik″, ip, Ith, Ib, Sk per węzeł nN | sanity-bounds pasma nN; Icu≥Ik″ | dobór aparatów, TCC, overlay, proof SC3F |
| **Ik″min nN** | jw. + c_min per pasmo + R_θ (korekta temperaturowa przewodów) | jw. (wejście MIN: zmodyfikowane R gałęzi) | IEC 60909 (FROZEN); scenariusz MIN w bindingu/builderze | Ik″min per węzeł (w tym koniec obwodu) | Ik_min>0, monotonia wzdłuż ścieżki | SWZ, czułość zabezpieczeń, wykres Ik(l) |
| **Zs** (impedancja pętli zwarcia) | układ sieci (TN-*), Z_TR (uk,Sn,Pk), R/X żyły fazowej i powrotnej z KABEL_NN po trasie, upstream Z z grafu SN | trasa L-PE/PEN od TR do punktu | `fault_loop_iec60364` + builder P0.5b (auto-ekstrakcja z grafu+katalogu) | Zs, Ik_min/max pętli, trace składników | Zs>0, spójność z Ik1 z 60909 (test krzyżowy) | SWZ, inspektor stacji, proof |
| **SWZ** (samoczynne wyłączenie) | Zs/Ik_min (najgorszy punkt obwodu), aparat (krzywa), układ sieci, U_n | obwód = tor od aparatu do najdalszego punktu | NOWA analiza `swz`: tabela czasów 60364-4-41 Tab. 41.1 (dane normatywne) + Ia z krzywej aparatu przy wymaganym czasie + porównanie Ia≤Ik_min | PASS/WARNING/FAIL + dowód liczbowy (Ia, Ik_min, t_wym, t_rzecz) | trzy stany, zakaz cichego PASS przy braku danych | heatmapa obwodów, werdykt projektowy, raport, wykres marginesu Ik_min/Ia |
| **I²t ≤ k²S²** (cieplna przewodu) | Ik″ (max) per gałąź nN, czas wyłączenia per gałąź (z krzywej aparatu nN), k z materiału/izolacji | gałęzie nN + KABEL_NN (Ith/Jth po C §2.2) | `conductor_thermal_withstand` (IEC 60949) — istniejący, przebieg rozszerzony o pasmo nN; czas: wariant nN `czas_wylaczenia_galezi` | werdykt per gałąź + S_min + dowód | zakaz założonego tk bez oznaczenia źródła | walidacje, dobór przekroju, proof |
| **Czas wyłączenia aparatu nN** | typ aparatu, krzywa (MCB B/C/D norm., MCCB Ir/Isd/Ii, gG bramki), prąd (Ik_min lub Ik_max wg celu) | `ProtectionAssignment` + katalog krzywych | JEDNA ścieżka krzywych (po scaleniu N-D4): silnik krzywych nN (`MCB_THERMAL_MAGNETIC`/`MCCB_ELECTRONIC`/`FUSE_GG`) | t(I) + pasmo tolerancji | monotonia, zakres ważności krzywej | SWZ, selektywność, I²t, TCC |
| **Selektywność SN↔nN** | krzywe całego łańcucha (przekaźnik SN → aparat TR → ACB RGnN → MCCB → MCB/gG), prądy zwarciowe na poziomach | łańcuch aparatów wzdłuż ścieżki | koordynacja (analyzer) rozszerzona o urządzenia nN i prądy z biegów nN | marginesy czasowe/prądowe per para, TCC multi-device | brak przecięć pasm w zakresie wspólnym | TCC SN+nN, werdykt, raport |
| **Dobór przekroju** (ranking) | kandydaci KABEL_NN, Ib, warunki ułożenia, ΔU limit, Ik, SWZ | odcinek + kandydaci | orkiestracja istniejących solverów (Iz′, ΔU, SWZ, I²t) per kandydat — zero nowej fizyki | ranking side-by-side (spełnienia + zapasy + straty) | każdy kandydat pełny zestaw werdyktów | ekran doboru, warianty A/B/C |
| **Dobór zabezpieczenia** | Ib, Iz′, Ik max/min, charakter odbioru, kandydaci APARAT_NN | odpływ | warunki Ib≤In≤Iz′ + I2≤1,45·Iz′ (IEC 60364-4-43) + Icu≥Ik″max + SWZ przy Ik_min | ranking aparatów + werdykty | komplet warunków, zakaz częściowego OK | ekran doboru, proof |
| **Straty** | wyniki PF per gałąź | graf | PF (istniejące `losses`) | ΔP, ΔQ per odcinek + suma | — | tabela, ranking doboru, raport |
| **Bilans RGnN** | wyniki PF aktywnego przypadku | szyna/sekcja RGnN | agregacja wyników PF (analiza) | P_load/P_DER/P_BESS/Q/S/I_szyn/cosφ/loading TR | — | panel bilansu na żywo |
| **Rozruch silnika** (P1) | Pn, η, cosφ, k_start, tryb rozruchu | `Load` silnikowy | NOWY moduł (P1): prąd rozruchu + ΔU podczas rozruchu (PF z obciążeniem rozruchowym) | I_start, ΔU_start, werdykt | limit ΔU rozruchu | TCC (przeciążenie), raport |
| **Praca wyspowa agregatu** (P1) | Sn, xd″, przypadek GENERATOR_ISLAND | `Generator` + stany łączników | IEC 60909 z jedynym źródłem-agregatem (LV-INV-09) + PF wyspy | Ik przy agregacie, SWZ w trybie wyspy | SWZ może przejść z TR i upaść z agregatem — obowiązkowe oba biegi | werdykt, raport, SZR |
| **Harmoniczne** (P2) | widma odbiorów nieliniowych | — | **BACKEND GAP — LV HARMONIC LOAD FLOW** (rejestr G; reuse `_power_quality` Z(f) do oceny) | — | — | — |

## Dyscyplina przypadków (który przypadek decyduje)

| Warunek | Przypadek decydujący |
|---|---|
| Zdolność wyłączalna (Icu), ip/Icw szyn, I²t | SHORT_CIRCUIT_MAX |
| SWZ, czułość, selektywność dolna | SHORT_CIRCUIT_MIN oraz GENERATOR_ISLAND (oba obowiązkowe gdy agregat istnieje) |
| ΔU odbiorów | NORMAL_MAX_LOAD |
| Wzrost napięcia | PV_MAX / BESS_DISCHARGE |
| Obciążalność TR/kabli | NORMAL_MAX_LOAD + BESS_CHARGE |

Każdy wynik w UI niesie etykietę przypadku decydującego (kontrakt D §5).
