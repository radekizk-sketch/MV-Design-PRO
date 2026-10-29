"""Testy własne `skany_katalogow.py` — korzeń i filtr skanu katalogu wyliczany statycznie.

Reguła KLASA pkt 2: iloczyn cech, w którym przeoczenie mogłoby się schować —
DROGA wyliczenia korzenia (stała modułu, `__file__`, `.parent`/`.parents[n]`, `/`, `joinpath`,
`os.path`, import stałej, moduł po ścieżce, funkcja o jednym `return`, parametr z wywołaniami,
pętla po literale, `or`, f-napis) × RODZAJ skanu (`rglob`, `glob`, `iterdir`, `os.walk`,
`os.listdir`, `os.scandir`, `glob.glob`). Osobno: każdy powód, dla którego korzeń MUSI zostać
nieustalony (parametr bez wywołań, funkcja przekazana jako wartość, metoda, nazwa wiązana dwa
razy, wywołanie z `*args`), i katalog tymczasowy poza repozytorium.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from skany_katalogow import FUNKCJE_SKANU, METODY_SKANU, ZNAMIONA_SKANU, Skan, Wyliczacz


def _wyliczacz(korzen: Path, pliki: dict[str, str]) -> Wyliczacz:
    """Repozytorium syntetyczne: moduły pod `pkg/` importowane po nazwie względem `korzen`."""
    moduly: dict[str, Path] = {}
    zrodla: dict[Path, str] = {}
    for rel, tekst in pliki.items():
        sciezka = korzen / rel
        sciezka.parent.mkdir(parents=True, exist_ok=True)
        sciezka.write_text(tekst, encoding="utf-8")
        zrodla[sciezka] = tekst
        czesci = list(Path(rel).with_suffix("").parts)
        if czesci[-1] == "__init__":
            czesci.pop()
        moduly[".".join(czesci)] = sciezka
    return Wyliczacz(
        korzen, moduly, zrodla, lambda p: ".".join(p.relative_to(korzen).with_suffix("").parts[:-1])
    )


#: Rodzaj skanu → szablon wywołania na wyrażeniu korzenia `{k}` (filtr `*.json`, gdy rodzaj
#: przyjmuje wzorzec nazwy).
RODZAJE: dict[str, tuple[str, str | None]] = {
    "rglob": ("{k}.rglob('*.json')", "*.json"),
    "glob": ("{k}.glob('*.json')", "*.json"),
    "iterdir": ("{k}.iterdir()", None),
    "os.walk": ("os.walk({k})", None),
    "os.listdir": ("os.listdir({k})", None),
    "os.scandir": ("os.scandir({k})", None),
    "glob.glob": ("glob.glob(str({k} / '*.json'))", None),
}

#: Droga wyliczenia → (pliki dodatkowe, prolog modułu skanującego, wyrażenie korzenia).
#: Każda droga prowadzi do katalogu `dane/` repozytorium.
DROGI: dict[str, tuple[dict[str, str], str, str]] = {
    "stała modułu": ({}, "K = Path(__file__).resolve().parents[1] / 'dane'\n", "K"),
    "parent łańcuchem": ({}, "K = Path(__file__).parent.parent / 'dane'\n", "K"),
    "joinpath": ({}, "K = Path(__file__).parents[1].joinpath('dane')\n", "K"),
    "os.path": (
        {},
        "K = Path(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dane'))\n",
        "K",
    ),
    "import stałej": (
        {"pkg/stale.py": "from pathlib import Path\nK = Path(__file__).parents[1] / 'dane'\n"},
        "from pkg.stale import K\n",
        "K",
    ),
    "atrybut modułu": (
        {"pkg/stale.py": "from pathlib import Path\nK = Path(__file__).parents[1] / 'dane'\n"},
        "from pkg import stale\n",
        "stale.K",
    ),
    "moduł po ścieżce": (
        {"pkg/stale.py": "from pathlib import Path\nK = Path(__file__).parents[1] / 'dane'\n"},
        "import importlib.util\n"
        "S = importlib.util.spec_from_file_location('s', Path(__file__).parent / 'stale.py')\n"
        "M = importlib.util.module_from_spec(S)\n",
        "M.K",
    ),
    "funkcja o jednym return": (
        {},
        "def katalog():\n    return Path(__file__).parents[1] / 'dane'\n",
        "katalog()",
    ),
    "parametr z domyślną i wywołaniem": (
        {},
        "D = Path(__file__).parents[1]\n"
        "def skanuj(k=D / 'dane'):\n    return k\n"
        "def wolaj():\n    return skanuj(D / 'dane')\n",
        "skanuj()",
    ),
    "pętla po literale": (
        {},
        "D = Path(__file__).parents[1]\nfor K in (D / 'dane',):\n    pass\n",
        "K",
    ),
    "or": ({}, "K = None or Path(__file__).parents[1] / 'dane'\n", "K"),
    "f-napis": ({}, "D = Path(__file__).parents[1]\nK = Path(f'{D}/dane')\n", "K"),
}


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE))
@pytest.mark.parametrize("droga", sorted(DROGI))
def test_droga_wyliczenia_x_rodzaj_skanu(tmp_path: Path, droga: str, rodzaj: str) -> None:
    dodatkowe, prolog, korzen = DROGI[droga]
    szablon, filtr = RODZAJE[rodzaj]
    zrodlo = (
        "import glob\nimport os\nfrom pathlib import Path\n"
        + prolog
        + f"def test_x():\n    return {szablon.format(k=korzen)}\n"
    )
    w = _wyliczacz(tmp_path, {"pkg/__init__.py": "", **dodatkowe, "pkg/test_skan.py": zrodlo})
    skany = w.skany(tmp_path / "pkg/test_skan.py")
    assert skany, "skan nie został rozpoznany"
    assert {(s.korzen, s.wzorzec, s.poza) for s in skany} == {("dane", filtr, False)}, skany
    (skan,) = skany
    assert skan.obejmuje("dane/a.json")
    assert skan.obejmuje("dane/pod/a.json")
    assert not skan.obejmuje("inne/a.json")
    assert not skan.obejmuje("dane_obok/a.json")
    assert skan.obejmuje("dane/a.ts") is (filtr is None)


def test_czlon_nieznany_daje_korzen_pod_znana_lewa(tmp_path: Path) -> None:
    zrodlo = (
        "from pathlib import Path\nD = Path(__file__).parents[1] / 'dane'\n"
        "def test_x(nazwa):\n    return (D / nazwa / 'pod').glob('*.py')\n"
    )
    w = _wyliczacz(tmp_path, {"pkg/test_skan.py": zrodlo})
    (skan,) = w.skany(tmp_path / "pkg/test_skan.py")
    # `dane/<nieznane>/pod` leży gdzieś pod `dane` — nie pod `dane/pod`.
    assert (skan.korzen, skan.wzorzec) == ("dane", "*.py")
    assert skan.obejmuje("dane/x/pod/a.py")


def test_parametr_sumuje_warianty_wszystkich_wywolan(tmp_path: Path) -> None:
    w = _wyliczacz(
        tmp_path,
        {
            "pkg/__init__.py": "",
            "pkg/skaner.py": (
                "from pathlib import Path\n"
                "def skanuj(k):\n    return sorted(k.rglob('*.py'))\n"
                "def glowna():\n    return skanuj(Path(__file__).parents[1] / 'a')\n"
            ),
            "pkg/test_inny.py": (
                "from pathlib import Path\nfrom pkg.skaner import skanuj as s\n"
                "def test_x():\n    s(Path(__file__).parents[1] / 'b')\n"
            ),
            "pkg/test_trzeci.py": (
                "from pathlib import Path\nfrom pkg import skaner\n"
                "def test_y(tmp_path):\n    skaner.skanuj(tmp_path)\n"
            ),
        },
    )
    skany = w.skany(tmp_path / "pkg/skaner.py")
    assert {(s.korzen, s.poza) for s in skany} == {("a", False), ("b", False), (None, True)}


#: Powód nieustalenia → źródło modułu skanującego. Każdy MUSI dać korzeń nieustalony —
#: inaczej wybór testów przestałby być nadzbiorem.
NIEUSTALONE: dict[str, str] = {
    "parametr bez domyślnej i bez wywołań": "def test_x(katalog):\n    katalog.glob('*')\n",
    "funkcja przekazana jako wartość": (
        "from pathlib import Path\n"
        "def skanuj(k):\n    return k.glob('*')\n"
        "WYWOLAJ = skanuj\n"
        "def test_x():\n    skanuj(Path(__file__).parent)\n"
    ),
    "metoda": (
        "from pathlib import Path\n"
        "class A:\n    def skanuj(self, k=Path(__file__).parent):\n        return k.glob('*')\n"
        "def test_x():\n    A().skanuj(Path(__file__).parents[1] / 'inny')\n"
    ),
    "nazwa wiązana dwa razy": (
        "from pathlib import Path\nK = Path(__file__).parent\nK = K / 'inny'\n"
        "def test_x():\n    K.glob('*')\n"
    ),
    "wywołanie z gwiazdką": (
        "from pathlib import Path\n"
        "def skanuj(k):\n    return k.glob('*')\n"
        "def test_x():\n    skanuj(*[Path(__file__).parent])\n"
    ),
    "wynik nieznanej funkcji": "import os\nfrom pathlib import Path\n"
    "def test_x():\n    Path(os.environ['X']).glob('*')\n",
    "względna ścieżka napisowa": "from pathlib import Path\n"
    "def test_x():\n    Path('dane').glob('*')\n",
    "pętla po nieliterale": "from pathlib import Path\n"
    "def test_x(lista):\n    for k in lista:\n        k.glob('*')\n",
}


@pytest.mark.parametrize("powod", sorted(NIEUSTALONE))
def test_kazdy_powod_nieustalenia_daje_korzen_nieustalony(tmp_path: Path, powod: str) -> None:
    w = _wyliczacz(tmp_path, {"pkg/test_skan.py": NIEUSTALONE[powod]})
    skany = w.skany(tmp_path / "pkg/test_skan.py")
    assert skany and any(s.korzen is None and not s.poza for s in skany), skany
    assert all(s.obejmuje("cokolwiek/x.md") for s in skany if not s.poza)


@pytest.mark.parametrize(
    "zrodlo",
    [
        "def test_x(tmp_path):\n    (tmp_path / 'a').glob('*')\n",
        "import tempfile\nfrom pathlib import Path\n"
        "def test_x():\n    with tempfile.TemporaryDirectory() as k:\n        Path(k).glob('*')\n",
        "import tempfile\nfrom pathlib import Path\n"
        "def test_x():\n    Path(tempfile.mkdtemp()).iterdir()\n",
        "from pathlib import Path\ndef test_x():\n    Path('/usr/lib').glob('*')\n",
    ],
    ids=["tmp_path", "TemporaryDirectory", "mkdtemp", "absolutna spoza repozytorium"],
)
def test_katalog_spoza_repozytorium(tmp_path: Path, zrodlo: str) -> None:
    w = _wyliczacz(tmp_path, {"pkg/test_skan.py": zrodlo})
    (skan,) = w.skany(tmp_path / "pkg/test_skan.py")
    assert skan.poza
    assert not skan.obejmuje("pkg/test_skan.py")


def test_znamiona_obejmuja_kazdy_rodzaj_skanu() -> None:
    """Szybki filtr tekstu nie może przepuścić żadnego rodzaju skanu (para predykatów:
    filtr tekstu × rozpoznanie w drzewie składni)."""
    for metoda in METODY_SKANU:
        assert ZNAMIONA_SKANU.search(f"x.{metoda}('*')"), metoda
    for modul, funkcja in FUNKCJE_SKANU:
        assert ZNAMIONA_SKANU.search(f"{modul}.{funkcja}(k)"), funkcja
    # Każdy rodzaj z testu iloczynu jest rozpoznany przez filtr tekstu.
    for szablon, _ in RODZAJE.values():
        assert ZNAMIONA_SKANU.search(szablon.format(k="K")), szablon


def test_skan_bez_wariantu_poza_repozytorium_nie_jest_pusty() -> None:
    assert Skan(1, korzen="").obejmuje("cokolwiek/x")
    assert not Skan(1, korzen=None, poza=True).obejmuje("x")
    assert Skan(1, korzen=None).obejmuje("x")


def test_analiza_prawdziwego_pliku_nie_rzuca() -> None:
    """Moduł analizuje sam siebie (realne konstrukcje: dataklasy, wyrażenia przypisania)."""
    sciezka = Path(__file__).resolve().with_name("skany_katalogow.py")
    w = Wyliczacz(
        sciezka.parents[2],
        {"skany_katalogow": sciezka},
        {sciezka: sciezka.read_text(encoding="utf-8")},
        lambda _p: "",
    )
    assert isinstance(w.skany(sciezka), list)
    ast.parse(sciezka.read_text(encoding="utf-8"))
