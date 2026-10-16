"""Testy własne `bramka_scalenia.py` — wybór testów wpływem zmiany i rdzeń niezmienników.

Reguła KLASA pkt 2 i 4: obietnica „wybór jest nadzbiorem w sensie importów” ma przypięty test
dla KAŻDEJ drogi, którą moduł może załadować kod (iloczyn: droga ładowania × zależność
bezpośrednia / przez moduł pośredni), na syntetycznym drzewie o układzie repozytorium.
Drugą połowę stanowią testy na PRAWDZIWYM drzewie (kryteria karty SZYBKIE-TESTY-DO-SCALENIA):
zmiana liścia `network_model/pochodne` pociąga konsumentów, zmiana testu pociąga sam test,
zmiana samej dokumentacji nie pociąga testów backendu, a rdzeń niezmienników biegnie zawsze.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import bramka_scalenia as bramka
import pytest

# --- drzewo syntetyczne --------------------------------------------------------------------


def _zapisz(korzen: Path, rel: str, tekst: str = "") -> None:
    plik = korzen / rel
    plik.parent.mkdir(parents=True, exist_ok=True)
    plik.write_text(tekst, encoding="utf-8")


@pytest.fixture()
def drzewo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Repozytorium syntetyczne o układzie `mv-design-pro/{backend/{src,tests,scripts},scripts}`."""
    projekt = tmp_path / "mv-design-pro"
    backend = projekt / "backend"
    monkeypatch.setattr(bramka, "REPO", tmp_path)
    monkeypatch.setattr(bramka, "PROJEKT", projekt)
    monkeypatch.setattr(bramka, "BACKEND", backend)
    monkeypatch.setattr(bramka, "SRC", backend / "src")
    monkeypatch.setattr(bramka, "TESTY", backend / "tests")
    monkeypatch.setattr(bramka, "SKRYPTY_BACKENDU", backend / "scripts")
    monkeypatch.setattr(bramka, "SKRYPTY", projekt / "scripts")
    monkeypatch.setattr(
        bramka,
        "DRZEWA_PYTHONA",
        (backend / "src", backend / "tests", backend / "scripts", projekt / "scripts"),
    )
    _zapisz(tmp_path, "mv-design-pro/backend/src/pakiet/__init__.py")
    _zapisz(tmp_path, "mv-design-pro/backend/src/pakiet/lisc.py", "def f():\n    return 1\n")
    _zapisz(tmp_path, "mv-design-pro/backend/src/inny/__init__.py")
    _zapisz(tmp_path, "mv-design-pro/backend/src/inny/obcy.py", "X = 1\n")
    _zapisz(tmp_path, "mv-design-pro/backend/tests/__init__.py")
    _zapisz(tmp_path, "mv-design-pro/backend/tests/test_obcy.py", "from inny.obcy import X\n")
    return tmp_path


#: Droga ładowania → (plik konsumenta, jego treść). Konsument ładuje `pakiet/lisc.py`.
DROGI: dict[str, tuple[str, str]] = {
    "import bezwzględny": ("src/pakiet2/a.py", "import pakiet.lisc\n"),
    "from-import": ("src/pakiet2/a.py", "from pakiet.lisc import f\n"),
    "from pakiet import modul": ("src/pakiet2/a.py", "from pakiet import lisc\n"),
    "import względny": ("src/pakiet/a.py", "from .lisc import f\n"),
    "import względny z pakietu": ("src/pakiet/pod/a.py", "from .. import lisc\n"),
    "import leniwy w funkcji": (
        "src/pakiet2/a.py",
        "def g():\n    from pakiet.lisc import f\n    return f()\n",
    ),
    "import pod TYPE_CHECKING": (
        "src/pakiet2/a.py",
        "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from pakiet.lisc import f\n",
    ),
    "importlib po nazwie": (
        "src/pakiet2/a.py",
        "import importlib\nM = importlib.import_module('pakiet.lisc')\n",
    ),
    "rejestr modul:atrybut": ("src/pakiet2/a.py", "REJESTR = {'x': 'pakiet.lisc:f'}\n"),
    "ładowanie po ścieżce pliku": (
        "src/pakiet2/a.py",
        "from pathlib import Path\nP = Path(__file__).parent / 'pakiet' / 'lisc.py'\n",
    ),
}


def _wybrane(korzen: Path, zmienione: list[str]) -> dict[str, tuple[str, ...]]:
    return bramka.wybierz_testy_backendu(bramka.zbuduj_graf(), zmienione).testy


@pytest.mark.parametrize("droga", sorted(DROGI))
@pytest.mark.parametrize("posrednio", [False, True], ids=["bezposrednio", "przez_modul"])
def test_kazda_droga_ladowania_pociaga_test(drzewo: Path, droga: str, posrednio: bool) -> None:
    """Iloczyn: droga ładowania × test zależny wprost / przez moduł pośredni."""
    rel_konsumenta, tresc = DROGI[droga]
    _zapisz(drzewo, f"mv-design-pro/backend/{rel_konsumenta}", tresc)
    for katalog in Path(rel_konsumenta).parents:
        if katalog.parts and katalog.parts[0] == "src" and len(katalog.parts) > 1:
            _zapisz(drzewo, f"mv-design-pro/backend/{katalog.as_posix()}/__init__.py")
    modul_konsumenta = ".".join(Path(rel_konsumenta).with_suffix("").parts[1:])
    if posrednio:
        _zapisz(drzewo, "mv-design-pro/backend/src/posrednik.py", f"import {modul_konsumenta}\n")
        _zapisz(drzewo, "mv-design-pro/backend/tests/test_x.py", "import posrednik\n")
    else:
        _zapisz(drzewo, "mv-design-pro/backend/tests/test_x.py", f"import {modul_konsumenta}\n")

    wybrane = _wybrane(drzewo, ["mv-design-pro/backend/src/pakiet/lisc.py"])

    assert "mv-design-pro/backend/tests/test_x.py" in wybrane
    assert "mv-design-pro/backend/tests/test_obcy.py" not in wybrane
    assert wybrane["mv-design-pro/backend/tests/test_x.py"][-1] == (
        "zmieniony: mv-design-pro/backend/src/pakiet/lisc.py"
    )


def test_zmiana_init_pakietu_pociaga_import_podmodulu(drzewo: Path) -> None:
    """Import `pakiet.lisc` wykonuje `pakiet/__init__.py` — zmiana `__init__` pociąga test."""
    _zapisz(drzewo, "mv-design-pro/backend/tests/test_x.py", "from pakiet.lisc import f\n")
    wybrane = _wybrane(drzewo, ["mv-design-pro/backend/src/pakiet/__init__.py"])
    assert set(wybrane) == {"mv-design-pro/backend/tests/test_x.py"}


@pytest.mark.parametrize("poziom", ["tests", "tests/pod"])
def test_zmiana_conftest_pociaga_testy_ponizej(drzewo: Path, poziom: str) -> None:
    _zapisz(drzewo, f"mv-design-pro/backend/{poziom}/__init__.py")
    _zapisz(drzewo, f"mv-design-pro/backend/{poziom}/conftest.py", "import pytest\n")
    _zapisz(drzewo, "mv-design-pro/backend/tests/pod/__init__.py")
    _zapisz(drzewo, "mv-design-pro/backend/tests/pod/test_y.py", "def test_y():\n    pass\n")
    wybrane = _wybrane(drzewo, [f"mv-design-pro/backend/{poziom}/conftest.py"])
    assert "mv-design-pro/backend/tests/pod/test_y.py" in wybrane
    assert ("mv-design-pro/backend/tests/test_obcy.py" in wybrane) is (poziom == "tests")


def test_conftest_importujacy_zmieniony_modul_pociaga_testy_katalogu(drzewo: Path) -> None:
    _zapisz(drzewo, "mv-design-pro/backend/tests/conftest.py", "from pakiet.lisc import f\n")
    wybrane = _wybrane(drzewo, ["mv-design-pro/backend/src/pakiet/lisc.py"])
    assert "mv-design-pro/backend/tests/test_obcy.py" in wybrane


def test_usuniety_modul_pociaga_importujacych(drzewo: Path) -> None:
    """Moduł usunięty z dysku: importujący nadal są wybrani (nazwa ze ścieżki, nie z dysku)."""
    _zapisz(drzewo, "mv-design-pro/backend/tests/test_x.py", "from pakiet.skasowany import f\n")
    wybrane = _wybrane(drzewo, ["mv-design-pro/backend/src/pakiet/skasowany.py"])
    assert set(wybrane) == {"mv-design-pro/backend/tests/test_x.py"}


def test_plik_danych_po_nazwie_i_w_katalogu(drzewo: Path) -> None:
    _zapisz(drzewo, "mv-design-pro/backend/src/pakiet/dane/katalog.json", "{}")
    _zapisz(drzewo, "mv-design-pro/backend/src/czytnik.py", "P = 'katalog.json'\n")
    _zapisz(drzewo, "mv-design-pro/backend/tests/test_czytnik.py", "import czytnik\n")
    _zapisz(drzewo, "mv-design-pro/backend/tests/test_lisc.py", "import pakiet.lisc\n")
    wybrane = _wybrane(drzewo, ["mv-design-pro/backend/src/pakiet/dane/katalog.json"])
    # po nazwie pliku (czytnik.py) i przez katalog nadrzędny pliku danych (pakiet/lisc.py)
    assert {
        "mv-design-pro/backend/tests/test_czytnik.py",
        "mv-design-pro/backend/tests/test_lisc.py",
    } <= set(wybrane)
    assert "mv-design-pro/backend/tests/test_obcy.py" not in wybrane


def test_nazwa_pliku_danych_nie_dopasowuje_dluzszej_nazwy(drzewo: Path) -> None:
    _zapisz(drzewo, "mv-design-pro/backend/tests/test_x.py", "P = 'stary_katalog.json'\n")
    wybrane = _wybrane(drzewo, ["mv-design-pro/docs/katalog.json"])
    assert wybrane == {}


@pytest.mark.parametrize("wyzwalacz", sorted(bramka.WYZWALACZE_PELNEGO_BACKENDU))
def test_wyzwalacz_pelnego_biegu_wybiera_komplet(drzewo: Path, wyzwalacz: str) -> None:
    wybor = bramka.wybierz_testy_backendu(bramka.zbuduj_graf(), [wyzwalacz])
    assert wybor.pelny_bieg is not None
    assert "mv-design-pro/backend/tests/test_obcy.py" in wybor.testy


def _git(korzen: Path, *argumenty: str) -> None:
    subprocess.run(
        ["git", "-C", str(korzen), "-c", "user.name=t", "-c", "user.email=t@t", *argumenty],
        check=True,
        capture_output=True,
    )


def test_zmienione_pliki_drzewa_roboczego_i_miedzy_commitami(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Bez `--glowa`: zmiany śledzone (także usunięcia) i pliki nieśledzone; z `--glowa`:
    diff dwóch commitów; głowa spoza historii HEAD jest błędem (graf jest z drzewa roboczego)."""
    monkeypatch.setattr(bramka, "REPO", tmp_path)
    _git(tmp_path, "init", "-q")
    _zapisz(tmp_path, "a.py", "A = 1\n")
    _zapisz(tmp_path, "b.py", "B = 1\n")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-q", "-m", "baza")
    _zapisz(tmp_path, "a.py", "A = 2\n")
    _git(tmp_path, "commit", "-q", "-am", "glowa")
    (tmp_path / "b.py").unlink()
    _zapisz(tmp_path, "nowy.py", "N = 1\n")

    assert bramka.zmienione_pliki("HEAD~1", None) == ["a.py", "b.py", "nowy.py"]
    assert bramka.zmienione_pliki("HEAD~1", "HEAD") == ["a.py"]
    # głowa będąca przodkiem HEAD (zmiana karty oceniana na drzewie scalonym) — dozwolona
    assert bramka.zmienione_pliki("HEAD~1", "HEAD~1") == []
    # głowa spoza historii HEAD — błąd
    _git(tmp_path, "checkout", "-q", "-b", "obca", "HEAD~1")
    _zapisz(tmp_path, "obcy.py", "O = 1\n")
    _git(tmp_path, "add", "obcy.py")
    _git(tmp_path, "commit", "-q", "-m", "obca")
    _git(tmp_path, "checkout", "-q", "-")
    with pytest.raises(SystemExit, match="nie jest HEAD ani przodkiem"):
        bramka.zmienione_pliki("HEAD~1", "obca")


# --- prawdziwe drzewo repozytorium ---------------------------------------------------------


@pytest.fixture(scope="module")
def graf() -> bramka.Graf:
    return bramka.zbuduj_graf()


def _testy_importujace(graf: bramka.Graf, wzorzec: str) -> set[str]:
    """Wyrocznia niezależna od grafu bramki: testy, których TEKST importuje moduł wzorca."""
    regex = re.compile(rf"^\s*(?:from|import)\s+{wzorzec}\b", re.MULTILINE)
    return {
        rel for rel, tekst in graf.zrodla.items() if bramka._czy_test(rel) and regex.search(tekst)
    }


def test_zmiana_liscia_pochodnych_pociaga_konsumentow(graf: bramka.Graf) -> None:
    zmieniony = "mv-design-pro/backend/src/network_model/pochodne/wielkosci_pochodne.py"
    wybrane = bramka.wybierz_testy_backendu(graf, [zmieniony]).testy

    bezposredni = _testy_importujace(graf, r"network_model\.pochodne")
    assert bezposredni, "wyrocznia pusta — test przestał cokolwiek sprawdzać"
    assert bezposredni <= set(wybrane)
    # konsument POŚREDNI: test gałęzi importuje `network_model.core.branch`, który liczy
    # wielkości pochodne liścia — łańcuch uzasadnienia przechodzi przez branch.py
    lancuch = wybrane["mv-design-pro/backend/tests/test_branch.py"]
    assert "mv-design-pro/backend/src/network_model/core/branch.py" in lancuch
    assert lancuch[-1] == f"zmieniony: {zmieniony}"


def test_zmiana_testu_pociaga_sam_test(graf: bramka.Graf) -> None:
    zmieniony = "mv-design-pro/backend/tests/test_branch.py"
    wybrane = bramka.wybierz_testy_backendu(graf, [zmieniony]).testy
    assert set(wybrane) == {zmieniony}
    assert wybrane[zmieniony] == (zmieniony, f"zmieniony: {zmieniony}")


def test_zmiana_dokumentacji_bez_testow_backendu_rdzen_zawsze(graf: bramka.Graf) -> None:
    zmieniony = "mv-design-pro/docs/plan/DOKUMENT_BEZ_ODWOLAN_W_TESTACH_BRAMKI.md"
    wybor = bramka.wybierz_testy_backendu(graf, [zmieniony])
    assert wybor.testy == {}
    assert wybor.pelny_bieg is None

    rdzen = bramka.rdzen_niezmiennikow(graf)
    plan = bramka.plan_backendu(wybor, rdzen)
    assert plan == sorted(rdzen)
    for wymagany in (
        "mv-design-pro/backend/tests/test_result_contract_v1.py",
        "mv-design-pro/backend/tests/api/test_openapi_snapshot.py",
        "mv-design-pro/backend/tests/test_p20a_power_flow_determinism.py",
        "mv-design-pro/backend/tests/golden/test_golden_network_sn.py",
        "mv-design-pro/backend/tests/invariants/test_scenariusz_i_bieg.py",
    ):
        assert wymagany in rdzen, wymagany


def test_rdzen_wylacznie_z_regul(graf: bramka.Graf) -> None:
    """Każdy plik rdzenia ma regułę; każdy test spełniający regułę jest w rdzeniu."""
    rdzen = bramka.rdzen_niezmiennikow(graf)
    for rel, tekst in graf.zrodla.items():
        if not bramka._czy_test(rel):
            continue
        czesci = Path(rel).relative_to("mv-design-pro/backend/tests").parts
        oczekiwany = (
            czesci[0] in bramka.KATALOGI_RDZENIA
            or bool(bramka.WZORZEC_NAZWY_RDZENIA.search(Path(rel).name))
            or bool(bramka.MARKER_RDZENIA.search(tekst))
        )
        assert (rel in rdzen) is oczekiwany, rel


def test_plan_backendu_to_suma_wyboru_i_rdzenia() -> None:
    wybor = bramka.Wybor(testy={"b": ("b", "x"), "a": ("a", "x")}, pelny_bieg=None)
    assert bramka.plan_backendu(wybor, {"c": "r", "a": "r"}) == ["a", "b", "c"]


# --- wybór vitest (pomocnik na grafie modułów samego vitest) ------------------------------


#: Iloczyn: plik testu kroku głównego / kroku budżetów czasu (`vite.config.ts`) × tryb wyboru.
#: Plik budżetu jest wybierany WYŁĄCZNIE w swoim kroku — bramka woła pomocnika dla obu.
@pytest.mark.parametrize(
    ("zmieniony", "tryb", "wybrany"),
    [
        ("src/ui2/proces/__tests__/etapy.test.ts", "test", True),
        ("src/ui2/proces/__tests__/etapy.test.ts", "budzety", False),
        ("src/test/__tests__/pulaTestow.test.ts", "test", False),
        ("src/test/__tests__/pulaTestow.test.ts", "budzety", True),
    ],
)
def test_wybor_vitest_zmiana_testu_w_swoim_kroku(
    tmp_path: Path, zmieniony: str, tryb: str, wybrany: bool
) -> None:
    dane = bramka.wybierz_testy_frontu(
        [f"mv-design-pro/frontend/{zmieniony}"], tmp_path / "wybor.json", tryb
    )
    assert dane is not None
    assert dane["pelny_bieg"] is None
    assert dane["testy"] == (
        {str(bramka.FRONTEND / zmieniony): [str(bramka.FRONTEND / zmieniony)]} if wybrany else {}
    )


def test_wybor_vitest_zmiana_setup_files_wybiera_komplet(tmp_path: Path) -> None:
    """`setupFiles` leży poza grafem importów testu (luka `vitest related`) — komplet z przyczyną."""
    assert bramka.POMOCNIK_VITEST.is_file()
    dane = bramka.wybierz_testy_frontu(
        ["mv-design-pro/frontend/src/test/setup.ts"], tmp_path / "wybor.json", "test"
    )
    assert dane is not None
    assert "setupFiles" in str(dane["pelny_bieg"])
    testy = dane["testy"]
    assert isinstance(testy, dict)
    assert len(testy) == dane["wszystkich"]


def test_wybor_vitest_bez_zmian_frontu(tmp_path: Path) -> None:
    assert (
        bramka.wybierz_testy_frontu(["mv-design-pro/docs/x.md"], tmp_path / "w.json", "test")
        is None
    )
