"""Klasa rekordów werdyktu wyjaśnialnego analiz specjalistycznych V12.6 (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek 3).

Testy po rodzajach (`test_v126_*`) sprawdzają wyrocznie liczbowe kryteriów. Ten plik
pilnuje KLASY: iloczyn {każdy rodzaj z kryteriami} × {bieg z obiektami oceny, bieg bez
obiektów oceny} × {każdy rekord} — kontrakt werdyktu (`docs/domain/
KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`) obowiązuje każdy rekord, nie tylko ten, który ktoś
przewidział:

- rekord ma etykietę i zdanie wyjaśnienia z backendu (front nie tłumaczy statusu);
- każde kryterium stoi na podstawie z rejestru założeń (`§ Z-n`, stan `WSKAZANE`) albo na
  normie nazwanej bez tablic (napięcie powrotne, stan `NIEUSTALONE` → `BRAK_PODSTAWY`);
- kryterium z rejestru niesie daną przyjętą `ESTIMATED` swojego założenia, więc kompletność
  dowodu jest `NIEPELNY` (zasada nr 4 — założenie programu nie jest dowodem zgodności);
- brak obiektu oceny (bez ograniczników, uziomu, silników, przekaźnika, odniesień) NIGDY nie
  daje `SPELNIA` (brak danych ≠ spełnia);
- identyfikatory rekordów jednego wyniku są unikalne, a budowa deterministyczna;
- zbiór rodzajów z rekordami = `RODZAJE_Z_OCENAMI` (rodzaj bez kryteriów nie dostaje pustej
  listy udającej ocenę).
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Mapping
from typing import Any

import pytest
from application.analyses.v126_oceny import (
    DOKUMENT_ZALOZEN,
    REJESTR_ZALOZEN,
    RODZAJE_Z_OCENAMI,
)
from application.v126_artifacts import wynik_v126_dla_powierzchni
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType
from werdykt import format_liczba

from tests.ci.generuj_odpowiedzi_v126 import model_wejsciowy, zbuduj_odpowiedzi

_STATUSY = {
    "SPELNIA",
    "NIE_SPELNIA",
    "NIEJEDNOZNACZNY",
    "NIE_OCENIONO",
    "BRAK_PODSTAWY",
    "BRAK_DOWODU",
    "NIE_DOTYCZY",
}
_PARAGRAFY = {f"§ {z.paragraf}" for z in REJESTR_ZALOZEN}


def _rekordy(oceny: list[Mapping[str, Any]]) -> Iterator[Mapping[str, Any]]:
    """Rekordy najwyższego poziomu i składowe wymagań (płasko)."""
    for rekord in oceny:
        yield rekord
        yield from rekord.get("oceny_skladowe") or []


def _bez_obiektow() -> dict[str, list[Mapping[str, Any]]]:
    """Bieg każdego rodzaju na modelu bez obiektów oceny: bez ograniczników, uziomu,
    silników, wyposażenia przekaźnika, odniesień walidacji i parametrów TRV."""
    model = model_wejsciowy().model_copy(
        update={"insulation": [], "motors": [], "earthing": None, "parameters": {}}
    )
    nazwy = {szyna.ref: szyna.name for szyna in model.buses}
    solver = V126AcademicSolver()
    wynik: dict[str, list[Mapping[str, Any]]] = {}
    for rodzaj in sorted(RODZAJE_Z_OCENAMI):
        # Projekt uziemienia bez uziemienia sieci z modelu (brak obiektu oceny); pozostałe
        # rodzaje — sieć z uziemieniem, bez danych projektanta.
        wejscie = (
            model.model_copy(update={"uziemienie_sn": None})
            if rodzaj == "neutral_earthing_design"
            else model
        )
        ladunek = wynik_v126_dla_powierzchni(
            rodzaj, solver.run(V126AnalysisType(rodzaj), wejscie), nazwy=nazwy
        )["result"]
        wynik[rodzaj] = ladunek["oceny"]
    return wynik


@pytest.fixture(scope="module")
def odpowiedzi() -> dict[str, Any]:
    return zbuduj_odpowiedzi()


@pytest.fixture(scope="module")
def bez_obiektow() -> dict[str, list[Mapping[str, Any]]]:
    return _bez_obiektow()


def test_zbior_rodzajow_z_rekordami_to_rejestr_rodzajow(odpowiedzi: dict[str, Any]) -> None:
    z_ocenami = {rodzaj for rodzaj, ladunek in odpowiedzi.items() if "oceny" in ladunek}
    assert z_ocenami == set(RODZAJE_Z_OCENAMI)
    assert all(odpowiedzi[rodzaj]["oceny"] for rodzaj in RODZAJE_Z_OCENAMI)


@pytest.mark.parametrize("wariant", ["z_obiektami", "bez_obiektow"])
@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_Z_OCENAMI))
def test_kazdy_rekord_jest_wyjasniony_i_stoi_na_podstawie(
    rodzaj: str,
    wariant: str,
    odpowiedzi: dict[str, Any],
    bez_obiektow: dict[str, list[Mapping[str, Any]]],
) -> None:
    oceny = odpowiedzi[rodzaj]["oceny"] if wariant == "z_obiektami" else bez_obiektow[rodzaj]
    assert oceny, rodzaj
    identyfikatory: list[str] = []
    for rekord in _rekordy(oceny):
        tozsamosc = rekord.get("kryterium_id") or rekord.get("wymaganie_id")
        assert isinstance(tozsamosc, str) and tozsamosc.startswith("v126."), rekord
        identyfikatory.append(tozsamosc)
        assert rekord["status_maszynowy"] in _STATUSY, tozsamosc
        assert rekord["etykieta"]["etykieta_pl"].strip(), tozsamosc
        assert rekord["wyjasnienie"]["zdanie_pl"].strip(), tozsamosc
        # Kryterium niestosowalne niczego nie porównuje (kompletność NIE_DOTYCZY); każde inne
        # stoi na założeniu programu, więc dowód nie jest pełny.
        oczekiwana = "NIE_DOTYCZY" if rekord["status_maszynowy"] == "NIE_DOTYCZY" else "NIEPELNY"
        assert rekord["kompletnosc_dowodu"] == oczekiwana, tozsamosc
        if "kryterium_id" not in rekord or rekord["status_maszynowy"] == "NIE_DOTYCZY":
            continue
        podstawa = rekord["podstawa"]
        if podstawa["dokument"] == DOKUMENT_ZALOZEN:
            assert podstawa["status"] == "WSKAZANE", tozsamosc
            assert podstawa["jednostka_redakcyjna"] in _PARAGRAFY, tozsamosc
            paragraf = podstawa["jednostka_redakcyjna"].removeprefix("§ ")
            dane = rekord["dowod"]["status_danych"]["dane_przyjete"]
            assert any(
                d["jakosc"] == "ESTIMATED" and f"({paragraf} rejestru założeń)" in d["nazwa_pl"]
                for d in dane
            ), tozsamosc
        else:
            # Jedyna podstawa spoza rejestru: obwiednia napięcia powrotnego (norma bez tablic).
            assert podstawa["dokument"] == "IEC 62271-100", tozsamosc
            assert podstawa["status"] == "NIEUSTALONE", tozsamosc
            assert rekord["status_maszynowy"] in {"BRAK_PODSTAWY", "NIE_OCENIONO"}, tozsamosc
    assert len(identyfikatory) == len(set(identyfikatory)), rodzaj


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_Z_OCENAMI))
def test_brak_obiektu_oceny_nigdy_nie_spelnia(
    rodzaj: str, bez_obiektow: dict[str, list[Mapping[str, Any]]]
) -> None:
    statusy = {r["status_maszynowy"] for r in _rekordy(bez_obiektow[rodzaj])}
    assert "SPELNIA" not in statusy, (rodzaj, statusy)
    assert statusy <= {"NIE_OCENIONO", "BRAK_PODSTAWY", "BRAK_DOWODU"}, (rodzaj, statusy)


def test_rekordy_deterministyczne(odpowiedzi: dict[str, Any]) -> None:
    ponownie = zbuduj_odpowiedzi()
    for rodzaj in RODZAJE_Z_OCENAMI:
        assert ponownie[rodzaj]["oceny"] == odpowiedzi[rodzaj]["oceny"], rodzaj


def test_zdanie_wyjasnienia_nie_niesie_identyfikatora_modelu(odpowiedzi: dict[str, Any]) -> None:
    """Przedmiot nazywany nazwą z modelu: identyfikator techniczny szyny ani odcinka
    (`gpz/…`, `station/…`, `corridor/…`) nie trafia do zdania dla człowieka."""
    wzorzec = re.compile(r"\b(?:gpz|station|corridor)/[0-9a-f]{8,}")
    for rodzaj in RODZAJE_Z_OCENAMI:
        for rekord in _rekordy(odpowiedzi[rodzaj]["oceny"]):
            zdanie = rekord["wyjasnienie"]["zdanie_pl"]
            assert not wzorzec.search(zdanie), (rodzaj, zdanie)


def _bez_wyniku_liczbowego() -> dict[str, list[Mapping[str, Any]]]:
    """Bieg każdego rodzaju z obiektami oceny, ale bez impedancji zasilania szyn: silnik
    jest, zapadu nie wyznaczono (wynik kryterium pusty przy znanym limicie)."""
    model = model_wejsciowy()
    model = model.model_copy(
        update={
            "buses": [
                szyna.model_copy(
                    update={"fault_level_mva": None, "source_r_ohm": None, "source_x_ohm": None}
                )
                for szyna in model.buses
            ]
        }
    )
    nazwy = {szyna.ref: szyna.name for szyna in model.buses}
    solver = V126AcademicSolver()
    return {
        rodzaj: wynik_v126_dla_powierzchni(
            rodzaj, solver.run(V126AnalysisType(rodzaj), model), nazwy=nazwy
        )["result"]["oceny"]
        for rodzaj in sorted(RODZAJE_Z_OCENAMI)
    }


def _teksty_pl(wezel: Any, klucz: str = "") -> Iterator[tuple[str, str]]:
    """Każdy tekst rekordu czytany przez projektanta: pola `*_pl`, zdania, listy braków
    i zastrzeżeń, opisy odnośników śladu — ze ścieżką klucza."""
    if isinstance(wezel, Mapping):
        for k, v in wezel.items():
            yield from _teksty_pl(v, k)
    elif isinstance(wezel, list | tuple):
        for v in wezel:
            yield from _teksty_pl(v, klucz)
    elif isinstance(wezel, str) and (
        klucz.endswith("_pl") or klucz in {"czego_brakuje", "zastrzezenia", "powody_niepelnosci"}
    ):
        yield klucz, wezel


_LITERAL_PYTHONA = re.compile(r"\b(?:None|True|False|nan|inf)\b")
_KROPKA_DZIESIETNA = re.compile(r"\d\.\d")


@pytest.mark.parametrize("wariant", ["z_obiektami", "bez_obiektow", "bez_wyniku_liczbowego"])
@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_Z_OCENAMI))
def test_teksty_rekordow_bez_surowego_zapisu_pythona(
    rodzaj: str,
    wariant: str,
    odpowiedzi: dict[str, Any],
    bez_obiektow: dict[str, list[Mapping[str, Any]]],
) -> None:
    """Iloczyn: rodzaj × wariant biegu {z obiektami, bez obiektów, obiekty bez wyniku
    liczbowego} × każdy tekst rekordu (także składowych). Dawniej opis odnośnika śladu
    wklejał liczby surowo: „wynik None %, limit 15.0 % (Z-9)” (rozruch bez impedancji
    zasilania) i „szczyt napięcia powrotnego: None kV”. Liczba w opisie śladu idzie przez
    zapis polski karty werdyktu; numery norm z kropką (IEEE C57.32) żyją wyłącznie w polach
    podstawy i danych przyjętych, więc reguła kropki dziesiętnej obejmuje opisy śladu."""
    oceny = {
        "z_obiektami": lambda: odpowiedzi[rodzaj]["oceny"],
        "bez_obiektow": lambda: bez_obiektow[rodzaj],
        "bez_wyniku_liczbowego": lambda: _bez_wyniku_liczbowego()[rodzaj],
    }[wariant]()
    for rekord in _rekordy(oceny):
        tozsamosc = rekord.get("kryterium_id") or rekord.get("wymaganie_id")
        for klucz, tekst in _teksty_pl(rekord):
            assert not _LITERAL_PYTHONA.search(tekst), (tozsamosc, klucz, tekst)
        for odnosnik in rekord.get("slad") or []:
            assert not _KROPKA_DZIESIETNA.search(odnosnik["opis_pl"]), (tozsamosc, odnosnik)


def test_rozruch_bez_impedancji_zasilania_nazywa_brak_wyniku_w_sladzie() -> None:
    """Para do iloczynu wyżej: wariant, w którym defekt był widoczny na prawdziwym backendzie
    (e2e „analiza specjalistyczna motor_starting”), ma wynik pusty i limit znany."""
    (wymaganie,) = _bez_wyniku_liczbowego()["motor_starting"]
    zapad = next(o for o in wymaganie["oceny_skladowe"] if ".zapad." in o["kryterium_id"])
    assert zapad["wynik"] is None
    (odnosnik,) = zapad["slad"]
    assert "wynik nie wyznaczono, limit 15 % (Z-9)" in odnosnik["opis_pl"]


_ZALOZENIA_Z_PROGIEM = {f"§ {z.paragraf}": z for z in REJESTR_ZALOZEN if z.wartosc is not None}


@pytest.mark.parametrize("wariant", ["z_obiektami", "bez_obiektow"])
@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_Z_OCENAMI))
def test_prog_zalozenia_z_jednego_zrodla_w_rekordzie(
    rodzaj: str,
    wariant: str,
    odpowiedzi: dict[str, Any],
    bez_obiektow: dict[str, list[Mapping[str, Any]]],
) -> None:
    """Iloczyn: rodzaj × bieg × każdy rekord, którego limit stoi na założeniu z progiem
    liczbowym (Z-2, Z-3, Z-6, Z-9). Próg występuje w rekordzie
    trzy razy — limit porównania, warunek LaTeX i treść założenia w danej przyjętej — i ma być
    JEDNĄ liczbą rejestru (`ZalozenieKryterium.prog_latex`, `format_liczba`). Dawniej warunek
    LaTeX rekordu i treść założenia niosły własne literały („≤ 10\\%”, „nie większy niż 10 %”),
    więc zmiana progu w rejestrze zostawiała na ekranie warunek z dawną liczbą."""
    oceny = odpowiedzi[rodzaj]["oceny"] if wariant == "z_obiektami" else bez_obiektow[rodzaj]
    sprawdzone = 0
    for rekord in _rekordy(oceny):
        limit = rekord.get("limit") or {}
        podstawa = limit.get("podstawa") or {}
        zalozenie = _ZALOZENIA_Z_PROGIEM.get(podstawa.get("jednostka_redakcyjna"))
        if zalozenie is None:
            continue
        sprawdzone += 1
        if (limit.get("wartosc") or {}).get("jednostka") == zalozenie.jednostka:
            # Próg jest limitem kryterium (Z-3, Z-6, Z-9). Z-2 ma próg czasu (10 s) przy limicie
            # U_TOV w kV — tam próg żyje wyłącznie w treści założenia.
            assert limit["wartosc"]["wartosc"] == zalozenie.wartosc, rekord["kryterium_id"]
            assert rekord["kryterium"]["warunek_latex"].endswith(zalozenie.prog_latex), rekord[
                "kryterium"
            ]["warunek_latex"]
        if not (rekord.get("stosowalnosc") or {}).get("dotyczy", True):
            continue  # kryterium niestosowalne nie stoi na założeniu (bez danej przyjętej)
        dane = rekord["dowod"]["status_danych"]["dane_przyjete"]
        (dana,) = (d for d in dane if f"({zalozenie.paragraf} rejestru" in d["nazwa_pl"])
        assert f"{format_liczba(zalozenie.wartosc)} {zalozenie.jednostka}" in dana["powod_pl"]
    if rodzaj in {"neutral_earthing_design", "motor_starting", "insulation_coordination"} and (
        wariant == "z_obiektami"
    ):
        assert sprawdzone > 0, "iloczyn bez rekordu z progiem — test nic nie sprawdza"
