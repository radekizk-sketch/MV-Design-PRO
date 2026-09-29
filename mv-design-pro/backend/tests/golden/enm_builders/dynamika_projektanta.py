"""Sieć toku pracy dynamiki czasowej projektanta (karta AB-P1) — JEDNO źródło dla testu HTTP
toku (`tests/api/test_dynamika_api.py`), testu uczciwości biegu i scen harnessu
(`scripts/eksport_fixtur_harnessu.py`, fixtury `dynamika_scena_*`). Spec e2e
`frontend/e2e/dynamika-rms-flow.spec.ts` buduje TĘ SAMĄ sieć tymi samymi operacjami przez HTTP.

Sieć powstaje WYŁĄCZNIE kanonicznymi operacjami domenowymi — tak, jak buduje ją projektant
w kreatorach, każdy element z wiązaniem katalogowym (zero referencji spoza katalogu):

* GPZ 110/15 kV (`add_grid_source_sn`, źródło z katalogu `ZRODLO_SN`);
* magistrala kablowa z dwóch odcinków po 2 km (`continue_trunk_segment_sn`, kabel z katalogu);
* stacja SN/nN typu B na pierwszym odcinku (`insert_station_on_segment_sn`, transformator
  15/0,8 kV z katalogu) z zadeklarowanym układem uziemienia sieci nN (`TN-C`, decyzja
  projektanta wymagana przed obliczeniami — kod gotowości E063);
* instalacja PV na szynie nN stacji (`add_converter_source`, karta falownika z katalogu);
* odbiór 0,5 MW / 0,1 Mvar na końcu magistrali (`add_load_sn`).

Zwarcie w „Odcinek 2" w x = 0,5 usunięte izolacją odcina koniec magistrali z odbiorem
(skutek topologiczny osi zdarzeń), a PV zostaje zasilone od GPZ. `z_modelem_pv` wiąże profil
`default_pv_gfl` kanoniczną operacją `set_der_catalog_bindings`, `z_modelem_odbioru` — profil
modelu dynamicznego odbioru `load_dyn_zagregowany_sn` operacją `set_load_dynamic_binding`
(karta modeli odbiorów: model wymagany dla KAŻDEGO odbioru). Wariant bez modeli to stan
wejścia ekranu dynamiki z dwiema akcjami naprawczymi (`der.dynamika_missing`,
`load.dynamika_missing`).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel

#: Profil katalogowy modelu dynamicznego PV wiązany w wariancie „z modelami".
PROFIL_PV = "default_pv_gfl"
#: Profil katalogowy modelu dynamicznego odbioru wiązany w wariancie „z modelami".
PROFIL_ODBIORU = "load_dyn_zagregowany_sn"
#: Nazwy nadawane przez operacje (kreatory) — asercje po NAZWACH, nie identyfikatorach.
NAZWA_PV = "Blok PV"
NAZWA_ODBIORU = "Odbiór"
NAZWA_ODCINKA_ZWARCIA = "Odcinek 2"
NAZWA_KONCA_MAGISTRALI = "Zacisk końcowy Odcinek 2"
#: Detektor zapadu napięcia szyny, do której przyłączone jest PV (bez działania na sieć).
NAZWA_DETEKTORA_ZAPADU = "Zapad napięcia szyny PV"
PROG_DETEKTORA_ZAPADU_PU = 0.8
WERSJA_KATALOGU = "2024.1"


def _wiazanie(przestrzen: str, pozycja: str) -> dict[str, str]:
    return {
        "catalog_namespace": przestrzen,
        "catalog_item_id": pozycja,
        "catalog_item_version": WERSJA_KATALOGU,
    }


def _pusty_model() -> dict[str, Any]:
    return EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Sieć toku pracy dynamiki",
                "enm_version": "1.0",
                "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "revision": 1,
                "hash_sha256": "",
            }
        }
    ).model_dump(mode="json")


def _ustal_tozsamosc(enm: dict[str, Any]) -> dict[str, Any]:
    """Postać deterministyczna sieci: operacje nadają elementom losowe `id` (uuid4) i część
    kolekcji porządkuje po nich — `id` wyprowadzane z `ref_id` (uuid5), kolekcje w porządku
    `ref_id`, znaczniki czasu nagłówka stałe. Tożsamość domenowa (`ref_id`) i fizyka bez zmian;
    to samo wejście daje tę samą migawkę (fixtury harnessu, odciski biegu)."""
    wynik = dict(enm)
    for klucz, wartosc in enm.items():
        if not isinstance(wartosc, list) or not all(
            isinstance(e, dict) and isinstance(e.get("ref_id"), str) for e in wartosc
        ):
            continue
        elementy = []
        for element in sorted(wartosc, key=lambda e: e["ref_id"]):
            kopia = dict(element)
            kopia["id"] = str(
                uuid.uuid5(uuid.NAMESPACE_URL, f"dynamika-projektanta:{kopia['ref_id']}")
            )
            elementy.append(kopia)
        wynik[klucz] = elementy
    naglowek = dict(wynik["header"])
    naglowek["created_at"] = naglowek["updated_at"] = "2026-01-01T00:00:00Z"
    wynik["header"] = naglowek
    return wynik


def _op(enm: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm, nazwa, payload)
    if wynik.get("error") is not None:
        raise RuntimeError(f"Operacja {nazwa} odrzucona: {wynik['error']}")
    return dict(wynik["snapshot"])


@dataclass(frozen=True)
class RefySieci:
    """Identyfikatory elementów sieci (wyprowadzone z migawki po NAZWACH)."""

    pv: str
    szyna_pv: str
    odcinek_zwarcia: str
    koniec_magistrali: str
    odbior: str


def refy_sieci(enm: dict[str, Any]) -> RefySieci:
    pv = next(g for g in enm["generators"] if g.get("name") == NAZWA_PV)
    return RefySieci(
        odbior=next(o["ref_id"] for o in enm["loads"] if o.get("name") == NAZWA_ODBIORU),
        pv=pv["ref_id"],
        szyna_pv=pv["bus_ref"],
        odcinek_zwarcia=next(
            b["ref_id"] for b in enm["branches"] if b.get("name") == NAZWA_ODCINKA_ZWARCIA
        ),
        koniec_magistrali=next(
            b["ref_id"] for b in enm["buses"] if b.get("name") == NAZWA_KONCA_MAGISTRALI
        ),
    )


def build_dynamika_projektanta_enm(*, z_modelem_pv: bool, z_modelem_odbioru: bool) -> dict[str, Any]:
    """Sieć toku pracy dynamiki (patrz docstring modułu) jako słownik ENM."""
    enm = _op(
        _pusty_model(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _wiazanie("ZRODLO_SN", "src-gpz-15kv-250mva-rx010"),
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    for nazwa in ("Odcinek 1", NAZWA_ODCINKA_ZWARCIA):
        enm = _op(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 2000,
                    "name": nazwa,
                    "catalog_binding": _wiazanie("KABEL_SN", "cable-tfk-yakxs-3x120"),
                }
            },
        )
    odcinki = enm["corridors"][0]["ordered_segment_refs"]
    enm = _op(
        enm,
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "segment_id": odcinki[0],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.8},
            "sn_fields": ["IN", "OUT", "FEEDER", "TR"],
            "transformer": {
                "create": True,
                "catalog_binding": _wiazanie("TRAFO_SN_NN", "tr-sn-nn-15-0p8-1mva-dyn11-inverter"),
            },
        },
    )
    stacja = next(
        s["ref_id"] for s in enm["substations"] if (s.get("station_type") or "").lower() != "gpz"
    )
    szyna_nn = next(b["ref_id"] for b in enm["buses"] if 0.0 < b["voltage_kv"] < 1.0)
    transformator = next(t["ref_id"] for t in enm["transformers"] if t["ref_id"].startswith("stn/"))
    enm = _op(
        enm,
        "update_element_parameters",
        {"element_ref": transformator, "parameters": {"lv_earthing_system": "TN-C"}},
    )
    enm = _op(
        enm,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": stacja,
            "bus_nn_ref": szyna_nn,
            "catalog_binding": _wiazanie("ZRODLO_NN_PV", "conv-pv-card-huawei-sun2000-215ktl"),
            "quantity": 1,
        },
    )
    koniec = next(b["ref_id"] for b in enm["buses"] if b.get("name") == NAZWA_KONCA_MAGISTRALI)
    enm = _op(enm, "add_load_sn", {"bus_ref": koniec, "p_mw": 0.5, "q_mvar": 0.1})
    if z_modelem_pv:
        enm = _op(
            enm,
            "set_der_catalog_bindings",
            {"generator_ref": refy_sieci(enm).pv, "dynamic_model_ref": PROFIL_PV},
        )
    if z_modelem_odbioru:
        enm = _op(
            enm,
            "set_load_dynamic_binding",
            {"load_ref": refy_sieci(enm).odbior, "dynamic_model_ref": PROFIL_ODBIORU},
        )
    return _ustal_tozsamosc(enm)


def scenariusz_zwarcia_w_odcinku(
    odcinek_ref: str, *, szyna_detektora: str | None
) -> dict[str, Any]:
    """Zwarcie 3F w połowie odcinka (X_f = 1 Ω) usunięte IZOLACJĄ w 0,15 s i wyłączenie odcinka
    w tej samej chwili; horyzont 0,3 s, krok zapisu 0,02 s. Z `szyna_detektora` — detektor
    zapadu napięcia tej szyny poniżej `PROG_DETEKTORA_ZAPADU_PU` (bez działania na sieć; bieg
    wymaga wtedy nastawy `tolerancja_lokalizacji_zdarzen_s`)."""
    detektory = (
        [
            {
                "ident": NAZWA_DETEKTORA_ZAPADU,
                "wielkosc": {"rodzaj": "modul_napiecia", "bus_ref": szyna_detektora},
                "prog": PROG_DETEKTORA_ZAPADU_PU,
                "kierunek": "w_dol",
                "jednorazowy": False,
            }
        ]
        if szyna_detektora is not None
        else []
    )
    return {
        "detektory": detektory,
        "horyzont_s": 0.3,
        "krok_wyjscia_s": 0.02,
        "zdarzenia": [
            {
                "rodzaj": "zwarcie",
                "t_s": 0.05,
                "element_ref": odcinek_ref,
                "polozenie_wzgledne": 0.5,
                "typ": "3F",
                "r_f_ohm": 0.0,
                "x_f_ohm": 1.0,
                "t_usuniecia_s": 0.15,
                "sposob_usuniecia": "izolacja",
            },
            {"rodzaj": "wylaczenie_galezi", "t_s": 0.15, "element_ref": odcinek_ref},
        ],
    }


__all__ = [
    "NAZWA_DETEKTORA_ZAPADU",
    "NAZWA_KONCA_MAGISTRALI",
    "NAZWA_ODBIORU",
    "NAZWA_ODCINKA_ZWARCIA",
    "NAZWA_PV",
    "PROFIL_ODBIORU",
    "PROFIL_PV",
    "PROG_DETEKTORA_ZAPADU_PU",
    "RefySieci",
    "build_dynamika_projektanta_enm",
    "refy_sieci",
    "scenariusz_zwarcia_w_odcinku",
]
