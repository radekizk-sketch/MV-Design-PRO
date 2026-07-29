# Solvers — Notes (Operational)

> **Canonical definitions live in** [`SYSTEM_SPEC.md`](../SYSTEM_SPEC.md).
> This document is a practical orientation guide and avoids architectural decisions.

## 1. Where solvers live (as-is)
- **IEC 60909 short-circuit solver:**
  - `backend/src/network_model/solvers/short_circuit_iec60909.py`
- **Power Flow Newton-Raphson solver:**
  - `backend/src/network_model/solvers/power_flow_newton.py`
  - `backend/src/network_model/solvers/power_flow_newton_internal.py`
- **Power Flow Gauss-Seidel solver (FIX-08):**
  - `backend/src/network_model/solvers/power_flow_gauss_seidel.py`
- **Analysis layer wrapper:**
  - `backend/src/analysis/power_flow/`

> **Note:** All physics solvers live in `network_model/solvers/`.
> The analysis layer wraps solvers and adds interpretation.

## 2. Operational conventions
- **Do not change** frozen Result APIs (IEC 60909).
- **White-box trace** must remain explicit and auditable.
- Keep solver changes deterministic and traceable.

## 3. Adding or updating solver documentation
- Document only **operational steps** here (e.g., how to run a solver, how to locate inputs/outputs).
- All solver semantics and boundary decisions belong in `SYSTEM_SPEC.md`.

## 4. Power Flow: Gauss-Seidel vs Newton-Raphson

### Comparison Table

| Kryterium | Gauss-Seidel | Newton-Raphson |
|-----------|:------------:|:--------------:|
| Szybkość zbieżności | ❌ Wolna (liniowa) | ✔️ Szybka (kwadratowa) |
| Stabilność | ⚠️ Może nie zbiegać się | ✔️ Stabilna dla większości sieci |
| White-Box trace | ✔️ Pełny | ✔️ Pełny |
| Zalecane do produkcji | ❌ | ✔️ |
| Zastosowanie edukacyjne | ✔️ | ⚠️ Bardziej skomplikowany |
| Weryfikacja wyników NR | ✔️ | — |

### Kiedy używać Gauss-Seidel?

1. **Edukacja i nauka** — prosty algorytm, łatwy do zrozumienia
2. **Weryfikacja wyników** — porównanie z Newton-Raphson (cross-check)
3. **Trudne przypadki zbieżności** — czasem GS z under-relaxation może pomóc
4. **Szybkie szacunki** — pierwsza iteracja GS daje przybliżone wyniki

### Kiedy używać Newton-Raphson?

1. **Produkcja** — standardowy solver dla wszystkich obliczeń
2. **Duże sieci** — GS zbyt wolny dla sieci > 50 węzłów
3. **Wymagana dokładność** — NR daje wyniki w mniejszej liczbie iteracji

### Przykład użycia Gauss-Seidel

```python
from network_model.solvers.power_flow_gauss_seidel import (
    GaussSeidelOptions,
    solve_power_flow_gauss_seidel,
)

# Opcje GS z przyspieszeniem (SOR)
gs_options = GaussSeidelOptions(
    acceleration_factor=1.5,  # Zakres: 0.5-2.0
    allow_fallback=True,      # Fallback do NR przy braku zbieżności
    max_iter=100,
    tolerance=1e-6,
)

result = solve_power_flow_gauss_seidel(pf_input, gs_options)

# Sprawdź, która metoda została użyta
print(result.solver_method)  # "gauss-seidel" lub "newton-raphson" (fallback)

if result.fallback_info:
    print(f"Użyto fallback: {result.fallback_info['fallback_used']}")
```

### Współczynnik przyspieszenia (acceleration_factor)

| Wartość | Nazwa metody | Zastosowanie |
|---------|--------------|--------------|
| 0.5 - 1.0 | Under-relaxation | Większa stabilność, wolniejsza zbieżność |
| 1.0 | Standard GS | Klasyczna metoda Gaussa-Seidla |
| 1.0 - 2.0 | Over-relaxation (SOR) | Szybsza zbieżność dla dobrze uwarunkowanych sieci |

**Typowa optymalna wartość:** 1.4 - 1.8 dla większości sieci.

## 5. Parametry transformatora — ZAKRES KONSUMPCJI i OGRANICZENIA MODELU

> Nota faktograficzna (opisuje istniejące zachowanie, nie decyzję architektoniczną).
> Dotyczy transformatorów `Transformer2W`, w tym TR blokowego DER
> (rola `TRANSFORMATOR_BLOKOWY_DER`, program DOBÓR-OZE, kanon
> `docs/sld/RECENZJA_DER_SN_DOBORY_2026-07.md` wym. 7+8). JEDEN model —
> solver czyta parametry zmaterializowane z typu katalogowego (zakaz modelu
> rysunkowego i osobnego obliczeniowego).

Parametry tabliczkowe płyną z typu katalogowego przez materializację ENM
(`enm/domain_operations*.py`) i wejście solvera
(`solver_input/builder.py` → `TransformerPayload`) do rdzenia
`network_model/core/branch.py` (`TransformerBranch`). Proweniencja każdego pola
(w tym `vector_group`) jest w śladzie WHITE BOX wejścia solvera.

### 5.1 Parametry KONSUMOWANE przez solvery produkcyjne

| Parametr | Gdzie liczony | Jak wchodzi do fizyki |
|----------|---------------|------------------------|
| `uk_percent` | PF (NR/GS/FD), SC IEC 60909 | Impedancja szeregowa gałęzi: `z_pu = uk/100`; `X = √(z² − r²)` (`branch.py::get_short_circuit_impedance_pu` / `get_impedance_pu`). |
| `pk_kw` (Pcu) | PF, SC IEC 60909 | Rezystancja szeregowa: `r_pu = (pk/1000)/Sn`. |
| `tap_position`/`tap_changer` | PF (Y-bus) | Przekładnia odczepu (`get_tap_ratio`). |

Prąd zwarciowy 3-fazowy (`compute_3ph_short_circuit`) liczy WYŁĄCZNIE składową
zgodną z impedancji szeregowej TR (`uk`, `pk`) w Theveninie — to jest realna
konsumpcja parametrów impedancyjnych TR blokowego.

### 5.2 Ograniczenia — parametry NIESIONE przez model, ale NIE konsumowane w tej ścieżce

Zapisane JAWNIE (zero fabrykacji — nie dorabiamy fizyki na skróty):

1. **Układ połączeń (`vector_group`, np. Dyn5/Dyn11/YNyn)** — jest kanonicznym
   PARAMETREM MODELU (katalog → payload → materializacja → snapshot → wejście
   solvera) i podlega walidacji spójności z typem katalogowym
   (`enm/der_sn_validation.py::validate_block_transformer_vector_group`, kod
   `converter.der_sn.grupa_polaczen_niezgodna_z_katalogiem`). NIE jest jednak
   konsumowany przez produkcyjny PF ani SC 3-fazowy: PF nie modeluje
   przesunięcia fazowego grupy w Y-bus (`power_flow_newton_internal.py::_branch_admittance_pu`
   — brak członu przesunięcia), a `compute_3ph_short_circuit` liczy tylko
   składową zgodną (brak modelu składowej zerowej sterowanej grupą połączeń
   ani zwarć niesymetrycznych 1-/2-fazowych z rozłożeniem faz wg grupy).
   Konsekwencja dla analizy zabezpieczeń: przesunięcie faz i ścieżka składowej
   zerowej wynikające z grupy NIE są dziś odwzorowane w wyniku solvera.
2. **Gałąź magnesująca (`p0_kw`, `i0_percent`)** — niesiona przez model i wejście
   solvera, ale produkcyjny PF ustawia bocznik TR na zero
   (`_branch_admittance_pu` → `y_shunt = 0`), więc straty jałowe i prąd
   magnesujący nie wchodzą do rozpływu. (Konsumuje je akademicki solver strat
   `v126_academic.py`.)
3. **Korekcja impedancji K_T wg IEC 60909** — solver SC nie stosuje współczynnika
   korekcyjnego impedancji transformatora K_T; używa impedancji nominalnej
   z `uk`/`pk`.

Domknięcie tych ograniczeń wymaga rozszerzenia modelu solverów (składowa zerowa
z grup połączeń, gałąź magnesująca, K_T) i jest DŁUGIEM MODELU do osobnej decyzji
produktowej — nie obejściem w warstwie UI/analiz.
