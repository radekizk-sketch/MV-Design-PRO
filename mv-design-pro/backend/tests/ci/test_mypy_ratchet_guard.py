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
    # konkretną wartość z pomiaru. K7-A (2026-07-29): naprawa 15 błędów typów
    # u źródła w dotkniętych rendererach PDF ⇒ pomiar 273/67 → 258/65.
    # K14 (2026-07-30): jawne typy wejścia projekcji rozpływu gałęziowego ⇒ 258 → 254.
    # KD-12 (2026-08-01): zdjęcie długu u źródła w warstwach API / persystencji /
    # analiz / katalogu / operacji domenowych ⇒ pomiar 254/65 → 24/15.
    # KARTA D / D6 (2026-08-01): kryterium dopuszczalności pozycji zaczepu jest teraz
    # daną wyniku, a nie zaszytym progiem — zniknęła kolizja nazwy `feasible`
    # (raz `bool`, raz lista) w `power_flow_oltc_studies` ⇒ pomiar 24/15 → 22/14.
    # TOR U2 (2026-08-02): brama przypisania katalogu zastąpiła DWA równoległe bloki
    # materializacji w `assign_catalog_to_element` jednym wywołaniem — zniknęła
    # kolizja nazw `binding_payload`/`materialized_params` ⇒ pomiar 22/14 → 20/14.
    #
    # To JEDYNE miejsce, w którym zmierzona liczba jest powtórzona poza samym guardem.
    # Test „odcina w obie strony" poniżej wyprowadza ją z modułu, więc obniżenie progu
    # wymaga świadomej zmiany dokładnie tutaj (i nigdzie indziej).
    assert modul.BASELINE_ERRORS == 20
    assert modul.BASELINE_FILES == 14


def test_guard_jest_wpiety_do_workflow_ci() -> None:
    # Bez tego wpisu narzędzie znów byłoby „skonfigurowane i nigdy nie wywołane" —
    # dokładnie stan, który ta karta zamyka.
    tresc = WORKFLOW.read_text(encoding="utf-8")
    assert "mypy_ratchet_guard.py" in tresc


@pytest.mark.parametrize(
    ("odchylka", "oczekiwany_kod"),
    [
        (0, 0),  # stan zmierzony — przechodzi
        (+1, 1),  # dług urósł o jeden — zapadka odcina
        (+46, 1),  # dług urósł znacząco
        (-1, 1),  # dług zmalał — zapadka żąda utrwalenia poprawy
        (-1000, 1),  # wszystko naprawione, ale próg nieobniżony
    ],
)
def test_prog_odcina_w_obie_strony(
    monkeypatch: pytest.MonkeyPatch, odchylka: int, oczekiwany_kod: int
) -> None:
    # Odchyłkę liczymy WZGLĘDEM progu z guarda, a nie od przepisanej tu liczby: badana
    # własność to „odcina w obie strony", nie konkretna wartość pomiaru (ta jest
    # przypięta w teście powyżej). Dzięki temu obniżenie progu nie wymusza edycji
    # w dwóch miejscach — a sam pomiar nadal nie może przesunąć się po cichu.
    modul = _zaladuj_guard()
    bledy = max(0, modul.BASELINE_ERRORS + odchylka)
    monkeypatch.setattr(
        modul,
        "uruchom_mypy",
        lambda: (bledy, modul.BASELINE_FILES, f"Found {bledy} errors in 1 file"),
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
