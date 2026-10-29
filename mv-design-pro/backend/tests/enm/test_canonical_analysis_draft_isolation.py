"""Guards for V12.xx draft UI vs committed ENM isolation."""

import pytest
from enm.assembler import (
    _short_circuit_type_from_options,
)
from enm.canonical_analysis import (
    build_execution_result_set,
    build_short_circuit_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm
from network_model.solvers.short_circuit_iec60909 import ShortCircuitType

from tests.catalog_test_helpers import gpz_source_record


def _valid_enm_payload(name: str) -> dict:
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "B1",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            }
        ],
        "branches": [],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=15.0,
                    sk3_mva=200.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _valid_enm_payload_with_z0(name: str) -> dict:
    """Sieć ze składową zerową zatwierdzoną w ENM: równoważnik sieci 110 kV z R0/X0.

    Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3: Z0 źródła opisuje WYŁĄCZNIE sieć za
    granicą modelu po stronie 110 kV — źródło w paśmie SN nie wnosi Z0 (uziemienie sieci SN
    to zespół uziemiający sekcji albo uzwojenie transformatora). Intencja testu (bieg 1F /
    2F+Z z Z0 zatwierdzonym w ENM jest raportowalny) zostaje — na szynie 110 kV."""
    payload = _valid_enm_payload(name)
    payload["buses"][0]["voltage_kv"] = 110
    payload["sources"][0].update(
        {
            **gpz_source_record(
                ref_id="s1",
                name="S1",
                bus_ref="b1",
                voltage_kv=110.0,
                sk3_mva=3000.0,
                rx_ratio=0.10,
            ),
            "r0_ohm": 0.16,
            "x0_ohm": 1.6,
        }
    )
    return payload


def _valid_enm_payload_with_helper_terminal(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["buses"].append(
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "ref_id": "b_helper",
            "name": "Zacisk techniczny",
            "tags": ["helper_bus", "field_terminal"],
            "meta": {
                "render_on_sld": False,
                "show_in_project_tree": False,
            },
            "voltage_kv": 15,
            "phase_system": "3ph",
        }
    )
    # Szyna POMOCNICZA o kształcie refu sekcji GPZ. V12K-184: „techniczność" musi
    # być wyrażona W DANYCH (tag `helper_bus`), a nie wywnioskowana ze wzorca
    # `ref_id` — bo PRAWDZIWA szyna sekcji SN GPZ (z `add_grid_source_sn`) ma
    # dokładnie taki sam ref_id, puste tagi i pustą meta, więc reguła na wzorzec
    # ścieżki wykluczała z celów zwarcia główną szynę rozdzielni (patrz szyna
    # `gpz/real/section/001/bus_sn` niżej, która MUSI być raportowana).
    payload["buses"].append(
        {
            "id": "00000000-0000-0000-0000-000000000005",
            "ref_id": "gpz/test/section/001/bus_sn",
            "name": "Szyna techniczna sekcji GPZ",
            "tags": ["helper_bus"],
            "meta": {},
            "voltage_kv": 15,
            "phase_system": "3ph",
        }
    )
    # Kontrola dodatnia: REALNA szyna sekcji SN GPZ — bez tagów, bez meta.
    # Jest głównym punktem doboru aparatury rozdzielni, więc MUSI trafić do
    # wyników zwarciowych.
    payload["buses"].append(
        {
            "id": "00000000-0000-0000-0000-000000000007",
            "ref_id": "gpz/real/section/001/bus_sn",
            "name": "Szyna GPZ S1 15 kV",
            "tags": [],
            "meta": {},
            "voltage_kv": 15,
            "phase_system": "3ph",
        }
    )
    payload["branches"].append(
        {
            "id": "00000000-0000-0000-0000-000000000004",
            "ref_id": "brk_helper",
            "name": "Aparat pola",
            "tags": [],
            "meta": {"render_on_sld": False, "show_in_project_tree": False},
            "from_bus_ref": "b1",
            "to_bus_ref": "b_helper",
            "status": "closed",
            "type": "breaker",
            "r_ohm": 0.0,
            "x_ohm": 0.0,
        }
    )
    payload["branches"].append(
        {
            "id": "00000000-0000-0000-0000-000000000006",
            "ref_id": "brk_section_bus",
            "name": "Lacznik szyny technicznej",
            "tags": [],
            "meta": {"render_on_sld": False, "show_in_project_tree": False},
            "from_bus_ref": "b1",
            "to_bus_ref": "gpz/test/section/001/bus_sn",
            "status": "closed",
            "type": "breaker",
            "r_ohm": 0.0,
            "x_ohm": 0.0,
        }
    )
    payload["branches"].append(
        {
            "id": "00000000-0000-0000-0000-000000000008",
            "ref_id": "brk_real_section_bus",
            "name": "Lacznik szyny GPZ",
            "tags": [],
            "meta": {},
            "from_bus_ref": "b1",
            "to_bus_ref": "gpz/real/section/001/bus_sn",
            "status": "closed",
            "type": "breaker",
            "r_ohm": 0.0,
            "x_ohm": 0.0,
        }
    )
    return payload


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def test_execute_run_uses_frozen_snapshot_not_post_creation_enm_mutation():
    case_id = "draft-isolation-sc"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload("Sieć pierwotna")))

    run = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn")
    frozen_hash = run.snapshot_hash
    frozen_name = run.snapshot["header"]["name"]

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(_valid_enm_payload("Siec zmieniona po zamrozeniu")),
    )

    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.snapshot_hash == frozen_hash
    assert result.snapshot["header"]["name"] == frozen_name
    assert result.snapshot["header"]["name"] == "Sieć pierwotna"
    assert result.raw_result is not None
    assert result.raw_result["enm_hash"] == frozen_hash


def test_short_circuit_does_not_report_helper_field_terminals():
    case_id = "canonical-sc-helper-terminal"
    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            _valid_enm_payload_with_helper_terminal("Siec z zaciskiem technicznym")
        ),
    )

    run = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn")
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.raw_result is not None
    rows = build_short_circuit_results(result)["rows"]
    assert rows
    reported = {row["element_id"] for row in rows}
    # Szyny POMOCNICZE (jawny tag `helper_bus`) nie są celem zwarcia…
    assert "b_helper" not in reported
    assert "gpz/test/section/001/bus_sn" not in reported
    # …ale realna szyna sekcji SN GPZ JEST (V12K-184: kryterium to tag w danych,
    # nie wzorzec ref_id ani flagi prezentacyjne — inaczej z wyników znikał punkt,
    # w którym liczy się moc zwarciową dla doboru rozdzielni).
    assert "gpz/real/section/001/bus_sn" in reported
    assert all(row["target_name"] != "Zacisk techniczny" for row in rows)
    assert all(row["target_name"] != "Szyna techniczna sekcji GPZ" for row in rows)


def test_execute_run_supports_1f_when_z0_is_committed_in_enm():
    case_id = "canonical-sc-1f"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload_with_z0("Siec Z0")))

    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"fault_type": "1F"},
    )
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.to_execution_dict()["analysis_type"] == "SC_1F"
    assert result.raw_result is not None
    assert result.raw_result["analysis_type"] == "short_circuit_1f"
    assert result.raw_result["short_circuit_type"] == "1F"
    assert result.raw_result["reporting_status"] == "reportable"
    assert result.raw_result["proof_status"] == "complete"
    assert result.raw_result["results"][0]["short_circuit_type"] == "1F"
    assert result.raw_result["results"][0]["reporting_status"] == "reportable"
    assert result.raw_result["results"][0]["proof_status"] == "complete"
    assert result.raw_result["results"][0]["proof_ref"].startswith("proof:short-circuit:")
    assert result.raw_result["results"][0]["proof_binding"]["z0_source"] == "ENM_COMMITTED"
    assert "z0_ohm" in result.raw_result["results"][0]["white_box_trace"][0]["inputs"]
    # Delta FROZEN V12K-128 (addytywnie): składowe symetryczne w pozycji wyniku
    # (nie tylko w śladzie). Bieg doziemny 1F → pełen komplet Z1/Z2/Z0.
    item0 = result.raw_result["results"][0]
    for pole in ("z1_ohm", "z2_ohm", "z0_ohm"):
        assert isinstance(item0[pole], dict), pole
        assert "re" in item0[pole] and "im" in item0[pole], pole
    # GAP passthrough (V12K-128): wymóg/źródło Z0 na poziomie pozycji wyniku.
    assert item0["requires_z0"] is True
    assert item0["z0_source"] == "ENM_COMMITTED"

    rows = build_short_circuit_results(result)["rows"]
    assert rows[0]["reporting_status"] == "reportable"
    assert rows[0]["proof_status"] == "complete"
    assert rows[0]["dopuszczalnosc_raportowa"] is True
    # Delta FROZEN V12K-128: składowe Z1/Z2/Z0 + GAP passthrough w wierszu
    # kanonicznym (konsument read-only ma komplet bilansu i wymóg Z0).
    for pole in ("z1_ohm", "z2_ohm", "z0_ohm"):
        assert isinstance(rows[0][pole], dict), pole
    assert rows[0]["requires_z0"] is True
    assert rows[0]["z0_source"] == "ENM_COMMITTED"

    execution_set = build_execution_result_set(result)
    assert execution_set["analysis_type"] == "SC_1F"
    assert execution_set["global_results"]["analysis_type"] == "short_circuit_1f"
    assert execution_set["element_results"][0]["proof_status"] == "complete"


def test_execute_run_supports_2fg_when_z0_is_committed_in_enm():
    case_id = "canonical-sc-2fg"
    set_enm(case_id, EnergyNetworkModel.model_validate(_valid_enm_payload_with_z0("Siec Z0")))

    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"fault_type": "2F+Z"},
    )
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.to_execution_dict()["analysis_type"] == "SC_2F_G"
    assert result.raw_result is not None
    assert result.raw_result["analysis_type"] == "short_circuit_2fg"
    assert result.raw_result["short_circuit_type"] == "2F+G"
    assert result.raw_result["reporting_status"] == "reportable"
    assert result.raw_result["proof_status"] == "complete"
    row = result.raw_result["results"][0]
    assert row["short_circuit_type"] == "2F+G"
    assert row["analysis_type"] == "short_circuit_2fg"
    assert row["reporting_status"] == "reportable"
    assert row["proof_status"] == "complete"
    assert row["proof_binding"]["trace_step_refs"]
    assert row["proof_binding"]["z0_source"] == "ENM_COMMITTED"
    assert "z0_ohm" in row["white_box_trace"][0]["inputs"]


def test_short_circuit_type_accepts_sc2fg_alias_from_ui():
    assert (
        _short_circuit_type_from_options({"fault_type": "2FG"}) is ShortCircuitType.TWO_PHASE_GROUND
    )
    assert (
        _short_circuit_type_from_options({"fault_type": "SC2FG"})
        is ShortCircuitType.TWO_PHASE_GROUND
    )


def _payload_kabla_bez_z0(r1_ohm_per_km: float) -> dict:
    payload = _valid_enm_payload("Siec bez Z0")
    payload["buses"].append({"ref_id": "b2", "name": "B2", "voltage_kv": 15, "phase_system": "3ph"})
    payload["branches"].append(
        {
            "ref_id": "kabel-bez-z0",
            "name": "Kabel bez danych zerowych",
            "type": "cable",
            "from_bus_ref": "b1",
            "to_bus_ref": "b2",
            "length_km": 1.0,
            "r_ohm_per_km": r1_ohm_per_km,
            "x_ohm_per_km": 0.086,
            # Pozycja katalogu bez R′0/X′0 — pozycja z danymi zerowymi materializuje je
            # przy zapisie modelu, więc nie dawałaby braku.
            "catalog_ref": "cable-incomplete-test",
        }
    )
    return payload


def test_create_1f_run_kabel_bez_z0_liczy_sie_z_wartoscia_robocza():
    """Zasada nr 4: kabel bez R′0/X′0 z dodatnimi R′1, X′1 nie odbiera modelowi zdolności
    zwarcia doziemnego — bieg 1F biegnie z wartością roboczą R′0 = 3·R′1, X′0 = 3·X′1,
    a założenie biegu ``branch.z0_wartosc_robocza`` nazywa kabel i wartości. Pozycja
    ``cable-incomplete-test`` nie ma składowej zerowej, a materializacja daje R′1 = 0,253,
    X′1 = 0,112 Ω/km: R′0 = 0,759, X′0 = 0,336 Ω/km; B′0 = B′1."""
    from enm.dane_przyjete_galezi import KOD_Z0_ROBOCZE

    case_id = "canonical-sc-1f-z0-robocze"
    set_enm(case_id, EnergyNetworkModel.model_validate(_payload_kabla_bez_z0(0.125)))
    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"fault_type": "1F"},
    )
    result = execute_run(run.id)
    assert result.status == "FINISHED", result.error_message
    (zalozenie,) = (z for z in result.raw_result["zalozenia"] if z.get("code") == KOD_Z0_ROBOCZE)
    assert zalozenie["element_ref"] == "kabel-bez-z0"
    assert "Kabel bez danych zerowych" in zalozenie["message_pl"]
    # B′0 kabla bez pojemności doziemnej w modelu: B′0 = B′1 (wartość robocza kabla SN z ekranem
    # nad każdą żyłą — karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, zasada nr 4) — trzecia dana.
    kabel = next(b for b in get_enm(case_id).branches if b.ref_id == "kabel-bez-z0")
    assert kabel.b0_siemens_per_km is None and kabel.b_siemens_per_km
    assert [d["wartosc"]["wartosc"] for d in zalozenie["dane_przyjete"]] == [
        0.759,
        0.336,
        pytest.approx(kabel.b_siemens_per_km, rel=1e-12),
    ]
    assert all(d["jakosc"] == "ESTIMATED" for d in zalozenie["dane_przyjete"])


def test_create_1f_run_blocks_without_z0_basis():
    """Brak Z0 GAŁĘZI bez podstawy wartości roboczej (W001: kabel bez R′0/X′0, R′1 = 0)
    odbiera modelowi zdolność zwarcia doziemnego — bieg 1F jest blokowany odmową nazwaną.
    Brak Z0 samego źródła nie blokuje (węzły jego sieci zerowej dostają nazwaną przyczynę
    ``brak_danych`` — karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3, test niżej)."""
    case_id = "canonical-sc-1f-missing-z0"
    set_enm(case_id, EnergyNetworkModel.model_validate(_payload_kabla_bez_z0(0.125)))
    # Projektant zmienia R′1 odcinka na 0 po materializacji pozycji katalogu — wartość
    # projektanta przeżywa uzupełnienie katalogu, a wartości roboczej nie ma z czego przyjąć.
    zapisany = get_enm(case_id)
    kabel = next(b for b in zapisany.branches if b.ref_id == "kabel-bez-z0")
    set_enm(
        case_id,
        zapisany.model_copy(
            update={
                "branches": [
                    b.model_copy(update={"r_ohm_per_km": 0.0}) if b is kabel else b
                    for b in zapisany.branches
                ]
            }
        ),
    )
    assert get_enm(case_id).branches[-1].r_ohm_per_km == 0.0

    with pytest.raises(ValueError, match="składowej zerowej Z0"):
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={"fault_type": "1F"},
        )


def test_1f_bez_z0_zrodla_110kv_nie_blokuje_a_nazywa_brak_danych():
    """Źródło 110 kV bez Z0 (W002): bieg 1F biegnie, wiersz szyny 110 kV jest
    nieraportowalny z nazwaną przyczyną ``fault.zero_sequence_missing_data`` i źródłem
    w elementach — status maszynowy związany z wyjaśnieniem, nie liczba z kotwicy."""
    case_id = "canonical-sc-1f-zrodlo-bez-z0"
    payload = _valid_enm_payload_with_z0("Siec 110 kV bez Z0 zrodla")
    for klucz in ("r0_ohm", "x0_ohm"):
        payload["sources"][0].pop(klucz)
    set_enm(case_id, EnergyNetworkModel.model_validate(payload))
    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"fault_type": "1F"},
    )
    result = execute_run(run.id)
    assert result.status == "FINISHED", result.error_message
    (row,) = build_short_circuit_results(result)["rows"]
    assert row["ikss_ka"] is None
    assert row["reporting_status"] == "not_reportable"
    assert row["non_physical_reason"] == "fault.zero_sequence_missing_data"
    assert row["brak_wyniku_zerowego"]["elementy"] == ["s1"]
    assert row["reporting_limitations_pl"] == [
        row["brak_wyniku_zerowego"]["wyjasnienie"]["zdanie_pl"]
    ]
