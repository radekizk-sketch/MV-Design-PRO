"""Przekaźnik z opcji szablonu stacji trafia do modelu jako przypisanie zabezpieczenia.

Przejście scenariusza „stacja SN/nN 630 kVA” (pkt 6): przekaźnik proponowany przez
szablon stacji (np. e2TANGO-600) nie istniał w kanonicznym katalogu ZABEZPIECZENIE,
więc brama katalogowa operacji odrzuciłaby go, a kreator po cichu go pomijał —
stacja powstawała z ``protection_assignments = 0``. Testy przypinają klasę:
KAŻDA opcja zabezpieczenia KAŻDEGO szablonu ma pozycję kanoniczną powiązaną
z biblioteką analityczną, a operacja stacyjna z takim przekaźnikiem w polu
wyłącznikowym tworzy realne przypisanie zabezpieczenia (iloczyn: opcja szablonu ×
brama katalogowa × operacja stacyjna).
"""

from __future__ import annotations

import copy

import pytest
from api.domain_ops_policy import validate_and_materialize_catalog_binding
from application.analyses.protection.catalog.catalog_store import list_devices
from application.station_templates.service import list_templates
from enm.domain_operations import execute_domain_operation
from network_model.catalog.repository import get_default_mv_catalog

from tests.enm.test_station_field_equipment_atomic import (
    _build_trunk_with_segment,
    _insert_payload,
    _wyposazenie,
)


def _opcje_szablonow() -> list[str]:
    return sorted(
        {
            opcja.device_catalog_ref
            for szablon in list_templates()
            for opcja in szablon.schema.sn_bay_protection_options
        }
    )


def test_kazda_opcja_zabezpieczenia_szablonu_ma_pozycje_kanoniczna() -> None:
    kanon = get_default_mv_catalog().protection_device_types
    biblioteka = {d.device_id for d in list_devices()}
    brak = [ref for ref in _opcje_szablonow() if ref not in kanon]
    assert brak == []
    for ref in _opcje_szablonow():
        assert kanon[ref].analytical_library_ref == ref
        assert ref in biblioteka


@pytest.mark.parametrize("przekaznik", _opcje_szablonow())
def test_pozycja_kanoniczna_nie_deklaruje_wiecej_niz_rekord_biblioteki(przekaznik: str) -> None:
    """Producent, seria, prąd znamionowy, źródło i status weryfikacji pozycji kanonicznej są
    przepisane z rekordu biblioteki analitycznej — rozjazd byłby drugą prawdą o tym samym
    przekaźniku (kanon mówiłby „niezweryfikowany”, biblioteka „częściowo zweryfikowany”)."""
    pozycja = get_default_mv_catalog().protection_device_types[przekaznik]
    rekord = {d.device_id: d for d in list_devices()}[przekaznik]
    assert pozycja.vendor == rekord.vendor
    assert pozycja.series == rekord.meta["series"]
    assert pozycja.rated_current_a == float(rekord.meta["rated"])
    assert pozycja.source_reference == rekord.meta["source_reference"]
    assert pozycja.verification_status == rekord.meta["verification_status"]


@pytest.mark.parametrize("przekaznik", _opcje_szablonow())
def test_przekaznik_szablonu_przechodzi_brame_i_tworzy_przypisanie(przekaznik: str) -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(
        segment_ref,
        [
            {
                "field_role": "LINIA_IN",
                "equipment": _wyposazenie(
                    relay={"catalog_ref": przekaznik, "relay_type": "NADPRADOWY"}
                ),
            },
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
    )
    blad, _ = validate_and_materialize_catalog_binding("insert_station_on_segment_sn", payload)
    assert blad is None, blad
    wynik = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    assert wynik.get("error") is None, wynik.get("error")
    przypisania = wynik["snapshot"].get("protection_assignments", [])
    assert len(przypisania) == 1
    assert przypisania[0]["ref_id"] in set(wynik["changes"]["created_element_ids"])
