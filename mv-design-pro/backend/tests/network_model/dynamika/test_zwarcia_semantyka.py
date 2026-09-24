"""Semantyka zwarc: jawny sposob usuniecia, predykat izolacji, zwarcie w linii x*L (AB-1b.1 P1+P4).

ROZSTRZYGNIECIE (karta, par. 0 pkt 4-5). Plan mowi „usuniecie zwarcia bez odciecia
wezla = odmowa". Zastosowane doslownie do WSZYSTKICH zwarc odrzuciloby caly wzorzec L5
(bramki G2-G12 zdejmuja zwarcie na zasilanej szynie GEN) — regresja, nie poprawa.
Dlatego usuniecie ma JAWNY rodzaj:

* `izolacja` — w chwili usuniecia, PO naniesieniu wszystkich zdarzen tej chwili (stan
  t+), miejsce zwarcia musi lezec w obszarze beznapieciowym (wezel), a galaz zwarta
  musi byc nieaktywna albo miec oba zaciski w obszarze beznapieciowym (zwarcie x*L);
  inaczej odmowa `dynamika.zwarcie_nieodizolowane` z pomiarem;
* `samoczynne` — zadeklarowana idealizacja (luk gasnie pod napieciem), dopisywana do
  zalozen wyniku i sladu White Box.

ILOCZYN CECH: {wezel, linia x*L} x {R_f > 0, metaliczne} x {izolacja izolowana,
izolacja NIEizolowana, samoczynne, brak usuniecia} x {SPZ na zwarcie trwale} x
{usuniecie i zamkniecie w tej samej chwili — odmowa}.
"""

from __future__ import annotations

import itertools
from typing import Any

import numpy as np
import pytest
from enm.scenariusze import Zwarcie
from network_model.solvers.dynamika import (
    GalazDynamiki,
    OdmowaDynamiki,
    ZmianaGalezi,
    ZwarcieGalezi,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_ZDARZENIE_SPRZECZNE,
    KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE,
    KOD_ZWARCIE_NIEODIZOLOWANE,
)
from network_model.solvers.dynamika.siec import stempel_czwornika_zwarcia
from pydantic import ValidationError

from tests.network_model.dynamika.test_obszary_beznapieciowe import _bieg, _nastawy, _uklad

T_ZWARCIA_S = 0.04
T_OTWARCIA_S = 0.08
T_SPZ_S = 0.14
POLOZENIE = 0.3


def _po(wynik, i: int, t_zdarzenia: float) -> bool:
    """Czy probka `i` opisuje stan PO zdarzeniu w chwili `t_zdarzenia`.

    Chwila zdarzenia ma pare probek (karta AB-1b.1 par. 0 pkt 6): `L` — przed zdarzeniem,
    `P` — po nim; o przynaleznosci do okna decyduje strona, nie sama chwila.
    """
    t = wynik.os_czasu_s[i]
    return t > t_zdarzenia or (t == t_zdarzenia and wynik.strona_probki[i] == "P")


# --------------------------------------------------------------------------- kontrakt (P1)
@pytest.mark.parametrize(
    ("t_usuniecia", "sposob"),
    [
        (0.2, None),
        (None, "izolacja"),
        (None, "samoczynne"),
        (0.1, "izolacja"),
        (0.05, "samoczynne"),
    ],
    ids=[
        "usuniecie_bez_sposobu",
        "izolacja_bez_usuniecia",
        "samoczynne_bez_usuniecia",
        "usuniecie_rowne_zalozeniu",
        "usuniecie_przed_zalozeniem",
    ],
)
def test_zwarcie_wezla_sprzeczne_odrzucone_przy_konstrukcji(
    t_usuniecia: float | None, sposob: str | None
) -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        ZwarcieWezla(0.1, "GEN", "3F", 0.0, 0.5, t_usuniecia, sposob)  # type: ignore[arg-type]
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE


def test_zwarcie_wezla_nie_ma_domyslki_sposobu_usuniecia() -> None:
    with pytest.raises(TypeError):
        ZwarcieWezla(0.1, "GEN", "3F", 0.0, 0.5, None)  # type: ignore[call-arg]


@pytest.mark.parametrize("polozenie", [0.0, 1.0, -0.1, 1.5])
def test_zwarcie_galezi_poza_przedzialem_otwartym_odrzucone(polozenie: float) -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        ZwarcieGalezi(0.1, "LB", polozenie, "3F", 0.0, 0.5, None, None)
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE


@pytest.mark.parametrize(
    ("t_usuniecia", "sposob"), [(0.2, None), (None, "izolacja")], ids=["bez_sposobu", "bez_chwili"]
)
def test_kontrakt_danych_zwarcia_waliduje_pare_usuniecia(
    t_usuniecia: float | None, sposob: str | None
) -> None:
    with pytest.raises(ValidationError, match="sposob_usuniecia"):
        Zwarcie(
            t_s=0.1,
            bus_ref="b1",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=0.5,
            t_usuniecia_s=t_usuniecia,
            sposob_usuniecia=sposob,
        )


def test_kontrakt_danych_zwarcia_w_linii_wymaga_dokladnie_jednego_miejsca() -> None:
    with pytest.raises(ValidationError, match="dokładnie jedno"):
        Zwarcie(
            t_s=0.1,
            bus_ref="b1",
            element_ref="kab",
            polozenie_wzgledne=0.5,
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=0.5,
        )
    with pytest.raises(ValidationError, match="dokładnie jedno"):
        Zwarcie(t_s=0.1, typ="3F", r_f_ohm=0.0, x_f_ohm=0.5)
    with pytest.raises(ValidationError, match="polozenie_wzgledne"):
        Zwarcie(t_s=0.1, element_ref="kab", typ="3F", r_f_ohm=0.0, x_f_ohm=0.5)


# --------------------------------------------------------------------------- predykat izolacji (P4)
def _zwarcie(miejsce: str, metaliczne: bool, t_usuniecia: float | None, sposob: str | None) -> Any:
    r_f, x_f = (0.0, 0.0) if metaliczne else (0.2, 0.3)
    if miejsce == "wezel":
        return ZwarcieWezla(T_ZWARCIA_S, "B", "3F", r_f, x_f, t_usuniecia, sposob)  # type: ignore[arg-type]
    return ZwarcieGalezi(T_ZWARCIA_S, "LB", POLOZENIE, "3F", r_f, x_f, t_usuniecia, sposob)  # type: ignore[arg-type]


def _uklad_b() -> dict[str, Any]:
    # Wezel B bez odbioru — zwarcie metaliczne w wezle z odbiorem stalej mocy to
    # osobny przypadek (odmowa nazwana, `test_obszary_beznapieciowe`).
    return _uklad(odbior=False, urzadzenie=False, odsprzeg=True, b_linii=0.004)


PRZYPADKI = list(
    itertools.product(
        ("wezel", "linia"), (False, True), ("izolowane", "nieizolowane", "samoczynne", "trwale")
    )
)


@pytest.mark.parametrize(("miejsce", "metaliczne", "usuniecie"), PRZYPADKI)
def test_predykat_izolacji_iloczyn_cech(miejsce: str, metaliczne: bool, usuniecie: str) -> None:
    zdarzenia: list[Any] = []
    if usuniecie == "trwale":
        zdarzenia.append(_zwarcie(miejsce, metaliczne, None, None))
        zdarzenia.append(ZmianaGalezi(T_OTWARCIA_S, "LB", False))
    elif usuniecie == "samoczynne":
        zdarzenia.append(_zwarcie(miejsce, metaliczne, T_OTWARCIA_S, "samoczynne"))
    else:
        zdarzenia.append(_zwarcie(miejsce, metaliczne, T_OTWARCIA_S, "izolacja"))
        if usuniecie == "izolowane":
            zdarzenia.append(ZmianaGalezi(T_OTWARCIA_S, "LB", False))
    if usuniecie == "nieizolowane":
        with pytest.raises(OdmowaDynamiki) as blad:
            _bieg(_uklad_b(), tuple(zdarzenia), _nastawy("trapez_niejawny", False, 0.1))
        assert blad.value.kod == KOD_ZWARCIE_NIEODIZOLOWANE
        assert blad.value.szczegoly["t_s"] == T_OTWARCIA_S
        assert "GEN" in blad.value.szczegoly["wyspa"]
        assert set(blad.value.szczegoly["urzadzenia_wnoszace"]) == {"G1", "SYS1"}
        return
    wynik = _bieg(_uklad_b(), tuple(zdarzenia), _nastawy("trapez_niejawny", False, 0.1))
    klucz = "B" if miejsce == "wezel" else f"LB:x={POLOZENIE!r}"
    prad = wynik.probki[f"i_zwarcia_pu@{klucz}"]
    indeksy = range(len(wynik.os_czasu_s))
    przed = [i for i in indeksy if not _po(wynik, i, T_ZWARCIA_S)]
    w_trakcie = [
        i for i in indeksy if _po(wynik, i, T_ZWARCIA_S) and not _po(wynik, i, T_OTWARCIA_S)
    ]
    po_otwarciu = [i for i in indeksy if _po(wynik, i, T_OTWARCIA_S)]
    assert przed and w_trakcie and po_otwarciu
    assert all(prad[i] == 0.0 for i in przed)
    assert all(prad[i] > 0.0 for i in w_trakcie)
    if usuniecie == "samoczynne":
        assert any("samoczynnie" in zdanie for zdanie in wynik.zalozenia)
        assert all(prad[i] == 0.0 for i in po_otwarciu)
    else:
        assert not any("samoczynnie" in zdanie for zdanie in wynik.zalozenia)
        # Po otwarciu miejsce zwarcia jest w obszarze odcietym: brak pradu zwarcia.
        assert all(prad[i] == 0.0 for i in po_otwarciu)


@pytest.mark.parametrize("miejsce", ["wezel", "linia"])
def test_SPZ_na_zwarcie_trwale_przywraca_prad_zwarcia(miejsce: str) -> None:
    zdarzenia = (
        _zwarcie(miejsce, False, None, None),
        ZmianaGalezi(T_OTWARCIA_S, "LB", False),
        ZmianaGalezi(T_SPZ_S, "LB", True),
    )
    wynik = _bieg(_uklad_b(), zdarzenia, _nastawy("trapez_niejawny", False, 0.2))
    klucz = "B" if miejsce == "wezel" else f"LB:x={POLOZENIE!r}"
    prad = wynik.probki[f"i_zwarcia_pu@{klucz}"]
    indeksy = range(len(wynik.os_czasu_s))
    odciete = [i for i in indeksy if _po(wynik, i, T_OTWARCIA_S) and not _po(wynik, i, T_SPZ_S)]
    po_spz = [i for i in indeksy if _po(wynik, i, T_SPZ_S)]
    assert odciete and po_spz
    assert all(prad[i] == 0.0 for i in odciete)
    assert all(prad[i] > 0.0 for i in po_spz)


@pytest.mark.parametrize("miejsce", ["wezel", "linia"])
def test_usuniecie_izolacja_i_zamkniecie_w_tej_samej_chwili_to_odmowa(miejsce: str) -> None:
    """Luk gasnie przy PRZERWANIU pradu; ponowne podanie napiecia w tej samej chwili
    oznacza, ze zwarcie „zniklo pod napieciem" — usuniecie trzeba datowac na przerwe."""
    zdarzenia = (
        _zwarcie(miejsce, False, T_OTWARCIA_S, "izolacja"),
        ZmianaGalezi(T_ZWARCIA_S + 0.01, "LB", False),
        ZmianaGalezi(T_OTWARCIA_S, "LB", True),
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(_uklad_b(), zdarzenia, _nastawy("trapez_niejawny", False, 0.1))
    assert blad.value.kod == KOD_ZWARCIE_NIEODIZOLOWANE


# --------------------------------------------------------------------------- czwornik (P4)
def test_czwornik_przy_zerowej_admitancji_zwarcia_i_B_zero_to_stempel_zdrowej_galezi() -> None:
    """Granica y_f -> 0 dla galezi bez susceptancji: redukcja Krona odtwarza stempel pi.

    Dla B != 0 granica NIE jest tozsamoscia: dwie polowki pi z susceptancjami B*x i
    B*(1-x) nie sa tym samym modelem co jedna sekcja pi (roznica pierwszego rzedu w B/y
    w elemencie szeregowym) — dlatego zdrowy stempel po usunieciu zwarcia jest skladany
    OD NOWA z opisu galezi, a nie z czwornika z y_f = 0.
    """
    y = 1.0 / complex(0.02, 0.1)
    for x in (0.1, 0.3, 0.5, 0.9):
        y_oo, y_od, y_do, y_dd = stempel_czwornika_zwarcia(y, 0.0, x, 0j)
        assert y_oo == pytest.approx(y, rel=1e-14)
        assert y_dd == pytest.approx(y, rel=1e-14)
        assert y_od == pytest.approx(-y, rel=1e-14)
        assert y_do == pytest.approx(-y, rel=1e-14)


def test_czwornik_przy_polozeniu_do_zera_daje_zwarcie_w_wezle_od() -> None:
    """x -> 0: wezel wewnetrzny zlewa sie z zaciskiem `od` (granica, nie tozsamosc)."""
    y, b, y_f = 1.0 / complex(0.02, 0.1), 0.004, 1.0 / complex(0.2, 0.3)
    y_oo, y_od, _, y_dd = stempel_czwornika_zwarcia(y, b, 1e-9, y_f)
    assert y_oo == pytest.approx(y + 1j * b / 2 + y_f, rel=1e-6)
    assert y_od == pytest.approx(-y, rel=1e-6)
    assert y_dd == pytest.approx(y + 1j * b / 2, rel=1e-6)


@pytest.mark.parametrize("przekladnia", [complex(1.02, 0.0), complex(0.98, -0.01)])
def test_zwarcie_galezi_z_przekladnia_to_odmowa_nazwana(przekladnia: complex) -> None:
    uklad = _uklad_b()
    galezie = tuple(
        (
            GalazDynamiki(
                g.ident,
                g.wezel_od,
                g.wezel_do,
                g.y_szeregowa_pu,
                0.0,
                przekladnia,
                True,
                "transformator",
            )
            if g.ident == "LB"
            else g
        )
        for g in uklad["galezie"]
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(
            {**uklad, "galezie": galezie},
            (_zwarcie("linia", False, None, None),),
            _nastawy("trapez_niejawny", False, 0.06),
        )
    assert blad.value.kod == KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE


def test_zwarcie_w_laczniku_to_odmowa_nazwana() -> None:
    uklad = _uklad_b()
    galezie = tuple(
        (
            GalazDynamiki(
                g.ident, g.wezel_od, g.wezel_do, g.y_szeregowa_pu, 0.0, 1 + 0j, True, "lacznik"
            )
            if g.ident == "LB"
            else g
        )
        for g in uklad["galezie"]
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(
            {**uklad, "galezie": galezie},
            (_zwarcie("linia", False, None, None),),
            _nastawy("trapez_niejawny", False, 0.06),
        )
    assert blad.value.kod == KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE


def test_zdrowy_stempel_po_usunieciu_zwarcia_w_linii_jest_bitowo_wyjsciowy() -> None:
    zdarzenia = (_zwarcie("linia", False, T_OTWARCIA_S, "samoczynne"),)
    z_zwarciem = _bieg(_uklad_b(), zdarzenia, _nastawy("trapez_niejawny", False, 0.1))
    bez_zwarcia = _bieg(_uklad_b(), (), _nastawy("trapez_niejawny", False, 0.1))
    assert (
        z_zwarciem.slad_white_box["siec"]["odcisk_ybus"]
        == bez_zwarcia.slad_white_box["siec"]["odcisk_ybus"]
    )
    assert np.isfinite(z_zwarciem.probki["u_zwarcia_pu@LB:x=0.3"]).all()


def test_zwarcie_metaliczne_w_linii_odcina_zacisk_bez_zrodla() -> None:
    """Metaliczne x*L uziemia punkt linii: zacisk za nim (bez zrodla) jest obszarem odcietym.

    Stempel czwornika ma wtedy `Y_od = Y_do = 0` DOKLADNIE, wiec rozklad na wyspy nie moze
    traktowac galezi jako polaczenia (`siec.galezie_laczace`). Przed ta regula zacisk B
    zostawal w wyspie zywej, Newton oddawal |V| ~ 1e-170, a czestotliwosc wezla konczyla
    sie `ZeroDivisionError` (pomiar P4).
    """
    from network_model.solvers.dynamika.obserwable import JAKOSC_NIEDOSTEPNA

    wynik = _bieg(
        _uklad_b(), (_zwarcie("linia", True, None, None),), _nastawy("trapez_niejawny", False, 0.08)
    )
    zalozenie = next(z for z in wynik.zdarzenia_wykonane if z.rodzaj == "zwarcie_galezi")
    assert zalozenie.obszary_odciete == ("B",)
    for i in range(len(wynik.os_czasu_s)):
        if _po(wynik, i, T_ZWARCIA_S):
            assert wynik.probki["u_pu@B"][i] == 0.0
            assert wynik.probki["jakosc_f@GEN"][i] != JAKOSC_NIEDOSTEPNA
            assert wynik.probki[f"i_zwarcia_pu@LB:x={POLOZENIE!r}"][i] > 0.0


def test_galezie_laczace_pomijaja_wylacznie_galezie_ze_zwarciem_metalicznym() -> None:
    from network_model.solvers.dynamika.siec import galezie_laczace

    aktywne = frozenset({"L1", "L2", "L3"})
    assert galezie_laczace(aktywne, ()) is aktywne
    assert galezie_laczace(aktywne, (("L1", 0.3, 1 + 0j),)) == aktywne
    assert galezie_laczace(aktywne, (("L1", 0.3, None), ("L2", 0.5, 2j))) == {"L2", "L3"}
