"""D1 (karta POLA-GPZ-SZABLONY): jeden uziemiony nośnik punktu neutralnego w wyspie SN — E-W5-04.

ILOCZYN CECH: typ uziemienia drugiego nośnika {bezpośrednio, rezystor, dławik, dławik z AWSC,
izolowany} × miejsce drugiego nośnika {źródło SN, transformator uziemiający (uzwojenie górne
z punktem neutralnym, strona SN)} × liczba nośników {1, 2} × sekcja drugiego nośnika {ta sama,
druga sekcja przy sprzęgle zamkniętym, druga sekcja przy sprzęgle otwartym}. Pierwszy nośnik:
źródło GPZ na sekcji A uziemione przez rezystor. Wyrocznia z definicji wyspy galwanicznej
(zamknięta gałąź łączy sekcje), niezależna od kodu predykatu.
"""

from __future__ import annotations

import itertools

import pytest
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GroundingConfig,
    Source,
    SwitchBranch,
    Transformer,
)
from enm.nosniki_punktu_neutralnego import nosniki_uziemione_sn, wyspy_z_wieloma_nosnikami
from enm.validator import ENMValidator

TYPY: dict[str, GroundingConfig] = {
    "bezposrednio": GroundingConfig(type="directly_grounded"),
    "rezystor": GroundingConfig(type="resistor_grounded", r_ohm=40.0),
    "dlawik": GroundingConfig(type="petersen_coil", x_ohm=120.0),
    "dlawik_awsc": GroundingConfig(type="petersen_coil", x_ohm=120.0, awsc_prad_wymuszenia_a=30.0),
    "izolowany": GroundingConfig(type="isolated"),
}
MIEJSCA = ("zrodlo", "transformator_uziemiajacy")
SEKCJE = ("ta_sama", "sprzeglo_zamkniete", "sprzeglo_otwarte")


def _zrodlo(ref: str, bus: str, cfg: GroundingConfig | None) -> Source:
    zero = {} if cfg is None or cfg.type == "isolated" else {"r0_ohm": 1.0, "x0_ohm": 5.0}
    return Source(
        ref_id=ref,
        name=ref,
        bus_ref=bus,
        model="short_circuit_power",
        sk3_mva=250.0,
        rx_ratio=0.1,
        neutral_grounding=cfg,
        **zero,
    )


def _transformator_uziemiajacy(bus: str, cfg: GroundingConfig) -> Transformer:
    # Transformator uziemiający z punktem neutralnym po stronie SN (gwiazda uziemiona, trójkąt
    # po stronie potrzeb własnych) — nośnik `hv_neutral` (decyzja D1).
    return Transformer(
        ref_id="tu",
        name="Transformator uziemiający",
        hv_bus_ref=bus,
        lv_bus_ref="nn",
        sn_mva=0.4,
        uhv_kv=15.0,
        ulv_kv=0.4,
        uk_percent=4.0,
        pk_kw=4.0,
        vector_group="YNd11",
        hv_neutral=cfg,
    )


def _model(liczba: int, typ: str, miejsce: str, sekcja: str) -> EnergyNetworkModel:
    szyny = [
        Bus(ref_id="sn_a", name="Sekcja A", voltage_kv=15.0),
        Bus(ref_id="sn_b", name="Sekcja B", voltage_kv=15.0),
        Bus(ref_id="nn", name="nn", voltage_kv=0.4),
    ]
    sprzeglo = SwitchBranch(
        ref_id="sprz",
        name="Sprzęgło",
        type="bus_coupler",
        from_bus_ref="sn_a",
        to_bus_ref="sn_b",
        status="open" if sekcja == "sprzeglo_otwarte" else "closed",
    )
    zrodla = [_zrodlo("gpz", "sn_a", TYPY["rezystor"])]
    trafa: list[Transformer] = []
    if liczba == 2:
        bus = "sn_a" if sekcja == "ta_sama" else "sn_b"
        if miejsce == "zrodlo":
            zrodla.append(_zrodlo("gpz2", bus, TYPY[typ]))
        else:
            trafa.append(_transformator_uziemiajacy(bus, TYPY[typ]))
    return EnergyNetworkModel(
        header=ENMHeader(name="d1", defaults=ENMDefaults()),
        buses=szyny,
        branches=[sprzeglo],
        sources=zrodla,
        transformers=trafa,
    )


def _oczekiwany_blad(liczba: int, typ: str, sekcja: str) -> bool:
    return liczba == 2 and typ != "izolowany" and sekcja != "sprzeglo_otwarte"


PRZYPADKI = [
    (liczba, typ, miejsce, sekcja)
    for liczba, typ, miejsce, sekcja in itertools.product((1, 2), TYPY, MIEJSCA, SEKCJE)
    if liczba == 2 or (typ == "rezystor" and miejsce == "zrodlo")
]


@pytest.mark.parametrize(("liczba", "typ", "miejsce", "sekcja"), PRZYPADKI)
def test_iloczyn_typ_miejsce_liczba_sekcja(liczba: int, typ: str, miejsce: str, sekcja: str):
    model = _model(liczba, typ, miejsce, sekcja)
    kody = [i for i in ENMValidator().validate(model).issues if i.code == "E-W5-04"]
    oczekiwany = _oczekiwany_blad(liczba, typ, sekcja)
    assert bool(kody) is oczekiwany
    assert bool(wyspy_z_wieloma_nosnikami(model)) is oczekiwany
    if oczekiwany:
        (blad,) = kody
        assert blad.severity == "BLOCKER"
        drugi = "gpz2" if miejsce == "zrodlo" else "tu"
        assert blad.element_refs == ["gpz", drugi]
        assert "wyspie galwanicznej SN" in blad.message_pl
        assert blad.suggested_fix and "izolowany" in blad.suggested_fix
        assert blad.fix_action is not None and blad.fix_action.element_ref == drugi
        assert blad.fix_action.payload_hint == {
            "required": "neutral_grounding" if miejsce == "zrodlo" else "hv_neutral"
        }


def test_nosnik_transformatora_to_strona_sn_z_droga_do_ziemi():
    """Transformator SN/nN Dyn11 uziemia stronę nN — nie jest nośnikiem punktu SN."""
    model = _model(1, "rezystor", "zrodlo", "ta_sama")
    model = model.model_copy(
        update={
            "transformers": [
                Transformer(
                    ref_id="tr",
                    name="tr",
                    hv_bus_ref="sn_a",
                    lv_bus_ref="nn",
                    sn_mva=0.63,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=4.5,
                    pk_kw=6.5,
                    vector_group="Dyn11",
                    lv_earthing_system="TN-S",
                )
            ]
        }
    )
    assert [n.element_ref for n in nosniki_uziemione_sn(model)] == ["gpz"]


def test_zrodlo_po_stronie_110kv_nie_jest_nosnikiem():
    """Opis źródła 110 kV opisuje fizykę transformatorów WN/SN (E-W5-01), nie jest nośnikiem."""
    model = EnergyNetworkModel(
        header=ENMHeader(name="d1", defaults=ENMDefaults()),
        buses=[Bus(ref_id="hv", name="hv", voltage_kv=110.0)],
        sources=[_zrodlo("gpz", "hv", TYPY["rezystor"])],
    )
    assert nosniki_uziemione_sn(model) == []


def test_zrodlo_oznaczone_jako_strona_110kv_na_szynie_sn_nie_jest_nosnikiem():
    """Ten sam podział co reguła E-W5-01 (`po_stronie_sn`): `source_side = HV_110` = opis
    równoważnika 110 kV, nie nośnik punktu neutralnego SN."""
    zrodlo = _zrodlo("gpz", "sn_a", TYPY["rezystor"]).model_copy(update={"source_side": "HV_110"})
    model = _model(1, "rezystor", "zrodlo", "ta_sama").model_copy(update={"sources": [zrodlo]})
    assert nosniki_uziemione_sn(model) == []


def test_kod_ma_most_do_kanonu_gotowosci():
    kanon = ODWZOROWANIE_WALIDATOR_NA_KANON["E-W5-04"]
    assert kanon == "earthing.multiple_grounded_neutrals_in_island"
    assert READINESS_CODES[kanon].level.name == "BLOCKER"


def test_determinizm_kolejnosci_wejscia():
    model = _model(2, "dlawik", "transformator_uziemiajacy", "sprzeglo_zamkniete")
    odwrocony = model.model_copy(update={"buses": list(reversed(model.buses))})
    assert wyspy_z_wieloma_nosnikami(model) == wyspy_z_wieloma_nosnikami(odwrocony)
