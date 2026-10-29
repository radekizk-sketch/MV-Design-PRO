"""Składowa zerowa odcinka linii albo kabla — JEDNO źródło R′0/X′0 dla każdego konsumenta.

Zasada nr 4 (brak danych katalogowych nie blokuje obliczeń): odcinek bez R′0/X′0 w modelu
(odcinek z importu, z parametrów ręcznych, pozycja katalogu bez składowej zerowej) nie
zatrzymuje zwarć doziemnych ani rozpływu niesymetrycznego. Obliczenie przyjmuje wartość roboczą
w sieci SN TĄ SAMĄ regułą, którą katalog uzupełnia swoje pozycje
(``network_model.catalog.wartosci_robocze.wyprowadz_skladowa_zerowa``): R′0 = 3·R′1 (kabel ze
znaną żyłą powrotną — ekranem każdej żyły: R′0 = R′1 + R′ żyły powrotnej), X′0 = 3·X′1;
w sieci nN — kabel ze wspólną żyłą powrotną PE/PEN: R′0 = R′1 + 3·R′PE, X′0 = X′1 + 3·X′PE
(ta sama impedancja pętli co analiza pętli zwarcia IEC 60364-4-41). Wartość robocza nie zmienia
modelu — projektant wpisuje R′0/X′0 odcinka i przelicza; do tego czasu każdy wynik oparty na
tej wartości niesie daną przyjętą ``ESTIMATED`` (``enm.dane_przyjete_galezi``).

Nazwana odmowa zostaje tam, gdzie wartości roboczej nie da się przyjąć (``brak_podstawy_pl``):
R′1 albo X′1 nieznane albo niedodatnie (stosunek typowy dotyczy przewodu o niezerowej impedancji
zgodnej), kabel nN bez danych żyły powrotnej (reguła 3·R′1 zaniżałaby R′0 kabla wielożyłowego
i zawyżała prąd doziemny), linia nN (przewód neutralny nieopisany), odcinek WN (R′0/X′0 z
geometrii słupa albo od operatora) albo napięcie szyny nieznane — węzeł odcięty takim odcinkiem
od uziemienia dostaje przyczynę ``brak_danych``, a walidator W001.

Moduł liściowy (``models`` i rejestr wartości roboczych katalogu): konsumenci —
``enm.mapping`` (sieć zerowa zwarć), ``enm.assembler`` (rozpływ niesymetryczny),
``enm.dane_przyjete_galezi`` (założenia biegu i dane przyjęte), ``enm.validator`` (dostępność
zwarć doziemnych), ``application.eligibility_service`` (kwalifikowalność analizy) i walidator
kreatora sieci (rekordy słownikowe przez ``skladowa_zerowa_odcinka``) — biorą R′0/X′0 stąd,
więc predykat „składowa zerowa znana” jest jeden dla bramki i dla obliczenia.

Susceptancja zerowa B′0 (pojemność doziemna) — to samo jedno źródło, osobne pola
(``b0_s_per_km``, ``robocze_b0``, ``brak_b0_pl``): odcinek SN bez B′0 w modelu dostaje wartość
roboczą z pojemności roboczej (kabel B′0 = B′1 — pole promieniowe; linia B′0 = 0,4·B′1 — metoda
odbić zwierciadlanych dla typowych słupów SN, ``wartosci_robocze.wyprowadz_susceptancje_zerowa_sn``).
Konsumenci B′0 (z wartością roboczą): prąd pojemnościowy sieci SN (``enm.uziemienie_sekcji``),
wejście i gotowość projektu uziemienia V12.6 (``solver_input.v126_contracts``,
``application.analyses.v126_gotowosc``) i pojemność sieci IT
(``application.analyses.fault_loop.tt_it`` — pasmo nN, więc odmowa nazwana bez danej modelu).
Bocznik pojemności sieci zerowej zwarć IEC 60909 (``enm.mapping``) czyta wyłącznie B′0 modelu
(``robocze_b0`` puste) — IEC 60909-0:2016 pkt 5.2 f) i rozdz. 1, uzasadnienie przy boczniku.
Rozpływ niesymetryczny B′0 nie czyta (admitancje poprzeczne pominięte z założeniem nazwanym).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from network_model.catalog.wartosci_robocze import (
    ETYKIETA_B0,
    POLA_SKLADOWEJ_ZEROWEJ,
    pola_z0_robocze,
    wyprowadz_skladowa_zerowa,
    wyprowadz_skladowa_zerowa_kabla_nn,
    wyprowadz_susceptancje_zerowa_sn,
)
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe

from .models import Cable, EnergyNetworkModel, OverheadLine

_ETYKIETY_POL = dict(POLA_SKLADOWEJ_ZEROWEJ)
_KOLEJNOSC_POL = {pole: indeks for indeks, (pole, _) in enumerate(POLA_SKLADOWEJ_ZEROWEJ)}


@dataclass(frozen=True)
class SkladowaZerowaOdcinka:
    """R′0/X′0 odcinka do obliczenia oraz pola przyjęte wartością roboczą.

    ``robocze`` — krotki (pole, etykieta, założenie, wartość [Ω/km]) w kolejności
    ``POLA_SKLADOWEJ_ZEROWEJ``: wartość robocza katalogu (pole oznaczone w pozycji katalogu,
    niezmienione przez projektanta) albo wartość robocza odcinka modelu bez składowej zerowej.
    ``brak_podstawy_pl`` — dlaczego wartości roboczej nie da się przyjąć (``None``, gdy
    składowa znana): treść odmowy nazwanej walidatora, kwalifikowalności i wiersza wyniku.
    """

    r0_ohm_per_km: float | None
    x0_ohm_per_km: float | None
    robocze: tuple[tuple[str, str, str, float], ...] = ()
    brak_podstawy_pl: str | None = None
    #: Susceptancja zerowa (pojemność doziemna) B′0 [S/km] z modelu albo z wartości roboczej
    #: (``None`` = nieznana i bez podstawy — ``brak_b0_pl``). Osobno od R′0/X′0: wchodzi
    #: WYŁĄCZNIE tam, gdzie liczy się pojemność doziemna (prąd pojemnościowy sieci, projekt
    #: uziemienia; bocznik sieci zerowej zwarć — tylko B′0 modelu), nie do rozpływu
    #: niesymetrycznego.
    b0_s_per_km: float | None = None
    robocze_b0: tuple[tuple[str, str, str, float], ...] = ()
    brak_b0_pl: str | None = None

    @property
    def znana(self) -> bool:
        """Obie składowe są do obliczenia (z modelu albo z wartości roboczej)."""
        return self.r0_ohm_per_km is not None and self.x0_ohm_per_km is not None


def _brak_podstawy(
    *,
    kabel: bool,
    napiecie_kv: float | None,
    r1: float | None,
    x1: float | None,
) -> str:
    """Przyczyna braku wartości roboczej — kolejność reguł wyprowadzenia."""
    pasmo = pasmo_napieciowe(napiecie_kv)
    if pasmo is None:
        return "napięcie szyny odcinka nieznane — pasma sieci (SN albo nN) nie da się ustalić"
    if pasmo == "SN":
        return "R′1 albo X′1 odcinka nieznane albo niedodatnie (R′0 = 3·R′1, X′0 = 3·X′1)"
    if pasmo == "WN":
        return (
            f"odcinek sieci {napiecie_kv:g} kV — reguła wartości roboczej obejmuje sieci SN "
            "i nN; R′0/X′0 linii WN wyznacza geometria słupa albo dana operatora"
        )
    if not kabel:
        return "linia nN — droga powrotna prądu zerowego (przewód neutralny) nieopisana w modelu"
    if r1 is None or x1 is None or r1 <= 0 or x1 <= 0:
        return "R′1 albo X′1 odcinka nieznane albo niedodatnie"
    return (
        "kabel nN bez rezystancji albo reaktancji żyły powrotnej PE/PEN "
        "(R′0 = R′1 + 3·R′PE, X′0 = X′1 + 3·X′PE)"
    )


def skladowa_zerowa_odcinka(
    *,
    kabel: bool,
    napiecie_kv: float | None,
    r1: float | None,
    x1: float | None,
    r0: float | None,
    x0: float | None,
    r_zyly_powrotnej: float | None,
    x_zyly_powrotnej: float | None,
) -> SkladowaZerowaOdcinka:
    """Składowa zerowa odcinka z prymitywów: pola brakujące uzupełnione wartością roboczą.

    Reguła zależy od pasma napięcia szyny odcinka (``pasma_napieciowe``): SN — reguła
    katalogu (``wyprowadz_skladowa_zerowa``: ekran każdej żyły niesie I0); nN — kabel ze
    wspólną żyłą powrotną PE/PEN (``wyprowadz_skladowa_zerowa_kabla_nn``: żyła niesie 3·I0);
    poza SN i nN albo napięcie nieznane — bez wartości roboczej (odmowa nazwana).
    """
    if r0 is not None and x0 is not None:
        return SkladowaZerowaOdcinka(r0_ohm_per_km=r0, x0_ohm_per_km=x0)
    pochodne: tuple[tuple[str, float, str], ...] = ()
    pasmo = pasmo_napieciowe(napiecie_kv)
    if pasmo == "nN" and kabel:
        pochodne = wyprowadz_skladowa_zerowa_kabla_nn(
            r1=r1,
            x1=x1,
            r_zyly_powrotnej=r_zyly_powrotnej,
            x_zyly_powrotnej=x_zyly_powrotnej,
            brak_r0=r0 is None,
            brak_x0=x0 is None,
        )
    elif pasmo == "SN":
        pochodne = wyprowadz_skladowa_zerowa(
            kabel=kabel,
            r1=r1,
            x1=x1,
            r_zyly_powrotnej=r_zyly_powrotnej,
            brak_r0=r0 is None,
            brak_x0=x0 is None,
            z_katalogu=False,
        )
    if not pochodne:
        return SkladowaZerowaOdcinka(
            r0_ohm_per_km=r0,
            x0_ohm_per_km=x0,
            brak_podstawy_pl=_brak_podstawy(kabel=kabel, napiecie_kv=napiecie_kv, r1=r1, x1=x1),
        )
    wartosci: dict[str, float | None] = {"r0_ohm_per_km": r0, "x0_ohm_per_km": x0}
    robocze: list[tuple[str, str, str, float]] = []
    for pole, wartosc, zalozenie in pochodne:
        wartosci[pole] = wartosc
        robocze.append((pole, _ETYKIETY_POL[pole], zalozenie, wartosc))
    return SkladowaZerowaOdcinka(
        r0_ohm_per_km=wartosci["r0_ohm_per_km"],
        x0_ohm_per_km=wartosci["x0_ohm_per_km"],
        robocze=tuple(robocze),
    )


def _brak_podstawy_b0(*, napiecie_kv: float | None, b1: float | None) -> str:
    """Przyczyna braku wartości roboczej B′0 — kolejność reguły wyprowadzenia."""
    pasmo = pasmo_napieciowe(napiecie_kv)
    if pasmo is None:
        return "napięcie szyny odcinka nieznane — pasma sieci (SN albo nN) nie da się ustalić"
    if pasmo == "WN":
        return (
            f"odcinek sieci {napiecie_kv:g} kV — B′0 linii WN wyznacza geometria słupa albo "
            "dana operatora"
        )
    if pasmo == "nN":
        return (
            "odcinek nN — pojemność doziemna kabla nN (żyły bez ekranów) zależy od budowy "
            "kabla: dana producenta albo pomiar"
        )
    if b1 is None or b1 <= 0:
        return "B′1 odcinka nieznane albo niedodatnie (B′0 kabla = B′1, linii = 0,4·B′1)"
    return "B′0 nieznane"


def susceptancja_zerowa_odcinka(
    *, kabel: bool, napiecie_kv: float | None, b1: float | None, b0: float | None
) -> tuple[float | None, tuple[tuple[str, str, str, float], ...], str | None]:
    """B′0 odcinka z prymitywów: (wartość [S/km] albo ``None``, pola przyjęte wartością
    roboczą, przyczyna braku). Model ma pierwszeństwo; bez B′0 w modelu — reguła pasma SN
    (``wyprowadz_susceptancje_zerowa_sn``: kabel B′0 = B′1, linia B′0 = 0,4·B′1); poza SN,
    przy napięciu nieznanym albo bez B′1 — odmowa nazwana."""
    if b0 is not None:
        return b0, (), None
    pochodne = (
        wyprowadz_susceptancje_zerowa_sn(kabel=kabel, b1=b1)
        if pasmo_napieciowe(napiecie_kv) == "SN"
        else ()
    )
    if not pochodne:
        return None, (), _brak_podstawy_b0(napiecie_kv=napiecie_kv, b1=b1)
    pole, wartosc, zalozenie = pochodne[0]
    return wartosc, ((pole, ETYKIETA_B0, zalozenie, wartosc),), None


def skladowa_zerowa_galezi(
    galaz: Cable | OverheadLine, napiecie_kv: float | None
) -> SkladowaZerowaOdcinka:
    """Składowa zerowa gałęzi modelu: wartości modelu, wartość robocza katalogu (z rejestru
    ``wartosci_robocze`` pozycji) i wartość robocza odcinka bez składowej zerowej — razem.

    ``napiecie_kv`` — napięcie znamionowe szyny początku odcinka (pasmo reguły).
    """
    z_modelu = skladowa_zerowa_odcinka(
        kabel=isinstance(galaz, Cable),
        napiecie_kv=napiecie_kv,
        r1=galaz.r_ohm_per_km,
        x1=galaz.x_ohm_per_km,
        r0=galaz.r0_ohm_per_km,
        x0=galaz.x0_ohm_per_km,
        r_zyly_powrotnej=(
            galaz.return_conductor_r_ohm_per_km_20c if isinstance(galaz, Cable) else None
        ),
        x_zyly_powrotnej=(
            galaz.return_conductor_x_ohm_per_km if isinstance(galaz, Cable) else None
        ),
    )
    wartosci_galezi: dict[str, Any] = {
        "r0_ohm_per_km": galaz.r0_ohm_per_km,
        "x0_ohm_per_km": galaz.x0_ohm_per_km,
    }
    z_katalogu = pola_z0_robocze(galaz.materialized_params, wartosci_galezi)
    robocze = sorted((*z_katalogu, *z_modelu.robocze), key=lambda p: _KOLEJNOSC_POL[p[0]])
    b0, robocze_b0, brak_b0 = susceptancja_zerowa_odcinka(
        kabel=isinstance(galaz, Cable),
        napiecie_kv=napiecie_kv,
        b1=galaz.b_siemens_per_km,
        b0=galaz.b0_siemens_per_km,
    )
    return replace(
        z_modelu,
        robocze=tuple(robocze),
        b0_s_per_km=b0,
        robocze_b0=robocze_b0,
        brak_b0_pl=brak_b0,
    )


def napiecia_szyn_kv(enm: EnergyNetworkModel) -> dict[str, float]:
    """Napięcie znamionowe każdej szyny modelu [kV] — pasmo reguły wartości roboczej odcinka
    (konsumenci podają ``napiecia_szyn_kv(enm).get(galaz.from_bus_ref)``)."""
    return {szyna.ref_id: szyna.voltage_kv for szyna in enm.buses}
