"""Strażnik nawrotu karty V126-INRUSH-SEPARACJA (decyzja właściciela 2026-10-15, V12K-352).

DLACZEGO. Rdzeń V12.6 (`network_model/solvers/v126_academic.py`, FROZEN, B-01 — bez zmian)
liczy w `_transient` udział 2. harmonicznej prądu załączania jako ``63 / k`` z PRZYJĘTEJ
krotności ``k`` i z niego „zalecenie blokady 87T” (``>= 10 %``). Właściciel orzekł, że ta
zależność nie wynika z fizyki prądu załączania (prąd załączania jest właściwością konkretnego
transformatora i warunków załączenia; blokadę 87T konfiguruje się z analizy harmonicznych
rzeczywistego przebiegu wg dokumentacji producenta). Pola zostają w surowym wyniku solvera
(kontrakt FROZEN, odcisk SHA-256 bez zmian), ale NIKT poza rdzeniem ich nie czyta, nie pokazuje,
nie eksportuje i nie przekazuje dalej.

CO PINUJE (dwie reguły, każda z kontrolą dodatnią na sztucznym drzewie):

A. Nazwy pól wyniku 63/k (``blocking_87t_recommended``, ``second_harmonic_percent_of_peak``)
   oraz stała progu katalogu (``UDZIAL_2H_BLOKADA_87T``) występują w kodzie produkcyjnym
   WYŁĄCZNIE w pliku rdzenia. Zakres: ``backend/src``, ``backend/scripts``, ``scripts``
   (strażniki repo), ``frontend/src`` (bez ``__tests__`` i fikstur JSON — to odciski surowej
   odpowiedzi API, która z mocy kontraktu FROZEN te pola niesie) i ``frontend/e2e``.
   Warstwa surowego API (`api/v126_academic.py`, `application/v126_artifacts.py`) przenosi
   wynik jako całość i nie wymienia tych pól z nazwy — dlatego lista dozwolonych ma jeden plik.

B. Moduły zabezpieczeń, doboru, nastaw, koordynacji, rekomendacji, raportu i dowodu (ścieżka
   pliku z segmentem tych dziedzin) nie sięgają po wyniki V12.6 w ogóle: zero importu rdzenia
   i artefaktów V12.6, zero tras/rodzajów biegu V12.6, zero odczytu bloku ``inrush``. To
   przypina także kartę zabezpieczeń transformatora: prąd załączania bierze z charakterystyki
   producenta, nie z biegu V12.6.

Testy w ``backend/tests`` i ``__tests__`` są poza zakresem skanu z założenia: test wolno
pinować obecność pól w surowym wyniku rdzenia (kontrakt FROZEN), a strażnik prezentacji
frontu sprawdza ich NIEOBECNOŚĆ na ekranie.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
RDZEN = Path("backend/src/network_model/solvers/v126_academic.py")

#: Korzenie skanu (względem `mv-design-pro/`) i rozszerzenia kodu produkcyjnego.
KORZENIE: tuple[str, ...] = (
    "backend/src",
    "backend/scripts",
    "scripts",
    "frontend/src",
    "frontend/e2e",
)
ROZSZERZENIA: frozenset[str] = frozenset({".py", ".ts", ".tsx", ".mjs", ".js"})
POMIJANE_SEGMENTY: frozenset[str] = frozenset(
    {"__tests__", "node_modules", "__pycache__", "harness-fixtures", "dist"}
)

#: Reguła A — nazwy pól wyniku 63/k i stałej progu.
ZAKAZANE_NAZWY: tuple[str, ...] = (
    "blocking_87t_recommended",
    "second_harmonic_percent_of_peak",
    "UDZIAL_2H_BLOKADA_87T",
)
DOZWOLONE_A: frozenset[Path] = frozenset({RDZEN})

#: Reguła B — dziedziny, które nie mogą czytać wyników V12.6 (segment ścieżki pliku).
DZIEDZINY_DOBORU = re.compile(
    r"protection|zabezpiecz|nastaw|dobor|selection|coordination|koordynac|selektywn"
    r"|recommend|rekomend|report|raport|proof|dowod|insight|eaz",
    re.IGNORECASE,
)
SIEGNIECIE_PO_V126 = re.compile(
    r"v126_academic|v126_artifacts|wyniki/akademickie|['\"]v126:|/v126/|transient_trv"
    r"|['\"]inrush['\"]|\.inrush\b|peak_multiple_in"
)


def _pliki(baza: Path) -> Iterable[Path]:
    for korzen in KORZENIE:
        katalog = baza / korzen
        if not katalog.is_dir():
            continue
        for plik in sorted(katalog.rglob("*")):
            if plik.suffix not in ROZSZERZENIA or not plik.is_file():
                continue
            wzgledna = plik.relative_to(baza)
            if POMIJANE_SEGMENTY.intersection(wzgledna.parts):
                continue
            # Testy jednostkowe frontu bywają obok kodu (`*.test.ts`) — poza zakresem jak `__tests__`.
            if re.search(r"\.(test|spec)\.(ts|tsx)$", plik.name) and korzen == "frontend/src":
                continue
            yield wzgledna


def naruszenia_nazw(baza: Path) -> list[str]:
    wynik: list[str] = []
    for wzgledna in _pliki(baza):
        if wzgledna in DOZWOLONE_A:
            continue
        tresc = (baza / wzgledna).read_text(encoding="utf-8", errors="replace")
        for numer, linia in enumerate(tresc.splitlines(), start=1):
            for nazwa in ZAKAZANE_NAZWY:
                if nazwa in linia:
                    wynik.append(f"{wzgledna}:{numer}: {nazwa}")
    return wynik


def naruszenia_dziedzin(baza: Path) -> list[str]:
    wynik: list[str] = []
    for wzgledna in _pliki(baza):
        if wzgledna in DOZWOLONE_A or not DZIEDZINY_DOBORU.search(wzgledna.as_posix()):
            continue
        tresc = (baza / wzgledna).read_text(encoding="utf-8", errors="replace")
        for numer, linia in enumerate(tresc.splitlines(), start=1):
            trafienie = SIEGNIECIE_PO_V126.search(linia)
            if trafienie:
                wynik.append(f"{wzgledna}:{numer}: {trafienie.group(0)}")
    return wynik


def test_rdzen_v126_nadal_niesie_pola_63_przez_k() -> None:
    """Kontrola sensu: strażnik pilnuje pól, które rdzeń FROZEN naprawdę zwraca — gdyby rdzeń
    przestał je zwracać (zmiana B-01), ten strażnik straciłby przedmiot i musi to zgłosić."""
    tresc = (REPO / RDZEN).read_text(encoding="utf-8")
    assert '"blocking_87t_recommended": second_harmonic_percent >= 10' in tresc
    assert '"second_harmonic_percent_of_peak"' in tresc
    assert "second_harmonic_percent = 63.0 / inrush_multiple" in tresc


def test_pola_63_przez_k_nie_wychodza_poza_rdzen() -> None:
    naruszenia = naruszenia_nazw(REPO)
    assert naruszenia == [], (
        "Wynik 63/k albo zalecenie blokady 87T rdzenia V12.6 czytane poza rdzeniem "
        "(decyzja właściciela 2026-10-15, V12K-352):\n" + "\n".join(naruszenia)
    )


def test_moduly_doboru_zabezpieczen_i_raportu_nie_czytaja_wynikow_v126() -> None:
    naruszenia = naruszenia_dziedzin(REPO)
    assert naruszenia == [], (
        "Moduł zabezpieczeń / doboru / nastaw / rekomendacji / raportu / dowodu sięga po wynik "
        "V12.6 (V12K-352):\n" + "\n".join(naruszenia)
    )


def test_skan_obejmuje_dziedziny_doboru_i_kod_frontu() -> None:
    """Strażnik z pustym zbiorem plików byłby zielony z konstrukcji — pinujemy, że widzi
    realne moduły każdej warstwy (backend zabezpieczeń, front zabezpieczeń, prezentacja V12.6)."""
    pliki = {p.as_posix() for p in _pliki(REPO)}
    assert "backend/src/application/analyses/v126_katalog.py" in pliki
    assert "frontend/src/ui2/wyniki/akademickie/prezentacja.ts" in pliki
    dziedziny = [p for p in pliki if DZIEDZINY_DOBORU.search(p)]
    assert any(p.startswith("backend/src/") for p in dziedziny)
    assert any(p.startswith("frontend/src/") for p in dziedziny)
    assert len(dziedziny) > 100, len(dziedziny)


# ---------------------------------------------------------------------------
# Kontrola dodatnia — iloczyn: reguła × warstwa (backend/front) × miejsce dozwolone/zakazane
# ---------------------------------------------------------------------------


def _drzewo(tmp_path: Path, pliki: dict[str, str]) -> Path:
    for sciezka, tresc in pliki.items():
        cel = tmp_path / sciezka
        cel.parent.mkdir(parents=True, exist_ok=True)
        cel.write_text(tresc, encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize(
    ("sciezka", "tresc"),
    [
        ("backend/src/analysis/recommendations/engine.py", 'x = r["blocking_87t_recommended"]\n'),
        ("backend/src/analysis/reporting/pdf.py", "k = w.get('second_harmonic_percent_of_peak')\n"),
        ("backend/scripts/eksport.py", "UDZIAL_2H_BLOKADA_87T = 10\n"),
        (
            "frontend/src/ui2/wyniki/x/prezentacja.ts",
            "const s = 'inrush.blocking_87t_recommended';\n",
        ),
        ("frontend/e2e/trv.spec.ts", "expect(r.second_harmonic_percent_of_peak).toBe(1);\n"),
    ],
)
def test_regula_a_wykrywa_odczyt_poza_rdzeniem(tmp_path: Path, sciezka: str, tresc: str) -> None:
    baza = _drzewo(tmp_path, {sciezka: tresc})
    assert len(naruszenia_nazw(baza)) == 1


def test_regula_a_przepuszcza_rdzen_testy_i_fikstury(tmp_path: Path) -> None:
    baza = _drzewo(
        tmp_path,
        {
            RDZEN.as_posix(): '"blocking_87t_recommended": True\n',
            "backend/tests/test_rdzen.py": 'assert w["blocking_87t_recommended"] is False\n',
            "frontend/src/ui2/a/__tests__/e.test.tsx": "'second_harmonic_percent_of_peak'\n",
            "frontend/src/ui2/a/e.test.ts": "'second_harmonic_percent_of_peak'\n",
            "frontend/src/harness-fixtures/generated/x.ts": "'blocking_87t_recommended'\n",
        },
    )
    assert naruszenia_nazw(baza) == []


@pytest.mark.parametrize(
    ("sciezka", "tresc"),
    [
        (
            "backend/src/application/analyses/protection/transformer_settings.py",
            "from network_model.solvers.v126_academic import V126AcademicSolver\n",
        ),
        ("backend/src/analysis/protection_insight/x.py", 'k = wynik["inrush"]["peak"]\n'),
        ("backend/src/application/nastawy/dobor.py", 'rodzaj = "v126:transient_trv"\n'),
        ("backend/src/analysis/reporting/raport.py", "from application.v126_artifacts import x\n"),
        (
            "frontend/src/ui2/zabezpieczenia/DoborTransformatora.tsx",
            "import { PREZENTACJA } from '../wyniki/akademickie/prezentacja';\n",
        ),
        ("frontend/src/ui/protection-coordination/api.ts", "fetch(`/api/runs/v126/${r}`);\n"),
        ("frontend/src/ui/protection/x.ts", "const k = wynik.inrush.peak_multiple_in;\n"),
    ],
)
def test_regula_b_wykrywa_dobor_czytajacy_v126(tmp_path: Path, sciezka: str, tresc: str) -> None:
    baza = _drzewo(tmp_path, {sciezka: tresc})
    assert len(naruszenia_dziedzin(baza)) == 1


def test_regula_b_nie_dotyczy_modulow_spoza_dziedzin_doboru(tmp_path: Path) -> None:
    baza = _drzewo(
        tmp_path,
        {
            "backend/src/api/v126_academic.py": 'rodzaj = "v126:transient_trv"\n',
            "frontend/src/ui2/wyniki/akademickie/prezentacja.ts": "sciezki: ['inrush'],\n",
            "backend/src/application/analyses/protection/hoppel.py": "inrush_z_karty = 1\n",
        },
    )
    assert naruszenia_dziedzin(baza) == []
