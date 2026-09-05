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


# ---------------------------------------------------------------------------
# CV-4.2b: fabryka `UnitOfWork` wolajacego idzie do dyspozytora (warianty z para
# audytu 2 dziedziczona po biegu bazowym); zero wlasnego polaczenia z baza.
# ---------------------------------------------------------------------------


def _para_audit2() -> dict:
    from uuid import uuid4

    return {"audit2_project_id": str(uuid4()), "audit2_station_id": "stacja-x"}


@pytest.mark.parametrize("analysis_type", ["short_circuit_sn", "PF"])
def test_wariant_z_para_audit2_bez_fabryki_to_jawny_blad(analysis_type: str) -> None:
    """Para audytu 2 w opcjach + brak fabryki = jawny ValueError, nie cichy bieg bez korekt."""
    kotwica = _kotwica(_siec_promieniowa())
    opcje = {
        "fault_type": "3F",
        "c_factor": 0.95,
        "thermal_time_seconds": 1.0,
        **_para_audit2(),
    }
    wariant = _wariant(kotwica, analysis_type, opcje if analysis_type != "PF" else _para_audit2())

    with pytest.raises(ValueError, match="nie dostal fabryki UnitOfWork"):
        wykonaj_bieg_w_pamieci(wariant)
    assert wariant.raw_result is None, "bieg nie moze niesc wyniku po odmowie"


@pytest.mark.parametrize("analysis_type", ["short_circuit_sn", "PF"])
def test_wariant_z_para_audit2_i_fabryka_liczy_bez_zapisanej_konfiguracji(
    analysis_type: str, uow_factory
) -> None:
    """Fabryka wolajacego + stacja bez zapisanej konfiguracji = legalny bieg bez korekt."""
    kotwica = _kotwica(_siec_promieniowa())
    opcje = {
        "fault_type": "3F",
        "c_factor": 0.95,
        "thermal_time_seconds": 1.0,
        **_para_audit2(),
    }
    wariant = _wariant(kotwica, analysis_type, opcje if analysis_type != "PF" else _para_audit2())

    wykonaj_bieg_w_pamieci(wariant, uow_factory=uow_factory)

    assert wariant.raw_result, "wariant policzony ta sama fabryka, ktora widzi reszta zadania"


@pytest.mark.parametrize("analysis_type", ["short_circuit_sn", "PF"])
def test_fabryka_wolajacego_trafia_do_odczytu_rozszerzen(analysis_type: str, monkeypatch) -> None:
    """Dyspozytor przekazuje DOKLADNIE te fabryke, ktora dostal — dla PF i SC."""
    from enm import canonical_analysis

    fabryka = object()
    widziane: list = []

    def _odczyt(options, uow_factory):
        widziane.append(uow_factory)
        return None

    # Kotwica PRZED podmianą odczytu: jej własny bieg (`_kotwica` liczy zwarcie
    # kotwicy bez fabryki) nie może wejść do pomiaru wariantu.
    kotwica = _kotwica(_siec_promieniowa())
    monkeypatch.setattr(canonical_analysis, "rozszerzenia_audit2_dla_opcji", _odczyt)
    opcje = {"fault_type": "3F", "c_factor": 0.95, "thermal_time_seconds": 1.0}
    wariant = _wariant(kotwica, analysis_type, opcje if analysis_type != "PF" else {})

    wykonaj_bieg_w_pamieci(wariant, uow_factory=fabryka)

    assert widziane == [fabryka]
