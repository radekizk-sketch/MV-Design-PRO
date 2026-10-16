"""Wiązanie aparatu pola nN przy promocji `nn_field_specs` (karta #151 na obecnym API).

Dawne `except Exception: return None, None` gubiło po cichu wiązanie aparatu przy
KAŻDYM wyjątku materializacji — także błędzie programu — a model szedł dalej bez
parametrów aparatu. Karta SLD-SUBSTRAT zastąpiła własną materializację migracji
(`_materializuj_aparat`) operacją akcji naprawczej `assign_catalog_to_element`
(`_wiazanie_z_wpisu` + `_przypisz_wiazania`); trzy twierdzenia karty #151 obowiązują
dalej i są tu sprawdzane na ścieżce `migruj`, którą model przechodzi przy każdym odczycie.

Iloczyn cech: klucz wiązania we wpisie {`catalog_binding`, `catalog_bindings`} × stan
wiązania {pozycja spoza katalogu, brak klucza, None, napis, pusty słownik, identyfikator
z samych spacji} × zachowanie operacji {odmowa danych, wyjątek materializacji
{AttributeError, KeyError, TypeError}, odpowiedź odmowy bez kodu} × ścieżka {`migruj`,
magazyn `enm.store` (zapis → odczyt z migracją)}.
"""

from __future__ import annotations

import ast
import inspect
import re
from pathlib import Path
from typing import Any

import enm.domain_operations as operacje
import pytest
from enm.migrations import nn_field_specs_promocja as promocja
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Substation,
    SwitchBranch,
)
from enm.store import get_enm, reset_enm_store, set_enm

KLUCZE_WIAZANIA = ("catalog_binding", "catalog_bindings")

#: Wpis bez klucza wiązania (inny kształt braku niż wartość `None` pod kluczem).
_BRAK_KLUCZA = object()


@pytest.fixture(autouse=True)
def _magazyn_prywatny(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Any:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    yield
    reset_enm_store()


def _model(klucz: str, wiazanie: Any) -> EnergyNetworkModel:
    """Stacja z jednym niepromowanym odpływem nN niosącym `wiazanie` pod `klucz`
    (`_BRAK_KLUCZA` — wpis bez klucza wiązania)."""
    meta: dict[str, Any] = {"feeder_role": "ODPLYW_NN"}
    if wiazanie is not _BRAK_KLUCZA:
        meta[klucz] = wiazanie
    return EnergyNetworkModel(
        header=ENMHeader(name="promocja-aparat", defaults=ENMDefaults()),
        buses=[Bus(ref_id="bus-nn", name="Szyna nN", voltage_kv=0.4)],
        substations=[
            Substation(
                ref_id="st1",
                name="ST-1",
                station_type="mv_lv",
                bus_refs=["bus-nn"],
                meta={
                    "nn_field_specs": [
                        {
                            "field_ref": "nn/f1",
                            "name": "Odpływ 1",
                            "bay_role": "FEEDER",
                            "bus_ref": "bus-nn",
                            "meta": meta,
                        }
                    ]
                },
            )
        ],
    )


def _aparat(model: EnergyNetworkModel) -> SwitchBranch:
    aparaty = [
        b
        for b in model.branches
        if (b.meta or {}).get(promocja.META_KLUCZ_GALAZ_ZRODLO_FIELD_REF) == "nn/f1"
    ]
    assert len(aparaty) == 1
    aparat = aparaty[0]
    assert isinstance(aparat, SwitchBranch)
    return aparat


def _asercje_braku_wiazania(aparat: SwitchBranch) -> None:
    assert aparat.catalog_ref is None
    assert aparat.materialized_params is None
    assert aparat.parameter_source is None
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_pozycja_spoza_katalogu_to_odmowa_danych_bez_wyjatku(klucz: str) -> None:
    # Twierdzenie #151 (1): pozycji nie ma w katalogu = odmowa DANYCH, nie wyjątek.
    # Dawniej `_materializuj_aparat(...) == (None, None)`; dziś migracja kończy się,
    # aparat zostaje niezwiązany, a odmowa ma NAZWANY kod z odpowiedzi operacji
    # (czytany wprost, bez zapasu spoza rejestru gotowości).
    zmigrowany, zmieniono = promocja.migruj(
        _model(klucz, {"catalog_item_id": "aparat-ktorego-nie-ma"})
    )
    assert zmieniono is True
    aparat = _aparat(zmigrowany)
    _asercje_braku_wiazania(aparat)
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] == "catalog.item_not_found"


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_odmowa_danych_na_sciezce_magazynu(klucz: str) -> None:
    # Realna ścieżka: model zapisany i odczytany z magazynu (migracja przy odczycie,
    # `enm.store.get_enm` → `przygotuj_model_po_odczycie`).
    set_enm("przypadek-odmowy", _model(klucz, {"catalog_item_id": "aparat-ktorego-nie-ma"}))
    aparat = _aparat(get_enm("przypadek-odmowy"))
    _asercje_braku_wiazania(aparat)
    assert aparat.meta[promocja.META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] == "catalog.item_not_found"


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
@pytest.mark.parametrize("wiazanie", [_BRAK_KLUCZA, None, "napis", {}, {"catalog_item_id": "  "}])
def test_brak_wiazania_to_brak_materializacji(
    klucz: str, wiazanie: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Twierdzenie #151 (2): brak wiązania = brak materializacji. Dawniej
    # `_materializuj_aparat(wiazanie) == (None, None)`; dziś `_wiazanie_z_wpisu` nie
    # buduje payloadu, operacja przypisania NIE jest wołana, a aparat wchodzi do modelu
    # bez wiązania i bez kodu odmowy (brak ≠ odmowa).
    def _nie_wolno(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("przypisanie katalogu wołane mimo braku wiązania")

    monkeypatch.setattr(operacje, "assign_catalog_to_element", _nie_wolno)
    model = _model(klucz, wiazanie)
    spec = model.substations[0].meta["nn_field_specs"][0]
    assert promocja._wiazanie_z_wpisu(spec) is None

    zmigrowany, zmieniono = promocja.migruj(model)
    assert zmieniono is True
    aparat = _aparat(zmigrowany)
    _asercje_braku_wiazania(aparat)
    assert promocja.META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA not in aparat.meta


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_materializacji_wybucha(
    klucz: str, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    # Twierdzenie #151 (3): błąd programu w materializacji wybucha. Dawniej zepsuty
    # `promocja.materialize_catalog_binding`; dziś materializację wykonuje operacja
    # akcji naprawczej, więc psujemy materializator, z którego ona czyta — wyjątek musi
    # przejść przez `assign_catalog_to_element` i `_przypisz_wiazania` aż do `migruj`.
    # Dowodem jest TOŻSAMOŚĆ rekordu wyjątku (ten sam obiekt, ten sam typ), nie treść
    # komunikatu: przepakowanie w inny wyjątek z tym samym napisem też by „pasowało”.
    wstrzykniety = typ("wyjątek wstrzyknięty do materializatora")

    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise wstrzykniety

    monkeypatch.setattr(operacje, "materialize_catalog_binding", _zepsuty)
    with pytest.raises(typ) as zlapany:
        promocja.migruj(_model(klucz, {"catalog_item_id": "cokolwiek"}))
    assert type(zlapany.value) is typ
    assert zlapany.value is wstrzykniety


@pytest.mark.parametrize("klucz", KLUCZE_WIAZANIA)
def test_odmowa_bez_kodu_to_blad_programu_nie_kod_zastepczy(
    klucz: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Każda odmowa operacji niesie `error_code` (`_error_response`, test niżej). Odpowiedź
    # odmowy bez kodu jest błędem programu — migracja czyta kod wprost (KeyError) i nie
    # dopisuje kodu zastępczego spoza rejestru gotowości.
    def _odmowa_bez_kodu(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"error": "odmowa bez kodu", "snapshot": None}

    monkeypatch.setattr(operacje, "assign_catalog_to_element", _odmowa_bez_kodu)
    with pytest.raises(KeyError):
        promocja.migruj(_model(klucz, {"catalog_item_id": "cokolwiek"}))


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
