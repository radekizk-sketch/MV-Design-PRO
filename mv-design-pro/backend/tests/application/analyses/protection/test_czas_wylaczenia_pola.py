"""Czas wyłączenia POLA stacji z nastaw zabezpieczeń (karta KD-6, poz. 3).

Do tej karty czas wyłączenia użyty w kryterium cieplnym wytrzymałości aparatury
brał się WYŁĄCZNIE z liczby wpisanej ręcznie w konfiguracji stacji. Teraz jest
wyprowadzony z danych: człon nastawczy liczy solver IEC 60255 przy prądzie
zwarciowym punktu, a czas własny aparatu pochodzi z pozycji katalogu APARAT_SN.
Odpowiedź niesie OBA człony osobno (WHITE BOX) i nazywa każdy brak.
"""

from __future__ import annotations

from typing import Any

from application.analyses.protection.czas_wylaczenia_pola import (
    READINESS_BRAK_CZASU_WLASNEGO,
    READINESS_BRAK_NASTAW,
    READINESS_BRAK_PRADU,
    READINESS_PONIZEJ_ROZRUCHU,
    ZRODLO_NASTAWY_POLA,
    czasy_wylaczenia_pol_stacji,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    ProtectionAssignment,
    ProtectionSetting,
    Substation,
    SwitchBranch,
)

APARAT_KATALOG = "sw-cb-abb-vd4-12kv-630a"
POLE = "pole/in"
APARAT = "aparat/01"


def _enm(
    *,
    nastawy: list[ProtectionSetting] | None = None,
    is_enabled: bool = True,
    z_zabezpieczeniem: bool = True,
) -> EnergyNetworkModel:
    przypisania = []
    if z_zabezpieczeniem:
        przypisania.append(
            ProtectionAssignment(
                ref_id="prot/01",
                name="Zabezpieczenie pola IN",
                breaker_ref=APARAT,
                device_type="overcurrent",
                is_enabled=is_enabled,
                settings=(
                    nastawy
                    if nastawy is not None
                    else [
                        ProtectionSetting(
                            function_type="overcurrent_51",
                            threshold_a=400.0,
                            curve_type="DT",
                            time_delay_s=0.3,
                        )
                    ]
                ),
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[Bus(ref_id="sn", name="SN", voltage_kv=15.0)],
        branches=[
            SwitchBranch(
                ref_id=APARAT,
                name="Aparat pola SN 1",
                type="breaker",
                from_bus_ref="sn",
                to_bus_ref="zacisk",
                catalog_ref=APARAT_KATALOG,
                catalog_namespace="APARAT_SN",
                meta={"station_ref": "stn", "bay_ref": POLE},
            )
        ],
        protection_assignments=przypisania,
        substations=[
            Substation(
                ref_id="stn",
                name="Stacja Sady",
                station_type="mv_lv",
                bus_refs=["sn"],
                meta={
                    "field_specs": [
                        {"field_ref": POLE, "name": "P-01", "bay_role": "IN", "bus_ref": "sn"}
                    ]
                },
            )
        ],
    )


def _czas(**kwargs: Any) -> dict[str, Any]:
    parametry: dict[str, Any] = {"enm": _enm(), "station_ref": "stn", "ik_ka": 8.0}
    parametry.update(kwargs)
    return czasy_wylaczenia_pol_stacji(**parametry)[POLE]


def test_czas_z_charakterystyki_niezaleznej_ma_rozbicie_white_box() -> None:
    """DT: człon nastawczy = zwłoka nastawiona; rozbicie widoczne w odpowiedzi."""
    czas = _czas()

    assert czas["zrodlo"] == ZRODLO_NASTAWY_POLA
    assert czas["czlon_nastawczy_s"] == 0.3
    assert czas["t_clearing_s"] == 0.3
    assert czas["funkcja"] == "overcurrent_51"
    assert czas["krzywa"] == "DT"
    assert czas["prad_rozruchowy_a"] == 400.0
    assert czas["prad_zwarciowy_a"] == 8000.0
    assert czas["urzadzenie_ref"] == "prot/01"


def test_czas_z_charakterystyki_odwrotnej_liczy_solver_i_pokazuje_stale() -> None:
    """SI (NI): t = TMS·0,14/((I/Is)^0,02−1) — stałe A/B w odpowiedzi, nie sama nazwa."""
    czas = _czas(
        enm=_enm(
            nastawy=[
                ProtectionSetting(
                    function_type="overcurrent_51",
                    threshold_a=400.0,
                    curve_type="IEC_SI",
                    time_multiplier=0.1,
                )
            ]
        )
    )

    assert czas["stala_a"] == 0.14
    assert czas["stala_b"] == 0.02
    # M = 8000/400 = 20; 20^0,02 = 1,061753; t = 0,1·0,14/0,061753 = 0,226736 s.
    assert abs(czas["czlon_nastawczy_s"] - 0.226736) < 1e-5
    assert czas["t_clearing_s"] == czas["czlon_nastawczy_s"]


def test_brak_czasu_wlasnego_aparatu_jest_nazwany_zalozeniem_i_kodem() -> None:
    """Katalog nie niesie czasu własnego ⇒ czas to SAM człon nastawczy, jawnie."""
    czas = _czas()

    assert czas["czas_wlasny_wylacznika_s"] is None
    assert READINESS_BRAK_CZASU_WLASNEGO in czas["kody_gotowosci"]
    assert czas["zalozenia_pl"], "Brak członu MUSI być powiedziany wprost"
    assert "czasu własnego" in czas["zalozenia_pl"][0]


def test_czas_wlasny_z_katalogu_jest_doliczany_do_czasu_wylaczenia(monkeypatch) -> None:
    """Gdy pozycja katalogu niesie czas własny — wchodzi do sumy jako drugi człon."""
    from application.analyses.protection import czas_wylaczenia_pola as modul

    monkeypatch.setattr(modul, "_czas_wlasny_aparatu", lambda refy: (0.06, refy[0]))
    czas = _czas()

    assert czas["czas_wlasny_wylacznika_s"] == 0.06
    assert czas["czlon_nastawczy_s"] == 0.3
    assert czas["t_clearing_s"] == 0.36
    assert czas["kody_gotowosci"] == []
    assert czas["zalozenia_pl"] == []


def test_brak_nastaw_pola_daje_kod_gotowosci_zamiast_wartosci_zastepczej() -> None:
    czas = _czas(enm=_enm(z_zabezpieczeniem=False))

    assert czas["t_clearing_s"] is None
    assert czas["kody_gotowosci"] == [READINESS_BRAK_NASTAW]
    assert "czynnego zabezpieczenia" in czas["powod_pl"]


def test_zabezpieczenie_odstawione_nie_wyznacza_czasu() -> None:
    czas = _czas(enm=_enm(is_enabled=False))

    assert czas["t_clearing_s"] is None
    assert czas["kody_gotowosci"] == [READINESS_BRAK_NASTAW]


def test_nastawa_bez_progu_rozruchowego_nie_daje_czasu() -> None:
    czas = _czas(
        enm=_enm(
            nastawy=[
                ProtectionSetting(function_type="overcurrent_51", curve_type="DT", time_delay_s=0.3)
            ]
        )
    )

    assert czas["t_clearing_s"] is None
    assert czas["kody_gotowosci"] == [READINESS_BRAK_NASTAW]


def test_prad_ponizej_rozruchu_to_nie_jest_czas_zero() -> None:
    """Zabezpieczenie, które nie zadziała, nie „wyłącza w 0 s"."""
    czas = _czas(ik_ka=0.2)

    assert czas["t_clearing_s"] is None
    assert czas["kody_gotowosci"] == [READINESS_PONIZEJ_ROZRUCHU]
    assert "nie przekracza progu rozruchowego" in czas["powod_pl"]


def test_brak_pradu_poczatkowego_nie_pozwala_sprawdzic_charakterystyki() -> None:
    czas = _czas(ik_ka=None)

    assert czas["t_clearing_s"] is None
    assert czas["kody_gotowosci"] == [READINESS_BRAK_PRADU]


def test_wynik_jest_deterministyczny() -> None:
    assert czasy_wylaczenia_pol_stacji(
        enm=_enm(), station_ref="stn", ik_ka=8.0
    ) == czasy_wylaczenia_pol_stacji(enm=_enm(), station_ref="stn", ik_ka=8.0)
