"""Fikstury ENM scen SLD niosą PEŁNY kształt kontraktu ``EnergyNetworkModel``.

Klasa defektu (karta UX-04/POLE-LINIOWE-WZORZEC): rekord dopisany w budowniczym fikstury
słownikiem „z ręki" przechodził samą walidację Pydantic (pola domyślne uzupełnione tylko
w pamięci), a do pliku trafiał bez nich — np. ``Bay.equipment_refs`` (wymagane w typie frontu
``types/enm.ts``) brakowało w trzech polach ``gpzProtectionDataPath``, a inspektor pola rzucał
wyjątkiem przy kliku. Wyrocznia: zrzut modelu z treści pliku jest RÓWNY treści pliku — każdy
plik zapisywany przez ``fikstury_enm_sld`` (wszystkie sieci, nie tylko ta z karty).
"""

from __future__ import annotations

import json

import pytest
from enm.models import EnergyNetworkModel

from tests.reference_networks.fikstury_enm_sld import _SIECI, FRONTEND


def _sciezki() -> list[str]:
    return [sciezka for pliki, _, _ in _SIECI for sciezka in pliki]


def _brakujace_klucze(plik: object, model: object, sciezka: str = "") -> list[str]:
    if isinstance(model, dict) and isinstance(plik, dict):
        braki = [f"{sciezka}.{k}" for k in model if k not in plik]
        for k in model:
            if k in plik:
                braki += _brakujace_klucze(plik[k], model[k], f"{sciezka}.{k}")
        return braki
    if isinstance(model, list) and isinstance(plik, list):
        braki: list[str] = []
        for i, (a, b) in enumerate(zip(plik, model, strict=False)):
            braki += _brakujace_klucze(a, b, f"{sciezka}[{i}]")
        return braki
    return []


@pytest.mark.parametrize("sciezka", _sciezki())
def test_plik_niesie_wszystkie_pola_modelu(sciezka: str) -> None:
    tresc = json.loads((FRONTEND / sciezka).read_text(encoding="utf-8"))
    enm = tresc.get("enm", tresc)
    zrzut = EnergyNetworkModel.model_validate(enm).model_dump(mode="json")
    assert _brakujace_klucze(enm, zrzut) == []


def test_wyrocznia_wykrywa_brak_pola_wymaganego() -> None:
    """Iniekcja: pole bez ``equipment_refs`` (stan sprzed naprawy) — wyrocznia czerwona."""
    tresc = json.loads((FRONTEND / _sciezki()[0]).read_text(encoding="utf-8"))
    enm = tresc.get("enm", tresc)
    pole = next(iter(enm["bays"]))
    del pole["equipment_refs"]
    zrzut = EnergyNetworkModel.model_validate(enm).model_dump(mode="json")
    assert any(b.endswith(".equipment_refs") for b in _brakujace_klucze(enm, zrzut))
