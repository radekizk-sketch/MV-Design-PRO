"""W5-A: słownik grup połączeń IEC 60076-1 — generator z reguły normy == jawny literał."""

from __future__ import annotations

from typing import get_args

import pytest
from enm.grupa_polaczen import (
    GRUPY_POLACZEN_IEC60076,
    GrupaPolaczenIEC60076,
    _generuj_slownik,
    grupa_polaczen_poprawna,
    parsuj_grupe_polaczen,
)


def test_slownik_generowany_z_reguly_normy_rowny_jawnemu_literalowi():
    assert set(_generuj_slownik()) == set(get_args(GrupaPolaczenIEC60076))
    assert tuple(GRUPY_POLACZEN_IEC60076) == tuple(get_args(GrupaPolaczenIEC60076))
    assert len(GRUPY_POLACZEN_IEC60076) == 66
    # Grupa bez wyprowadzonego neutralnego strony dolnej (Dy11) jest LEGALNA — o dostępności
    # punktu neutralnego rozstrzyga litera (E-W5-03), nie słownik.
    assert grupa_polaczen_poprawna("Dy11") and not parsuj_grupe_polaczen("Dy11").dn_punkt_neutralny


@pytest.mark.parametrize(
    ("grupa", "gn", "gn_n", "dn", "dn_n", "godzina"),
    [
        ("Dyn11", "D", False, "Y", True, 11),
        ("YNd11", "Y", True, "D", False, 11),
        ("YNyn0", "Y", True, "Y", True, 0),
        ("Yzn5", "Y", False, "Z", True, 5),
        ("Dd0", "D", False, "D", False, 0),
        # Zygzak po stronie górnej (transformator uziemiający ENEA Zeszyt 1 §16: ZNyn11).
        ("ZNyn11", "Z", True, "Y", True, 11),
        ("Zd6", "Z", False, "D", False, 6),
        ("ZNy5", "Z", True, "Y", False, 5),
    ],
)
def test_parsowanie_liter_punktu_neutralnego_i_godziny(grupa, gn, gn_n, dn, dn_n, godzina):
    g = parsuj_grupe_polaczen(grupa)
    assert (g.gn_typ, g.gn_punkt_neutralny, g.dn_typ, g.dn_punkt_neutralny, g.godzina) == (
        gn,
        gn_n,
        dn,
        dn_n,
        godzina,
    )


@pytest.mark.parametrize("zla", ["Dyn13", "dyn11", "", "Yd", "Yy3", "DYN11", "Dyn11 ", "Dyn"])
def test_wartosc_spoza_slownika_jest_odrzucana_nazwanym_bledem(zla):
    assert not grupa_polaczen_poprawna(zla)
    with pytest.raises(ValueError):
        parsuj_grupe_polaczen(zla)


def test_zygzak_gorny_ma_pary_odwrotne_do_dz_i_yz():
    """Słownik zamknięty na zamianę stron dla zygzaka: każda para Dz/Yz ma odwrotną Zd/Zy
    z tymi samymi godzinami; zygzak na OBU stronach (Zz) nie jest w tablicy normy."""
    odwrotne = 0
    for grupa in GRUPY_POLACZEN_IEC60076:
        g = parsuj_grupe_polaczen(grupa)
        if g.dn_typ == "Z" and g.gn_typ in ("D", "Y"):
            odwrotna = (
                f"Z{'N' if g.dn_punkt_neutralny else ''}{g.gn_typ.lower()}"
                f"{'n' if g.gn_punkt_neutralny else ''}{g.godzina}"
            )
            assert grupa_polaczen_poprawna(odwrotna), (grupa, odwrotna)
            odwrotne += 1
    assert odwrotne == 20
    assert not any(g.startswith("Z") and "z" in g for g in GRUPY_POLACZEN_IEC60076)
