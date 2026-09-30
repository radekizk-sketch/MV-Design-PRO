"""Testy własne evidence_status_guard.py (karta S-1, W6-0).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): forma AST (słownik literał /
wywołanie z argumentem nazwanym / wyrażenie warunkowe / przypisanie) x klucz
(reporting_status/proof_status) x miejsce (w allowliście / poza allowlistą /
poza jakąkolwiek funkcją) — nie tylko przykład z karty.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from evidence_status_guard import (  # noqa: E402
    _ALLOWLIST,
    main,
    scan_source,
)

# ---------------------------------------------------------------------------
# Forma AST: słownik literał
# ---------------------------------------------------------------------------


def test_dict_literal_reportable_poza_funkcja_jest_naruszeniem() -> None:
    kod = 'x = {"reporting_status": "reportable"}\n'
    violations, hits = scan_source(kod, "modul.py")
    assert violations
    assert hits == set()


def test_dict_literal_reportable_w_funkcji_poza_allowlista_jest_naruszeniem() -> None:
    kod = 'def buduj():\n    return {"reporting_status": "reportable"}\n'
    violations, hits = scan_source(kod, "modul.py")
    assert len(violations) == 1
    assert hits == {("modul.py", "buduj")}


def test_dict_literal_complete_w_funkcji_poza_allowlista_jest_naruszeniem() -> None:
    kod = 'def buduj():\n    return {"proof_status": "complete"}\n'
    violations, _hits = scan_source(kod, "modul.py")
    assert len(violations) == 1


def test_dict_literal_not_reportable_nie_jest_naruszeniem() -> None:
    """`not_reportable`/`partial`/`incomplete` to kierunek OSTROŻNY — bez ryzyka."""
    kod = 'def buduj():\n    return {"reporting_status": "not_reportable", "proof_status": "incomplete"}\n'
    violations, _hits = scan_source(kod, "modul.py")
    assert violations == []


def test_dict_literal_w_funkcji_z_allowlisty_nie_jest_naruszeniem() -> None:
    sciezka, funkcja, _uzasadnienie = _ALLOWLIST[0]
    kod = f'def {funkcja}():\n    return {{"reporting_status": "reportable"}}\n'
    violations, hits = scan_source(kod, sciezka)
    assert violations == []
    assert hits == {(sciezka, funkcja)}


# ---------------------------------------------------------------------------
# Forma AST: wywołanie z argumentem nazwanym (konstruktor dataclass/pydantic)
# ---------------------------------------------------------------------------


def test_call_keyword_reportable_poza_allowlista_jest_naruszeniem() -> None:
    kod = 'def buduj():\n    return Wynik(reporting_status="reportable")\n'
    violations, _hits = scan_source(kod, "modul.py")
    assert len(violations) == 1


def test_call_keyword_complete_w_allowliscie_nie_jest_naruszeniem() -> None:
    sciezka, funkcja, _uzasadnienie = _ALLOWLIST[-1]
    kod = f'def {funkcja}():\n    return Wynik(proof_status="complete")\n'
    violations, _hits = scan_source(kod, sciezka)
    assert violations == []


# ---------------------------------------------------------------------------
# Forma AST: wyrażenie warunkowe (ternary) — obie gałęzie sprawdzane
# ---------------------------------------------------------------------------


def test_ternary_assign_reportable_w_galezi_poza_allowlista_jest_naruszeniem() -> None:
    kod = "def buduj():\n    reporting_status = 'reportable' if x else 'not_reportable'\n"
    violations, _hits = scan_source(kod, "modul.py")
    assert len(violations) == 1


def test_ternary_call_keyword_reportable_w_drugiej_galezi_jest_naruszeniem() -> None:
    """Literał w gałęzi `orelse` (nie tylko `body`) też jest naruszeniem — obie
    gałęzie ternary są tekstem źródłowym niezależnie od wykonalności."""
    kod = 'def buduj():\n    return Wynik(reporting_status=(x if cond else "reportable"))\n'
    violations, _hits = scan_source(kod, "modul.py")
    assert len(violations) == 1


def test_ternary_w_funkcji_z_allowlisty_nie_jest_naruszeniem() -> None:
    sciezka, funkcja, _uzasadnienie = _ALLOWLIST[3]  # _execute_power_flow
    assert funkcja == "_execute_power_flow"
    kod = (
        f"def {funkcja}():\n"
        "    reporting_status = 'reportable' if solution.converged else 'not_reportable'\n"
        "    proof_status = 'complete' if solution.converged else 'partial'\n"
    )
    violations, hits = scan_source(kod, sciezka)
    assert violations == []
    assert hits == {(sciezka, funkcja)}


# ---------------------------------------------------------------------------
# Klucz: tylko reporting_status/proof_status — inne klucze o tej samej
# wartości NIE są bannowane (guard jest o KONKRETNYCH dwóch kluczach).
# ---------------------------------------------------------------------------


def test_inny_klucz_o_wartosci_reportable_nie_jest_naruszeniem() -> None:
    kod = 'def buduj():\n    return {"jakis_inny_klucz": "reportable"}\n'
    violations, _hits = scan_source(kod, "modul.py")
    assert violations == []


def test_wartosc_reportable_bez_klucza_reporting_status_nie_jest_naruszeniem() -> None:
    kod = 'def buduj():\n    return {"proof_status": "reportable"}\n'  # zla para
    violations, _hits = scan_source(kod, "modul.py")
    assert violations == []


# ---------------------------------------------------------------------------
# Zagniezdzenie funkcji — sledzenie NAJBLIZSZEJ obejmujacej.
# ---------------------------------------------------------------------------


def test_zagniezdzona_funkcja_poza_allowlista_jest_naruszeniem() -> None:
    sciezka, funkcja, _uzasadnienie = _ALLOWLIST[0]
    kod = f'def {funkcja}():\n    def wewnetrzna():\n        return {{"proof_status": "complete"}}\n    return wewnetrzna()\n'
    violations, hits = scan_source(kod, sciezka)
    # Najblizsza obejmujaca to "wewnetrzna", NIE na liscie -> naruszenie.
    assert len(violations) == 1
    assert hits == {(sciezka, "wewnetrzna")}


# ---------------------------------------------------------------------------
# Allowlista: kazdy wpis musi byc trafiony w REALNYM repo (brak martwych
# wpisow) i main() zwraca 0 na czystym repo.
# ---------------------------------------------------------------------------


def test_allowlist_ma_unikalne_wpisy() -> None:
    klucze = [(sciezka, funkcja) for sciezka, funkcja, _ in _ALLOWLIST]
    assert len(klucze) == len(set(klucze))


def test_main_zwraca_zero_na_prawdziwym_repo() -> None:
    assert main() == 0
