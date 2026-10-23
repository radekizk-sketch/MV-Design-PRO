# Rozpływ mocy — typ wyniku interpretacji i kontrakt wejścia

Pakiet `analysis.power_flow` NIE liczy rozpływu i nie wywołuje solverów. Zawiera:

- `result.py` — `PowerFlowResult` (API FROZEN, reguła 6), wynik czytany przez warstwy
  interpretacji: widok interpretacji biegu (`api/canonical_run_views.py`), odtworzenie
  wyniku (`application/analyses/power_flow_reconstruction.py`), walidacja energetyczna
  (`analysis/energy_validation/builder.py`), interpretacja rozpływu
  (`analysis/power_flow_interpretation/builder.py`), profil napięć
  (`analysis/voltage_profile/builder.py`);
- `types.py` — reeksport kontraktu wejścia solvera
  (`network_model/solvers/power_flow_types.py`).

## Gdzie liczy się rozpływ

Jedna ścieżka produktu — bieg kanoniczny:
`enm/canonical_analysis.py::_execute_power_flow` → `enm/assembler.py::zloz_wejscie_rozplywu`
→ `solve_with_oltc` → solver NR / GS / FD (`network_model/solvers/power_flow_*.py`) →
`scal_rozwiazania_wysp` → `build_power_flow_result_v1`.

## Gdzie ocenia się naruszenia

- Odchylenie napięcia szyn: `analysis/energy_validation/builder.py::_check_voltage_deviation`
  i `analysis/power_flow_interpretation/builder.py` (progi z
  `analysis/normative/kryteria_napiecia.py` — jedno źródło prawdy).
- Obciążenie linii, kabli i transformatorów (prąd każdego zacisku wobec prądu
  znamionowego zacisku): `analysis/obciazenie_galezi.py`, konsumowane przez walidację
  energetyczną, pasma wiarygodności i interpretację rozpływu.

## Historia

Dawny adapter `PowerFlowSolver` / `solve_power_flow` (wywołanie `PowerFlowNewtonSolver`
w warstwie interpretacji) z modułami `analysis.py` (`assemble_power_flow_result`,
detekcja naruszeń względem `bus_limits`/`branch_limits`) i `_internal.py` został
skasowany kartą TORY-TYLKO-W-TESTACH (2026-09-30): nie miał konsumenta w produkcie, a
żaden producent nie wypełniał limitów. Bramka wskrzeszenia:
`scripts/legacy_public_path_guard.py`; granica importów warstwy analizy:
`scripts/arch_guard.py`.
