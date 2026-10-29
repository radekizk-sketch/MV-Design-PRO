"""Testy D-06a/b — projekt uziemienia punktu neutralnego sieci.

Petersen (kompensacja rezonansowa) + rezystor uziemiający (NER). Fizyka pierwszych
zasad — asercje na zgodność ze wzorami są tu poprawne (w odróżnieniu od analiz
oznaczonych jako best-effort). Odrębne od IEEE 80 (_earthing — siatka uziemiająca).
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126RezystorSnInput,
    V126UziemienieSnInput,
)
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality

# XLPE kabel SN: C0 ≈ 0.25 µF/km → b0 = ω·C0.
_B0_PER_KM = 2.0 * math.pi * 50.0 * 0.25e-6


#: Rezystor punktu neutralnego sieci 20 kV w modelu: I_n = 300 A przy pełnym U_f, t_n = 10 s.
U_F_20KV = 20_000.0 / math.sqrt(3.0)
REZYSTOR_300A = V126RezystorSnInput(
    ref="ZU1", nazwa_pl="Zespół uziemiający ZU1", r_ohm=U_F_20KV / 300.0, i_n_a=300.0, t_n_s=10.0
)


def _cable_network(
    *,
    length_km: float = 30.0,
    nominal_kv: float = 20.0,
    b0: float | None = _B0_PER_KM,
    wariant: str | None = None,
    parameters: dict | None = None,
    rezystory: tuple[V126RezystorSnInput, ...] | None = None,
    prad_dlawikow_a: float | None = None,
    dane_przyjete: tuple[DanaPrzyjeta, ...] = (),
) -> V126AcademicInput:
    """Sieć kablowa SN; ``wariant`` — wariant zespołu uziemiającego sekcji z MODELU (karta
    UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4: schemat projektu nie jest parametrem biegu)."""
    return V126AcademicInput(
        base_frequency_hz=50.0,
        buses=[
            V126BusInput(ref="B1", name="GPZ", nominal_kv=nominal_kv),
            V126BusInput(ref="B2", name="S1", nominal_kv=nominal_kv),
        ],
        branches=[
            V126BranchInput(
                ref="K1",
                from_bus_ref="B1",
                to_bus_ref="B2",
                kind="cable",
                length_km=length_km,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.12,
                b0_siemens_per_km=b0,
            )
        ],
        parameters=parameters or {},
        uziemienie_sn=(
            None
            if wariant is None
            else V126UziemienieSnInput(
                wariant=wariant,
                wariant_awsc_zalaczony=wariant,
                opis_pl=f"sieć z zespołem uziemiającym ({wariant}).",
                napiecie_kv=nominal_kv,
                galezie_sieci=["K1"],
                rezystory=list(
                    rezystory
                    if rezystory is not None
                    else ((REZYSTOR_300A,) if wariant in ("rezystor", "dlawik_rezystor") else ())
                ),
                prad_dlawikow_a=prad_dlawikow_a,
                dane_przyjete=list(dane_przyjete),
            )
        ),
    )


def _run(model: V126AcademicInput) -> dict:
    return V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)


class TestPetersenResonanceTuning:
    def test_coil_inductance_matches_resonance_formula(self) -> None:
        model = _cable_network(wariant="dlawik")
        res = _run(model)["result"]
        omega = 2.0 * math.pi * 50.0
        c0 = res["c0_farad"]
        # L = 1/(3·ω²·C0) — wzór rezonansu Petersena.
        l_expected = 1.0 / (3.0 * omega**2 * c0)
        x_expected = 1.0 / (3.0 * omega * c0)
        assert res["coil_inductance_h"] == pytest.approx(l_expected, rel=1e-6)
        assert res["coil_reactance_ohm"] == pytest.approx(x_expected, rel=1e-6)
        # X_L = ωL — wewnętrzna spójność.
        assert res["coil_reactance_ohm"] == pytest.approx(
            omega * res["coil_inductance_h"], rel=1e-6
        )

    def test_c0_and_ic_match_first_principles(self) -> None:
        model = _cable_network(wariant="dlawik")
        res = _run(model)["result"]
        omega = 2.0 * math.pi * 50.0
        # C0 = B0/ω, B0 = b0·len.
        b0_total = _B0_PER_KM * 30.0
        assert res["c0_farad"] == pytest.approx(b0_total / omega, rel=1e-9)
        # Ic = √3·ω·C0·U_l.
        ic_expected = math.sqrt(3.0) * omega * res["c0_farad"] * 20_000.0
        assert res["capacitive_earth_fault_current_a"] == pytest.approx(ic_expected, rel=1e-6)
        # Równoważnie Ic = 3·ω·C0·U_f.
        u_phase = 20_000.0 / math.sqrt(3.0)
        assert res["capacitive_earth_fault_current_a"] == pytest.approx(
            3.0 * omega * res["c0_farad"] * u_phase, rel=1e-6
        )

    def test_coil_current_rating_equals_ic(self) -> None:
        res = _run(_cable_network(wariant="dlawik"))["result"]
        assert res["coil_current_rating_a"] == pytest.approx(
            res["capacitive_earth_fault_current_a"], rel=1e-9
        )

    def test_residual_zero_at_resonance_grows_with_detuning(self) -> None:
        res = _run(_cable_network(wariant="dlawik", parameters={"petersen_detuning": 0.05}))[
            "result"
        ]
        ic = res["capacitive_earth_fault_current_a"]
        # Bez tłumienia (d=0): rezonans → 0; rozstrojenie ±5 % → I_res = Ic·0.05.
        assert res["residual_current_at_resonance_a"] == pytest.approx(0.0, abs=1e-9)
        assert res["residual_current_at_detuning_a"] == pytest.approx(0.05 * ic, rel=1e-6)
        assert res["tuning_status"] == "dostrojony"

    def test_residual_grows_monotonically_with_detuning(self) -> None:
        small = _run(_cable_network(wariant="dlawik", parameters={"petersen_detuning": 0.02}))[
            "result"
        ]["residual_current_at_detuning_a"]
        large = _run(_cable_network(wariant="dlawik", parameters={"petersen_detuning": 0.20}))[
            "result"
        ]["residual_current_at_detuning_a"]
        assert large > small

    def test_residual_includes_damping_component_at_resonance(self) -> None:
        # Jawny parametr tłumienia d > 0 → resztkowy w rezonansie = Ic·d (nie zgadnięty).
        res = _run(
            _cable_network(
                wariant="dlawik",
                parameters={
                    "petersen_residual_damping": 0.03,
                    "petersen_detuning": 0.04,
                },
            )
        )["result"]
        ic = res["capacitive_earth_fault_current_a"]
        assert res["residual_current_at_resonance_a"] == pytest.approx(0.03 * ic, rel=1e-6)
        assert res["residual_current_at_detuning_a"] == pytest.approx(
            ic * math.sqrt(0.03**2 + 0.04**2), rel=1e-6
        )

    def test_plausible_magnitudes_for_20kv_cable_network(self) -> None:
        res = _run(_cable_network(wariant="dlawik"))["result"]
        # 30 km × 0.25 µF/km ⇒ C0 = 7.5 µF.
        assert res["c0_farad"] == pytest.approx(7.5e-6, rel=1e-3)
        # Ic rzędu kilkudziesięciu A dla 20 kV / 30 km kabla.
        assert 50.0 < res["capacitive_earth_fault_current_a"] < 150.0
        # Indukcyjność dławika rzędu dziesiątych części H.
        assert 0.1 < res["coil_inductance_h"] < 2.0


class TestNerResistorSizing:
    """Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4: rezystor jest daną MODELU (R, I_n, t_n
    zespołu uziemiającego); parametry „docelowy prąd doziemienia" i „energia znamionowa
    rezystora" nie istnieją. Iloczyn: wariant {rezystor, dławik ‖ rezystor} × liczba rezystorów
    w ruchu {1, 2} × czas wyłączenia {brak, w granicy, ponad} × dane {katalog, robocze}."""

    def test_resistance_is_the_model_resistor(self) -> None:
        res = _run(_cable_network(wariant="rezystor"))["result"]
        assert res["resistor_ohm"] == pytest.approx(U_F_20KV / 300.0, abs=1e-4)
        assert res["resistive_component_a"] == pytest.approx(300.0, abs=1e-4)

    def test_run_parameters_do_not_override_model_resistor(self) -> None:
        dawne = {"ner_target_earth_fault_current_a": 50.0, "ner_energy_rating_j": 1.0}
        bez = _run(_cable_network(wariant="rezystor", parameters={"ner_clearing_time_s": 1.0}))
        z = _run(
            _cable_network(wariant="rezystor", parameters={**dawne, "ner_clearing_time_s": 1.0})
        )
        assert z["result"] == bez["result"]

    def test_resultant_current_combines_resistive_and_capacitive(self) -> None:
        res = _run(_cable_network(wariant="rezystor"))["result"]
        ic = res["capacitive_earth_fault_current_a"]
        assert res["coil_current_a"] is None
        assert res["reactive_component_a"] == pytest.approx(ic, abs=1e-4)
        assert res["resultant_earth_fault_current_a"] == pytest.approx(
            math.sqrt(300.0**2 + ic**2), abs=1e-3
        )

    def test_z14_coil_compensates_capacitive_component(self) -> None:
        """Z.14: dławik ‖ rezystor — dławik w ruchu kompensuje I_C: I_ef = √(I_R² + (I_C−I_L)²)."""
        res = _run(_cable_network(wariant="dlawik_rezystor", prad_dlawikow_a=50.0))["result"]
        ic = res["capacitive_earth_fault_current_a"]
        assert res["design_mode"] == "resistor_grounded"
        assert res["coil_current_a"] == 50.0
        assert res["reactive_component_a"] == pytest.approx(ic - 50.0, abs=1e-4)
        assert res["resultant_earth_fault_current_a"] == pytest.approx(
            math.sqrt(300.0**2 + (ic - 50.0) ** 2), abs=1e-3
        )

    def test_z14_without_coil_current_is_named_gap(self) -> None:
        res = _run(_cable_network(wariant="dlawik_rezystor"))["result"]
        assert res["status"] == "dane niekompletne"
        assert res["missing_fields"] == ["uziemienie_sn.prad_dlawikow_a"]

    @pytest.mark.parametrize("wariant", ["dlawik", "rezystor", "dlawik_rezystor"])
    def test_brak_napiecia_sieci_to_odmowa_nazwana_bez_liczby(self, wariant: str) -> None:
        """Wejście bez napięcia sieci SN (U_l) — nazwana odmowa „nominal_kv", bez I_C
        policzonego z napięcia podstawionego zerem (każdy wariant projektu)."""
        siec = _cable_network(wariant=wariant, prad_dlawikow_a=50.0)
        assert siec.uziemienie_sn is not None
        siec.uziemienie_sn.napiecie_kv = None
        res = _run(siec)["result"]
        assert res["status"] == "dane niekompletne"
        assert res["missing_fields"] == ["nominal_kv"]
        assert "capacitive_earth_fault_current_a" not in res

    def test_two_resistors_in_parallel(self) -> None:
        drugi = REZYSTOR_300A.model_copy(update={"ref": "ZU2", "nazwa_pl": "Zespół ZU2"})
        res = _run(_cable_network(wariant="rezystor", rezystory=(REZYSTOR_300A, drugi)))["result"]
        assert res["resistor_ohm"] == pytest.approx(U_F_20KV / 600.0, abs=1e-4)
        assert res["resistive_component_a"] == pytest.approx(600.0, abs=1e-3)

    def test_thermal_energy_through_resistor_is_resistive_current_only(self) -> None:
        """Przez rezystor płynie I_R = U_f/R — składowa pojemnościowa zamyka się przez
        pojemności doziemne faz zdrowych (dawne E = I_ef²·R·t liczyło ją przez rezystor)."""
        res = _run(_cable_network(wariant="rezystor", parameters={"ner_clearing_time_s": 1.0}))[
            "result"
        ]
        thermal = res["thermal_check"]
        r = U_F_20KV / 300.0
        assert thermal["energy_dissipated_j"] == pytest.approx(300.0**2 * r * 1.0, rel=1e-6)
        assert thermal["energy_rating_j"] == pytest.approx(300.0**2 * r * 10.0, rel=1e-6)
        assert thermal["thermal_ok"] is True and thermal["status"] == "zgodny"

    @pytest.mark.parametrize(("t_wyl", "ok"), [(10.0, True), (10.5, False)])
    def test_thermal_limit_is_rated_time_at_rated_current(self, t_wyl: float, ok: bool) -> None:
        res = _run(_cable_network(wariant="rezystor", parameters={"ner_clearing_time_s": t_wyl}))
        thermal = res["result"]["thermal_check"]
        assert thermal["thermal_ok"] is ok
        assert thermal["status"] == ("zgodny" if ok else "niezgodny")

    def test_thermal_decided_by_least_margin_resistor(self) -> None:
        slaby = REZYSTOR_300A.model_copy(update={"ref": "ZU2", "t_n_s": 0.5})
        res = _run(
            _cable_network(
                wariant="rezystor",
                rezystory=(REZYSTOR_300A, slaby),
                parameters={"ner_clearing_time_s": 1.0},
            )
        )["result"]
        thermal = res["thermal_check"]
        assert thermal["thermal_ok"] is False
        assert [w["ref"] for w in thermal["resistors"]] == ["ZU1", "ZU2"]
        assert thermal["energy_rating_j"] == pytest.approx(300.0**2 * slaby.r_ohm * 0.5, rel=1e-6)

    def test_working_values_are_named_and_incomplete(self) -> None:
        dana = DanaPrzyjeta(
            nazwa_pl="Dopuszczalny czas przepływu prądu znamionowego rezystora (ZU1)",
            wartosc=Wielkosc(wartosc=10.0, jednostka="s"),
            powod_pl="założenie robocze 10 s",
            jakosc=FieldQuality.ESTIMATED,
        )
        z = _run(_cable_network(wariant="rezystor", dane_przyjete=(dana,)))["result"]
        bez = _run(_cable_network(wariant="rezystor"))["result"]
        assert z["kompletnosc_dowodu"] == "NIEPELNY"
        assert [d["nazwa_pl"] for d in z["dane_przyjete"]] == [dana.nazwa_pl]
        assert z["dane_przyjete"][0]["jakosc"] == "ESTIMATED"
        assert bez["kompletnosc_dowodu"] == "PELNY" and bez["dane_przyjete"] == []


class TestIncompleteData:
    def test_missing_b0_is_incomplete_not_fabricated(self) -> None:
        model = _cable_network(b0=None, wariant="dlawik")
        res = _run(model)["result"]
        assert res["status"] == "dane niekompletne"
        assert "b0_siemens_per_km" in res["missing_fields"]
        assert res["branches_missing_b0"] == ["K1"]
        assert res["sanity"]["status"] == "dane niekompletne"

    def test_missing_resistor_data_is_named_gap(self) -> None:
        model = _cable_network(wariant="rezystor", rezystory=())
        res = _run(model)["result"]
        assert res["status"] == "dane niekompletne"
        assert res["missing_fields"] == ["uziemienie_sn.rezystory"]

    def test_missing_clearing_time_makes_thermal_incomplete(self) -> None:
        model = _cable_network(wariant="rezystor")
        res = _run(model)["result"]
        # Dobór R policzony, ale sprawdzenie cieplne niekompletne (brak t_clear).
        assert res["resistor_ohm"] > 0.0
        assert res["thermal_check"]["status"] == "dane niekompletne"
        assert "ner_clearing_time_s" in res["thermal_check"]["missing_fields"]

    def test_open_branch_excluded_from_c0(self) -> None:
        model = _cable_network(wariant="dlawik")
        model.branches[0].is_open = True
        res = _run(model)["result"]
        # Otwarty łącznik/odcinek nie wnosi pojemności → brak C0 → niekompletne.
        assert res["status"] == "dane niekompletne"


class TestDeterminismAndSanity:
    def test_petersen_deterministic_hash(self) -> None:
        model = _cable_network(wariant="dlawik")
        solver = V126AcademicSolver()
        first = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        second = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        assert first["deterministic_hash"] == second["deterministic_hash"]

    def test_ner_deterministic_hash(self) -> None:
        model = _cable_network(wariant="rezystor", parameters={"ner_clearing_time_s": 1.0})
        solver = V126AcademicSolver()
        first = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        second = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        assert first["deterministic_hash"] == second["deterministic_hash"]

    def test_petersen_has_white_box_trace(self) -> None:
        model = _cable_network(wariant="dlawik")
        out = _run(model)
        keys = {step["key"] for step in out["white_box_trace"]}
        assert "neutral_earthing_capacitive_current" in keys
        assert "petersen_resonance_tuning" in keys
        assert "petersen_residual_current" in keys
        for step in out["white_box_trace"]:
            assert step["proof_status"] == "complete"
            assert step["formula"]
            assert step["unit_check"]

    def test_ner_has_white_box_trace(self) -> None:
        model = _cable_network(wariant="rezystor", parameters={"ner_clearing_time_s": 1.0})
        out = _run(model)
        keys = {step["key"] for step in out["white_box_trace"]}
        assert "ner_resistance_sizing" in keys
        assert "ner_thermal_withstand" in keys
        # Podstawienie śladu nazywa rezystor nazwą z modelu, nie identyfikatorem.
        (krok,) = (s for s in out["white_box_trace"] if s["key"] == "ner_thermal_withstand")
        assert str(krok["substitution"]).startswith(f"{REZYSTOR_300A.nazwa_pl}: E=")

    def test_sanity_block_present_and_verified(self) -> None:
        petersen = _run(_cable_network(wariant="dlawik"))["result"]
        assert petersen["sanity"]["status"] == "zweryfikowany"
        ner = _run(_cable_network(wariant="rezystor"))["result"]
        assert ner["sanity"]["status"] == "zweryfikowany"

    def test_envelope_contract(self) -> None:
        out = _run(_cable_network(wariant="dlawik"))
        assert out["contract"] == "AcademicAnalysisResultV1"
        assert out["analysis_type"] == "neutral_earthing_design"
        assert "deterministic_hash" in out


class TestUziemienieZModelu:
    """Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4: schemat projektu wynika z wariantu
    zespołu uziemiającego modelu; parametr biegu go nie nadpisuje, a brak zespołu jest
    nazwanym brakiem MODELU (dawny domyślny „petersen_coil" skasowany)."""

    @pytest.mark.parametrize(
        ("wariant", "schemat"),
        [
            ("dlawik", "petersen_coil"),
            ("dlawik_awsc", "petersen_coil"),
            ("rezystor", "resistor_grounded"),
            ("dlawik_rezystor", "resistor_grounded"),
        ],
    )
    def test_schemat_z_wariantu_modelu(self, wariant: str, schemat: str) -> None:
        res = _run(_cable_network(wariant=wariant, prad_dlawikow_a=50.0))
        assert res["result"]["neutral_earthing_type"] == schemat
        kroki = [k["key"] for k in res["white_box_trace"]]
        assert "neutral_earthing_scheme_from_model" in kroki

    def test_parametr_biegu_nie_nadpisuje_modelu(self) -> None:
        res = _run(
            _cable_network(wariant="dlawik", parameters={"neutral_earthing_type": "resistor"})
        )["result"]
        assert res["neutral_earthing_type"] == "petersen_coil"

    def test_brak_uziemienia_w_wejsciu_nazwany_bez_domyslnej(self) -> None:
        res = _run(_cable_network(wariant=None))["result"]
        assert res["status"] == "dane niekompletne"
        assert res["missing_fields"] == ["uziemienie_sn"]
        assert "neutral_earthing_type" not in res

    @pytest.mark.parametrize("wariant", ["izolowany", "bezposrednie"])
    def test_siec_bez_dlawika_i_rezystora_to_brak_modelu(self, wariant: str) -> None:
        model = _cable_network(wariant=wariant)
        assert model.uziemienie_sn is not None
        res = _run(model)["result"]
        assert res["status"] == "dane niekompletne"
        assert "zamodeluj zespół uziemiający" in res["message_pl"]

    def test_przyczyna_braku_z_modelu_przechodzi_do_wyniku(self) -> None:
        model = _cable_network(wariant=None)
        model.uziemienie_sn = V126UziemienieSnInput(przyczyna_braku_pl="Zespół bez elementu.")
        res = _run(model)["result"]
        assert res["status"] == "dane niekompletne"
        assert res["message_pl"] == "Zespół bez elementu."


class TestZakresSieciSn:
    """Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (B-01): I_C i ocena ferrorezonansu dotyczą sieci SN
    z jedynej prawdy (``galezie_sieci``, ``napiecie_kv``) — nie wszystkich gałęzi modelu i nie
    najwyższego napięcia szyny. Iloczyn: gałąź {SN, 110 kV} × napięcie {sieci, szyny WN}."""

    def _gpz(self, *, wariant: str, b_sn: float | None) -> V126AcademicInput:
        return V126AcademicInput(
            base_frequency_hz=50.0,
            buses=[
                V126BusInput(ref="W1", name="WN", nominal_kv=110.0),
                V126BusInput(ref="W2", name="WN odległa", nominal_kv=110.0),
                V126BusInput(ref="B1", name="GPZ SN", nominal_kv=15.0),
                V126BusInput(ref="B2", name="S1", nominal_kv=15.0),
            ],
            branches=[
                V126BranchInput(
                    ref="L110",
                    from_bus_ref="W1",
                    to_bus_ref="W2",
                    kind="line_overhead",
                    length_km=40.0,
                    r_ohm_per_km=0.12,
                    x_ohm_per_km=0.4,
                    b_siemens_per_km=2.8e-6,
                    b0_siemens_per_km=1.8e-6,
                ),
                V126BranchInput(
                    ref="K1",
                    from_bus_ref="B1",
                    to_bus_ref="B2",
                    kind="cable",
                    length_km=10.0,
                    r_ohm_per_km=0.2,
                    x_ohm_per_km=0.12,
                    b_siemens_per_km=b_sn,
                    b0_siemens_per_km=_B0_PER_KM,
                ),
            ],
            parameters={},
            uziemienie_sn=V126UziemienieSnInput(
                wariant=wariant,
                wariant_awsc_zalaczony=wariant,
                opis_pl=f"sieć z zespołem uziemiającym ({wariant}).",
                napiecie_kv=15.0,
                galezie_sieci=["K1"],
            ),
        )

    @pytest.mark.parametrize("wariant", ["dlawik", "rezystor"])
    def test_ic_tylko_z_galezi_sieci_sn_przy_napieciu_sieci(self, wariant: str) -> None:
        res = _run(self._gpz(wariant=wariant, b_sn=_B0_PER_KM))["result"]
        assert res["network_line_voltage_kv"] == 15.0
        assert [g["branch_ref"] for g in res["branches_contributing"]] == ["K1"]
        oczekiwany = math.sqrt(3.0) * 15e3 * _B0_PER_KM * 10.0
        # Wynik zaokrąglony do 4 miejsc (``_round(ic_a, 4)``).
        assert res["capacitive_earth_fault_current_a"] == pytest.approx(oczekiwany, abs=1e-4)

    def test_ferrorezonans_nie_liczy_pojemnosci_linii_110kv(self) -> None:
        """Sieć SN izolowana, kabel SN bez danej B, linia 110 kV z B: przed kartą suma B·ℓ
        linii 110 kV dawała „ryzyko ferrorezonansu" sieci SN. Teraz ocena nie ma podstawy."""
        model = self._gpz(wariant="izolowany", b_sn=None)
        wynik = V126AcademicSolver().run(V126AnalysisType.TRANSIENT_TRV, model)["result"]
        assert wynik["ferroresonance"]["risk"] is not True
        z_b = self._gpz(wariant="izolowany", b_sn=_B0_PER_KM)
        wynik_b = V126AcademicSolver().run(V126AnalysisType.TRANSIENT_TRV, z_b)["result"]
        assert wynik_b["ferroresonance"]["risk"] is True
