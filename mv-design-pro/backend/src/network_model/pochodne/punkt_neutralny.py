"""Punkt neutralny sieci SN — algebra impedancji zespołu uziemiającego (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, ENEA Zeszyt 1 §16, rysunki Z.13/Z.14/Z.15).

Wzory (IEC 60909-0:2016 §6 — składowe symetryczne; impedancja w punkcie neutralnym
wchodzi do obwodu składowej zerowej jako 3·Z_N):

    X_L   = U_n / (√3·I_L)                dławik gaszący nastawiony na prąd I_L [A]
    R_N   = U_n / (√3·I_R)                rezystor (albo rezystor wymuszający AWSC) o prądzie I_R
    Z_a‖Z_b = Z_a·Z_b / (Z_a + Z_b)       dwie gałęzie punktu neutralnego równolegle (Z.14, AWSC)
    Z_0,ZU = Z_0,TU + 3·Z_N               bocznik składowej zerowej zespołu na szynie SN
    I_C   = √3·U_n·B_0                    prąd pojemnościowy doziemienia sieci (B_0 = Σ b_0·ℓ)

ZAŁOŻENIE JAWNE (bez tekstu IEC 60076-6 w repo): dławik i rezystor są elementami
liniowymi przy napięciu fazowym U_n/√3 na punkcie neutralnym — prąd znamionowy elementu
odpowiada pełnemu przesunięciu punktu neutralnego (metaliczne doziemienie). Straty czynne
dławika (dobroć) nie są modelowane: X_L jest czysto bierne.

Reguły pakietu ``pochodne`` (K4.1/K4.5): tylko liczby na wejściu i wyjściu, zero
znajomości domeny (ENM, katalog), importy wyłącznie ``math``.
"""

from __future__ import annotations

import math

_SQRT3 = math.sqrt(3.0)


def napiecie_fazowe_punktu_neutralnego_v(u_n_kv: float) -> float:
    """U_f = U_n/√3 [V] — napięcie punktu neutralnego przy doziemieniu metalicznym."""
    return u_n_kv * 1000.0 / _SQRT3


def reaktancja_dlawika_ohm(u_n_kv: float, i_l_a: float) -> float:
    """X_L = U_n/(√3·I_L) [Ω] — dławik nastawiony na prąd kompensacyjny I_L."""
    return napiecie_fazowe_punktu_neutralnego_v(u_n_kv) / i_l_a


def rezystancja_z_pradu_ohm(u_n_kv: float, i_r_a: float) -> float:
    """R = U_n/(√3·I_R) [Ω] — rezystor przewodzący prąd I_R przy pełnym U_f."""
    return napiecie_fazowe_punktu_neutralnego_v(u_n_kv) / i_r_a


def prad_elementu_punktu_neutralnego_a(u_n_kv: float, z_ohm: complex) -> float:
    """|I| = U_f/|Z| [A] — prąd elementu punktu neutralnego przy pełnym U_f."""
    return napiecie_fazowe_punktu_neutralnego_v(u_n_kv) / abs(z_ohm)


def impedancja_rownolegla_ohm(z_a: complex, z_b: complex) -> complex:
    """Z_a‖Z_b = Z_a·Z_b/(Z_a+Z_b) — dwie gałęzie punktu neutralnego równolegle."""
    return (z_a * z_b) / (z_a + z_b)


def impedancja_zerowa_zespolu_ohm(z0_tu_ohm: complex, z_n_ohm: complex) -> complex:
    """Z_0,ZU = Z_0,TU + 3·Z_N [Ω] — bocznik składowej zerowej zespołu uziemiającego."""
    return z0_tu_ohm + 3.0 * z_n_ohm


def prad_pojemnosciowy_doziemienia_a(u_n_kv: float, b0_calkowite_s: float) -> float:
    """I_C = √3·U_n·B_0 [A] — prąd pojemnościowy doziemienia metalicznego sieci.

    B_0 [S] = Σ b_0·ℓ gałęzi galwanicznie połączonej sieci (susceptancja zerowa fazy);
    tożsame z 3·ω·C_0·U_f (V12.6 ``_neutral_earthing_design``).
    """
    return _SQRT3 * u_n_kv * 1000.0 * b0_calkowite_s


def stopien_rozstrojenia(i_l_a: float, i_c_a: float) -> float:
    """v = (I_C − I_L)/I_C — stopień rozstrojenia kompensacji (v = 0 to rezonans; v > 0
    niedokompensowanie I_L < I_C, v < 0 przekompensowanie I_L > I_C)."""
    return (i_c_a - i_l_a) / i_c_a
