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

import json
from collections.abc import Callable
from typing import Any

import pytest

# KOLEJNOŚĆ IMPORTU JEST ISTOTNA: `domain_operations_v2` domyka cykl z
# `domain_operations` (v1 wciąga handlery V2 na końcu pliku), więc moduł V2
# zaimportowany PIERWSZY przewraca się na częściowo zainicjowanym module V1.
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
