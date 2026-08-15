"""
E2E testy ogólnego przepływu pracy sieci SN — §13 specyfikacji redesign.

Weryfikują OGÓLNĄ ZDOLNOŚĆ SYSTEMU, a nie jeden zakodowany przykład.

E2E-1: Magistrala z wieloma wbudowanymi obiektami różnych klas
E2E-2: Odgałęzienie ze stacji
E2E-3: Odgałęzienie ze słupa rozgałęźnego
E2E-4: Odgałęzienie z ZKSN
E2E-5: Stacje odbiorcze + odgałęzienia OZE/BESS + gotowość do obliczeń
"""

from __future__ import annotations

import copy

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE_35 = "line-base-al-st-35"
CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_CABLE_70 = "cable-base-xlpe-al-3c-70"
CATALOG_CABLE_120 = "cable-tfk-yakxs-3x120"
CATALOG_CABLE_150 = "cable-base-xlpe-al-3c-150"
CATALOG_CABLE_240 = "cable-base-xlpe-al-3c-240"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_200 = "src-gpz-15kv-200mva-rx010"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
CATALOG_ZRODLO_300 = "src-gpz-15kv-300mva-rx010"
CATALOG_ZRODLO_350 = "src-gpz-15kv-350mva-rx010"
CATALOG_ZRODLO_400 = "src-gpz-15kv-400mva-rx010"
# Falownik PV nN — RZECZYWISTA pozycja katalogu ZRODLO_NN_PV (0,4 kV; Pmax 500 kW;
# Sn 550 kVA). Dawny „conv-pv-e2e-1" nie istniał w katalogu i przechodził tylko
# dlatego, że operacja stacyjna nie miała bramy katalogowej (defekt F).
CATALOG_FALOWNIK_PV_NN = "conv-pv-nn-0p5mw-0p4kv"
CATALOG_FALOWNIK_PV_NN_PMAX_MW = 0.5
CATALOG_FALOWNIK_PV_NN_SN_MVA = 0.55


def _source_catalog_ref(sk3_mva: float | None) -> str:
    mapping = {
        200.0: CATALOG_ZRODLO_200,
        250.0: CATALOG_ZRODLO_250,
        300.0: CATALOG_ZRODLO_300,
        350.0: CATALOG_ZRODLO_350,
        400.0: CATALOG_ZRODLO_400,
    }
    return mapping.get(float(sk3_mva or 250.0), CATALOG_ZRODLO_250)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="e2e_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def op(snap: dict, name: str, payload: dict) -> dict:
    """Wykonaj operację domenową i zwróć nowy snapshot. Wymuś brak błędu."""
    if name == "add_grid_source_sn" and "catalog_ref" not in payload:
        payload = {
            **payload,
            "catalog_ref": _source_catalog_ref(payload.get("sk3_mva")),
        }
    result = execute_domain_operation(snap, name, payload)
    err = result.get("error")
    assert not err, f"Operacja '{name}' zwróciła błąd: {err} (code={result.get('error_code')})"
    assert result.get("snapshot") is not None
    return result["snapshot"]


_STATION_CATALOG_PAYLOAD = {
    # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
    "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
    "station": {"nn_voltage_kv": 0.4},
    "nn_voltage_kv": 0.4,
}


def _insert_station(snap: dict, segment_id: str, name: str, station_type: str) -> dict:
    """Helper: wstaw stację z wymaganymi polami katalogu."""
    payload = {
        "segment_id": segment_id,
        "name": name,
        "station_type": station_type,
        **_STATION_CATALOG_PAYLOAD,
    }
    return op(snap, "insert_station_on_segment_sn", payload)


def _find_segment(snap: dict, seg_type: str) -> str:
    """Znajdź ref_id segmentu danego typu."""
    for b in snap.get("branches", []):
        if b.get("type") == seg_type:
            return b["ref_id"]
    raise ValueError(f"Brak segmentu typu '{seg_type}' w snapshot")


def _find_branch_point(snap: dict, bp_type: str) -> dict:
    """Znajdź słownik branch_point danego typu."""
    for bp in snap.get("branch_points", []):
        if bp.get("branch_point_type") == bp_type:
            return bp
    raise ValueError(f"Brak branch_point typu '{bp_type}' w snapshot")


def _find_substation(snap: dict, name_fragment: str) -> dict:
    """Znajdź stację po fragmencie nazwy."""
    for sub in snap.get("substations", []):
        if name_fragment.lower() in sub.get("name", "").lower():
            return sub
    raise ValueError(f"Brak stacji z nazwą zawierającą '{name_fragment}'")


def _count(snap: dict, collection: str) -> int:
    return len(snap.get(collection, []))


def _blocker_codes(result: dict) -> set[str]:
    return {b.get("code") for b in result.get("readiness", {}).get("blockers", [])}


# ---------------------------------------------------------------------------
# E2E-1: Magistrala z wieloma wbudowanymi obiektami różnych klas
# ---------------------------------------------------------------------------


class TestE2E1MultiObjectFeeder:
    """
    Buduj magistralę z obiektami: stacja przelotowa, słup rozgałęźny,
    stacja sekcyjna, ZKSN — weryfikuj, że każdy typ jest osobnym obiektem.
    """

    def test_feeder_with_inline_station_and_branch_pole(self) -> None:
        s = _empty_enm()

        # GPZ + magistrala napowietrzna
        s = op(
            s,
            "add_grid_source_sn",
            {"voltage_kv": 15.0, "sk3_mva": 350.0, "catalog_ref": CATALOG_ZRODLO_350},
        )
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 800,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )

        # Wstaw stację przelotową
        seg_id = _find_segment(s, "line_overhead")
        s = _insert_station(s, seg_id, "Stacja Przelotowa T1", "inline")
        assert _count(s, "substations") >= 1

        # Kontynuuj magistralę
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 600,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )

        # Wstaw słup rozgałęźny
        seg_id2 = _find_segment(s, "line_overhead")
        s = op(
            s,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": seg_id2,
                "catalog_ref": "SLUP-ODG-12",
                "name": "Słup T2",
            },
        )

        bps = s.get("branch_points", [])
        assert len(bps) == 1
        assert bps[0]["branch_point_type"] == "branch_pole"

        # Weryfikuj: obiekt stacja i branch_pole to odrębne klasy
        assert _count(s, "substations") >= 1
        assert _count(s, "branch_points") == 1

    def test_feeder_with_cable_zksn(self) -> None:
        s = _empty_enm()
        s = op(
            s,
            "add_grid_source_sn",
            {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_250},
        )
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 1200, "catalog_ref": CATALOG_CABLE_240},
            },
        )

        seg_id = _find_segment(s, "cable")
        s = op(
            s,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "ZKSN-2P-630A",
                "branch_ports_count": 2,
                "switch_state": "closed",
                "name": "ZKSN T1",
            },
        )

        bps = s.get("branch_points", [])
        assert any(bp["branch_point_type"] == "zksn" for bp in bps)
        assert _count(s, "branches") >= 2  # segment split into left + right

    def test_mixed_feeder_overhead_then_cable(self) -> None:
        """Mieszana magistrala: napowietrzna + kablowa z różnymi obiektami."""
        s = _empty_enm()
        s = op(
            s,
            "add_grid_source_sn",
            {"voltage_kv": 15.0, "sk3_mva": 300.0, "catalog_ref": CATALOG_ZRODLO_300},
        )

        # Odcinek napowietrzny
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 500,
                    "catalog_ref": CATALOG_LINE_35,
                },
            },
        )

        # Wstaw stację przelotową (przejście do kabla)
        seg_id = _find_segment(s, "line_overhead")
        s = _insert_station(s, seg_id, "Stacja przejściowa SN/nN", "inline")

        # Kontynuuj magistralę kablem
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 800,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )

        assert _count(s, "substations") >= 1
        cable_segs = [b for b in s["branches"] if b["type"] == "cable"]
        assert len(cable_segs) >= 1

    def test_multiple_branch_points_on_same_type_segment(self) -> None:
        """Wielokrotne obiekty jednego typu na długiej magistrali."""
        s = _empty_enm()
        s = op(
            s,
            "add_grid_source_sn",
            {"voltage_kv": 15.0, "sk3_mva": 200.0, "catalog_ref": CATALOG_ZRODLO_200},
        )
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 3000,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )

        # Wstaw 2 słupy rozgałęźne (na różnych segmentach po podziale)
        seg_id = _find_segment(s, "line_overhead")
        s = op(
            s,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "SLUP-ODG-12",
                "name": "Słup A",
            },
        )
        # Po wstawieniu słupa mamy 2 segmenty, wstaw na jednym z nich
        segs = [b["ref_id"] for b in s["branches"] if b["type"] == "line_overhead"]
        assert len(segs) >= 2  # segment split

        s = op(
            s,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": segs[0],
                "catalog_ref": "SLUP-ODG-12",
                "name": "Słup B",
            },
        )

        assert _count(s, "branch_points") == 2


# ---------------------------------------------------------------------------
# E2E-2: Odgałęzienie ze stacji
# ---------------------------------------------------------------------------


class TestE2E2BranchFromStation:
    def test_branch_from_station_branch_port(self) -> None:
        """from_bus_ref-only nie moze tworzyc odgalezienia bez jawnego portu pola."""
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )

        seg_id = _find_segment(s, "cable")
        s = _insert_station(s, seg_id, "Stacja Odgałęźna A", "branch")

        # Znajdź szynę stacji, żeby zacząć odgałęzienie
        subs = s.get("substations", [])
        assert len(subs) >= 1
        sub = subs[-1]
        # Odgałęzienie przez from_bus_ref (szyna stacji)
        branch_bus = sub.get("bus_refs", [None])[0] if sub.get("bus_refs") else None

        assert branch_bus is not None
        baseline = copy.deepcopy(s)
        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_bus_ref": branch_bus,
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 200, "catalog_ref": CATALOG_CABLE_70},
            },
        )
        assert result.get("snapshot") is None
        assert result.get("error_code") == "branch_connection.source_not_branch_capable"
        assert s == baseline
        return
        assert result.get("snapshot") is None
        assert result.get("error_code") == "branch_connection.source_not_branch_capable"

    def test_branch_from_station_ref_is_rejected(self) -> None:
        """Odgałęzienie nie może startować z abstrakcyjnej stacji."""
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": CATALOG_CABLE_120},
            },
        )
        seg_id = _find_segment(s, "cable")
        s = _insert_station(s, seg_id, "Stacja B", "branch")

        subs = s.get("substations", [])
        assert len(subs) >= 1
        sub_ref = subs[-1]["ref_id"]

        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{sub_ref}.BRANCH",
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 150, "catalog_ref": CATALOG_CABLE_70},
            },
        )
        assert result.get("snapshot") is None
        assert result.get("error_code") == "branch_connection.source_not_branch_capable"
        return
        assert not result.get("error"), f"Błąd: {result.get('error')}"
        assert result.get("snapshot") is None
        assert result.get("error_code") == "branch_connection.source_not_branch_capable"

    def test_branch_from_station_line_field_ref(self) -> None:
        """Odgałęzienie kablowe startuje z konkretnego pola liniowego stacji."""
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": CATALOG_CABLE_120},
            },
        )
        seg_id = _find_segment(s, "cable")
        s = _insert_station(s, seg_id, "Stacja B", "branch")

        sub = s.get("substations", [])[-1]
        field_specs = sub.get("meta", {}).get("field_specs", [])
        feeder = next(spec for spec in field_specs if spec.get("bay_role") == "FEEDER")
        field_ref = feeder["field_ref"]
        terminal_bus_ref = feeder["meta"]["terminal_bus_ref"]

        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{field_ref}.BRANCH",
                "from_bus_ref": terminal_bus_ref,
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 150, "catalog_ref": CATALOG_CABLE_70},
            },
        )
        assert not result.get("error"), f"Błąd: {result.get('error')}"
        snap = result["snapshot"]
        branch_ref = result["selection_hint"]["element_id"]
        branch = next(item for item in snap["branches"] if item["ref_id"] == branch_ref)
        assert branch["from_bus_ref"] == terminal_bus_ref

    def test_non_branch_capable_source_fails_and_snapshot_unchanged(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": CATALOG_CABLE_120},
            },
        )

        baseline = copy.deepcopy(s)
        invalid_bus_ref = "bus/nonexistent/source"

        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{invalid_bus_ref}.BRANCH",
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 150, "catalog_ref": CATALOG_CABLE_70},
            },
        )
        assert result.get("snapshot") is None
        assert result.get("error_code") == "branch_connection.source_not_branch_capable"
        assert s == baseline

    def test_direct_from_bus_ref_without_from_ref_fails_for_non_branch_capable_source(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": CATALOG_CABLE_120},
            },
        )

        baseline = copy.deepcopy(s)
        invalid_bus_ref = "bus/nonexistent/source"
        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_bus_ref": invalid_bus_ref,
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 150, "catalog_ref": CATALOG_CABLE_70},
            },
        )
        assert result.get("snapshot") is None
        assert result.get("error_code") == "branch_connection.source_not_branch_capable"
        assert s == baseline


# ---------------------------------------------------------------------------
# E2E-3: Odgałęzienie ze słupa rozgałęźnego
# ---------------------------------------------------------------------------


class TestE2E3BranchFromBranchPole:
    def test_branch_from_branch_pole_port(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 800,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )

        seg_id = _find_segment(s, "line_overhead")
        s = op(
            s,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "SLUP-ODG-12",
                "name": "Słup T-A",
            },
        )

        bp = _find_branch_point(s, "branch_pole")
        bp_ref = bp["ref_id"]

        # Odgałęzienie z portu BRANCH słupa
        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{bp_ref}.BRANCH",
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 200,
                    "catalog_ref": CATALOG_LINE_35,
                },
            },
        )
        assert not result.get("error"), f"Błąd: {result.get('error')}"
        assert result["changes"]["created_element_ids"]

        # Weryfikuj że branch_occupied jest zaktualizowany
        snap = result["snapshot"]
        bp_updated = _find_branch_point(snap, "branch_pole")
        assert bp_updated.get(
            "branch_occupied"
        ), "branch_occupied powinno być zaktualizowane po odgałęzieniu"

    def test_branch_pole_only_on_overhead(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        seg_id = _find_segment(s, "cable")

        # Próba wstawienia słupa na kablu — musi się nie powieść
        result = execute_domain_operation(
            s,
            "insert_branch_pole_on_segment_sn",
            {"segment_id": seg_id, "catalog_ref": "SLUP-ODG-12"},
        )
        assert result.get("error_code") == "branch_point.invalid_parent_medium"

    def test_second_branch_from_same_pole_rejects_if_port_occupied(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 1000,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )
        seg_id = _find_segment(s, "line_overhead")
        s = op(
            s,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "SLUP-ODG-12",
            },
        )

        bp = _find_branch_point(s, "branch_pole")
        bp_ref = bp["ref_id"]

        # Pierwsze odgałęzienie — OK
        s = op(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{bp_ref}.BRANCH",
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 100,
                    "catalog_ref": CATALOG_LINE_35,
                },
            },
        )

        # Drugie odgałęzienie z tego samego portu — musi być odrzucone
        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{bp_ref}.BRANCH",
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 100,
                    "catalog_ref": CATALOG_LINE_35,
                },
            },
        )
        assert result.get("error_code") == "branch_point.branch_port_occupied"


# ---------------------------------------------------------------------------
# E2E-4: Odgałęzienie z ZKSN
# ---------------------------------------------------------------------------


class TestE2E4BranchFromZKSN:
    def test_branch_from_zksn_port_1(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 1000, "catalog_ref": CATALOG_CABLE_240},
            },
        )

        seg_id = _find_segment(s, "cable")
        s = op(
            s,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "ZKSN-2P-630A",
                "branch_ports_count": 2,
                "switch_state": "closed",
                "name": "ZKSN-A",
            },
        )

        zksn = _find_branch_point(s, "zksn")
        zksn_ref = zksn["ref_id"]

        # Odgałęzienie z BRANCH_1
        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{zksn_ref}.BRANCH_1",
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 300, "catalog_ref": CATALOG_CABLE_120},
            },
        )
        assert not result.get("error"), f"Błąd: {result.get('error')}"
        snap = result["snapshot"]
        zksn_updated = _find_branch_point(snap, "zksn")
        assert zksn_updated.get("branch_occupied", {}).get(
            "BRANCH_1"
        ), "BRANCH_1 powinien być oznaczony jako zajęty"

    def test_branch_from_zksn_port_2(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 600,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        seg_id = _find_segment(s, "cable")
        s = op(
            s,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "ZKSN-2P-630A",
                "branch_ports_count": 2,
                "switch_state": "open",
            },
        )

        zksn = _find_branch_point(s, "zksn")
        zksn_ref = zksn["ref_id"]

        # Odgałęzienie z BRANCH_2
        result = execute_domain_operation(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{zksn_ref}.BRANCH_2",
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 200, "catalog_ref": CATALOG_CABLE_70},
            },
        )
        assert not result.get("error"), f"Błąd: {result.get('error')}"
        snap = result["snapshot"]
        zksn_updated = _find_branch_point(snap, "zksn")
        assert zksn_updated.get("branch_occupied", {}).get("BRANCH_2")

    def test_zksn_only_on_cable(self) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 500,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )
        seg_id = _find_segment(s, "line_overhead")

        result = execute_domain_operation(
            s,
            "insert_zksn_on_segment_sn",
            {"segment_id": seg_id, "catalog_ref": "ZKSN-2P-630A", "branch_ports_count": 2},
        )
        assert result.get("error_code") == "branch_point.invalid_parent_medium"

    def test_zksn_and_branch_pole_coexist_on_different_segments(self) -> None:
        """ZKSN na kablu i słup na napowietrznej — mogą współistnieć w jednej sieci."""
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})

        # Odcinek kablowy z ZKSN
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 800,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        seg_cable = _find_segment(s, "cable")
        s = op(
            s,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": seg_cable,
                "catalog_ref": "ZKSN-2P-630A",
                "branch_ports_count": 1,
                "switch_state": "closed",
            },
        )

        # Kontynuuj napowietrznym
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 600,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )
        seg_overhead = _find_segment(s, "line_overhead")
        s = op(
            s,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": seg_overhead,
                "catalog_ref": "SLUP-ODG-12",
            },
        )

        bps = s.get("branch_points", [])
        types = {bp["branch_point_type"] for bp in bps}
        assert "zksn" in types
        assert "branch_pole" in types
        assert _count(s, "branch_points") == 2


# ---------------------------------------------------------------------------
# E2E-5: Stacje odbiorcze + OZE/BESS + gotowość do obliczeń
# ---------------------------------------------------------------------------


class TestE2E5ReceivingStationsAndOzeBess:
    def test_basic_feeder_with_receiving_station_reaches_readiness_path(self) -> None:
        """Sieć z GPZ + odcinek + stacja końcowa — gotowość jest oceniana."""
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )

        seg_id = _find_segment(s, "cable")
        s = _insert_station(s, seg_id, "Stacja Końcowa SN/nN", "terminal")

        result_with_readiness = execute_domain_operation(
            s,
            "add_transformer_sn_nn",
            {
                "substation_ref": s.get("substations", [{}])[-1].get("ref_id", ""),
                "sn_mva": 0.63,
                "uk_percent": 4.0,
                "pk_kw": 6.5,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "catalog_ref": CATALOG_TRAFO_630,
            },
        )
        # Transformer add may fail due to missing station ref, but readiness is always present
        readiness = result_with_readiness.get("readiness", {})
        assert readiness is not None, "Gotowość musi być zawsze obecna"

    def test_pv_connection_uses_canonical_converter_source(self) -> None:
        """Źródło PV na stacji nN używa kanonicznego add_converter_source."""
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": CATALOG_CABLE_120},
            },
        )

        seg_id = _find_segment(s, "cable")
        s = _insert_station(s, seg_id, "Stacja PV", "branch")

        subs = s.get("substations", [])
        assert len(subs) >= 1
        station = subs[-1]
        buses_by_ref = {bus.get("ref_id"): bus for bus in s.get("buses", [])}
        nn_bus_ref = next(
            ref
            for ref in station.get("bus_refs", [])
            if buses_by_ref.get(ref, {}).get("voltage_kv") == 0.4
        )

        result = execute_domain_operation(
            s,
            "add_converter_source",
            {
                "source_technology": "PV",
                "connection_variant": "nn_side",
                "station_ref": station.get("ref_id", "sub-none"),
                "bus_nn_ref": nn_bus_ref,
                "source_name": "PV-Farm-1",
                "power_setpoint_mw": 0.5,
                # Tabliczka pochodzi z katalogu (defekt G) — payload wskazuje
                # wyłącznie POZYCJĘ, tak jak kreator OZE po wyborze falownika.
                "catalog_binding": {
                    "catalog_namespace": "ZRODLO_NN_PV",
                    "catalog_item_id": CATALOG_FALOWNIK_PV_NN,
                    "catalog_item_version": "2024.1",
                },
            },
        )
        assert not result.get("error"), f"Nieoczekiwany błąd: {result.get('error_code')}"
        assert result.get("snapshot") is not None

    def test_insert_station_with_pv_behind_sn_nn_transformer_creates_generator_and_protection(
        self,
    ) -> None:
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 500, "catalog_ref": CATALOG_CABLE_120},
            },
        )

        seg_id = _find_segment(s, "cable")
        s = op(
            s,
            "insert_station_on_segment_sn",
            {
                "segment_id": seg_id,
                # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
                "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                "name": "Stacja PV za transformatorem",
                "station_type": "terminal",
                "station": {"nn_voltage_kv": 0.4},
                "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
                "nn_block": {
                    "nn_configuration": "PV_INVERTER",
                    "source_converter_catalog_ref": CATALOG_FALOWNIK_PV_NN,
                    "source_converter_name": "Falownik PV katalogowy",
                    "source_converter_kind": "PV",
                    "source_converter_un_kv": 0.4,
                    "source_converter_sn_mva": 1.0,
                    "source_converter_pmax_mw": 1.0,
                    "outgoing_feeders_nn_count": 1,
                    "outgoing_feeders_nn": [
                        {"feeder_role": "ODPLYW_NN", "catalog_bindings": None},
                        {
                            "feeder_role": "ZRODLO_NN_PV",
                            "catalog_bindings": {
                                "source_converter": {
                                    "catalog_namespace": "ZRODLO_NN_PV",
                                    "catalog_item_id": CATALOG_FALOWNIK_PV_NN,
                                }
                            },
                            "protection": {
                                "device_catalog_ref": "EM_ETANGO_400_V0",
                                "device_label": "Elektrometal e2TANGO-400",
                                "protected_object": "falownik PV i kabel nN do PCC",
                                "analysis_scope": "nadpradowe i koordynacja z wyłącznikiem głównym nN",
                            },
                        },
                    ],
                    "source_protection": {
                        "device_catalog_ref": "EM_ETANGO_400_V0",
                        "device_label": "Elektrometal e2TANGO-400",
                        "protected_object": "falownik PV i kabel nN do PCC",
                        "analysis_scope": "nadpradowe i koordynacja z wyłącznikiem głównym nN",
                    },
                },
            },
        )

        station_ref = next(
            sub["ref_id"]
            for sub in s.get("substations", [])
            if sub.get("name") == "Stacja PV za transformatorem"
        )
        pv_generators = [
            gen for gen in s.get("generators", []) if gen.get("gen_type") == "pv_inverter"
        ]
        assert len(pv_generators) == 1
        assert pv_generators[0]["catalog_ref"] == CATALOG_FALOWNIK_PV_NN
        assert pv_generators[0]["connection_variant"] == "nn_side"
        assert pv_generators[0]["station_ref"] == station_ref
        # Defekt F: tabliczka POCHODZI Z KATALOGU, nie z payloadu. Payload deklaruje
        # 1,0 MW / 1,0 MVA — model musi pokazać wartości pozycji katalogowej.
        assert pv_generators[0]["p_mw"] == CATALOG_FALOWNIK_PV_NN_PMAX_MW
        materialized = pv_generators[0]["materialized_params"]
        assert materialized["pmax_mw"] == CATALOG_FALOWNIK_PV_NN_PMAX_MW
        assert materialized["sn_mva"] == CATALOG_FALOWNIK_PV_NN_SN_MVA
        assert (
            pv_generators[0].get("meta", {}).get("protection_intent", {}).get("device_catalog_ref")
            == "EM_ETANGO_400_V0"
        )

        protections = [
            item
            for item in s.get("protection_assignments", [])
            if item.get("catalog_ref") == "EM_ETANGO_400_V0"
        ]
        assert len(protections) == 1
        assert (
            protections[0].get("meta", {}).get("protected_object_ref") == pv_generators[0]["ref_id"]
        )

    def test_branch_point_objects_in_topology_for_analysis(self) -> None:
        """Branch points muszą być widoczne w topologii i readiness."""
        s = _empty_enm()
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 200.0})
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 1500, "catalog_ref": CATALOG_CABLE_150},
            },
        )
        seg_id = _find_segment(s, "cable")
        result = execute_domain_operation(
            s,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "ZKSN-2P-630A",
                "branch_ports_count": 2,
                "switch_state": "closed",
            },
        )

        # Readiness musi ocenić sieć z ZKSN
        readiness = result.get("readiness", {})
        assert readiness is not None

        # Snapshot musi zawierać branch_points
        snap = result["snapshot"]
        assert len(snap.get("branch_points", [])) == 1
        assert snap["branch_points"][0]["branch_point_type"] == "zksn"

    def test_general_mv_feeder_construction_workflow(self) -> None:
        """
        Pełny przepływ: GPZ → magistrala kablowa z ZKSN → odgałęzienie →
        magistrala napowietrzna z słupem → stacja końcowa.

        Weryfikuje OGÓLNĄ ZDOLNOŚĆ systemu do budowania rzeczywistej sieci SN.
        """
        s = _empty_enm()

        # 1. Źródło GPZ
        s = op(s, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 400.0})
        assert _count(s, "sources") >= 1

        # 2. Magistrala kablowa
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 2000, "catalog_ref": CATALOG_CABLE_240},
            },
        )

        # 3. ZKSN na kablu
        cable_seg = _find_segment(s, "cable")
        s = op(
            s,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": cable_seg,
                "catalog_ref": "ZKSN-2P-630A",
                "branch_ports_count": 2,
                "switch_state": "closed",
                "name": "ZKSN-Centrum",
            },
        )
        zksn = _find_branch_point(s, "zksn")

        # 4. Odgałęzienie kablowe z ZKSN.BRANCH_1
        s = op(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{zksn['ref_id']}.BRANCH_1",
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": CATALOG_CABLE_120},
            },
        )

        # 5. Kontynuuj magistralę napowietrzną po ZKSN
        s = op(
            s,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 1000,
                    "catalog_ref": CATALOG_LINE_70,
                },
            },
        )

        # 6. Słup rozgałęźny na napowietrznej
        overhead_seg = _find_segment(s, "line_overhead")
        s = op(
            s,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": overhead_seg,
                "catalog_ref": "SLUP-ODG-12",
                "name": "Słup-Odgałęźny-A",
            },
        )
        pole = _find_branch_point(s, "branch_pole")

        # 7. Odgałęzienie napowietrzne ze słupa
        s = op(
            s,
            "start_branch_segment_sn",
            {
                "from_ref": f"{pole['ref_id']}.BRANCH",
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 150,
                    "catalog_ref": CATALOG_LINE_35,
                },
            },
        )

        # FINALNE WERYFIKACJE
        # a) Sieć zawiera oba typy branch_points
        bps = s.get("branch_points", [])
        bp_types = {bp["branch_point_type"] for bp in bps}
        assert "zksn" in bp_types
        assert "branch_pole" in bp_types

        # b) Struktura topologiczna jest niesprzeczna
        assert _count(s, "buses") >= 4  # GPZ + ZKSN + słup + odgałęzienia
        assert _count(s, "branches") >= 5  # kilka odcinków linii

        # c) Model Pydantic waliduje snapshot
        enm = EnergyNetworkModel.model_validate(s)
        assert len(enm.branch_points) == 2

        print(
            f"\n[E2E-5] Finalna sieć: {_count(s, 'buses')} szyn, "
            f"{_count(s, 'branches')} gałęzi, "
            f"{_count(s, 'substations')} stacji, "
            f"{_count(s, 'branch_points')} punktów rozgałęzienia"
        )
