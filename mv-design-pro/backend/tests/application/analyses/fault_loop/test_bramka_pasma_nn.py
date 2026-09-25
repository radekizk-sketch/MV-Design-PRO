"""Bramka pasma nN: analiza nN i operacja strony dolnej nie liczą się po cichu poza pasmem nN.

Po co: pętla zwarcia, SWZ, dobór aparatów nN, dowód obwodu nN i arkusz obwodów nN liczyły
się dla transformatora 110/15 kV („OK, U0 = 8660 V” — wynik fabrykowany), a operacje strony
dolnej (`add_nn_outgoing_field`, `add_nn_load`, …) zapisywały pola z katalogiem aparatów nN
na szynie 6 kV. Jeden predykat pasma: `network_model.pochodne.pasma_napieciowe.w_pasmie_nn`
(nN ⇔ 0 < U ≤ 1 kV — karta PASMO-1KV: IEC 60038 tab. 1 i rozporządzenie, zał. 1 cz. I;
szyna 1,0 kV JEST w paśmie nN, 1,001 kV już nie).

Iloczyn cech (KLASA, NIE INSTANCJA):
- analizy: ścieżka {pętla u źródła, pętla w punkcie, pętle odpływów stacji, pętle odpływów
  transformatora, SWZ, dobór aparatów nN, pętla dowodu obwodu nN, arkusz obwodów nN, wiersz
  arkusza dla aparatu, sekcja nN raportu, graf domeny nN} × strona dolna {0,4 kV, 0,69 kV,
  0,999 kV, 1 kV i 1,001 kV — granica pasma z obu stron, 6 kV, 15 kV, brak napięcia (0 kV)}
  × transformator {SN/·, WN/·};
  odmowa = status „nie dotyczy”, nazwany kod, powód z nazwą transformatora i napięciem,
  solver pętli NIE wołany (brak wyniku liczbowego) — w jednym teście;
- operacje: operacja strony dolnej {odpływ, pole źródłowe, odbiór, źródło PV po stronie nN,
  agregat, UPS, sprzęgło sekcji, warunki ułożenia kabla} × napięcie szyny {0,4, 0,69, 0,999,
  1, 1,001, 6, 15 kV, brak} — odmowa z kodem `nn.bus_not_nn_band` i migawka przed == po w jednym teście;
- stacje SN/nN (wstawienie, dołączenie) × napięcie strony dolnej — odmowa i brak skutku;
- trasy API: `tests/api/test_bramka_pasma_nn_api.py`;
- pre-kontrola gotowości (eligibility) z tym samym predykatem;
- parytet predykatu z kreatorem stacji (tablica `schemas/pasmo_nn_parytet_v1.json`).
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from api.analysis_run_exports import build_nn_circuit_report_section
from application.analyses.fault_loop import service as serwis_petli
from application.analyses.fault_loop.service import (
    KOD_ODMOWY_PASMA_NN,
    build_fault_loop_view_at_point,
    build_feeder_fault_loop_view,
    build_feeder_fault_loop_view_for_transformer,
    build_station_fault_loop_view,
)
from application.analyses.lv_domain.graph_view import build_lv_domain_view
from application.analyses.nn_circuit_sheet import (
    build_nn_circuit_sheet,
    build_nn_circuit_sheet_row_for_breaker,
)
from application.analyses.nn_device_selection import wybierz_aparat_dla_obwodu_nn
from application.analyses.swz.service import build_swz_view
from application.eligibility_service import EligibilityService
from application.proof_engine.lv_circuit_verification_binding import (
    _petla_zwarcia_min,
    zbuduj_wejscie_dowodu_obwodu_nn,
)
from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import KOD_SZYNA_POZA_PASMEM_NN
from enm.models import EnergyNetworkModel
from network_model.pochodne.pasma_napieciowe import w_pasmie_nn

from tests.application.analyses.fault_loop.test_etykiety_skladowych_petli import _enm

_TABLICA = Path(__file__).resolve().parents[4] / "schemas" / "pasmo_nn_parytet_v1.json"

#: Strona dolna: (napięcie [kV], w paśmie nN?). 0 kV = brak napięcia strony dolnej.
#: Karta PASMO-1KV: 1,0 kV to OSTATNIA wartość pasma nN (granica włączna), 1,001 kV — SN.
_STRONY_DOLNE = [
    (0.4, True),
    (0.69, True),
    (0.999, True),
    (1.0, True),
    (1.001, False),
    (6.0, False),
    (15.0, False),
    (0.0, False),
]
#: Strona górna transformatora: SN albo WN.
_STRONY_GORNE = [15.0, 110.0]


def _odmowa_nie_liczona(wynik: dict[str, Any], nazwa: str, napiecie: float) -> None:
    assert wynik["status"] == "nie dotyczy", wynik
    assert wynik["kod_odmowy"] == KOD_ODMOWY_PASMA_NN
    assert f"„{nazwa}”" in wynik["reason_pl"]
    if napiecie > 0:
        assert f"{napiecie:g} kV" in wynik["reason_pl"]
    else:
        assert "napięcia strony dolnej" in wynik["reason_pl"]
    for klucz in ("fault_loop", "fault_loop_min_scenario", "dobor", "wiersze", "feeders"):
        assert not wynik.get(klucz), (klucz, wynik.get(klucz))


def _petla_dowodu(enm: EnergyNetworkModel) -> dict[str, Any]:
    petla, braki, powod, kod = _petla_zwarcia_min(enm, "stn", "b1")
    if kod is not None:
        return {"status": "nie dotyczy", "kod_odmowy": kod, "reason_pl": powod}
    return {"status": "OK" if petla is not None else "brak danych", "missing_data": braki}


_ANALIZY = {
    "petla_u_zrodla": lambda enm: build_station_fault_loop_view(enm, "stn"),
    "petla_w_punkcie": lambda enm: build_fault_loop_view_at_point(enm, "stn", "b1"),
    "petle_odplywow_stacji": lambda enm: build_feeder_fault_loop_view(enm, "stn"),
    "petle_odplywow_tr": lambda enm: build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr"),
    "swz": lambda enm: build_swz_view(enm, "stn", "b1", "ap1"),
    "dobor_aparatow_nn": lambda enm: wybierz_aparat_dla_obwodu_nn(
        enm=enm, station_ref="stn", bus_ref="b1", ib_a=10.0, iz_prime_a=40.0, ik_max_ka=None
    ),
    "petla_dowodu_obwodu_nn": _petla_dowodu,
    "arkusz_obwodow_nn": lambda enm: build_nn_circuit_sheet(enm=enm, station_ref="stn"),
    "wiersz_arkusza_aparatu": lambda enm: build_nn_circuit_sheet_row_for_breaker(
        enm=enm, station_ref="stn", bus_ref="b1", breaker_ref="ap1"
    ),
    "sekcja_nn_raportu": lambda enm: build_nn_circuit_report_section(
        enm=enm,
        station_ref="stn",
        bus_ref="b1",
        breaker_ref="ap1",
        run_id="r",
        revision_id="v",
        przypadek_decydujacy="MIN",
    ),
}

#: Ścieżki, które w paśmie nN liczą pętlę solverem (spy musi być wołany).
_LICZA_PETLE = {
    "petla_u_zrodla",
    "petla_w_punkcie",
    "petle_odplywow_stacji",
    "petle_odplywow_tr",
    "swz",
    "dobor_aparatow_nn",
    "petla_dowodu_obwodu_nn",
}


@pytest.mark.parametrize("sciezka", sorted(_ANALIZY))
@pytest.mark.parametrize("napiecie_gorne", _STRONY_GORNE)
@pytest.mark.parametrize(("napiecie_dolne", "w_pasmie"), _STRONY_DOLNE)
def test_analiza_nn_poza_pasmem_odmawia_bez_wyniku_liczbowego(
    monkeypatch: pytest.MonkeyPatch,
    sciezka: str,
    napiecie_gorne: float,
    napiecie_dolne: float,
    w_pasmie: bool,
) -> None:
    wywolania: list[object] = []
    oryginal = serwis_petli.compute_fault_loop

    def _szpieg(dane: Any) -> Any:
        wywolania.append(dane)
        return oryginal(dane)

    monkeypatch.setattr(serwis_petli, "compute_fault_loop", _szpieg)
    nazwa = "TR-7 Kowalskiego"
    wynik = _ANALIZY[sciezka](_enm(nazwa, napiecie_gorne, napiecie_dolne))

    if w_pasmie:
        assert wynik.get("kod_odmowy") is None, wynik
        assert wynik["status"] != "nie dotyczy", wynik
        if sciezka in _LICZA_PETLE:
            assert wywolania, f"{sciezka}: pętla w paśmie nN nie została policzona"
    else:
        _odmowa_nie_liczona(wynik, nazwa, napiecie_dolne)
        assert wywolania == [], f"{sciezka}: solver pętli wołany poza pasmem nN"


@pytest.mark.parametrize("napiecie_gorne", _STRONY_GORNE)
@pytest.mark.parametrize(("napiecie_dolne", "w_pasmie"), _STRONY_DOLNE)
def test_graf_domeny_nn_tylko_z_szyn_w_pasmie(
    napiecie_gorne: float, napiecie_dolne: float, w_pasmie: bool
) -> None:
    widok = build_lv_domain_view(_enm("T", napiecie_gorne, napiecie_dolne), "stn")
    if w_pasmie:
        assert widok["status"] == "OK", widok
    else:
        assert widok["status"] == "brak danych"
        assert widok["missing_data"] == ["lv_bus"]


@pytest.mark.parametrize("napiecie_dolne", [v for v, w_pasmie in _STRONY_DOLNE if not w_pasmie])
def test_dowod_obwodu_nn_poza_pasmem_odmawia_przed_zlozeniem_wejscia(napiecie_dolne: float) -> None:
    """Publiczny budowniczy wejścia dowodu: odmowa nazwana, zanim użyje danych cieplnych.

    Przypadki w paśmie nN pokrywa `test_analiza_nn_poza_pasmem_odmawia_bez_wyniku_liczbowego`
    (ścieżka `petla_dowodu_obwodu_nn` — ta sama pętla, którą woła ten budowniczy).
    """
    wynik = zbuduj_wejscie_dowodu_obwodu_nn(
        enm=_enm("TR-D", 110.0, napiecie_dolne),
        station_ref="stn",
        bus_ref="b1",
        breaker_ref="ap1",
        segment_ref="c1",
        project_name="p",
        case_name="c",
        run_timestamp=None,  # type: ignore[arg-type]
        solver_version="t",
        p_mw=0.01,
        q_mvar=0.0,
        u_ll_kv=napiecie_dolne,
        iz_katalogowe_a=40.0,
        wspolczynniki=None,  # type: ignore[arg-type]
        ik_max_ka=None,
        thermal=None,  # type: ignore[arg-type]
        vdrop_u_source_kv=napiecie_dolne,
        vdrop_delta_u_total_kv=0.0,
    )
    assert wynik["status"] == "nie dotyczy"
    assert wynik["kod_odmowy"] == KOD_ODMOWY_PASMA_NN
    assert "„TR-D”" in wynik["reason_pl"]


def test_stacja_mieszana_liczy_transformator_nn_a_odmowe_drugiego_nazywa() -> None:
    """Stacja 2×TR: transformator 15/0,4 liczy się, 15/6 kV nie znika po cichu — jego kod
    trafia do braków widoku odpływów stacji i arkusza (nie jest liczony)."""
    enm = _enm("TR-A", 15.0, 0.4)
    obcy = enm.transformers[0].model_copy(
        update={"ref_id": "tr6", "name": "TR-6", "lv_bus_ref": "b6", "ulv_kv": 6.0}
    )
    szyna6 = enm.buses[1].model_copy(update={"ref_id": "b6", "name": "B6", "voltage_kv": 6.0})
    stacja = enm.substations[0].model_copy(
        update={"transformer_refs": ["tr", "tr6"], "bus_refs": ["nn", "b6"]}
    )
    enm = enm.model_copy(
        update={
            "transformers": [*enm.transformers, obcy],
            "buses": [*enm.buses, szyna6],
            "substations": [stacja],
        }
    )
    widok = build_feeder_fault_loop_view(enm, "stn")
    assert widok["status"] == "OK"
    assert f"tr6:{KOD_ODMOWY_PASMA_NN}" in widok["missing_data"]
    arkusz = build_nn_circuit_sheet(enm=enm, station_ref="stn")
    assert f"tr6:{KOD_ODMOWY_PASMA_NN}" in arkusz["missing_data"]


# ---------------------------------------------------------------------------
# Operacje strony dolnej
# ---------------------------------------------------------------------------


def _migawka_stacji(napiecie_szyny: float | None) -> dict[str, Any]:
    """Stacja SN/nN z szyną strony dolnej o zadanym napięciu (bez napięcia = None)."""
    enm = _enm("TR", 15.0, 0.4).model_dump(mode="json")
    for szyna in enm["buses"]:
        if szyna["ref_id"] in ("nn", "b1", "b2"):
            szyna["voltage_kv"] = napiecie_szyny
    enm["branches"] = [b for b in enm["branches"] if b["ref_id"] == "c1"]
    return enm


def _payloady(technologia_klucz: str) -> dict[str, tuple[str, dict[str, Any]]]:
    return {
        "odplyw": (
            "add_nn_outgoing_field",
            {"bus_nn_ref": "nn", "station_ref": "stn", "field_role": "OUTGOING"},
        ),
        "pole_zrodlowe": (
            "add_nn_outgoing_field",
            {
                "bus_nn_ref": "nn",
                "station_ref": "stn",
                "field_role": "SOURCE",
                "source_field_kind": "PV",
            },
        ),
        "zrodlo_pv_strona_nn": (
            "add_converter_source",
            {
                "source_technology": "PV",
                "connection_variant": "nn_side",
                "bus_nn_ref": "nn",
                "station_ref": "stn",
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": technologia_klucz,
                    "catalog_item_version": "2024.1",
                },
            },
        ),
        "agregat": (
            "add_genset_nn",
            {"bus_nn_ref": "nn", "genset_spec": {"rated_power_kw": 50.0, "power_factor": 0.8}},
        ),
        "ups": ("add_ups_nn", {"bus_nn_ref": "nn", "ups_spec": {"rated_power_kw": 20.0}}),
        "sprzeglo_sekcji": ("add_nn_section_coupler", {"station_ref": "stn"}),
        "warunki_ulozenia": (
            "set_nn_cable_laying_conditions",
            {
                "segment_ref": "c1",
                "cable_laying_conditions": {"set_name": "warunki_katalogowe"},
            },
        ),
    }


_OPERACJE = sorted(_payloady("conv-pv-nn-0p5mw-0p4kv"))
_NAPIECIA_SZYNY = [
    (0.4, True),
    (0.69, True),
    (0.999, True),
    (1.0, True),
    (1.001, False),
    (6.0, False),
    (15.0, False),
]


@pytest.mark.parametrize("operacja", _OPERACJE)
@pytest.mark.parametrize(("napiecie", "w_pasmie"), _NAPIECIA_SZYNY)
def test_operacja_strony_dolnej_poza_pasmem_odmawia_bez_skutku(
    operacja: str, napiecie: float, w_pasmie: bool
) -> None:
    migawka = _migawka_stacji(napiecie)
    if operacja == "sprzeglo_sekcji":
        # Sprzęgło dotyczy rozdzielnicy nN; jej szyna poza pasmem to model zapisany sprzed
        # bramki `add_nn_distribution_board` (ta sama bramka pasma — kod `nn.board_*`).
        migawka["substations"][0]["station_type"] = "rozdzielnica_nn"
    przed = copy.deepcopy(migawka)
    nazwa_op, payload = _payloady("conv-pv-nn-0p5mw-0p4kv")[operacja]
    wynik = execute_domain_operation(migawka, nazwa_op, payload)
    assert migawka == przed, "operacja zmieniła migawkę wejściową"
    if w_pasmie:
        assert wynik.get("error_code") != KOD_SZYNA_POZA_PASMEM_NN, wynik.get("error")
    else:
        assert wynik.get("error_code") == KOD_SZYNA_POZA_PASMEM_NN, wynik
        assert f"{napiecie:g} kV" in wynik["error"]
        assert wynik.get("snapshot") is None


def test_odbior_nn_na_odplywie_poza_pasmem_odmawia_bez_skutku() -> None:
    """`add_nn_load` wymaga odpływu — odpływ dodany w paśmie, potem szyna przestawiona
    na 6 kV (model zapisany sprzed bramki): odbiór odmawia, migawka bez zmian."""
    migawka = _migawka_stacji(0.4)
    odplyw = execute_domain_operation(
        migawka,
        "add_nn_outgoing_field",
        {"bus_nn_ref": "nn", "station_ref": "stn", "field_role": "OUTGOING"},
    )
    assert not odplyw.get("error"), odplyw.get("error")
    stan = odplyw["snapshot"]
    feeder_ref = odplyw["changes"]["created_element_ids"][0]
    for szyna in stan["buses"]:
        if szyna["ref_id"] == "nn":
            szyna["voltage_kv"] = 6.0
    przed = copy.deepcopy(stan)
    wynik = execute_domain_operation(
        stan,
        "add_nn_load",
        {
            "feeder_ref": feeder_ref,
            "bus_nn_ref": "nn",
            "active_power_kw": 10.0,
            "reactive_power_kvar": 2.0,
        },
    )
    assert stan == przed
    assert wynik.get("error_code") == KOD_SZYNA_POZA_PASMEM_NN, wynik


def test_operacja_strony_dolnej_na_szynie_bez_napiecia_odmawia() -> None:
    migawka = _migawka_stacji(0.4)
    for szyna in migawka["buses"]:
        if szyna["ref_id"] == "nn":
            szyna.pop("voltage_kv")
    przed = copy.deepcopy(migawka)
    wynik = execute_domain_operation(
        migawka,
        "add_nn_outgoing_field",
        {"bus_nn_ref": "nn", "station_ref": "stn", "field_role": "OUTGOING"},
    )
    assert migawka == przed
    assert wynik.get("error_code") == KOD_SZYNA_POZA_PASMEM_NN
    assert "nie ma dodatniego napięcia" in wynik["error"]


@pytest.mark.parametrize(("napiecie", "w_pasmie"), _NAPIECIA_SZYNY)
@pytest.mark.parametrize("operacja", ["insert_station_on_segment_sn", "append_station_on_endpoint"])
def test_stacja_sn_nn_ze_strona_dolna_poza_pasmem_odmawia_bez_skutku(
    operacja: str, napiecie: float, w_pasmie: bool
) -> None:
    from tests.enm.test_station_field_apparatus_explicit import (
        APARAT_SN,
        _build_trunk_with_segment,
        _insert_payload,
    )

    snap, segment_ref, terminal = _build_trunk_with_segment()
    if operacja == "insert_station_on_segment_sn":
        payload = _insert_payload(segment_ref, field_apparatus_catalog_ref=APARAT_SN)
        payload["station"]["nn_voltage_kv"] = napiecie
    else:
        payload = {
            "endpoint_bus_ref": terminal,
            "station": {"name": "Stacja K", "station_type": "terminal"},
            "nn_voltage_kv": napiecie,
            "field_apparatus_catalog_ref": APARAT_SN,
            "transformer": {"transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11"},
        }
    przed = copy.deepcopy(snap)
    wynik = execute_domain_operation(snap, operacja, payload)
    assert snap == przed
    kod = (
        operacja.split("_")[0]
        .replace("insert", "station.insert")
        .replace("append", "station.append")
    )
    if w_pasmie:
        assert wynik.get("error_code") != f"{kod}.nn_voltage_not_nn_band", wynik.get("error")
    else:
        assert wynik.get("error_code") == f"{kod}.nn_voltage_not_nn_band", wynik
        assert wynik.get("snapshot") is None


# ---------------------------------------------------------------------------
# Pre-kontrola gotowości i parytet predykatu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("napiecie_dolne", "w_pasmie"), _STRONY_DOLNE[:-1])
def test_pre_kontrola_petli_nn_z_tym_samym_predykatem(
    napiecie_dolne: float, w_pasmie: bool
) -> None:
    enm = _enm("TR-E", 15.0, napiecie_dolne)
    stacja = enm.substations[0].model_copy(update={"station_type": "mv_lv"})
    enm = enm.model_copy(update={"substations": [stacja]})
    blokery: list[Any] = []
    EligibilityService._check_nn_station_transformer_loop(enm, blokery)
    kody = {b.code for b in blokery}
    assert ("ELIG_FLNN_TRANSFORMER_LV_NOT_NN_BAND" in kody) is (not w_pasmie), kody


def test_predykat_pasma_nn_zgodny_z_tablica_parytetu_kreatora() -> None:
    wiersze = json.loads(_TABLICA.read_text(encoding="utf-8"))["wiersze"]
    assert wiersze
    for wiersz in wiersze:
        assert w_pasmie_nn(wiersz["napiecie_kv"]) is wiersz["w_pasmie_nn"], wiersz
