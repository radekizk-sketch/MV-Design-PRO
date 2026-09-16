"""Testy PR-12 — CalculationReadinessService + ValidationProblemService + ReportReadinessAdapter."""

from __future__ import annotations

import pytest
from application.calculation_readiness.service import (
    CALCULATION_LABEL_PL,
    CalculationReadinessService,
    ReadinessReport,
    ReadinessStatus,
    ReadinessTypeReport,
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

    def test_short_circuit_partial_when_converter_k_sc_default_forbidden(self) -> None:
        """Karta S-2 AUTORYTET (dawniej FAB-H): konwerter Z katalogiem, ale karta
        nie niesie k_sc => WARNING/domyślka systemowa `inverter.
        k_sc_default_forbidden` — zwarcia się liczą (1,1 przyjęte jako wynik
        ROBOCZY), status 'partial', nie 'blocked'/'ready' po cichu."""
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
        assert "inverter.k_sc_default_forbidden" in (sc.recommended_action_pl or "")

    @pytest.mark.parametrize(
        ("k_sc_niepoprawny", "opis"),
        [
            (0.0, "zero"),
            (-1.2, "ujemna"),
            (float("nan"), "NaN"),
            (float("inf"), "plus-nieskonczonosc"),
            (True, "bool"),
            ("1.1", "tekst"),
        ],
    )
    def test_short_circuit_partial_dla_kazdej_niepoprawnej_deklaracji_k_sc(
        self, k_sc_niepoprawny: object, opis: str
    ) -> None:
        """Iloczyn cech (CLAUDE.md, reguła KLASA NIE INSTANCJA): dana
        NIEPOPRAWNA w karcie katalogowej (nie tylko brak, testowany powyżej)
        dostaje TEN SAM kod co brak — jeden predykat gotowości
        (`wspolczynnik_wkladu_zwarciowego`), a nie osobny warunek inline, który
        mógłby się rozjechać na wartości brzegowej."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1",
                name="PV-01",
                bus_ref="bus_lv",
                gen_type="pv_inverter",
                p_mw=1.0,
                catalog_ref="conv-pv-test",
                materialized_params={"un_kv": 0.4, "sn_mva": 1.0, "k_sc": k_sc_niepoprawny},
            )
        )
        svc = CalculationReadinessService()
        sc = svc.evaluate_single(enm, "short_circuit")
        assert sc.status == "partial", opis
        assert "inverter.k_sc_default_forbidden" in (sc.recommended_action_pl or ""), opis

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

    def test_stability_blocked_without_explicit_der_profile(self) -> None:
        """Karta W6-1 SS0 p.3 (kasacja "ZAWSZE zwraca profil"): DER BEZ jawnie
        wskazanego `dynamic_profile_id` NIE rozwiązuje się już do domyślnej
        wartości katalogu — `blocked` `der.dynamic_profile_missing` (przepisane
        z zachowaniem intencji testu: DER bez jawnego wyboru jest brakiem
        danej, nie cichym 'ready' ani 'n_a' — ZAOSTRZONE względem dawnego
        WARNING 'partial', bo kasacja WARNING-owego stanu domyślnego jest
        dokładnie tym, co karta nakazuje)."""
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
        assert stab.status == "blocked"
        assert "der.dynamic_profile_missing" in " ".join(stab.missing_fields_pl)
        assert "pv_1" in stab.blocking_object_refs

    def test_stability_n_a_without_der(self) -> None:
        enm = _minimal_enm_with_pf_data()
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "n_a"

    def test_frt_hvrt_blocked_without_explicit_der_profile(self) -> None:
        """Karta W6-1 SS0 p.3: FRT/HVRT bez jawnie wskazanego `dynamic_profile_id`
        jest `blocked` `der.dynamic_profile_missing` (kasacja domyślnego
        WARNING — przepisane z zachowaniem intencji: brak jawnego wyboru
        blokuje, nie ostrzega)."""
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
        assert frt.status == "blocked"
        assert "der.dynamic_profile_missing" in " ".join(frt.missing_fields_pl)
        assert "bess_1" in frt.blocking_object_refs

    def test_stability_ready_with_der_explicit_profile_blocked_without(self) -> None:
        """Kontrast (predykaty parami — ta sama funkcja, dwie ścieżki, karta
        W6-1 SS0 p.3): DER z JAWNIE wskazanym `dynamic_profile_id` rozwiązuje
        się; DER BEZ niego jest `source="brak"` (kasacja "default_per_kind" —
        nie ma już stanu pośredniego "podstawiono domyślny").

        `enm.models.Generator` niesie dziś `materialized_params` (czytane przez
        `_resolve_der_dynamic_for_generator` jako `catalog_dynamic_profile_id`),
        ale nie pole-atrybut `dynamic_profile_id` wprost — "jawny wybór" jest tu
        symulowany przez obiekt kaczkowy z tym atrybutem, dokładnie tę samą
        ścieżkę kodu, jaką przejdzie prawdziwy Generator, gdy dostanie pole.
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
        bez_wyboru_pv = SimpleNamespace(
            ref_id="pv_2",
            gen_type="pv_inverter",
            dynamic_profile_id=None,
        )
        rozwiazane, brakujace = _rozstrzygnij_profile_der([jawny_pv, bez_wyboru_pv])
        assert brakujace == ["pv_2"]
        assert rozwiazane["pv_1"].source == "explicit_profile_id"
        assert "pv_2" not in rozwiazane

    def test_resolve_der_dynamic_reads_materialized_dynamic_model_ref(self) -> None:
        """Kanal `materialized_params["dynamic_model_ref"]` (DerWiazaniaEditor,
        FAB-K R2, `domain_operations_v2.py::validate_der_bindings`) jest DZIS
        JEDYNYM zywym kanalem jawnego wyboru dla prawdziwego `Generator` —
        readiness musi go czytac, nie tylko atrybut `dynamic_profile_id`,
        ktory na ENM jeszcze nie istnieje."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1", name="PV-01", bus_ref="bus_lv",
                gen_type="pv_inverter", p_mw=1.0,
                materialized_params={"dynamic_model_ref": "default_pv_gfm"},
            ),
        )
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "ready"
        assert "default_pv_gfm" in (stab.recommended_action_pl or "")

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

    def test_stability_n_a_with_only_load(self) -> None:
        """Kontrola: bez ŻADNEGO źródła dynamicznego (nawet po P0-10) stabilność
        nadal poprawnie `n_a` — fix nie psuje starej ścieżki."""
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(_minimal_enm_with_pf_data(), "stability")
        assert stab.status == "n_a"

    def test_stability_blocked_for_synchronous_without_dynamika_p0_10(self) -> None:
        """P0-10 (karta W6-1): maszyna synchroniczna JEST źródłem dynamicznym dla
        stabilności — NIE `n_a` jak przed naprawą (dawny filtr `_DER_GEN_TYPES`
        pomijał 'synchronous' w ogóle). Bez `Generator.dynamika` jest `blocked`
        `der.dynamika_missing`, nie ciche 'n_a'."""
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="sm_1",
                name="SM-01",
                bus_ref="bus_sn",
                gen_type="synchronous",
                p_mw=5.0,
            ),
        )
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "blocked"
        assert "der.dynamika_missing" in " ".join(stab.missing_fields_pl)
        assert "sm_1" in stab.blocking_object_refs

    def test_stability_ready_for_synchronous_with_dynamika_p0_10(self) -> None:
        """P0-10: maszyna synchroniczna Z blokiem dynamiki -> stabilność `ready`."""
        from enm.dynamika_modele import MaszynaSynchroniczna, ProweniencjaParametrow

        blok = MaszynaSynchroniczna(
            proweniencja=ProweniencjaParametrow(zrodlo="karta_producenta", odniesienie="DS-1"),
            s_n_mva=10.0, h_s=3.0, d_pu=1.0, xd_pu=1.8, xq_pu=1.7,
            xd_prim_pu=0.3, xq_prim_pu=0.4, xd_bis_pu=0.2, xq_bis_pu=0.25,
            td0_prim_s=6.0, tq0_prim_s=0.5, td0_bis_s=0.03, tq0_bis_s=0.05,
            xl_pu=0.15, nasycenie_s10=0.1, nasycenie_s12=0.3, ra_pu=0.003,
        )
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="sm_1", name="SM-01", bus_ref="bus_sn",
                gen_type="synchronous", p_mw=5.0, dynamika=blok,
            ),
        )
        svc = CalculationReadinessService()
        stab = svc.evaluate_single(enm, "stability")
        assert stab.status == "ready"
        assert "maszyna" in (stab.recommended_action_pl or "").lower()

    def test_frt_hvrt_n_a_for_synchronous_only(self) -> None:
        """FRT/HVRT NIE dotyczy maszyn synchronicznych (falownikowe zjawisko) —
        n_a nawet z blokiem dynamiki obecnym (kontrast z 'stability' powyżej,
        ten sam generator inny wynik — dwie różne fizyczne zdolności)."""
        from enm.dynamika_modele import MaszynaSynchroniczna, ProweniencjaParametrow

        blok = MaszynaSynchroniczna(
            proweniencja=ProweniencjaParametrow(zrodlo="karta_producenta", odniesienie="DS-1"),
            s_n_mva=10.0, h_s=3.0, d_pu=1.0, xd_pu=1.8, xq_pu=1.7,
            xd_prim_pu=0.3, xq_prim_pu=0.4, xd_bis_pu=0.2, xq_bis_pu=0.25,
            td0_prim_s=6.0, tq0_prim_s=0.5, td0_bis_s=0.03, tq0_bis_s=0.05,
            xl_pu=0.15, nasycenie_s10=0.1, nasycenie_s12=0.3, ra_pu=0.003,
        )
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="sm_1", name="SM-01", bus_ref="bus_sn",
                gen_type="synchronous", p_mw=5.0, dynamika=blok,
            ),
        )
        svc = CalculationReadinessService()
        frt = svc.evaluate_single(enm, "frt_hvrt")
        assert frt.status == "n_a"

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

    def test_evaluate_returns_11_items(self) -> None:
        """Karta W6-1 SS0 p.7: 11. typ `dynamika_rms` (kontrakty/gotowość biegu
        czasowego) dołączony do rejestru — 10 → 11 pozycji, addytywnie."""
        svc = CalculationReadinessService()
        report = svc.evaluate(_minimal_enm_with_pf_data())
        assert len(report.items) == 11
        types = [i.calculation_type for i in report.items]
        assert "power_flow" in types
        assert "short_circuit" in types
        assert "stability" in types
        assert "frt_hvrt" in types
        assert "ncrfg_compliance" in types
        assert "report_osd" in types
        assert "report_technical" in types
        assert "dynamika_rms" in types

    def test_dynamika_rms_n_a_without_dynamic_sources(self) -> None:
        svc = CalculationReadinessService()
        wynik = svc.evaluate_single(_minimal_enm_with_pf_data(), "dynamika_rms")
        assert wynik.status == "n_a"

    def test_dynamika_rms_blocked_without_dynamika_block(self) -> None:
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1", name="PV-01", bus_ref="bus_lv",
                gen_type="pv_inverter", p_mw=1.0,
            ),
        )
        svc = CalculationReadinessService()
        wynik = svc.evaluate_single(enm, "dynamika_rms")
        assert wynik.status == "blocked"
        assert "der.dynamika_missing" in " ".join(wynik.missing_fields_pl)
        assert "pv_1" in wynik.blocking_object_refs

    def test_dynamika_rms_ready_with_dynamika_and_pf_ready(self) -> None:
        from enm.dynamika_modele import PrzeksztaltnikGFL, ProweniencjaParametrow

        blok = PrzeksztaltnikGFL(
            proweniencja=ProweniencjaParametrow(zrodlo="profil_typowy_normy", odniesienie="IEEE 1547-2018"),
            s_n_mva=1.0, i_max_pu=1.2,
            priorytet_ogranicznika="bierna",
            pll_kp=50.0, pll_ki=500.0, reg_pradu_kp=1.0, reg_pradu_ki=100.0,
            k_frt=2.0, prog_frt_pu=0.9, tp_s=0.02, tiq_s=0.02,
            p_odbudowa_pu_na_s=1.0, p_odbudowa_opoznienie_s=0.1,
            droop_p_f_pu=0.04, martwa_strefa_f_hz=0.02, droop_q_u_pu=0.05,
            martwa_strefa_u_pu=0.01, u_min_ciagle_pu=0.85, u_max_ciagle_pu=1.1,
        )
        enm = _minimal_enm_with_pf_data()
        enm.generators.append(
            Generator(
                ref_id="pv_1", name="PV-01", bus_ref="bus_lv",
                gen_type="pv_inverter", p_mw=1.0, q_mvar=0.0, dynamika=blok,
                materialized_params={"control_mode": "STALY_COS_PHI"},
            ),
        )
        svc = CalculationReadinessService()
        pf = svc.evaluate_single(enm, "power_flow")
        assert pf.status == "ready", f"fixture PF musi byc ready dla tego testu: {pf}"
        wynik = svc.evaluate_single(enm, "dynamika_rms")
        assert wynik.status == "ready"
        assert "rdzen_niedostepny" in (wynik.recommended_action_pl or "") or (
            "rdzeń" in (wynik.recommended_action_pl or "").lower()
        )

    def test_dynamika_rms_blocked_when_pf_blocked(self) -> None:
        """Rozpływ punktu pracy musi byc `ready` — dynamika_rms dziedziczy stan PF."""
        from enm.dynamika_modele import MaszynaSynchroniczna, ProweniencjaParametrow

        blok = MaszynaSynchroniczna(
            proweniencja=ProweniencjaParametrow(zrodlo="karta_producenta", odniesienie="DS-1"),
            s_n_mva=10.0, h_s=3.0, d_pu=1.0, xd_pu=1.8, xq_pu=1.7,
            xd_prim_pu=0.3, xq_prim_pu=0.4, xd_bis_pu=0.2, xq_bis_pu=0.25,
            td0_prim_s=6.0, tq0_prim_s=0.5, td0_bis_s=0.03, tq0_bis_s=0.05,
            xl_pu=0.15, nasycenie_s10=0.1, nasycenie_s12=0.3, ra_pu=0.003,
        )
        enm = _empty_enm()
        enm.buses.append(Bus(ref_id="b1", name="Szyna 1", voltage_kv=15.0))
        enm.generators.append(
            Generator(
                ref_id="sm_1", name="SM-01", bus_ref="b1",
                gen_type="synchronous", p_mw=5.0, dynamika=blok,
            ),
        )
        svc = CalculationReadinessService()
        pf = svc.evaluate_single(enm, "power_flow")
        assert pf.status != "ready", f"fixture PF musi byc niegotowy dla tego testu: {pf}"
        wynik = svc.evaluate_single(enm, "dynamika_rms")
        assert wynik.status in ("blocked", "partial")

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

    def test_overall_status_no_module_literal_gone_from_type(self) -> None:
        """Karta S-4 (W6-0): `no_module` przestaje istnieć jako `ReadinessStatus`
        — brak modelu numerycznego jest mapowany NA GRANICY na `blocked`
        (aplikacja: `application/analyses/frt_trajektorie.py`/`frt_sekwencja.py`),
        nigdy jako osobny status gotowości."""
        import typing

        assert typing.get_args(ReadinessStatus) == ("ready", "partial", "blocked", "n_a")

    def _raport(self, *statuses: ReadinessStatus) -> ReadinessReport:
        return ReadinessReport(
            items=[
                ReadinessTypeReport(
                    calculation_type="power_flow",
                    label_pl=f"pozycja-{i}",
                    status=status,
                )
                for i, status in enumerate(statuses)
            ]
        )

    def test_overall_status_iloczyn_cech_fail_closed(self) -> None:
        """Karta S-4 §0.7 (pin w obie strony): iloczyn {ready, n_a, partial,
        blocked} × pozycje. `ready` WYŁĄCZNIE gdy KAŻDA pozycja jest `ready`
        albo `n_a`; priorytet blocked > partial > ready; „każdy element bez
        modelu ⇒ NIE ready" — brak modelu numeryczny jest mapowany na `blocked`
        na granicy aplikacyjnej (nie ma już osobnego statusu `no_module`), więc
        jest pokryty przez przypadek z `blocked` poniżej."""
        # Pojedyncza pozycja, każdy status z osobna.
        assert self._raport("ready").overall_status() == "ready"
        assert self._raport("n_a").overall_status() == "ready"
        assert self._raport("partial").overall_status() == "partial"
        assert self._raport("blocked").overall_status() == "blocked"
        # Wszystkie ready/n_a (dowolna kombinacja) ⇒ ready.
        assert self._raport("ready", "n_a").overall_status() == "ready"
        assert self._raport("n_a", "n_a", "ready").overall_status() == "ready"
        # Jakikolwiek blocked wygrywa nad partial i ready/n_a (priorytet).
        assert self._raport("ready", "blocked").overall_status() == "blocked"
        assert self._raport("partial", "blocked").overall_status() == "blocked"
        assert self._raport("blocked", "partial", "ready", "n_a").overall_status() == "blocked"
        # Jakikolwiek partial (bez blocked) wygrywa nad ready/n_a.
        assert self._raport("ready", "partial", "n_a").overall_status() == "partial"
        # „Każdy element bez modelu ⇒ NIE ready": brak modelu numeryczny =
        # `blocked` na granicy (der.dynamic_profile_missing) — projekt z
        # choćby jedną taką pozycją NIGDY nie jest `ready`.
        assert self._raport("ready", "ready", "blocked").overall_status() != "ready"

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
