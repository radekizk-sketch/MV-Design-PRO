"""Bilans energii magazynu: energia oddana do sieci MUSI pochodzić z zasobu.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

PO CO TEN MODUŁ ISTNIEJE (defekt zmierzony, nie hipotetyczny)
-------------------------------------------------------------
Niezależny audyt zmierzył, że magazyn oddaje do sieci WIĘCEJ energii, niż ma w
zasobie użytecznym, a nadmiar NIE ZNIKA przy zagęszczaniu kroku całkowania —
czyli nie jest błędem dyskretyzacji, tylko błędem modelu. Mechanizm: okno pracy
``[soc_min, soc_max]`` bramkowało wyłącznie CEL regulatora, a moc faktycznie
wystawiana jest STANEM z opóźnieniem ``T_p``. Gdy ``soc`` schodzi przez pasmo
szybciej, niż tor mocy zdąży zareagować (dla 10 MWh przy 100 MVA pasmo 0,02
przechodzi się w 14 ms, a ``T_p`` = 50 ms), magazyn oddaje jeszcze ok. ``P·T_p``
energii, której nie ma. Rzutowanie samego ``soc`` przy niezmienionej mocy jest
tu ZAKAZANE: produkuje energię z niczego i łamie bilans.

CO TE TESTY PINUJĄ
------------------
- ``soc`` nie wychodzi poza okno ``[soc_min, soc_max]`` pod przepływem ścisłym
  (okno jest zbiorem niezmienniczym, bo bramka energii działa na MOCY ODDANEJ),
- równanie bilansu ``ΔE_zasobu = ∫ P_AC · w(P_AC) dt`` z jawnymi sprawnościami,
- zgodność w obu kierunkach (rozładowanie i ładowanie), na obu granicach i w
  punkcie wewnętrznym, przy zmienianej bazie mocy i pojemności,
- brak SYSTEMATYCZNEGO nadmiaru energii przy dt = 0,010 / 0,005 / 0,0025 /
  0,00125 s — czyli że pozostała rozbieżność maleje z krokiem, a nie stoi.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia_oze import MagazynEnergiiBESS
from dynamic_lab.wynik import PrzestrzenSygnalu

S_BAZOWA_MVA = 100.0
KROKI_S = (0.005, 0.0025, 0.00125, 0.000625)
"""Drabina kroku — WEWNĄTRZ dziedziny ważności modelu.

KOREKTA PO RECENZJI NIEZALEŻNEJ (P1-DELTA-27). Pierwsza wersja zaczynała od
10 ms. Dla domyślnej konfiguracji tych biegów (``E = 0,010 MWh``,
``S_baza = 100 MVA``, ``pasmo_soc = 0,02``) granica ważności wynosi
``pasmo·3600·E/(S_fal·S_baza) = 7,2 ms``, więc szczebel 10 ms leżał POZA nią:
jeden krok zmieniał ``soc`` bardziej niż szerokość pasma rampy, czyli przeskakiwał
całe pasmo i wychodził poniżej ``soc_min``. Reszta bilansu zmierzona na takim
biegu opisywała przebieg, który nie dotrzymywał okna pracy.

Drabina zachowuje ośmiokrotną rozpiętość i intencję (jak reszta bilansu skaluje
się z krokiem), ale każdy szczebel leży teraz wewnątrz dziedziny."""
"""Cztery kroki z planu naprawy — każdy kolejny o połowę mniejszy.

Ciąg połówkowy jest potrzebny, żeby ODRÓŻNIĆ błąd modelu od błędu dyskretyzacji:
błąd modelu stoi w miejscu przy zagęszczaniu, błąd dyskretyzacji maleje.
"""


def _siec() -> TopologiaSieci:
    """Dwie szyny: magazyn i sztywny system. Minimalna sieć, w której płynie moc."""
    return TopologiaSieci(
        szyny=("BAT", "SYS"),
        galezie=[Galaz("BAT", "SYS", 0.01, 0.05)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


def _bieg(
    *,
    dt: float,
    p_zadane_pu: float,
    e_pojemnosc_mwh: float = 0.010,
    s_bazowa_mva: float = S_BAZOWA_MVA,
    soc_poczatkowy: float = 0.5,
    soc_min: float = 0.1,
    soc_max: float = 0.9,
    sprawnosc_rozladowania: float = 1.0,
    sprawnosc_ladowania: float = 1.0,
    czas_koncowy_s: float = 4.0,
) -> dict[str, float | np.ndarray]:
    """Uruchom magazyn na dwuszynowej sieci i zwróć WIELKOŚCI BILANSOWE.

    ``p_ac`` czytamy z przestrzeni WYJŚCIE (``p_pu@BAT``), bo to jest moc na
    zaciskach policzona z FAKTYCZNIE wstrzykniętego prądu — a nie stan
    ``p_wyjscia_pu``, który jest nastawą toru regulacji i przy nasyceniu
    prądowym albo przy bramce energii rozjeżdża się z mocą oddaną.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=e_pojemnosc_mwh,
        s_bazowa_mva=s_bazowa_mva,
        s_falownika_pu=1.0,
        soc_poczatkowy=soc_poczatkowy,
        soc_min=soc_min,
        soc_max=soc_max,
        sprawnosc_rozladowania=sprawnosc_rozladowania,
        sprawnosc_ladowania=sprawnosc_ladowania,
    )
    model = ModelDynamiczny(topologia=_siec(), urzadzenia=[magazyn], s_bazowa_mva=s_bazowa_mva)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=dt)
    x0 = silnik.inicjalizuj({"BAT": complex(p_zadane_pu, 0.0)})
    wynik = silnik.symuluj(x0, czas_koncowy_s=czas_koncowy_s)

    czas = np.asarray(wynik.czas_s, dtype=np.float64)
    soc = np.asarray(wynik.sygnal("soc", "BAT", PrzestrzenSygnalu.STAN).wartosci, dtype=np.float64)
    p_ac = np.asarray(
        wynik.sygnal("p_pu", "BAT", PrzestrzenSygnalu.WYJSCIE).wartosci, dtype=np.float64
    )
    # Waga sprawności jest po stronie ZASOBU: przy rozładowaniu z ogniw ubywa
    # P/η_roz, przy ładowaniu do ogniw trafia |P|·η_lad.
    waga = np.where(p_ac > 0.0, 1.0 / sprawnosc_rozladowania, sprawnosc_ladowania)
    calka_mwh = float(np.trapz(p_ac * waga, czas)) * s_bazowa_mva / 3600.0
    ubytek_zasobu_mwh = float(soc[0] - soc[-1]) * e_pojemnosc_mwh
    return {
        "dt": dt,
        "czas": czas,
        "soc": soc,
        "p_ac": p_ac,
        "soc_koniec": float(soc[-1]),
        "soc_min_osiagniety": float(soc.min()),
        "soc_max_osiagniety": float(soc.max()),
        "calka_mwh": calka_mwh,
        "ubytek_zasobu_mwh": ubytek_zasobu_mwh,
        "niezbilansowanie_mwh": ubytek_zasobu_mwh - calka_mwh,
    }


# ---------------------------------------------------------------------------
# §1.1 Konwencja znaku — JEDNA, jawna
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("p_pu", "oczekiwany_znak_d_soc"),
    [(0.4, -1.0), (-0.4, 1.0)],
)
def test_konwencja_znaku_jest_jedna_i_generatorowa(
    p_pu: float, oczekiwany_znak_d_soc: float
) -> None:
    """``P > 0`` to oddawanie do sieci, więc ``soc`` maleje — i odwrotnie.

    Konwencja mieszana (część modelu w odbiornikowej, część w generatorowej) daje
    bilans, który „się zgadza" tylko dla jednego kierunku mocy. Dlatego test
    sprawdza OBA kierunki na tym samym obiekcie.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT", szyna="BAT", e_pojemnosc_mwh=1.0, s_bazowa_mva=S_BAZOWA_MVA
    )
    napiecie = complex(1.0, 0.0)
    x = magazyn.inicjalizuj(napiecie, complex(p_pu, 0.0))
    d_soc = float(magazyn.pochodne(x, napiecie)[2])
    assert np.sign(d_soc) == oczekiwany_znak_d_soc
    assert d_soc == pytest.approx(-p_pu * S_BAZOWA_MVA / (3600.0 * 1.0), rel=1e-12)


# ---------------------------------------------------------------------------
# §1.4/§1.5 Granica SOC ogranicza MOC, a nie tylko rzutuje stan
# ---------------------------------------------------------------------------


def test_rozladowanie_zatrzymuje_sie_na_dolnej_granicy_okna() -> None:
    """Magazyn nie może zejść poniżej ``soc_min`` — to zasób, którego nie ma.

    Scenariusz jest DOBRANY POD DEFEKT: pasmo SOC (0,02) przechodzi się w 14 ms,
    a stała czasowa toru mocy wynosi 50 ms, więc bramka działająca wyłącznie na
    celu regulatora nie zdąży zadziałać i magazyn „dopożycza" ok. ``P·T_p``.
    """
    r = _bieg(dt=0.00125, p_zadane_pu=0.5, e_pojemnosc_mwh=0.010, soc_min=0.1)
    assert r["soc_min_osiagniety"] >= 0.1 - 1.0e-6, (
        f"soc zszedł do {r['soc_min_osiagniety']:.6f} przy soc_min = 0.1 — "
        "magazyn oddał energię, której nie ma"
    )


def test_ladowanie_zatrzymuje_sie_na_gornej_granicy_okna() -> None:
    """Symetrycznie: magazyn nie przyjmuje energii ponad ``soc_max``.

    Defekt jest kierunkowo symetryczny (audyt zmierzył ten sam nadmiar co do
    wartości), więc test też musi być — naprawa działająca tylko przy
    rozładowaniu przeszłaby test jednokierunkowy.
    """
    r = _bieg(dt=0.00125, p_zadane_pu=-0.5, e_pojemnosc_mwh=0.010, soc_max=0.9)
    assert r["soc_max_osiagniety"] <= 0.9 + 1.0e-6, (
        f"soc doszedł do {r['soc_max_osiagniety']:.6f} przy soc_max = 0.9 — "
        "magazyn przyjął energię ponad pojemność"
    )


def test_moc_oddana_gasnie_na_granicy_okna_a_nie_tylko_cel() -> None:
    """Na granicy okna do sieci ma nie płynąć moc czynna — sprawdzamy WYJŚCIE.

    Test celowo NIE pyta o ``cel_mocy``: cel był bramkowany także przed naprawą,
    a mimo to magazyn oddawał energię. Jedyną wielkością rozstrzygającą bilans
    jest moc na zaciskach.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=1.0,
        s_bazowa_mva=S_BAZOWA_MVA,
        soc_min=0.1,
        soc_max=0.9,
    )
    napiecie = complex(1.0, 0.0)
    # Stan toru mocy USTAWIONY NA PEŁNE ROZŁADOWANIE przy pustym zasobie —
    # dokładnie sytuacja, w którą wpada przepływ z opóźnieniem T_p.
    x_pusty = np.array([0.6, 0.0, 0.10, 0.0, 1.0], dtype=np.float64)
    assert magazyn.moc_rzeczywista(x_pusty, napiecie).real == pytest.approx(0.0, abs=1e-12)
    assert float(magazyn.pochodne(x_pusty, napiecie)[2]) == pytest.approx(0.0, abs=1e-15)

    x_pelny = np.array([-0.6, 0.0, 0.90, 0.0, 1.0], dtype=np.float64)
    assert magazyn.moc_rzeczywista(x_pelny, napiecie).real == pytest.approx(0.0, abs=1e-12)
    assert float(magazyn.pochodne(x_pelny, napiecie)[2]) == pytest.approx(0.0, abs=1e-15)


def test_moc_bierna_pozostaje_dostepna_przy_pustym_zasobie() -> None:
    """Bramka energii dotyczy MOCY CZYNNEJ — falownik nadal reguluje bierną.

    Granica modelu wypisana jawnie: przekształtnik z rozładowanymi ogniwami
    pracuje dalej jako źródło mocy biernej (praca kompensatorowa). Bramkowanie
    także Q byłoby fizyką, której model nie ma, i odbierałoby zdolność, która
    jest realna.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT", szyna="BAT", e_pojemnosc_mwh=1.0, s_bazowa_mva=S_BAZOWA_MVA, soc_min=0.1
    )
    napiecie = complex(1.0, 0.0)
    x = np.array([0.6, 0.3, 0.10, 0.0, 1.0], dtype=np.float64)
    s = magazyn.moc_rzeczywista(x, napiecie)
    assert s.real == pytest.approx(0.0, abs=1e-12)
    assert s.imag == pytest.approx(0.3, rel=1e-9)


# ---------------------------------------------------------------------------
# §1.2 Sprawności — jawne w równaniu SOC
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sprawnosc", [0.85, 0.95, 1.0])
def test_sprawnosc_rozladowania_zwieksza_ubytek_zasobu(sprawnosc: float) -> None:
    """Przy rozładowaniu z ogniw ubywa ``P/η``, a nie ``P``.

    Sprawność 1,0 jest wartością DOMYŚLNĄ i oznacza jawnie zadeklarowany brak
    strat — nie „typową" sprawność, bo typowa sprawność konkretnego magazynu jest
    danymi producenta, a nie stałą modelu.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=1.0,
        s_bazowa_mva=S_BAZOWA_MVA,
        sprawnosc_rozladowania=sprawnosc,
    )
    napiecie = complex(1.0, 0.0)
    x = magazyn.inicjalizuj(napiecie, complex(0.4, 0.0))
    d_soc = float(magazyn.pochodne(x, napiecie)[2])
    assert d_soc == pytest.approx(-0.4 / sprawnosc * S_BAZOWA_MVA / 3600.0, rel=1e-12)


@pytest.mark.parametrize("sprawnosc", [0.85, 0.95, 1.0])
def test_sprawnosc_ladowania_zmniejsza_przyrost_zasobu(sprawnosc: float) -> None:
    """Przy ładowaniu do ogniw trafia ``|P|·η``, a nie ``|P|``."""
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=1.0,
        s_bazowa_mva=S_BAZOWA_MVA,
        sprawnosc_ladowania=sprawnosc,
    )
    napiecie = complex(1.0, 0.0)
    x = magazyn.inicjalizuj(napiecie, complex(-0.4, 0.0))
    d_soc = float(magazyn.pochodne(x, napiecie)[2])
    assert d_soc == pytest.approx(0.4 * sprawnosc * S_BAZOWA_MVA / 3600.0, rel=1e-12)


@pytest.mark.parametrize("wartosc", [0.0, -0.1, 1.01, float("nan")])
def test_sprawnosc_poza_przedzialem_jest_odrzucana(wartosc: float) -> None:
    """Sprawność > 1 to perpetuum mobile, <= 0 to brak modelu — obie odrzucane."""
    with pytest.raises(ValueError, match="sprawnosc"):
        MagazynEnergiiBESS(
            ref="BAT",
            szyna="BAT",
            e_pojemnosc_mwh=1.0,
            s_bazowa_mva=S_BAZOWA_MVA,
            sprawnosc_rozladowania=wartosc,
        )
    with pytest.raises(ValueError, match="sprawnosc"):
        MagazynEnergiiBESS(
            ref="BAT",
            szyna="BAT",
            e_pojemnosc_mwh=1.0,
            s_bazowa_mva=S_BAZOWA_MVA,
            sprawnosc_ladowania=wartosc,
        )


# ---------------------------------------------------------------------------
# §1.7 Bilans ΔE_zasobu ≈ ∫ P_AC dt dla czterech kroków
# ---------------------------------------------------------------------------

TOLERANCJA_BILANSU_WZGL = 2.0e-3
"""Dopuszczalne niezbilansowanie względem energii przepuszczonej przez magazyn.

Wartość NIE jest dobrana pod wynik: bierze się z błędu kwadratury trapezów na
przebiegu z załamaniem (bramka energii jest ciągła, ale nie gładka), liczonej na
tej samej siatce, na której całkuje RK4. Kryterium ROZSTRZYGAJĄCE jest ostrzejsze
i jest w `test_niezbilansowanie_maleje_z_krokiem`: rozbieżność ma MALEĆ z krokiem,
bo nadmiar systematyczny z krokiem nie maleje.
"""


@pytest.mark.parametrize("p_zadane_pu", [0.5, -0.5])
@pytest.mark.parametrize("dt", KROKI_S)
def test_bilans_energii_zgadza_sie_dla_kazdego_kroku(dt: float, p_zadane_pu: float) -> None:
    """``ΔE_zasobu`` musi równać się energii przepuszczonej przez zaciski.

    Iloczyn cech: (cztery kroki) × (oba kierunki mocy). Sam kierunek dodatni
    przepuściłby naprawę działającą tylko przy rozładowaniu.
    """
    r = _bieg(dt=dt, p_zadane_pu=p_zadane_pu)
    skala = abs(r["calka_mwh"])
    assert skala > 0.0
    assert abs(r["niezbilansowanie_mwh"]) <= TOLERANCJA_BILANSU_WZGL * skala, (
        f"dt={dt}: ubytek zasobu {r['ubytek_zasobu_mwh']:.9f} MWh, "
        f"całka mocy {r['calka_mwh']:.9f} MWh, "
        f"niezbilansowanie {r['niezbilansowanie_mwh']:.9e} MWh"
    )


def test_niezbilansowanie_maleje_z_krokiem() -> None:
    """KRYTERIUM ROZSTRZYGAJĄCE: brak SYSTEMATYCZNEGO nadmiaru energii.

    Nadmiar wynikający z błędu MODELU nie zależy od kroku — audyt zmierzył go
    jako stały przy czterokrotnym zagęszczeniu. Reszta po naprawie to błąd
    KWADRATURY i musi maleć. Wymagamy spadku o co najmniej połowę na czterech
    krokach (czynnik 8 zmiany dt), co odróżnia wartość malejącą od stojącej,
    a nie zakłada rzędu kwadratury na przebiegu z załamaniem.
    """
    bledy = [abs(_bieg(dt=dt, p_zadane_pu=0.5)["niezbilansowanie_mwh"]) for dt in KROKI_S]
    raport = ", ".join(f"dt={dt}: {b:.6e} MWh" for dt, b in zip(KROKI_S, bledy, strict=True))
    assert bledy[-1] <= 0.5 * bledy[0], f"niezbilansowanie nie maleje z krokiem — {raport}"


def test_energia_oddana_nie_przekracza_zasobu_uzytecznego() -> None:
    """Zarzut audytu wprost: oddane ``0,165847882`` kWh przy zasobie ``0,040`` kWh.

    Zasób użyteczny to ``(soc_0 - soc_min)·E``. Energia oddana do sieci nie może
    go przekroczyć — z marginesem na jeden krok całkowania przy pełnej mocy,
    bo ograniczenie jest ciągłe, a nie zdarzeniowe.
    """
    for dt in KROKI_S:
        r = _bieg(dt=dt, p_zadane_pu=0.5, e_pojemnosc_mwh=0.010, soc_poczatkowy=0.5, soc_min=0.1)
        zasob_mwh = (0.5 - 0.1) * 0.010
        margines_mwh = 0.5 * 1.0 * S_BAZOWA_MVA * dt / 3600.0
        assert r["calka_mwh"] <= zasob_mwh + margines_mwh, (
            f"dt={dt}: oddane {r['calka_mwh'] * 1000:.6f} kWh przy zasobie "
            f"{zasob_mwh * 1000:.6f} kWh"
        )


# ---------------------------------------------------------------------------
# §1.6 Punkt wewnętrzny i zmienne parametry bazowe
# ---------------------------------------------------------------------------


def test_punkt_wewnetrzny_pracuje_bez_ograniczenia_energia() -> None:
    """W środku okna bramka energii ma być neutralna — inaczej model zaniża moc.

    To jest predykat PARZYSTY do testów granicznych: naprawa, która ogranicza moc
    zawsze, przeszłaby wszystkie testy granic i zepsułaby normalną pracę.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=100.0,
        s_bazowa_mva=S_BAZOWA_MVA,
        soc_poczatkowy=0.5,
    )
    napiecie = complex(1.0, 0.0)
    for p in (0.8, 0.0, -0.8):
        x = np.array([p, 0.0, 0.5, 0.0, 1.0], dtype=np.float64)
        assert magazyn.moc_rzeczywista(x, napiecie).real == pytest.approx(p, rel=1e-9, abs=1e-12)


@pytest.mark.parametrize(
    ("s_bazowa_mva", "e_pojemnosc_mwh"),
    [(100.0, 0.010), (10.0, 0.010), (250.0, 0.050), (1.0, 0.001)],
)
def test_bilans_niezalezny_od_bazy_mocy_i_pojemnosci(
    s_bazowa_mva: float, e_pojemnosc_mwh: float
) -> None:
    """Równanie SOC jest jedynym miejscem styku p.u. z jednostkami mianowanymi.

    Pomyłka o bazę mocy albo o czynnik 3600 daje wynik „wyglądający rozsądnie",
    dlatego iloczyn cech (baza) × (pojemność) jest badany na PEŁNYM BIEGU, a nie
    tylko na pochodnej w punkcie.
    """
    r = _bieg(
        dt=0.0025,
        p_zadane_pu=0.3,
        s_bazowa_mva=s_bazowa_mva,
        e_pojemnosc_mwh=e_pojemnosc_mwh,
        czas_koncowy_s=2.0,
    )
    skala = abs(r["calka_mwh"])
    assert skala > 0.0
    assert abs(r["niezbilansowanie_mwh"]) <= TOLERANCJA_BILANSU_WZGL * skala
    assert r["soc_min_osiagniety"] >= 0.1 - 1.0e-6


@pytest.mark.parametrize(
    ("sprawnosc_rozladowania", "sprawnosc_ladowania", "p_zadane_pu"),
    [(0.9, 1.0, 0.5), (1.0, 0.9, -0.5), (0.92, 0.94, 0.5), (0.92, 0.94, -0.5)],
)
def test_bilans_ze_sprawnosciami_na_pelnym_biegu(
    sprawnosc_rozladowania: float, sprawnosc_ladowania: float, p_zadane_pu: float
) -> None:
    """Sprawności muszą wchodzić do bilansu, a nie tylko do docstringa."""
    r = _bieg(
        dt=0.0025,
        p_zadane_pu=p_zadane_pu,
        sprawnosc_rozladowania=sprawnosc_rozladowania,
        sprawnosc_ladowania=sprawnosc_ladowania,
    )
    skala = abs(r["calka_mwh"])
    assert skala > 0.0
    assert abs(r["niezbilansowanie_mwh"]) <= TOLERANCJA_BILANSU_WZGL * skala
    assert r["soc_min_osiagniety"] >= 0.1 - 1.0e-6
    assert r["soc_max_osiagniety"] <= 0.9 + 1.0e-6


# ---------------------------------------------------------------------------
# Okno SOC jako niezmiennik DYSKRETNY, nie tylko ciągły
# (recenzja niezależna, P1-DELTA-27)
# ---------------------------------------------------------------------------


def test_krok_przekraczajacy_pasmo_jest_ODRZUCANY_a_nie_liczony() -> None:
    """Niezmiennik przepływu ŚCISŁEGO nie jest niezmiennikiem przepływu DYSKRETNEGO.

    KONTRPRZYKŁAD RECENZENTA, odtworzony. Bramka energii zeruje moc na granicy,
    więc dla przepływu ścisłego ``d(soc)/dt = 0`` i okno jest niezmiennicze — i
    tak było napisane w `ograniczniki_stanu`. Dla kroku STAŁEGO to nie wystarcza:
    gdy jeden krok zmienia ``soc`` bardziej niż szerokość pasma rampy, całe pasmo
    zostaje przeskoczone, bo między próbkami nie ma żadnej ewaluacji.

    ZMIERZONE (``E = 0,001 MWh``, ``S = 100 MVA``, ``p = 0,5 pu``,
    ``soc_min = 0,10``, ``pasmo = 0,02``)::

        soc0 = 0,11, RK4 dt = 0,01000 s -> soc = 0,07527778   (poniżej soc_min)
        soc0 = 0,50, RK4 dt = 0,01000 s -> soc = 0,08397634   (poniżej soc_min)

    Granica ważności dla tej konfiguracji: ``pasmo·3600·E/(S_fal·S_baza) =
    7,2e-04 s``. Dawne testy tego nie łapały, bo miały krok dostatecznie krótki
    względem pasma — czyli badały wyłącznie wnętrze dziedziny.

    Odrzucenie jest GŁOŚNE i przed biegiem: para (model, krok) leży poza
    zakresem, dla którego laboratorium cokolwiek obiecuje. Cichy przebieg
    wyglądałby wiarygodnie i obiecywał energię, której model zabrania użyć.
    """
    from dynamic_lab.silnik import KrokPozaDziedzinaError

    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=0.001,
        s_bazowa_mva=100.0,
        soc_poczatkowy=0.5,
        soc_min=0.10,
        soc_max=0.90,
        pasmo_soc=0.02,
    )
    granica = magazyn.krok_maksymalny_s()
    assert granica == pytest.approx(7.2e-4, rel=1e-9)

    topo = TopologiaSieci(
        szyny=("BAT", "SYS"),
        galezie=[Galaz("BAT", "SYS", 0.01, 0.05)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(topologia=topo, urzadzenia=[magazyn], s_bazowa_mva=100.0)

    # STRONA ODRZUCENIA: krok recenzenta.
    silnik_zly = SilnikRMS(model, integrator="rk4", krok_s=0.01)
    x0 = silnik_zly.inicjalizuj({"BAT": complex(0.5, 0.0)})
    with pytest.raises(KrokPozaDziedzinaError, match="granicę ważności"):
        silnik_zly.symuluj(x0, czas_koncowy_s=0.05)

    # DRUGA STRONA PREDYKATU: krok wewnątrz dziedziny liczy się i TRZYMA okno.
    silnik_dobry = SilnikRMS(model, integrator="rk4", krok_s=0.0005)
    x0 = silnik_dobry.inicjalizuj({"BAT": complex(0.5, 0.0)})
    wynik = silnik_dobry.symuluj(x0, czas_koncowy_s=0.05)
    soc = np.asarray(wynik.sygnal("soc", "BAT").wartosci, dtype=np.float64)
    assert (
        float(soc.min()) >= magazyn.soc_min - 1.0e-9
    ), f"soc zszedł do {float(soc.min()):.8f} poniżej soc_min = {magazyn.soc_min}"


def test_granica_waznosci_zaostrza_sie_ze_sprawnoscia_rozladowania() -> None:
    """Straty rozładowania PRZYSPIESZAJĄ zużycie zasobu, więc skracają krok.

    Bez tego członu granica byłaby policzona dla magazynu bezstratnego i
    przepuszczałaby krok, przy którym magazyn ze stratami pasmo przeskakuje.
    """
    wspolne = {
        "ref": "BAT",
        "szyna": "BAT",
        "e_pojemnosc_mwh": 0.001,
        "s_bazowa_mva": 100.0,
        "pasmo_soc": 0.02,
    }
    bezstratny = MagazynEnergiiBESS(**wspolne)
    ze_stratami = MagazynEnergiiBESS(**wspolne, sprawnosc_rozladowania=0.5)
    assert ze_stratami.krok_maksymalny_s() < bezstratny.krok_maksymalny_s()
    assert ze_stratami.krok_maksymalny_s() == pytest.approx(
        bezstratny.krok_maksymalny_s() / 2.0, rel=1e-12
    )
