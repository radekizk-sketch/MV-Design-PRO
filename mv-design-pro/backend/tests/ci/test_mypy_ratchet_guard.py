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
    # POMIAR-ODG-TYPY (2026-08-07): zapadka zapaliła się w CI (21/14) po karcie
    # POMIAR-ODG — naprawiona CAŁA klasa wzorca `float(Any | None)` maskowanego
    # przez `try/except TypeError` w `station_templates/apply.py` (trzy wystąpienia)
    # ⇒ pomiar 21/14 → 18/13.
    # XLSX-IMPORT (2026-08-07): przepisany importer XLSX usunął dynamiczny atrybut
    # `node.source_impedance` z `# type: ignore[attr-defined]` — dług typów zmalał
    # razem z defektem (fizyka w warstwie aplikacji zapisywana poza kontraktem `Node`)
    # ⇒ pomiar 18/13 → 17/12.
    # UTRWALENIE POPRAWY (2026-08-13, `b368467e`): guard obniżył próg do 16/11, ale
    # TEN wiersz został przy 17/12 — czyli dokładnie to, przed czym ostrzega zdanie
    # niżej: liczba powtórzona poza guardem rozjechała się z guardem i zapadka
    # zgłaszała czerwony test zamiast pilnować długu ⇒ wyrównanie do 16/11;
    # 2026-08-14: naprawa arg-type w domain_operations (odbior S5) ⇒ 15/10.
    #
    # To JEDYNE miejsce, w którym zmierzona liczba jest powtórzona poza samym guardem.
    # Test „odcina w obie strony" poniżej wyprowadza ją z modułu, więc obniżenie progu
    # wymaga świadomej zmiany dokładnie tutaj (i nigdzie indziej).
    # 2026-08-14 (karta K-Q): naprawa dwoch bledow assignment w
    # solver_input/audit2_solver_adjuster.py (jedna zmienna, dwa typy) ⇒ 13/9.
    # 2026-09-01 (przejecie po B-02): pomiar na kompletnym venv 0/0 — guard
    # zazadal utrwalenia; para prog<->metatest zmieniona RAZEM.
    assert modul.BASELINE_ERRORS == 0
    assert modul.BASELINE_FILES == 0


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


def _podstaw_wyjscie_mypy(modul, monkeypatch: pytest.MonkeyPatch, wyjscie: str) -> None:
    """Podstaw WYJŚCIE procesu mypy, nie wynik `uruchom_mypy`.

    Test, który zaślepia `uruchom_mypy`, nie ćwiczy rozpoznawania podsumowania —
    czyli dokładnie tej części, która decyduje, czy pomiar w ogóle powstał.
    Dlatego zaślepiamy granicę procesu (`subprocess.run`) i zostawiamy guardowi
    całą jego pracę.
    """

    class _Wynik:
        stdout = wyjscie
        stderr = ""

    monkeypatch.setattr(modul.subprocess, "run", lambda *a, **k: _Wynik())


def test_brak_podsumowania_mypy_jest_bledem_a_nie_cisza(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Gdyby mypy nie wykonał analizy (np. błąd konfiguracji), zapadka NIE MOŻE przejść —
    # udawałaby wtedy, że czegoś pilnuje.
    modul = _zaladuj_guard()
    _podstaw_wyjscie_mypy(modul, monkeypatch, "mypy: error: Cannot find config file")

    with pytest.raises(SystemExit):
        modul.main()


def test_przerwana_analiza_nie_jest_pomiarem_mimo_podsumowania(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Podsumowanie przerwanego biegu NIE jest pomiarem długu.

    Gdy w środowisku brakuje zależności projektu, mypy przerywa na wtyczce
    z `pyproject.toml` i drukuje `Found 1 error in 1 file (errors prevented
    further checking)`. Zapadka czytała to jako spadek długu 20 → 1 i — w trybie
    „dług zmalał" — prosiła o TRWAŁE obniżenie progu, czyli o własne rozbrojenie.
    """
    modul = _zaladuj_guard()
    _podstaw_wyjscie_mypy(
        modul,
        monkeypatch,
        'pyproject.toml:1: error: Error importing plugin "pydantic.mypy": '
        "No module named 'pydantic'  [misc]\n"
        "Found 1 error in 1 file (errors prevented further checking)\n",
    )

    with pytest.raises(SystemExit, match="PRZERWAL analize"):
        modul.main()


def test_garstka_sprawdzonych_plikow_nie_jest_pomiarem(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bieg po kilku plikach (zły katalog, obcięta konfiguracja) też nie mierzy długu."""
    modul = _zaladuj_guard()
    _podstaw_wyjscie_mypy(modul, monkeypatch, "Found 2 errors in 1 file (checked 3 source files)\n")

    with pytest.raises(SystemExit, match="niewiarygodny"):
        modul.main()


def test_pelna_analiza_jest_pomiarem_i_przechodzi_na_progu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bieg z liczbą sprawdzonych plików to jedyny kształt uznawany za pomiar."""
    modul = _zaladuj_guard()
    _podstaw_wyjscie_mypy(
        modul,
        monkeypatch,
        f"Found {modul.BASELINE_ERRORS} errors in {modul.BASELINE_FILES} files "
        "(checked 741 source files)\n",
    )

    assert modul.uruchom_mypy()[:2] == (modul.BASELINE_ERRORS, modul.BASELINE_FILES)
    assert modul.main() == 0
