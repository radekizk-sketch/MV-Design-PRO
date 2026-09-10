"""Walidacja MAPOWANIA parametrów na przypadku autorstwa ANDES (dowód C1/W3).

KOD BADAWCZY — patrz `backend/research/README.md`.

Odpowiedź na zarzut przeglądu: „ANDES jest niezależną implementacją, ale adapter
przypadku i mapowanie parametrów napisałeś Ty, więc pozostaje wspólny punkt
ryzyka". Ten plik ten punkt zamyka na tyle, na ile da się go zamknąć bez
budowania własnego narzędzia: bierze przypadek DOSTARCZONY Z ANDES i sprawdza,
czy nasza interpretacja jego pól odtwarza wartość własną, którą ANDES sam
policzył.

Bramkowane `importorskip("andes")` — dopóki ANDES nie jest zależnością
deweloperską w CI, jest to narzędzie badawcze, a nie obowiązująca bramka.
"""

from __future__ import annotations

import math

import pytest

andes = pytest.importorskip("andes", reason="ANDES nie jest zależnością repozytorium")

from dynamic_lab.wzorzec_natywny import (  # noqa: E402
    PRZYPADEK_SMIB,
    BrakPrzypadkuNatywnegoError,
    ParametryNatywne,
    parametry_smib_natywnego,
    raport,
)

#: Zapas nad zmierzonym 6,5e-08. Nie jest dobrany pod wynik: to jest rząd
#: wielkości, poniżej którego różnica przestaje mówić cokolwiek o mapowaniu,
#: a zaczyna o arytmetyce zmiennoprzecinkowej solvera wartości własnych.
TOL_MAPOWANIA = 1.0e-5


@pytest.fixture(scope="module")
def natywny() -> ParametryNatywne:
    return parametry_smib_natywnego()


def test_nasza_interpretacja_pol_odtwarza_wartosc_wlasna_andes(natywny) -> None:
    """Jeżeli źle rozumiemy `M`, `xd1`, `fn` albo `D` — ta liczba nie wyjdzie.

    To jest cały sens tego testu: przypadek nie jest nasz, więc zgodność nie
    może wynikać ze wspólnego błędu interpretacji wejścia.
    """
    assert natywny.blad_wzgledny < TOL_MAPOWANIA, (
        f"Nasz wzór daje {natywny.f_tlumiona_hz:.6f} Hz, ANDES "
        f"{natywny.f_wlasna_andes_hz:.6f} Hz — błąd {natywny.blad_wzgledny:.2e}. "
        "Mapowanie parametrów jest niezgodne z konwencją ANDES."
    )


def test_uwzglednienie_tlumienia_POPRAWIA_zgodnosc_o_rzedy_wielkosci(natywny) -> None:
    """Potwierdza, że `D` wchodzi do równania wahań tak samo jak u nas.

    Gdyby `D` w ANDES znaczyło coś innego (np. tłumienie asynchroniczne
    zależne od poślizgu), uwzględnienie go NIE poprawiłoby zgodności —
    a poprawia o trzy rzędy wielkości.
    """
    assert natywny.d_tlumienie > 0.0, "przypadek bez tłumienia nie sprawdza tej osi"
    assert natywny.blad_wzgledny < natywny.blad_gdyby_pominac_tlumienie / 100.0, (
        f"z tłumieniem {natywny.blad_wzgledny:.2e}, bez tłumienia "
        f"{natywny.blad_gdyby_pominac_tlumienie:.2e} — brak wyraźnej poprawy "
        "znaczy, że `D` nie wchodzi tak, jak zakładamy."
    )


def test_m_jest_interpretowane_jako_dwa_h(natywny) -> None:
    """Pin do konkretnego przypisania: `M = 2H`, nie `M = H`."""
    assert natywny.h_s == pytest.approx(natywny.m_pu / 2.0)
    # Gdyby `M` znaczyło `H`, częstotliwość wyszłaby √2 razy większa.
    blednie = math.sqrt(natywny.omega_s * natywny.moc_synchronizujaca / natywny.m_pu * 2.0) / (
        2.0 * math.pi
    )
    assert abs(blednie - natywny.f_wlasna_andes_hz) / natywny.f_wlasna_andes_hz > 0.3


def test_fn_jest_interpretowane_jako_baza_czestotliwosci(natywny) -> None:
    """Przypadek natywny jest 60-hercowy — i to jest sprawdzian, nie problem.

    Gdyby nasza interpretacja `fn` była błędna (np. gdybyśmy wstawiali sztywne
    50 Hz), wynik rozjechałby się o √(60/50) = 1,0954.
    """
    assert natywny.fn_hz == pytest.approx(60.0)
    blednie = math.sqrt(2.0 * math.pi * 50.0 * natywny.moc_synchronizujaca / natywny.m_pu) / (
        2.0 * math.pi
    )
    stosunek = natywny.f_wlasna_andes_hz / blednie
    assert stosunek == pytest.approx(math.sqrt(60.0 / 50.0), rel=1.0e-3)


def test_maszyna_fizyczna_jest_wybierana_kryterium_a_nie_kolejnoscia(natywny) -> None:
    """Szyna nieskończona jest w tym przypadku drugą maszyną o M ≈ 6e7.

    Wybór „pierwszej z brzegu" działałby przypadkiem; wybór po najmniejszej
    bezwładności jest kryterium i przetrwa zmianę kolejności w pliku.
    """
    assert natywny.m_pu < 1_000.0, (
        f"wybrano maszynę o M = {natywny.m_pu:g} — to zastępnik szyny sztywnej, "
        "nie maszyna fizyczna"
    )


def test_parametry_pochodza_z_przypadku_a_nie_z_naszego_kodu(natywny) -> None:
    """Sanity: wartości są te, które ANDES ma w pliku, nie nasze domyślne."""
    assert natywny.zrodlo == PRZYPADEK_SMIB
    assert natywny.xd_prim_pu == pytest.approx(0.245)
    assert natywny.m_pu == pytest.approx(5.7512)
    # Nasze własne przypadki mają xd' = 0,30 i H = 4 — gdyby test czytał je,
    # liczby byłyby inne.
    assert natywny.xd_prim_pu != pytest.approx(0.30)
    assert natywny.h_s != pytest.approx(4.0)


def test_raport_niesie_liczby_a_nie_przymiotniki() -> None:
    tekst = raport()
    assert "blad wzgledny" in tekst
    assert "wartosc wlasna ANDES" in tekst
    assert PRZYPADEK_SMIB in tekst


def test_brak_narzedzia_podnosi_wyjatek(monkeypatch) -> None:
    """Brak wzorca to BRAK PORÓWNANIA, nigdy „zgodność"."""
    import dynamic_lab.wzorzec_natywny as modul

    def _wybuch(*_args, **_kwargs):
        raise ImportError("brak andes")

    monkeypatch.setattr(modul, "_wczytaj", lambda *_a, **_k: _wybuch())
    with pytest.raises((BrakPrzypadkuNatywnegoError, ImportError)):
        modul.parametry_smib_natywnego()
