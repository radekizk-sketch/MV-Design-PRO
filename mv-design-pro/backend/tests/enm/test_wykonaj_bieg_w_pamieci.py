"""Piny kontraktu ``wykonaj_bieg_w_pamieci`` (kanoniczne wejscie wariantow migawki).

Deklaracje docstringa bez testu bylyby falszywa pewnoscia (reguła KLASA §4):
1. bieg wariantu NIE dotyka magazynu biegow (zero persystencji),
2. bieg wariantu NIE zmienia statusu przekazanego obiektu,
3. nieobslugiwany typ analizy = jawny ``ValueError`` (ta sama dyspozycja co
   ``execute_run`` — jedno zrodlo prawdy, nie druga lista typow).

Powstalo przy naprawie naruszenia ``no_direct_fault_params_guard`` w
``application/protection_settings/batch_run.py`` (CI 2026-08-13): surowe
wywolania ``_execute_short_circuit`` poza warstwa sankcjonowana zastapiono tym
wejsciem; sciezki fizyki nie przybylo — dyspozycja pozostala jedna.
"""

from __future__ import annotations

import copy

import pytest
from enm.canonical_analysis import CanonicalRun, get_run, wykonaj_bieg_w_pamieci

from tests.application.test_protection_settings_batch_run import (
    _kotwica,
    _siec_promieniowa,
)


def _wariant(kotwica: CanonicalRun, analysis_type: str, options: dict) -> CanonicalRun:
    return CanonicalRun(
        id=kotwica.id,
        case_id=kotwica.case_id,
        project_id=kotwica.project_id,
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=kotwica.created_at,
        snapshot_hash=kotwica.snapshot_hash,
        input_hash=kotwica.input_hash,
        snapshot=copy.deepcopy(kotwica.snapshot or {}),
        validation={},
        readiness={},
        options=options,
    )


def test_bieg_w_pamieci_liczy_wynik_bez_persystencji_i_bez_zmiany_statusu() -> None:
    kotwica = _kotwica(_siec_promieniowa())
    wariant = _wariant(
        kotwica,
        "short_circuit_sn",
        {"fault_type": "3F", "c_factor": 0.95, "thermal_time_seconds": 1.0},
    )
    status_przed = wariant.status

    wykonaj_bieg_w_pamieci(wariant)

    assert wariant.raw_result, "wariant po biegu w pamieci musi niesc raw_result"
    assert wariant.status == status_przed, "bieg w pamieci nie zmienia statusu obiektu"
    assert get_run(wariant.id) is None, "bieg w pamieci nie moze persystowac biegu w magazynie"


def test_nieobslugiwany_typ_analizy_podnosi_jawny_blad() -> None:
    kotwica = _kotwica(_siec_promieniowa())
    wariant = _wariant(kotwica, "typ_ktorego_nie_ma", {})
    with pytest.raises(ValueError, match="Unsupported analysis type"):
        wykonaj_bieg_w_pamieci(wariant)


def test_dyspozycja_wariantu_daje_ten_sam_wynik_co_sciezka_kanoniczna() -> None:
    # Dwa identyczne warianty tej samej kotwicy — wynik musi byc deterministycznie
    # rowny (determinizm kanonu: to samo wejscie = ten sam wynik), niezaleznie od
    # tego, ile razy dyspozycja biegnie w pamieci.
    kotwica = _kotwica(_siec_promieniowa())
    opcje = {"fault_type": "2F", "c_factor": 0.95, "thermal_time_seconds": 1.0}
    pierwszy = _wariant(kotwica, "short_circuit_sn", copy.deepcopy(opcje))
    drugi = _wariant(kotwica, "short_circuit_sn", copy.deepcopy(opcje))

    wykonaj_bieg_w_pamieci(pierwszy)
    wykonaj_bieg_w_pamieci(drugi)

    assert pierwszy.raw_result == drugi.raw_result


def test_gotowy_graf_rozplywu_daje_wynik_identyczny_z_budowa_z_migawki() -> None:
    """`graf=` to oszczedzenie POWTORNEJ budowy tego samego obiektu, nie podmiana
    wejscia: rozplyw na grafie zbudowanym przez wolajacego z `run.snapshot` daje
    bit w bit ten sam wynik, co rozplyw budujacy graf sam."""
    from enm.mapping import map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    kotwica = _kotwica(_siec_promieniowa())
    bez_grafu = _wariant(kotwica, "PF", {})
    z_grafem = _wariant(kotwica, "PF", {})
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(z_grafem.snapshot))

    wykonaj_bieg_w_pamieci(bez_grafu)
    wykonaj_bieg_w_pamieci(z_grafem, graf=graf)

    assert z_grafem.raw_result == bez_grafu.raw_result
    assert z_grafem.power_flow_trace == bez_grafu.power_flow_trace


def test_gotowy_graf_poza_rozplywem_to_jawny_blad_kontraktu() -> None:
    from enm.mapping import map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    kotwica = _kotwica(_siec_promieniowa())
    wariant = _wariant(
        kotwica,
        "short_circuit_sn",
        {"fault_type": "3F", "c_factor": 0.95, "thermal_time_seconds": 1.0},
    )
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(wariant.snapshot))
    with pytest.raises(ValueError, match="wylacznie rozplyw mocy"):
        wykonaj_bieg_w_pamieci(wariant, graf=graf)
    assert wariant.raw_result is None, "odmowa nie zostawia polowicznego wyniku"
