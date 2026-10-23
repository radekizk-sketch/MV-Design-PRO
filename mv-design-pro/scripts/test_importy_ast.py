"""Testy rozwiązywania importów (`scripts/importy_ast.py`) — jedno źródło prawdy bramek.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA): {moduł zwykły, `__init__.py`, moduł podpakietu,
`__init__.py` podpakietu} × {poziom 1, 2, 3, ponad korzeń} × {`module` nazwany, `module=None`
z aliasami}. Wartości oczekiwane są WYPISANE z definicji semantyki interpretera (pakietem
`a/b/c/m.py` i `a/b/c/__init__.py` jest `a.b.c`; poziom 1 = ten pakiet, każdy kolejny =
pakiet nadrzędny; wyjście ponad pakiet najwyższego poziomu = `ImportError`), a nie
przepisane z wyjścia funkcji. Drugą wyrocznią jest sam interpreter: dla każdej komórki
iloczynu test buduje prawdziwe drzewo pakietów w katalogu tymczasowym, importuje moduł
z instrukcją w procesie potomnym i sprawdza, że załadowany został DOKŁADNIE moduł
docelowy wskazany przez funkcję (albo że interpreter odmówił importu ponad korzeń).
"""

from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from importy_ast import (  # noqa: E402
    ImportPonadKorzen,
    cele_importu,
    modul_bazowy,
    moduly_dotkniete,
    nazwa_modulu,
    pakiet_pliku,
    pod_prefiksem,
)

KORZEN = Path("/src")

#: Położenie pliku z instrukcją → (ścieżka względem korzenia, pakiet z definicji, nazwa modułu).
PLIKI: dict[str, tuple[str, str, str]] = {
    "modul": ("a/b/c/m.py", "a.b.c", "a.b.c.m"),
    "init": ("a/b/c/__init__.py", "a.b.c", "a.b.c"),
    "modul_podpakietu": ("a/b/c/d/m.py", "a.b.c.d", "a.b.c.d.m"),
    "init_podpakietu": ("a/b/c/d/__init__.py", "a.b.c.d", "a.b.c.d"),
}

#: Poziom importu dla komórki „ponad korzeń” — o jeden więcej niż głębokość pakietu.
POZIOMY: dict[str, dict[str, int]] = {
    "modul": {"1": 1, "2": 2, "3": 3, "ponad": 4},
    "init": {"1": 1, "2": 2, "3": 3, "ponad": 4},
    "modul_podpakietu": {"1": 1, "2": 2, "3": 3, "ponad": 5},
    "init_podpakietu": {"1": 1, "2": 2, "3": 3, "ponad": 5},
}

#: Moduł bazowy (pakiet, z którego sprowadzamy) z definicji: poziom k = pakiet obcięty
#: o k-1 członów. `None` = interpreter odmawia (ponad korzeń).
BAZA: dict[tuple[str, str], str | None] = {
    ("modul", "1"): "a.b.c",
    ("modul", "2"): "a.b",
    ("modul", "3"): "a",
    ("modul", "ponad"): None,
    ("init", "1"): "a.b.c",
    ("init", "2"): "a.b",
    ("init", "3"): "a",
    ("init", "ponad"): None,
    ("modul_podpakietu", "1"): "a.b.c.d",
    ("modul_podpakietu", "2"): "a.b.c",
    ("modul_podpakietu", "3"): "a.b",
    ("modul_podpakietu", "ponad"): None,
    ("init_podpakietu", "1"): "a.b.c.d",
    ("init_podpakietu", "2"): "a.b.c",
    ("init_podpakietu", "3"): "a.b",
    ("init_podpakietu", "ponad"): None,
}

#: Forma instrukcji → (tekst po kropkach, oczekiwane cele względem bazy, oczekiwane moduły
#: dotknięte względem bazy). `{b}` = moduł bazowy.
FORMY: dict[str, tuple[str, tuple[str, ...], tuple[str, ...]]] = {
    "nazwany": ("q import u, v", ("{b}.q",), ("{b}.q", "{b}.q.u", "{b}.q.v")),
    "bez_modulu": (" import u, v", ("{b}.u", "{b}.v"), ("{b}", "{b}.u", "{b}.v")),
}

KOMORKI = [
    (plik, poziom, forma)
    for plik in PLIKI
    for poziom in ("1", "2", "3", "ponad")
    for forma in FORMY
]


def _instrukcja(plik: str, poziom: str, forma: str) -> str:
    return "from " + "." * POZIOMY[plik][poziom] + FORMY[forma][0]


def _wezel(tekst: str) -> ast.ImportFrom:
    wezel = ast.parse(tekst).body[0]
    assert isinstance(wezel, ast.ImportFrom)
    return wezel


@pytest.mark.parametrize("plik", PLIKI)
def test_pakiet_i_nazwa_modulu_z_definicji(plik: str) -> None:
    sciezka, pakiet, nazwa = PLIKI[plik]
    assert pakiet_pliku(KORZEN / sciezka, KORZEN) == pakiet
    assert nazwa_modulu(KORZEN / sciezka, KORZEN) == nazwa


def test_modul_najwyzszego_poziomu_ma_pakiet_pusty() -> None:
    assert pakiet_pliku(KORZEN / "x.py", KORZEN) == ""
    with pytest.raises(ImportPonadKorzen):
        modul_bazowy("", _wezel("from . import y"))


def test_plik_spoza_korzenia_to_blad() -> None:
    with pytest.raises(ValueError):
        pakiet_pliku(Path("/inne/x.py"), KORZEN)


@pytest.mark.parametrize(("plik", "poziom", "forma"), KOMORKI)
def test_iloczyn_plik_x_poziom_x_forma(plik: str, poziom: str, forma: str) -> None:
    _, pakiet, _ = PLIKI[plik]
    wezel = _wezel(_instrukcja(plik, poziom, forma))
    baza = BAZA[(plik, poziom)]
    if baza is None:
        for funkcja in (modul_bazowy, cele_importu, moduly_dotkniete):
            with pytest.raises(ImportPonadKorzen):
                funkcja(pakiet, wezel)
        return
    _, cele, dotkniete = FORMY[forma]
    oczekiwana_baza = baza + (".q" if forma == "nazwany" else "")
    assert modul_bazowy(pakiet, wezel) == oczekiwana_baza
    assert cele_importu(pakiet, wezel) == tuple(c.format(b=baza) for c in cele)
    assert moduly_dotkniete(pakiet, wezel) == tuple(d.format(b=baza) for d in dotkniete)


def test_import_bezwzgledny_nie_zalezy_od_pakietu() -> None:
    wezel = _wezel("from network_model.solvers import power_flow_newton as pf")
    for pakiet in ("", "a", "a.b.c"):
        assert modul_bazowy(pakiet, wezel) == "network_model.solvers"
        assert cele_importu(pakiet, wezel) == ("network_model.solvers",)
        assert moduly_dotkniete(pakiet, wezel) == (
            "network_model.solvers",
            "network_model.solvers.power_flow_newton",
        )
    zwykly = ast.parse("import enm.store as s, api.unified_runs").body[0]
    assert isinstance(zwykly, ast.Import)
    assert moduly_dotkniete("a", zwykly) == ("enm.store", "api.unified_runs")


def test_gwiazdka_bez_modulu_celuje_w_pakiet() -> None:
    wezel = _wezel("from . import *")
    assert cele_importu("a.b", wezel) == ("a.b",)
    assert moduly_dotkniete("a.b", wezel) == ("a.b",)


def test_pod_prefiksem_liczy_granice_po_kropce() -> None:
    assert pod_prefiksem("network_model.solvers", ("network_model.solvers",))
    assert pod_prefiksem("network_model.solvers.x", ("network_model.solvers",))
    assert not pod_prefiksem("network_model.solvers_x", ("network_model.solvers",))
    assert not pod_prefiksem("network_model", ("network_model.solvers",))


# ---------------------------------------------------------------------------
# Wyrocznia interpretera: prawdziwe pakiety w katalogu tymczasowym.
# ---------------------------------------------------------------------------

_SONDA = """
import importlib, json, sys
przed = set(sys.modules)
try:
    importlib.import_module(sys.argv[1])
except ImportError as blad:
    print(json.dumps({"blad": type(blad).__name__}))
else:
    print(json.dumps({"nowe": sorted(m for m in set(sys.modules) - przed if m.startswith("a"))}))
"""


def _drzewo_pakietow(korzen: Path, plik: str, instrukcja: str) -> str:
    """Pakiety a, a.b, a.b.c, a.b.c.d; na każdym poziomie moduły `u`, `v` i pakiet `q`
    z podmodułami `u`, `v`. Instrukcja trafia do pliku komórki; zwraca nazwę modułu do
    zaimportowania."""
    for czesci in (("a",), ("a", "b"), ("a", "b", "c"), ("a", "b", "c", "d")):
        katalog = korzen.joinpath(*czesci)
        (katalog / "q").mkdir(parents=True, exist_ok=True)
        (katalog / "__init__.py").write_text("", encoding="utf-8")
        for nazwa in ("u", "v"):
            (katalog / f"{nazwa}.py").write_text("", encoding="utf-8")
            (katalog / "q" / f"{nazwa}.py").write_text("", encoding="utf-8")
        (katalog / "q" / "__init__.py").write_text("", encoding="utf-8")
    sciezka, _, nazwa = PLIKI[plik]
    (korzen / sciezka).write_text(instrukcja + "\n", encoding="utf-8")
    return nazwa


@pytest.mark.parametrize(("plik", "poziom", "forma"), KOMORKI)
def test_wyrocznia_interpretera(tmp_path: Path, plik: str, poziom: str, forma: str) -> None:
    instrukcja = _instrukcja(plik, poziom, forma)
    modul = _drzewo_pakietow(tmp_path, plik, instrukcja)
    wynik = subprocess.run(  # noqa: S603 — stały, lokalny argv
        [sys.executable, "-B", "-c", _SONDA, modul],
        capture_output=True,
        text=True,
        check=True,
        cwd=tmp_path,
    )
    odpowiedz = json.loads(wynik.stdout)
    pakiet = PLIKI[plik][1]
    wezel = _wezel(instrukcja)
    if BAZA[(plik, poziom)] is None:
        assert odpowiedz == {"blad": "ImportError"}
        return
    zaladowane = set(odpowiedz["nowe"])
    for cel in cele_importu(pakiet, wezel):
        assert cel in zaladowane, (cel, sorted(zaladowane))
