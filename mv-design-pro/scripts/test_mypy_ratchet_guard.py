"""Testy zapadki długu typów (karta MYPY-PUSTA-BRAMKA, 2026-09-23).

PO CO. Do 2026-09-23 zapadka była PUSTA dla typów między modułami: `mypy src` przy
`src/__init__.py` nadawał plikom nazwy `src.<pakiet>.*`, importy `<pakiet>.*` nie
trafiały w żaden plik, a globalne `ignore_missing_imports` zamieniało je w `Any`.
Sonda „funkcja `-> int` zwraca model z innego modułu" dawała „Success". Te testy
przypinają naprawę tak, żeby jej cofnięcie było widoczne od razu.

DWIE GRUPY:
1. SONDA NA PRAWDZIWYM mypy, na plikach tymczasowych (`tmp_path`): drzewo `backend/`
   o układzie prawdziwego backendu (`src/__init__.py`, pakiety importowane jako moduły
   najwyższego poziomu, katalog przestrzeni nazw bez `__init__.py` jak
   `application/automation`) z sekcjami `[tool.mypy]` + `[[tool.mypy.overrides]]`
   SKOPIOWANYMI z prawdziwego `backend/pyproject.toml`. Cofnięcie naprawy konfiguracji
   (globalne `ignore_missing_imports`, brak `mypy_path` / `explicit_package_bases`)
   zapala tę grupę. Kontrola negatywna: ta sama sonda z konfiguracją SPRZED naprawy
   NIE widzi błędów między modułami — dowód, że sonda rozróżnia oba stany.
   Koszt: dwa biegi mypy po ~4-5 s (fixture na moduł, nie na test).
2. LOGIKA GUARDA bez mypy (atrapa `subprocess.run` / `uruchom_mypy`): pomiar vs bieg
   przerwany, minimum plików także dla „Success", błąd wczytania `[tool.mypy]` (mypy
   liczy wtedy dalej na ustawieniach domyślnych), zapadka w obie strony, twardy błąd
   na nierozwiązanym imporcie.

POKRYCIE — ILOCZYN CECH, nie przykład z karty
---------------------------------------------
{błąd typu między modułami}
  x {moduł w pakiecie z `__init__.py` · moduł w katalogu przestrzeni nazw}
  x {`from a.b import X` · `import a.b as m`}
+ {kontrola: błąd wewnątrz jednego modułu}
+ {import własny nierozwiązany → twardy błąd · biblioteka z imiennej listy wyciszeń
   → brak błędu}
  x {konfiguracja po naprawie · konfiguracja sprzed naprawy (kontrola negatywna)}

KOMBINACJE ŚWIADOMIE NIEPOKRYTE (i dlaczego):
  * pełny pomiar `backend/src` (~45 s na zimno) — robota guarda w CI, nie testu;
  * per-modułowe `follow_imports = "skip"` dla pakietu własnego — w konfiguracji
    tego nie ma; guard deklaruje to w inwentarzu klasy jako NIE przypięte.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

# Guard i jego test leżą w `scripts/`, który nie jest pakietem. Przy uruchomieniu
# RAZEM z suitą backendu pytest nie dokłada tego katalogu do `sys.path`.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import mypy_ratchet_guard as guard  # noqa: E402

PYPROJECT = guard.BACKEND / "pyproject.toml"
NAGLOWKI_MYPY = ("[tool.mypy]", "[[tool.mypy.overrides]]")


def sekcje_mypy(tekst: str) -> str:
    """Wytnij z `pyproject.toml` wszystkie sekcje mypy (tekstowo, z komentarzami)."""
    wynik: list[str] = []
    w_sekcji = False
    for linia in tekst.splitlines():
        naglowek = linia.strip()
        if naglowek.startswith("[") and naglowek.endswith("]") and "=" not in naglowek:
            w_sekcji = naglowek in NAGLOWKI_MYPY
        if w_sekcji:
            wynik.append(linia)
    return "\n".join(wynik) + "\n"


def konfiguracja_sprzed_naprawy(sekcje: str) -> str:
    """Konfiguracja z pustą bramką: bez bazy modułów, z globalnym wyciszeniem."""
    linie = [
        linia
        for linia in sekcje.splitlines()
        if not linia.startswith(("mypy_path", "explicit_package_bases"))
    ]
    tekst = "\n".join(linie)
    return tekst.replace("[tool.mypy]", "[tool.mypy]\nignore_missing_imports = true", 1) + "\n"


# Każda sonda niesie znacznik `SONDA:<nazwa>`; test szuka błędu w TEJ linii.
UZYCIE = """\
import scipy  # biblioteka z imiennej listy wyciszen — nie moze dac bledu

import pakiet_a.model as modul_a
import pakiet_a.przestrzen.modul as modul_ns
from pakiet_a.model import Model
from pakiet_a.przestrzen.modul import Rekord
from pakiet_nieistniejacy import Cos  # SONDA:import_wlasny_nierozwiazany


def miedzy_from_pakiet(m: Model) -> int:
    return m  # SONDA:miedzy_from_pakiet


def miedzy_import_pakiet(m: modul_a.Model) -> int:
    return m  # SONDA:miedzy_import_pakiet


def miedzy_from_przestrzen(r: Rekord) -> int:
    return r  # SONDA:miedzy_from_przestrzen


def miedzy_import_przestrzen(r: modul_ns.Rekord) -> int:
    return r  # SONDA:miedzy_import_przestrzen


def wewnatrz_modulu() -> int:
    return "tekst"  # SONDA:wewnatrz_modulu


def uzyj(c: Cos) -> Cos:
    return c


WERSJA_SCIPY = scipy.__name__
"""

SONDY_MIEDZYMODULOWE = {
    "miedzy_from_pakiet": 'got "Model", expected "int"',
    "miedzy_import_pakiet": 'got "Model", expected "int"',
    "miedzy_from_przestrzen": 'got "Rekord", expected "int"',
    "miedzy_import_przestrzen": 'got "Rekord", expected "int"',
}


def zbuduj_backend(katalog: Path, konfiguracja: str) -> Path:
    """Drzewo `backend/` o układzie prawdziwego backendu; zwróć jego ścieżkę."""
    backend = katalog / "backend"
    pliki = {
        "pyproject.toml": konfiguracja,
        "src/__init__.py": '"""Pakiet glowny (jak backend/src/__init__.py)."""\n',
        "src/pakiet_a/__init__.py": "",
        "src/pakiet_a/model.py": (
            "from pydantic import BaseModel\n\n\nclass Model(BaseModel):\n    wartosc: int\n"
        ),
        # Katalog BEZ `__init__.py` (przestrzeń nazw) — jak `application/automation`.
        "src/pakiet_a/przestrzen/modul.py": "class Rekord:\n    pole: int = 0\n",
        "src/pakiet_b/__init__.py": "",
        "src/pakiet_b/uzycie.py": UZYCIE,
    }
    for sciezka, tresc in pliki.items():
        plik = backend / sciezka
        plik.parent.mkdir(parents=True, exist_ok=True)
        plik.write_text(tresc, encoding="utf-8")
    return backend


def numer_linii(znacznik: str) -> int:
    for numer, linia in enumerate(UZYCIE.splitlines(), start=1):
        if f"# SONDA:{znacznik}" in linia:
            return numer
    raise AssertionError(f"brak znacznika {znacznik}")


def bledy_w_linii(wyjscie: str, znacznik: str) -> list[str]:
    prefiks = f"src/pakiet_b/uzycie.py:{numer_linii(znacznik)}: error:"
    return [linia for linia in wyjscie.splitlines() if linia.startswith(prefiks)]


@pytest.fixture(scope="module")
def pomiar_po_naprawie(tmp_path_factory: pytest.TempPathFactory) -> tuple[int, int, str]:
    sekcje = sekcje_mypy(PYPROJECT.read_text(encoding="utf-8"))
    backend = zbuduj_backend(tmp_path_factory.mktemp("po_naprawie"), sekcje)
    return guard.uruchom_mypy(backend=backend, min_sprawdzonych=1)


@pytest.fixture(scope="module")
def pomiar_sprzed_naprawy(tmp_path_factory: pytest.TempPathFactory) -> tuple[int, int, str]:
    sekcje = sekcje_mypy(PYPROJECT.read_text(encoding="utf-8"))
    backend = zbuduj_backend(
        tmp_path_factory.mktemp("sprzed_naprawy"), konfiguracja_sprzed_naprawy(sekcje)
    )
    return guard.uruchom_mypy(backend=backend, min_sprawdzonych=1)


# ---------------------------------------------------------------------------
# Grupa 1: sonda na prawdziwym mypy
# ---------------------------------------------------------------------------


def test_konfiguracja_skopiowana_z_prawdziwego_pyproject() -> None:
    """Sonda ma sens tylko na PRAWDZIWEJ konfiguracji — nie na atrapie w teście."""
    sekcje = sekcje_mypy(PYPROJECT.read_text(encoding="utf-8"))
    assert sekcje.startswith("[tool.mypy]")
    assert "[tool.pytest" not in sekcje
    assert "plugins" in sekcje


@pytest.mark.parametrize("znacznik", sorted(SONDY_MIEDZYMODULOWE))
def test_blad_miedzy_modulami_jest_wykrywany(
    pomiar_po_naprawie: tuple[int, int, str], znacznik: str
) -> None:
    """RDZEŃ KARTY: błąd typu z INNEGO modułu musi być widoczny dla zapadki."""
    _, _, wyjscie = pomiar_po_naprawie
    bledy = bledy_w_linii(wyjscie, znacznik)
    assert len(bledy) == 1, wyjscie
    assert SONDY_MIEDZYMODULOWE[znacznik] in bledy[0]
    assert bledy[0].endswith("[return-value]")


def test_blad_wewnatrz_modulu_jest_wykrywany(pomiar_po_naprawie: tuple[int, int, str]) -> None:
    _, _, wyjscie = pomiar_po_naprawie
    bledy = bledy_w_linii(wyjscie, "wewnatrz_modulu")
    assert len(bledy) == 1, wyjscie
    assert 'got "str", expected "int"' in bledy[0]


def test_nierozwiazany_import_wlasny_jest_twardym_bledem(
    pomiar_po_naprawie: tuple[int, int, str],
) -> None:
    """Globalne wyciszenie brakujących importów zniknęło: import własny, którego mypy
    nie znajduje, jest błędem, a guard rozpoznaje go jako pomiar na pustej bramce."""
    _, _, wyjscie = pomiar_po_naprawie
    bledy = bledy_w_linii(wyjscie, "import_wlasny_nierozwiazany")
    assert len(bledy) == 1, wyjscie
    assert bledy[0].endswith("[import-not-found]")
    assert guard.nierozwiazane_importy(wyjscie) == bledy


def test_dokladnie_oczekiwane_bledy_bez_szumu(pomiar_po_naprawie: tuple[int, int, str]) -> None:
    """4 sondy między modułami + 1 kontrolna + 1 import nierozwiązany = 6 w 1 pliku.
    Brak błędu dla `scipy` przypina imienną listę wyciszeń bibliotek zewnętrznych."""
    bledy, pliki, wyjscie = pomiar_po_naprawie
    assert (bledy, pliki) == (6, 1), wyjscie
    assert "scipy" not in wyjscie


def test_kontrola_negatywna_konfiguracja_sprzed_naprawy_jest_pusta(
    pomiar_sprzed_naprawy: tuple[int, int, str],
) -> None:
    """Ta sama sonda na konfiguracji SPRZED naprawy: błędy między modułami i import
    nierozwiązany znikają (`Any`), zostaje tylko błąd wewnątrzmodułowy. Gdyby sonda
    tu też je widziała, nie rozróżniałaby pustej bramki od działającej."""
    bledy, pliki, wyjscie = pomiar_sprzed_naprawy
    assert (bledy, pliki) == (1, 1), wyjscie
    assert len(bledy_w_linii(wyjscie, "wewnatrz_modulu")) == 1
    for znacznik in [*SONDY_MIEDZYMODULOWE, "import_wlasny_nierozwiazany"]:
        assert bledy_w_linii(wyjscie, znacznik) == [], znacznik


# ---------------------------------------------------------------------------
# Grupa 2: logika guarda (bez mypy)
# ---------------------------------------------------------------------------


def atrapa_mypy(monkeypatch: pytest.MonkeyPatch, stdout: str) -> None:
    def uruchom(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(stdout=stdout, stderr="", returncode=1)

    monkeypatch.setattr(subprocess, "run", uruchom)


def test_sukces_na_garstce_plikow_to_nie_pomiar(monkeypatch: pytest.MonkeyPatch) -> None:
    """Przy niezerowym progu „Success" na złym katalogu wyglądałby na spadek długu do
    zera — guard żądałby rozbrojenia zapadki. Dlatego minimum plików także tu."""
    atrapa_mypy(monkeypatch, "Success: no issues found in 3 source files\n")
    with pytest.raises(SystemExit, match="tylko 3 plikow"):
        guard.uruchom_mypy()


def test_sukces_na_wiarygodnej_liczbie_plikow(monkeypatch: pytest.MonkeyPatch) -> None:
    atrapa_mypy(monkeypatch, "Success: no issues found in 730 source files\n")
    assert guard.uruchom_mypy()[:2] == (0, 0)


def test_pomiar_z_liczba_sprawdzonych_plikow(monkeypatch: pytest.MonkeyPatch) -> None:
    atrapa_mypy(monkeypatch, "Found 279 errors in 53 files (checked 730 source files)\n")
    assert guard.uruchom_mypy()[:2] == (279, 53)


def test_bieg_przerwany_to_nie_pomiar(monkeypatch: pytest.MonkeyPatch) -> None:
    atrapa_mypy(monkeypatch, "Found 1 error in 1 file (errors prevented further checking)\n")
    with pytest.raises(SystemExit, match="PRZERWAL"):
        guard.uruchom_mypy()


@pytest.mark.parametrize(
    "komunikat",
    [
        "pyproject.toml: Cannot overwrite a value (at line 3, column 24)",
        "pyproject.toml: [mypy]: Unrecognized option: nieznana_opcja = True",
    ],
)
def test_blad_konfiguracji_to_nie_pomiar(monkeypatch: pytest.MonkeyPatch, komunikat: str) -> None:
    """ZMIERZONE: przy zepsutym `[tool.mypy]` mypy nie przerywa, tylko liczy na
    ustawieniach domyślnych i drukuje normalne podsumowanie. Bez tego sprawdzenia
    zapadka porównywałaby z progiem pomiar na cudzej konfiguracji."""
    atrapa_mypy(
        monkeypatch, f"{komunikat}\nFound 279 errors in 53 files (checked 730 source files)\n"
    )
    with pytest.raises(SystemExit, match="blad wczytania"):
        guard.uruchom_mypy()


def test_brak_podsumowania_to_nie_pomiar(monkeypatch: pytest.MonkeyPatch) -> None:
    atrapa_mypy(monkeypatch, "mypy: error: Cannot find config file\n")
    with pytest.raises(SystemExit, match="nie rozpoznano"):
        guard.uruchom_mypy()


def ustaw_pomiar(monkeypatch: pytest.MonkeyPatch, bledy: int, wyjscie: str = "") -> None:
    monkeypatch.setattr(guard, "uruchom_mypy", lambda: (bledy, 1, wyjscie))


def test_zapadka_rowna_progowi_jest_zielona(monkeypatch: pytest.MonkeyPatch) -> None:
    ustaw_pomiar(monkeypatch, guard.BASELINE_ERRORS)
    assert guard.main() == 0


def test_zapadka_wzrost_dlugu_jest_czerwony(monkeypatch: pytest.MonkeyPatch) -> None:
    ustaw_pomiar(monkeypatch, guard.BASELINE_ERRORS + 1)
    assert guard.main() == 1


def test_zapadka_spadek_dlugu_zada_obnizenia_progu(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    assert guard.BASELINE_ERRORS > 0, "pin 0 = brak kierunku w dol do sprawdzenia"
    ustaw_pomiar(monkeypatch, guard.BASELINE_ERRORS - 1)
    assert guard.main() == 1
    assert "ZMALAL" in capsys.readouterr().out


def test_nierozwiazany_import_czerwony_nawet_przy_liczbie_rownej_progowi(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Liczba błędów równa progowi NIE chroni: spadek realnych błędów i wzrost
    nierozwiązanych importów mogłyby się zbilansować, a pomiar byłby na `Any`."""
    linia = (
        "src/api/x.py:1: error: Cannot find implementation or library stub for module "
        'named "werdykt.kontrakt"  [import-not-found]'
    )
    ustaw_pomiar(monkeypatch, guard.BASELINE_ERRORS, wyjscie=linia + "\n")
    assert guard.main() == 1
    assert "pustej bramce" in capsys.readouterr().out


def test_import_biblioteki_bez_stubow_spoza_listy_jest_wykrywany() -> None:
    linia = (
        'src/api/x.py:3: error: Library stubs not installed for "nowa_biblioteka"  '
        "[import-untyped]"
    )
    assert guard.nierozwiazane_importy(linia + "\nsrc/a.py:1: note: x\n") == [linia]
