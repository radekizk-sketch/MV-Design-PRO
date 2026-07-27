"""V12K-240: zapadka długu typów jest URUCHAMIANA i faktycznie gryzie.

Guard bez wpisu w workflow jest martwy (precedens V12K-191), a zapadka, która przepuszcza
nowy błąd, jest gorsza niż jej brak — daje fałszywe poczucie bramki. Te testy pilnują obu
rzeczy: wpięcia do CI i tego, że próg rzeczywiście odcina.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
GUARD = ROOT / "scripts" / "mypy_ratchet_guard.py"
WORKFLOW = ROOT.parent / ".github" / "workflows" / "python-tests.yml"


def _zaladuj_guard():
    spec = importlib.util.spec_from_file_location("mypy_ratchet_guard", GUARD)
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def test_guard_istnieje_i_ma_zmierzony_prog() -> None:
    modul = _zaladuj_guard()

    # Próg musi być liczbą ZMIERZONĄ, nie zaokrągloną „na oko" — stąd asercja na
    # konkretną wartość z pomiaru zakładającego zapadkę.
    assert modul.BASELINE_ERRORS == 273
    assert modul.BASELINE_FILES == 67


def test_guard_jest_wpiety_do_workflow_ci() -> None:
    # Bez tego wpisu narzędzie znów byłoby „skonfigurowane i nigdy nie wywołane" —
    # dokładnie stan, który ta karta zamyka.
    tresc = WORKFLOW.read_text(encoding="utf-8")
    assert "mypy_ratchet_guard.py" in tresc


@pytest.mark.parametrize(
    ("bledy", "oczekiwany_kod"),
    [
        (273, 0),  # stan zmierzony — przechodzi
        (274, 1),  # dług urósł o jeden — zapadka odcina
        (300, 1),  # dług urósł znacząco
        (272, 1),  # dług zmalał — zapadka żąda utrwalenia poprawy
        (0, 1),  # wszystko naprawione, ale próg nieobniżony
    ],
)
def test_prog_odcina_w_obie_strony(
    monkeypatch: pytest.MonkeyPatch, bledy: int, oczekiwany_kod: int
) -> None:
    modul = _zaladuj_guard()
    monkeypatch.setattr(
        modul,
        "uruchom_mypy",
        lambda: (bledy, 67, f"Found {bledy} errors in 67 files"),
    )

    assert modul.main() == oczekiwany_kod


def test_brak_podsumowania_mypy_jest_bledem_a_nie_cisza(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Gdyby mypy nie wykonał analizy (np. błąd konfiguracji), zapadka NIE MOŻE przejść —
    # udawałaby wtedy, że czegoś pilnuje.
    modul = _zaladuj_guard()

    def _bez_podsumowania() -> tuple[int, int, str]:
        wyjscie = "mypy: error: Cannot find config file"
        if not modul.WZORZEC_PODSUMOWANIA.search(wyjscie):
            raise SystemExit("mypy_ratchet_guard: nie rozpoznano podsumowania mypy")
        raise AssertionError("nieosiągalne")

    monkeypatch.setattr(modul, "uruchom_mypy", _bez_podsumowania)
    with pytest.raises(SystemExit):
        modul.main()
