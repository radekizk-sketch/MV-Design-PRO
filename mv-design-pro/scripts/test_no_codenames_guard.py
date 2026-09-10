#!/usr/bin/env python3
"""
Unit tests for no_codenames_guard.py

Verifies that the guard correctly:
- Detects codenames (p7, P20, P11, etc.) in string literals
- Ignores codenames in comments
- Ignores P0 (technical parameter)
- Respects // no-codenames-ignore directive
- Detects K30-style codenames (K<cyfry>, wielka litera) — FAB-F, 2026-09-05
- Ignores male k<cyfry> (fizyka/metrologia) i cytowania kart K1..K13 w opisach
  testow (frontend WYLACZNIE — backend nie ma tego wykluczenia)
"""

import tempfile
from pathlib import Path

# Import functions from guard
import no_codenames_guard as guard_module
import pytest
from no_codenames_guard import (
    ALLOWED_TECHNICAL_TOKENS,
    CODENAME_PATTERN,
    GATE_CITATION_TOKENS,
    find_codenames_in_strings,
    is_comment_line,
    scan_backend_file,
    scan_file,
)


class TestCodenamePattern:
    """Test the regex pattern for codenames."""

    def test_detects_p7(self):
        """Should detect p7."""
        assert CODENAME_PATTERN.search("p7")

    def test_detects_p20_codename(self):
        """Should detect P20."""
        assert CODENAME_PATTERN.search("P20")

    def test_detects_p11_codename(self):
        """Should detect P11."""
        assert CODENAME_PATTERN.search("P11")

    def test_ignores_p0(self):
        """Should NOT detect P0 (technical parameter for transformer losses)."""
        match = CODENAME_PATTERN.search("P0")
        assert match is None

    def test_ignores_p0_kw(self):
        """Should NOT detect p0 in p0_kw."""
        text = "p0_kw"
        match = CODENAME_PATTERN.search(text)
        # p0 is excluded, but make sure no false match
        assert match is None or match.group() != "p0"

    def test_allows_percentile_metrics(self):
        """Should treat percentile metrics as technical tokens, not codenames."""
        assert "p95" in ALLOWED_TECHNICAL_TOKENS


class TestCodenamePatternK:
    """Rozszerzenie `K<cyfry>` (karta FAB-F, 2026-09-05) — patrz docstring
    modulu no_codenames_guard.py, sekcja "ROZSZERZENIE NA K<cyfry>"."""

    def test_detects_k30(self):
        """K30 to fabrykacja usunieta z SldTitleBlock.tsx v2 — musi byc zlapana."""
        assert CODENAME_PATTERN.search("K30")

    def test_detects_k30_with_suffix(self):
        assert CODENAME_PATTERN.search("K30-38")

    def test_ignores_lowercase_k(self):
        """Male `k<cyfry>` NIE jest kryptonimem w tym repo (fizyka/metrologia:
        I_k1/I_k2/I_k3, wspolczynniki IEC 60364-5-52, k=2 w niepewnosci
        pomiaru) — w odroznieniu od `[pP]`, ktore lapie OBIE wielkosci liter,
        `K` lapie WYLACZNIE wielka litere."""
        assert CODENAME_PATTERN.search("k30") is None
        assert CODENAME_PATTERN.search("k1") is None
        assert CODENAME_PATTERN.search("I_k1") is None

    def test_k0_nie_ma_wykluczenia(self):
        """K0 NIE jest wykluczone (w przeciwienstwie do P0) — brak zmierzonego
        odpowiednika technicznego w tym repo. Regresja: wczesniejsza wersja
        wzorca dzielila lookahead "nie 0" miedzy [pP] i K, wiec K0 byl
        wykluczony PRZY OKAZJI — zlapane przez ten test (KLASA §4:
        deklaracja bez testu = falszywa pewnosc)."""
        assert CODENAME_PATTERN.search("K0") is not None

    def test_granica_slowa_z_podkresleniem_dziala_dla_k(self):
        """Ta sama poprawka `\\b` -> znaki alfanumeryczne (2026-08-07, karta
        PACK-ROZPLYW) musi dzialac symetrycznie dla K."""
        assert CODENAME_PATTERN.search("K30_STEP_001")
        assert CODENAME_PATTERN.search("krok_K30_opis")


class TestFindCodenamesInStrings:
    """Test detection of codenames inside string literals."""

    def test_finds_codename_in_single_quotes(self):
        """Should find P11 in single-quoted string."""
        line = "const label = 'Task P11 done';"
        matches = find_codenames_in_strings(line)
        assert "P11" in matches

    def test_finds_codename_in_double_quotes(self):
        """Should find P20 in double-quoted string."""
        line = 'const msg = "This is P20 feature";'
        matches = find_codenames_in_strings(line)
        assert "P20" in matches

    def test_finds_codename_in_template_literal(self):
        """Should find p7 in template literal."""
        line = "const x = `Feature p7 enabled`;"
        matches = find_codenames_in_strings(line)
        assert "p7" in matches

    def test_ignores_codename_outside_string(self):
        """Should NOT find codename in variable name."""
        line = "const p7_enabled = true;"
        matches = find_codenames_in_strings(line)
        assert len(matches) == 0

    def test_multiple_codenames(self):
        """Should find multiple codenames in one line."""
        line = 'const x = "P11, P14, P17";'
        matches = find_codenames_in_strings(line)
        assert "P11" in matches
        assert "P14" in matches
        assert "P17" in matches

    def test_ignores_percentile_metric_token(self):
        """Should NOT flag percentile metrics like p95 inside strings."""
        line = "const stats = `mean=10ms median=9ms p95=14ms`;"
        matches = find_codenames_in_strings(line)
        assert matches == []


class TestFindCodenamesInStringsK:
    """Rozszerzenie K (FAB-F, 2026-09-05): detekcja + wykluczenie
    GATE_CITATION_TOKENS (K1..K13), WYLACZNIE gdy `exempt_gate_citations=True`
    (frontend). Domyslne wywolanie (backend) NIE ma tego wykluczenia."""

    def test_finds_k30_bez_wykluczenia_bramek(self):
        line = "describe('K30-38 revision', () => {"
        assert "K30" in find_codenames_in_strings(line)
        # to samo z parametrem wlaczonym — K30 NIE jest w GATE_CITATION_TOKENS
        assert "K30" in find_codenames_in_strings(line, exempt_gate_citations=True)

    def test_gate_citation_zlapane_bez_flagi(self):
        """Domyslnie (backend) K1..K13 NIE sa wykluczone — surowy identyfikator
        kroku w komunikacie `_pl` jest bledem niezaleznie od zakresu tokenu."""
        line = 'message_pl="Uzupelnij dane (K3) przed dalszym krokiem"'
        assert "K3" in find_codenames_in_strings(line)

    def test_gate_citation_wykluczone_z_flaga(self):
        """Z flaga wlaczona (frontend) K1..K13 w opisie testu SA wykluczone —
        to udokumentowane cytowanie karty/bramki (np. K11-B), nie kryptonim."""
        line = "describe('K11-B — nawigator kanwy', () => {"
        assert find_codenames_in_strings(line, exempt_gate_citations=True) == []
        # bez flagi (jak backend) to samo trafienie WCIAZ jest lapane
        assert "K11" in find_codenames_in_strings(line)

    def test_gate_citation_zakres_zamkniety_k14_nie_jest_wykluczone(self):
        """Zbior GATE_CITATION_TOKENS jest ZAMKNIETY (K1..K13) — K14 i wyzej
        (poza zmierzonym zakresem) nadal jest lapane nawet z flaga wlaczona."""
        assert "K14" not in GATE_CITATION_TOKENS
        line = "describe('K14 nieznana karta', () => {"
        assert "K14" in find_codenames_in_strings(line, exempt_gate_citations=True)

    def test_lowercase_k_nigdy_nie_jest_kryptonimem(self):
        """Male k1/k2/k3 (notacja IEC 60909 dla prądu zwarciowego) nie są
        łapane niezależnie od flagi — wzorzec sam w sobie jest case-sensitive
        dla litery K (patrz TestCodenamePatternK)."""
        line = "const symbol = `I_k1 oraz I_k2`;"
        assert find_codenames_in_strings(line) == []
        assert find_codenames_in_strings(line, exempt_gate_citations=True) == []


class TestIsCommentLine:
    """Test comment line detection."""

    def test_single_line_comment(self):
        """Should detect // comment."""
        assert is_comment_line("// This is a comment")
        assert is_comment_line("  // Indented comment")

    def test_block_comment_start(self):
        """Should detect /* comment start."""
        assert is_comment_line("/* Block comment")

    def test_jsdoc_continuation(self):
        """Should detect * JSDoc continuation."""
        assert is_comment_line(" * This is JSDoc")

    def test_not_comment(self):
        """Should NOT detect regular code."""
        assert not is_comment_line("const x = 1;")
        assert not is_comment_line("  const y = 2;")


class TestScanFile:
    """Test full file scanning."""

    def test_detects_violation_in_string(self):
        """Should detect codename in string literal."""
        content = """
const label = "Feature P11";
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 1
        assert violations[0].match == "P11"

    def test_ignores_comment_line(self):
        """Should NOT detect codename in comment."""
        content = """
// This is P11 feature documentation
const x = 1;
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 0

    def test_respects_ignore_directive(self):
        """Should respect // no-codenames-ignore directive."""
        content = """
const regex = /P11|P14/g; // no-codenames-ignore
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 0

    def test_ignores_p0_parameter(self):
        """Should NOT detect P0 (technical transformer parameter)."""
        content = """
const losses = "Straty jałowe P0";
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 0

    def test_detects_k30_violation_in_string(self):
        """K30 (sesja/faza programu, np. dawne `SldTitleBlock.DEFAULTS.revision`)
        musi byc lapane przez pelny skan pliku frontendu."""
        content = """
const revision = "K30-38";
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 1
        assert violations[0].match == "K30"

    def test_ignores_gate_citation_in_test_description(self):
        """Cytowanie karty/bramki (K11-B) w opisie testu jest wykluczone —
        `scan_file` przekazuje `exempt_gate_citations=True` (patrz
        `find_codenames_in_strings`)."""
        content = """
describe('K11-B — nawigator kanwy', () => {
});
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".test.tsx", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert violations == []

    def test_ignores_lowercase_k_physics_notation(self):
        """I_k1/I_k2 (prad zwarciowy IEC 60909) nigdy nie sa naruszeniem."""
        content = """
const symbol = `I_k1 dla zwarcia 1-fazowego`;
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert violations == []


class TestSkanBackendu:
    """Skan backendowych pól tekstu użytkownika (`*_pl`) — zamknięcie KLASY.

    Kontekst: do 2026-08-07 guard skanował wyłącznie `frontend/`, więc kodenamy
    w polskich komunikatach i tytułach dowodów produkowanych przez backend były
    NIEWIDZIALNE. Odbiór karty PACK-DOWODY zastał pięć takich tytułów czytanych
    przez projektanta (np. „Dowód: Load Flow i spadki napięć (P32)"). Te testy
    pilnują, żeby skan nie zniknął ani nie rozlał się na kod techniczny.
    """

    def _skan(self, tresc: str) -> list:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(tresc)
            f.flush()
            sciezka = Path(f.name)
        try:
            return scan_backend_file(sciezka)
        finally:
            sciezka.unlink()

    def test_kodename_w_komunikacie_uzytkownika_jest_naruszeniem(self):
        naruszenia = self._skan('    message_pl="P12 MVP: brak podstawy."\n')
        assert len(naruszenia) == 1
        assert naruszenia[0].match == "P12"

    def test_kodename_k_w_komunikacie_uzytkownika_jest_naruszeniem(self):
        """Regresja FAB-F: `message_pl="Uzupelnij nazwe projektu (K1) ..."`
        w `network_wizard/step_controller.py` — surowy identyfikator kroku
        kreatora przeciekajacy do tekstu PL czytanego przez projektanta."""
        naruszenia = self._skan(
            '    message_pl="Uzupelnij nazwe projektu (K1) przed dalszym krokiem"\n'
        )
        assert len(naruszenia) == 1
        assert naruszenia[0].match == "K1"

    def test_gate_citation_k_w_backendzie_nie_jest_wykluczona(self):
        """Wykluczenie GATE_CITATION_TOKENS dziala WYLACZNIE dla skanu
        frontendu (`scan_file`, `exempt_gate_citations=True`) — backend
        (pole `_pl`) MUSI nadal lapac K1..K13, bo tam token jest zawsze
        prozą czytaną przez projektanta, nigdy cytatem karty."""
        for token in ("K1", "K5", "K11", "K13"):
            naruszenia = self._skan(f'    message_pl="Krok ({token}) niekompletny"\n')
            assert len(naruszenia) == 1, f"token {token} powinien byc zlapany w backendzie"
            assert naruszenia[0].match == token

    def test_kodename_w_tytule_dowodu_jest_naruszeniem(self):
        naruszenia = self._skan('    title_pl="Dowód: rozpływ mocy (P32)"\n')
        assert len(naruszenia) == 1

    def test_kodename_w_slowniku_z_kluczem_pl_jest_naruszeniem(self):
        naruszenia = self._skan('    dane = {"opis_pl": "wariant P15"}\n')
        assert len(naruszenia) == 1

    def test_nazwa_klasy_technicznej_nie_jest_naruszeniem(self):
        """Kod techniczny zostaje nietknięty — guard pilnuje treści, nie słownictwa."""
        assert self._skan("class P14PowerFlowProof:\n    pass\n") == []

    def test_string_bez_pola_uzytkownika_nie_jest_naruszeniem(self):
        assert self._skan('    solver_id = "P18"\n') == []

    def test_komentarz_nie_jest_naruszeniem(self):
        assert self._skan('    # historia: message_pl="P12 MVP"\n') == []


class TestKodenameObokPodkreslenia:
    """Dziura `\\b` zamknięta 2026-08-07 (odbiór karty PACK-ROZPLYW).

    Pierwotny wzorzec `\\b[pP](?!0\\b)\\d+\\b` PRZEPUSZCZAŁ kodename sąsiadujący
    z podkreśleniem, bo `_` jest znakiem słowa — między `P14` a `_` nie ma granicy
    słowa. Zmierzone na żywym guardzie: „P14" łapane, „P14_STEP_001" i całe zdanie
    „Dowód P11_wynik" przechodziły na zielono. Znalazł to wykonawca karty
    PACK-ROZPLYW, gdy jego WŁASNY pin — pisany tym samym wzorcem — okazał się
    zielony przy naruszeniu (reguła KLASA §4: deklaracja bez testu = fałszywa
    pewność, a tu fałszywa była sama metoda sprawdzania).

    Iloczyn cech: {kodename goły · z podkreśleniem · w środku identyfikatora}
    × {token dozwolony · parametr techniczny · nazwa handlowa aparatury}.
    Druga oś jest tu istotna: zbyt luźny wzorzec zacząłby flagować przekaźnik
    `SCHNEIDER_P3M30`, czyli zamieniłby dziurę na hałas.
    """

    @staticmethod
    def _trafienia(tekst: str) -> list[str]:
        return find_codenames_in_strings(f"const x = {tekst!r};".replace("'", '"'))

    def test_kodename_z_podkresleniem_jest_lapany(self):
        assert self._trafienia("P14_STEP_001")
        assert self._trafienia("Dowod P11_wynik")
        assert self._trafienia("krok_P17_opis")

    def test_kodename_goly_nadal_lapany(self):
        assert self._trafienia("P14")
        assert self._trafienia("P14 rozplyw")

    def test_parametr_techniczny_strat_jalowych_nadal_przepuszczany(self):
        assert self._trafienia("p0_kw") == []
        assert self._trafienia("Straty jalowe P0") == []

    def test_tokeny_statystyczne_nadal_przepuszczane(self):
        assert self._trafienia("p95_ms") == []
        assert self._trafienia("P50") == []

    def test_nazwa_handlowa_aparatury_nie_jest_kodename(self):
        """Przekaźnik `SCHNEIDER_P3M30` — po `P3` stoi litera, więc odsiewa go
        KONSTRUKCJA wzorca, a nie biała lista, której trzeba by pilnować."""
        assert self._trafienia("SCHNEIDER_P3M30") == []
        assert self._trafienia("SCHNEIDER_P3F30") == []

    def test_kodename_k_z_podkresleniem_jest_lapany(self):
        """Ta sama poprawka granicy słowa (2026-08-07) obowiazuje symetrycznie
        dla `K` (FAB-F, 2026-09-05) — K30 poza GATE_CITATION_TOKENS, wiec
        lapane niezaleznie od tego, czy wywolanie ma wlaczone wykluczenie."""
        assert self._trafienia("K30_STEP_001")
        assert self._trafienia("Rewizja K30_wynik")
        assert self._trafienia("krok_K30_opis")

    def test_kodename_k_goly_nadal_lapany(self):
        assert self._trafienia("K30")
        assert self._trafienia("K30 rozplyw")

    def test_male_k_nadal_przepuszczane_obok_podkreslenia(self):
        """`I_k1`, `sc_k1_max` — male k tuz przy podkresleniu tez nie jest
        kryptonimem (wzorzec jest case-sensitive dla K, nie tylko dla
        wyjatku "0")."""
        assert self._trafienia("I_k1") == []
        assert self._trafienia("sc_k1_max") == []


class TestExcludedRelativeFilesFreshness:
    """Zapadka swiezosci EXCLUDED_RELATIVE_FILES (karta ZAPADKI-ALLOWLIST-RESZTA,
    pozycja f, 2026-08-12). Pelna zapadka dwukierunkowa: plik musi istniec ORAZ
    nadal produkowac >=1 trafienie scan_file(), gdyby nie byl wykluczony.
    """

    def test_zielony_na_repo(self) -> None:
        assert guard_module.check_excluded_relative_files_freshness(guard_module.REPO_ROOT) == []

    def test_wpis_ma_realne_trafienie_bez_wykluczenia(self) -> None:
        """Potwierdzenie POMIARU: jedyny dzisiejszy wpis (trade name z 'P3' w
        nazwie modelu falownika) faktycznie produkuje raw hit."""
        for rel_path in guard_module.EXCLUDED_RELATIVE_FILES:
            full_path = guard_module.REPO_ROOT / rel_path
            assert full_path.is_file(), f"brak pliku {rel_path!r}"
            assert scan_file(full_path), f"EXCLUDED_RELATIVE_FILES[{rel_path!r}] to sierota"

    def test_lapie_brakujacy_plik(self, monkeypatch) -> None:
        monkeypatch.setattr(
            guard_module,
            "EXCLUDED_RELATIVE_FILES",
            {"frontend/src/ui/nigdy/nieistniejacy_plik.ts"},
        )

        naruszenia = guard_module.check_excluded_relative_files_freshness(guard_module.REPO_ROOT)

        assert len(naruszenia) == 1
        assert "[no-codenames-wykluczenie-osierocone]" in naruszenia[0]
        assert "nieistniejacy_plik.ts" in naruszenia[0]

    def test_lapie_plik_ktory_juz_nie_produkuje_trafienia(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        """Plik istnieje, ale kodename z niego zniknal (np. model zmieniony) —
        sierota SEMANTYCZNA, nie tylko brak pliku."""
        katalog = tmp_path / "frontend" / "src" / "ui" / "katalog"
        katalog.mkdir(parents=True, exist_ok=True)
        plik = katalog / "czysty.ts"
        plik.write_text("export const MODEL = 'BEZ_KODENAME';\n", encoding="utf-8")
        monkeypatch.setattr(
            guard_module, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/katalog/czysty.ts"}
        )

        naruszenia = guard_module.check_excluded_relative_files_freshness(tmp_path)

        assert len(naruszenia) == 1
        assert "juz nie produkuje zadnego trafienia" in naruszenia[0]

    def test_akceptuje_plik_ktory_nadal_produkuje_trafienie(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        katalog = tmp_path / "frontend" / "src" / "ui" / "katalog"
        katalog.mkdir(parents=True, exist_ok=True)
        plik = katalog / "z_kodename.ts"
        plik.write_text("export const MODEL = 'HD-P3-model';\n", encoding="utf-8")
        monkeypatch.setattr(
            guard_module, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/katalog/z_kodename.ts"}
        )

        assert guard_module.check_excluded_relative_files_freshness(tmp_path) == []

    def test_main_zwraca_1_gdy_wykluczenie_osierocone(self, monkeypatch) -> None:
        monkeypatch.setattr(
            guard_module,
            "EXCLUDED_RELATIVE_FILES",
            {"frontend/src/ui/nigdy/nieistniejacy_plik.ts"},
        )

        assert guard_module.main() == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
