"""Solver parametrów linii napowietrznej z geometrii słupa — weryfikacja NIEZALEŻNA (WHITE BOX).

Każda wartość solvera jest tu porównana z obliczeniem prowadzonym INNĄ drogą niż kod solvera,
z tolerancją uzasadnioną różnicą metod:

* poprawka ziemi Carsona (postać całkowa, ``scipy.integrate.quad``) — z SZEREGIEM Carsona
  (J. R. Carson, BSTJ 5 (1926) 539–554, wyrazy do k² włącznie); różnica = wyrazy O(k³);
* macierz impedancji i składowe symetryczne — z przykładem 4.1, a macierz współczynników
  potencjałowych z przykładem 5.1 W. H. Kerstinga („Distribution System Modeling and Analysis”,
  wyd. 4); Kersting stosuje zmodyfikowane równania Carsona (pierwszy wyraz szeregu), więc
  różnica = drugi wyraz k·cosθ/(3√2) szeregu (ok. 0,0022 Ω/milę na element macierzy);
* X′1, B′1, Z′0 linii 110 kV z katalogu — klasycznymi wzorami średnich geometrycznych
  (X′1 = ωμ0/(2π)·ln(GMD/GMR), B′1 = 2πε0ω/ln(GMD/r)) i wzorem Z′0 z zastępczą głębokością
  wnikania (pierwszy wyraz szeregu Carsona), z redukcją jednego przewodu odgromowego w postaci
  zamkniętej Z′0 = Z′0,bez − 3Z′²_fg/Z′gg;
* GMR przewodu z budowy — z tablicy A.1 Kerstinga (ACSR 26/7: GMR = 0,0244 ft przy średnicy
  0,721 in → GMR/r = 0,8122).

Iloczyn cech: {AFL-6 240, AFL-6 185} × {geometria projektu, geometria robocza} × {z przewodem
odgromowym, bez} × {R′1, X′1, B′1, Z′0, B′0}; do tego wiązka, odmowy danych, determinizm
i kompletność dowodu (dane przyjęte → NIEPELNY).
"""

from __future__ import annotations

import cmath
import math
from dataclasses import replace

import numpy as np
import pytest
from enm.parametry_linii_wn import dane_przewodu
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.wartosci_robocze import (
    FAZY_SLUPA_TYPOWEGO_M,
    ODGROMOWE_SLUPA_TYPOWEGO_M,
    PRZEWOD_ODGROMOWY_ROBOCZY_REF,
)
from network_model.odmowa_danych import OdmowaDanychError
from network_model.solvers.parametry_linii_napowietrznej import (
    DanePrzewodu,
    GeometriaLinii,
    PolozeniePrzewodu,
    WejscieParametrowLinii,
    gmr_z_budowy_mm,
    oblicz_parametry_linii,
    poprawka_ziemi_carsona_ohm_per_m,
)
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality

MI_0 = 4.0e-7 * math.pi
EPS_0 = 8.8541878128e-12
STOPA_M = 0.3048
MILA_KM = 1.609344

AFL6_240 = "przewod-wn-243-al1-39-st1a"
AFL6_185 = "przewod-wn-184-al1-30-st1a"


def _przewod(ref: str) -> DanePrzewodu:
    typ = get_default_mv_catalog().get_overhead_conductor_type(ref)
    assert typ is not None
    return dane_przewodu(typ.to_dict(), nazwa=typ.name)


def _polozenia(pary: tuple[tuple[float, float], ...]) -> tuple[PolozeniePrzewodu, ...]:
    return tuple(PolozeniePrzewodu(x, y) for x, y in pary)


#: Geometria „projektu” w teście: słup z układem płaskim (inna niż robocza, trójkątna).
FAZY_PROJEKTU_M = ((-4.5, 16.0), (0.0, 16.0), (4.5, 16.0))
ODGROMOWE_PROJEKTU_M = ((0.0, 22.0),)


def _wejscie(
    przewod: str, geometria: str, z_odgromowym: bool, rho: float = 100.0
) -> WejscieParametrowLinii:
    fazy, odgromowe = (
        (FAZY_PROJEKTU_M, ODGROMOWE_PROJEKTU_M)
        if geometria == "projekt"
        else (FAZY_SLUPA_TYPOWEGO_M, ODGROMOWE_SLUPA_TYPOWEGO_M)
    )
    f3 = _polozenia(fazy)
    return WejscieParametrowLinii(
        przewod_fazowy=_przewod(przewod),
        geometria=GeometriaLinii(
            fazy=(f3[0], f3[1], f3[2]), odgromowe=_polozenia(odgromowe) if z_odgromowym else ()
        ),
        rezystywnosc_gruntu_ohm_m=rho,
        czestotliwosc_hz=50.0,
        temperatura_przewodu_c=80.0,
        przewod_odgromowy=(_przewod(PRZEWOD_ODGROMOWY_ROBOCZY_REF) if z_odgromowym else None),
    )


def _gmd(fazy: tuple[tuple[float, float], ...]) -> float:
    d = [math.dist(fazy[i], fazy[j]) for i, j in ((0, 1), (0, 2), (1, 2))]
    return (d[0] * d[1] * d[2]) ** (1.0 / 3.0)


# ---------------------------------------------------------------------------
# Poprawka ziemi Carsona: całka == szereg (wyrazy do k²)
# ---------------------------------------------------------------------------


def _carson_szereg_ohm_per_m(p: float, q: float, f: float, rho: float) -> complex:
    """Szereg Carsona (1926) do k² włącznie: ΔZ = (ωμ0/π)(P + jQ), k = D′·√(ωμ0/ρ)."""
    omega = 2.0 * math.pi * f
    d_odbicia = math.hypot(p, q)
    theta = math.atan2(q, p)
    k = d_odbicia * math.sqrt(omega * MI_0 / rho)
    p_c = (
        math.pi / 8.0
        - k * math.cos(theta) / (3.0 * math.sqrt(2.0))
        + k * k / 16.0 * math.cos(2 * theta) * (0.6728 + math.log(2.0 / k))
        + k * k / 16.0 * theta * math.sin(2 * theta)
    )
    q_c = (
        -0.0386
        + 0.5 * math.log(2.0 / k)
        + k * math.cos(theta) / (3.0 * math.sqrt(2.0))
        - math.pi * k * k / 64.0 * math.cos(2 * theta)
    )
    return omega * MI_0 / math.pi * complex(p_c, q_c)


@pytest.mark.parametrize(
    ("p_m", "q_m", "rho"),
    [
        (30.0, 0.0, 100.0),  # przewód własny, h = 15 m
        (34.0, 4.5, 100.0),  # para faz słupa płaskiego
        (38.0, 7.0, 1000.0),  # grunt skalisty — mniejsze k
        (45.0, 3.0, 30.0),  # grunt podmokły — większe k (k ≈ 0,18)
    ],
)
def test_poprawka_ziemi_calka_rowna_szeregowi_carsona(p_m: float, q_m: float, rho: float) -> None:
    calka = poprawka_ziemi_carsona_ohm_per_m(p_m, q_m, 50.0, rho)
    szereg = _carson_szereg_ohm_per_m(p_m, q_m, 50.0, rho)
    # Reszta szeregu to wyrazy O(k³) (k ≤ 0,18 → < 0,1 % części rzeczywistej i urojonej).
    assert calka.real == pytest.approx(szereg.real, rel=1e-3)
    assert calka.imag == pytest.approx(szereg.imag, rel=1e-3)


# ---------------------------------------------------------------------------
# Kersting, przykład 4.1 (impedancje) i 5.1 (współczynniki potencjałowe)
# ---------------------------------------------------------------------------


def _kersting_4_1() -> WejscieParametrowLinii:
    """Linia 4-przewodowa 60 Hz, ρ = 100 Ω·m: fazy 336 400 26/7 ACSR, neutralny 4/0 6/1 ACSR
    uziemiony (rola przewodu odgromowego w redukcji Krona). Położenia z rys. 4.9: fazy na 29 ft
    w x = 0; 2,5; 7 ft, neutralny 4 ft niżej w x = 4 ft (D_an = 5,6569 ft, D_bn = 4,272 ft,
    D_cn = 5,0 ft). Rezystancje tablicy A.1 [Ω/milę] podane jako R′ (temperatura nie wchodzi
    do macierzy impedancji)."""
    faza = DanePrzewodu(
        identyfikator="336400-26/7",
        nazwa="336 400 26/7 ACSR",
        srednica_mm=0.721 * 25.4,
        r20_ohm_per_km=0.306 / MILA_KM,
        alfa_1_per_k=0.004,
        gmr_mm=0.0244 * STOPA_M * 1000.0,
    )
    neutralny = DanePrzewodu(
        identyfikator="4/0-6/1",
        nazwa="4/0 6/1 ACSR",
        srednica_mm=0.563 * 25.4,
        r20_ohm_per_km=0.592 / MILA_KM,
        alfa_1_per_k=0.004,
        gmr_mm=0.00814 * STOPA_M * 1000.0,
    )
    h = 29.0 * STOPA_M
    return WejscieParametrowLinii(
        przewod_fazowy=faza,
        geometria=GeometriaLinii(
            fazy=(
                PolozeniePrzewodu(0.0, h),
                PolozeniePrzewodu(2.5 * STOPA_M, h),
                PolozeniePrzewodu(7.0 * STOPA_M, h),
            ),
            odgromowe=(PolozeniePrzewodu(4.0 * STOPA_M, 25.0 * STOPA_M),),
        ),
        rezystywnosc_gruntu_ohm_m=100.0,
        czestotliwosc_hz=60.0,
        temperatura_przewodu_c=20.0,
        przewod_odgromowy=neutralny,
    )


#: Kersting, przykład 4.1 — macierz pierwotna [Ω/milę] (zmodyfikowane równania Carsona).
KERSTING_Z_PIERWOTNA = [
    [0.4013 + 1.4133j, 0.0953 + 0.8515j, 0.0953 + 0.7266j, 0.0953 + 0.7524j],
    [0.0953 + 0.8515j, 0.4013 + 1.4133j, 0.0953 + 0.7802j, 0.0953 + 0.7865j],
    [0.0953 + 0.7266j, 0.0953 + 0.7802j, 0.4013 + 1.4133j, 0.0953 + 0.7674j],
    [0.0953 + 0.7524j, 0.0953 + 0.7865j, 0.0953 + 0.7674j, 0.6873 + 1.5465j],
]
#: Kersting, przykład 4.1 — macierz fazowa po redukcji Krona [Ω/milę].
KERSTING_Z_FAZOWA = [
    [0.4576 + 1.0780j, 0.1560 + 0.5017j, 0.1535 + 0.3849j],
    [0.1560 + 0.5017j, 0.4666 + 1.0482j, 0.1580 + 0.4236j],
    [0.1535 + 0.3849j, 0.1580 + 0.4236j, 0.4615 + 1.0651j],
]
#: Kersting, przykład 4.1 — z00 i z11 [Ω/milę].
KERSTING_Z00 = 0.7735 + 1.9373j
KERSTING_Z11 = 0.3061 + 0.6270j
#: Kersting, przykład 5.1 — macierz admitancji fazowej j·[µS/milę].
KERSTING_Y_FAZOWA = [
    [5.6711, -1.8362, -0.7033],
    [-1.8362, 5.9774, -1.1690],
    [-0.7033, -1.1690, 5.3911],
]

#: Drugi wyraz szeregu Carsona pominięty przez Kerstinga: (ωμ0/π)·k/(3√2) dla k ≈ 0,0385
#: (D′ = 58 ft, 60 Hz, ρ = 100 Ω·m) ≈ 0,0022 Ω/milę — tolerancja elementu macierzy z zapasem
#: na zaokrąglenie publikacji (4 cyfry po przecinku).
TOL_ELEMENTU_OHM_PER_MILE = 0.003
#: Z00 sumuje trzy elementy (Zs + 2Zm) — trzykrotność drugiego wyrazu z zapasem.
TOL_Z00_OHM_PER_MILE = 0.008


def _krok(wynik, kod):  # noqa: ANN001, ANN202 — pomocnik testu
    return next(k for k in wynik.slad if k.kod == kod)


def test_kersting_4_1_macierz_pierwotna_fazowa_i_skladowe() -> None:
    wynik = oblicz_parametry_linii(_kersting_4_1())
    pierwotna = _krok(wynik, "Z_PIERWOTNE").dane["z_ohm_per_km"]
    for i in range(4):
        for j in range(4):
            z = complex(*pierwotna[i][j]) * MILA_KM
            oczekiwane = KERSTING_Z_PIERWOTNA[i][j]
            assert abs(z.real - oczekiwane.real) <= TOL_ELEMENTU_OHM_PER_MILE, (i, j, z)
            assert abs(z.imag - oczekiwane.imag) <= TOL_ELEMENTU_OHM_PER_MILE, (i, j, z)
    fazowa = _krok(wynik, "KRON_Z").dane["z_f_ohm_per_km"]
    for i in range(3):
        for j in range(3):
            z = complex(*fazowa[i][j]) * MILA_KM
            oczekiwane = KERSTING_Z_FAZOWA[i][j]
            assert abs(z - oczekiwane) <= TOL_ELEMENTU_OHM_PER_MILE * math.sqrt(2), (i, j, z)
    z1 = complex(wynik.r1_ohm_per_km, wynik.x1_ohm_per_km) * MILA_KM
    z0 = complex(wynik.r0_ohm_per_km, wynik.x0_ohm_per_km) * MILA_KM
    # Z11 — wpływ ziemi znosi się (Zs − Zm), zgodność do zaokrąglenia publikacji.
    assert abs(z1.real - KERSTING_Z11.real) <= 0.0005
    assert abs(z1.imag - KERSTING_Z11.imag) <= 0.0005
    assert abs(z0.real - KERSTING_Z00.real) <= TOL_Z00_OHM_PER_MILE
    assert abs(z0.imag - KERSTING_Z00.imag) <= TOL_Z00_OHM_PER_MILE


def test_kersting_5_1_admitancja_z_macierzy_wspolczynnikow_potencjalowych() -> None:
    """Macierz P solvera (odbicia, promień zewnętrzny, Kron) daje admitancję przykładu 5.1.

    Tolerancja 0,2 %: Kersting używa stałej 11,17689 milę/µF (ε0 zaokrąglone) — różnica
    stałej wobec CODATA to ok. 0,07 %."""
    wynik = oblicz_parametry_linii(_kersting_4_1())
    p = np.array(_krok(wynik, "B1_B0").dane["p_m_per_f"])
    p_f = p[:3, :3] - p[:3, 3:] @ np.linalg.solve(p[3:, 3:], p[3:, :3])
    y_us_per_mile = 2.0 * math.pi * 60.0 * np.linalg.inv(p_f) * MILA_KM * 1000.0 * 1e6
    for i in range(3):
        for j in range(3):
            assert y_us_per_mile[i, j] == pytest.approx(KERSTING_Y_FAZOWA[i][j], rel=2e-3)


def test_gmr_z_budowy_zgodny_z_tablica_kerstinga_dla_acsr_26_7() -> None:
    # Tablica A.1 Kerstinga: 336 400 26/7 ACSR — GMR 0,0244 ft, średnica 0,721 in.
    gmr_do_r_tablica = 0.0244 / (0.721 / 2.0 / 12.0)
    for ref in (AFL6_240, AFL6_185):
        przewod = _przewod(ref)
        assert przewod.srednica_drutu_al_mm is not None
        assert przewod.srednica_rdzenia_mm is not None
        gmr = gmr_z_budowy_mm(
            przewod.warstwy_al, przewod.srednica_drutu_al_mm, przewod.srednica_rdzenia_mm
        )
        assert gmr / (przewod.srednica_mm / 2.0) == pytest.approx(gmr_do_r_tablica, rel=5e-3)


# ---------------------------------------------------------------------------
# Iloczyn cech: przewód × geometria × przewód odgromowy × parametr
# ---------------------------------------------------------------------------

ILOCZYN = [
    (przewod, geometria, z_odgromowym)
    for przewod in (AFL6_240, AFL6_185)
    for geometria in ("projekt", "robocza")
    for z_odgromowym in (True, False)
]


def _fazy(geometria: str) -> tuple[tuple[float, float], ...]:
    return FAZY_PROJEKTU_M if geometria == "projekt" else FAZY_SLUPA_TYPOWEGO_M


@pytest.mark.parametrize(("przewod", "geometria", "z_odgromowym"), ILOCZYN)
def test_r1_rowne_rezystancji_przewodu(przewod: str, geometria: str, z_odgromowym: bool) -> None:
    """R′1 = R′20 przewodu: składowa zgodna nie widzi ziemi (Zs − Zm) — reszta to różnica
    poprawek ziemi elementów niesymetrycznego słupa (< 0,5 %)."""
    wynik = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym))
    r20 = _przewod(przewod).r20_ohm_per_km
    assert wynik.r1_ohm_per_km == pytest.approx(r20, rel=5e-3)
    assert wynik.r1_temperatura_ohm_per_km == pytest.approx(r20 * (1 + 0.004 * 60.0), rel=1e-12)


@pytest.mark.parametrize(("przewod", "geometria", "z_odgromowym"), ILOCZYN)
def test_x1_klasyczny_wzor_gmd_gmr(przewod: str, geometria: str, z_odgromowym: bool) -> None:
    """X′1 = ωμ0/(2π)·ln(GMD/GMR) — GMD z położeń faz policzone w teście, GMR z tablicy
    Kerstinga (GMR/r = 0,8122 dla ACSR 26/7). Tolerancja 1 %: przewód odgromowy i ziemia
    zmieniają X′1 linii transponowanej o ułamek procenta, a GMR tablicy różni się od GMR
    z budowy o 0,1 %."""
    wynik = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym))
    gmr_m = 0.8122 * _przewod(przewod).srednica_mm / 2000.0
    x1 = 2.0 * math.pi * 50.0 * MI_0 / (2.0 * math.pi) * math.log(_gmd(_fazy(geometria)) / gmr_m)
    assert wynik.x1_ohm_per_km == pytest.approx(x1 * 1000.0, rel=1e-2)


@pytest.mark.parametrize(("przewod", "geometria", "z_odgromowym"), ILOCZYN)
def test_b1_klasyczny_wzor_gmd_promien(przewod: str, geometria: str, z_odgromowym: bool) -> None:
    """B′1 = 2πε0·ω/ln(GMD/r) (ziemia pominięta) — tolerancja 2 %: odbicia w ziemi i przewód
    odgromowy podnoszą pojemność zgodną o ok. 1 % przy wysokości 15–19 m."""
    wynik = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym))
    r_m = _przewod(przewod).srednica_mm / 2000.0
    b1 = 2.0 * math.pi * EPS_0 * 2.0 * math.pi * 50.0 / math.log(_gmd(_fazy(geometria)) / r_m)
    assert wynik.b1_s_per_km == pytest.approx(b1 * 1000.0, rel=2e-2)


def _z0_bez_odgromowego_klasyczny(przewod: str, geometria: str, rho: float) -> complex:
    """Z′0 = R′ + 3R′e + j3·ωμ0/(2π)·ln(δ/∛(GMR·GMD²)), R′e = ωμ0/8, δ = 1,851/√(ωμ0/ρ)
    (pierwszy wyraz szeregu Carsona) [Ω/km]."""
    omega = 2.0 * math.pi * 50.0
    delta = 1.851 / math.sqrt(omega * MI_0 / rho)
    gmr_m = 0.8122 * _przewod(przewod).srednica_mm / 2000.0
    gmr3 = (gmr_m * _gmd(_fazy(geometria)) ** 2) ** (1.0 / 3.0)
    r = _przewod(przewod).r20_ohm_per_km / 1000.0
    z0 = r + 3.0 * omega * MI_0 / 8.0 + 3j * omega * MI_0 / (2.0 * math.pi) * math.log(delta / gmr3)
    return z0 * 1000.0


def _z0_z_odgromowym_klasyczny(przewod: str, geometria: str, rho: float) -> complex:
    """Z′0 = Z′0,bez − 3Z′²_fg/Z′gg (jeden przewód odgromowy uziemiony na każdym słupie)."""
    omega = 2.0 * math.pi * 50.0
    wsp = omega * MI_0 / (2.0 * math.pi)
    r_e = omega * MI_0 / 8.0
    delta = 1.851 / math.sqrt(omega * MI_0 / rho)
    fazy = _fazy(geometria)
    odg = (ODGROMOWE_PROJEKTU_M if geometria == "projekt" else ODGROMOWE_SLUPA_TYPOWEGO_M)[0]
    d_fg = (math.prod(math.dist(f, odg) for f in fazy)) ** (1.0 / 3.0)
    odgromowy = _przewod(PRZEWOD_ODGROMOWY_ROBOCZY_REF)
    assert odgromowy.srednica_drutu_al_mm is not None
    assert odgromowy.srednica_rdzenia_mm is not None
    gmr_g = (
        gmr_z_budowy_mm(
            odgromowy.warstwy_al, odgromowy.srednica_drutu_al_mm, odgromowy.srednica_rdzenia_mm
        )
        / 1000.0
    )
    z_fg = r_e + 1j * wsp * math.log(delta / d_fg)
    z_gg = odgromowy.r20_ohm_per_km / 1000.0 + r_e + 1j * wsp * math.log(delta / gmr_g)
    return _z0_bez_odgromowego_klasyczny(przewod, geometria, rho) - 3.0 * z_fg**2 / z_gg * 1000.0


#: Tolerancja Z′0 wobec wzoru z pierwszym wyrazem szeregu Carsona: drugi wyraz
#: (ωμ0/π)·k/(3√2) przy k = 2h·√(ωμ0/ρ) ≈ 0,07 to ok. 0,002 Ω/km na element; Z′0 sumuje trzy
#: elementy, a redukcja odgromowego dokłada podobny rząd — 0,02 Ω/km.
TOL_Z0_OHM_PER_KM = 0.02


@pytest.mark.parametrize(("przewod", "geometria", "z_odgromowym"), ILOCZYN)
def test_z0_z_wplywem_ziemi_i_przewodu_odgromowego(
    przewod: str, geometria: str, z_odgromowym: bool
) -> None:
    wynik = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym))
    z0 = (
        _z0_z_odgromowym_klasyczny(przewod, geometria, 100.0)
        if z_odgromowym
        else _z0_bez_odgromowego_klasyczny(przewod, geometria, 100.0)
    )
    assert abs(wynik.r0_ohm_per_km - z0.real) <= TOL_Z0_OHM_PER_KM
    assert abs(wynik.x0_ohm_per_km - z0.imag) <= TOL_Z0_OHM_PER_KM
    z0_bez = _z0_bez_odgromowego_klasyczny(przewod, geometria, 100.0)
    assert abs(wynik.r0_bez_odgromowych_ohm_per_km - z0_bez.real) <= TOL_Z0_OHM_PER_KM
    assert abs(wynik.x0_bez_odgromowych_ohm_per_km - z0_bez.imag) <= TOL_Z0_OHM_PER_KM
    if z_odgromowym:
        # Przewód odgromowy uziemiony na każdym słupie obniża reaktancję zerową.
        assert wynik.x0_ohm_per_km < wynik.x0_bez_odgromowych_ohm_per_km
        assert wynik.liczba_odgromowych == 1
    else:
        assert wynik.x0_ohm_per_km == wynik.x0_bez_odgromowych_ohm_per_km
        assert wynik.liczba_odgromowych == 0


@pytest.mark.parametrize(("przewod", "geometria", "z_odgromowym"), ILOCZYN)
def test_b0_metoda_odbic(przewod: str, geometria: str, z_odgromowym: bool) -> None:
    """B′0 bez przewodu odgromowego: P0 = (1/(2πε0))·3·ln(H/∛(r·GMD²)), H = ⁹√(Π2h_i·ΠD′²_ij)
    (średnie transpozycji) — tożsamość algebraiczna, tolerancja 1e-9. Z przewodem odgromowym
    (potencjał 0) pojemność zerowa rośnie."""
    wynik = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym))
    bez = oblicz_parametry_linii(_wejscie(przewod, geometria, False))
    fazy = _fazy(geometria)
    r_m = _przewod(przewod).srednica_mm / 2000.0
    obrazy = [2.0 * y for _, y in fazy] + [
        math.hypot(fazy[i][0] - fazy[j][0], fazy[i][1] + fazy[j][1]) ** 2
        for i, j in ((0, 1), (0, 2), (1, 2))
    ]
    h = math.prod(obrazy) ** (1.0 / 9.0)
    p0 = 3.0 * math.log(h / (r_m * _gmd(fazy) ** 2) ** (1.0 / 3.0)) / (2.0 * math.pi * EPS_0)
    assert bez.b0_s_per_km == pytest.approx(2.0 * math.pi * 50.0 / p0 * 1000.0, rel=1e-9)
    assert 0.0 < wynik.b0_s_per_km < wynik.b1_s_per_km
    if z_odgromowym:
        assert wynik.b0_s_per_km > bez.b0_s_per_km


def test_rezystywnosc_gruntu_zmienia_tylko_skladowa_zerowa() -> None:
    """ρ jest daną (Carson): zmiana ρ nie zmienia B′, a Z′1 tylko w granicach niesymetrii słupa
    (poprawki ziemi elementów różnią się o wyrazy O(k), które Zs − Zm znosi niemal całkowicie —
    pomiar 2·10⁻⁶ względnie przy ρ ×10), a X′0 rośnie z ρ (δ ∝ √ρ)."""
    a = oblicz_parametry_linii(_wejscie(AFL6_240, "robocza", False, rho=100.0))
    b = oblicz_parametry_linii(_wejscie(AFL6_240, "robocza", False, rho=1000.0))
    assert b.x1_ohm_per_km == pytest.approx(a.x1_ohm_per_km, rel=1e-5)
    assert b.b1_s_per_km == a.b1_s_per_km
    # 3·ωμ0/(2π)·ln(√10) ≈ 0,217 Ω/km na dekadę ρ (pierwszy wyraz szeregu).
    assert b.x0_ohm_per_km - a.x0_ohm_per_km == pytest.approx(
        3.0 * 2.0 * math.pi * 50.0 * MI_0 / (2.0 * math.pi) * math.log(math.sqrt(10.0)) * 1000.0,
        abs=0.01,
    )


def test_wiazka_dwoch_przewodow() -> None:
    """GMR_w = √(GMR·s), r_w = √(r·s), R′ = R′20/2 (wiązka 2-przewodowa, A = s/2)."""
    dane = _wejscie(AFL6_240, "projekt", True)
    dane = replace(dane, geometria=replace(dane.geometria, liczba_w_wiazce=2, odstep_wiazki_m=0.4))
    wynik = oblicz_parametry_linii(dane)
    pojedynczy = oblicz_parametry_linii(_wejscie(AFL6_240, "projekt", True))
    assert wynik.gmr_fazy_m == pytest.approx(math.sqrt(pojedynczy.gmr_przewodu_m * 0.4), rel=1e-12)
    assert wynik.promien_zastepczy_fazy_m == pytest.approx(
        math.sqrt(_przewod(AFL6_240).srednica_mm / 2000.0 * 0.4), rel=1e-12
    )
    assert wynik.r1_ohm_per_km == pytest.approx(pojedynczy.r1_ohm_per_km / 2.0, rel=1e-2)
    assert wynik.x1_ohm_per_km < pojedynczy.x1_ohm_per_km
    assert wynik.b1_s_per_km > pojedynczy.b1_s_per_km
    assert "WIAZKA" in {k.kod for k in wynik.slad}
    assert "WIAZKA" not in {k.kod for k in pojedynczy.slad}


# ---------------------------------------------------------------------------
# Ślad White Box, kompletność dowodu, determinizm, odmowy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("z_odgromowym", [True, False])
def test_slad_kazdy_krok_ma_wzor_podstawienie_wynik_i_jednostke(z_odgromowym: bool) -> None:
    wynik = oblicz_parametry_linii(_wejscie(AFL6_240, "robocza", z_odgromowym))
    kody = [k.kod for k in wynik.slad]
    oczekiwane = ["R1_20", "R1_THETA", "GMR_FAZOWY"]
    if z_odgromowym:
        oczekiwane.append("GMR_ODGROMOWY")
    oczekiwane += ["GMD", "DELTA", "Z_PIERWOTNE"]
    if z_odgromowym:
        oczekiwane.append("KRON_Z")
    oczekiwane += ["Z1", "Z0"]
    if z_odgromowym:
        oczekiwane.append("Z0_BEZ_ODGROMOWYCH")
    oczekiwane += ["X1_KONTROLA", "B1_B0"]
    assert kody == oczekiwane
    for krok in wynik.slad:
        assert krok.wzor_latex and krok.podstawienie_latex and krok.wynik_latex, krok.kod
        assert krok.wynik.jednostka, krok.kod
        assert krok.podstawa_pl, krok.kod
        assert all(w.jednostka for w in krok.wejscia), krok.kod
    z1 = _krok(wynik, "Z1").wynik.wartosc
    assert complex(z1) == complex(wynik.r1_ohm_per_km, wynik.x1_ohm_per_km)
    assert _krok(wynik, "X1_KONTROLA").wynik.wartosc == pytest.approx(wynik.x1_ohm_per_km, rel=1e-2)


def test_kompletnosc_dowodu_z_danych_przyjetych() -> None:
    pelny = oblicz_parametry_linii(_wejscie(AFL6_240, "projekt", True))
    assert pelny.kompletnosc_dowodu == "PELNY"
    przyjeta = DanaPrzyjeta(
        nazwa_pl="rezystywność gruntu",
        wartosc=Wielkosc(wartosc=100.0, jednostka="Ω·m"),
        powod_pl="wartość robocza",
        jakosc=FieldQuality.ESTIMATED,
    )
    niepelny = oblicz_parametry_linii(
        replace(_wejscie(AFL6_240, "projekt", True), dane_przyjete=(przyjeta,))
    )
    assert niepelny.kompletnosc_dowodu == "NIEPELNY"
    assert niepelny.dane_przyjete == (przyjeta,)
    # Dane przyjęte nie zmieniają liczb — zmieniają status dowodu.
    assert niepelny.x0_ohm_per_km == pelny.x0_ohm_per_km


@pytest.mark.parametrize(("przewod", "geometria", "z_odgromowym"), ILOCZYN)
def test_determinizm_wynik_i_odcisk(przewod: str, geometria: str, z_odgromowym: bool) -> None:
    a = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym))
    b = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym))
    assert a == b
    assert a.odcisk_wejscia == b.odcisk_wejscia
    inny = oblicz_parametry_linii(_wejscie(przewod, geometria, z_odgromowym, rho=250.0))
    assert inny.odcisk_wejscia != a.odcisk_wejscia


def _z_geometria(**zmiany: object) -> WejscieParametrowLinii:
    dane = _wejscie(AFL6_240, "projekt", True)
    return replace(dane, geometria=replace(dane.geometria, **zmiany))


@pytest.mark.parametrize(
    ("dane", "fragment"),
    [
        (
            _z_geometria(
                fazy=(
                    PolozeniePrzewodu(0.0, 16.0),
                    PolozeniePrzewodu(0.0, 16.0),
                    PolozeniePrzewodu(4.5, 16.0),
                )
            ),
            "to samo położenie",
        ),
        (
            _z_geometria(
                fazy=(
                    PolozeniePrzewodu(-4.5, 0.0),
                    PolozeniePrzewodu(0.0, 16.0),
                    PolozeniePrzewodu(4.5, 16.0),
                )
            ),
            "musi być dodatnia",
        ),
        (_z_geometria(liczba_w_wiazce=2, odstep_wiazki_m=None), "odstępu"),
        (_z_geometria(liczba_w_wiazce=0), "co najmniej 1"),
        (
            replace(_wejscie(AFL6_240, "projekt", True), przewod_odgromowy=None),
            "typu przewodu odgromowego",
        ),
        (replace(_wejscie(AFL6_240, "projekt", True), rezystywnosc_gruntu_ohm_m=0.0), "gruntu"),
        (replace(_wejscie(AFL6_240, "projekt", True), czestotliwosc_hz=math.nan), "Częstotliwość"),
    ],
)
def test_odmowa_danych_sprzecznych(dane: WejscieParametrowLinii, fragment: str) -> None:
    with pytest.raises(OdmowaDanychError, match=fragment):
        oblicz_parametry_linii(dane)


def test_wynik_niezalezny_od_kolejnosci_przewodow_odgromowych() -> None:
    """Dwa przewody odgromowe w odwrotnej kolejności — ta sama redukcja Krona (± zaokrąglenie)."""
    dwa = ((-3.0, 22.0), (3.0, 22.0))
    a = _z_geometria(odgromowe=_polozenia(dwa))
    b = _z_geometria(odgromowe=_polozenia(tuple(reversed(dwa))))
    wa, wb = oblicz_parametry_linii(a), oblicz_parametry_linii(b)
    assert cmath.isclose(
        complex(wa.r0_ohm_per_km, wa.x0_ohm_per_km),
        complex(wb.r0_ohm_per_km, wb.x0_ohm_per_km),
        rel_tol=1e-12,
    )
