"""Towarzysze werdyktu dostawcow ekranu „Jakosc wynikow" (karta AB-1a-bis).

Iloczyn cech: dostawca (warunki przylaczenia, wytrzymalosc cieplna przewodow) x
stan (PASS / FAIL / brak podstawy) x poziom (pozycja, kryterium czastkowe,
werdykt zbiorczy) x towarzysz. Sciezka produkcyjna: te same funkcje, ktore
wolaja trasy `/api/quality/connection-conditions` i
`/api/quality/conductor-thermal-withstand`.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.analyses.warunki_przylaczenia import (
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    ocen_warunki_przylaczenia,
)
from application.analyses.wytrzymalosc_cieplna_przewodow import (
    PODSTAWA_KRYTERIUM_CIEPLNEGO,
    build_conductor_thermal_withstand_view,
)
from network_model.solvers.short_circuit_contributions import ShortCircuitBranchContribution
from solver_input.provenance import StatusZrodla

from tests.application.analyses.test_wytrzymalosc_cieplna_przewodow import (
    _catalog_with_cable_type,
    _graph_with_two_cables,
    _sc_result,
)

GRUPY = ("wartosc", "odniesienie", "margines", "podstawa", "dowod")


def _wynik_pf(p_mw: float, q_mvar: float) -> dict[str, Any]:
    return {
        "converged": True,
        "slack_bus_id": "PWP",
        "bus_results": [{"bus_id": "PWP", "p_injected_mw": p_mw, "q_injected_mvar": q_mvar}],
    }


@pytest.mark.parametrize(
    ("p_mw", "q_mvar", "stan_mocy", "stan_cos"),
    [
        (-4.0, 0.5, STATUS_PASS, STATUS_PASS),
        (-6.2, 1.0, STATUS_FAIL, STATUS_PASS),
        (3.0, 3.0, STATUS_PASS, STATUS_FAIL),
    ],
)
def test_warunki_przylaczenia_stan_x_towarzysze(
    p_mw: float, q_mvar: float, stan_mocy: str, stan_cos: str
) -> None:
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0, "wymagany_cos_phi": 0.9},
        result_v1=_wynik_pf(p_mw, q_mvar),
        run_id="bieg-pf",
    ).to_dict()
    for grupa in GRUPY:
        assert grupa in ocena
    moc, cos_phi = ocena["pozycje"]
    assert (moc["status"], cos_phi["status"]) == (stan_mocy, stan_cos)
    for pozycja in (moc, cos_phi):
        for grupa in GRUPY:
            assert grupa in pozycja
        assert pozycja["odniesienie"] == pozycja["wymagana"]
        # Predykat parami: FAIL <=> zapas ujemny (kierunek z tej samej mapy).
        assert (pozycja["margines"] < 0) == (pozycja["status"] == STATUS_FAIL)
        assert pozycja["podstawa"]["zrodlo_status"] == StatusZrodla.UNVERIFIED_SOURCE
        assert pozycja["dowod"] == {"run_id": "bieg-pf", "element_id": "PWP", "trace_ref": None}
    assert ocena["odniesienie"] == 2
    assert ocena["wartosc"] == [stan_mocy, stan_cos].count(STATUS_PASS)


def test_warunki_bez_danych_brak_podstawy_nie_liczba_zastepcza() -> None:
    ocena = ocen_warunki_przylaczenia(connection_conditions=None, result_v1=None).to_dict()
    assert ocena["status_ogolny"] == STATUS_UNAVAILABLE
    assert ocena["wartosc"] is None and ocena["odniesienie"] is None
    for pozycja in ocena["pozycje"]:
        assert pozycja["odniesienie"] is None and pozycja["margines"] is None
        assert pozycja["podstawa"] is not None


def _widok_cieplny(prad_a: float | None, catalog: Any) -> Any:
    wklady = (
        None
        if prad_a is None
        else [
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=prad_a,
                direction="from_to",
            )
        ]
    )
    return build_conductor_thermal_withstand_view(
        _sc_result(tk_s=0.25, branch_contributions=wklady),
        _graph_with_two_cables(),
        catalog,
        run_id="bieg-sc",
    )


@pytest.mark.parametrize(
    ("prad_a", "katalog", "stan"),
    [(15000.0, True, "PASS"), (40000.0, True, "FAIL"), (None, True, "UNAVAILABLE")],
)
def test_wytrzymalosc_cieplna_stan_x_towarzysze(
    prad_a: float | None, katalog: bool, stan: str
) -> None:
    widok = _widok_cieplny(prad_a, _catalog_with_cable_type() if katalog else None)
    pozycja = next(p for p in widok.items if p.branch_id == "cable_A")
    slownik = pozycja.to_dict()
    assert pozycja.status == stan
    for grupa in GRUPY:
        assert grupa in slownik
    assert pozycja.podstawa == PODSTAWA_KRYTERIUM_CIEPLNEGO
    assert pozycja.podstawa.zrodlo_status == StatusZrodla.UNVERIFIED_SOURCE
    assert pozycja.dowod == {"run_id": "bieg-sc", "element_id": "cable_A", "trace_ref": None}
    if stan == "UNAVAILABLE":
        assert pozycja.wartosc is None and pozycja.margines is None
        return
    assert pozycja.wartosc == pozycja.i2t_a2s
    assert pozycja.odniesienie == pozycja.i2t_dopuszczalne_a2s
    assert (pozycja.margines < 0) == (stan == "FAIL")
    for kryterium in slownik["kryteria"]:
        # Zapas kryterium czastkowego z tej samej nierownosci co jego status.
        if kryterium["margines"] is not None:
            assert (kryterium["margines"] < 0) == (kryterium["status"] == "FAIL")
