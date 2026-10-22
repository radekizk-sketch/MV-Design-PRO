"""Dowód parametrów linii 110 kV z geometrii słupa — rejestr równań, dokument i pakiet ZIP.

NOT-A-SOLVER: dowód przepisuje ślad White Box solvera ``parametry_linii_napowietrznej``; równanie
każdego kroku pochodzi z rejestru ``registries/ohl_equations.py`` wybierane po kodzie kroku ORAZ
identycznym wzorze. Iloczyn cech śladu:

    przewód {AFL-6 240, AFL-6 185, przewód z GMR z tablicy wyrobu}
      × geometria {projekt, wartość robocza}
      × przewód odgromowy {jest, brak}
      × wiązka {1, 2}

— każda kombinacja daje kroki, których wzory są w rejestrze (i odwrotnie: każde równanie rejestru
jest użyte przez jakąś kombinację), a dokument ma zgodne jednostki, wynik i ostrzeżenia
o kompletności dowodu (zasada nr 4: wartości robocze → NIEPEŁNY z daną przyjętą ESTIMATED).
"""

from __future__ import annotations

import io
import itertools
import json
import zipfile
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.packs.parametry_linii_110kv import (
    ParametryLinii110kVProof,
    ParametryLiniiDowodInput,
    rozroznik_linii,
)
from application.proof_engine.proof_pack import ProofPackContext
from application.proof_engine.registries.ohl_equations import (
    KOD_KROKU_NA_ROWNANIE,
    OHL_EQUATIONS,
    rownanie_kroku,
)
from application.proof_engine.types import ProofType
from enm.parametry_linii_wn import dane_przewodu
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.wartosci_robocze import (
    FAZY_SLUPA_TYPOWEGO_M,
    ODGROMOWE_SLUPA_TYPOWEGO_M,
    PRZEWOD_ODGROMOWY_ROBOCZY_REF,
)
from network_model.solvers.parametry_linii_napowietrznej import (
    DanePrzewodu,
    GeometriaLinii,
    ParametryLiniiNapowietrznej,
    PolozeniePrzewodu,
    WejscieParametrowLinii,
    oblicz_parametry_linii,
)
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality

AFL6_240 = "przewod-wn-243-al1-39-st1a"
AFL6_185 = "przewod-wn-184-al1-30-st1a"
GMR_Z_TABLICY = "gmr-z-tablicy"
CZAS = datetime(2026, 1, 1, tzinfo=UTC)
KONTEKST = ProofPackContext(
    project_id="projekt", case_id="przypadek", run_id="bieg", snapshot_id="migawka"
)


def _przewod(ref: str) -> DanePrzewodu:
    if ref == GMR_Z_TABLICY:
        bazowy = _przewod(AFL6_240)
        return replace(bazowy, identyfikator=GMR_Z_TABLICY, gmr_mm=8.86, warstwy_al=())
    typ = get_default_mv_catalog().get_overhead_conductor_type(ref)
    assert typ is not None
    return dane_przewodu(typ.to_dict(), nazwa=typ.name)


def _wejscie(przewod: str, geometria: str, odgromowy: bool, wiazka: int) -> WejscieParametrowLinii:
    fazy, odgromowe = (
        (((-4.5, 16.0), (0.0, 16.0), (4.5, 16.0)), ((0.0, 22.0),))
        if geometria == "projekt"
        else (FAZY_SLUPA_TYPOWEGO_M, ODGROMOWE_SLUPA_TYPOWEGO_M)
    )
    f = tuple(PolozeniePrzewodu(x, y) for x, y in fazy)
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()
    if geometria == "robocza":
        dane_przyjete = (
            DanaPrzyjeta(
                nazwa_pl="Geometria słupa",
                wartosc=Wielkosc(wartosc=15.0, jednostka="m"),
                powod_pl="Projekt nie podaje położeń przewodów — słup typowy.",
                jakosc=FieldQuality.ESTIMATED,
            ),
        )
    return WejscieParametrowLinii(
        przewod_fazowy=_przewod(przewod),
        geometria=GeometriaLinii(
            fazy=(f[0], f[1], f[2]),
            odgromowe=(tuple(PolozeniePrzewodu(x, y) for x, y in odgromowe) if odgromowy else ()),
            liczba_w_wiazce=wiazka,
            odstep_wiazki_m=0.4 if wiazka > 1 else None,
        ),
        rezystywnosc_gruntu_ohm_m=100.0,
        czestotliwosc_hz=50.0,
        temperatura_przewodu_c=80.0,
        przewod_odgromowy=(_przewod(PRZEWOD_ODGROMOWY_ROBOCZY_REF) if odgromowy else None),
        dane_przyjete=dane_przyjete,
    )


ILOCZYN = list(
    itertools.product(
        [AFL6_240, AFL6_185, GMR_Z_TABLICY], ["projekt", "robocza"], [True, False], [1, 2]
    )
)


def _wynik(*cechy: object) -> ParametryLiniiNapowietrznej:
    return oblicz_parametry_linii(_wejscie(*cechy))  # type: ignore[arg-type]


def _dane_dowodu(
    wynik: ParametryLiniiNapowietrznej, *, zgodny: bool = True
) -> ParametryLiniiDowodInput:
    return ParametryLiniiDowodInput(
        project_name="Projekt",
        case_name="Przypadek",
        run_timestamp=CZAS,
        branch_ref="L1",
        nazwa_linii="Linia 110 kV A–B",
        wynik=wynik,
        zgodny_z_modelem=zgodny,
    )


# ---------------------------------------------------------------------------
# Rejestr równań ↔ ślad solvera (dwa kierunki)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("cechy", ILOCZYN)
def test_kazdy_krok_sladu_ma_identyczne_rownanie_w_rejestrze(cechy: tuple) -> None:
    wynik = _wynik(*cechy)
    for krok in wynik.slad:
        rownanie = rownanie_kroku(krok.kod, krok.wzor_latex)
        assert rownanie.latex == krok.wzor_latex
        # Symbol wyniku i wejścia kroku = symbole równania (ten sam opis wielkości).
        assert rownanie.symbols[0].symbol == krok.wynik.symbol
        assert [s.symbol for s in rownanie.symbols[1:]] == [w.symbol for w in krok.wejscia]
        assert [s.unit for s in rownanie.symbols[1:]] == [w.jednostka for w in krok.wejscia]


def test_kazde_rownanie_rejestru_jest_uzyte_przez_slad() -> None:
    uzyte = {
        rownanie_kroku(krok.kod, krok.wzor_latex).equation_id
        for cechy in ILOCZYN
        for krok in _wynik(*cechy).slad
    }
    assert uzyte == set(OHL_EQUATIONS)
    kody = {krok.kod for cechy in ILOCZYN for krok in _wynik(*cechy).slad}
    assert kody == set(KOD_KROKU_NA_ROWNANIE)


def test_rownania_linii_sa_w_rejestrze_globalnym() -> None:
    for equation_id, rownanie in OHL_EQUATIONS.items():
        assert EquationRegistry.get_equation(equation_id) == rownanie


def test_rozjazd_wzoru_solvera_z_rejestrem_jest_odmowa() -> None:
    krok = _wynik(AFL6_240, "projekt", True, 1).slad[0]
    # Błąd programu (rejestr i solver rozjechane), nie odmowa danych — asercja.
    with pytest.raises(AssertionError, match="rozjechały"):
        rownanie_kroku(krok.kod, krok.wzor_latex + r" + 0")


# ---------------------------------------------------------------------------
# Dokument dowodu: kroki, jednostki, wyniki, ostrzeżenia
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("cechy", ILOCZYN)
def test_dokument_przepisuje_slad_z_kontrola_jednostek(cechy: tuple) -> None:
    wynik = _wynik(*cechy)
    dokument = ParametryLinii110kVProof.generate(_dane_dowodu(wynik), UUID(int=1))
    assert dokument.proof_type is ProofType.OVERHEAD_LINE_PARAMETERS
    assert len(dokument.steps) == len(wynik.slad) == dokument.summary.total_steps
    assert dokument.summary.unit_check_passed
    for krok_dowodu, krok in zip(dokument.steps, wynik.slad, strict=True):
        assert krok_dowodu.source_keys["kod_kroku"] == krok.kod
        assert krok_dowodu.result.value == krok.wynik.wartosc
        assert [v.value for v in krok_dowodu.input_values] == [w.wartosc for w in krok.wejscia]
        assert krok.podstawienie_latex in krok_dowodu.substitution_latex
    wyniki = dokument.summary.key_results
    assert wyniki["r1_ohm_per_km"].value == wynik.r1_ohm_per_km
    assert wyniki["x0_ohm_per_km"].value == wynik.x0_ohm_per_km
    assert wyniki["b1_us_per_km"].value == pytest.approx(wynik.b1_s_per_km * 1e6, rel=1e-12)
    ostrzezenia = " ".join(dokument.summary.warnings)
    if cechy[1] == "robocza":
        assert "NIEPEŁNY" in ostrzezenia
        assert "Dana przyjęta (ESTIMATED): Geometria słupa = 15 m" in ostrzezenia
    else:
        assert "NIEPEŁNY" not in ostrzezenia
        assert "Dana przyjęta" not in ostrzezenia


def test_dowod_niezgodny_z_modelem_mowi_to_wprost() -> None:
    wynik = _wynik(AFL6_240, "projekt", True, 1)
    zgodny = ParametryLinii110kVProof.generate(_dane_dowodu(wynik), UUID(int=1))
    niezgodny = ParametryLinii110kVProof.generate(_dane_dowodu(wynik, zgodny=False), UUID(int=1))
    assert not any("przelicz model" in o for o in zgodny.summary.warnings)
    assert any("przelicz model" in o for o in niezgodny.summary.warnings)


def test_jednostka_kroku_rozna_od_rejestru_oblewa_kontrole_jednostek() -> None:
    wynik = _wynik(AFL6_240, "projekt", True, 1)
    krok = wynik.slad[0]
    zepsuty = replace(krok, wynik=replace(krok.wynik, jednostka="Ω/m"))
    zly = replace(wynik, slad=(zepsuty, *wynik.slad[1:]))
    dokument = ParametryLinii110kVProof.generate(_dane_dowodu(zly), UUID(int=1))
    assert not dokument.summary.unit_check_passed
    assert not dokument.steps[0].unit_check.passed


# ---------------------------------------------------------------------------
# Pakiet ZIP: zawartość i determinizm
# ---------------------------------------------------------------------------


def test_pakiet_zip_jest_deterministyczny_i_kompletny() -> None:
    wynik = _wynik(AFL6_240, "robocza", True, 1)
    a = ParametryLinii110kVProof.generate_zip(_dane_dowodu(wynik), KONTEKST)
    b = ParametryLinii110kVProof.generate_zip(
        _dane_dowodu(_wynik(AFL6_240, "robocza", True, 1)), KONTEKST
    )
    assert a == b
    with zipfile.ZipFile(io.BytesIO(a)) as archiwum:
        wpisy = set(archiwum.namelist())
        assert {
            "proof_pack/proof.json",
            "proof_pack/proof.tex",
            "proof_pack/manifest.json",
        } <= wpisy
        dowod = json.loads(archiwum.read("proof_pack/proof.json"))
        tex = archiwum.read("proof_pack/proof.tex").decode("utf-8")
    assert dowod["proof_type"] == ProofType.OVERHEAD_LINE_PARAMETERS.value
    assert dowod["summary"]["unit_check_passed"] is True
    assert dowod["summary"]["total_steps"] == len(wynik.slad)
    # Każdy wzór śladu jest w źródle LaTeX dokumentu.
    for krok in wynik.slad:
        assert krok.wzor_latex in tex


def test_rozroznik_linii_zmienia_tozsamosc_dokumentu() -> None:
    wynik = _wynik(AFL6_240, "projekt", True, 1)
    a = ParametryLinii110kVProof.generate_zip(_dane_dowodu(wynik), KONTEKST)
    b = ParametryLinii110kVProof.generate_zip(
        replace(_dane_dowodu(wynik), branch_ref="L2"), KONTEKST
    )
    assert rozroznik_linii("L1") == "parametry_linii__L1"
    assert a != b
