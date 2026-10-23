"""Zgodność sieci biegu zwarciowego z modelem — jeden predykat dla trzech decyzji.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): nastawy żyją w modelu, więc ich edycja zmienia
migawkę, ale NIE sieć policzoną przez bieg zwarciowy. Ocena zabezpieczeń wolno złożyć
(nastawy z bieżącego modelu + rozpływ z biegu) tylko dla tej samej sieci. Decyzję
podejmują trzy miejsca — tworzenie biegu ``protection_sn``, świeżość jego wyniku,
koordynacja E-28 — i wszystkie trzy MUSZĄ pytać ten sam predykat (reguła predykatów
parami: warunek wejścia i wyjścia z jednego źródła).

Iloczyn cech: {zmiana: brak, nastawa stopnia, przypisanie usunięte, przekładnik
(przekładnia), nagłówek (rewizja, nazwa), stan łącznika, parametr kabla, nowy element
sieci, bieg bez migawki} × {oczekiwana zgodność}.
"""

from __future__ import annotations

import ast
import copy
import inspect
from collections.abc import Callable
from typing import Any

import pytest
from enm.hash import hash_sieci_bez_zabezpieczen, siec_biegu_zgodna_z_modelem

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    build_zabezpieczenia_magistrali_enm,
)

MODEL = build_zabezpieczenia_magistrali_enm().model_dump(mode="json")


def _pierwszy(m: dict[str, Any], typ: str) -> dict[str, Any]:
    return next(b for b in m["branches"] if b["type"] == typ)


def _nastawa(m: dict[str, Any]) -> None:
    m["protection_assignments"][0]["settings"][0]["time_multiplier"] = 0.9


def _bez_przypisania(m: dict[str, Any]) -> None:
    m["protection_assignments"].pop()


def _przekladnia(m: dict[str, Any]) -> None:
    m["measurements"][0]["rating"]["ratio_primary"] = 1200.0


def _naglowek(m: dict[str, Any]) -> None:
    m["header"]["revision"] = m["header"].get("revision", 0) + 7
    m["header"]["name"] = "Inna nazwa projektu"


def _stan_lacznika(m: dict[str, Any]) -> None:
    _pierwszy(m, "breaker")["status"] = "open"


def _dlugosc_kabla(m: dict[str, Any]) -> None:
    kabel = _pierwszy(m, "cable")
    kabel["length_km"] = kabel["length_km"] * 2


def _nowy_element(m: dict[str, Any]) -> None:
    kopia = copy.deepcopy(_pierwszy(m, "cable"))
    kopia["ref_id"] = kopia["ref_id"] + "/rownolegly"
    m["branches"].append(kopia)


@pytest.mark.parametrize(
    ("zmiana", "zgodna"),
    [
        (lambda m: None, True),
        (_nastawa, True),
        (_bez_przypisania, True),
        (_przekladnia, True),
        (_naglowek, True),
        (_stan_lacznika, False),
        (_dlugosc_kabla, False),
        (_nowy_element, False),
    ],
    ids=[
        "bez_zmian",
        "nastawa_stopnia",
        "przypisanie_usuniete",
        "przekladnia_przekladnika",
        "naglowek_rewizja_nazwa",
        "stan_lacznika",
        "dlugosc_kabla",
        "nowy_element_sieci",
    ],
)
def test_zgodnosc_sieci_po_zmianie_modelu(
    zmiana: Callable[[dict[str, Any]], None], zgodna: bool
) -> None:
    model = copy.deepcopy(MODEL)
    zmiana(model)
    assert siec_biegu_zgodna_z_modelem(MODEL, model) is zgodna
    # Predykat nie modyfikuje migawek wołającego.
    assert hash_sieci_bez_zabezpieczen(MODEL) == hash_sieci_bez_zabezpieczen(
        build_zabezpieczenia_magistrali_enm().model_dump(mode="json")
    )


def test_bieg_bez_migawki_nie_jest_zgodny_z_zadna_siecia() -> None:
    assert siec_biegu_zgodna_z_modelem(None, MODEL) is False


@pytest.mark.parametrize(
    ("modul", "funkcja"),
    [
        ("enm.canonical_analysis", "_validate_protection_sc_reference"),
        ("api.protection_runs", "_swiezosc_wyniku"),
        ("application.analyses.protection.coordination.z_biegow", "_sprawdz_siec"),
    ],
)
def test_trzy_decyzje_pytaja_ten_sam_predykat(modul: str, funkcja: str) -> None:
    """Tworzenie biegu, świeżość wyniku i koordynacja wołają ``siec_biegu_zgodna_z_modelem``
    i nie liczą odcisku sieci same (drugi, niezależny warunek „dziś się zgadza")."""
    zrodlo = inspect.getsource(getattr(__import__(modul, fromlist=[funkcja]), funkcja))
    wolane = {
        w.func.id if isinstance(w.func, ast.Name) else getattr(w.func, "attr", "")
        for w in ast.walk(ast.parse(inspect.cleandoc("\n" + zrodlo)))
        if isinstance(w, ast.Call)
    }
    assert "siec_biegu_zgodna_z_modelem" in wolane
    assert "hash_sieci_bez_zabezpieczen" not in wolane
