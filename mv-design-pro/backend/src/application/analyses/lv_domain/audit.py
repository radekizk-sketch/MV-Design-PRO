"""Audyt topologii domeny nN (kontrakt 3.0.0, mandat „profesjonalizacja SLD nN"
§34) — komunikaty walidacji CZYTANE przez renderer, NIGDY liczone w nim.

Warstwa APLIKACJI, zero fizyki: każdy komunikat wynika z KSZTAŁTU grafu domeny
(`graph_view.build_lv_domain_view`) i stanów łączników, nie z liczb solvera.
Kody NN-AUD-06/08/09/14/15/16/17 (konflikt źródeł, brak odniesienia N/PE,
wyspa bez źródła tworzącego napięcie, zdolność DER nieznana, zasilanie
zwrotne, wiele źródeł tworzących, deficyt bilansu) powstają w
`energization.py` przy wyspie, do której należą — ten moduł dokłada resztę
listy §34 i scala wszystko w JEDNĄ, deterministyczną listę projekcji.

Lista kodów (ZAMKNIĘTA — dopisanie kodu bez wpisu tutaj jest naruszeniem):

| kod        | znaczenie                                              | waga      |
|------------|--------------------------------------------------------|-----------|
| NN-AUD-01  | zacisk wiszący (jedna gałąź, nic więcej)               | IMPORTANT |
| NN-AUD-02  | odpływ do niczego (poddrzewo bez odbioru/źródła/…)     | IMPORTANT |
| NN-AUD-03  | domena bez strukturalnego źródła (zero TR i Source)    | BLOCKER   |
| NN-AUD-04  | źródło rozproszone na szynie bez żadnego połączenia    | IMPORTANT |
| NN-AUD-05  | zamknięta gałąź między różnymi poziomami napięcia      | BLOCKER   |
| NN-AUD-06  | konflikt źródeł (energization.py)                      | BLOCKER   |
| NN-AUD-07  | brak aparatu w torze (odpływ/źródło/odbiór/TR)         | IMPORTANT |
| NN-AUD-08  | brak odniesienia N/PE wyspy (energization.py)          | IMPORTANT |
| NN-AUD-09  | wyspa bez źródła tworzącego napięcie (energization.py) | IMPORTANT |
| NN-AUD-10  | wspólne zasilanie SN kilku transformatorów (info)      | INFO      |
| NN-AUD-11  | niepoprawne przyłączenie transformatora                | BLOCKER   |
| NN-AUD-12  | niemożliwe sprzężenie sekcji                           | BLOCKER   |
| NN-AUD-13  | projekcja z wynikiem nieaktualnym                      | IMPORTANT |
| NN-AUD-14  | zdolność pracy wyspowej DER nieznana (energization.py) | IMPORTANT |
| NN-AUD-15  | zasilanie zwrotne transformatora (energization.py)     | IMPORTANT |
| NN-AUD-16  | kilka źródeł tworzących napięcie (energization.py)     | IMPORTANT |
| NN-AUD-17  | deficyt bilansu mocy znamionowej wyspy (energization)  | IMPORTANT |
"""

from __future__ import annotations

from typing import Any

from enm.severity import SEVERITY_BLOCKER, SEVERITY_IMPORTANT, SEVERITY_INFO

from .energization import ValidationMessage

AUDIT_CODES: tuple[str, ...] = tuple(f"NN-AUD-{i:02d}" for i in range(1, 18))


def _msg(code: str, severity: str, text: str, refs: list[str]) -> ValidationMessage:
    return ValidationMessage(
        code=code, severity=severity, message_pl=text, element_refs=tuple(refs)
    )


def audit_lv_domain_graph(graph: dict[str, Any]) -> list[ValidationMessage]:
    """Audyt KSZTAŁTU grafu domeny (bez komunikatów wysp — te niesie graf)."""
    if graph.get("status") != "OK":
        return []
    messages: list[ValidationMessage] = []

    buses: list[dict[str, Any]] = list(graph.get("buses", []))
    bus_by_ref = {b["ref_id"]: b for b in buses}
    branches: list[dict[str, Any]] = list(graph.get("branches", []))
    devices: list[dict[str, Any]] = list(graph.get("devices", []))
    transformers: list[dict[str, Any]] = list(graph.get("transformers", []))
    generators: list[dict[str, Any]] = list(graph.get("generators", []))
    loads: list[dict[str, Any]] = list(graph.get("loads", []))
    islands: list[dict[str, Any]] = list(graph.get("islands", []))

    degree: dict[str, int] = {ref: 0 for ref in bus_by_ref}
    for branch in branches:
        for end in (branch["from_bus_ref"], branch["to_bus_ref"]):
            if end in degree:
                degree[end] += 1
    transformer_lv_refs = {t["lv_bus_ref"] for t in transformers}
    generator_bus_refs = {g["bus_ref"] for g in generators}
    load_bus_refs = {ld["bus_ref"] for ld in loads}
    boundary_from_refs = {link["from_bus_ref"] for link in graph.get("boundary_links", [])}

    # NN-AUD-01: zacisk wiszący — jedna gałąź i nic więcej na zacisku toru.
    for bus in buses:
        ref = bus["ref_id"]
        if bus.get("is_board"):
            continue
        attached = (
            degree.get(ref, 0)
            + (1 if ref in transformer_lv_refs else 0)
            + (1 if ref in generator_bus_refs else 0)
            + (1 if ref in load_bus_refs else 0)
            + (1 if ref in boundary_from_refs else 0)
        )
        if attached == 1:
            messages.append(
                _msg(
                    "NN-AUD-01",
                    SEVERITY_IMPORTANT,
                    f"Zacisk {bus['name']} ({ref}) wisi na jednej gałęzi bez odbioru, "
                    "źródła ani dalszego toru — tor kończy się w powietrzu.",
                    [ref],
                )
            )

    # NN-AUD-02: odpływ do niczego.
    for device in devices:
        if device["device_role"] == "feeder" and device.get("feeder_kind") == "none":
            messages.append(
                _msg(
                    "NN-AUD-02",
                    SEVERITY_IMPORTANT,
                    f"Odpływ {device['ref_id']} z szyny {device['board_bus_ref']} nie prowadzi "
                    "do żadnego odbioru, źródła, podrozdzielnicy ani granicy domeny.",
                    [device["ref_id"]],
                )
            )

    # NN-AUD-03: domena bez strukturalnego źródła.
    grid_source_refs = sorted(
        {ref for island in islands for ref in island.get("grid_source_refs", [])}
    )
    if not transformers and not grid_source_refs:
        messages.append(
            _msg(
                "NN-AUD-03",
                SEVERITY_BLOCKER,
                "Domena nN nie ma żadnego transformatora ani źródła sieciowego — "
                "szyny rozdzielnicy są strukturalnie niezasilone.",
                sorted(bus_by_ref),
            )
        )

    # NN-AUD-04: źródło rozproszone na szynie bez żadnego połączenia.
    for gen in generators:
        bus_ref = gen["bus_ref"]
        if (
            degree.get(bus_ref, 0) == 0
            and bus_ref not in transformer_lv_refs
            and not bus_by_ref.get(bus_ref, {}).get("is_board")
        ):
            messages.append(
                _msg(
                    "NN-AUD-04",
                    SEVERITY_IMPORTANT,
                    f"Źródło {gen['name']} ({gen['ref_id']}) stoi na szynie {bus_ref} bez żadnej "
                    "gałęzi — odizolowane od reszty domeny.",
                    [gen["ref_id"], bus_ref],
                )
            )

    # NN-AUD-05: zamknięta gałąź między różnymi poziomami napięcia.
    for branch in branches:
        a = bus_by_ref.get(branch["from_bus_ref"])
        b = bus_by_ref.get(branch["to_bus_ref"])
        if a is None or b is None or branch.get("status") != "closed":
            continue
        if a["voltage_level_id"] != b["voltage_level_id"]:
            messages.append(
                _msg(
                    "NN-AUD-05",
                    SEVERITY_BLOCKER,
                    f"Zamknięta gałąź {branch['ref_id']} łączy szyny o różnych poziomach "
                    f"napięcia ({a['voltage_kv']} kV i {b['voltage_kv']} kV) bez transformatora.",
                    [branch["ref_id"]],
                )
            )

    # NN-AUD-07: brak aparatu w torze.
    for device in devices:
        if device["device_role"] == "feeder" and device["device_type"] in (
            "cable",
            "line_overhead",
        ):
            messages.append(
                _msg(
                    "NN-AUD-07",
                    SEVERITY_IMPORTANT,
                    f"Odpływ {device['ref_id']} z szyny {device['board_bus_ref']} zaczyna się "
                    "kablem bez aparatu zabezpieczającego w korzeniu.",
                    [device["ref_id"]],
                )
            )
    for gen in generators:
        if bus_by_ref.get(gen["bus_ref"], {}).get("is_board"):
            messages.append(
                _msg(
                    "NN-AUD-07",
                    SEVERITY_IMPORTANT,
                    f"Źródło {gen['name']} ({gen['ref_id']}) przyłączone wprost do szyny "
                    f"{gen['bus_ref']} bez pola (aparat, kabel, punkt przyłączenia).",
                    [gen["ref_id"]],
                )
            )
    for load in loads:
        if bus_by_ref.get(load["bus_ref"], {}).get("is_board"):
            messages.append(
                _msg(
                    "NN-AUD-07",
                    SEVERITY_IMPORTANT,
                    f"Odbiór {load['name']} ({load['ref_id']}) przyłączony wprost do szyny "
                    f"{load['bus_ref']} bez pola odpływowego.",
                    [load["ref_id"]],
                )
            )
    incomer_transformers = {d["transformer_ref"] for d in devices if d["device_role"] == "incomer"}
    for trafo in transformers:
        if trafo["ref_id"] not in incomer_transformers:
            messages.append(
                _msg(
                    "NN-AUD-07",
                    SEVERITY_IMPORTANT,
                    f"Transformator {trafo['name']} ({trafo['ref_id']}) bez wyłącznika głównego "
                    "nN — zacisk nN wchodzi na szynę bez aparatu.",
                    [trafo["ref_id"]],
                )
            )

    # NN-AUD-10: wspólne zasilanie SN kilku transformatorów (informacja dla
    # renderera: jedna kotwica, nie dwa niezależne systemy).
    by_system: dict[str, list[str]] = {}
    for trafo in transformers:
        system_id = trafo.get("upstream_system_id")
        if system_id:
            by_system.setdefault(str(system_id), []).append(trafo["ref_id"])
    for system_id, refs in sorted(by_system.items()):
        if len(refs) > 1:
            messages.append(
                _msg(
                    "NN-AUD-10",
                    SEVERITY_INFO,
                    f"Transformatory {', '.join(sorted(refs))} mają wspólne zasilanie SN "
                    f"(system {system_id}) — jedno źródło, nie dwa niezależne.",
                    sorted(refs),
                )
            )

    # NN-AUD-11: niepoprawne przyłączenie transformatora.
    for trafo in transformers:
        lv_bus = bus_by_ref.get(trafo["lv_bus_ref"])
        if lv_bus is None:
            continue
        expected_level = _voltage_level_id(float(trafo["ulv_kv"]))
        if lv_bus["voltage_level_id"] != expected_level:
            messages.append(
                _msg(
                    "NN-AUD-11",
                    SEVERITY_BLOCKER,
                    f"Transformator {trafo['ref_id']}: napięcie dolne {trafo['ulv_kv']} kV nie "
                    f"odpowiada szynie nN {lv_bus['ref_id']} ({lv_bus['voltage_kv']} kV).",
                    [trafo["ref_id"], lv_bus["ref_id"]],
                )
            )
        if trafo["hv_bus_ref"] in bus_by_ref:
            messages.append(
                _msg(
                    "NN-AUD-11",
                    SEVERITY_BLOCKER,
                    f"Transformator {trafo['ref_id']} ma OBIE strony w domenie nN "
                    f"(szyna górna {trafo['hv_bus_ref']} jest szyną nN).",
                    [trafo["ref_id"]],
                )
            )

    # NN-AUD-12: niemożliwe sprzężenie sekcji.
    for device in devices:
        if device["device_role"] != "coupler":
            continue
        a = bus_by_ref.get(device["terminal_a"])
        b = bus_by_ref.get(device["terminal_b"])
        if device["terminal_a"] == device["terminal_b"]:
            messages.append(
                _msg(
                    "NN-AUD-12",
                    SEVERITY_BLOCKER,
                    f"Sprzęgło {device['ref_id']} ma oba zaciski na tej samej szynie "
                    f"{device['terminal_a']}.",
                    [device["ref_id"]],
                )
            )
            continue
        if a is None or b is None:
            continue
        if a["voltage_level_id"] != b["voltage_level_id"]:
            messages.append(
                _msg(
                    "NN-AUD-12",
                    SEVERITY_BLOCKER,
                    f"Sprzęgło {device['ref_id']} łączy sekcje o różnych poziomach napięcia "
                    f"({a['voltage_kv']} kV i {b['voltage_kv']} kV).",
                    [device["ref_id"]],
                )
            )
        if not (a.get("is_board") and b.get("is_board")):
            messages.append(
                _msg(
                    "NN-AUD-12",
                    SEVERITY_BLOCKER,
                    f"Sprzęgło {device['ref_id']} nie łączy dwóch szyn rozdzielnicy "
                    f"({device['terminal_a']} ↔ {device['terminal_b']}).",
                    [device["ref_id"]],
                )
            )

    return messages


def _voltage_level_id(voltage_kv: float) -> str:
    from .graph_view import voltage_level_id

    return voltage_level_id(voltage_kv)


def collect_validation_messages(
    graph: dict[str, Any], *, result_status: str | None
) -> list[dict[str, Any]]:
    """JEDNA lista komunikatów projekcji: wyspy (graf) + audyt kształtu +
    świeżość wyniku. Deterministyczna kolejność: kod, elementy, treść."""
    messages: list[ValidationMessage] = list(audit_lv_domain_graph(graph))
    for island in graph.get("islands", []) if graph.get("status") == "OK" else []:
        for raw in island.get("validation_messages", []):
            messages.append(
                ValidationMessage(
                    code=raw["code"],
                    severity=raw["severity"],
                    message_pl=raw["message_pl"],
                    element_refs=tuple(raw.get("element_refs", [])),
                )
            )
    if result_status == "OUTDATED":
        messages.append(
            _msg(
                "NN-AUD-13",
                SEVERITY_IMPORTANT,
                "Wynik przypięty do projekcji jest nieaktualny wobec bieżącego modelu — "
                "wartości wyników pokazywane są jako NIEAKTUALNE, nie jako bieżące.",
                [],
            )
        )
    unique = {(m.code, m.element_refs, m.message_pl): m for m in messages}
    ordered = sorted(unique.values(), key=lambda m: (m.code, m.element_refs, m.message_pl))
    return [m.to_dict() for m in ordered]
