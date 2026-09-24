"""Dwa źródła gotowości orzekają jednakowo o tym samym modelu.

Gotowość modelu dociera do projektanta DWIEMA drogami: odpowiedź operacji
domenowej (`readiness` — czyta ją chrom powłoki, chip „Model: …") oraz
`GET /engineering-readiness` (walidator ENM). Regresja modułu nN: aparat pola nN
z automigracji (`META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA`) walidator oceniał jako W061
(ostrzeżenie), a kontrola domenowa `switch.catalog_ref_missing` jako BLOKADĘ —
po wstawieniu stacji z transformatorem chrom mówił „Model: w budowie" przy
`ready: true` z serwera (pełne e2e `stany-zerowe-akcje` H-5/H-6 i dziesięć
innych speców czerwonych na `main` od #472).

Iloczyn cech: {aparat nN z automigracji bez wiązania, ten sam aparat po
przypisaniu katalogu, łącznik SN bez katalogu} × {odpowiedź operacji, walidator}.
"""

from __future__ import annotations

from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.migrations.nn_field_specs_promocja import META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA, migruj
from enm.models import EnergyNetworkModel
from enm.validator import ENMValidator

from tests.enm.test_append_station_on_endpoint import (
    CATALOG_APARAT_SN,
    CATALOG_TRAFO_630,
    _build_gpz_with_endpoint,
)


def _wykonaj(snap: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snap, nazwa, payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')} ({wynik.get('error_code')})"
    return wynik


def _gotowosc_walidatora(snap: dict[str, Any]) -> bool:
    walidator = ENMValidator()
    return walidator.readiness(walidator.validate(EnergyNetworkModel.model_validate(snap))).ready


def _stacja_z_transformatorem() -> dict[str, Any]:
    """Stacja SN/nN z transformatorem PO odczycie ze składu modelu.

    `enm/store.py::get_enm` promuje specyfikacje pól nN do realnych gałęzi
    (`nn_field_specs_promocja.migruj`) — ta sama migracja jest tu wywołana
    jawnie, bo to ona tworzy aparat nN bez wiązania, który widzi projektant.
    """
    snap, _ = _build_gpz_with_endpoint()
    segment = snap["branches"][-1]["ref_id"]
    po_stacji = _wykonaj(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "TR"],
            "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
            "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630},
        },
    )["snapshot"]
    zmigrowany, zmieniony = migruj(EnergyNetworkModel.model_validate(po_stacji))
    assert zmieniony, "stacja z transformatorem ma pola nN do promocji"
    return zmigrowany.model_dump(mode="json")


def _odswiez(snap: dict[str, Any]) -> dict[str, Any]:
    return _wykonaj(snap, "refresh_snapshot", {})


def _automigrowane(snap: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        b
        for b in snap["branches"]
        if (b.get("meta") or {}).get(META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA)
    ]


def test_aparat_nn_z_automigracji_nie_blokuje_w_zadnym_zrodle() -> None:
    odpowiedz = _odswiez(_stacja_z_transformatorem())
    snap = odpowiedz["snapshot"]
    migrowane = _automigrowane(snap)
    assert migrowane, "scenariusz musi zawierać aparat nN z automigracji pól"
    kody_blokad = {b["code"] for b in odpowiedz["readiness"]["blockers"]}
    assert "switch.catalog_ref_missing" not in kody_blokad
    kody_ostrzezen = {w["code"] for w in odpowiedz["readiness"]["warnings"]}
    assert "W061" in kody_ostrzezen, "brak wiązania nadal zgłoszony — jako ostrzeżenie"
    assert odpowiedz["readiness"]["ready"] == _gotowosc_walidatora(snap)


def test_ten_sam_aparat_bez_znacznika_automigracji_blokuje_w_obu_zrodlach() -> None:
    """Wyjątek dotyczy WYŁĄCZNIE automigracji — ta sama gałąź bez znacznika blokuje.

    Predykaty parami: znacznik obecny ⇒ ostrzeżenie w obu źródłach; znacznik
    zdjęty ⇒ blokada w obu źródłach (walidator: E061, operacja: blokada łącznika).
    """
    snap = _odswiez(_stacja_z_transformatorem())["snapshot"]
    aparat = _automigrowane(snap)[0]
    del aparat["meta"][META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA]
    odpowiedz = _odswiez(snap)
    assert odpowiedz["readiness"]["ready"] is False
    assert _gotowosc_walidatora(odpowiedz["snapshot"]) is False
