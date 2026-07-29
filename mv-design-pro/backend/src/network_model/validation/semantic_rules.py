"""
Semantic rules — walidacja semantyki sieci SN po operacjach domenowych.

Komplementarna do `NetworkValidator` (statyczna walidacja przed solverem)
oraz inline blockers w `domain_operations.py` (preflight per-operation).

`validate_semantic(enm)` jest uruchamiana jako post-hook w
`execute_domain_operation()` — zwraca listę naruszeń (ValidationIssue)
dotyczących CAŁEGO ENM po zastosowaniu operacji. Konsumenci (frontend
`SemanticIssuesBanner`) wyświetlają je użytkownikowi.

Reguły startowe (PR-C konsolidacji UI):
1. CableCannotStartFromPole — kabel SN nie może wychodzić ze słupa
   rozgałęźnego (branch_pole jest punktem na linii napowietrznej).
2. OverheadCannotStartFromZksn — linia napowietrzna nie może wychodzić
   z ZKSN (zlaczka kablowa SN to punkt na kablu).
3. DerMustMatchBayType — generator OZE musi być na polu o typie zgodnym
   z jego rodzajem (PV/wiatr/BESS w pole DER, nie w pole obce).

Każda reguła to czysta funkcja: enm_dict -> list[ValidationIssue].
Reguły są pure — bez mutacji ENM, bez stanu globalnego.
"""

from collections.abc import Callable

from .validator import Severity, ValidationIssue

SemanticRule = Callable[[dict], list[ValidationIssue]]


def _branch_points(enm: dict) -> list[dict]:
    return enm.get("branch_points") or []


def _branches(enm: dict) -> list[dict]:
    return enm.get("branches") or []


def _generators(enm: dict) -> list[dict]:
    return enm.get("generators") or []


def _bays(enm: dict) -> list[dict]:
    return enm.get("bays") or []


def _buses(enm: dict) -> list[dict]:
    return enm.get("buses") or []


def _transformers(enm: dict) -> list[dict]:
    return enm.get("transformers") or []


def _sources(enm: dict) -> list[dict]:
    return enm.get("sources") or []


def _segment_type_by_id(enm: dict) -> dict[str, str]:
    """Mapuje segment_id → segment type (cable / line_overhead / ...)."""
    out: dict[str, str] = {}
    for br in _branches(enm):
        seg_id = br.get("id") or br.get("ref_id")
        if seg_id:
            out[seg_id] = br.get("type", "")
    return out


def rule_cable_cannot_start_from_pole(enm: dict) -> list[ValidationIssue]:
    """
    Słup rozgałęźny (branch_pole) jest punktem na linii NAPOWIETRZNEJ.
    Jeśli parent_segment_id wskazuje na kabel — naruszenie.

    Zachowanie komplementarne do inline check w domain_operations.py
    (linia ~735), ale walidacja całościowa, nie preflight per-op.
    """
    issues: list[ValidationIssue] = []
    seg_types = _segment_type_by_id(enm)
    for bp in _branch_points(enm):
        if bp.get("branch_point_type") != "branch_pole":
            continue
        parent_seg_id = bp.get("parent_segment_id")
        if not parent_seg_id:
            continue
        seg_type = seg_types.get(parent_seg_id)
        if seg_type and seg_type != "line_overhead":
            issues.append(
                ValidationIssue(
                    code="semantic.cable_cannot_start_from_pole",
                    message=(
                        f"Słup rozgałęźny '{bp.get('ref_id')}' jest osadzony na segmencie "
                        f"typu '{seg_type}', a wymaga linii napowietrznej."
                    ),
                    severity=Severity.ERROR,
                    element_id=bp.get("ref_id"),
                    field="parent_segment_id",
                    suggested_fix="Zmień segment nadrzędny słupa na linię napowietrzną.",
                )
            )
    return issues


def rule_overhead_cannot_start_from_zksn(enm: dict) -> list[ValidationIssue]:
    """
    ZKSN (złączka kablowa SN) jest punktem na KABLU.
    Jeśli parent_segment_id wskazuje na linię napowietrzną — naruszenie.

    Zachowanie komplementarne do inline check w domain_operations.py
    (linia ~744), ale walidacja całościowa.
    """
    issues: list[ValidationIssue] = []
    seg_types = _segment_type_by_id(enm)
    for bp in _branch_points(enm):
        if bp.get("branch_point_type") != "zksn":
            continue
        parent_seg_id = bp.get("parent_segment_id")
        if not parent_seg_id:
            continue
        seg_type = seg_types.get(parent_seg_id)
        if seg_type and seg_type != "cable":
            issues.append(
                ValidationIssue(
                    code="semantic.overhead_cannot_host_zksn",
                    message=(
                        f"ZKSN '{bp.get('ref_id')}' jest osadzona na segmencie typu "
                        f"'{seg_type}', a wymaga kabla."
                    ),
                    severity=Severity.ERROR,
                    element_id=bp.get("ref_id"),
                    field="parent_segment_id",
                    suggested_fix="Zmień segment nadrzędny ZKSN na kabel.",
                )
            )
    return issues


def _bay_role_for_generator_gen_type(gen_type: str) -> set[str]:
    """
    Mapuje gen_type generatora na dopuszczalne typy pola SN.
    DER musi siedzieć w polu o roli "der_*" zgodnej z jego typem.
    """
    if gen_type in ("PV", "BESS", "WIND", "FW"):
        # Wszystkie OZE/BESS akceptowane w polu der_*
        return {"der", "der_pv", "der_bess", "der_wind", "customer_oze", "feeder"}
    if gen_type in ("INVERTER", "CONVERTER"):
        return {"der", "der_inverter", "customer_oze", "feeder"}
    # Inne (genset, UPS) — szeroka tolerancja
    return {"feeder", "customer", "der", "auxiliary"}


def rule_der_must_match_bay_type(enm: dict) -> list[ValidationIssue]:
    """
    Generator OZE/BESS musi być w polu o typie zgodnym z jego rodzajem.
    Sprawdzane przez bay_ref → bay.bay_role / bay_kind.

    Nowa reguła — nie ma odpowiednika inline w domain_operations.py.
    """
    issues: list[ValidationIssue] = []
    bays_by_id = {b.get("ref_id"): b for b in _bays(enm)}
    for gen in _generators(enm):
        bay_ref = gen.get("bay_ref")
        if not bay_ref:
            continue
        bay = bays_by_id.get(bay_ref)
        if not bay:
            continue
        gen_type = gen.get("gen_type") or gen.get("source_kind") or ""
        bay_role = bay.get("bay_role") or bay.get("bay_kind") or ""
        if not gen_type or not bay_role:
            continue
        allowed = _bay_role_for_generator_gen_type(gen_type)
        if bay_role not in allowed:
            issues.append(
                ValidationIssue(
                    code="semantic.der_bay_type_mismatch",
                    message=(
                        f"Generator '{gen.get('ref_id')}' typu '{gen_type}' jest w polu "
                        f"'{bay_ref}' o roli '{bay_role}'. Wymagane pole o roli zgodnej "
                        f"z typem źródła."
                    ),
                    severity=Severity.ERROR,
                    element_id=gen.get("ref_id"),
                    field="bay_ref",
                    suggested_fix=(
                        f"Przenieś generator do pola o roli {sorted(allowed)} lub zmień rolę pola."
                    ),
                )
            )
    return issues


def rule_source_voltage_match_bus(enm: dict) -> list[ValidationIssue]:
    """
    Źródło (Source) musi być przyłączone do szyny o zgodnym napięciu.
    Jeśli source.voltage_kv != bus.voltage_kv ± 1% — naruszenie.

    Nowa reguła — sprawdza spójność napięcia źródła z szyną zasilającą.
    """
    issues: list[ValidationIssue] = []
    buses_by_ref = {b.get("ref_id"): b for b in _buses(enm)}
    for src in _sources(enm):
        bus_ref = src.get("bus_ref")
        src_voltage = src.get("voltage_kv")
        if not bus_ref or src_voltage is None:
            continue
        bus = buses_by_ref.get(bus_ref)
        if not bus:
            continue
        bus_voltage = bus.get("voltage_kv")
        if bus_voltage is None:
            continue
        try:
            src_v = float(src_voltage)
            bus_v = float(bus_voltage)
        except (TypeError, ValueError):
            continue
        # Tolerancja 1% (różnice nominalne vs aktualne)
        if bus_v == 0:
            continue
        diff_pct = abs(src_v - bus_v) / bus_v * 100.0
        if diff_pct > 1.0:
            issues.append(
                ValidationIssue(
                    code="semantic.source_voltage_mismatch",
                    message=(
                        f"Źródło '{src.get('ref_id')}' ma napięcie {src_v} kV, a "
                        f"szyna '{bus_ref}' {bus_v} kV (różnica {diff_pct:.1f}%)."
                    ),
                    severity=Severity.ERROR,
                    element_id=src.get("ref_id"),
                    field="voltage_kv",
                    suggested_fix=(
                        f"Wyrównaj napięcie źródła do {bus_v} kV lub przyłącz do innej szyny."
                    ),
                )
            )
    return issues


def rule_transformer_voltage_polarity(enm: dict) -> list[ValidationIssue]:
    """
    Transformator musi mieć poprawną polarność: napięcie HV >= napięcie LV.
    Jeśli hv_bus.voltage_kv < lv_bus.voltage_kv — odwrócona polaryzacja.

    Nowa reguła — łapie błąd przy zamianie stron transformatora.
    """
    issues: list[ValidationIssue] = []
    buses_by_ref = {b.get("ref_id"): b for b in _buses(enm)}
    for tr in _transformers(enm):
        hv_ref = tr.get("hv_bus_ref")
        lv_ref = tr.get("lv_bus_ref")
        if not hv_ref or not lv_ref:
            continue
        hv_bus = buses_by_ref.get(hv_ref)
        lv_bus = buses_by_ref.get(lv_ref)
        if not hv_bus or not lv_bus:
            continue
        try:
            hv_v = float(hv_bus.get("voltage_kv", 0))
            lv_v = float(lv_bus.get("voltage_kv", 0))
        except (TypeError, ValueError):
            continue
        if hv_v > 0 and lv_v > 0 and hv_v < lv_v:
            issues.append(
                ValidationIssue(
                    code="semantic.transformer_polarity_reversed",
                    message=(
                        f"Transformator '{tr.get('ref_id')}' ma odwróconą polarność: "
                        f"strona HV ({hv_ref}, {hv_v} kV) niższa niż LV ({lv_ref}, {lv_v} kV)."
                    ),
                    severity=Severity.ERROR,
                    element_id=tr.get("ref_id"),
                    field="hv_bus_ref",
                    suggested_fix="Zamień przypisanie hv_bus_ref ↔ lv_bus_ref.",
                )
            )
    return issues


def rule_no_orphan_branch_points(enm: dict) -> list[ValidationIssue]:
    """
    Każdy branch_point (słup rozgałęźny / ZKSN) musi mieć poprawny
    parent_segment_id wskazujący na istniejący segment w branches.

    Nowa reguła — łapie sieroty (orphan branch_points) powstałe przy
    usuwaniu segmentów bez kaskadowego usuwania ich rozgałęźników.
    """
    issues: list[ValidationIssue] = []
    branch_ids = {b.get("id") for b in _branches(enm)} | {b.get("ref_id") for b in _branches(enm)}
    branch_ids.discard(None)
    for bp in _branch_points(enm):
        parent_seg = bp.get("parent_segment_id")
        if not parent_seg:
            issues.append(
                ValidationIssue(
                    code="semantic.branch_point_missing_parent",
                    message=(
                        f"Punkt rozgałęzienia '{bp.get('ref_id')}' nie ma określonego "
                        f"segmentu nadrzędnego (parent_segment_id)."
                    ),
                    severity=Severity.ERROR,
                    element_id=bp.get("ref_id"),
                    field="parent_segment_id",
                    suggested_fix="Przypisz prawidłowy segment nadrzędny.",
                )
            )
            continue
        if parent_seg not in branch_ids:
            issues.append(
                ValidationIssue(
                    code="semantic.branch_point_orphan",
                    message=(
                        f"Punkt rozgałęzienia '{bp.get('ref_id')}' wskazuje na segment "
                        f"'{parent_seg}', który nie istnieje w sieci."
                    ),
                    severity=Severity.ERROR,
                    element_id=bp.get("ref_id"),
                    field="parent_segment_id",
                    suggested_fix="Przypisz istniejący segment lub usuń punkt rozgałęzienia.",
                )
            )
    return issues


def _loads(enm: dict) -> list[dict]:
    return enm.get("loads") or []


def rule_zero_length_segment(enm: dict) -> list[ValidationIssue]:
    """
    Segment SN (kabel / linia napowietrzna) z długością 0 km jest podejrzany —
    najprawdopodobniej brak materializacji parametrów z katalogu lub pomyłka edytora.

    Severity: WARNING (nie blokuje obliczeń, ale ostrzega operatora).
    """
    issues: list[ValidationIssue] = []
    for br in _branches(enm):
        br_type = br.get("type")
        if br_type not in ("cable", "line_overhead"):
            continue
        length = br.get("length_km")
        if length is None:
            continue
        try:
            length_v = float(length)
        except (TypeError, ValueError):
            continue
        if length_v <= 0.0:
            issues.append(
                ValidationIssue(
                    code="semantic.zero_length_segment",
                    message=(
                        f"Segment '{br.get('ref_id') or br.get('id')}' typu '{br_type}' "
                        f"ma długość {length_v} km. Wymagana dodatnia długość."
                    ),
                    severity=Severity.WARNING,
                    element_id=br.get("ref_id") or br.get("id"),
                    field="length_km",
                    suggested_fix="Uzupełnij długość segmentu lub usuń segment.",
                )
            )
    return issues


def rule_zero_power_load(enm: dict) -> list[ValidationIssue]:
    """
    Odbiór z mocą czynną i bierną równą 0 nie wpływa na obliczenia rozpływowe —
    najprawdopodobniej placeholder lub brak materializacji katalogu.

    Severity: WARNING (operator może świadomie mieć "rezerwowe" odbiory).
    """
    issues: list[ValidationIssue] = []
    for load in _loads(enm):
        p_kw = load.get("p_kw")
        q_kvar = load.get("q_kvar")
        try:
            p = float(p_kw) if p_kw is not None else 0.0
            q = float(q_kvar) if q_kvar is not None else 0.0
        except (TypeError, ValueError):
            continue
        if abs(p) < 1e-9 and abs(q) < 1e-9:
            issues.append(
                ValidationIssue(
                    code="semantic.zero_power_load",
                    message=(
                        f"Odbiór '{load.get('ref_id')}' ma P=0 kW i Q=0 kvar — "
                        f"nie wpływa na obliczenia rozpływowe."
                    ),
                    severity=Severity.WARNING,
                    element_id=load.get("ref_id"),
                    field="p_kw",
                    suggested_fix="Uzupełnij moce obciążenia lub usuń odbiór.",
                )
            )
    return issues


SEMANTIC_RULES: list[SemanticRule] = [
    # ERROR (blokujące):
    rule_cable_cannot_start_from_pole,
    rule_overhead_cannot_start_from_zksn,
    rule_der_must_match_bay_type,
    rule_source_voltage_match_bus,
    rule_transformer_voltage_polarity,
    rule_no_orphan_branch_points,
    # WARNING (informacyjne, nie blokują):
    rule_zero_length_segment,
    rule_zero_power_load,
]
