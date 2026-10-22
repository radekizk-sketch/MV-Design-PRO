"""Stan łącznika w CGMES (karta W5-C): dwa pojęcia, dwa atrybuty.

``Switch.normalOpen`` [EQ] = pozycja normalna z projektu (``normal_state``), ``Switch.open``
[SSH] = bieżące położenie (``status``). Dawny eksport pisał ``normalOpen`` z ``status`` —
otwarcie łącznika operacją ruchową wychodziło z systemu jako punkt podziału sieci.

Iloczyn: ``normal_state`` ∈ {None, open, closed} × ``status`` ∈ {open, closed} × droga
importu ∈ {pełny pakiet z mapą odwołań, sam EQ+TP (plik obcy)}; bezpiecznik × ``status``;
plik obcy bez ``Switch.open`` (wyłącznie profil EQ) × ``normalOpen`` ∈ {true, false, brak}.
"""

from __future__ import annotations

import io
import itertools
import re
import zipfile

import pytest
from application.cgmes.service import export_cgmes, import_cgmes
from enm.models import EnergyNetworkModel, FuseBranch, SwitchBranch
from infrastructure.cgmes.cgmes_importer import import_from_eq_tp

from .golden_enm import build_golden_enm

LACZNIK = "sw_coupler"
BEZPIECZNIK = "fuse_c"


def _siec(normal_state: str | None, status: str, status_bezpiecznika: str) -> EnergyNetworkModel:
    enm = build_golden_enm()
    galezie = []
    for galaz in enm.branches:
        if isinstance(galaz, SwitchBranch) and galaz.ref_id == LACZNIK:
            galaz = galaz.model_copy(update={"normal_state": normal_state, "status": status})
        if isinstance(galaz, FuseBranch) and galaz.ref_id == BEZPIECZNIK:
            galaz = galaz.model_copy(update={"status": status_bezpiecznika})
        galezie.append(galaz)
    return enm.model_copy(update={"branches": galezie})


def _eq_tp(enm: EnergyNetworkModel) -> tuple[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(export_cgmes(enm))) as zf:
        return zf.read("EQ.xml").decode("utf-8"), zf.read("TP.xml")


def _blok(eq: str, klasa: str, nazwa: str) -> str:
    """Blok XML obiektu CIM o danej nazwie (``IdentifiedObject.name``)."""
    for blok in re.findall(rf"<cim:{klasa} .*?</cim:{klasa}>", eq, flags=re.S):
        if f"<cim:IdentifiedObject.name>{nazwa}</cim:IdentifiedObject.name>" in blok:
            return blok
    raise AssertionError(f"brak obiektu {klasa} {nazwa!r}")


def _galaz(enm: EnergyNetworkModel, nazwa: str) -> SwitchBranch | FuseBranch:
    (galaz,) = (g for g in enm.branches if g.name == nazwa)
    assert isinstance(galaz, SwitchBranch | FuseBranch)
    return galaz


ILOCZYN = list(itertools.product([None, "open", "closed"], ["open", "closed"]))


@pytest.mark.parametrize(("normal_state", "status"), ILOCZYN)
def test_eksport_rozdziela_pozycje_normalna_i_biezace_polozenie(
    normal_state: str | None, status: str
) -> None:
    eq, _ = _eq_tp(_siec(normal_state, status, "closed"))
    blok = _blok(eq, "Breaker", "Sprzęgło Q1")
    oczekiwany_open = "true" if status == "open" else "false"
    assert f"<cim:Switch.open>{oczekiwany_open}</cim:Switch.open>" in blok
    if normal_state is None:
        assert "Switch.normalOpen" not in blok, "pozycja normalna wyprowadzona z położenia"
    else:
        oczekiwany = "true" if normal_state == "open" else "false"
        assert f"<cim:Switch.normalOpen>{oczekiwany}</cim:Switch.normalOpen>" in blok


@pytest.mark.parametrize(("normal_state", "status"), ILOCZYN)
@pytest.mark.parametrize("droga", ["pakiet_z_mapa", "plik_obcy"])
def test_import_odtwarza_oba_pojecia(normal_state: str | None, status: str, droga: str) -> None:
    enm = _siec(normal_state, status, "open")
    if droga == "pakiet_z_mapa":
        wynik = import_cgmes(export_cgmes(enm))
    else:
        eq, tp = _eq_tp(enm)
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
    assert wynik.enm is not None
    lacznik = _galaz(wynik.enm, "Sprzęgło Q1")
    assert isinstance(lacznik, SwitchBranch)
    assert (lacznik.normal_state, lacznik.status) == (normal_state, status)
    bezpiecznik = _galaz(wynik.enm, "Bezpiecznik C")
    assert isinstance(bezpiecznik, FuseBranch) and bezpiecznik.status == "open"


@pytest.mark.parametrize("status", ["open", "closed"])
def test_bezpiecznik_bez_pozycji_normalnej(status: str) -> None:
    eq, _ = _eq_tp(_siec(None, "closed", status))
    blok = _blok(eq, "Fuse", "Bezpiecznik C")
    assert "Switch.normalOpen" not in blok
    assert f"<cim:Switch.open>{'true' if status == 'open' else 'false'}</cim:Switch.open>" in blok


@pytest.mark.parametrize(
    ("normal_open", "oczekiwane"),
    [("true", ("open", "open")), ("false", ("closed", "closed")), (None, (None, "closed"))],
)
def test_plik_obcy_wylacznie_eq_startuje_w_ukladzie_normalnym(
    normal_open: str | None, oczekiwane: tuple[str | None, str]
) -> None:
    """Plik bez profilu SSH (brak ``Switch.open``): bieżące położenie = pozycja normalna;
    bez obu atrybutów — zamknięty (wartość domyślna atrybutu w CIM), pozycja niezadeklarowana."""
    eq, tp = _eq_tp(_siec("closed", "closed", "closed"))
    blok = _blok(eq, "Breaker", "Sprzęgło Q1")
    nowy = re.sub(r"\s*<cim:Switch\.open>.*?</cim:Switch\.open>", "", blok)
    nowy = re.sub(r"\s*<cim:Switch\.normalOpen>.*?</cim:Switch\.normalOpen>", "", nowy)
    if normal_open is not None:
        nowy = nowy.replace(
            "</cim:Breaker>",
            f"<cim:Switch.normalOpen>{normal_open}</cim:Switch.normalOpen></cim:Breaker>",
        )
    wynik = import_from_eq_tp(eq.replace(blok, nowy).encode("utf-8"), tp)
    assert wynik.enm is not None
    lacznik = _galaz(wynik.enm, "Sprzęgło Q1")
    assert isinstance(lacznik, SwitchBranch)
    assert (lacznik.normal_state, lacznik.status) == oczekiwane
