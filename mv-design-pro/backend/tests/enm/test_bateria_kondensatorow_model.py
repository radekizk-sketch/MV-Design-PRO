"""Model baterii kondensatorów SN (karta UX-04/POLE-BKR-MODEL): słownik, typ, rozstrzygnięcie,
odcisk i odmowa zapisu parametrów.

DLACZEGO. Parametry baterii (układ połączeń, stopnie, tolerancja pojemności, dławik,
rezystory rozładowcze) żyją w trzech miejscach: na elemencie (wartość projektanta), w typie
katalogowym (``materialized_params``) i w rejestrze wartości roboczych (zasada nr 4). Każda
para musi się zgadzać: lustro frontu ze słownikiem backendu, typ z kontraktem materializacji,
rozstrzygnięcie z kolejnością pierwszeństwa, odcisk modelu sprzed karty z odciskiem po niej
i zdanie odmowy z regułą modelu.

ILOCZYN CECH: parametr {każdy z ``PARAMETRY_BATERII_KONDENSATOROW``} × źródło {element, typ,
rejestr} × konsument {rozstrzygnięcie, odcisk, materializacja, odmowa zapisu}.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, get_args

import pytest
from enm.bateria_kondensatorow import odmowa_parametrow_baterii, parametry_baterii
from enm.hash import compute_input_hash, compute_semantic_hash
from enm.models import EnergyNetworkModel, ShuntCapacitor
from network_model.catalog.niezmienniki_katalogu import OdmowaKatalogu
from network_model.catalog.types import (
    MATERIALIZATION_CONTRACTS,
    POLA_BATERII_KONDENSATOROW_TYPU,
    CatalogNamespace,
    ShuntCapacitorType,
)
from network_model.catalog.wartosci_robocze import (
    PARAMETRY_BATERII_KONDENSATOROW,
    PROPOZYCJE_BATERII_KONDENSATOROW,
)
from network_model.core.bateria_kondensatorow import (
    NAZWY_UKLADOW_POLACZEN_BATERII_PL,
    UKLADY_POLACZEN_BATERII,
    UKLADY_Z_DROGA_ZEROWA,
    UKLADY_Z_PRZEKLADNIKIEM_NIEZROWNOWAZENIA,
    UkladPolaczenBaterii,
    liczba_pozycji_pl,
    liczba_stopni_pl,
    sprzecznosc_parametrow_baterii,
)
from solver_input.v126_contracts import build_v126_input_from_enm

from tests.enm.test_canonical_sc_c_per_pasmo import N1, _build_mv_lv_enm
from tests.reference_networks.scena_pola_bkr import BATERIA_KATALOG, bateria, zbuduj_gpz_z_bkr
from tests.reference_networks.sceny_zajetosci_pol import op

TYPY_ENM = Path(__file__).resolve().parents[3] / "frontend" / "src" / "types" / "enm.ts"


def test_slownik_ukladow_jeden_dla_backendu_i_frontu() -> None:
    assert UKLADY_POLACZEN_BATERII == get_args(UkladPolaczenBaterii)
    assert set(NAZWY_UKLADOW_POLACZEN_BATERII_PL) == set(UKLADY_POLACZEN_BATERII)
    assert UKLADY_Z_DROGA_ZEROWA == {"GWIAZDA_UZIEMIONA"}
    assert UKLADY_Z_PRZEKLADNIKIEM_NIEZROWNOWAZENIA == {"PODWOJNA_GWIAZDA_IZOLOWANA"}
    tekst = TYPY_ENM.read_text(encoding="utf-8")
    [lista] = re.findall(r"export const UKLADY_POLACZEN_BATERII = \[([^\]]*)\] as const;", tekst)
    assert tuple(re.findall(r"'([A-Z_]+)'", lista)) == UKLADY_POLACZEN_BATERII


def test_pola_elementu_frontu_rowne_modelowi() -> None:
    tekst = TYPY_ENM.read_text(encoding="utf-8")
    poczatek = tekst.index("export interface ShuntCapacitor extends ENMElement {")
    cialo = re.sub(r"/\*\*.*?\*/", "", tekst[poczatek : tekst.index("\n}", poczatek)], flags=re.S)
    front = set(re.findall(r"^\s*([a-z_0-9]+)\??:", cialo, flags=re.MULTILINE))
    wlasne = set(ShuntCapacitor.model_fields) - {
        "ref_id",
        "name",
        "tags",
        "meta",
        "id",
        "parameter_overrides_meta",
    }
    assert set(PARAMETRY_BATERII_KONDENSATOROW) <= front
    assert {"stopnie_zalaczone", "wylaczenie_od_transformatorow"} <= front
    assert wlasne - front == set(), wlasne - front


def test_typ_katalogowy_niesie_te_same_parametry_co_element() -> None:
    assert set(POLA_BATERII_KONDENSATOROW_TYPU) == set(PARAMETRY_BATERII_KONDENSATOROW)
    assert set(POLA_BATERII_KONDENSATOROW_TYPU) <= set(ShuntCapacitor.model_fields)
    kontrakt = MATERIALIZATION_CONTRACTS[CatalogNamespace.KOMPENSATOR_SN.value]
    assert set(POLA_BATERII_KONDENSATOROW_TYPU) <= set(kontrakt.solver_fields)
    assert set(POLA_BATERII_KONDENSATOROW_TYPU) <= {p for p, _, _ in kontrakt.ui_fields}
    assert set(kontrakt.pola_opcjonalne) == set(POLA_BATERII_KONDENSATOROW_TYPU)
    pelny = ShuntCapacitorType.from_dict(
        {
            "id": "t",
            "name": "Bateria testowa",
            "rated_mvar": 2.4,
            "rated_kv": 15.0,
            "uklad_polaczen": "GWIAZDA_UZIEMIONA",
            "liczba_stopni": 3,
            "tolerancja_pojemnosci_min_proc": -5.0,
            "tolerancja_pojemnosci_max_proc": 10.0,
            "dlawik_ograniczajacy": True,
            "dlawik_indukcyjnosc_mh": 2.5,
            "rezystory_rozladowcze_wewnetrzne": True,
        }
    )
    assert ShuntCapacitorType.from_dict(pelny.to_dict()) == pelny
    # Granice typu = granice elementu ENM (predykaty parami): każda wartość, której element nie
    # przyjmie, jest odmową nazwanej reguły — przez `from_dict` I przez konstruktor.
    for zly, kod in (
        ({"uklad_polaczen": "ZYGZAK"}, "KAT-T-051"),
        ({"liczba_stopni": 0}, "KAT-T-052"),
        ({"liczba_stopni": True}, "KAT-T-052"),
        ({"liczba_stopni": 1.5}, "KAT-T-052"),
        ({"tolerancja_pojemnosci_min_proc": 1.0}, "KAT-T-053"),
        ({"tolerancja_pojemnosci_max_proc": -1.0}, "KAT-T-053"),
        ({"dlawik_ograniczajacy": True, "dlawik_indukcyjnosc_mh": 0.0}, "KAT-T-054"),
        ({"dlawik_ograniczajacy": False, "dlawik_indukcyjnosc_mh": 2.0}, "KAT-T-054"),
        ({"dlawik_ograniczajacy": "tak"}, "KAT-T-055"),
        ({"rezystory_rozladowcze_wewnetrzne": 1}, "KAT-T-055"),
    ):
        rekord = {"id": "z", "name": "Bateria z", "rated_mvar": 1.0, "rated_kv": 15.0, **zly}
        for budowa in (ShuntCapacitorType.from_dict, lambda r: ShuntCapacitorType(**r)):
            with pytest.raises(OdmowaKatalogu) as odmowa:
                budowa(rekord)
            assert odmowa.value.kod == kod, (zly, odmowa.value)
        # Ta sama wartość na elemencie ENM — również odmowa (jeden zbiór granic).
        with pytest.raises(ValueError):
            ShuntCapacitor.model_validate(
                {"ref_id": "b", "name": "b", "bus_ref": "s", "rated_mvar": 1.0, "rated_kv": 15.0}
                | zly
            )


def test_materializacja_kopiuje_parametry_typu_do_elementu() -> None:
    enm = zbuduj_gpz_z_bkr()
    rekord = bateria(enm)
    assert rekord["catalog_ref"] == BATERIA_KATALOG
    typ = rekord["materialized_params"]
    assert typ["uklad_polaczen"] == "PODWOJNA_GWIAZDA_IZOLOWANA"
    assert typ["liczba_stopni"] == 1
    # Pozycja referencyjna nie podaje parametrów karty producenta — klucza brak (nie zero).
    for pole in ("dlawik_ograniczajacy", "rezystory_rozladowcze_wewnetrzne"):
        assert typ.get(pole) is None


@pytest.mark.parametrize("parametr", PARAMETRY_BATERII_KONDENSATOROW)
def test_rozstrzygniecie_element_przed_typem_przed_rejestrem(parametr: str) -> None:
    wartosci: dict[str, tuple[Any, Any]] = {
        "uklad_polaczen": ("TROJKAT", "GWIAZDA_UZIEMIONA"),
        "liczba_stopni": (3, 2),
        "tolerancja_pojemnosci_min_proc": (-3.0, -7.0),
        "tolerancja_pojemnosci_max_proc": (4.0, 8.0),
        "dlawik_ograniczajacy": (False, True),
        "dlawik_indukcyjnosc_mh": (2.0, 6.0),
        "rezystory_rozladowcze_wewnetrzne": (False, True),
    }
    element, typ = wartosci[parametr]
    baza: dict[str, Any] = {"ref_id": "B", "bus_ref": "S", "rated_mvar": 1.2, "rated_kv": 15.0}
    if parametr == "dlawik_indukcyjnosc_mh":
        # Indukcyjność ma znaczenie tylko przy dławiku (nadanym na elemencie).
        baza["dlawik_ograniczajacy"] = True
    przypadki = (
        (
            {**baza, parametr: element, "materialized_params": {parametr: typ}},
            element,
            "PROJEKTANT",
        ),
        ({**baza, "materialized_params": {parametr: typ}}, typ, "KATALOG"),
        ({**baza}, PROPOZYCJE_BATERII_KONDENSATOROW[parametr].wartosc, "PROPOZYCJA"),
    )
    for rekord, oczekiwana, pochodzenie in przypadki:
        dana = parametry_baterii(rekord)[parametr]
        assert (dana.wartosc, dana.pochodzenie) == (oczekiwana, pochodzenie), rekord
        assert dana.robocza is (pochodzenie == "PROPOZYCJA")


def test_odcisk_modelu_bez_baterii_i_z_bateria_sprzed_karty_niezmienny() -> None:
    """Pola karty są addytywne: model bez baterii i bateria bez nadanych parametrów karty
    haszują identycznie jak przed kartą (pola ``None``/puste poza odciskiem), a każdy
    nadany parametr zmienia odcisk."""
    siec = _build_mv_lv_enm("Odcisk")
    bez_baterii = EnergyNetworkModel.model_validate(siec.model_dump(mode="json"))
    assert compute_input_hash(bez_baterii) == compute_input_hash(siec)
    stara = ShuntCapacitor(ref_id="BAT", name="Bateria", bus_ref=N1, rated_mvar=1.2, rated_kv=15.0)
    z_bateria = siec.model_copy(update={"shunt_capacitors": [stara]})
    odcisk_starej = (compute_input_hash(z_bateria), compute_semantic_hash(z_bateria))
    # Bateria sprzed karty z jawnymi wartościami domyślnymi (None / pusta lista) — ten sam odcisk.
    jawnie_puste = stara.model_copy(
        update={p: None for p in PARAMETRY_BATERII_KONDENSATOROW}
        | {"stopnie_zalaczone": None, "wylaczenie_od_transformatorow": []}
    )
    z_pustymi = siec.model_copy(update={"shunt_capacitors": [jawnie_puste]})
    assert (compute_input_hash(z_pustymi), compute_semantic_hash(z_pustymi)) == odcisk_starej
    for parametr, wartosc in (
        ("uklad_polaczen", "GWIAZDA_UZIEMIONA"),
        ("liczba_stopni", 2),
        ("stopnie_zalaczone", [True]),
        ("tolerancja_pojemnosci_min_proc", -5.0),
        ("tolerancja_pojemnosci_max_proc", 5.0),
        ("dlawik_ograniczajacy", False),
        ("rezystory_rozladowcze_wewnetrzne", True),
        ("wylaczenie_od_transformatorow", ["T1"]),
    ):
        zmieniona = siec.model_copy(
            update={"shunt_capacitors": [stara.model_copy(update={parametr: wartosc})]}
        )
        assert compute_input_hash(zmieniona) != odcisk_starej[0], parametr


def test_wejscie_uziemienia_punktu_neutralnego_bez_baterii_bez_pola() -> None:
    siec = _build_mv_lv_enm("Wejście v126")
    wejscie = build_v126_input_from_enm(siec).model_dump(mode="json")
    assert "shunt_capacitors" not in wejscie
    z_bateria = siec.model_copy(
        update={
            "shunt_capacitors": [
                ShuntCapacitor(
                    ref_id="BAT",
                    name="Bateria",
                    bus_ref=N1,
                    rated_mvar=1.2,
                    rated_kv=15.0,
                    uklad_polaczen="GWIAZDA_UZIEMIONA",
                )
            ]
        }
    )
    assert "shunt_capacitors" in build_v126_input_from_enm(z_bateria).model_dump(mode="json")


@pytest.mark.parametrize(
    ("pola", "oczekiwane"),
    [
        ({"stopnie_zalaczone": []}, "stan stopni nie może być pusty"),
        (
            {"liczba_stopni": 2, "stopnie_zalaczone": [True]},
            "stan stopni ma 1 pozycję, a bateria ma 2 stopnie",
        ),
        (
            {"liczba_stopni": 5, "stopnie_zalaczone": [True] * 2},
            "stan stopni ma 2 pozycje, a bateria ma 5 stopni",
        ),
        ({"dlawik_ograniczajacy": False, "dlawik_indukcyjnosc_mh": 1.0}, "nie ma dławika"),
        ({"liczba_stopni": 2, "stopnie_zalaczone": [True, False]}, None),
        ({"dlawik_ograniczajacy": True, "dlawik_indukcyjnosc_mh": 1.0}, None),
    ],
)
def test_sprzecznosc_parametrow_jedno_zdanie_dla_modelu_i_odmowy(
    pola: dict[str, Any], oczekiwane: str | None
) -> None:
    argumenty = {
        "liczba_stopni": None,
        "stopnie_zalaczone": None,
        "dlawik_ograniczajacy": None,
        "dlawik_indukcyjnosc_mh": None,
        **pola,
    }
    zdanie = sprzecznosc_parametrow_baterii(**argumenty)
    rekord = {
        "ref_id": "B",
        "name": "B",
        "bus_ref": "S",
        "rated_mvar": 1.2,
        "rated_kv": 15.0,
        **pola,
    }
    if oczekiwane is None:
        assert zdanie is None
        ShuntCapacitor.model_validate(rekord)
        return
    assert zdanie is not None and oczekiwane in zdanie
    with pytest.raises(ValueError, match=re.escape(zdanie)):
        ShuntCapacitor.model_validate(rekord)
    odmowa = odmowa_parametrow_baterii({"transformers": []}, rekord)
    assert odmowa is not None and odmowa.endswith(f": {zdanie}.")


def test_liczebniki_stopni_i_pozycji() -> None:
    assert [liczba_stopni_pl(n) for n in (1, 2, 4, 5, 12, 22, 25)] == [
        "1 stopień",
        "2 stopnie",
        "4 stopnie",
        "5 stopni",
        "12 stopni",
        "22 stopnie",
        "25 stopni",
    ]
    assert [liczba_pozycji_pl(n) for n in (1, 3, 11, 23)] == [
        "1 pozycję",
        "3 pozycje",
        "11 pozycji",
        "23 pozycje",
    ]


@pytest.mark.parametrize(
    ("parametry", "fragment"),
    [
        ({"liczba_stopni": 0}, "liczba stopni baterii — liczba całkowita co najmniej 1"),
        (
            {"uklad_polaczen": "ZYGZAK"},
            "układ połączeń baterii — jeden z układów: podwójna gwiazda",
        ),
        ({"tolerancja_pojemnosci_min_proc": 5.0}, "liczba nie większa niż 0 %"),
        ({"tolerancja_pojemnosci_max_proc": -5.0}, "liczba nie mniejsza niż 0 %"),
        ({"dlawik_indukcyjnosc_mh": -1.0}, "liczba większa niż 0 mH"),
        ({"stopnie_zalaczone": [True, False]}, "(liczba stopni z typu katalogowego)"),
        ({"wylaczenie_od_transformatorow": ["tr/brak"]}, "transformatory spoza modelu (1)"),
    ],
)
def test_odmowa_zapisu_parametrow_po_polsku_bez_kodow(
    parametry: dict[str, Any], fragment: str
) -> None:
    enm = zbuduj_gpz_z_bkr()
    odpowiedz = op(
        enm,
        "update_element_parameters",
        {"element_ref": bateria(enm)["ref_id"], "parameters": parametry},
    )
    assert odpowiedz.get("error_code") == "params.invalid_value"
    komunikat = str(odpowiedz["error"])
    assert fragment in komunikat
    # Komunikat walidacji modelu (angielski) ani kod pola/rekordu nie trafiają do projektanta.
    for zakazane in ("Input should", "Value error", "shunt/", *parametry):
        assert zakazane not in komunikat, zakazane
