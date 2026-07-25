"""Wspolna, ODPORNA baza porownania dla guardow pracujacych na ZMIENIONYCH plikach.

DEFEKT, ktory ten modul naprawia (znaleziony 2026-07-25 w logach CI): oba guardy
delta-owe (`solver_boundary_guard`, `resultset_v1_schema_guard`) mialy wlasna kopie
helpera, ktory wolal `git diff origin/main...HEAD` z `check=True`, a w bloku
`except` wolal `git diff HEAD~1` — TEZ z `check=True`. Na runnerze GitHub Actions
`actions/checkout@v4` bez `fetch-depth: 0` robi klon GLEBOKOSCI 1: nie ma ani
`origin/main`, ani `HEAD~1`. Oba wywolania konczyly sie kodem 128, wyjatek z bloku
except leciał na wierzch i skrypt padal TRACEBACKIEM z kodem 1.

Skutek byl znacznie gorszy niz sam czerwony krok: workflow „P0 Extended Guards"
przerywal sie na TRZECIM z pietnastu krokow, wiec 12 kolejnych guardow (overlay
no-physics, determinizm trace i scenariuszy, terminologia UI, mojibake, kanon
V12.xx, kontrakt severity, schemat ResultSet, port binding) NIGDY sie w CI nie
wykonalo. Guard, ktory sie wywraca, nie chroni niczego — a wyglada, jakby chronil.

ZASADY tego modulu:
1. **Nigdy wyjatek.** Brak bazy porownania to WYNIK do zaraportowania, nie awaria
   interpretera. Guard ma dawac werdykt, nie traceback.
2. **Fail-closed, nie fail-silent.** Gdy bazy nie da sie ustalic, NIE udajemy, ze
   „nic sie nie zmienilo" (to byloby ciche przepuszczenie kazdej zmiany w plikach
   chronionych). Zwracamy jawny blad z przyczyna i wskazaniem naprawy.
3. **Kolejnosc kandydatow od najdokladniejszego:** `origin/<default>...HEAD`
   (rzeczywista delta galezi wobec bazy), potem lokalna galaz domyslna, potem
   `HEAD~1` (jeden commit), i tylko w ostatniej kolejnosci brak bazy.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass

#: Galezie domyslne sprawdzane w kolejnosci (repo uzywa `main`).
_KANDYDACI_BAZY: tuple[str, ...] = ("origin/main", "main", "origin/master", "master")

KOMUNIKAT_BRAK_BAZY = (
    "BLAD [GuardDiffBase]: nie da sie ustalic bazy porownania zmian.\n"
    "  Sprawdzone: " + ", ".join(_KANDYDACI_BAZY) + ", HEAD~1 — zaden nie istnieje.\n"
    "  Najczestsza przyczyna: `actions/checkout` bez `fetch-depth: 0` (klon\n"
    "  glebokosci 1 nie ma ani galezi bazowej, ani poprzedniego commitu).\n"
    "  Guard NIE przepuszcza zmian bez bazy — to byloby ciche wylaczenie ochrony."
)


@dataclass(frozen=True)
class WynikBazy:
    """Lista zmienionych plikow albo jawny powod, dlaczego jej nie ma."""

    pliki: tuple[str, ...] | None
    baza: str | None
    powod_bledu: str | None = None

    @property
    def ok(self) -> bool:
        return self.pliki is not None


def _git(*argumenty: str) -> subprocess.CompletedProcess[str]:
    """Uruchom git BEZ `check` — kod wyjscia jest DANA, nie wyjatkiem."""
    return subprocess.run(  # noqa: S603 — staly, lokalny argv (git), bez shell
        ["git", *argumenty],
        capture_output=True,
        text=True,
        check=False,
    )


def _ref_istnieje(ref: str) -> bool:
    return _git("rev-parse", "--verify", "--quiet", ref).returncode == 0


def _pliki_z_diffa(zakres: str) -> tuple[str, ...] | None:
    wynik = _git("diff", "--name-only", zakres)
    if wynik.returncode != 0:
        return None
    return tuple(linia.strip() for linia in wynik.stdout.splitlines() if linia.strip())


def zmienione_pliki() -> WynikBazy:
    """Zwroc zmienione pliki wobec najlepszej dostepnej bazy porownania."""
    for kandydat in _KANDYDACI_BAZY:
        if not _ref_istnieje(kandydat):
            continue
        pliki = _pliki_z_diffa(f"{kandydat}...HEAD")
        if pliki is not None:
            return WynikBazy(pliki=pliki, baza=f"{kandydat}...HEAD")
    if _ref_istnieje("HEAD~1"):
        pliki = _pliki_z_diffa("HEAD~1")
        if pliki is not None:
            return WynikBazy(pliki=pliki, baza="HEAD~1")
    return WynikBazy(pliki=None, baza=None, powod_bledu=KOMUNIKAT_BRAK_BAZY)
