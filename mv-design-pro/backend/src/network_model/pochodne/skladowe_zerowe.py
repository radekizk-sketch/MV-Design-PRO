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


def impedancja_rownolegla_ohm(z_a_ohm: complex, z_b_ohm: complex) -> complex:
    """Impedancja dwóch gałęzi równoległych: Z = Z_a·Z_b / (Z_a + Z_b) [Ω].

    Wołający: zespół uziemiający z układem równoległym rezystor ‖ dławik w punkcie
    neutralnym (ENEA Zeszyt 1 §16) — wynik to szeregowy odpowiednik R_N + jX_N, który niesie
    ``GroundingConfig``. Suma zerowa (dwie gałęzie zwierające się wzajemnie) nie ma sensu
    fizycznego dla punktu neutralnego — ``ValueError``.
    """
    suma = z_a_ohm + z_b_ohm
    if suma == 0:
        raise ValueError("impedancja równoległa: suma impedancji gałęzi równa zeru")
    return z_a_ohm * z_b_ohm / suma


def impedancja_zerowa_zespolu_uziemiajacego_ohm(
    z_t0_ohm: complex, z_punktu_neutralnego_ohm: complex
) -> complex:
    """Impedancja zerowa zespołu uziemiającego widziana z szyn SN: Z_0 = Z_T0 + 3·Z_N [Ω].

    Transformator uziemiający ZNyn11 (ENEA Zeszyt 1 §16) daje drogę składowej zerowej przez
    swoją impedancję zerową na fazę Z_T0 i element punktu neutralnego Z_N (dławik, rezystor
    albo ich układ równoległy); prąd zerowy trzech faz płynie przez Z_N, stąd 3·Z_N w obwodzie
    jednej fazy (IEC 60909-0:2016 § 6, składowe symetryczne). Wynik zasila ``Source.r0_ohm``/
    ``x0_ohm`` równoważnika na szynach SN — ten sam nośnik, który czyta solver zwarć 1F.
    """
    return z_t0_ohm + 3.0 * z_punktu_neutralnego_ohm
