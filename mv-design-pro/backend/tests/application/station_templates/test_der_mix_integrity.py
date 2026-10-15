"""Skład DER szablonu stacji — jedna prawda od definicji szablonu po materializację.

POWÓD (pomiar 2026-10-15 na drzewie partii integracji 7, przed naprawą): suma modułów DER
szablonu hybrydowego była dzielona NAPRZEMIENNIE między technologie (`i % len(der_options)`),
więc „Hybryda PV 2 MW + BESS 1 MW/2 MWh” materializowała 3 × PV 0,5 MW + 2 × BESS 1 MW
(1,5 MW + 2 MW), „PV 3 MW + BESS 2 MW” — 4 PV + 3 BESS, a „PV 5 MW + BESS 3 MW” — 6 PV +
5 BESS. Podgląd liczył trzecią regułą (`suma // liczba technologii`) i pokazywał inną
pozycję katalogu niż zapis (pierwszą opcję listy zamiast doboru do mocy jednostki).
„PV 0,5 MW + BESS 0,5 MW/1 MWh” tworzyła BESS 1 MW / 2 MWh, a „BESS 5 MW / 5 MWh (aFRR)”
— 10 MWh energii użytecznej.

ILOCZYN CECH (KLASA NIE INSTANCJA):
* {każdy szablon z DER} × {każda technologia szablonu} × {liczba, moc jednostki, energia
  BESS} wobec nazwy szablonu — tabela `_SKLAD_Z_NAZWY` (nowy szablon z DER bez wpisu = test
  czerwony);
* {szablon jednej technologii, kilku technologii} × {nadpisanie: brak, liczebności, suma
  zgodna, suma niezgodna, wartość ujemna, ułamkowa, logiczna, tekstowa, poza zakresem};
* {moc jednostki: domyślna, nadpisana, nieprawidłowa} × {pozycja katalogu: dobór do mocy,
  wskazanie projektanta, wskazanie nieprawidłowe};
* odmowa zastosowania PRZED odczytem modelu (klucz bez modelu nie jest nawet czytany).
Parytet podglądu i zapisu przez HTTP (każdy szablon z DER, także z nadpisaniami) sprawdza
`tests/api/test_station_templates_apply_api.py`.
"""

from __future__ import annotations

import math

import pytest
from application.station_templates import get_template, list_templates
from application.station_templates.apply import TemplateApplyError, apply_template_to_case
from application.station_templates.schema import (
    NieprawidlowySkladDerError,
    _moc_wymagana_jednostki_der_mva,
    rozstrzygnij_sklad_der,
    wymagana_moc_der_kva,
)
from enm.domain_operations_v2 import tabliczka_zrodla_przeksztaltnikowego

_SZABLONY_Z_DER = tuple(t for t in list_templates() if t.schema.der_options)

#: Skład obiecany NAZWĄ szablonu: fragment nazwy → {technologia: (liczba jednostek, moc
#: jednostki [MW], energia użyteczna BESS łącznie [MWh] albo None)}. Wpisany z nazw ręcznie
#: (wyrocznia niezależna od kodu doboru); energia sprawdzana na tabliczce pozycji katalogu,
#: którą szablon zmaterializuje.
_SKLAD_Z_NAZWY: dict[str, tuple[str, dict[str, tuple[int, float, float | None]]]] = {
    "tpl_bess_500kw_1mwh": ("BESS 0.5 MW / 1 MWh", {"BESS": (1, 0.5, 1.0)}),
    "tpl_bess_1mw_2mwh": ("BESS 1 MW / 2 MWh", {"BESS": (1, 1.0, 2.0)}),
    "tpl_bess_2mw_4mwh": ("BESS 2 MW / 4 MWh", {"BESS": (1, 2.0, 4.0)}),
    "tpl_bess_5mw_10mwh_fcr_n": ("BESS 5 MW / 10 MWh", {"BESS": (5, 1.0, 10.0)}),
    "tpl_bess_5mw_5mwh_afrr": ("BESS 5 MW / 10 MWh", {"BESS": (10, 0.5, 10.0)}),
    "tpl_farma_pv_500kw": ("Farma PV 500 kW", {"PV": (1, 0.5, None)}),
    "tpl_farma_pv_1mw": ("Farma PV 1 MW, 2× falownik", {"PV": (2, 0.5, None)}),
    "tpl_farma_pv_2mw": ("Farma PV 2 MW, 4× falownik 500 kW", {"PV": (4, 0.5, None)}),
    "tpl_farma_pv_3mw": ("Farma PV 3 MW", {"PV": (6, 0.5, None)}),
    "tpl_farma_pv_5mw": ("Farma PV 5 MW", {"PV": (10, 0.5, None)}),
    "tpl_hybrid_pv05_bess05": (
        "PV 0.5 MW + BESS 0.5 MW/1 MWh",
        {"PV": (1, 0.5, None), "BESS": (1, 0.5, 1.0)},
    ),
    "tpl_hybrid_pv1_bess1": (
        "PV 1 MW + BESS 1 MW/2 MWh",
        {"PV": (2, 0.5, None), "BESS": (1, 1.0, 2.0)},
    ),
    "tpl_hybrid_pv2_bess1": (
        "PV 2 MW + BESS 1 MW/2 MWh",
        {"PV": (4, 0.5, None), "BESS": (1, 1.0, 2.0)},
    ),
    "tpl_hybrid_pv3_bess2": (
        "PV 3 MW + BESS 2 MW/4 MWh",
        {"PV": (6, 0.5, None), "BESS": (2, 1.0, 4.0)},
    ),
    "tpl_hybrid_pv5_bess3": (
        "PV 5 MW + BESS 3 MW/6 MWh",
        {"PV": (10, 0.5, None), "BESS": (3, 1.0, 6.0)},
    ),
    "tpl_pv_prosument_5kw": ("PV 5 kW", {"PV": (1, 0.005, None)}),
    "tpl_pv_prosument_10kw": ("PV 10 kW", {"PV": (1, 0.01, None)}),
    "tpl_pv_prosument_30kw": ("PV 30 kW", {"PV": (1, 0.03, None)}),
    "tpl_pv_prosument_50kw": ("PV 50 kW", {"PV": (1, 0.05, None)}),
    "tpl_pv_prosument_100kw": ("PV 100 kW", {"PV": (2, 0.05, None)}),
    "tpl_pv_prosument_250kw": ("PV 250 kW", {"PV": (5, 0.05, None)}),
    "tpl_slupowa_400kva_prosument": ("PV prosument 50 kW", {"PV": (1, 0.05, None)}),
    "tpl_wiatr_1mw_pojedyncza": ("Turbina wiatrowa 1 MW", {"FW": (1, 1.0, None)}),
    "tpl_wiatr_2mw": ("Turbina wiatrowa 2 MW", {"FW": (1, 2.0, None)}),
    "tpl_wiatr_3mw": ("Turbina wiatrowa 3 MW", {"FW": (1, 3.0, None)}),
    "tpl_wiatr_farma_5x2mw": ("Farma wiatrowa 5× 2 MW", {"FW": (5, 2.0, None)}),
}


def _hybryda():
    template = get_template("tpl_hybrid_pv2_bess1")
    assert template is not None
    return template


def _sklad(template, overrides=None) -> dict[str, tuple[int, set[float], set[str | None]]]:
    wynik: dict[str, tuple[int, set[float], set[str | None]]] = {}
    for jednostka in rozstrzygnij_sklad_der(template, overrides):
        liczba, moce, pozycje = wynik.get(jednostka.kind, (0, set(), set()))
        wynik[jednostka.kind] = (
            liczba + 1,
            moce | {jednostka.p_mw_each},
            pozycje | {jednostka.catalog_ref},
        )
    return wynik


def test_tabela_obejmuje_kazdy_szablon_z_der() -> None:
    assert set(_SKLAD_Z_NAZWY) == {t.id for t in _SZABLONY_Z_DER}


@pytest.mark.parametrize("template", _SZABLONY_Z_DER, ids=lambda t: t.id)
def test_sklad_domyslny_zgodny_z_nazwa_szablonu(template) -> None:
    fragment, oczekiwany = _SKLAD_Z_NAZWY[template.id]
    assert fragment in template.name_pl
    sklad = _sklad(template)
    assert set(sklad) == set(oczekiwany)
    for kind, (liczba, moc, energia_mwh) in oczekiwany.items():
        liczba_modelu, moce, pozycje = sklad[kind]
        assert liczba_modelu == liczba, (template.id, kind)
        assert moce == {moc}, (template.id, kind)
        assert len(pozycje) == 1 and None not in pozycje
        if energia_mwh is not None:
            (pozycja,) = pozycje
            tabliczka = tabliczka_zrodla_przeksztaltnikowego(kind, pozycja)
            assert tabliczka is not None
            energia = liczba * float(tabliczka["usable_capacity_kwh"]) / 1000.0
            assert math.isclose(energia, energia_mwh), (template.id, pozycja, energia)


@pytest.mark.parametrize("template", _SZABLONY_Z_DER, ids=lambda t: t.id)
def test_liczebnosci_specyfikacji_i_suma_szablonu_sa_jedna_prawda(template) -> None:
    # `default_count` technologii czyta katalog szablonów (ui2: „n × P MW”), sumę — kreator;
    # oba odczyty muszą opisywać ten sam skład, który powstanie w modelu.
    assert sum(spec.default_count for spec in template.schema.der_options) == (
        template.schema.der_total_count.default
    )
    assert len(rozstrzygnij_sklad_der(template)) == template.schema.der_total_count.default


@pytest.mark.parametrize("template", _SZABLONY_Z_DER, ids=lambda t: t.id)
def test_pozycja_domyslna_kontraktu_szablonu_to_pozycja_materializacji(template) -> None:
    # Kreator pokazuje `default_catalog_ref` jako bieżący wybór — musi to być pozycja, którą
    # zastosowanie szablonu bez wskazania projektanta zapisze do modelu.
    opis = template.to_dict()["schema"]["der_options"]
    sklad = _sklad(template)
    for spec_dict in opis:
        _, _, pozycje = sklad[spec_dict["kind"]]
        assert {spec_dict["default_catalog_ref"]} == pozycje


@pytest.mark.parametrize("template", _SZABLONY_Z_DER, ids=lambda t: t.id)
def test_moc_doboru_tr_to_suma_jednostek_skladu(template) -> None:
    oczekiwana_mva = sum(
        _moc_wymagana_jednostki_der_mva(j.kind, j.catalog_ref, j.p_mw_each) or 0.0
        for j in rozstrzygnij_sklad_der(template)
    )
    assert wymagana_moc_der_kva(template) == round(oczekiwana_mva * 1000.0)


def test_liczebnosci_hybrydy_sa_jedyna_prawda_a_suma_jest_wyprowadzona() -> None:
    template = _hybryda()
    assert _sklad(template, {"der_PV_count": 2, "der_BESS_count": 1})["PV"][0] == 2
    assert [j.kind for j in rozstrzygnij_sklad_der(template, {"der_PV_count": 2})] == [
        "PV",
        "PV",
        "BESS",
    ]
    zgodna = {"der_PV_count": 3, "der_BESS_count": 2, "der_total_count": 5}
    assert {k: v[0] for k, v in _sklad(template, zgodna).items()} == {"PV": 3, "BESS": 2}


@pytest.mark.parametrize(
    ("overrides", "fragment"),
    [
        ({"der_total_count": 3}, "nie jest równa sumie"),
        ({"der_PV_count": 2, "der_BESS_count": 1, "der_total_count": 4}, "nie jest równa"),
        ({"der_PV_count": -1, "der_BESS_count": 4}, "ujemna"),
        ({"der_PV_count": 2.5}, "całkowitą"),
        ({"der_PV_count": True}, "całkowitą"),
        ({"der_PV_count": "cztery"}, "całkowitą"),
        ({"der_total_count": 1.5, "der_PV_count": 1, "der_BESS_count": 0}, "całkowitą"),
        ({"der_PV_count": 0, "der_BESS_count": 1}, "poza zakresem"),
        ({"der_PV_count": 20, "der_BESS_count": 1}, "poza zakresem"),
    ],
)
def test_niespojne_liczebnosci_hybrydy_sa_odmowa_a_nie_zmiana_skladu(overrides, fragment) -> None:
    with pytest.raises(NieprawidlowySkladDerError, match=fragment):
        rozstrzygnij_sklad_der(_hybryda(), overrides)


def test_szablon_jednej_technologii_bierze_sume_i_sprawdza_deklaracje() -> None:
    template = get_template("tpl_farma_pv_2mw")
    assert template is not None
    assert _sklad(template, {"der_total_count": "3"})["PV"][0] == 3
    assert _sklad(template, {"der_total_count": 5, "der_PV_count": 5})["PV"][0] == 5
    with pytest.raises(NieprawidlowySkladDerError, match="nie zgadza się"):
        rozstrzygnij_sklad_der(template, {"der_total_count": 5, "der_PV_count": 4})
    with pytest.raises(NieprawidlowySkladDerError, match="poza zakresem"):
        rozstrzygnij_sklad_der(template, {"der_total_count": 0})
    with pytest.raises(NieprawidlowySkladDerError, match="całkowitą"):
        rozstrzygnij_sklad_der(template, {"der_total_count": 4.4})


def test_moc_jednostki_wybiera_pozycje_a_wskazanie_projektanta_ma_pierwszenstwo() -> None:
    template = _hybryda()
    sklad = _sklad(template, {"der_BESS_p_mw_each": 2.0})
    assert sklad["BESS"][1] == {2.0}
    assert sklad["BESS"][2] == {"conv-bess-2mw-4mwh-15kv"}
    wskazana = _sklad(
        template, {"der_BESS_p_mw_each": 1.0, "der_BESS_ref": "conv-bess-5mw-10mwh-15kv"}
    )
    assert wskazana["BESS"][1] == {1.0}
    assert wskazana["BESS"][2] == {"conv-bess-5mw-10mwh-15kv"}
    # Technologia bez nadpisań zostaje przy swoim składzie domyślnym.
    assert sklad["PV"] == (4, {0.5}, {"conv-pv-0.5mw-15kv"})


@pytest.mark.parametrize(
    "overrides",
    [
        {"der_BESS_p_mw_each": "dużo"},
        {"der_BESS_p_mw_each": 0},
        {"der_BESS_p_mw_each": -1.0},
        {"der_BESS_p_mw_each": float("nan")},
        {"der_BESS_p_mw_each": float("inf")},
        {"der_BESS_p_mw_each": True},
        {"der_BESS_ref": ""},
        {"der_BESS_ref": 5},
    ],
)
def test_nieprawidlowa_moc_albo_pozycja_jednostki_jest_odmowa(overrides) -> None:
    with pytest.raises(NieprawidlowySkladDerError):
        rozstrzygnij_sklad_der(_hybryda(), overrides)


def test_rozstrzygniecie_jest_deterministyczne() -> None:
    template = _hybryda()
    overrides = {"der_PV_count": 3, "der_BESS_count": 2, "der_BESS_p_mw_each": 2.0}
    assert rozstrzygnij_sklad_der(template, overrides) == rozstrzygnij_sklad_der(
        template, dict(reversed(list(overrides.items())))
    )


def test_niezgodny_sklad_odrzucony_przed_odczytem_modelu() -> None:
    # Klucz bez modelu: gdyby zastosowanie czytało model przed walidacją składu, błąd
    # dotyczyłby braku modelu albo odcinka, a nie składu DER.
    with pytest.raises(TemplateApplyError) as exc:
        apply_template_to_case(
            template=_hybryda(),
            klucz_twin="test-der-mix-bez-modelu",
            target_segment_id="odcinek-nieistniejacy",
            params_override={"der_total_count": 2},
        )
    assert exc.value.code == "template.der_mix_invalid"
