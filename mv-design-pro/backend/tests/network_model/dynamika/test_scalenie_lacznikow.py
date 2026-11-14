"""Lacznik bez impedancji w rdzeniu dynamiki — wezly scalone, prad z bilansu (karta scalenia).

CO SIE ZMIENILO I DLACZEGO. Adapter dawal lacznikowi zamknietemu impedancje zastepcza
0,0001 + j0,0001 Ohm (ta sama, co dawny rozplyw), wiec dodanie zamknietego wylacznika do
pola zmienialo napiecia i moce biegu czasowego. Lacznik nie ma impedancji: aktywny scala swoje
wezly w jeden wezel elektryczny (ten sam predykat i ten sam reprezentant, co rozplyw i
zwarcia), a jego prad wynika z I prawa Kirchhoffa wezlow grupy (`siec.prady_lacznikow`).

WYROCZNIA NIEZMIENNIKA. Siec X vs siec X z wezlem rozdzielonym zamknietym lacznikiem
(podzial szyny): przebiegi czasowe wszystkich kanalow wspolnych musza byc te same do szumu
arytmetyki. ILOCZYN CECH: {element w grupie: maszyna (sprzezenie pradowe), szyna sztywna,
odbior stalej mocy, zrodlo idealne (sprzezenie napieciowe — wiersz ograniczenia)} x
{lacznik promieniowo, lancuch dwoch lacznikow, petla z dwoch lacznikow, lacznik rownolegly do
galezi} x {zdarzenie: wylaczenie toru, zwarcie przez impedancje w wezle grupy, zwarcie
metaliczne w wezle grupy, skok napiecia zrodla}.

Progi: |dU| <= 1e-10 pu, |dkat| <= 1e-8 stopnia, |dP|, |dQ| <= 1e-7 pu — te same, co
wyrocznia niezmiennika rozplywu (karta scalenia, dowod pkt 2).
"""

from __future__ import annotations

import dataclasses
import math
from typing import Any

import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    PunktPracy,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZwarcieWezla,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_NAPIECIE_NARZUCONE_SPRZECZNE,
    KOD_SIEC_NIESPOJNA,
)
from network_model.solvers.dynamika.urzadzenia import (
    SkokNapiecia,
    rozwin_profil,
    zbuduj_zrodlo_testowe,
)

from tests.network_model.dynamika import uklady

PROG_U_PU = 1e-10
PROG_KAT_DEG = 1e-8
PROG_MOC_PU = 1e-7
T_ZDARZENIA_S = 0.05


def _lacznik(ident: str, od: str, do: str, aktywny: bool = True) -> GalazDynamiki:
    return GalazDynamiki(ident, od, do, 0j, 0.0, 1 + 0j, aktywny, "lacznik")


def _linia(ident: str, od: str, do: str, x_pu: float) -> GalazDynamiki:
    return GalazDynamiki(ident, od, do, 1.0 / complex(0.0, x_pu), 0.0, 1 + 0j, True, "linia")


def _smib_z_odbiorem() -> WejscieDynamiki:
    """SMIB dwutorowy z odbiorem stalej mocy na GEN — siec X wyroczni (bez lacznikow)."""
    z_odbiorem = uklady.zbuduj_smib_z_odbiorem(p_odbioru_pu=0.2, q_odbioru_pu=0.05)
    dwutorowy = uklady.zbuduj_smib_dwutorowy()
    return WejscieDynamiki(
        wezly=z_odbiorem.wezly,
        galezie=dwutorowy.galezie,
        odsprzegi=(),
        odbiory=z_odbiorem.odbiory,
        urzadzenia=(z_odbiorem.maszyna, z_odbiorem.szyna),
        punkt_pracy=z_odbiorem.punkt_pracy,
        harmonogram=HarmonogramDynamiki(()),
        nastawy=uklady.nastawy(dt_s=0.005, horyzont_s=0.2, krok_wyjscia_s=0.01),
        s_bazowa_mva=uklady.S_BAZOWA_MVA,
        f_bazowa_hz=uklady.F_BAZOWA_HZ,
    )


def _przenies(galaz: GalazDynamiki, mapa: dict[str, str]) -> GalazDynamiki:
    return dataclasses.replace(
        galaz,
        wezel_od=mapa.get(galaz.wezel_od, galaz.wezel_od),
        wezel_do=mapa.get(galaz.wezel_do, galaz.wezel_do),
    )


def _podziel(
    wejscie: WejscieDynamiki, wezel: str, uklad: str, *, odbior_na_nowym: bool
) -> tuple[WejscieDynamiki, str]:
    """Siec X z wezlem `wezel` rozdzielonym lacznikami; galezie przeniesione na wezel nowy.

    Zwraca wejscie i identyfikator wezla, do ktorego przeniesiono galezie (zwarcie
    w grupie stawiane jest tam — w innym wezle grupy niz urzadzenie).
    """
    u_n = next(w.u_n_kv for w in wejscie.wezly if w.ident == wezel)
    nowy = f"{wezel}_B"
    nowe_wezly: tuple[WezelDynamiki, ...] = (WezelDynamiki(nowy, u_n),)
    laczniki: tuple[GalazDynamiki, ...]
    if uklad == "promieniowy":
        laczniki = (_lacznik("LACZ1", wezel, nowy),)
    elif uklad == "lancuch":
        posredni = f"{wezel}_A"
        nowe_wezly = (WezelDynamiki(posredni, u_n), WezelDynamiki(nowy, u_n))
        laczniki = (_lacznik("LACZ1", wezel, posredni), _lacznik("LACZ2", posredni, nowy))
    elif uklad == "petla":
        laczniki = (_lacznik("LACZ1", wezel, nowy), _lacznik("LACZ2", nowy, wezel))
    elif uklad == "rownolegly":
        laczniki = (_lacznik("LACZ1", wezel, nowy), _linia("ROWNOLEGLA", wezel, nowy, 0.07))
    else:
        raise AssertionError(uklad)
    mapa = {wezel: nowy}
    galezie = (*(_przenies(g, mapa) for g in wejscie.galezie), *laczniki)
    odbiory = tuple(
        dataclasses.replace(o, wezel=nowy) if odbior_na_nowym and o.wezel == wezel else o
        for o in wejscie.odbiory
    )
    napiecia = dict(wejscie.punkt_pracy.napiecia_pu)
    for w in nowe_wezly:
        napiecia[w.ident] = napiecia[wezel]
    return (
        dataclasses.replace(
            wejscie,
            wezly=(*wejscie.wezly, *nowe_wezly),
            galezie=galezie,
            odbiory=odbiory,
            punkt_pracy=PunktPracy(napiecia, dict(wejscie.punkt_pracy.moce_zrodel_pu)),
        ),
        nowy,
    )


def _roznice(
    odniesienie: Any, podzielona: Any, zwarcie: tuple[str, str] | None = None
) -> dict[str, float]:
    """Najwieksza roznica kanalow wspolnych, wg rodzaju wielkosci.

    `zwarcie` — (wezel zwarcia odniesienia, wezel zwarcia sieci podzielonej): kanaly zwarcia
    sa nazwane miejscem zwarcia, wiec porownywane sa po przemianowaniu.
    """
    assert odniesienie.os_czasu_s == podzielona.os_czasu_s
    assert odniesienie.strona_probki == podzielona.strona_probki
    wynik = {"u": 0.0, "kat": 0.0, "moc": 0.0, "inne": 0.0}
    for klucz, wartosci in odniesienie.probki.items():
        klucz_podz = klucz
        if zwarcie is not None and "zwarcia" in klucz and klucz.endswith(f"@{zwarcie[0]}"):
            klucz_podz = klucz[: -len(zwarcie[0])] + zwarcie[1]
        assert klucz_podz in podzielona.probki, klucz
        for a, b in zip(wartosci, podzielona.probki[klucz_podz], strict=True):
            if a is None or b is None:
                assert a is None and b is None, klucz
                continue
            if klucz.startswith(("u_pu@", "u_f_est")):
                rodzaj = "u"
            elif klucz.startswith(("kat_deg@", "i_od_kat_deg@", "i_do_kat_deg@")):
                rodzaj = "kat"
                roznica = abs(a - b) % 360.0
                wynik[rodzaj] = max(wynik[rodzaj], min(roznica, 360.0 - roznica))
                continue
            elif klucz.startswith(("p_", "q_")):
                rodzaj = "moc"
            else:
                rodzaj = "inne"
            wynik[rodzaj] = max(wynik[rodzaj], abs(a - b))
    return wynik


def _zdarzenia(rodzaj: str, wezel_zwarcia: str) -> tuple[Any, ...]:
    if rodzaj == "wylaczenie_toru":
        return (ZmianaGalezi(T_ZDARZENIA_S, "LINIA2", False),)
    x_f = 0.0 if rodzaj == "zwarcie_metaliczne" else uklady.X_ZWARCIA_PLYTKIEGO_OHM
    return (ZwarcieWezla(T_ZDARZENIA_S, wezel_zwarcia, "3F", 0.0, x_f, 0.1, "samoczynne"),)


@pytest.mark.parametrize("zdarzenie", ["wylaczenie_toru", "zwarcie", "zwarcie_metaliczne"])
@pytest.mark.parametrize("uklad", ["promieniowy", "lancuch", "petla", "rownolegly"])
@pytest.mark.parametrize(
    ("wezel", "odbior_na_nowym"),
    [("GEN", True), ("GEN", False), ("SYS", False)],
    ids=["maszyna_i_odbior_rozdzielone", "maszyna_z_odbiorem", "szyna_sztywna"],
)
def test_podzial_wezla_lacznikiem_nie_zmienia_biegu(
    wezel: str, odbior_na_nowym: bool, uklad: str, zdarzenie: str
) -> None:
    odniesienie_we = _smib_z_odbiorem()
    podzielona_we, nowy = _podziel(odniesienie_we, wezel, uklad, odbior_na_nowym=odbior_na_nowym)
    harmonogram_ref = HarmonogramDynamiki(_zdarzenia(zdarzenie, wezel))
    # Zwarcie w INNYM wezle grupy niz urzadzenie — wezel elektryczny jest ten sam.
    harmonogram_podz = HarmonogramDynamiki(_zdarzenia(zdarzenie, nowy))
    odniesienie = SilnikDynamiki(
        dataclasses.replace(odniesienie_we, harmonogram=harmonogram_ref)
    ).uruchom()
    podzielona = SilnikDynamiki(
        dataclasses.replace(podzielona_we, harmonogram=harmonogram_podz)
    ).uruchom()

    roznice = _roznice(odniesienie, podzielona, (wezel, nowy))
    assert roznice["u"] <= PROG_U_PU, roznice
    assert roznice["kat"] <= PROG_KAT_DEG, roznice
    assert roznice["moc"] <= PROG_MOC_PU, roznice
    assert roznice["inne"] <= PROG_MOC_PU, roznice

    # Wezly grupy maja JEDNO napiecie (wiersz V_m - V_rep = 0) w kazdej probce.
    for i, _ in enumerate(podzielona.os_czasu_s):
        assert podzielona.probki[f"u_pu@{nowy}"][i] == pytest.approx(
            podzielona.probki[f"u_pu@{wezel}"][i], abs=1e-12
        )
    grupy = podzielona.slad_white_box["siec"]["grupy_lacznikow"]
    assert len(grupy) == 1
    assert grupy[0]["reprezentant"] == min(grupy[0]["czlonkowie"])

    # Rekonstrukcja pradu lacznika z bilansu: urzadzenie w wezle `wezel`, reszta za lacznikiem.
    if wezel == "GEN" and uklad in ("promieniowy", "lancuch") and odbior_na_nowym:
        for i, _ in enumerate(podzielona.os_czasu_s):
            assert podzielona.probki["p_od_pu@LACZ1"][i] == pytest.approx(
                odniesienie.probki["p_pu@G1"][i], abs=PROG_MOC_PU
            )
            assert podzielona.probki["q_od_pu@LACZ1"][i] == pytest.approx(
                odniesienie.probki["q_pu@G1"][i], abs=PROG_MOC_PU
            )
    if uklad == "petla" and wezel == "GEN" and odbior_na_nowym:
        # Petla lacznikow: bilans nie wyznacza rozdzialu — najmniejsza norma dzieli prad
        # po rowno (LACZ2 jest skierowany przeciwnie, wiec jego moc ma znak przeciwny).
        for i, _ in enumerate(podzielona.os_czasu_s):
            p1 = podzielona.probki["p_od_pu@LACZ1"][i]
            p2 = podzielona.probki["p_do_pu@LACZ2"][i]
            assert p1 == pytest.approx(p2, abs=1e-12)
            assert p1 + p2 == pytest.approx(odniesienie.probki["p_pu@G1"][i], abs=PROG_MOC_PU)
    if uklad == "rownolegly":
        # Galaz rownolegla do zamknietego lacznika ma na obu koncach to samo napiecie.
        assert max(podzielona.probki["i_od_pu@ROWNOLEGLA"]) <= 1e-12


def _zrodlo_idealne(*, rozdzielone: bool, drugie_zrodlo: bool = False) -> WejscieDynamiki:
    """Zrodlo idealne (sprzezenie napieciowe) na SRC -> linia -> odbior na ODB."""
    wezly = [WezelDynamiki("SRC", 15.0), WezelDynamiki("ODB", 15.0)]
    linia = GalazDynamiki("L", "SRC", "ODB", 1.0 / complex(0.01, 0.05), 0.0, 1 + 0j, True, "linia")
    galezie = [linia]
    odbiory = (OdbiorDynamiki("O1", "ODB", 0.3, 0.1, charakterystyka=uklady.STALA_MOC),)
    y = zloz_model_sieci(tuple(wezly), tuple(galezie), ()).ybus.toarray()
    v_src = complex(1.0, 0.0)
    v_odb = complex(1.0, 0.0)
    for _ in range(100):
        v_odb = (-(complex(0.3, 0.1)).conjugate() / v_odb.conjugate() - y[1, 0] * v_src) / y[1, 1]
    prad = y[0, 0] * v_src + y[0, 1] * v_odb
    napiecia = {"SRC": v_src, "ODB": v_odb}
    urzadzenia: list[Any] = [
        zbuduj_zrodlo_testowe(ident="ZT", wezel="SRC", impedancja_pu=None, f_bazowa_hz=50.0)
    ]
    moce = {"ZT": v_src * prad.conjugate()}
    if rozdzielone:
        wezly.append(WezelDynamiki("SRC_B", 15.0))
        galezie = [dataclasses.replace(linia, wezel_od="SRC_B"), _lacznik("LACZ1", "SRC", "SRC_B")]
        napiecia["SRC_B"] = v_src
        if drugie_zrodlo:
            urzadzenia.append(
                zbuduj_zrodlo_testowe(
                    ident="ZT2", wezel="SRC_B", impedancja_pu=None, f_bazowa_hz=50.0
                )
            )
            moce["ZT2"] = 0j
    return WejscieDynamiki(
        wezly=tuple(wezly),
        galezie=tuple(galezie),
        odsprzegi=(),
        odbiory=odbiory,
        urzadzenia=tuple(urzadzenia),
        punkt_pracy=PunktPracy(napiecia, moce),
        harmonogram=HarmonogramDynamiki(
            rozwin_profil("ZT", (SkokNapiecia(0.1, 0.9),), f_bazowa_hz=50.0)
        ),
        nastawy=uklady.nastawy(dt_s=0.01, horyzont_s=0.3, krok_wyjscia_s=0.05),
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )


def test_zrodlo_napieciowe_w_grupie_narzuca_napiecie_calego_wezla_elektrycznego() -> None:
    """Wiersz ograniczenia `V = E` zostaje w wezle zrodla, reszta grupy: `V_m = V_zrodla`.

    Prad lacznika: wezel zrodla jest UJSCIEM (prad zrodla domyka bilans), wiec prad lacznika
    wynika z bilansu drugiego wezla grupy = prad linii.
    """
    odniesienie = SilnikDynamiki(_zrodlo_idealne(rozdzielone=False)).uruchom()
    podzielona = SilnikDynamiki(_zrodlo_idealne(rozdzielone=True)).uruchom()
    roznice = _roznice(odniesienie, podzielona)
    assert roznice["u"] <= PROG_U_PU, roznice
    assert roznice["kat"] <= PROG_KAT_DEG, roznice
    assert roznice["moc"] <= PROG_MOC_PU, roznice
    for i, _ in enumerate(podzielona.os_czasu_s):
        assert podzielona.probki["p_od_pu@LACZ1"][i] == pytest.approx(
            odniesienie.probki["p_od_pu@L"][i], abs=PROG_MOC_PU
        )
        assert (
            podzielona.probki["stan_zasilania@SRC_B"][i]
            == podzielona.probki["stan_zasilania@SRC_B"][0]
        )


def test_dwa_zrodla_napieciowe_w_jednym_wezle_elektrycznym_to_odmowa() -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(_zrodlo_idealne(rozdzielone=True, drugie_zrodlo=True)).uruchom()
    assert blad.value.kod == KOD_NAPIECIE_NARZUCONE_SPRZECZNE
    assert "zamkniętym łącznikiem" in str(blad.value)


@pytest.mark.parametrize(
    ("y", "b", "a"),
    [(1.0 / complex(1e-4, 1e-4), 0.0, 1 + 0j), (0j, 0.01, 1 + 0j), (0j, 0.0, 1.02 + 0j)],
    ids=["impedancja_zastepcza", "susceptancja", "przekladnia"],
)
def test_lacznik_z_impedancja_to_odmowa(y: complex, b: float, a: complex) -> None:
    """Iniekcja „przywrocenie 1e-4 Ohm” w danych rdzenia nie przechodzi po cichu."""
    wezly = (WezelDynamiki("A", 15.0), WezelDynamiki("B", 15.0))
    galaz = GalazDynamiki("LACZ", "A", "B", y, b, a, False, "lacznik")
    with pytest.raises(OdmowaDynamiki) as blad:
        zloz_model_sieci(wezly, (galaz,), ())
    assert blad.value.kod == KOD_SIEC_NIESPOJNA
    assert "LACZ" in str(blad.value)


@pytest.mark.parametrize("aktywny", [True, False], ids=["zamkniety", "otwarty"])
def test_lacznik_miedzy_roznymi_napieciami_to_odmowa(aktywny: bool) -> None:
    """Blad modelu niezaleznie od stanu — zdarzenie zamkniecia nie moze go wprowadzic."""
    wezly = (WezelDynamiki("A", 15.0), WezelDynamiki("B", 0.4))
    with pytest.raises(OdmowaDynamiki) as blad:
        zloz_model_sieci(wezly, (_lacznik("LACZ", "A", "B", aktywny),), ())
    assert blad.value.kod == KOD_SIEC_NIESPOJNA
    assert "napięciach znamionowych" in str(blad.value)


@pytest.mark.parametrize("aktywny", [True, False], ids=["zamkniety", "otwarty"])
def test_lacznik_otwarty_nie_scala_a_zamkniety_scala(aktywny: bool) -> None:
    wezly = (WezelDynamiki("B", 15.0), WezelDynamiki("A", 15.0), WezelDynamiki("C", 15.0))
    galezie = (_lacznik("L2", "B", "C", aktywny), _lacznik("L1", "A", "B", True))
    model = zloz_model_sieci(wezly, galezie, ())
    if aktywny:
        (grupa,) = model.grupy_lacznikow
        assert model.identy_wezlow[grupa.reprezentant] == "A"
        assert [model.identy_wezlow[p] for p in grupa.czlonkowie] == ["B", "A", "C"]
        assert grupa.laczniki == ("L1", "L2")
    else:
        (grupa,) = model.grupy_lacznikow
        assert sorted(model.identy_wezlow[p] for p in grupa.czlonkowie) == ["A", "B"]
        assert grupa.laczniki == ("L1",)
    # Lacznik nie wnosi admitancji: macierz jest zerowa niezaleznie od stanu.
    assert model.ybus.nnz == 0 or abs(model.ybus).max() == 0.0


def test_reprezentant_nie_zalezy_od_kolejnosci_zapisu() -> None:
    """Ta sama siec w innej kolejnosci wezlow i lacznikow: te same grupy po identyfikatorach."""
    wezly = tuple(WezelDynamiki(ident, 15.0) for ident in ("W3", "W1", "W2", "W4"))
    galezie = (
        _lacznik("S1", "W3", "W1"),
        _lacznik("S2", "W2", "W3"),
        _lacznik("S3", "W2", "W1"),
    )
    pierwsza = zloz_model_sieci(wezly, galezie, ())
    druga = zloz_model_sieci(tuple(reversed(wezly)), tuple(reversed(galezie)), ())
    for model in (pierwsza, druga):
        (grupa,) = model.grupy_lacznikow
        assert model.identy_wezlow[grupa.reprezentant] == "W1"
        assert sorted(model.identy_wezlow[p] for p in grupa.czlonkowie) == ["W1", "W2", "W3"]
        assert grupa.laczniki == ("S1", "S2", "S3")


def test_bieg_z_lacznikami_jest_deterministyczny() -> None:
    wejscie, _ = _podziel(_smib_z_odbiorem(), "GEN", "petla", odbior_na_nowym=True)
    wejscie = dataclasses.replace(
        wejscie, harmonogram=HarmonogramDynamiki(_zdarzenia("zwarcie", "GEN_B"))
    )
    pierwszy = SilnikDynamiki(wejscie).uruchom()
    drugi = SilnikDynamiki(wejscie).uruchom()
    assert pierwszy.probki == drugi.probki
    assert pierwszy.slad_white_box == drugi.slad_white_box


def test_otwarcie_lacznika_zdarzeniem_rozdziela_wezly() -> None:
    """Otwarcie jedynego lacznika do odbioru: wezel odbioru traci zasilanie (V = 0)."""
    wejscie, nowy = _podziel(_smib_z_odbiorem(), "GEN", "promieniowy", odbior_na_nowym=True)
    # Linie zostaja na GEN, za lacznikiem stoi wylacznie odbior.
    galezie = tuple(
        dataclasses.replace(g, wezel_od="GEN") if g.rodzaj == "linia" else g
        for g in wejscie.galezie
    )
    wejscie = dataclasses.replace(
        wejscie,
        galezie=galezie,
        harmonogram=HarmonogramDynamiki((ZmianaGalezi(T_ZDARZENIA_S, "LACZ1", False),)),
    )
    wynik = SilnikDynamiki(wejscie).uruchom()
    i = next(
        k
        for k, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if t == T_ZDARZENIA_S and strona == "P"
    )
    assert wynik.probki[f"u_pu@{nowy}"][i] == 0.0
    assert wynik.probki["i_od_pu@LACZ1"][i] == 0.0
    assert wynik.probki["i_od_pu@LACZ1"][i - 1] > 0.0
    assert math.isfinite(wynik.probki["u_pu@GEN"][i])


@pytest.mark.parametrize("zacisk", ["od", "do"])
def test_dozor_pradu_lacznika_ocenia_prad_z_bilansu(zacisk: str) -> None:
    """Dozor |I| zacisku LACZNIKA: ta sama funkcja pradu, co kanal wyniku (`prady_lacznikow`).

    Detektor nie zmienia trajektorii, a chwila przekroczenia lezy miedzy dwiema sasiednimi
    probkami `C` biegu bez dozoru, po wlasciwych stronach progu — tak samo jak dla galezi
    z impedancja (`test_dozory`). Prad zacisku `do` ma ten sam modul (i_do = -i_od).
    """
    from network_model.solvers.dynamika.dozory import Dozor, ModulPraduZacisku

    wejscie, nowy = _podziel(_smib_z_odbiorem(), "GEN", "promieniowy", odbior_na_nowym=False)
    wejscie = dataclasses.replace(
        wejscie,
        nastawy=uklady.nastawy(
            dt_s=0.001,
            horyzont_s=0.2,
            krok_wyjscia_s=0.001,
            tolerancja_lokalizacji_zdarzen_s=1e-7,
        ),
    )
    zdarzenia = _zdarzenia("zwarcie", nowy)
    bez = SilnikDynamiki(
        dataclasses.replace(wejscie, harmonogram=HarmonogramDynamiki(zdarzenia))
    ).uruchom()
    wielkosc = ModulPraduZacisku("LACZ1", zacisk)
    klucz = wielkosc.klucz_kanalu
    indeksy = [
        i
        for i, s in enumerate(bez.strona_probki)
        if s == "C" and bez.os_czasu_s[i] > T_ZDARZENIA_S + 0.002
    ]
    wartosci = [bez.probki[klucz][i] for i in indeksy]
    assert max(wartosci) - min(wartosci) > 0.1, "prad lacznika musi sie zmieniac"
    prog = min(wartosci) + 0.5 * (max(wartosci) - min(wartosci))
    dozory = (
        Dozor("gora", wielkosc, prog, "w_gore", 0.0, False, (), False),
        Dozor("dol", wielkosc, prog, "w_dol", 0.0, False, (), False),
    )
    z = SilnikDynamiki(
        dataclasses.replace(wejscie, harmonogram=HarmonogramDynamiki(zdarzenia, dozory))
    ).uruchom()
    assert z.probki == bez.probki, "detektor zmienil trajektorie"
    po_zdarzeniu = [p for p in z.przekroczenia if p.t_s > T_ZDARZENIA_S + 0.002]
    assert po_zdarzeniu, z.przekroczenia
    for przekroczenie in po_zdarzeniu:
        assert przekroczenie.wielkosc == klucz
        przed = max(i for i in indeksy if bez.os_czasu_s[i] < przekroczenie.t_s)
        po = min(i for i in indeksy if bez.os_czasu_s[i] >= przekroczenie.t_s)
        znak = 1.0 if przekroczenie.kierunek == "w_gore" else -1.0
        assert znak * (bez.probki[klucz][przed] - prog) <= 0.0
        assert znak * (bez.probki[klucz][po] - prog) > 0.0
    assert bez.probki["i_od_pu@LACZ1"] == pytest.approx(bez.probki["i_do_pu@LACZ1"], abs=1e-15)
