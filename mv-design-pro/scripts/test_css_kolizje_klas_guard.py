"""Testy strażnika `css_kolizje_klas_guard` (karta K1 POWLOKA).

INTENCJA. Defekt, który strażnik zamyka, powstaje z ZESTAWIENIA dwóch poprawnych arkuszy
(`.mvd-menu` powłoki i menedżera przypadków), więc testy sprawdzają obietnice docstringu
jako ILOCZYN CECH, nie przykład z karty:

  * kształt selektora (klasa sama, z pseudoklasą, z atrybutem, z drugą klasą,
    z pseudoelementem, z kombinatorem wewnątrz `:not(...)`) × rola (definicja bazowa /
    selektor kontekstowy: potomek, dziecko, sąsiad, `:root`, element z klasą);
  * położenie reguły (najwyższy poziom, `@media`, `@supports`, klatki `@keyframes`,
    komentarz z nawiasami klamrowymi, lista selektorów po przecinku);
  * liczba arkuszy (dwie definicje w jednym arkuszu ≠ kolizja; w dwóch = kolizja);
  * zapadka w obie strony (nowa kolizja, nowy arkusz, wpis nieaktualny, wpis bez
    uzasadnienia, wpis zgodny);
  * tokeny (definicja w arkuszu, definicja w kodzie, brak definicji, brak z wartością
    zapasową, odwołanie w komentarzu arkusza);
  * PUSTY SKAN = kod 1; drzewo repozytorium zielone (kod `main()` odbierany wprost).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from css_kolizje_klas_guard import (  # noqa: E402
    DOZWOLONE_KOLIZJE,
    DefinicjaBazowa,
    PustySkanError,
    definicje_bazowe,
    klasa_bazowa,
    kolizje,
    main,
    porownaj_z_lista,
    selektory_regul,
    tokeny_bez_definicji,
)

# ---------------------------------------------------------------------------
# Kształt selektora × rola
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("selektor", "oczekiwana"),
    [
        (".mvd-menu", "mvd-menu"),
        (".mvd-menu:hover", "mvd-menu"),
        (".mvd-menu[aria-expanded='true']", "mvd-menu"),
        (".mvd-menu.mvd-on", "mvd-menu"),
        (".mvd-menu::before", "mvd-menu"),
        (".mvd-btn:hover:not(:disabled)", "mvd-btn"),
        (".mvd-btn:not(.a .b)", "mvd-btn"),
        (".mvd-btn[data-x='a b']", "mvd-btn"),
        (".mvd-menu .mvd-menu-item", None),
        (".rodzic > .mvd-menu", None),
        (".a + .mvd-menu", None),
        (".a ~ .mvd-menu", None),
        (":root[data-theme='x'] .mvd-menu", None),
        ("div.mvd-menu", None),
        ("button", None),
    ],
)
def test_klasa_bazowa_ksztalt_razy_rola(selektor: str, oczekiwana: str | None) -> None:
    assert klasa_bazowa(selektor) == oczekiwana


# ---------------------------------------------------------------------------
# Położenie reguły
# ---------------------------------------------------------------------------


def test_selektory_regul_polozenie() -> None:
    arkusz = """/* komentarz z { nawiasami } i .mvd-falszywa { } */
.a { color: red; }
.b,
.c:hover { color: blue; }
@media (max-width: 10px) {
  .d { color: red; }
}
@supports (display: grid) {
  .e { display: grid; }
}
@keyframes puls {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.f { color: red; }
"""
    selektory = selektory_regul(arkusz)
    assert [s for s, _ in selektory] == [".a", ".b", ".c:hover", ".d", ".e", ".f"]
    # Numery linii po komentarzu wielowierszowym pozostają prawdziwe.
    assert dict(selektory)[".a"] == 2
    assert dict(selektory)[".b"] == 3
    assert dict(selektory)[".d"] == 6
    assert dict(selektory)[".f"] == 15


# ---------------------------------------------------------------------------
# Liczba arkuszy
# ---------------------------------------------------------------------------


def _drzewo(tmp_path: Path, pliki: dict[str, str]) -> Path:
    for nazwa, tresc in pliki.items():
        sciezka = tmp_path / nazwa
        sciezka.parent.mkdir(parents=True, exist_ok=True)
        sciezka.write_text(tresc, encoding="utf-8")
    return tmp_path


def test_dwie_definicje_w_jednym_arkuszu_to_nie_kolizja(tmp_path: Path) -> None:
    src = _drzewo(tmp_path, {"a.css": ".x { color: red; }\n.x:hover { color: blue; }\n"})
    assert kolizje(definicje_bazowe(src)) == {}


def test_definicje_w_dwoch_arkuszach_to_kolizja(tmp_path: Path) -> None:
    src = _drzewo(
        tmp_path,
        {
            "powloka/shell.css": ".mvd-menu { position: relative; }\n",
            "przypadki/przypadki.css": ".mvd-menu { position: fixed; }\n",
        },
    )
    znalezione = kolizje(definicje_bazowe(src))
    assert set(znalezione) == {"mvd-menu"}
    assert {d.plik for d in znalezione["mvd-menu"]} == {
        "powloka/shell.css",
        "przypadki/przypadki.css",
    }


def test_nadpisanie_kontekstowe_w_drugim_arkuszu_to_nie_kolizja(tmp_path: Path) -> None:
    src = _drzewo(
        tmp_path,
        {
            "a.css": ".mvd-btn { padding: 6px; }\n",
            "b.css": ".mvd-statusbar .mvd-btn { padding: 1px; }\n",
        },
    )
    assert kolizje(definicje_bazowe(src)) == {}


def test_katalog_testow_jest_pomijany(tmp_path: Path) -> None:
    src = _drzewo(
        tmp_path,
        {
            "a.css": ".x { color: red; }\n",
            "modul/__tests__/atrapa.css": ".x { color: blue; }\n",
        },
    )
    assert kolizje(definicje_bazowe(src)) == {}


# ---------------------------------------------------------------------------
# Zapadka w obie strony
# ---------------------------------------------------------------------------


def _def(klasa: str, *pliki: str) -> list[DefinicjaBazowa]:
    return [DefinicjaBazowa(klasa, plik, 1, f".{klasa}") for plik in pliki]


def test_zapadka_wpis_zgodny_jest_zielony() -> None:
    znalezione = {"x": _def("x", "a.css", "b.css")}
    dozwolone = {"x": (frozenset({"a.css", "b.css"}), "uzasadnienie")}
    assert porownaj_z_lista(znalezione, dozwolone) == []


def test_zapadka_nowa_kolizja_jest_czerwona() -> None:
    bledy = porownaj_z_lista({"x": _def("x", "a.css", "b.css")}, {})
    assert len(bledy) == 1 and "`.x`" in bledy[0]


def test_zapadka_nowy_arkusz_przy_starej_klasie_jest_czerwony() -> None:
    znalezione = {"x": _def("x", "a.css", "b.css", "c.css")}
    dozwolone = {"x": (frozenset({"a.css", "b.css"}), "uzasadnienie")}
    bledy = porownaj_z_lista(znalezione, dozwolone)
    assert len(bledy) == 1 and "c.css" in bledy[0]


def test_zapadka_wpis_nieaktualny_jest_czerwony() -> None:
    bledy = porownaj_z_lista({}, {"x": (frozenset({"a.css", "b.css"}), "uzasadnienie")})
    assert len(bledy) == 1 and "zapadka w dół" in bledy[0]


def test_zapadka_wpis_bez_uzasadnienia_jest_czerwony() -> None:
    znalezione = {"x": _def("x", "a.css", "b.css")}
    bledy = porownaj_z_lista(znalezione, {"x": (frozenset({"a.css", "b.css"}), "  ")})
    assert len(bledy) == 1 and "bez uzasadnienia" in bledy[0]


def test_lista_repozytorium_ma_uzasadnienia_i_rozne_arkusze() -> None:
    for klasa, (arkusze, uzasadnienie) in DOZWOLONE_KOLIZJE.items():
        assert uzasadnienie.strip(), klasa
        assert len(arkusze) >= 2, klasa
    # Kolizja, która była przyczyną karty, NIE może wrócić na listę dozwolonych.
    assert "mvd-menu" not in DOZWOLONE_KOLIZJE
    assert "mvd-menu-item" not in DOZWOLONE_KOLIZJE


# ---------------------------------------------------------------------------
# Tokeny
# ---------------------------------------------------------------------------


def test_tokeny_definicja_w_arkuszu_i_w_kodzie(tmp_path: Path) -> None:
    src = _drzewo(
        tmp_path,
        {
            "theme/tokens.css": ":root { --mvd-ink: #000; }\n",
            "modul/m.css": ".a { --mvd-lokalny: 1px; color: var(--mvd-ink); width: var(--mvd-lokalny); }\n",
            "modul/M.tsx": "const s = { '--mvd-wstawiany': kolor };\nconst t = 'var(--mvd-wstawiany)';\n",
            "modul/n.css": ".b { color: var(--mvd-wstawiany); }\n",
        },
    )
    assert tokeny_bez_definicji(src) == []


@pytest.mark.parametrize(
    "uzycie",
    [
        ".a { color: var(--mvd-border); }",
        ".a { color: var(--mvd-border, #fff); }",
        ".a { color: var( --mvd-border ); }",
    ],
)
def test_token_bez_definicji_w_arkuszu_jest_czerwony(tmp_path: Path, uzycie: str) -> None:
    src = _drzewo(
        tmp_path,
        {"tokens.css": ":root { --mvd-ink: #000; }\n", "a.css": uzycie + "\n", "M.ts": "x;\n"},
    )
    assert tokeny_bez_definicji(src) == [("a.css", 1, "--mvd-border")]


def test_token_bez_definicji_w_kodzie_jest_czerwony(tmp_path: Path) -> None:
    src = _drzewo(
        tmp_path,
        {"tokens.css": ":root { --mvd-ink: #000; }\n", "M.tsx": "const s = 'var(--mvd-text)';\n"},
    )
    assert tokeny_bez_definicji(src) == [("M.tsx", 1, "--mvd-text")]


def test_token_w_komentarzu_arkusza_jest_pomijany(tmp_path: Path) -> None:
    src = _drzewo(
        tmp_path,
        {
            "tokens.css": "/* dawniej var(--mvd-border) */\n:root { --mvd-ink: #000; }\n",
            "M.ts": "x;\n",
        },
    )
    assert tokeny_bez_definicji(src) == []


# ---------------------------------------------------------------------------
# Pusty skan i drzewo repozytorium
# ---------------------------------------------------------------------------


def test_pusty_skan_to_blad(tmp_path: Path) -> None:
    with pytest.raises(PustySkanError):
        definicje_bazowe(tmp_path)
    assert main(tmp_path) == 1


def test_arkusze_bez_regul_to_pusty_skan(tmp_path: Path) -> None:
    src = _drzewo(tmp_path, {"a.css": "/* tylko komentarz */\n", "M.ts": "x;\n"})
    with pytest.raises(PustySkanError):
        definicje_bazowe(src)


def test_drzewo_repozytorium_jest_zielone() -> None:
    assert main() == 0
