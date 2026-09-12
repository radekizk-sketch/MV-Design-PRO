"""Uprząż kwalifikacyjna — jedno polecenie, wynik MASZYNOWY.

CO TE TESTY PILNUJĄ. Przede wszystkim tego, żeby raport nie wyglądał na
kompletny będąc pustym. Pierwsza wersja uprzęży czytała pola wyniku porównania
integratorów przez ``getattr(..., None)`` i wypisywała ``null`` dla KAŻDEJ
pozycji — raport miał właściwy kształt i ani jednej liczby. To jest dokładnie ta
klasa cichej porażki, którą uprząż ma wykrywać, więc musi być przypięta testem.
"""

from __future__ import annotations

import pytest
from kwalifikacja import zbierz_raport


@pytest.fixture(scope="module")
def raport():
    return zbierz_raport(szybko=True)


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
