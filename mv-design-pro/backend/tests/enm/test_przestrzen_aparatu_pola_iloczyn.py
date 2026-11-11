"""Przestrzeń katalogu aparatu pierwotnego pola SN — jedna mapa dla operacji i bramy API.

Karta JEDEN-KLUCZ-KATALOGU, decyzja architekta 2: dawna tablica
``enm.wyposazenie_pola.PRZESTRZEN_KATALOGU_APARATU`` (rodzaj aparatu → przestrzeń) była DRUGĄ
mapą obok ``enm.wiazanie_katalogowe.PRZESTRZENIE_RODZAJU``. Jedyne źródło to teraz wpisy
``aparat_pola.<rodzaj>`` tej mapy (``przestrzen_aparatu_pola``), czytane przez operację
``set_bay_equipment``, bramę API (``api/domain_ops_policy.py``) i napięcie najwyższe aparatu.

ILOCZYN CECH: rodzaj aparatu {każdy z katalogiem SN} × pozycja z przestrzeni {APARAT_SN, CT,
VT, OGRANICZNIK_SN} × droga {operacja domenowa, brama API} — przyjęcie wyłącznie dla pozycji
z przestrzeni rodzaju, ten sam werdykt w obu drogach; mapa bez drugiej kopii w kodzie.
"""

from __future__ import annotations

import ast
import copy
from pathlib import Path
from typing import Any

import pytest
from api.domain_ops_policy import CatalogPolicyError, validate_and_materialize_catalog_binding
from enm import wyposazenie_pola
from enm.domain_operations import execute_domain_operation
from enm.wiazanie_katalogowe import (
    PRZESTRZENIE_RODZAJU,
    RODZAJE_APARATU_POLA_Z_KATALOGIEM,
    przestrzen_aparatu_pola,
)
from enm.wyposazenie_pola import RODZAJE_BEZ_KATALOGU_SN, RODZAJE_KATALOGOWE_APARATU

from tests.enm.test_wyposazenie_pola import _ref_aparatu_sn, _ref_przestrzeni, _siec_z_polami

ZRODLA = Path(__file__).resolve().parents[2] / "src"
PRZESTRZENIE = ("APARAT_SN", "CT", "VT", "OGRANICZNIK_SN")


def _pozycja(przestrzen: str, rodzaj: str) -> str:
    if przestrzen == "APARAT_SN":
        rodzaje = RODZAJE_KATALOGOWE_APARATU.get(rodzaj) or frozenset({"WYLACZNIK"})
        return _ref_aparatu_sn(sorted(rodzaje)[0])
    return _ref_przestrzeni(przestrzen)


@pytest.fixture(scope="module")
def siec() -> tuple[dict[str, Any], dict[str, str], str]:
    return _siec_z_polami()


def test_mapa_zawiera_wszystkie_rodzaje_aparatu_z_katalogiem() -> None:
    assert RODZAJE_APARATU_POLA_Z_KATALOGIEM == (
        "CB",
        "LOAD_SWITCH",
        "DS",
        "ES",
        "CT",
        "VT",
        "SURGE_ARRESTER",
        "UNBALANCE_CT",
        "PHASE_TO_PHASE_VT",
    )
    # Rodzaje bez katalogu SN nie mają przestrzeni — zbiory rozłączne.
    assert not set(RODZAJE_APARATU_POLA_Z_KATALOGIEM) & RODZAJE_BEZ_KATALOGU_SN
    for rodzaj in RODZAJE_BEZ_KATALOGU_SN:
        assert przestrzen_aparatu_pola(rodzaj) is None
    assert przestrzen_aparatu_pola("NIEZNANY") is None
    assert przestrzen_aparatu_pola(None) is None


def test_druga_mapa_przestrzeni_aparatu_nie_istnieje() -> None:
    """Żaden moduł poza ``enm/wiazanie_katalogowe.py`` nie trzyma literału słownika rodzaj
    aparatu pola → przestrzeń katalogu (dawna ``PRZESTRZEN_KATALOGU_APARATU``)."""
    assert not hasattr(wyposazenie_pola, "PRZESTRZEN_KATALOGU_APARATU")
    rodzaje = set(RODZAJE_APARATU_POLA_Z_KATALOGIEM)
    przestrzenie = {p for v in PRZESTRZENIE_RODZAJU.values() for p in v}
    naruszenia: list[str] = []
    for plik in sorted(ZRODLA.rglob("*.py")):
        if plik.name == "wiazanie_katalogowe.py" and plik.parent.name == "enm":
            continue
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Dict):
                continue
            pary = [
                (k.value, v.value)
                for k, v in zip(wezel.keys, wezel.values, strict=True)
                if isinstance(k, ast.Constant)
                and isinstance(v, ast.Constant)
                and k.value in rodzaje
                and v.value in przestrzenie
                # Mapa rodzaj → rodzaj (``CT`` → ``CT``, szablony pola) nie jest mapą
                # przestrzeni: nazwy przestrzeni przekładników pokrywają się z rodzajem.
                and k.value != v.value
            ]
            if len(pary) >= 2:
                naruszenia.append(f"{plik.relative_to(ZRODLA)}:{wezel.lineno} {pary}")
    assert naruszenia == []


@pytest.mark.parametrize("przestrzen", PRZESTRZENIE)
@pytest.mark.parametrize("rodzaj", RODZAJE_APARATU_POLA_Z_KATALOGIEM)
def test_rodzaj_x_przestrzen_pozycji_x_droga(siec: Any, rodzaj: str, przestrzen: str) -> None:
    enm, pola, _ = siec
    umiejscowienie = "GROUND_BRANCH" if rodzaj in {"ES", "SURGE_ARRESTER"} else "MIDSTREAM"
    ladunek = {
        "bay_ref": pola["IN"],
        "mode": "katalog",
        "devices": [
            {
                "kind": rodzaj,
                "placement": umiejscowienie,
                "catalog_ref": _pozycja(przestrzen, rodzaj),
            }
        ],
    }
    przyjete = przestrzen_aparatu_pola(rodzaj) == przestrzen

    # Droga 1: operacja domenowa.
    przed = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, "set_bay_equipment", ladunek)
    assert enm == przed
    if przyjete:
        assert wynik.get("error") is None, (rodzaj, przestrzen, wynik.get("error"))
    else:
        assert wynik.get("error_code") == "catalog.item_not_found", (
            "operacja",
            rodzaj,
            przestrzen,
            wynik.get("error_code"),
        )
        assert wynik["snapshot"] is None

    # Droga 2: brama API — ten sam werdykt z tej samej mapy.
    try:
        odmowa_bramy, _ = validate_and_materialize_catalog_binding("set_bay_equipment", ladunek)
    except CatalogPolicyError as odmowa:
        odmowa_bramy = odmowa
    assert (odmowa_bramy is None) is przyjete, ("brama", rodzaj, przestrzen, odmowa_bramy)
