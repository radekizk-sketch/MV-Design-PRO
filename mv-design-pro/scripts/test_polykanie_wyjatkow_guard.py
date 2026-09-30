"""Samotest strażnika „połknięty wyjątek" (karta #151).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): {typ handlera: Exception, BaseException,
gołe, krotka, atrybut} × {treść: pass, return, log, raise, raise … from, warunkowy raise
tylko w jednej gałęzi, raise związanej nazwy, raise innej nazwy}, osobno `suppress` dla
każdego szerokiego typu, oraz wpis B-01 (tylko plik z listy właściciela, zapadka w obie
strony).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from polykanie_wyjatkow_guard import (  # noqa: E402
    WYJATKI_B01,
    naruszenia_w_kodzie,
    ocen,
    zmierz,
)
from rdzenie_b01 import jest_rdzeniem_b01  # noqa: E402

TYPY_SZEROKIE = {
    "Exception": "except Exception as exc:",
    "BaseException": "except BaseException as exc:",
    "gole": "except:",
    "krotka": "except (ValueError, Exception) as exc:",
    "atrybut": "except builtins.Exception as exc:",
}

#: Treść handlera → czy jest naruszeniem.
TRESCI = {
    "pass": ("pass", True),
    "return": ("return None", True),
    "log": ("log.warning('x')", True),
    "raise": ("log.warning('x')\n        raise", False),
    "raise_from": ("raise RuntimeError('y') from None", True),
    "warunkowy_raise": ("if warunek:\n            raise\n        return None", True),
    "raise_innej_nazwy": ("raise blad", True),
}


def _modul(naglowek: str, tresc: str) -> str:
    return (
        "def f(warunek, blad):\n"
        "    try:\n"
        "        g()\n"
        f"    {naglowek}\n"
        f"        {tresc}\n"
    )


@pytest.mark.parametrize("typ", sorted(TYPY_SZEROKIE))
@pytest.mark.parametrize("tresc", sorted(TRESCI))
def test_iloczyn_typ_handlera_x_tresc(typ: str, tresc: str) -> None:
    kod_tresci, naruszenie = TRESCI[tresc]
    wynik = naruszenia_w_kodzie(_modul(TYPY_SZEROKIE[typ], kod_tresci))
    assert bool(wynik) is naruszenie, (typ, tresc, wynik)
    if naruszenie:
        assert wynik[0][1] == "f"


@pytest.mark.parametrize("typ", ["Exception", "BaseException", "krotka", "atrybut"])
def test_raise_zwiazanej_nazwy_to_ponowne_rzucenie(typ: str) -> None:
    assert naruszenia_w_kodzie(_modul(TYPY_SZEROKIE[typ], "sprzataj()\n        raise exc")) == []


@pytest.mark.parametrize(
    "naglowek",
    ["except ValueError:", "except (KeyError, OSError) as exc:", "except np.linalg.LinAlgError:"],
)
@pytest.mark.parametrize("tresc", sorted(TRESCI))
def test_waski_typ_nie_jest_naruszeniem_strazika(naglowek: str, tresc: str) -> None:
    """Wąski handler to nazwana reakcja — ocenia go przegląd i test, nie ten strażnik."""
    assert naruszenia_w_kodzie(_modul(naglowek, TRESCI[tresc][0])) == []


@pytest.mark.parametrize(
    "wywolanie",
    [
        "suppress(Exception)",
        "suppress(BaseException)",
        "contextlib.suppress(Exception)",
        "contextlib.suppress(ValueError, Exception)",
        "suppress(builtins.BaseException)",
    ],
)
def test_suppress_szerokiego_typu_jest_naruszeniem(wywolanie: str) -> None:
    kod = f"def f():\n    with {wywolanie}:\n        g()\n"
    assert len(naruszenia_w_kodzie(kod)) == 1


@pytest.mark.parametrize("wywolanie", ["suppress(FileNotFoundError)", "suppress(KeyError)"])
def test_suppress_waskiego_typu_nie_jest_naruszeniem(wywolanie: str) -> None:
    assert naruszenia_w_kodzie(f"def f():\n    with {wywolanie}:\n        g()\n") == []


def test_napis_komentarz_docstring_nie_licza_sie() -> None:
    kod = (
        'def f():\n    """except Exception: pass"""\n'
        "    # except Exception:\n    return 'except BaseException:'\n"
    )
    assert naruszenia_w_kodzie(kod) == []


def test_zagniezdzony_handler_w_handlerze_ponownie_rzucajacym() -> None:
    """Handler zewnętrzny kończy się `raise`, wewnętrzny połyka — liczy się wewnętrzny."""
    kod = (
        "def f():\n    try:\n        g()\n    except Exception:\n"
        "        try:\n            sprzataj()\n        except Exception:\n            pass\n"
        "        raise\n"
    )
    assert [n[0] for n in naruszenia_w_kodzie(kod)] == [7]


def test_funkcja_przypisana_do_handlera_w_metodzie() -> None:
    kod = "class K:\n    def m(self):\n        try:\n            g()\n        except:\n            pass\n"
    assert naruszenia_w_kodzie(kod)[0][1] == "m"


# ---------------------------------------------------------------------------
# Wpis B-01 — wyłącznie plik z listy właściciela, zapadka w obie strony
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("klucz", sorted(WYJATKI_B01))
def test_wyjatek_dotyczy_wylacznie_pliku_z_listy_b01(klucz: tuple[str, str]) -> None:
    assert jest_rdzeniem_b01(klucz[0]), klucz
    assert "B-01" in WYJATKI_B01[klucz][1]


def test_handler_poza_b01_w_tej_samej_funkcji_nazwy_jest_czerwony() -> None:
    """Wpis jest kluczem (plik, funkcja) — ta sama nazwa funkcji w innym pliku nie korzysta."""
    (sciezka, funkcja), _ = next(iter(WYJATKI_B01.items()))
    obcy = ("application/inny.py", 1, funkcja, "except Exception")
    assert ocen([obcy])


def test_wpis_b01_nadmiarowy_jest_czerwony() -> None:
    """Zapadka w dół: gdy właściciel zdejmie handler, wpis musi zniknąć."""
    assert any("zapadka w dół" in blad for blad in ocen([]))


def test_wpis_b01_przekroczony_jest_czerwony() -> None:
    (sciezka, funkcja), (liczba, _) = next(iter(WYJATKI_B01.items()))
    naruszenia = [(sciezka, i, funkcja, "except Exception") for i in range(liczba + 1)]
    assert any("wpis B-01 obejmuje" in blad for blad in ocen(naruszenia))


def test_drzewo_backend_src_jest_zielone() -> None:
    assert ocen(zmierz()) == []


def test_pusty_katalog_nie_jest_fikcyjna_zielenia(tmp_path: Path) -> None:
    """Skan pustego drzewa widzi brak wpisu B-01 — nie melduje zieleni bez treści."""
    assert ocen(zmierz(tmp_path))


# ---------------------------------------------------------------------------
# Połknięty błąd importu modułu, który nie może być nieobecny
# ---------------------------------------------------------------------------

IMPORTY = {
    "wlasny_from": ("from enm.store import get_enm", True),
    "wlasny_import": ("import network_model.catalog", True),
    "wzgledny": ("from .modul import cos", True),
    "stdlib": ("import tomllib", True),
    "opcjonalny": ("from reportlab.pdfgen import canvas", False),
    "opcjonalny_docx": ("from docx import Document", False),
}
TYPY_IMPORTU = {
    "ImportError": "except ImportError:",
    "ModuleNotFoundError": "except ModuleNotFoundError:",
    "krotka": "except (ImportError, ValueError):",
}


@pytest.mark.parametrize("typ", sorted(TYPY_IMPORTU))
@pytest.mark.parametrize("import_", sorted(IMPORTY))
@pytest.mark.parametrize("tresc", ["return None", "raise"])
def test_iloczyn_blad_importu_x_modul_x_tresc(typ: str, import_: str, tresc: str) -> None:
    instrukcja, obowiazkowy = IMPORTY[import_]
    kod = f"def f():\n    try:\n        {instrukcja}\n    {TYPY_IMPORTU[typ]}\n        {tresc}\n"
    naruszenie = obowiazkowy and tresc != "raise"
    assert bool(naruszenia_w_kodzie(kod)) is naruszenie, (typ, import_, tresc)


def test_import_na_poziomie_modulu_tez_jest_liczony() -> None:
    kod = "try:\n    import enm\nexcept ImportError:\n    enm = None\n"
    assert naruszenia_w_kodzie(kod)[0][1] == "<moduł>"


def test_pakiety_wlasne_to_katalogi_backend_src() -> None:
    from polykanie_wyjatkow_guard import BACKEND_SRC, pakiety_wlasne

    wlasne = pakiety_wlasne(BACKEND_SRC)
    assert {"enm", "network_model", "api", "application", "domain"} <= wlasne
    assert "reportlab" not in wlasne
