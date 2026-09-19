"""Adres bazy testowej z izolacja schematu NIE MOZE gubic hasla.

DEFEKT ZLAPANY PRZEZ CI (2026-09-18, job „Dialekt produkcyjny (PostgreSQL 16)",
12 testow czerwonych z `FATAL: password authentication failed for user
"postgres"`): fikstura `postgres_url` budowala adres przez `str(URL)`, a
`URL.__str__` SQLAlchemy MASKUJE haslo ciagiem `***`. Lokalnie nie bylo tego
widac, bo efemeryczny klaster testowy stoi na `-A trust` i hasla w adresie nie
ma wcale — maskowanie nie mialo czego zepsuc. Serwer z uwierzytelnianiem
haslem (czyli KAZDY serwer produkcyjny i usluga CI) odrzucal polaczenie.

Ten test pilnuje KLASY, nie instancji: sprawdza SAMA OPERACJE skladania adresu
(URL z haslem + opcja `search_path`), wiec nie wymaga serwera i biegnie w
kazdym srodowisku. Iloczyn cech: {adres z haslem, adres bez hasla} x
{haslo ze znakiem specjalnym, haslo zwykle} x {opcja search_path dodana}.
"""

from __future__ import annotations

import pytest
from sqlalchemy.engine import make_url


def _z_izolacja(adres: str, schemat: str) -> str:
    """Ta sama operacja, ktora wykonuje fikstura `postgres_url` w conftest."""
    return (
        make_url(adres)
        .update_query_dict({"options": f"-csearch_path={schemat}"})
        .render_as_string(hide_password=False)
    )


@pytest.mark.parametrize(
    "haslo",
    ["postgres", "ha$lo z@ znakiem", "P4ss:word/slash"],
)
def test_adres_z_haslem_zachowuje_haslo_po_dolozeniu_search_path(haslo: str) -> None:
    adres = make_url("postgresql+psycopg://postgres@127.0.0.1:5432/mvtest").set(password=haslo)
    wynik = _z_izolacja(adres.render_as_string(hide_password=False), "mv_test_abc")

    odczytany = make_url(wynik)
    assert odczytany.password == haslo, wynik
    assert "***" not in wynik, "haslo zamaskowane — adres nie polaczy sie z serwerem"
    assert odczytany.query["options"] == "-csearch_path=mv_test_abc"


def test_adres_bez_hasla_pozostaje_bez_hasla() -> None:
    """Klaster efemeryczny (`-A trust`) nie ma hasla — i ma go NIE dostac."""
    wynik = _z_izolacja("postgresql+psycopg://mvtest@127.0.0.1:55432/mvtest", "mv_test_xyz")

    odczytany = make_url(wynik)
    assert odczytany.password is None, wynik
    assert odczytany.query["options"] == "-csearch_path=mv_test_xyz"


def test_str_url_nadal_maskuje_haslo_czyli_pulapka_istnieje() -> None:
    """Pin przyczyny: gdyby SQLAlchemy przestalo maskowac w `__str__`, ten test
    zapali sie i pozwoli uproscic fiksture zamiast trzymac obejscie bez powodu."""
    adres = make_url("postgresql+psycopg://postgres:tajne@127.0.0.1:5432/mvtest")
    assert "***" in str(adres)
    assert "tajne" in adres.render_as_string(hide_password=False)
