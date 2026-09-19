"""Testy miernika gotowosci katalogow (karta KATALOG-NIEZMIENNIKI).

Miernik ma jedna wlasciwosc, ktora latwo zepsuc niezauwazenie: moze MILCZEC.
Rodzina, ktorej nikt nie dopisal do `RODZINY_MIERNIKA`, nie pojawi sie w tabeli
i nikt tego nie zobaczy — tabela dalej bedzie wygladac na kompletna. Dlatego
osia tych testow jest PARYTET rodzin z rejestrami repozytorium, a nie sama
poprawnosc liczb.

Funkcje czyste (`zmierz_rodzine`, `_pola_opcjonalne`, `_ma_proweniencje`) sa
sprawdzane na rekordach SYNTETYCZNYCH — inaczej test opisywalby dzisiejsza
zawartosc katalogu, a nie dzialanie miernika.
"""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog


def _zaladuj_miernik():
    """Zaladuj miernik PO SCIEZCE, bez dokladania katalogu do `sys.path`.

    `backend/scripts/` nie jest pakietem importowalnym, a wstrzykniecie go na
    sciezke importu jest zakazane bramka
    `tests/ci/test_testy_nie_cieniuja_pakietow_zrodlowych.py` (katalog testow ani
    zaden inny katalog nie moze cieniowac pakietow zrodlowych). Ladowanie z pliku
    wiaze test z TYM konkretnym modulem i niczego nie przesłania.
    """
    sciezka = Path(__file__).resolve().parents[3] / "scripts" / "inwentarz_katalogow.py"
    specyfikacja = importlib.util.spec_from_file_location("_miernik_katalogow_test", sciezka)
    assert specyfikacja and specyfikacja.loader
    modul = importlib.util.module_from_spec(specyfikacja)
    # Rejestracja POD WLASNA nazwa jest wymagana, zeby `@dataclass` w ladowanym
    # module znalazl swoj modul w `sys.modules` (inaczej `dataclasses` pada na
    # `sys.modules.get(cls.__module__).__dict__`). To nie jest wstrzykniecie
    # sciezki importu — nazwa `_miernik_katalogow_test` nie cieniuje niczego.
    sys.modules[specyfikacja.name] = modul
    specyfikacja.loader.exec_module(modul)
    return modul


_MIERNIK = _zaladuj_miernik()

POLA_METADANYCH = _MIERNIK.POLA_METADANYCH
RODZINY_MIERNIKA = _MIERNIK.RODZINY_MIERNIKA
ZNACZNIK_KONIEC = _MIERNIK.ZNACZNIK_KONIEC
ZNACZNIK_POCZATEK = _MIERNIK.ZNACZNIK_POCZATEK
PomiarRodziny = _MIERNIK.PomiarRodziny
_ma_proweniencje = _MIERNIK._ma_proweniencje
_pola_opcjonalne = _MIERNIK._pola_opcjonalne
renderuj_blok_generowany = _MIERNIK.renderuj_blok_generowany
zloz_dokument = _MIERNIK.zloz_dokument
zmierz_katalog = _MIERNIK.zmierz_katalog
zmierz_rodzine = _MIERNIK.zmierz_rodzine


@dataclass(frozen=True)
class _TypSyntetyczny:
    id: str
    nazwa: str
    wartosc_wymagana: float
    wartosc_opcjonalna: float | None = None
    druga_opcjonalna: float | None = None
    standard: str | None = None
    verification_status: str = "REFERENCYJNY"
    source_reference: str = ""
    catalog_status: str = "REFERENCYJNY_V1"
    contract_version: str = "2.0"
    verification_note: str | None = None


def _pozycja(**nadpisania: object) -> _TypSyntetyczny:
    parametry: dict[str, object] = {
        "id": "syntetyczna",
        "nazwa": "Pozycja syntetyczna",
        "wartosc_wymagana": 1.0,
    }
    parametry.update(nadpisania)
    return _TypSyntetyczny(**parametry)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Parytet rodzin — najwazniejsza wlasciwosc miernika
# ---------------------------------------------------------------------------


def test_kazdy_rejestr_repozytorium_jest_objety_miernikiem() -> None:
    """Rodzina spoza miernika ZNIKA z tabeli i nikt tego nie zauwazy.

    Zbior rejestrow czytamy z KONTRAKTU repozytorium (pola `dict[str, ...]`
    dataclassy `CatalogRepository`), nie z drugiej listy — dwie listy, ktore
    „dzis sie zgadzaja", rozjada sie przy pierwszym nowym rejestrze.
    """
    from dataclasses import fields as pola_dataclassy

    rejestry = {
        pole.name
        for pole in pola_dataclassy(CatalogRepository)
        if pole.name.endswith(("_types", "_curves", "_templates", "_certificates"))
    }
    objete = set(RODZINY_MIERNIKA.values())
    assert rejestry == objete, {
        "bez_pomiaru": sorted(rejestry - objete),
        "pomiar_bez_rejestru": sorted(objete - rejestry),
    }


def test_pomiar_zywego_katalogu_obejmuje_komplet_rodzin() -> None:
    pomiary = zmierz_katalog()
    assert {p.rodzina for p in pomiary} == set(RODZINY_MIERNIKA)
    assert [p.rodzina for p in pomiary] == sorted(RODZINY_MIERNIKA), "wynik musi byc posortowany"


def test_zadna_rodzina_zywego_katalogu_nie_jest_pusta() -> None:
    """Kontrola DODATNIA: rodzina pusta to albo defekt danych, albo martwy rejestr."""
    puste = [p.rodzina for p in zmierz_katalog() if p.liczba_pozycji == 0]
    assert not puste, puste


def test_zaden_identyfikator_nie_powtarza_sie_w_rodzinie() -> None:
    z_duplikatami = {p.rodzina: p.duplikaty_id for p in zmierz_katalog() if p.duplikaty_id}
    assert not z_duplikatami, z_duplikatami


def test_pomiar_jest_deterministyczny() -> None:
    assert [p.to_dict() for p in zmierz_katalog()] == [p.to_dict() for p in zmierz_katalog()]


# ---------------------------------------------------------------------------
# Funkcje czyste na rekordach syntetycznych
# ---------------------------------------------------------------------------


def test_pola_opcjonalne_pomijaja_metadane_i_pola_wymagane() -> None:
    opcjonalne = _pola_opcjonalne(_TypSyntetyczny)
    assert opcjonalne == ("druga_opcjonalna", "standard", "wartosc_opcjonalna")
    assert not set(opcjonalne) & POLA_METADANYCH
    assert "wartosc_wymagana" not in opcjonalne
    assert "id" not in opcjonalne


def test_wypelnienie_liczone_jako_udzial_pol_niepustych() -> None:
    pomiar = zmierz_rodzine(
        "syntetyczna",
        [
            _pozycja(id="a", wartosc_opcjonalna=1.0, druga_opcjonalna=2.0, standard="IEC"),
            _pozycja(id="b"),
        ],
    )
    assert pomiar.pola_opcjonalne == 3
    # 3 z 6 mozliwych pol wypelnione.
    assert pomiar.wypelnienie_pol_procent == 50.0


def test_rodzina_pusta_nie_udaje_stu_procent() -> None:
    """Brak pozycji daje `None`, nie 100 % — zero pozycji to nie kompletnosc."""
    pomiar = zmierz_rodzine("pusta", [])
    assert pomiar.liczba_pozycji == 0
    assert pomiar.wypelnienie_pol_procent is None


def test_proweniencja_liczona_po_STRUKTURZE_a_nie_po_tresci() -> None:
    bez = _pozycja(id="bez", source_reference="   ")
    ze_zrodlem = _pozycja(id="ze-zrodlem", source_reference="Karta katalogowa producenta")
    z_norma = _pozycja(id="z-norma", source_reference="", standard="IEC 60269-1")
    assert not _ma_proweniencje(bez, ("standard",))
    assert _ma_proweniencje(ze_zrodlem, ("standard",))
    assert _ma_proweniencje(z_norma, ("standard",))
    # Pole spoza kontraktu rodziny nie moze dac proweniencji „na niby".
    assert not _ma_proweniencje(bez, ("ptpiree_document_number",))


def test_pole_bez_ani_jednej_wartosci_jest_nazwane() -> None:
    """Najostrzejszy sygnal braku: pole w kontrakcie, ktorego nie niesie nikt.

    Srednie wypelnienie takiego braku NIE pokazuje — rozpuszcza go w liczbie
    zbiorczej. Pomiar zywego katalogu (2026-09-17) korzysta z tego wprost:
    `k_sc` nie wystepuje w ZADNEJ ze 176 pozycji rodziny przeksztaltnikow.
    """
    pomiar = zmierz_rodzine(
        "syntetyczna",
        [
            _pozycja(id="a", wartosc_opcjonalna=1.0),
            _pozycja(id="b", wartosc_opcjonalna=2.0),
        ],
    )
    assert pomiar.pola_bez_ani_jednej_wartosci == ("druga_opcjonalna", "standard")
    assert "wartosc_opcjonalna" not in pomiar.pola_bez_ani_jednej_wartosci


def test_pole_niesione_przez_choc_jedna_pozycje_nie_jest_puste() -> None:
    pomiar = zmierz_rodzine(
        "syntetyczna",
        [_pozycja(id="a", standard="IEC 60269-1"), _pozycja(id="b")],
    )
    assert "standard" not in pomiar.pola_bez_ani_jednej_wartosci


def test_kazde_pole_bez_wartosci_w_zywym_katalogu_jest_polem_opcjonalnym() -> None:
    """Predykat parami: zbior pustych jest PODZBIOREM pol opcjonalnych rodziny."""
    for pomiar in zmierz_katalog():
        assert len(pomiar.pola_bez_ani_jednej_wartosci) <= pomiar.pola_opcjonalne, pomiar.rodzina


def test_duplikat_identyfikatora_jest_wykryty() -> None:
    pomiar = zmierz_rodzine("syntetyczna", [_pozycja(id="x"), _pozycja(id="x"), _pozycja(id="y")])
    assert pomiar.duplikaty_id == ("x",)


def test_status_produkcyjny_liczony_z_rekordu() -> None:
    pomiar = zmierz_rodzine(
        "syntetyczna",
        [
            _pozycja(id="a", catalog_status="PRODUKCYJNY_V1"),
            _pozycja(id="b", catalog_status="REFERENCYJNY_V1"),
        ],
    )
    assert pomiar.liczba_produkcyjnych == 1


# ---------------------------------------------------------------------------
# Renderowanie i zlozenie dokumentu
# ---------------------------------------------------------------------------


def test_blok_niesie_znaczniki_i_wiersz_kazdej_rodziny() -> None:
    pomiary = zmierz_katalog()
    blok = renderuj_blok_generowany(pomiary)
    assert blok.startswith(ZNACZNIK_POCZATEK)
    assert blok.rstrip().endswith(ZNACZNIK_KONIEC)
    for pomiar in pomiary:
        assert f"| `{pomiar.rodzina}` |" in blok


def test_zlozenie_dokumentu_bez_znacznikow_konczy_sie_bledem() -> None:
    with pytest.raises(ValueError, match="znacznik"):
        zloz_dokument("dokument bez znacznikow", "blok")


def test_zlozenie_podmienia_wylacznie_blok_miedzy_znacznikami() -> None:
    dokument = f"przed\n{ZNACZNIK_POCZATEK}\nstare\n{ZNACZNIK_KONIEC}\npo\n"
    wynik = zloz_dokument(dokument, f"{ZNACZNIK_POCZATEK}\nnowe\n{ZNACZNIK_KONIEC}")
    assert wynik == f"przed\n{ZNACZNIK_POCZATEK}\nnowe\n{ZNACZNIK_KONIEC}\npo\n"


def test_liczba_zapisana_z_przecinkiem_dziesietnym() -> None:
    """Dokument jest po polsku — separator dziesietny tez."""
    pomiar = PomiarRodziny(
        rodzina="syntetyczna",
        liczba_pozycji=2,
        liczba_produkcyjnych=1,
        pola_opcjonalne=3,
        wypelnienie_pol_procent=50.0,
        pozycje_z_proweniencja=2,
        pola_proweniencji_w_kontrakcie=("standard",),
        pola_bez_ani_jednej_wartosci=("standard",),
        duplikaty_id=(),
    )
    blok = renderuj_blok_generowany((pomiar,))
    assert "| 50,0 |" in blok
    # Pole, ktorego nie niesie ANI JEDNA pozycja, MUSI byc nazwane w tabeli.
    assert "`standard`" in blok


def test_miernik_czyta_rejestry_surowe_nie_listy_projektanta() -> None:
    """Listy `list_*` ukrywaja benchmarki; miernik ma zmierzyc CALY rejestr.

    Pomiar 2026-09-17: rodzina `synchronous-generator` ma wylacznie rekordy
    benchmarkow, wiec `list_synchronous_generator_types()` zwraca pusta liste,
    a rejestr — nie. Gdyby miernik czytal liste, rodzina raportowalaby zero.
    """
    katalog = get_default_mv_catalog()
    pomiar = next(p for p in zmierz_katalog(katalog) if p.rodzina == "synchronous-generator")
    assert pomiar.liczba_pozycji == len(katalog.synchronous_generator_types)
    assert pomiar.liczba_pozycji > len(katalog.list_synchronous_generator_types())
