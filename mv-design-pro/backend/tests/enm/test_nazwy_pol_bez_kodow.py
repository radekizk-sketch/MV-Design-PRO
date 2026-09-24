"""Karta #140: nazwa elementu i komunikat operacji nie niosą kodu maszynowego ani identyfikatora.

Po co: operacje stacji nadawały polom SN nazwy z kodu roli (`Pole LINIA_IN 1`, `Pole TR — …`),
komunikaty zawierały kod roli (`rola: LINIA_IN`) i surowy identyfikator pola, a szyny
transformatora niosły fragment identyfikatora (`TR 3c9f12ab`). Nazwa jest tekstem dla
projektanta — trafia na schemat, do drzewa i do zdań wyników (reguła 5 strażnika werdyktu
wykryła `Pole LINIA_OUT 2` w zdaniach ochrony od pracy wyspowej).

Iloczyn cech (KLASA, NIE INSTANCJA): rola pola {6 ról kanonicznych, ich aliasy modelu, pole
źródłowe, rola pusta, rola spoza kanonu} × miejsce nadania nazwy {wstawienie stacji w odcinek,
dołączenie stacji na końcu, komunikat braku aparatu, komunikat awarii wyposażenia pola, szyny
transformatora tworzone razem z nim} × warunek {brak kodu z podkreślnikiem, brak ciągu
szesnastkowego identyfikatora, nazwa równa nazwie z jednej mapy}.
"""

from __future__ import annotations

import copy
import re
from pathlib import Path
from typing import Any

import pytest
from enm.domain_operations import (
    NAZWA_ROLI_POLA_SN_PL,
    execute_domain_operation,
    nazwa_roli_pola_sn,
)

from tests.enm.test_station_field_apparatus_explicit import (
    APARAT_SN,
    _build_trunk_with_segment,
    _insert_payload,
)

#: Wzorzec kodu w tekście dla człowieka — ten sam co reguła 5 strażnika werdyktu.
_KOD = re.compile(r"\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b")
#: Ziarno albo fragment identyfikatora elementu (`_make_id`) w nazwie.
_IDENTYFIKATOR = re.compile(r"[0-9a-f]{8,}|[a-z]+/[0-9a-f]+")

_ROLE_KANONICZNE = sorted(NAZWA_ROLI_POLA_SN_PL)
_ALIASY_MODELU = {
    "IN": "LINIA_IN",
    "OUT": "LINIA_OUT",
    "FEEDER": "LINIA_ODG",
    "TR": "TRANSFORMATOROWE",
    "COUPLER": "SPRZEGLO",
    "MEASUREMENT": "POMIAROWE",
}


def _bez_kodow(tekst: str) -> None:
    assert not _KOD.search(tekst), tekst
    assert not _IDENTYFIKATOR.search(tekst), tekst
    for kod in [*_ROLE_KANONICZNE, *_ALIASY_MODELU]:
        assert not re.search(rf"\b{kod}\b", tekst), (kod, tekst)


@pytest.mark.parametrize("rola", _ROLE_KANONICZNE)
def test_nazwa_roli_kanonicznej_z_jednej_mapy(rola: str) -> None:
    assert nazwa_roli_pola_sn(rola) == NAZWA_ROLI_POLA_SN_PL[rola]
    _bez_kodow(nazwa_roli_pola_sn(rola))


@pytest.mark.parametrize(("alias", "rola"), sorted(_ALIASY_MODELU.items()))
def test_alias_roli_modelu_daje_nazwe_roli_kanonicznej(alias: str, rola: str) -> None:
    assert nazwa_roli_pola_sn(alias) == NAZWA_ROLI_POLA_SN_PL[rola]
    assert nazwa_roli_pola_sn(alias.lower()) == NAZWA_ROLI_POLA_SN_PL[rola]


@pytest.mark.parametrize(
    ("rola", "nazwa"),
    [
        ("OZE", "Pole źródłowe SN"),
        ("", "Pole SN"),
        ("   ", "Pole SN"),
        ("NIEZNANA_ROLA", "Pole SN"),
    ],
)
def test_pole_zrodlowe_i_rola_spoza_kanonu(rola: str, nazwa: str) -> None:
    """Rola spoza kanonu nie jest zgadywana — nazwa ogólna, bez kodu."""
    assert nazwa_roli_pola_sn(rola) == nazwa


def test_mapa_nazw_rol_rowna_etykietom_schematu() -> None:
    """Parytet z `FIELD_ROLE_LABEL_PL` schematu: ta sama rola ma jedną nazwę w modelu i na SLD."""
    kontrakt = (
        Path(__file__).resolve().parents[3]
        / "frontend/src/ui/sld/v2/station-rozdzielnia/contract.ts"
    ).read_text(encoding="utf-8")
    blok = kontrakt.split("export const FIELD_ROLE_LABEL_PL", 1)[1].split("};", 1)[0]
    etykiety = dict(re.findall(r"(\w+): '([^']+)'", blok))
    assert etykiety == NAZWA_ROLI_POLA_SN_PL


def _pola_stacji(migawka: dict[str, Any], przed: dict[str, Any]) -> list[dict[str, Any]]:
    """Pola stacji utworzonych operacją, w obu nośnikach modelu: element `bays` i specyfikacja
    pola w meta stacji (pola stacji istniejących wcześniej, np. GPZ, nie należą do przypadku)."""
    stare = {s["ref_id"] for s in przed.get("substations", [])}
    nowe = [s for s in migawka.get("substations", []) if s["ref_id"] not in stare]
    refy = {s["ref_id"] for s in nowe}
    pola = [dict(b) for b in migawka.get("bays", []) if b.get("substation_ref") in refy]
    for stacja in nowe:
        for spec in (stacja.get("meta") or {}).get("field_specs") or []:
            # Specyfikacja bez nazwy (droga stacji dołączanej) — nazwę niesie element `bays`.
            if spec.get("name") is not None:
                pola.append({"name": spec.get("name"), "bay_role": spec.get("bay_role")})
    return pola


def test_stacja_wstawiana_w_odcinek_nazywa_kazde_pole_po_polsku() -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(segment_ref, field_apparatus_catalog_ref=APARAT_SN)
    # Stacja wcięta w magistralę: role toru tranzytu i odgałęzienia. Pole pomiarowe w torze
    # tranzytu jest odrzucane regułą pomiaru rozliczeniowego (kod `pomiar_w_torze_tranzytu`)
    # zanim powstanie nazwa — jego nazwę pokrywa test mapy i test stacji dołączanej.
    role = ["LINIA_IN", "LINIA_OUT", "LINIA_ODG", "TRANSFORMATOROWE"]
    payload["sn_fields"] = [{"field_role": rola} for rola in role]
    wynik = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    assert wynik.get("error") is None, wynik.get("error")
    pola = _pola_stacji(wynik["snapshot"], snap)
    nazwy = {str(p.get("name")) for p in pola}
    oczekiwane = {f"{NAZWA_ROLI_POLA_SN_PL[rola]} {i + 1}" for i, rola in enumerate(role)}
    assert oczekiwane <= nazwy, nazwy
    for nazwa in nazwy:
        _bez_kodow(nazwa)


def test_stacja_dolaczana_na_koncu_nazywa_pola_po_polsku() -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()
    wynik = execute_domain_operation(
        copy.deepcopy(snap),
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": terminal_bus_ref,
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "field_apparatus_catalog_ref": APARAT_SN,
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    pola = _pola_stacji(wynik["snapshot"], snap)
    assert pola, "operacja nie utworzyła pól stacji"
    for pole in pola:
        nazwa = str(pole.get("name"))
        _bez_kodow(nazwa)
        assert nazwa.startswith(nazwa_roli_pola_sn(pole.get("bay_role"))), (nazwa, pole)


@pytest.mark.parametrize("rola", [r for r in _ROLE_KANONICZNE if r != "POMIAROWE"])
def test_komunikat_braku_aparatu_nazywa_role_po_polsku(rola: str) -> None:
    """Każda rola dopuszczalna w stacji wciętej w magistralę (pole pomiarowe w torze tranzytu
    odrzuca wcześniejsza reguła pomiaru rozliczeniowego)."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(segment_ref)
    payload["sn_fields"] = [{"field_role": rola}]
    wynik = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    komunikat = str(wynik.get("error") or "")
    assert wynik.get("error_code") == "station.insert.field_apparatus_ref_missing", wynik
    assert f"Pole SN nr 1 ({NAZWA_ROLI_POLA_SN_PL[rola].lower()})" in komunikat
    _bez_kodow(komunikat.split(". ", 1)[0])


def test_komunikat_awarii_wyposazenia_pola_nazywa_pole_nie_identyfikator() -> None:
    """Awaria dodania wyposażenia pola (przekładnik z nieistniejącej pozycji katalogu) —
    komunikat nazywa pole jego nazwą z modelu, bez surowego identyfikatora pola."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(segment_ref, field_apparatus_catalog_ref=APARAT_SN)
    payload["sn_fields"] = [
        {"field_role": "LINIA_IN", "equipment": {"ct": {"catalog_ref": "ct-nie-istnieje"}}},
        {"field_role": "LINIA_OUT"},
        {"field_role": "TRANSFORMATOROWE"},
    ]
    wynik = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    komunikat = str(wynik.get("error") or "")
    assert komunikat, wynik
    assert komunikat.startswith(f"{NAZWA_ROLI_POLA_SN_PL['LINIA_IN']} 1 — "), komunikat
    assert not _IDENTYFIKATOR.search(komunikat.split(":", 1)[0]), komunikat


def test_szyny_tworzone_z_transformatorem_bez_fragmentu_identyfikatora() -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()
    wynik = execute_domain_operation(
        copy.deepcopy(snap),
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": terminal_bus_ref,
            "lv_voltage_kv": 0.4,
            "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    nowe = [
        b
        for b in wynik["snapshot"]["buses"]
        if b["ref_id"] not in {x["ref_id"] for x in snap["buses"]}
    ]
    assert nowe, "operacja nie utworzyła szyny strony dolnego napięcia"
    for szyna in nowe:
        _bez_kodow(str(szyna["name"]))
        assert "transformatora SN/nN" in str(szyna["name"]), szyna
