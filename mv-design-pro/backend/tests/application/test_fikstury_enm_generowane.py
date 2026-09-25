"""Statyczne fikstury ENM i scen SLD frontendu są BAJTOWO równe generatorom (karta SLD-SUBSTRAT).

Inwentarz karty: każdy plik JSON z modelem ENM albo sceną SLD w ``frontend/src`` i
``frontend/public`` ma generator z backendu i test świeżości. Ten moduł pilnuje generatorów
spoza substratu 52 stacji (ten ma ``test_fikstury_substratu_sld.py``) i spoza harnessu scen
(``tests/ci/test_fixtury_harnessu.py``):

* ``tests/reference_networks/fikstury_enm_sld.py`` — sieci kontraktów SLD v3 (API w procesie);
* ``frontend/scripts/demo-siec-pokazowa/generate-fixture.py`` — ``pomiarOdgalezienie``;
* ``frontend/scripts/generate-demo-oze-sc.py`` — sieć DEMO-OZE-SC i jej bieg zwarciowy.

Ta sama technika co ``test_companions_generated.py``: generator w procesie testu, porównanie
bajtowe, komunikat z komendą regeneracji; plus pokrycie w drugą stronę (plik ENM w katalogach
fikstur, którego żaden generator nie zna, jest czerwony).
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

from tests.golden.zapis_fikstur import zaokraglij_liczby
from tests.reference_networks.fikstury_enm_sld import (
    FRONTEND,
    KOMENDA_REGENERACJI,
    render_fikstur_enm_sld,
)
from tests.reference_networks.sld_substrate_fixtures import render_fikstur_substratu

_SKRYPTY = FRONTEND / "scripts"


def _skrypt(sciezka: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(sciezka.stem.replace("-", "_"), sciezka)
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


@pytest.fixture(scope="module")
def sieci_sld() -> dict[str, str]:
    return render_fikstur_enm_sld()


@pytest.fixture(scope="module")
def siec_pokazowa() -> ModuleType:
    return _skrypt(_SKRYPTY / "demo-siec-pokazowa" / "generate-fixture.py")


@pytest.fixture(scope="module")
def demo_oze_sc() -> ModuleType:
    return _skrypt(_SKRYPTY / "generate-demo-oze-sc.py")


def _rozjechane(tresci: dict[str, str], katalog: Path) -> list[str]:
    return [
        sciezka
        for sciezka, tresc in sorted(tresci.items())
        if not (katalog / sciezka).exists()
        or (katalog / sciezka).read_text(encoding="utf-8") != tresc
    ]


def test_sieci_kontraktow_sld_sa_bajtowo_rowne_generatorowi(sieci_sld: dict[str, str]) -> None:
    rozjechane = _rozjechane(sieci_sld, FRONTEND)
    assert not rozjechane, f"fikstury ROZJECHANE z generatorem: {rozjechane}. {KOMENDA_REGENERACJI}"


def test_generator_sieci_sld_jest_deterministyczny(sieci_sld: dict[str, str]) -> None:
    assert render_fikstur_enm_sld() == sieci_sld


def test_siec_pokazowa_jest_bajtowo_rowna_generatorowi(siec_pokazowa: ModuleType) -> None:
    tresc = siec_pokazowa.render_fikstury()
    assert siec_pokazowa._WYJSCIE.read_text(encoding="utf-8") == tresc, (
        "pomiarOdgalezienie.enm.json ROZJECHANA — zregeneruj: cd mv-design-pro/backend && "
        "poetry run python ../frontend/scripts/demo-siec-pokazowa/generate-fixture.py"
    )
    assert siec_pokazowa.render_fikstury() == tresc


def test_demo_oze_sc_jest_bajtowo_rowne_generatorowi(demo_oze_sc: ModuleType) -> None:
    tresci = demo_oze_sc.render_fikstur()
    rozjechane = _rozjechane(tresci, demo_oze_sc._OUT_DIR)
    assert not rozjechane, (
        f"fikstury DEMO-OZE-SC ROZJECHANE: {rozjechane} — zregeneruj: cd mv-design-pro/backend "
        "&& poetry run python ../frontend/scripts/generate-demo-oze-sc.py"
    )
    assert demo_oze_sc.render_fikstur() == tresci


def test_kazdy_model_enm_w_katalogach_fikstur_ma_generator(
    sieci_sld: dict[str, str], siec_pokazowa: ModuleType
) -> None:
    """Pokrycie w DRUGĄ stronę: plik z modelem ENM (klucz ``buses``) w katalogach fikstur
    SLD i ``public/test-fixtures``, którego nie wytwarza żaden generator, byłby ręcznym
    artefaktem podszywającym się pod „model z backendu"."""
    generowane = set(sieci_sld) | set(render_fikstur_substratu())
    generowane.add(str(siec_pokazowa._WYJSCIE.relative_to(FRONTEND)))
    katalogi = (
        "public/test-fixtures",
        "src/ui/sld/v2/geometry/__tests__/fixtures",
        "src/ui/sld/v3/scene/__tests__/fixtures",
        "src/ui/sld/v3/canvas/__tests__/fixtures",
    )
    z_modelem = {
        str(p.relative_to(FRONTEND))
        for k in katalogi
        for p in (FRONTEND / k).glob("*.json")
        if '"buses"' in p.read_text(encoding="utf-8")
    }
    assert z_modelem - generowane == set()


def test_fikstury_spelniaja_regule_zapisu_liczb(sieci_sld: dict[str, str]) -> None:
    for sciezka, tresc in sieci_sld.items():
        dane = json.loads(tresc)
        assert zaokraglij_liczby(dane) == dane, sciezka
