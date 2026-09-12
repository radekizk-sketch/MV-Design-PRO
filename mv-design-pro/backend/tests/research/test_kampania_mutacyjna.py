"""Kampania mutacyjna — czy detektory laboratorium wykrywają ZMIANĘ W KODZIE.

PO CO OSOBNY POZIOM. Zielony zestaw testów dowodzi, że kod robi to, czego testy
żądają; NIE dowodzi, że testy żądają czegokolwiek istotnego. Mutacja wprowadza
ZNANY defekt i sprawdza, czy którykolwiek mechanizm go zauważy.

CO SIĘ ZMIENIŁO (audyt niezależny, plan naprawy §4). Poprzednia kampania
meldowała „16/16", a jej mutacje sprawdzały typy wyjątków, wartości wyliczeń i
etykiety — nie zmieniały kodu. Audyt wskazał wprost: po usunięciu walidacji
wyniku albo po zastąpieniu odcisku implementacji stałym SHA kampania nadal
zgłaszała komplet zabić. Dlatego te testy pilnują dziś DWÓCH rzeczy naraz:

1. RAMY — że „zabicie" ma sens: wymaga kontroli bazowej, nie zalicza błędu
   wykonania, nie uznaje pustej kampanii za brak luk, nie wyłącza żadnej klasy
   defektu z gotowości;
2. KATALOGU — że każda mutacja nazywa podmieniany kod i ma wykonywalne sondy.

Sam PRZEBIEG kampanii (dziesięć podmian kodu × dwa procesy potomne pytest)
jest kosztowny i należy do uprzęży kwalifikacyjnej (`research/kwalifikacja.py`),
a nie do zestawu testów — tu badamy ramę wstrzykniętym wykonawcą sond.
"""

from __future__ import annotations

from contextlib import nullcontext

import pytest
from dynamic_lab.katalog_mutacji import mutacja_po_identyfikatorze, mutacje_laboratorium
from dynamic_lab.mutacje import (
    KLASY_KRYTYCZNE,
    KlasaDefektu,
    Mutacja,
    WynikMutacji,
    WynikSondy,
    uruchom_kampanie,
)


def _mutacja(ident: str = "M-TEST", klasa: KlasaDefektu = KlasaDefektu.FIZYKA) -> Mutacja:
    return Mutacja(
        ident=ident,
        opis="mutacja testowa ramy",
        klasa=klasa,
        zakres="dynamic_lab.przyklad.funkcja",
        oczekiwany_detektor="detektor testowy",
        sondy=("tests/research/test_przykladowy.py",),
        zastosuj=nullcontext,
    )


def _wykonawca(*, baza_przechodzi: bool, mutacja_przechodzi: bool):
    def wykonaj(sondy: tuple[str, ...], mutacja: Mutacja | None) -> WynikSondy:
        przeszly = baza_przechodzi if mutacja is None else mutacja_przechodzi
        return WynikSondy(przeszly=przeszly, slad="ślad testowy", polecenie="polecenie testowe")

    return wykonaj


# ---------------------------------------------------------------------------
# RAMA — co znaczy „zabicie"
# ---------------------------------------------------------------------------


def test_zabicie_wymaga_ze_sondy_przechodza_BEZ_mutacji() -> None:
    """Sonda padająca już bez mutacji NIE dowodzi działania detektora.

    Bez tej kontroli „detektor" zwracający zawsze porażkę zabijałby komplet
    mutacji i dawał 100 % przy zerowej wartości poznawczej — czyli dokładnie tę
    fałszywą pewność, którą audyt wskazał w poprzedniej kampanii.
    """
    wynik = uruchom_kampanie(
        (_mutacja(),),
        wykonaj_sondy=_wykonawca(baza_przechodzi=False, mutacja_przechodzi=False),
    )
    assert wynik.zabite == 0
    assert wynik.raporty[0].wynik is WynikMutacji.SONDA_NIEWIARYGODNA
    assert wynik.przezyly_krytyczne, "niewiarygodna sonda MUSI być widoczna jako luka"


def test_zabicie_gdy_sondy_przechodza_bez_mutacji_i_pada_pod_nia() -> None:
    """DRUGA STRONA PREDYKATU — rama musi umieć zabić mutację."""
    wynik = uruchom_kampanie(
        (_mutacja(),),
        wykonaj_sondy=_wykonawca(baza_przechodzi=True, mutacja_przechodzi=False),
    )
    assert wynik.zabite == 1
    assert wynik.raporty[0].wynik is WynikMutacji.ZABITA
    assert wynik.raporty[0].slad_odtworzenia, "raport bez śladu odtworzenia nie jest sprawdzalny"
    assert wynik.bez_luk_krytycznych


def test_przezycie_gdy_sondy_przechodza_TAKZE_pod_mutacja() -> None:
    """Rama musi UMIEĆ zgłosić przeżycie — inaczej 100 % nic nie znaczy."""
    wynik = uruchom_kampanie(
        (_mutacja(),),
        wykonaj_sondy=_wykonawca(baza_przechodzi=True, mutacja_przechodzi=True),
    )
    assert wynik.zabite == 0
    assert wynik.raporty[0].wynik is WynikMutacji.PRZEZYLA
    assert not wynik.bez_luk_krytycznych


def test_wyjatek_w_przebiegu_sond_nie_liczy_sie_jako_zabicie() -> None:
    """``BLAD_WYKONANIA`` znaczy zepsuty przebieg, nie działający detektor."""

    def wybuch(sondy: tuple[str, ...], mutacja: Mutacja | None) -> WynikSondy:
        if mutacja is None:
            return WynikSondy(przeszly=True, slad="", polecenie="p")
        raise RuntimeError("przebieg sond nie doszedł do skutku")

    wynik = uruchom_kampanie((_mutacja(),), wykonaj_sondy=wybuch)
    assert wynik.zabite == 0
    assert wynik.raporty[0].wynik is WynikMutacji.BLAD_WYKONANIA
    assert wynik.przezyly_krytyczne


def test_pusta_kampania_NIE_MELDUJE_braku_luk() -> None:
    """„Nie ma luk" wyprowadzone z faktu, że niczego nie zbadano, jest kłamstwem.

    ``not ()`` dawałoby ciche ``True`` — ta sama klasa defektu, którą zamyka
    `DziennikKrokow.strict_convergence` dla pustego dziennika.
    """
    wynik = uruchom_kampanie(
        (), wykonaj_sondy=_wykonawca(baza_przechodzi=True, mutacja_przechodzi=False)
    )
    assert wynik.raporty == ()
    assert not wynik.bez_luk_krytycznych
    assert wynik.wynik_punktowy == 0.0


def test_kazda_klasa_defektu_liczy_sie_do_gotowosci() -> None:
    """KONTRAKT i TOŻSAMOŚĆ nie mogą być automatycznie wyłączone z gotowości.

    Poprzednia wersja uznawała za krytyczne wyłącznie FIZYKĘ i NUMERYKĘ, więc
    przeżycie mutacji kontraktu wyniku albo odcisku implementacji nie wpływało
    na nic — a to są mechanizmy, na których opiera się całe twierdzenie „ten
    wynik pochodzi z tego kodu i da się go podważyć" (plan naprawy §4).
    """
    assert KLASY_KRYTYCZNE == frozenset(KlasaDefektu)
    for klasa in KlasaDefektu:
        wynik = uruchom_kampanie(
            (_mutacja(klasa=klasa),),
            wykonaj_sondy=_wykonawca(baza_przechodzi=True, mutacja_przechodzi=True),
        )
        assert wynik.przezyly_krytyczne, f"przeżycie w klasie {klasa} nie jest widoczne"


def test_powtorzony_identyfikator_mutacji_jest_bledem() -> None:
    """Dwie mutacje o tej samej nazwie są nierozróżnialne w raporcie."""
    m = _mutacja()
    with pytest.raises(ValueError, match="Powtórzone"):
        uruchom_kampanie(
            (m, m), wykonaj_sondy=_wykonawca(baza_przechodzi=True, mutacja_przechodzi=False)
        )


def test_kontrola_bazowa_jest_liczona_RAZ_dla_tego_samego_zestawu_sond() -> None:
    """Kampania i tak jest kosztowna — powtarzanie kontroli byłoby marnotrawstwem.

    Test pilnuje też, że cache jest kluczowany ZESTAWEM SOND, a nie mutacją:
    inaczej dwie mutacje o tych samych sondach liczyłyby bazę dwa razy.
    """
    wywolania: list[Mutacja | None] = []

    def licznik(sondy: tuple[str, ...], mutacja: Mutacja | None) -> WynikSondy:
        wywolania.append(mutacja)
        return WynikSondy(przeszly=mutacja is None, slad="", polecenie="p")

    uruchom_kampanie(
        (_mutacja("M-A"), _mutacja("M-B")),
        wykonaj_sondy=licznik,
    )
    assert sum(1 for m in wywolania if m is None) == 1
    assert sum(1 for m in wywolania if m is not None) == 2


# ---------------------------------------------------------------------------
# KATALOG — każda mutacja nazywa kod i ma sondy
# ---------------------------------------------------------------------------


def test_mutacja_bez_zakresu_sond_lub_detektora_nie_ma_prawa_powstac() -> None:
    """Trzy pola są WYMAGANE, bo bez nich mutacja jest deklaracją, nie pomiarem."""
    wspolne = {
        "ident": "X",
        "opis": "x",
        "klasa": KlasaDefektu.FIZYKA,
        "zakres": "dynamic_lab.x",
        "oczekiwany_detektor": "d",
        "sondy": ("tests/research/test_x.py",),
        "zastosuj": nullcontext,
    }
    with pytest.raises(ValueError, match="ZAKRES"):
        Mutacja(**{**wspolne, "zakres": ""})
    with pytest.raises(ValueError, match="detektora"):
        Mutacja(**{**wspolne, "oczekiwany_detektor": ""})
    with pytest.raises(ValueError, match="sond"):
        Mutacja(**{**wspolne, "sondy": ()})


def test_katalog_pokrywa_dziewiec_defektow_wymienionych_w_planie_naprawy() -> None:
    """Plan naprawy §4 wymienia minimum, które kampania MUSI wykrywać.

    Sprawdzane po ZAKRESIE podmiany, nie po nazwie mutacji: nazwę da się dopisać
    bez zmiany kodu, zakres wskazuje konkretny element implementacji.
    """
    zakresy = {m.zakres for m in mutacje_laboratorium()}
    wymagane = {
        "dynamic_lab.wynik.WynikDynamiczny.__post_init__",
        "dynamic_lab.zdarzenia.WylaczenieGalezi.zastosuj",
        "dynamic_lab.skonczonosc.wymagaj_skonczonosci (4 miejsca importu)",
        "dynamic_lab.calkowanie._sprawozdanie_metody_jawnej",
        "dynamic_lab.urzadzenia.MaszynaSynchroniczna4Rzedu.pochodne_bez_regulatorow",
        "dynamic_lab.urzadzenia_oze.MagazynEnergiiBESS.bramka_energii",
        "dynamic_lab.siec.TopologiaSieci.z_wylaczona_galezia_po_id",
        "dynamic_lab.tozsamosc.odcisk_implementacji",
    }
    assert wymagane <= zakresy, f"Brak zakresów: {sorted(wymagane - zakresy)}"
    # Walidacja czasu i walidacja długości kanałów to DWA różne defekty w tym
    # samym zakresie — sprawdzamy, że są dwiema osobnymi mutacjami.
    kontrakt_wyniku = [
        m
        for m in mutacje_laboratorium()
        if m.zakres == "dynamic_lab.wynik.WynikDynamiczny.__post_init__"
    ]
    assert len(kontrakt_wyniku) == 2, [m.ident for m in kontrakt_wyniku]


def test_katalog_pokrywa_wszystkie_klasy_defektow() -> None:
    """Kampania badająca jedną klasę dawałaby złudzenie pokrycia."""
    obecne = {m.klasa for m in mutacje_laboratorium()}
    assert obecne == set(KlasaDefektu), f"Brak klas: {set(KlasaDefektu) - obecne}"


def test_kazda_mutacja_katalogu_wskazuje_istniejacy_plik_sondy() -> None:
    """Sonda wskazująca nieistniejący plik dałaby BŁĄD WYKONANIA, nie pomiar."""
    import pathlib

    korzen = pathlib.Path(__file__).resolve().parents[2]
    for mutacja in mutacje_laboratorium():
        for sonda in mutacja.sondy:
            assert (korzen / sonda).exists(), f"{mutacja.ident}: brak pliku sondy {sonda}"


def test_mutacja_po_identyfikatorze_odnajduje_i_melduje_brak() -> None:
    """Wejście procesu potomnego musi być jednoznaczne i głośne przy literówce."""
    assert mutacja_po_identyfikatorze("M-FIZ-02").zakres.endswith("bramka_energii")
    with pytest.raises(KeyError, match="Nieznana mutacja"):
        mutacja_po_identyfikatorze("M-NIE-MA")
