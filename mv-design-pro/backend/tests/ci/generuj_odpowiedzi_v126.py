"""Generator fixtur odpowiedzi solvera V12.6 dla strażnika prezentacji (V126-JEZYK).

Fixtury są REALNYMI odpowiedziami solvera `V126AcademicSolver` — strażnik
prezentacji w warstwie frontu (`ui2/wyniki/akademickie/__tests__/prezentacja.straznik.test.tsx`)
renderuje na nich każdy z rodzajów kontraktu i sprawdza, że na ekranie
projektanta nie pojawia się ani jeden kod produkcyjny (ścieżka klucza,
indeks tablicy, surowa referencja, JSON, anglicyzm).

Referencje obiektów mają POSTAĆ PRODUKCYJNĄ (`gpz/<odcisk>/section/001/bus_sn`) —
dokładnie taką, jaką właściciel zobaczył na zrzucie ocenionym na 0/10. Fixtura
z ładnym `B1` nie sprawdziłaby niczego: strażnik ma widzieć to, co widzi
projektant.

Uruchomienie (z katalogu `backend/`):
    poetry run python tests/ci/generuj_odpowiedzi_v126.py
Parytet pliku z bieżącym solverem pilnuje `tests/ci/test_v126_odpowiedzi_fixtury.py`.

PRZELICZENIA FIXTURY — ŚWIADOME, Z WARTOŚCIAMI PRZED I PO
---------------------------------------------------------
Fixtura jest odciskiem odpowiedzi solvera, więc każda zmiana numeryki ją
przelicza. Przeliczenie MILCZĄCE jest zabronione — poniżej rejestr zmian.

2026-08-08, karta QU-FABRYKACJA, rodzaj `voltage_stability`
(wersja solvera 1.1 → 1.2). Solver przestał wyznaczać wielkości stojące na
współczynnikach bez pokrycia w danych i na zmyślonej mocy zwarciowej węzła.

  wielkość                            PRZED                     PO
  ----------------------------------- ------------------------- ------
  voltage_stability_margin_percent    250,0                      None
  pv_curves[].lambda_max              3,5 (obie szyny)           None
  pv_curves[].margin_percent          250,0 (obie szyny)         None
  pv_curves[].u_at_max                0,7 (obie szyny)           None
  qv_curves[].q_min_mvar              −0,0175 · −0,385           None
  qv_curves[].q_available_mvar        0,0 · 0,045                None
  qv_curves[].margin_mvar             −0,0175 · −0,34            None
  l_index_per_bus[].l_index           0,0008 · 0,055             None
  l_index_per_bus[].alert             false (obie szyny)         None
  modal_analysis.smallest_eigenvalue  0,945                      None
  critical_mode.participating_buses   [szyna stacji]             []
  sanity.status                       „zweryfikowany"            „dane niekompletne"
  sanity.checks_passed                4                          0

Trzy liczby warte odnotowania, bo pokazują, czym te wielkości były naprawdę:
`margin_percent` wychodził 250,0 dla KAŻDEJ szyny (nasycenie zaszytego 2,5),
`u_at_max` — 0,7 dla każdej (obcięcie dolne), a `q_available_mvar` = 0,0 dla
szyny GPZ było ZEREM UDAJĄCYM POMIAR: nie znaczyło „zmierzono brak zapasu",
tylko „nie było czego liczyć". Dokładnie tego rozróżnienia pilnuje teraz `None`.

Klucze DOPISANE (kontrakt addytywny, FROZEN nietknięty): `brak_danych` na
poziomie wyniku, w każdym wierszu `pv_curves`/`qv_curves`/`l_index_per_bus`
oraz w `modal_analysis` — powód po polsku mówiący, jakich danych brakuje.

2026-09-05, karta FAB-D2 (D2), rodzaj `opf_loss_lcc`. `V126TransformerInput.p0_kw`
niesie teraz `None` zamiast cichego 0.0 (`solver_input/v126_contracts.py` przestał
podstawiać `transformer.p0_kw or 0.0`), a model wejściowy tej fixtury dostał
JAWNĄ stratę jałową (18,0 kW — nameplate 16 MVA), zamiast dalej polegać na
cichym zerze. `transformer_losses_kw` = `p0_kw + pk_kw·0,45²`.

  wielkość                 PRZED       PO
  ------------------------ ----------- -----------
  transformer_losses_kw    18,225      36,225
  total_losses_kw          23,39789    41,39789
  annual_losses_kwh        93591,556   165591,556
  annual_co2_kg            67385,92    119225,92
  lcc_loss_opex_pv_pln     935175,54   1654606,25

Straty jałowe transformatora BYŁY pomijane w LCC strat — 16 MVA GPZ bez
uwzględnienia strat jałowych zaniżało roczne zużycie energii i koszt cyklu
życia strat o realną wielkość (18 kW × 8760 h ≈ 158 MWh/rok pominięte).

Skutek uboczny UJAWNIONY, nie ukryty: rodzaj `hosting_capacity` (Monte Carlo)
też przesunął `hosting_capacity_mw` 7,6 → 7,8 MW dla szyny stacji — ziarno
losowania (`_hosting_capacity_bus_seed`) pochodzi z SKRÓTU CAŁEGO ładunku
wejściowego (odtwarzalność wymaga, by ten sam ładunek dawał ten sam wynik), więc
KAŻDA zmiana ładunku — nawet pola, którego ta analiza fizycznie nie czyta —
przesuwa ziarno i wynik losowania w paśmie niepewności Monte Carlo. To nie jest
zmiana merytoryczna zdolności przyłączeniowej, tylko przesunięcie próbki losowej.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Uruchomienie jako skrypt CLI (poza pytest) wymaga `src` na sciezce importu.
# Sciezka podana WPROST — guard `test_testy_nie_cieniuja_pakietow_zrodlowych`
# czyta tekst argumentu, a nie wartosc zmiennej, i ma racje: nazwa katalogu
# musi byc widoczna w miejscu wstrzykniecia.
if str(Path(__file__).resolve().parents[2] / "src") not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from network_model.solvers.v126_academic import V126AcademicSolver  # noqa: E402
from solver_input.v126_contracts import (  # noqa: E402
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126HarmonicSourceInput,
    V126TransformerInput,
)

# Ścieżka fixtury czytanej przez strażnika frontu.
SCIEZKA_FIXTURY = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui2"
    / "wyniki"
    / "akademickie"
    / "__tests__"
    / "odpowiedziSolvera.json"
)

# Referencje w postaci produkcyjnej — takie widział właściciel na zrzucie.
REF_GPZ_SZYNA = "gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn"
REF_STACJA_SZYNA = "station/1f4c9a02b7d84e6690ab5cc31d772e18/bus_sn"
REF_KABEL = "corridor/6d2b81f0c4e34a1b9f5d70ae2c8b4913/segment/001"


def model_wejsciowy() -> V126AcademicInput:
    """Model wejściowy odwzorowujący realny fragment sieci SN (GPZ + stacja)."""
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref=REF_GPZ_SZYNA,
                name="GPZ Zachód — szyny SN",
                nominal_kv=15.0,
                fault_level_mva=250.0,
            ),
            V126BusInput(
                ref=REF_STACJA_SZYNA,
                name="Stacja SN/nN Ogrodowa",
                nominal_kv=15.0,
                load_mw=1.4,
                load_mvar=0.45,
                generation_mw=0.3,
                customer_count=120,
                fault_level_mva=80.0,
            ),
        ],
        branches=[
            V126BranchInput(
                ref=REF_KABEL,
                from_bus_ref=REF_GPZ_SZYNA,
                to_bus_ref=REF_STACJA_SZYNA,
                kind="cable",
                length_km=4.0,
                r_ohm_per_km=0.206,
                x_ohm_per_km=0.118,
                b_siemens_per_km=2.5e-6,
                ampacity_a=260.0,
            )
        ],
        transformers=[
            V126TransformerInput(
                ref="transformer/9a71c3de5b8f42079d16e0b4a2c85f31",
                hv_bus_ref=REF_GPZ_SZYNA,
                lv_bus_ref=REF_STACJA_SZYNA,
                sn_mva=16.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=90.0,
                p0_kw=18.0,
            )
        ],
        harmonic_sources=[
            V126HarmonicSourceInput(
                bus_ref=REF_STACJA_SZYNA,
                source_ref="pv/3c8e2a94",
                base_current_a=80.0,
                spectrum_percent={5: 3.0, 7: 2.0, 11: 1.0},
            )
        ],
        parameters={
            "earthing": {
                "gpz_ref": REF_GPZ_SZYNA,
                "fault_current_ka": 8.0,
                "length_m": 60.0,
                "width_m": 40.0,
            },
            "insulation": [
                {
                    "location_bus_ref": REF_STACJA_SZYNA,
                    "u_m_kv": 17.5,
                    "network_neutral": "isolated",
                    "arrester_residual_10ka_kv": 70.0,
                }
            ],
            "motors": [
                {
                    "ref": "motor/5b0f7d1e",
                    "bus_ref": REF_STACJA_SZYNA,
                    "rated_kw": 630.0,
                    "rated_voltage_kv": 6.0,
                }
            ],
            "benchmark_references": [
                {
                    "network": "IEEE 14-bus",
                    "test": "rozpływ mocy — napięcie węzła 4",
                    "reference": 1.0186,
                    "calculated": 1.0184,
                    "tolerance_percent": 0.5,
                }
            ],
            "neutral_grounding": "petersen_tuned",
            "hosting_monte_carlo_n": 64,
        },
    )


def zbuduj_odpowiedzi() -> dict[str, Any]:
    """Uruchamia solver dla KAŻDEGO rodzaju kontraktu i zwraca ładunki wyników."""
    solver = V126AcademicSolver()
    model = model_wejsciowy()
    return {
        analysis_type.value: solver.run(analysis_type, model)["result"]
        for analysis_type in V126AnalysisType
    }


def main() -> None:
    odpowiedzi = zbuduj_odpowiedzi()
    SCIEZKA_FIXTURY.write_text(
        json.dumps(odpowiedzi, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"zapisano {len(odpowiedzi)} rodzajów → {SCIEZKA_FIXTURY}")


if __name__ == "__main__":
    main()
