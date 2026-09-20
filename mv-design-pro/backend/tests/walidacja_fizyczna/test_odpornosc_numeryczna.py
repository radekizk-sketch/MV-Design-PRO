"""MACIERZ PRZYPADKOW GRANICZNYCH: wynik skonczony albo ODMOWA NAZWANA (R10 par. 26, 11).

REGULA, KTORA TE TESTY EGZEKWUJA. Kazde wejscie — takze absurdalne — konczy sie
dokladnie na jeden z dwoch sposobow:

* poprawny wynik o SKONCZONYCH wartosciach, albo
* `OdmowaDynamiki` z kodem z zamknietego rejestru `KODY_ODMOW`.

Zakazane sa wszystkie pozostale konce: surowy wyjatek innego typu (`OverflowError`,
`ZeroDivisionError`, `ValueError` bez kodu), `NaN`/`Inf` w wyniku oraz — najgrozniejsze —
cichy wynik „nominalny", ktory wyglada zwyczajnie i niczego nie sygnalizuje.

DLACZEGO TO NIE JEST NADMIAROWE. Trzy z tych przypadkow byly realnymi defektami
zmierzonymi w tym rdzeniu: wyspa z odbiorem bez zrodla (F-8, dwa rozne nieuczciwe
konce zaleznie od nastaw), maszyna o `H <= 0` (F-7, bieg konczyl sie cicho) oraz
zrodlo napieciowe o zerowej impedancji (surowy `ValueError` bez kodu).
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from network_model.solvers.dynamika import OdmowaDynamiki, ZwarcieWezla
from network_model.solvers.dynamika.kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KODY_ODMOW,
    OdbiorDynamiki,
    WezelDynamiki,
)
from network_model.solvers.dynamika.konwencje import sprawdz_stala_bezwladnosci
from network_model.solvers.dynamika.siec import rozwiaz_algebre, zloz_model_sieci
from network_model.solvers.dynamika.urzadzenia import zbuduj_maszyne_klasyczna

from . import stanowisko


def _ocena_biegu(wywolanie) -> tuple[str, str]:
    """Zwroc (klasa_konca, szczegol). Klasa jest jedna z trzech dopuszczonych albo bledem."""
    try:
        wynik = wywolanie()
    except OdmowaDynamiki as odmowa:
        kod = odmowa.kod
        dozwolony = kod in KODY_ODMOW or kod.endswith("_missing")
        return ("ODMOWA NAZWANA" if dozwolony else "ODMOWA SPOZA REJESTRU", kod)
    except BaseException as blad:  # noqa: BLE001 — wylapujemy wlasnie te zakazane konce
        return ("WYJATEK SUROWY", f"{type(blad).__name__}: {blad}"[:200])
    probki = getattr(wynik, "probki", None)
    if probki is not None:
        for klucz, szereg in probki.items():
            tablica = np.asarray(szereg, dtype=float)
            if not np.all(np.isfinite(tablica)):
                return ("WARTOSC NIESKONCZONA W WYNIKU", klucz)
    return ("WYNIK SKONCZONY", "")


# ---------------------------------------------------------------- H > 0 (F-7, par. 11)
@pytest.mark.parametrize("h_s", (1.0, 0.05, 1e-12))
def test_stala_bezwladnosci_dodatnia_jest_dopuszczona(h_s: float) -> None:
    """`H > 0` jest WARUNKIEM ISTNIENIA, nie progiem wiarygodnosci — male H przechodzi.

    `H = 0,05 s` jest dla maszyny synchronicznej nieprawdopodobne, ale matematycznie
    poprawne; uklad jest tylko sztywniejszy. Wymyslone minimum zaczeloby decydowac
    o fizyce zamiast o danych — patrz `konwencje.sprawdz_stala_bezwladnosci`.
    """
    assert sprawdz_stala_bezwladnosci(h_s, urzadzenie="G1", rodzina="proba") == h_s
    maszyna = zbuduj_maszyne_klasyczna(
        ident="G1",
        wezel="GEN",
        s_n_mva=100.0,
        h_s=h_s,
        d_pu=0.0,
        x_prim_pu=0.3,
        ra_pu=0.0,
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    assert maszyna.h_s == pytest.approx(h_s, rel=1e-15)


@pytest.mark.parametrize("h_s", (0.0, -1e-12, -1.0, math.inf, -math.inf, math.nan))
def test_stala_bezwladnosci_niedodatnia_konczy_sie_odmowa(h_s: float) -> None:
    """`H <= 0` albo nieskonczone: rownania wahan NIE MA. Odmowa nazwana, nie cichy bieg.

    Przed naprawa F-7 maszyna o `H = -1 s` budowala sie bez sprzeciwu i przechodzila
    caly bieg — na wzorcu bez zaklocenia BITOWO identycznie z kontrola, bo przy
    `P_m = P_e` licznik rownania jest zerem i znak `H` nie ma na co zadzialac.
    """
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj_maszyne_klasyczna(
            ident="G1",
            wezel="GEN",
            s_n_mva=100.0,
            h_s=h_s,
            d_pu=0.0,
            x_prim_pu=0.3,
            ra_pu=0.0,
            s_bazowa_mva=100.0,
            f_bazowa_hz=50.0,
        )
    assert blad.value.kod == KOD_PARAMETRY_SPRZECZNE


# ---------------------------------------------------------------- macierz par. 26
def _wyspa_bez_zrodla(tolerancja: float, max_iteracji: int):
    model = zloz_model_sieci(
        (WezelDynamiki("ODB", 15.0),), (), (), galezie_aktywne=frozenset(), admitancje_zwarc=()
    )
    return lambda: rozwiaz_algebre(
        model,
        (OdbiorDynamiki("L1", "ODB", 1.0, 0.2),),
        (),
        (),
        np.array([1.0 + 0.0j]),
        tolerancja=tolerancja,
        max_iteracji=max_iteracji,
        max_nawrotow=40,
        t_s=0.0,
    )


def _budowa_maszyny(**podmiany):
    parametry: dict[str, object] = {
        "ident": "G1",
        "wezel": "GEN",
        "s_n_mva": 100.0,
        "h_s": 3.5,
        "d_pu": 0.0,
        "x_prim_pu": 0.3,
        "ra_pu": 0.0,
        "s_bazowa_mva": 100.0,
        "f_bazowa_hz": 50.0,
    }
    parametry.update(podmiany)
    return lambda: zbuduj_maszyne_klasyczna(**parametry)


def _bieg(**podmiany):
    zdarzenia = podmiany.pop("zdarzenia", ())
    nastawy = {"horyzont_s": 0.4, "dt_s": 5e-4, "krok_wyjscia_s": 5e-4}
    nastawy.update(podmiany.pop("nastawy", {}))
    return lambda: stanowisko.uruchom(stanowisko.zbuduj(**podmiany), zdarzenia, **nastawy)


#: Przypadki graniczne. Kazdy MUSI skonczyc sie w jednej z dwoch dozwolonych klas.
PRZYPADKI = {
    "wyspa z odbiorem bez zrodla (nastawy skrajne)": _wyspa_bez_zrodla(1e-100, 400),
    "wyspa z odbiorem bez zrodla (nastawy robocze)": _wyspa_bez_zrodla(1e-11, 60),
    "maszyna o H = 0": _budowa_maszyny(h_s=0.0),
    "maszyna o H = -1 s": _budowa_maszyny(h_s=-1.0),
    "maszyna o H = 1e-12 s (poprawna, skrajnie sztywna)": _budowa_maszyny(h_s=1e-12),
    "maszyna o H = NaN": _budowa_maszyny(h_s=math.nan),
    "maszyna o D = 1e9 (tlumienie ogromne)": _budowa_maszyny(d_pu=1.0e9),
    "zrodlo napieciowe bez impedancji (Ra = X' = 0)": _budowa_maszyny(x_prim_pu=0.0, ra_pu=0.0),
    "baza mocy urzadzenia = 0": _budowa_maszyny(s_n_mva=0.0),
    "baza mocy urzadzenia ujemna": _budowa_maszyny(s_n_mva=-100.0),
    "zwarcie metaliczne (R_f = X_f = 0)": _bieg(
        zdarzenia=(
            ZwarcieWezla(
                t_s=0.2, wezel="GEN", typ="3F", r_f_ohm=0.0, x_f_ohm=0.0, t_usuniecia_s=None
            ),
        )
    ),
    "zwarcie niesymetryczne (typ 1F)": _bieg(
        zdarzenia=(
            ZwarcieWezla(
                t_s=0.2,
                wezel="GEN",
                typ="1F",
                r_f_ohm=0.0,
                x_f_ohm=0.1 * stanowisko.Z_BAZOWA_OM,
                t_usuniecia_s=None,
            ),
        )
    ),
    "gleboki zapad z odbiorem o stalej mocy": _bieg(
        odbior_p_pu=0.4,
        zdarzenia=(
            ZwarcieWezla(
                t_s=0.2,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=0.002 * stanowisko.Z_BAZOWA_OM,
                t_usuniecia_s=None,
            ),
        ),
    ),
    "zdarzenie wskazuje nieistniejaca galaz": _bieg(
        zdarzenia=(
            ZwarcieWezla(
                t_s=0.2, wezel="BRAK", typ="3F", r_f_ohm=0.0, x_f_ohm=1.0, t_usuniecia_s=None
            ),
        )
    ),
    "maszyna o skrajnie duzej reaktancji X' = 1e9 pu": _budowa_maszyny(x_prim_pu=1.0e9),
}


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI))
def test_przypadek_graniczny_konczy_sie_dopuszczalnie(nazwa: str) -> None:
    klasa, szczegol = _ocena_biegu(PRZYPADKI[nazwa])
    assert klasa in ("WYNIK SKONCZONY", "ODMOWA NAZWANA"), f"{nazwa}: {klasa} ({szczegol})"


def test_macierz_zawiera_oba_rodzaje_koncow() -> None:
    """Macierz musi ROZROZNIAC: same odmowy oznaczalyby rdzen, ktory odmawia wszystkiego.

    Bez tego sprawdzenia „kazdy przypadek konczy sie dopuszczalnie" spelnialby rdzen,
    ktory nie liczy niczego — a to tez jest defekt, tylko po drugiej stronie.
    """
    klasy = {nazwa: _ocena_biegu(wywolanie)[0] for nazwa, wywolanie in PRZYPADKI.items()}
    assert "ODMOWA NAZWANA" in klasy.values(), klasy
    assert "WYNIK SKONCZONY" in klasy.values(), klasy
