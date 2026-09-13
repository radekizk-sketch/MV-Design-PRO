"""Uprząż kwalifikacyjna — jedno polecenie, wynik MASZYNOWY.

CO TE TESTY PILNUJĄ. Przede wszystkim tego, żeby raport nie wyglądał na
kompletny będąc pustym. Pierwsza wersja uprzęży czytała pola wyniku porównania
integratorów przez ``getattr(..., None)`` i wypisywała ``null`` dla KAŻDEJ
pozycji — raport miał właściwy kształt i ani jednej liczby. To jest dokładnie ta
klasa cichej porażki, którą uprząż ma wykrywać, więc musi być przypięta testem.
"""

from __future__ import annotations

import dataclasses

import pytest
from dynamic_lab.mutacje import WynikSondy
from kwalifikacja import (
    KROKI_DRABINY_KWALIFIKACJI_S,
    RZAD_OCZEKIWANY_METODY,
    WYKONAWCA_SOND_DOMYSLNY,
    _braki_kwalifikacji,
    _luki_kwalifikacji,
    zbierz_raport,
)


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


#: Błędy ZMIERZONE na drabinie kwalifikacji (2026-09-13, horyzont 2 s) — pełna
#: populacja manifestu, nie wycinek. Wartości realne z benchmarku laboratorium;
#: wcześniejsza fikstura miała DWIE pozycje RK4 i to właśnie ona pozwalała
#: przegapić P1-DELTA-39: test „logiki kwalifikacji" nigdy nie widział populacji
#: niekompletnej, bo sam był niekompletny.
BLEDY_DRABINY = {
    "euler_jawny": {
        0.008: 8.099443e-02,
        0.004: 3.328120e-02,
        0.002: 1.513408e-02,
        0.001: 7.223967e-03,
    },
    "euler_niejawny": {
        0.008: 3.930221e-02,
        0.004: 2.315824e-02,
        0.002: 1.262421e-02,
        0.001: 6.597803e-03,
    },
    "trapez_niejawny": {
        0.008: 6.411643e-04,
        0.004: 1.604116e-04,
        0.002: 4.010749e-05,
        0.001: 1.002742e-05,
    },
    "rk4": {0.008: 3.692011e-07, 0.004: 2.303647e-08, 0.002: 1.438481e-09, 0.001: 8.975262e-11},
}


def _pozycje_pelne() -> list[dict]:
    """Pełny iloczyn manifestu: każda metoda × każdy szczebel drabiny, raz."""
    return [
        {
            "integrator": metoda,
            "krok_s": krok,
            "zbiegl": True,
            "blad_max_vs_odniesienie": BLEDY_DRABINY[metoda][krok],
        }
        for metoda in sorted(BLEDY_DRABINY)
        for krok in KROKI_DRABINY_KWALIFIKACJI_S
    ]


def _raport_minimalny(**nadpisz):
    podstawa = {
        "mutacje": {"przezyly_krytyczne": [], "liczba_mutacji": 13},
        "trajektoria_vs_andes": {"stan": "WYKONANE", "status": "zgodne_w_granicach_wzorca"},
        "czas_krytyczny_zwarcia": {"stan": "WYKONANE", "zgodne": True},
        "porownanie_integratorow": {"stan": "WYKONANE", "pozycje": _pozycje_pelne()},
        "residua_inicjalizacji": {"najgorsza_norma_pochodnej": 8.3267e-17},
    }
    podstawa.update(nadpisz)
    return podstawa


def _z_pozycjami(pozycje, **nadpisz):
    return _raport_minimalny(
        porownanie_integratorow={"stan": "WYKONANE", "pozycje": pozycje}, **nadpisz
    )


def _stan(raport) -> str:
    luki, braki = _luki_kwalifikacji(raport), _braki_kwalifikacji(raport)
    if luki:
        return "ODRZUCONE"
    return "NIEKOMPLETNE" if braki else "ZAKWALIFIKOWANE"


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
    """P1-DELTA-34: „zbiegł\" mówi o iteracji, nie o dokładności.

    KONTRPRZYKŁAD RECENZENTA: pozycja z ``zbiegl=True`` i błędem ``1e99`` oraz
    residuum inicjalizacji ``1e99`` przechodziły bez jednej luki — obie wielkości
    były liczone i drukowane, ale żadna nie miała kryterium.

    PRZEPISANY NA OBECNY KANON (P1-DELTA-39): populacja benchmarku to pełny
    iloczyn manifestu (4 metody × 4 szczeble), więc kontrprzykład wstrzykuje
    absurdalną wielkość W PEŁNĄ populację zamiast podstawiać skrawek. Intencja
    bez zmian: wielkość i residuum mają KRYTERIUM, nie tylko wydruk.
    """
    # Residuum absurdalne przy poprawnym benchmarku — luka po stronie residuum.
    raport = _raport_minimalny(residua_inicjalizacji={"najgorsza_norma_pochodnej": 1e99})
    luki = _luki_kwalifikacji(raport)
    assert any("Residuum inicjalizacji" in x for x in luki), luki

    # WIELKOŚĆ ABSURDALNA przy POPRAWNYM rzędzie też musi zostać złapana —
    # inaczej samo kryterium rzędu przepuszczałoby przebieg niosący nic.
    # Skalowanie 1e99 * (dt/dt_min)^4 zachowuje rząd 4 co do bitu.
    dt_min = min(KROKI_DRABINY_KWALIFIKACJI_S)
    absurd = [
        (
            dict(p, blad_max_vs_odniesienie=1e99 * (p["krok_s"] / dt_min) ** 4)
            if p["integrator"] == "rk4"
            else p
        )
        for p in _pozycje_pelne()
    ]
    luki_absurd = _luki_kwalifikacji(_z_pozycjami(absurd))
    assert any("najgęstszym kroku" in x for x in luki_absurd), luki_absurd
    assert not any(
        "zachowuje się jak rząd" in x for x in luki_absurd
    ), "rząd tej mutacji jest POPRAWNY — łapać ma ją wyłącznie kryterium wielkości"

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
    metody Eulera o błędach rzędu 1e-02 rad — całkowicie poprawnych dla rzędu 1 —
    więc kryterium odrzucało niezmieniony benchmark laboratorium deterministycznie.

    Jeden próg bezwzględny dla metod RÓŻNEGO RZĘDU jest błędny co do zasady:
    metoda rzędu 1 przy 8 ms MA mieć błąd rzędu 1e-2 rad. Kryterium porównuje
    więc rząd OBSERWOWANY z OCZEKIWANYM — ta sama reguła co w §5.

    PRZEPISANY NA DRABINĘ CZTEROSZCZEBLOWĄ (P2-DELTA-40). Intencja bez zmian;
    zmieniła się populacja, bo ocena rzędu idzie teraz po TRZECH parach
    sąsiednich, a nie po jednej parze skrajnej.
    """
    from kwalifikacja import (
        MAKS_ODCHYLENIE_RZEDU,
        MAKS_ODCHYLENIE_RZEDU_NAJGESTSZA_PARA,
        _luki_rzedu_integratorow,
    )

    # REALNE wartości benchmarku — muszą przechodzić, wszystkie cztery metody.
    assert (
        _luki_rzedu_integratorow(_pozycje_pelne()) == []
    ), "Kryterium odrzuca WŁASNY, niezmieniony benchmark laboratorium."

    # DRUGA STRONA: degradacja rzędu MUSI zostać złapana.
    dt_min = min(KROKI_DRABINY_KWALIFIKACJI_S)
    zdegradowane = [
        (
            dict(p, blad_max_vs_odniesienie=1.0e-9 * (p["krok_s"] / dt_min) ** 2)
            if p["integrator"] == "rk4"
            else p
        )
        for p in _pozycje_pelne()
    ]
    luki = _luki_rzedu_integratorow(zdegradowane)
    assert any("oczekuje rzędu 4" in x and "rząd 2.000" in x for x in luki), luki

    # Pasmo pary najgęstszej jest CIAŚNIEJSZE — tam asymptotyka ma obowiązywać.
    assert MAKS_ODCHYLENIE_RZEDU_NAJGESTSZA_PARA < MAKS_ODCHYLENIE_RZEDU
    assert MAKS_ODCHYLENIE_RZEDU == 0.5


# ---------------------------------------------------------------------------
# KOMPLETNOŚĆ I DZIEDZINA POPULACJI BENCHMARKU
# (recenzja niezależna, P1-DELTA-39 i P2-DELTA-40)
# ---------------------------------------------------------------------------


def test_pelna_populacja_manifestu_kwalifikuje() -> None:
    """Punkt odniesienia dla wszystkich mutacji poniżej — bez niego nic nie dowodzą.

    Kontrola bazowa: sonda musi przechodzić BEZ mutacji, inaczej jej czerwień po
    mutacji nie mówi nic o mutacji.
    """
    assert _stan(_raport_minimalny()) == "ZAKWALIFIKOWANE"
    assert len(_pozycje_pelne()) == len(RZAD_OCZEKIWANY_METODY) * len(KROKI_DRABINY_KWALIFIKACJI_S)


def test_populacja_bez_trzech_metod_NIE_jest_kwalifikacja() -> None:
    """P1-DELTA-39, kontrprzykład recenzenta: same dwie pozycje RK4 dawały kod 0.

    Ocena rzędu iterowała po nazwach OBECNYCH w raporcie i nigdy nie porównywała
    ich ze zbiorem oczekiwanym, więc benchmark mógł zgubić trzy metody z czterech
    i nadal ustanowić dodatni stan procesu.
    """
    tylko_rk4 = [p for p in _pozycje_pelne() if p["integrator"] == "rk4"]
    assert _stan(_z_pozycjami(tylko_rk4)) == "NIEKOMPLETNE"
    braki = _braki_kwalifikacji(_z_pozycjami(tylko_rk4))
    for metoda in ("euler_jawny", "euler_niejawny", "trapez_niejawny"):
        assert any(metoda in b for b in braki), metoda


@pytest.mark.parametrize("metoda", sorted(RZAD_OCZEKIWANY_METODY))
@pytest.mark.parametrize("krok", KROKI_DRABINY_KWALIFIKACJI_S)
def test_kazdy_brakujacy_szczebel_kazdej_metody_blokuje(metoda: str, krok: float) -> None:
    """ILOCZYN CECH, nie przykład z karty: metoda × szczebel, wszystkie 16.

    Pojedynczy przypadek „brakuje trapezu przy 2 ms" dowodzi tylko tego jednego
    przypadku. Dziura w manifeście może siedzieć w dowolnej z szesnastu komórek.
    """
    bez_jednej = [
        p for p in _pozycje_pelne() if not (p["integrator"] == metoda and p["krok_s"] == krok)
    ]
    assert _stan(_z_pozycjami(bez_jednej)) == "NIEKOMPLETNE"


def test_duplikat_szczebla_blokuje_zamiast_wywracac_ocene() -> None:
    """Duplikat dawał `ZeroDivisionError`: log(dt/dt) = 0 w mianowniku rzędu.

    Wyjątek w bramce nie jest ani blokadą, ani przepustką — jest awarią oceny.
    """
    z_duplikatem = _pozycje_pelne() + [
        {
            "integrator": "rk4",
            "krok_s": 0.002,
            "zbiegl": True,
            "blad_max_vs_odniesienie": 1.438481e-09,
        }
    ]
    assert _stan(_z_pozycjami(z_duplikatem)) == "ODRZUCONE"
    assert any("WIĘCEJ NIŻ RAZ" in luka for luka in _luki_kwalifikacji(_z_pozycjami(z_duplikatem)))


def test_metoda_spoza_manifestu_blokuje() -> None:
    """P1-DELTA-39: metoda `ghost` przechodziła, bo `INTEGRATORY.get` dawało None
    i pętla robiła `continue` — brak wpisu w rejestrze kończył ocenę, zamiast ją
    oblać."""
    z_obca = _pozycje_pelne() + [
        {"integrator": "ghost", "krok_s": 0.002, "zbiegl": True, "blad_max_vs_odniesienie": 1.0}
    ]
    assert _stan(_z_pozycjami(z_obca)) == "ODRZUCONE"


def test_krok_spoza_drabiny_blokuje() -> None:
    """Szczebel spoza drabiny nie mierzy rzędu tej drabiny."""
    z_obcym_krokiem = _pozycje_pelne() + [
        {"integrator": "rk4", "krok_s": 0.007, "zbiegl": True, "blad_max_vs_odniesienie": 1e-8}
    ]
    assert _stan(_z_pozycjami(z_obcym_krokiem)) == "ODRZUCONE"


@pytest.mark.parametrize("zly_blad", [0.0, -1.0, -5.0, float("nan"), float("inf"), float("-inf")])
def test_blad_poza_dziedzina_blokuje_zamiast_znikac_z_oceny(zly_blad: float) -> None:
    """P1-DELTA-39: `blad > 0` było FILTREM, nie warunkiem.

    Rekordy z zerem albo wartością ujemną wypadały z oceny rzędu i NIE tworzyły
    naruszenia — zbiór pusty nie daje luk. Zero w tym benchmarku nie oznacza
    metody dokładnej: żaden z tych czterech schematów nie odtwarza odniesienia
    co do bitu, więc zero znaczy utratę danych porównania.
    """
    zepsute = [
        dict(p, blad_max_vs_odniesienie=zly_blad) if p["integrator"] == "rk4" else p
        for p in _pozycje_pelne()
    ]
    assert _stan(_z_pozycjami(zepsute)) == "ODRZUCONE"


def test_rzad_oczekiwany_jest_przypiety_poza_metadana_implementacji() -> None:
    """P2-DELTA-40: wartość oczekiwana nie może pochodzić z ocenianej metadanej.

    Gdyby rząd oczekiwany był czytany z `INTEGRATORY[nazwa].rzad`, jednoczesna
    zmiana algorytmu i jego etykiety zachowałaby zgodność i bramka niczego by nie
    zauważyła. Manifest i rejestr to dwie NIEZALEŻNE deklaracje tej samej
    wielkości — mają się zgadzać albo głośno paść.
    """
    from dynamic_lab.calkowanie import INTEGRATORY

    assert set(RZAD_OCZEKIWANY_METODY) == set(
        INTEGRATORY
    ), "rejestr i manifest muszą obejmować ten sam zbiór metod"
    for nazwa, rzad in RZAD_OCZEKIWANY_METODY.items():
        assert INTEGRATORY[nazwa].rzad == rzad, nazwa


def test_rozjazd_manifestu_z_rejestrem_jest_luka(monkeypatch) -> None:
    """Deklaracja bez testu to fałszywa pewność — więc rozjazd MUSI paść."""
    import kwalifikacja as k
    from dynamic_lab.calkowanie import INTEGRATORY

    podmieniony = dict(INTEGRATORY)
    podmieniony["rk4"] = dataclasses.replace(INTEGRATORY["rk4"], rzad=3)
    monkeypatch.setattr(k, "INTEGRATORY", podmieniony)
    luki = _luki_kwalifikacji(_raport_minimalny())
    assert any("rozjazd deklaracji rzędu rk4" in luka for luka in luki), luki


def test_nowa_metoda_w_rejestrze_musi_wejsc_do_benchmarku(monkeypatch) -> None:
    """Metoda dołożona do rejestru nie może OMINĄĆ kwalifikacji.

    Bez tej kontroli nowy integrator byłby dostępny produkcyjnie, a benchmark
    nadal mierzyłby wyłącznie cztery stare — luka rosnąca w czasie.
    """
    import kwalifikacja as k
    from dynamic_lab.calkowanie import INTEGRATORY

    podmieniony = dict(INTEGRATORY)
    podmieniony["nowa_metoda"] = INTEGRATORY["rk4"]
    monkeypatch.setattr(k, "INTEGRATORY", podmieniony)
    luki = _luki_kwalifikacji(_raport_minimalny())
    assert any("nowa_metoda" in luka for luka in luki), luki


@pytest.mark.parametrize("metoda", sorted(RZAD_OCZEKIWANY_METODY))
def test_degradacja_rzedu_kazdej_metody_jest_wykrywana(metoda: str) -> None:
    """Rząd zdegradowany o połowę (pierwiastek z błędu) musi paść — dla KAŻDEJ
    metody, nie tylko dla tej z karty."""
    zdegradowane = [
        (
            dict(p, blad_max_vs_odniesienie=p["blad_max_vs_odniesienie"] ** 0.5)
            if p["integrator"] == metoda
            else p
        )
        for p in _pozycje_pelne()
    ]
    luki = _luki_kwalifikacji(_z_pozycjami(zdegradowane))
    assert any(metoda in luka and "zachowuje się jak rząd" in luka for luka in luki), luki


def test_drabina_ma_co_najmniej_trzy_ilorazy_bledow() -> None:
    """P2-DELTA-40: dwie próbki nie pokazują, czy rachunek jest w obszarze
    asymptotycznym. Cztery szczeble dają trzy pary sąsiednie na metodę."""
    assert len(KROKI_DRABINY_KWALIFIKACJI_S) >= 4
    kroki = sorted(KROKI_DRABINY_KWALIFIKACJI_S)
    ilorazy = [b / a for a, b in zip(kroki, kroki[1:], strict=False)]
    assert all(
        abs(i - 2.0) < 1e-9 for i in ilorazy
    ), f"drabina ma być geometryczna dt, dt/2, dt/4, dt/8 — ilorazy {ilorazy}"


# ---------------------------------------------------------------------------
# DZIEDZINA FLAGI ZBIEŻNOŚCI (recenzja niezależna, P1-DELTA-41)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "zbiegl",
    ["false", "true", "", 1, 0, 1.0, None, [], object()],
    ids=[
        "tekst_false",
        "tekst_true",
        "tekst_pusty",
        "int_1",
        "int_0",
        "float_1",
        "none",
        "lista",
        "obiekt",
    ],
)
def test_zbiegl_spoza_typu_logicznego_nie_kwalifikuje(zbiegl) -> None:
    """P1-DELTA-41: liczyła się PRAWDZIWOŚĆ obiektu, nie jego typ.

    KONTRPRZYKŁAD RECENZENTA: komplet 16 rekordów z ``zbiegl="false"`` — tekst
    niepusty, czyli prawdziwy w Pythonie — przechodził i selekcję danych, i
    listę pozycji niezbieżnych, dając ZAKWALIFIKOWANE. Zdeserializowany obiekt
    dowodowy potrafi zakodować porażkę literalnie jako tekst; bramka ma ją wtedy
    odczytać jako porażkę.

    ILOCZYN CECH: sprawdzane są OBIE strony prawdziwości (``"false"`` prawdziwe,
    ``0`` fałszywe) oraz typy, które mogłyby wyjść z JSON-a albo z ręcznie
    sklejonego raportu.
    """
    pozycje = [dict(p, zbiegl=zbiegl) for p in _pozycje_pelne()]
    assert _stan(_z_pozycjami(pozycje)) != "ZAKWALIFIKOWANE"


@pytest.mark.parametrize("pole", ["zbiegl", "blad_max_vs_odniesienie"])
def test_brak_wymaganego_pola_daje_werdykt_a_nie_wyjatek(pole: str) -> None:
    """Rekord bez pola kończył bramkę nieobsłużonym `KeyError`.

    Wyjątek nie jest werdyktem: bramka ma ODMÓWIĆ, a nie się wywrócić — inaczej
    nie odróżnisz awarii oceny od braku dowodu.
    """
    pozycje = [{k: v for k, v in p.items() if k != pole} for p in _pozycje_pelne()]
    assert _stan(_z_pozycjami(pozycje)) != "ZAKWALIFIKOWANE"


def test_tylko_dokladne_True_kwalifikuje() -> None:
    """Druga strona predykatu — bez niej test powyżej przechodziłby także dla
    bramki odrzucającej WSZYSTKO."""
    assert _stan(_z_pozycjami(_pozycje_pelne())) == "ZAKWALIFIKOWANE"
    assert all(p["zbiegl"] is True for p in _pozycje_pelne())
