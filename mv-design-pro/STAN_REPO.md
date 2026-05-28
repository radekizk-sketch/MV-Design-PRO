# STAN_REPO.md — ŻYWY REJESTR STANU MV-DESIGN-PRO

> **TO JEST PIERWSZE CZYTANIE DLA KAŻDEGO AGENTA.** Zanim sięgniesz po `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` (kanon docelowy), przeczytaj ten plik — mówi, co NAPRAWDĘ jest w repo i jaki jest RZECZYWISTY dług. Kanon mówi „co znaczy skończone"; ten rejestr mówi „gdzie jesteśmy". **Repo > specy > ten rejestr** (gdy rejestr jest nieaktualny, prawdą jest świeży skan repo wg §5.0).

**Ostatnia aktualizacja:** 2026-05-28 · **Gałąź:** `claude/zealous-bardeen-xrqtp` · **Poziom repo:** domknięcie V12.6 (PLANS.md v5.1)
**Cykl życia:** aktualizowany KAŻDĄ sesją. Każda zmiana stanu kryterium / długu → wpis tutaj.

---

## 1. ZDROWIE SYSTEMU (ground truth — uruchomione)

| Sprawdzenie | Wynik | Data |
|---|---|---|
| Backend pytest | 5249 passed, 0 failed | 2026-05-28 |
| Frontend type-check (tsc) | PASS | 2026-05-28 |
| Guardy (arch/pcc/codenames/forbidden-terms/heurystyki/vulture) | PASS | 2026-05-28 |
| Skala: backend 625 `.py` (+378 testów), frontend 597 `.tsx`/696 `.ts`, 88 guardów | — | 2026-05-28 |

**Wniosek:** warstwa obliczeniowa zdrowa i kompletna. NIE jest to stan „kalkulator z UI" z prompta — to dojrzały, zielony pipeline.

---

## 2. CO JEST ZROBIONE (nie ruszać — K-23: zero utraconych funkcji)

- **Zwarcia** IEC 60909 (K3/K2/K1/K2E, Ik''/ip/Ith/Ib, κ, Z1/Z2/Z0) — FROZEN
- **Rozpływy** Newton-Raphson, Gauss-Seidel, Fast-Decoupled, niesymetryczny, **QSTS** (szereg czasowy)
- **Zabezpieczenia** 50/51 IDMT/TCC + sanity-checks (27/59/59N, 81U/81O/ROCOF, SPZ)
- **FRT/LVRT/HVRT** (RMS time-domain) — PODPIĘTE i liczą
- **Stabilność dynamiczna RMS** — PODPIĘTE
- **NC RfG / PTPiREE** bateria zgodności (LFSM-O/U, FSM, FRT, Q(U), harmoniczne, typy A/B/C/D, profile OSD) + API `/api/ncrfg-tests`
- **V12.6 E-35…E-45** (11 analiz): jakość energii, stabilność napięciowa (CPF/modalna/L-index), niezawodność N-1/N-2 MC, uziemienia IEEE 80, koordynacja izolacji, TRV/inrush, rozruch silników, hosting capacity MC, OPF/straty/LCC, walidacja benchmarkowa IEEE 9/14/39, niepewność k=2 — wszystkie z API + White Box
- **Detekcja ziemnozwarciowa** sieci kompensowanych
- **SCR/WSCR per węzeł** (dodane 2026-05-28, moduł `analysis/grid_strength`, 24 testy)
- **Frontend §7B**: app shell `AppShellV12`, selektor `case_ref`, router powierzchni, kanon ekranów `screenCanonRegistry.ts`, inspektor + White Box, powierzchnie V12.6

---

## 3. RZECZYWISTY DŁUG FUNKCJONALNY (do domknięcia, ZASADA NR 1)

| # | Pozycja | Kryterium | Status | Priorytet |
|---|---|---|---|---|
| D-01 | **Arc Flash** — energia incydentu IEEE 1584-2018, granice, ŚOI; IAC IEC 62271-200 jako obliczenie | K-25, §8C.1 | BRAK | 3 |
| D-02 | **CIM / CGMES** (IEC 61970/61968) import-eksport | K-30, §8C.8 | BRAK | 4 |
| D-03 | **SCR/WSCR per PCC** (✔ część) + stabilność impedancyjna (Nyquist) + **SSCI** | K-30, §8C.4 | CZĘŚCIOWO (SCR done; impedancyjna/SSCI brak) | 2 |
| D-04 | **Jawny model obciążeń ZIP** P(U)/Q(U)/P(f)/Q(f) | K-29, §8C.5 | BRAK (QSTS jest) | 1 |
| D-05 | **IEC 61850** (logical nodes/GOOSE) + **estymacja stanu WLS** | §8C.8 | BRAK | 5 |
| D-06 | Dobór uziemienia (Petersen/rezystor), kompensacja Q, CVC/Volt-VAR, IEC 60853 (cykliczna) | §8C.7 | ZWERYFIKOWAĆ zakres | 5 |
| D-10 | `ncrfg_compliance/checker.py` `DYNAMIC_TEST_IDS` zwracają `no_module` (legacy, niepodpięte do API) | — | DO WYGASZENIA (zastąpione przez `ncrfg_ptpiree`) | niski |
| D-11 | API 501: `power_flow_comparisons`, `power_flow_runs`, `fault_loop` TT/IT | — | DECYZJA ZAKRESOWA | niski |
| D-12 | **Tryb geo-schematyczny SLD** — odłożony (ENM bez współrzędnych geo); podłączyć do CGMES `DiagramLayout`/`PositionPoint` po D-02 | 7.6.C | ODŁOŻONY (zależny od D-02) | po D-02 |

**Domknięte porządkowo 2026-05-28:** D-07 (`eligibility_service` — usunięta fraza „Funkcja w przygotowaniu"), D-08 (`frt_hvrt` — usunięte etykiety-wymówki), D-09 (`ncrfg_compliance/checker` docstring).

---

## 4. BILANS KRYTERIÓW (K-01…K-30, J-01…J-05)

**Spełnione (dowód w kodzie):** K-02, K-03, K-05, K-06, K-09, K-10, K-11, K-12, K-16, K-18, K-22, K-23, K-24 (rdzeń), K-28 (większość).
**Częściowo / do potwierdzenia:** K-01 (dług = D-01…D-06), K-04 (solvery liczą; **progi do walidacji testami**), K-08 (sanity-bounds — **warstwa per poziom napięcia dla Ik'' do potwierdzenia**), K-13 (bramka CI), K-14 (coverage per moduł), K-26 (87T katalogowe; pełny solver różnicowy brak), K-27 (anti-islanding w profilach; blinding/sympathetic jawne — brak), K-29 (QSTS jest, ZIP brak), K-30 (SCR done; CIM/SSCI brak).
**NIEZWERYFIKOWANE WIZUALNIE (wymagają renderu — ZASADA NR 2):** K-15, K-17 (interakcja), oraz interakcyjne warunki §7B.9 (3/5/6, A-07).

> **KOREKTA 2026-05-28 (właściciel):** werdykt sesji „SLD = klasa industrialna" **ODRZUCONY**. Ocena na zrzucie `sld_canvas_detail.png`: **SLD = 1/10** jako schemat dokumentacyjny. K-07, K-21 (SLD) i J-01 **NIE są spełnione** — cofnięte do statusu „dług blokujący". Defekty V-01…V-06 (patrz `ZADANIE_WERYFIKACJA_WIZUALNA.md` §7) podniesione do blokujących; próg wyjścia: ekspert ≥ 8/10 + warunki §7.3. Render aplikacji działa (DEF-VIS-01 naprawiony) — ale „renderuje się" ≠ „schemat dobry". **Priorytet: realna przebudowa kompozycji SLD przed czymkolwiek innym.**
>
> **KOREKTA 2 (zrzut `4.png`) — BŁĄD FIZYCZNY:** dodane defekty blokujące **V-07** (przewody WISZĄ W POWIETRZU — muszą wychodzić z głowicy/terminala, schemat jest technicznie fałszywy bez modelu punktów przyłączenia), **V-08** (wszystkie elementy klikalne → konfiguracja/wyniki), **V-09** (test wyłącznie na sieci **≥ 50 stacji**, nie na zabawce), **V-10** (wszystkie łańcuchy OZE/BESS/FW + układy mieszane przetestowane wizualnie). Próg §7.3 rozszerzony do 11 warunków.

> **Uwaga o wadze (dla audytora):** K-04 i K-08 są ważniejsze niż brakujące moduły D-01…D-06. **Działający solver dający złą wartość jest groźniejszy niż brak solvera.** Walidacja progów V12.6 i sanity-bounds przeciw absurdom (np. Ik'' 116 kA na SN 15 kV) ma priorytet diagnostyczny.

---

## 5. ZADANIE BIEŻĄCE

**`ZADANIE_WERYFIKACJA_WIZUALNA.md`** — weryfikacja wizualna (ZASADA NR 2) na stacku z renderem. Priorytet najwyższy: zanim dosypiemy moduły, zobacz prawdę na ekranie. Wymaga `docker-compose up` + render przeglądarką — niewykonalne w bezgłowym kontenerze.

---

## 6. KOLEJNOŚĆ DALSZEJ PRACY

0. **PRZEBUDOWA SLD do progu ≥ 8/10** (`ZADANIE_WERYFIKACJA_WIZUALNA.md` §7) — NAJWYŻSZY priorytet. Ustalenia + decyzje (2026-05-28):
   - **V-07 = defekt RENDERU, nie modelu.** ENM ma pełny model terminali (`Port/PortRef/PortKind`, `endpoint_a_port/endpoint_b_port`, `starting_port_ref`, `external_ports`); `enmToSldAdapter.ts` go ignoruje, licząc geometrię ze sztywnych slotów (`Y_RUN_BASE`, `X_START + j×pitch`). Naprawa w adapterze, nie w modelu. Rozpływ/zwarcia wzdłuż połączeń mają na czym liczyć (model jest).
   - **Sieć 52 stacji (substrate `generate-large-network.mjs`) ujawniła „grzebień":** auto-layout = jeden płaski rząd, ~70% pustki, brak drzewa. To inadekwatność silnika layoutu przy skali — przebudowa, nie tweak.
   - **DECYZJA (właściciel):** layout + zakotwiczenie portów **równolegle**, przez wspólny kontrakt geometrii (silnik layoutu zwraca pozycje obiektów ORAZ portów; adapter rysuje krawędzie port→port, nie ze slotów).
   - **DECYZJA (właściciel):** SLD **przełączalny topologiczny ↔ geo-schematyczny** — jedna prawda topologiczna ENM, dwie warstwy geometrii (zakaz drugiej prawdy). Tryb topologiczny: laterale w rankach (koniec grzebienia). Tryb geo: **diagnoza wykonana 2026-05-28 → ENM NIE MA współrzędnych geo** (tylko `position_km` topologiczne). **Tryb geo ODŁOŻONY jako dług D-12** — wartość naprawcza jest w topologicznym; geo podłączy się do CGMES `DiagramLayout`/`PositionPoint` (D-02) w swoim czasie. Robimy najpierw tryb topologiczny do ≥8/10.
   - **Kontrakt geometrii dostarczony:** `docs/sld/SLD_GEOMETRY_CONTRACT_V1.md` — `LayoutEngine.layout(snapshot, mode) → LayoutResult` (pozycje obiektów + portów); adapter czyta kotwice, rysuje port→port. **Nie ma dedykowanego silnika layoutu** — to nowa warstwa, nie refaktor.
   - Próg §7.3 (11 warunków, ≥8/10) obowiązuje dla trybu topologicznego na sieci ≥50 stacji.
   - **POSTĘP (impl, iteracja 1, 2026-05-28):** generator naprawiony → substrate **52 stacje + 12 LATERALÓW** (drzewo; `sld_large_network*.png`). Payloady ops ustalone empirycznie (branch: `from_ref=<feederFieldRef>.BRANCH`; converter: `source_technology`+`connection_variant=block_transformer`+`station_ref`).
   - **USTALENIE LAYOUTU (ze zrzutu 52-stacji z lateralami):** adapter „kanały Y per run" FAKTYCZNIE tworzy laterale (poziome rzędy stacji) — drzewo istnieje. ALE: **(a)** auto-fit zostawiał drzewo malutkie w rogu; **(b)** laterale lewo-wyrównane do tego samego X (stos), bo `buildSldLineRunsForLayout` klasyfikował WSZYSTKIE korytarze jako `main_trunk` (brak `branch_origin_station_ref`), a `stationXFromCumKm` miał `minimumX` przyklejony do `X_STATIONS_START`.
   - **POSTĘP (impl, iteracja 2, 2026-05-28) — DRZEWO ROZŁOŻONE ✔ (zrzut `sld_large_network*.png`):** (1) `buildSldLineRunsForLayout` klasyfikuje teraz korytarz jako `branch` z `branch_origin_station_ref`, gdy stacja-rodzic (from_bus pierwszego segmentu) leży na innym runie; (2) `stationXFromCumKm` ma param `minimumBaseX`; (3) `buildStations` startuje laterale od X stacji-rodzica. Efekt na zrzucie: pozioma **magistrala S02→S18 na pełną szerokość + laterale schodzące w dół w punktach przyłączenia** (S23 pod S03, S25–S27, S28–S29, S30–S33…) — ewidentna zmiana ze „stosu" na **drzewo**. 2232 testy SLD zielone.
   - **POZOSTAJE (SLD < 8/10, nie zamykać):** **(a) fit/wypełnienie pionowe** — drzewo siedzi w dolnej połowie, górne ~40-50% kadru puste (auto-fit po realnym zasięgu treści ≥75%); **(b) V-07** zakotwiczenie do portów głowic (krawędzie port→port, nie do slotów); **(c) V-10** OZE (generator der=0 — `add_converter_source` binding); **(d) V-06** tryb prezentacyjny; **(e) V-08** klikalność. Werdykt eksperta jeszcze < 8/10.
   - **OZE (V-10) — BLOKER MODELOWY (zdiagnozowany, nie zmyślony):** `add_converter_source` z `connection_variant=block_transformer` używa trafo stacji (630 kVA @ 0.4 kV). Warianty katalogowe konwerterów: PV `conv-pv-sma-1p5mw` = 1650 kVA (> 630), `pv_inv_sma_2500`/`bess_pcs_sma_2200` = 0.69 kV (≠ 0.4 kV) → odrzucane (capacity/voltage mismatch). `FALOWNIK/inv-pv-1500` przeszedł w izolowanym probe, ale w pełnym generatorze daje `catalog.ref_required`. **Do zrobienia:** dedykowany transformator blokowy OZE (nie trafo dystr. stacji) ALBO wariant katalogowy ≤630 kVA @ 0.4 kV ALBO `nn_side` z `bus_nn_ref`. Nie udajemy OZE bez poprawnego modelu.
   - **POMIAR FILL (§7.3.1, harness):** union-bbox elementów SLD = **fillW 100% / fillH 100%** (treść rozpięta na cały kadr), ALE kompozycja rzadka — pusty górny-prawy obszar (GPZ izolowany lewy-górny, magistrala niżej). „≥75% bbox" spełnione; „zero wielkich pustych obszarów" — NIE. Do poprawy: zbalansowanie drzewa (laterale nad i pod magistralą) lub zmniejszenie luki GPZ→magistrala.
1. **Reszta weryfikacji wizualnej** — harness interakcyjny (A-07, §7B.9-3/5/6), pozostałe surface'y.
2. **K-04 + K-08** — walidacja progów V12.6 i sanity-bounds (wiarygodność wartości przed nowymi modułami).
3. **D-04 ZIP** → **D-03 stabilność impedancyjna/SSCI** → **D-01 Arc Flash** → **D-02 CIM/CGMES** → **D-05/D-06**.
4. Porządki: D-10 (wygaszenie legacy), D-11 (decyzja zakresowa).

Każda pozycja: pełne wdrożenie (UI → solver → kontrakt → test → integracja), sanity-bounds, weryfikacja wizualna na stacku.

---

*Żywy rejestr stanu. Aktualizuj każdą sesją. Źródłem prawdy ostatecznej jest świeży skan repo (§5.0) — gdy ten plik się z nim rozjedzie, prawdą jest repo.*
