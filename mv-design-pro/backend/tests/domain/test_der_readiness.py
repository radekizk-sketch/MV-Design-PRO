"""Regula gotowosci wytworcy po stronie backendu (V12K-244, karta F-K8 faza 2 krok 3).

Testy pilnuja DWOCH rzeczy naraz:
  1. werdyktow reguly (z powodami — os niegotowa bez nazwanego powodu to slepy zaulek),
  2. GRANIC, ktore odrozniaja brak danej od werdyktu (nierozstrzygnieta klasa
     przekladnika NIE jest tym samym, co klasa pomiarowa).

Identyfikatory katalogowe sa REALNE (`/api/catalog/ct-types`), bo test na wymyslonym
identyfikatorze sprawdza atrape (precedens V12K-239).
"""

from __future__ import annotations

import pytest
from domain.der_readiness import (
    OSIE_GOTOWOSCI,
    PROG_87T_KW,
    WejscieGotowosciDer,
    klasa_ct_jest_zabezpieczeniowa,
    macierz_gotowosci_der,
    osie_gotowosci_der,
    podsumuj_gotowosc,
    wejscie_z_generatora,
)


def we(**nadpisania) -> WejscieGotowosciDer:
    """Wytworca z KOMPLETEM danych — testy odejmuja po jednej, zeby zmierzyc skutek."""
    baza = {
        "der_id": "DER-1",
        "der_kind": "PV",
        "connection_side": "SN",
        "bus_przylaczenia_ref": "BUS-SN-1",
        "nominal_power_kw": 1000.0,
        "device_catalog_ref": "pv_inv_sma_2500",
        "protection_catalog_ref": "ABB_REB670",
        "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
        "vt_catalog_ref": "vt_10kv_100v_05_abb",
        "ct_accuracy_class": "5P10",
        "ct_application": "protection",
        "dynamic_model_ref": "dyn_grid_following_pv",
        "nc_rfg_profile_ref": "pse",
        "lvrt_curve_ref": "lvrt_pse",
        "hvrt_curve_ref": "hvrt_pse",
        "other_ders_in_station": 1,
    }
    baza.update(nadpisania)
    return WejscieGotowosciDer(**baza)


def kody(osie, axis: str) -> list[str]:
    for os in osie:
        if os.axis == axis:
            return [b.code for b in os.blockers]
    raise AssertionError(f"brak osi {axis}")


class TestMacierzPodstawowa:
    def test_komplet_danych_daje_wszystkie_osie_gotowe(self) -> None:
        macierz = macierz_gotowosci_der(we())
        assert set(macierz) == set(OSIE_GOTOWOSCI)
        assert all(status == "ready" for status in macierz.values()), macierz

    def test_kolejnosc_osi_jest_czescia_kontraktu(self) -> None:
        # Determinizm odpowiedzi API: ta sama kolejnosc przy kazdym wywolaniu.
        assert [os.axis for os in osie_gotowosci_der(we())] == list(OSIE_GOTOWOSCI)

    def test_brak_urzadzenia_blokuje_zwarcia_i_nazywa_powod(self) -> None:
        osie = osie_gotowosci_der(we(device_catalog_ref=None))
        macierz = macierz_gotowosci_der(we(device_catalog_ref=None))
        assert macierz["sc_3f"] == "blocked"
        assert "der.device_catalog.missing" in kody(osie, "sc_3f")

    def test_brak_pcc_blokuje_zwarcia(self) -> None:
        macierz = macierz_gotowosci_der(we(bus_przylaczenia_ref=None))
        assert macierz["sc_3f"] == "blocked"
        assert "der.przylacze.missing" in kody(
            osie_gotowosci_der(we(bus_przylaczenia_ref=None)), "sc_3f"
        )

    def test_os_gotowa_nie_ma_zadnych_powodow(self) -> None:
        assert kody(osie_gotowosci_der(we()), "sc_3f") == []


class TestZwarciaNiesymetryczne:
    """Karta FAB-L (inwentarz solvera IEC 60909, `enm/mapping.py`): SC1F/SC2FG NIE
    mają osobnego wejścia per-DER — solver bierze te same dane co SC3F/SC2F
    (`k_sc`), a składową zerową falownika modeluje stałą `contributes_zero_
    sequence=False` niezależnie od jakiejkolwiek karty katalogowej. Dawne pole
    `fault_current_data_ref` (usunięte razem z `DER_FAULT_CURRENT_DATA_CATALOG`
    frontu) nie miało żadnego solvera, który by je czytał — druga fizyka bez
    konsumenta. Kompletność danych Z₀ CAŁEJ sieci (r0/x0 gałęzi, grupy połączeń
    transformatorów, uziemienie punktu neutralnego) jest bramką MODELU
    (`analysis-eligibility` SC_1F), nie osią per-DER."""

    def test_sc1f_i_sc2fg_pokrywaja_sie_ze_sc3f_i_sc2f_dla_kazdego_stanu_urzadzenia(
        self,
    ) -> None:
        # Iloczyn cech (KLASA NIE INSTANCJA pkt 2): urządzenie kompletne,
        # urządzenie bez katalogu, urządzenie bez PCC — SC1F/SC2FG muszą
        # zgadzać się z SC3F/SC2F w KAŻDYM z tych stanów, nie tylko w jednym.
        for nadpisania in ({}, {"device_catalog_ref": None}, {"bus_przylaczenia_ref": None}):
            macierz = macierz_gotowosci_der(we(**nadpisania))
            assert macierz["sc_1f"] == macierz["sc_3f"], nadpisania
            assert macierz["sc_2fg"] == macierz["sc_2f"] == macierz["sc_3f"], nadpisania

    def test_powody_sc1f_sc2fg_pokrywaja_sie_z_sc3f(self) -> None:
        wejscie = we(device_catalog_ref=None)
        osie = osie_gotowosci_der(wejscie)
        assert kody(osie, "sc_1f") == kody(osie, "sc_3f")
        assert kody(osie, "sc_2fg") == kody(osie, "sc_2f") == kody(osie, "sc_3f")

    def test_pole_fault_current_data_ref_nie_istnieje_juz_w_kontrakcie(self) -> None:
        # Kontrola granicy: dawne pole nie ma odpowiednika w `WejscieGotowosciDer` —
        # próba przekazania go musi być błędem konstrukcji, nie cichym ignorowaniem.
        with pytest.raises(TypeError):
            we(fault_current_data_ref="fc_dowolne")  # type: ignore[call-arg]


class TestPrzekladnikPradowy:
    def test_klasa_pomiarowa_to_WERDYKT_nie_brak(self) -> None:
        macierz = macierz_gotowosci_der(we(ct_accuracy_class="0.5", ct_application="metering"))
        assert macierz["protection"] == "partial"
        osie = osie_gotowosci_der(we(ct_accuracy_class="0.5", ct_application="metering"))
        assert "der.ct_class.invalid" in kody(osie, "protection")
        assert "der.ct_class.unresolved" not in kody(osie, "protection")

    def test_nierozstrzygnieta_klasa_to_BRAK_DANEJ_z_wlasnym_kodem(self) -> None:
        # Ta granica jest sensem V12K-232: „nie wiem" nie moze byc milczacym „czesciowo".
        macierz = macierz_gotowosci_der(we(ct_accuracy_class=None, ct_application=None))
        assert macierz["protection"] == "partial"
        osie = osie_gotowosci_der(we(ct_accuracy_class=None, ct_application=None))
        assert "der.ct_class.unresolved" in kody(osie, "protection")
        assert "der.ct_class.invalid" not in kody(osie, "protection")

    @pytest.mark.parametrize(
        "klasa,zabezpieczeniowa",
        [
            ("5P10", True),
            ("5P20", True),
            ("10P10", True),
            ("0.2", False),
            ("0.5", False),
            ("1.0", False),
        ],
    )
    def test_klasa_zabezpieczeniowa_wg_iec_61869_2(
        self, klasa: str, zabezpieczeniowa: bool
    ) -> None:
        assert klasa_ct_jest_zabezpieczeniowa(klasa) is zabezpieczeniowa


class TestTransformatorDedykowany:
    def test_wybrany_transformator_blokowy_daje_dowod_aparatury(self) -> None:
        # V12K-244: warunek czyta pole, ktore ISTNIEJE w danych produkcyjnych.
        macierz = macierz_gotowosci_der(
            we(
                connection_side="dedicated_transformer",
                nominal_power_kw=1000.0,
                block_transformer_catalog_ref="btr_pv_15_04_1000",
            )
        )
        assert macierz["equipment"] == "ready"

    def test_brak_transformatora_blokowego_obniza_i_nazywa(self) -> None:
        wejscie = we(connection_side="dedicated_transformer", block_transformer_catalog_ref=None)
        assert macierz_gotowosci_der(wejscie)["equipment"] == "partial"
        assert "der.dedicated_trafo.missing" in kody(osie_gotowosci_der(wejscie), "equipment")

    def test_87t_wymaga_przekladnika_dwurdzeniowego_powyzej_progu(self) -> None:
        # IEC 60255-13: transformator dedykowany ≥ 1,6 MVA → zabezpieczenie roznicowe.
        wejscie = we(
            connection_side="dedicated_transformer",
            nominal_power_kw=PROG_87T_KW,
            block_transformer_catalog_ref="btr_pv_15_04_1000",
            ct_application="protection",
        )
        assert macierz_gotowosci_der(wejscie)["protection"] == "partial"
        assert "der.ct_87t_dual_core.required" in kody(osie_gotowosci_der(wejscie), "protection")

    def test_ponizej_progu_87t_nie_jest_wymagane(self) -> None:
        wejscie = we(
            connection_side="dedicated_transformer",
            nominal_power_kw=PROG_87T_KW - 1,
            block_transformer_catalog_ref="btr_pv_15_04_1000",
            ct_application="protection",
        )
        assert macierz_gotowosci_der(wejscie)["protection"] == "ready"

    def test_87t_z_przekladnikiem_dwurdzeniowym_przechodzi(self) -> None:
        wejscie = we(
            connection_side="dedicated_transformer",
            nominal_power_kw=2500.0,
            block_transformer_catalog_ref="btr_pv_15_04_1000",
            ct_application="dual",
        )
        assert macierz_gotowosci_der(wejscie)["protection"] == "ready"


class TestAntiIslanding:
    @pytest.mark.parametrize("strona", ["nN", "at_zksn", "at_branch_pole", "at_cable_joint"])
    def test_brak_zabezpieczen_po_stronie_nn_i_zk_jest_nazwany(self, strona: str) -> None:
        wejscie = we(connection_side=strona, protection_catalog_ref=None)
        assert "der.anti_islanding.required" in kody(osie_gotowosci_der(wejscie), "protection")

    def test_dla_magazynu_energii_regula_anti_islanding_nie_dotyczy(self) -> None:
        # Granica przepisana z reguly: warunek dotyczy PV i FW (IEEE 1547 / NC RfG Art. 14).
        wejscie = we(der_kind="BESS", connection_side="nN", protection_catalog_ref=None)
        assert "der.anti_islanding.required" not in kody(osie_gotowosci_der(wejscie), "protection")


class TestProfileISelektywnosc:
    def test_brak_modelu_dynamicznego_obniza_frt_i_hvrt(self) -> None:
        macierz = macierz_gotowosci_der(we(dynamic_model_ref=None))
        assert macierz["frt"] == "partial"
        assert macierz["hvrt"] == "partial"

    def test_brak_profilu_operatora_blokuje_zgodnosc_i_regulacje(self) -> None:
        macierz = macierz_gotowosci_der(we(nc_rfg_profile_ref=None))
        assert macierz["nc_rfg"] == "blocked"
        assert macierz["q_u"] == "blocked"
        assert macierz["frt"] == "blocked"

    def test_jedyny_wytworca_w_stacji_daje_selektywnosc_czesciowa(self) -> None:
        assert (
            macierz_gotowosci_der(we(other_ders_in_station=0))["protection_selectivity"]
            == "partial"
        )


class TestPodsumowanie:
    def test_liczby_osi_wg_statusu(self) -> None:
        podsumowanie = podsumuj_gotowosc(macierz_gotowosci_der(we()))
        assert podsumowanie["total"] == len(OSIE_GOTOWOSCI)
        assert podsumowanie["ready"] == len(OSIE_GOTOWOSCI)
        assert podsumowanie["partial"] == 0 and podsumowanie["blocked"] == 0


class TestMapowanieZGeneratora:
    def test_wiazania_zapisane_operacja_kanoniczna_sa_widziane(self) -> None:
        # Klucze te same, ktore zapisuje `set_der_catalog_bindings` (V12K-238).
        generator = {
            "ref_id": "gen-1",
            "gen_type": "pv_inverter",
            "p_mw": 2.5,
            "bus_ref": "bus-nn-1",
            "catalog_ref": "pv_inv_sma_2500",
            "connection_variant": "block_transformer",
            "materialized_params": {
                "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
                "vt_catalog_ref": "vt_10kv_100v_05_abb",
                "protection_catalog_ref": "ABB_REB670",
                "block_transformer_catalog_ref": "btr_pv_15_04_1000",
                "profiles": {"nc_rfg_profile_ref": "pse", "lvrt_curve_ref": "lvrt_pse"},
            },
        }
        wejscie = wejscie_z_generatora(
            generator, ct_accuracy_class="5P10", ct_application="protection"
        )
        assert wejscie.der_kind == "PV"
        assert wejscie.connection_side == "dedicated_transformer"
        assert wejscie.nominal_power_kw == 2500.0
        assert wejscie.ct_catalog_ref == "ct_200_5_5p10_10va_abb"
        assert wejscie.block_transformer_catalog_ref == "btr_pv_15_04_1000"
        assert wejscie.nc_rfg_profile_ref == "pse"
        assert wejscie.hvrt_curve_ref is None  # brak danej zostaje brakiem

    def test_pusty_lancuch_to_BRAK_a_nie_wartosc(self) -> None:
        wejscie = wejscie_z_generatora(
            {"ref_id": "gen-2", "gen_type": "bess", "materialized_params": {"ct_catalog_ref": "  "}}
        )
        assert wejscie.ct_catalog_ref is None
        assert wejscie.der_kind == "BESS"

    def test_bus_ref_sluzy_za_przylacze_dopiero_gdy_brak_jawnego(self) -> None:
        jawny = wejscie_z_generatora(
            {
                "ref_id": "g",
                "bus_ref": "bus-1",
                "materialized_params": {"bus_przylaczenia_ref": "szyna-jawna"},
            }
        )
        assert jawny.bus_przylaczenia_ref == "szyna-jawna"
        domyslny = wejscie_z_generatora({"ref_id": "g", "bus_ref": "bus-1"})
        assert domyslny.bus_przylaczenia_ref == "bus-1"
