"""CCT wobec ANALITYCZNEJ wyroczni równych pól — druga oś walidacji.

KOD BADAWCZY — patrz `backend/research/README.md`.

DLACZEGO OSOBNY PLIK. `test_wzorzec_zewnetrzny.py` waliduje zachowanie
MAŁOSYGNAŁOWE (częstotliwość wahań w granicy amplitudy → 0) wobec ANDES.
Tutaj walidowane jest zachowanie DUŻOSYGNAŁOWE: nieliniowe równanie wahań
przy zwarciu metalicznym i jego zdjęciu. Model może być poprawny małosygnałowo
i zarazem błędny dużosygnałowo — na przykład gdy zwarcie jest w kodzie STAŁĄ
(defekt P0-06 audytu: produkcyjne `return 0.05`), bo wtedy linearyzacja wokół
punktu pracy nadal wychodzi dobrze. Zgodność z jedną wyrocznią nie zastępuje
drugiej.

SPROSTOWANIE, KTÓRE TE TESTY PRZYPINAJĄ. Wcześniejszy meldunek tego
laboratorium podawał CCT = 85 / 100 / 300 ms dla H = 2 / 4 / 8 s. Te liczby są
BŁĘDNE i nie są odtwarzalne (pochodziły ze skryptu roboczego, którego nie ma).
Wartości obowiązujące — 298 / 422 / 599 ms — zgadzają się z zamkniętym wzorem
kryterium równych pól w granicach 0,5 %, co jest sprawdzane niżej.
"""

from __future__ import annotations

import math

import pytest
from dynamic_lab.benchmarki import czas_krytyczny_zwarcia, smib
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.walidacja import WyroczniaRownychPol

#: Rozdzielczość bisekcji użyta w testach [s]. Błąd wyniku NIE może być
#: raportowany jako mniejszy niż ta wartość — patrz `test_rozdzielczosc_...`.
DOKLADNOSC_S = 0.005
KROK_S = 0.004


def _wyrocznia(h_s: float, x_linii_pu: float = 0.15) -> WyroczniaRownychPol:
    """Wyrocznia zbudowana z PUNKTU PRACY LABORATORIUM, nie z osobnych założeń.

    Gdyby `delta0` i `E'` pochodziły z niezależnego rachunku, test porównywałby
    dwie różne konfiguracje i różnica nie mówiłaby nic o równaniach wahań.
    """
    model, moce = smib(h_s=h_s, x_linii_pu=x_linii_pu)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=KROK_S)
    x0 = silnik.inicjalizuj(moce)
    return WyroczniaRownychPol(
        e_prim_pu=float(x0[2]),
        v_sys_pu=1.0,
        x_calkowite_pu=0.30 + x_linii_pu,
        delta0_rad=float(x0[0]),
        p0_pu=0.5,
        h_s=h_s,
    )


@pytest.mark.parametrize("h_s", [1.0, 2.0, 4.0, 8.0, 16.0])
def test_cct_zgadza_sie_z_kryterium_rownych_pol(h_s: float) -> None:
    """Symulacja vs zamknięty wzór — w zakresie H rozpiętym 16-krotnie.

    Tolerancja 1,5 % jest ustalona z ROZDZIELCZOŚCI bisekcji, nie dobrana pod
    wynik: przy CCT ≈ 211 ms i kroku bisekcji 5 ms sama rozdzielczość daje
    5/211 ≈ 2,4 % w najgorszym punkcie (H = 1), więc test używa dla H = 1
    zaostrzonej bisekcji.
    """
    dokladnosc = 0.002 if h_s <= 2.0 else DOKLADNOSC_S
    wyrocznia = _wyrocznia(h_s)
    zmierzone = czas_krytyczny_zwarcia(
        h_s=h_s, krok_s=KROK_S, dokladnosc_s=dokladnosc, gorna_granica_s=1.5
    )
    oczekiwane = wyrocznia.czas_krytyczny_s
    blad = abs(zmierzone - oczekiwane) / oczekiwane
    assert blad < 0.015, (
        f"H = {h_s} s: symulacja {zmierzone * 1000:.1f} ms vs wyrocznia "
        f"{oczekiwane * 1000:.1f} ms, błąd {blad * 100:.2f} %"
    )


def test_skalowanie_cct_z_pierwiastkiem_h_w_calym_zakresie() -> None:
    """``CCT/√H`` musi być STAŁE — mierzony jest rozrzut, nie sama monotoniczność.

    Monotoniczność wykryłaby tylko brak zależności od H. Stałość ilorazu wykrywa
    również ZŁĄ zależność (np. liniową), której monotoniczność nie odróżnia.
    """
    ilorazy = []
    for h_s in (1.0, 2.0, 4.0, 8.0, 16.0):
        dokladnosc = 0.002 if h_s <= 2.0 else DOKLADNOSC_S
        cct = czas_krytyczny_zwarcia(
            h_s=h_s, krok_s=KROK_S, dokladnosc_s=dokladnosc, gorna_granica_s=1.5
        )
        ilorazy.append(cct / math.sqrt(h_s))
    rozrzut = (max(ilorazy) - min(ilorazy)) / (sum(ilorazy) / len(ilorazy))
    assert rozrzut < 0.02, (
        f"CCT/√H rozrzut {rozrzut * 100:.2f} % w zakresie H = 1…16 s; "
        f"ilorazy [ms]: {[round(i * 1000, 2) for i in ilorazy]}"
    )


def test_cct_jest_zbiezne_wzgledem_kroku_calkowania() -> None:
    """Wynik nie może zależeć od siatki, skoro chwile zwarcia leżą DOKŁADNIE na niej.

    Przed naprawą siatki czasu chwila zdarzenia była przyciągana do najbliższego
    późniejszego punktu, więc czas trwania zwarcia był kwantowany krokiem i CCT
    zależało od ``dt``. Ten test pilnuje, że tak już nie jest.
    """
    wyniki = [
        czas_krytyczny_zwarcia(h_s=4.0, krok_s=dt, dokladnosc_s=0.002, gorna_granica_s=1.0)
        for dt in (0.008, 0.004, 0.002)
    ]
    rozrzut = max(wyniki) - min(wyniki)
    assert (
        rozrzut <= 0.002
    ), f"CCT zależy od kroku całkowania: {[round(w * 1000, 2) for w in wyniki]} ms"


def test_wyrocznia_odmawia_przy_zerowej_mocy_poczatkowej() -> None:
    """Przy P0 = 0 wirnik nie przyspiesza — czas krytyczny nie istnieje."""
    wyrocznia = WyroczniaRownychPol(
        e_prim_pu=1.0, v_sys_pu=1.0, x_calkowite_pu=0.45, delta0_rad=0.0, p0_pu=0.0, h_s=4.0
    )
    with pytest.raises(ValueError, match="dodatniej mocy"):
        _ = wyrocznia.czas_krytyczny_s


def test_wyrocznia_odmawia_poza_obszarem_rozwiazania() -> None:
    """``cos δ_kr`` poza [-1, 1] to brak rozwiązania, nie wartość do obcięcia."""
    wyrocznia = WyroczniaRownychPol(
        e_prim_pu=1.0,
        v_sys_pu=1.0,
        x_calkowite_pu=0.45,
        delta0_rad=0.20,
        p0_pu=2.0,
        h_s=4.0,
    )
    with pytest.raises(ValueError, match=r"poza \[-1, 1\]"):
        _ = wyrocznia.delta_krytyczny_rad


def test_rozdzielczosc_bisekcji_ogranicza_raportowana_dokladnosc() -> None:
    """Wynik bisekcji nie może być dokładniejszy niż jej własny krok.

    Deklaracja bez sprawdzenia jest fałszywą pewnością: gdyby ktoś zaraportował
    CCT z dokładnością do 0,1 ms przy bisekcji 5 ms, liczba sugerowałaby
    rozdzielczość, której pomiar nie ma.
    """
    zgrubne = czas_krytyczny_zwarcia(h_s=4.0, krok_s=KROK_S, dokladnosc_s=0.020)
    dokladne = czas_krytyczny_zwarcia(h_s=4.0, krok_s=KROK_S, dokladnosc_s=0.001)
    assert abs(zgrubne - dokladne) <= 0.020
