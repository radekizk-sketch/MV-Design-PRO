"""Testy PR-12 — CalculationReadinessService + ValidationProblemService + ReportReadinessAdapter."""

from __future__ import annotations

from application.calculation_readiness.service import (
    CALCULATION_LABEL_PL,
    CalculationReadinessService,
)
from application.report_readiness.adapter import ReportReadinessAdapter
from application.validation_problem.service import ValidationProblemService
from enm.models import (
    Bay,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    Source,
    Substation,
    Transformer,
)


def _header() -> ENMHeader:
    return ENMHeader(name="test")


def _empty_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(header=_header())


def _minimal_enm_with_pf_data() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=_header(),
        buses=[
            Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus_lv", name="Szyna nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Źródło GPZ",
                bus_ref="bus_sn",
                model="external_grid",
                sk3_mva=500.0,
            ),
        ],
        loads=[
            Load(
                ref_id="load_1",
                name="Odbiór 1",
                bus_ref="bus_lv",
                p_mw=0.5,
                q_mvar=0.2,
            ),
        ],
        branches=[
            Cable(
                ref_id="cab_1",
                name="Kabel SN F-01",
                from_bus_ref="bus_sn",
                to_bus_ref="bus_lv",
                length_km=2.5,
                r_ohm_per_km=0.16,
                x_ohm_per_km=0.10,
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr_1",
                name="TR1",
                hv_bus_ref="bus_sn",
                lv_bus_ref="bus_lv",
                sn_mva=0.4,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=10.0,
                vector_group="Dyn5",
            ),
        ],
    )


# ---------------------------------------------------------------------------
# CalculationReadinessService
# ---------------------------------------------------------------------------


class TestCalculationReadinessService:
    def test_empty_enm_blocks_power_flow(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_empty_enm())
        pf = report.get("power_flow")
        assert pf is not None
        assert pf.status == "blocked"
        assert any("źródło" in m for m in pf.missing_fields_pl)

    def test_minimal_enm_power_flow_ready(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_minimal_enm_with_pf_data())
        pf = report.get("power_flow")
        assert pf is not None
        assert pf.status == "ready"

    def test_power_flow_partial_when_generator_q_unknown(self) -> None:
        """Karta FAB-D2 (D3): Q generatora nieznany (brak jawnej wartości i
        brak Q-set-pointu w karcie katalogowej) => BLOCKER generator.q_missing,
        nie ciche 0 Mvar."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(ref_id="gen_1", name="Gen-01", bus_ref="bus_lv", p_mw=1.0, q_mvar=None)
        )
        svc = CalculationReadinessService()
        pf = svc.evaluate_single(enm, "power_flow")
        assert pf.status == "partial"
        assert any("generator.q_missing" in m for m in pf.missing_fields_pl)
        assert "gen_1" in pf.blocking_object_refs

    def test_power_flow_ready_when_generator_q_explicit(self) -> None:
        """Predykaty parami — ta sama kontrola, dana JAWNA: Q podany wprost
        (nawet 0.0) zostaje przyjęty bez zastrzeżeń, bo 0 Mvar tu jest DANĄ,
        nie brakiem."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(ref_id="gen_1", name="Gen-01", bus_ref="bus_lv", p_mw=1.0, q_mvar=0.0)
        )
        svc = CalculationReadinessService()
        pf = svc.evaluate_single(enm, "power_flow")
        assert pf.status == "ready"

    def test_power_flow_ready_when_generator_q_derived_from_fixed_setpoint(self) -> None:
        """Q-set-point WPROST w karcie katalogowej (qmin_mvar == qmax_mvar, tryb
        stałego Q) jest ODCZYTEM liczby już obecnej w danych — dozwolone bez
        BLOCKER-a (odróżnij od derywacji trygonometrycznej Q=P·tanφ, która
        NALEŻY do solvera, nie do tej bramki — patrz docstring
        `_generator_q_mvar_jawne`)."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="gen_1",
                name="Gen-01",
                bus_ref="bus_lv",
                p_mw=1.0,
                q_mvar=None,
                materialized_params={"qmin_mvar": 0.3, "qmax_mvar": 0.3},
            )
        )
        svc = CalculationReadinessService()
        pf = svc.evaluate_single(enm, "power_flow")
        assert pf.status == "ready"

    def test_short_circuit_partial_when_converter_k_sc_assumed(self) -> None:
        """Karta FAB-H: konwerter Z katalogiem, ale karta nie niesie k_sc =>
        WARNING/założenie `inverter.k_sc_assumed` — zwarcia się liczą (1,1
        przyjęte), status 'partial', nie 'blocked'/'ready' po cichu."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=1.0,
                catalog_ref="conv-pv-test",
                materialized_params={"un_kv": 0.4, "sn_mva": 1.0},
            )
        )
        svc = CalculationReadinessService()
        sc = svc.evaluate_single(enm, "short_circuit")
        assert sc.status == "partial"
        assert "inverter.k_sc_assumed" in (sc.recommended_action_pl or "")

    def test_short_circuit_ready_when_converter_k_sc_explicit_in_catalog(self) -> None:
        """Predykaty parami — dana JAWNA: k_sc w karcie katalogowej nie
        zgłasza założenia."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=1.0,
                catalog_ref="conv-pv-test",
                materialized_params={"un_kv": 0.4, "sn_mva": 1.0, "k_sc": 1.25},
            )
        )
        svc = CalculationReadinessService()
        sc = svc.evaluate_single(enm, "short_circuit")
        assert sc.status == "ready"

    def test_short_circuit_blocked_when_converter_has_no_catalog_ref(self) -> None:
        """Karta FAB-H: konwerter BEZ ŻADNEGO katalogu (catalog_ref=None, stan
        REALNY — brama katalogowa go nie wyklucza dla Generator) => BLOCKER
        `inverter.k_sc_missing`, różny od WARNING powyżej (tam katalog JEST)."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=1.0,
                catalog_ref=None,
            )
        )
        svc = CalculationReadinessService()
        sc = svc.evaluate_single(enm, "short_circuit")
        assert sc.status in ("partial", "blocked")
        assert any("inverter.k_sc_missing" in m for m in sc.missing_fields_pl)
        assert "pv_1" in sc.blocking_object_refs

    def test_short_circuit_ready_without_converter_generators(self) -> None:
        """Kontrola dwustronna: brak konwerterów => pętla k_sc jest no-opem,
        status bez zmian ('ready', jak dotąd — sieć bez DER nietknięta)."""
        enm = _minimal_enm_with_pf_data()
        svc = CalculationReadinessService()
        sc = svc.evaluate_single(enm, "short_circuit")
        assert sc.status == "ready"

    def test_short_circuit_k_sc_assumed_does_not_affect_power_flow(self) -> None:
        """Predykaty parami — inny typ obliczenia: k_sc (SC-only) nie wpływa
        na gotowość rozpływu mocy (Q jawne, więc power_flow zostaje 'ready')."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=1.0,
                q_mvar=0.0,
                catalog_ref="conv-pv-test",
                materialized_params={"un_kv": 0.4, "sn_mva": 1.0, "control_mode": "STALY_COS_PHI"},
            )
        )
        svc = CalculationReadinessService()
        report = svc.evaluate(enm)
        assert report.get("short_circuit").status == "partial"
        assert report.get("power_flow").status == "ready"

    def test_power_flow_partial_when_pv_control_mode_missing(self) -> None:
        """Karta FAB-D2 (D6): falownik PV bez control_mode w karcie katalogowej
        => BLOCKER pv.control_mode_missing (kod kanonu juz istniejacy w
        READINESS_CODES, wczesniej zarezerwowany bez emitera — reużyty zamiast
        tworzenia rownoleglego kodu; Q jawnie podany, żeby odizolować tę
        kontrolę od D3 powyżej — jedna zmienna na test)."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=1.0,
                q_mvar=0.0,
                materialized_params={},
            )
        )
        svc = CalculationReadinessService()
        pf = svc.evaluate_single(enm, "power_flow")
        assert pf.status == "partial"
        assert any("pv.control_mode_missing" in m for m in pf.missing_fields_pl)

    def test_power_flow_ready_when_pv_control_mode_present(self) -> None:
        """Predykaty parami — dana JAWNA: control_mode obecny nie blokuje."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=1.0,
                q_mvar=0.0,
                materialized_params={"control_mode": "STALY_COS_PHI"},
            )
        )
        svc = CalculationReadinessService()
        pf = svc.evaluate_single(enm, "power_flow")
        assert pf.status == "ready"

    def test_short_circuit_partial_when_missing_uk(self) -> None:
        enm = _minimal_enm_with_pf_data()
        # Wyzeruj uk_percent
        enm.transformers[0].uk_percent = 0.0
        svc = CalculationReadinessService()
        sc = svc.evaluate_single(enm, "short_circuit")
        assert sc.status in ("partial", "blocked")
        assert any("u_k" in m for m in sc.missing_fields_pl)

    def test_stability_partial_with_der_default_profile_after_pr15_impl(self) -> None:
        """Po PR-15-impl: stabilność ROZWIĄZUJE profil DER (solver podpięty), ale
        bez jawnego dynamic_profile_id profil pochodzi z DOMYŚLNEJ wartości
        katalogu — karta FAB-D2 (D8): to WARNING/założenie
        `der.dynamic_profile_default`, nie ciche 'ready' (przepisane z
        zachowaniem intencji: DER dostaje model, nie blokadę/n_a)."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=2.0,
            ),
        )
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "partial"
        assert "PR-15-impl" in (stab.recommended_action_pl or "")
        assert "der.dynamic_profile_default" in (stab.recommended_action_pl or "")

    def test_stability_n_a_without_der(self) -> None:
        enm = _minimal_enm_with_pf_data()
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "n_a"

    def test_frt_hvrt_partial_with_der_default_profile_after_pr16_impl(self) -> None:
        """Po PR-16-impl: FRT/HVRT ROZWIĄZUJE profil DER, ale bez jawnego
        dynamic_profile_id to profil DOMYŚLNY katalogu — karta FAB-D2 (D8):
        WARNING/założenie `der.dynamic_profile_default`, nie ciche 'ready'."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="bess_1",
                name="BESS-01",
                bus_ref="bus_lv",
                gen_type="bess",
                p_mw=1.0,
            ),
        )
        svc = CalculationReadinessService()
        frt = svc.evaluate_single(enm, "frt_hvrt")
        assert frt.status == "partial"
        assert "PR-16-impl" in (frt.recommended_action_pl or "")
        assert "der.dynamic_profile_default" in (frt.recommended_action_pl or "")

    def test_stability_ready_with_der_explicit_profile_no_default_warning(self) -> None:
        """Kontrast z powyższym (predykaty parami — ta sama funkcja, dwie ścieżki):
        DER z JAWNIE wskazanym `dynamic_profile_id` rozwiązuje się BEZ założenia
        domyślnego — status 'ready', żadnej wzmianki o der.dynamic_profile_default.

        `enm.models.Generator` nie niesie dziś pola `dynamic_profile_id` (ENM —
        poza zakresem tej karty, `enm/**` jest terytorium równoległej karty
        FAB-D1), więc "jawny wybór" jest tu symulowany przez obiekt kaczkowy z
        atrybutem, który `_resolve_der_dynamic_for_generator` już dziś czyta
        (`getattr(gen, "dynamic_profile_id", None)`) — to dokładnie ta sama
        ścieżka kodu, jaką przejdzie prawdziwy Generator, gdy ENM doda to pole.
        """
        from types import SimpleNamespace

        from application.calculation_readiness.service import (
            _rozstrzygnij_profile_der,
        )

        jawny_pv = SimpleNamespace(
            ref_id="pv_1",
            gen_type="pv_inverter",
            dynamic_profile_id="default_pv_gfm",
        )
        domyslny_pv = SimpleNamespace(
            ref_id="pv_2",
            gen_type="pv_inverter",
            dynamic_profile_id=None,
        )
        rozwiazane, nieznane, domyslne = _rozstrzygnij_profile_der([jawny_pv, domyslny_pv])
        assert nieznane == []
        assert domyslne == ["pv_2"]
        assert rozwiazane["pv_1"].source == "explicit_profile_id"
        assert rozwiazane["pv_2"].source == "default_per_kind"

    def test_resolve_der_dynamic_returns_none_for_unknown_gen_type(self) -> None:
        """Karta FAB-D2 (D8): rodzaj DER spoza mapowania => `None`, NIGDY
        cichy fallback do profilu PV. `Generator.gen_type` jest dziś Literal
        zamknięty (nie da się skonstruować "nieznanego" ENM Generatora), więc
        broni to KLASY defektu na wypadek przyszłego rodzaju DER dodanego do
        Literal bez odpowiadającej gałęzi tutaj (reguła KLASA, NIE INSTANCJA
        §3 — dwa niezależne warunki, `_DER_GEN_TYPES` i to mapowanie, nie mogą
        się cicho rozjechać)."""
        from types import SimpleNamespace

        from application.calculation_readiness.service import (
            _resolve_der_dynamic_for_generator,
        )

        nieznany = SimpleNamespace(gen_type="future_der_kind", dynamic_profile_id=None)
        assert _resolve_der_dynamic_for_generator(nieznany) is None

    def test_ncrfg_ready_with_der_after_pr16_impl(self) -> None:
        """Po PR-16-impl: NC RfG jest 'ready' przy DER (testbench podpięty)."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="fw_1",
                name="FW-01",
                bus_ref="bus_sn",
                gen_type="fw_pmsg",
                p_mw=10.0,
            ),
        )
        svc = CalculationReadinessService()
        ncrfg = svc.evaluate_single(enm, "ncrfg_compliance")
        assert ncrfg.status == "ready"
        assert "operatorów" in (ncrfg.recommended_action_pl or "")

    def test_evaluate_returns_10_items(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_minimal_enm_with_pf_data())
        assert len(report.items) == 10
        types = [i.calculation_type for i in report.items]
        assert "power_flow" in types
        assert "short_circuit" in types
        assert "stability" in types
        assert "frt_hvrt" in types
        assert "ncrfg_compliance" in types
        assert "report_osd" in types
        assert "report_technical" in types

    def test_overall_status_blocked_when_any_blocked(self) -> None:
        svc = CalculationReadinessService()
        report = svc.evaluate(_empty_enm())
        assert report.overall_status() == "blocked"

    def test_overall_status_partial_or_blocked_for_minimal(self) -> None:
        """Minimal ENM ma kompletny power_flow ale brak r0/x0 (asymmetry partial)
        i brak rating na kabel (loadability blocked) — overall = partial/blocked."""
        svc = CalculationReadinessService()
        report = svc.evaluate(_minimal_enm_with_pf_data())
        pf = report.get("power_flow")
        sc = report.get("short_circuit")
        assert pf is not None and pf.status == "ready"
        assert sc is not None and sc.status == "ready"
        # Zawsze pojawi się jakiś partial/blocked, więc overall ≠ ready
        overall = report.overall_status()
        assert overall in ("partial", "blocked")

    def test_calculation_label_pl_for_all_types(self) -> None:
        for label in CALCULATION_LABEL_PL.values():
            assert label  # niepusta etykieta
            # Brak zakazanych tokenów
            for forbidden in ["snapshot", "case", "run", "wizard", "legacy", "fallback"]:
                assert forbidden.lower() not in label.lower()


# ---------------------------------------------------------------------------
# ValidationProblemService
# ---------------------------------------------------------------------------


class TestValidationProblemService:
    def test_bay_without_ports_emits_error(self) -> None:
        enm = EnergyNetworkModel(
            header=_header(),
            substations=[Substation(ref_id="sub_1", name="GPZ", station_type="gpz")],
            bays=[
                Bay(
                    ref_id="bay_no_ports",
                    name="Pole bez portów",
                    bay_role="IN",
                    substation_ref="sub_1",
                    bus_ref="bus_1",
                    # ports=[] — brak portów
                ),
            ],
        )
        svc = ValidationProblemService()
        report = svc.collect_problems(enm)
        bay_problems = [p for p in report.problems if "bay_no_ports" in p.problem_id]
        assert len(bay_problems) >= 1
        assert bay_problems[0].severity == "error"
        assert "fix_actions" in bay_problems[0].model_dump() or bay_problems[0].fix_actions

    def test_endpoint_missing_emits_warning(self) -> None:
        enm = _minimal_enm_with_pf_data()
        # Cable without endpoint_a_port (default)
        svc = ValidationProblemService()
        report = svc.collect_problems(enm)
        endpoint_problems = [
            p for p in report.problems if p.problem_id.startswith("endpoint_missing")
        ]
        assert len(endpoint_problems) >= 1
        assert endpoint_problems[0].severity == "warning"

    def test_report_aggregates_severity_counts(self) -> None:
        enm = _empty_enm()
        svc = ValidationProblemService()
        report = svc.collect_problems(enm)
        # Pusty ENM ma blocked PF → readiness errors
        total = report.error_count + report.warning_count + report.info_count
        assert total >= 0
        assert report.is_blocking == (report.error_count > 0)


# ---------------------------------------------------------------------------
# ReportReadinessAdapter
# ---------------------------------------------------------------------------


class TestReportReadinessAdapter:
    def test_osd_report_blocked_for_empty_enm(self) -> None:
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_osd_report(_empty_enm())
        assert status.can_generate is False
        assert status.status_pl in ("zablokowany", "wynik częściowy")

    def test_technical_report_blocked_for_empty_enm(self) -> None:
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_technical_report(_empty_enm())
        assert status.can_generate is False

    def test_osd_report_ready_for_minimal_enm(self) -> None:
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_osd_report(_minimal_enm_with_pf_data())
        # Minimal może być ready lub partial w zależności od asymmetry
        assert status.status_pl in ("gotowe", "wynik częściowy")

    def test_does_not_fabricate_results(self) -> None:
        """KLUCZOWY INWARIANT: ReportReadinessAdapter NIE generuje fałszywych raportów."""
        adapter = ReportReadinessAdapter()
        status = adapter.is_ready_for_osd_report(_empty_enm())
        # Adapter zwraca STATUS, NIE raport. can_generate=False przy braku danych.
        assert hasattr(status, "can_generate")
        assert hasattr(status, "missing_data_pl")
        assert hasattr(status, "blocking_objects")
        # Nie ma żadnego pola "report_content" ani "fake_results"
        fields = set(status.model_dump().keys())
        for forbidden_field in ("report_content", "fake_results", "fabricated"):
            assert forbidden_field not in fields
