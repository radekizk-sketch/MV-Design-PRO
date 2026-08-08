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
#: Plik kontroli jakości dla KAŻDEGO rodzaju wycofanego z toru projektanta.
#: Wpis w rejestrze wycofań bez pozycji tutaj zapala `test_zdolnosc_wycofana_ma_kontrole_jakosci`
#: — wycofanie ma PRZENOSIĆ zdolność do kontroli jakości, nie zostawiać jej bez konsumenta.
KONTROLA_JAKOSCI_WYCOFANYCH: dict[str, Path] = {
    "benchmark_validation": PROJECT_ROOT
    / "backend"
    / "tests"
    / "application"
    / "reference_networks"
    / "test_ieee_benchmark_wiring.py",
    "voltage_stability": PROJECT_ROOT
    / "backend"
    / "tests"
    / "test_v126_stabilnosc_bez_fabrykacji.py",
}

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

    Rodzaj zdjęty z okna projektanta traci JEDYNEGO widocznego konsumenta, więc
    bez testu stałby się martwym kodem, a pierwsza regresja solvera przeszłaby
    niezauważona.

    KLASA, NIE INSTANCJA (karta QU-FABRYKACJA): pierwotnie ten test wymieniał
    wprost jeden rodzaj i jeden plik. Drugie wycofanie pokazało, że taka postać
    NIE pilnuje klasy — nowy wpis w rejestrze przeszedłby bez żadnej kontroli
    jakości, bo test patrzył wyłącznie na rodzaj nazwany w karcie. Teraz wymóg
    jest zbiorowy: KAŻDY wpis rejestru wycofań musi mieć wskazany plik kontroli
    jakości, a plik musi realnie uruchamiać ten rodzaj.
    """
    tresci: dict[str, str] = {}
    for kod in _rodzaje_nieprezentowane():
        sciezka = KONTROLA_JAKOSCI_WYCOFANYCH.get(kod)
        assert sciezka is not None, (
            f"Rodzaj wycofany '{kod}' nie ma wskazanej kontroli jakości — dopisz plik "
            "do KONTROLA_JAKOSCI_WYCOFANYCH albo nie wycofuj zdolności bez pokrycia."
        )
        assert sciezka.exists(), (
            f"Zniknęła kontrola jakości rodzaju '{kod}' ({sciezka.name}) — zdolność "
            "wycofana z ekranu straciłaby jedyne miejsce, w którym jest uruchamiana."
        )
        tresci[kod] = _tekst(sciezka)
        assert (
            f"V126AnalysisType.{kod.upper()}" in tresci[kod]
        ), f"Kontrola jakości nie uruchamia już rodzaju {kod.upper()}."

    # Walidacja referencyjna dodatkowo NIE MOŻE być tautologią: porównuje wynik
    # naszego solvera z referencją z niezależnej implementacji.
    assert "build_ieee_frozen_solver_benchmark_references" in tresci["benchmark_validation"], (
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


def test_stabilnosc_napieciowa_nie_ma_juz_projektu_ekranu() -> None:
    """Stabilność napięciowa zeszła z ekranu w CAŁOŚCI (karta QU-FABRYKACJA).

    INTENCJA POPRZEDNIEGO PINU ZACHOWANA I ROZSZERZONA. Karta V126-WYGASZENIE
    zdjęła z ekranu rodzinę P–U i zostawiła wskaźnik L, bo „ma jawne kryterium".
    Pomiar karty QU-FABRYKACJA pokazał, że kryterium było jawne, ale LICZBA pod
    nim — nie: wskaźnik powstawał jako ``P/S_sc · 4`` (współczynnik bez pokrycia
    w danych i w normie, nazwa zapożyczona od opublikowanego wskaźnika liczonego
    zupełnie inaczej), a moc zwarciowa węzła, na której stał, jest podana dla
    1 z 315 szyn sieci odniesienia — dla reszty solver ją ZMYŚLAŁ. Skoro solver
    nie wyznacza już ŻADNEJ wielkości tej analizy, ekran nie ma czego pokazać.
    """
    prezentowane = _rodzaje_prezentowane()
    assert "voltage_stability" not in prezentowane, (
        "Stabilność napięciowa wróciła do PREZENTACJA — solver nie wyznacza dla niej "
        "żadnej wielkości, więc ekran pokazywałby same puste stany."
    )
    assert "voltage_stability" in _rodzaje_nieprezentowane(), (
        "Stabilność napięciowa zniknęła z obu zbiorów — to ciche wykluczenie, "
        "dokładnie to, czemu ten strażnik ma zapobiegać."
    )


def test_rodzina_pu_i_qu_zostaje_w_kontrakcie_solvera_jako_jawny_brak() -> None:
    """Kontrakty wyniku są FROZEN — zniknęła LICZBA, nie POLE.

    Poprzedni pin (V126-WYGASZENIE) czytał literał ``"…": margin_min``, czyli
    pilnował obecności pola PRZEZ nazwę zmiennej z wartością. Karta QU-FABRYKACJA
    zamyka dług nazwany w tamtym wierszu rejestru („albo policzyć realną krzywą
    P–U rozpływem, albo zdjąć pole przy zmianie wersji głównej") TRZECIĄ,
    addytywną drogą: pole zostaje w kontrakcie, wartością jest jawny brak.
    Dlatego pin czyta teraz ODPOWIEDŹ, a nie tekst źródła — asercja na literale
    nie odróżniłaby `None` od liczby.
    """
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AcademicInput, V126BusInput

    model = V126AcademicInput(
        buses=[V126BusInput(ref="B1", name="Szyna", nominal_kv=15.0, fault_level_mva=250.0)]
    )
    wynik = V126AcademicSolver().run(V126AnalysisType.VOLTAGE_STABILITY, model)["result"]

    for pole in ("pv_curves", "qv_curves", "l_index_per_bus", "modal_analysis"):
        assert pole in wynik, f"Pole {pole} zniknęło z kontraktu FROZEN odpowiedzi solvera."
    assert "voltage_stability_margin_percent" in wynik, (
        "Pole marginesu zniknęło z odpowiedzi solvera — to zmiana kontraktu FROZEN, "
        "a wycofanie miało zdjąć liczbę, nie pole."
    )
    assert wynik["voltage_stability_margin_percent"] is None
    for wiersz in wynik["pv_curves"] + wynik["qv_curves"] + wynik["l_index_per_bus"]:
        assert wiersz["bus_ref"] == "B1"
        assert len(wiersz["brak_danych"]) > 40, "Brak powodu merytorycznego przy wielkości"
