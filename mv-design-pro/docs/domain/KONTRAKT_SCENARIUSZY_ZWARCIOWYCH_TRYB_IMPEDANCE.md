# Kontrakt scenariuszy zwarciowych — tryb IMPEDANCE (impedancja zwarcia Z_f)

**Status:** WIĄŻĄCY dla karty OD-14 (decyzja doradcy z delegacją właściciela O-59, 2026-09-30 — rejestr O-61/O-66/O-72 w `../plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; zgoda B-01 na addytywną edycję `network_model/solvers/short_circuit_core.py` wydana w ramach O-59). Pomiar 2026-09-30: żaden dokument w `docs/domain` nie opisywał trybu IMPEDANCE scenariusza zwarciowego (grep `IMPEDANCE|fault_scenario|r_f_ohm` = 0 poza modelem odbioru `CONSTANT_IMPEDANCE`) — ten plik zamyka lukę.
**Stan kodu (przed kartą):** model scenariusza `backend/src/domain/fault_scenario.py:198-296` i UI `PanelScenariuszy.tsx:231-240` już niosą tryb IMPEDANCE; rdzeń `short_circuit_core.py:67-111` liczy bez Z_f; bieg blokuje `ELIG_BINDING_UNSUPPORTED_FAULT_IMPEDANCE` (`fault_scenario_service.py:547-553`).

## 1. Pola (jedno nazewnictwo w całym repo)
| Pole | Typ / jednostka | Reguła | Uwagi |
|---|---|---|---|
| `r_f_ohm` | float, Ω | wymagane w trybie IMPEDANCE; **R_f ≥ 0** | ta sama nazwa co w `dynamika/kontrakty.py:571-572, :605-606` — zakaz drugiej nazwy tej wielkości; sufiks jednostki wg rejestru K-05 (`domain/units.py`) i `x-unit` w OpenAPI |
| `x_f_ohm` | float, Ω | wymagane w trybie IMPEDANCE; **X_f ≥ 0** | impedancja pojemnościowa (X_f < 0) odrzucana nazwaną odmową `sc.impedancja_zwarcia_pojemnosciowa` przez `OdmowaDanychError` (API 422) i rejestr `CalculationReadinessService` (O-65) |
| tryb `IMPEDANCE` vs `BOLTED` | enum scenariusza | `BOLTED` ≡ `r_f_ohm = x_f_ohm = 0` | parytet bit w bit z dzisiejszym wynikiem dla Z_f = 0 (goldeny 336/168) |

## 2. Fizyka (rdzeń IEC 60909, addytywnie)
- Parametr Z_f = R_f + jX_f wchodzi addytywnie do `compute_equivalent_impedance` i czterech metod `compute_*_short_circuit` (`exclude_none`): 3F: Z_1 + Z_f; 2F: Z_1 + Z_2 + Z_f; 1F: Z_1 + Z_2 + Z_0 + 3·Z_f; 2FE: 3·Z_f w torze składowej zerowej — wzory jawne w White Box i w `EquationRegistry` (LaTeX).
- Twierdzenie sanity-bound: przy R_f ≥ 0, X_f ≥ 0 i Z_1 w pierwszej ćwiartce zachodzi |Z_1 + Z_f|² = |Z_1|² + |Z_f|² + 2·Re(Z_1·conj(Z_f)) ≥ |Z_1|², więc |I_k(Z_f)| ≤ |I_k(0)| jest własnością algebraiczną, nie nadzieją — test iloczynu ją przypina.
- i_p (κ) i I_th dla Z_f ≠ 0 liczone jawnym wzorem z R/X pełnej pętli.

## 3. Zakres ważności i proweniencja (werdykt wyjaśnialny)
- Wynik z Z_f ≠ 0 dostaje w proweniencji `poza_zakresem_iec60909 = true` (norma definiuje prąd zwarciowy dla zwarcia metalicznego).
- Warstwa autorytetu (`network_model/core/zdolnosci_wkladu_zwarciowego.py`, kody SI-110…SI-116 → nowy kod w serii SI-117+, O-66) **blokuje** użycie i_p/I_th z Z_f ≠ 0 w doborze wytrzymałości zwarciowej i w pakiecie Equipment; **dozwolony konsument**: nastawy zabezpieczeń doziemnych (prądy minimalne) — wpisany jawnie w tej samej liście konsumentów autorytetu, nie jako wyjątek w konsumencie.
- Prezentacja: Z_f i jej źródło w `InformacjeAudytowe` i w tabeli wyniku `ui2/wyniki/zwarcia`; krok Z_f w dowodzie SC3F.

## 4. Kryterium ukończenia karty OD-14
- Test iloczynu: {3F, 2F, 1F, 2FE} × {Z_f = 0, R_f > 0, X_f > 0, X_f < 0 → odmowa} × {konsument: dobór, Equipment, nastawy doziemne}; wyrocznia analityczna sieci promieniowej; Z_f = 0 → goldeny bit w bit; `solver_diff_guard` z sankcją; kasacja `ELIG_BINDING_UNSUPPORTED_FAULT_IMPEDANCE`; e2e kreator → bieg IMPEDANCE → ekran.
