"""Scena GEOMETRII STACJI (karta K3 GEOMETRIA-STACJI) — JEDEN budowniczy fikstury frontu
(`scripts/eksport_fixtur_harnessu.py`, fikstury `geometria_stacji_*`) i testów sceny SLD.

Sieć powstaje wyłącznie operacjami domenowymi (`execute_domain_operation`), tymi samymi, którymi
ziarno e2e `frontend/e2e/siecKadrowStacji.ts` buduje sieć kadrów stacji, uzupełnioną o stację
przelotową — dzięki temu scena niesie po jednej stacji KAŻDEGO rodzaju z topologii
(`enm/rodzaj_stacji.py`):

* „Stacja Odgałęźna" — wcięta w Odcinek 1, pola IN, OUT, FEEDER, FEEDER (R2: ≥ 3 pola liniowe);
* „Stacja Przelotowa" — wcięta w Odcinek 2, pola IN, OUT, oba prowadzą do sąsiadów (R3);
* „Stacja Sekcyjna" — wcięta w Odcinek 3, typ D: dwie szyny sekcji i gałąź sprzęgła (R1);
* „Stacja Końcowa" — na końcu ciągu, pola LINIA_IN i LINIA_OUT, drugie pole wolne (R3 → końcowa);
* „Stacja Końcowa odgałęzienia" — na końcu odgałęzienia z drugiego pola FEEDER stacji
  odgałęźnej, jedno pole liniowe (R4); pole odgałęźne niesie cel odpływu
  (`outgoing_destination_ref` = ta stacja).

Warianty (iloczyn cech karty: stan sprzęgła × aparat {z modelu, brak}):

* ``zamkniete`` — sieć jak zbudowana: sprzęgło zamknięte, każde pole SN stacji ma aparat
  z katalogu (gałąź łączeniowa w `Bay.equipment_refs`, B-12);
* ``otwarte`` — sprzęgło stacji sekcyjnej otwarte istniejącą operacją domenową
  `set_normal_open_point` (operacji łączeniowych nie dopisujemy — to zakres W5-C);
* ``bez_wyposazenia`` — model zastany, w którym pola SN stacji nie mają powiązanych rekordów
  aparatów (`equipment_refs` puste); gałęzie łączeniowe zostają w modelu (topologia bez zmian),
  ale żadne pole ich nie wskazuje — przypadek „brak danych wyposażenia pola".

Scena GPZ ``gpz_110kv`` (cecha „GPZ: szyna WN z szyn modelu"): GPZ z równoważnikiem sieci po
stronie 110 kV, dwiema sekcjami SN ze sprzęgłem i dwoma transformatorami 110/15 kV na WSPÓLNEJ
szynie WN (TR1 → sekcja 1, TR2 → sekcja 2) — jedyny kształt, w którym operacja
`add_grid_source_sn` tworzy transformatory GPZ (karta GPZ-MODEL). Dawną fiksturą tej cechy był
GPZ z równoważnikiem na szynach SN i dwoma transformatorami do DWÓCH martwych szyn 110 kV —
model, którego backend już nie wytwarza (archiwum takiego modelu blokuje walidator, E066).
"""

from __future__ import annotations

import copy
from typing import Any

from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

from tests.reference_networks.sceny_zajetosci_pol import APARAT, TRAFO, _gpz, odcinek, ok, op

WARIANTY = ("zamkniete", "otwarte", "bez_wyposazenia")

#: Równoważnik sieci 110 kV i transformator WN/SN GPZ sceny ``gpz_110kv`` (pozycje katalogu
#: jak w substracie 52 stacji).
ZRODLO_110KV: dict[str, Any] = {
    "short_circuit_input_side": "HV_110",
    "hv_voltage_kv": 110.0,
    "sk3_hv_mva": 3000.0,
    "rx_ratio": 0.1,
}
TRAFO_WN_SN = "tr-wn-sn-110-15-25mva-yd11"


def _kable(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in enm["branches"] if b.get("type") == "cable"]


def _kabel(enm: dict[str, Any], nazwa: str) -> dict[str, Any]:
    return next(b for b in _kable(enm) if b.get("name") == nazwa)


def _stacja(enm: dict[str, Any], nazwa: str) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("name") == nazwa)


def _wstaw(enm: dict[str, Any], odcinek_nazwa: str, typ: str, nazwa: str, pola: list[str] | None):
    payload: dict[str, Any] = {
        "segment_ref": _kabel(enm, odcinek_nazwa)["ref_id"],
        "field_apparatus_catalog_ref": APARAT,
        "station_type": typ,
        "insert_at": {"value": 0.5},
        "station": {"name": nazwa, "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
        "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
    }
    if pola is not None:
        payload["sn_fields"] = pola
    return ok(op(enm, "insert_station_on_segment_sn", payload))


def _dolacz(enm: dict[str, Any], koniec: str, nazwa: str, typ: str, role: list[str]):
    return ok(
        op(
            enm,
            "append_station_on_endpoint",
            {
                "endpoint_bus_ref": koniec,
                "station": {"name": nazwa, "station_type": typ},
                "field_apparatus_catalog_ref": APARAT,
                "transformer": {"transformer_catalog_ref": TRAFO},
                "nn_voltage_kv": 0.4,
                "sn_fields": [{"field_role": rola} for rola in role],
            },
        )
    )


def zbuduj_siec() -> dict[str, Any]:
    """Sieć wariantu ``zamkniete`` (patrz docstring modułu)."""
    enm = _gpz(z_zaciskami=True, sekcje=1)
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    pole_gpz = next(
        b["ref_id"]
        for b in enm.get("bays") or []
        if b.get("substation_ref") == gpz["ref_id"] and b.get("bay_role") == "OUT"
    )
    enm = ok(
        op(
            enm,
            "continue_trunk_segment_sn",
            {"field_ref": pole_gpz, "segment": odcinek(500, "Odcinek 1")},
        )
    )
    for n in (2, 3):
        enm = ok(op(enm, "continue_trunk_segment_sn", {"segment": odcinek(500, f"Odcinek {n}")}))
    enm = _wstaw(enm, "Odcinek 1", "B", "Stacja Odgałęźna", ["IN", "OUT", "FEEDER", "FEEDER"])
    enm = _wstaw(enm, "Odcinek 2", "B", "Stacja Przelotowa", ["IN", "OUT"])
    enm = _wstaw(enm, "Odcinek 3", "D", "Stacja Sekcyjna", None)
    koniec_ciagu = str(_kabel(enm, "Odcinek 3 (2)")["to_bus_ref"])
    enm = _dolacz(enm, koniec_ciagu, "Stacja Końcowa", "terminal", ["LINIA_IN", "LINIA_OUT"])
    odgalezna = _stacja(enm, "Stacja Odgałęźna")
    pola_odgalezne = [
        b["ref_id"]
        for b in enm.get("bays") or []
        if b.get("substation_ref") == odgalezna["ref_id"] and b.get("bay_role") == "FEEDER"
    ]
    assert len(pola_odgalezne) == 2, pola_odgalezne
    enm = ok(
        op(
            enm,
            "start_branch_segment_sn",
            {"from_ref": f"{pola_odgalezne[1]}.BRANCH", "segment": odcinek(400, "Odgałęzienie 1")},
        )
    )
    koniec_odgalezienia = str(_kabel(enm, "Odgałęzienie 1")["to_bus_ref"])
    enm = _dolacz(enm, koniec_odgalezienia, "Stacja Końcowa odgałęzienia", "branch", ["LINIA_IN"])
    # Cel odpływu pola odgałęźnego zadeklarowany w modelu (`Bay.outgoing_destination_ref`,
    # istniejąca operacja opisu pola) — rysunek kończy odpływ nazwą celu (§0 pkt 5 karty).
    return ok(
        op(
            enm,
            "update_element_parameters",
            {
                "element_ref": pola_odgalezne[1],
                "parameters": {
                    "outgoing_destination_ref": _stacja(enm, "Stacja Końcowa odgałęzienia")[
                        "ref_id"
                    ]
                },
            },
        )
    )


def sprzeglo_stacji_sekcyjnej(enm: dict[str, Any]) -> dict[str, Any]:
    """Gałąź `bus_coupler` łącząca szyny sekcji stacji sekcyjnej."""
    szyny = set(_stacja(enm, "Stacja Sekcyjna").get("bus_refs") or [])
    return next(
        b
        for b in enm["branches"]
        if b.get("type") == "bus_coupler"
        and b.get("from_bus_ref") in szyny
        and b.get("to_bus_ref") in szyny
    )


def zbuduj_wariant(wariant: str) -> dict[str, Any]:
    if wariant not in WARIANTY:
        raise ValueError(f"nieznany wariant sceny geometrii stacji: {wariant}")
    enm = zbuduj_siec()
    if wariant == "otwarte":
        enm = ok(
            op(
                enm,
                "set_normal_open_point",
                {"switch_ref": sprzeglo_stacji_sekcyjnej(enm)["ref_id"]},
            )
        )
    elif wariant == "bez_wyposazenia":
        enm = copy.deepcopy(enm)
        stacje_sn = {s["ref_id"] for s in enm["substations"] if s.get("station_type") != "gpz"}
        for pole in enm.get("bays") or []:
            if pole.get("substation_ref") in stacje_sn:
                pole["equipment_refs"] = []
                pole.pop("primary_devices", None)
    return enm


def zbuduj_gpz_110kv() -> dict[str, Any]:
    """GPZ 110/15 kV: równoważnik 110 kV na wspólnej szynie WN, dwie sekcje SN ze sprzęgłem,
    dwa transformatory 110/15 kV (TR1 → sekcja 1, TR2 → sekcja 2), po dwa pola liniowe na
    sekcję z aparatem z katalogu."""
    pusty = EnergyNetworkModel(header=ENMHeader(name="GEOMETRIA-GPZ", defaults=ENMDefaults()))
    return ok(
        op(
            pusty.model_dump(mode="json"),
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "manual_equivalent": dict(ZRODLO_110KV),
                "sections_count": 2,
                "transformer_count": 2,
                "transformer_catalog_ref": TRAFO_WN_SN,
                "line_fields_per_section": 2,
                "gpz_line_field_apparatus": {"catalog_ref": APARAT},
            },
        )
    )
