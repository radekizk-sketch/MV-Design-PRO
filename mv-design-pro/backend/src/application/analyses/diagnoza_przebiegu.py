"""
Diagnoza przebiegu — interpretacja ISTNIEJĄCYCH artefaktów biegu (D7).

Warstwa aplikacyjna: ZERO fizyki, ZERO ponownego liczenia. Moduł wyłącznie
CZYTA to, co solver już opublikował w artefakcie biegu, i składa z tego zwięzły
kontrakt odczytowy dla powierzchni „Diagnoza przebiegu".

Skąd pochodzi każda wartość (pomiar kontraktu, nie domysł):
- `run.status` / `run.error_message` — rekord biegu (`CanonicalRun`), status
  mapowany na słownik wykonawczy identycznie jak `to_execution_dict`
  (`enm/canonical_analysis.py:285-302`), żeby UI widziało JEDEN słownik statusów.
- `converged`, `iterations_count`, `tolerance_used`, `unsolved_node_ids` —
  `raw_result.result_v1` (kontrakt FROZEN `PowerFlowResultV1`,
  `network_model/solvers/power_flow_result.py:145-170`).
- `quality_status`, `reporting_limitations` — `raw_result`
  (`enm/canonical_analysis.py:1770-1789`).
- `max_iterations`, historia niedopasowania per iteracja, `cause_if_failed` —
  ślad WHITE BOX `run.power_flow_trace` (`enm/canonical_analysis.py:1846-1866`).

ZASADA NADRZĘDNA TEGO MODUŁU: `converged` NIE jest tu wyprowadzane. Solver
publikuje zbieżność jawnie i tylko ta wartość jest przekazywana dalej —
porównanie niedopasowania z tolerancją byłoby powtórzeniem decyzji solvera w
innej warstwie (dwie ścieżki tej samej fizyki). Tolerancja i niedopasowanie
końcowe są WYŁĄCZNIE pokazywane inżynierowi jako dowód liczbowy.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from enm.canonical_analysis import CanonicalRun

# ---------------------------------------------------------------------------
# Kody diagnozy przebiegu (stabilne, mapowane na zdania inżynierskie w UI)
# ---------------------------------------------------------------------------

#: Bieg zbieżny — solver osiągnął tolerancję, wszystkie węzły policzone.
KOD_ZBIEZNY = "PRZ-ZBIEZNY"
#: Bieg zbieżny, ale część węzłów leży poza wyspą zasilania (bez wyniku).
KOD_ZBIEZNY_NIEPELNY = "PRZ-ZBIEZNY-NIEPELNY"
#: Brak zbieżności — solver wyczerpał limit iteracji.
KOD_NIEZBIEZNY_LIMIT = "PRZ-NIEZBIEZNY-LIMIT"
#: Brak zbieżności — solver przerwał bez wskazania limitu iteracji.
KOD_NIEZBIEZNY = "PRZ-NIEZBIEZNY"
#: Bieg zakończony błędem wykonania (wyjątek solvera / przygotowania danych).
KOD_BLAD_WYKONANIA = "PRZ-BLAD-WYKONANIA"
#: Bieg jeszcze się nie zakończył (oczekuje albo trwa).
KOD_W_TOKU = "PRZ-W-TOKU"
#: Analiza nieiteracyjna (zwarciowa, stan fazowy) — pojęcie zbieżności nie występuje.
KOD_BEZ_ITERACJI = "PRZ-BEZ-ITERACJI"
#: Bieg zakończony, ale artefakt wyniku jest pusty (brak danych do diagnozy).
KOD_BRAK_ARTEFAKTU = "PRZ-BRAK-ARTEFAKTU"

#: ZAMKNIĘTA lista kodów diagnozy przebiegu. Każdy kod MUSI mieć zdanie
#: inżynierskie w module mapowania UI — pilnuje tego test dwustronnej
#: kompletności (`tests/api/test_diagnoza_przebiegu_api.py`).
KODY_DIAGNOZY_PRZEBIEGU: tuple[str, ...] = (
    KOD_ZBIEZNY,
    KOD_ZBIEZNY_NIEPELNY,
    KOD_NIEZBIEZNY_LIMIT,
    KOD_NIEZBIEZNY,
    KOD_BLAD_WYKONANIA,
    KOD_W_TOKU,
    KOD_BEZ_ITERACJI,
    KOD_BRAK_ARTEFAKTU,
)

#: Przyczyna przerwania iteracji zapisywana przez solver rozpływu przy
#: wyczerpaniu limitu (`network_model/solvers/power_flow_newton.py:206-216`).
_PRZYCZYNA_LIMIT_ITERACJI = "max_iter"

#: Typy biegów kanonicznych rozwiązywane iteracyjnie. Pozostałe (zwarcia wg
#: IEC 60909, stan fazowy) są rozwiązywane wprost — nie mają zbieżności.
_TYPY_ITERACYJNE = frozenset({"PF"})

#: Mapowanie statusu biegu kanonicznego na słownik wykonawczy — JEDNO źródło
#: prawdy wspólne z `CanonicalRun.to_execution_dict`.
_STATUS_WYKONAWCZY = {
    "CREATED": "PENDING",
    "RUNNING": "RUNNING",
    "FINISHED": "DONE",
    "FAILED": "FAILED",
}


def _liczba_lub_none(wartosc: Any) -> float | None:
    """Zwróć liczbę zmiennoprzecinkową albo `None` — bez cichego zera.

    Brak wartości musi zostać brakiem (UI pokazuje uczciwe „—"), inaczej pusty
    ślad wyglądałby jak zmierzone zero.
    """
    if wartosc is None or isinstance(wartosc, bool):
        return None
    if isinstance(wartosc, int | float):
        return float(wartosc)
    return None


def _calkowita_lub_none(wartosc: Any) -> int | None:
    """Zwróć liczbę całkowitą albo `None` (ta sama zasada co wyżej)."""
    if wartosc is None or isinstance(wartosc, bool):
        return None
    if isinstance(wartosc, int):
        return int(wartosc)
    if isinstance(wartosc, float) and wartosc.is_integer():
        return int(wartosc)
    return None


def _historia_iteracji(slad: dict[str, Any]) -> list[dict[str, Any]]:
    """Historia niedopasowania per iteracja wprost ze śladu WHITE BOX.

    Kolejność zachowana ze śladu (iteracje są deterministyczne). Wpis bez
    numeru iteracji jest pomijany — numer jest kluczem wiersza w UI.
    """
    historia: list[dict[str, Any]] = []
    for wpis in slad.get("iterations") or []:
        if not isinstance(wpis, dict):
            continue
        numer = _calkowita_lub_none(wpis.get("k"))
        if numer is None:
            continue
        historia.append(
            {
                "iteracja": numer,
                "niedopasowanie_pu": _liczba_lub_none(wpis.get("max_mismatch_pu")),
                "norma_niedopasowania_pu": _liczba_lub_none(wpis.get("norm_mismatch")),
                "przyczyna_przerwania": wpis.get("cause_if_failed") or None,
            }
        )
    return historia


def _przyczyna_przerwania(historia: list[dict[str, Any]]) -> str | None:
    """Przyczyna przerwania z OSTATNIEJ iteracji — tam zapisuje ją solver."""
    if not historia:
        return None
    return historia[-1]["przyczyna_przerwania"]


def _kod_dla_zakonczonego(
    *,
    zbiezny: bool | None,
    wezly_niepoliczone: list[str],
    przyczyna: str | None,
) -> str:
    """Kod diagnozy dla biegu ZAKOŃCZONEGO — wyłącznie z opublikowanych flag."""
    if zbiezny is None:
        return KOD_BRAK_ARTEFAKTU
    if not zbiezny:
        if przyczyna == _PRZYCZYNA_LIMIT_ITERACJI:
            return KOD_NIEZBIEZNY_LIMIT
        return KOD_NIEZBIEZNY
    if wezly_niepoliczone:
        return KOD_ZBIEZNY_NIEPELNY
    return KOD_ZBIEZNY


def zbuduj_diagnoze_przebiegu(run: CanonicalRun) -> dict[str, Any]:
    """
    Zbuduj diagnozę pojedynczego biegu z jego ISTNIEJĄCYCH artefaktów.

    Args:
        run: Bieg kanoniczny (read-only — funkcja niczego nie mutuje).

    Returns:
        Kontrakt odczytowy powierzchni „Diagnoza przebiegu".
    """
    status_wykonawczy = _STATUS_WYKONAWCZY.get(run.status, run.status)
    iteracyjna = run.analysis_type in _TYPY_ITERACYJNE

    surowy = run.raw_result or {}
    wynik_v1 = surowy.get("result_v1") or {}
    slad = run.power_flow_trace or {}

    wezly_niepoliczone = [str(x) for x in (wynik_v1.get("unsolved_node_ids") or [])]
    ograniczenia = [str(x) for x in (surowy.get("reporting_limitations") or [])]
    historia = _historia_iteracji(slad) if iteracyjna else []
    przyczyna = _przyczyna_przerwania(historia)

    zbiezny_surowy = wynik_v1.get("converged")
    zbiezny = zbiezny_surowy if isinstance(zbiezny_surowy, bool) else None

    if run.status == "FAILED":
        kod = KOD_BLAD_WYKONANIA
    elif run.status in ("CREATED", "RUNNING"):
        kod = KOD_W_TOKU
    elif not iteracyjna:
        kod = KOD_BEZ_ITERACJI
    else:
        kod = _kod_dla_zakonczonego(
            zbiezny=zbiezny,
            wezly_niepoliczone=wezly_niepoliczone,
            przyczyna=przyczyna,
        )

    return {
        "run_id": str(run.id),
        "case_id": run.case_id,
        "analysis_type": run.analysis_type,
        "run_status": status_wykonawczy,
        "iterative": iteracyjna,
        "code": kod,
        "converged": zbiezny if iteracyjna else None,
        "iterations_count": _calkowita_lub_none(wynik_v1.get("iterations_count")),
        "max_iterations": _calkowita_lub_none(slad.get("max_iterations")),
        "tolerance": _liczba_lub_none(wynik_v1.get("tolerance_used")),
        "final_mismatch_pu": (historia[-1]["niedopasowanie_pu"] if historia else None),
        "cause_if_failed": przyczyna,
        "unsolved_node_ids": sorted(wezly_niepoliczone),
        "reporting_limitations": ograniczenia,
        "quality_status": surowy.get("quality_status"),
        "error_message": run.error_message,
        "iteration_history": historia,
    }


def zbuduj_diagnoze_dla_biegu(run_id: UUID) -> dict[str, Any]:
    """
    Zbuduj diagnozę biegu wskazanego identyfikatorem.

    Raises:
        ValueError: Bieg o podanym identyfikatorze nie istnieje.
    """
    from enm.canonical_analysis import get_run

    run = get_run(run_id)
    if run is None:
        raise ValueError(f"Nie znaleziono obliczenia {run_id}")
    return zbuduj_diagnoze_przebiegu(run)
