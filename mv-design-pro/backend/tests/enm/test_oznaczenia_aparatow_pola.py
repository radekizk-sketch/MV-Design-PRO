"""Jednoznaczność oznaczeń aparatów w polu — reguła walidatora W063 (rozszerzenie 5 karty
UX-04/POLE-LINIOWE-WZORZEC, referencja HMI właściciela 2026-10-29: dwa aparaty „6Q2" pola P6).

Ścieżka użytkownika: GPZ z operacji `add_grid_source_sn`, wyposażenie pola przez
`set_bay_equipment` (formularz karty pola, pole „Oznaczenie aparatu"), walidator modelu
i kanon gotowości. Iloczyn cech: zapis oznaczenia {identyczny, inna wielkość liter i odstępy}
× liczba powtórzeń {2, 3} × rodzaje aparatów {łączniki, łącznik + przekładnik} × zasięg
{jedno pole, dwa pola z tym samym oznaczeniem}; propozycje systemu (każdy szablon pola,
każda konfiguracja celki producenta) nie wywołują reguły.
"""

from __future__ import annotations

import functools
import itertools
from typing import Any

import pytest
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.oznaczenia_aparatow_pola import (
    KOD_WALIDATORA_OZNACZEN,
    PODSTAWA_JEDNOZNACZNOSCI_OZNACZEN,
    klucz_oznaczenia,
)
from enm.validator import ENMValidator
from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY, template_primary_devices

from tests.reference_networks.sceny_zajetosci_pol import APARAT, ZRODLO, ok, op


@functools.cache
def _baza() -> dict[str, Any]:
    pusty = EnergyNetworkModel(header=ENMHeader(name="OZNACZENIA", defaults=ENMDefaults()))
    return ok(
        op(
            pusty.model_dump(mode="json"),
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": ZRODLO,
                "sections_count": 1,
                "line_fields_per_section": 2,
                "gpz_line_field_apparatus": {"catalog_ref": APARAT},
            },
        )
    )


def _pola(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        (b for b in enm["bays"] if "gpz_line_field" in (b.get("tags") or [])),
        key=lambda b: b["ref_id"],
    )


ROZLACZNIK = "sw-ls-ogolny-prozniowy-24kv-630a"
PRZEKLADNIK_PRADOWY = "ct_50_1_0_5_5va_arteche"
RODZAJE: dict[str, list[tuple[str, str, str | None]]] = {
    # Referencja: łącznik górny (rozłącznik) i wyłącznik — oba „6Q2".
    "laczniki": [
        ("LOAD_SWITCH", "UPSTREAM", ROZLACZNIK),
        ("CB", "MIDSTREAM", APARAT),
        ("CABLE_HEAD", "DOWNSTREAM", None),
    ],
    "lacznik_i_przekladnik": [
        ("CB", "MIDSTREAM", APARAT),
        ("CT", "MIDSTREAM", PRZEKLADNIK_PRADOWY),
        ("CABLE_HEAD", "DOWNSTREAM", None),
    ],
}
ZAPISY = {"identyczny": ("6Q2", "6Q2", "6Q2"), "wielkosc_i_odstepy": ("6Q2", " 6q2", "6Q2 ")}


def _wyposaz(
    enm: dict[str, Any], pole: dict[str, Any], rodzaje: str, oznaczenia: tuple[str | None, ...]
) -> dict[str, Any]:
    devices = [
        {
            "kind": kind,
            "placement": placement,
            **({"catalog_ref": katalog} if katalog is not None else {}),
            **({"designation": o} if o is not None else {}),
        }
        for (kind, placement, katalog), o in zip(RODZAJE[rodzaje], oznaczenia, strict=True)
    ]
    return ok(
        op(
            enm,
            "set_bay_equipment",
            {"bay_ref": pole["ref_id"], "mode": "katalog", "devices": devices},
        )
    )


def _w063(enm: dict[str, Any]) -> list[Any]:
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    return [i for i in wynik.issues if i.code == KOD_WALIDATORA_OZNACZEN]


@pytest.mark.parametrize(
    "rodzaje,zapis,powtorzen,dwa_pola",
    list(itertools.product(RODZAJE, ZAPISY, (2, 3), (False, True))),
)
def test_duplikat_oznaczenia_w_polu_daje_w063(
    rodzaje: str, zapis: str, powtorzen: int, dwa_pola: bool
) -> None:
    enm = _baza()
    pierwsze, drugie = _pola(enm)
    oznaczenia = ZAPISY[zapis][:powtorzen] + ("GK",) * (3 - powtorzen)
    enm = _wyposaz(enm, pierwsze, rodzaje, oznaczenia)
    if dwa_pola:
        # Drugie pole nosi te same oznaczenia RAZ każde — oznaczenia w różnych polach mogą się
        # powtarzać (przedrostek numeru pola rozróżnia je w stacji).
        enm = _wyposaz(enm, drugie, rodzaje, ("6Q2", "Q0", "GK"))
    (zgloszenie,) = _w063(enm)
    aparaty = next(b for b in enm["bays"] if b["ref_id"] == pierwsze["ref_id"])["primary_devices"]
    assert zgloszenie.element_refs == [
        pierwsze["ref_id"],
        *(a["device_ref"] for a in aparaty[:powtorzen]),
    ]
    # Werdykt wyjaśnialny: co oceniono, kryterium z podstawą, wynik i limit, skutek.
    assert "„6Q2”" in zgloszenie.message_pl
    assert PODSTAWA_JEDNOZNACZNOSCI_OZNACZEN in zgloszenie.message_pl
    assert f"wskazuje {powtorzen} aparaty" in zgloszenie.message_pl
    assert "jeden aparat na oznaczenie" in zgloszenie.message_pl
    assert zgloszenie.severity == "IMPORTANT"
    assert zgloszenie.suggested_fix and "Oznaczenie aparatu" in zgloszenie.suggested_fix
    assert zgloszenie.fix_action is not None
    assert zgloszenie.fix_action.action_type == "NAVIGATE_TO_ELEMENT"
    assert zgloszenie.fix_action.element_ref == pierwsze["ref_id"]
    # Kanon gotowości: kod z odwzorowania mostu ma wpis rejestru z nawigacją naprawczą.
    kanon = ODWZOROWANIE_WALIDATOR_NA_KANON[KOD_WALIDATORA_OZNACZEN]
    assert kanon == "bay.apparatus_designation_duplicate"
    assert READINESS_CODES[kanon].fix_navigation == {"panel": "inspector", "tab": "pola"}


@pytest.mark.parametrize("rodzaje", RODZAJE)
@pytest.mark.parametrize(
    "oznaczenia",
    [("6Q1", "6Q0", "6GK"), ("6Q2", None, None), (None, None, None), ("6Q2", "6Q20", "Q2")],
)
def test_oznaczenia_rozne_albo_brak_nie_daja_w063(
    rodzaje: str, oznaczenia: tuple[str | None, ...]
) -> None:
    """Brak oznaczenia ≠ duplikat; oznaczenia o wspólnym przedrostku są różne."""
    enm = _baza()
    pierwsze, drugie = _pola(enm)
    enm = _wyposaz(enm, pierwsze, rodzaje, oznaczenia)
    enm = _wyposaz(enm, drugie, rodzaje, oznaczenia)
    assert _w063(enm) == []


def test_kazdy_szablon_pola_proponuje_jednoznaczne_oznaczenia() -> None:
    """Propozycja systemu (wartość robocza szablonu) nigdy nie łamie reguły W063."""
    assert BAY_TEMPLATE_REGISTRY
    for ref in sorted(BAY_TEMPLATE_REGISTRY):
        aparaty = template_primary_devices(ref, field_ref="p")
        klucze = [klucz_oznaczenia(a.get("designation")) for a in aparaty]
        obecne = [k for k in klucze if k is not None]
        assert len(obecne) == len(set(obecne)), ref


def test_wynik_reguly_deterministyczny() -> None:
    enm = _wyposaz(_baza(), _pola(_baza())[0], "laczniki", ("6Q2", "6Q2", "6Q2"))
    assert [i.model_dump() for i in _w063(enm)] == [i.model_dump() for i in _w063(enm)]
