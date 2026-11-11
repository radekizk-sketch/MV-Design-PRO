"""D1 (karta POLA-GPZ-SZABLONY; karta ZU-JEDEN-NOSNIK): jeden uziemiony nośnik punktu
neutralnego w sieci SN — bloker E-W5-04.

Nośnikiem punktu neutralnego sieci SN jest WYŁĄCZNIE punkt neutralny uzwojenia transformatora
(``hv_neutral``/``lv_neutral``) — w tym transformatora uziemiającego ZNyn11 zespołu
uziemiającego z wyposażeniem punktu neutralnego. Źródło na szynie SN nie jest nośnikiem (jego
opis punktu neutralnego fizyka pomija — W-W5-02); dawny wariant tego testu (model B) liczył
źródło jako nośnik, czego model jednej prawdy nie robi.

ILOCZYN CECH: typ uziemienia drugiego nośnika {bezpośrednio, rezystor, dławik, dławik z AWSC,
izolowany} × miejsce drugiego nośnika {transformator uziemiający ZNyn11 (zespół, operacja
produktu), punkt neutralny uzwojenia SN transformatora WN/SN} × liczba nośników {1, 2} ×
sekcja drugiego nośnika {ta sama, druga sekcja przy sprzęgle zamkniętym, druga sekcja przy
sprzęgle otwartym}. Pierwszy nośnik: punkt neutralny uzwojenia SN transformatora WN/SN sekcji A
uziemiony przez rezystor. Dławik z AWSC istnieje wyłącznie jako wyposażenie zespołu (uzwojenie
transformatora WN/SN nie niesie wyposażenia punktu neutralnego). Wyrocznia z definicji sieci
galwanicznej (zamknięta gałąź łączy sekcje), niezależna od kodu predykatu.
"""

from __future__ import annotations

import itertools

import pytest
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.domain_operations import execute_domain_operation
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GroundingConfig,
    SwitchBranch,
    Transformer,
)
from enm.uziemienie_sekcji import nosniki_sieci
from enm.validator import ENMValidator

from tests.utils.zespol_uziemiajacy import ladunek_zespolu, zespol_uziemiajacy_rekordy

TYPY = ("bezposrednio", "rezystor", "dlawik", "dlawik_awsc", "izolowany")
#: Typ → konfiguracja punktu neutralnego uzwojenia SN transformatora WN/SN (bez wyposażenia).
UZWOJENIE: dict[str, GroundingConfig] = {
    "bezposrednio": GroundingConfig(type="directly_grounded"),
    "rezystor": GroundingConfig(type="resistor_grounded", r_ohm=40.0),
    "dlawik": GroundingConfig(type="petersen_coil", x_ohm=120.0),
    "izolowany": GroundingConfig(type="isolated"),
}
MIEJSCA = ("transformator_uziemiajacy", "uzwojenie_tr")
SEKCJE = ("ta_sama", "sprzeglo_zamkniete", "sprzeglo_otwarte")


def _tr_wn_sn(ref: str, szyna_wn: str, szyna_sn: str, cfg: GroundingConfig) -> Transformer:
    return Transformer(
        ref_id=ref,
        name=f"TR {ref}",
        hv_bus_ref=szyna_wn,
        lv_bus_ref=szyna_sn,
        sn_mva=25.0,
        uhv_kv=110.0,
        ulv_kv=15.0,
        uk_percent=12.0,
        pk_kw=120.0,
        vector_group="YNyn0",
        lv_neutral=cfg,
    )


def _zespol(szyna: str, typ: str) -> tuple[Transformer, Bus]:
    """Zespół uziemiający (transformator ZNyn11 + szyna 0,4 kV) — operacja produktu."""
    if typ == "izolowany":
        trafo, szyna_nn = zespol_uziemiajacy_rekordy("tu", szyna, wariant="rezystor")
        # Punkt neutralny zygzaka jawnie izolowany (bez elementu — spójny, nie uziemia).
        trafo["hv_neutral"] = {**trafo["hv_neutral"], "type": "isolated", "rezystor": None}
    else:
        wariant = {
            "bezposrednio": "bezposrednie",
            "rezystor": "rezystor",
            "dlawik": "dlawik",
            "dlawik_awsc": "dlawik",
        }[typ]
        trafo, szyna_nn = zespol_uziemiajacy_rekordy(
            "tu",
            szyna,
            wariant=wariant,  # type: ignore[arg-type]
            i_nastawy_a=100.0 if wariant == "dlawik" else None,
            awsc={"i_wymuszany_a": 30.0} if typ == "dlawik_awsc" else None,
        )
    return Transformer.model_validate(trafo), Bus.model_validate(szyna_nn)


def _model(liczba: int, typ: str, miejsce: str, sekcja: str) -> EnergyNetworkModel:
    szyny = [
        Bus(ref_id="wn", name="Szyna 110 kV", voltage_kv=110.0),
        Bus(ref_id="sn_a", name="Sekcja A", voltage_kv=15.0),
        Bus(ref_id="sn_b", name="Sekcja B", voltage_kv=15.0),
    ]
    sprzeglo = SwitchBranch(
        ref_id="sprz",
        name="Sprzęgło",
        type="bus_coupler",
        from_bus_ref="sn_a",
        to_bus_ref="sn_b",
        status="open" if sekcja == "sprzeglo_otwarte" else "closed",
    )
    trafa = [_tr_wn_sn("tr_a", "wn", "sn_a", UZWOJENIE["rezystor"])]
    if liczba == 2:
        szyna = "sn_a" if sekcja == "ta_sama" else "sn_b"
        if miejsce == "transformator_uziemiajacy":
            trafo, szyna_nn = _zespol(szyna, typ)
            trafa.append(trafo)
            szyny.append(szyna_nn)
        else:
            # Drugi transformator WN/SN na szynie ``szyna`` (równolegle przy „ta_sama”).
            trafa.append(_tr_wn_sn("tr_b", "wn", szyna, UZWOJENIE[typ]))
    return EnergyNetworkModel(
        header=ENMHeader(name="d1", defaults=ENMDefaults()),
        buses=szyny,
        branches=[sprzeglo],
        transformers=trafa,
    )


def _oczekiwany_blad(liczba: int, typ: str, sekcja: str) -> bool:
    return liczba == 2 and typ != "izolowany" and sekcja != "sprzeglo_otwarte"


PRZYPADKI = [
    (liczba, typ, miejsce, sekcja)
    for liczba, typ, miejsce, sekcja in itertools.product((1, 2), TYPY, MIEJSCA, SEKCJE)
    if (liczba == 2 or (typ == "rezystor" and miejsce == "uzwojenie_tr"))
    and not (typ == "dlawik_awsc" and miejsce == "uzwojenie_tr")
]


@pytest.mark.parametrize(("liczba", "typ", "miejsce", "sekcja"), PRZYPADKI)
def test_iloczyn_typ_miejsce_liczba_sekcja(liczba: int, typ: str, miejsce: str, sekcja: str):
    model = _model(liczba, typ, miejsce, sekcja)
    kody = [i for i in ENMValidator().validate(model).issues if i.code == "E-W5-04"]
    oczekiwany = _oczekiwany_blad(liczba, typ, sekcja)
    assert bool(kody) is oczekiwany
    assert bool(nosniki_sieci(model)) is oczekiwany
    if oczekiwany:
        (blad,) = kody
        assert blad.severity == "BLOCKER"
        drugi = "tu" if miejsce == "transformator_uziemiajacy" else "tr_b"
        assert sorted(blad.element_refs) == sorted(["tr_a", drugi])
        assert "jednej sieci SN" in blad.message_pl
        assert blad.suggested_fix and "izolowany" in blad.suggested_fix
        assert blad.fix_action is not None
        assert blad.fix_action.modal_type == "TransformerModal"
        ((_szyny, nosniki),) = nosniki_sieci(model)
        nadmiarowy = nosniki[1]
        assert blad.fix_action.element_ref == nadmiarowy.element_ref
        assert blad.fix_action.payload_hint == {"required": nadmiarowy.pole}
        pola = {n.element_ref: n.pole for n in nosniki}
        assert pola == {
            "tr_a": "lv_neutral",
            drugi: "hv_neutral" if drugi == "tu" else "lv_neutral",
        }


def _gpz_z_dwoma_zespolami() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="d1", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ",
            "voltage_kv": 15.0,
            "sections_count": 1,
            "manual_equivalent": {
                "short_circuit_input_side": "HV_110",
                "hv_voltage_kv": 110.0,
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.1,
            },
            "transformer_count": 1,
            "transformer_catalog_ref": "tr-wn-sn-110-15-25mva-yd11",
            "zespoly_sekcji": [{"sekcja": 1, **ladunek_zespolu("rezystor")}],
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    migawka = wynik["snapshot"]
    szyna = migawka["substations"][0]["gpz_sections"][0]["bus_ref"]
    drugi = execute_domain_operation(
        enm_dict=migawka,
        op_name="add_zespol_uziemiajacy_sn",
        payload={"bus_ref": szyna, **ladunek_zespolu("rezystor"), "name": "Zespół 2"},
    )
    assert not drugi.get("error"), drugi.get("error")
    return drugi["snapshot"]


def test_zespol_za_otwartym_polem_zu_nie_jest_nosnikiem_sieci():
    """Zespół uziemiający za otwartym wyłącznikiem pola ZU nie należy do sieci SN (ten sam
    predykat ``tor_odlaczonego_pola_zu`` co uziemienie sieci i E003): brak E-W5-04 i brak E003
    wyspy złożonej z zacisku SN pola ZU i szyny potrzeb własnych 0,4 kV transformatora
    uziemiającego (karta ZU-JEDEN-NOSNIK: zespół niesie szynę 0,4 kV)."""
    migawka = _gpz_z_dwoma_zespolami()
    model = EnergyNetworkModel.model_validate(migawka)
    assert [i.code for i in ENMValidator().validate(model).issues].count("E-W5-04") == 1
    zaciski = {b.terminal_bus_ref for b in model.bays if b.bay_role == "ZU"}
    # Zespół sekcji stoi w polu ZU kreatora GPZ; drugi — wprost na szynie (operacja zespołu).
    (wylacznik,) = (
        b
        for b in migawka["branches"]
        if b.get("type") == "breaker" and {b["from_bus_ref"], b["to_bus_ref"]} & zaciski
    )
    wylacznik["status"] = "open"
    model = EnergyNetworkModel.model_validate(migawka)
    kody = [i.code for i in ENMValidator().validate(model).issues]
    assert "E-W5-04" not in kody
    assert "E003" not in kody
    assert nosniki_sieci(model) == []


def test_nosnik_transformatora_to_strona_sn_z_droga_do_ziemi():
    """Transformator SN/nN Dyn11 uziemia stronę nN — nie jest nośnikiem punktu SN."""
    model = _model(1, "rezystor", "uzwojenie_tr", "ta_sama")
    model = model.model_copy(
        update={
            "buses": [*model.buses, Bus(ref_id="nn", name="nn", voltage_kv=0.4)],
            "transformers": [
                *model.transformers,
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
                    lv_neutral=GroundingConfig(type="directly_grounded"),
                ),
            ],
        }
    )
    assert nosniki_sieci(model) == []
    assert "E-W5-04" not in [i.code for i in ENMValidator().validate(model).issues]


def test_kod_ma_most_do_kanonu_gotowosci():
    kanon = ODWZOROWANIE_WALIDATOR_NA_KANON["E-W5-04"]
    assert kanon == "earthing.multiple_grounded_neutrals_in_island"
    assert READINESS_CODES[kanon].level.name == "BLOCKER"


def test_determinizm_kolejnosci_wejscia():
    model = _model(2, "dlawik", "transformator_uziemiajacy", "sprzeglo_zamkniete")
    odwrocony = model.model_copy(
        update={
            "buses": list(reversed(model.buses)),
            "transformers": list(reversed(model.transformers)),
        }
    )
    assert nosniki_sieci(model) == nosniki_sieci(odwrocony)
    kody = [
        (i.code, tuple(i.element_refs))
        for m in (model, odwrocony)
        for i in ENMValidator().validate(m).issues
        if i.code == "E-W5-04"
    ]
    assert len(kody) == 2 and kody[0] == kody[1]
