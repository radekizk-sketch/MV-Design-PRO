"""Pin izolacji magazynow plikowych suity pytest od drzewa repo.

Deklaracja z ``tests/conftest.py`` (relokacja ``ENM_STORE_DIR``
i ``STATION_USER_TEMPLATES_DIR`` poza repo na czas sesji) bez testu bylaby
falszywa pewnoscia: kazdy magazyn rozwiazywany do katalogu WEWNATRZ repo jest
wspoldzielony z zywym serwerem uruchomionym obok (zmierzona kolizja 2026-08-13:
``reset_enm_store()`` testow skasowal plik roboczy ``*.tmp`` rownolegle
biegnacego backendu e2e -> ``FileNotFoundError`` w ``dziennik_zmian.zatwierdz``
-> HTTP ``template.persist_failed``).

KLASA, NIE INSTANCJA: pin obejmuje WSZYSTKIE trzy magazyny katalogowe
rozwiazywane przez ``os.getenv`` z domyslna sciezka w repo (model ENM, dziennik
zmian, szablony uzytkownika). Baza przebiegow kanonicznych (``DATABASE_URL``)
ma wlasna izolacje per-test (V12K-267) i wlasne testy.
"""

from __future__ import annotations

from pathlib import Path

from application.station_templates import user_store
from enm import dziennik_zmian, store

_KORZEN_REPO = Path(__file__).resolve().parents[3]


def _poza_repo(katalog: Path) -> bool:
    return not katalog.resolve().is_relative_to(_KORZEN_REPO)


def test_magazyn_modelu_enm_poza_drzewem_repo() -> None:
    assert _poza_repo(store._store_dir()), (
        f"Magazyn modelu ENM ({store._store_dir()}) lezy w drzewie repo — "
        "testy dzielilyby pliki z zywym serwerem uruchomionym z tego katalogu."
    )


def test_magazyn_dziennika_zmian_poza_drzewem_repo() -> None:
    assert _poza_repo(
        dziennik_zmian._store_dir()
    ), f"Magazyn dziennika zmian ({dziennik_zmian._store_dir()}) lezy w drzewie repo."


def test_magazyn_szablonow_uzytkownika_poza_drzewem_repo() -> None:
    assert _poza_repo(
        user_store._store_dir()
    ), f"Magazyn szablonow uzytkownika ({user_store._store_dir()}) lezy w drzewie repo."


def test_oba_magazyny_enm_wskazuja_ten_sam_katalog() -> None:
    # Dziennik jest zapisem towarzyszacym modelu i MUSI dzielic jego lokalizacje
    # (kontrakt z ``dziennik_zmian._store_dir``); relokacja nie moze ich rozdzielic.
    assert store._store_dir() == dziennik_zmian._store_dir()
