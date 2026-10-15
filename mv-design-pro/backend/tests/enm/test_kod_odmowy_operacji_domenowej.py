"""Kod odmowy operacji domenowej z jednego źródła (karta #151, przegląd PARTIA-6-BACKEND).

Każda odmowa operacji domenowej powstaje w `_error_response`, które zawsze niesie
`error_code`; konsumenci (migracja promocji aparatów nN `enm/migrations/
promocja_aparatow_nn.py`, `api/generators.py`, `application/station_templates/apply.py`,
bramy materializacji w operacjach) czytają kod WPROST, bez zapasu spoza rejestru
gotowości. Twierdzenia ścieżki migracji (odmowa danych, brak wiązania, błąd programu)
przypina `tests/enm/test_promocja_aparatow_nn.py` na rekordach `bays` (karta W5-B).
"""

from __future__ import annotations

import ast
import inspect
import re
from pathlib import Path

import enm.domain_operations as operacje
import pytest

_KATALOG_SRC = Path(operacje.__file__).resolve().parents[1]
_KOD_ODMOWY = re.compile(r"^[a-z0-9_]+(?:\.[a-z0-9_]+)+$")
_RDZENIE_NAZWY_KODU = ("error", "code", "kod", "blad")


def _nazwa_kodu(nazwa: str) -> bool:
    """Nazwa niosąca kod odmowy: `error_code`, `catalog_error`, `kod_bledu`, `blad_katalogu`…"""
    return any(rdzen in nazwa.lower() for rdzen in _RDZENIE_NAZWY_KODU)


def _niesie_kod(wezel: ast.AST) -> bool:
    """Czy wyrażenie czyta kod odmowy (nazwa, atrybut, klucz albo `.get` z nazwą kodu)."""
    for w in ast.walk(wezel):
        if isinstance(w, ast.Name) and _nazwa_kodu(w.id):
            return True
        if isinstance(w, ast.Attribute) and _nazwa_kodu(w.attr):
            return True
        if isinstance(w, ast.Constant) and isinstance(w.value, str) and _nazwa_kodu(w.value):
            return True
    return False


def _zapasy_kodu(drzewo: ast.AST) -> list[int]:
    """`<kod> or "dziedzina.kod"` w KAŻDYM miejscu modułu (poziom modułu, funkcje
    zwykłe i asynchroniczne, lambdy, wyrażenia zagnieżdżone)."""
    linie: list[int] = []
    for w in ast.walk(drzewo):
        if not (isinstance(w, ast.BoolOp) and isinstance(w.op, ast.Or)):
            continue
        ostatni = w.values[-1]
        if (
            isinstance(ostatni, ast.Constant)
            and isinstance(ostatni.value, str)
            and _KOD_ODMOWY.match(ostatni.value)
            and any(_niesie_kod(v) for v in w.values[:-1])
        ):
            linie.append(w.lineno)
    return linie


def _funkcja_error_response(drzewo: ast.AST) -> set[int]:
    """Identyfikatory węzłów wewnątrz definicji `_error_response` (jedyne legalne źródło)."""
    wnetrze: set[int] = set()
    for w in ast.walk(drzewo):
        if isinstance(w, ast.FunctionDef | ast.AsyncFunctionDef) and w.name == "_error_response":
            wnetrze.update(id(x) for x in ast.walk(w))
    return wnetrze


def _odpowiedzi_bledu_poza_zrodlem(drzewo: ast.AST) -> list[int]:
    """Słownik z kluczem "error" albo przypisanie `x["error"] = …` poza `_error_response`
    — w całym module, nie tylko w ciałach `def`."""
    wnetrze = _funkcja_error_response(drzewo)
    linie: list[int] = []
    for w in ast.walk(drzewo):
        if id(w) in wnetrze:
            continue
        if isinstance(w, ast.Dict) and any(
            isinstance(k, ast.Constant) and k.value == "error" for k in w.keys
        ):
            linie.append(w.lineno)
        if isinstance(w, ast.Assign | ast.AugAssign | ast.AnnAssign):
            cele = w.targets if isinstance(w, ast.Assign) else [w.target]
            for cel in cele:
                if (
                    isinstance(cel, ast.Subscript)
                    and isinstance(cel.slice, ast.Constant)
                    and cel.slice.value == "error"
                ):
                    linie.append(w.lineno)
    return linie


def _kody_wywolan_error_response(drzewo: ast.AST) -> list[tuple[int, ast.expr | None]]:
    """Argument kodu każdego wywołania `_error_response` (pozycyjny drugi albo `code=`)."""
    wynik: list[tuple[int, ast.expr | None]] = []
    for w in ast.walk(drzewo):
        if not isinstance(w, ast.Call):
            continue
        nazwa = w.func.id if isinstance(w.func, ast.Name) else getattr(w.func, "attr", None)
        if nazwa != "_error_response":
            continue
        if any(isinstance(arg, ast.Starred) for arg in w.args):
            # `_error_response(*para)` — para (komunikat, kod) z walidatora; kod sprawdza
            # wtedy asercja niepustego kodu w `_error_response` w czasie wykonania.
            continue
        kod: ast.expr | None = w.args[1] if len(w.args) >= 2 else None
        for kw in w.keywords:
            if kw.arg == "code":
                kod = kw.value
        wynik.append((w.lineno, kod))
    return wynik


def test_odmowa_operacji_domenowej_zawsze_niesie_kod() -> None:
    # Podstawa odczytu `wynik["error_code"]` bez zapasu (migracja, `api/generators.py`,
    # `application/station_templates/apply.py`, bramy materializacji w operacjach):
    # (a) `_error_response` nie ma domyślnego kodu — dawny `"UNKNOWN"` był kodem spoza
    # rejestru gotowości — i odmawia kodu pustego; (b) żaden moduł `enm/` nie składa
    # odpowiedzi błędu z pominięciem `_error_response` (literał słownika z kluczem
    # "error" albo przypisanie pod klucz "error", w funkcjach zwykłych, asynchronicznych
    # i na poziomie modułu); (c) każde wywołanie `_error_response` podaje kod i nie jest
    # to napis pusty ani zapas `x or "kod"`.
    parametr = inspect.signature(operacje._error_response).parameters["code"]
    assert parametr.default is inspect.Parameter.empty
    for pusty in ("", "   "):
        with pytest.raises(AssertionError):
            operacje._error_response("komunikat", pusty)

    obce: list[str] = []
    zle_kody: list[str] = []
    for plik in sorted((_KATALOG_SRC / "enm").rglob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        obce += [f"{plik.name}:{n}" for n in _odpowiedzi_bledu_poza_zrodlem(drzewo)]
        for linia, kod in _kody_wywolan_error_response(drzewo):
            pusty = (
                kod is None
                or (isinstance(kod, ast.Constant) and not str(kod.value).strip())
                or (isinstance(kod, ast.BoolOp) and isinstance(kod.op, ast.Or))
            )
            if pusty:
                zle_kody.append(f"{plik.name}:{linia}")
    assert obce == [], f"odpowiedź błędu złożona poza `_error_response`: {obce}"
    assert zle_kody == [], f"`_error_response` bez kodu, z pustym kodem albo z zapasem: {zle_kody}"


def test_zaden_modul_src_nie_ma_zapasu_kodu_odmowy() -> None:
    # KLASA (przegląd 65b00094): zapas `kod or "dziedzina.kod"` po odmowie producenta,
    # który kontrakt zobowiązuje do kodu (`_error_response`, `MaterializationResult`), jest
    # martwy albo maskuje zerwany kontrakt kodem spoza rejestru. Skan całego `backend/src`.
    zapasy = [
        f"{plik.relative_to(_KATALOG_SRC)}:{linia}"
        for plik in sorted(_KATALOG_SRC.rglob("*.py"))
        for linia in _zapasy_kodu(ast.parse(plik.read_text(encoding="utf-8")))
    ]
    assert zapasy == [], f"zapas kodu odmowy zamiast kodu z kontraktu: {zapasy}"


@pytest.mark.parametrize(
    "zrodlo",
    [
        'def f(w):\n    return w.error_code or "catalog.x"\n',
        'async def f(w):\n    return w["error_code"] or "catalog.x"\n',
        'kod = wynik.get("error_code") or "catalog.x"\n',
        'f = lambda blad: blad or "catalog.x"\n',
        'def g(catalog_error, ref):\n    return catalog_error or "ct.catalog_required"\n',
        'class K:\n    def m(self, kod):\n        return {"c": kod or "a.b"}\n',
    ],
)
def test_detektor_zapasu_kodu_widzi_kazde_miejsce(zrodlo: str) -> None:
    assert _zapasy_kodu(ast.parse(zrodlo)), zrodlo


@pytest.mark.parametrize(
    "zrodlo",
    [
        'x = {"error": "m", "error_code": "a.b"}\n',
        'async def f():\n    return {"error": "m"}\n',
        'def f(o):\n    o["error"] = "m"\n',
        'class K:\n    STALA = {"error": 1}\n',
    ],
)
def test_detektor_odpowiedzi_bledu_widzi_kazde_miejsce(zrodlo: str) -> None:
    assert _odpowiedzi_bledu_poza_zrodlem(ast.parse(zrodlo)), zrodlo


def test_detektor_odpowiedzi_bledu_pomija_wnetrze_zrodla() -> None:
    zrodlo = 'def _error_response(m, code):\n    return {"error": m, "error_code": code}\n'
    assert _odpowiedzi_bledu_poza_zrodlem(ast.parse(zrodlo)) == []
