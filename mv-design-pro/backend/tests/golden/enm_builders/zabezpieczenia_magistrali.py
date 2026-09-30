"""Sieć złota G08: magistrala SN z dwoma stopniami zabezpieczeń nadprądowych Z MODELU.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (decyzja D-21): urządzenia i nastawy zabezpieczeń żyją w
modelu. Ta sieć niesie REALNE przypisania zabezpieczeń zapisane WYŁĄCZNIE operacjami
domenowymi — tymi samymi, które woła ścieżka projektanta (``POST /api/cases/{id}/enm/
domain-ops``): wyłącznik liniowy (``insert_section_switch_sn``, ``switch_type="WYLACZNIK"``),
przekładnik prądowy z katalogu przy wyłączniku (``add_ct`` z ``breaker_ref``), przekaźnik
z katalogu z nastawami (``add_relay`` z ``settings``). Zero ręcznego JSON-u zabezpieczeń.

Kształt: GPZ 110/15 kV (250 MVA) → kabel 900 m → Stacja S01 (SN/nN) → kabel → Stacja S02
(SN/nN), odbiory 250 kW na szynach nN obu stacji. Dwa wyłączniki liniowe z zabezpieczeniem:

* Q1 „Wyłącznik pola liniowego GPZ" — na początku odcinka zasilającego (2 % długości od
  GPZ); strefa obejmuje obie stacje,
* Q2 „Wyłącznik odejścia S01" — na początku odcinka S01 → S02; strefa to Stacja S02.

Przekładniki 600/5 A klasy 5P20 (pozycja katalogu ``ct_600_5_5p20_15va_schneider``),
przekaźniki ``REF-OC-200`` (profil referencyjny D-33, zakresy w krotności prądu znamionowego
wejścia przekaźnika). Nastawy — dana projektowa sceny, w zakresach katalogu:

* Q1: I> 2,0 A wtórne (240 A pierwotne), IEC SI, TMS 0,3; I>> 20 A wtórne (2400 A), DT 0,4 s,
* Q2: I> 1,5 A wtórne (180 A pierwotne), IEC SI, TMS 0,1; I>> 15 A wtórne (1800 A), DT 0,1 s.

Wyrocznia NORMATYWNA (rodzina PROTECTION): czasy zadziałania zgodne z wzorem IEC 60255-151
t = TMS·0,14/(M^0,02 − 1) dla prądu przekaźnika z biegu — przypięte w
``tests/application/analyses/protection/test_bieg_zabezpieczen_siec_zlota.py``.
"""

from __future__ import annotations

from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMHeader

KATALOG_KABLA = "cable-tfk-yakxs-3x120"
KATALOG_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
KATALOG_ZRODLA = "src-gpz-15kv-250mva-rx010"
KATALOG_APARATU = "sw-cb-abb-vd4-17kv-630a"
KATALOG_PRZEKLADNIKA = "ct_600_5_5p20_15va_schneider"
KATALOG_PRZEKAZNIKA = "REF-OC-200"

#: Odbiory stacji — dane wejściowe projektu (stacja miejska 630 kVA obciążona w ~40 %).
MOC_ODBIORU_STACJI_KW = 250.0
COS_PHI_ODBIORU_STACJI = 0.95

#: Położenie wyłącznika liniowego na odcinku (ułamek długości od strony zasilania).
POLOZENIE_WYLACZNIKA = 0.02

NAZWA_Q1 = "Wyłącznik pola liniowego GPZ"
NAZWA_Q2 = "Wyłącznik odejścia S01"
NAZWA_ZABEZPIECZENIA_Q1 = "Zabezpieczenie pola liniowego GPZ"
NAZWA_ZABEZPIECZENIA_Q2 = "Zabezpieczenie odejścia S01"

NASTAWY_Q1: list[dict[str, Any]] = [
    {
        "function_type": "overcurrent_51",
        "threshold_a": 2.0,
        "threshold_unit": "A_WTORNY",
        "curve_type": "IEC_SI",
        "time_multiplier": 0.3,
    },
    {
        "function_type": "overcurrent_50",
        "threshold_a": 20.0,
        "threshold_unit": "A_WTORNY",
        "curve_type": "DT",
        "time_delay_s": 0.4,
    },
]
NASTAWY_Q2: list[dict[str, Any]] = [
    {
        "function_type": "overcurrent_51",
        "threshold_a": 1.5,
        "threshold_unit": "A_WTORNY",
        "curve_type": "IEC_SI",
        "time_multiplier": 0.1,
    },
    {
        "function_type": "overcurrent_50",
        "threshold_a": 15.0,
        "threshold_unit": "A_WTORNY",
        "curve_type": "DT",
        "time_delay_s": 0.1,
    },
]


class BladBudowySieci(RuntimeError):
    """Operacja domenowa budowy sieci złotej odmówiła — sieć nie powstaje częściowo."""


def operacja(enm: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Jedna operacja domenowa (ta sama funkcja co końcówka ``/enm/domain-ops``) — odmowa
    kończy budowę wyjątkiem z kodem i treścią błędu, nigdy cichym pominięciem kroku."""
    wynik = execute_domain_operation(enm, nazwa, payload)
    if wynik.get("error") is not None:
        raise BladBudowySieci(f"operacja {nazwa}: {wynik['error']}")
    migawka = wynik.get("snapshot")
    if not isinstance(migawka, dict):
        raise BladBudowySieci(f"operacja {nazwa} nie zwróciła migawki modelu")
    return migawka


def siec_magistrali() -> tuple[dict[str, Any], str, str]:
    """Magistrala GPZ → S01 → S02 bez zabezpieczeń + ``(odcinek GPZ→S01, odcinek S01→S02)``.

    Układ sieci nN (``lv_earthing_system``) transformatorów SN/nN deklarowany jawnie — walidator
    odmawia biegu bez tej deklaracji (E063), a operacja wstawienia stacji jej nie zgaduje.
    """
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Magistrala SN z zabezpieczeniami nadprądowymi")
    ).model_dump(mode="json")
    enm = operacja(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ Wschód",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": KATALOG_ZRODLA,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    enm = operacja(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 900,
                "name": "Magistrala GPZ",
                "catalog_ref": KATALOG_KABLA,
            }
        },
    )
    segment = [g["ref_id"] for g in enm["branches"] if g.get("type") in ("cable", "line_overhead")][
        -1
    ]
    stacja: dict[str, Any] = {
        "field_apparatus_catalog_ref": KATALOG_APARATU,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "sn_fields": [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
        "transformer": {"create": True, "transformer_catalog_ref": KATALOG_TRAFO},
        "nn_block": {"outgoing_feeders_nn_count": 1},
    }
    for odcinek, nazwa_stacji in ((segment, "Stacja S01"), (f"{segment}_R", "Stacja S02")):
        enm = operacja(
            enm,
            "insert_station_on_segment_sn",
            {
                **stacja,
                "segment_id": odcinek,
                "station": {
                    "station_type": "B",
                    "station_name": nazwa_stacji,
                    "sn_voltage_kv": 15.0,
                    "nn_voltage_kv": 0.4,
                },
            },
        )
    for szyna_nn in sorted(s["ref_id"] for s in enm["buses"] if s["ref_id"].endswith("/nn_bus")):
        enm = operacja(
            enm,
            "add_load_sn",
            {
                "bus_ref": szyna_nn,
                "name": "Odbiór stacji",
                "active_power_kw": MOC_ODBIORU_STACJI_KW,
                "cos_phi": COS_PHI_ODBIORU_STACJI,
            },
        )
    for transformator in enm["transformers"]:
        if transformator.get("ulv_kv", 1.0) < 1.0 and transformator.get("lv_earthing_system") is None:
            transformator["lv_earthing_system"] = "TN-C-S"
    return enm, f"{segment}_L", f"{segment}_R_L"


def dodaj_zabezpieczenie_nadpradowe(
    enm: dict[str, Any],
    *,
    odcinek_ref: str,
    nazwa_wylacznika: str,
    nazwa_zabezpieczenia: str,
    nastawy: list[dict[str, Any]],
) -> tuple[dict[str, Any], str, str]:
    """Wyłącznik liniowy + przekładnik + przekaźnik z nastawami — trzy operacje domenowe.

    Zwraca ``(migawka, ref wyłącznika, ref zabezpieczenia)``. Identyfikatory przekładnika i
    zabezpieczenia pochodzą z odpowiedzi operacji (``selection_hint``), wyłącznika — z różnicy
    zbioru wyłączników przed i po wstawieniu (dokładnie jeden nowy, inaczej odmowa).
    """
    przed = {g["ref_id"] for g in enm["branches"]}
    enm = operacja(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek_ref,
            "insert_at": {"mode": "RATIO", "value": POLOZENIE_WYLACZNIKA},
            "switch_type": "WYLACZNIK",
            "catalog_ref": KATALOG_APARATU,
            "switch_name": nazwa_wylacznika,
        },
    )
    nowe_laczniki = [
        g["ref_id"] for g in enm["branches"] if g["ref_id"] not in przed and g.get("type") == "breaker"
    ]
    if len(nowe_laczniki) != 1:
        raise BladBudowySieci(
            f"wstawienie wyłącznika liniowego dało {len(nowe_laczniki)} nowych wyłączników"
        )
    wylacznik = nowe_laczniki[0]
    wynik_ct = execute_domain_operation(
        enm,
        "add_ct",
        {
            "breaker_ref": wylacznik,
            "catalog_ref": KATALOG_PRZEKLADNIKA,
            "ratio_primary_a": 600.0,
            "ratio_secondary_a": 5.0,
            "accuracy_class": "5P20",
            "burden_va": 15.0,
            "name": f"Przekładnik prądowy — {nazwa_wylacznika}",
        },
    )
    if wynik_ct.get("error") is not None:
        raise BladBudowySieci(f"operacja add_ct: {wynik_ct['error']}")
    enm = wynik_ct["snapshot"]
    wynik_zab = execute_domain_operation(
        enm,
        "add_relay",
        {
            "breaker_ref": wylacznik,
            "ct_ref": wynik_ct["selection_hint"]["element_id"],
            "relay_type": "NADPRADOWY",
            "catalog_ref": KATALOG_PRZEKAZNIKA,
            "name": nazwa_zabezpieczenia,
            "settings": nastawy,
        },
    )
    if wynik_zab.get("error") is not None:
        raise BladBudowySieci(f"operacja add_relay: {wynik_zab['error']}")
    zabezpieczenie = wynik_zab["selection_hint"]["element_id"]
    if not any(
        p["ref_id"] == zabezpieczenie for p in wynik_zab["snapshot"]["protection_assignments"]
    ):
        raise BladBudowySieci("operacja add_relay nie zapisała przypisania zabezpieczenia")
    return wynik_zab["snapshot"], wylacznik, zabezpieczenie


def build_zabezpieczenia_magistrali_enm() -> EnergyNetworkModel:
    """Sieć G08 z dwoma zabezpieczeniami nadprądowymi zapisanymi operacjami domenowymi."""
    enm, odcinek_gpz, odcinek_s01 = siec_magistrali()
    enm, _q1, _z1 = dodaj_zabezpieczenie_nadpradowe(
        enm,
        odcinek_ref=odcinek_gpz,
        nazwa_wylacznika=NAZWA_Q1,
        nazwa_zabezpieczenia=NAZWA_ZABEZPIECZENIA_Q1,
        nastawy=NASTAWY_Q1,
    )
    enm, _q2, _z2 = dodaj_zabezpieczenie_nadpradowe(
        enm,
        odcinek_ref=odcinek_s01,
        nazwa_wylacznika=NAZWA_Q2,
        nazwa_zabezpieczenia=NAZWA_ZABEZPIECZENIA_Q2,
        nastawy=NASTAWY_Q2,
    )
    return EnergyNetworkModel.model_validate(enm)
