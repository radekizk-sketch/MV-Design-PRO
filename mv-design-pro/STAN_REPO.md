# STAN_REPO.md — ŻYWY REJESTR STANU MV-DESIGN-PRO

> **TO JEST PIERWSZE CZYTANIE DLA KAŻDEGO AGENTA.** Zanim sięgniesz po `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` (kanon docelowy), przeczytaj ten plik — mówi, co NAPRAWDĘ jest w repo i jaki jest RZECZYWISTY dług. Kanon mówi „co znaczy skończone"; ten rejestr mówi „gdzie jesteśmy". **Repo > specy > ten rejestr** (gdy rejestr jest nieaktualny, prawdą jest świeży skan repo wg §5.0).

**Ostatnia aktualizacja:** 2026-05-28 (sesja: weryfikacja wizualna) · **Gałąź:** `claude/zealous-bardeen-xrqtp` · **Poziom repo:** domknięcie V12.6 (PLANS.md v5.1)
**Cykl życia:** aktualizowany KAŻDĄ sesją. Każda zmiana stanu kryterium / długu → wpis tutaj.

---

## 1. ZDROWIE SYSTEMU (ground truth — uruchomione)

| Sprawdzenie | Wynik | Data |
|---|---|---|
| Backend pytest | 5249+ passed, 0 failed | 2026-05-28 |
| Frontend type-check (tsc) | PASS | 2026-05-28 |
| Guardy (arch/pcc/codenames/forbidden-terms/heurystyki/vulture) | PASS | 2026-05-28 |
| **Weryfikacja wizualna (Playwright headless + backend SQLite)** | **WYKONALNA i wykonana** | 2026-05-28 |
| Render 11 powierzchni na realnym projekcie | zrzuty w `docs/audit/visual/` | 2026-05-28 |
| Skala: backend 625 `.py` (+378 testów), frontend 597 `.tsx`/696 `.ts`, 88 guardów | — | 2026-05-28 |

**Wniosek:** warstwa obliczeniowa zdrowa i kompletna. Warstwa wizualna: **app shell, SLD,
analizy, kreator i pulpit renderują się poprawnie** (industrial/SCADA, symbole IEC,
etykiety katalogowe) — to NIE jest stan „0/10" z V12.2.

**KOREKTA względem poprzedniego wpisu:** ZASADA NR 2 jest w tym środowisku **wykonalna**
(headless Chromium renderuje + zrzuca; backend boot na SQLite bez Dockera). Poprzednie
„niewykonalne bez stacku" było zbyt pesymistyczne. Patrz `WERYFIKACJA_WIZUALNA_2026-05-28.md`.

---

## 2. CO JEST ZROBIONE (nie ruszać — K-23: zero utraconych funkcji)

- **Zwarcia** IEC 60909 (K3/K2/K1/K2E, Ik''/ip/Ith/Ib, κ, Z1/Z2/Z0) — FROZEN
- **Rozpływy** Newton-Raphson, Gauss-Seidel, Fast-Decoupled, niesymetryczny, **QSTS** (szereg czasowy)
- **Zabezpieczenia** 50/51 IDMT/TCC + sanity-checks (27/59/59N, 81U/81O/ROCOF, SPZ)
- **FRT/LVRT/HVRT** (RMS time-domain) — PODPIĘTE i liczą
- **Stabilność dynamiczna RMS** — PODPIĘTE
- **NC RfG / PTPiREE** bateria zgodności (LFSM-O/U, FSM, FRT, Q(U), harmoniczne, typy A/B/C/D, profile OSD) + API `/api/ncrfg-tests`
- **V12.6 E-35…E-45** (11 analiz) — wszystkie z API + White Box
- **Detekcja ziemnozwarciowa** sieci kompensowanych
- **SCR/WSCR per węzeł** (moduł `analysis/grid_strength`, 24 testy)
- **Frontend §7B**: app shell `AppShellV12`, selektor `case_ref`, router powierzchni, kanon ekranów `screenCanonRegistry.ts`, inspektor + White Box, powierzchnie V12.6
- **Harness zrzutowy** `frontend/scripts/visual-capture.mjs` (build realnego projektu + render + PNG)
- **TopBar — defensywny fallback statusu wyniku** (DEF-VIS-01: nieznany status nie wywraca app shella)

---

## 3. RZECZYWISTY DŁUG FUNKCJONALNY (do domknięcia, ZASADA NR 1)

| # | Pozycja | Kryterium | Status | Priorytet |
|---|---|---|---|---|
| D-01 | **Arc Flash** — energia incydentu IEEE 1584-2018, granice, ŚOI; IAC IEC 62271-200 jako obliczenie | K-25, §8C.1 | BRAK | 3 |
| D-02 | **CIM / CGMES** (IEC 61970/61968) import-eksport | K-30, §8C.8 | BRAK | 4 |
| D-03 | **SCR/WSCR per węzeł** (✔) + stabilność impedancyjna (Nyquist) + **SSCI** | K-30, §8C.4 | CZĘŚCIOWO (SCR done; impedancyjna/SSCI brak) | 2 |
| D-04 | **Jawny model obciążeń ZIP** P(U)/Q(U)/P(f)/Q(f) | K-29, §8C.5 | BRAK (QSTS jest) | 1 |
| D-05 | **IEC 61850** (logical nodes/GOOSE) + **estymacja stanu WLS** | §8C.8 | BRAK | 5 |
| D-06 | Dobór uziemienia (Petersen/rezystor), kompensacja Q, CVC/Volt-VAR, IEC 60853 | §8C.7 | ZWERYFIKOWAĆ zakres | 5 |
| D-10 | `ncrfg_compliance/checker.py` `DYNAMIC_TEST_IDS` zwracają `no_module` (legacy, niepodpięte do API) | — | DO WYGASZENIA | niski |
| D-11 | API 501: `power_flow_comparisons`, `power_flow_runs`, `fault_loop` TT/IT | — | DECYZJA ZAKRESOWA | niski |

## 3b. DŁUG WIZUALNY (z weryfikacji 2026-05-28 — patrz raport)

| # | Pozycja | Warunek | Status |
|---|---|---|---|
| DEF-VIS-01 | TopBar wywracał app shell przy nieznanym statusie wyniku | §7B.6 | **NAPRAWIONE** (fallback + test + PRZED/PO) |
| DEF-VIS-02 | Nakładka wyników (Ik'') nie pojawia się automatycznie na SLD | §7.9 A-03, §7.8 | OTWARTE (plan: utwardzić ścieżkę nakładki) |
| DEF-VIS-03 | Ucięta etykieta pola („Pole liniow…") | §7.9 A-06 | OTWARTE (drobne) |
| DEF-VIS-04 | Schemat nie dociśnięty do płótna (prawa część pusta) | §7.9 czytelność | OTWARTE (fit-to-content) |
| OBS-01 | BrandBlock pokazuje wersję „12.2" (repo: V12.6) | J-04 | DO DECYZJI |

---

## 4. BILANS KRYTERIÓW (K-01…K-30, J-01…J-05)

**Spełnione (dowód w kodzie):** K-02, K-03, K-05, K-06, K-09, K-10, K-11, K-12, K-16, K-18, K-22, K-23, K-24 (rdzeń), K-28 (większość).
**Częściowo / do potwierdzenia:** K-01 (dług = D-01…D-06), K-04 (progi V12.6 do walidacji testami), K-08 (sanity-bounds per poziom napięcia dla Ik''), K-13, K-14, K-26, K-27, K-29 (QSTS jest, ZIP brak), K-30 (SCR done; CIM/SSCI brak).
**Częściowo zweryfikowane WIZUALNIE (2026-05-28, zrzuty — patrz raport):**
- **K-07** (SLD 8/8): A-01/02/04/05/06 **PASS**; A-03 częściowo (nakładka); A-07 + tryb prezentacyjny — harness interakcyjny.
- **K-19** (frontend 9/9): warunki 1,2,8,9 **PASS**; 3,4,7 częściowo; 5,6 — harness interakcyjny.
- **K-20** (PRZED/PO): wykonane dla DEF-VIS-01; pozostałe w miarę wykrywania defektów.
- **K-21** (A-01…A-07 = 0): A-01…A-06 bez defektów krytycznych; DEF-VIS-03 (drobny) otwarty; A-07 niezweryfikowane.
**Nadal niezweryfikowane (wymagają harnessu interakcyjnego):** K-15 (komplet 9 stanów per surface), K-17 (pełna mapa przejść), J-01…J-05 (ocena ekspercka).

> **Uwaga o wadze (dla audytora):** K-04 i K-08 są ważniejsze niż brakujące moduły D-01…D-06.
> **Działający solver dający złą wartość jest groźniejszy niż brak solvera.**

---

## 5. ZADANIE BIEŻĄCE

**Weryfikacja wizualna (ZASADA NR 2) — WYKONANA w tej sesji** (korekta: wykonalna tu).
Produkt: `WERYFIKACJA_WIZUALNA_2026-05-28.md` + `docs/audit/visual/*.png` + harness
`frontend/scripts/visual-capture.mjs`. Naprawiono DEF-VIS-01 (PRZED/PO).
**Pozostało (następna sesja):** harness interakcyjny (A-07, synchronizacja 3-panelowa,
propagacja nieaktualności, power-user) + DEF-VIS-02/03/04.

---

## 6. KOLEJNOŚĆ DALSZEJ PRACY

1. **Harness interakcyjny** — domknąć K-07/K-19 (A-07, sync, nieaktualność, power-user) + DEF-VIS-02/03/04.
2. **K-04 + K-08** — walidacja progów V12.6 i sanity-bounds per poziom napięcia (wiarygodność wartości).
3. **D-04 ZIP** → **D-03 stabilność impedancyjna/SSCI** → **D-01 Arc Flash** → **D-02 CIM/CGMES** → **D-05/D-06**.
4. Porządki: D-10 (wygaszenie legacy), D-11 (decyzja zakresowa).

Każda pozycja: pełne wdrożenie (UI → solver → kontrakt → test → integracja), sanity-bounds, weryfikacja wizualna na renderze.

---

*Żywy rejestr stanu. Aktualizuj każdą sesją. Źródłem prawdy ostatecznej jest świeży skan repo (§5.0).*
