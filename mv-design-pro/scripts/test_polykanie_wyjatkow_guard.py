"""Samotest strażnika „połknięty wyjątek" (karta #151) i jego drugiej połowy — odmowy danych
(karta ODMOWA-DANYCH-422).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): {typ handlera: Exception, BaseException,
gołe, krotka, atrybut} × {treść: pass, return, log, raise, raise … from, warunkowy raise
tylko w jednej gałęzi, raise związanej nazwy, raise innej nazwy}, osobno `suppress` dla
każdego szerokiego typu, oraz wpis B-01 (tylko plik z listy właściciela, zapadka w obie
strony).

Druga połowa: {handler: ValueError, krotka z ValueError, atrybut ValueError, ValidationError,
OdmowaDanychError} × {blok try: parsowanie UUID, enum z normalizacją, dwie liczby, wywołanie
usługi, parsowanie zagnieżdżone w wywołaniu usługi, pętla} × {treść: odpowiedź, ponowne
rzucenie} × {warstwa: api, poza api}; rejestracja handlera globalnego; `raise ValueError`
w trasie; granica B-01 {jedno wywołanie rdzenia, rdzeń przez zmienną modułu, dwie
instrukcje, wywołanie spoza rdzenia}; pin warstwy aplikacji w obie strony.
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


#: Wpis syntetyczny: lista właściciela jest pusta od decyzji B-01 z 2026-09-30, a
#: mechanizm zapadki (wyłącznie rdzeń B-01, w obie strony) musi zostać przypięty.
WPIS_SYNTETYCZNY = {
    ("network_model/solvers/state_estimation_wls.py", "_funkcja_syntetyczna"): (
        1,
        "Decyzja właściciela B-01 (wpis syntetyczny samotestu).",
    )
}


def test_wyjatek_dotyczy_wylacznie_pliku_z_listy_b01() -> None:
    """Pętla, nie parametryzacja: pusta lista nie może zamienić testu w pominięty."""
    for klucz, (_, odeslanie) in {**WYJATKI_B01, **WPIS_SYNTETYCZNY}.items():
        assert jest_rdzeniem_b01(klucz[0]), klucz
        assert "B-01" in odeslanie


def test_lista_b01_pusta_po_decyzji_chi2() -> None:
    """Pozycja (j) planu A/B §12.2: handler χ² w WLS zdjęty, wpis nie może wrócić."""
    assert WYJATKI_B01 == {}


def test_handler_poza_b01_w_tej_samej_funkcji_nazwy_jest_czerwony() -> None:
    """Wpis jest kluczem (plik, funkcja) — ta sama nazwa funkcji w innym pliku nie korzysta."""
    (sciezka, funkcja), _ = next(iter(WPIS_SYNTETYCZNY.items()))
    obcy = ("application/inny.py", 1, funkcja, "except Exception")
    wlasny = (sciezka, 1, funkcja, "except Exception")
    assert ocen([obcy, wlasny], WPIS_SYNTETYCZNY)
    assert ocen([wlasny], WPIS_SYNTETYCZNY) == []


def test_wpis_b01_nadmiarowy_jest_czerwony() -> None:
    """Zapadka w dół: gdy właściciel zdejmie handler, wpis musi zniknąć."""
    assert any("zapadka w dół" in blad for blad in ocen([], WPIS_SYNTETYCZNY))


def test_wpis_b01_przekroczony_jest_czerwony() -> None:
    (sciezka, funkcja), (liczba, _) = next(iter(WPIS_SYNTETYCZNY.items()))
    naruszenia = [(sciezka, i, funkcja, "except Exception") for i in range(liczba + 1)]
    assert any("wpis B-01 obejmuje" in blad for blad in ocen(naruszenia, WPIS_SYNTETYCZNY))


def test_handler_chi2_przywrocony_w_wls_jest_czerwony() -> None:
    """Nawrót cichej aproksymacji progu χ² w rdzeniu WLS czerwieni strażnika."""
    kod = (
        "def _chi_square_threshold(dof, alpha):\n    try:\n        return 1.0\n"
        "    except Exception:\n        return 2.0\n"
    )
    naruszenia = [
        ("network_model/solvers/state_estimation_wls.py", linia, funkcja, opis)
        for linia, funkcja, opis in naruszenia_w_kodzie(kod)
    ]
    assert naruszenia
    assert ocen(naruszenia)


def test_drzewo_backend_src_jest_zielone() -> None:
    assert ocen(zmierz()) == []


def test_pusty_katalog_nie_jest_fikcyjna_zielenia(tmp_path: Path) -> None:
    """Skan pustego drzewa nie melduje zieleni bez treści."""
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


# ---------------------------------------------------------------------------
# Druga połowa — odmowa danych (karta ODMOWA-DANYCH-422)
# ---------------------------------------------------------------------------

from polykanie_wyjatkow_guard import (  # noqa: E402
    BACKEND_SRC,
    PIN_RAISE_VALUEERROR_APLIKACJA,
    naruszenia_odmowy_w_kodzie,
    nazwy_rdzeni_b01,
    ocen_odmowy,
    policz_raise_value_error,
    zmierz_odmowy,
)

HANDLERY_ODMOWY = {
    "valueerror": ("except ValueError as exc:", True),
    "krotka": ("except (TypeError, ValueError) as exc:", True),
    "atrybut": ("except builtins.ValueError as exc:", True),
    "validation_error": ("except ValidationError as exc:", False),
    "odmowa_danych": ("except OdmowaDanychError as exc:", False),
}

#: Blok `try` → czy jest parsowaniem wejścia (dozwolonym dla `except ValueError`).
BLOKI_TRY = {
    "uuid": ("identyfikator = UUID(tekst)", True),
    "enum_normalizacja": ("tryb = ImportMode(tekst.lower())", True),
    "dwie_liczby": ("a = float(x)\n        b = int(y)", True),
    "return_parsowania": ("FaultType(tekst)\n        return tekst", True),
    "usluga": ("return build_view(run)", False),
    "parsowanie_w_usludze": ("return get_run(UUID(str(tekst)))", False),
    "petla": ("for x in xs:\n            float(x)", False),
}

TRESCI_ODMOWY = {
    "odpowiedz": ("raise HTTPException(status_code=422, detail=str(exc)) from exc", True),
    "ponowne_rzucenie": ("raise", False),
}


def _trasa(naglowek: str, blok: str, tresc: str) -> str:
    return (
        "def trasa(tekst, x, y, xs, run):\n"
        "    try:\n"
        f"        {blok}\n"
        f"    {naglowek}\n"
        f"        {tresc}\n"
    )


@pytest.mark.parametrize("handler", sorted(HANDLERY_ODMOWY))
@pytest.mark.parametrize("blok", sorted(BLOKI_TRY))
@pytest.mark.parametrize("tresc", sorted(TRESCI_ODMOWY))
@pytest.mark.parametrize("warstwa_api", [True, False])
def test_iloczyn_handler_x_blok_try_x_tresc_x_warstwa(
    handler: str, blok: str, tresc: str, warstwa_api: bool
) -> None:
    naglowek, lapie_value_error = HANDLERY_ODMOWY[handler]
    kod_bloku, parsowanie = BLOKI_TRY[blok]
    kod_tresci, bez_ponowienia = TRESCI_ODMOWY[tresc]
    kod = _trasa(naglowek, kod_bloku, kod_tresci)
    naruszenie = warstwa_api and lapie_value_error and bez_ponowienia and not parsowanie
    wynik = naruszenia_odmowy_w_kodzie(kod, warstwa_api=warstwa_api, rdzenie=frozenset())
    assert bool(wynik) is naruszenie, (handler, blok, tresc, warstwa_api, wynik)


@pytest.mark.parametrize(
    ("kod", "naruszenie"),
    [
        ("@app.exception_handler(ValueError)\nasync def h(r, e): ...\n", True),
        ("app.add_exception_handler(ValueError, h)\n", True),
        ("@app.exception_handler(builtins.ValueError)\nasync def h(r, e): ...\n", True),
        ("@app.exception_handler(OdmowaDanychError)\nasync def h(r, e): ...\n", False),
        ("@app.exception_handler(Exception)\nasync def h(r, e): ...\n", False),
    ],
)
def test_rejestracja_handlera_globalnego_value_error(kod: str, naruszenie: bool) -> None:
    wynik = naruszenia_odmowy_w_kodzie(kod, warstwa_api=True, rdzenie=frozenset())
    assert bool(wynik) is naruszenie


@pytest.mark.parametrize(
    ("kod", "api", "naruszenie"),
    [
        ("def f():\n    raise ValueError('x')\n", True, True),
        ("def f():\n    raise ValueError\n", True, True),
        ("def f():\n    raise OdmowaDanychError('x')\n", True, False),
        ("def f():\n    raise AssertionError('x')\n", True, False),
        ("def f():\n    raise ValueError('x')\n", False, False),
    ],
)
def test_raise_value_error_w_trasie(kod: str, api: bool, naruszenie: bool) -> None:
    wynik = naruszenia_odmowy_w_kodzie(kod, warstwa_api=api, rdzenie=frozenset())
    assert bool(wynik) is naruszenie


RDZENIE = frozenset({"Solver", "estimate_wls", "_solver"})


@pytest.mark.parametrize(
    ("cialo", "naruszenie"),
    [
        ("wynik = estimate_wls(y)", False),
        ("return Solver.compute_3ph(graph=g)", False),
        ("wynik = _solver.run(zadanie)", False),
        ("wynik = estimate_wls(y)\n        inne = policz(wynik)", True),
        ("wynik = policz(y)", True),
        ("pass", True),
    ],
)
@pytest.mark.parametrize("warstwa_api", [True, False])
def test_granica_b01_obejmuje_wylacznie_jedno_wywolanie_rdzenia(
    cialo: str, naruszenie: bool, warstwa_api: bool
) -> None:
    kod = f"def f(y, g, zadanie):\n    with odmowa_rdzenia_b01():\n        {cialo}\n"
    wynik = naruszenia_odmowy_w_kodzie(kod, warstwa_api=warstwa_api, rdzenie=RDZENIE)
    assert bool(wynik) is naruszenie, (cialo, wynik)


def test_nazwy_rdzeni_b01_z_importow_i_zmiennej_modulu(tmp_path: Path) -> None:
    """Nazwa rdzenia to import z pliku z listy właściciela (także z pakietu katalogu
    B-01) albo zmienna modułu zbudowana wywołaniem takiej nazwy; import spoza listy nie."""
    import ast

    for sciezka in (
        "network_model/solvers/state_estimation_wls.py",
        "network_model/solvers/ncrfg_ptpiree/__init__.py",
        "network_model/solvers/machine_sc_iec60909.py",
    ):
        plik = tmp_path / sciezka
        plik.parent.mkdir(parents=True, exist_ok=True)
        plik.write_text("", encoding="utf-8")
    kod = (
        "from network_model.solvers.state_estimation_wls import estimate_wls as ew\n"
        "from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeSolver\n"
        "from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions\n"
        "_solver = NcRfgPtpireeSolver()\n"
        "_inny = compute_machine_contributions()\n"
    )
    assert nazwy_rdzeni_b01(ast.parse(kod), tmp_path) == frozenset(
        {"ew", "NcRfgPtpireeSolver", "_solver"}
    )


@pytest.mark.parametrize(("liczba", "zielony"), [(10, True), (11, False), (9, False)])
def test_pin_warstwy_aplikacji_w_obie_strony(liczba: int, zielony: bool) -> None:
    assert (ocen_odmowy([], liczba, 10) == []) is zielony


def test_drzewo_backend_src_druga_polowa_zielona() -> None:
    assert zmierz_odmowy() == []
    assert policz_raise_value_error(BACKEND_SRC / "application") == PIN_RAISE_VALUEERROR_APLIKACJA


def test_handler_globalny_produktu_nie_ma_value_error() -> None:
    """Przypięcie na realnym pliku: gdyby ktoś przywrócił `exception_handler(ValueError)`,
    strażnik wskaże dokładnie ten plik."""
    tresc = (BACKEND_SRC / "api" / "exception_handlers.py").read_text(encoding="utf-8")
    assert naruszenia_odmowy_w_kodzie(tresc, warstwa_api=True) == []
    zepsuta = tresc.replace(
        "@app.exception_handler(OdmowaDanychError)", "@app.exception_handler(ValueError)"
    )
    assert naruszenia_odmowy_w_kodzie(zepsuta, warstwa_api=True)
