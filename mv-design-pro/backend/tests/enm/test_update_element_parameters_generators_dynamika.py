"""`update_element_parameters` na `generators.dynamika` (karta W6-1).

Pole `Generator.dynamika` (kontrakt `ParametryDynamiczne`, `enm/dynamika_modele.py`)
ma DWA pisarze mozliwe do dzisiaj: konstrukcja modelu wprost (pokryte przez
`tests/enm/test_dynamika_modele.py`) i korekta ekspercka przez operacje domenowa
`update_element_parameters` (ten plik) — ten sam wzorzec, co
`tests/enm/test_update_element_parameters_substations.py` dla stacji.

`execute_domain_operation` sam NIE waliduje pydantic (przepisuje surowy dict —
patrz `enm/domain_operations.py::update_element_parameters`); pelna walidacja
(dyskryminator `rodzina`, wymagana `proweniencja`, walidatory krzyzowe
xd_bis<=xd_prim<=xd) idzie przez `EnergyNetworkModel.model_validate` na granicy
API (`api/enm.py`) — DOKLADNIE ten sam mechanizm, ktorym juz dzis przechodza
`limits`/`overrides`. Oba testy tutaj wywoluja ten mechanizm WPROST, zeby
udowodnic, ze naprawde dziala przez TA operacje, nie tylko przy bezposredniej
konstrukcji modelu w Pythonie.
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.dynamika_modele import MaszynaSynchroniczna
from enm.models import EnergyNetworkModel
from pydantic import ValidationError


def _maszyna_synchroniczna_payload(**override: object) -> dict:
    dane: dict = {
        "rodzina": "synchroniczna",
        "proweniencja": {
            "zrodlo": "karta_producenta",
            "odniesienie": "DS-0001",
            "data": "2026-01-01",
        },
        "s_n_mva": 10.0,
        "h_s": 3.0,
        "d_pu": 1.0,
        "xd_pu": 1.8,
        "xq_pu": 1.7,
        "xd_prim_pu": 0.3,
        "xq_prim_pu": 0.4,
        "xd_bis_pu": 0.2,
        "xq_bis_pu": 0.25,
        "td0_prim_s": 6.0,
        "tq0_prim_s": 0.5,
        "td0_bis_s": 0.03,
        "tq0_bis_s": 0.05,
        "xl_pu": 0.15,
        "nasycenie_s10": 0.1,
        "nasycenie_s12": 0.3,
        "ra_pu": 0.003,
    }
    dane.update(override)
    return dane


def _enm_with_generator() -> dict:
    return {
        "header": {"name": "Generator Dynamika Update Test", "revision": 1, "defaults": {}},
        "buses": [
            {
                "ref_id": "bus/sn",
                "name": "Szyna SN",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
            },
        ],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [
            {
                "ref_id": "gen-1",
                "name": "Generator SN testowy",
                "tags": [],
                "meta": {},
                "bus_ref": "bus/sn",
                "p_mw": 5.0,
                "gen_type": "synchronous",
            }
        ],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def test_update_element_parameters_allows_generator_dynamika_write() -> None:
    enm = _enm_with_generator()

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={
            "element_ref": "gen-1",
            "parameters": {"dynamika": _maszyna_synchroniczna_payload()},
        },
    )

    assert result.get("error_code") is None, result.get("error")
    assert result["changes"]["updated_element_ids"] == ["gen-1"]

    # Granica API (`api/enm.py`) rewaliduje CALY snapshot pydantic — ten sam
    # krok tutaj, zeby udowodnic, ze pole naprawde jest typowane, nie tylko
    # przepisane jako surowy dict.
    model = EnergyNetworkModel.model_validate(result["snapshot"])
    generator = next(g for g in model.generators if g.ref_id == "gen-1")
    assert isinstance(generator.dynamika, MaszynaSynchroniczna)
    assert generator.dynamika.rodzina == "synchroniczna"
    assert generator.dynamika.proweniencja.zrodlo == "karta_producenta"


def test_update_element_parameters_generator_dynamika_enforces_cross_validator() -> None:
    """Ten sam walidator krzyzowy xd_bis<=xd_prim<=xd (pinowany wprost w
    `test_dynamika_modele.py`) musi odmowic RowNIEZ przez ta operacje — inaczej
    korekta ekspercka bylaby DRUGA, luzniejsza droga zapisu (KLASA NIE INSTANCJA,
    CLAUDE.md: „predykaty parami — warunek WEJSCIA i WYJSCIA z JEDNEGO zrodla")."""
    enm = _enm_with_generator()

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={
            "element_ref": "gen-1",
            "parameters": {
                "dynamika": _maszyna_synchroniczna_payload(
                    xd_bis_pu=0.35, xd_prim_pu=0.30, xd_pu=1.8
                )
            },
        },
    )

    # `execute_domain_operation` samo nie waliduje pydantic (surowy dict) —
    # blad zglasza sie dopiero na `EnergyNetworkModel.model_validate`, tak jak
    # naprawde dzieje sie to na granicy API.
    assert result.get("error_code") is None
    try:
        EnergyNetworkModel.model_validate(result["snapshot"])
    except ValidationError as exc:
        assert "xd_bis_pu" in str(exc)
    else:
        raise AssertionError(
            "EnergyNetworkModel.model_validate przyjelo niespojna dynamike "
            "(xd_bis_pu > xd_prim_pu) — walidator krzyzowy nie dziala przez "
            "sciezke update_element_parameters."
        )
