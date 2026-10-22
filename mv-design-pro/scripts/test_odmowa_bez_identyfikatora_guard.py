"""Samotest `odmowa_bez_identyfikatora_guard` (partia integracji 10).

INTENCJA. Partia 10 przebudowała klasę „treść odmowy danych niesie identyfikator maszynowy"
w rdzeniach i warstwie aplikacji; strażnik pilnuje, żeby nie wróciła. Testy sprawdzają
obietnice docstringu strażnika (reguła KLASA pkt 4) jako ILOCZYN CECH:

  * przynależność do rodziny {korzeń, podklasa bezpośrednia, podklasa przechodnia, podklasa
    z własnym `__init__` (tekst pozycyjnie / nazwą), rekord `RekordOdmowy` (pozycyjnie /
    nazwą), wnętrze `super().__init__` klasy rodziny} × forma odwołania {nazwa z tokenem,
    atrybut, klucz, `.get`, nośnik z przypisania, `%`, `.format`};
  * miejsca, w których trafienie byłoby FAŁSZYWE: klasa spoza rodziny, odczyt nazwy przez
    wywołanie funkcji, parametr z identyfikatorem w położeniu nie-tekstowym (`ref_id`
    w sygnaturze `__init__`, `dane=`), nośnik skasowany przypisaniem;
  * zapadka w obie strony, uzasadnienie każdego wpisu listy, PUSTY SKAN = kod 1;
  * druga reguła — przekład odmowy na `HTTPException` w `api/**`: {korzeń, podklasa,
    krotka typów} × {`str(exc)`, f-napis z `exc`, słownik, lista, `OdmowaHttpError`}
    × {moduł w `api/`, moduł poza `api/`};
  * drzewo repozytorium zgodne z listą (kod wyjścia `main()` odbierany wprost).
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from odmowa_bez_identyfikatora_guard import (  # noqa: E402
    DOZWOLONE,
    PustySkanError,
    main,
    policz,
    porownaj_z_lista,
    przeklady_na_http,
    trafienia_w_modulach,
    zmierz,
)

KORZEN = "class OdmowaDanychError(ValueError):\n    pass\n"
NAZWANA = (
    "class OdmowaNazwana(OdmowaDanychError):\n"
    "    def __init__(self, komunikat, *, kod, dane=None):\n"
    "        super().__init__(komunikat)\n"
)
REKORD = "class RekordOdmowy:\n    pass\n"


def _trafienia(kod: str) -> list[tuple[str, str]]:
    moduly = {"odmowa.py": KORZEN + NAZWANA + REKORD, "m.py": kod}
    return [(t.klasa, t.odwolanie) for t in trafienia_w_modulach(moduly) if t.modul == "m.py"]


# ---------------------------------------------------------------------------
# Rodzina × położenie tekstu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("kod", "oczekiwane"),
    [
        (
            'def f(bus_ref):\n    raise OdmowaDanychError(f"Szyna {bus_ref} bez napięcia")\n',
            [("OdmowaDanychError", "bus_ref")],
        ),
        (
            "class Moja(OdmowaDanychError):\n    pass\n"
            'def f(b):\n    raise Moja(f"Szyna {b.ref_id}")\n',
            [("Moja", ".ref_id")],
        ),
        (
            "class A(OdmowaDanychError):\n    pass\n"
            "class B(A):\n    pass\n"
            "def f(d):\n    raise B(f\"Szyna {d['ref_id']}\")\n",
            [("B", '["ref_id"]')],
        ),
        (
            'def f(d):\n    raise OdmowaNazwana(f"x {d.get(\'run_id\')}", kod="k")\n',
            [("OdmowaNazwana", '.get("run_id")')],
        ),
        (
            'def f(r):\n    raise OdmowaNazwana(komunikat=f"x {r.id}", kod="k")\n',
            [("OdmowaNazwana", ".id")],
        ),
        (
            'def f(ref):\n    return RekordOdmowy("k", f"Element {ref}", ())\n',
            [("RekordOdmowy", "ref")],
        ),
        (
            'def f(ref):\n    return RekordOdmowy("k", tresc=f"Element {ref}", odwolania=())\n',
            [("RekordOdmowy", "ref")],
        ),
        (
            "class C(OdmowaDanychError):\n"
            "    def __init__(self, element_ref, powod):\n"
            '        super().__init__(f"{element_ref}: {powod}")\n',
            [("C", "element_ref")],
        ),
        (
            "class C(OdmowaDanychError):\n"
            "    def __init__(self, scenario_id, powod):\n"
            "        super().__init__(powod)\n"
            'def f(s, ref_id):\n    raise C(s, f"brak {ref_id}")\n',
            [("C", "ref_id")],
        ),
        (
            'def f(bus_id):\n    tekst = f"Szyna {bus_id}"\n    raise OdmowaDanychError(tekst)\n',
            [("OdmowaDanychError", "tekst")],
        ),
        (
            'def f(bus_id):\n    raise OdmowaDanychError("Szyna %s" % bus_id)\n',
            [("OdmowaDanychError", "bus_id")],
        ),
        (
            'def f(bus_id):\n    raise OdmowaDanychError("Szyna {}".format(bus_id))\n',
            [("OdmowaDanychError", "bus_id")],
        ),
    ],
    ids=[
        "korzen_fnapis",
        "podklasa_atrybut",
        "podklasa_przechodnia_klucz",
        "nazwana_get",
        "nazwana_argument_nazwany",
        "rekord_pozycyjnie",
        "rekord_nazwa_pola",
        "wlasny_init_super",
        "wlasny_init_parametr_tekstu",
        "nosnik_z_przypisania",
        "procent",
        "format",
    ],
)
def test_trafienie_w_rodzinie(kod: str, oczekiwane: list[tuple[str, str]]) -> None:
    assert _trafienia(kod) == oczekiwane


@pytest.mark.parametrize(
    "kod",
    [
        'def f(bus_ref):\n    raise RuntimeError(f"Szyna {bus_ref}")\n',
        'def f(bus_ref):\n    raise ValueError(f"Szyna {bus_ref}")\n',
        'def f(m, bus_ref):\n    raise OdmowaDanychError(f"{opis(m, bus_ref)} bez napięcia")\n',
        'def f(bus_ref):\n    raise OdmowaNazwana("Szyna bez napięcia", kod="k", dane={"r": bus_ref})\n',
        "class C(OdmowaDanychError):\n"
        "    def __init__(self, scenario_id, ref_id, powod):\n"
        "        super().__init__(powod)\n"
        'def f(s, r):\n    raise C(s, r.ref_id, "brak elementu")\n',
        'def f(bus_ref):\n    t = f"{bus_ref}"\n    t = "Szyna"\n    raise OdmowaDanychError(t)\n',
        'def f(ref):\n    return RekordOdmowy("k", "Element bez nazwy", (Odw("e", ref),))\n',
    ],
    ids=[
        "klasa_spoza_rodziny",
        "valueerror_bledu_programu",
        "odczyt_nazwy_przez_funkcje",
        "identyfikator_w_dane",
        "identyfikator_w_parametrze_nie_tekstu",
        "nosnik_skasowany",
        "identyfikator_w_odwolaniu_rekordu",
    ],
)
def test_brak_falszywego_trafienia(kod: str) -> None:
    assert _trafienia(kod) == []


def test_rodzina_wyprowadzana_z_drzewa_nie_z_nazwy_w_module() -> None:
    """Podklasa zdefiniowana w INNYM module niż wywołanie też należy do rodziny."""
    moduly = {
        "odmowa.py": KORZEN,
        "wyjatki.py": "class Daleka(OdmowaDanychError):\n    pass\n",
        "m.py": 'def f(ref):\n    raise Daleka(f"x {ref}")\n',
    }
    assert [(t.modul, t.klasa) for t in trafienia_w_modulach(moduly)] == [("m.py", "Daleka")]


# ---------------------------------------------------------------------------
# Druga reguła: przekład odmowy na HTTPException gubi pola strukturalne
# ---------------------------------------------------------------------------

_PODKLASA = "class Pakiet(OdmowaDanychError):\n    pass\n"


def _przeklady(modul: str, cialo: str, typ: str = "OdmowaDanychError") -> list[str]:
    kod = f"def f():\n    try:\n        g()\n    except {typ} as exc:\n{cialo}"
    return przeklady_na_http({"odmowa.py": KORZEN + _PODKLASA, modul: kod})


@pytest.mark.parametrize("typ", ["OdmowaDanychError", "Pakiet", "(KeyError, Pakiet)"])
@pytest.mark.parametrize(
    "cialo",
    [
        "        raise HTTPException(status_code=422, detail=str(exc)) from exc\n",
        '        raise HTTPException(status_code=409, detail=f"Konflikt: {exc}") from exc\n',
    ],
    ids=["str_exc", "fnapis_exc"],
)
def test_przeklad_zdania_odmowy_w_api_jest_naruszeniem(typ: str, cialo: str) -> None:
    assert _przeklady("api/r.py", cialo, typ) == ["api/r.py:4"]


@pytest.mark.parametrize(
    "cialo",
    [
        "        raise HTTPException(status_code=422, detail={'powod': exc.powod}) from exc\n",
        "        raise HTTPException(status_code=422, detail=[{'pole': exc.ref}]) from exc\n",
        "        raise OdmowaHttpError(exc, status_code=409) from exc\n",
        "        raise HTTPException(status_code=400, detail='Stałe zdanie') from exc\n",
    ],
    ids=["slownik", "lista", "odmowa_http", "stale_zdanie"],
)
def test_struktura_albo_odmowa_http_nie_jest_naruszeniem(cialo: str) -> None:
    assert _przeklady("api/r.py", cialo) == []


def test_przeklad_poza_api_nie_jest_przedmiotem_reguly() -> None:
    cialo = "        raise HTTPException(status_code=422, detail=str(exc)) from exc\n"
    assert _przeklady("application/s.py", cialo) == []


def test_wyjatek_spoza_rodziny_nie_jest_przedmiotem_reguly() -> None:
    cialo = "        raise HTTPException(status_code=422, detail=str(exc)) from exc\n"
    assert _przeklady("api/r.py", cialo, "ValueError") == []


# ---------------------------------------------------------------------------
# Zapadka, lista, pusty skan, drzewo repozytorium
# ---------------------------------------------------------------------------


def test_zapadka_w_obie_strony() -> None:
    lista = {"a": (2, "uzasadnienie"), "b": (1, "uzasadnienie")}
    assert porownaj_z_lista(Counter({"a": 2, "b": 1}), lista) == []
    assert any("dlug-urosl" in b for b in porownaj_z_lista(Counter({"a": 3, "b": 1}), lista))
    assert any("dlug-zmalal" in b for b in porownaj_z_lista(Counter({"a": 1, "b": 1}), lista))
    assert any("usun wpis" in b for b in porownaj_z_lista(Counter({"a": 2}), lista))
    assert any(
        "identyfikator-w-odmowie" in b
        for b in porownaj_z_lista(Counter({"a": 2, "b": 1, "c": 1}), lista)
    )


@pytest.mark.parametrize("tozsamosc", sorted(DOZWOLONE))
def test_kazdy_wpis_listy_ma_uzasadnienie(tozsamosc: str) -> None:
    ile, uzasadnienie = DOZWOLONE[tozsamosc]
    assert ile >= 1
    assert len(uzasadnienie.strip()) >= 80, tozsamosc


def test_pusty_skan_jest_bledem(tmp_path: Path) -> None:
    with pytest.raises(PustySkanError):
        zmierz(tmp_path)
    assert main([], korzen=tmp_path) == 1


def test_skan_bez_klasy_korzenia_jest_bledem(tmp_path: Path) -> None:
    (tmp_path / "m.py").write_text("x = 1\n", encoding="utf-8")
    assert main([], korzen=tmp_path) == 1


def test_drzewo_repozytorium_zgodne_z_lista() -> None:
    assert main([]) == 0
    assert sum(policz(zmierz()).values()) == sum(ile for ile, _ in DOZWOLONE.values())
