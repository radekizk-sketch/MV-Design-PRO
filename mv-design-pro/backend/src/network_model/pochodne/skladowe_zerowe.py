"""Składowa zerowa — algebra wielkości pochodnych uziemienia punktu neutralnego
(karta W5-A, `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1 p. 1).

Wzory (IEC 60909-0:2016 § 6, składowe symetryczne):

    Z_N  = R_N + jX_N                       impedancja w punkcie neutralnym
    Z_T  = (u_k/100)·U²/S_rT [Ω],  R_T = (P_k/S_rT)·U²/S_rT,  X_T = √(Z_T² − R_T²)

Reguły pakietu ``pochodne`` (K4.1/K4.5): tylko liczby na wejściu i wyjściu,
zero znajomości domeny (Bus/Source/ENM), importy wyłącznie ``math``/``cmath``.
Wołający: model składowej zerowej transformatora (``enm/zero_sequence_transformer.py``).
Karta GPZ-MODEL usunęła wyprowadzanie Z0 równoważnika GPZ z transformatora WN/SN
(Z_0 = Z_T0 + 3·Z_N): przy równoważniku na szynach SN transformatora nie ma w modelu,
a przy równoważniku 110 kV punkt neutralny SN opisuje transformator modelu.
"""

from __future__ import annotations

import math


def impedancja_punktu_neutralnego_ohm(r_ohm: float | None, x_ohm: float | None) -> complex:
    """Z_N = R_N + jX_N; brakująca składowa PRZECIWNA (X rezystora, R dławika)
    jest fizycznie pomijalna i wchodzi jako 0 Ω — brak składowej DOMINUJĄCEJ
    rozstrzyga wołający PRZED wywołaniem (zero fabrykacji)."""
    return complex(r_ohm if r_ohm is not None else 0.0, x_ohm if x_ohm is not None else 0.0)


def impedancja_rozproszenia_transformatora_pu(
    uk_percent: float, pk_kw: float, sn_mva: float
) -> complex:
    """Z_T w per-unit na S_rT: z = u_k/100; r = (P_k/1000)/S_rT; x = √(z² − r²).

    Kopia bit w bit wyrażenia z ``enm/zero_sequence_transformer._z_t_leakage_pu_sn``
    (ta sama kolejność działań zmiennoprzecinkowych) — tamta funkcja woła odtąd tę.
    """
    z_pu = uk_percent / 100.0
    r_pu = (pk_kw / 1000.0) / sn_mva if sn_mva > 0 else 0.0
    disc = z_pu * z_pu - r_pu * r_pu
    x_pu = math.sqrt(disc) if disc > 0 else 0.0
    return complex(r_pu, x_pu)


def reaktancja_dlawika_dostrojonego_ohm(
    susceptancja_zerowa_sieci_s: float, rozstrojenie: float
) -> float:
    """X_N dławika gaszącego dostrojonego do pojemności doziemnej sieci z rozstrojeniem v.

    Prąd pojemnościowy I_C = 3·B_0·U_f (B_0 = ω·C_0 — suma susceptancji zerowych sieci
    na fazę, S); prąd dławika I_L = U_f/X_N; nadkompensacja I_L = (1 + v)·I_C ⇒
    X_N = 1 / (3·B_0·(1 + v)) [Ω]. Wołający podaje B_0 > 0 i v > −1.
    """
    return 1.0 / (3.0 * susceptancja_zerowa_sieci_s * (1.0 + rozstrojenie))


#: Prąd znamionowy punktu neutralnego transformatora uziemiającego przyjęty do wartości roboczej
#: Z0 [A]: górna granica zakresu dławika gaszącego „minimum 40 - 400 A” (ENEA Operator, Stacje
#: 110 kV, Zeszyt 1, wersja 02.2023 – 2, §16 s.29) — zespół dobrany na połączoną sieć sekcji A+B.
PRAD_PUNKTU_NEUTRALNEGO_ROBOCZY_A = 400.0
#: Spadek napięcia na impedancji zerowej uzwojenia zygzakowego przy tym prądzie, ułamek napięcia
#: fazowego — założenie inżynierskie (transformator uziemiający dobiera się tak, by jego Z0 była
#: małą częścią impedancji drogi zerowej; IEC 60076-6 każe Z0 podać na tabliczce, wartości nie
#: narzuca).
SPADEK_NA_Z0_ZYGZAKA_ROBOCZY = 0.05
#: Stosunek X0/R0 uzwojenia zygzakowego (miedź, rozproszenie między półuzwojeniami jednej
#: kolumny) — założenie inżynierskie.
X_DO_R_Z0_ZYGZAKA_ROBOCZY = 5.0


def impedancja_zerowa_zygzaka_robocza_ohm(u_kv: float) -> complex:
    """Wartość ROBOCZA impedancji zerowej na fazę uzwojenia zygzakowego [Ω] na napięciu U [kV].

    Prąd w punkcie neutralnym I_N = 3·I_0 dzieli się po równo na trzy fazy, więc spadek na Z_0
    fazy wynosi I_0·Z_0 = (I_N/3)·Z_0. Warunek spadku s·U_f przy I_N daje
    |Z_0| = 3·s·U_f / I_N, U_f = U/√3; R_0 = |Z_0|/√(1 + (X/R)²), X_0 = (X/R)·R_0.
    Liczbowo (s = 0,05; I_N = 400 A; X/R = 5): 15 kV → |Z_0| = 3,248 Ω (R_0 0,637, X_0 3,184);
    20 kV → |Z_0| = 4,330 Ω (R_0 0,849, X_0 4,246). Dla porównania wzór u_k pozycji 100 kVA
    (u_k 4 %) dawał 0,04·15²/0,1 = 90 Ω — rząd wielkości za dużo, bo u_k opisuje uzwojenie
    potrzeb własnych, nie drogę zerową zygzaka.
    """
    u_f_v = u_kv * 1000.0 / math.sqrt(3.0)
    z_abs = 3.0 * SPADEK_NA_Z0_ZYGZAKA_ROBOCZY * u_f_v / PRAD_PUNKTU_NEUTRALNEGO_ROBOCZY_A
    r0 = z_abs / math.sqrt(1.0 + X_DO_R_Z0_ZYGZAKA_ROBOCZY * X_DO_R_Z0_ZYGZAKA_ROBOCZY)
    return complex(r0, X_DO_R_Z0_ZYGZAKA_ROBOCZY * r0)
