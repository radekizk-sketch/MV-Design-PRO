"""Testy serwisu pokrycia wymaganego zakresu mocy biernej obszarem zdolności P–Q (rekord K).

Warstwa APPLICATION — porównanie wartości, ZERO fizyki. Profil operatora ``pge`` wymaga
zakresu Q ±0.33 · Pn. Pokrycie jest rekordem ``OcenaKryterium`` (odbiór Pakietu C, plan AB
O-50): widok nie ma własnego statusu ani słownika status→tekst.

ILOCZYN CECH (KLASA, NIE INSTANCJA): podstawa wymagania profilu {rozporządzenie ZWERYFIKOWANE,
operator WSKAZANE, nieustalona NIEUSTALONE} × obszar zdolności urządzenia {brak krzywej,
wszystkie punkty wewnątrz, punkt na granicy, punkt poza} × technologia typu {PV, FW, magazyn}
× jakość mocy odniesienia Pn {karta techniczna, oszacowanie}. Oczekiwania wprost z kontraktu
werdyktu (reguła K §2.2, kompletność §3) i predykatu stosowalności magazynu (O-28).
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from application.analyses.pq_coverage import (
    _DER_KIND_Z_RODZAJU,
    KRYTERIUM_POKRYCIA_PQ,
    ZDOLNOSC_POKRYCIA_PQ,
    build_pq_coverage_view,
)
from catalog.profiles.nc_rfg.loader import NcRfgProfile, load_nc_rfg_profile
from network_model.catalog.types import ConverterKind, ConverterType
from network_model.solvers.ncrfg_ptpiree.stosowalnosc import (
    POWOD_MAGAZYNU_PL,
    RODZAJE_Z_ROZPORZADZENIA,
)
from solver_input.provenance import classify_dynamic_capability
from werdykt import OcenaKryterium, PodstawaWymagania
from werdykt.proweniencja import ClaimKind, EvidenceTier

# pge: q_range_pct_pn = ±0.33; Pn = pmax_mw = 1.0 => wymaganie ±0.33 Mvar.
_PROFILE = load_nc_rfg_profile("pge")

_PODSTAWY: dict[str, PodstawaWymagania] = {
    "rozporzadzenie_zweryfikowane": PodstawaWymagania(
        rodzaj="ROZPORZADZENIE_UE",
        dokument="Rozporządzenie Komisji (UE) 2016/631",
        wydanie="2016-04-14",
        jednostka_redakcyjna="art. 20 ust. 2 lit. b",
        status="ZWERYFIKOWANE",
    ),
    "operator_wskazane": PodstawaWymagania(
        rodzaj="OSD",
        dokument="IRiESD operatora",
        wydanie="2024",
        jednostka_redakcyjna="rozdz. II",
        status="WSKAZANE",
    ),
    "nieustalona": _PROFILE.reactive_power.zrodlo,
}
#: Obszar zdolności urządzenia: brak krzywej, wewnątrz (+0,17), na granicy (0), poza (−0,13).
_OBSZARY: dict[str, tuple[tuple[float, float, float], ...] | None] = {
    "brak": None,
    "wewnatrz": ((0.0, -0.5, 0.5), (0.5, -0.5, 0.5), (1.0, -0.5, 0.5)),
    "na_granicy": ((0.0, -0.5, 0.5), (1.0, -0.33, 0.33)),
    "poza": ((0.0, -0.5, 0.5), (0.5, -0.5, 0.5), (1.0, -0.2, 0.2)),
}
_MARGINES = {"wewnatrz": 0.17, "na_granicy": 0.0, "poza": -0.13}
_RODZAJE = (ConverterKind.PV, ConverterKind.WIND, ConverterKind.BESS)
_JAKOSCI = ("DATASHEET", "ESTIMATED")


def _profil(podstawa: PodstawaWymagania) -> NcRfgProfile:
    return _PROFILE.model_copy(
        update={"reactive_power": _PROFILE.reactive_power.model_copy(update={"zrodlo": podstawa})}
    )


def _converter(
    pq_curve: Any,
    *,
    kind: ConverterKind = ConverterKind.PV,
    jakosc_pn: str = "DATASHEET",
) -> ConverterType:
    return ConverterType(
        id="conv-test",
        name="Test",
        kind=kind,
        un_kv=0.4,
        sn_mva=1.0,
        pmax_mw=1.0,
        qmin_mvar=-0.6,
        qmax_mvar=0.6,
        pq_curve=pq_curve,
        card_field_status=(
            None
            if jakosc_pn == "DATASHEET"
            else {"pmax_mw": {"field_name": "pmax_mw", "quality": jakosc_pn}}
        ),
    )


def _ocena(view: dict[str, Any]) -> OcenaKryterium:
    """Rekord z widoku — odczyt z JSON przechodzi walidatory kontraktu (te same wyprowadzenia)."""
    return OcenaKryterium.model_validate(view["ocena"])


def _oczekiwany_status(podstawa: str, obszar: str, kind: ConverterKind) -> str:
    """Reguła K §2.2 wprost z kontraktu: stosowalność → wynik → podstawa → margines."""
    rodzaj = _PODSTAWY[podstawa].rodzaj
    if kind is ConverterKind.BESS and rodzaj in RODZAJE_Z_ROZPORZADZENIA:
        return "NIE_DOTYCZY"
    if obszar == "brak":
        return "NIE_OCENIONO"
    if _PODSTAWY[podstawa].status == "NIEUSTALONE":
        return "BRAK_PODSTAWY"
    return "SPELNIA" if _MARGINES[obszar] >= 0.0 else "NIE_SPELNIA"


@pytest.mark.parametrize(
    ("podstawa", "obszar", "kind", "jakosc"),
    list(itertools.product(_PODSTAWY, _OBSZARY, _RODZAJE, _JAKOSCI)),
)
def test_iloczyn_cech_podstawa_obszar_technologia_jakosc(
    podstawa: str, obszar: str, kind: ConverterKind, jakosc: str
) -> None:
    view = build_pq_coverage_view(
        _converter(_OBSZARY[obszar], kind=kind, jakosc_pn=jakosc), _profil(_PODSTAWY[podstawa])
    )
    ocena = _ocena(view)
    status = _oczekiwany_status(podstawa, obszar, kind)
    assert ocena.kryterium_id == KRYTERIUM_POKRYCIA_PQ
    assert ocena.status_maszynowy == status
    assert ocena.limit is not None and ocena.limit.podstawa == _PODSTAWY[podstawa]
    assert ocena.limit.wartosc is not None and ocena.limit.wartosc.wartosc == 0.0
    assert ocena.kryterium.relacja == "NIE_MNIEJ"
    if status == "NIE_DOTYCZY":
        assert ocena.stosowalnosc.powod_pl == POWOD_MAGAZYNU_PL
        return
    # Wynik i margines: najmniejszy zapas po punktach [Mvar]; brak krzywej — brak wyniku.
    if obszar == "brak":
        assert ocena.wynik is None and ocena.margines is None
        assert view["punkty"] == []
        assert any("pq_curve" in b for b in ocena.wyjasnienie.czego_brakuje)
    else:
        assert ocena.wynik is not None and ocena.margines is not None
        assert ocena.wynik.wartosc.jednostka == "Mvar"
        assert ocena.wynik.wartosc.wartosc == pytest.approx(_MARGINES[obszar])
        assert ocena.margines.wartosc is not None
        assert ocena.margines.wartosc.wartosc == pytest.approx(_MARGINES[obszar])
        niepokryte = [pt for pt in view["punkty"] if pt["margines_mvar"] < 0.0]
        assert f"punkty niepokryte: {len(niepokryte)} z {len(view['punkty'])}" in (
            ocena.wynik.punkt_krytyczny_pl or ""
        )
    # Kompletność wg danych i podstawy (§3): Pn z oszacowania i podstawa NIEUSTALONE nazwane.
    pelny = jakosc == "DATASHEET" and _PODSTAWY[podstawa].status != "NIEUSTALONE"
    assert ocena.kompletnosc_dowodu == ("PELNY" if pelny else "NIEPELNY")
    if jakosc != "DATASHEET":
        assert ocena.dowod.status_danych.stan == "UNVALIDATED_INPUT"
        assert any("pmax_mw" in p for p in ocena.powody_niepelnosci)
    if _PODSTAWY[podstawa].status == "WSKAZANE":
        # Stan źródła w zdaniu nazwany po polsku; kod `WSKAZANE` wyłącznie w `podstawa.status`.
        assert any("stan źródła „wskazane”" in z for z in ocena.wyjasnienie.zastrzezenia)
        assert not any("WSKAZANE" in z for z in ocena.wyjasnienie.zastrzezenia)


def test_punkt_poza_obszarem_nazwany_z_wartosciami_p_q() -> None:
    """Wynik niesie listę punktów niepokrytych z wartościami P i Q producenta i deficytem."""
    ocena = _ocena(
        build_pq_coverage_view(
            _converter(_OBSZARY["poza"]), _profil(_PODSTAWY["rozporzadzenie_zweryfikowane"])
        )
    )
    assert ocena.status_maszynowy == "NIE_SPELNIA"
    assert ocena.wynik is not None
    punkt = ocena.wynik.punkt_krytyczny_pl or ""
    assert "punkty niepokryte: 1 z 3" in punkt
    assert "P = 1 MW: Q −0,2 Mvar … 0,2 Mvar, deficyt 0,13 Mvar" in punkt
    assert "margines −0,13 Mvar" in ocena.wyjasnienie.zdanie_pl


def test_zapasy_per_punkt_to_liczby_bez_statusu() -> None:
    view = build_pq_coverage_view(_converter(_OBSZARY["poza"]), _PROFILE)
    ostatni = view["punkty"][-1]
    # deficyt górny = 0.2 - 0.33 = -0.13; dolny = -0.33 - (-0.2) = -0.13
    assert ostatni["margines_mvar"] == pytest.approx(-0.13)
    for punkt in view["punkty"]:
        assert set(punkt) == {
            "p_mw",
            "q_min_mvar",
            "q_max_mvar",
            "q_wymagane_min_mvar",
            "q_wymagane_max_mvar",
            "zapas_dolny_mvar",
            "zapas_gorny_mvar",
            "margines_mvar",
        }
    assert set(view) == {
        "typ_katalogowy",
        "operator",
        "wymaganie",
        "punkty",
        "ocena",
        "slad_whitebox",
    }


def test_requirement_scales_with_pn() -> None:
    # Pn = pmax_mw uzyte jako odniesienie wymagania.
    view = build_pq_coverage_view(_converter(((0.0, -0.5, 0.5),)), _PROFILE)
    assert view["wymaganie"]["q_wymagane_max_mvar"] == pytest.approx(0.33)
    assert view["wymaganie"]["q_wymagane_min_mvar"] == pytest.approx(-0.33)
    assert view["wymaganie"]["pn_mw"] == pytest.approx(1.0)
    ocena = _ocena(view)
    assert ocena.limit is not None
    assert "[−0,33 Mvar, 0,33 Mvar]" in (ocena.limit.zakres_stosowalnosci_pl or "")


def test_whitebox_trace_present() -> None:
    trace = build_pq_coverage_view(_converter(_OBSZARY["wewnatrz"]), _PROFILE)["slad_whitebox"]
    assert "wzor" in trace and r"q_{\text{wym,min}}" in trace["wzor"]
    assert trace["dane"]["liczba_punktow_krzywej"] == 3
    assert len(trace["podstawienie"]) == 3
    assert trace["wynik"] == "min = 0.17 Mvar; punkty z ujemnym zapasem: 0 z 3"


def test_deterministic_two_calls_identical() -> None:
    c = _converter(((0.0, -0.5, 0.5), (1.0, -0.4, 0.4)))
    assert build_pq_coverage_view(c, _PROFILE) == build_pq_coverage_view(c, _PROFILE)


def test_operator_metadata_in_view() -> None:
    view = build_pq_coverage_view(_converter(((0.0, -0.5, 0.5),)), _PROFILE)
    assert view["operator"]["id"] == "pge"
    assert view["operator"]["udzial_q_max_pct_pn"] == pytest.approx(0.33)
    assert view["typ_katalogowy"]["id"] == "conv-test"


def test_dowod_z_rejestru_zdolnosci_i_podstawa_z_profilu() -> None:
    """Dowód: deklaracja z karty katalogowej (poziom z rejestru zdolności, nie zaszyty); podstawa
    limitu i kryterium = ``profile.reactive_power.zrodlo`` — stan źródła NIEUSTALONE daje
    BRAK_PODSTAWY, nigdy pokrycie potwierdzone wymaganiem."""
    ocena = _ocena(build_pq_coverage_view(_converter(_OBSZARY["wewnatrz"]), _PROFILE))
    wpis = classify_dynamic_capability(ZDOLNOSC_POKRYCIA_PQ)
    assert (wpis.tier, wpis.claim_kind) == (
        EvidenceTier.DECLARATION,
        ClaimKind.DECLARED_CONFIGURATION,
    )
    assert ocena.dowod.metoda == "DEKLARACJA"
    assert ocena.dowod.poziom is wpis.tier and ocena.dowod.rodzaj_twierdzenia is wpis.claim_kind
    assert ocena.podstawa == _PROFILE.reactive_power.zrodlo
    assert ocena.status_maszynowy == "BRAK_PODSTAWY"
    assert ocena.dowod.przydatnosc_dowodowa


def test_odwzorowanie_rodzaju_przeksztaltnika_kompletne() -> None:
    assert set(_DER_KIND_Z_RODZAJU) == set(ConverterKind)
