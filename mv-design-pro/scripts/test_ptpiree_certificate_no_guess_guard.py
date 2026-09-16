#!/usr/bin/env python3
"""Testy `ptpiree_certificate_no_guess_guard.py` (karta CERTYFIKAT-Z-KATALOGU).

REGUŁA KLASA-NIE-INSTANCJA §4: deklaracja bez testu jest fałszywą pewnością —
ten plik przypina (a) czerwoną iniekcję (guard łapie powrót wzorca), (b)
odporność na cudzysłów podwójny i wielkość liter, (c) pomijanie komentarzy
(w tym wielolinijkowego JSDoc — DOKŁADNIE kształt, w jakim ten wzorzec żyje
dziś w repo jako dokumentacja usuniętej fabrykacji), (d) zielony wynik na HEAD.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ptpiree_certificate_no_guess_guard as guard  # noqa: E402


def test_main_is_green_on_repo() -> None:
    assert guard.main() == 0


def test_czerwona_iniekcja_wykrywa_zgadywanie_z_nazwy(tmp_path: Path) -> None:
    """Dowód czerwonej iniekcji: dawny wzorzec fabrykacji wraca -> RC != 0 (wiersz naruszenia)."""
    plik = tmp_path / "wstrzykniety.ts"
    plik.write_text(
        "export function rozwiazCertyfikat(der: StationDerConnection) {\n"
        "  return der.catalogs.device_catalog_ref?.includes('ptpiree') ? 'ptpiree_verified' : 'unknown';\n"
        "}\n",
        encoding="utf-8",
    )
    naruszenia = guard.scan_file(plik)
    assert len(naruszenia) == 1
    assert naruszenia[0].line_number == 2


def test_wykrywa_cudzyslow_podwojny_i_wielkosc_liter(tmp_path: Path) -> None:
    plik = tmp_path / "wariant.ts"
    plik.write_text('const x = ref.includes("PTPiree") ? 1 : 0;\n', encoding="utf-8")
    assert len(guard.scan_file(plik)) == 1


def test_pomija_pojedyncza_linie_komentarza(tmp_path: Path) -> None:
    plik = tmp_path / "komentarz.ts"
    plik.write_text(
        "// dawny wzor: device_catalog_ref?.includes('ptpiree') -- usuniety\n" "const y = 1;\n",
        encoding="utf-8",
    )
    assert guard.scan_file(plik) == []


def test_pomija_wielolinijkowy_blok_jsdoc(tmp_path: Path) -> None:
    """Dokładnie kształt, w jakim ten literał żyje dziś w repo (JSDoc modułu
    tłumaczący USUNIĘTĄ fabrykację) — musi zostać zielony, inaczej guard
    fałszywie alarmowałby na własnej dokumentacji karty."""
    plik = tmp_path / "jsdoc.ts"
    plik.write_text(
        "/**\n"
        " * Dawny wzór zgadywał z nazwy referencji katalogowej\n"
        " * (`device_catalog_ref?.includes('ptpiree')`) — fabrykacja usunięta.\n"
        " */\n"
        "export function f() { return 1; }\n",
        encoding="utf-8",
    )
    assert guard.scan_file(plik) == []


def test_pomija_wyszukiwarke_rejestru_certyfikatow_substring_zapytania() -> None:
    """`filterPtpireeCertifiedInverters` dopasowuje ZAPYTANIE użytkownika do
    treści rekordu (`haystack.includes(normalized)`) — inny mechanizm (search),
    nie literał `'ptpiree'` w wywołaniu `.includes(...)`, więc wzorzec go nie
    łapie z KONSTRUKCJI (żaden dodatkowy wyjątek nie jest potrzebny)."""
    plik_zrodlowy = (
        guard.REPO_ROOT / "frontend/src/ui/network-build/station-der/ptpireeCertifiedInverters.ts"
    )
    assert guard.scan_file(plik_zrodlowy) == []
