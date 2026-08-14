"""Testy arkusza obliczeń obwodów nN (karta ARKUSZ-NN,
docs/nn/ARKUSZ_OBLICZEN_NN_2026-08.md).

Sieć referencyjna: SN → TR → RGnN z TRZEMA odpływami (MCB / wkładka gG /
MCCB), jeden odbiór (Load) per odpływ, obciążalność katalogowa kabli
zmaterializowana. Pokrywa: iloczyn klas aparatów × źródło Ib (bieg rozpływu /
tabliczka) × stany trzecie (brak aparatu, MCCB bez nastaw, układ IT),
zgodność liczb z NIEZALEŻNYM wywołaniem dostawców (wzorzec anty-cyrkularny
P0.10), determinizm JSON, grupowanie/kolejność wierszy.
"""

from __future__ import annotations

import pytest
from application.analyses.fault_loop.service import build_feeder_fault_loop_view
from application.analyses.nn_circuit_sheet import build_nn_circuit_sheet
from application.analyses.nn_device_selection import wybierz_aparat_dla_obwodu_nn
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    FuseBranch,
    Load,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.store import reset_enm_store, set_enm
from network_model.solvers.cable_ampacity_derating import obciazalnosc_skorygowana, wspolczynniki_nn

CASE_ID = "case-arkusz-nn"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_enm_store()
    reset_canonical_runs()
    yield
    reset_enm_store()
    reset_canonical_runs()


def _siec_referencyjna() -> EnergyNetworkModel:
    """SN → TR (Dyn11, TN-C-S) → RGnN z trzema odpływami: MCB(B16)+Cu16,
    wkładka gG25+Cu25 (z korektą ułożenia), MCCB(In=63, nastawy D1)+Al35."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Arkusz nN ref", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="RGnN", voltage_kv=0.4),
            Bus(ref_id="b_mcb", name="Za MCB", voltage_kv=0.4),
            Bus(ref_id="b_mcb_end", name="Odbiór MCB", voltage_kv=0.4),
            Bus(ref_id="b_gg", name="Za wkładką", voltage_kv=0.4),
            Bus(ref_id="b_gg_end", name="Odbiór gG", voltage_kv=0.4),
            Bus(ref_id="b_mccb", name="Za MCCB", voltage_kv=0.4),
            Bus(ref_id="b_mccb_end", name="Odbiór MCCB", voltage_kv=0.4),
            Bus(ref_id="b_bez_aparatu_end", name="Odpływ bez aparatu", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=0.1,
                x_ohm=0.5,
                catalog_ref="siec-sn-referencyjna",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR1",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
                catalog_ref="tr-630kva-referencyjny",
            )
        ],
        loads=[
            Load(ref_id="ld_mcb", name="Odbior MCB", bus_ref="b_mcb_end", p_mw=0.006, q_mvar=0.002),
            Load(ref_id="ld_gg", name="Odbior gG", bus_ref="b_gg_end", p_mw=0.010, q_mvar=0.004),
            Load(
                ref_id="ld_mccb", name="Odbior MCCB", bus_ref="b_mccb_end", p_mw=0.025, q_mvar=0.010
            ),
        ],
        branches=[
            # --- Odpływ 1: MCB B16 + kabel Cu 16 mm² ---
            SwitchBranch(
                ref_id="ap_mcb",
                name="Zabezpieczenie MCB",
                type="breaker",
                from_bus_ref="nn",
                to_bus_ref="b_mcb",
                catalog_namespace="APARAT_NN_MCB",
                catalog_ref="mcb-b16",
                materialized_params={"in_a": 16.0, "curve_class": "B", "icn_ka": 6.0},
            ),
            Cable(
                ref_id="c_mcb",
                name="Kabel MCB",
                from_bus_ref="b_mcb",
                to_bus_ref="b_mcb_end",
                length_km=0.03,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
                conductor_material="CU",
                cross_section_mm2=16.0,
                catalog_ref="yaky-16",
                materialized_params={"i_max_a": 80.0},
            ),
            # --- Odpływ 2: wkładka gG 25A + kabel Cu 25 mm² (z korektą ułożenia) ---
            FuseBranch(
                ref_id="ap_gg",
                name="Wkładka gG",
                from_bus_ref="nn",
                to_bus_ref="b_gg",
                catalog_namespace="WKLADKA_NN",
                catalog_ref="gg-25",
                materialized_params={"in_a": 25.0, "fuse_class": "gG"},
            ),
            Cable(
                ref_id="c_gg",
                name="Kabel gG",
                from_bus_ref="b_gg",
                to_bus_ref="b_gg_end",
                length_km=0.08,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
                conductor_material="CU",
                cross_section_mm2=25.0,
                catalog_ref="yaky-25",
                materialized_params={"i_max_a": 105.0},
                meta={
                    "cable_laying_conditions": {
                        "environment": "grunt",
                        "insulation": "PVC",
                        "ambient_temperature_c": 30.0,
                        "circuit_count": 2,
                        "soil_thermal_resistivity_km_w": 2.5,
                    }
                },
            ),
            # --- Odpływ 3: MCCB In=63A z nastawami D1 + kabel Al 35 mm² ---
            SwitchBranch(
                ref_id="ap_mccb",
                name="Wyłącznik MCCB",
                type="breaker",
                from_bus_ref="nn",
                to_bus_ref="b_mccb",
                catalog_namespace="APARAT_NN",
                catalog_ref="mccb-63",
                materialized_params={
                    "i_n_a": 63.0,
                    "device_kind": "WYLACZNIK_GLOWNY",
                    "i_cu_ka": 25.0,
                    "ir_range": [0.7, 1.0],
                    "isd_range": [2.0, 5.0],
                    "ii_range": [8.0, 10.0],
                    "tr_range": [1.0, 3600.0],
                    "tsd_range": [0.05, 0.4],
                },
            ),
            Cable(
                ref_id="c_mccb",
                name="Kabel MCCB",
                from_bus_ref="b_mccb",
                to_bus_ref="b_mccb_end",
                length_km=0.06,
                r_ohm_per_km=0.20,
                x_ohm_per_km=0.07,
                return_conductor_r_ohm_per_km_20c=0.20,
                return_conductor_x_ohm_per_km=0.07,
                short_circuit_temperature_c=250.0,
                conductor_material="AL",
                cross_section_mm2=35.0,
                catalog_ref="yakxs-35",
                materialized_params={"i_max_a": 120.0},
            ),
            # --- Odpływ 4: BEZ zamodelowanego aparatu (kabel wprost z RGnN) ---
            Cable(
                ref_id="c_bez_aparatu",
                name="Kabel bez aparatu",
                from_bus_ref="nn",
                to_bus_ref="b_bez_aparatu_end",
                length_km=0.02,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
                conductor_material="CU",
                cross_section_mm2=10.0,
                catalog_ref="yaky-10",
                materialized_params={"i_max_a": 63.0},
            ),
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="Stacja SN/nN nr 1",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )


def _wgraj_siec(enm: EnergyNetworkModel) -> None:
    set_enm(CASE_ID, enm)


class TestGrupowanieIKolejnosc:
    def test_cztery_odplywy_posortowane_wg_ref_aparatu(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        assert wynik["status"] == "OK"
        refs = [w["feeder_root_branch_ref"] for w in wynik["wiersze"]]
        assert refs == sorted(refs)
        assert refs == ["ap_gg", "ap_mcb", "ap_mccb", "c_bez_aparatu"]
        nry = [w["nr"] for w in wynik["wiersze"]]
        assert nry == [1, 2, 3, 4]

    def test_stacja_nieznana_honest_brak_danych(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="nieistniejaca")
        assert wynik["status"] == "brak danych"
        assert "station" in wynik["missing_data"]

    def test_provenance_per_wiersz_nie_tylko_na_calym_arkuszu(self) -> None:
        """Karta ARKUSZ-NN §mapowanie „LEPIEJ": PROVENANCE per wiersz (run_id-y
        + rewizja modelu + świeżość) — KAŻDY wiersz niesie WŁASNY wpis, nie
        tylko odpowiedź na poziomie całego arkusza."""
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        assert wynik["status"] == "OK"
        assert wynik["wiersze"], "brak wierszy do sprawdzenia provenance"
        for wiersz in wynik["wiersze"]:
            assert "provenance" in wiersz, wiersz["feeder_root_branch_ref"]
            assert wiersz["provenance"] == wynik["provenance"]
            assert wiersz["provenance"]["rewizja_modelu"]


class TestTrzyKlasyAparatowIbZTabliczki:
    """Ib „z tabliczki" (brak biegu rozpływu) dla WSZYSTKICH trzech klas."""

    def test_mcb_wiersz(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert wiersz["zrodlo_ib"] == "tabliczka"
        assert wiersz["ib"]["status"] == "OK"
        assert wiersz["aparat"]["wartosc"]["kind"] == "MCB"
        assert wiersz["aparat"]["wartosc"]["nastawa_n"] == 1.0
        assert wiersz["aparat"]["wartosc"]["ir_a"] == 16.0
        assert wiersz["iz"]["wartosc"]["iz_prime_a"] == pytest.approx(80.0)
        assert wiersz["przewod"]["wartosc"]["gamma_ms_m"] == pytest.approx(58.0)
        assert wiersz["dlugosc_m"]["wartosc"] == pytest.approx(30.0)
        assert wiersz["k2_i2"]["wartosc"]["k2"] == pytest.approx(1.45)

    def test_gg_wiersz_korekta_ulozenia_stosowana(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_gg")
        assert wiersz["aparat"]["wartosc"]["kind"] == "FUSE_SWITCH"
        # Obciążalność skorygowana MUSI być NIŻSZA niż katalogowa (korekta z meta).
        iz = wiersz["iz"]["wartosc"]
        assert iz["iz_katalogowe_a"] == pytest.approx(105.0)
        assert iz["iz_prime_a"] < iz["iz_katalogowe_a"]
        assert wiersz["k2_i2"]["wartosc"]["k2"] == pytest.approx(1.6)

    def test_mccb_wiersz_nastawy_rozwiazane(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mccb")
        assert wiersz["aparat"]["wartosc"]["kind"] == "MCCB"
        # Ir = ir_range[górny]×In = 1.0×63 = 63 A
        assert wiersz["aparat"]["wartosc"]["ir_a"] == pytest.approx(63.0)
        assert wiersz["k2_i2"]["status"] == "OK"
        assert wiersz["k2_i2"]["wartosc"]["k2"] == pytest.approx(1.3)
        assert wiersz["k2_i2"]["wartosc"]["i2_a"] == pytest.approx(1.3 * 63.0)
        assert wiersz["przewod"]["wartosc"]["gamma_ms_m"] == pytest.approx(35.0)

    def test_odplyw_bez_aparatu_trzeci_stan(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "c_bez_aparatu")
        assert wiersz["aparat"]["status"] == "brak danych"
        assert "aparatu" in (wiersz["aparat"]["reason_pl"] or "")
        assert wiersz["status_doboru"]["status"] == "brak danych"
        # Kolumny NIEZALEŻNE od aparatu nadal policzone (Ib, Iz′, długość).
        assert wiersz["ib"]["status"] == "OK"
        assert wiersz["iz"]["status"] == "OK"
        assert wiersz["dlugosc_m"]["status"] == "OK"


class TestIbZBieguRozplywu:
    def test_ib_z_biegu_gdy_dostarczony(self) -> None:
        enm = _siec_referencyjna()
        _wgraj_siec(enm)
        run = execute_run(create_run(case_id=CASE_ID, analysis_type="PF").id)
        assert run.status == "FINISHED", run.error_message

        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn", load_flow_run=run)
        assert wynik["status"] == "OK"
        for wiersz in wynik["wiersze"]:
            if wiersz["feeder_root_branch_ref"] == "c_bez_aparatu":
                continue
            assert wiersz["zrodlo_ib"] == "rozpływ", wiersz["feeder_root_branch_ref"]
            assert wiersz["ib"]["status"] == "OK"
            assert "bieg rozpływu" in wiersz["ib"]["zrodlo_pl"]

    def test_delta_u_dostepne_z_biegu(self) -> None:
        enm = _siec_referencyjna()
        _wgraj_siec(enm)
        run = execute_run(create_run(case_id=CASE_ID, analysis_type="PF").id)
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn", load_flow_run=run)
        mcb = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert mcb["delta_u"]["status"] == "OK"
        assert mcb["delta_u"]["wartosc"]["odcinkowe"], mcb["delta_u"]
        # Jeden odcinek kablowy na trasie -> jeden wpis odcinkowy.
        assert {o["branch_ref"] for o in mcb["delta_u"]["wartosc"]["odcinkowe"]} == {"c_mcb"}

    def test_swiezosc_prowenencji_gdy_model_niezmieniony(self) -> None:
        enm = _siec_referencyjna()
        _wgraj_siec(enm)
        run = execute_run(create_run(case_id=CASE_ID, analysis_type="PF").id)
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn", load_flow_run=run)
        assert wynik["provenance"]["swiezosc"]["load_flow_aktualny"] is True
        assert wynik["provenance"]["load_flow_run_id"] == str(run.id)


class TestIkZBieguZwarciowego:
    def test_ik_max_z_biegu_sc(self) -> None:
        enm = _siec_referencyjna()
        _wgraj_siec(enm)
        run = execute_run(create_run(case_id=CASE_ID, analysis_type="short_circuit_sn").id)
        assert run.status == "FINISHED", run.error_message
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn", short_circuit_run=run)
        mcb = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert mcb["ik_max"]["status"] == "OK"
        assert mcb["ik_max"]["wartosc"] > 0


class TestStanyTrzecie:
    def test_mccb_bez_nastaw_nierozstrzygalne_k2i2(self) -> None:
        enm = _siec_referencyjna()
        # Podmień MCCB na rekord bez zakresów regulacji.
        for b in enm.branches:
            if b.ref_id == "ap_mccb":
                b.materialized_params = {
                    "i_n_a": 63.0,
                    "device_kind": "WYLACZNIK_GLOWNY",
                    "i_cu_ka": 25.0,
                }
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mccb")
        assert wiersz["k2_i2"]["status"] == "nierozstrzygalne"
        assert wiersz["kryterium_ii_i2_iz"]["status"] == "nierozstrzygalne"

    def test_uklad_it_nie_dotyczy_swz_i_doboru(self) -> None:
        enm = _siec_referencyjna()
        for s in enm.substations:
            s.meta["nn_earthing_system"] = "IT"
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert wiersz["swz"]["status"] == "nie dotyczy"
        assert wiersz["status_doboru"]["status"] == "nie dotyczy"
        assert wiersz["ik_min"]["status"] == "nie dotyczy"
        # Kolumny NIEZALEŻNE od pętli TN nadal dostępne (topologiczne "najgorsze").
        assert wiersz["worst_point_zrodlo"] == "topologiczny (najdalszy hop)"
        assert wiersz["iz"]["status"] == "OK"

    def test_aparat_bez_materialized_params_brak_danych(self) -> None:
        enm = _siec_referencyjna()
        for b in enm.branches:
            if b.ref_id == "ap_mcb":
                b.materialized_params = None
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert wiersz["aparat"]["status"] == "brak danych"

    def test_brak_biegu_rozplywu_daje_brak_dla_delta_u(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert wiersz["delta_u"]["status"] == "brak danych"

    def test_brak_biegu_zwarciowego_daje_brak_dla_ik_max(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert wiersz["ik_max"]["status"] == "brak danych"

    def test_brak_czasu_wylaczenia_daje_brak_dla_i2t(self) -> None:
        enm = _siec_referencyjna()
        _wgraj_siec(enm)
        sc_run = execute_run(create_run(case_id=CASE_ID, analysis_type="short_circuit_sn").id)
        wynik = build_nn_circuit_sheet(
            enm=enm, station_ref="stn", short_circuit_run=sc_run, fault_duration_s=None
        )
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        assert wiersz["i2t"]["status"] == "brak danych"
        assert "czasu wyłączenia" in wiersz["i2t"]["reason_pl"]

    def test_i2t_policzony_gdy_ith_i_czas_dostarczone(self) -> None:
        enm = _siec_referencyjna()
        _wgraj_siec(enm)
        sc_run = execute_run(create_run(case_id=CASE_ID, analysis_type="short_circuit_sn").id)
        wynik = build_nn_circuit_sheet(
            enm=enm, station_ref="stn", short_circuit_run=sc_run, fault_duration_s=0.2
        )
        wiersz = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")
        # Brak Ith(1s)/Jth(1s) na kablu referencyjnym -> nierozstrzygalne (uczciwe), nie crash.
        assert wiersz["i2t"]["status"] in ("OK", "nierozstrzygalne")


class TestZgodnoscZNiezaleznymWywolaniemDostawcow:
    """Wzorzec anty-cyrkularny (P0.10): liczby arkusza MUSZĄ się zgadzać z
    NIEZALEŻNYM, bezpośrednim wywołaniem tych samych dostawców."""

    def test_ik1_min_zgodny_z_bezposrednim_wywolaniem_fault_loop(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        mcb = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mcb")

        widok_bezposredni = build_feeder_fault_loop_view(enm, "stn")
        feeder = next(
            f for f in widok_bezposredni["feeders"] if f["feeder_root_branch_ref"] == "ap_mcb"
        )
        assert mcb["worst_point_bus_ref"] == feeder["worst_point_bus_ref"]

    def test_iz_prime_zgodny_z_bezposrednim_wywolaniem_solvera(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        gg = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_gg")

        wspolczynniki = wspolczynniki_nn(
            srodowisko="grunt",
            izolacja="PVC",
            temperatura_c=30.0,
            liczba_obwodow=2,
            rezystywnosc_gruntu_km_w=2.5,
        )
        iz_prime_niezalezny = obciazalnosc_skorygowana(105.0, wspolczynniki)
        assert gg["iz"]["wartosc"]["iz_prime_a"] == pytest.approx(iz_prime_niezalezny)

    def test_dobor_status_zgodny_z_bezposrednim_wywolaniem_nn_device_selection(self) -> None:
        enm = _siec_referencyjna()
        wynik = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        mccb = next(w for w in wynik["wiersze"] if w["feeder_root_branch_ref"] == "ap_mccb")
        iz_prime = mccb["iz"]["wartosc"]["iz_prime_a"]
        ib_a = mccb["ib"]["wartosc"]

        niezalezny = wybierz_aparat_dla_obwodu_nn(
            enm=enm,
            station_ref="stn",
            bus_ref=mccb["worst_point_bus_ref"],
            ib_a=ib_a,
            iz_prime_a=iz_prime,
            ik_max_ka=None,
        )
        assert niezalezny["status"] == "OK"
        assert mccb["ik_min"]["wartosc"] == pytest.approx(niezalezny["dobor"]["ik1_min_a"])


class TestDeterminizm:
    def test_dwa_biegi_identyczny_json(self) -> None:
        enm = _siec_referencyjna()
        a = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        b = build_nn_circuit_sheet(enm=enm, station_ref="stn")
        assert a == b

    def test_dwa_biegi_identyczny_json_z_biegami(self) -> None:
        enm = _siec_referencyjna()
        _wgraj_siec(enm)
        pf = execute_run(create_run(case_id=CASE_ID, analysis_type="PF").id)
        sc = execute_run(create_run(case_id=CASE_ID, analysis_type="short_circuit_sn").id)
        a = build_nn_circuit_sheet(
            enm=enm,
            station_ref="stn",
            load_flow_run=pf,
            short_circuit_run=sc,
            fault_duration_s=0.2,
        )
        b = build_nn_circuit_sheet(
            enm=enm,
            station_ref="stn",
            load_flow_run=pf,
            short_circuit_run=sc,
            fault_duration_s=0.2,
        )
        assert a == b
