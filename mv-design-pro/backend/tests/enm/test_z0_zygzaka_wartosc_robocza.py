"""Impedancja zerowa uzwojenia zygzakowego transformatora uziemiającego ZNyn11 ścieżką użytkownika
(karta POLA-GPZ-SZABLONY, decyzja architekta; karta ZU-JEDEN-NOSNIK): pole zespołu uziemiającego
z kreatora (``add_sn_bay`` rola ZU) bierze R0/X0 na fazę z pozycji katalogu (wartość robocza
``wartosci_robocze``, zasada nr 4), bieg zwarcia doziemnego liczy z nich drogę zerową (nie z u_k)
i niesie daną przyjętą ``ESTIMATED`` bocznika zespołu; wartość projektanta
(``update_element_parameters``) zastępuje wartość roboczą tego parametru i zdejmuje jego daną
przyjętą (drugi parametr zostaje roboczy).

Iloczyn cech: wartości {katalog, R0 projektanta, R0 i X0 projektanta} × rodzaj zwarcia {1F, 3F}
× wariant zespołu {Z13 dławik, Z15 rezystor}. Wyrocznia liczbowa: I″k1 = √3·c·U_n/|2·Z_1 + Z_0|
z Z_0 = Z_0,zyg + 3·R_N (R_N z pozycji katalogu rezystora transformatora) przeliczonym w teście
jawnie; Z.13 (sieć skompensowana) — bez wyniku IEC 60909 i bez danych przyjętych wiersza.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.dane_przyjete_galezi import dane_przyjete_galezi_wiersza
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, Transformer
from enm.punkt_neutralny_zespolu import parametry_z0_zygzaka
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from network_model.catalog.mv_transformer_catalog import TRANSFORMATORY_UZIEMIAJACE_ZNYN11
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_neutral_earthing_resistor_records,
)

from tests.enm.test_pole_zespolu_uziemiajacego import _dodaj, _gpz
from tests.reference_networks.sceny_zajetosci_pol import ok, op

WARTOSCI = {
    "katalog": {},
    "r0_projektanta": {"r0_ohm": 2.0},
    "projektant": {"r0_ohm": 2.0, "x0_ohm": 8.0},
}
WARIANTY = {"Z13": "dlawik", "Z15": "rezystor"}
NAZWY = {
    "r0_ohm": "Rezystancja zerowa transformatora uziemiającego",
    "x0_ohm": "Reaktancja zerowa transformatora uziemiającego",
}
_POZYCJA_TU = next(
    r["params"]
    for r in TRANSFORMATORY_UZIEMIAJACE_ZNYN11
    if r["id"] == "tu-sn-nn-15-04-100kva-znyn11"
)


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
    # Pozycja katalogu 15/0,4 kV 100 kVA: R0/X0 = wartość robocza IEC 60076-6 (0,637 + j3,185 Ω).
    oczekiwane_r0 = WARTOSCI[wartosci].get("r0_ohm", _POZYCJA_TU["r0_ohm"])
    oczekiwane_x0 = WARTOSCI[wartosci].get("x0_ohm", _POZYCJA_TU["x0_ohm"])
    r0, x0 = parametry_z0_zygzaka(Transformer.model_validate(tr), 15.0)
    assert (r0.wartosc, x0.wartosc) == pytest.approx((oczekiwane_r0, oczekiwane_x0))
    robocze_pola = [p for p in ("r0_ohm", "x0_ohm") if p not in WARTOSCI[wartosci]]
    assert [p.nazwa for p in (r0, x0) if p.roboczy] == robocze_pola

    bieg = _bieg(enm, szyna, rodzaj)
    [wiersz] = (bieg.raw_result or {})["results"]
    nazwy = {d.nazwa_pl.split(" (")[0] for d in dane_przyjete_galezi_wiersza(wiersz)}
    nazwy_tu = nazwy & set(NAZWY.values())
    liczony_1f = rodzaj is FaultType.SC_1F and wariant == "Z15"
    if liczony_1f:
        assert nazwy_tu == {NAZWY[p] for p in robocze_pola}
        # Wyrocznia: Z_0 = Z_0,zyg + 3·R_N; Z_1 źródła z S″k = 250 MVA (c = 1,1, X/R źródła
        # pomijalne w porównaniu z Z_0 — tolerancja 1 %).
        rezystor = tr["hv_neutral"]["rezystor"]["catalog_ref"]
        r_n = float(
            next(r for r in get_all_neutral_earthing_resistor_records() if r["id"] == rezystor)[
                "params"
            ]["r_ohm"]
        )
        z_0 = complex(oczekiwane_r0, oczekiwane_x0) + 3.0 * r_n
        z_1 = complex(0.0, 1.1 * 15.0**2 / 250.0)
        ik1 = math.sqrt(3.0) * 1.1 * 15_000.0 / abs(2.0 * z_1 + z_0)
        assert wiersz["ikss_a"] == pytest.approx(ik1, rel=1e-2)
    else:
        # Zwarcie trójfazowe nie czyta drogi zerowej; sieć skompensowana (Z.13) — bez wyniku
        # IEC 60909, więc bez danych przyjętych bocznika w wierszu.
        assert nazwy_tu == set()
        if rodzaj is FaultType.SC_1F:
            assert wiersz["ikss_a"] is None


@pytest.mark.parametrize("wariant", sorted(WARIANTY))
@pytest.mark.parametrize("zero_zrodla", ["bez_z0", "r0_x0", "z0_z1"])
def test_dane_zerowe_zrodla_schodza_z_dawcy_i_wracaja_przy_usunieciu(
    wariant: str, zero_zrodla: str
):
    """Para przeniesienia (predykaty parami, jeden zapis ``hv_neutral.dawca``): Z0 równoważnika
    schodzi ze źródła razem z opisem punktu neutralnego — inaczej źródło niosłoby dane, które
    fizyka pomija (W-W5-02) — i wraca przy usunięciu transformatora bit w bit. Dawca nie dostaje
    W002, więc zwarcie doziemne jest dostępne."""
    from enm.validator import ENMValidator

    enm, szyna, stacja = _gpz(WARIANTY[wariant], "1")
    zero = {"bez_z0": {}, "r0_x0": {"r0_ohm": 3.0, "x0_ohm": 9.0}, "z0_z1": {"z0_z1_ratio": 3.0}}
    enm["sources"][0].update(zero[zero_zrodla])
    przed = {
        k: enm["sources"][0].get(k)
        for k in ("r0_ohm", "x0_ohm", "z0_z1_ratio", "neutral_grounding")
    }
    po = ok(_dodaj(enm, szyna, stacja, wariant))
    zrodlo = po["sources"][0]
    assert all(zrodlo.get(k) is None for k in przed)
    tr = next(t for t in po["transformers"] if t.get("vector_group") == "ZNyn11")
    dawca = tr["hv_neutral"]["dawca"]
    assert dawca["zrodlo_ref"] == zrodlo["ref_id"]
    for klucz, wartosc in przed.items():
        assert dawca.get(klucz) == wartosc
    walidacja = ENMValidator().validate(EnergyNetworkModel.model_validate(po))
    kody = {i.code for i in walidacja.issues}
    assert "W002" not in kody and "W-W5-02" not in kody
    assert walidacja.analysis_available.short_circuit_1f
    oddane = ok(op(po, "delete_element", {"element_ref": tr["ref_id"]}))
    assert {k: oddane["sources"][0].get(k) for k in przed} == przed
