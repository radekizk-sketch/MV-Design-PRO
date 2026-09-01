"""KLASA „transformator zasilający punkt", nie instancja (karta B-02, domknięcie).

Do 2026-09-01 PIĘĆ miejsc w CZTERECH modułach brało „pierwszy transformator
stacji" dla punktu nN w DOWOLNEJ sekcji:

* ``swz.service.build_swz_view`` (werdykt SWZ punktu bez wskazania TR),
* ``nn_device_selection._ik1_min_i_u0`` (Ik1_min doboru aparatu),
* ``proof_engine.lv_circuit_verification_binding._petla_zwarcia_min``
  (pakiet dowodowy obwodu),
* ``nn_circuit_sheet.build_nn_circuit_sheet`` (arkusz całej stacji) i
  ``build_nn_circuit_sheet_row_for_breaker`` (wiersz wskazany wprost),
* ``api.analysis_run_exports.build_nn_circuit_report_section`` (sekcja raportu).

Naprawa jest klasowa: wszystkie pięć woła JEDNO źródło prawdy
``fault_loop.service.resolve_transformer_for_bus`` (właściciel szyny po
zamkniętych gałęziach). Test pokrywa ILOCZYN: punkt wejścia × stan sprzęgła
(OTWARTE: sekcja 2 nieosiągalna z TR1 → wcześniej brak trasy; ZAMKNIĘTE z TR2
o INNEJ mocy: sekcja 2 liczona przez sprzęgło od TR1 → inna liczba) ×
wspólna szyna nN (remis → mniejszy ``ref_id``, jawnie).
"""

from __future__ import annotations

import pytest
from api.analysis_run_exports import build_nn_circuit_report_section
from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    resolve_transformer_for_bus,
)
from application.analyses.nn_circuit_sheet import (
    build_nn_circuit_sheet,
    build_nn_circuit_sheet_row_for_breaker,
)
from application.analyses.nn_device_selection import _ik1_min_i_u0
from application.analyses.swz.service import build_swz_view
from application.proof_engine.lv_circuit_verification_binding import _petla_zwarcia_min
from enm.models import EnergyNetworkModel

from tests.application.analyses.lv_domain.fixtury_stacji_nn import REF_STACJA, zbuduj_stacje_nn

PUNKT_B = "b2"
APARAT_B = "ap_b"
MOC_TR2_MVA = 0.4  # inna niż TR1 (0,63) — wynik „od złego TR" różni się liczbowo


def _stacja(sprzeglo: str) -> EnergyNetworkModel:
    return zbuduj_stacje_nn(transformatory=2, sprzeglo=sprzeglo, moc_tr2_mva=MOC_TR2_MVA)


def _stacja_wspolna_szyna() -> EnergyNetworkModel:
    return zbuduj_stacje_nn(transformatory=2, wspolna_szyna_nn=True, moc_tr2_mva=MOC_TR2_MVA)


def _ik_min_od(enm: EnergyNetworkModel, transformer_ref: str) -> float:
    """Wzorzec: Ik1_min punktu B (scenariusz MIN, R skorygowane temperaturowo —
    DOKŁADNIE ta sekwencja, którą reużywają dobór aparatu, pakiet dowodowy i
    sekcja raportu) liczone JAWNIE od wskazanego transformatora."""
    swz = build_swz_view(enm, REF_STACJA, PUNKT_B, APARAT_B, transformer_ref=transformer_ref)
    assert swz["status"] == "OK", swz
    return float(swz["fault_loop_min_scenario"]["ik_min_a"])


class TestJednoZrodloPrawdy:
    @pytest.mark.parametrize("sprzeglo", ["open", "closed"])
    def test_wlascicielem_punktu_sekcji_b_jest_tr2(self, sprzeglo: str) -> None:
        enm = _stacja(sprzeglo)
        station = next(s for s in enm.substations if s.ref_id == REF_STACJA)
        trafo, missing = resolve_transformer_for_bus(enm, station, PUNKT_B)
        assert missing == []
        assert trafo is not None and trafo.ref_id == "tr2"

    def test_wspolna_szyna_remis_daje_mniejszy_ref_id(self) -> None:
        enm = _stacja_wspolna_szyna()
        station = next(s for s in enm.substations if s.ref_id == REF_STACJA)
        trafo, _ = resolve_transformer_for_bus(enm, station, PUNKT_B)
        assert trafo is not None and trafo.ref_id == "tr1"

    def test_punkt_nieosiagalny_dostaje_domyslny_transformator(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open", wyspa_odcieta=True)
        station = next(s for s in enm.substations if s.ref_id == REF_STACJA)
        trafo, missing = resolve_transformer_for_bus(enm, station, "wyspa")
        assert missing == []
        assert trafo is not None and trafo.ref_id == "tr1"
        assert build_fault_loop_view_at_point(enm, REF_STACJA, "wyspa")["missing_data"] == ["route"]


class TestSwzPunktu:
    def test_sprzeglo_otwarte_werdykt_jest_od_tr2(self) -> None:
        swz = build_swz_view(_stacja("open"), REF_STACJA, PUNKT_B, APARAT_B)
        assert swz["status"] == "OK", swz
        assert swz["transformer_ref"] == "tr2"
        assert swz["fault_loop_min_scenario"]["ik_min_a"] == pytest.approx(
            _ik_min_od(_stacja("open"), "tr2")
        )

    def test_sprzeglo_zamkniete_nie_liczy_przez_sprzeglo(self) -> None:
        enm = _stacja("closed")
        swz = build_swz_view(enm, REF_STACJA, PUNKT_B, APARAT_B)
        assert swz["status"] == "OK", swz
        assert swz["transformer_ref"] == "tr2"
        ik_tr2 = _ik_min_od(enm, "tr2")
        ik_tr1 = _ik_min_od(enm, "tr1")
        assert ik_tr1 != pytest.approx(ik_tr2)  # inaczej asymetria byłaby niewidoczna
        assert swz["fault_loop_min_scenario"]["ik_min_a"] == pytest.approx(ik_tr2)

    def test_jawne_wskazanie_wygrywa(self) -> None:
        enm = _stacja("closed")
        swz = build_swz_view(enm, REF_STACJA, PUNKT_B, APARAT_B, transformer_ref="tr1")
        assert swz["status"] == "OK", swz
        assert swz["transformer_ref"] == "tr1"


class TestIk1MinDoboruAparatu:
    @pytest.mark.parametrize("sprzeglo", ["open", "closed"])
    def test_ik1_min_liczone_od_tr2(self, sprzeglo: str) -> None:
        enm = _stacja(sprzeglo)
        ik, u0, missing, reason = _ik1_min_i_u0(enm, REF_STACJA, PUNKT_B)
        assert (missing, reason) == ([], None)
        assert ik is not None and u0 is not None
        assert ik == pytest.approx(_ik_min_od(enm, "tr2"))


class TestPakietDowodowyObwodu:
    @pytest.mark.parametrize("sprzeglo", ["open", "closed"])
    def test_petla_min_liczona_od_tr2(self, sprzeglo: str) -> None:
        enm = _stacja(sprzeglo)
        petla, missing, reason = _petla_zwarcia_min(enm, REF_STACJA, PUNKT_B)
        assert (missing, reason) == ([], None)
        assert petla is not None
        assert petla.fault_loop.ik_min_a == pytest.approx(_ik_min_od(enm, "tr2"))


class TestArkuszObwodow:
    @pytest.mark.parametrize("sprzeglo", ["open", "closed"])
    def test_arkusz_stacji_obejmuje_odplywy_obu_transformatorow(self, sprzeglo: str) -> None:
        arkusz = build_nn_circuit_sheet(enm=_stacja(sprzeglo), station_ref=REF_STACJA)
        assert arkusz["status"] == "OK", arkusz
        wiersze = arkusz["wiersze"]
        assert [
            (w["nr"], w["feeder_root_branch_ref"], w["transformator_ref"]) for w in wiersze
        ] == [
            (1, "ap_a", "tr1"),
            (2, "ap_b", "tr2"),
        ]

    def test_arkusz_wspolna_szyna_nie_dubluje_odplywow(self) -> None:
        arkusz = build_nn_circuit_sheet(enm=_stacja_wspolna_szyna(), station_ref=REF_STACJA)
        assert arkusz["status"] == "OK", arkusz
        assert [w["feeder_root_branch_ref"] for w in arkusz["wiersze"]] == ["ap_a", "ap_b"]
        assert {w["transformator_ref"] for w in arkusz["wiersze"]} == {"tr1"}

    @pytest.mark.parametrize("sprzeglo", ["open", "closed"])
    def test_wiersz_wskazany_wprost_liczy_od_tr2(self, sprzeglo: str) -> None:
        wiersz = build_nn_circuit_sheet_row_for_breaker(
            enm=_stacja(sprzeglo), station_ref=REF_STACJA, bus_ref=PUNKT_B, breaker_ref=APARAT_B
        )
        assert wiersz["status"] == "OK", wiersz
        assert wiersz["transformator_ref"] == "tr2"

    def test_stacja_jednotransformatorowa_ma_ten_sam_ksztalt(self) -> None:
        arkusz = build_nn_circuit_sheet(enm=zbuduj_stacje_nn(), station_ref=REF_STACJA)
        assert arkusz["status"] == "OK", arkusz
        assert [(w["nr"], w["transformator_ref"]) for w in arkusz["wiersze"]] == [(1, "tr1")]


class TestOdcietaPodszynaNieUniewaznaStacji:
    """Defekt zastany (zmierzony 2026-09-01): szyna za OTWARTYM rozłącznikiem
    (sekcja rezerwowa, wyspa DER) czyniła Y-bus osobliwym GLOBALNIE, więc
    upstream Thevenina — a z nim KAŻDA pętla zwarcia, KAŻDY werdykt SWZ i
    kotwica SN całej stacji — meldował „upstream_network_singular". Naprawa:
    `restrict_graph_to_island_of` — Z-bus liczony na wyspie zasilania węzła HV.
    """

    def test_upstream_thevenin_identyczny_z_i_bez_odcietej_podszyny(self) -> None:
        from application.analyses.fault_loop.service import compute_upstream_hv_thevenin

        bez = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        z_wyspa = zbuduj_stacje_nn(transformatory=2, sprzeglo="open", wyspa_odcieta=True)
        for transformer_ref in ("tr1", "tr2"):
            trafo_bez = next(t for t in bez.transformers if t.ref_id == transformer_ref)
            trafo_wyspa = next(t for t in z_wyspa.transformers if t.ref_id == transformer_ref)
            upstream_bez, missing_bez = compute_upstream_hv_thevenin(bez, trafo_bez)
            upstream_wyspa, missing_wyspa = compute_upstream_hv_thevenin(z_wyspa, trafo_wyspa)
            assert (missing_bez, missing_wyspa) == ([], [])
            assert upstream_bez is not None and upstream_wyspa is not None
            assert upstream_wyspa.z_hv_ohm == pytest.approx(upstream_bez.z_hv_ohm)

    @pytest.mark.parametrize("pv_na_wyspie", [False, True])
    def test_swz_sekcji_zasilanej_liczy_sie_mimo_odcietej_podszyny(
        self, pv_na_wyspie: bool
    ) -> None:
        enm = zbuduj_stacje_nn(
            transformatory=2, sprzeglo="open", wyspa_odcieta=True, pv_na_wyspie=pv_na_wyspie
        )
        for bus_ref, breaker_ref, transformer_ref in (
            ("a2", "ap_a", "tr1"),
            (PUNKT_B, APARAT_B, "tr2"),
        ):
            swz = build_swz_view(enm, REF_STACJA, bus_ref, breaker_ref)
            assert swz["status"] == "OK", swz
            assert swz["transformer_ref"] == transformer_ref

    def test_kotwica_sn_liczy_sie_mimo_odcietej_podszyny(self) -> None:
        from application.analyses.lv_domain.upstream_equivalent import (
            build_upstream_equivalent_snapshot,
        )

        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open", wyspa_odcieta=True)
        snapshot = build_upstream_equivalent_snapshot(enm, "case-b02", REF_STACJA)
        assert snapshot["status"] == "OK", snapshot
        assert snapshot["ikss_ka"] > 0

    def test_punkt_na_odcietej_podszynie_to_brak_trasy_nie_osobliwosc(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open", wyspa_odcieta=True)
        assert build_fault_loop_view_at_point(enm, REF_STACJA, "wyspa")["missing_data"] == ["route"]
        ik, u0, missing, reason = _ik1_min_i_u0(enm, REF_STACJA, "wyspa")
        assert (ik, u0, missing) == (None, None, ["route"])
        assert reason


class TestSekcjaRaportu:
    @pytest.mark.parametrize("sprzeglo", ["open", "closed"])
    def test_sekcja_raportu_opisuje_tr2(self, sprzeglo: str) -> None:
        enm = _stacja(sprzeglo)
        sekcja = build_nn_circuit_report_section(
            enm=enm,
            station_ref=REF_STACJA,
            bus_ref=PUNKT_B,
            breaker_ref=APARAT_B,
            run_id="run-b02",
            revision_id="rev-1",
            przypadek_decydujacy="MAX",
        )
        assert sekcja["status"] == "OK", sekcja
        assert sekcja["transformator"]["nazwa"] == "TR2"
        assert sekcja["transformator"]["sn_mva"] == pytest.approx(MOC_TR2_MVA)
        assert sekcja["swz"]["transformer_ref"] == "tr2"
        assert sekcja["zwarcia"]["ik_min_a"] == pytest.approx(_ik_min_od(enm, "tr2"))
