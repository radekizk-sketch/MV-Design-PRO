"""Karta ETYKIETY-TR: klasa napięciowa w nazwach elementów z napięć modelu, napięcie przez `:g`.

Po co: wstawienie stacji nadawało transformatorowi stałą nazwę „Transformator SN/nN”, a
szynie strony dolnej „Szyna nN stacji” — także wtedy, gdy katalog i napięcie stacji dawały
transformator 15/6 kV (oba uzwojenia w paśmie SN). Stacja dołączana na końcu ciągu robiła to
samo z szyną („Szyna nN {stacja}”), tor DER-SN z szynami producenta i TR blokowego. GPZ
formatował napięcie bez `:g` („Szyna GPZ S1 15.0 kV”), inaczej niż każda inna nazwa modułu.

Ta sama klasa w polach strony dolnej: wyłącznik główny i odpływy budowane przez obie operacje
stacyjne, pola dopisywane operacją `add_nn_outgoing_field` (odpływ, pole źródłowe), odbiór
`add_nn_load` i pole falownika `add_converter_source` nosiły stałe „nN”. Po bramce pasma
(`pole_transformatorowe.w_pasmie_nn`) stacja SN/nN i operacje strony dolnej odmawiają szyny
spoza pasma nN (`test_bramka_pasma_nn.py`), więc nazwa z klasą szyny pozostaje prawdziwa z
konstrukcji; klasę SN niosą nazwy toru DER-SN i pola falownika na szynie SN.

Iloczyn cech: operacja {wstawienie stacji w odcinek, dołączenie stacji na końcu, GPZ, tor
DER-SN, pole strony dolnej dopisane później, pole falownika} × napięcie szyny {0,4 kV (nN);
szyny SN toru DER} × nazwa {transformatora, szyny strony dolnej, wyłącznika głównego,
odpływu, pola źródłowego, szyny sekcji GPZ, źródła GPZ, stacji GPZ, szyn toru DER} × warunek
{klasa z `pasmo_napieciowe`, brak kropki dziesiętnej przy całkowitym napięciu}; helper nazw
dla napięć {0,4, 6, brak}.
"""

from __future__ import annotations

import copy
import re
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import _nazwa_z_klasa_szyny
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pole_transformatorowe import pasmo_napieciowe

from tests.enm.test_der_sn_topology_domain_ops import _der_sn_payload, _sn_station_enm
from tests.enm.test_station_field_apparatus_explicit import (
    APARAT_SN,
    _build_trunk_with_segment,
    _insert_payload,
)

#: (napięcie strony dolnej, pozycja katalogowa transformatora 15/U kV, oczekiwany rodzaj).
#: Stacja SN/nN ze stroną dolną spoza pasma nN (np. 15/6 kV) jest odrzucana bramką pasma
#: (`station.*.nn_voltage_not_nn_band`, test w
#: `tests/application/analyses/fault_loop/test_bramka_pasma_nn.py`), więc nazwy strony
#: dolnej stacji sprawdzamy w paśmie nN; klasa SN w nazwach pochodzi z toru DER-SN niżej.
_STRONY_DOLNE = [
    (0.4, "tr-sn-nn-15-04-630kva-dyn11", "SN/nN"),
]

#: Napięcie zapisane z kropką dziesiętną przy wartości całkowitej („15.0 kV”).
_NAPIECIE_BEZ_G = re.compile(r"\b\d+\.0 kV\b")


def _nowe(migawka: dict[str, Any], przed: dict[str, Any], klucz: str) -> list[dict[str, Any]]:
    stare = {e["ref_id"] for e in przed.get(klucz, [])}
    return [e for e in migawka.get(klucz, []) if e["ref_id"] not in stare]


@pytest.mark.parametrize(("napiecie_dolne", "katalog", "rodzaj"), _STRONY_DOLNE)
def test_wstawienie_stacji_klasa_transformatora_i_szyny_z_napiec(
    napiecie_dolne: float, katalog: str, rodzaj: str
) -> None:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(segment_ref, field_apparatus_catalog_ref=APARAT_SN)
    payload["station"]["nn_voltage_kv"] = napiecie_dolne
    payload["transformer"]["transformer_catalog_ref"] = katalog
    wynik = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    assert wynik.get("error") is None, wynik.get("error")
    (transformator,) = _nowe(wynik["snapshot"], snap, "transformers")
    assert transformator["name"] == f"Transformator {rodzaj}"
    szyna_dolna = next(
        b for b in wynik["snapshot"]["buses"] if b["ref_id"] == transformator["lv_bus_ref"]
    )
    assert szyna_dolna["name"] == f"Szyna {pasmo_napieciowe(napiecie_dolne)} stacji"
    klasa = pasmo_napieciowe(napiecie_dolne)
    assert _nazwy_pol_strony_dolnej(wynik["snapshot"], transformator["lv_bus_ref"]) == [
        f"Wyłącznik główny {klasa}",
        f"Odpływ {klasa} 1",
    ]


def _nazwy_pol_strony_dolnej(migawka: dict[str, Any], szyna: str) -> list[str]:
    return [
        pole["name"]
        for stacja in migawka["substations"]
        for pole in (stacja.get("meta") or {}).get("nn_field_specs", [])
        if pole.get("bus_ref") == szyna
    ]


def _stacja_wstawiona(napiecie_dolne: float, katalog: str) -> tuple[dict[str, Any], str, str]:
    snap, segment_ref, _ = _build_trunk_with_segment()
    payload = _insert_payload(segment_ref, field_apparatus_catalog_ref=APARAT_SN)
    payload["station"]["nn_voltage_kv"] = napiecie_dolne
    payload["transformer"]["transformer_catalog_ref"] = katalog
    wynik = execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)
    assert wynik.get("error") is None, wynik.get("error")
    (transformator,) = _nowe(wynik["snapshot"], snap, "transformers")
    stacja = next(
        s
        for s in wynik["snapshot"]["substations"]
        if transformator["ref_id"] in (s.get("transformer_refs") or [])
    )
    return wynik["snapshot"], stacja["ref_id"], transformator["lv_bus_ref"]


@pytest.mark.parametrize(("napiecie_dolne", "katalog", "_rodzaj"), _STRONY_DOLNE)
@pytest.mark.parametrize(
    ("rola", "dodatkowe", "oczekiwana"),
    [
        ("OUTGOING", {}, "Odpływ {klasa}"),
        ("SOURCE", {"source_field_kind": "PV"}, "Pole źródłowe {klasa} (PV)"),
    ],
)
def test_pole_strony_dolnej_dopisane_pozniej_klasa_z_napiecia_szyny(
    napiecie_dolne: float,
    katalog: str,
    _rodzaj: str,
    rola: str,
    dodatkowe: dict[str, Any],
    oczekiwana: str,
) -> None:
    migawka, stacja_ref, szyna = _stacja_wstawiona(napiecie_dolne, katalog)
    wynik = execute_domain_operation(
        copy.deepcopy(migawka),
        "add_nn_outgoing_field",
        {"bus_nn_ref": szyna, "station_ref": stacja_ref, "field_role": rola, **dodatkowe},
    )
    assert wynik.get("error") is None, wynik.get("error")
    nazwy = _nazwy_pol_strony_dolnej(wynik["snapshot"], szyna)
    assert nazwy[-1] == oczekiwana.format(klasa=pasmo_napieciowe(napiecie_dolne))


@pytest.mark.parametrize(("napiecie_dolne", "katalog", "_rodzaj"), _STRONY_DOLNE)
def test_dolaczenie_stacji_klasa_szyny_strony_dolnej_z_napiecia(
    napiecie_dolne: float, katalog: str, _rodzaj: str
) -> None:
    snap, _, terminal_bus_ref = _build_trunk_with_segment()
    wynik = execute_domain_operation(
        copy.deepcopy(snap),
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": terminal_bus_ref,
            "station": {"name": "Stacja K", "station_type": "terminal"},
            "nn_voltage_kv": napiecie_dolne,
            "field_apparatus_catalog_ref": APARAT_SN,
            "transformer": {"transformer_catalog_ref": katalog},
            "nn_block": {"outgoing_feeders_nn_count": 1},
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    (transformator,) = _nowe(wynik["snapshot"], snap, "transformers")
    # Nazwa transformatora stacji dołączanej nie niesie klasy („TR {stacja}”).
    assert transformator["name"] == "TR Stacja K"
    szyna_dolna = next(
        b for b in wynik["snapshot"]["buses"] if b["ref_id"] == transformator["lv_bus_ref"]
    )
    assert szyna_dolna["name"] == f"Szyna {pasmo_napieciowe(napiecie_dolne)} Stacja K"
    klasa = pasmo_napieciowe(napiecie_dolne)
    assert _nazwy_pol_strony_dolnej(wynik["snapshot"], transformator["lv_bus_ref"]) == [
        f"Wyłącznik główny {klasa}",
        f"Odpływ {klasa} 1",
    ]


@pytest.mark.parametrize(
    ("napiecie", "oczekiwana"),
    [(0.4, "Odbiór nN"), (6.0, "Odbiór SN"), (None, "Odbiór")],
)
def test_nazwa_domyslna_z_klasa_szyny_bez_domyslu(napiecie: float | None, oczekiwana: str) -> None:
    """Jedno złożenie nazw operacji strony dolnej: klasa z napięcia szyny, brak napięcia →
    nazwa bez klasy (nigdy domysł „nN”)."""
    enm = {"buses": [{"ref_id": "b", "voltage_kv": napiecie}]}
    assert _nazwa_z_klasa_szyny(enm, "b", "Odbiór", "{klasa}") == oczekiwana


@pytest.mark.parametrize("technologia", ["PV", "BESS"])
def test_pole_falownika_na_szynie_nn_nazwa_z_klasy_szyny(technologia: str) -> None:
    """`add_converter_source` bez nazwy pola: „Pole {technologia} {klasa szyny}”."""
    from tests.enm.test_nn_source_catalog_provenance import (
        _base_enm_with_transformer,
        _converter_payload,
    )

    klucz = {"PV": "conv-pv-nn-0p5mw-0p4kv", "BESS": "conv-bess-nn-0p5mw-0p4kv"}[technologia]
    wynik = execute_domain_operation(
        _base_enm_with_transformer(),
        "add_converter_source",
        _converter_payload(
            technologia,
            {
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": klucz,
                    "catalog_item_version": "2024.1",
                }
            },
        ),
    )
    assert not wynik.get("error"), wynik.get("error")
    assert _nazwy_pol_strony_dolnej(wynik["snapshot"], "bus/nn/1") == [f"Pole {technologia} nN"]


@pytest.mark.parametrize("napiecie_sn", [15.0, 20])
def test_nazwy_gpz_formatuja_napiecie_przez_g(napiecie_sn: float) -> None:
    """Szyna sekcji, źródło i stacja GPZ: napięcie bez „.0”, jak każda inna nazwa modułu."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="gpz", defaults=ENMDefaults(sn_nominal_kv=napiecie_sn))
    ).model_dump(mode="json")
    wynik = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": napiecie_sn,
            "sk3_mva": 250.0,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    migawka = wynik["snapshot"]
    nazwy = [
        *(b["name"] for b in migawka["buses"]),
        *(s["name"] for s in migawka["sources"]),
        *(s["name"] for s in migawka.get("substations", [])),
    ]
    for nazwa in nazwy:
        assert not _NAPIECIE_BEZ_G.search(nazwa), nazwa
    assert f"Szyna GPZ S1 {napiecie_sn:g} kV" in nazwy
    assert f"Źródło GPZ {napiecie_sn:g} kV" in nazwy


def test_tor_der_sn_klasa_szyn_z_napiec_falownika_i_strony_sn() -> None:
    wynik = execute_domain_operation(
        _sn_station_enm(), "add_converter_source", _der_sn_payload(source_name="Blok PV")
    )
    assert not wynik.get("error"), wynik.get("error")
    szyny = {b["meta"].get("der_role"): b for b in wynik["snapshot"]["buses"]}
    producenta = szyny["producer_lv_bus"]
    blokowego = szyny["block_hv_bus"]
    assert producenta["name"] == (
        f"Szyna {pasmo_napieciowe(producenta['voltage_kv'])} producenta Blok PV"
    )
    assert blokowego["name"] == (
        f"Szyna {pasmo_napieciowe(blokowego['voltage_kv'])} TR blokowego Blok PV"
    )
