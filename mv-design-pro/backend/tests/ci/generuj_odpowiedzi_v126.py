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
