"""Sieć złota G08 — bieg ``protection_sn`` na urządzeniach i nastawach Z MODELU (wyrocznia normy).

Karta BIEG-ZABEZPIECZEN-Z-MODELU. Wyrocznia NORMATYWNA rodziny PROTECTION rejestru sieci
wzorcowych: czas zadziałania każdego urządzenia w każdym punkcie jego strefy jest równy
czasowi najszybszego pobudzonego stopnia policzonemu WPROST ze wzoru IEC 60255-151
(``t = TMS·0,14/(M^0,02 − 1)`` dla IEC SI, zwłoka dla DT) przy prądzie przekaźnika z biegu.

Iloczyn cech: urządzenie (Q1 nadrzędne, Q2 podrzędne) × punkt (w strefie, poza strefą) ×
scenariusz (MAX, MIN) × stopień decydujący (I>, I>>). Parytet: zabezpieczenia w modelu nie
zmieniają ani jednej liczby biegu zwarciowego (liść po liściu).
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    NASTAWY_Q1,
    NASTAWY_Q2,
    NAZWA_ZABEZPIECZENIA_Q1,
    NAZWA_ZABEZPIECZENIA_Q2,
    build_zabezpieczenia_magistrali_enm,
)

_PRZEKLADNIA = 600.0 / 5.0


def _biegi(model: EnergyNetworkModel, *, scenariusz: str | None = None) -> tuple[Any, Any]:
    reset_canonical_runs()
    reset_enm_store()
    set_enm("case-g08", model)
    opcje = {"scenario": scenariusz} if scenariusz else None
    sc = execute_run(
        create_run(
            case_id="case-g08",
            klucz_twin="case-g08",
            analysis_type="short_circuit_sn",
            options=opcje,
        ).id
    )
    assert sc.status == "FINISHED", sc.error_message
    zab = execute_run(
        create_run(
            case_id="case-g08",
            klucz_twin="case-g08",
            analysis_type="protection_sn",
            options={"sc_run_id": str(sc.id)},
        ).id
    )
    assert zab.status == "FINISHED", zab.error_message
    return sc, zab


@pytest.fixture(scope="module")
def model() -> EnergyNetworkModel:
    return build_zabezpieczenia_magistrali_enm()


@pytest.fixture(scope="module")
def wynik_max(model: EnergyNetworkModel) -> tuple[dict[str, Any], dict[str, Any]]:
    sc, zab = _biegi(model)
    return sc.raw_result, zab.raw_result["protection_result"]


def _czas_normy(nastawy: list[dict[str, Any]], prad_a: float) -> tuple[float | None, str | None]:
    """Czas urządzenia WPROST z normy: najszybszy stopień, którego próg przekroczono."""
    czasy: list[tuple[float, str]] = []
    for n in nastawy:
        prog = n["threshold_a"] * _PRZEKLADNIA
        m = prad_a / prog
        if m <= 1.0:
            continue
        if n["curve_type"] == "DT":
            czasy.append((n["time_delay_s"], n["function_type"]))
        else:
            assert n["curve_type"] == "IEC_SI"
            czasy.append(
                (n["time_multiplier"] * 0.14 / (math.pow(m, 0.02) - 1.0), n["function_type"])
            )
    if not czasy:
        return None, None
    return min(czasy)


def test_siec_zlota_niesie_dwa_zabezpieczenia_z_operacji(model: EnergyNetworkModel) -> None:
    przypisania = {p.name: p for p in model.protection_assignments}
    assert set(przypisania) == {NAZWA_ZABEZPIECZENIA_Q1, NAZWA_ZABEZPIECZENIA_Q2}
    for przypisanie in przypisania.values():
        assert przypisanie.catalog_ref == "REF-OC-200"
        assert przypisanie.source_mode == "KATALOG"
        assert all(s.threshold_unit == "A_WTORNY" for s in przypisanie.settings)
        ct = next(m for m in model.measurements if m.ref_id == przypisanie.ct_ref)
        assert ct.catalog_ref == "ct_600_5_5p20_15va_schneider"
        wylacznik = next(b for b in model.branches if b.ref_id == przypisanie.breaker_ref)
        assert wylacznik.type == "breaker"


def test_budowa_deterministyczna() -> None:
    assert compute_enm_hash(build_zabezpieczenia_magistrali_enm()) == compute_enm_hash(
        build_zabezpieczenia_magistrali_enm()
    )


def test_czasy_zgodne_ze_wzorem_normy_dla_kazdej_oceny(
    wynik_max: tuple[dict[str, Any], dict[str, Any]],
) -> None:
    _sc, wynik = wynik_max
    nastawy = {NAZWA_ZABEZPIECZENIA_Q1: NASTAWY_Q1, NAZWA_ZABEZPIECZENIA_Q2: NASTAWY_Q2}
    assert wynik["odmowy"] == []
    assert len(wynik["evaluations"]) == 3
    for ocena in wynik["evaluations"]:
        t, stopien = _czas_normy(nastawy[ocena["nazwa_urzadzenia_pl"]], ocena["i_fault_a"])
        assert ocena["t_trip_s"] == pytest.approx(t, abs=1e-6)
        assert ocena["stopien_decydujacy"] == stopien
        assert ocena["wiarygodnosc"] == "WIARYGODNY"
        # Rekord werdyktu wyjaśnialnego: status, zdanie po polsku i dowód obliczenia.
        assert ocena["ocena"]["status_maszynowy"]
        assert ocena["ocena"]["wyjasnienie"]["zdanie_pl"]


def test_strefy_z_topologii(wynik_max: tuple[dict[str, Any], dict[str, Any]]) -> None:
    """Q1 ocenia obie stacje, Q2 wyłącznie stację S02 (S01 leży przed nim — poza strefą)."""
    _sc, wynik = wynik_max
    punkty: dict[str, set[str]] = {}
    for ocena in wynik["evaluations"]:
        punkty.setdefault(ocena["nazwa_urzadzenia_pl"], set()).add(ocena["nazwa_punktu_pl"])
    assert punkty == {
        NAZWA_ZABEZPIECZENIA_Q1: {"Stacja S01", "Stacja S02"},
        NAZWA_ZABEZPIECZENIA_Q2: {"Stacja S02"},
    }


def test_wartosci_referencyjne_policzone_recznie(
    wynik_max: tuple[dict[str, Any], dict[str, Any]],
) -> None:
    """Q2 przy zwarciu w S02: I> 180 A pierwotne, TMS 0,1 → t51 = 0,014/(M^0,02 − 1);
    I>> 1800 A, DT 0,1 s decyduje (szybszy). Liczby z pomiaru biegu przypięte z tolerancją
    obliczeń ręcznych (M ≈ 48,7 → M^0,02 ≈ 1,0808 → t51 ≈ 0,173 s)."""
    _sc, wynik = wynik_max
    ocena = next(
        o for o in wynik["evaluations"] if o["nazwa_urzadzenia_pl"] == NAZWA_ZABEZPIECZENIA_Q2
    )
    assert ocena["i_fault_a"] == pytest.approx(8767.4, abs=1.0)
    stopnie = {s["funkcja"]: s for s in ocena["stopnie"]}
    assert stopnie["overcurrent_51"]["t_s"] == pytest.approx(0.1733, abs=5e-4)
    assert stopnie["overcurrent_50"]["t_s"] == pytest.approx(0.1, abs=1e-12)
    assert ocena["t_trip_s"] == pytest.approx(0.1, abs=1e-12)
    assert ocena["stopien_decydujacy"] == "overcurrent_50"


def test_prad_ostatniego_wylacznika_rowny_pradowi_zwarcia_punktu(
    wynik_max: tuple[dict[str, Any], dict[str, Any]],
) -> None:
    """Sieć promieniowa z jednym zasilaniem: prąd wyłącznika bezpośrednio przed punktem
    zwarcia równa się Ik'' punktu (różnica = prądy pojemnościowe kabli, < 0,01 %)."""
    sc, wynik = wynik_max
    ocena = next(
        o for o in wynik["evaluations"] if o["nazwa_urzadzenia_pl"] == NAZWA_ZABEZPIECZENIA_Q2
    )
    ik = next(w["ikss_a"] for w in sc["results"] if w["fault_node_id"] == ocena["fault_target_id"])
    assert ocena["i_fault_a"] == pytest.approx(ik, rel=1e-4)


def test_scenariusz_minimalny_ta_sama_sciezka(model: EnergyNetworkModel) -> None:
    _sc, zab = _biegi(model, scenariusz="min")
    wynik = zab.raw_result["protection_result"]
    nastawy = {NAZWA_ZABEZPIECZENIA_Q1: NASTAWY_Q1, NAZWA_ZABEZPIECZENIA_Q2: NASTAWY_Q2}
    assert len(wynik["evaluations"]) == 3
    for ocena in wynik["evaluations"]:
        t, _stopien = _czas_normy(nastawy[ocena["nazwa_urzadzenia_pl"]], ocena["i_fault_a"])
        assert ocena["t_trip_s"] == pytest.approx(t, abs=1e-6)


def test_zabezpieczenia_nie_zmieniaja_liczb_biegu_zwarciowego(model: EnergyNetworkModel) -> None:
    """Parytet liść po liściu: ten sam model bez przypisań i przekładników daje identyczne
    wiersze biegu zwarciowego — nastawy i przekładniki nie wchodzą do fizyki."""
    sc_z, _zab = _biegi(model)
    wiersze_z = sc_z.raw_result["results"]
    bez = model.model_copy(deep=True)
    bez.protection_assignments = []
    bez.measurements = []
    reset_canonical_runs()
    reset_enm_store()
    set_enm("case-g08-bez", bez)
    sc_bez = execute_run(
        create_run(
            case_id="case-g08-bez", klucz_twin="case-g08-bez", analysis_type="short_circuit_sn"
        ).id
    )
    # Wiązanie dowodu (`proof_ref`, `proof_binding`) niesie odcisk MIGAWKI — ta różni się
    # przypisaniami, więc wiązanie musi się różnić; każdy inny liść wiersza jest identyczny.
    tozsamosc_dowodu = {"proof_ref", "proof_binding"}

    def fizyka(wiersze: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [{k: v for k, v in w.items() if k not in tozsamosc_dowodu} for w in wiersze]

    assert len(wiersze_z) == 9
    assert fizyka(sc_bez.raw_result["results"]) == fizyka(wiersze_z)


def test_edycja_nastaw_nie_wymaga_ponownego_zwarcia(model: EnergyNetworkModel) -> None:
    """Nastawy zmienione PO biegu zwarciowym (operacja projektanta) — bieg oceny przyjmuje
    bieg źródłowy (ta sama sieć) i liczy na NOWYCH nastawach."""
    from enm.domain_operations import execute_domain_operation

    sc, _zab = _biegi(model)
    q2 = next(p for p in model.protection_assignments if p.name == NAZWA_ZABEZPIECZENIA_Q2)
    nowe = [
        {
            "function_type": "overcurrent_51",
            "threshold_a": 1.0,
            "threshold_unit": "A_WTORNY",
            "curve_type": "IEC_VI",
            "time_multiplier": 0.2,
        }
    ]
    wynik = execute_domain_operation(
        get_enm("case-g08").model_dump(mode="json"),
        "update_protection_settings",
        {"protection_ref": q2.ref_id, "settings": nowe},
    )
    assert wynik.get("error") is None, wynik.get("error")
    set_enm("case-g08", EnergyNetworkModel.model_validate(wynik["snapshot"]))
    zab = execute_run(
        create_run(
            case_id="case-g08",
            klucz_twin="case-g08",
            analysis_type="protection_sn",
            options={"sc_run_id": str(sc.id)},
        ).id
    )
    assert zab.status == "FINISHED", zab.error_message
    ocena = next(
        o
        for o in zab.raw_result["protection_result"]["evaluations"]
        if o["nazwa_urzadzenia_pl"] == NAZWA_ZABEZPIECZENIA_Q2
    )
    m = ocena["i_fault_a"] / 120.0
    assert ocena["t_trip_s"] == pytest.approx(0.2 * 13.5 / (m - 1.0), abs=1e-6)
    assert ocena["curve_kind"] == "IEC_VI"


def test_zmiana_sieci_po_biegu_wymaga_ponownego_zwarcia(model: EnergyNetworkModel) -> None:
    """Zmiana poza zabezpieczeniami (długość odcinka) po biegu zwarciowym — utworzenie biegu
    oceny odmawia z nazwanym powodem zamiast składać nastawy z inną siecią."""
    from enm.domain_operations import execute_domain_operation

    sc, _zab = _biegi(model)
    dane = get_enm("case-g08").model_dump(mode="json")
    kabel = next(g["ref_id"] for g in dane["branches"] if g["type"] == "cable")
    wynik = execute_domain_operation(
        dane,
        "update_element_parameters",
        {"element_ref": kabel, "parameters": {"length_km": 2.0, "parameter_source": "CATALOG"}},
    )
    assert wynik.get("error") is None, wynik.get("error")
    set_enm("case-g08", EnergyNetworkModel.model_validate(wynik["snapshot"]))
    with pytest.raises(ValueError, match="innej sieci"):
        create_run(
            case_id="case-g08",
            klucz_twin="case-g08",
            analysis_type="protection_sn",
            options={"sc_run_id": str(sc.id)},
        )
