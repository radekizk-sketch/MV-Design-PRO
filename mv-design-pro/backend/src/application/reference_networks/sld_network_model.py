"""Distill a full ENM (e.g. the 53-station SLD substrate) into the COMPACT network model the
SLD network auto-layout (E3) reads — the minimal, deterministic structure needed to place a
radial GPZ→feeder→station tree in voltage bands. PURE: takes the ENM dict, returns a plain dict;
no solver, no mutation. Mirror contract of frontend `network/networkModel.ts`.

The feeder TREE is reconstructed from the cable/line/switch branches (a bus graph), BFS from the
GPZ SN bus. NO-ORPHAN (CI #465): every physical station is reachable and emitted regardless of
switch state — the normally-open switch is a structural link here (its open state is a render
marker, not a topology cut).
"""

from __future__ import annotations

from collections import deque
from typing import Any

_LINE_TYPES = {"cable", "line_overhead"}
# Bays connect a station's SN bus to the feeder through breaker/switch devices; include them so the
# tree is connected and every lateral is reachable. Any status (NO-ORPHAN: structure ≠ switch state).
_LINK_TYPES = _LINE_TYPES | {"switch", "breaker"}


def _sn_bus_of(sub: dict[str, Any], bus_kv: dict[str, float]) -> str | None:
    """The station's medium-voltage (15 kV) busbar — the feeder-tree node."""
    mv = [r for r in sub.get("bus_refs", []) if 1.0 <= bus_kv.get(r, 0.0) < 60.0]
    return mv[0] if mv else None


def _nn_bus_of(sub: dict[str, Any], bus_kv: dict[str, float]) -> str | None:
    lv = [r for r in sub.get("bus_refs", []) if bus_kv.get(r, 99.0) < 1.0]
    return lv[0] if lv else None


def distill_sld_network(enm: dict[str, Any]) -> dict[str, Any]:
    """ENM → {gpz, stations[], edges[], nop, voltages} compact network model (deterministic)."""
    buses = enm.get("buses", [])
    bus_kv = {b["ref_id"]: float(b.get("voltage_kv", 0.0)) for b in buses}
    subs = enm.get("substations", [])
    transformers = {t["ref_id"]: t for t in enm.get("transformers", [])}

    # bus_ref → owning substation ref
    bus_owner: dict[str, str] = {}
    for s in subs:
        for r in s.get("bus_refs", []):
            bus_owner[r] = s["ref_id"]

    # Undirected bus adjacency from cable/line/switch branches (structure ⇒ all, any status).
    adj: dict[str, list[str]] = {}
    for br in enm.get("branches", []):
        if br.get("type") not in _LINK_TYPES:
            continue
        a, b = br.get("from_bus_ref"), br.get("to_bus_ref")
        if a is None or b is None:
            continue
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    # deterministic neighbour order
    for k in adj:
        adj[k] = sorted(adj[k])

    gpz = next((s for s in subs if s.get("station_type") == "gpz"), None)
    if gpz is None:
        raise ValueError("network has no GPZ substation")
    root = _sn_bus_of(gpz, bus_kv)
    if root is None:
        raise ValueError("GPZ has no SN bus")

    # BFS over the bus graph → depth + parent-bus (deterministic: sorted neighbours, stable queue).
    depth: dict[str, int] = {root: 0}
    parent_bus: dict[str, str | None] = {root: None}
    q: deque[str] = deque([root])
    while q:
        u = q.popleft()
        for v in adj.get(u, []):
            if v not in depth:
                depth[v] = depth[u] + 1
                parent_bus[v] = u
                q.append(v)

    # Each non-GPZ station's SN bus → its tree depth + nearest upstream STATION (its parent).
    sn_of: dict[str, str] = {}  # station ref → its SN bus
    for s in subs:
        sn = _sn_bus_of(s, bus_kv)
        if sn is not None:
            sn_of[s["ref_id"]] = sn

    def upstream_station(sn_bus: str) -> str | None:
        cur = parent_bus.get(sn_bus)
        while cur is not None:
            owner = bus_owner.get(cur)
            if owner is not None and sn_of.get(owner) == cur:
                return owner
            cur = parent_bus.get(cur)
        return None

    # DER per station (by the nn-bus owner), trafo rating per station.
    der_by_station: dict[str, list[str]] = {}
    for g in enm.get("generators", []):
        owner = bus_owner.get(g.get("bus_ref", ""))
        if owner:
            der_by_station.setdefault(owner, []).append(g.get("gen_type", "der"))

    # NOP switch → the station whose SN bus is its downstream tree node (the isolated stub head).
    nop_station: str | None = None
    for br in enm.get("branches", []):
        if br.get("type") == "switch" and br.get("status") == "open":
            for end in (br.get("from_bus_ref"), br.get("to_bus_ref")):
                d_end = depth.get(end)
                d_other = depth.get(
                    (
                        br.get("to_bus_ref")
                        if end == br.get("from_bus_ref")
                        else br.get("from_bus_ref")
                    ),
                    -1,
                )
                if d_end is not None and d_end > d_other:
                    # the station reached just past this switch
                    cur: str | None = end
                    while cur is not None:
                        owner = bus_owner.get(cur)
                        if owner and sn_of.get(owner) == cur:
                            nop_station = owner
                            break
                        cur = parent_bus.get(cur)
            break

    # Build station rows (sorted by depth then SN-bus ref ⇒ stable S01..Sn ids).
    rows = []
    for s in subs:
        if s.get("station_type") == "gpz":
            continue
        ref = s["ref_id"]
        sn = sn_of.get(ref)
        if sn is None:
            continue
        rows.append((depth.get(sn, 1_000_000), sn, s))
    rows.sort(key=lambda t: (t[0], t[1]))

    ref_to_id = {s["ref_id"]: f"S{i + 1:02d}" for i, (_, _, s) in enumerate(rows)}

    def trafo_mva(s: dict[str, Any]) -> float | None:
        for tr in s.get("transformer_refs", []):
            t = transformers.get(tr)
            if t:
                return float(t.get("sn_mva", 0.0))
        return None

    stations = []
    for d, sn, s in rows:
        ref = s["ref_id"]
        parent_ref = upstream_station(sn)
        stations.append(
            {
                "id": ref_to_id[ref],
                "name": s.get("name", ref),
                "kind": "trunk" if s.get("station_type") == "branch" else "lateral",
                "depth": d,
                "parent": ref_to_id.get(parent_ref) if parent_ref else None,
                "sn_kv": round(bus_kv.get(sn, 15.0), 3),
                "nn_kv": round(bus_kv.get(_nn_bus_of(s, bus_kv) or "", 0.4), 3),
                "trafo_mva": trafo_mva(s),
                "der": sorted(set(der_by_station.get(ref, []))),
                "nop_downstream": ref == nop_station,
            }
        )

    edges = [
        {"from": st["parent"], "to": st["id"], "open": st["nop_downstream"]}
        for st in stations
        if st["parent"] is not None
    ]
    # GPZ→root-trunk edges (stations whose parent is None hang off the GPZ).
    for st in stations:
        if st["parent"] is None:
            edges.append({"from": "GPZ", "to": st["id"], "open": st["nop_downstream"]})

    gpz_tr = next(
        (transformers[r] for r in gpz.get("transformer_refs", []) if r in transformers), None
    )
    # GPZ internals (full switchgear): WN/SN transformer(s) + busbar section(s) + outgoing feeder
    # field(s). Feeders are the GPZ's MV line bays — here the trunk head(s) hanging off the GPZ.
    gpz_transformers = [
        {
            "id": tr.split("/")[-1],
            "mva": round(float(transformers[tr].get("sn_mva", 0.0)), 1),
            "uhv_kv": round(float(transformers[tr].get("uhv_kv", 110.0)), 1),
            "ulv_kv": round(float(transformers[tr].get("ulv_kv", 15.0)), 1),
        }
        for tr in gpz.get("transformer_refs", [])
        if tr in transformers
    ]
    heads = [st for st in stations if st["parent"] is None]
    gpz_sections = []
    for sec in gpz.get("gpz_sections", []) or []:
        names = sec.get("line_field_names") or (
            [sec.get("line_field_name")] if sec.get("line_field_name") else []
        )
        gpz_sections.append(
            {
                "name": sec.get("name", "Sekcja"),
                "order": int(sec.get("order", 0)),
                "feeders": [
                    {
                        "name": names[i] if i < len(names) else f"Pole {i + 1}",
                        "to": heads[i]["id"] if i < len(heads) else None,
                        "to_name": heads[i]["name"] if i < len(heads) else None,
                    }
                    for i in range(
                        max(len(names), len(heads) if sec.get("order", 0) == 0 else 0, 1)
                    )
                ],
            }
        )
    return {
        "schema": "sld_network_model_v1",
        "gpz": {
            "id": "GPZ",
            "name": gpz.get("name", "GPZ"),
            "hv_kv": round(float(gpz_tr.get("uhv_kv", 110.0)), 1) if gpz_tr else 110.0,
            "sn_kv": round(bus_kv.get(root, 15.0), 1),
            "transformers": gpz_transformers,
            "sections": gpz_sections,
        },
        "stations": stations,
        "edges": sorted(
            ({"from": e["from"], "to": e["to"], "open": bool(e["open"])} for e in edges),
            key=lambda e: (e["from"], e["to"]),
        ),
        "nop_station": ref_to_id.get(nop_station) if nop_station else None,
        "voltages": sorted(
            {110.0, *(st["sn_kv"] for st in stations), *(st["nn_kv"] for st in stations)},
            reverse=True,
        ),
    }
