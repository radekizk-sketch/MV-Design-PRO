"""Zdania solvera V12.6 dla projektanta niosą liczby w zapisie polskim (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5).

Klasa defektu: `result_pl` kroków śladu WHITE BOX i uzasadnienia wyniku (np. „prąd z modelu
0.015203 kA”) wklejały float Pythona wprost do f-stringu — ekran „Ślad obliczenia” pokazuje
`result_pl` bez przetwarzania. Odcinek 3 naprawił tę klasę w rekordach ocen
(`v126_oceny._wielkosc_sladu`); ten test pilnuje jej w samym solverze.

Iloczyn cech: KAŻDY rodzaj kontraktu × wejście fixtury strażnika prezentacji
(`tests/ci/generuj_odpowiedzi_v126.py::wejscie_rodzaju` — to samo, co widzi ekran) ×
KAŻDY tekst dla projektanta (``result_pl`` kroków śladu, każde pole ``*_pl`` wyniku, w tym
zagnieżdżone) oraz prąd uziomowy {nadpisanie projektanta, wartość z modelu}.

Gotowość (`application/analyses/v126_gotowosc.py`) — ta sama klasa: KAŻDY rodzaj × {bez
parametrów, parametry sceny „akademickie” harnessu} × tekst {opis warunku (renderowany WPROST:
lista warunków, treść odmowy 422 — bez `$` i bez symbolu ASCII), dana z modelu i źródło
propozycji (ekran składa `$…$` KaTeX-em — symbol wyłącznie jako wzór)} — bez kropki dziesiętnej.
"""

from __future__ import annotations

import re
from typing import Any

import pytest
from application.analyses.v126_gotowosc import ocen_gotowosc_v126, uzupelnij_parametry_z_modelu
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType

from scripts.eksport_fixtur_harnessu import PARAMETRY_SCENY_AKADEMICKIE, _enm_sceny_akademickiej
from tests.ci.generuj_odpowiedzi_v126 import model_wejsciowy, wejscie_rodzaju

#: Liczba dziesiętna z kropką — bez numerów punktów norm (`§6.3.3`, `6.2.1`), wersji i dat.
_KROPKA_DZIESIETNA = re.compile(r"(?<![§\d.\w])\d+\.\d+(?![\d.])")
#: Odwołanie do punktu normy (`pkt 6.7`, `§ 6.2`, `tab. 3.1`) — numer redakcyjny, nie liczba.
_PUNKT_NORMY = re.compile(r"(?:pkt|§|rozdz\.|tab\.|kl\.)\s*\d+(?:\.\d+)+")


def _ma_kropke_dziesietna(tekst: str) -> bool:
    return bool(_KROPKA_DZIESIETNA.search(_PUNKT_NORMY.sub(" ", tekst)))


def _teksty_pl(obiekt: Any, sciezka: str = "") -> list[tuple[str, str]]:
    if isinstance(obiekt, dict):
        wynik: list[tuple[str, str]] = []
        for klucz, wartosc in obiekt.items():
            if isinstance(wartosc, str) and (klucz.endswith("_pl") or klucz == "result_pl"):
                wynik.append((f"{sciezka}.{klucz}", wartosc))
            else:
                wynik.extend(_teksty_pl(wartosc, f"{sciezka}.{klucz}"))
        return wynik
    if isinstance(obiekt, list):
        return [t for i, w in enumerate(obiekt) for t in _teksty_pl(w, f"{sciezka}[{i}]")]
    return []


def _naruszenia(wynik: dict[str, Any]) -> list[str]:
    return [
        f"{sciezka}: {tekst!r}"
        for sciezka, tekst in _teksty_pl(wynik)
        if _ma_kropke_dziesietna(tekst)
    ]


@pytest.mark.parametrize("rodzaj", list(V126AnalysisType), ids=lambda r: r.value)
def test_zdania_solvera_bez_kropki_dziesietnej(rodzaj: V126AnalysisType) -> None:
    wynik = V126AcademicSolver().run(rodzaj, wejscie_rodzaju(model_wejsciowy(), rodzaj))
    assert _naruszenia(wynik) == []


@pytest.mark.parametrize("nadpisanie", [True, False], ids=["nadpisanie", "z_modelu"])
def test_uzasadnienie_pradu_uziomowego_po_polsku(nadpisanie: bool) -> None:
    rodzaj = V126AnalysisType.EARTHING_SAFETY
    model = wejscie_rodzaju(model_wejsciowy(), rodzaj)
    if not nadpisanie:
        uziom = dict(model.parameters["earthing"])
        uziom.pop("fault_current_ka")
        model = model.model_copy(update={"parameters": {**model.parameters, "earthing": uziom}})
    wynik = V126AcademicSolver().run(rodzaj, model)
    assert _naruszenia(wynik) == []
    uzasadnienie = wynik["result"]["prad_uziomowy"]["uzasadnienie_pl"]
    # √(15² + 2,477474²) = 15,2032 A — liczba w zapisie polskim w zdaniu projektanta.
    assert ("0,015203 kA" if nadpisanie else "15,2032 A") in uzasadnienie


def test_wykrywacz_lapie_float_pythona_i_przepuszcza_numery_norm() -> None:
    """Iniekcja: dawny zapis „0.015203 kA” jest wykrywany; numery punktów norm nie."""
    assert _ma_kropke_dziesietna("prąd z modelu 0.015203 kA")
    assert not _ma_kropke_dziesietna("IEC 60909-0 §6.3.3, eq. 6, EN 50522:2010 tab. 1")
    assert not _ma_kropke_dziesietna("IEC 60909-0:2016 pkt 6.7 wyznacza S_rM")
    assert not _ma_kropke_dziesietna("prąd z modelu 0,015203 kA")


#: Symbol w zapisie ASCII z indeksem (`I_C`, `U_m`, `t_n`) — poza wzorem `$…$`.
_SYMBOL_ASCII = re.compile(r"(?<![\w.\[\]/])[A-Za-zΔρθφα]{1,4}_[A-Za-z0-9{]")
_WZOR_INLINE = re.compile(r"\$[^$]+\$")


def _naruszenia_gotowosci(gotowosc: dict[str, Any]) -> list[str]:
    naruszenia: list[str] = []
    for warunek in gotowosc["warunki"]:
        tekst = warunek["opis_pl"]
        if _ma_kropke_dziesietna(tekst) or "$" in tekst or _SYMBOL_ASCII.search(tekst):
            naruszenia.append(f"warunek {warunek['kod']}: {tekst!r}")
    teksty = [(d["nazwa_pl"], d["wartosc_pl"]) for d in gotowosc["dane_z_modelu"]]
    teksty += [(k, p["zrodlo_pl"]) for k, p in gotowosc["proponowane"].items()]
    for nazwa, wartosc in teksty:
        for tekst in (nazwa, wartosc):
            proza = _WZOR_INLINE.sub(" ", tekst)
            if _ma_kropke_dziesietna(tekst) or "$" in proza or _SYMBOL_ASCII.search(proza):
                naruszenia.append(f"dana {nazwa!r}: {tekst!r}")
    return naruszenia


@pytest.fixture(scope="module")
def enm_sceny() -> Any:
    return _enm_sceny_akademickiej()


@pytest.mark.parametrize("z_parametrami", [False, True], ids=["bez_parametrow", "parametry_sceny"])
@pytest.mark.parametrize("rodzaj", list(V126AnalysisType), ids=lambda r: r.value)
def test_gotowosc_bez_kropki_dziesietnej_i_bez_symboli_ascii(
    enm_sceny: Any, rodzaj: V126AnalysisType, z_parametrami: bool
) -> None:
    parametry = (
        uzupelnij_parametry_z_modelu(
            enm_sceny, rodzaj, PARAMETRY_SCENY_AKADEMICKIE.get(rodzaj.value, {})
        )
        if z_parametrami
        else {}
    )
    gotowosc = ocen_gotowosc_v126(enm_sceny, rodzaj, parametry).to_dict()
    assert _naruszenia_gotowosci(gotowosc) == []


def test_gotowosc_uziomu_i_trv_niesie_dane_z_wzorami() -> None:
    """Pomiar nie jest pusty: gotowość uziomu niesie prąd stacji z wzorem wielkości, a TRV —
    źródło propozycji napięcia wyłącznika z symbolami jako wzory."""
    enm = _enm_sceny_akademickiej()
    uziom = V126AnalysisType.EARTHING_SAFETY
    gotowosc = ocen_gotowosc_v126(
        enm,
        uziom,
        uzupelnij_parametry_z_modelu(enm, uziom, PARAMETRY_SCENY_AKADEMICKIE[uziom.value]),
    ).to_dict()
    prady = [d for d in gotowosc["dane_z_modelu"] if "Prąd zwarcia doziemnego" in d["nazwa_pl"]]
    assert prady and all(_WZOR_INLINE.search(d["wartosc_pl"]) for d in prady)
    trv = ocen_gotowosc_v126(enm, V126AnalysisType.TRANSIENT_TRV, {}).to_dict()
    zrodlo = trv["proponowane"]["breaker_rated_voltage_kv"]["zrodlo_pl"]
    assert "$U_m$" in zrodlo and "17,5 kV" in zrodlo


def test_wykrywacz_gotowosci_lapie_dawny_zapis() -> None:
    """Iniekcja: dawne zapisy gotowości są wykrywane, zapis poprawny przechodzi."""
    zly = {
        "warunki": [{"kod": "w", "opis_pl": "Napięcie znamionowe wyłącznika U_r"}],
        "dane_z_modelu": [{"nazwa_pl": "Rezystor", "wartosc_pl": "R = 40.5 Ω, I_n = 300 A"}],
        "proponowane": {},
    }
    assert len(_naruszenia_gotowosci(zly)) == 2
    dobry = {
        "warunki": [{"kod": "w", "opis_pl": "Napięcie znamionowe wyłącznika"}],
        "dane_z_modelu": [{"nazwa_pl": "Rezystor", "wartosc_pl": "$R$ = 40,5 Ω, $I_n$ = 300 A"}],
        "proponowane": {"k": {"zrodlo_pl": "napięcie $U_m$ sieci (17,5 kV)"}},
    }
    assert _naruszenia_gotowosci(dobry) == []
