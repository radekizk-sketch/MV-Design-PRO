"""Składowa zerowa — algebra wielkości pochodnych uziemienia punktu neutralnego
(karta W5-A, `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1 p. 1).

Wzory (IEC 60909-0:2016 § 6, składowe symetryczne):

    Z_N  = R_N + jX_N                       impedancja w punkcie neutralnym
    Z_0  = Z_T0 + 3·Z_N                     zerowa impedancja gałęzi uziemiającej
    Z_T0 = Z_T (założenie jawne: brak odrębnej Z_T0 w danych katalogowych —
           to samo założenie co ``enm/zero_sequence_transformer.py``)
    Z_T  = (u_k/100)·U²/S_rT [Ω],  R_T = (P_k/S_rT)·U²/S_rT,  X_T = √(Z_T² − R_T²)

Reguły pakietu ``pochodne`` (K4.1/K4.5): tylko liczby na wejściu i wyjściu,
zero znajomości domeny (Bus/Source/ENM), importy wyłącznie ``math``/``cmath``.
Wołający (operacja domenowa `add_grid_source_sn`) buduje z tych funkcji ślad
White Box: wzór → dane → podstawienie → wynik i oznacza proweniencję
``WYPROWADZONE``; walidacja/odmowa (brak danych, ``isolated``) zostaje u wołającego.
"""

from __future__ import annotations

import math

from network_model.pochodne.wielkosci_pochodne import impedancja_z_napiecia_i_mocy_ohm

#: Znacznik proweniencji liczb R0/X0 źródła policzonych TU z opisu punktu
#: neutralnego (a nie zadeklarowanych przez projektanta / OSD).
PROWENIENCJA_WYPROWADZONE = "WYPROWADZONE"


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


def impedancja_rozproszenia_transformatora_ohm(
    uk_percent: float, pk_kw: float, sn_mva: float, u_kv: float
) -> complex:
    """Z_T [Ω] odniesiona do strony o napięciu U: Z_T(pu@S_rT) · U²/S_rT."""
    z_base_ohm = impedancja_z_napiecia_i_mocy_ohm(u_kv, sn_mva)
    return impedancja_rozproszenia_transformatora_pu(uk_percent, pk_kw, sn_mva) * z_base_ohm


def impedancja_zerowa_zrodla_z_uziemienia_ohm(z_t0_ohm: complex, z_n_ohm: complex) -> complex:
    """Z_0 = Z_T0 + 3·Z_N — impedancja zerowa równoważnika źródła widziana z szyny SN."""
    return z_t0_ohm + 3.0 * z_n_ohm
