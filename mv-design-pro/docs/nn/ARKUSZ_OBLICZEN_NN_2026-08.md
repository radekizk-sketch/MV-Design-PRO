# ARKUSZ OBLICZEŃ OBWODÓW nN (2026-08-14) — BINDING

Dyspozycja właściciela: dla nN musi być możliwy arkusz wyników KLASY projektu
wykonawczego (wzorzec: tabela „Obliczenia kabli AC" — Ib, zabezpieczenie,
Ir=In·n, zapas %, Iz z współczynnikiem ułożenia, k2, I2, przewód/przekrój/γ,
kryteria Ib≤In≤Iz i I2≤1,45·Iz, długość, ΔU odcinkowy i całkowity) —
„co najmniej taki albo lepszy".

## Mapowanie kolumn wzorca → dostawcy nN (ONE SOURCE OF TRUTH, zero nowej fizyki)
| Kolumna wzorca | Dostawca |
|---|---|
| Nr / Wyszczególnienie | graf elektryczny: odpływ (ref aparatu→cel), grupowanie per rozdzielnica (odpowiednik „Budynek nr X") |
| Pi, cosφ, fazy | Load z modelu (tabliczka katalogowa) |
| Prąd oblicz. Ib | bieg rozpływu (metryka I_A gałęzi) ALBO z tabliczki (S=√3·U·I) — źródło NAZWANE w wierszu (`zrodlo_ib`) |
| Typ zab. / Wartość / Nastawa n / Ir=In·n | aparat z katalogu (device_kind, In; nastawa Ir dla MCCB z pól D1; MCB/gG: n=1) |
| Zapas zab. % | (Ir−Ib)/Ir |
| Obciążalność Iz | Iz′ = `cable_ampacity_derating.obciazalnosc_skorygowana` (zestaw G-D1) |
| Współczynnik k ułożenia | iloczyn współczynników zestawu (jawny rozkład w szczegółach wiersza) |
| k2 | mnożnik prądu zadziałania klasy aparatu (stałe P0.7: MCB 1,45 / gG 1,6 / MCCB 1,3·Ir) |
| Prąd zadział. I2 | k2·Ir |
| Przewód / przekrój / typ / γ | katalog kabla (γ z materiału: Cu 58, Al 35 MS/m — stała nazwana z normą) |
| Ib ≤ In ≤ Iz | kryterium (i) `nn_device_selection` — liczby + werdykt |
| I2 ≤ 1,45·Iz | kryterium (ii) — liczby + werdykt |
| Długość | model (suma odcinków trasy) |
| ΔU odc. / cał. % | dekompozycja P0.4/P0.5b (worst path per odpływ) |

## LEPIEJ niż wzorzec (kolumny dodatkowe)
Ik″max / Ik″min w punkcie zabudowy (bieg SC c-per-pasmo), Ik1_min pętli
(fault_loop), werdykt SWZ (3-stanowy), I²t≤k²S² (wytrzymałość cieplna),
status doboru (pełny werdykt / trzeci stan z przyczyną), PROVENANCE per
wiersz (run_id rozpływu/zwarcia + rewizja modelu + świeżość). Puste komórki
nie istnieją: każda wielkość ma wartość ALBO jawny stan (brak biegu /
nierozstrzygalne / nie dotyczy) z przyczyną PL.

## Architektura
1. Backend: agregator `application/analyses/nn_circuit_sheet.py` (NOWY —
   czysta kompozycja istniejących serwisów, warstwa analiz, ZERO fizyki) +
   `GET /api/cases/{id}/enm/nn-circuit-sheet?station_ref=` (wiersz macierzy
   API); wiersze per odpływ, grupowanie per rozdzielnica, deterministyczna
   kolejność; kontrakt JSON z pełnym rozkładem (wartości + werdykty + źródła).
2. Frontend: ekran „Arkusz obliczeń" w nN STUDIO (`ui2/spaces/model/
   nn-studio/` — nowa zakładka ARKUSZ; tabela wirtualizowana per D14, wiersz
   rozwijalny do szczegółów: rozkład współczynników k, odcinki ΔU, dowody
   kryteriów) + eksport CSV deterministyczny (średnik, przecinek dziesiętny
   — konwencja polska) z tą samą treścią co ekran.
3. Sekcja arkusza w kontrakcie raportu JSON (`build_nn_circuit_report_
   section` — addytywnie); PDF/DOCX po moście ENM→AnalysisRun (dług znany).
