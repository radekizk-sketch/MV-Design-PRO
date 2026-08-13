"""Kontrakt kopiowania modelu w operacjach topologicznych (TOPO-COPY, V12K-323).

DŁUG, KTÓRY TO ZAMYKA. `enm/topology_ops.py` kopiował GŁĘBOKO cały model przy
KAŻDYM dodawanym elemencie, mimo że operacja domenowa, która go woła, zrobiła już
własną prywatną kopię na wejściu. Koszt dodania N-tego elementu rósł liniowo
z rozmiarem modelu: na budowie substratu 53 stacji kopie z `topology_ops` zjadały
6,59 s z 10,90 s (60,5 %; 737 kopii). Audyt: `docs/plan/TOPO_COPY_AUDYT.md`.

CO PILNUJE TEN PLIK — DWIE WARSTWY, DWIE ROLE.

1. `TestIzolacjaOperacjiDomenowej` — kontrakt ZEWNĘTRZNY, widziany przez każdego
   wołającego operację domenową: operacja NIE mutuje modelu wejściowego, a jej
   wynik jest niezależny od późniejszych mutacji wejścia (i odwrotnie). Ta klasa
   powstała PRZED chirurgią i przeszła chirurgię BEZ ZMIANY TREŚCI — to ona
   dowodzi, że przeniesienie kopiowania na granicę operacji nie ruszyło kontraktu
   widocznego z zewnątrz. Każda przyszła zmiana semantyki kopii ma się tu wywalić.

2. `TestKontraktMutacjiWMiejscu` — kontrakt WEWNĘTRZNY warstwy topologicznej:
   operacja mutuje podany model W MIEJSCU, oddaje TEN SAM obiekt, a ścieżka błędu
   nie zostawia po sobie żadnego skutku. Deklaracja bez testu jest fałszywą
   pewnością, więc każde zdanie kontraktu z docstringu `topology_ops` ma tu
   asercję — łącznie z DETERMINISTYCZNĄ (nie czasową) asercją liczby głębokich
   kopii wykonanych przez moduł.

KLASA, NIE INSTANCJA. Karta nazwała `create_node` i `create_branch`; wzorzec
obejmował wszystkie 14 funkcji mutujących modułu, więc testy idą po iloczynie
cech: {kategoria wołającego} × {rodzaj operacji topologicznej} × {sukces, BLOCKER}.
"""

from __future__ import annotations

import ast
import copy
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

# KOLEJNOŚĆ IMPORTU JEST ISTOTNA: `domain_operations_v2` domyka cykl z
# `domain_operations` (v1 wciąga handlery V2 na końcu pliku), więc moduł V2
# zaimportowany PIERWSZY przewraca się na częściowo zainicjowanym module V1.
from enm import topology_ops
from enm.domain_operations import execute_domain_operation

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    REF_APARAT_SN,
    REF_KABEL,
    REF_PV,
    REF_ZRODLO,
    _payload_ct,
    _payload_relay,
    _payload_sn_bay,
    _payload_vt,
    _payload_zrodla,
    _pole_sn_ref,
    _pusty_enm,
    _siec_ze_stacja,
    _wykonaj,
)

#: Łącznik sekcyjny SN — pozycja katalogowa używana przez istniejące testy
#: topologii (`tests/test_topology_guardians_step1.py`).
REF_LACZNIK_SEKCYJNY = "sw-ls-schneider-rm6-17kv-400a"


# ---------------------------------------------------------------------------
# Budowniczowie modeli wejściowych
# ---------------------------------------------------------------------------


def _model_pusty() -> dict[str, Any]:
    return _pusty_enm()


def _model_z_gpz() -> dict[str, Any]:
    return _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": REF_ZRODLO},
    )


def _model_z_odcinkiem() -> dict[str, Any]:
    return _wykonaj(
        _model_z_gpz(),
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": REF_KABEL}},
    )


def _model_ze_stacja() -> dict[str, Any]:
    return _siec_ze_stacja()


def _model_ze_stacja_i_ct() -> dict[str, Any]:
    snapshot = _siec_ze_stacja()
    return _wykonaj(snapshot, "add_ct", _payload_ct(snapshot))


# ---------------------------------------------------------------------------
# Payloady
# ---------------------------------------------------------------------------


def _payload_gpz(_: dict[str, Any]) -> dict[str, Any]:
    return {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": REF_ZRODLO}


def _payload_odcinka(_: dict[str, Any]) -> dict[str, Any]:
    return {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": REF_KABEL}}


def _payload_stacji_na_koncu(snapshot: dict[str, Any]) -> dict[str, Any]:
    odcinek = snapshot["branches"][-1]
    return {
        "endpoint_bus_ref": str(odcinek["to_bus_ref"]),
        "station": {"name": "Stacja końcowa", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
        "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "TRANSFORMATOROWE"}],
        "field_apparatus_catalog_ref": REF_APARAT_SN,
        "nn_block": {"outgoing_feeders_nn_count": 1},
    }


def _payload_lacznika_sekcyjnego(snapshot: dict[str, Any]) -> dict[str, Any]:
    odcinek = next(b for b in snapshot["branches"] if b.get("type") in ("cable", "line_overhead"))
    return {
        "segment_id": str(odcinek["ref_id"]),
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "catalog_ref": REF_LACZNIK_SEKCYJNY,
    }


def _payload_zrodla_pv(snapshot: dict[str, Any]) -> dict[str, Any]:
    return _payload_zrodla(snapshot, catalog_ref=REF_PV, technologia="PV")


#: ILOCZYN CECH, nie przykłady z karty. Każdy wiersz to
#: (etykieta, operacja domenowa, budowniczy modelu, budowniczy payloadu),
#: dobrany tak, żeby pokryć KAŻDĄ kategorię wołającego z audytu ORAZ każdy
#: rodzaj operacji topologicznej, która pod nią pracuje.
PRZYPADKI_SUKCESU: list[tuple[str, str, Callable[[], dict], Callable[[dict], dict]]] = [
    # K1 — operacja domenowa V1 z własną kopią graniczną.
    #      create_node ×N + create_device(source) + create_branch
    ("K1/gpz", "add_grid_source_sn", _model_pusty, _payload_gpz),
    #      create_node + create_branch
    ("K1/odcinek", "continue_trunk_segment_sn", _model_z_gpz, _payload_odcinka),
    #      delete_branch + create_node ×N + create_branch ×N
    (
        "K1/lacznik_sekcyjny",
        "insert_section_switch_sn",
        _model_z_odcinkiem,
        _payload_lacznika_sekcyjnego,
    ),
    # K1+K5 — domknięcie `_materialize_sn_field_apparatus` (create_node + create_branch
    #         wołane z domknięcia, model brany z zakresu otaczającego).
    (
        "K5/stacja_na_koncu",
        "append_station_on_endpoint",
        _model_z_odcinkiem,
        _payload_stacji_na_koncu,
    ),
    # K2 — operacja domenowa V2 z własną kopią graniczną (create_node + create_branch).
    ("K2/pole_sn", "add_sn_bay", _model_ze_stacja, _payload_sn_bay),
    # K2 — źródło przekształtnikowe DER (create_node ×3 + create_branch ×2).
    ("K2/zrodlo_der", "add_converter_source", _model_ze_stacja, _payload_zrodla_pv),
    # K3 — operacje, które PRZED naprawą nie miały własnej kopii granicznej
    #      i polegały na kopii wewnątrz `topology_ops`.
    ("K3/ct", "add_ct", _model_ze_stacja, _payload_ct),  # create_measurement
    ("K3/vt", "add_vt", _model_ze_stacja, _payload_vt),  # create_measurement
    ("K3/przekaznik", "add_relay", _model_ze_stacja_i_ct, _payload_relay),  # attach_protection
]

#: Ścieżka BLOCKER: operacja melduje błąd i NIE zostawia żadnego skutku.
#: Dobrane tak, żeby błąd padał PO bramkach wejściowych, a przed/wewnątrz
#: warstwy topologicznej — czyli w miejscu, w którym kopia miała znaczenie.
PRZYPADKI_BLEDU: list[tuple[str, str, Callable[[], dict], Callable[[dict], dict]]] = [
    (
        "K1/odcinek_bez_katalogu",
        "continue_trunk_segment_sn",
        _model_z_gpz,
        lambda _: {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0}},
    ),
    (
        "K2/pole_sn_bez_szyny",
        "add_sn_bay",
        _model_ze_stacja,
        lambda s: {**_payload_sn_bay(s), "bus_ref": "bus/nie-ma-takiej"},
    ),
    (
        "K3/ct_bez_pola",
        "add_ct",
        _model_ze_stacja,
        lambda s: {**_payload_ct(s), "field_ref": "field/nie-ma-takiego"},
    ),
    (
        "K3/przekaznik_bez_ct",
        "add_relay",
        _model_ze_stacja,
        _payload_relay,
    ),
]


def _bajty(model: dict[str, Any]) -> str:
    """Migawka BAJTOWA modelu — porównanie odporne na kolejność kluczy."""
    return json.dumps(model, sort_keys=True, ensure_ascii=False, default=str)


class TestIzolacjaOperacjiDomenowej:
    """Kontrakt ZEWNĘTRZNY — zielony PRZED i PO przeniesieniu kopiowania.

    Te asercje nie wiedzą nic o tym, gdzie stoi `deepcopy`. Mówią wyłącznie to,
    na czym polega każdy wołający operacji domenowej: „mój model wejściowy jest
    mój, wynik jest osobny". Gdyby chirurgia TOPO-COPY przesunęła kopiowanie
    o jedno miejsce za daleko, wywalą się tutaj — i tylko dlatego wolno było
    ruszyć 17 miejsc kopiowania naraz.
    """

    @pytest.mark.parametrize(
        ("etykieta", "operacja", "buduj_model", "buduj_payload"),
        [pytest.param(*p, id=p[0]) for p in PRZYPADKI_SUKCESU],
    )
    def test_operacja_nie_mutuje_modelu_wejsciowego(
        self,
        etykieta: str,
        operacja: str,
        buduj_model: Callable[[], dict],
        buduj_payload: Callable[[dict], dict],
    ) -> None:
        wejscie = buduj_model()
        payload = buduj_payload(wejscie)
        przed = _bajty(wejscie)

        wynik = execute_domain_operation(wejscie, operacja, payload)
        assert not wynik.get("error"), f"{etykieta}: {wynik.get('error')}"

        assert (
            _bajty(wejscie) == przed
        ), f"{etykieta}: operacja '{operacja}' zmutowała model WEJŚCIOWY wołającego"

    @pytest.mark.parametrize(
        ("etykieta", "operacja", "buduj_model", "buduj_payload"),
        [pytest.param(*p, id=p[0]) for p in PRZYPADKI_SUKCESU],
    )
    def test_wynik_niezalezny_od_pozniejszych_mutacji_wejscia(
        self,
        etykieta: str,
        operacja: str,
        buduj_model: Callable[[], dict],
        buduj_payload: Callable[[dict], dict],
    ) -> None:
        wejscie = buduj_model()
        payload = buduj_payload(wejscie)

        wynik = execute_domain_operation(wejscie, operacja, payload)
        assert not wynik.get("error"), f"{etykieta}: {wynik.get('error')}"
        migawka = wynik["snapshot"]
        migawka_przed = _bajty(migawka)

        # Wołający robi ze SWOIM modelem, co chce — na wyniku nie wolno tego widzieć.
        wejscie.setdefault("buses", []).append(
            {
                "ref_id": "bus/skazenie",
                "name": "Szyna skażenia",
                "voltage_kv": 15.0,
                "phase_system": "3ph",
                "tags": [],
                "meta": {},
            }
        )
        wejscie["header"]["name"] = "SKAŻONE"
        for szyna in wejscie.get("buses", []):
            szyna.setdefault("meta", {})["skazenie"] = True

        assert (
            _bajty(migawka) == migawka_przed
        ), f"{etykieta}: wynik operacji '{operacja}' współdzieli struktury z wejściem"

    @pytest.mark.parametrize(
        ("etykieta", "operacja", "buduj_model", "buduj_payload"),
        [pytest.param(*p, id=p[0]) for p in PRZYPADKI_SUKCESU],
    )
    def test_wejscie_niezalezne_od_mutacji_wyniku(
        self,
        etykieta: str,
        operacja: str,
        buduj_model: Callable[[], dict],
        buduj_payload: Callable[[dict], dict],
    ) -> None:
        wejscie = buduj_model()
        payload = buduj_payload(wejscie)

        wynik = execute_domain_operation(wejscie, operacja, payload)
        assert not wynik.get("error"), f"{etykieta}: {wynik.get('error')}"
        migawka = wynik["snapshot"]
        wejscie_przed = _bajty(wejscie)

        migawka["header"]["name"] = "SKAŻONE"
        for szyna in migawka.get("buses", []):
            szyna.setdefault("meta", {})["skazenie"] = True
        for galaz in migawka.get("branches", []):
            galaz.setdefault("meta", {})["skazenie"] = True

        assert (
            _bajty(wejscie) == wejscie_przed
        ), f"{etykieta}: mutacja wyniku operacji '{operacja}' przeciekła do wejścia"

    @pytest.mark.parametrize(
        ("etykieta", "operacja", "buduj_model", "buduj_payload"),
        [pytest.param(*p, id=p[0]) for p in PRZYPADKI_BLEDU],
    )
    def test_operacja_meldujaca_blad_nie_zostawia_skutku(
        self,
        etykieta: str,
        operacja: str,
        buduj_model: Callable[[], dict],
        buduj_payload: Callable[[dict], dict],
    ) -> None:
        wejscie = buduj_model()
        payload = buduj_payload(wejscie)
        przed = _bajty(wejscie)

        wynik = execute_domain_operation(wejscie, operacja, payload)

        assert wynik.get("error"), f"{etykieta}: oczekiwano błędu, operacja się powiodła"
        assert (
            _bajty(wejscie) == przed
        ), f"{etykieta}: operacja '{operacja}' zameldowała błąd, ale zmieniła model"

    def test_seria_operacji_na_wspolnej_migawce_izoluje_pierwotne_wejscie(self) -> None:
        """Iloczyn cech: seria operacji × wspólna migawka × wyposażenie pola.

        `_zastosuj_wyposazenie_pol` woła `add_ct`/`add_vt`/`add_relay` w PĘTLI na
        JEDNEJ, jeszcze niezapisanej migawce (gwarancja B-3: albo stacja
        z kompletnym wyposażeniem, albo nic). Pojedyncza operacja mogłaby
        zachować izolację, a seria — nie, gdyby któryś krok mutował model
        wołającego. Ten przypadek jest jedynym, który to rozstrzyga.
        """
        pierwotne = _siec_ze_stacja()
        przed = _bajty(pierwotne)

        biezace = pierwotne
        for operacja, buduj_payload in (
            ("add_ct", _payload_ct),
            ("add_vt", _payload_vt),
            ("add_relay", _payload_relay),
        ):
            wynik = execute_domain_operation(biezace, operacja, buduj_payload(biezace))
            assert not wynik.get("error"), f"{operacja}: {wynik.get('error')}"
            biezace = wynik["snapshot"]

        assert (
            _bajty(pierwotne) == przed
        ), "seria wyposażenia pola zmutowała model pierwotny wołającego"
        assert len(biezace.get("measurements", [])) == 2
        assert len(biezace.get("protection_assignments", [])) == 1

    def test_wyposazenie_pola_z_bledem_nie_zostawia_polowicznej_migawki(self) -> None:
        """Krok pośredni serii pada → model wołającego bez ŻADNEGO elementu serii.

        To jest dokładnie stan połowiczny, który gwarancja B-3 usuwa: CT dopisane,
        przekaźnik nie. Predykat wejścia i wyjścia serii pochodzi z jednego źródła
        prawdy — z modelu wołającego, którego seria nie dotyka.
        """
        pierwotne = _siec_ze_stacja()
        przed = _bajty(pierwotne)

        biezace = pierwotne
        wynik_ct = execute_domain_operation(biezace, "add_ct", _payload_ct(biezace))
        assert not wynik_ct.get("error")
        biezace = wynik_ct["snapshot"]

        # Przekaźnik z nieistniejącym polem — krok serii pada.
        zly_payload = {**_payload_relay(biezace), "field_ref": "field/nie-ma-takiego"}
        wynik_relay = execute_domain_operation(biezace, "add_relay", zly_payload)
        assert wynik_relay.get("error")

        assert _bajty(pierwotne) == przed, "nieudany krok serii zostawił ślad w modelu pierwotnym"
        assert not pierwotne.get("measurements"), "CT z udanego kroku wyciekł do modelu pierwotnego"

    def test_pole_bez_ct_odrzucone_przed_dotknieciem_modelu(self) -> None:
        """Uczciwy stan zerowy: brak CT to BLOCKER, a nie cichy zapis bez CT."""
        snapshot = _siec_ze_stacja()
        przed = _bajty(snapshot)
        pole = _pole_sn_ref(snapshot)

        wynik = execute_domain_operation(
            snapshot, "add_relay", {"field_ref": pole, "catalog_ref": "ACME_REX100_v1"}
        )

        assert wynik.get("error")
        assert _bajty(snapshot) == przed


# ---------------------------------------------------------------------------
# Kontrakt WEWNĘTRZNY warstwy topologicznej
# ---------------------------------------------------------------------------


def _model_topologiczny() -> dict[str, Any]:
    """Minimalny model niosący po jednym elemencie KAŻDEGO rodzaju.

    Jeden model obsługuje wszystkie 14 funkcji mutujących modułu — dzięki temu
    parametryzacja niżej idzie po KLASIE operacji, a nie po wygodnych przykładach.
    """
    return {
        "header": {
            "enm_version": "1.0",
            "name": "kontrakt-topo",
            "revision": 1,
            "hash_sha256": "",
            "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
        },
        "buses": [
            {"ref_id": "bus_a", "name": "A", "voltage_kv": 15.0, "tags": [], "meta": {}},
            {"ref_id": "bus_b", "name": "B", "voltage_kv": 15.0, "tags": [], "meta": {}},
            {"ref_id": "bus_nn", "name": "nN", "voltage_kv": 0.4, "tags": [], "meta": {}},
            {"ref_id": "bus_wolna", "name": "Wolna", "voltage_kv": 15.0, "tags": [], "meta": {}},
            # Szyna BEZ ŻADNYCH powiązań — jedyna, którą `delete_node` może usunąć.
            {"ref_id": "bus_luzna", "name": "Luźna", "voltage_kv": 15.0, "tags": [], "meta": {}},
        ],
        "branches": [
            {
                "ref_id": "lin_1",
                "name": "L1",
                "type": "line_overhead",
                "from_bus_ref": "bus_a",
                "to_bus_ref": "bus_b",
                "status": "closed",
                "length_km": 1.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.35,
                "tags": [],
                "meta": {},
            },
            {
                "ref_id": "brk_1",
                "name": "W1",
                "type": "breaker",
                "from_bus_ref": "bus_a",
                "to_bus_ref": "bus_b",
                "status": "closed",
                "r_ohm": 0.0,
                "x_ohm": 0.0,
                "tags": [],
                "meta": {},
            },
            {
                "ref_id": "brk_2",
                "name": "W2",
                "type": "breaker",
                "from_bus_ref": "bus_b",
                "to_bus_ref": "bus_wolna",
                "status": "closed",
                "r_ohm": 0.0,
                "x_ohm": 0.0,
                "tags": [],
                "meta": {},
            },
        ],
        "transformers": [
            {
                "ref_id": "tr_1",
                "name": "TR1",
                "hv_bus_ref": "bus_b",
                "lv_bus_ref": "bus_nn",
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 6.0,
                "pk_kw": 6.5,
                "tags": [],
                "meta": {},
            }
        ],
        "sources": [
            {
                "ref_id": "src_1",
                "name": "GPZ",
                "bus_ref": "bus_a",
                "model": "short_circuit_power",
                "sk3_mva": 250.0,
                "tags": [],
                "meta": {},
            }
        ],
        "loads": [
            {
                "ref_id": "load_1",
                "name": "Odbiór",
                "bus_ref": "bus_nn",
                "p_mw": 0.1,
                "q_mvar": 0.03,
                "model": "pq",
                "tags": [],
                "meta": {},
            }
        ],
        "generators": [
            {
                "ref_id": "gen_1",
                "name": "PV",
                "bus_ref": "bus_nn",
                "p_mw": 0.05,
                "tags": [],
                "meta": {},
            }
        ],
        "measurements": [
            {
                "ref_id": "ct_1",
                "name": "CT1",
                "measurement_type": "CT",
                "bus_ref": "bus_a",
                "rating": {"ratio_primary": 400.0, "ratio_secondary": 5.0},
                "tags": [],
                "meta": {},
            },
            {
                "ref_id": "ct_2",
                "name": "CT2",
                "measurement_type": "CT",
                "bus_ref": "bus_b",
                "rating": {"ratio_primary": 200.0, "ratio_secondary": 5.0},
                "tags": [],
                "meta": {},
            },
        ],
        "protection_assignments": [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
    }


#: KLASA, NIE INSTANCJA — wszystkie 14 funkcji mutujących modułu, każda w wariancie
#: sukcesu i w wariancie BLOCKER. Lista jest ZAMKNIĘTA: test niżej porównuje ją ze
#: skanem modułu, więc nowa funkcja mutująca bez wpisu tutaj wywali tę klasę testów.
SUKCES: list[tuple[str, Callable[[dict], Any]]] = [
    ("create_node", lambda e: topology_ops.create_node(e, {"ref_id": "n", "voltage_kv": 15.0})),
    ("update_node", lambda e: topology_ops.update_node(e, {"ref_id": "bus_a", "name": "A2"})),
    ("delete_node", lambda e: topology_ops.delete_node(e, "bus_luzna")),
    (
        "create_branch",
        lambda e: topology_ops.create_branch(
            e,
            {
                "ref_id": "lin_2",
                "type": "line_overhead",
                "from_bus_ref": "bus_a",
                "to_bus_ref": "bus_b",
                "length_km": 1.0,
            },
        ),
    ),
    ("update_branch", lambda e: topology_ops.update_branch(e, {"ref_id": "lin_1", "name": "L2"})),
    ("delete_branch", lambda e: topology_ops.delete_branch(e, "lin_1")),
    (
        "create_device/transformer",
        lambda e: topology_ops.create_device(
            e,
            {
                "device_type": "transformer",
                "ref_id": "tr_2",
                "hv_bus_ref": "bus_a",
                "lv_bus_ref": "bus_nn",
                "sn_mva": 0.4,
                "uk_percent": 4.0,
            },
        ),
    ),
    (
        "create_device/load",
        lambda e: topology_ops.create_device(
            e, {"device_type": "load", "ref_id": "load_2", "bus_ref": "bus_nn", "p_mw": 0.02}
        ),
    ),
    (
        "create_device/generator",
        lambda e: topology_ops.create_device(
            e, {"device_type": "generator", "ref_id": "gen_2", "bus_ref": "bus_nn", "p_mw": 0.01}
        ),
    ),
    (
        "create_device/source",
        lambda e: topology_ops.create_device(
            e, {"device_type": "source", "ref_id": "src_2", "bus_ref": "bus_b", "sk3_mva": 100.0}
        ),
    ),
    (
        "update_device",
        lambda e: topology_ops.update_device(
            e, {"device_type": "load", "ref_id": "load_1", "p_mw": 0.2}
        ),
    ),
    ("delete_device", lambda e: topology_ops.delete_device(e, "generator", "gen_1")),
    (
        "create_measurement",
        lambda e: topology_ops.create_measurement(
            e,
            {
                "ref_id": "vt_1",
                "measurement_type": "VT",
                "bus_ref": "bus_a",
                "rating": {"ratio_primary": 15000.0, "ratio_secondary": 100.0},
            },
        ),
    ),
    ("delete_measurement", lambda e: topology_ops.delete_measurement(e, "ct_2")),
    (
        "attach_protection",
        lambda e: topology_ops.attach_protection(
            e,
            {
                "ref_id": "pa_2",
                "breaker_ref": "brk_2",
                "ct_ref": "ct_2",
                "device_type": "overcurrent",
            },
        ),
    ),
    (
        "update_protection",
        lambda e: topology_ops.update_protection(e, {"ref_id": "pa_1", "is_enabled": False}),
    ),
    ("detach_protection", lambda e: topology_ops.detach_protection(e, "pa_1")),
]

BLOKADA: list[tuple[str, Callable[[dict], Any]]] = [
    # napięcie <= 0
    ("create_node", lambda e: topology_ops.create_node(e, {"ref_id": "n", "voltage_kv": 0.0})),
    ("update_node", lambda e: topology_ops.update_node(e, {"ref_id": "nie-ma", "name": "X"})),
    # szyna z zależnościami
    ("delete_node", lambda e: topology_ops.delete_node(e, "bus_a")),
    (
        "create_branch",
        lambda e: topology_ops.create_branch(
            e,
            {
                "ref_id": "lin_x",
                "type": "line_overhead",
                "from_bus_ref": "nie-ma",
                "to_bus_ref": "bus_b",
                "length_km": 1.0,
            },
        ),
    ),
    ("update_branch", lambda e: topology_ops.update_branch(e, {"ref_id": "nie-ma", "name": "X"})),
    # wyłącznik z przypisanym zabezpieczeniem
    ("delete_branch", lambda e: topology_ops.delete_branch(e, "brk_1")),
    (
        "create_device/transformer",
        lambda e: topology_ops.create_device(
            e,
            {
                "device_type": "transformer",
                "ref_id": "tr_x",
                "hv_bus_ref": "nie-ma",
                "lv_bus_ref": "bus_nn",
                "sn_mva": 0.4,
                "uk_percent": 4.0,
            },
        ),
    ),
    (
        "create_device/load",
        lambda e: topology_ops.create_device(
            e, {"device_type": "load", "ref_id": "load_x", "bus_ref": "nie-ma", "p_mw": 0.02}
        ),
    ),
    (
        "create_device/generator",
        lambda e: topology_ops.create_device(
            e, {"device_type": "generator", "ref_id": "gen_x", "bus_ref": "nie-ma", "p_mw": 0.01}
        ),
    ),
    (
        "create_device/source",
        lambda e: topology_ops.create_device(
            e, {"device_type": "source", "ref_id": "src_x", "bus_ref": "nie-ma"}
        ),
    ),
    (
        "update_device",
        lambda e: topology_ops.update_device(
            e, {"device_type": "load", "ref_id": "nie-ma", "p_mw": 0.2}
        ),
    ),
    ("delete_device", lambda e: topology_ops.delete_device(e, "generator", "nie-ma")),
    (
        "create_measurement",
        lambda e: topology_ops.create_measurement(
            e,
            {
                "ref_id": "m_x",
                "measurement_type": "XX",
                "bus_ref": "bus_a",
                "rating": {"ratio_primary": 1.0, "ratio_secondary": 1.0},
            },
        ),
    ),
    # CT używany przez zabezpieczenie
    ("delete_measurement", lambda e: topology_ops.delete_measurement(e, "ct_1")),
    (
        "attach_protection",
        lambda e: topology_ops.attach_protection(
            e,
            {
                "ref_id": "pa_x",
                "breaker_ref": "nie-ma",
                "ct_ref": "ct_2",
                "device_type": "overcurrent",
            },
        ),
    ),
    (
        "update_protection",
        lambda e: topology_ops.update_protection(e, {"ref_id": "nie-ma", "is_enabled": False}),
    ),
    ("detach_protection", lambda e: topology_ops.detach_protection(e, "nie-ma")),
]


def _funkcje_mutujace_modulu() -> set[str]:
    """Nazwy funkcji `topology_ops`, które zapisują do modelu.

    Kryterium STRUKTURALNE, nie lista z głowy: funkcja mutuje, jeżeli w jej ciele
    występuje przypisanie do subskrypcji parametru `enm` albo wywołanie
    `enm.setdefault(...).append(...)`. Dzięki temu nowa operacja mutująca dopisana
    do modułu bez wpisu w tabelach wyżej wywala test kompletności.
    """
    zrodlo = Path(topology_ops.__file__).read_text(encoding="utf-8")
    drzewo = ast.parse(zrodlo)
    mutujace: set[str] = set()
    for wezel in drzewo.body:
        if not isinstance(wezel, ast.FunctionDef) or wezel.name.startswith("_"):
            continue
        for pod in ast.walk(wezel):
            zapis_do_subskrypcji = isinstance(pod, ast.Assign) and any(
                isinstance(cel, ast.Subscript)
                and isinstance(_korzen_nazwy(cel), ast.Name)
                and _korzen_nazwy(cel).id == "enm"  # type: ignore[union-attr]
                for cel in pod.targets
            )
            dopisanie = (
                isinstance(pod, ast.Call)
                and isinstance(pod.func, ast.Attribute)
                and pod.func.attr == "append"
                and isinstance(pod.func.value, ast.Call)
                and isinstance(pod.func.value.func, ast.Attribute)
                and pod.func.value.func.attr == "setdefault"
                and isinstance(pod.func.value.func.value, ast.Name)
                and pod.func.value.func.value.id == "enm"
            )
            if zapis_do_subskrypcji or dopisanie:
                mutujace.add(wezel.name)
                break
    return mutujace


def _korzen_nazwy(wezel: ast.AST) -> ast.AST:
    while isinstance(wezel, ast.Subscript):
        wezel = wezel.value
    return wezel


class TestKontraktMutacjiWMiejscu:
    """Kontrakt WEWNĘTRZNY `topology_ops` — każde zdanie docstringu ma tu asercję.

    Obietnica bez testu jest groźniejsza niż sam defekt, bo wyłącza czujność.
    Docstring modułu deklaruje cztery rzeczy: mutację w miejscu, tożsamość
    zwróconego obiektu, brak skutku na ścieżce błędu i ZERO głębokich kopii w tej
    warstwie. Poniżej stoi po jednej asercji na każdą z nich, po całej KLASIE
    funkcji mutujących — nie po przykładzie.
    """

    @pytest.mark.parametrize(("nazwa", "operacja"), SUKCES, ids=[p[0] for p in SUKCES])
    def test_sukces_zwraca_ten_sam_obiekt(self, nazwa: str, operacja: Callable) -> None:
        model = _model_topologiczny()
        wynik = operacja(model)
        assert wynik.success, f"{nazwa}: oczekiwano sukcesu, są {wynik.issues}"
        assert wynik.enm is model, f"{nazwa}: wynik nie jest TYM SAMYM obiektem co wejście"

    @pytest.mark.parametrize(("nazwa", "operacja"), BLOKADA, ids=[p[0] for p in BLOKADA])
    def test_blokada_nie_zostawia_skutku(self, nazwa: str, operacja: Callable) -> None:
        model = _model_topologiczny()
        przed = _bajty(model)

        wynik = operacja(model)

        assert not wynik.success, f"{nazwa}: oczekiwano BLOCKER-a, operacja się powiodła"
        assert any(u.severity == "BLOCKER" for u in wynik.issues), f"{nazwa}: brak problemu BLOCKER"
        assert wynik.enm is model, f"{nazwa}: ścieżka błędu nie oddała modelu wejściowego"
        assert _bajty(model) == przed, f"{nazwa}: ścieżka błędu zmieniła model"

    def test_warstwa_topologiczna_nie_wykonuje_glebokich_kopii(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """INIEKCJA-WYKRYWACZ, deterministyczny (liczba kopii), a nie czasowy.

        Sonda podmienia `copy.deepcopy` i przypisuje każde wywołanie modułowi
        wołającego (ramka stosu). Przywrócenie kopii W JEDNYM MIEJSCU `topology_ops`
        podnosi licznik z 0 i wywala ten test — bez mierzenia czasu, więc bez
        zależności od maszyny. Kontrola dodatnia (`licznik_calkowity > 0`) pilnuje,
        żeby zielony wynik nie brał się z niedziałającej sondy.
        """
        licznik: dict[str, int] = {}
        prawdziwy = copy.deepcopy

        def sonda(obiekt: Any, memo: Any = None, _nil: Any = []) -> Any:  # noqa: B006
            modul = sys._getframe(1).f_globals.get("__name__", "?")
            licznik[modul] = licznik.get(modul, 0) + 1
            return prawdziwy(obiekt) if memo is None else prawdziwy(obiekt, memo)

        monkeypatch.setattr(copy, "deepcopy", sonda)

        snapshot = _siec_ze_stacja()
        for operacja, buduj_payload in (
            ("add_ct", _payload_ct),
            ("add_vt", _payload_vt),
            ("add_relay", _payload_relay),
        ):
            wynik = execute_domain_operation(snapshot, operacja, buduj_payload(snapshot))
            assert not wynik.get("error"), f"{operacja}: {wynik.get('error')}"
            snapshot = wynik["snapshot"]

        assert sum(licznik.values()) > 0, "sonda nie zarejestrowała ŻADNEJ kopii — nie działa"
        assert licznik.get(topology_ops.__name__, 0) == 0, (
            f"warstwa topologiczna wykonała {licznik.get(topology_ops.__name__)} głębokich kopii "
            "— kopiowanie należy do granicy operacji domenowej"
        )

    def test_modul_nie_zawiera_ani_jednej_glebokiej_kopii(self) -> None:
        """Zamknięcie tylnych drzwi sondy: `from copy import deepcopy` też jest zakazane.

        Sonda z testu wyżej widzi wyłącznie wywołania przez atrybut modułu `copy`.
        Skan źródła łapie KAŻDĄ pisownię — to ten sam skan, który wykrywa iniekcję.
        """
        zrodlo = Path(topology_ops.__file__).read_text(encoding="utf-8")
        drzewo = ast.parse(zrodlo)
        kopie = [
            wezel.lineno
            for wezel in ast.walk(drzewo)
            if isinstance(wezel, ast.Call)
            and (
                (isinstance(wezel.func, ast.Attribute) and wezel.func.attr == "deepcopy")
                or (isinstance(wezel.func, ast.Name) and wezel.func.id == "deepcopy")
            )
        ]
        assert not kopie, f"topology_ops wykonuje głębokie kopie w liniach: {kopie}"

    def test_tabele_pokrywaja_kazda_funkcje_mutujaca_modulu(self) -> None:
        """LISTA ZAMKNIĘTA — deklaracja przypięta testem, nie komentarzem.

        Nowa funkcja mutująca dopisana do `topology_ops` bez wpisu w SUKCES/BLOKADA
        oznacza operację, której kontraktu mutacji w miejscu NIKT nie sprawdza.
        """
        z_tabeli_sukcesu = {nazwa.split("/")[0] for nazwa, _ in SUKCES}
        z_tabeli_blokad = {nazwa.split("/")[0] for nazwa, _ in BLOKADA}
        w_module = _funkcje_mutujace_modulu()

        assert (
            w_module - z_tabeli_sukcesu == set()
        ), f"funkcje mutujące bez przypadku sukcesu: {sorted(w_module - z_tabeli_sukcesu)}"
        assert (
            w_module - z_tabeli_blokad == set()
        ), f"funkcje mutujące bez przypadku BLOCKER: {sorted(w_module - z_tabeli_blokad)}"
        assert (
            len(w_module) == 14
        ), f"moduł ma {len(w_module)} funkcji mutujących, audyt naliczył 14: {sorted(w_module)}"


class TestDyspozytorApiPodMutacjaWMiejscu:
    """Kategoria K4 audytu — JEDYNY wołający produkcyjny bez własnej kopii granicznej.

    Dyspozytor `/enm/ops` i `/enm/ops/batch` podaje warstwie topologicznej zrzut
    modelu (`model_dump`), a nie sam model — struktura odczepiona, więc mutacja
    w miejscu nie sięga magazynu. Ta własność jest FUNDAMENTEM klasyfikacji K4 jako
    BEZPIECZNEJ, więc nie może zostać założeniem: sprawdzamy ją zachowaniem,
    na obu końcówkach i na obu wynikach serii.

    Wycofanie serii jest tu istotne podwójnie. Po zmianie kontraktu operacje udane
    z początku serii mutują zrzut PRZED błędem kolejnej — i właśnie dlatego trzeba
    pokazać, że wycofanie nie polega na nietkniętości tego zrzutu, tylko na tym,
    że do magazynu nie idzie NIC.
    """

    @staticmethod
    def _model_z_dwiema_szynami(case_id: str) -> Any:
        from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
        from enm.store import set_enm

        model = EnergyNetworkModel(
            header=ENMHeader(name="k4", defaults=ENMDefaults(sn_nominal_kv=15.0))
        )
        return set_enm(case_id, model)

    def test_operacja_pojedyncza_nie_dotyka_modelu_w_magazynie_przed_zapisem(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
        from api.enm import _OP_DISPATCH, TopologyOpRequest, _topology_ops_pod_blokada
        from enm.store import get_enm, reset_enm_store

        reset_enm_store()
        try:
            self._model_z_dwiema_szynami("k4-pojedyncza")
            przed = get_enm("k4-pojedyncza").model_dump(mode="json")
            przed_bajty = _bajty(przed)

            zadanie = TopologyOpRequest(
                op="create_node",
                data={"ref_id": "bus_k4", "name": "K4", "voltage_kv": 15.0},
            )
            odp = _topology_ops_pod_blokada("k4-pojedyncza", zadanie, _OP_DISPATCH[zadanie.op])

            assert odp["success"] is True
            # Model sprzed operacji (osobny zrzut) NIE mógł się zmienić — a model
            # w magazynie ma dokładnie jedną nową szynę, bo zapis był jawny.
            assert _bajty(przed) == przed_bajty
            po = get_enm("k4-pojedyncza").model_dump(mode="json")
            assert [b["ref_id"] for b in po["buses"]] == ["bus_k4"]
        finally:
            reset_enm_store()

    def test_seria_z_bledem_nie_zapisuje_zadnej_z_udanych_operacji(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
        from api.enm import (
            BatchOpsRequest,
            TopologyOpRequest,
            _topology_ops_batch_pod_blokada,
        )
        from enm.store import get_enm, reset_enm_store

        reset_enm_store()
        try:
            zapisany = self._model_z_dwiema_szynami("k4-seria")
            rewizja_przed = zapisany.header.revision

            zadanie = BatchOpsRequest(
                operations=[
                    TopologyOpRequest(
                        op="create_node",
                        data={"ref_id": "bus_ok", "name": "OK", "voltage_kv": 15.0},
                    ),
                    # BLOCKER: napięcie <= 0 — seria pada na drugim kroku.
                    TopologyOpRequest(
                        op="create_node",
                        data={"ref_id": "bus_zly", "name": "Zły", "voltage_kv": 0.0},
                    ),
                ]
            )
            odp = _topology_ops_batch_pod_blokada("k4-seria", zadanie)

            assert odp["success"] is False
            assert odp["revision"] == rewizja_przed
            po = get_enm("k4-seria").model_dump(mode="json")
            assert po["buses"] == [], "udany krok serii trafił do magazynu mimo wycofania"
        finally:
            reset_enm_store()
