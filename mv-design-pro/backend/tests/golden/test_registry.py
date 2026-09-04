"""Rejestr sieci wzorcowych: spójność, wykonalność budowniczych, dokument generowany, zapadka pokrycia."""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.golden import registry
from tests.golden.registry import REJESTR, KlasaWyroczni, RodzinaSolvera, StatusSieci

DOKUMENT = Path(__file__).resolve().parents[3] / "docs" / "reference-networks" / "REGISTRY_TABLE.md"


def test_identyfikatory_unikalne_i_komplet_kontraktu() -> None:
    ids = [w.id for w in REJESTR]
    assert len(ids) == len(set(ids))
    assert {f"G{i:02d}" for i in range(1, 16)} <= set(ids), "kontrakt §30 wymaga G01–G15"


def test_wpis_z_wyrocznia_niezalezna_ma_zrodlo() -> None:
    for w in REJESTR:
        for wy in w.wyrocznie:
            if wy.klasa is not KlasaWyroczni.REGRESSION_ONLY:
                assert wy.zrodlo, f"{w.id}: wyrocznia {wy.klasa.value} bez źródła"
                assert wy.rodziny, f"{w.id}: wyrocznia {wy.klasa.value} bez rodziny solvera"


def test_wpis_not_built_nie_ma_budowniczych_a_supported_ma() -> None:
    for w in REJESTR:
        if w.status is StatusSieci.NOT_BUILT:
            assert not w.budowniczowie, f"{w.id}: NOT_BUILT z budowniczym — status kłamie"
        if w.status is StatusSieci.SUPPORTED:
            assert w.budowniczowie and any(
                wy.klasa is not KlasaWyroczni.REGRESSION_ONLY for wy in w.wyrocznie
            ), f"{w.id}: SUPPORTED bez budowniczego albo bez niezależnej wyroczni"


@pytest.mark.parametrize("id_", [w.id for w in REJESTR if w.budowniczowie])
def test_budowniczowie_sa_wykonalni(id_: str) -> None:
    sieci = registry.zbuduj_wszystkie(id_)
    assert sieci, f"{id_}: budowniczy nie zwrócił żadnej sieci"
    for siec in sieci:
        # ENM (Pydantic) albo słownik ENM albo NetworkGraph — każdy niesie szyny/węzły.
        ma_szyny = (
            bool(getattr(siec, "buses", None))
            or (isinstance(siec, dict) and bool(siec.get("buses") or siec.get("nodes")))
            or bool(getattr(siec, "nodes", None))
        )
        assert ma_szyny, f"{id_}: zbudowana sieć bez szyn/węzłów ({type(siec).__name__})"


def test_dokument_generowany_jest_aktualny() -> None:
    assert DOKUMENT.exists(), "uruchom: python scripts/generuj_rejestr_sieci.py"
    assert (
        DOKUMENT.read_text(encoding="utf-8") == registry.tabela_markdown()
    ), "REGISTRY_TABLE.md nieaktualny — uruchom scripts/generuj_rejestr_sieci.py"


#: Zapadka pokrycia (pomiar 2026-09-04): rodziny z niezależną wyrocznią. Może tylko ROSNĄĆ.
POKRYCIE_ZASTANE: dict[RodzinaSolvera, set[KlasaWyroczni]] = {
    RodzinaSolvera.LF: {KlasaWyroczni.INDEPENDENTLY_VERIFIED, KlasaWyroczni.PUBLISHED_BENCHMARK},
    RodzinaSolvera.SC: {KlasaWyroczni.INDEPENDENTLY_VERIFIED, KlasaWyroczni.NORMATIVE},
    RodzinaSolvera.EARTH_FAULT: {
        KlasaWyroczni.ANALYTICAL
    },  # zadeklarowana dla G01 (NOT_BUILT) — test G01 ją przypnie
    RodzinaSolvera.PROTECTION: {KlasaWyroczni.NORMATIVE},
}


def test_pokrycie_rodzin_wyroczniami_nie_maleje() -> None:
    pokrycie = registry.pokrycie_rodzin()
    for rodzina, klasy in POKRYCIE_ZASTANE.items():
        assert (
            klasy <= pokrycie[rodzina]
        ), f"{rodzina.value}: pokrycie zmalało ({pokrycie[rodzina]})"
    nowe = {
        r: k
        for r, k in pokrycie.items()
        if k and k != POKRYCIE_ZASTANE.get(r, set()) and not (k <= POKRYCIE_ZASTANE.get(r, set()))
    }
    assert not nowe, f"pokrycie wzrosło — podnieś POKRYCIE_ZASTANE (utrwal poprawę): {nowe}"
