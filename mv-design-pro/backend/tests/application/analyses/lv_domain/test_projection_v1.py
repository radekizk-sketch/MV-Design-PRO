"""Testy atomowej projekcji domeny nN — `LvDomainProjectionV1` (karta B-02).

ILOCZYN CECH (§0.7), nie przykład z karty: {1 TR, 2 TR} × {sprzęgło otwarte /
zamknięte / wspólna szyna} × {odpływy w obu sekcjach} × {DER: brak / PV na
sekcji / PV na wyspie} × {wyspa beznapięciowa} × {przebieg: brak / FRESH /
OUTDATED / z innego przypadku / niezakończony}.

Kombinacja „wyspa beznapięciowa × przebieg" jest NIEMOŻLIWA do zbudowania i nie
jest pominięta po cichu: model z wyspą odciętą od źródła nie przechodzi
walidacji (E003 BLOCKER), więc `create_run` go odrzuca — nie ma takiego stanu,
w którym istniałby przebieg policzony dla modelu z martwą wyspą. Wymiar
„przebieg" krzyżuje się więc z fiksturami bez wyspy.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.analyses.lv_domain import projection_v1
from application.analyses.lv_domain.projection_v1 import (
    LvDomainProjectionRunMismatch,
    LvDomainProjectionRunUnavailable,
    build_lv_domain_projection_v1,
)
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.hash import compute_enm_hash, compute_input_hash
from enm.models import Load
from enm.store import reset_enm_store, set_enm

from tests.application.analyses.lv_domain.fixtury_stacji_nn import zbuduj_stacje_nn


@pytest.fixture(autouse=True)
def _reset():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _projekcja(enm, case_id: str = "case-nn", **kwargs) -> dict[str, Any]:
    return build_lv_domain_projection_v1(enm, case_id, "stn", **kwargs)


def _odplywy_po_transformatorze(projekcja: dict[str, Any]) -> dict[str, list[str]]:
    return {
        row["transformer_ref"]: [f["feeder_root_branch_ref"] for f in row["feeders"]]
        for row in projekcja["swz_snapshot"]["transformers"]
    }


class TestKsztaltSwzSnapshot:
    def test_jeden_transformator_daje_jedna_pozycje_z_odplywem(self) -> None:
        projekcja = _projekcja(zbuduj_stacje_nn())
        swz = projekcja["swz_snapshot"]
        assert swz["status"] == "OK"
        assert swz["network_system"] == "TN-C-S"
        assert swz["missing_data"] == []
        assert _odplywy_po_transformatorze(projekcja) == {"tr1": ["ap_a"]}
        pozycja = swz["transformers"][0]
        assert pozycja["nn_bus_ref"] == "nn_a"
        assert pozycja["status"] == "OK"
        assert pozycja["missing_data"] == []

    def test_dwa_transformatory_daja_dwie_pozycje_kazda_ze_swoim_odplywem(self) -> None:
        """Sedno karty: odpływ sekcji B należy do TR2, nie do „pierwszego
        transformatora stacji"."""
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"))
        assert _odplywy_po_transformatorze(projekcja) == {"tr1": ["ap_a"], "tr2": ["ap_b"]}

    def test_kazdy_odplyw_wystepuje_dokladnie_raz_w_calej_stacji(self) -> None:
        """Przy sprzęgle ZAMKNIĘTYM oba transformatory „widzą" obie sekcje —
        gdyby przypisanie nie było rozłączne, ten sam odpływ miałby dwa różne
        werdykty SWZ w jednej odpowiedzi."""
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"))
        wszystkie = [
            feeder["feeder_root_branch_ref"]
            for row in projekcja["swz_snapshot"]["transformers"]
            for feeder in row["feeders"]
        ]
        assert sorted(wszystkie) == ["ap_a", "ap_b"]
        assert len(wszystkie) == len(set(wszystkie))

    def test_sprzeglo_otwarte_nie_gubi_odplywow_drugiej_sekcji(self) -> None:
        """Przed kartą B-02 odpływy sekcji B ZNIKAŁY z widoku przy otwartym
        sprzęgle (BFS szedł wyłącznie od szyny nN pierwszego transformatora)."""
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"))
        assert _odplywy_po_transformatorze(projekcja) == {"tr1": ["ap_a"], "tr2": ["ap_b"]}

    def test_dwa_transformatory_na_wspolnej_szynie_nie_dubluja_odplywow(self) -> None:
        """Brak „własnej sekcji" (oba TR na tej samej szynie) — odpływy trafiają
        do transformatora o mniejszym ref_id (rozstrzygnięcie deterministyczne),
        a drugi ZOSTAJE w odpowiedzi z pustą listą, nie znika."""
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, wspolna_szyna_nn=True))
        assert _odplywy_po_transformatorze(projekcja) == {"tr1": ["ap_a", "ap_b"], "tr2": []}


class TestZasilanieOdplywu:
    def test_sprzeglo_otwarte_daje_zasilanie_jednostronne_bez_zalozenia(self) -> None:
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"))
        for row in projekcja["swz_snapshot"]["transformers"]:
            for feeder in row["feeders"]:
                assert feeder["supply"] == "jednostronne"
                assert feeder["supply_assumption_pl"] is None

    def test_sprzeglo_zamkniete_daje_zasilanie_wielostronne_z_jawnym_zalozeniem(self) -> None:
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"))
        for row in projekcja["swz_snapshot"]["transformers"]:
            for feeder in row["feeders"]:
                assert feeder["supply"] == "wielostronne"
                assert "transformatora własnej sekcji" in feeder["supply_assumption_pl"]

    def test_jeden_transformator_zawsze_jednostronnie(self) -> None:
        projekcja = _projekcja(zbuduj_stacje_nn())
        feeder = projekcja["swz_snapshot"]["transformers"][0]["feeders"][0]
        assert feeder["supply"] == "jednostronne"
        assert feeder["supply_assumption_pl"] is None


class TestSwzLiczonaOdWlasciwegoTransformatora:
    """Dowód LICZBOWY, nie strukturalny: TR2 słabszy (0,25 MVA wobec 0,63 MVA)
    daje INNĄ impedancję pętli, więc werdykt SWZ odpływu sekcji B liczony „od
    pierwszego transformatora" różniłby się wartością Ik1_min."""

    @staticmethod
    def _ik_min(projekcja: dict[str, Any], transformer_ref: str, feeder_ref: str) -> float:
        row = next(
            r
            for r in projekcja["swz_snapshot"]["transformers"]
            if r["transformer_ref"] == transformer_ref
        )
        feeder = next(f for f in row["feeders"] if f["feeder_root_branch_ref"] == feeder_ref)
        return float(feeder["swz"]["fault_loop_min_scenario"]["ik_min_a"])

    def test_odplyw_sekcji_b_liczony_impedancja_tr2(self) -> None:
        projekcja = _projekcja(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", moc_tr2_mva=0.25)
        )
        ik_a = self._ik_min(projekcja, "tr1", "ap_a")
        ik_b = self._ik_min(projekcja, "tr2", "ap_b")
        assert ik_b < ik_a, "Słabszy TR2 musi dać mniejszy prąd zwarcia niż TR1"

        row_b = next(
            r for r in projekcja["swz_snapshot"]["transformers"] if r["transformer_ref"] == "tr2"
        )
        swz_b = row_b["feeders"][0]["swz"]
        assert swz_b["status"] == "OK"
        assert swz_b["transformer_ref"] == "tr2"

    def test_werdykt_swz_jest_rozstrzygniety_dla_obu_sekcji(self) -> None:
        projekcja = _projekcja(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="open", moc_tr2_mva=0.25)
        )
        for row in projekcja["swz_snapshot"]["transformers"]:
            werdykt = row["feeders"][0]["swz"]
            assert werdykt["status"] == "OK"
            assert werdykt["swz"]["status"] in {"spełnia", "nie spełnia"}
            assert werdykt["transformer_ref"] == row["transformer_ref"]


class TestEnergizacjaWProjekcji:
    def test_graf_projekcji_niesie_stan_zasilania_i_wyspy(self) -> None:
        projekcja = _projekcja(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="open", wyspa_odcieta=True)
        )
        stany = {bus["ref_id"]: bus for bus in projekcja["graph"]["buses"]}
        assert stany["wyspa"]["energization_state"] == "DEENERGIZED"
        assert stany["a2"]["supply_refs"] == ["tr1"]
        assert stany["b2"]["supply_refs"] == ["tr2"]
        assert len(projekcja["graph"]["islands"]) == 2
        assert {s["segment_id"] for s in projekcja["graph"]["segments"]} == {
            "ap_a",
            "c_a",
            "ap_b",
            "c_b",
            "coupler",
            "roz_wyspa",
        }

    def test_wyspa_der_widoczna_w_projekcji(self) -> None:
        projekcja = _projekcja(
            zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FORMING")
        )
        wyspa = next(w for w in projekcja["graph"]["islands"] if w["bus_refs"] == ["wyspa"])
        assert wyspa["is_islanded"] is True
        assert wyspa["has_grid_forming_source"] is True
        assert wyspa["energization_state"] == "ENERGIZED"

    def test_role_urzadzen_z_topologii(self) -> None:
        """§4/§8: rola urządzenia rozstrzygana w backendzie — incomer, odpływ
        (z rodzajem poddrzewa), sprzęgło."""
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"))
        role = {d["ref_id"]: d for d in projekcja["graph"]["devices"]}
        assert role["ap_a"]["device_role"] == "feeder"
        assert role["ap_a"]["feeder_kind"] == "load"
        assert role["ap_a"]["designation_class"] == "QF"
        assert role["ap_a"]["board_bus_ref"] == "nn_a"
        assert role["coupler"]["device_role"] == "coupler"
        assert role["coupler"]["designation_class"] == "QBC"
        assert role["coupler"]["device_state"] == "OPEN"
        assert role["c_a"]["device_role"] == "internal"
        sekcje = {s["bus_ref"]: s for s in projekcja["graph"]["sections"]}
        assert sekcje["nn_a"]["coupler_refs"] == ["coupler"]
        assert sekcje["nn_a"]["transformer_refs"] == ["tr1"]
        assert sekcje["nn_b"]["transformer_refs"] == ["tr2"]
        assert sekcje["nn_a"]["tier"] == "main"


class TestTozsamoscZasilaniaSn:
    def test_dwa_transformatory_na_tej_samej_szynie_sn_dziela_rownowaznik(self) -> None:
        """§10/§11: wspólny węzeł SN ⇒ ten sam `equivalent_id` i
        `upstream_system_id` — renderer rysuje JEDNĄ kotwicę."""
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"))
        kotwice = {u["transformer_ref"]: u for u in projekcja["upstream_equivalents"]}
        assert kotwice["tr1"]["equivalent_id"] == kotwice["tr2"]["equivalent_id"]
        assert kotwice["tr1"]["upstream_node_id"] == kotwice["tr2"]["upstream_node_id"] == "sn"
        assert kotwice["tr1"]["upstream_system_id"] == kotwice["tr2"]["upstream_system_id"] == "sn"
        assert kotwice["tr1"]["upstream_source_ids"] == ["src"]
        assert any(m["code"] == "NN-AUD-10" for m in projekcja["validation_messages"])

    def test_niezalezne_systemy_sn_maja_rozne_systemy_i_zrodla(self) -> None:
        """Tożsamość systemu SN i jego źródła pochodzą z TOPOLOGII (graf domeny),
        więc są dostępne także wtedy, gdy równoważnik Thevenina NIE jest
        obliczalny. POMIAR PRZYPIĘTY (ograniczenie zarejestrowane, nie ukryte):
        model z DWOMA źródłami sieciowymi ma dwa węzły SLACK, a rdzeń solvera
        (`network_model/core/graph.py::NetworkGraph` — zamrożony, B-01)
        dopuszcza dokładnie jeden — kotwice obu transformatorów meldują uczciwe
        „brak danych: upstream_network_topology_invalid" zamiast liczby."""
        projekcja = _projekcja(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="open", niezalezny_system_sn_tr2=True)
        )
        kotwice = {u["transformer_ref"]: u for u in projekcja["upstream_equivalents"]}
        assert kotwice["tr1"]["upstream_system_id"] == "sn"
        assert kotwice["tr2"]["upstream_system_id"] == "sn2"
        assert kotwice["tr1"]["upstream_source_ids"] == ["src"]
        assert kotwice["tr2"]["upstream_source_ids"] == ["src2"]
        for ref in ("tr1", "tr2"):
            assert kotwice[ref]["status"] == "brak danych"
            assert kotwice[ref]["missing_data"] == ["upstream_network_topology_invalid"]
            assert "equivalent_id" not in kotwice[ref]
        assert not any(m["code"] == "NN-AUD-10" for m in projekcja["validation_messages"])

    def test_spiecie_niezaleznych_systemow_daje_konflikt_w_komunikatach(self) -> None:
        projekcja = _projekcja(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", niezalezny_system_sn_tr2=True)
        )
        kody = [m["code"] for m in projekcja["validation_messages"]]
        assert "NN-AUD-06" in kody
        konflikt = next(m for m in projekcja["validation_messages"] if m["code"] == "NN-AUD-06")
        assert konflikt["severity"] == "BLOCKER"
        assert set(konflikt["element_refs"]) == {"tr1", "tr2"}


class TestKompletnosc:
    def test_komplet_danych_daje_complete(self) -> None:
        projekcja = _projekcja(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"))
        assert projekcja["completeness"] == "COMPLETE"
        assert projekcja["missing_data"] == []

    def test_brak_danych_jednego_transformatora_daje_partial_z_nazwanym_brakiem(self) -> None:
        """TR2 bez grupy połączeń — pętla od niego NIE JEST policzalna, ale
        odpowiedź nadal niesie odpływy TR1 i JAWNIE nazywa brak per
        transformator (nie „stacja bez danych")."""
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        enm.transformers[1].vector_group = None
        projekcja = _projekcja(enm)
        assert projekcja["completeness"] == "PARTIAL"
        assert "swz:tr2:vector_group" in projekcja["missing_data"]

        po_tr = {r["transformer_ref"]: r for r in projekcja["swz_snapshot"]["transformers"]}
        assert po_tr["tr1"]["status"] == "OK"
        assert po_tr["tr1"]["feeders"][0]["feeder_root_branch_ref"] == "ap_a"
        assert po_tr["tr2"]["status"] == "brak danych"
        assert po_tr["tr2"]["missing_data"] == ["vector_group"]
        assert po_tr["tr2"]["feeders"] == []
        assert projekcja["swz_snapshot"]["status"] == "OK"

    def test_uklad_it_daje_uczciwe_nie_dotyczy_dla_calej_stacji(self) -> None:
        projekcja = _projekcja(zbuduj_stacje_nn(uklad_uziemienia="IT"))
        swz = projekcja["swz_snapshot"]
        assert swz["status"] == "nie dotyczy"
        assert swz["network_system"] == "IT"
        assert swz["transformers"][0]["feeders"] == []
        assert "IT" in swz["reason_pl"]

    def test_nieznana_stacja_daje_unavailable(self) -> None:
        projekcja = build_lv_domain_projection_v1(zbuduj_stacje_nn(), "case-nn", "nie-ma-takiej")
        assert projekcja["completeness"] == "UNAVAILABLE"
        assert projekcja["swz_snapshot"]["status"] == "brak danych"
        assert projekcja["swz_snapshot"]["missing_data"] == ["station"]
        assert projekcja["swz_snapshot"]["transformers"] == []


class TestTozsamoscOdpowiedzi:
    def test_model_snapshot_niesie_tozsamosc_zadania(self) -> None:
        enm = zbuduj_stacje_nn()
        projekcja = build_lv_domain_projection_v1(enm, "case-abc", "stn", scenario="MIN")
        snapshot = projekcja["model_snapshot"]
        assert snapshot["case_id"] == "case-abc"
        assert snapshot["station_ref"] == "stn"
        assert snapshot["scenario_id"] == "MIN"
        assert snapshot["run_snapshot_hash"] is None
        assert snapshot["model_hash"] == compute_enm_hash(enm)

    def test_run_snapshot_hash_pochodzi_z_przebiegu(self) -> None:
        enm = zbuduj_stacje_nn()
        set_enm("case-run", enm)
        run = execute_run(create_run(case_id="case-run", analysis_type="PF").id)
        projekcja = build_lv_domain_projection_v1(enm, "case-run", "stn", run=run)
        assert projekcja["model_snapshot"]["run_snapshot_hash"] == run.snapshot_hash


class TestPrzebiegIWynik:
    def test_brak_przebiegu_daje_status_none(self) -> None:
        projekcja = _projekcja(zbuduj_stacje_nn())
        assert projekcja["result_snapshot"]["status"] == "NONE"
        assert projekcja["result_snapshot"]["overlay_payload"] is None

    def test_przebieg_na_biezacym_modelu_jest_fresh(self) -> None:
        enm = zbuduj_stacje_nn()
        set_enm("case-fresh", enm)
        run = execute_run(create_run(case_id="case-fresh", analysis_type="PF").id)
        projekcja = build_lv_domain_projection_v1(enm, "case-fresh", "stn", run=run)
        assert projekcja["result_snapshot"]["status"] == "FRESH"
        assert projekcja["result_snapshot"]["run_id"] == str(run.id)
        assert projekcja["model_snapshot"]["run_snapshot_hash"] == (
            projekcja["model_snapshot"]["model_hash"]
        )

    def test_model_zmieniony_po_przebiegu_daje_outdated(self) -> None:
        enm = zbuduj_stacje_nn()
        set_enm("case-outdated", enm)
        run = execute_run(create_run(case_id="case-outdated", analysis_type="PF").id)
        enm.loads.append(
            Load(ref_id="load_extra", name="Nowy odbiór", bus_ref="a1", p_mw=0.01, q_mvar=0.0)
        )
        projekcja = build_lv_domain_projection_v1(enm, "case-outdated", "stn", run=run)
        assert projekcja["result_snapshot"]["status"] == "OUTDATED"
        assert projekcja["model_snapshot"]["run_snapshot_hash"] != (
            projekcja["model_snapshot"]["model_hash"]
        )

    def test_przebieg_z_innego_przypadku_jest_odrzucony(self) -> None:
        enm = zbuduj_stacje_nn()
        set_enm("case-obcy", enm)
        run = execute_run(create_run(case_id="case-obcy", analysis_type="PF").id)
        with pytest.raises(LvDomainProjectionRunMismatch):
            build_lv_domain_projection_v1(enm, "case-nn", "stn", run=run)

    def test_przebieg_niezakonczony_jest_odrzucony(self) -> None:
        enm = zbuduj_stacje_nn()
        set_enm("case-pending", enm)
        run = create_run(case_id="case-pending", analysis_type="PF")
        assert run.status != "FINISHED"
        with pytest.raises(LvDomainProjectionRunUnavailable):
            build_lv_domain_projection_v1(enm, "case-pending", "stn", run=run)


class TestDeterminizmIOdciski:
    def test_dwa_wywolania_daja_identyczna_projekcje(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", wyspa_odcieta=True)
        assert _projekcja(enm) == _projekcja(enm)

    def test_zmiana_stanu_jednego_lacznika_pomiar_odciskow(self) -> None:
        """POMIAR (§0.6), nie założenie. Zmierzone w `enm/hash.py`:
        `compute_enm_hash` zrzuca CAŁY model bez wykluczania pola `status`
        gałęzi, więc odcisk modelu ZMIENIA SIĘ przy przestawieniu łącznika.
        Ortogonalny `compute_input_hash` status gałęzi WYKLUCZA (V12S-010) i
        pozostaje ten sam. Test przypina OBA fakty naraz, bo to one decydują,
        czy zmiana stanu łączeniowego unieważnia wyniki (`model_hash` jest
        kotwicą świeżości)."""
        zamkniete = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")
        otwarte = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")

        projekcja_zamknieta = _projekcja(zamkniete)
        projekcja_otwarta = _projekcja(otwarte)

        assert (
            projekcja_zamknieta["model_snapshot"]["operating_state_id"]
            != projekcja_otwarta["model_snapshot"]["operating_state_id"]
        )
        assert projekcja_zamknieta["projection_hash"] != projekcja_otwarta["projection_hash"]
        # POMIAR: `compute_enm_hash` OBEJMUJE stan łączników.
        assert compute_enm_hash(zamkniete) != compute_enm_hash(otwarte)
        assert (
            projekcja_zamknieta["model_snapshot"]["model_hash"]
            != projekcja_otwarta["model_snapshot"]["model_hash"]
        )
        # POMIAR: `compute_input_hash` stanu łączników NIE obejmuje.
        assert compute_input_hash(zamkniete) == compute_input_hash(otwarte)


class TestAtomowoscProjekcji:
    def test_podmiana_modelu_w_magazynie_w_trakcie_budowy_nie_zmienia_odpowiedzi(
        self, monkeypatch
    ) -> None:
        """§0.5: projekcja jest atomowa względem obiektu ENM pobranego RAZ.
        Symulujemy zapis współbieżny: w środku budowy (przy pierwszym kroku,
        czyli grafie domeny) magazyn dostaje INNY model. Odpowiedź musi opisywać
        model, z którym weszliśmy — inaczej jeden ekran złożyłby się z dwóch
        rewizji."""
        enm = zbuduj_stacje_nn()
        set_enm("case-atomic", enm)
        wzorzec = build_lv_domain_projection_v1(enm, "case-atomic", "stn")

        prawdziwy_graf = projection_v1.build_lv_domain_view
        podmieniony = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")

        def _graf_z_zapisem_wspolbieznym(model, station_ref):
            set_enm("case-atomic", podmieniony)
            return prawdziwy_graf(model, station_ref)

        monkeypatch.setattr(projection_v1, "build_lv_domain_view", _graf_z_zapisem_wspolbieznym)
        projekcja = build_lv_domain_projection_v1(enm, "case-atomic", "stn")

        assert projekcja["model_snapshot"]["model_hash"] == compute_enm_hash(enm)
        assert projekcja["model_snapshot"]["model_hash"] != compute_enm_hash(podmieniony)
        assert projekcja == wzorzec
