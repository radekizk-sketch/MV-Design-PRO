"""Testy własne `sc_authority_guard.py` (karta S-2 AUTORYTET).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): dla KAŻDEJ z trzech kontroli
guarda — {wywołanie prawdziwe / tylko import / tylko komentarz-docstring} ×
{plik z listy / plik spoza listy} — nie tylko przykład z karty. Ostatni test
(`test_guard_zielony_na_rzeczywistym_drzewie`) uruchamia guard na PRAWDZIWYM
`backend/src` — dowód, że wpięcie w tej karcie faktycznie działa, nie tylko że
logika guarda jest poprawna na syntetycznym kodzie.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sc_authority_guard  # noqa: E402
from sc_authority_guard import (  # noqa: E402
    KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ,
    MOST_AUTORYTETU_NAZWY,
    PLIKI_TRASY_HTTP,
    PLIKI_Z_BRAMKA_AUTORYTETU,
    _importuje_ktoras,
    _konstruowane_typy,
    _wywoluje_funkcje,
    main,
)


def _ast(kod: str) -> ast.Module:
    return ast.parse(kod)


# ---------------------------------------------------------------------------
# Kontrola 1: _wywoluje_funkcje — WYWOŁANIE, nie tylko import/komentarz/docstring.
# ---------------------------------------------------------------------------


def test_wywoluje_funkcje_wykrywa_wywolanie_bezposrednie() -> None:
    kod = "from x import wymagaj_autorytetu\nwymagaj_autorytetu((), None)\n"
    assert _wywoluje_funkcje(_ast(kod), "wymagaj_autorytetu") is True


def test_wywoluje_funkcje_wykrywa_wywolanie_jako_atrybut() -> None:
    kod = "import x\nx.wymagaj_autorytetu((), None)\n"
    assert _wywoluje_funkcje(_ast(kod), "wymagaj_autorytetu") is True


def test_wywoluje_funkcje_odrzuca_sam_import_bez_wywolania() -> None:
    kod = "from x import wymagaj_autorytetu\n"
    assert _wywoluje_funkcje(_ast(kod), "wymagaj_autorytetu") is False


def test_wywoluje_funkcje_odrzuca_komentarz_i_docstring() -> None:
    kod = (
        "# wywoluje wymagaj_autorytetu\n"
        "def f():\n"
        '    """Ten kod wola wymagaj_autorytetu."""\n'
        "    return 1\n"
    )
    assert _wywoluje_funkcje(_ast(kod), "wymagaj_autorytetu") is False


def test_wywoluje_funkcje_odrzuca_napis_z_ta_sama_nazwa() -> None:
    kod = 'x = "wymagaj_autorytetu"\n'
    assert _wywoluje_funkcje(_ast(kod), "wymagaj_autorytetu") is False


# ---------------------------------------------------------------------------
# Kontrola 2: _importuje_ktoras — most autorytetu zaimportowany.
# ---------------------------------------------------------------------------


def test_importuje_ktoras_wykrywa_import_from() -> None:
    kod = "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
    assert _importuje_ktoras(_ast(kod), MOST_AUTORYTETU_NAZWY) is True


def test_importuje_ktoras_wykrywa_import_modulu() -> None:
    kod = "import application.autorytet_biegu_zwarciowego as most\n"
    assert _importuje_ktoras(_ast(kod), frozenset({"autorytet_biegu_zwarciowego"})) is True


def test_importuje_ktoras_odrzuca_brak_importu() -> None:
    kod = "x = 1\n"
    assert _importuje_ktoras(_ast(kod), MOST_AUTORYTETU_NAZWY) is False


# ---------------------------------------------------------------------------
# Kontrola 3: _konstruowane_typy — konstruktory wejścia zdolności zależnej.
# ---------------------------------------------------------------------------


def test_konstruowane_typy_wykrywa_wywolanie_bezposrednie() -> None:
    kod = "x = EquipmentProofInput(a=1)\n"
    assert _konstruowane_typy(_ast(kod)) == {"EquipmentProofInput"}


def test_konstruowane_typy_wykrywa_oba_naraz() -> None:
    kod = "a = EquipmentProofInput(x=1)\nb = CoordinationInput(y=2)\n"
    assert _konstruowane_typy(_ast(kod)) == {"EquipmentProofInput", "CoordinationInput"}


def test_konstruowane_typy_pusty_dla_niezwiazanej_nazwy() -> None:
    kod = "x = InnyTyp(a=1)\n"
    assert _konstruowane_typy(_ast(kod)) == set()


def test_konstruowane_typy_pusty_dla_komentarza() -> None:
    kod = "# EquipmentProofInput(a=1) — przykład w komentarzu\nx = 1\n"
    assert _konstruowane_typy(_ast(kod)) == set()


# ---------------------------------------------------------------------------
# Listy zamknięte — spójność ze sobą (predykaty parami, CLAUDE.md).
# ---------------------------------------------------------------------------


def test_liste_tras_http_i_konstruktorow_sa_tym_samym_zbiorem() -> None:
    """`KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ` MUSI być dokładnie tym samym
    zbiorem co `PLIKI_TRASY_HTTP` — dwie niezależne listy tych samych plików są
    defektem czekającym na dane brzegowe (reguła KLASA NIE INSTANCJA)."""
    assert KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ == frozenset(PLIKI_TRASY_HTTP)


# ---------------------------------------------------------------------------
# main() — iniekcje na drzewie tymczasowym (tmp_path), każda klasa naruszenia.
# ---------------------------------------------------------------------------


def _zbuduj_drzewo_ok(tmp_path: Path) -> Path:
    src = tmp_path / "src"
    (src / "application" / "equipment_proof").mkdir(parents=True)
    (src / "api").mkdir(parents=True)

    (src / "application" / "equipment_proof" / "proof_pack.py").write_text(
        "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
        "def build():\n    wymagaj_autorytetu((), None)\n"
    )
    (src / "api" / "protection_coordination.py").write_text(
        "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
        "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
        "def run():\n"
        "    wejscie = wejscie_koordynacji_z_biegow(run_id_max=None, run_id_min=None)\n"
        "    wymagaj_autorytetu((), wejscie.proweniencja)\n"
        "    x = CoordinationInput(a=1)\n"
    )
    (src / "api" / "equipment_proof_pack.py").write_text(
        "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
        "def download():\n"
        "    wejscie = wejscie_zwarciowe_z_biegu(run_id=None, punkt_zwarcia='x')\n"
        "    x = EquipmentProofInput(a=1)\n"
    )
    return src


@pytest.fixture
def _guard_na_tmp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Przepina `BACKEND_SRC` guarda na katalog tymczasowy — zwraca funkcję
    budującą i uruchamiającą guard na zadanym drzewie plików."""

    def _uruchom(pliki: dict[str, str]) -> int:
        src = tmp_path / f"src_{len(pliki)}_{hash(frozenset(pliki)) & 0xFFFF}"
        for wzgledna, tresc in pliki.items():
            sciezka = src / wzgledna
            sciezka.parent.mkdir(parents=True, exist_ok=True)
            sciezka.write_text(tresc)
        monkeypatch.setattr(sc_authority_guard, "BACKEND_SRC", src)
        return main()

    return _uruchom


def test_main_zielony_na_poprawnym_drzewie(_guard_na_tmp, capsys: pytest.CaptureFixture) -> None:
    pliki = {
        "application/equipment_proof/proof_pack.py": (
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def build():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/protection_coordination.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n"
            "    wejscie = wejscie_koordynacji_z_biegow(run_id_max=None, run_id_min=None)\n"
            "    wymagaj_autorytetu((), wejscie.proweniencja)\n"
            "    x = CoordinationInput(a=1)\n"
        ),
        "api/equipment_proof_pack.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
            "def download():\n"
            "    wejscie = wejscie_zwarciowe_z_biegu(run_id=None, punkt_zwarcia='x')\n"
            "    x = EquipmentProofInput(a=1)\n"
        ),
    }
    assert _guard_na_tmp(pliki) == 0
    assert "OK [ScAuthorityGuard]" in capsys.readouterr().out


def test_main_czerwony_gdy_bramka_niewywolana(_guard_na_tmp, capsys: pytest.CaptureFixture) -> None:
    """Kontrola 1: `proof_pack.py` IMPORTUJE `wymagaj_autorytetu`, ale go NIE
    WOŁA — dokładnie klasa defektu, którą ten guard ma łapać (deklaracja bez
    egzekwowania)."""
    pliki = {
        "application/equipment_proof/proof_pack.py": (
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def build():\n    pass\n"
        ),
        "api/protection_coordination.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/equipment_proof_pack.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
            "def download():\n    pass\n"
        ),
    }
    assert _guard_na_tmp(pliki) == 1
    wyjscie = capsys.readouterr().out
    assert "BŁĄD [ScAuthorityGuard]" in wyjscie
    assert "proof_pack.py" in wyjscie
    assert "nie wywołuje" in wyjscie


def test_main_czerwony_gdy_trasa_http_nie_czyta_z_biegu(
    _guard_na_tmp, capsys: pytest.CaptureFixture
) -> None:
    """Kontrola 2: trasa HTTP nie importuje mostu — dokładnie obejście karty
    (liczby wprost z żądania, bez związania z biegiem)."""
    pliki = {
        "application/equipment_proof/proof_pack.py": (
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def build():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/protection_coordination.py": (
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/equipment_proof_pack.py": "def download():\n    pass\n",
    }
    assert _guard_na_tmp(pliki) == 1
    wyjscie = capsys.readouterr().out
    assert "equipment_proof_pack.py" in wyjscie
    assert "most" in wyjscie.lower()


def test_main_czerwony_gdy_nowy_konsument_poza_lista(
    _guard_na_tmp, capsys: pytest.CaptureFixture
) -> None:
    """Kontrola 3: NOWY plik konstruuje `EquipmentProofInput` poza zamkniętą
    listą — fail-closed, nie ciche przepuszczenie (klasa błędu z karty)."""
    pliki = {
        "application/equipment_proof/proof_pack.py": (
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def build():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/protection_coordination.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/equipment_proof_pack.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
            "def download():\n    pass\n"
        ),
        "application/rogue/bypass.py": (
            "def skrot(run_id, required_fault_results):\n"
            "    return EquipmentProofInput(run_id=run_id, "
            "required_fault_results=required_fault_results)\n"
        ),
    }
    assert _guard_na_tmp(pliki) == 1
    wyjscie = capsys.readouterr().out
    assert "rogue/bypass.py" in wyjscie
    assert "EquipmentProofInput" in wyjscie
    assert "zamkniętej listy" in wyjscie


def test_main_czerwony_gdy_plik_z_zamknietej_listy_nie_istnieje(
    _guard_na_tmp, capsys: pytest.CaptureFixture
) -> None:
    assert _guard_na_tmp({}) == 1
    wyjscie = capsys.readouterr().out
    assert "nie istnieje" in wyjscie


# ---------------------------------------------------------------------------
# Dowód wpięcia: guard zielony na PRAWDZIWYM backend/src (nie na syntetyce).
# ---------------------------------------------------------------------------


def test_guard_zielony_na_rzeczywistym_drzewie(capsys: pytest.CaptureFixture) -> None:
    """Ten sam guard, BEZ monkeypatch — na rzeczywistym `backend/src` karty S-2.
    Zielony dowodzi, że wpięcie (nie tylko logika guarda) faktycznie działa."""
    assert PLIKI_Z_BRAMKA_AUTORYTETU  # zamknięta lista niepusta
    assert PLIKI_TRASY_HTTP
    assert main() == 0
    assert "OK [ScAuthorityGuard]" in capsys.readouterr().out
