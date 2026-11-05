"""Prąd cieplny zastępczy I_th przy czasie wyłączenia — IEC 60909-0 §4.7 / rozdz. 12.

PO CO. Bieg zwarciowy liczy I_th = I″k·√(m + n) dla czasu cieplnego całego biegu T_k,bieg
(scenariusz, domyślnie 1 s). Kryteria cieplne porównują prąd cieplny z wytrzymałością
przeliczoną na czas wyłączenia zwarcia TEGO elementu: aparatu pola (nastawy sterownika pola
+ czas własny wyłącznika) albo przewodu (czas zabezpieczenia wyłączającego gałąź). Zestawienie
I_th(T_k,bieg) z limitem przy innym T_k mieszało dwa czasy: składowa nieokresowa (współczynnik
m) maleje z czasem, więc dla krótszego T_k prąd cieplny biegu jest ZANIŻONY (dla κ = 1,557:
m(1 s) = 0,017, m(0,36 s) = 0,047) — werdykt wychodził optymistyczny.

JEDNA FUNKCJA I_th. ``prad_cieplny_zastepczy`` jest jedynym miejscem rachunku I_th przy zadanym
czasie dla aparatury pól (``prad_cieplny_pola``) i przewodów
(``conductor_thermal_withstand.check_conductor_thermal_withstand``). Współczynniki m
(składowa nieokresowa) i n (okresowa, n = 1 — górne oszacowanie, rozstrzygnięcie karty
SC-IB-ITH-ZRODLA) liczy WYŁĄCZNIE funkcja rdzenia ``short_circuit_core._thermal_mn_factors`` —
ta sama, którą bieg policzył I_th punktu (wywołanie bez częstotliwości jak w rdzeniu: 50 Hz).
Rdzeń nie jest tu edytowany. Przy T_k = T_k,bieg wynik równa się I_th biegu do zaokrąglenia
ostatniego bitu (bieg mnoży w amperach przed przeliczeniem na kA).

BRAK DANEJ NIE JEST LICZBĄ: nieustalony czas wyłączenia, brak κ albo prądu początkowego dają
wynik bez I_th z nazwaną przyczyną — nigdy prąd biegu w zastępstwie.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from network_model.solvers.short_circuit_core import _thermal_mn_factors

#: Wzór normy (IEC 60909-0, wzór (100)) — postać pokazywana w śladzie.
WZOR_I_TH_LATEX = r"I_{th} = I''_{k}\sqrt{m + n}"
WZOR_M_LATEX = r"m = \frac{1}{2 f T_k \ln(\kappa - 1)}\left(e^{4 f T_k \ln(\kappa - 1)} - 1\right)"
#: Częstotliwość, z którą rdzeń liczy m (wywołanie bez parametru f): ta sama tutaj.
CZESTOTLIWOSC_RDZENIA_HZ = 50.0


@dataclass(frozen=True)
class PradCieplnyPola:
    """Ślad WHITE BOX prądu cieplnego pola; ``ith_ka is None`` — brak wyniku z ``powod_pl``."""

    ith_ka: float | None
    tk_pola_s: float | None
    ikss_ka: float | None
    kappa: float | None
    m: float | None
    n: float | None
    tk_biegu_s: float | None
    ith_biegu_ka: float | None
    m_biegu: float | None
    n_biegu: float | None
    powod_pl: str | None

    def to_dict(self) -> dict[str, Any]:
        wynik: dict[str, Any] = {
            "ith_ka": self.ith_ka,
            "tk_pola_s": self.tk_pola_s,
            "ikss_ka": self.ikss_ka,
            "kappa": self.kappa,
            "m": self.m,
            "n": self.n,
            "tk_biegu_s": self.tk_biegu_s,
            "ith_biegu_ka": self.ith_biegu_ka,
            "m_biegu": self.m_biegu,
            "n_biegu": self.n_biegu,
            "jednostki": {
                "ith_ka": "kA",
                "ikss_ka": "kA",
                "ith_biegu_ka": "kA",
                "tk_pola_s": "s",
                "tk_biegu_s": "s",
                "kappa": "—",
                "m": "—",
                "n": "—",
            },
            "wzor_latex": WZOR_I_TH_LATEX,
            "wzor_m_latex": WZOR_M_LATEX,
            "podstawa_pl": (
                "IEC 60909-0 §4.7 i rozdz. 12 (prąd cieplny zastępczy, wzór (100)); "
                "m i n z rdzenia obliczeń zwarciowych, n = 1 (górne oszacowanie)"
            ),
            "powod_pl": self.powod_pl,
        }
        if self.ith_ka is not None:
            wynik["podstawienie_latex"] = (
                rf"I_{{th}} = {self.ikss_ka:.4g}\ \mathrm{{kA}}\cdot\sqrt{{{self.m:.4g} + "
                rf"{self.n:.4g}}} = {self.ith_ka:.4g}\ \mathrm{{kA}}"
                rf"\quad (\kappa = {self.kappa:.4g},\ T_k = {self.tk_pola_s:.4g}\ \mathrm{{s}})"
            )
        return wynik


@dataclass(frozen=True)
class PradCieplny:
    """I_th przy czasie ``tk_s`` (ślad WHITE BOX); ``ith is None`` — brak wyniku z ``powod_pl``.

    Jednostka ``ith`` = jednostka ``ikss`` (funkcja nie przelicza jednostek).
    """

    ith: float | None
    ikss: float | None
    kappa: float | None
    tk_s: float | None
    m: float | None
    n: float | None
    powod_pl: str | None


def prad_cieplny_zastepczy(
    *,
    ikss: float | None,
    kappa: float | None,
    tk_s: float | None,
    powod_braku_czasu_pl: str | None = None,
) -> PradCieplny:
    """I_th = I″k·√(m(κ, T_k) + n) — JEDYNY rachunek I_th przy zadanym czasie wyłączenia.

    ``ikss`` — prąd początkowy (punktu albo gałęzi), ``kappa`` — współczynnik udaru punktu
    zwarcia, ``tk_s`` — czas trwania zwarcia (``None`` = nieustalony, przyczyna
    w ``powod_braku_czasu_pl``).
    """
    if tk_s is None or tk_s <= 0.0:
        return PradCieplny(
            ith=None,
            ikss=ikss,
            kappa=kappa,
            tk_s=tk_s,
            m=None,
            n=None,
            powod_pl=powod_braku_czasu_pl or "czas wyłączenia zwarcia nie jest ustalony",
        )
    if ikss is None:
        return PradCieplny(
            ith=None,
            ikss=None,
            kappa=kappa,
            tk_s=tk_s,
            m=None,
            n=None,
            powod_pl="brak prądu zwarciowego początkowego I″k",
        )
    if kappa is None:
        return PradCieplny(
            ith=None,
            ikss=ikss,
            kappa=None,
            tk_s=tk_s,
            m=None,
            n=None,
            powod_pl=(
                "wynik biegu nie niesie współczynnika κ — prądu cieplnego przy czasie "
                "wyłączenia nie da się wyznaczyć; przelicz bieg"
            ),
        )
    m, n = _thermal_mn_factors(float(kappa), float(tk_s))
    if not math.isfinite(m):
        return PradCieplny(
            ith=None,
            ikss=ikss,
            kappa=kappa,
            tk_s=tk_s,
            m=None,
            n=None,
            powod_pl="współczynnik składowej nieokresowej m jest nieskończony dla κ i T_k",
        )
    return PradCieplny(
        ith=float(ikss) * math.sqrt(m + n),
        ikss=float(ikss),
        kappa=float(kappa),
        tk_s=float(tk_s),
        m=m,
        n=n,
        powod_pl=None,
    )


def prad_cieplny_pola(
    *,
    ikss_ka: float | None,
    kappa: float | None,
    ith_biegu_ka: float | None,
    tk_biegu_s: float | None,
    tk_pola_s: float | None,
    powod_braku_czasu_pl: str | None = None,
) -> PradCieplnyPola:
    """I_th punktu zabudowy pola przy czasie wyłączenia pola ``tk_pola_s`` (ślad WHITE BOX).

    ``ikss_ka``, ``kappa``, ``ith_biegu_ka`` i ``tk_biegu_s`` — z TEGO SAMEGO wiersza biegu
    (zwarcie trójfazowe w punkcie zabudowy pola); ``tk_pola_s`` — czas wyłączenia pola
    (``None`` = nieustalony, przyczyna w ``powod_braku_czasu_pl``). I_th liczy
    ``prad_cieplny_zastepczy`` z I″k i κ punktu; I_th i T_k biegu (z m, n biegu) stoją
    w śladzie wyłącznie dla porównania — do rachunku nie wchodzą.
    """
    wynik = prad_cieplny_zastepczy(
        ikss=ikss_ka, kappa=kappa, tk_s=tk_pola_s, powod_braku_czasu_pl=powod_braku_czasu_pl
    )
    m_biegu = n_biegu = None
    if kappa is not None and tk_biegu_s is not None and tk_biegu_s > 0.0:
        m_biegu, n_biegu = _thermal_mn_factors(float(kappa), float(tk_biegu_s))
    return PradCieplnyPola(
        ith_ka=wynik.ith,
        tk_pola_s=None if tk_pola_s is None else float(tk_pola_s),
        ikss_ka=None if ikss_ka is None else float(ikss_ka),
        kappa=None if kappa is None else float(kappa),
        m=wynik.m,
        n=wynik.n,
        tk_biegu_s=None if tk_biegu_s is None else float(tk_biegu_s),
        ith_biegu_ka=None if ith_biegu_ka is None else float(ith_biegu_ka),
        m_biegu=m_biegu,
        n_biegu=n_biegu,
        powod_pl=wynik.powod_pl,
    )
