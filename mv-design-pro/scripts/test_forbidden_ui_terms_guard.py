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
import pytest


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


# ---------------------------------------------------------------------------
# Reguła komunikatu zapytania (karta komunikatów, commit 4, 2026-10-30): jedno źródło
# komunikatu o nieudanym zapytaniu — `frontend/src/ui2/shared/bladZapytania.ts`.
# Iloczyn cech: {szablon w `new Error`, szablon jako wartość, literał w apostrofach}
# × {surowy adres, statusText, goły kod HTTP, angielska fraza transportu, wklejony status,
# ścieżka /api/}; negatywy: komentarz, zmienna lokalna `statusText`, stan biegu domeny,
# plik źródła prawdy, pliki testów.
# ---------------------------------------------------------------------------


_PRZYPADKI_NARUSZEN = [
    ("throw new Error(`Request ${url} failed: ${response.status}`);\n", "surowy adres"),
    ("throw new Error(`Request ${url} failed: ${response.status}`);\n", "angielski komunikat"),
    ("let k = `Zapytanie ${url} nie powiodło się`;\n", "surowy adres"),
    ("super(`Topologia: HTTP ${status} (${endpoint})`);\n", "surowy adres"),
    ("throw new Error(`Błąd pobierania: ${response.statusText}`);\n", "statusText"),
    ("const m = errorData.detail || response.statusText;\n", "statusText"),
    ("const d = await res.json().catch(() => res.statusText);\n", "statusText"),
    ("return `HTTP ${response.status}`;\n", "goły kod HTTP"),
    ("throw new Error(d || `Błąd HTTP: ${response.status}`);\n", "goły kod HTTP"),
    ("const m = `Błąd API ${status}`;\n", "goły kod HTTP"),
    ("throw new Error('GET station config failed');\n", "angielski komunikat"),
    ('throw new Error("Failed to fetch readiness");\n', "angielski komunikat"),
    ("throw new Error(`Nie udało się (HTTP ${odpowiedz.status}).`);\n", "kod statusu HTTP"),
    ("throw new Error(`Błąd pobierania: ${res.status}`);\n", "kod statusu HTTP"),
    ("throw new Error(`POST /api/projects nie powiódł się`);\n", "ścieżka zapytania"),
    ("throw new Error(\n  `Request ${url}\n failed`,\n);\n", "surowy adres"),
]


@pytest.mark.parametrize(("tresc", "powod"), _PRZYPADKI_NARUSZEN)
def test_komunikat_zapytania_iniekcja_czerwona(tmp_path: Path, tresc: str, powod: str) -> None:
    sciezka = _napisz(tmp_path, tresc, "klient.ts")
    naruszenia = guard.scan_komunikat_zapytania(sciezka)
    assert any(powod in reason for _l, _c, reason in naruszenia), naruszenia


@pytest.mark.parametrize(
    "tresc",
    [
        "// throw new Error(`Request ${url} failed: ${response.statusText}`);\n",
        "/* `HTTP ${response.status}` */\n",
        "const statusText = useMemo(() => 'Gotowe', []);\n",
        "throw new Error(`Bieg zakończył się stanem ${etykieta(wynik.status)}.`);\n",
        "key={`${licznik.status}-${x}`}\n",
        "throw bladZapytania(response, 'Nie udało się pobrać widoku pola');\n",
        "const url = `/api/cases/${caseId}/runs`;\n",
    ],
)
def test_komunikat_zapytania_bez_falszywych_trafien(tmp_path: Path, tresc: str) -> None:
    sciezka = _napisz(tmp_path, tresc, "klient.ts")
    assert guard.scan_komunikat_zapytania(sciezka) == []


def test_komunikat_zapytania_numer_linii_po_usunieciu_komentarzy(tmp_path: Path) -> None:
    sciezka = _napisz(
        tmp_path,
        "/**\n * opis\n */\nconst a = 1;\nthrow new Error(`HTTP ${response.status}`);\n",
        "klient.ts",
    )
    linie = {linia for linia, _c, _r in guard.scan_komunikat_zapytania(sciezka)}
    assert linie == {5}


def test_komunikat_zapytania_realne_repo_czyste_i_zrodlo_prawdy_wylaczone() -> None:
    """Pin zapadki: po karcie `frontend/src` nie ma ani jednej lokalnej kopii komunikatu;
    plik źródła prawdy (który SAM składa „HTTP <kod>”) i testy są poza regułą — iniekcja
    jego treści do zwykłego pliku jest czerwona."""
    import os

    root = os.path.dirname(os.path.dirname(os.path.abspath(guard.__file__)))
    assert guard.naruszenia_komunikatu_zapytania(root) == []
    zrodlo = os.path.join(root, guard.PLIK_KOMUNIKATU_ZAPYTANIA)
    assert os.path.isfile(zrodlo)
    with open(zrodlo, encoding="utf-8") as f:
        assert "(HTTP ${odpowiedz.status})" in f.read()


def test_komunikat_zapytania_tresc_zrodla_prawdy_poza_nim_jest_czerwona(tmp_path: Path) -> None:
    import os

    root = os.path.dirname(os.path.dirname(os.path.abspath(guard.__file__)))
    with open(os.path.join(root, guard.PLIK_KOMUNIKATU_ZAPYTANIA), encoding="utf-8") as f:
        tresc = f.read()
    sciezka = _napisz(tmp_path, tresc, "kopia.ts")
    assert guard.scan_komunikat_zapytania(sciezka), "kopia źródła prawdy musi być naruszeniem"
