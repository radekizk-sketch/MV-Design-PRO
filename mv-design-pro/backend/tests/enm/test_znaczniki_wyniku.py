"""Znaczniki stanu wiersza wyniku — jedna reguła dla każdej projekcji (karta GPZ-H5-APARATURA).

Defekt (meldunek koordynatora): sekcja SN po utracie L1 („bez napięcia”) miała znacznik
``BEZ_NAPIECIA`` tylko w wierszu ``/results/short-circuit``; ``element_results`` i nakładka
SLD (``overlay_payload``) go nie znały, a ograniczenie raportowe wiersza mówiło
o „wyniku niefizycznym” (zdanie o wartości nieskończonej albo κ spoza normy), choć solver
w ogóle nie liczył. Zwarcie 1F na szynie SN dawało ``ikss = None`` i ``flags == []`` —
przyczyna ``fault_node_without_zero_sequence_path`` nie była widoczna w wyniku.

Reguła po naprawie: przyczyna z topologii (``non_physical_reason``) → znacznik stanu
(``znaczniki_wiersza_zwarcia``) → ``flags`` + ``flags_pl`` (``znaczniki_wiersza``) w KAŻDEJ
projekcji, a ograniczenie raportowe wiersza i biegu to ta sama przyczyna.

Iloczyn cech: przyczyna ∈ {węzeł bez napięcia (SC-02, 3F), węzeł bez drogi składowej zerowej
(1F), wiersz liczony} × projekcja ∈ {wiersz zwarcia, ``element_results``, nakładka SLD,
prądy dowodowe SC3F, wiersz rozpływu} × poziom ∈ {wiersz, bieg}. Iniekcje (meldunek): brak
odznaki stanu w nakładce i powrót ``solver_result_non_physical`` dla węzła bez napięcia
czerwienią testy tego pliku.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from api.analysis_run_exports import _build_short_circuit_proof_currents
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from domain.result_builder_v1 import _odznaki_stanu_elementu
from domain.result_contract_v1 import (
    ZNACZNIK_BEZ_DROGI_ZEROWEJ,
    ZNACZNIK_PRZECIAZENIE,
    ZNACZNIK_SZYNY_BEZ_NAPIECIA,
    ZNACZNIK_WEZEL_BILANSUJACY,
    ZNACZNIKI_STANU_NAKLADKI,
    OverlaySeverity,
)
from enm.canonical_analysis import (
    _ZNACZNIK_POWODU_ZWARCIA,
    ETYKIETY_ZNACZNIKOW_WYNIKU_PL,
    OGRANICZENIE_WYNIK_NIEFIZYCZNY,
    OPISY_OGRANICZEN_RAPORTOWYCH_PL,
    POWOD_WEZEL_BEZ_DROGI_ZEROWEJ,
    POWOD_WEZEL_BEZ_ODNIESIENIA,
    CanonicalRun,
    build_bus_results,
    build_execution_result_set,
    build_short_circuit_results,
    create_run,
    execute_run,
    znaczniki_wiersza,
    znaczniki_wiersza_zwarcia,
)
from enm.models import EnergyNetworkModel
from enm.scenariusze import OperatingScenario, RodzajScenariusza
from enm.store import set_enm

from tests.reference_networks.gpz_h5 import RefyH5, refy, zbuduj_h5

OPCJE_3F = {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}
OPCJE_1F = {"fault_type": "1F", "scenario": "max", "thermal_time_seconds": 1.0}


@pytest.fixture(scope="module")
def h5() -> dict[str, Any]:
    return zbuduj_h5()


@pytest.fixture(scope="module")
def r(h5: dict[str, Any]) -> RefyH5:
    return refy(h5)


def _bieg(
    snapshot: dict[str, Any],
    analiza: str,
    opcje: dict[str, Any] | None,
    scenariusz: OperatingScenario | None = None,
) -> CanonicalRun:
    klucz = f"znaczniki:{uuid.uuid4().hex}"
    set_enm(klucz, EnergyNetworkModel.model_validate(snapshot))
    run = create_run(
        case_id=f"przypadek-{uuid.uuid4().hex[:8]}",
        klucz_twin=klucz,
        analysis_type=analiza,
        options=opcje,
        scenariusz=scenariusz,
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    return wynik


def _utrata_l1(r: RefyH5) -> OperatingScenario:
    return OperatingScenario(
        scenario_id="znaczniki-sc02",
        name="SC-02 utrata L1",
        kind=RodzajScenariusza.CUSTOM,
        switch_states={},
        out_of_service=(r.zrodlo_l1,),
    )


#: (nazwa przypadku, opcje, czy utrata L1, szyny ze stanem → (powód, znacznik), szyny liczone)
def _przypadki(
    r: RefyH5,
) -> dict[str, tuple[dict[str, Any], bool, dict[str, str], tuple[str, ...]]]:
    return {
        "sc02_3f_bez_napiecia": (
            OPCJE_3F,
            True,
            {r.szyna_sn_a: POWOD_WEZEL_BEZ_ODNIESIENIA, r.szyna_wn_1: POWOD_WEZEL_BEZ_ODNIESIENIA},
            (r.szyna_sn_b, r.szyna_wn_2),
        ),
        "normalny_1f_bez_drogi_zerowej": (
            OPCJE_1F,
            False,
            {
                r.szyna_sn_a: POWOD_WEZEL_BEZ_DROGI_ZEROWEJ,
                r.szyna_sn_b: POWOD_WEZEL_BEZ_DROGI_ZEROWEJ,
            },
            (r.szyna_wn_1, r.szyna_wn_2),
        ),
        "normalny_3f_liczony": (
            OPCJE_3F,
            False,
            {},
            (r.szyna_sn_a, r.szyna_sn_b, r.szyna_wn_1, r.szyna_wn_2),
        ),
    }


_NAZWY_PRZYPADKOW = ("sc02_3f_bez_napiecia", "normalny_1f_bez_drogi_zerowej", "normalny_3f_liczony")

_biegi: dict[str, CanonicalRun] = {}


def _bieg_przypadku(h5: dict[str, Any], r: RefyH5, nazwa: str) -> CanonicalRun:
    if nazwa not in _biegi:
        opcje, utrata, _stan, _liczone = _przypadki(r)[nazwa]
        _biegi[nazwa] = _bieg(h5, "short_circuit_sn", opcje, _utrata_l1(r) if utrata else None)
    return _biegi[nazwa]


# ---------------------------------------------------------------------------
# Mapa etykiet — kompletność (deklaracja „KeyError zamiast zgadywania” z testem)
# ---------------------------------------------------------------------------


def test_kazdy_znacznik_emitowany_ma_etykiete_pl() -> None:
    emitowane = {
        ZNACZNIK_WEZEL_BILANSUJACY,
        ZNACZNIK_PRZECIAZENIE,
        ZNACZNIK_SZYNY_BEZ_NAPIECIA,
        ZNACZNIK_BEZ_DROGI_ZEROWEJ,
    }
    assert set(ETYKIETY_ZNACZNIKOW_WYNIKU_PL) == emitowane
    assert set(_ZNACZNIK_POWODU_ZWARCIA.values()) <= emitowane
    assert set(ZNACZNIKI_STANU_NAKLADKI) <= set(ETYKIETY_ZNACZNIKOW_WYNIKU_PL)
    # Każda przyczyna z topologii ma zdanie ograniczenia raportowego (wiersz i bieg).
    assert set(_ZNACZNIK_POWODU_ZWARCIA) <= set(OPISY_OGRANICZEN_RAPORTOWYCH_PL)
    for etykieta in ETYKIETY_ZNACZNIKOW_WYNIKU_PL.values():
        assert etykieta and etykieta == etykieta.strip() and "_" not in etykieta


def test_znacznik_spoza_mapy_wybucha_zamiast_zgadywac_etykiete() -> None:
    with pytest.raises(KeyError):
        znaczniki_wiersza(["NOWY_ZNACZNIK"])
    assert znaczniki_wiersza([]) == {"flags": [], "flags_pl": []}


@pytest.mark.parametrize(
    ("powod", "oczekiwane"),
    [
        (POWOD_WEZEL_BEZ_ODNIESIENIA, [ZNACZNIK_SZYNY_BEZ_NAPIECIA]),
        (POWOD_WEZEL_BEZ_DROGI_ZEROWEJ, [ZNACZNIK_BEZ_DROGI_ZEROWEJ]),
        (None, []),
        ("inny_powod", []),
    ],
)
def test_znacznik_wiersza_zwarcia_z_przyczyny(powod: str | None, oczekiwane: list[str]) -> None:
    assert znaczniki_wiersza_zwarcia({"non_physical_reason": powod}) == oczekiwane


# ---------------------------------------------------------------------------
# Odznaka nakładki — ta sama reguła, brak własnego słownika
# ---------------------------------------------------------------------------


def test_odznaka_nakladki_tylko_dla_znacznikow_stanu() -> None:
    wartosci = znaczniki_wiersza([ZNACZNIK_WEZEL_BILANSUJACY, ZNACZNIK_SZYNY_BEZ_NAPIECIA])
    (odznaka,) = _odznaki_stanu_elementu(wartosci)
    assert odznaka.code == ZNACZNIK_SZYNY_BEZ_NAPIECIA
    assert odznaka.label == ETYKIETY_ZNACZNIKOW_WYNIKU_PL[ZNACZNIK_SZYNY_BEZ_NAPIECIA]
    assert odznaka.severity == OverlaySeverity.WARNING
    assert _odznaki_stanu_elementu(znaczniki_wiersza([ZNACZNIK_PRZECIAZENIE])) == []


def test_flagi_fazowe_slownik_nie_daja_odznaki() -> None:
    """Stan fazowy niesie pod ``flags`` słownik ``FlagsPhaseState`` (inny kontrakt)."""
    assert _odznaki_stanu_elementu({"flags": {"BEZ_NAPIECIA": True}}) == []


def test_rozjazd_list_znacznikow_i_etykiet_wybucha() -> None:
    with pytest.raises(ValueError):
        _odznaki_stanu_elementu({"flags": [ZNACZNIK_SZYNY_BEZ_NAPIECIA], "flags_pl": []})


# ---------------------------------------------------------------------------
# Iloczyn: przyczyna × projekcja (ścieżka biegu — create_run → execute_run)
# ---------------------------------------------------------------------------


def _oczekiwane_znaczniki(powod: str | None) -> dict[str, list[str]]:
    return znaczniki_wiersza([_ZNACZNIK_POWODU_ZWARCIA[powod]] if powod else [])


@pytest.mark.parametrize("nazwa", _NAZWY_PRZYPADKOW)
def test_wiersz_zwarcia_niesie_znacznik_przyczyne_i_uczciwe_ograniczenie(
    h5: dict[str, Any], r: RefyH5, nazwa: str
) -> None:
    run = _bieg_przypadku(h5, r, nazwa)
    _opcje, _utrata, stan, liczone = _przypadki(r)[nazwa]
    wiersze = {str(w["element_id"]): w for w in build_short_circuit_results(run)["rows"]}
    for szyna, powod in stan.items():
        wiersz = wiersze[szyna]
        assert wiersz["ikss_ka"] is None
        assert {k: wiersz[k] for k in ("flags", "flags_pl")} == _oczekiwane_znaczniki(powod)
        assert wiersz["non_physical_reason"] == powod
        assert wiersz["reporting_status"] == "not_reportable"
        assert wiersz["reporting_limitations"] == [powod]
        assert wiersz["reporting_limitations_pl"] == [OPISY_OGRANICZEN_RAPORTOWYCH_PL[powod]]
        assert OGRANICZENIE_WYNIK_NIEFIZYCZNY not in wiersz["reporting_limitations"]
        assert wiersz["non_physical_fields"]
    for szyna in liczone:
        wiersz = wiersze[szyna]
        assert isinstance(wiersz["ikss_ka"], float) and wiersz["ikss_ka"] > 0.0
        assert wiersz["flags"] == [] and wiersz["flags_pl"] == []
        assert wiersz["non_physical_reason"] is None
        assert wiersz["reporting_limitations"] == []


@pytest.mark.parametrize("nazwa", _NAZWY_PRZYPADKOW)
def test_ograniczenia_biegu_to_przyczyny_wierszy(h5: dict[str, Any], r: RefyH5, nazwa: str) -> None:
    run = _bieg_przypadku(h5, r, nazwa)
    _opcje, _utrata, stan, _liczone = _przypadki(r)[nazwa]
    assert run.raw_result is not None
    ograniczenia = run.raw_result["reporting_limitations"]
    assert OGRANICZENIE_WYNIK_NIEFIZYCZNY not in ograniczenia
    for powod in set(stan.values()):
        assert powod in ograniczenia
    # Bieg pozostaje raportowalny; nieraportowalne są WĘZŁY z wykazu (wiersz jest bramką).
    wezly = {
        str(w["target_id"]): str(w["element_id"]) for w in build_short_circuit_results(run)["rows"]
    }
    wykaz = run.raw_result.get("non_reportable_fault_node_ids", [])
    assert sorted(wezly[w] for w in wykaz) == sorted(stan)


@pytest.mark.parametrize("nazwa", _NAZWY_PRZYPADKOW)
def test_element_results_ta_sama_regula_co_wiersz(
    h5: dict[str, Any], r: RefyH5, nazwa: str
) -> None:
    run = _bieg_przypadku(h5, r, nazwa)
    _opcje, _utrata, stan, liczone = _przypadki(r)[nazwa]
    wartosci = {
        str(e["element_ref"]): e["values"]
        for e in build_execution_result_set(run)["element_results"]
    }
    for szyna in (*stan, *liczone):
        powod = stan.get(szyna)
        v = wartosci[szyna]
        assert {k: v[k] for k in ("flags", "flags_pl")} == _oczekiwane_znaczniki(powod)
        assert v["non_physical_reason"] == powod
        assert v["reporting_limitations"] == ([powod] if powod else [])
        assert v["reporting_limitations_pl"] == (
            [OPISY_OGRANICZEN_RAPORTOWYCH_PL[powod]] if powod else []
        )


@pytest.mark.parametrize("nazwa", _NAZWY_PRZYPADKOW)
def test_nakladka_sld_ma_odznake_stanu(h5: dict[str, Any], r: RefyH5, nazwa: str) -> None:
    run = _bieg_przypadku(h5, r, nazwa)
    _opcje, _utrata, stan, liczone = _przypadki(r)[nazwa]
    elementy = build_resultset_v1_from_canonical_run(run).overlay_payload.elements
    for szyna in (*stan, *liczone):
        odznaki_stanu = [b for b in elementy[szyna].badges if b.code in ZNACZNIKI_STANU_NAKLADKI]
        powod = stan.get(szyna)
        if powod is None:
            assert odznaki_stanu == []
            continue
        znacznik = _ZNACZNIK_POWODU_ZWARCIA[powod]
        assert [(b.code, b.label) for b in odznaki_stanu] == [
            (znacznik, ETYKIETY_ZNACZNIKOW_WYNIKU_PL[znacznik])
        ]
        assert elementy[szyna].severity in (
            OverlaySeverity.WARNING,
            OverlaySeverity.IMPORTANT,
            OverlaySeverity.BLOCKER,
        )


@pytest.mark.parametrize("nazwa", ("sc02_3f_bez_napiecia", "normalny_3f_liczony"))
def test_prady_dowodowe_sc3f_niosa_stan_wiersza(h5: dict[str, Any], r: RefyH5, nazwa: str) -> None:
    run = _bieg_przypadku(h5, r, nazwa)
    _opcje, _utrata, stan, liczone = _przypadki(r)[nazwa]
    prady = _build_short_circuit_proof_currents(run)
    assert prady is not None
    wiersze = {str(w["element_id"]): w for w in prady["rows"]}
    for szyna in (*stan, *liczone):
        powod = stan.get(szyna)
        w = wiersze[szyna]
        assert {k: w[k] for k in ("flags", "flags_pl")} == _oczekiwane_znaczniki(powod)
        assert w["non_physical_reason"] == powod
        assert (w["I_dyn"]["value_ka"] is None) == (powod is not None)


def test_rozplyw_sc02_szyna_bez_napiecia_w_wierszu_element_results_i_nakladce(
    h5: dict[str, Any], r: RefyH5
) -> None:
    run = _bieg(h5, "PF", None, _utrata_l1(r))
    szyny = {str(w["element_id"]): w for w in build_bus_results(run)["rows"]}
    elementy = build_resultset_v1_from_canonical_run(run).overlay_payload.elements
    for szyna in (r.szyna_sn_a, r.szyna_wn_1):
        assert szyny[szyna]["u_pu"] is None
        assert szyny[szyna]["flags"] == [ZNACZNIK_SZYNY_BEZ_NAPIECIA]
        assert szyny[szyna]["flags_pl"] == ["bez napięcia"]
        assert [b.code for b in elementy[szyna].badges if b.code in ZNACZNIKI_STANU_NAKLADKI] == [
            ZNACZNIK_SZYNY_BEZ_NAPIECIA
        ]
    for szyna in (r.szyna_sn_b, r.szyna_wn_2):
        assert ZNACZNIK_SZYNY_BEZ_NAPIECIA not in szyny[szyna]["flags"]
        assert len(szyny[szyna]["flags"]) == len(szyny[szyna]["flags_pl"])
        assert not [b for b in elementy[szyna].badges if b.code in ZNACZNIKI_STANU_NAKLADKI]
