"""Self-testy `forbidden_ui_terms_guard` (karta TODO-UI2, 2026-09-16, §0.4(ii)).

Nowe wzorce na literałach UI-widocznych (nie na komentarzach — to pilnuje
`repo_hygiene_guard.check_todo_fixme`): 'wkrótce', 'w przygotowaniu',
'niedostępne w tej karcie', 'TODO', 'TODO-KARTA', 'patrz karta/kartę'.
Testy: iniekcja czerwona (klasa, nie jeden literał) + wyjątek pliku-kanonu
(fałszywe trafienie) + brak fałszywego trafienia w komentarzu/importach.
"""

from __future__ import annotations

from pathlib import Path

import forbidden_ui_terms_guard as guard


def _napisz(tmp_path: Path, tresc: str, nazwa: str = "Plik.tsx") -> str:
    plik = tmp_path / nazwa
    plik.write_text(tresc, encoding="utf-8")
    return str(plik)


def test_flags_wkrotce_string_literal(tmp_path: Path) -> None:
    sciezka = _napisz(
        tmp_path,
        "export const X = { pochodzenieWkrotce: 'Wkrótce — brak źródła w rekordzie' };\n",
    )
    naruszenia = guard.scan_file(sciezka)
    assert any("wkrótce" in reason.lower() for _l, _c, reason in naruszenia)


def test_flags_w_przygotowaniu_as_raw_jsx_text(tmp_path: Path) -> None:
    """Przypadek realny repo (`ui/settings/SettingsPanel.tsx`, naprawiony w tej
    karcie): tekst wpisany WPROST do JSX (nie literał w cudzysłowie) jest
    RÓWNIE widoczny użytkownikowi — `JSX_TEXT_RE` musi go złapać, nie tylko
    `STRING_LITERAL_RE`."""
    sciezka = _napisz(tmp_path, '<option value="EN">English (EN) - w przygotowaniu</option>\n')
    naruszenia = guard.scan_file(sciezka)
    assert any("przygotowaniu" in reason.lower() for _l, _c, reason in naruszenia)


def test_does_not_fire_on_jsx_expression_braces(tmp_path: Path) -> None:
    """`{wyrazenie}` między tagami to kod, nie tekst — `JSX_TEXT_RE` wyklucza
    `{`/`}`, więc np. `<span>{jakisTekst}</span>` nie generuje fałszywego
    trafienia na treści zmiennej (guard nie odczytuje wartości w runtime)."""
    sciezka = _napisz(tmp_path, "<span>{STRINGS.wkrotce}</span>\n")
    assert guard.scan_file(sciezka) == []


def test_flags_niedostepne_w_tej_karcie_string_literal(tmp_path: Path) -> None:
    sciezka = _napisz(
        tmp_path,
        "menuWymaganiaDanychNiedostepne: 'Niedostępne w tej karcie — patrz TODO-KARTA',\n",
    )
    naruszenia = guard.scan_file(sciezka)
    powody = [reason.lower() for _l, _c, reason in naruszenia]
    assert any("niedostępne w tej karcie" in p for p in powody)
    assert any(p.startswith("todo w literale") for p in powody)
    assert any("todo-karta" in p for p in powody)


def test_flags_bare_todo_string_literal(tmp_path: Path) -> None:
    sciezka = _napisz(tmp_path, "const etykieta = 'TODO';\n")
    naruszenia = guard.scan_file(sciezka)
    assert any("todo w literale" in reason.lower() for _l, _c, reason in naruszenia)


def test_flags_patrz_karte_string_literal(tmp_path: Path) -> None:
    sciezka = _napisz(tmp_path, "const opis = 'Szczegóły — patrz kartę E9';\n")
    naruszenia = guard.scan_file(sciezka)
    assert any("patrz karta" in reason.lower() for _l, _c, reason in naruszenia)


def test_does_not_fire_on_comment_text(tmp_path: Path) -> None:
    """Skaner literałów UI pomija linie-komentarze (to pilnuje inny guard —
    `repo_hygiene_guard` — na komentarzach)."""
    sciezka = _napisz(tmp_path, "// TODO-KARTA: notatka historyczna, wkrótce naprawimy\n")
    assert guard.scan_file(sciezka) == []


def test_exempts_canonical_forbidden_word_list_file() -> None:
    """`ui/canon/labelGuards.ts` DEFINIUJE literały-wzorce ('TODO',
    'w przygotowaniu') dla INNEGO guarda etykiet PL — dopasowanie do własnej
    definicji kanonu jest fałszywym trafieniem, nie instancją naruszenia."""
    assert guard.is_exempt("frontend/src/ui/canon/labelGuards.ts") is True


def test_exemption_is_scoped_to_named_file_only(tmp_path: Path) -> None:
    """Predykat parami: identyczny literał pod INNĄ ścieżką (nie kanon) nadal
    jest naruszeniem — wyjątek nie jest osłabieniem wzorca."""
    assert guard.is_exempt("frontend/src/ui2/spaces/cos/innyPlik.ts") is False
    sciezka = _napisz(tmp_path, "export const FORBIDDEN = ['TODO'];\n")
    assert guard.scan_file(sciezka) != []


def test_clean_string_literal_is_silent(tmp_path: Path) -> None:
    sciezka = _napisz(tmp_path, "const etykieta = 'Napięcie znamionowe';\n")
    assert guard.scan_file(sciezka) == []


def test_real_repo_ui2_wyniki_and_freshness_string_literals_are_clean() -> None:
    """Pin ODPOWIEDZIALNOŚCI (TODO-A): literały UI w `ui2/wyniki/**` i
    `ui2/freshness/**` — pliki poza `__tests__`/`.test.`/`.spec.` — nie niosą
    żadnego z nowych zakazanych wzorców na realnym repo po tej karcie."""
    import os

    root = os.path.dirname(os.path.dirname(os.path.abspath(guard.__file__)))
    wszystkie: list[tuple[str, int, str, str]] = []
    for baza in ("frontend/src/ui2/wyniki", "frontend/src/ui2/freshness"):
        pelna = os.path.join(root, baza)
        for dirpath, _dirs, filenames in os.walk(pelna):
            for filename in filenames:
                if not filename.endswith((".tsx", ".ts")):
                    continue
                pelna_sciezka = os.path.join(dirpath, filename)
                wzgledna = os.path.relpath(pelna_sciezka, root)
                if guard.is_exempt(wzgledna):
                    continue
                for line_no, line, reason in guard.scan_file(pelna_sciezka):
                    wszystkie.append((wzgledna, line_no, line, reason))
    assert wszystkie == [], wszystkie
