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

ROZSZERZENIE V126-WYGASZENIE (decyzja właściciela 2026-08-07). Wycofanie rodzaju
z toru projektanta ZAPALA ten strażnik — i dobrze, bo tak ma działać. Cichego
wykluczenia (usunięcie wpisu, obniżenie liczby, `skip`) NIE MA: front dzieli
komplet kontraktu na DWA rozłączne zbiory —

  * PREZENTOWANE — `PREZENTACJA` w `ui2/wyniki/akademickie/prezentacja.ts`,
  * NIEPREZENTOWANE — `POWODY_NIEPREZENTOWANIA` w `nieprezentowane.ts`, gdzie
    KAŻDY wpis niesie powód merytoryczny,

a ten strażnik sprawdza, że ich SUMA pokrywa komplet `V126AnalysisType` i że są
rozłączne. Dzięki temu rodzaj dopisany w backendzie nadal zapala czerwień — nie
może po cichu wpaść do worka „nieprezentowane", bo do worka trzeba go WPISAĆ
z powodem, a to jest decyzja, nie przeoczenie.
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
PREZENTACJA_TS = FRONT_AKADEMICKIE / "prezentacja.ts"
NIEPREZENTOWANE_TS = FRONT_AKADEMICKIE / "nieprezentowane.ts"
ROUTER_TSX = PROJECT_ROOT / "frontend" / "src" / "ui" / "workspace" / "WorkspaceSurfaceRouter.tsx"
SOLVER_PY = PROJECT_ROOT / "backend" / "src" / "network_model" / "solvers" / "v126_academic.py"
KONTROLA_JAKOSCI_PY = (
    PROJECT_ROOT
    / "backend"
    / "tests"
    / "application"
    / "reference_networks"
    / "test_ieee_benchmark_wiring.py"
)

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


# ---------------------------------------------------------------------------
# V126-WYGASZENIE — parytet z podziałem na prezentowane i nieprezentowane
# ---------------------------------------------------------------------------


def _rodzaje_prezentowane() -> set[str]:
    """Klucze pierwszego poziomu obiektu `PREZENTACJA` (rodzaje z projektem ekranu)."""
    tekst = _tekst(PREZENTACJA_TS)
    blok = tekst.split("export const PREZENTACJA", 1)[1].split("\n};", 1)[0]
    return set(re.findall(r"^  ([a-z0-9_]+): \{", blok, flags=re.MULTILINE))


def _rodzaje_nieprezentowane() -> dict[str, str]:
    """Rodzaje wycofane z toru projektanta wraz z powodem, wprost z rejestru frontu.

    Powód bywa łamany na kilka linii (konkatenacja `+`), więc zbieramy WSZYSTKIE
    literały napisowe należące do wpisu, aż do klucza następnego wpisu.
    """
    tekst = _tekst(NIEPREZENTOWANE_TS)
    blok = tekst.split("export const POWODY_NIEPREZENTOWANIA", 1)[1].split("\n};", 1)[0]
    wynik: dict[str, str] = {}
    biezacy: str | None = None
    for linia in blok.splitlines():
        naglowek = re.match(r"^  ([a-z0-9_]+):(.*)$", linia)
        if naglowek is not None:
            biezacy = naglowek.group(1)
            wynik[biezacy] = "".join(re.findall(r"'([^']*)'", naglowek.group(2)))
            continue
        if biezacy is not None:
            wynik[biezacy] += "".join(re.findall(r"'([^']*)'", linia))
    return wynik


def test_parser_rodzajow_frontu_cos_widzi() -> None:
    """Kontrola dodatnia parsera: cichy parser zwracający pustkę fałszowałby parytet.

    Bez tego testu zmiana formatowania `prezentacja.ts` mogłaby uczynić wszystkie
    poniższe asercje bezprzedmiotowymi — przy pustych zbiorach „suma pokrywa
    komplet" nigdy by nie zadziałało, a strażnik świeciłby na zielono.
    """
    prezentowane = _rodzaje_prezentowane()
    nieprezentowane = _rodzaje_nieprezentowane()
    assert len(prezentowane) > 5, f"Parser prezentacji do poprawy — zobaczył {prezentowane}"
    assert nieprezentowane, "Parser rejestru wycofań do poprawy — zobaczył pustkę"


def test_suma_prezentowanych_i_nieprezentowanych_pokrywa_kontrakt() -> None:
    """Każdy rodzaj kontraktu ma DECYZJĘ: albo projekt ekranu, albo powód wycofania.

    To jest sedno zakazu cichego wykluczenia. Rodzaj dopisany do
    `V126AnalysisType` i nieujęty w żadnym z dwóch zbiorów daje czerwień tutaj,
    a nie cichy brak w oknie projektanta.
    """
    kontrakt = {item.value for item in V126AnalysisType}
    prezentowane = _rodzaje_prezentowane()
    nieprezentowane = set(_rodzaje_nieprezentowane())
    bez_decyzji = sorted(kontrakt - prezentowane - nieprezentowane)
    nadmiar = sorted((prezentowane | nieprezentowane) - kontrakt)
    assert bez_decyzji == [], (
        "Rodzaje kontraktu bez decyzji o prezentacji: "
        f"{bez_decyzji} — dodaj projekt w prezentacja.ts albo wpis z powodem "
        "w nieprezentowane.ts (ciche pominięcie jest zabronione)"
    )
    assert nadmiar == [], f"Front zna rodzaje spoza kontraktu backendu: {nadmiar}"


def test_rodzaj_nie_moze_byc_jednoczesnie_prezentowany_i_wycofany() -> None:
    """Zbiory są ROZŁĄCZNE — inaczej „suma pokrywa komplet" dałoby się spełnić pozornie."""
    wspolne = sorted(_rodzaje_prezentowane() & set(_rodzaje_nieprezentowane()))
    assert wspolne == [], f"Rodzaje jednocześnie prezentowane i wycofane: {wspolne}"


def test_kazde_wycofanie_niesie_powod_merytoryczny() -> None:
    """Deklaracja rejestru „wpis wymaga powodu merytorycznego" MA PRZYPIĘTY TEST.

    Rejestr bez powodów osunąłby się do listy kodów — czyli do cichego
    wykluczenia w przebraniu jawnego rozstrzygnięcia.
    """
    for kod, powod in _rodzaje_nieprezentowane().items():
        assert len(powod) > 40, f"{kod}: powód wycofania pusty albo hasłowy ({powod!r})"
        assert (
            "poza zakresem" not in powod.lower()
        ), f"{kod}: odesłanie do zakresu karty nie jest powodem merytorycznym"


def test_zaden_ekran_trasowy_nie_prowadzi_do_rodzaju_wycofanego() -> None:
    """Wejście trasowe nie może obiecywać analizy zdjętej z toru projektanta.

    Mapa `RODZAJ_EKRANU_V126` wskazuje rodzaj wybierany z góry dla ekranu
    E-40…E-50. Rodzaj wycofany nie znalazłby się na liście wyboru okna, więc
    ekran po cichu pokazałby PIERWSZĄ pozycję katalogu — inną analizę niż
    obiecuje pozycja nawigacji.
    """
    tekst = _tekst(ROUTER_TSX)
    blok = tekst.split("const RODZAJ_EKRANU_V126", 1)[1].split("\n};", 1)[0]
    wskazywane = set(re.findall(r":\s*'([a-z0-9_]+)'", blok))
    assert wskazywane, "Parser mapy ekranów trasowych do poprawy — zobaczył pustkę."
    wycofane = set(_rodzaje_nieprezentowane())
    assert (
        wskazywane & wycofane == set()
    ), f"Ekrany trasowe wskazują rodzaje wycofane: {sorted(wskazywane & wycofane)}"


def test_zdolnosc_wycofana_ma_kontrole_jakosci() -> None:
    """Wycofanie z ekranu PRZENOSI zdolność do kontroli jakości, nie kasuje jej.

    Walidacja na sieciach odniesienia zniknęła z okna projektanta, więc jedyne,
    co ją jeszcze wykonuje, to test kontroli jakości. Gdyby zniknął i on,
    zdolność stałaby się martwym kodem, a pierwsza regresja solvera przeszłaby
    niezauważona — dokładnie ten scenariusz pilnuje ten test.
    """
    assert KONTROLA_JAKOSCI_PY.exists(), (
        "Zniknęła kontrola jakości walidacji referencyjnej "
        f"({KONTROLA_JAKOSCI_PY.name}) — zdolność wycofana z ekranu straciłaby "
        "jedyne miejsce, w którym jest naprawdę uruchamiana."
    )
    tresc = _tekst(KONTROLA_JAKOSCI_PY)
    assert (
        "V126AnalysisType.BENCHMARK_VALIDATION" in tresc
    ), "Kontrola jakości nie uruchamia już rodzaju BENCHMARK_VALIDATION."
    assert "build_ieee_frozen_solver_benchmark_references" in tresc, (
        "Kontrola jakości nie porównuje już solvera produkcyjnego z referencją "
        "niezależną — zostałby test tautologiczny."
    )


def test_rodzaj_wycofany_zachowuje_kontrakt_backendu() -> None:
    """Wycofanie dotyczy WYŁĄCZNIE prezentacji — kontrakt i katalog zostają nietknięte.

    Bez tego pinu „wycofanie z ekranu" mogłoby po cichu urosnąć do usunięcia
    zdolności z backendu, czego decyzja właściciela nie obejmuje.
    """
    kontrakt = {item.value for item in V126AnalysisType}
    for kod in _rodzaje_nieprezentowane():
        assert kod in kontrakt, (
            f"{kod} wypadł z kontraktu backendu — wycofanie miało zdjąć prezentację, "
            "nie zdolność."
        )
    # Etykieta PL zostaje: wynik tego rodzaju wczytany inną drogą (np. z zapisanego
    # przebiegu) ma być nazwany po polsku, a nie kodem kontraktu na ekranie.
    etykiety = _tekst(STRINGS_TS).split("ETYKIETY_RODZAJOW", 1)[1].split("};", 1)[0]
    for kod in _rodzaje_nieprezentowane():
        assert f"{kod}:" in etykiety, f"{kod}: wycofanie zabrało polską etykietę"


def test_margines_pu_zdjety_z_prezentacji_a_wskaznik_l_zostal() -> None:
    """Stabilność napięciowa: znika CAŁA rodzina wielkości z przybliżenia, zostaje L.

    `margin_percent = (lambda_max - 1) * 100 %`, więc zdjęcie samego marginesu
    z pozostawieniem krotności obciążenia byłoby zdjęciem tej samej liczby
    w jednej skali i zostawieniem jej w drugiej (KLASA, nie instancja).
    """
    tekst = _tekst(PREZENTACJA_TS)
    blok = tekst.split("  voltage_stability: {", 1)[1].split("\n  },", 1)[0]
    for pole in ("voltage_stability_margin_percent", "pv_curves", "lambda_max", "u_at_max"):
        assert f"'{pole}'" not in blok, f"Projekt ekranu wciąż czyta {pole}"
    assert "'l_index_per_bus'" in blok, "Wskaźnik L zniknął razem z marginesem"
    assert "L < 0,5" in blok, "Kryterium wskaźnika L zniknęło razem z marginesem"


def test_margines_pu_zostaje_w_odpowiedzi_solvera() -> None:
    """Kontrakty wyniku są FROZEN — pole zniknęło z EKRANU, nie z odpowiedzi.

    Dług nazwany wprost (`docs/v12xx/REJESTR_KONFLIKTOW.md`, V126-WYGASZENIE):
    albo policzyć realną krzywą P–U rozpływem, albo zdjąć pole przy zmianie
    wersji głównej. Ten test pilnuje, żeby „wycofanie z ekranu" nie przerodziło
    się w cichą zmianę kontraktu.
    """
    solver = _tekst(SOLVER_PY)
    assert '"voltage_stability_margin_percent": margin_min' in solver, (
        "Pole marginesu zniknęło z odpowiedzi solvera — to zmiana kontraktu FROZEN, "
        "a decyzja właściciela obejmowała wyłącznie prezentację."
    )
    assert '"pv_curves": pv_curves' in solver, "Krzywe P–U zniknęły z odpowiedzi solvera."
