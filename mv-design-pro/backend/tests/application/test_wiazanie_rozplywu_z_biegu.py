"""Wiązanie rozpływu: ZAPIS BIEGU → zamrożony wynik (karta PACK-ROZPLYW).

Ten plik pilnuje deklaracji z docstringu ``application/solvers/power_flow_binding``:
„Każde pole ma pochodzić z zapisu biegu albo NIE POWSTAĆ WCALE… w całym module nie
ma ani jednej wartości domyślnej, ani jednego zapasu". Deklaracja bez strażnika
jest groźniejsza niż sam defekt, bo wyłącza czujność — więc KAŻDA klasa odmowy ma
tu własny pin, a osobny pin sprawdza, że odmowy pokrywają WSZYSTKIE pola wyniku
(iloczyn „pole × brak" zamiast jednego przykładu z karty).

Testy przeciw jednostce (nie przez HTTP) celowo: chodzi o dane BRZEGOWE zapisu
biegu, których zdrowy tor wykonawczy nigdy nie wyprodukuje — realną ścieżkę
end-to-end pokrywa ``tests/api/test_pakiet_dowodowy_biegu.py``.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from application.solvers.power_flow_binding import (
    BrakDanychRozplywuError,
    rozplyw_z_biegu,
)


def _wynik_v1() -> dict[str, Any]:
    return {
        "result_version": "1.0.0",
        "converged": True,
        "iterations_count": 3,
        "tolerance_used": 1e-8,
        "base_mva": 100.0,
        "slack_bus_id": "bus-slack",
        "bus_results": [
            {
                "bus_id": "bus-slack",
                "v_pu": 1.0,
                "angle_deg": 0.0,
                "p_injected_mw": 2.5,
                "q_injected_mvar": 0.8,
                "status": "solved",
            },
            {
                "bus_id": "bus-odbior",
                "v_pu": 0.98,
                "angle_deg": -0.4,
                "p_injected_mw": -2.0,
                "q_injected_mvar": -0.6,
                "status": "solved",
            },
        ],
        "branch_results": [
            {
                "branch_id": "br-1",
                "p_from_mw": 2.5,
                "q_from_mvar": 0.8,
                "p_to_mw": -2.0,
                "q_to_mvar": -0.6,
                "losses_p_mw": 0.5,
                "losses_q_mvar": 0.2,
            }
        ],
        "summary": {
            "total_losses_p_mw": 0.5,
            "total_losses_q_mvar": 0.2,
            "min_v_pu": 0.98,
            "max_v_pu": 1.0,
            "slack_p_mw": 2.5,
            "slack_q_mvar": 0.8,
        },
        "unsolved_node_ids": [],
    }


def _artefakt() -> dict[str, Any]:
    return {
        "analysis_type": "load_flow",
        "solver_version": "load-flow-newton-raphson-v1",
        "result_v1": _wynik_v1(),
    }


def _slad(max_mismatch_pu: float = 4.2e-11) -> list[dict[str, Any]]:
    return [
        {"step": 1, "title": "Stan poczatkowy", "phase": "init", "result": {}},
        {
            "step": 2,
            "title": "Wynik koncowy",
            "phase": "final",
            "result": {
                "converged": {"value": True},
                "iterations": {"value": 3},
                "max_mismatch_pu": {"value": max_mismatch_pu, "unit": "pu"},
            },
        },
    ]


def test_odtwarza_zamrozony_wynik_pole_w_pole() -> None:
    """Odtworzenie jest ODWROTNOŚCIĄ ``to_dict`` — nic nie ginie i nic nie dochodzi."""
    rozplyw = rozplyw_z_biegu(raw_result=_artefakt(), white_box_trace=_slad())

    assert rozplyw.wynik.to_dict() == _wynik_v1()
    assert rozplyw.solver_version == "load-flow-newton-raphson-v1"
    assert rozplyw.max_mismatch_pu == pytest.approx(4.2e-11)


def test_niedopasowanie_pochodzi_z_kroku_koncowego_a_nie_z_iteracji() -> None:
    """Ślad bez iteracji nadal daje dowód — krok końcowy niesie tę liczbę zawsze.

    Gdyby wielkość brać z „ostatniej iteracji", bieg zbieżny od stanu początkowego
    (pusta lista iteracji) wymuszałby podstawienie zera, czyli zmyślenie.
    """
    slad = [
        {
            "step": 1,
            "title": "Wynik koncowy",
            "phase": "final",
            "result": {"max_mismatch_pu": {"value": 0.0, "unit": "pu"}},
        }
    ]

    rozplyw = rozplyw_z_biegu(raw_result=_artefakt(), white_box_trace=slad)

    assert rozplyw.max_mismatch_pu == 0.0


def test_slad_bez_kroku_koncowego_to_odmowa_a_nie_zero() -> None:
    slad = [{"step": 1, "title": "Stan poczatkowy", "phase": "init", "result": {}}]

    with pytest.raises(BrakDanychRozplywuError) as blad:
        rozplyw_z_biegu(raw_result=_artefakt(), white_box_trace=slad)

    assert "niedopasowania" in str(blad.value)


@pytest.mark.parametrize("slad", [None, []])
def test_brak_sladu_to_odmowa(slad: list[dict[str, Any]] | None) -> None:
    with pytest.raises(BrakDanychRozplywuError):
        rozplyw_z_biegu(raw_result=_artefakt(), white_box_trace=slad)


def test_niedopasowanie_nieskonczone_to_odmowa() -> None:
    """Rozbieżność numeryczna nie zamienia się w liczbę „na oko" w dowodzie."""
    with pytest.raises(BrakDanychRozplywuError) as blad:
        rozplyw_z_biegu(
            raw_result=_artefakt(),
            white_box_trace=_slad(max_mismatch_pu=float("inf")),
        )

    assert "skończoną" in str(blad.value)


@pytest.mark.parametrize("rodzaj", [None, "short_circuit_3f", "phase_state_sn"])
def test_bieg_innego_rodzaju_to_odmowa(rodzaj: str | None) -> None:
    artefakt = _artefakt()
    if rodzaj is None:
        artefakt.pop("analysis_type")
    else:
        artefakt["analysis_type"] = rodzaj

    with pytest.raises(BrakDanychRozplywuError) as blad:
        rozplyw_z_biegu(raw_result=artefakt, white_box_trace=_slad())

    assert "rozpływem mocy" in str(blad.value)


@pytest.mark.parametrize("raw_result", [None, {}, {"analysis_type": "load_flow"}])
def test_bieg_bez_artefaktu_wyniku_to_odmowa(raw_result: dict[str, Any] | None) -> None:
    with pytest.raises(BrakDanychRozplywuError):
        rozplyw_z_biegu(raw_result=raw_result, white_box_trace=_slad())


#: ILOCZYN CECH „pole × brak": każde pole zamrożonego wyniku, którego usunięcie
#: musi skończyć się odmową. Lista wyprowadzona z ``PowerFlowResultV1.to_dict()``
#: — pole dopisane do wyniku bez wpisu tutaj zostawi dziurę, którą łapie
#: `test_lista_pol_pokrywa_caly_zamrozony_wynik`.
_POLA_WYNIKU = [
    "result_version",
    "converged",
    "iterations_count",
    "tolerance_used",
    "base_mva",
    "slack_bus_id",
    "bus_results",
    "branch_results",
    "summary",
    "unsolved_node_ids",
]


@pytest.mark.parametrize("pole", _POLA_WYNIKU)
def test_brak_dowolnego_pola_wyniku_to_odmowa(pole: str) -> None:
    artefakt = _artefakt()
    artefakt["result_v1"].pop(pole)

    with pytest.raises(BrakDanychRozplywuError):
        rozplyw_z_biegu(raw_result=artefakt, white_box_trace=_slad())


def test_lista_pol_pokrywa_caly_zamrozony_wynik() -> None:
    """Strażnik listy powyżej: nowe pole wyniku nie może cicho ominąć kontroli."""
    assert set(_POLA_WYNIKU) == set(_wynik_v1().keys())


@pytest.mark.parametrize(
    "pole",
    ["v_pu", "angle_deg", "p_injected_mw", "q_injected_mvar"],
)
def test_szyna_z_wartoscia_pusta_to_odmowa(pole: str) -> None:
    """``null`` w wierszu szyny to nie zero — to wielkość, której solver nie policzył.

    Serializacja zamienia NaN na ``null`` (``_nan_to_none``), więc podstawienie
    zera zamieniłoby brak obliczenia w „wynik" bez śladu w dowodzie.
    """
    artefakt = _artefakt()
    artefakt["result_v1"]["bus_results"][1][pole] = None

    with pytest.raises(BrakDanychRozplywuError):
        rozplyw_z_biegu(raw_result=artefakt, white_box_trace=_slad())


def test_szyna_nierozwiazana_to_odmowa_z_powodem_po_polsku() -> None:
    """Bilans mocy z szyn nierozwiązanych podawałby moc ŻĄDANĄ jako wstrzykniętą."""
    artefakt = _artefakt()
    artefakt["result_v1"]["bus_results"][1]["status"] = "not_solved"

    with pytest.raises(BrakDanychRozplywuError) as blad:
        rozplyw_z_biegu(raw_result=artefakt, white_box_trace=_slad())

    assert "nie została policzona" in str(blad.value)


def test_wykaz_szyn_nierozwiazanych_to_odmowa() -> None:
    """Drugi koniec tej samej cechy: wykaz wprost z zamrożonego wyniku."""
    artefakt = _artefakt()
    artefakt["result_v1"]["unsolved_node_ids"] = ["bus-wyspa"]

    with pytest.raises(BrakDanychRozplywuError) as blad:
        rozplyw_z_biegu(raw_result=artefakt, white_box_trace=_slad())

    assert "nie objął wszystkich szyn" in str(blad.value)


@pytest.mark.parametrize("wersja", [None, "", "   ", 7])
def test_brak_wersji_solvera_to_odmowa(wersja: Any) -> None:
    artefakt = _artefakt()
    if wersja is None:
        artefakt.pop("solver_version")
    else:
        artefakt["solver_version"] = wersja

    with pytest.raises(BrakDanychRozplywuError) as blad:
        rozplyw_z_biegu(raw_result=artefakt, white_box_trace=_slad())

    assert "wersji solvera" in str(blad.value)


def test_odtworzenie_nie_rusza_zapisu_biegu() -> None:
    """Wiązanie jest READ-ONLY — czyta zapis biegu, nigdy go nie modyfikuje."""
    artefakt = _artefakt()
    slad = _slad()
    kopia_artefaktu = copy.deepcopy(artefakt)
    kopia_sladu = copy.deepcopy(slad)

    rozplyw_z_biegu(raw_result=artefakt, white_box_trace=slad)

    assert artefakt == kopia_artefaktu
    assert slad == kopia_sladu
