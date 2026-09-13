"""Uprząż kwalifikacyjna — jedno polecenie, wynik MASZYNOWY.

CO TE TESTY PILNUJĄ. Przede wszystkim tego, żeby raport nie wyglądał na
kompletny będąc pustym. Pierwsza wersja uprzęży czytała pola wyniku porównania
integratorów przez ``getattr(..., None)`` i wypisywała ``null`` dla KAŻDEJ
pozycji — raport miał właściwy kształt i ani jednej liczby. To jest dokładnie ta
klasa cichej porażki, którą uprząż ma wykrywać, więc musi być przypięta testem.
"""

from __future__ import annotations

import pytest
from dynamic_lab.mutacje import WynikSondy
from kwalifikacja import WYKONAWCA_SOND_DOMYSLNY, zbierz_raport


def _sondy_zastepcze(sondy, mutacja):
    """Wykonawca sond dla testów KSZTAŁTU raportu — nie uruchamia podprocesów.

    Realna kampania to dwadzieścia przebiegów pytest w procesach potomnych (61 s
    na tym laboratorium). Uruchamianie jej po to, żeby sprawdzić, czy raport ma
    właściwe pola, byłoby mierzeniem czegoś innego niż deklaruje test. Że wartość
    DOMYŚLNA jest realna, pilnuje `test_uprzaz_domyslnie_uruchamia_realne_sondy`.
    """
    return WynikSondy(przeszly=mutacja is None, slad="", polecenie="sondy zastępcze")


@pytest.fixture(scope="module")
def raport():
    return zbierz_raport(szybko=True, wykonaj_sondy=_sondy_zastepcze)


def test_uprzaz_domyslnie_uruchamia_realne_sondy() -> None:
    """Uprząż z atrapą zamiast sond meldowałaby zabicia bez uruchomienia czegokolwiek.

    Pin jest konieczny, bo wykonawca jest wstrzykiwalny: bez tego testu podmiana
    domyślnej wartości na atrapę przeszłaby niezauważona, a raport nadal
    wyglądałby jak pomiar.
    """
    from dynamic_lab.sonda_mutacyjna import wykonaj_sondy_w_podprocesie

    assert WYKONAWCA_SOND_DOMYSLNY is wykonaj_sondy_w_podprocesie


def test_raport_nie_nadaje_statusu_dowodowego(raport) -> None:
    """Uprząż MIERZY. Nie ma prawa promować warstwy dynamicznej."""
    assert raport["status_dowodowy"] == "UNVALIDATED_MODEL"
    assert "NIE nadaje statusu dowodowego" in raport["uwaga"]


def test_raport_niesie_odcisk_implementacji(raport) -> None:
    """Bez odcisku kodu wynik daje się przypisać do kodu, który go nie policzył."""
    odcisk = raport["odcisk_implementacji"]
    assert len(odcisk) == 64 and all(c in "0123456789abcdef" for c in odcisk)


def test_residua_inicjalizacji_sa_liczbami_a_nie_pustkami(raport) -> None:
    """Każdy przypadek MUSI podać zmierzoną normę pochodnej."""
    przypadki = raport["residua_inicjalizacji"]["przypadki"]
    assert przypadki, "Brak przypadków odniesienia — raport bez treści."
    for p in przypadki:
        assert isinstance(p["norma_pochodnej"], float)
        assert p["liczba_stanow"] > 0 and p["liczba_szyn"] > 0
    # Punkt startowy MUSI być równowagą — to jest sens tej sekcji.
    assert raport["residua_inicjalizacji"]["najgorsza_norma_pochodnej"] < 1.0e-8


def test_stan_wyroczni_zewnetrznych_jest_jawny(raport) -> None:
    """Pominięta wyrocznia MUSI być widoczna jako pominięta, nie jako brak wpisu."""
    raporty = raport["wyrocznie_zewnetrzne"]["raporty"]
    assert raporty
    for r in raporty:
        assert r["stan"] in {"DOSTEPNA", "POMINIETA"}
        if r["stan"] == "POMINIETA":
            assert r["powod"], "Pominięcie bez powodu jest nieodróżnialne od zaniedbania."


def test_kampania_mutacyjna_jest_w_raporcie(raport) -> None:
    m = raport["mutacje"]
    assert m["liczba_mutacji"] > 0
    assert m["zabite"] <= m["liczba_mutacji"]
    assert isinstance(m["przezyly_krytyczne"], list)


def test_porownanie_integratorow_niesie_LICZBY_a_nie_null() -> None:
    """REGRESJA CICHEJ PUSTKI: pola muszą być czytane wprost z kontraktu.

    Wersja z ``getattr(..., None)`` dawała raport pełen ``null`` i wyglądała na
    poprawną. Test żąda, żeby KAŻDA pozycja niosła zmierzony błąd i liczbę
    ewaluacji — a dodatkowo, żeby metoda wyższego rzędu miała mniejszy błąd, bo
    inaczej liczby mogłyby być prawdziwe i bezsensowne.
    """
    pelny = zbierz_raport(szybko=False)
    pozycje = pelny["porownanie_integratorow"]["pozycje"]
    assert pozycje, "Brak pozycji porównania integratorów."
    for p in pozycje:
        assert p["integrator"], "Pozycja bez nazwy integratora."
        assert isinstance(p["blad_max_vs_odniesienie"], float)
        assert p["ewaluacje_pochodnych"] > 0

    najgorszy_krok = max(p["krok_s"] for p in pozycje)
    na_kroku = {
        p["integrator"]: p["blad_max_vs_odniesienie"]
        for p in pozycje
        if p["krok_s"] == najgorszy_krok
    }
    # RK4 (rząd 4) musi być na tym samym kroku dokładniejszy od Eulera (rząd 1).
    assert na_kroku["rk4"] < na_kroku["euler_jawny"], na_kroku


def test_kod_wyjscia_mowi_o_lukach_a_nie_o_sukcesie(raport) -> None:
    """Zielony bieg uprzęży znaczy „brak luk krytycznych", nie „zwalidowane"."""
    assert raport["podsumowanie"]["luki_krytyczne"] == raport["mutacje"]["przezyly_krytyczne"]


# ---------------------------------------------------------------------------
# Trzy stany kwalifikacji + bramkowanie KAŻDEJ mierzonej wielkości
# (recenzja niezależna, P1-DELTA-33 i P1-DELTA-34)
# ---------------------------------------------------------------------------


def _raport_minimalny(**nadpisz):
    podstawa = {
        "mutacje": {"przezyly_krytyczne": [], "liczba_mutacji": 13},
        "trajektoria_vs_andes": {"stan": "WYKONANE", "status": "zgodne_w_granicach_wzorca"},
        "czas_krytyczny_zwarcia": {"stan": "WYKONANE", "zgodne": True},
        # DWIE pozycje na metodę, bo rzędu nie da się zmierzyć z jednego kroku —
        # wartości REALNE z benchmarku laboratorium, nie wymyślone.
        "porownanie_integratorow": {
            "stan": "WYKONANE",
            "pozycje": [
                {
                    "integrator": "rk4",
                    "krok_s": 0.002,
                    "zbiegl": True,
                    "blad_max_vs_odniesienie": 1.438481e-09,
                },
                {
                    "integrator": "rk4",
                    "krok_s": 0.010,
                    "zbiegl": True,
                    "blad_max_vs_odniesienie": 9.014917e-07,
                },
            ],
        },
        "residua_inicjalizacji": {"najgorsza_norma_pochodnej": 8.3267e-17},
    }
    podstawa.update(nadpisz)
    return podstawa


def test_pominiety_pomiar_NIE_jest_kwalifikacja() -> None:
    """P1-DELTA-33: brak dowodu nie może dać kodu 0.

    KONTRPRZYKŁAD RECENZENTA, odtworzony. `_luki_kwalifikacji` dodawało lukę dla
    trajektorii wyłącznie przy ``stan="WYKONANE"`` i ``status="niezgodne"``;
    ``POMINIETE`` przechodziło, więc bieg bez ANDES, bez CCT i bez porównania
    integratorów kończył się kodem 0 — czyli pominięcie ZRÓWNYWAŁO SIĘ z
    kwalifikacją.

    Rozstrzyga TRZECI stan: zdanie „nie wolno mylić pominięcia ani z porażką, ani
    z sukcesem" jest niewykonalne przy dwóch stanach, bo każdy brak musi wtedy
    wpaść do jednego z nich.
    """
    from kwalifikacja import _braki_kwalifikacji, _luki_kwalifikacji

    raport = _raport_minimalny(
        trajektoria_vs_andes={"stan": "POMINIETE"},
        czas_krytyczny_zwarcia={"stan": "POMINIETE"},
        porownanie_integratorow={"stan": "POMINIETE"},
    )
    # Pominięcie NIE jest luką — i to zostaje.
    assert _luki_kwalifikacji(raport) == []
    # ...ale JEST brakiem, nazwanym co do pozycji.
    braki = _braki_kwalifikacji(raport)
    assert len(braki) == 3, braki
    assert all("nie został wykonany" in b for b in braki), braki


def test_status_nierozstrzygniety_takze_nie_jest_kwalifikacja() -> None:
    """Porównanie WYKONANE, ale bez werdyktu, to nadal brak dowodu."""
    from kwalifikacja import _braki_kwalifikacji

    raport = _raport_minimalny(
        trajektoria_vs_andes={
            "stan": "WYKONANE",
            "status": "nierozstrzygniete",
            "nierozstrzygniete": ["odcinek po zdarzeniu bez pokrycia"],
        }
    )
    braki = _braki_kwalifikacji(raport)
    assert any("NIEROZSTRZYGNIĘTE" in b for b in braki), braki


def test_blad_integratora_i_residuum_sa_BRAMKOWANE_a_nie_tylko_mierzone() -> None:
    """P1-DELTA-34: „zbiegł" mówi o iteracji, nie o dokładności.

    KONTRPRZYKŁAD RECENZENTA: pozycja z ``zbiegl=True`` i błędem ``1e99`` oraz
    residuum inicjalizacji ``1e99`` przechodziły bez jednej luki — obie wielkości
    były liczone i drukowane, ale żadna nie miała kryterium.
    """
    from kwalifikacja import _luki_kwalifikacji

    raport = _raport_minimalny(
        porownanie_integratorow={
            "stan": "WYKONANE",
            "pozycje": [
                {
                    "integrator": "rk4",
                    "krok_s": 0.002,
                    "zbiegl": True,
                    "blad_max_vs_odniesienie": 1e99,
                }
            ],
        },
        residua_inicjalizacji={"najgorsza_norma_pochodnej": 1e99},
    )
    luki = _luki_kwalifikacji(raport)
    # Pojedyncza pozycja: rzędu nie da się zmierzyć — to BRAK pomiaru, nie zgoda.
    # (Komunikat zmienił się przy naprawie P1-DELTA-36: kryterium bezwzględne
    # zastąpił rząd obserwowany plus wielkość na kroku najgęstszym.)
    assert any("rzędu nie da się zmierzyć" in x for x in luki), luki
    assert any("Residuum inicjalizacji" in x for x in luki), luki

    # WIELKOŚĆ ABSURDALNA przy POPRAWNYM rzędzie też musi zostać złapana —
    # inaczej samo kryterium rzędu przepuszczałoby przebieg niosący nic.
    raport_absurd = _raport_minimalny(
        porownanie_integratorow={
            "stan": "WYKONANE",
            "pozycje": [
                {
                    "integrator": "rk4",
                    "krok_s": 0.002,
                    "zbiegl": True,
                    "blad_max_vs_odniesienie": 1e99,
                },
                {
                    "integrator": "rk4",
                    "krok_s": 0.010,
                    "zbiegl": True,
                    "blad_max_vs_odniesienie": 1e99 * 5.0**4,
                },
            ],
        }
    )
    luki_absurd = _luki_kwalifikacji(raport_absurd)
    assert any("najgęstszym kroku" in x for x in luki_absurd), luki_absurd

    # DRUGA STRONA PREDYKATU: wartości zmierzone realnie muszą przechodzić.
    assert _luki_kwalifikacji(_raport_minimalny()) == []


def test_wartosci_niepoprawne_tez_sa_luka_a_nie_przechodza_przez_porownanie() -> None:
    """``NaN > próg`` jest fałszem — bez jawnej kontroli przeszedłby jako zgodny."""
    from kwalifikacja import _luki_kwalifikacji

    for zla in (float("nan"), float("inf")):
        raport = _raport_minimalny(residua_inicjalizacji={"najgorsza_norma_pochodnej": zla})
        assert any("Residuum inicjalizacji" in x for x in _luki_kwalifikacji(raport)), zla


def test_WYKONANE_bez_werdyktu_i_bez_pozycji_NIE_jest_kwalifikacja() -> None:
    """P1-DELTA-35: `WYKONANE` nie znaczy „zmierzone".

    KONTRPRZYKŁAD RECENZENTA. `_braki_kwalifikacji` sprawdzało tylko
    ``stan != "WYKONANE"`` oraz DOKŁADNIE ``status == "nierozstrzygniete"``, więc
    sekcja bez pola `status`, sekcja ze statusem nieznanym i porównanie z PUSTĄ
    listą pozycji przechodziły jako kwalifikacja. Pusta lista nie daje żadnych
    naruszeń, więc „zero błędów" wychodziło z braku danych, nie z ich jakości.

    To jest SIÓDMY raz w tej sesji, gdy naprawiłem INSTANCJĘ zamiast KLASY:
    poprzednia runda zamknęła `POMINIETE` i `nierozstrzygniete`, czyli dwa
    wymienione przypadki, a nie zbiór „status, którego nie rozpoznajemy".
    """
    from kwalifikacja import _braki_kwalifikacji

    baza = {
        "mutacje": {"przezyly_krytyczne": [], "liczba_mutacji": 13},
        "czas_krytyczny_zwarcia": {"stan": "WYKONANE", "zgodne": True},
        "residua_inicjalizacji": {"najgorsza_norma_pochodnej": 0.0},
    }
    raport = dict(
        baza,
        trajektoria_vs_andes={"stan": "WYKONANE"},
        porownanie_integratorow={"stan": "WYKONANE", "pozycje": []},
    )
    braki = _braki_kwalifikacji(raport)
    assert any("brak wymaganego pola" in b for b in braki), braki
    assert any("zero pozycji" in b for b in braki), braki


def test_status_spoza_zamknietego_zbioru_nie_jest_statusem_dobrym() -> None:
    """Werdykt, którego uprząż nie umie odczytać, nie może liczyć się na plus."""
    from kwalifikacja import STATUSY_ROZPOZNAWANE, _braki_kwalifikacji

    raport = {
        "mutacje": {"przezyly_krytyczne": [], "liczba_mutacji": 13},
        "trajektoria_vs_andes": {"stan": "WYKONANE", "status": "dowolny_nieznany"},
        "czas_krytyczny_zwarcia": {"stan": "WYKONANE", "zgodne": True},
        "porownanie_integratorow": {
            "stan": "WYKONANE",
            "pozycje": [
                {
                    "integrator": "rk4",
                    "krok_s": 0.002,
                    "zbiegl": True,
                    "blad_max_vs_odniesienie": 1.4e-9,
                },
                {
                    "integrator": "rk4",
                    "krok_s": 0.010,
                    "zbiegl": True,
                    "blad_max_vs_odniesienie": 9.0e-7,
                },
            ],
        },
        "residua_inicjalizacji": {"najgorsza_norma_pochodnej": 0.0},
    }
    assert any("spoza zamkniętego zbioru" in b for b in _braki_kwalifikacji(raport)), raport
    assert "zgodne_w_granicach_wzorca" in STATUSY_ROZPOZNAWANE


def test_kryterium_integratorow_MIERZY_RZAD_a_nie_bezwzgledny_blad() -> None:
    """P1-DELTA-36: jeden próg bezwzględny odrzucał WŁASNY benchmark.

    KOREKTA MOJEGO BŁĘDU. Próg 1e-2 rad dobrałem z liczb RK4 i trapezu
    (1,438e-09 … 1,002e-03), które akurat miałem przepisane w raporcie, i NIE
    uruchomiłem pełnej uprzęży po dołożeniu bramki. Zestaw zawiera także dwie
    metody Eulera o błędach 1,262e-02 … 1,119e-01 rad — całkowicie poprawnych dla
    rzędu 1 — więc kryterium odrzucało niezmieniony benchmark laboratorium
    deterministycznie.

    Jeden próg bezwzględny dla metod RÓŻNEGO RZĘDU jest błędny co do zasady:
    metoda rzędu 1 przy 10 ms MA mieć błąd rzędu 0,1 rad. Kryterium porównuje
    więc rząd OBSERWOWANY z ZADEKLAROWANYM — ta sama reguła co w §5.

    ZMIERZONE odchylenia: euler_jawny 0,243, euler_niejawny 0,204, rk4 0,002,
    trapez 0,001.
    """
    from kwalifikacja import MAKS_ODCHYLENIE_RZEDU, _luki_rzedu_integratorow

    # REALNE wartości benchmarku — muszą przechodzić.
    rzeczywiste = [
        {"integrator": "euler_jawny", "krok_s": 0.002, "blad_max_vs_odniesienie": 1.513408e-02},
        {"integrator": "euler_jawny", "krok_s": 0.010, "blad_max_vs_odniesienie": 1.119439e-01},
        {"integrator": "euler_niejawny", "krok_s": 0.002, "blad_max_vs_odniesienie": 1.262421e-02},
        {"integrator": "euler_niejawny", "krok_s": 0.010, "blad_max_vs_odniesienie": 4.544961e-02},
        {"integrator": "rk4", "krok_s": 0.002, "blad_max_vs_odniesienie": 1.438481e-09},
        {"integrator": "rk4", "krok_s": 0.010, "blad_max_vs_odniesienie": 9.014917e-07},
        {"integrator": "trapez_niejawny", "krok_s": 0.002, "blad_max_vs_odniesienie": 4.010749e-05},
        {"integrator": "trapez_niejawny", "krok_s": 0.010, "blad_max_vs_odniesienie": 1.001828e-03},
    ]
    assert (
        _luki_rzedu_integratorow(rzeczywiste) == []
    ), "Kryterium odrzuca WŁASNY, niezmieniony benchmark laboratorium."

    # DRUGA STRONA: degradacja rzędu MUSI zostać złapana.
    zdegradowane = [
        {"integrator": "rk4", "krok_s": 0.002, "blad_max_vs_odniesienie": 1.0e-6},
        {"integrator": "rk4", "krok_s": 0.010, "blad_max_vs_odniesienie": 2.5e-5},
    ]
    luki = _luki_rzedu_integratorow(zdegradowane)
    assert any("deklaruje rząd 4" in x and "rząd 2.000" in x for x in luki), luki

    # Jedna pozycja nie daje rzędu — to BRAK pomiaru, nie cicha zgoda.
    assert _luki_rzedu_integratorow(
        [{"integrator": "rk4", "krok_s": 0.002, "blad_max_vs_odniesienie": 1.0e-9}]
    ), "Pojedyncza pozycja przeszła bez zmierzenia rzędu."
    assert MAKS_ODCHYLENIE_RZEDU == 0.5
