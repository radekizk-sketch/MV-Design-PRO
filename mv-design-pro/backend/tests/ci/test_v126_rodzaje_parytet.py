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
from typing import Any

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
#: Most ENM → wejście solvera (karta B-02): część parametrów projektanta czyta MOST,
#: nie solver (liczba odbiorców per szyna wchodzi do `V126BusInput.customer_count`).
MOST_PY = PROJECT_ROOT / "backend" / "src" / "solver_input" / "v126_contracts.py"
#: Plik kontroli jakości dla KAŻDEGO rodzaju wycofanego z toru projektanta.
#: Wpis w rejestrze wycofań bez pozycji tutaj zapala `test_zdolnosc_wycofana_ma_kontrole_jakosci`
#: — wycofanie ma PRZENOSIĆ zdolność do kontroli jakości, nie zostawiać jej bez konsumenta.
KONTROLA_JAKOSCI_WYCOFANYCH: dict[str, Path] = {
    # K2 (2026-09-09): przeniesiony z tests/application/reference_networks/ —
    # `application/reference_networks/**` (dawny dialekt benchmarków) skasowany
    # w całości; kontrola jakości przepięta na tor kanoniczny (ENM-bliźniaki),
    # patrz `tests/golden/parytet_benchmarkow/kontrola_v126.py`.
    "benchmark_validation": PROJECT_ROOT
    / "backend"
    / "tests"
    / "golden"
    / "parytet_benchmarkow"
    / "test_ieee_benchmark_wiring.py",
    "voltage_stability": PROJECT_ROOT
    / "backend"
    / "tests"
    / "test_v126_stabilnosc_bez_fabrykacji.py",
    # Karta W3-E (2026-09-09): `hosting_capacity`/`opf_loss_lcc` duplikują kanon
    # liczony gdzie indziej i 410-ują na POST (`tests/api/test_v126_opf_loss_lcc_api.py`
    # pilnuje SAMEGO wycofania), ale zdolność SOLWERA zostaje uruchamiana wprost
    # w `test_v126_sanity_bounds.py` (`_run(V126AnalysisType.HOSTING_CAPACITY, …)`
    # / `_run(V126AnalysisType.OPF_LOSS_LCC)`, `.run()` publiczne, nie metoda
    # prywatna) — ten sam plik dla obu, bo to jedna klasa kontroli (sanity-bounds
    # solvera), nie dwa niezależne testy.
    "hosting_capacity": PROJECT_ROOT / "backend" / "tests" / "test_v126_sanity_bounds.py",
    "opf_loss_lcc": PROJECT_ROOT / "backend" / "tests" / "test_v126_sanity_bounds.py",
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
    # Karta B-02: liczba odbiorców per szyna to lista wierszy (szyna → liczba) z własnym
    # formularzem `POLA_ODBIORCOW`; czyta ją most (`odbiorcy_z_parametrow`), nie solver.
    "customer_counts": "lista złożona — POLA_ODBIORCOW (szyna → liczba odbiorców)",
}


def _klucze_czytane() -> set[str]:
    """Klucze `parameters` czytane przez solver ALBO most (jedno źródło dla obu testów)."""
    tekst = _tekst(SOLVER_PY) + _tekst(MOST_PY)
    return set(re.findall(r"param(?:eter)?s\.get\(\s*\"([a-z0-9_]+)\"", tekst))


def _kontrolki_frontu() -> tuple[set[str], set[str]]:
    """(klucze pól, klucze list złożonych) zadeklarowane w `parametry.ts`."""
    parametry = _tekst(PARAMETRY_TS)
    pola = set(re.findall(r"klucz:\s*'([a-z0-9_]+)'", parametry))
    listy = set(re.findall(r"lista:\s*'([a-z0-9_]+)'", parametry))
    return pola, listy


def _tekst(sciezka: Path) -> str:
    return sciezka.read_text(encoding="utf-8")


def test_kazdy_rodzaj_ma_etykiete_pl_w_oknie() -> None:
    """Komplet `V126AnalysisType` ma etykietę PL w oknie — TĘ SAMĄ, którą niesie karta katalogu.

    Karta B-02 / W3-E: katalog kart z backendu (`GET /api/catalog/v126/analysis-catalog`)
    jest JEDYNYM źródłem nazw, pytań inżynierskich, zakresów i podstaw oceny — okno nie
    trzyma własnych opisów (dawne `OPISY_RODZAJOW` skasowane). Etykieta frontu
    (`ETYKIETY_RODZAJOW`) zostaje wyłącznie dla wyników wczytanych bez katalogu (zapisany
    przebieg) i MUSI być lustrem `nazwa_pl` karty — inaczej ten sam rodzaj miałby dwie
    nazwy na dwóch ekranach.
    """
    from application.analyses.v126_katalog import katalog_do_dict

    strings = _tekst(STRINGS_TS)
    etykiety = strings.split("ETYKIETY_RODZAJOW", 1)[1].split("};", 1)[0]
    brak_etykiety = [item.value for item in V126AnalysisType if f"{item.value}:" not in etykiety]
    assert brak_etykiety == [], f"Rodzaje bez etykiety PL w oknie: {brak_etykiety}"
    assert (
        "OPISY_RODZAJOW" not in strings
    ), "Okno znów trzyma własne opisy rodzajów — druga kopia katalogu backendu (karta B-02 §0.1)"
    etykiety_frontu = dict(
        re.findall(r"^\s*([a-z0-9_]+):\s*'([^']*)'", etykiety, flags=re.MULTILINE)
    )
    nazwy_backendu = {karta["kod"]: karta["nazwa_pl"] for karta in katalog_do_dict()}
    assert set(nazwy_backendu) == {item.value for item in V126AnalysisType}
    rozjazd = {
        kod: (etykiety_frontu.get(kod), nazwa)
        for kod, nazwa in nazwy_backendu.items()
        if etykiety_frontu.get(kod) != nazwa
    }
    assert rozjazd == {}, f"Etykieta okna ≠ nazwa karty katalogu (front, backend): {rozjazd}"


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
    """Każdy klucz `parameters` czytany przez solver albo most ma kontrolkę albo jawny wyjątek."""
    czytane = _klucze_czytane()
    assert czytane, "Nie wykryto żadnego odczytu parameters w solverze — parser do poprawy."
    pola, listy = _kontrolki_frontu()
    klucze_frontu = pola | listy
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
    czytane = _klucze_czytane()
    martwe = sorted(klucz for klucz in KLUCZE_BEZ_KONTROLKI if klucz not in czytane)
    assert martwe == [], f"Wyjątki wskazujące klucze nieczytane już przez solver: {martwe}"


def test_kazdy_parametr_karty_katalogu_ma_kontrolke() -> None:
    """Karta B-02: każdy parametr `od_uzytkownika` karty katalogu ma kontrolkę w oknie.

    Katalog obiecuje projektantowi pole („dane od użytkownika"), więc pole musi dać się
    wypełnić — inaczej gotowość NIEPOTWIERDZONA byłaby nie do zamknięcia z ekranu.
    Klucze złożone: `motors[].rated_kw` → lista `motors` + pole `rated_kw`;
    `earthing.rho1_ohm_m` → obiekt uziomu + pole `rho1_ohm_m`.
    """
    from application.analyses.v126_katalog import katalog_do_dict

    pola, listy = _kontrolki_frontu()
    braki: list[str] = []
    for karta in katalog_do_dict():
        for parametr in karta["dane"]["od_uzytkownika"]:
            klucz = parametr["klucz"]
            baza, _, lisc = klucz.replace("[]", "").partition(".")
            if klucz in pola or klucz in listy:
                continue
            if baza in listy and lisc in pola:
                continue
            if baza in KLUCZE_BEZ_KONTROLKI and (lisc == "" or lisc in pola):
                continue
            braki.append(f"{karta['kod']}: {klucz}")
    assert braki == [], f"Parametry karty katalogu bez kontrolki w oknie: {braki}"


def _zestawy_frontu() -> dict[str, dict[str, Any]]:
    """Zestaw parametrów okna per rodzaj: pola, listy, obiekt uziomu, metody detekcji."""
    tekst = _tekst(PARAMETRY_TS)
    blok = tekst.split("export const PARAMETRY_RODZAJU", 1)[1].split("\n};", 1)[0]
    wynik: dict[str, dict[str, Any]] = {}
    biezacy: str | None = None
    for linia in blok.splitlines():
        naglowek = re.match(r"^  ([a-z0-9_]+): (.*)$", linia)
        if naglowek is not None:
            biezacy = naglowek.group(1)
            wynik[biezacy] = {"pola": set(), "listy": set(), "uziom": False, "metody": False}
            linia = naglowek.group(2)
        if biezacy is None:
            continue
        wynik[biezacy]["pola"] |= set(re.findall(r"klucz:\s*'([a-z0-9_]+)'", linia))
        wynik[biezacy]["listy"] |= set(re.findall(r"lista:\s*'([a-z0-9_]+)'", linia))
        if re.search(r"uziom:\s*true", linia):
            wynik[biezacy]["uziom"] = True
        if re.search(r"metodyDetekcji:\s*true", linia):
            wynik[biezacy]["metody"] = True
    return wynik


def test_parser_zestawow_frontu_cos_widzi() -> None:
    """Kontrola dodatnia parsera zestawów — pustka fałszowałaby test fantomów."""
    zestawy = _zestawy_frontu()
    assert set(zestawy) == {item.value for item in V126AnalysisType}
    assert zestawy["motor_starting"]["listy"] == {"motors"}
    assert zestawy["earthing_safety"]["uziom"] is True
    assert "neutral_grounding" in zestawy["earth_fault_detection"]["pola"]


def test_zadna_kontrolka_okna_nie_jest_fantomem() -> None:
    """Zero fabrykacji (phantom rule): kontrolka rodzaju PREZENTOWANEGO ma parametr w karcie.

    Kontrolka, której backend nie czyta, jest zakazana (dyrektywa właściciela 3).
    Rodzaje wycofane z powierzchni (410 na POST) nie renderują formularza — ich zestawy
    zostają jako dokumentacja kontraktu historycznych biegów i są poza tą regułą.
    """
    from application.analyses.v126_katalog import katalog_do_dict

    karty = {karta["kod"]: karta for karta in katalog_do_dict()}
    fantomy: list[str] = []
    for kod, zestaw in _zestawy_frontu().items():
        karta = karty[kod]
        if not karta["prezentowany"]:
            continue
        klucze = {parametr["klucz"] for parametr in karta["dane"]["od_uzytkownika"]}
        bazy = {re.split(r"[\[.]", klucz)[0] for klucz in klucze}
        fantomy.extend(
            f"{kod}: pole {pole}" for pole in sorted(zestaw["pola"]) if pole not in klucze
        )
        fantomy.extend(
            f"{kod}: lista {lista}" for lista in sorted(zestaw["listy"]) if lista not in bazy
        )
        if zestaw["uziom"] and "earthing" not in bazy:
            fantomy.append(f"{kod}: obiekt uziomu bez parametrów `earthing.*` w karcie")
        if zestaw["metody"] and "relay_methods" not in klucze:
            fantomy.append(f"{kod}: metody detekcji bez parametru `relay_methods` w karcie")
    assert fantomy == [], f"Kontrolki bez pokrycia w karcie katalogu (fantomy): {fantomy}"


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
