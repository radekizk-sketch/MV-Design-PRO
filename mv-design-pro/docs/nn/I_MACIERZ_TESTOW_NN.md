# I — MACIERZ TESTÓW nN (TEST MATRIX)

Zasada: testy numeryczne z wartościami referencyjnymi policzonymi niezależnie (ręcznie /
z normy), nie snapshoty UI (§69 zlecenia). Nowe testy interakcji — ścieżka natywna
(dyrektywa 2026-07-17 pkt 5).

## 1. Testy numeryczne (wartości referencyjne)

| # | Test | Wejście referencyjne | Asercja |
|---|---|---|---|
| T-N1 | Iz′ po korektach | YAKY 4×120, ziemia, 3 obwody, θg=25°C | Iz′ = Iz·k1·k2 (wartości z tablic G-D1); ślad każdego k |
| T-N2 | Ib obwodu | odbiór 45 kW, cosφ=0,93, 400 V | Ib = P/(√3·U·cosφ) ± zaokrąglenie |
| T-N3 | ΔU łańcucha 3 odcinków | K1 35 m 4×120 + K2 15 m 4×35 + K3 42 m 4×16 | ΣΔU% vs rachunek ręczny; U_końcowe z PF spójne z dekompozycją |
| T-N4 | Ik″max na szynie nN | TR 630 kVA uk=6%, Sk″SN=250 MVA | Ik″ vs rachunek ręczny IEC 60909 (c=1,05, K_T) — golden MV+LV |
| T-N5 | Ik″min na końcu obwodu | jw. + 60 m YAKY 4×35, c=0,95, R_θ(θ_k) | wartość ręczna; Ik_min < Ik_min(20°C) — dowód działania korekty |
| T-N6 | Zs pętli | TN-C-S, trasa L+PEN z katalogu | Zs = Z_TR+Z_L+Z_PEN (+upstream); test krzyżowy z Ik1 (60909/Z0) |
| T-N7 | SWZ PASS/FAIL | obwód z MCB C25, Ik_min po obu stronach progu 10·In | oba werdykty + dowód liczbowy (Ia, t_wym z G-D3) |
| T-N8 | I²t ≤ k²S² | Ik=6 kA, t=0,4 s, Cu XLPE 16 mm² | S_min z IEC 60949; werdykt graniczny |
| T-N9 | Krzywe MCB B/C/D | punkty pasm normatywnych (1,13/1,45·In; progi magn.) | t(I) w pasmach; poza zakresem → jawny stan |
| T-N10 | Reverse flow | PV 50 kW na RGnN, odbiór 10 kW | przepływ TR nN→SN, slack ujemny, etykieta reverse |
| T-N11 | Wyspa agregatu (P1) | GENERATOR_ISLAND, agregat 200 kVA xd″=12% | Ik_min z agregatu ≪ z TR; SWZ może FAIL — asercja obu biegów |
| T-N12 | Parytet NR/GS/FD na feederze nN | feeder R/X≥1 | |V| zgodne ≤1e-6; zbieżność wszystkich trzech |
| T-N13 | Dobór Ib≤In≤Iz′ + I2 | kandydaci C63 vs C80 przy Ib=58 A, Iz′=71 A | ranking + werdykty cząstkowe |
| T-N14 | Straty | odcinek o znanym I, R | ΔP=3·I²·R zgodne z PF branch losses |

## 2. Testy topologii (§70 zlecenia — komplet)

| # | Topologia | Sprawdzenie |
|---|---|---|
| T-T1 | jeden odpływ | pełny łańcuch wyników |
| T-T2 | 20 odcinków szeregowo | zbieżność PF, monotonia U i Ik wzdłuż ścieżki |
| T-T3 | drzewo (rozgałęzienia) | najgorsza ścieżka auto; ΔU per gałąź |
| T-T4 | kilka podrozdzielnic (R1→R2) | ciągłość, wyniki na każdym poziomie |
| T-T5 | dwa TR (dwie stacje nN) | izolacja obwodów, poprawne przypisanie źródła |
| T-T6 | sprzęgło sekcji (zamknięte/otwarte) | LV-INV-08: otwarty łącznik przerywa tor |
| T-T7 | PV na podrozdzielnicy | reverse, wzrost U |
| T-T8 | BESS charge/discharge | oba kierunki, oba przypadki |
| T-T9 | agregat + przypadek wyspy (P1) | LV-INV-09 |
| T-T10 | UPS (P1) | ścieżki online/bypass/battery |
| T-T11 | przewody równoległe (3× kabel) | podział prądu, impedancja zastępcza, Iz′·n |
| T-T12 | odbiory 1-fazowe (P1) | prąd N, asymetria U |
| T-T13 | split/merge odcinka | zachowanie sumy długości, hash bump, inwalidacja |
| T-T14 | E062: próba połączenia 0,4 z 0,69 bez TR | BLOCKER |

## 3. Testy kontraktu SN↔nN i rewizji

| # | Test | Asercja |
|---|---|---|
| T-K1 | zmiana uk TR | input_hash zmieniony; wyniki nN OUTDATED (LV-INV-06); wyniki niezależne nietknięte |
| T-K2 | zmiana Sk″ SN | Ik nN przeliczone (LV-INV-05) |
| T-K3 | zmiana odbioru nN | loading TR + PF SN unieważnione (kierunek nN→SN) |
| T-K4 | zero ponownego wprowadzania TR | żaden request nN nie zawiera parametrów TR (kontrakt D §1.2) |
| T-K5 | round-trip archiwum ZIP z siecią nN | eksport→import→hash semantic/input identyczne (po G-02) |
| T-K6 | determinizm | ten sam model → identyczny ResultSet v1 + proof ZIP (SHA-256) |
| T-K7 | dispatch dedup | drugi bieg bez zmian = cache hit |

## 4. Testy warstwy prezentacji

| # | Test | Uwagi |
|---|---|---|
| T-U1 | contract testy SLD v3 z substrate nN (scena: symbole/segmenty per element, ownerRef) | + determinizm sceny |
| T-U2 | overlay nN: U/ΔU/Ik/SWZ per ownerRef | RawOverlayPayload → etykiety |
| T-U3 | tabela odcinków: edycja inline → operacja domenowa → odświeżenie (klik natywny) | zakaz syntetycznych dispatchEvent |
| T-U4 | kreatory nN: dialog_completeness + zero dead-click + 5 stanów okna | guardy CI |
| T-U5 | klik wyniku → provenance/White Box w ≤2 kliki | gramatyka interakcji |
| T-U6 | e2e Playwright (real backend): zbuduj odpływ → uruchom biegi → zobacz SWZ → zmień kabel → stale → przelicz | rozszerzenie `critical-run-flow` |

## 5. Test E2E finałowy (§80) — bramka gotowości integracji

`tests/e2e/test_nn_full_chain.py` — pełny scenariusz GPZ→SN→ST-03→TR→RGnN→odpływy→R1→
odbiory/PV/BESS (agregat+SZR w P1): 17 kroków zlecenia na JEDNYM modelu. Niepowodzenie
któregokolwiek kroku = integracja nN niegotowa (twarda bramka fazy).

## 6. Guardy obejmujące moduł nN (istniejące — muszą pozostać zielone)

arch_guard · solver_boundary/diff (FROZEN nietknięte) · catalog_binding/enforcement/gate ·
pcc_zero (LvPcc nie wchodzi do modelu) · overlay_no_physics · ui_no_physics (ui2) ·
no_codenames · forbidden_ui_terms (po N-D9 z ui2) · dead_click · dialog_completeness ·
sld_determinism · trace_determinism · resultset_v1_schema · canonical_ops (po N-D8 twardy).
