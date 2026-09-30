"""Bramka kompletności eksportu CGMES (karta KASACJA-SCL-I-CIM-KLIENT, K-14/D-41).

Eksport modelu sieci ma jedną ścieżkę (backend), więc to ona musi odmówić pliku,
który byłby pozornym sukcesem albo uszkodzonym grafem RDF. Testy są ILOCZYNEM
CECH (reguła KLASA, NIE INSTANCJA pkt 2), nie przykładem z karty:

  rodzaj elementu z zaciskiem {linia, kabel, łącznik, bezpiecznik, transformator,
  źródło, generator synchroniczny, generator przekształtnikowy, odbiór, bateria
  kondensatorów} × koniec zacisku {1, 2 — dla elementów dwuzaciskowych}
  × „szyna istnieje / szyny brak"

plus stacja deklarująca szynę spoza modelu (eksporter pomija taki poziom napięcia —
bez bramki plik gubiłby go po cichu), model pusty, szyna z napięciem ≤ 0 kV, kilka braków naraz (kolejność
deterministyczna) i model kompletny (sieć złota — zero braków, plik powstaje).
"""

from __future__ import annotations

import pytest
from application.cgmes.kompletnosc import (
    KOD_MODEL_PUSTY,
    KOD_STACJA_Z_SZYNA_SPOZA_MODELU,
    KOD_SZYNA_BEZ_NAPIECIA,
    KOD_ZACISK_BEZ_SZYNY,
    ModelNiekompletnyDlaCgmesError,
    braki_kompletnosci_cgmes,
)
from application.cgmes.service import export_cgmes
from enm.models import EnergyNetworkModel, ENMHeader, ShuntCapacitor
from infrastructure.cgmes.cgmes_exporter import build_eq_tp_trees

from .golden_enm import build_golden_enm

BRAK = "szyna_spoza_modelu"


def _braki(enm: EnergyNetworkModel):
    eq, tp = build_eq_tp_trees(enm)
    return braki_kompletnosci_cgmes(enm, eq, tp)


def _z_bateria(enm: EnergyNetworkModel, bus_ref: str) -> EnergyNetworkModel:
    bateria = ShuntCapacitor(
        ref_id="bk_1",
        name="Bateria SN",
        bus_ref=bus_ref,
        rated_mvar=0.6,
        rated_kv=15.0,
    )
    return enm.model_copy(update={"shunt_capacitors": [bateria]})


def _podmien(enm: EnergyNetworkModel, kolekcja: str, ref_id: str, **pola) -> EnergyNetworkModel:
    elementy = [
        e.model_copy(update=pola) if e.ref_id == ref_id else e for e in getattr(enm, kolekcja)
    ]
    return enm.model_copy(update={kolekcja: elementy})


# (kolekcja, ref_id elementu sieci złotej, pole szyny, nazwa elementu w modelu)
ZACISKI = [
    ("branches", "cab_main_b", "from_bus_ref"),
    ("branches", "cab_main_b", "to_bus_ref"),
    ("branches", "line_b_c", "from_bus_ref"),
    ("branches", "line_b_c", "to_bus_ref"),
    ("branches", "sw_coupler", "from_bus_ref"),
    ("branches", "sw_coupler", "to_bus_ref"),
    ("branches", "fuse_c", "from_bus_ref"),
    ("branches", "fuse_c", "to_bus_ref"),
    ("transformers", "tr_hv_sn", "hv_bus_ref"),
    ("transformers", "tr_hv_sn", "lv_bus_ref"),
    ("transformers", "tr_sn_nn", "hv_bus_ref"),
    ("transformers", "tr_sn_nn", "lv_bus_ref"),
    ("sources", "src_gpz", "bus_ref"),
    ("generators", "gen_sync", "bus_ref"),
    ("generators", "gen_pv", "bus_ref"),
    ("loads", "load_c", "bus_ref"),
    ("loads", "load_nn", "bus_ref"),
]


def test_siec_zlota_jest_kompletna_i_daje_plik() -> None:
    enm = build_golden_enm()
    assert _braki(enm) == ()
    assert export_cgmes(enm)[:2] == b"PK"


def test_bateria_na_istniejacej_szynie_nie_jest_brakiem() -> None:
    assert _braki(_z_bateria(build_golden_enm(), "bus_sn_main")) == ()


@pytest.mark.parametrize(("kolekcja", "ref_id", "pole"), ZACISKI)
def test_kazdy_zacisk_wskazujacy_szyne_spoza_modelu_jest_nazwany(
    kolekcja: str, ref_id: str, pole: str
) -> None:
    enm = _podmien(build_golden_enm(), kolekcja, ref_id, **{pole: BRAK})
    element = next(e for e in getattr(enm, kolekcja) if e.ref_id == ref_id)

    braki = _braki(enm)

    assert [b.kod for b in braki] == [KOD_ZACISK_BEZ_SZYNY]
    assert braki[0].element_refs == (ref_id,)
    # Element nazwany z modelu, identyfikator maszynowy nie trafia do zdania.
    assert f"„{element.name}”" in braki[0].opis_pl
    assert ref_id not in braki[0].opis_pl
    with pytest.raises(ModelNiekompletnyDlaCgmesError) as exc:
        export_cgmes(enm)
    assert exc.value.braki == braki


def test_bateria_kondensatorow_na_szynie_spoza_modelu_jest_nazwana() -> None:
    braki = _braki(_z_bateria(build_golden_enm(), BRAK))
    assert [(b.kod, b.element_refs) for b in braki] == [(KOD_ZACISK_BEZ_SZYNY, ("bk_1",))]
    assert "„Bateria SN”" in braki[0].opis_pl


def test_oba_konce_galezi_poza_modelem_to_jeden_brak_elementu() -> None:
    enm = _podmien(
        build_golden_enm(), "branches", "line_b_c", from_bus_ref=BRAK, to_bus_ref=BRAK + "_2"
    )
    assert [(b.kod, b.element_refs) for b in _braki(enm)] == [(KOD_ZACISK_BEZ_SZYNY, ("line_b_c",))]


def test_model_pusty_jest_odmowa_nazwana() -> None:
    enm = EnergyNetworkModel(header=ENMHeader(name="Pusty"))
    braki = _braki(enm)
    assert [b.kod for b in braki] == [KOD_MODEL_PUSTY]
    with pytest.raises(ModelNiekompletnyDlaCgmesError) as exc:
        export_cgmes(enm)
    assert "nie zawiera żadnej szyny" in str(exc.value)


@pytest.mark.parametrize("napiecie_kv", [0.0, -15.0])
def test_szyna_bez_dodatniego_napiecia_jest_nazwana(napiecie_kv: float) -> None:
    enm = _podmien(build_golden_enm(), "buses", "bus_sn_c", voltage_kv=napiecie_kv)
    braki = _braki(enm)
    assert [(b.kod, b.element_refs) for b in braki] == [(KOD_SZYNA_BEZ_NAPIECIA, ("bus_sn_c",))]
    assert "„Stacja C SN”" in braki[0].opis_pl
    assert f"{napiecie_kv:g} kV" in braki[0].opis_pl


def test_kilka_brakow_naraz_w_kolejnosci_deterministycznej() -> None:
    enm = build_golden_enm()
    enm = _podmien(enm, "buses", "bus_sn_b", voltage_kv=0.0)
    enm = _podmien(enm, "loads", "load_nn", bus_ref=BRAK)
    enm = _podmien(enm, "branches", "cab_main_b", to_bus_ref=BRAK)
    pierwszy = _braki(enm)
    assert [(b.kod, b.element_refs) for b in pierwszy] == [
        (KOD_SZYNA_BEZ_NAPIECIA, ("bus_sn_b",)),
        (KOD_ZACISK_BEZ_SZYNY, ("cab_main_b",)),
        (KOD_ZACISK_BEZ_SZYNY, ("load_nn",)),
    ]
    assert _braki(enm) == pierwszy
    with pytest.raises(ModelNiekompletnyDlaCgmesError) as exc:
        export_cgmes(enm)
    # Komunikat wymienia KAŻDY brak, nie pierwszy z brzegu.
    for brak in pierwszy:
        assert brak.opis_pl in str(exc.value)


def test_stacja_ze_szyna_spoza_modelu_jest_nazwana_zamiast_cichego_pominiecia() -> None:
    enm = build_golden_enm()
    stacja = next(s for s in enm.substations if s.ref_id == "sub_b")
    enm = _podmien(enm, "substations", "sub_b", bus_refs=[*stacja.bus_refs, BRAK, BRAK + "_2"])
    braki = _braki(enm)
    assert [(b.kod, b.element_refs) for b in braki] == [
        (KOD_STACJA_Z_SZYNA_SPOZA_MODELU, ("sub_b", BRAK, BRAK + "_2"))
    ]
    assert f"„{stacja.name}”" in braki[0].opis_pl
    assert "liczba: 2" in braki[0].opis_pl
