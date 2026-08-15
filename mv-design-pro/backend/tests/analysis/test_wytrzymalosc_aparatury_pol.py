"""Werdykty wytrzymałości aparatury pól stacji liczone Z MODELU (karta KD-6, poz. 2).

INTENCJA: inżynier, który policzył zwarcie w stacji, ma dostać odpowiedź „czy
aparatura pól to wytrzyma" BEZ uprzedniego ręcznego konfigurowania aparatów —
model wie, jaki aparat stoi w każdym polu (pozycja katalogu APARAT_SN). Zapisana
konfiguracja pozostaje nadrzędna tam, gdzie inżynier jej użył, a każdy wiersz
mówi wprost, skąd wziął aparat (`zrodlo`).
"""

from __future__ import annotations

from typing import Any

from application.analyses.wytrzymalosc_aparatury_pol import (
    READINESS_BRAK_PRADOW,
    READINESS_POZYCJA_BEZ_ZNAMION,
    READINESS_STACJA_NIEZNANA,
    ZRODLO_KONFIGURACJA,
    ZRODLO_MODEL,
    zbuduj_widok_wytrzymalosci_aparatury,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Substation,
    SwitchBranch,
)

# Pozycje REALNEGO katalogu APARAT_SN (nie fixture): wyłącznik z Icw 20 kA/1 s
# i bezpiecznik, który wytrzymałości krótkotrwałej nie ma.
WYLACZNIK = "sw-cb-abb-vd4-12kv-630a"
BEZPIECZNIK = "sw-fuse-eti-vv-12kv-63a"
#: Pozycja katalogu WYTRZYMAŁOŚCI (ręczne wskazanie w konfiguracji stacji).
APARAT_KONFIGURACJI = "wstd_breaker_vacuum_15_25"


def _enm(*, aparaty: dict[str, str] | None = None) -> EnergyNetworkModel:
    """Stacja z dwoma polami SN; ``aparaty`` = pole → pozycja katalogu APARAT_SN."""
    przypisania = aparaty if aparaty is not None else {"pole/in": WYLACZNIK, "pole/tr": WYLACZNIK}
    branches: list[SwitchBranch] = []
    for indeks, (pole_ref, catalog_ref) in enumerate(sorted(przypisania.items())):
        branches.append(
            SwitchBranch(
                ref_id=f"aparat/{indeks:02d}",
                name=f"Aparat pola SN {indeks + 1}",
                type="breaker",
                from_bus_ref="sn",
                to_bus_ref=f"zacisk/{indeks:02d}",
                catalog_ref=catalog_ref,
                catalog_namespace="APARAT_SN",
                meta={"station_ref": "stn", "bay_ref": pole_ref},
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[Bus(ref_id="sn", name="SN", voltage_kv=15.0)],
        branches=branches,
        substations=[
            Substation(
                ref_id="stn",
                name="Stacja Sady",
                station_type="mv_lv",
                bus_refs=["sn"],
                meta={
                    "field_specs": [
                        {
                            "field_ref": "pole/in",
                            "name": "P-01",
                            "bay_role": "IN",
                            "bus_ref": "sn",
                        },
                        {
                            "field_ref": "pole/tr",
                            "name": "P-02",
                            "bay_role": "TR",
                            "bus_ref": "sn",
                        },
                    ]
                },
            )
        ],
    )


def _widok(**kwargs: Any) -> dict[str, Any]:
    parametry: dict[str, Any] = {
        "enm": _enm(),
        "station_ref": "stn",
        "i_peak_ka": 12.0,
        "i_thermal_ka": 5.0,
    }
    parametry.update(kwargs)
    return zbuduj_widok_wytrzymalosci_aparatury(**parametry)


def test_stacja_bez_konfiguracji_daje_werdykty_dla_wszystkich_pol_z_modelu() -> None:
    """SEDNO KARTY: zero ręcznej konfiguracji, a werdykt jest dla KAŻDEGO pola."""
    widok = _widok()

    assert widok["status"] == "OK"
    assert widok["stacja_nazwa"] == "Stacja Sady"
    assert [p["pole"] for p in widok["pola"]] == ["P-01", "P-02"]
    assert {p["zrodlo"] for p in widok["pola"]} == {ZRODLO_MODEL}
    assert [p["aparat_catalog_ref"] for p in widok["pola"]] == [WYLACZNIK, WYLACZNIK]
    assert [p["rola_pl"] for p in widok["pola"]] == ["liniowe dopływowe", "transformatorowe"]


def test_werdykt_dynamiczny_powstaje_z_pozycji_katalogu_aparat_sn() -> None:
    """I_dyn = 2,5 · Icw (20 kA) = 50 kA ⇒ prąd udarowy 12 kA mieści się."""
    pole = _widok()["pola"][0]

    assert pole["znamiona"]["i_th_ka"] == 20.0
    assert pole["znamiona"]["i_th_pochodzenie"] == "producent"
    assert pole["znamiona"]["i_dyn_ka"] == 50.0
    assert pole["znamiona"]["i_dyn_pochodzenie"] == "derived_iec62271"
    assert pole["werdykt"]["i_dyn_ok"] is True


def test_bez_czasu_wylaczenia_kryterium_cieplne_zostaje_nierozstrzygniete() -> None:
    """Brak czasu to NIE jest werdykt negatywny — to brak podstawy.

    Kryterium dynamiczne czasu nie potrzebuje i musi być rozstrzygnięte mimo to
    (inaczej brak jednej danej wygaszałby ocenę, którą da się zrobić).
    """
    pole = _widok()["pola"][0]

    assert pole["czas_wylaczenia"]["t_clearing_s"] is None
    assert pole["werdykt"]["i_th_ok"] is None
    assert pole["werdykt"]["ok"] is False
    assert "NIEUSTALONE" in pole["werdykt"]["message_pl"]
    assert "aparatura.czas_wylaczenia_nieustalony" in pole["kody_gotowosci"]


def test_zapisana_konfiguracja_ma_pierwszenstwo_i_jest_tak_oznaczona() -> None:
    """Inżynier, który wskazał aparat ręcznie, dostaje SWÓJ aparat, nie modelowy."""
    widok = _widok(
        bay_device_withstand={
            "P-01": {
                "device_id": APARAT_KONFIGURACJI,
                "i_peak_calculated_ka": 1.0,
                "i_thermal_calculated_ka": 1.0,
                "t_clearing_s": 0.5,
            }
        }
    )

    pierwsze, drugie = widok["pola"]
    assert pierwsze["pole"] == "P-01"
    assert pierwsze["zrodlo"] == ZRODLO_KONFIGURACJA
    assert pierwsze["aparat_catalog_ref"] == APARAT_KONFIGURACJI
    assert pierwsze["czas_wylaczenia"]["t_clearing_s"] == 0.5
    # Czas z konfiguracji domyka kryterium cieplne.
    assert pierwsze["werdykt"]["i_th_ok"] is True
    # Pole nieskonfigurowane nadal jedzie z modelu — konfiguracja nie wygasza reszty.
    assert drugie["zrodlo"] == ZRODLO_MODEL


def test_pozycja_bez_znamion_wytrzymalosci_daje_nieustalone_a_nie_negatywny() -> None:
    """Bezpiecznik bez Icw: brak podstawy do oceny, nie „nie wytrzymuje"."""
    widok = _widok(enm=_enm(aparaty={"pole/in": BEZPIECZNIK}))
    pole = widok["pola"][0]

    assert pole["znamiona"]["i_th_ka"] is None
    assert pole["znamiona"]["i_dyn_ka"] is None
    assert pole["werdykt"]["i_dyn_ok"] is None
    assert pole["werdykt"]["i_th_ok"] is None
    assert "NIEUSTALONE" in pole["werdykt"]["message_pl"]
    assert READINESS_POZYCJA_BEZ_ZNAMION in pole["kody_gotowosci"]


def test_przekroczenie_wytrzymalosci_dynamicznej_jest_blokerem() -> None:
    """Prąd udarowy 60 kA > I_dyn 50 kA ⇒ jawny bloker z liczbami."""
    pole = _widok(i_peak_ka=60.0)["pola"][0]

    assert pole["werdykt"]["i_dyn_ok"] is False
    assert pole["werdykt"]["ok"] is False
    assert "BLOKER" in pole["werdykt"]["message_pl"]


def test_brak_pradow_biegu_to_uczciwy_brak_podstawy() -> None:
    widok = _widok(i_peak_ka=None)

    assert widok["status"] == "brak danych"
    assert widok["pola"] == []
    assert widok["kody_gotowosci"] == [READINESS_BRAK_PRADOW]


def test_nieznana_stacja_nie_udaje_pustej_stacji() -> None:
    widok = _widok(station_ref="nieistnieje")

    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == [READINESS_STACJA_NIEZNANA]


def test_wpis_konfiguracji_bez_odpowiednika_w_modelu_nie_znika() -> None:
    """Świadomy zapis inżyniera zostaje widoczny, nawet gdy nie pasuje do pola."""
    widok = _widok(
        bay_device_withstand={
            "P-99": {
                "device_id": APARAT_KONFIGURACJI,
                "i_peak_calculated_ka": 1.0,
                "i_thermal_calculated_ka": 1.0,
                "t_clearing_s": 1.0,
            }
        }
    )

    osierocone = [p for p in widok["pola"] if p["pole"] == "P-99"]
    assert len(osierocone) == 1
    assert osierocone[0]["zrodlo"] == ZRODLO_KONFIGURACJA
    assert osierocone[0]["pole_ref"] is None


def test_widok_jest_deterministyczny() -> None:
    assert _widok() == _widok()
