#!/usr/bin/env python3
"""Testy własne `css_jedno_zrodlo_klasy_guard.py` (karta KOLIZJE-KLAS-CSS).

Pokrywają iloczyn cech, w którym kolizja mogłaby się schować: postać selektora
(samodzielny / z pseudoklasą / z argumentem pseudoklasy / w liście selektorów /
złożony / zawężony do kontenera) × miejsce reguły (poziom arkusza / ``@media`` /
``@keyframes``) × liczba plików (jeden / dwa) × szum leksykalny (komentarz, napis z
klamrami). Każdy pozytyw ma negatyw — strażnik, który zawsze czerwieni, jest tak
samo bezużyteczny jak taki, który zawsze milczy. Ostatni test uruchamia ``main()``
na drzewie repozytorium: zero kolizji i niepusty skan.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import css_jedno_zrodlo_klasy_guard as guard  # noqa: E402

# ---------------------------------------------------------------------------
# klasy_samodzielne — które selektory definiują klasę „samodzielnie".
# ---------------------------------------------------------------------------


def test_samodzielna_klasa_i_pseudoklasy() -> None:
    css = """
    .a { color: red; }
    .b:hover { color: red; }
    .c::before { content: ""; }
    .d:hover:not(:disabled) { color: red; }
    """
    assert guard.klasy_samodzielne(css) == {"a", "b", "c", "d"}


def test_lista_selektorow_dzielona_po_przecinku() -> None:
    assert guard.klasy_samodzielne(".a, .b, div.c { x: 1; }") == {"a", "b"}


def test_selektor_zlozony_i_zawezony_nie_jest_samodzielny() -> None:
    css = ".ekran .mvd-btn { x: 1; } .a.b { x: 1; } div.c { x: 1; } .d > li { x: 1; }"
    assert guard.klasy_samodzielne(css) == set()


def test_regula_w_media_liczy_sie_jak_na_poziomie_arkusza() -> None:
    css = "@media (max-width: 900px) { .a { x: 1; } .ekran .b { x: 1; } }"
    assert guard.klasy_samodzielne(css) == {"a"}


def test_keyframes_nie_daja_klas() -> None:
    css = "@keyframes puls { from { opacity: 0; } 50% { opacity: 1; } } .a { x: 1; }"
    assert guard.klasy_samodzielne(css) == {"a"}


def test_komentarz_i_napis_z_klamrami_nie_myla_parsera() -> None:
    css = """
    /* .widmo { x: 1; } */
    .a::after { content: "} .widmo2 {"; }
    .b { x: 1; }
    """
    assert guard.klasy_samodzielne(css) == {"a", "b"}


def test_import_bez_bloku_nie_psuje_skanu() -> None:
    assert guard.klasy_samodzielne("@import url('x.css');\n.a { x: 1; }") == {"a"}


# ---------------------------------------------------------------------------
# kolizje — dane syntetyczne: dwa pliki, różne postacie tej samej klasy.
# ---------------------------------------------------------------------------


def test_wykrywa_kolizje_klasy_w_dwoch_plikach() -> None:
    arkusze = {
        "shell.css": ".mvd-menu { position: relative; }",
        "przypadki.css": ".mvd-menu { position: fixed; }",
    }
    assert guard.kolizje(arkusze) == {".mvd-menu": ["przypadki.css", "shell.css"]}


def test_wykrywa_kolizje_baza_w_jednym_pseudoklasa_w_drugim() -> None:
    arkusze = {"a.css": ".mvd-btn { x: 1; }", "b.css": ".mvd-btn:hover { x: 2; }"}
    assert guard.kolizje(arkusze) == {".mvd-btn": ["a.css", "b.css"]}


def test_wykrywa_kolizje_w_media_innego_pliku() -> None:
    arkusze = {"a.css": ".x { y: 1; }", "b.css": "@media print { .x { y: 2; } }"}
    assert guard.kolizje(arkusze) == {".x": ["a.css", "b.css"]}


def test_wykrywa_kolizje_identycznego_selektora_zlozonego() -> None:
    arkusze = {
        "a.css": ".mvd-cases-table th { x: 1; }",
        "b.css": ".mvd-cases-table   th { x: 2; }",
    }
    assert guard.kolizje(arkusze) == {".mvd-cases-table th": ["a.css", "b.css"]}


def test_wariant_zawezony_do_kontenera_nie_jest_kolizja() -> None:
    arkusze = {
        "prymitywy.css": ".mvd-btn { x: 1; }",
        "ekran.css": ".mvd-ekran .mvd-btn { x: 2; } .mvd-btn-ekran { x: 3; }",
    }
    assert guard.kolizje(arkusze) == {}


def test_powtorzenie_w_jednym_pliku_nie_jest_kolizja_miedzy_plikami() -> None:
    assert guard.kolizje({"a.css": ".x { y: 1; } .x:hover { y: 2; } .x { y: 3; }"}) == {}


def test_selektor_bez_klasy_nie_jest_liczony() -> None:
    assert guard.kolizje({"a.css": "body { x: 1; }", "b.css": "body { x: 2; }"}) == {}


# ---------------------------------------------------------------------------
# main() — pusty skan to błąd; repozytorium bez kolizji.
# ---------------------------------------------------------------------------


def test_main_pusty_skan_to_blad(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(guard, "KORZEN_CSS", tmp_path)
    assert guard.main() == 1


def test_main_czerwony_na_kolizji(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "a.css").write_text(".x { y: 1; }", encoding="utf-8")
    (tmp_path / "b.css").write_text(".x { y: 2; }", encoding="utf-8")
    (tmp_path / "c.css").write_text(".z { y: 3; }", encoding="utf-8")
    monkeypatch.setattr(guard, "KORZEN_CSS", tmp_path)
    assert guard.main() == 1


def test_main_zielony_bez_kolizji(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "a.css").write_text(".x { y: 1; }", encoding="utf-8")
    (tmp_path / "b.css").write_text(".ekran .x { y: 2; }", encoding="utf-8")
    monkeypatch.setattr(guard, "KORZEN_CSS", tmp_path)
    assert guard.main() == 0


def test_main_na_repozytorium_zero_kolizji() -> None:
    assert guard.main() == 0
