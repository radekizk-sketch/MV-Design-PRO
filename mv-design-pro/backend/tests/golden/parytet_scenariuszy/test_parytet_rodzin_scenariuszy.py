"""Testy parytetu rodzin analiz D1-D6 PRZED migracją na ``apply_scenario`` (PARITY-CV3).

Zob. ``harness.py`` dla mechanizmu, katalogu sieć×rodzina×wariant i uzasadnienia
decyzji (w tym jedynej odmowy — D6 nie używa sieci złotej).

Trzy testy:
1. każdy hash obliczony przez harness == złoty hash zapisany w ``zlote_hashe.json``
   (sparametryzowany po kluczach pliku złotego — czerwony test nazywa DOKŁADNIE,
   który wariant rodziny/sieci stracił parytet);
2. zbiór kluczy pliku złotego == zbiór kluczy, które harness dziś liczy (nikt
   nie dołożył rodziny/wariantu bez złotego hasha ani nie usunął hasha po cichu);
3. dwa kolejne przebiegi harnessu dają identyczne hashe (determinizm — zero
   losowości, zero zależności od kolejności/zegara, zob. decyzja inżynierska
   w ``harness.py``).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from enm.canonical_analysis import reset_canonical_runs
from enm.store import reset_enm_store

from tests.golden.parytet_scenariuszy.harness import zbierz_hashe

_PLIK_ZLOTYCH_HASHY = Path(__file__).parent / "zlote_hashe.json"


@pytest.fixture(autouse=True)
def _reset() -> None:
    # Harness sam nie dotyka magazynu ENM ani repozytorium biegów (decyzja
    # inżynierska w ``harness.py``), ale reset jest tu mimo to — zero
    # zależności od kolejności testów, ten sam wzorzec co w testach D1-D5/D6.
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _wczytaj_zlote_hashe() -> dict[str, dict[str, Any]]:
    return json.loads(_PLIK_ZLOTYCH_HASHY.read_text(encoding="utf-8"))


_ZLOTE_HASHE = _wczytaj_zlote_hashe()


@pytest.fixture(scope="module")
def _obliczone_hashe() -> dict[str, dict[str, Any]]:
    # Modułowy zakres: harness jest czystą funkcją bez magazynu/dysku (patrz
    # ``harness.py``), więc liczenie go RAZ dla całego modułu jest bezpieczne
    # (żaden test nie zależy od izolacji per-test tej wartości) i utrzymuje
    # całą suitę w budżecie czasu karty (< 60 s).
    return zbierz_hashe()


@pytest.mark.parametrize("klucz", sorted(_ZLOTE_HASHE))
def test_hash_zgodny_ze_zlotym(klucz: str, _obliczone_hashe: dict[str, dict[str, Any]]) -> None:
    obliczony = _obliczone_hashe[klucz]["sha256"]
    zloty = _ZLOTE_HASHE[klucz]["sha256"]
    assert obliczony == zloty, (
        f"Hash rodziny/sieci/wariantu {klucz!r} zmienił się względem stanu "
        "sprzed migracji na apply_scenario (karta PARITY-CV3) — parytet NIE "
        "jest zachowany. Jeśli zmiana wyniku jest ZAMIERZONA i uzasadniona "
        "semantycznie w commicie, uruchom regeneruj.py świadomie; w "
        "przeciwnym razie napraw migrację, nie hash."
    )


def test_zbior_kluczy_zgodny_z_plikiem_zlotych_hashy(
    _obliczone_hashe: dict[str, dict[str, Any]],
) -> None:
    """Nikt nie dołożył rodziny/wariantu bez złotego hasha ani nie usunął po cichu."""
    obliczone_klucze = set(_obliczone_hashe)
    zlote_klucze = set(_ZLOTE_HASHE)
    brakujace_w_pliku = obliczone_klucze - zlote_klucze
    nadmiarowe_w_pliku = zlote_klucze - obliczone_klucze
    assert not brakujace_w_pliku, (
        f"Harness liczy warianty bez złotego hasha: {sorted(brakujace_w_pliku)} — "
        "uruchom regeneruj.py, żeby dopisać złote hashe nowych wariantów."
    )
    assert not nadmiarowe_w_pliku, (
        f"Plik złotych hashy niesie warianty, których harness już nie liczy: "
        f"{sorted(nadmiarowe_w_pliku)} — usunięcie rodziny/wariantu wymaga też "
        "usunięcia jego złotego hasha (nie po cichu)."
    )


def test_dwa_kolejne_przebiegi_daja_identyczne_hashe() -> None:
    """Determinizm: to samo wejście (harness) = ten sam wynik, dwa razy z rzędu."""
    pierwszy = zbierz_hashe()
    drugi = zbierz_hashe()
    assert {k: v["sha256"] for k, v in pierwszy.items()} == {
        k: v["sha256"] for k, v in drugi.items()
    }
