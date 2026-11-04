"""
Test: sterownik zabezpieczeń (``ProtectionAssignment``) — operacje modelu niskiego poziomu.

Karta OCHRONA-JEDNO-ZRODLO (ADR-022): zabezpieczenie to sterownik pola z funkcjami rejestru,
nastawami w grupach 1–4, wejściami (przekładniki) i macierzą wyzwoleń. Sprawdza:
- dołączenie sterownika (macierz wyzwoleń na wyłącznik, wejście prądów fazowych),
- odmowy referencji (wyłącznik/przekładnik spoza modelu, rozłącznik w macierzy, drugi
  sterownik pola) — ta sama reguła co walidator modelu (E064),
- odmowę sprzecznych nastaw (rodzina czasu, PZ-09) już przy zapisie,
- odłączenie, aktualizację i kaskadę usuwania (wyłącznik i przekładnik w użyciu).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.topology_ops import (
    attach_protection,
    delete_branch,
    delete_measurement,
    detach_protection,
    update_protection,
)

from tests.utils.sterownik import rekord_sterownika, stopien, stopien_50, stopien_51

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _base_enm() -> dict:
    """Minimal ENM."""
    return {
        "header": {
            "enm_version": "1.0",
            "name": "Test",
            "revision": 1,
            "hash_sha256": "",
            "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
        },
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }


def _pole(enm: dict) -> dict:
    """Pole rozdzielni ``bay_1`` przy szynie ``bus_1`` (kotwica sterownika pola)."""
    enm["bays"] = [
        {
            "ref_id": "bay_1",
            "name": "Pole 1",
            "bay_role": "OUT",
            "substation_ref": "st_1",
            "bus_ref": "bus_1",
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def _enm_with_breaker_and_ct() -> dict:
    """ENM with buses, breaker, and CT."""
    enm = _base_enm()
    enm["buses"] = [
        {
            "ref_id": "bus_1",
            "name": "S1",
            "voltage_kv": 15,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "bus_2",
            "name": "S2",
            "voltage_kv": 15,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
    ]
    enm["branches"] = [
        {
            "ref_id": "brk_1",
            "name": "Wyłącznik 1",
            "type": "breaker",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "status": "closed",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "disc_1",
            "name": "Rozłącznik 1",
            "type": "disconnector",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "status": "closed",
            "tags": [],
            "meta": {},
        },
    ]
    enm["measurements"] = [
        {
            "ref_id": "ct_1",
            "name": "CT1",
            "measurement_type": "CT",
            "bus_ref": "bus_1",
            "rating": {
                "ratio_primary": 200,
                "ratio_secondary": 5,
                "accuracy_class": "5P20",
                "burden_va": 15,
            },
            "connection": "star",
            "purpose": "protection",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "vt_1",
            "name": "VT1",
            "measurement_type": "VT",
            "bus_ref": "bus_1",
            "rating": {"ratio_primary": 15000, "ratio_secondary": 100},
            "connection": "star",
            "purpose": "protection",
            "tags": [],
            "meta": {},
        },
    ]
    return enm


# ---------------------------------------------------------------------------
# TESTS
# ---------------------------------------------------------------------------


def _sterownik(ref_id: str = "pa_1", **kwargs: Any) -> dict[str, Any]:
    domyslne: dict[str, Any] = {
        "name": "Zabezpieczenie nadprądowe",
        "wylacznik": "brk_1",
        "ct_ref": "ct_1",
        "stopnie": [stopien_50(1000.0, jednostka_progu="A_PIERWOTNY")],
    }
    return {**rekord_sterownika(ref_id, **{**domyslne, **kwargs}), "tags": [], "meta": {}}


class TestAttachProtection:
    def test_attach_overcurrent_with_ct(self):
        """Sterownik 50/51 z wejściem prądów fazowych — macierz wyzwoleń na wyłącznik brk_1."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            _sterownik(
                stopnie=[
                    stopien_50(1000.0, jednostka_progu="A_PIERWOTNY"),
                    stopien_51(200.0, jednostka_progu="A_PIERWOTNY", krzywa="IEC_SI", tms=0.5),
                ]
            ),
        )
        assert result.success is True, result.issues
        assert result.created_ref == "pa_1"
        (pa,) = result.enm["protection_assignments"]
        assert pa["wejscia"]["ct_ref"] == "ct_1"
        assert [f["kod"] for f in pa["funkcje"]] == ["50", "51"]
        assert {tuple(w["aparat_refs"]) for w in pa["macierz_wyzwolen"]} == {("brk_1",)}

    def test_attach_without_ct_is_allowed_and_named_by_evaluation(self):
        """Sterownik bez przekładnika wchodzi do modelu (pole z szablonu ma funkcje przed
        doborem przekładnika) — brak nazywa ocena (``zabezpieczenia.brak_przekladnika``),
        nie operacja zapisu."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(enm, _sterownik(ct_ref=None))
        assert result.success is True, result.issues
        assert "ct_ref" not in result.enm["protection_assignments"][0]["wejscia"]

    @pytest.mark.parametrize(
        ("zmiana", "kod"),
        [
            ({"wylacznik": "nonexistent"}, "OP_BREAKER_NOT_FOUND"),
            ({"wylacznik": "disc_1"}, "OP_BREAKER_NOT_FOUND"),
            ({"ct_ref": "ct_nonexistent"}, "OP_CT_NOT_FOUND"),
            ({"ct_ref": "vt_1"}, "OP_CT_NOT_FOUND"),
            ({"bay_ref": "bay_nonexistent"}, "OP_BAY_NOT_FOUND"),
        ],
        ids=[
            "wylacznik_spoza_modelu",
            "rozlacznik_w_macierzy",
            "przekladnik_spoza_modelu",
            "przekladnik_napieciowy_na_wejsciu_pradowym",
            "pole_spoza_modelu",
        ],
    )
    def test_attach_odmowa_referencji(self, zmiana, kod):
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(enm, _sterownik(**zmiana))
        assert result.success is False
        assert any(i.code == kod for i in result.issues), result.issues
        assert enm["protection_assignments"] == []

    @pytest.mark.parametrize(
        "stopnie",
        [
            [stopien("50", prog=1000.0, krzywa="DT", zwloka_s=0.05)],
            [stopien("51", prog=200.0, jednostka_progu="A_PIERWOTNY", krzywa="IEC_SI", zwloka_s=1)],
            [stopien("50", prog=1000.0, jednostka_progu="A_PIERWOTNY", krzywa="DT", tms=0.1)],
        ],
        ids=["prog_bez_strony_przekladnika", "krzywa_zalezna_ze_zwloka", "dt_z_mnoznikiem"],
    )
    def test_attach_odmowa_sprzecznych_nastaw(self, stopnie):
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(enm, _sterownik(stopnie=stopnie))
        assert result.success is False
        assert any(i.code == "OP_SETTINGS_INVALID" for i in result.issues), result.issues

    def test_attach_earth_fault_holmgreen(self):
        """Funkcja ziemnozwarciowa 51N z wejściem 3I0 z filtru Holmgreena przekładnika fazowego."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            _sterownik(
                "pa_ef",
                name="Zabezpieczenie ziemnozwarciowe",
                wejscia={"i0_uklad": "HOLMGREEN"},
                stopnie=[
                    stopien(
                        "51N", prog=20.0, jednostka_progu="A_PIERWOTNY", krzywa="DT", zwloka_s=1
                    )
                ],
            ),
        )
        assert result.success is True, result.issues
        assert result.enm["protection_assignments"][0]["wejscia"]["i0_uklad"] == "HOLMGREEN"

    def test_attach_directional_with_ct_and_vt(self):
        """Funkcja kierunkowa 67 z wejściami prądowym i napięciowym."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            _sterownik(
                "pa_dir",
                name="Zabezpieczenie kierunkowe",
                vt_ref="vt_1",
                stopnie=[
                    stopien(
                        "67",
                        prog=150.0,
                        jednostka_progu="A_PIERWOTNY",
                        krzywa="DT",
                        zwloka_s=0.3,
                        kierunek="DO_LINII",
                    )
                ],
            ),
        )
        assert result.success is True, result.issues
        assert result.enm["protection_assignments"][0]["wejscia"]["vt_ref"] == "vt_1"

    def test_second_controller_in_bay_refused(self):
        """Pole ma JEDEN sterownik — funkcje dokłada się w nim, drugi sterownik jest odmową."""
        enm = _pole(_enm_with_breaker_and_ct())
        result = attach_protection(enm, _sterownik(bay_ref="bay_1"))
        assert result.success, result.issues
        result = attach_protection(result.enm, _sterownik("pa_2", bay_ref="bay_1"))
        assert result.success is False
        assert any(i.code == "OP_BAY_HAS_PROTECTION" for i in result.issues)

    def test_two_controllers_on_one_breaker_without_bay_allowed(self):
        """Zabezpieczenie podstawowe i rezerwowe na ten sam wyłącznik liniowy (bez pola) —
        dwa sterowniki, każdy z własną macierzą wyzwoleń."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(enm, _sterownik())
        assert result.success, result.issues
        result = attach_protection(result.enm, _sterownik("pa_2"))
        assert result.success is True, result.issues


class TestDetachProtection:
    def test_detach_success(self):
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [_sterownik()]
        result = detach_protection(enm, "pa_1")
        assert result.success is True
        assert len(result.enm["protection_assignments"]) == 0

    def test_detach_nonexistent(self):
        enm = _enm_with_breaker_and_ct()
        result = detach_protection(enm, "nonexistent")
        assert result.success is False
        assert any(i.code == "OP_NOT_FOUND" for i in result.issues)


class TestUpdateProtection:
    def test_update_groups(self):
        """Nowe grupy nastaw zastępują dawne (rekord w kształcie kontraktu)."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [_sterownik()]
        nowy = _sterownik(stopnie=[stopien_50(1200.0, jednostka_progu="A_PIERWOTNY")])
        result = update_protection(enm, {"ref_id": "pa_1", "grupy_nastaw": nowy["grupy_nastaw"]})
        assert result.success is True, result.issues
        (wpis,) = result.enm["protection_assignments"][0]["grupy_nastaw"][0]["funkcje"]
        assert {n["klucz"]: n["wartosc"] for n in wpis["nastawy"]}["prog"] == 1200.0

    def test_update_ct_ref(self):
        """Wejście na przekładnik spoza modelu — odmowa, rekord bez zmian."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [_sterownik()]
        result = update_protection(enm, {"ref_id": "pa_1", "wejscia": {"ct_ref": "ct_nonexistent"}})
        assert result.success is False
        assert any(i.code == "OP_CT_NOT_FOUND" for i in result.issues)
        assert enm["protection_assignments"][0]["wejscia"]["ct_ref"] == "ct_1"

    def test_disable_protection(self):
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [_sterownik()]
        result = update_protection(enm, {"ref_id": "pa_1", "is_enabled": False})
        assert result.success is True
        assert result.enm["protection_assignments"][0]["is_enabled"] is False


class TestProtectionCascadeValidation:
    """Kaskada: wyłącznik w macierzy wyzwoleń i przekładnik na wejściu blokują usunięcie."""

    def test_delete_breaker_with_protection_blocked(self):
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [_sterownik()]
        result = delete_branch(enm, "brk_1")
        assert result.success is False
        assert any(i.code == "OP_HAS_PROTECTION" for i in result.issues)

    def test_delete_ct_with_protection_blocked(self):
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [_sterownik()]
        result = delete_measurement(enm, "ct_1")
        assert result.success is False
        assert any(i.code == "OP_CT_IN_USE" for i in result.issues)

    def test_proper_cascade_removal(self):
        """Kolejność: odłącz sterownik → usuń przekładnik → usuń wyłącznik."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [_sterownik()]

        result = detach_protection(enm, "pa_1")
        assert result.success
        enm = result.enm

        result = delete_measurement(enm, "ct_1")
        assert result.success
        enm = result.enm

        result = delete_branch(enm, "brk_1")
        assert result.success
        enm = result.enm

        assert len(enm["protection_assignments"]) == 0
        assert len(enm["measurements"]) == 1  # VT zostaje
        assert not any(b["ref_id"] == "brk_1" for b in enm["branches"])
