"""Impedancja zerowa uzwojenia zygzakowego transformatora uziemiającego ZNyn11 ścieżką użytkownika
(karta POLA-GPZ-SZABLONY, decyzja architekta): pole zespołu uziemiającego z kreatora (`add_sn_bay`
rola ZU) bierze R0/X0 na fazę z pozycji katalogu (wartość robocza ``wartosci_robocze``, zasada
nr 4), bieg zwarcia doziemnego liczy z nich drogę zerową (nie z u_k) i niesie daną przyjętą
``ESTIMATED`` transformatora; wartość projektanta (``update_element_parameters``) zastępuje
wartość roboczą i zdejmuje daną przyjętą.

Iloczyn cech: wartości {katalog, R0 projektanta, R0 i X0 projektanta} × rodzaj zwarcia {1F, 3F}
× wariant zespołu {Z13 dławik, Z15 rezystor}. Wyrocznia liczbowa: I″k1 = √3·c·U_n/|2·Z_1 + Z_0|
z Z_0 = Z_0,zyg + 3·Z_N przeliczonym w teście jawnie.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.dane_przyjete_galezi import KLUCZ_WIERSZA_DANE_GALEZI, KOD_Z0_ROBOCZE
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from network_model.pochodne import impedancja_zerowa_zygzaka_robocza_ohm

from tests.enm.test_pole_zespolu_uziemiajacego import UZIEMIENIA, _dodaj, _gpz
from tests.reference_networks.sceny_zajetosci_pol import ok, op

WARTOSCI = {
    "katalog": {},
    "r0_projektanta": {"r0_ohm": 2.0},
    "projektant": {"r0_ohm": 2.0, "x0_ohm": 8.0},
}
WARIANTY = {"Z13": "dlawik", "Z15": "rezystor"}


@pytest.fixture(autouse=True)
def _czysty_magazyn():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _siec(wariant: str, wartosci: str) -> tuple[dict[str, Any], str, dict[str, Any]]:
    enm, szyna, stacja = _gpz(WARIANTY[wariant], "1")
    enm = ok(_dodaj(enm, szyna, stacja, wariant))
    tr = next(t for t in enm["transformers"] if t.get("vector_group") == "ZNyn11")
    if WARTOSCI[wartosci]:
        wynik = execute_domain_operation(
            enm,
            "update_element_parameters",
            {"element_ref": tr["ref_id"], "parameters": dict(WARTOSCI[wartosci])},
        )
        assert wynik.get("error") is None, wynik.get("error")
        enm = wynik["snapshot"]
        tr = next(t for t in enm["transformers"] if t["ref_id"] == tr["ref_id"])
    return enm, szyna, tr


def _bieg(enm: dict[str, Any], szyna: str, rodzaj: FaultType) -> Any:
    set_enm("zyg", EnergyNetworkModel.model_validate(enm))
    spec = new_fault_scenario(
        study_case_id="zyg",
        name="Zwarcie",
        fault_type=rodzaj,
        location=FaultLocation(element_ref=szyna, location_type="BUS"),
        config=ShortCircuitConfig.from_dict({"scenariusz": "MAX", "thermal_time_seconds": 0.5}),
    )
    opcje = opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id=f"scn-{rodzaj.value}",
            name="t",
            kind=RodzajScenariusza.FAULT_STUDY,
            fault_spec=spec,
        )
    )
    run = create_run(
        case_id="zyg", klucz_twin="zyg", analysis_type="short_circuit_sn", options=opcje
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    return wynik


@pytest.mark.parametrize("wariant", sorted(WARIANTY))
@pytest.mark.parametrize("rodzaj", [FaultType.SC_1F, FaultType.SC_3F], ids=["1F", "3F"])
@pytest.mark.parametrize("wartosci", sorted(WARTOSCI))
def test_z0_zygzaka_z_parametru_i_dana_przyjeta(wartosci: str, rodzaj: FaultType, wariant: str):
    enm, szyna, tr = _siec(wariant, wartosci)
    robocza = impedancja_zerowa_zygzaka_robocza_ohm(15.0)
    oczekiwane_r0 = WARTOSCI[wartosci].get("r0_ohm", robocza.real)
    oczekiwane_x0 = WARTOSCI[wartosci].get("x0_ohm", robocza.imag)
    assert (tr["r0_ohm"], tr["x0_ohm"]) == pytest.approx((oczekiwane_r0, oczekiwane_x0))
    bieg = _bieg(enm, szyna, rodzaj)
    robocze_pola = [p for p in ("r0_ohm", "x0_ohm") if p not in WARTOSCI[wartosci]]
    doziemne = rodzaj is FaultType.SC_1F
    zalozenia = [
        z for z in (bieg.raw_result or {}).get("zalozenia") or [] if z.get("code") == KOD_Z0_ROBOCZE
    ]
    assert [z["element_ref"] for z in zalozenia] == (
        [tr["ref_id"]] if doziemne and robocze_pola else []
    )
    [wiersz] = (bieg.raw_result or {})["results"]
    dane = list(wiersz.get(KLUCZ_WIERSZA_DANE_GALEZI) or [])
    if doziemne and robocze_pola:
        assert [d["nazwa_pl"].split()[0] for d in dane] == [
            {"r0_ohm": "R0", "x0_ohm": "X0"}[p] for p in robocze_pola
        ]
        assert {d["jakosc"] for d in dane} == {"ESTIMATED"}
        assert {d["wartosc"]["jednostka"] for d in dane} == {"Ω"}
        assert all("parametrach transformatora" in d["powod_pl"] for d in dane)
    else:
        assert KLUCZ_WIERSZA_DANE_GALEZI not in wiersz
    if doziemne:
        # Wyrocznia: Z_0 = Z_0,zyg + 3·Z_N (punkt neutralny przeniesiony na ZNyn11), Z_1 źródła
        # z S″k = 250 MVA (c = 1,1, X/R źródła pomijalne w porównaniu z Z_0 — tolerancja 1 %).
        uz = UZIEMIENIA[WARIANTY[wariant]]
        z_n = complex(uz.get("r_ohm") or 0.0, uz.get("x_ohm") or 0.0)
        z_0 = complex(oczekiwane_r0, oczekiwane_x0) + 3.0 * z_n
        z_1 = complex(0.0, 1.1 * 15.0**2 / 250.0)
        ik1 = math.sqrt(3.0) * 1.1 * 15_000.0 / abs(2.0 * z_1 + z_0)
        assert wiersz["ikss_a"] == pytest.approx(ik1, rel=1e-2)


@pytest.mark.parametrize("wariant", sorted(WARIANTY))
@pytest.mark.parametrize("zero_zrodla", ["bez_z0", "r0_x0", "z0_z1"])
def test_dane_zerowe_zrodla_schodza_z_dawcy_i_wracaja_przy_usunieciu(
    wariant: str, zero_zrodla: str
):
    """Para przeniesienia (predykaty parami): Z0 równoważnika (z uziemieniem, które przeszło na
    zespół) schodzi ze źródła razem z opisem punktu neutralnego — inaczej sieć miałaby drugą
    drogę zerową obok zygzaka — i wraca przy usunięciu transformatora. Dawca nie dostaje W002,
    więc zwarcie doziemne jest dostępne; po oddaniu stan sprzed pola wraca bit w bit."""
    from enm.validator import ENMValidator

    enm, szyna, stacja = _gpz(WARIANTY[wariant], "1")
    zero = {"bez_z0": {}, "r0_x0": {"r0_ohm": 3.0, "x0_ohm": 9.0}, "z0_z1": {"z0_z1_ratio": 3.0}}
    enm["sources"][0].update(zero[zero_zrodla])
    przed = {k: enm["sources"][0].get(k) for k in ("r0_ohm", "x0_ohm", "z0_z1_ratio")}
    po = ok(_dodaj(enm, szyna, stacja, wariant))
    zrodlo = po["sources"][0]
    assert all(zrodlo.get(k) is None for k in ("r0_ohm", "x0_ohm", "z0_z1_ratio"))
    walidacja = ENMValidator().validate(EnergyNetworkModel.model_validate(po))
    assert "W002" not in {i.code for i in walidacja.issues}
    assert walidacja.analysis_available.short_circuit_1f
    tr = next(t for t in po["transformers"] if t.get("vector_group") == "ZNyn11")
    oddane = ok(op(po, "delete_element", {"element_ref": tr["ref_id"]}))
    assert {k: oddane["sources"][0].get(k) for k in przed} == przed
