# G — MACIERZ LUK BACKENDU (BACKEND GAP MATRIX) + REJESTR DANYCH NORMATYWNYCH

Każda luka ma zdefiniowany kontrakt docelowy (zakaz fikcyjnych wyników — §78 zlecenia).
Priorytety: P0 = przed pierwszym użyciem modułu; P1/P2 wg faz H.

## 1. Luki backendu

| # | Luka | Stan zastany (dowód) | Kontrakt docelowy | Faza |
|---|---|---|---|---|
| G-01 | Operacje topologii nN (kabel/rozdzielnica/aparat/split/merge/sekcja) | brak (A1 §3.4) | rodzina `NN_NETWORK` ops (C §4.1) przez `execute_domain_operation` | P0 |
| G-02 | Archiwum ZIP bez ENM | `project_archive/service.py` — 0 ref ENM | sekcja `enm` w archiwum, round-trip deterministyczny | P0 (bloker) |
| G-03 | c per pasmo + scenariusz MIN w kanonicznym SC | `short_circuit_binding.py:91`; `.c_factor_min` martwe | helper c(pasmo węzła) + tryb MIN/MAX w bindingu i builderze; override jawny | P0 |
| G-04 | Korekta temperaturowa R dla Ik_min | brak członu R_θ | dekoracja wejścia (R_θ=R20·[1+0,004·(θ−20)]) w budowie grafu dla MIN; θ z katalogu | P0 |
| G-05 | Pętla zwarcia: ekstrakcja toru z grafu + upstream SN + najdalszy punkt | `fault_loop/service.py:119-122` (R=X=0, brak upstream) | builder P0.5b: trasa L + żyła powrotna z KABEL_NN, upstream Thevenin z grafu; wynik per punkt obwodu | P0 |
| G-06 | SWZ (tabela czasów + Ia↔Ik_min + werdykt) | brak w repo (A6 §4) | `application/analyses/swz/` 3-stanowa, dowód liczbowy, ResultSet v1 | P0 |
| G-07 | Krzywe aparatów nN (MCB/MCCB/gG) + jedna ścieżka krzywych | fantom FUSE; 2× IEC 60255 | silnik rodzin krzywych nN po scaleniu N-D4; MCB=stałe normatywne 60898-1, MCCB=katalog, gG=dane G-D2 | P0 |
| G-08 | Iz′ — korekty PN-HD 60364-5-52 | `cable_ampacity_derating` tylko SN-grunt | rozszerzenie o zestawy nN (dane G-D1) + wpięcie LVCableType | P0 |
| G-09 | I²t/k²S² dla gałęzi nN | przebieg tylko SN | przebieg nN w `wytrzymalosc_cieplna_przewodow` + Ith/Jth w KABEL_NN | P0 |
| G-10 | Ib≤In≤Iz + I2≤1,45·Iz′ | brak | analiza doboru zabezpieczeń nN (E) + równania w registry | P0 |
| G-11 | Selektywność/TCC z urządzeniami nN i prądami nN | koordynacja bez dopływu nN (A6 §5.4) | rozszerzenie `CoordinationInput` o urządzenia nN + prądy z biegów nN | P1 (fundament P0: krzywe) |
| G-12 | Pętla TT/IT (D-11) | 501 | fizyka TT (RA, RCD IΔn) i IT (pierwsze zwarcie) — odrębne modele wejścia | P1 |
| G-13 | RCD (model+katalog+logika doboru) | tylko prozа | `RcdType` + reguły kontekstu (układ sieci, falowniki, EV) | P1 |
| G-14 | Silniki nN (rozruch, ΔU rozruchu, DOL/soft/Y-D/VFD) | brak | moduł rozruchu (E, wiersz P1); wkłady SC z `machine_sc_iec60909` | P1 |
| G-15 | Agregat/UPS/SZR (typy katalogowe + przypadki pracy) | brak typów | `GensetType`/`UpsType` + przypadki GENERATOR_ISLAND/UPS_* + SWZ w wyspie | P1 |
| G-16 | Kompensacja nN | `ShuntCapacitorType` tylko SN | `KOMPENSATOR_NN` + reuse S22 preview + PF | P1 |
| G-17 | Rozpływ niesymetryczny w pipeline użytkownika + fazy odbiorów | solver BFS odcięty; brak pola fazy | builder ENM→`UnbalancedNetworkInput` + `connected_phases` + dispatch + bilans faz z propozycją przełożenia (bez auto-zmiany) | P1/P2 |
| G-18 | QSTS profile per odbiór/DER (24h/8760) | tylko OLTC 1-skalarowy | generalizacja pętli QSTS | P2 |
| G-19 | **LV HARMONIC LOAD FLOW** (THDi, widma, prąd N, derating) | brak | jawny BACKEND GAP — kontrakt do zdefiniowania przy P2; reuse `_power_quality` Z(f) | P2 |
| G-20 | Eksport XLSX/CSV tabel | brak jakiegokolwiek eksportu | moduł eksportu tabel (odcinki, wyniki) | P1 |
| G-21 | Pak dowodowy `LV_CIRCUIT_VERIFICATION` + raport nN | brak paku; VDROP osierocony | procedura 10-krokowa (A10 §9) + sekcje raportu §63 | P0 (pak) / P1 (pełny raport) |
| G-22 | Eligibility/dispatch dla analiz nN | ~~`AnalysisKind` = 3 rodzaje; eligibility 4 typy~~ **WYKONANE 2026-08-13 (karta G-22)**: `AnalysisKind` = 5, `AnalysisType` = 6; bramki eligibility reużywają predykaty `fault_loop.service`; dispatch woła wprost serwisy P0.6 na `enm.store` (deterministyczny `run_id`, uczciwe FAILED); bez persystencji `AnalysisRun` (świadome — most ENM→ResultSet to osobna decyzja); pin predykatów parami eligibility↔dispatch w `test_dispatch_service.py` (odbiór nadzoru) | + `FAULT_LOOP_NN`/`SWZ_NN` w dispatch + macierzy eligibility | P0 |

## 2. Rejestr danych normatywnych (zakaz odtwarzania z pamięci — wzorzec D-01/Arc Flash)

| # | Dane | Zakres | Tryb pozyskania | Bez danych |
|---|---|---|---|---|
| G-D1 | Tablice korekcyjne PN-HD 60364-5-52 (metody instalacji A1…F, temperatura, grupowanie, grunt) | Iz′ nN | plik danych z proweniencją (norma/karta producenta), status ZWERYFIKOWANY po akceptacji właściciela | Iz′ liczona wyłącznie z jawnie wybranym zestawem „warunki katalogowe =1,0" + WARNING W060 |
| G-D2 | Bramki czasowo-prądowe wkładek gG (IEC 60269-1 tab. bramek) | krzywe topikowe, SWZ, selektywność | jw. | wkładka bez krzywej → SWZ „dane niekompletne", nigdy PASS |
| G-D3 | Tab. 41.1 IEC 60364-4-41 (czasy wyłączenia wg U0 i układu) | SWZ | mała tabela normatywna, plik danych z cytatem | SWZ nie liczy się bez tabeli (blokada modułu SWZ) |
| G-D4 | Pasma B/C/D MCB (IEC 60898-1: 1,13/1,45·In; 3–5/5–10/10–20·In) | krzywe MCB | stałe normatywne w kodzie z referencją normy | jw. |
| G-D5 | Krzywe producenckie MCCB/ACB (Emax2, Tmax XT…) | TCC, selektywność, cascading | pakiety katalogowe per producent (curve-first, §55–56 zlecenia); architektura wieloproducencka | aparat bez krzywej → funkcje krzywej „dane niekompletne" |
| G-D6 | Tabele selektywności/cascading producentów | §21 zlecenia | dane opcjonalne pakietu producenta | selektywność wyłącznie z porównania krzywych |

Zasada: struktura + kontrakt + testy na strukturze idą w P0 niezależnie od danych; wynik
liczbowy pojawia się wyłącznie po zasileniu danymi z proweniencją (flip-to-verified bez zmian
kodu — wzorzec Arc Flash D-01).
