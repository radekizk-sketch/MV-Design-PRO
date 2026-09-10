#!/usr/bin/env python3
"""RESEARCH ISOLATION GUARD — kod badawczy nie może wejść na ścieżkę produkcyjną.

Pilnuje granicy ustanowionej w `backend/research/README.md`:

1. Żaden moduł produkcyjny (`backend/src/**`) nie importuje `dynamic_lab`
   ani niczego z `backend/research/**`.
2. Żaden moduł produkcyjny nie dokłada `research/` do `sys.path`
   (obejście importu przez ścieżkę).
3. Katalog `research/` NIE jest wymieniony w `pyproject.toml::packages`
   — dzięki temu izolacja jest strukturalna, a nie umowna.
4. Kod badawczy nie nadaje sobie statusu dowodowego: w `research/**` nie może
   wystąpić `VALIDATED_SIMULATION` ani `reporting_status = "reportable"`.

   ZAKRES TEJ OCHRONY — nazwany uczciwie. To jest **wyszukiwanie literałów**,
   czyli zapadka przeciwko naruszeniu PRZEZ NIEUWAGĘ (skopiowana stała, odruch
   „ustawię status"). To NIE jest granica bezpieczeństwa: kod celowo omijający
   guard złoży ten sam literał ze sklejenia łańcuchów, wczyta go z pliku albo
   nazwie inaczej. Granicą realną jest punkt 3 — `research/` nie jest pakietem
   instalowanym, więc produkcja nie może go zaimportować, choćby chciała.
   Mylenie zapadki z granicą było jednym z mechanizmów opisanych w audycie.
5. Spis modułów w `research/README.md` zgadza się z zawartością katalogu —
   w OBIE strony. Wpis o pliku, którego nie ma, jest tą samą klasą defektu,
   którą audyt zarzuca systemowi (nazwa w dokumencie bez implementacji za nią);
   plik bez wpisu znaczy, że spis przestał opisywać laboratorium.
6. Ten guard jest wywoływany przez co najmniej jeden workflow CI. `README.md`
   twierdzi: „Guard `research_isolation_guard.py` pilnuje tej granicy w CI" —
   deklaracja bez przypiętego sprawdzenia jest fałszywą pewnością, a guard
   niewpięty w CI jest guardem, którego nie ma.
7. Żaden pakiet w `research/` nie ma nazwy kolidującej z pakietem w `src/`.
   To warunek bezpieczeństwa dla `tests/research/conftest.py`, który dokłada
   `research/` do `sys.path`: dopóki nazwy się nie pokrywają, katalog badawczy
   nie może PRZESŁONIĆ pakietu źródłowego (bramka KD-9,
   `tests/ci/test_testy_nie_cieniuja_pakietow_zrodlowych.py`). Bez tej kontroli
   dodanie kiedyś `research/enm/` cicho otworzyłoby dokładnie ten defekt,
   przed którym tamta bramka chroni.

Punkt 4 jest istotny: laboratorium wolno liczyć fizykę i wolno się mylić —
NIE wolno mu twierdzić, że jego wynik jest dowodem regulacyjnym.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

KORZEN = Path(__file__).resolve().parents[1]
SRC = KORZEN / "backend" / "src"
RESEARCH = KORZEN / "backend" / "research"
PYPROJECT = KORZEN / "backend" / "pyproject.toml"
README = RESEARCH / "README.md"
WORKFLOWS = KORZEN.parent / ".github" / "workflows"

WZORZEC_SCIEZKI = re.compile(r"""sys\.path[^\n]*research""")
ZAKAZANE_W_BADAWCZYM = (
    "VALIDATED_SIMULATION",
    'reporting_status = "reportable"',
    "reporting_status='reportable'",
)


def importowalne_pakiety_badawcze() -> tuple[str, ...]:
    """Nazwy, pod którymi kod badawczy JEST importowalny — wyprowadzone, nie wpisane.

    Poprzednia wersja miała ``ZAKAZANE_IMPORTY = ("dynamic_lab",)`` wpisane
    ręcznie. Guard deklarował ochronę całego ``backend/research/**``, a chronił
    jeden pakiet: dodanie kiedyś ``research/inny_lab/`` otworzyłoby produkcji
    drogę do importu, nie zapalając żadnego światła. To jest naprawa KLASY, nie
    instancji — lista powstaje z zawartości katalogu przy każdym uruchomieniu.

    Importowalne są: katalogi z ``__init__.py`` (pakiety) oraz moduły ``*.py``
    leżące bezpośrednio w ``research/`` — bo ``tests/research/conftest.py``
    dokłada właśnie ``research/`` do ``sys.path``.
    """
    if not RESEARCH.exists():
        return ()
    nazwy: set[str] = set()
    for wpis in RESEARCH.iterdir():
        if wpis.is_dir() and (wpis / "__init__.py").exists():
            nazwy.add(wpis.name)
        elif wpis.is_file() and wpis.suffix == ".py" and wpis.stem != "__init__":
            nazwy.add(wpis.stem)
    return tuple(sorted(nazwy))


def _pliki(katalog: Path) -> list[Path]:
    if not katalog.exists():
        return []
    return sorted(p for p in katalog.rglob("*.py") if "__pycache__" not in p.parts)


def sprawdz_importy_produkcji() -> list[str]:
    """Produkcja nie może importować ŻADNEGO pakietu badawczego."""
    naruszenia: list[str] = []
    zakazane = importowalne_pakiety_badawcze()
    if not zakazane:
        return naruszenia
    for plik in _pliki(SRC):
        try:
            drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        except SyntaxError as exc:
            naruszenia.append(f"{plik}: błąd składni — {exc.msg}")
            continue
        for wezel in ast.walk(drzewo):
            nazwy: list[str] = []
            if isinstance(wezel, ast.Import):
                nazwy = [a.name for a in wezel.names]
            elif isinstance(wezel, ast.ImportFrom) and wezel.module:
                nazwy = [wezel.module]
            for nazwa in nazwy:
                for zakazany in zakazane:
                    if nazwa == zakazany or nazwa.startswith(f"{zakazany}."):
                        naruszenia.append(
                            f"{plik.relative_to(KORZEN)}:{wezel.lineno}: "
                            f"produkcja importuje kod badawczy `{nazwa}`"
                        )
    return naruszenia


def sprawdz_manipulacje_sciezka() -> list[str]:
    """Produkcja nie może dokładać `research/` do sys.path."""
    naruszenia: list[str] = []
    for plik in _pliki(SRC):
        for numer, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), 1):
            if WZORZEC_SCIEZKI.search(linia):
                naruszenia.append(
                    f"{plik.relative_to(KORZEN)}:{numer}: "
                    f"produkcja dokłada katalog badawczy do sys.path"
                )
    return naruszenia


def sprawdz_pyproject() -> list[str]:
    """`research` nie może być pakietem instalowanym."""
    if not PYPROJECT.exists():
        return [f"Brak {PYPROJECT}"]
    tresc = PYPROJECT.read_text(encoding="utf-8")
    if re.search(r'include\s*=\s*"research"', tresc) or 'from = "research"' in tresc:
        return [
            "pyproject.toml: katalog `research` wpisany jako pakiet produkcyjny — "
            "to znosi izolację strukturalną laboratorium"
        ]
    return []


def sprawdz_status_dowodowy() -> list[str]:
    """ZAPADKA na przypadkowe nadanie statusu dowodowego (nie granica bezpieczeństwa).

    Wyszukiwanie literałów wykrywa naruszenie przez nieuwagę; nie wykrywa kodu,
    który celowo obchodzi guard. Realną granicą jest izolacja strukturalna
    (`sprawdz_pyproject`).
    """
    naruszenia: list[str] = []
    for plik in _pliki(RESEARCH):
        tresc = plik.read_text(encoding="utf-8")
        for numer, linia in enumerate(tresc.splitlines(), 1):
            for zakazane in ZAKAZANE_W_BADAWCZYM:
                if zakazane in linia:
                    naruszenia.append(
                        f"{plik.relative_to(KORZEN)}:{numer}: kod badawczy nadaje sobie "
                        f"status dowodowy (`{zakazane}`)"
                    )
    return naruszenia


def sprawdz_kolizje_nazw() -> list[str]:
    """Pakiety badawcze nie mogą nosić nazw pakietów źródłowych.

    `tests/research/conftest.py` dokłada `research/` do `sys.path`. Gdyby w
    `research/` pojawił się katalog o nazwie pakietu z `src/` (np. `enm`),
    przesłoniłby go w biegach obejmujących testy laboratorium — czyli dokładnie
    defekt KD-9, przed którym broni bramka cieniowania.
    """
    if not SRC.exists() or not RESEARCH.exists():
        return []
    zrodlowe = {p.name for p in SRC.iterdir() if p.is_dir() and not p.name.startswith("__")}
    badawcze = {p.name for p in RESEARCH.iterdir() if p.is_dir() and not p.name.startswith("__")}
    kolizje = sorted(zrodlowe & badawcze)
    return [
        f"research/{nazwa}: nazwa koliduje z pakietem produkcyjnym src/{nazwa} — "
        f"katalog badawczy przesłoniłby źródła na sys.path"
        for nazwa in kolizje
    ]


def sprawdz_spis_modulow() -> list[str]:
    """Spis w README musi zgadzać się z katalogiem — w obie strony."""
    if not README.exists():
        return [f"Brak {README.relative_to(KORZEN)}"]
    tresc = README.read_text(encoding="utf-8")
    wymienione = set(re.findall(r"`(dynamic_lab/[a-z0-9_]+\.py)`", tresc))
    katalog = RESEARCH / "dynamic_lab"
    istniejace = {f"dynamic_lab/{p.name}" for p in katalog.glob("*.py") if p.name != "__init__.py"}
    naruszenia = [
        f"research/README.md: wymienia `{brak}`, którego NIE MA — "
        f"dokument obiecuje moduł, za którym nie stoi kod"
        for brak in sorted(wymienione - istniejace)
    ]
    naruszenia += [
        f"research/README.md: nie wymienia istniejącego modułu `{nowy}` — "
        f"spis przestał opisywać laboratorium"
        for nowy in sorted(istniejace - wymienione)
    ]
    return naruszenia


def sprawdz_wpiecie_w_ci() -> list[str]:
    """Guard musi być realnie wywoływany przez workflow — inaczej go nie ma."""
    if not WORKFLOWS.is_dir():
        return [f"Brak katalogu workflowow: {WORKFLOWS}"]
    nazwa = Path(__file__).name
    for plik in sorted(WORKFLOWS.glob("*.y*ml")):
        if nazwa in plik.read_text(encoding="utf-8"):
            return []
    return [
        f".github/workflows: żaden workflow nie wywołuje `{nazwa}` — "
        f"README twierdzi, że guard pilnuje granicy W CI, a nie jest tam wpięty"
    ]


def main() -> int:
    print("=" * 62)
    print("GUARD: research_isolation_guard")
    print("=" * 62)
    if not RESEARCH.exists():
        print("Katalog badawczy nie istnieje — brak czego pilnować. OK")
        return 0

    naruszenia = (
        sprawdz_importy_produkcji()
        + sprawdz_manipulacje_sciezka()
        + sprawdz_pyproject()
        + sprawdz_status_dowodowy()
        + sprawdz_kolizje_nazw()
        + sprawdz_spis_modulow()
        + sprawdz_wpiecie_w_ci()
    )
    print(f"Plikow produkcyjnych: {len(_pliki(SRC))}")
    print(f"Plikow badawczych:    {len(_pliki(RESEARCH))}")
    if naruszenia:
        print("\nNARUSZENIE IZOLACJI KODU BADAWCZEGO:", file=sys.stderr)
        for n in naruszenia:
            print(f"  - {n}", file=sys.stderr)
        return 1
    print("\nPASSED: kod badawczy jest odizolowany od produkcji")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
