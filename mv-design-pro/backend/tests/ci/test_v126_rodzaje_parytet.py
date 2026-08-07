"""Parytet kontraktu V12.6 między backendem a oknem „Analizy akademickie" (karta V126-OKNA).

BÓL (pomiar 2026-08-07): powierzchnia zastana `V126AcademicSurface` trzymała WŁASNĄ
kopię listy rodzajów analiz — dwanaście pozycji wobec czternastu w kontrakcie
`V126AnalysisType`. `neutral_earthing_design` nie miał we froncie żadnego wejścia,
a `earth_fault_detection` był osiągalny wyłącznie przez wartość domyślną wyrażenia
`SCREEN_TO_ANALYSIS[...] ?? 'earth_fault_detection'`, czyli przez pomyłkę. Rozjazd
narastał po cichu, bo nic go nie pilnowało.

Ten test jest STRAŻNIKIEM dwóch mocnych deklaracji okna (reguła „deklaracja bez testu
= fałszywa pewność"):

1. „każdy rodzaj kontraktu ma etykietę PL w oknie" — dodanie rodzaju do
   `V126AnalysisType` bez etykiety w `ui2/wyniki/akademickie/strings.ts` daje czerwień,
   nie cichy brak w interfejsie;
2. „każdy parametr projektowy, który solver realnie czyta, ma kontrolkę" — klucz
   wczytany w `v126_academic.py` przez `parameters.get(...)`, a nieobsłużony w
   `ui2/wyniki/akademickie/parametry.ts`, daje czerwień (odwrotność zakazu fantomów:
   fantom to kontrolka bez pola, ten test łapie pole bez kontrolki).
"""

from __future__ import annotations

import re
from pathlib import Path

from solver_input.v126_contracts import V126AnalysisType

PROJECT_ROOT = Path(__file__).resolve().parents[3]
FRONT_AKADEMICKIE = PROJECT_ROOT / "frontend" / "src" / "ui2" / "wyniki" / "akademickie"
STRINGS_TS = FRONT_AKADEMICKIE / "strings.ts"
PARAMETRY_TS = FRONT_AKADEMICKIE / "parametry.ts"
API_TS = FRONT_AKADEMICKIE / "api.ts"
SOLVER_PY = PROJECT_ROOT / "backend" / "src" / "network_model" / "solvers" / "v126_academic.py"

#: Klucze `parameters`, które NIE są polem formularza, bo docierają do solvera inną,
#: udokumentowaną drogą. Lista ZAMKNIĘTA — każda pozycja z uzasadnieniem.
KLUCZE_BEZ_KONTROLKI: dict[str, str] = {
    # Obiekt uziomu ma własny zestaw pól (`POLA_UZIOMU`, flaga `uziom` zestawu).
    "earthing": "obiekt uziomu — dedykowany zestaw pól POLA_UZIOMU",
    # Lista metod detekcji ma własną kontrolkę wielokrotnego wyboru (`METODY_DETEKCJI`).
    "relay_methods": "wybór wielokrotny — METODY_DETEKCJI",
    # Lista referencji ma własny formularz wierszowy (`POLA_REFERENCJI`).
    "benchmark_references": "lista złożona — POLA_REFERENCJI",
}


def _tekst(sciezka: Path) -> str:
    return sciezka.read_text(encoding="utf-8")


def test_kazdy_rodzaj_ma_etykiete_pl_w_oknie() -> None:
    """Komplet `V126AnalysisType` ma etykietę PL i opis w oknie akademickim."""
    strings = _tekst(STRINGS_TS)
    etykiety = strings.split("ETYKIETY_RODZAJOW", 1)[1].split("};", 1)[0]
    opisy = strings.split("OPISY_RODZAJOW", 1)[1].split("};", 1)[0]
    brak_etykiety = [item.value for item in V126AnalysisType if f"{item.value}:" not in etykiety]
    brak_opisu = [item.value for item in V126AnalysisType if f"{item.value}:" not in opisy]
    assert brak_etykiety == [], f"Rodzaje bez etykiety PL w oknie: {brak_etykiety}"
    assert brak_opisu == [], f"Rodzaje bez opisu inżynierskiego w oknie: {brak_opisu}"


def test_typ_rodzaju_w_kliencie_pokrywa_kontrakt() -> None:
    """Unia `RodzajAnalizy` klienta API zawiera dokładnie kody kontraktu backendu."""
    api = _tekst(API_TS)
    blok = api.split("export type RodzajAnalizy =", 1)[1].split(";", 1)[0]
    kody_frontu = set(re.findall(r"'([a-z0-9_]+)'", blok))
    kody_backendu = {item.value for item in V126AnalysisType}
    assert kody_frontu == kody_backendu, (
        "Rozjazd unii rodzajów: "
        f"brakuje we froncie {sorted(kody_backendu - kody_frontu)}, "
        f"nadmiar we froncie {sorted(kody_frontu - kody_backendu)}"
    )


def test_kazdy_rodzaj_ma_zestaw_parametrow() -> None:
    """Komplet `V126AnalysisType` ma wpis w mapie parametrów okna (choćby pusty)."""
    parametry = _tekst(PARAMETRY_TS)
    mapa = parametry.split("PARAMETRY_RODZAJU", 1)[1].split("\n};", 1)[0]
    brak = [item.value for item in V126AnalysisType if f"{item.value}:" not in mapa]
    assert brak == [], f"Rodzaje bez zestawu parametrów w oknie: {brak}"


def test_kazdy_czytany_parametr_ma_kontrolke() -> None:
    """Każdy klucz `parameters` czytany przez solver ma kontrolkę albo jawny wyjątek."""
    solver = _tekst(SOLVER_PY)
    czytane = set(re.findall(r"param(?:eter)?s\.get\(\s*\"([a-z0-9_]+)\"", solver))
    assert czytane, "Nie wykryto żadnego odczytu parameters w solverze — parser do poprawy."
    parametry = _tekst(PARAMETRY_TS)
    klucze_frontu = set(re.findall(r"klucz:\s*'([a-z0-9_]+)'", parametry))
    braki = sorted(
        klucz
        for klucz in czytane
        if klucz not in klucze_frontu and klucz not in KLUCZE_BEZ_KONTROLKI
    )
    assert braki == [], (
        "Parametry czytane przez solver bez kontrolki w oknie akademickim: "
        f"{braki} (dodaj pole w parametry.ts albo wpisz uzasadniony wyjątek)"
    )


def test_wyjatki_bez_kontrolki_sa_realnie_czytane() -> None:
    """Lista wyjątków nie zawiera pozycji martwych (klucz przestał być czytany)."""
    solver = _tekst(SOLVER_PY)
    czytane = set(re.findall(r"param(?:eter)?s\.get\(\s*\"([a-z0-9_]+)\"", solver))
    martwe = sorted(klucz for klucz in KLUCZE_BEZ_KONTROLKI if klucz not in czytane)
    assert martwe == [], f"Wyjątki wskazujące klucze nieczytane już przez solver: {martwe}"


def test_powierzchnia_zastana_nie_wrocila() -> None:
    """Jedno wejście do zdolności V12.6: powierzchnia zastana pozostaje wygaszona."""
    zastana = (
        PROJECT_ROOT
        / "frontend"
        / "src"
        / "ui"
        / "workspace"
        / "surfaces"
        / "V126AcademicSurface.tsx"
    )
    assert not zastana.exists(), (
        "Powierzchnia zastana V126AcademicSurface wróciła — dwa równoległe wejścia "
        "do tej samej zdolności oznaczają dwa źródła prawdy o kontrakcie V12.6."
    )
