"""Fabryki testów zgodności NC RfG / PTPiREE (karta AB-1a Pakiet C).

Jedno miejsce danych wejściowych modułów, modeli ENM z tabliczkami wykazu PTPiREE i profili
z flagą wykonania prawa operatora — testy solvera, oceny wymagań, mostu, API i dokumentów
czytają te same fabryki, żeby iloczyn cech nie rozjechał się między plikami.

Profil z flagą prawa operatora: żaden profil w repozytorium nie niesie dziś
``operator_skorzystal_z_prawa`` innego niż ``None`` (warstwa OSD nieustalona). Stan
``True``/``False`` wymaga podstawy o stanie innym niż ``NIEUSTALONE`` (walidator
``WymaganieRegulacyjne``), więc fabryka buduje go PRZEZ WALIDATORY loadera z podstawą testową
``WSKAZANE`` i podmienia loader w trzech konsumentach profilu (solver, most, ocena wymagań) —
to wstrzyknięcie stanu regulacyjnego, którego dane jeszcze nie istnieją, nie obejście ścieżki
użytkownika (użytkownik nie ustawia flag profilu).
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from catalog.profiles.nc_rfg import NcRfgProfile, load_nc_rfg_profile
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator
from network_model.catalog.mv_ptpiree_catalog import get_all_ptpiree_generator_certificates
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeModuleInput

OPERATOR = "enea"

#: Komplet deklaracji modułu (wszystkie dane testów obecne, wartości w paśmie profilu).
KOMPLET: dict[str, Any] = {
    "der_ref": "pv-1",
    "der_name": "PV 2 MW",
    "der_kind": "PV",
    "module_family": "PPM",
    "operator_id": OPERATOR,
    "p_max_kw": 2000.0,
    "p_min_kw": 100.0,
    "voltage_kv": 15.0,
    "has_lvrt_curve": True,
    "has_hvrt_curve": True,
    "has_pf_droop": True,
    "has_qu_curve": True,
    "has_dynamic_model": True,
    "has_scada_communication": True,
    "has_disturbance_recorder": True,
    "active_power_control_enabled": True,
    "stop_generation_enabled": True,
    "reduction_generation_enabled": True,
    "droop_percent": 5.0,
    "dead_band_hz": 0.2,
    "ramp_rate_pct_per_min": 10.0,
    "cos_phi_min": 0.95,
    "q_range_pct_pn_min": -0.33,
    "q_range_pct_pn_max": 0.33,
    "reactive_current_gain": 2.0,
    "p_recovery_time_s": 0.8,
    "harmonic_thdu_percent": 3.0,
    "cease_generation_time_s": 1.0,
}

#: Moc [kW] i napięcie [kV] reprezentujące każdy typ (progi WOS: A od 0,8 kW, B od 200 kW,
#: C od 10 MW, D od 75 MW albo od 110 kV) oraz moduł poniżej progu istotności.
TYPY_MOCY: dict[str, tuple[float, float]] = {
    "ponizej_progu": (0.5, 0.4),
    "A": (50.0, 0.4),
    "B": (2000.0, 15.0),
    "C": (20000.0, 30.0),
    "D": (80000.0, 30.0),
}


def modul(**zmiany: Any) -> NcRfgPtpireeModuleInput:
    dane = dict(KOMPLET)
    dane.update(zmiany)
    return NcRfgPtpireeModuleInput(**dane)


def modul_typu(typ: str, **zmiany: Any) -> NcRfgPtpireeModuleInput:
    p_max_kw, napiecie_kv = TYPY_MOCY[typ]
    return modul(p_max_kw=p_max_kw, voltage_kv=napiecie_kv, **zmiany)


# --------------------------------------------------------------------------------------
# Rekordy wykazu PTPiREE (rejestr) i tabliczki urządzeń modelu
# --------------------------------------------------------------------------------------


def rekord_wykazu(
    zakres: str, *, wersja: str = "1.3", warunek: bool | None = None
) -> dict[str, Any]:
    """Pierwszy rekord rejestru o zakresie typów ``zakres`` (np. ``"A,B"``) i wersji WiPWC."""
    for rekord in get_all_ptpiree_generator_certificates():
        parametry = rekord["params"]
        if parametry.get("ppm_scope") != zakres or parametry.get("wipwc_version") != wersja:
            continue
        if warunek is not None and bool(parametry.get("certificate_condition")) != warunek:
            continue
        return dict(rekord)
    raise LookupError(f"Brak rekordu wykazu o zakresie {zakres!r} i wersji {wersja!r}.")


def tabliczka(rekord: dict[str, Any], **zmiany: Any) -> dict[str, Any]:
    """Tabliczka urządzenia tak, jak zapisuje ją ``annotate_with_ptpiree_status`` (pola
    ``ptpiree_*`` z rekordu wykazu) — zmiany podmieniają pola tabliczki."""
    parametry = rekord["params"]
    dane: dict[str, Any] = {
        "ptpiree_status": "POWIAZANY",
        "ptpiree_certificate_ref": rekord["id"],
        "ptpiree_document_number": parametry.get("document_number"),
        "ptpiree_wipwc_version": parametry.get("wipwc_version"),
        "ptpiree_ppm_scope": parametry.get("ppm_scope"),
    }
    dane.update(zmiany)
    return dane


def generator(
    ref_id: str = "gen-pv-1",
    *,
    p_mw: float = 2.0,
    gen_type: str = "pv_inverter",
    materialized_params: dict[str, Any] | None = None,
    bus_ref: str = "bus-sn",
    modul_istniejacy: bool | None = None,
    data_umowy: date | None = None,
    **zmiany: Any,
) -> Generator:
    return Generator(
        ref_id=ref_id,
        name=f"Źródło {ref_id}",
        bus_ref=bus_ref,
        p_mw=p_mw,
        gen_type=gen_type,
        materialized_params=materialized_params,
        modul_istniejacy=modul_istniejacy,
        data_umowy_przylaczeniowej=data_umowy,
        **zmiany,
    )


def model(*generatory: Generator, napiecie_kv: float = 15.0) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Zgodność NC RfG — test"),
        buses=[Bus(ref_id="bus-sn", name="Szyna SN", voltage_kv=napiecie_kv)],
        generators=list(generatory),
    )


# --------------------------------------------------------------------------------------
# Profil z flagą wykonania prawa operatora
# --------------------------------------------------------------------------------------


def profil_z_prawem(
    wymaganie_id: str, skorzystal: bool, operator_id: str = OPERATOR
) -> NcRfgProfile:
    """Profil operatora z ustalonym wykonaniem prawa operatora dla wymagania (podstawa
    testowa ``WSKAZANE``), zbudowany przez walidatory loadera."""
    profil = load_nc_rfg_profile(operator_id)
    dane = profil.model_dump()
    for wymaganie in dane["wymagania"]:
        if wymaganie["id"] != wymaganie_id:
            continue
        assert wymaganie["prawo_operatora"], f"{wymaganie_id} nie niesie prawa operatora"
        wymaganie["operator_skorzystal_z_prawa"] = skorzystal
        zrodlo = dict(wymaganie["wykonanie_prawa_zrodlo"])
        zrodlo["status"] = "WSKAZANE"
        zrodlo["wydanie"] = zrodlo.get("wydanie") or "wydanie testowe"
        zrodlo["jednostka_redakcyjna"] = "punkt testowy IRiESD"
        wymaganie["wykonanie_prawa_zrodlo"] = zrodlo
        break
    else:
        raise KeyError(wymaganie_id)
    return NcRfgProfile.model_validate(dane)


def podmien_profil(monkeypatch: pytest.MonkeyPatch, profil: NcRfgProfile) -> None:
    """Podmień loader profilu w trzech konsumentach (solver, most, ocena wymagań)."""

    def _loader(operator_id: str) -> NcRfgProfile:
        assert operator_id == profil.operator_id
        return profil

    for modul_nazwa in (
        "network_model.solvers.ncrfg_ptpiree.engine",
        "application.ncrfg_compliance.model_bridge",
        "application.ncrfg_compliance.ocena_wymagan",
    ):
        monkeypatch.setattr(f"{modul_nazwa}.load_nc_rfg_profile", _loader)
