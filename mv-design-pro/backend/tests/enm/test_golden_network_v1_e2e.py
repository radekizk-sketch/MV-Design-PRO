"""
Golden Network V1 E2E — pełna sekwencja budowy sieci SN od GPZ.

Test "OSD Engineer" V1: krok po kroku budowa sieci MV z GPZ,
z jawnym podaniem WSZYSTKICH parametrow na kazdym etapie.

Kanon: "bez zgadywania" — brak reliance na auto-detect lub wartosci domyslne.
Kazdy bus_ref, segment_ref, station_type, ratio — jawny.

Sekwencja V1:
  1. add_grid_source_sn
  2. continue_trunk_segment_sn x3
  3. insert_station_on_segment_sn (B, segment 1, ratio=0.5)
  4. continue_trunk_segment_sn x1
  5. start_branch_segment_sn (z szyny stacji)
  6. insert_station_on_segment_sn (C, segment 2, ratio=0.5)
  7. connect_secondary_ring_sn
  8. set_normal_open_point
"""

from __future__ import annotations

import copy

from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

from tests.catalog_test_helpers import gpz_payload

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _empty_enm() -> dict:
    """Pusty ENM do testow."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="golden_v1_e2e", defaults=ENMDefaults()),
    )
    return enm.model_dump(mode="json")


def _snapshot_hash(snapshot: dict) -> str:
    """Oblicz hash snapshot'a (przez EnergyNetworkModel)."""
    enm = EnergyNetworkModel.model_validate(snapshot)
    return compute_enm_hash(enm)


def _count(snapshot: dict, collection: str) -> int:
    """Policz elementy w kolekcji snapshot'a."""
    return len(snapshot.get(collection, []))


def _find_by_ref(snapshot: dict, collection: str, ref_id: str) -> dict | None:
    """Znajdz element po ref_id w kolekcji."""
    for elem in snapshot.get(collection, []):
        if elem.get("ref_id") == ref_id:
            return elem
    return None


def _add_grid_source(enm_dict: dict) -> dict:
    """Wykonaj add_grid_source_sn — jawne parametry."""
    return execute_domain_operation(
        enm_dict=enm_dict,
        op_name="add_grid_source_sn",
        payload=gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
    )


def _continue_trunk(enm_dict: dict, dlugosc_m: int = 320) -> dict:
    """Wykonaj continue_trunk_segment_sn — jawny segment."""
    return execute_domain_operation(
        enm_dict=enm_dict,
        op_name="continue_trunk_segment_sn",
        payload={
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": dlugosc_m,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )


def _get_segment_refs_by_type(snapshot: dict) -> list[str]:
    """Zwroc ref_id wszystkich segmentow kablowych (cable/line_overhead)."""
    refs = []
    for branch in snapshot.get("branches", []):
        if branch.get("type") in ("cable", "line_overhead"):
            refs.append(branch["ref_id"])
    return refs


def _get_corridor_segment_refs(snapshot: dict) -> list[str]:
    """Zwroc ordered_segment_refs z pierwszego korytarza."""
    corridors = snapshot.get("corridors", [])
    if corridors:
        return corridors[0].get("ordered_segment_refs", [])
    return []


def _get_last_bus_ref(snapshot: dict) -> str:
    """Zwroc ref_id ostatniej szyny w snapshot."""
    buses = snapshot.get("buses", [])
    assert buses, "Brak szyn w snapshot"
    return buses[-1]["ref_id"]


def _get_first_bus_ref(snapshot: dict) -> str:
    """Zwroc ref_id pierwszej szyny w snapshot."""
    buses = snapshot.get("buses", [])
    assert buses, "Brak szyn w snapshot"
    return buses[0]["ref_id"]


# ---------------------------------------------------------------------------
# Common step-level assertions
# ---------------------------------------------------------------------------


def _assert_step_ok(result: dict, step_label: str, expect_created: bool = True) -> None:
    """Wspolne asercje po kazdym kroku sekwencji V1."""
    # No error
    error = result.get("error")
    assert not error, f"[{step_label}] Blad: {error}"

    # Snapshot present
    snapshot = result.get("snapshot")
    assert snapshot is not None, f"[{step_label}] Brak snapshot"

    # logical_views present with trunks
    lv = result.get("logical_views")
    assert lv is not None, f"[{step_label}] Brak logical_views"
    trunks = lv.get("trunks")
    assert trunks is not None, f"[{step_label}] Brak trunks w logical_views"

    # layout hash starts with "sha256:"
    layout = result.get("layout")
    assert layout is not None, f"[{step_label}] Brak layout"
    layout_hash = layout.get("layout_hash", "")
    assert layout_hash.startswith(
        "sha256:"
    ), f"[{step_label}] layout_hash nie zaczyna sie od 'sha256:': {layout_hash}"

    # readiness present
    readiness = result.get("readiness")
    assert readiness is not None, f"[{step_label}] Brak readiness"

    # changes.created_element_ids non-empty (for creation steps)
    if expect_created:
        changes = result.get("changes", {})
        created_ids = changes.get("created_element_ids", [])
        assert (
            len(created_ids) > 0
        ), f"[{step_label}] changes.created_element_ids powinno byc niepuste"


# ---------------------------------------------------------------------------
# Full V1 sequence builder (reusable)
# ---------------------------------------------------------------------------


def _run_full_v1_sequence() -> tuple[list[dict], dict]:
    """Wykonaj pelna sekwencje V1 i zwroc (lista wynikow, ostatni snapshot).

    Zwraca tuple:
      - results: lista dict (wynik kazdego kroku)
      - final_snapshot: dict — snapshot po ostatnim kroku
    """
    results: list[dict] = []

    # -----------------------------------------------------------------------
    # KROK 1: add_grid_source_sn
    # -----------------------------------------------------------------------
    enm = _empty_enm()
    r1 = _add_grid_source(enm)
    _assert_step_ok(r1, "Krok 1: add_grid_source_sn")
    results.append(r1)
    s = r1["snapshot"]

    # -----------------------------------------------------------------------
    # KROK 2a-c: continue_trunk_segment_sn x3 (320m each)
    # -----------------------------------------------------------------------
    for i in range(3):
        label = f"Krok 2{chr(ord('a') + i)}: continue_trunk_segment_sn #{i + 1}"
        r = _continue_trunk(s, dlugosc_m=320)
        _assert_step_ok(r, label)
        results.append(r)
        s = r["snapshot"]

    # -----------------------------------------------------------------------
    # KROK 3: insert_station_on_segment_sn (type B, first segment, ratio=0.5)
    # -----------------------------------------------------------------------
    corridor_segs = _get_corridor_segment_refs(s)
    assert len(corridor_segs) >= 1, "Brak segmentow w magistrali przed wstawieniem stacji B"
    first_segment_ref = corridor_segs[0]

    r3 = execute_domain_operation(
        enm_dict=s,
        op_name="insert_station_on_segment_sn",
        payload={
            "segment_ref": first_segment_ref,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    _assert_step_ok(r3, "Krok 3: insert_station_on_segment_sn (B)")
    results.append(r3)
    s = r3["snapshot"]

    # -----------------------------------------------------------------------
    # KROK 4: continue_trunk_segment_sn x1 (320m)
    # -----------------------------------------------------------------------
    r4 = _continue_trunk(s, dlugosc_m=320)
    _assert_step_ok(r4, "Krok 4: continue_trunk_segment_sn #4")
    results.append(r4)
    s = r4["snapshot"]

    # -----------------------------------------------------------------------
    # KROK 5: start_branch_segment_sn (z szyny SN stacji B)
    #   Jawny from_bus_ref — szyna SN wstawionej stacji.
    # -----------------------------------------------------------------------
    # Znajdz szyne SN stacji B (sn_bus w ref_id)
    station_sn_buses = [b for b in s.get("buses", []) if "sn_bus" in b.get("ref_id", "")]
    assert (
        len(station_sn_buses) >= 1
    ), "Brak szyny SN stacji B w snapshot (oczekiwano ref_id z 'sn_bus')"
    branch_from_bus_ref = station_sn_buses[0]["ref_id"]

    r5 = execute_domain_operation(
        enm_dict=s,
        op_name="start_branch_segment_sn",
        payload={
            "from_bus_ref": branch_from_bus_ref,
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 210,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )
    _assert_step_ok(r5, "Krok 5: start_branch_segment_sn")
    results.append(r5)
    s = r5["snapshot"]

    # -----------------------------------------------------------------------
    # KROK 6: insert_station_on_segment_sn (type C, second corridor segment, ratio=0.5)
    #   Jawny segment_ref — drugi segment korytarza (po split z kroku 3).
    # -----------------------------------------------------------------------
    corridor_segs_now = _get_corridor_segment_refs(s)
    assert (
        len(corridor_segs_now) >= 2
    ), f"Oczekiwano >= 2 segmentow w magistrali, jest {len(corridor_segs_now)}"
    second_segment_ref = corridor_segs_now[1]

    r6 = execute_domain_operation(
        enm_dict=s,
        op_name="insert_station_on_segment_sn",
        payload={
            "segment_ref": second_segment_ref,
            "station_type": "C",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "FEEDER"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    _assert_step_ok(r6, "Krok 6: insert_station_on_segment_sn (C)")
    results.append(r6)
    s = r6["snapshot"]

    # -----------------------------------------------------------------------
    # KROK 7: connect_secondary_ring_sn
    #   Jawne from_bus_ref (ostatnia szyna) i to_bus_ref (pierwsza szyna).
    # -----------------------------------------------------------------------
    last_bus_ref = _get_last_bus_ref(s)
    first_bus_ref = _get_first_bus_ref(s)

    r7 = execute_domain_operation(
        enm_dict=s,
        op_name="connect_secondary_ring_sn",
        payload={
            "from_bus_ref": last_bus_ref,
            "to_bus_ref": first_bus_ref,
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 140,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )
    _assert_step_ok(r7, "Krok 7: connect_secondary_ring_sn")
    results.append(r7)
    s = r7["snapshot"]

    # -----------------------------------------------------------------------
    # KROK 8: set_normal_open_point
    #   Jawny segment_ref — ostatni segment (ring closure).
    # -----------------------------------------------------------------------
    # Ring closure segment: last branch added
    branches = s.get("branches", [])
    ring_segment_ref = branches[-1]["ref_id"]

    r8 = execute_domain_operation(
        enm_dict=s,
        op_name="set_normal_open_point",
        payload={"segment_ref": ring_segment_ref},
    )
    # NOP updates, does not create — no expect_created
    _assert_step_ok(r8, "Krok 8: set_normal_open_point", expect_created=False)
    results.append(r8)
    s = r8["snapshot"]

    return results, s


# ===========================================================================
# TEST CLASS 1: TestGoldenNetworkV1E2E — pelna sekwencja krok-po-kroku
# ===========================================================================


class TestGoldenNetworkV1E2E:
    """Pelna sekwencja V1 budowy sieci SN od GPZ — test E2E."""

    def test_full_v1_sequence_step_by_step(self) -> None:
        """Wykonaj 8 krokow, weryfikuj asercje po kazdym i po calej sekwencji."""
        results, final_snapshot = _run_full_v1_sequence()

        # Sprawdz, ze mamy 9 krokow (1 + 3 + 1 + 1 + 1 + 1 + 1 + 1 = 9
        #   but we actually push 9: r1, r2a, r2b, r2c, r3, r4, r5, r6, r7, r8 = 10)
        # Actually: r1 + 3*(r2) + r3 + r4 + r5 + r6 + r7 + r8 = 10
        assert len(results) == 10, f"Oczekiwano 10 wynikow, jest {len(results)}"

        s = final_snapshot

        # --- Post-sequence assertions ---

        # At least 2 substations (GPZ + station B, station C)
        subs_count = _count(s, "substations")
        assert subs_count >= 2, f"Oczekiwano >= 2 substations, jest {subs_count}"

        # At least 5 buses
        bus_count = _count(s, "buses")
        assert bus_count >= 5, f"Oczekiwano >= 5 buses, jest {bus_count}"

        # At least 5 branches
        branch_count = _count(s, "branches")
        assert branch_count >= 5, f"Oczekiwano >= 5 branches, jest {branch_count}"

        # At least 1 transformer
        tr_count = _count(s, "transformers")
        assert tr_count >= 1, f"Oczekiwano >= 1 transformers, jest {tr_count}"

        # At least 1 corridor
        corr_count = _count(s, "corridors")
        assert corr_count >= 1, f"Oczekiwano >= 1 corridors, jest {corr_count}"

        # Ring topology: E >= V (cycle exists)
        bus_refs = {b.get("ref_id") for b in s.get("buses", [])}
        edge_set: set[tuple[str, str]] = set()
        for branch in s.get("branches", []):
            fr = branch.get("from_bus_ref", "")
            to = branch.get("to_bus_ref", "")
            if fr and to:
                edge_set.add((min(fr, to), max(fr, to)))
        for trafo in s.get("transformers", []):
            hv = trafo.get("hv_bus_ref", "")
            lv = trafo.get("lv_bus_ref", "")
            if hv and lv:
                edge_set.add((min(hv, lv), max(hv, lv)))

        v = len(bus_refs)
        e = len(edge_set)
        assert e >= v, f"Ring topology: oczekiwano E >= V (cykl), " f"jest edges={e}, vertices={v}"

        # At least one "open" branch (NOP set)
        open_branches = [b for b in s.get("branches", []) if b.get("status") == "open"]
        assert len(open_branches) >= 1, "Oczekiwano >= 1 branch z status='open' (NOP)"

        # materialized_params present in last result
        last_result = results[-1]
        mat_params = last_result.get("materialized_params")
        assert mat_params is not None, "Brak materialized_params w odpowiedzi"

        # No form-based selections needed — all bus_refs resolved from context
        # (verified implicitly: all steps succeeded without error)

    def test_each_step_has_logical_views_trunks(self) -> None:
        """Kazdy krok V1 ma logical_views z trunks."""
        results, _ = _run_full_v1_sequence()
        for i, r in enumerate(results):
            lv = r.get("logical_views", {})
            trunks = lv.get("trunks")
            assert trunks is not None, f"Krok {i}: brak trunks w logical_views"

    def test_each_step_has_layout_hash(self) -> None:
        """Kazdy krok V1 ma layout.layout_hash zaczynajacy sie od 'sha256:'."""
        results, _ = _run_full_v1_sequence()
        for i, r in enumerate(results):
            layout = r.get("layout", {})
            lh = layout.get("layout_hash", "")
            assert lh.startswith(
                "sha256:"
            ), f"Krok {i}: layout_hash nie zaczyna sie od 'sha256:': {lh}"

    def test_each_step_has_readiness(self) -> None:
        """Kazdy krok V1 ma readiness."""
        results, _ = _run_full_v1_sequence()
        for i, r in enumerate(results):
            readiness = r.get("readiness")
            assert readiness is not None, f"Krok {i}: brak readiness"

    def test_creation_steps_have_created_ids(self) -> None:
        """Kroki tworzace elementy maja niepuste created_element_ids.

        Krok 8 (set_normal_open_point) NIE tworzy — omijamy.
        """
        results, _ = _run_full_v1_sequence()
        # All steps except the last one (NOP) should have created_element_ids
        for i, r in enumerate(results[:-1]):
            changes = r.get("changes", {})
            created = changes.get("created_element_ids", [])
            assert len(created) > 0, f"Krok {i}: changes.created_element_ids powinno byc niepuste"

    def test_final_substations_count(self) -> None:
        """Po pelnej sekwencji: >= 3 substations (GPZ + B + C)."""
        _, s = _run_full_v1_sequence()
        subs = s.get("substations", [])
        assert len(subs) >= 3, f"Oczekiwano >= 3 substations, jest {len(subs)}"

    def test_final_transformers_count(self) -> None:
        """Po pelnej sekwencji: >= 2 transformatory (stacja B + stacja C)."""
        _, s = _run_full_v1_sequence()
        trafos = s.get("transformers", [])
        assert len(trafos) >= 2, f"Oczekiwano >= 2 transformers, jest {len(trafos)}"

    def test_final_open_branch_exists(self) -> None:
        """Po NOP: co najmniej 1 branch ze statusem 'open'."""
        _, s = _run_full_v1_sequence()
        open_b = [b for b in s.get("branches", []) if b.get("status") == "open"]
        assert len(open_b) >= 1, "Brak otwartego brancha po set_normal_open_point"

    def test_final_corridor_has_no_point_ref(self) -> None:
        """Po NOP: korytarz ma ustawiony no_point_ref."""
        _, s = _run_full_v1_sequence()
        corridors = s.get("corridors", [])
        has_nop = any(
            c.get("no_point_ref") is not None and c.get("no_point_ref") != "" for c in corridors
        )
        assert has_nop, "Oczekiwano no_point_ref w korytarzu po set_normal_open_point"

    def test_final_materialized_params_present(self) -> None:
        """Odpowiedz po kazdym kroku zawiera materialized_params."""
        results, _ = _run_full_v1_sequence()
        for i, r in enumerate(results):
            mp = r.get("materialized_params")
            assert mp is not None, f"Krok {i}: brak materialized_params"

    def test_final_ring_cycle_exists(self) -> None:
        """Po connect_secondary_ring_sn: E >= V (cykl istnieje)."""
        _, s = _run_full_v1_sequence()

        bus_refs = {b.get("ref_id") for b in s.get("buses", [])}
        edge_set: set[tuple[str, str]] = set()
        for branch in s.get("branches", []):
            fr = branch.get("from_bus_ref", "")
            to = branch.get("to_bus_ref", "")
            if fr and to:
                edge_set.add((min(fr, to), max(fr, to)))
        for trafo in s.get("transformers", []):
            hv = trafo.get("hv_bus_ref", "")
            lv = trafo.get("lv_bus_ref", "")
            if hv and lv:
                edge_set.add((min(hv, lv), max(hv, lv)))

        v = len(bus_refs)
        e = len(edge_set)
        assert e >= v, f"Ring topology: edges={e} < vertices={v}, brak cyklu"


# ===========================================================================
# TEST CLASS 2: TestLogicalViewsDeterministic
# ===========================================================================


class TestLogicalViewsDeterministic:
    """Ta sama sekwencja 10x -> logical_views identyczne za kazdym razem."""

    def test_logical_views_deterministic_10x(self) -> None:
        """Uruchom pelna sekwencje V1 10 razy — logical_views identyczne."""
        reference_lv: dict | None = None

        for run_idx in range(10):
            results, _ = _run_full_v1_sequence()

            # Zbierz logical_views z ostatniego kroku
            last_lv = results[-1].get("logical_views")
            assert last_lv is not None, f"Run {run_idx}: brak logical_views w ostatnim kroku"

            if reference_lv is None:
                reference_lv = copy.deepcopy(last_lv)
            else:
                assert last_lv == reference_lv, (
                    f"Run {run_idx}: logical_views rozni sie od referencji.\n"
                    f"Referencja trunks count: {len(reference_lv.get('trunks', []))}\n"
                    f"Run {run_idx} trunks count: {len(last_lv.get('trunks', []))}"
                )

    def test_logical_views_intermediate_steps_deterministic(self) -> None:
        """Logical_views sa deterministyczne rowniez dla krokow posrednich."""
        ref_views: list[dict] = []

        for run_idx in range(10):
            results, _ = _run_full_v1_sequence()
            step_views = [r.get("logical_views", {}) for r in results]

            if run_idx == 0:
                ref_views = [copy.deepcopy(v) for v in step_views]
            else:
                for step_idx, (ref_v, cur_v) in enumerate(zip(ref_views, step_views, strict=False)):
                    assert cur_v == ref_v, (
                        f"Run {run_idx}, krok {step_idx}: " f"logical_views rozni sie od referencji"
                    )


# ===========================================================================
# TEST CLASS 3: TestLayoutHashDeterministic
# ===========================================================================


class TestLayoutHashDeterministic:
    """Ta sama sekwencja 10x -> layout_hash identyczny za kazdym razem."""

    def test_layout_hash_deterministic_10x(self) -> None:
        """Uruchom pelna sekwencje V1 10 razy — layout_hash identyczny."""
        reference_hash: str | None = None

        for run_idx in range(10):
            results, _ = _run_full_v1_sequence()

            # Zbierz layout_hash z ostatniego kroku
            last_layout = results[-1].get("layout", {})
            last_hash = last_layout.get("layout_hash", "")
            assert last_hash.startswith(
                "sha256:"
            ), f"Run {run_idx}: layout_hash nie zaczyna sie od 'sha256:'"

            if reference_hash is None:
                reference_hash = last_hash
            else:
                assert last_hash == reference_hash, (
                    f"Run {run_idx}: layout_hash rozni sie od referencji.\n"
                    f"Referencja: {reference_hash}\n"
                    f"Run {run_idx}: {last_hash}"
                )

    def test_layout_hash_all_steps_deterministic(self) -> None:
        """Layout hash jest deterministyczny na kazdym kroku sekwencji V1."""
        ref_hashes: list[str] = []

        for run_idx in range(10):
            results, _ = _run_full_v1_sequence()
            step_hashes = [r.get("layout", {}).get("layout_hash", "") for r in results]

            if run_idx == 0:
                ref_hashes = list(step_hashes)
            else:
                for step_idx, (ref_h, cur_h) in enumerate(
                    zip(ref_hashes, step_hashes, strict=False)
                ):
                    assert cur_h == ref_h, (
                        f"Run {run_idx}, krok {step_idx}: "
                        f"layout_hash rozni sie od referencji.\n"
                        f"Ref: {ref_h}\n"
                        f"Got: {cur_h}"
                    )
