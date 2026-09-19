"""Scenariusze §47 jako testy obowiązkowe §46 (backend) + pin fixtur JSON.

Każdy scenariusz musi (a) dać projekcję o statusie OK, (b) nieść dokładnie te
fakty ruchowe, dla których został zbudowany, (c) być bajt w bajt tym, co leży
w `frontend/.../fixtures/generated/<slug>.json` (jedno źródło prawdy — frontend
nie ma własnej energizacji).
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from tests.application.analyses.lv_domain.scenariusze_nn import SCENARIUSZ_PO_SLUGU, SCENARIUSZE

_SKRYPT = Path(__file__).resolve().parents[4] / "scripts" / "eksport_fixtur_projekcji_nn.py"
_spec = importlib.util.spec_from_file_location("eksport_fixtur_projekcji_nn", _SKRYPT)
assert _spec is not None and _spec.loader is not None
eksport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eksport)


@pytest.fixture(scope="module")
def projekcje() -> dict[str, dict]:
    return {
        s.slug: eksport.normalizuj_projekcje(eksport.zbuduj_projekcje_scenariusza(s), s.slug)
        for s in SCENARIUSZE
    }


def _szyna(p: dict, ref: str) -> dict:
    return next(b for b in p["graph"]["buses"] if b["ref_id"] == ref)


def _wyspa_szyny(p: dict, ref: str) -> dict:
    return next(w for w in p["graph"]["islands"] if ref in w["bus_refs"])


def _segment(p: dict, ref: str) -> dict:
    return next(s for s in p["graph"]["segments"] if s["segment_id"] == ref)


def _kody(p: dict) -> set[str]:
    return {m["code"] for m in p["validation_messages"]}


class TestKazdyScenariusz:
    @pytest.mark.parametrize("slug", [s.slug for s in SCENARIUSZE])
    def test_projekcja_ok_i_kontrakt_3(self, projekcje, slug) -> None:
        p = projekcje[slug]
        assert p["status"] == "OK", slug
        assert p["contract_version"] == "3.0.0"
        assert p["graph"]["buses"] and p["graph"]["islands"]
        for bus in p["graph"]["buses"]:
            assert bus["energization_state"] in {
                "ENERGIZED",
                "DEENERGIZED",
                "UNKNOWN",
                "CONFLICT",
                "MULTISOURCE",
            }
            assert bus["island_ref"]
        for device in p["graph"]["devices"]:
            assert device["device_role"] in {"incomer", "feeder", "coupler", "boundary", "internal"}

    @pytest.mark.parametrize("slug", [s.slug for s in SCENARIUSZE])
    def test_json_w_repo_rowny_odpowiedzi_backendu(self, projekcje, slug) -> None:
        sciezka = eksport.FIXTURES_DIR / f"{slug}.json"
        assert sciezka.exists(), f"brak {sciezka} — uruchom scripts/eksport_fixtur_projekcji_nn.py"
        assert json.loads(sciezka.read_text(encoding="utf-8")) == projekcje[slug]

    def test_slugi_sa_unikalne_i_numerowane(self) -> None:
        numery = [int(s.slug[:2]) for s in SCENARIUSZE]
        assert numery == list(range(1, len(SCENARIUSZE) + 1))
        assert len(SCENARIUSZ_PO_SLUGU) == len(SCENARIUSZE)


class TestFaktyScenariuszy:
    def test_01_incomer_pomiar_zabezpieczenie(self, projekcje) -> None:
        p = projekcje["01_single_tr"]
        role = {d["ref_id"]: d for d in p["graph"]["devices"]}
        assert role["QF-T1"]["device_role"] == "incomer"
        assert role["QF-01"]["feeder_kind"] == "load"
        assert role["QF-02"]["feeder_kind"] == "sub_board"
        assert role["QF-03"]["feeder_kind"] == "der"
        assert [m["ref_id"] for m in p["graph"]["measurements"]] == ["CT-T1"]
        assert [z["breaker_ref"] for z in p["graph"]["protection_assignments"]] == ["QF-T1"]
        assert _kody(p) == set()

    def test_02_vs_03_sprzeglo_zmienia_stan_sekcji(self, projekcje) -> None:
        otwarte, zamkniete = projekcje["02_two_tr_qbc_open"], projekcje["03_two_tr_qbc_closed"]
        assert _szyna(otwarte, "RGnN-A")["supply_refs"] == ["TA"]
        assert _szyna(otwarte, "RGnN-B")["supply_refs"] == ["TB"]
        assert _szyna(otwarte, "RGnN-A")["energization_state"] == "ENERGIZED"
        assert _segment(otwarte, "QBC")["connectivity_state"] == "OPEN"
        assert _segment(otwarte, "QBC")["from_terminal"]["energization_state"] == "ENERGIZED"
        assert _segment(otwarte, "QBC")["to_terminal"]["energization_state"] == "ENERGIZED"
        assert _szyna(zamkniete, "RGnN-A")["supply_refs"] == ["TA", "TB"]
        assert _szyna(zamkniete, "RGnN-A")["energization_state"] == "MULTISOURCE"
        assert _segment(zamkniete, "QBC")["energization_state"] == "MULTISOURCE"
        sekcje = {s["section_id"]: s for s in otwarte["graph"]["sections"]}
        assert sekcje["A"]["coupler_refs"] == ["QBC"] and sekcje["B"]["coupler_refs"] == ["QBC"]
        kotwice = {u["transformer_ref"]: u for u in otwarte["upstream_equivalents"]}
        assert kotwice["TA"]["equivalent_id"] == kotwice["TB"]["equivalent_id"]
        assert "NN-AUD-10" in _kody(otwarte)

    def test_04_granica_domeny(self, projekcje) -> None:
        p = projekcje["04_shared_upstream_boundary"]
        assert [link["target_station_ref"] for link in p["graph"]["boundary_links"]] == ["stObca"]
        assert not any(b["ref_id"] == "RGnN-obca" for b in p["graph"]["buses"])
        role = {d["ref_id"]: d for d in p["graph"]["devices"]}
        assert "QS-B9" not in role  # gałąź graniczna nie jest urządzeniem domeny

    def test_05_vs_06_niezalezne_systemy(self, projekcje) -> None:
        dwie, konflikt = (
            projekcje["05_independent_upstream"],
            projekcje["06_conflict_parallel_sources"],
        )
        assert len(dwie["graph"]["islands"]) == 2
        assert {t["upstream_system_id"] for t in dwie["graph"]["transformers"]} == {"sn", "sn2"}
        assert "NN-AUD-10" not in _kody(dwie)
        assert len(konflikt["graph"]["islands"]) == 1
        assert konflikt["graph"]["islands"][0]["energization_state"] == "CONFLICT"
        assert "NN-AUD-06" in _kody(konflikt)
        # CV-4.3 K3b: IR przyjmuje węzeł SLACK per źródło — każda kotwica liczy równoważnik
        # Thevenina z WŁASNEJ wyspy (do K3b: „brak danych", dwa węzły SLACK odrzucane w IR).
        kotwice = {u["transformer_ref"]: u for u in dwie["upstream_equivalents"]}
        assert {u["status"] for u in kotwice.values()} == {"OK"}
        assert kotwice["TA"]["equivalent_id"] != kotwice["TB"]["equivalent_id"]
        assert (
            kotwice["TA"]["upstream_node_id"] == "sn" and kotwice["TB"]["upstream_node_id"] == "sn2"
        )
        # 06 (sprzęgło zamknięte): jedna wyspa z dwoma źródłami — równoważnik liczy superpozycję
        # obu GPZ (IEC 60909), konflikt pracy równoległej zostaje w komunikatach (NN-AUD-06).
        assert {u["status"] for u in konflikt["upstream_equivalents"]} == {"OK"}

    def test_07_08_09_wyspy_der(self, projekcje) -> None:
        podazajace = _wyspa_szyny(projekcje["07_island_grid_following"], "RGN-D_szyna")
        tworzace = _wyspa_szyny(projekcje["08_island_grid_forming"], "RGN-D_szyna")
        nieznane = _wyspa_szyny(projekcje["09_island_unknown"], "RGN-D_szyna")
        assert podazajace["energization_state"] == "DEENERGIZED"
        assert podazajace["is_islanded"] and not podazajace["has_grid_forming_source"]
        assert "NN-AUD-09" in _kody(projekcje["07_island_grid_following"])
        assert tworzace["energization_state"] == "ENERGIZED"
        assert tworzace["has_grid_forming_source"] is True
        assert tworzace["energizing_source_ids"] == ["QF-D1_zrodlo"]
        assert tworzace["power_balance"]["state"] == "nadwyzka"
        assert tworzace["neutral_reference"]["status"] == "brak_zrodla"
        assert tworzace["island_operation_allowed"] is False
        assert nieznane["energization_state"] == "UNKNOWN"
        assert nieznane["is_energized"] is None
        assert "NN-AUD-14" in _kody(projekcje["09_island_unknown"])

    def test_10_sekcja_niezasilona(self, projekcje) -> None:
        p = projekcje["10_deenergized_section"]
        assert _szyna(p, "RGnN-B")["energization_state"] == "DEENERGIZED"
        assert _szyna(p, "QF-B1_koniec")["energization_state"] == "DEENERGIZED"
        assert _szyna(p, "TB_zacisk")["energization_state"] == "ENERGIZED"
        seg = _segment(p, "QF-TB")
        assert seg["connectivity_state"] == "OPEN"
        assert seg["from_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["to_terminal"]["energization_state"] == "DEENERGIZED"
        assert _szyna(p, "RGnN-A")["energization_state"] == "ENERGIZED"

    def test_11_energizacja_dwustronna(self, projekcje) -> None:
        p = projekcje["11_double_sided_open"]
        seg = _segment(p, "QF-B3")
        assert seg["connectivity_state"] == "OPEN"
        assert seg["from_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["to_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["from_terminal"]["island_ref"] != seg["to_terminal"]["island_ref"]
        assert seg["from_terminal"]["supply_refs"] == ["TB"]
        assert seg["to_terminal"]["supply_refs"] == ["QF-C1_zrodlo"]

    def test_12_pelny_tor_der(self, projekcje) -> None:
        p = projekcje["12_der_full_path"]
        gen = {g["ref_id"]: g for g in p["graph"]["generators"]}
        assert gen["QF-PV1_zrodlo"]["island_capability"] == "GRID_FOLLOWING"
        assert gen["FU-BES_zrodlo"]["island_capability"] == "DUAL_MODE"
        assert gen["QF-G1_zrodlo"]["island_capability"] == "DUAL_MODE"
        assert {m["bus_ref"] for m in p["graph"]["measurements"]} == {
            "T1_zacisk",
            "QF-PV1_pcc",
            "QF-G1_pcc",
        }
        funkcje = {
            z["breaker_ref"]: z["function_codes"] for z in p["graph"]["protection_assignments"]
        }
        assert funkcje["QF-PV1"] == ["rocof_81R", "underfrequency_81U", "vector_shift_78"]
        assert _wyspa_szyny(p, "RGnN-1")["energization_state"] == "ENERGIZED"
        assert _kody(p) == set()

    def test_13_odbior_bez_pola_jest_audytem(self, projekcje) -> None:
        p = projekcje["13_loads_via_fields"]
        assert {
            d["device_type"] for d in p["graph"]["devices"] if d["device_role"] == "feeder"
        } == {
            "breaker",
            "switch",
            "disconnector",
            "fuse",
        }
        komunikaty = [m for m in p["validation_messages"] if m["code"] == "NN-AUD-07"]
        assert [m["element_refs"] for m in komunikaty] == [["odbior_bez_pola"]]

    def test_14_trzy_poziomy_magistral(self, projekcje) -> None:
        p = projekcje["14_sub_boards"]
        sekcje = {s["bus_ref"]: s for s in p["graph"]["sections"]}
        assert sekcje["RGnN-1"]["tier"] == "main"
        assert sekcje["RGN-2_szyna"]["tier"] == "sub" and sekcje["RGN-3_szyna"]["tier"] == "sub"
        # RGnN-1 (0) → zacisk QF-02 (1) → RGN-2 (2) → zacisk FU-22 (3) → RGN-3 (4)
        assert _szyna(p, "RGN-3_szyna")["hops_from_root"] == 4

    def test_15_dwanascie_odplywow(self, projekcje) -> None:
        p = projekcje["15_many_feeders"]
        assert len([d for d in p["graph"]["devices"] if d["device_role"] == "feeder"]) == 12

    def test_16_wynik_nieaktualny(self, projekcje) -> None:
        p = projekcje["16_stale_result"]
        assert p["result_snapshot"]["status"] == "OUTDATED"
        assert p["result_snapshot"]["analysis_type"]
        assert "NN-AUD-13" in _kody(p)

    def test_17_wyniki_zwarciowe_swieze(self, projekcje) -> None:
        p = projekcje["17_sc_results"]
        assert p["result_snapshot"]["status"] == "FRESH"
        elementy = p["result_snapshot"]["overlay_payload"]["elements"]
        assert "RGnN-1" in elementy
        assert "IK_3F_A" in elementy["RGnN-1"]["metrics"]

    def test_18_swz_mieszane(self, projekcje) -> None:
        p = projekcje["18_swz_overlay"]
        werdykty = {
            f["feeder_root_branch_ref"]: f["swz"]["swz"]["status"]
            for t in p["swz_snapshot"]["transformers"]
            for f in t["feeders"]
            if f["swz"].get("swz")
        }
        assert set(werdykty) == {"QF-01", "QF-02", "FU-03"}
        assert len(set(werdykty.values())) >= 2, werdykty
