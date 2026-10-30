"""Rekordy kategorii dotkliwości kontyngencji N-1 (karta WERDYKT-MIGRACJA-190).

Dawniej ekran zapalał znacznik ostrzeżenia z warunku `licznik > 0` (próg okna bez kryterium,
limitu i podstawy), a licznik zero przy pominiętych kryteriach wyglądał jak „w normie”.
Teraz każda kontyngencja i stan bazowy niosą trzy rekordy: K odbiorów bez zasilania, W
przeciążeń i W odchyleń napięcia.

Iloczyn cech: sieć (pierścień — przeciążenie objazdu; promień z transformatorem — odbiory
odcięte i element wykluczony; bieg niezbieżny; gałąź bez obciążalności) × wariant (każda
kontyngencja + stan bazowy) × kategoria. Predykaty parami: rekord kategorii `NIE_SPELNIA`
⇔ licznik kategorii dodatni; licznik nieobliczony ⇒ rekord nigdy `SPELNIA`.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from application.analyses.kontyngencje_n1 import POWOD_WYKLUCZENIA_PL, build_kontyngencje_n1_view
from enm.canonical_analysis import reset_canonical_runs
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store

from tests.application.analyses.test_kontyngencje_n1_service import (
    _bez_obciazalnosci,
    _bieg,
    _niezbiezny,
    _pierscien,
    _promien_z_transformatorem,
)

_KATEGORIE = ("odbiory_bez_zasilania", "przeciazenia", "naruszenia_napiecia")
_SIECI: dict[str, Callable[[], EnergyNetworkModel]] = {
    "pierscien": _pierscien,
    "promien": _promien_z_transformatorem,
    "niezbiezny": _niezbiezny,
    "bez_obciazalnosci": _bez_obciazalnosci,
}


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


_WIDOKI: dict[str, dict[str, Any]] = {}


def _widok(siec: str) -> dict[str, Any]:
    if siec not in _WIDOKI:
        _WIDOKI[siec] = build_kontyngencje_n1_view(_bieg(_SIECI[siec]()))
    return _WIDOKI[siec]


def _warianty(widok: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return [("bazowy", widok["przypadek_bazowy"])] + [
        (k["element_ref"], k) for k in widok["kontyngencje"]
    ]


@pytest.mark.parametrize("kategoria", _KATEGORIE)
@pytest.mark.parametrize("siec", sorted(_SIECI))
def test_rekord_kategorii_naruszony_wtedy_i_tylko_wtedy_gdy_licznik_dodatni(
    siec: str, kategoria: str
) -> None:
    for nazwa, wariant in _warianty(_widok(siec)):
        rekord = wariant["oceny"][kategoria]
        licznik = wariant["dotkliwosc"][kategoria]
        status = rekord["status_maszynowy"]
        if licznik is None:
            # Nie policzono — brak danych ≠ spełnia.
            assert status in {"NIE_OCENIONO", "NIE_DOTYCZY"}, (siec, nazwa, kategoria)
        else:
            assert (status == "NIE_SPELNIA") is (licznik > 0), (siec, nazwa, kategoria, status)
        # Każdy status związany z wyjaśnieniem i etykietą (kontrakt werdyktu wyjaśnialnego).
        assert rekord["wyjasnienie"]["zdanie_pl"]
        assert rekord["etykieta"]["etykieta_pl"]


@pytest.mark.parametrize("siec", sorted(_SIECI))
def test_pominiete_kryterium_nie_daje_spelnienia_kategorii(siec: str) -> None:
    """Pozycja bez wyznaczonej wielkości (gałąź bez obciążalności, szyna bez napięcia) to
    składowa `NIE_OCENIONO` z powodem — licznik naruszeń 0 nie robi z niej „w normie”."""
    for nazwa, wariant in _warianty(_widok(siec)):
        for kategoria, typy in (
            ("przeciazenia", {"BRANCH_LOADING", "TRANSFORMER_LOADING"}),
            ("naruszenia_napiecia", {"VOLTAGE_DEVIATION"}),
        ):
            pominiete = [p for p in wariant["kryteria_pominiete"] if p["check_type"] in typy]
            rekord = wariant["oceny"][kategoria]
            niewyznaczone = [
                o for o in rekord["oceny_skladowe"] if o["kryterium_id"].endswith(".niewyznaczone")
            ]
            if pominiete:
                assert niewyznaczone, (siec, nazwa, kategoria)
                assert all(o["status_maszynowy"] == "NIE_OCENIONO" for o in niewyznaczone)
                assert rekord["status_maszynowy"] != "SPELNIA", (siec, nazwa, kategoria)
                braki = " ".join(" ".join(o["wyjasnienie"]["czego_brakuje"]) for o in niewyznaczone)
                for pozycja in pominiete:
                    assert (pozycja["element_name"] or "") in braki, (siec, nazwa, pozycja)


def test_niezbiezny_bieg_kategorie_rozplywowe_nie_ocenione_odbiory_rozstrzygniete() -> None:
    widok = _widok("niezbiezny")
    niezbiezne = [k for k in widok["kontyngencje"] if k["status"] == "niezbiegl"]
    assert niezbiezne, "fikstura musi mieć kontyngencję niezbieżną"
    for k in niezbiezne:
        assert k["oceny"]["przeciazenia"]["status_maszynowy"] == "NIE_OCENIONO"
        assert k["oceny"]["naruszenia_napiecia"]["status_maszynowy"] == "NIE_OCENIONO"
        # Odbiory bez zasilania wynikają z topologii wariantu — rozstrzygnięte mimo braku
        # rozwiązania rozpływu.
        assert k["oceny"]["odbiory_bez_zasilania"]["status_maszynowy"] in {
            "SPELNIA",
            "NIE_SPELNIA",
        }


def test_element_wykluczony_wszystkie_kategorie_nie_dotycza_z_powodem() -> None:
    widok = _widok("promien")
    wykluczone = [k for k in widok["kontyngencje"] if k["status"] == "wykluczony"]
    assert wykluczone
    for k in wykluczone:
        for kategoria in _KATEGORIE:
            rekord = k["oceny"][kategoria]
            assert rekord["status_maszynowy"] == "NIE_DOTYCZY"
            assert rekord["stosowalnosc"]["powod_pl"] == POWOD_WYKLUCZENIA_PL


def test_skladowa_najwieksza_wskazuje_naruszajacy_element() -> None:
    """Pierścień: wyłączenie `ln_src_a` przeciąża objazd `ln_src_b` — składowa decydująca
    rekordu przeciążeń to ta gałąź, z wynikiem i limitem pozycji walidacji."""
    widok = _widok("pierscien")
    k = next(k for k in widok["kontyngencje"] if k["element_ref"] == "ln_src_a")
    rekord = k["oceny"]["przeciazenia"]
    assert rekord["status_maszynowy"] == "NIE_SPELNIA"
    najwieksza = next(
        o for o in rekord["oceny_skladowe"] if o["kryterium_id"].endswith(".najwieksza")
    )
    pozycja = k["przeciazenia"][0]
    assert najwieksza["przedmiot"]["element_ref"] == pozycja["element_ref"] == "ln_src_b"
    assert najwieksza["wynik"]["wartosc"]["wartosc"] == pytest.approx(pozycja["wartosc"], abs=1e-4)
    assert najwieksza["limit"]["wartosc"]["wartosc"] == pozycja["granica_pct"]


def test_odbiory_odciete_rekord_naruszony_z_liczba_odbiorow() -> None:
    widok = _widok("promien")
    k = next(k for k in widok["kontyngencje"] if k["element_ref"] == "ka_magistrala")
    rekord = k["oceny"]["odbiory_bez_zasilania"]
    assert rekord["status_maszynowy"] == "NIE_SPELNIA"
    assert rekord["wynik"]["wartosc"]["wartosc"] == float(len(k["odbiory_bez_zasilania"]))
    assert rekord["limit"]["wartosc"]["wartosc"] == 0.0


def test_rekordy_deterministyczne() -> None:
    pierwszy = build_kontyngencje_n1_view(_bieg(_pierscien()))
    reset_canonical_runs()
    reset_enm_store()
    drugi = build_kontyngencje_n1_view(_bieg(_pierscien()))
    assert [k["oceny"] for k in pierwszy["kontyngencje"]] == [
        k["oceny"] for k in drugi["kontyngencje"]
    ]
    assert pierwszy["przypadek_bazowy"]["oceny"] == drugi["przypadek_bazowy"]["oceny"]
