"""Rejestr sieci wzorcowych: spójność, wykonalność budowniczych, dokument generowany, zapadka pokrycia."""

from __future__ import annotations

from pathlib import Path

import pytest
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel
from enm.validator import ENMValidator

from tests.golden import registry
from tests.golden.registry import (
    REJESTR,
    KlasaWyroczni,
    PostacSieci,
    RodzinaSolvera,
    StatusSieci,
)

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


#: Pomiar 2026-09-04: budowniczowie zwracający dialekt benchmarków (nie ENM). Zapadka w obie
#: strony — liczba może tylko MALEĆ (CV-4 zwija benchmarki w ENM przez kanoniczny assembler).
BENCHMARK_DICT_ZASTANE: dict[str, int] = {"G07": 1, "B-BENCH": 12}

#: Pomiar 2026-09-04: liczba problemów BLOCKER walidatora ENM per wpis (suma po sieciach wpisu).
#: G04/G05: 18 scenariuszy nN celowo obejmuje stany konfliktowe (źródła równoległe, sekcja bez
#: zasilania) — BLOCKER jest tam treścią scenariusza. G00 (substrat 52 stacji, SUB-52s, naprawa
#: 2026-09-04): było 21 blokerów (20× E063 — stacje bez deklaracji układu sieci nN, 1× E003 —
#: wyspa za łącznikiem NOP bez toru do źródła); naprawione u źródła w
#: `tests/reference_networks/sld_substrate_52s.py` (deklaracja `nn_earthing.lv_system=TN-C-S`
#: przy budowie stacji + zamknięcie pierścienia do sąsiedniego odgałęzienia zamiast martwego
#: końca za NOP) — 0 pozostałych blokerów. Zapadka w obie strony.
BLOKERY_ZASTANE: dict[str, int] = {"G04": 15, "G05": 15, "G00": 0}

#: Wpisy, których determinizm budowy (dwie budowy → ten sam hash) pomijamy tu ze względu na koszt
#: budowy (G00: ok. 40 s) — determinizm substratu pilnuje `tests/reference_networks/sld_substrate_52s.py`.
POMIN_DETERMINIZM: frozenset[str] = frozenset({"G00"})


def _jako_enm(siec: object) -> EnergyNetworkModel:
    return siec if isinstance(siec, EnergyNetworkModel) else EnergyNetworkModel.model_validate(siec)


@pytest.mark.parametrize("id_", [w.id for w in REJESTR if w.budowniczowie])
def test_postac_sieci_zgodna_z_deklaracja_i_zapadka_dialektu(id_: str) -> None:
    w = registry.wpis(id_)
    sieci = registry.zbuduj_wszystkie(id_)
    niepoprawne = 0
    for siec in sieci:
        try:
            _jako_enm(siec)
        except Exception:
            niepoprawne += 1
    if w.postac is PostacSieci.ENM:
        assert (
            niepoprawne == 0
        ), f"{id_}: {niepoprawne} sieci nie waliduje się jako ENM mimo deklaracji ENM"
    else:
        assert niepoprawne == BENCHMARK_DICT_ZASTANE.get(id_), (
            f"{id_}: dialekt benchmarków w {niepoprawne} sieciach, zapadka {BENCHMARK_DICT_ZASTANE.get(id_)} — "
            "zaktualizuj zapadkę (może tylko maleć)"
        )


@pytest.mark.parametrize(
    "id_", [w.id for w in REJESTR if w.budowniczowie and w.postac is PostacSieci.ENM]
)
def test_sieci_enm_sa_deterministyczne_i_blokery_nie_rosna(id_: str) -> None:
    pierwsza = [_jako_enm(s) for s in registry.zbuduj_wszystkie(id_)]
    if id_ not in POMIN_DETERMINIZM:
        druga = [_jako_enm(s) for s in registry.zbuduj_wszystkie(id_)]
        assert [compute_enm_hash(a) for a in pierwsza] == [
            compute_enm_hash(b) for b in druga
        ], f"{id_}: dwie budowy dają różne hashe — budowniczy niedeterministyczny"
    blokery = 0
    for enm in pierwsza:
        wynik = ENMValidator().validate(enm)
        for problem in getattr(wynik, "issues", None) or []:
            if str(getattr(problem, "severity", "")).split(".")[-1].upper() == "BLOCKER":
                blokery += 1
    assert blokery == BLOKERY_ZASTANE.get(id_, 0), (
        f"{id_}: BLOCKER walidatora = {blokery}, zapadka {BLOKERY_ZASTANE.get(id_, 0)} — "
        "nadwyżka = regresja modelu, niedobór = obniż zapadkę (utrwal poprawę)"
    )
