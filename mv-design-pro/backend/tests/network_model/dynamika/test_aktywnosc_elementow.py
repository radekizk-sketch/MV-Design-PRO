"""Aktywnosc elementow sieci w rdzeniu dynamiki (karta AB-1b.1, P2, twierdzenie D-19).

CO SIE ZMIENILO I DLACZEGO. Do tej karty rdzen zakladal „wszystko aktywne", a adapter
PORZUCAL galaz otwarta albo poza ruchem i baterie wylaczona. Skutek: sprzeglo
normalnie otwarte, lacznik rezerwowy, kabel poza ruchem i bateria wylaczona byly
NIEOSIAGALNE dla zdarzenia — proba zamkniecia konczyla sie `dynamika.zdarzenie_bez_
elementu` (W6-A Z-03). Teraz kazdy element istnieje w rdzeniu od t = 0 i niesie
stan aktywny/nieaktywny; zdarzenie zmienia stan, a siec jest skladana od nowa.

ILOCZYN CECH (CLAUDE.md „KLASA, NIE INSTANCJA" p. 2): {linia z susceptancja, kabel,
transformator z przekladnia zespolona, lacznik (impedancja zastepcza), bateria,
odbior} x {aktywny w t = 0, nieaktywny} x {zalaczenie, wylaczenie}. Kazdy element
badany stoi ROWNOLEGLE do galezi stale czynnej, wiec zadna kombinacja nie tworzy
obszaru beznapieciowego (to jest zakres P3) — test mierzy WYLACZNIE mechanizm
aktywnosci.

WYROCZNIA. Macierz admitancyjna po zdarzeniu porownana BITOWO (odcisk kanoniczny) z
macierza zlozona OD NOWA z wejscia, w ktorym stan poczatkowy elementu jest stanem
docelowym zdarzenia — dwie drogi do tej samej topologii (zdarzenie w biegu vs. flaga
w danych). Dla odbioru, ktory nie zmienia macierzy, wyrocznia jest algebra
rozwiazana niezaleznie (`siec.rozwiaz_algebre`) bez tego odbioru przy stanach
urzadzen odczytanych z wyniku w chwili zdarzenia.
"""

from __future__ import annotations

import cmath
import dataclasses
from typing import Any

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    PunktPracy,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZmianaOdbioru,
    ZmianaOdsprzegu,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.kontrakty import KOD_ZDARZENIE_BEZ_ELEMENTU
from network_model.solvers.dynamika.siec import rozwiaz_algebre
from network_model.solvers.dynamika.tozsamosc import kwantyzuj, skrot_kanoniczny

from tests.network_model.dynamika import uklady


def _indeks_probki_p(wynik, t_s: float) -> int:
    """Indeks probki `P` chwili zdarzenia (stan po zdarzeniu; `L` stoi tuz przed nia).

    Os czasu ma w chwili zdarzenia DWIE probki (karta AB-1b.1 par. 0 pkt 6), wiec
    `os_czasu_s.index(t)` wskazaloby probke `L` — strona jest tu wybierana jawnie.
    """
    return next(
        i
        for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if t == t_s and strona == "P"
    )


T_ZDARZENIA_S = 0.05

#: Galezie badane: (admitancja szeregowa, susceptancja calkowita, przekladnia).
RODZAJE_GALEZI: dict[str, tuple[complex, float, complex]] = {
    "linia": (1.0 / complex(0.02, 0.1), 0.004, complex(1.0, 0.0)),
    "kabel": (1.0 / complex(0.03, 0.015), 0.01, complex(1.0, 0.0)),
    "transformator": (1.0 / complex(0.002, 0.08), 0.0, 1.02 * cmath.exp(-0.01j)),
    "lacznik": ((15.0**2 / 100.0) / complex(0.0001, 0.0001), 0.0, complex(1.0, 0.0)),
}


def _uklad(
    *,
    galaz: str | None,
    aktywna: bool,
    odsprzeg: bool,
    odbior: bool,
) -> tuple[WejscieDynamiki, dict[str, Any]]:
    """SMIB + wezel AUX zasilany galezia stala; element badany rownolegle albo na GEN.

    Punkt pracy jest wyznaczony DOKLADNIE z algebry liniowej: AUX nie ma wstrzykniec,
    wiec `V_AUX = -Y[AUX,GEN] V_GEN / Y[AUX,AUX]`, a prady urzadzen to `(Y V)` w ich
    wezlach (z odbiorem na GEN — plus prad odbioru).
    """
    smib = uklady.zbuduj_smib()
    wezly = (*smib.wezly, WezelDynamiki("AUX", uklady.U_N_KV))
    galezie = [
        *smib.galezie,
        GalazDynamiki(
            "STALA", "GEN", "AUX", 1.0 / complex(0.01, 0.05), 0.002, 1 + 0j, True, "linia"
        ),
    ]
    if galaz is not None:
        y, b, a = RODZAJE_GALEZI[galaz]
        galezie.append(GalazDynamiki("BADANA", "GEN", "AUX", y, b, a, aktywna, galaz))  # type: ignore[arg-type]
    odsprzegi = (OdsprzegDynamiki("BAT", "GEN", 0.0, 0.02, aktywna),) if odsprzeg else ()
    odbiory = (OdbiorDynamiki("ODB", "GEN", 0.2, 0.05),) if odbior else ()
    model = zloz_model_sieci(wezly, tuple(galezie), odsprzegi)
    y_bus = model.ybus.toarray()
    v_gen = smib.punkt_pracy.napiecia_pu["GEN"]
    v_sys = smib.punkt_pracy.napiecia_pu["SYS"]
    i_gen, i_sys, i_aux = (model.indeks_wezla[w] for w in ("GEN", "SYS", "AUX"))
    v_aux = -(y_bus[i_aux, i_gen] * v_gen) / y_bus[i_aux, i_aux]
    napiecia = np.zeros(3, dtype=complex)
    napiecia[i_gen], napiecia[i_sys], napiecia[i_aux] = v_gen, v_sys, v_aux
    prady = y_bus @ napiecia
    prad_odbioru = complex(0.2, 0.05).conjugate() / v_gen.conjugate() if odbior else 0j
    punkt = PunktPracy(
        napiecia_pu={"GEN": v_gen, "SYS": v_sys, "AUX": v_aux},
        moce_zrodel_pu={
            "G1": v_gen * (prady[i_gen] + prad_odbioru).conjugate(),
            "SYS1": v_sys * prady[i_sys].conjugate(),
        },
    )
    kontekst = {"wezly": wezly, "galezie": tuple(galezie), "odsprzegi": odsprzegi}
    return (
        WejscieDynamiki(
            wezly=wezly,
            galezie=tuple(galezie),
            odsprzegi=odsprzegi,
            odbiory=odbiory,
            urzadzenia=(smib.maszyna, smib.szyna),
            punkt_pracy=punkt,
            harmonogram=HarmonogramDynamiki(()),
            nastawy=uklady.nastawy(dt_s=0.005, horyzont_s=0.1, krok_wyjscia_s=0.01),
            s_bazowa_mva=uklady.S_BAZOWA_MVA,
            f_bazowa_hz=uklady.F_BAZOWA_HZ,
        ),
        kontekst,
    )


def _odcisk_ybus(ybus: Any) -> str:
    """Ten sam odcisk, ktory silnik zapisuje w sladzie White Box (`siec.odcisk_ybus`)."""
    macierz = ybus.tocoo()
    return skrot_kanoniczny(
        sorted(
            [int(w), int(k), kwantyzuj(v.real), kwantyzuj(v.imag)]
            for w, k, v in zip(macierz.row, macierz.col, macierz.data, strict=True)
        )
    )


@pytest.mark.parametrize("zalacz", [True, False], ids=["zalaczenie", "wylaczenie"])
@pytest.mark.parametrize("aktywna", [True, False], ids=["aktywna_t0", "nieaktywna_t0"])
@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_GALEZI))
def test_zdarzenie_galezi_daje_te_sama_siec_co_stan_poczatkowy_w_danych(
    rodzaj: str, aktywna: bool, zalacz: bool
) -> None:
    wejscie, kontekst = _uklad(galaz=rodzaj, aktywna=aktywna, odsprzeg=False, odbior=False)
    harmonogram = HarmonogramDynamiki((ZmianaGalezi(T_ZDARZENIA_S, "BADANA", zalacz),))
    wynik = SilnikDynamiki(dataclasses.replace(wejscie, harmonogram=harmonogram)).uruchom()

    galezie_docelowe = tuple(
        dataclasses.replace(g, aktywna_na_starcie=zalacz) if g.ident == "BADANA" else g
        for g in kontekst["galezie"]
    )
    oczekiwany = zloz_model_sieci(kontekst["wezly"], galezie_docelowe, kontekst["odsprzegi"])
    assert wynik.slad_white_box["siec"]["odcisk_ybus"] == _odcisk_ybus(oczekiwany.ybus)
    assert [(z.rodzaj, z.ref) for z in wynik.zdarzenia_wykonane] == [
        ("zalaczenie_galezi" if zalacz else "wylaczenie_galezi", "BADANA")
    ]
    assert all(z.residuum_kcl_max < 1e-9 for z in wynik.zdarzenia_wykonane)


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_GALEZI))
def test_galaz_nieaktywna_w_t0_nie_zmienia_macierzy_bitowo(rodzaj: str) -> None:
    """Element nieaktywny nie jest stemplowany: Y-bus t = 0 = Y-bus bez tego elementu."""
    _, kontekst = _uklad(galaz=rodzaj, aktywna=False, odsprzeg=False, odbior=False)
    z_elementem = zloz_model_sieci(kontekst["wezly"], kontekst["galezie"], ())
    bez_elementu = zloz_model_sieci(
        kontekst["wezly"], tuple(g for g in kontekst["galezie"] if g.ident != "BADANA"), ()
    )
    assert (z_elementem.ybus != bez_elementu.ybus).nnz == 0
    assert z_elementem.ybus.nnz == bez_elementu.ybus.nnz


@pytest.mark.parametrize("zalacz", [True, False], ids=["zalaczenie", "wylaczenie"])
@pytest.mark.parametrize("aktywna", [True, False], ids=["aktywna_t0", "nieaktywna_t0"])
def test_zdarzenie_odsprzegu_daje_te_sama_siec_co_stan_poczatkowy_w_danych(
    aktywna: bool, zalacz: bool
) -> None:
    wejscie, kontekst = _uklad(galaz=None, aktywna=aktywna, odsprzeg=True, odbior=False)
    harmonogram = HarmonogramDynamiki((ZmianaOdsprzegu(T_ZDARZENIA_S, "BAT", zalacz),))
    wynik = SilnikDynamiki(dataclasses.replace(wejscie, harmonogram=harmonogram)).uruchom()
    odsprzegi_docelowe = tuple(
        dataclasses.replace(o, aktywna_na_starcie=zalacz) for o in kontekst["odsprzegi"]
    )
    oczekiwany = zloz_model_sieci(kontekst["wezly"], kontekst["galezie"], odsprzegi_docelowe)
    assert wynik.slad_white_box["siec"]["odcisk_ybus"] == _odcisk_ybus(oczekiwany.ybus)
    assert [(z.rodzaj, z.ref) for z in wynik.zdarzenia_wykonane] == [
        ("zalaczenie_odsprzegu" if zalacz else "wylaczenie_odsprzegu", "BAT")
    ]


def test_odsprzeg_nieaktywny_nie_wchodzi_do_bilansu_niezaleznego() -> None:
    """Residuum KCL liczone element po elemencie pomija baterie wylaczona — jak Ybus."""
    wejscie, _ = _uklad(galaz=None, aktywna=False, odsprzeg=True, odbior=False)
    wynik = SilnikDynamiki(wejscie).uruchom()
    assert wynik.wlasnosci.max_residuum_g < 1e-9


@pytest.mark.parametrize(
    "przebieg",
    [(False,), (False, True), (False, True, False)],
    ids=["odlaczenie", "odlaczenie_zalaczenie", "odlaczenie_zalaczenie_odlaczenie"],
)
def test_odlaczenie_odbioru_zdejmuje_go_z_bilansu_wezla(przebieg: tuple[bool, ...]) -> None:
    """Napiecie po odlaczeniu = algebra rozwiazana NIEZALEZNIE bez tego odbioru."""
    wejscie, _ = _uklad(galaz=None, aktywna=True, odsprzeg=False, odbior=True)
    # Chwile na siatce probek zapisane WPROST (0,05 + 0,01 = 0,060000000000000005 != 0,06).
    chwile = [0.05, 0.06, 0.07][: len(przebieg)]
    harmonogram = HarmonogramDynamiki(
        tuple(ZmianaOdbioru(t, "ODB", stan) for t, stan in zip(chwile, przebieg, strict=True))
    )
    wynik = SilnikDynamiki(dataclasses.replace(wejscie, harmonogram=harmonogram)).uruchom()
    assert [z.rodzaj for z in wynik.zdarzenia_wykonane] == [
        "zalaczenie_odbioru" if stan else "odlaczenie_odbioru" for stan in przebieg
    ]

    i = _indeks_probki_p(wynik, chwile[-1])
    stany = tuple(
        np.array([wynik.probki[f"{nazwa}@{u.ident}"][i] for nazwa in u.nazwy_stanow])
        for u in wejscie.urzadzenia
    )
    model = zloz_model_sieci(wejscie.wezly, wejscie.galezie, wejscie.odsprzegi)
    odbiory = wejscie.odbiory if przebieg[-1] else ()
    start = np.array(
        [
            cmath.rect(
                wynik.probki[f"u_pu@{w}"][i - 1], np.radians(wynik.probki[f"kat_deg@{w}"][i - 1])
            )
            for w in model.identy_wezlow
        ]
    )
    niezalezna = rozwiaz_algebre(
        model,
        odbiory,
        wejscie.urzadzenia,
        stany,
        start,
        tolerancja=1e-13,
        max_iteracji=40,
        max_nawrotow=30,
        t_s=chwile[-1],
    ).napiecia
    for pozycja, wezel in enumerate(model.identy_wezlow):
        assert wynik.probki[f"u_pu@{wezel}"][i] == pytest.approx(abs(niezalezna[pozycja]), abs=1e-9)


@pytest.mark.parametrize(
    "zdarzenie",
    [ZmianaOdsprzegu(0.05, "NIE_MA", True), ZmianaOdbioru(0.05, "NIE_MA", False)],
    ids=["odsprzeg", "odbior"],
)
def test_zdarzenie_na_nieistniejacym_elemencie_jest_odmawiane(zdarzenie: Any) -> None:
    wejscie, _ = _uklad(galaz=None, aktywna=True, odsprzeg=True, odbior=True)
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            dataclasses.replace(wejscie, harmonogram=HarmonogramDynamiki((zdarzenie,)))
        ).uruchom()
    assert blad.value.kod == KOD_ZDARZENIE_BEZ_ELEMENTU


def test_kanaly_galezi_nieaktywnej_istnieja_od_t0_i_niosa_zero() -> None:
    """Galaz nieaktywna ma kanaly od poczatku — zdarzenie nie dopisuje kanalu w biegu."""
    wejscie, _ = _uklad(galaz="kabel", aktywna=False, odsprzeg=False, odbior=False)
    harmonogram = HarmonogramDynamiki((ZmianaGalezi(T_ZDARZENIA_S, "BADANA", True),))
    wynik = SilnikDynamiki(dataclasses.replace(wejscie, harmonogram=harmonogram)).uruchom()
    prad = wynik.probki["i_od_pu@BADANA"]
    i = _indeks_probki_p(wynik, T_ZDARZENIA_S)
    assert all(wartosc == 0.0 for wartosc in prad[:i])
    assert prad[i] > 0.0
