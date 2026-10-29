"""Bateria kondensatorów równoległych SN — algebra admitancji, mocy biernej i prądu
pojemnościowego (karta UX-04/POLE-BKR-MODEL).

Wzory (pierwsze zasady, element poprzeczny o stałej admitancji):

    B = Q_n·u / U_n²   [S]           u = n_zał / n — udział stopni załączonych
    G = P_str·u / U_n² [S]           straty czynne jako konduktancja równoległa (P = G·U²)
    y = (G + jB)·U_b²/S_b  [p.u.]    zapisane jako (Q_n·u/S_b)·(U_b/U_n)², żeby przy U_b = U_n,
                                     u = 1 i bez strat wynik był BIT W BIT równy Q_n/S_b
                                     (wzór sprzed karty, parytet złotych wyników rozpływu)
    y_d = 1 / (jX_L + 1/y)           dławik szeregowy ograniczający prąd załączania
    Q(U) = b·|U|²·S_b = Q_n·u·(U/U_n)²       moc bierna oddawana przy napięciu szyny U
    Y0 = Y [S], I_C = √3·U·B0                udział baterii w gwieździe uziemionej w prądzie
                                             pojemnościowym doziemienia (sieć izolowana
                                             i skompensowana, doziemienie metaliczne) —
                                             sumę I_C sieci liczy solver uziemienia punktu
                                             neutralnego (``solvers.v126_academic``)

Reguły pakietu ``pochodne`` (K4.1/K4.5): liczby na wejściu i wyjściu, zero znajomości domeny,
importy wyłącznie ``math``.
"""

from __future__ import annotations

import math


def udzial_stopni_zalaczonych(stopnie_zalaczone: list[bool] | None, liczba_stopni: int) -> float:
    """u = n_zał/n; ``None`` = wszystkie stopnie załączone (u = 1,0 dokładnie)."""
    if stopnie_zalaczone is None:
        return 1.0
    return sum(1 for stopien in stopnie_zalaczone if stopien) / liczba_stopni


def reaktancja_dlawika_ohm(indukcyjnosc_mh: float, czestotliwosc_hz: float) -> float:
    """X_L = 2π·f·L [Ω] (L[mH] → H: ×1e-3)."""
    return 2.0 * math.pi * czestotliwosc_hz * indukcyjnosc_mh * 1e-3


def admitancja_baterii_pu(
    *,
    moc_bierna_mvar: float,
    napiecie_znamionowe_kv: float,
    napiecie_bazy_kv: float,
    moc_bazy_mva: float,
    udzial_stopni: float,
    straty_kw: float | None,
    reaktancja_dlawika_ohm: float | None,
) -> complex:
    """Admitancja baterii w p.u. na bazie szyny (U_b, S_b) — patrz wzory w nagłówku modułu.

    ``straty_kw is None`` = bateria bez strat w danych (G = 0); ``reaktancja_dlawika_ohm is
    None`` = bez dławika. Udział stopni 0 (wszystkie wyłączone) daje admitancję zerową.
    """
    przelicznik = (napiecie_bazy_kv / napiecie_znamionowe_kv) ** 2
    b_pu = (moc_bierna_mvar * udzial_stopni) / moc_bazy_mva * przelicznik
    g_pu = (
        ((straty_kw / 1000.0) * udzial_stopni) / moc_bazy_mva * przelicznik
        if straty_kw is not None
        else 0.0
    )
    y_pu = complex(g_pu, b_pu)
    if reaktancja_dlawika_ohm is None or y_pu == 0:
        return y_pu
    impedancja_bazy_ohm = (napiecie_bazy_kv**2) / moc_bazy_mva
    return 1.0 / (complex(0.0, reaktancja_dlawika_ohm / impedancja_bazy_ohm) + 1.0 / y_pu)


def moc_bierna_przy_napieciu_mvar(
    susceptancja_pu: float, napiecie_pu: float, moc_bazy_mva: float
) -> float:
    """Q = b·|U|²·S_b [Mvar] — moc bierna oddawana przez baterię przy napięciu szyny U [p.u.]."""
    return susceptancja_pu * (napiecie_pu**2) * moc_bazy_mva


def moc_czynna_strat_przy_napieciu_mw(
    konduktancja_pu: float, napiecie_pu: float, moc_bazy_mva: float
) -> float:
    """P = g·|U|²·S_b [MW] — straty czynne baterii przy napięciu szyny U [p.u.]."""
    return konduktancja_pu * (napiecie_pu**2) * moc_bazy_mva


def zakres_mocy_z_tolerancji_mvar(
    moc_bierna_mvar: float,
    udzial_stopni: float,
    tolerancja_min_proc: float,
    tolerancja_max_proc: float,
) -> tuple[float, float]:
    """Zakres mocy biernej stopni załączonych przy U_n z tolerancji pojemności:
    Q_n·u·(1 + δ_min/100) … Q_n·u·(1 + δ_max/100) [Mvar]."""
    return (
        moc_bierna_mvar * udzial_stopni * (1.0 + tolerancja_min_proc / 100.0),
        moc_bierna_mvar * udzial_stopni * (1.0 + tolerancja_max_proc / 100.0),
    )


def admitancja_baterii_siemens(
    *,
    moc_bierna_mvar: float,
    napiecie_znamionowe_kv: float,
    udzial_stopni: float,
    straty_kw: float | None,
    reaktancja_dlawika_ohm: float | None,
) -> complex:
    """Admitancja baterii na fazę [S]: B = Q_n·u/U_n², G = P_str·u/U_n², z dławikiem
    y_d = 1/(jX_L + 1/y). Dla gwiazdy uziemionej to także admitancja zerowa fazy względem
    ziemi (Y0 = Y1), z której wynika udział baterii w prądzie pojemnościowym doziemienia
    I_C = √3·U·B0 (sieć izolowana i skompensowana, doziemienie metaliczne)."""
    b_s = (moc_bierna_mvar * udzial_stopni) / (napiecie_znamionowe_kv**2)
    g_s = (
        ((straty_kw / 1000.0) * udzial_stopni) / (napiecie_znamionowe_kv**2)
        if straty_kw is not None
        else 0.0
    )
    y_s = complex(g_s, b_s)
    if reaktancja_dlawika_ohm is None or y_s == 0:
        return y_s
    return 1.0 / (complex(0.0, reaktancja_dlawika_ohm) + 1.0 / y_s)


def admitancja_sekcji_baterii_siemens(
    *,
    moc_bierna_mvar: float,
    napiecie_znamionowe_kv: float,
    liczba_stopni: int,
    stopnie_odniesienia: int,
    straty_kw: float | None,
    reaktancja_dlawika_ohm: float | None,
) -> complex:
    """Admitancja jednego stopnia do zapisu liniowego baterii (sekcja × liczba sekcji):
    y_s = y(k/n)/k [S] przy k stopniach odniesienia (k ≥ 1).

    Bez dławika admitancja jest liniowa w udziale stopni (y(u) = u·y(1)), więc y_s nie
    zależy od k i iloczyn y_s·m jest dokładny dla każdej liczby m załączonych stopni. Z dławikiem
    y_d(u) = 1/(jX_L + 1/(u·y(1))) nie jest liniowa: y_s jest dokładna dla m = k (stan
    odniesienia), a dla m ≠ k odchyłka względna jest rzędu X_L/X_C (np. 0,1 mH przy baterii
    1,2 Mvar / 15 kV: 0,031 Ω wobec 187,5 Ω, ok. 1,7·10⁻⁴)."""
    y = admitancja_baterii_siemens(
        moc_bierna_mvar=moc_bierna_mvar,
        napiecie_znamionowe_kv=napiecie_znamionowe_kv,
        udzial_stopni=stopnie_odniesienia / liczba_stopni,
        straty_kw=straty_kw,
        reaktancja_dlawika_ohm=reaktancja_dlawika_ohm,
    )
    return y / stopnie_odniesienia


def moc_z_admitancji_sekcji_mva(
    y_sekcji_s: complex, liczba_sekcji: int, napiecie_znamionowe_kv: float
) -> complex:
    """Moc baterii przy napięciu znamionowym z admitancji sekcji: S = P_str + jQ_n =
    y_s·N·U_n² [MW + jMvar] — para ``admitancja_sekcji_baterii_siemens`` dla baterii bez
    dławika (import zapisu liniowego CGMES)."""
    return y_sekcji_s * liczba_sekcji * (napiecie_znamionowe_kv**2)
