"""Serwis aplikacyjny: dobór kompensacji mocy biernej z katalogu baterii (P42, D8).

Warstwa APPLICATION (orkiestracja, NIE fizyka). Odpowiada na pytanie „która
bateria kondensatorów z katalogu zapewnia wymagany cosφ w punkcie przyłączenia
(wskazanym węźle)" jako DETERMINISTYCZNY przegląd rekordów katalogu w rosnącej
kolejności mocy — dokładnie tym samym mechanizmem biegu rozpływu w pamięci,
którego używa zdolność przyłączeniowa (D3, ``hosting_capacity.py``) i odpowiedź
OSD (D7, ``odpowiedz_osd.py``):

1. dla każdego kandydata (rekord katalogu ``mv_shunt_capacitor_catalog``) dopisuje
   próbną baterię ShuntCapacitor do KOPII snapshotu przy wskazanej szynie (jak
   generator próbny w D3) — ZERO mutacji modelu/persystencji,
2. uruchamia ISTNIEJĄCY solver rozpływu przez ISTNIEJĄCĄ ścieżkę wykonania
   (``enm.canonical_analysis._execute_power_flow`` — ta sama funkcja, której używa
   kanoniczny przebieg PF; ZERO nowej fizyki, ZERO wołania klas solvera na skróty),
3. odczytuje P/Q wymieniane z siecią w punkcie przyłączenia Z WYNIKU solvera i
   projektuje cosφ = |P| / √(P² + Q²) jako WIELKOŚĆ PREZENTACYJNĄ (wynik rozpływu
   nie niesie cosφ wprost — patrz RECON niżej).

RECON WIĄŻĄCY (plik:linia):
- Kształt rekordu katalogu: ``network_model/catalog/mv_shunt_capacitor_catalog.py:44``
  (``get_all_shunt_capacitor_records`` → ``{"id", "name", "params": {"rated_mvar",
  "rated_kv", "loss_kw", ...}}``). Kandydaci WYŁĄCZNIE z tego katalogu, sortowani
  rosnąco po mocy znamionowej (``rated_mvar``, tie-break ``id``).
- Mapowanie shunt → solver: ENM ``ShuntCapacitor`` (``enm/models.py:304``) trafia do
  snapshotu w kolekcji ``shunt_capacitors`` (``enm/models.py:1236``) i jest
  materializowana do ``ShuntSpec(b_pu = Q_rated / S_base)`` w
  ``enm/canonical_analysis.py:1119-1166`` (``_build_shunt_specs_from_snapshot``);
  wymagane pola rekordu snapshotu: ``bus_ref``, ``rated_mvar``, ``rated_kv``,
  ``status`` (``closed``). Dopisujemy próbną baterię do KOPII snapshotu — solver i
  warstwa enm pozostają nietknięte.
- Skąd P/Q punktu: wypadkowy PRZEPŁYW GAŁĘZI zasilających punkt z ``branch_results``
  solvera (``p_from_mw``/``q_from_mvar``/``p_to_mw``/``q_to_mvar``,
  ``network_model/solvers/power_flow_result.py:74-80``, WHITE BOX), odczytany na
  końcu przy punkcie i zsumowany po gałęziach incydentnych (przy JEDNEJ gałęzi
  zasilającej = przepływ tej gałęzi). Uwaga: ``p_injected``/``q_injected`` z
  ``bus_results`` to STAŁY nastaw PQ węzła (generacja − obciążenie) i NIE zmienia
  się po dopisaniu shuntu; efekt kompensacji ujawnia się WYŁĄCZNIE w przepływach
  gałęzi (bateria zmienia napięcia i moc bierną płynącą z sieci). ``branch_id`` w
  wyniku = ``uuid5(NAMESPACE_DNS, ref_id)`` gałęzi (``enm/mapping.py:45,262``),
  więc końce gałęzi odtwarzamy ze snapshotu tą samą funkcją (``_graph_id_from_ref``).
  cosφ liczymy wyłącznie jako projekcję P/S (bez fizyki).

Wiązanie katalogowe: kandydaci dobierani są dla NAPIĘCIA ZNAMIONOWEGO szyny punktu
(rekord katalogu musi mieć ``rated_kv`` zgodne z ``voltage_kv`` szyny) — bateria
innego napięcia znamionowego nie jest instalowalna w punkcie (ograniczenie
poprawnościowe doboru z katalogu, NIE heurystyka). Brak zgodnego rekordu → brak
kandydatów, dobór ``null`` z uczciwym powodem.

Scenariusz nocny (opcjonalny, ``uwzglednij_noc``): drugi przegląd na KOPII
snapshotu z mocą czynną wszystkich generatorów ustawioną na 0 (moc bierna źródeł
bez zmian; generacja Q kabli ujawnia się w rozpływie). Werdykt per scenariusz
(dzień/noc); dobór musi spełniać OBA scenariusze, jeśli noc jest włączona.

Zaokrąglenia jawne: moce do 6 miejsc, cosφ do 6 miejsc.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from enm.canonical_analysis import CanonicalRun, _execute_power_flow, _graph_id_from_ref
from enm.models import ShuntCapacitor
from network_model.catalog.mv_shunt_capacitor_catalog import get_all_shunt_capacitor_records

_KV_TOLERANCE = 0.001


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    value = float(value)
    if math.isnan(value) or math.isinf(value):
        return None
    return round(value, 6)


def _bus_index(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(bus["ref_id"]): bus for bus in (snapshot.get("buses") or []) if bus.get("ref_id")}


def _sorted_candidates(bus_kv: float) -> list[dict[str, Any]]:
    """Rekordy katalogu zgodne z napięciem szyny, rosnąco po mocy (tie-break id)."""
    matching = [
        record
        for record in get_all_shunt_capacitor_records()
        if abs(float(record["params"]["rated_kv"]) - bus_kv) <= _KV_TOLERANCE
    ]
    return sorted(matching, key=lambda r: (float(r["params"]["rated_mvar"]), str(r["id"])))


def _probe_capacitor(bus_ref: str, record: dict[str, Any]) -> dict[str, Any]:
    """Deterministyczna próbna bateria kondensatorów na wskazanej szynie.

    ``id`` z ``uuid5`` (stały dla szyny+rekordu) → snapshot scenariusza jest w pełni
    deterministyczny. ``catalog_ref`` wiąże element z rekordem katalogu (catalog-first).
    """
    type_id = str(record["id"])
    params = record["params"]
    return ShuntCapacitor(
        id=uuid5(NAMESPACE_URL, f"compensation-probe:{bus_ref}:{type_id}"),
        ref_id=f"__komp_probe__{bus_ref}__{type_id}",
        name=str(record["name"]),
        bus_ref=bus_ref,
        rated_mvar=float(params["rated_mvar"]),
        rated_kv=float(params["rated_kv"]),
        status="closed",
        catalog_ref=type_id,
        catalog_namespace="KOMPENSATOR_SN",
        parameter_source="CATALOG",
        source_mode="KATALOG",
    ).model_dump(mode="json")


def _night_generators(generators: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Kopia listy generatorów z mocą czynną = 0 (moc bierna bez zmian)."""
    night: list[dict[str, Any]] = []
    for gen in generators:
        clone = copy.deepcopy(gen)
        clone["p_mw"] = 0.0
        night.append(clone)
    return night


def _scenario_snapshot(
    base_snapshot: dict[str, Any],
    *,
    record: dict[str, Any] | None,
    bus_ref: str,
    night: bool,
) -> dict[str, Any]:
    """KOPIA snapshotu: opcjonalnie noc (P generatorów = 0) + opcjonalna bateria próbna."""
    snapshot = copy.deepcopy(base_snapshot)
    if night:
        snapshot["generators"] = _night_generators(list(snapshot.get("generators") or []))
    if record is not None:
        banks = list(snapshot.get("shunt_capacitors") or [])
        banks.append(_probe_capacitor(bus_ref, record))
        snapshot["shunt_capacitors"] = banks
    return snapshot


def _scenario_run(base_run: CanonicalRun, snapshot: dict[str, Any]) -> CanonicalRun:
    """Przebieg PF w pamięci (bez persystencji) z podmienionym snapshotem."""
    return CanonicalRun(
        id=base_run.id,
        case_id=base_run.case_id,
        project_id=base_run.project_id,
        analysis_type="PF",
        status="FINISHED",
        created_at=base_run.created_at,
        snapshot_hash=base_run.snapshot_hash,
        input_hash=base_run.input_hash,
        snapshot=snapshot,
        validation={},
        readiness={},
        options=dict(base_run.options),
    )


def _edge_endpoints(snapshot: dict[str, Any]) -> dict[str, tuple[str, str]]:
    """Mapa (id krawędzi grafu) → (węzeł from, węzeł to) dla gałęzi i transformatorów.

    ``branch_id`` w wyniku solvera = ``uuid5(NAMESPACE_DNS, ref_id)`` gałęzi
    (``enm/mapping.py:45,262`` — ``_ref_to_uuid``), więc odtwarzamy końce gałęzi ze
    snapshotu tą samą deterministyczną funkcją (``_graph_id_from_ref``). Gałęzie
    otwarte są poza topologią (nie ma ich w wyniku), więc je pomijamy.
    """
    endpoints: dict[str, tuple[str, str]] = {}
    for branch in snapshot.get("branches") or []:
        if str(branch.get("status") or "closed") == "open":
            continue
        ref = str(branch.get("ref_id") or "")
        from_ref = str(branch.get("from_bus_ref") or "")
        to_ref = str(branch.get("to_bus_ref") or "")
        if not (ref and from_ref and to_ref):
            continue
        endpoints[_graph_id_from_ref(ref)] = (
            _graph_id_from_ref(from_ref),
            _graph_id_from_ref(to_ref),
        )
    for trafo in snapshot.get("transformers") or []:
        ref = str(trafo.get("ref_id") or "")
        hv_ref = str(trafo.get("hv_bus_ref") or "")
        lv_ref = str(trafo.get("lv_bus_ref") or "")
        if not (ref and hv_ref and lv_ref):
            continue
        endpoints[_graph_id_from_ref(ref)] = (
            _graph_id_from_ref(hv_ref),
            _graph_id_from_ref(lv_ref),
        )
    return endpoints


def _point_cos_phi(
    base_run: CanonicalRun,
    *,
    record: dict[str, Any] | None,
    bus_ref: str,
    night: bool,
) -> dict[str, Any]:
    """Uruchom rozpływ scenariusza i zwróć cosφ w punkcie (projekcja P/S).

    P/Q punktu = wypadkowy przepływ gałęzi zasilających węzeł, odczytany na końcu
    przy punkcie z ``branch_results`` solvera (suma po gałęziach incydentnych; przy
    jednej gałęzi zasilającej = przepływ tej gałęzi). W przeciwieństwie do
    ``p_injected`` (stały nastaw PQ), przepływ gałęzi ZALEŻY od dopisanej baterii —
    to on niesie efekt kompensacji.

    Niezbieżność lub błąd solvera → ``converged=False`` i ``cos_phi=None`` (bez
    zgadywania). Znak Q raportowany dla czytelności (konwencja: moc wstrzyknięta
    do gałęzi na końcu przy punkcie).
    """
    snapshot = _scenario_snapshot(
        base_run.snapshot or {}, record=record, bus_ref=bus_ref, night=night
    )
    run = _scenario_run(base_run, snapshot)
    try:
        _execute_power_flow(run)
    except Exception:  # noqa: BLE001 — niezbieżność/osobliwość = scenariusz nieoceniony
        return {"converged": False, "cos_phi": None, "p_point_mw": None, "q_point_mvar": None}

    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1") or {}
    converged = bool(result_v1.get("converged", False))
    if not converged:
        return {"converged": False, "cos_phi": None, "p_point_mw": None, "q_point_mvar": None}

    point_node = _graph_id_from_ref(bus_ref)
    endpoints = _edge_endpoints(snapshot)
    p_sum = 0.0
    q_sum = 0.0
    incident = 0
    for br in result_v1.get("branch_results") or []:
        ends = endpoints.get(str(br.get("branch_id")))
        if ends is None:
            continue
        from_node, to_node = ends
        if to_node == point_node:
            p_sum += float(br.get("p_to_mw") or 0.0)
            q_sum += float(br.get("q_to_mvar") or 0.0)
            incident += 1
        elif from_node == point_node:
            p_sum += float(br.get("p_from_mw") or 0.0)
            q_sum += float(br.get("q_from_mvar") or 0.0)
            incident += 1

    if incident == 0:
        return {"converged": True, "cos_phi": None, "p_point_mw": None, "q_point_mvar": None}

    apparent = math.hypot(p_sum, q_sum)
    cos_phi = None if apparent == 0.0 else _round6(abs(p_sum) / apparent)
    return {
        "converged": True,
        "cos_phi": cos_phi,
        "p_point_mw": _round6(p_sum),
        "q_point_mvar": _round6(q_sum),
    }


def _meets(cos_phi: float | None, cos_phi_min: float) -> bool:
    return cos_phi is not None and cos_phi >= cos_phi_min


def _candidate_verdict(
    base_run: CanonicalRun,
    *,
    record: dict[str, Any],
    bus_ref: str,
    cos_phi_min: float,
    uwzglednij_noc: bool,
) -> dict[str, Any]:
    day = _point_cos_phi(base_run, record=record, bus_ref=bus_ref, night=False)
    night = (
        _point_cos_phi(base_run, record=record, bus_ref=bus_ref, night=True)
        if uwzglednij_noc
        else None
    )
    meets_day = _meets(day["cos_phi"], cos_phi_min)
    meets_night = True if night is None else _meets(night["cos_phi"], cos_phi_min)
    return {
        "catalog_ref": str(record["id"]),
        "name": str(record["name"]),
        "rated_mvar": _round6(record["params"]["rated_mvar"]),
        "rated_kv": _round6(record["params"]["rated_kv"]),
        "cos_phi_day": day["cos_phi"],
        "p_point_day_mw": day["p_point_mw"],
        "q_point_day_mvar": day["q_point_mvar"],
        "cos_phi_night": None if night is None else night["cos_phi"],
        "p_point_night_mw": None if night is None else night["p_point_mw"],
        "q_point_night_mvar": None if night is None else night["q_point_mvar"],
        "spelnia_dzien": meets_day,
        "spelnia_noc": None if night is None else meets_night,
        "spelnia": meets_day and meets_night,
    }


def _input_hash(
    base_run: CanonicalRun,
    bus_ref: str,
    cos_phi_min: float,
    uwzglednij_noc: bool,
    candidate_ids: list[str],
) -> str:
    payload = {
        "snapshot_hash": base_run.snapshot_hash,
        "bus_ref": bus_ref,
        "cos_phi_min": cos_phi_min,
        "uwzglednij_noc": uwzglednij_noc,
        "candidate_ids": candidate_ids,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_compensation_sizing_view(
    run: CanonicalRun,
    *,
    bus_ref: str,
    cos_phi_min: float,
    uwzglednij_noc: bool = False,
) -> dict[str, Any]:
    """Zbuduj widok doboru kompensacji dla przebiegu rozpływu.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony, gdy ``cos_phi_min`` jest poza (0, 1] albo gdy wskazana
            szyna nie istnieje — komunikaty w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Dobór kompensacji wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )
    if not (0.0 < cos_phi_min <= 1.0):
        raise ValueError("Wymagany cosφ (cos_phi_min) musi być w przedziale (0, 1].")

    snapshot = run.snapshot or {}
    buses = _bus_index(snapshot)
    bus = buses.get(bus_ref)
    if bus is None:
        raise ValueError(f"Wskazana szyna punktu przyłączenia nie istnieje w modelu: {bus_ref}.")

    bus_kv = float(bus.get("voltage_kv") or 0.0)
    records = _sorted_candidates(bus_kv)

    baseline = {
        "cos_phi_day": _point_cos_phi(run, record=None, bus_ref=bus_ref, night=False)["cos_phi"],
        "cos_phi_night": (
            _point_cos_phi(run, record=None, bus_ref=bus_ref, night=True)["cos_phi"]
            if uwzglednij_noc
            else None
        ),
    }

    candidates = [
        _candidate_verdict(
            run,
            record=record,
            bus_ref=bus_ref,
            cos_phi_min=cos_phi_min,
            uwzglednij_noc=uwzglednij_noc,
        )
        for record in records
    ]

    selected = next((c for c in candidates if c["spelnia"]), None)
    if selected is not None:
        dobor: dict[str, Any] | None = {
            "catalog_ref": selected["catalog_ref"],
            "name": selected["name"],
            "rated_mvar": selected["rated_mvar"],
            "rated_kv": selected["rated_kv"],
            "cos_phi_day": selected["cos_phi_day"],
            "cos_phi_night": selected["cos_phi_night"],
        }
        powod = None
    else:
        dobor = None
        if not records:
            powod = f"Brak baterii w katalogu dla napięcia znamionowego szyny {_round6(bus_kv)} kV."
        else:
            zakres = "dzień i noc" if uwzglednij_noc else "dzień"
            powod = (
                f"Żadna bateria z katalogu nie zapewnia wymaganego cosφ ≥ {cos_phi_min} "
                f"w punkcie {bus_ref} ({zakres}); największy przegląd nie spełnia wymagania."
            )

    return {
        "analysis": "compensation_sizing",
        "context": {
            "trace_id": str(run.id),
            "snapshot_id": run.snapshot_hash,
            "case_name": str(run.case_id) if run.case_id else None,
        },
        "parameters": {
            "bus_ref": bus_ref,
            "bus_name": bus.get("name"),
            "bus_voltage_kv": _round6(bus_kv),
            "cos_phi_min": cos_phi_min,
            "uwzglednij_noc": uwzglednij_noc,
        },
        "input_hash": _input_hash(
            run, bus_ref, cos_phi_min, uwzglednij_noc, [str(r["id"]) for r in records]
        ),
        "baseline": baseline,
        "candidates": candidates,
        "dobor": dobor,
        "powod_braku": powod,
        "whitebox": {
            "pq_source": (
                "wypadkowy przepływ gałęzi zasilających punkt z branch_results solvera "
                "(koniec przy punkcie, suma po gałęziach incydentnych); przy jednej gałęzi "
                "zasilającej = przepływ tej gałęzi"
            ),
            "cos_phi_projection": "cosφ = |P| / √(P² + Q²) — wielkość prezentacyjna (bez fizyki)",
            "candidate_count": len(candidates),
            "night_scenario": (
                "moc czynna generatorów = 0 (moc bierna bez zmian)" if uwzglednij_noc else None
            ),
        },
    }
