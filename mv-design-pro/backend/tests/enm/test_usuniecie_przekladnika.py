"""Usunięcie przekładnika pola (CT/VT) jedyną drogą usuwania — ``delete_element``.

Karta JEDNA-SCIEZKA-EDYCJI: przekładnik napięciowy pola (dawne „bay_vts" zapisanej
konfiguracji stacji) żyje w modelu jako ``Measurement`` — wybór typu w konfiguratorze
stacji to ``add_vt``, zmiana typu albo rezygnacja to usunięcie przekładnika i (dla zmiany)
nowe ``add_vt``. Przed kartą przekładnika nie dało się usunąć ŻADNĄ operacją domenową
(``delete_element`` odmawiał kodem ``field.legacy_write_disabled``) — wybór raz zrobiony
był nieodwracalny bez usunięcia całego pola.

Iloczyn cech: rodzaj przekładnika (CT / VT) × odwołanie z zabezpieczenia (brak / ``ct_ref``
/ ``vt_ref`` / ``ct_refs_secondary``); dodatkowo: odmowa atomowa, zapis pól generyczną
operacją nadal zamknięty, determinizm.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import ODWOLANIA_DO_PRZEKLADNIKA, execute_domain_operation
from enm.models import EnergyNetworkModel

from tests.enm.test_wyposazenie_pola import _siec_z_polami

REF_CT = "ct_400_5_5p20_15va_abb"
REF_VT = "vt_15kv_100v_3p_abb"


@pytest.fixture(scope="module")
def siec_z_przekladnikami() -> tuple[dict[str, Any], str, str, str]:
    """Stacja z polem IN: CT i VT dodane operacjami kreatora pomiaru."""
    enm, pola, _ = _siec_z_polami()
    pole = pola["IN"]
    po_ct = execute_domain_operation(
        enm,
        "add_ct",
        {
            "field_ref": pole,
            "catalog_binding": {"catalog_item_id": REF_CT},
            "ratio_primary_a": 400.0,
            "ratio_secondary_a": 5.0,
        },
    )
    assert not po_ct.get("error"), po_ct.get("error")
    po_vt = execute_domain_operation(
        po_ct["snapshot"],
        "add_vt",
        {
            "field_ref": pole,
            "catalog_binding": {"catalog_item_id": REF_VT},
            "ratio_primary_v": 15000.0,
            "ratio_secondary_v": 100.0,
        },
    )
    assert not po_vt.get("error"), po_vt.get("error")
    migawka = po_vt["snapshot"]
    ct = next(m["ref_id"] for m in migawka["measurements"] if m["measurement_type"] == "CT")
    vt = next(m["ref_id"] for m in migawka["measurements"] if m["measurement_type"] == "VT")
    return migawka, pole, ct, vt


def _usun(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return execute_domain_operation(enm, "delete_element", {"element_ref": ref})


def _z_zabezpieczeniem(enm: dict[str, Any], pole_odwolania: str, ref: str) -> dict[str, Any]:
    """Zabezpieczenie wskazujące przekładnik wskazanym polem (dana modelu, nie operacja —
    model zabezpieczeń edytuje osobna karta; tu liczy się wyłącznie odwołanie)."""
    kopia = copy.deepcopy(enm)
    wylacznik = next(b["ref_id"] for b in kopia["branches"] if b.get("type") == "breaker")
    wartosc: Any = [ref] if pole_odwolania == "ct_refs_secondary" else ref
    kopia.setdefault("protection_assignments", []).append(
        {
            "id": "00000000-0000-0000-0000-0000000000aa",
            "ref_id": "pa-1",
            "name": "Zabezpieczenie nadprądowe pola",
            "tags": [],
            "meta": {},
            "breaker_ref": wylacznik,
            "device_type": "overcurrent",
            pole_odwolania: wartosc,
        }
    )
    EnergyNetworkModel.model_validate(kopia)
    return kopia


@pytest.mark.parametrize("rodzaj", ["CT", "VT"])
def test_usuniecie_przekladnika_bez_odwolan(siec_z_przekladnikami: Any, rodzaj: str) -> None:
    enm, _, ct, vt = siec_z_przekladnikami
    ref = ct if rodzaj == "CT" else vt
    wejscie = copy.deepcopy(enm)
    wynik = _usun(enm, ref)
    assert not wynik.get("error"), wynik.get("error")
    assert enm == wejscie, "operacja zmieniła model wejściowy"
    pozostale = {m["ref_id"] for m in wynik["snapshot"]["measurements"]}
    assert pozostale == ({ct, vt} - {ref})
    assert wynik["changes"]["deleted_element_ids"] == [ref]
    # Reszta modelu bez zmian (pole, szyny, aparaty).
    for kolekcja in ("bays", "buses", "branches", "substations"):
        assert wynik["snapshot"][kolekcja] == enm[kolekcja], kolekcja


@pytest.mark.parametrize("rodzaj", ["CT", "VT"])
@pytest.mark.parametrize("pole_odwolania", ["ct_ref", "ct_refs_secondary", "vt_ref"])
def test_przekladnik_wskazany_przez_zabezpieczenie_nie_znika(
    siec_z_przekladnikami: Any, rodzaj: str, pole_odwolania: str
) -> None:
    enm, _, ct, vt = siec_z_przekladnikami
    ref = ct if rodzaj == "CT" else vt
    z_ochrona = _z_zabezpieczeniem(enm, pole_odwolania, ref)
    wejscie = copy.deepcopy(z_ochrona)
    wynik = _usun(z_ochrona, ref)
    assert wynik.get("error_code") == "delete.measurement_in_use", wynik.get("error")
    assert wynik["snapshot"] is None
    assert z_ochrona == wejscie
    assert "Zabezpieczenie nadprądowe pola" in wynik["error"]
    # Drugi przekładnik (bez odwołania) usuwa się normalnie przy tym samym zabezpieczeniu.
    drugi = vt if ref == ct else ct
    assert not _usun(z_ochrona, drugi).get("error")


def test_lista_odwolan_obejmuje_kazde_pole_przekladnika_w_kontrakcie() -> None:
    """Lista odwołań wyprowadzona z kontraktu ENM, nie z pamięci: każde pole elementu
    modelu niosące referencję przekładnika (``ct_ref*``/``vt_ref*``) jest na liście."""
    pola_kontraktu = {
        (kolekcja, nazwa)
        for kolekcja, info in EnergyNetworkModel.model_fields.items()
        for model in [getattr(info.annotation, "__args__", (None,))[0]]
        if hasattr(model, "model_fields")
        for nazwa in model.model_fields
        if nazwa.startswith(("ct_ref", "vt_ref"))
    }
    assert pola_kontraktu == set(ODWOLANIA_DO_PRZEKLADNIKA)


def test_zapis_pol_przekladnika_generyczna_operacja_nadal_zamkniety(
    siec_z_przekladnikami: Any,
) -> None:
    enm, _, _, vt = siec_z_przekladnikami
    wynik = execute_domain_operation(
        enm,
        "update_element_parameters",
        {"element_ref": vt, "parameters": {"name": "Inna nazwa"}},
    )
    assert wynik.get("error_code") == "field.legacy_write_disabled"


def test_zmiana_typu_vt_to_usuniecie_i_dodanie(siec_z_przekladnikami: Any) -> None:
    """Droga konfiguratora stacji: zmiana typu VT pola = usuń + ``add_vt`` z nowym typem."""
    enm, pole, _, vt = siec_z_przekladnikami
    bez_vt = _usun(enm, vt)["snapshot"]
    nowy = execute_domain_operation(
        bez_vt,
        "add_vt",
        {
            "field_ref": pole,
            "catalog_binding": {"catalog_item_id": "vt_20kv_fz_100_3_05_3p_siemens"},
            "ratio_primary_v": 11547.0,
            "ratio_secondary_v": 57.7,
        },
    )
    assert not nowy.get("error"), nowy.get("error")
    (wpis,) = (m for m in nowy["snapshot"]["measurements"] if m["measurement_type"] == "VT")
    assert (wpis["bay_ref"], wpis["catalog_ref"]) == (
        pole,
        "vt_20kv_fz_100_3_05_3p_siemens",
    )


def test_determinizm_usuniecia(siec_z_przekladnikami: Any) -> None:
    enm, _, _, vt = siec_z_przekladnikami
    assert _usun(copy.deepcopy(enm), vt) == _usun(copy.deepcopy(enm), vt)
