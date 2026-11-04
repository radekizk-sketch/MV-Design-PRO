"""Prąd cieplny zastępczy I_th przy czasie wyłączenia POLA — IEC 60909-0 §4.7 / rozdz. 12.

PO CO. Bieg zwarciowy liczy I_th = I″k·√(m + n) dla czasu cieplnego całego biegu T_k,bieg
(scenariusz, domyślnie 1 s). Kryterium cieplne aparatury POLA porównuje prąd cieplny z prądem
krótkotrwałym aparatu przeliczonym na czas wyłączenia TEGO pola T_k,pola (nastawy sterownika pola
+ czas własny wyłącznika). Zestawienie I_th(T_k,bieg) z limitem przy T_k,pola mieszało dwa czasy:
składowa nieokresowa (współczynnik m) maleje z czasem, więc dla T_k,pola < T_k,bieg prąd cieplny
biegu jest ZANIŻONY wobec pola (dla κ = 1,557: m(1 s) = 0,017, m(0,36 s) = 0,047) — werdykt
wychodził optymistyczny. Ten moduł liczy I_th pola tą samą formułą normy przy T_k,pola.

JEDNO ŹRÓDŁO m i n. Współczynniki m (składowa nieokresowa) i n (okresowa, n = 1 — górne
oszacowanie, rozstrzygnięcie karty SC-IB-ITH-ZRODLA) liczy WYŁĄCZNIE funkcja rdzenia
``short_circuit_core._thermal_mn_factors`` — ta sama, którą bieg policzył I_th punktu (wywołanie
bez częstotliwości jak w rdzeniu: 50 Hz). Rdzeń nie jest tu edytowany.

ZAPIS DETERMINISTYCZNY. I_th pola = I_th,bieg·√((m_pola + n_pola)/(m_bieg + n_bieg)). Rdzeń daje
I_th,bieg = I″k·√(m_bieg + n_bieg), więc wynik jest tożsamościowo równy I″k·√(m_pola + n_pola)
(wzór normy w śladzie), a przy T_k,pola = T_k,bieg iloraz jest dokładnie 1 i I_th pola jest
bit w bit prądem cieplnym biegu (determinizm, wyniki złote). Bezpośredni iloczyn kA·√(m + n)
różniłby się od zapisu biegu na ostatnim bicie mantysy (zmierzone: 34 % losowych prądów),
bo bieg mnoży w amperach przed przeliczeniem na kA.

BRAK DANEJ NIE JEST LICZBĄ: nieustalony czas wyłączenia pola, brak κ albo czasu cieplnego
w wierszu biegu dają wynik bez I_th z nazwaną przyczyną — nigdy prąd biegu w zastępstwie.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from network_model.solvers.short_circuit_core import _thermal_mn_factors

#: Wzór normy (IEC 60909-0, wzór (100)) — postać pokazywana w śladzie.
WZOR_I_TH_LATEX = r"I_{th} = I''_{k}\sqrt{m + n}"
#: Zapis obliczeniowy przez prąd cieplny biegu (tożsamy ze wzorem normy).
WZOR_I_TH_Z_BIEGU_LATEX = (
    r"I_{th,pola} = I_{th,bieg}\sqrt{\frac{m(T_{k,pola}) + n}{m(T_{k,bieg}) + n}}"
)
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
            "wzor_obliczeniowy_latex": WZOR_I_TH_Z_BIEGU_LATEX,
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


def _brak(
    powod_pl: str,
    *,
    tk_pola_s: float | None,
    ikss_ka: float | None,
    kappa: float | None,
    tk_biegu_s: float | None,
    ith_biegu_ka: float | None,
) -> PradCieplnyPola:
    return PradCieplnyPola(
        ith_ka=None,
        tk_pola_s=tk_pola_s,
        ikss_ka=ikss_ka,
        kappa=kappa,
        m=None,
        n=None,
        tk_biegu_s=tk_biegu_s,
        ith_biegu_ka=ith_biegu_ka,
        m_biegu=None,
        n_biegu=None,
        powod_pl=powod_pl,
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
    (``None`` = nieustalony, przyczyna w ``powod_braku_czasu_pl``).
    """
    dane = {
        "tk_pola_s": tk_pola_s,
        "ikss_ka": ikss_ka,
        "kappa": kappa,
        "tk_biegu_s": tk_biegu_s,
        "ith_biegu_ka": ith_biegu_ka,
    }
    if tk_pola_s is None or tk_pola_s <= 0.0:
        return _brak(
            powod_braku_czasu_pl or "czas wyłączenia zwarcia w polu nie jest ustalony", **dane
        )
    if ikss_ka is None or ith_biegu_ka is None:
        return _brak("wiersz biegu nie niesie prądu zwarciowego punktu zabudowy pola", **dane)
    if kappa is None or tk_biegu_s is None or tk_biegu_s <= 0.0:
        return _brak(
            "wiersz biegu nie niesie współczynnika κ albo czasu cieplnego biegu T_k — "
            "prądu cieplnego przy czasie wyłączenia pola nie da się wyznaczyć; przelicz bieg",
            **dane,
        )
    m_biegu, n_biegu = _thermal_mn_factors(float(kappa), float(tk_biegu_s))
    m_pola, n_pola = _thermal_mn_factors(float(kappa), float(tk_pola_s))
    if not (math.isfinite(m_pola) and math.isfinite(m_biegu)) or m_biegu + n_biegu <= 0.0:
        return _brak(
            "współczynnik składowej nieokresowej m jest nieskończony dla κ i T_k punktu", **dane
        )
    ith_ka = float(ith_biegu_ka) * math.sqrt((m_pola + n_pola) / (m_biegu + n_biegu))
    return PradCieplnyPola(
        ith_ka=ith_ka,
        tk_pola_s=float(tk_pola_s),
        ikss_ka=float(ikss_ka),
        kappa=float(kappa),
        m=m_pola,
        n=n_pola,
        tk_biegu_s=float(tk_biegu_s),
        ith_biegu_ka=float(ith_biegu_ka),
        m_biegu=m_biegu,
        n_biegu=n_biegu,
        powod_pl=None,
    )
