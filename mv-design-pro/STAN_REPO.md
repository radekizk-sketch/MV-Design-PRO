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

0. **PRZEBUDOWA KOMPOZYCJI SLD do progu ≥ 8/10** (`ZADANIE_WERYFIKACJA_WIZUALNA.md` §7) — defekty V-01…V-10 blokujące. NAJWYŻSZY priorytet: SLD to interfejs do silnika dowodowego, a obecnie jest 1/10.
   - **DIAGNOZA V-07 (ustalona — wymóg „najpierw ustal render vs model"): to DEFEKT RENDERU, nie braku modelu.** ENM MA pełny model terminali: `Port`/`PortRef`/`PortKind`, `endpoint_a_port`/`endpoint_b_port` na kablu/linii, `starting_port_ref` na polu, `external_ports` na stacji (`backend/src/enm/models.py`). Frontend `enmToSldAdapter.ts` liczy geometrię odpływów ze **sztywnych slotów** (`Y_RUN_BASE = CANONICAL_GPZ_FRAME_BOTTOM_Y + GPZ_FIELD_CABLE_HEAD_CLEARANCE_Y(44)`, stacje `X_STATIONS_START + j×PITCH`) zamiast z pozycji portu głowicy. **Naprawa = zakotwiczenie pathPoints odpływu do pozycji portu (głowica pola odpływowego → terminal następnego obiektu) + symbol głowicy na obu końcach. Miejsce: `enmToSldAdapter` geometria, NIE model.**
   - **V-09 substrate ZBUDOWANY:** `frontend/scripts/generate-large-network.mjs` generuje proceduralnie sieć **52 stacji** (285 szyn, 157 pól, 53 TR, 6,42 km). Render: `docs/audit/visual/sld_large_network*.png`.
   - **KLUCZOWE USTALENIE NA SKALI (V-09):** przy 52 stacjach auto-layout układa wszystkie stacje w **JEDNYM POZIOMYM RZĘDZIE** („grzebień") wzdłuż jednej magistrali → ~70% kadru pustego pionowo, **brak drzewa/hierarchii** (realna sieć SN rozgałęzia się w laterale). Zabawka 1-stacyjna to ukrywała. **To wymaga realnej przebudowy silnika layoutu (hierarchiczny/drzewiasty rozkład radialny), nie tweaka.**
   - **Zrobione w poprzednim commicie (test-safe):** V-05/V-02 cienkie magistrale (8→3,5 px), V-01 centrowanie (część), V-04 dedup „GPZ 15 kV".
   - **POZOSTAJE BLOKUJĄCE (SLD < 8/10, NIE zamykać):** V-01 (wypełnienie — layout), V-03 (hierarchia/drzewo — layout), V-04 (ucięcie etykiety pola), V-06 (tryb prezentacyjny), **V-07** (zakotwiczenie do portów — adapter), **V-08** (klikalność — audyt), **V-09** (czytelność/wydajność na 52 stacjach), **V-10** (łańcuchy OZE — generator `add_converter_source` payload do poprawienia, der=0). **K-07, K-21, J-01 NADAL NIE spełnione.**
1. **Reszta weryfikacji wizualnej** — harness interakcyjny (A-07, §7B.9-3/5/6), pozostałe surface'y.
2. **K-04 + K-08** — walidacja progów V12.6 i sanity-bounds (wiarygodność wartości przed nowymi modułami).
3. **D-04 ZIP** → **D-03 stabilność impedancyjna/SSCI** → **D-01 Arc Flash** → **D-02 CIM/CGMES** → **D-05/D-06**.
4. Porządki: D-10 (wygaszenie legacy), D-11 (decyzja zakresowa).

Każda pozycja: pełne wdrożenie (UI → solver → kontrakt → test → integracja), sanity-bounds, weryfikacja wizualna na stacku.

---

*Żywy rejestr stanu. Aktualizuj każdą sesją. Źródłem prawdy ostatecznej jest świeży skan repo (§5.0) — gdy ten plik się z nim rozjedzie, prawdą jest repo.*
