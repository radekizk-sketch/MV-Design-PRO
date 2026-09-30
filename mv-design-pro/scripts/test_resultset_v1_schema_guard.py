"""Self-test ResultSetContractGuard (karta RESULTSET-MARTWE-MAPPERY, 2026-09-30).

Czerwień na próbie przywrócenia KAŻDEGO z czterech skasowanych plików oraz na
definicji zakazanej nazwy pod inną ścieżką — przez `main()` na KOPII realnego
`backend/src` (zapis w drzewie repo w autotestach zakazuje `scripts/conftest.py`).
Zieleń na realnym drzewie. Lista chroniona = realny kontrakt, nie martwe adaptery.

Uruchomienie (z `mv-design-pro`): `pytest scripts/test_resultset_v1_schema_guard.py`.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import resultset_v1_schema_guard as guard  # noqa: E402
from guard_diff_base import WynikBazy  # noqa: E402


@pytest.fixture(scope="module")
def kopia_src(tmp_path_factory: pytest.TempPathFactory) -> Path:
    cel = tmp_path_factory.mktemp("resultset_guard") / "src"
    shutil.copytree(guard.BACKEND_SRC_DIR, cel, ignore=shutil.ignore_patterns("__pycache__"))
    return cel


@pytest.fixture
def bez_zmian(monkeypatch: pytest.MonkeyPatch) -> None:
    """Delta gałęzi pusta — bramka wskrzeszenia oceniana w izolacji od bramki zmian."""
    monkeypatch.setattr(guard, "zmienione_pliki", lambda: WynikBazy(pliki=(), baza="test"))


def test_realne_drzewo_zielone() -> None:
    assert guard.check_resultset_dead_mappers_resurrection() == []


def test_main_zielony_na_kopii_realnego_drzewa(
    kopia_src: Path, bez_zmian: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(guard, "BACKEND_SRC_DIR", kopia_src)
    assert guard.main() == 0


@pytest.mark.parametrize("rel", sorted(guard.DEAD_RESULTSET_RELATIVE_PATHS))
def test_main_czerwony_na_przywroceniu_pliku(
    rel: str,
    kopia_src: Path,
    bez_zmian: None,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    plik = kopia_src / rel
    plik.write_text('"""Przywrócony martwy moduł."""\n', encoding="utf-8")
    try:
        monkeypatch.setattr(guard, "BACKEND_SRC_DIR", kopia_src)
        assert guard.main() == 1
        assert f"[resurrected-module] backend/src/{rel}" in capsys.readouterr().out
    finally:
        plik.unlink()


@pytest.mark.parametrize("nazwa", sorted(guard.FORBIDDEN_DEAD_RESULTSET_NAMES))
@pytest.mark.parametrize("forma", ["def", "class", "przypisanie"])
def test_czerwony_na_definicji_pod_inna_sciezka(nazwa: str, forma: str, tmp_path: Path) -> None:
    # Skan definicji na małym drzewie (pełna kopia `src` niczego tu nie dodaje — zieleń
    # realnego drzewa przypina `test_realne_drzewo_zielone`).
    kod = {
        "def": f"def {nazwa}():\n    return None\n",
        "class": f"class {nazwa}:\n    pass\n",
        "przypisanie": f"{nazwa} = object()\n",
    }[forma]
    plik = tmp_path / "application" / "result_mapping" / "przeniesiony_mapper.py"
    plik.parent.mkdir(parents=True)
    plik.write_text(kod, encoding="utf-8")
    naruszenia = guard.check_resultset_dead_mappers_resurrection(tmp_path)
    assert len(naruszenia) == 1
    assert nazwa in naruszenia[0]


def test_pusty_skan_nie_jest_sukcesem(tmp_path: Path) -> None:
    assert guard.check_resultset_dead_mappers_resurrection(tmp_path / "brak")


def test_zmiana_pliku_chronionego_bez_sankcji_czerwona() -> None:
    naruszenia, sankcje = guard.check_protected_changes(
        ["mv-design-pro/backend/src/domain/result_contract_v1.py"]
    )
    assert naruszenia and not sankcje


def test_zmiana_pliku_usankcjonowanego_przechodzi_z_powodem() -> None:
    naruszenia, sankcje = guard.check_protected_changes(
        ["mv-design-pro/backend/src/domain/result_builder_v1.py"]
    )
    assert not naruszenia
    assert sankcje and "V12S-011" in sankcje[0][1]


def test_lista_chroniona_to_realny_kontrakt_istniejacy_na_dysku() -> None:
    root = guard.ROOT
    for sciezka in guard.PROTECTED_FILES:
        assert (root / sciezka).is_file(), sciezka
    for sciezka in guard.SANCTIONED_CHANGES:
        assert sciezka in guard.PROTECTED_FILES, sciezka
    for rel in guard.DEAD_RESULTSET_RELATIVE_PATHS:
        assert not any(rel in p for p in guard.PROTECTED_FILES)


def test_main_czerwony_gdy_delta_zmienia_kontrakt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        guard,
        "zmienione_pliki",
        lambda: WynikBazy(
            pliki=("mv-design-pro/backend/schemas/resultset_v1_schema.json",), baza="t"
        ),
    )
    assert guard.main() == 1
