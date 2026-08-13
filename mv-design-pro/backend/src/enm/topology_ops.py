"""
Topology Operations — atomic CRUD for ENM graph elements.

Każda operacja: preconditions → mutate IN-PLACE → postconditions.
DETERMINISTYCZNE: identyczne wejście → identyczny wynik.
BINDING: Polish labels, no project codenames.

KONTRAKT MUTACJI (TOPO-COPY, V12K-323 — audyt: `docs/plan/TOPO_COPY_AUDYT.md`).

Każda funkcja mutująca tego modułu zmienia podany model **W MIEJSCU** i oddaje
w `TopologyOpResult.enm` **TEN SAM obiekt** (`result.enm is enm`). Kopiowanie NIE
jest odpowiedzialnością tej warstwy — należy do granicy operacji domenowej, która
i tak robi własną prywatną kopię na wejściu (`enm/domain_operations.py`,
`enm/domain_operations_v2.py`).

DŁUG, KTÓRY TO ZAMYKA. Wcześniej każda z 14 funkcji mutujących kopiowała GŁĘBOKO
cały model przy KAŻDYM dodawanym elemencie — mimo że wołający zrobił już swoją
kopię sekundę wcześniej. Koszt dodania N-tego elementu rósł liniowo z rozmiarem
modelu: na budowie substratu 53 stacji te kopie zjadały 6,59 s z 10,90 s (60,5 %,
737 kopii). Audyt 152 wywołań wykazał, że 149 z nich już wtedy podawało prywatną
kopię, a pozostałe 3 (`add_ct`/`add_vt`/`add_relay`) to był BRAK granicy po stronie
wołającego, uzupełniony tą samą zmianą.

ŚCIEŻKA BŁĘDU NIE ZOSTAWIA SKUTKU. Cała walidacja BLOCKER biegnie PRZED jakąkolwiek
mutacją, więc `TopologyOpResult(False, enm, …)` oddaje model bajtowo nietknięty.
To nie jest deklaracja bez pokrycia — kontrakt (mutacja w miejscu, tożsamość
obiektu, brak skutku na ścieżce błędu, deterministyczna liczba kopii) jest przypięty
w `tests/enm/test_topology_ops_kontrakt_kopii.py`.

WOŁAJĄCY, KTÓRY POTRZEBUJE IZOLACJI od swojego wejścia, robi kopię SAM — na swojej
granicy, raz na operację, a nie raz na element.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from .load_zip_model import zip_odbioru_z_parametrow_materializacji

# ---------------------------------------------------------------------------
# Operation Result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OpIssue:
    """Problem operacji grafowej."""

    code: str
    severity: Literal["BLOCKER", "WARNING", "INFO"]
    message_pl: str
    element_ref: str | None = None


@dataclass(frozen=True)
class TopologyOpResult:
    """Wynik operacji topologicznej."""

    success: bool
    enm: dict[str, Any]
    op_type: str
    issues: list[OpIssue] = field(default_factory=list)
    created_ref: str | None = None


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _bus_refs_set(enm: dict[str, Any]) -> set[str]:
    return {b.get("ref_id", "") for b in enm.get("buses", [])}


def _all_refs_set(enm: dict[str, Any]) -> set[str]:
    refs: set[str] = set()
    for key in (
        "buses",
        "branches",
        "transformers",
        "sources",
        "loads",
        "generators",
        "substations",
        "bays",
        "junctions",
        "corridors",
        "measurements",
        "protection_assignments",
    ):
        for elem in enm.get(key, []):
            ref = elem.get("ref_id", "")
            if ref:
                refs.add(ref)
    return refs


def _ref_id_unique(enm: dict[str, Any], ref_id: str) -> bool:
    return ref_id not in _all_refs_set(enm)


def _check_cycle_on_add(enm: dict[str, Any], from_ref: str, to_ref: str) -> bool:
    """Sprawdź czy dodanie gałęzi tworzy cykl (BFS od to_ref do from_ref)."""
    adj: dict[str, list[str]] = {}
    for b in enm.get("branches", []):
        if b.get("status") == "open":
            continue
        fr = b.get("from_bus_ref", "")
        to = b.get("to_bus_ref", "")
        adj.setdefault(fr, []).append(to)
        adj.setdefault(to, []).append(fr)
    for t in enm.get("transformers", []):
        hv = t.get("hv_bus_ref", "")
        lv = t.get("lv_bus_ref", "")
        adj.setdefault(hv, []).append(lv)
        adj.setdefault(lv, []).append(hv)
    # BFS from to_ref to find from_ref (without the new edge)
    visited: set[str] = set()
    queue = [to_ref]
    while queue:
        current = queue.pop(0)
        if current == from_ref:
            return True  # cycle detected
        if current in visited:
            continue
        visited.add(current)
        for neighbor in adj.get(current, []):
            if neighbor not in visited:
                queue.append(neighbor)
    return False


def _find_breaker_refs(enm: dict[str, Any]) -> set[str]:
    """Zbierz ref_id wyłączników (type=breaker)."""
    result: set[str] = set()
    for b in enm.get("branches", []):
        if b.get("type") == "breaker":
            result.add(b.get("ref_id", ""))
    return result


def _find_ct_refs(enm: dict[str, Any]) -> set[str]:
    """Zbierz ref_id przekładników CT."""
    return {
        m.get("ref_id", "")
        for m in enm.get("measurements", [])
        if m.get("measurement_type") == "CT"
    }


# ---------------------------------------------------------------------------
# Node (Bus) operations
# ---------------------------------------------------------------------------


def create_node(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Utwórz nowy węzeł (szynę). MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    ref_id = data.get("ref_id", "")

    if not ref_id:
        issues.append(OpIssue("OP_NO_REF", "BLOCKER", "Brak ref_id węzła"))
    elif not _ref_id_unique(enm, ref_id):
        issues.append(
            OpIssue("OP_REF_DUPLICATE", "BLOCKER", f"ref_id '{ref_id}' już istnieje", ref_id)
        )

    voltage = data.get("voltage_kv", 0)
    if voltage <= 0:
        issues.append(OpIssue("OP_VOLTAGE_INVALID", "BLOCKER", "Napięcie musi być > 0 kV"))

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "create_node", issues)

    bus_data = {
        "ref_id": ref_id,
        "name": data.get("name", ref_id),
        "voltage_kv": voltage,
        "phase_system": data.get("phase_system", "3ph"),
        "tags": data.get("tags", []),
        "meta": data.get("meta", {}),
    }
    if "zone" in data:
        bus_data["zone"] = data["zone"]
    if "grounding" in data:
        bus_data["grounding"] = data["grounding"]
    enm.setdefault("buses", []).append(bus_data)
    return TopologyOpResult(True, enm, "create_node", issues, ref_id)


def update_node(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Zaktualizuj istniejący węzeł. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    ref_id = data.get("ref_id", "")

    buses = enm.get("buses", [])
    idx = next((i for i, b in enumerate(buses) if b.get("ref_id") == ref_id), None)
    if idx is None:
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Węzeł '{ref_id}' nie znaleziony", ref_id)
        )
        return TopologyOpResult(False, enm, "update_node", issues)

    if "voltage_kv" in data and data["voltage_kv"] <= 0:
        issues.append(OpIssue("OP_VOLTAGE_INVALID", "BLOCKER", "Napięcie musi być > 0 kV"))

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "update_node", issues)

    for key, val in data.items():
        if key != "ref_id":
            enm["buses"][idx][key] = val
    return TopologyOpResult(True, enm, "update_node", issues, ref_id)


def delete_node(enm: dict[str, Any], ref_id: str) -> TopologyOpResult:
    """Usuń węzeł z walidacją zależności. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    buses = enm.get("buses", [])
    idx = next((i for i, b in enumerate(buses) if b.get("ref_id") == ref_id), None)

    if idx is None:
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Węzeł '{ref_id}' nie znaleziony", ref_id)
        )
        return TopologyOpResult(False, enm, "delete_node", issues)

    # Sprawdź zależności
    deps: list[str] = []
    for b in enm.get("branches", []):
        if b.get("from_bus_ref") == ref_id or b.get("to_bus_ref") == ref_id:
            deps.append(f"gałąź '{b.get('ref_id', '?')}'")
    for t in enm.get("transformers", []):
        if t.get("hv_bus_ref") == ref_id or t.get("lv_bus_ref") == ref_id:
            deps.append(f"transformator '{t.get('ref_id', '?')}'")
    for s in enm.get("sources", []):
        if s.get("bus_ref") == ref_id:
            deps.append(f"źródło '{s.get('ref_id', '?')}'")
    for ld in enm.get("loads", []):
        if ld.get("bus_ref") == ref_id:
            deps.append(f"odbiór '{ld.get('ref_id', '?')}'")
    for g in enm.get("generators", []):
        if g.get("bus_ref") == ref_id:
            deps.append(f"generator '{g.get('ref_id', '?')}'")

    if deps:
        issues.append(
            OpIssue(
                "OP_HAS_DEPENDENCIES",
                "BLOCKER",
                f"Węzeł '{ref_id}' ma zależności: {', '.join(deps[:5])}"
                + (f" i {len(deps) - 5} więcej" if len(deps) > 5 else ""),
                ref_id,
            )
        )
        return TopologyOpResult(False, enm, "delete_node", issues)

    enm["buses"] = [b for b in enm["buses"] if b.get("ref_id") != ref_id]
    return TopologyOpResult(True, enm, "delete_node", issues, ref_id)


# ---------------------------------------------------------------------------
# Branch operations
# ---------------------------------------------------------------------------


def create_branch(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Utwórz nową gałąź (linia/kabel/łącznik). MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    ref_id = data.get("ref_id", "")
    branch_type = data.get("type", "line_overhead")

    if not ref_id:
        issues.append(OpIssue("OP_NO_REF", "BLOCKER", "Brak ref_id gałęzi"))
    elif not _ref_id_unique(enm, ref_id):
        issues.append(
            OpIssue("OP_REF_DUPLICATE", "BLOCKER", f"ref_id '{ref_id}' już istnieje", ref_id)
        )

    from_ref = data.get("from_bus_ref", "")
    to_ref = data.get("to_bus_ref", "")
    bus_refs = _bus_refs_set(enm)

    if from_ref not in bus_refs:
        issues.append(
            OpIssue("OP_FROM_NOT_FOUND", "BLOCKER", f"Szyna źródłowa '{from_ref}' nie istnieje")
        )
    if to_ref not in bus_refs:
        issues.append(
            OpIssue("OP_TO_NOT_FOUND", "BLOCKER", f"Szyna docelowa '{to_ref}' nie istnieje")
        )
    if from_ref and to_ref and from_ref == to_ref:
        issues.append(
            OpIssue("OP_SELF_LOOP", "BLOCKER", "Gałąź nie może łączyć szyny sama ze sobą")
        )

    # Cycle detection for radial networks
    if from_ref in bus_refs and to_ref in bus_refs and from_ref != to_ref:
        if _check_cycle_on_add(enm, from_ref, to_ref):
            issues.append(
                OpIssue("OP_CYCLE_DETECTED", "WARNING", "Dodanie gałęzi tworzy cykl w sieci")
            )

    # Type-specific validation
    if branch_type in ("line_overhead", "cable"):
        length = data.get("length_km", 0)
        if length <= 0:
            issues.append(OpIssue("OP_LENGTH_INVALID", "BLOCKER", "Długość gałęzi musi być > 0 km"))

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "create_branch", issues)

    branch_data: dict[str, Any] = {
        "ref_id": ref_id,
        "name": data.get("name", ref_id),
        "type": branch_type,
        "from_bus_ref": from_ref,
        "to_bus_ref": to_ref,
        "status": data.get("status", "closed"),
        "catalog_ref": data.get("catalog_ref"),
        "catalog_namespace": data.get("catalog_namespace"),
        "source_mode": data.get("source_mode"),
        "parameter_source": data.get("parameter_source"),
        "materialized_params": data.get("materialized_params"),
        "overrides": data.get("overrides", []),
        "tags": data.get("tags", []),
        "meta": data.get("meta", {}),
    }

    # Copy type-specific fields
    if branch_type in ("line_overhead", "cable"):
        for key in (
            "length_km",
            "r_ohm_per_km",
            "x_ohm_per_km",
            "b_siemens_per_km",
            "r0_ohm_per_km",
            "x0_ohm_per_km",
            "b0_siemens_per_km",
            "conductor_material",
            "cross_section_mm2",
            "number_of_cores",
            "return_conductor_cross_section_mm2",
            "return_conductor_material",
            "return_conductor_r_ohm_per_km_20c",
            # Karta P0.6 (G-05): reaktancja zyly powrotnej — biala lista tworzenia
            # galezi z danych (hydratacja) musi ja przepuszczac tak samo jak R.
            "return_conductor_x_ohm_per_km",
            "return_conductor_jth_1s_a_per_mm2",
            "return_conductor_ith_1s_a",
            "rating",
            "insulation",
            # Karta F-K1 faza 3/6: dane cieplne ZYLY FAZOWEJ i para temperatur
            # uzasadniajaca wspolczynnik k. Biala lista pol gubila je po drodze,
            # wiec kryterium cieplne widzialo kabel zmaterializowany z katalogu
            # jako „bez danych cieplnych" — defekt niewidoczny, bo zaden test nie
            # szedl droga operacja domenowa -> model -> graf az do tych pol.
            "jth_1s_a_per_mm2",
            "ith_1s_a",
            "operating_temperature_c",
            "short_circuit_temperature_c",
            "thermal_source_ref",
            # P0.1 nN (karta P0.1, add_nn_cable_segment): liczba torow kabla
            # ulozonych rownolegle na tej samej trasie. Brak na SN — bez zmiany
            # zachowania istniejacych torow tworzenia gałęzi SN.
            "n_parallel",
        ):
            if key in data:
                branch_data[key] = data[key]
    elif branch_type in ("switch", "breaker", "bus_coupler", "disconnector"):
        for key in ("r_ohm", "x_ohm"):
            if key in data:
                branch_data[key] = data[key]
    elif branch_type == "fuse":
        for key in ("rated_current_a", "rated_voltage_kv"):
            if key in data:
                branch_data[key] = data[key]

    enm.setdefault("branches", []).append(branch_data)
    return TopologyOpResult(True, enm, "create_branch", issues, ref_id)


def update_branch(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Zaktualizuj istniejącą gałąź. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    ref_id = data.get("ref_id", "")
    branches = enm.get("branches", [])
    idx = next((i for i, b in enumerate(branches) if b.get("ref_id") == ref_id), None)

    if idx is None:
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Gałąź '{ref_id}' nie znaleziona", ref_id)
        )
        return TopologyOpResult(False, enm, "update_branch", issues)

    for key, val in data.items():
        if key not in ("ref_id", "type"):  # type is immutable
            enm["branches"][idx][key] = val
    return TopologyOpResult(True, enm, "update_branch", issues, ref_id)


def delete_branch(enm: dict[str, Any], ref_id: str) -> TopologyOpResult:
    """Usuń gałąź. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    branches = enm.get("branches", [])
    idx = next((i for i, b in enumerate(branches) if b.get("ref_id") == ref_id), None)

    if idx is None:
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Gałąź '{ref_id}' nie znaleziona", ref_id)
        )
        return TopologyOpResult(False, enm, "delete_branch", issues)

    # Sprawdź czy wyłącznik ma przypisane zabezpieczenie
    branch = branches[idx]
    if branch.get("type") == "breaker":
        for pa in enm.get("protection_assignments", []):
            if pa.get("breaker_ref") == ref_id:
                issues.append(
                    OpIssue(
                        "OP_HAS_PROTECTION",
                        "BLOCKER",
                        f"Wyłącznik '{ref_id}' ma przypisane zabezpieczenie "
                        f"'{pa.get('ref_id', '?')}' — najpierw odłącz zabezpieczenie",
                        ref_id,
                    )
                )

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "delete_branch", issues)

    enm["branches"] = [b for b in enm["branches"] if b.get("ref_id") != ref_id]
    return TopologyOpResult(True, enm, "delete_branch", issues, ref_id)


# ---------------------------------------------------------------------------
# Device operations (Transformer, Load, Generator, Source)
# ---------------------------------------------------------------------------


def create_device(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Utwórz urządzenie (transformator/odbiór/generator/źródło).

    MUTUJE `enm` W MIEJSCU (kontrakt modułu).
    """
    issues: list[OpIssue] = []
    device_type = data.get("device_type", "")
    ref_id = data.get("ref_id", "")

    if not ref_id:
        issues.append(OpIssue("OP_NO_REF", "BLOCKER", "Brak ref_id urządzenia"))
    elif not _ref_id_unique(enm, ref_id):
        issues.append(
            OpIssue("OP_REF_DUPLICATE", "BLOCKER", f"ref_id '{ref_id}' już istnieje", ref_id)
        )

    bus_refs = _bus_refs_set(enm)

    if device_type == "transformer":
        hv = data.get("hv_bus_ref", "")
        lv = data.get("lv_bus_ref", "")
        if hv not in bus_refs:
            issues.append(OpIssue("OP_HV_NOT_FOUND", "BLOCKER", f"Szyna HV '{hv}' nie istnieje"))
        if lv not in bus_refs:
            issues.append(OpIssue("OP_LV_NOT_FOUND", "BLOCKER", f"Szyna LV '{lv}' nie istnieje"))
        if hv == lv and hv:
            issues.append(
                OpIssue("OP_HV_EQ_LV", "BLOCKER", "Szyna HV i LV nie mogą być identyczne")
            )
        if data.get("sn_mva", 0) <= 0:
            issues.append(OpIssue("OP_SN_INVALID", "BLOCKER", "Moc znamionowa Sn musi być > 0 MVA"))
        if data.get("uk_percent", 0) <= 0:
            issues.append(OpIssue("OP_UK_INVALID", "BLOCKER", "Napięcie zwarcia uk% musi być > 0"))

        if any(i.severity == "BLOCKER" for i in issues):
            return TopologyOpResult(False, enm, "create_device", issues)

        trafo_data = {
            "ref_id": ref_id,
            "name": data.get("name", ref_id),
            "hv_bus_ref": hv,
            "lv_bus_ref": lv,
            "sn_mva": data["sn_mva"],
            "uhv_kv": data.get("uhv_kv", 0),
            "ulv_kv": data.get("ulv_kv", 0),
            "uk_percent": data["uk_percent"],
            "pk_kw": data.get("pk_kw", 0),
            "tags": data.get("tags", []),
            "meta": data.get("meta", {}),
        }
        for opt in (
            "p0_kw",
            "i0_percent",
            "vector_group",
            "hv_neutral",
            "lv_neutral",
            "n_parallel",
            "tap_position",
            "tap_min",
            "tap_max",
            "tap_step_percent",
            "tap_changer",
            "catalog_ref",
            "catalog_namespace",
            "source_mode",
            "parameter_source",
            "materialized_params",
            "overrides",
        ):
            if opt in data:
                trafo_data[opt] = data[opt]
        enm.setdefault("transformers", []).append(trafo_data)
        return TopologyOpResult(True, enm, "create_device", issues, ref_id)

    elif device_type == "load":
        bus_ref = data.get("bus_ref", "")
        if bus_ref not in bus_refs:
            issues.append(OpIssue("OP_BUS_NOT_FOUND", "BLOCKER", f"Szyna '{bus_ref}' nie istnieje"))
        # Tabliczka odbioru niesie wielomian ZIP czytany przez rozpływ. Sprawdzamy
        # go NA WEJŚCIU, tym samym kontraktem co kreator odbioru — inaczej odbiór
        # z sumą udziałów ≠ 1 wchodziłby do modelu bez słowa i wywracał dopiero
        # rozpływ, surowym wyjątkiem solvera bez wskazania elementu.
        blad_zip = zip_odbioru_z_parametrow_materializacji(data.get("materialized_params"))
        if blad_zip is not None:
            issues.append(OpIssue("OP_LOAD_ZIP_INVALID", "BLOCKER", blad_zip))
        if any(i.severity == "BLOCKER" for i in issues):
            return TopologyOpResult(False, enm, "create_device", issues)

        load_data = {
            "ref_id": ref_id,
            "name": data.get("name", ref_id),
            "bus_ref": bus_ref,
            "p_mw": data.get("p_mw", 0),
            "q_mvar": data.get("q_mvar", 0),
            "model": data.get("model", "pq"),
            "catalog_ref": data.get("catalog_ref"),
            "catalog_namespace": data.get("catalog_namespace"),
            "source_mode": data.get("source_mode"),
            "parameter_source": data.get("parameter_source"),
            "materialized_params": data.get("materialized_params"),
            "overrides": data.get("overrides", []),
            "tags": data.get("tags", []),
            "meta": data.get("meta", {}),
        }
        enm.setdefault("loads", []).append(load_data)
        return TopologyOpResult(True, enm, "create_device", issues, ref_id)

    elif device_type == "generator":
        bus_ref = data.get("bus_ref", "")
        if bus_ref not in bus_refs:
            issues.append(OpIssue("OP_BUS_NOT_FOUND", "BLOCKER", f"Szyna '{bus_ref}' nie istnieje"))
        if any(i.severity == "BLOCKER" for i in issues):
            return TopologyOpResult(False, enm, "create_device", issues)

        gen_data = {
            "ref_id": ref_id,
            "name": data.get("name", ref_id),
            "bus_ref": bus_ref,
            "p_mw": data.get("p_mw", 0),
            "q_mvar": data.get("q_mvar"),
            "gen_type": data.get("gen_type"),
            "catalog_ref": data.get("catalog_ref"),
            "catalog_namespace": data.get("catalog_namespace"),
            "source_mode": data.get("source_mode"),
            "parameter_source": data.get("parameter_source"),
            "materialized_params": data.get("materialized_params"),
            "overrides": data.get("overrides", []),
            "tags": data.get("tags", []),
            "meta": data.get("meta", {}),
        }
        if "limits" in data:
            gen_data["limits"] = data["limits"]
        enm.setdefault("generators", []).append(gen_data)
        return TopologyOpResult(True, enm, "create_device", issues, ref_id)

    elif device_type == "source":
        bus_ref = data.get("bus_ref", "")
        if bus_ref not in bus_refs:
            issues.append(OpIssue("OP_BUS_NOT_FOUND", "BLOCKER", f"Szyna '{bus_ref}' nie istnieje"))
        # Check if there's already a grid source on this bus
        for s in enm.get("sources", []):
            if s.get("bus_ref") == bus_ref:
                issues.append(
                    OpIssue(
                        "OP_DUPLICATE_SOURCE",
                        "WARNING",
                        f"Szyna '{bus_ref}' ma już źródło zasilania",
                    )
                )
        if any(i.severity == "BLOCKER" for i in issues):
            return TopologyOpResult(False, enm, "create_device", issues)

        src_data = {
            "ref_id": ref_id,
            "name": data.get("name", ref_id),
            "bus_ref": bus_ref,
            "model": data.get("model", "short_circuit_power"),
            "catalog_ref": data.get("catalog_ref"),
            "catalog_namespace": data.get("catalog_namespace"),
            "source_mode": data.get("source_mode"),
            "parameter_source": data.get("parameter_source"),
            "materialized_params": data.get("materialized_params"),
            "overrides": data.get("overrides", []),
            "tags": data.get("tags", []),
            "meta": data.get("meta", {}),
        }
        for opt in ("substation_ref", "gpz_section_id"):
            if opt in data:
                src_data[opt] = data[opt]
        for opt in (
            "source_side",
            "sn_voltage_kv",
            "voltage_hv_kv",
            "sk3_hv_mva",
            "sk3_mva",
            "ik3_ka",
            "r_ohm",
            "x_ohm",
            "rx_ratio",
            "r0_ohm",
            "x0_ohm",
            "z0_z1_ratio",
            "c_max",
            "c_min",
        ):
            if opt in data:
                src_data[opt] = data[opt]
        enm.setdefault("sources", []).append(src_data)
        return TopologyOpResult(True, enm, "create_device", issues, ref_id)

    else:
        issues.append(
            OpIssue("OP_UNKNOWN_DEVICE", "BLOCKER", f"Nieznany typ urządzenia: '{device_type}'")
        )
        return TopologyOpResult(False, enm, "create_device", issues)


def update_device(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Zaktualizuj istniejące urządzenie. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    device_type = data.get("device_type", "")
    ref_id = data.get("ref_id", "")

    collection_map = {
        "transformer": "transformers",
        "load": "loads",
        "generator": "generators",
        "source": "sources",
    }
    coll = collection_map.get(device_type)
    if not coll:
        issues.append(
            OpIssue("OP_UNKNOWN_DEVICE", "BLOCKER", f"Nieznany typ urządzenia: '{device_type}'")
        )
        return TopologyOpResult(False, enm, "update_device", issues)

    items = enm.get(coll, [])
    idx = next((i for i, x in enumerate(items) if x.get("ref_id") == ref_id), None)
    if idx is None:
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Urządzenie '{ref_id}' nie znalezione", ref_id)
        )
        return TopologyOpResult(False, enm, "update_device", issues)

    for key, val in data.items():
        if key not in ("ref_id", "device_type"):
            enm[coll][idx][key] = val
    return TopologyOpResult(True, enm, "update_device", issues, ref_id)


def delete_device(enm: dict[str, Any], device_type: str, ref_id: str) -> TopologyOpResult:
    """Usuń urządzenie. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    collection_map = {
        "transformer": "transformers",
        "load": "loads",
        "generator": "generators",
        "source": "sources",
    }
    coll = collection_map.get(device_type)
    if not coll:
        issues.append(
            OpIssue("OP_UNKNOWN_DEVICE", "BLOCKER", f"Nieznany typ urządzenia: '{device_type}'")
        )
        return TopologyOpResult(False, enm, "delete_device", issues)

    items = enm.get(coll, [])
    if not any(x.get("ref_id") == ref_id for x in items):
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Urządzenie '{ref_id}' nie znalezione", ref_id)
        )
        return TopologyOpResult(False, enm, "delete_device", issues)

    enm[coll] = [x for x in enm[coll] if x.get("ref_id") != ref_id]
    return TopologyOpResult(True, enm, "delete_device", issues, ref_id)


# ---------------------------------------------------------------------------
# Measurement (CT/VT) operations
# ---------------------------------------------------------------------------


def create_measurement(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Utwórz przekładnik CT/VT. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    ref_id = data.get("ref_id", "")

    if not ref_id:
        issues.append(OpIssue("OP_NO_REF", "BLOCKER", "Brak ref_id przekładnika"))
    elif not _ref_id_unique(enm, ref_id):
        issues.append(
            OpIssue("OP_REF_DUPLICATE", "BLOCKER", f"ref_id '{ref_id}' już istnieje", ref_id)
        )

    bus_ref = data.get("bus_ref", "")
    if bus_ref not in _bus_refs_set(enm):
        issues.append(OpIssue("OP_BUS_NOT_FOUND", "BLOCKER", f"Szyna '{bus_ref}' nie istnieje"))

    mtype = data.get("measurement_type", "")
    if mtype not in ("CT", "VT"):
        issues.append(
            OpIssue(
                "OP_INVALID_MTYPE",
                "BLOCKER",
                f"Typ przekładnika musi być 'CT' lub 'VT', podano: '{mtype}'",
            )
        )

    rating = data.get("rating", {})
    if not rating.get("ratio_primary") or not rating.get("ratio_secondary"):
        issues.append(
            OpIssue(
                "OP_RATING_MISSING",
                "BLOCKER",
                "Przekładnia (ratio_primary/ratio_secondary) wymagana",
            )
        )

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "create_measurement", issues)

    m_data = {
        "ref_id": ref_id,
        "name": data.get("name", ref_id),
        "measurement_type": mtype,
        "bus_ref": bus_ref,
        "bay_ref": data.get("bay_ref"),
        "rating": rating,
        "connection": data.get("connection", "star"),
        "purpose": data.get("purpose", "protection"),
        "tags": data.get("tags", []),
        "meta": data.get("meta", {}),
    }
    enm.setdefault("measurements", []).append(m_data)
    return TopologyOpResult(True, enm, "create_measurement", issues, ref_id)


def delete_measurement(enm: dict[str, Any], ref_id: str) -> TopologyOpResult:
    """Usuń przekładnik z walidacją zależności. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    measurements = enm.get("measurements", [])
    if not any(m.get("ref_id") == ref_id for m in measurements):
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Przekładnik '{ref_id}' nie znaleziony", ref_id)
        )
        return TopologyOpResult(False, enm, "delete_measurement", issues)

    # Sprawdź czy CT jest używany w protection_assignment
    for pa in enm.get("protection_assignments", []):
        if pa.get("ct_ref") == ref_id:
            issues.append(
                OpIssue(
                    "OP_CT_IN_USE",
                    "BLOCKER",
                    f"CT '{ref_id}' jest używany w zabezpieczeniu '{pa.get('ref_id', '?')}'"
                    " — najpierw odłącz zabezpieczenie",
                    ref_id,
                )
            )

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "delete_measurement", issues)

    enm["measurements"] = [m for m in enm["measurements"] if m.get("ref_id") != ref_id]
    return TopologyOpResult(True, enm, "delete_measurement", issues, ref_id)


# ---------------------------------------------------------------------------
# Protection Assignment operations
# ---------------------------------------------------------------------------


def attach_protection(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Przypisz zabezpieczenie do wyłącznika. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    ref_id = data.get("ref_id", "")

    if not ref_id:
        issues.append(OpIssue("OP_NO_REF", "BLOCKER", "Brak ref_id zabezpieczenia"))
    elif not _ref_id_unique(enm, ref_id):
        issues.append(
            OpIssue("OP_REF_DUPLICATE", "BLOCKER", f"ref_id '{ref_id}' już istnieje", ref_id)
        )

    breaker_ref = data.get("breaker_ref", "")
    breaker_refs = _find_breaker_refs(enm)
    if breaker_ref not in breaker_refs:
        issues.append(
            OpIssue(
                "OP_BREAKER_NOT_FOUND",
                "BLOCKER",
                f"Wyłącznik '{breaker_ref}' nie istnieje lub nie jest typu 'breaker'",
            )
        )

    # Sprawdź czy wyłącznik nie ma już przypisanego zabezpieczenia
    for pa in enm.get("protection_assignments", []):
        if pa.get("breaker_ref") == breaker_ref:
            issues.append(
                OpIssue(
                    "OP_BREAKER_HAS_PROTECTION",
                    "BLOCKER",
                    f"Wyłącznik '{breaker_ref}' ma już zabezpieczenie "
                    f"'{pa.get('ref_id', '?')}'",
                )
            )

    # Walidacja CT — jeśli podano ct_ref, musi istnieć
    ct_ref = data.get("ct_ref")
    if ct_ref:
        ct_refs = _find_ct_refs(enm)
        if ct_ref not in ct_refs:
            issues.append(
                OpIssue("OP_CT_NOT_FOUND", "BLOCKER", f"Przekładnik CT '{ct_ref}' nie istnieje")
            )

    # Jeśli typ wymaga CT a nie podano
    device_type = data.get("device_type", "overcurrent")
    ct_required_types = {"overcurrent", "earth_fault", "directional_overcurrent"}
    if device_type in ct_required_types and not ct_ref:
        issues.append(
            OpIssue(
                "OP_CT_REQUIRED",
                "BLOCKER",
                f"Zabezpieczenie typu '{device_type}' wymaga przekładnika CT",
            )
        )

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "attach_protection", issues)

    pa_data = {
        "ref_id": ref_id,
        "name": data.get("name", ref_id),
        "breaker_ref": breaker_ref,
        "ct_ref": ct_ref,
        "vt_ref": data.get("vt_ref"),
        "device_type": device_type,
        "catalog_ref": data.get("catalog_ref"),
        "settings": data.get("settings", []),
        "is_enabled": data.get("is_enabled", True),
        "tags": data.get("tags", []),
        "meta": data.get("meta", {}),
    }
    enm.setdefault("protection_assignments", []).append(pa_data)
    return TopologyOpResult(True, enm, "attach_protection", issues, ref_id)


def update_protection(enm: dict[str, Any], data: dict[str, Any]) -> TopologyOpResult:
    """Zaktualizuj zabezpieczenie. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    ref_id = data.get("ref_id", "")
    pas = enm.get("protection_assignments", [])
    idx = next((i for i, x in enumerate(pas) if x.get("ref_id") == ref_id), None)

    if idx is None:
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Zabezpieczenie '{ref_id}' nie znalezione", ref_id)
        )
        return TopologyOpResult(False, enm, "update_protection", issues)

    # Validate CT if changing ct_ref
    if "ct_ref" in data and data["ct_ref"]:
        ct_refs = _find_ct_refs(enm)
        if data["ct_ref"] not in ct_refs:
            issues.append(
                OpIssue(
                    "OP_CT_NOT_FOUND", "BLOCKER", f"Przekładnik CT '{data['ct_ref']}' nie istnieje"
                )
            )

    if any(i.severity == "BLOCKER" for i in issues):
        return TopologyOpResult(False, enm, "update_protection", issues)

    for key, val in data.items():
        if key not in ("ref_id",):
            enm["protection_assignments"][idx][key] = val
    return TopologyOpResult(True, enm, "update_protection", issues, ref_id)


def detach_protection(enm: dict[str, Any], ref_id: str) -> TopologyOpResult:
    """Odłącz zabezpieczenie od wyłącznika. MUTUJE `enm` W MIEJSCU (kontrakt modułu)."""
    issues: list[OpIssue] = []
    pas = enm.get("protection_assignments", [])
    if not any(x.get("ref_id") == ref_id for x in pas):
        issues.append(
            OpIssue("OP_NOT_FOUND", "BLOCKER", f"Zabezpieczenie '{ref_id}' nie znalezione", ref_id)
        )
        return TopologyOpResult(False, enm, "detach_protection", issues)

    enm["protection_assignments"] = [
        x for x in enm["protection_assignments"] if x.get("ref_id") != ref_id
    ]
    return TopologyOpResult(True, enm, "detach_protection", issues, ref_id)


# ---------------------------------------------------------------------------
# Topology Summary — graph view for Tree/SLD
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AdjacencyEntry:
    """Wpis listy sąsiedztwa."""

    bus_ref: str
    neighbor_ref: str
    via_ref: str
    via_type: str  # branch type or "transformer"


@dataclass(frozen=True)
class SpineNode:
    """Węzeł na magistrali (spine)."""

    bus_ref: str
    depth: int
    is_source: bool
    children_refs: tuple[str, ...]  # direct children bus refs


@dataclass(frozen=True)
class TopologySummary:
    """Podsumowanie topologiczne — widok grafu dla Tree/SLD."""

    bus_count: int
    branch_count: int
    transformer_count: int
    source_count: int
    load_count: int
    generator_count: int
    measurement_count: int
    protection_count: int
    adjacency: tuple[AdjacencyEntry, ...]
    spine: tuple[SpineNode, ...]
    lateral_roots: tuple[str, ...]  # bus_refs starting lateral branches
    is_radial: bool
    has_cycles: bool


def compute_topology_summary(enm: dict[str, Any]) -> TopologySummary:
    """Oblicz podsumowanie topologiczne (graph view).

    DETERMINISTYCZNE: ten sam ENM → identyczny wynik.
    """
    buses = enm.get("buses", [])
    branches = enm.get("branches", [])
    trafos = enm.get("transformers", [])
    sources = enm.get("sources", [])

    source_bus_refs = sorted({s.get("bus_ref", "") for s in sources})

    # Build adjacency
    adj_entries: list[AdjacencyEntry] = []
    adj_map: dict[str, list[tuple[str, str, str]]] = {}

    for b in branches:
        if b.get("status") == "open":
            continue
        fr = b.get("from_bus_ref", "")
        to = b.get("to_bus_ref", "")
        btype = b.get("type", "unknown")
        adj_entries.append(AdjacencyEntry(fr, to, b.get("ref_id", ""), btype))
        adj_entries.append(AdjacencyEntry(to, fr, b.get("ref_id", ""), btype))
        adj_map.setdefault(fr, []).append((to, b.get("ref_id", ""), btype))
        adj_map.setdefault(to, []).append((fr, b.get("ref_id", ""), btype))

    for t in trafos:
        hv = t.get("hv_bus_ref", "")
        lv = t.get("lv_bus_ref", "")
        adj_entries.append(AdjacencyEntry(hv, lv, t.get("ref_id", ""), "transformer"))
        adj_entries.append(AdjacencyEntry(lv, hv, t.get("ref_id", ""), "transformer"))
        adj_map.setdefault(hv, []).append((lv, t.get("ref_id", ""), "transformer"))
        adj_map.setdefault(lv, []).append((hv, t.get("ref_id", ""), "transformer"))

    # Sort for determinism
    adj_entries.sort(key=lambda e: (e.bus_ref, e.neighbor_ref, e.via_ref))

    # BFS from source to build spine
    spine_nodes: list[SpineNode] = []
    visited: set[str] = set()
    lateral_roots: list[str] = []

    for src_bus in source_bus_refs:
        if src_bus in visited:
            continue
        queue: list[tuple[str, int]] = [(src_bus, 0)]
        visited.add(src_bus)

        while queue:
            current, depth = queue.pop(0)
            children: list[str] = []
            for neighbor, _via, _vtype in sorted(adj_map.get(current, []), key=lambda x: x[0]):
                if neighbor not in visited:
                    visited.add(neighbor)
                    children.append(neighbor)
                    queue.append((neighbor, depth + 1))

            spine_nodes.append(
                SpineNode(
                    bus_ref=current,
                    depth=depth,
                    is_source=current in source_bus_refs,
                    children_refs=tuple(children),
                )
            )

            # Mark lateral roots: nodes with >1 children from depth >= 1
            if depth >= 1 and len(children) > 1:
                lateral_roots.extend(children[1:])

    # Cycle detection
    has_cycles = _detect_cycles(enm)

    return TopologySummary(
        bus_count=len(buses),
        branch_count=len(branches),
        transformer_count=len(trafos),
        source_count=len(sources),
        load_count=len(enm.get("loads", [])),
        generator_count=len(enm.get("generators", [])),
        measurement_count=len(enm.get("measurements", [])),
        protection_count=len(enm.get("protection_assignments", [])),
        adjacency=tuple(adj_entries),
        spine=tuple(spine_nodes),
        lateral_roots=tuple(sorted(lateral_roots)),
        is_radial=not has_cycles,
        has_cycles=has_cycles,
    )


def _detect_cycles(enm: dict[str, Any]) -> bool:
    """Wykryj cykle w grafie ENM.

    Metoda: E_unique - V + C > 0 oznacza cykl, gdzie:
    - E_unique = liczba unikalnych krawędzi (par węzłów bez duplikatów)
    - V = liczba węzłów w grafie
    - C = liczba spójnych składowych

    Równoległe gałęzie (np. linia + wyłącznik między tymi samymi szynami)
    NIE tworzą cyklu — to standardowa topologia SN.
    """
    edge_set: set[tuple[str, str]] = set()
    all_nodes: set[str] = set()

    for b in enm.get("branches", []):
        if b.get("status") == "open":
            continue
        fr = b.get("from_bus_ref", "")
        to = b.get("to_bus_ref", "")
        if fr and to:
            edge_set.add((min(fr, to), max(fr, to)))
            all_nodes.add(fr)
            all_nodes.add(to)

    for t in enm.get("transformers", []):
        hv = t.get("hv_bus_ref", "")
        lv = t.get("lv_bus_ref", "")
        if hv and lv:
            edge_set.add((min(hv, lv), max(hv, lv)))
            all_nodes.add(hv)
            all_nodes.add(lv)

    # Include isolated buses
    for b in enm.get("buses", []):
        ref = b.get("ref_id", "")
        if ref:
            all_nodes.add(ref)

    if not edge_set:
        return False

    # Count connected components (BFS)
    adj: dict[str, set[str]] = {}
    for fr, to in edge_set:
        adj.setdefault(fr, set()).add(to)
        adj.setdefault(to, set()).add(fr)

    visited: set[str] = set()
    components = 0
    for node in sorted(all_nodes):
        if node in visited:
            continue
        components += 1
        queue = [node]
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            for neighbor in adj.get(current, set()):
                if neighbor not in visited:
                    queue.append(neighbor)

    # For a forest: E = V - C. If E > V - C, there are cycles.
    return len(edge_set) > len(all_nodes) - components
