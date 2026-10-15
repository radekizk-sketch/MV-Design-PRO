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
    BRAMKA_AUTORYTETU_NAZWY,
    KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ,
    MODUL_BRAMKI_AUTORYTETU,
    MODUL_MOSTU_AUTORYTETU,
    MOST_AUTORYTETU_NAZWY,
    PLIKI_Z_BRAMKA_AUTORYTETU,
    PLIKI_Z_MOSTEM_BIEGU,
    _konstruowane_typy,
    _wywoluje_z_modulu,
    main,
)


def _ast(kod: str) -> ast.Module:
    return ast.parse(kod)


def _bramka(kod: str, pakiet: str = "application.equipment_proof") -> bool:
    return _wywoluje_z_modulu(_ast(kod), pakiet, MODUL_BRAMKI_AUTORYTETU, BRAMKA_AUTORYTETU_NAZWY)


def _most(kod: str, pakiet: str = "api") -> bool:
    return _wywoluje_z_modulu(_ast(kod), pakiet, MODUL_MOSTU_AUTORYTETU, MOST_AUTORYTETU_NAZWY)


# ---------------------------------------------------------------------------
# Kontrole 1 i 2: `_wywoluje_z_modulu` — WYWOŁANIE funkcji z WŁAŚCIWEGO modułu.
# Iloczyn: {import nazwy, import nazwy z aliasem, import modułu z aliasem, import modułu
# bez aliasu, nazwa modułu z pakietu, import względny} × {wywołanie, sam import} oraz
# drogi fałszywe: ta sama nazwa z innego modułu, atrapa w pliku, komentarz, napis.
# ---------------------------------------------------------------------------

_IMPORT_BRAMKI = "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"


@pytest.mark.parametrize(
    "kod",
    [
        _IMPORT_BRAMKI + "wymagaj_autorytetu((), None)\n",
        "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu as w\n"
        "w((), None)\n",
        "import network_model.core.autorytet_wyniku_zwarciowego as a\na.wymagaj_autorytetu((), None)\n",
        "import network_model.core.autorytet_wyniku_zwarciowego\n"
        "network_model.core.autorytet_wyniku_zwarciowego.wymagaj_autorytetu((), None)\n",
        "from network_model.core import autorytet_wyniku_zwarciowego as a\n"
        "a.wymagaj_autorytetu((), None)\n",
    ],
)
def test_bramka_wywolana_z_wlasciwego_modulu(kod: str) -> None:
    assert _bramka(kod) is True


def test_bramka_wywolana_przez_import_wzgledny_w_tym_samym_pakiecie() -> None:
    kod = "from .autorytet_wyniku_zwarciowego import wymagaj_autorytetu\nwymagaj_autorytetu(())\n"
    assert _bramka(kod, pakiet="network_model.core") is True
    kod2 = "from . import autorytet_wyniku_zwarciowego as a\na.wymagaj_autorytetu(())\n"
    assert _bramka(kod2, pakiet="network_model.core") is True


@pytest.mark.parametrize(
    "kod",
    [
        _IMPORT_BRAMKI,  # sam import, bez wywołania
        "from x import wymagaj_autorytetu\nwymagaj_autorytetu((), None)\n",  # inny moduł
        "def wymagaj_autorytetu(*a):\n    pass\nwymagaj_autorytetu((), None)\n",  # atrapa
        "import x\nx.wymagaj_autorytetu((), None)\n",  # atrybut innego modułu
        "# wywoluje wymagaj_autorytetu\n"
        "def f():\n"
        '    """Ten kod wola wymagaj_autorytetu."""\n'
        "    return 1\n",
        'x = "wymagaj_autorytetu"\n',
        "from .autorytet_wyniku_zwarciowego import wymagaj_autorytetu\nwymagaj_autorytetu(())\n",
    ],
    ids=[
        "sam-import",
        "inny-modul",
        "atrapa-w-pliku",
        "atrybut-innego-modulu",
        "komentarz-docstring",
        "napis",
        "wzgledny-z-innego-pakietu",
    ],
)
def test_bramka_niewywolana_albo_z_innego_zrodla(kod: str) -> None:
    assert _bramka(kod) is False


def test_import_ponad_korzen_nie_wiaze_nazwy() -> None:
    kod = "from .... import autorytet_wyniku_zwarciowego as a\na.wymagaj_autorytetu(())\n"
    assert _bramka(kod, pakiet="api") is False


@pytest.mark.parametrize("nazwa", sorted(MOST_AUTORYTETU_NAZWY))
def test_most_wywolany_z_modulu_mostu(nazwa: str) -> None:
    assert _most(f"from application.autorytet_biegu_zwarciowego import {nazwa}\n{nazwa}(1)\n")
    assert _most(f"import application.autorytet_biegu_zwarciowego as m\nm.{nazwa}(1)\n")
    assert _most(f"from application import autorytet_biegu_zwarciowego as m\nm.{nazwa}(1)\n")


@pytest.mark.parametrize("nazwa", sorted(MOST_AUTORYTETU_NAZWY))
def test_most_sam_import_albo_z_innego_modulu_nie_wystarcza(nazwa: str) -> None:
    assert not _most(f"from application.autorytet_biegu_zwarciowego import {nazwa}\n")
    assert not _most(f"from application.atrapa import {nazwa}\n{nazwa}(1)\n")
    assert not _most(f"import application.autorytet_biegu_zwarciowego as {nazwa}\n")


def test_most_brak_importu() -> None:
    assert _most("x = 1\n") is False


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


def test_lista_plikow_z_mostem_i_konstruktorow_to_ten_sam_zbior() -> None:
    """`KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ` MUSI być dokładnie tym samym
    zbiorem co `PLIKI_Z_MOSTEM_BIEGU` — dwie niezależne listy tych samych plików są
    defektem czekającym na dane brzegowe (reguła KLASA NIE INSTANCJA)."""
    assert KONSTRUKTORZY_WEJSCIA_ZDOLNOSCI_ZALEZNEJ == frozenset(PLIKI_Z_MOSTEM_BIEGU)


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
    (src / "application" / "analyses" / "protection" / "coordination").mkdir(parents=True)
    (src / "application" / "analyses" / "protection" / "coordination" / "z_biegow.py").write_text(
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
        "application/analyses/protection/coordination/z_biegow.py": (
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
        "application/analyses/protection/coordination/z_biegow.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/equipment_proof_pack.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
            "def download():\n    wejscie_zwarciowe_z_biegu(run_id=None, punkt_zwarcia='x')\n"
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
        "application/analyses/protection/coordination/z_biegow.py": (
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/equipment_proof_pack.py": "def download():\n    pass\n",
    }
    assert _guard_na_tmp(pliki) == 1
    wyjscie = capsys.readouterr().out
    assert "equipment_proof_pack.py" in wyjscie
    assert "most" in wyjscie.lower()


def _drzewo_poprawne() -> dict[str, str]:
    return {
        "application/equipment_proof/proof_pack.py": (
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def build():\n    wymagaj_autorytetu((), None)\n"
        ),
        "application/analyses/protection/coordination/z_biegow.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n"
            "    wejscie = wejscie_koordynacji_z_biegow(run_id_max=None, run_id_min=None)\n"
            "    wymagaj_autorytetu((), wejscie.proweniencja)\n"
        ),
        "api/equipment_proof_pack.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
            "def download():\n    wejscie_zwarciowe_z_biegu(run_id=None, punkt_zwarcia='x')\n"
        ),
    }


def test_main_czerwony_gdy_bramka_to_atrapa_w_pliku(
    _guard_na_tmp, capsys: pytest.CaptureFixture
) -> None:
    """Kontrola 1: plik z listy definiuje WŁASNĄ funkcję o nazwie bramki i ją woła —
    wywołanie istnieje, ale nie przechodzi przez `wymagaj_autorytetu` z modułu autorytetu
    (do 2026-09-30 to spełniało warunek)."""
    pliki = _drzewo_poprawne()
    pliki["application/equipment_proof/proof_pack.py"] = (
        "def wymagaj_autorytetu(*a):\n    pass\n" "def build():\n    wymagaj_autorytetu((), None)\n"
    )
    assert _guard_na_tmp(pliki) == 1
    wyjscie = capsys.readouterr().out
    assert "proof_pack.py: nie wywołuje `wymagaj_autorytetu`" in wyjscie


def test_main_czerwony_gdy_trasa_importuje_most_bez_wywolania(
    _guard_na_tmp, capsys: pytest.CaptureFixture
) -> None:
    """Kontrola 2: import mostu bez wywołania nie jest dowodem czytania z biegu (do
    2026-09-30 sam import spełniał warunek — także import nazwy z dowolnego modułu)."""
    pliki = _drzewo_poprawne()
    pliki["api/equipment_proof_pack.py"] = (
        "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
        "def download():\n    pass\n"
    )
    assert _guard_na_tmp(pliki) == 1
    assert "api/equipment_proof_pack.py: nie wywołuje mostu" in capsys.readouterr().out


def test_main_zielony_z_mostem_przez_modul_z_pakietu(
    _guard_na_tmp, capsys: pytest.CaptureFixture
) -> None:
    """Para: most wywołany przez moduł sprowadzony z pakietu (`from application import
    autorytet_biegu_zwarciowego as most`) — ta sama droga co import nazwy."""
    pliki = _drzewo_poprawne()
    pliki["api/equipment_proof_pack.py"] = (
        "from application import autorytet_biegu_zwarciowego as most\n"
        "def download():\n    most.wejscie_zwarciowe_z_biegu(run_id=None, punkt_zwarcia='x')\n"
    )
    assert _guard_na_tmp(pliki) == 0, capsys.readouterr().out


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
        "application/analyses/protection/coordination/z_biegow.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
            "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
            "def run():\n    wymagaj_autorytetu((), None)\n"
        ),
        "api/equipment_proof_pack.py": (
            "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
            "def download():\n    wejscie_zwarciowe_z_biegu(run_id=None, punkt_zwarcia='x')\n"
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
    assert PLIKI_Z_MOSTEM_BIEGU
    assert main() == 0
    assert "OK [ScAuthorityGuard]" in capsys.readouterr().out
