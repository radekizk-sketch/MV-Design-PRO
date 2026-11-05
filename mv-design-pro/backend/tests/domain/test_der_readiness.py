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
    WejscieGotowosciDer,
    klasa_ct_jest_zabezpieczeniowa,
    macierz_gotowosci_der,
    osie_gotowosci_der,
    podsumuj_gotowosc,
)
from domain.der_readiness import (
    wejscie_z_generatora as _wejscie_z_generatora,
)


def wejscie_z_generatora(generator: dict, **kw) -> WejscieGotowosciDer:
    """Mapowanie generatora bez progu 87T profilu (stan produktu: żaden profil go nie niesie)."""
    kw.setdefault("prog_87t", None)
    kw.setdefault("profil_operatora_pl", None)
    return _wejscie_z_generatora(generator, **kw)


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
        for nadpisania in (
            {},
            {"device_catalog_ref": None},
            {"bus_przylaczenia_ref": None},
        ):
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
                block_transformer_catalog_ref="tr-sn-nn-15-04-1000kva-dyn11-tier2-suchy",
            )
        )
        assert macierz["equipment"] == "ready"

    def test_brak_transformatora_blokowego_obniza_i_nazywa(self) -> None:
        wejscie = we(connection_side="dedicated_transformer", block_transformer_catalog_ref=None)
        assert macierz_gotowosci_der(wejscie)["equipment"] == "partial"
        assert "der.dedicated_trafo.missing" in kody(osie_gotowosci_der(wejscie), "equipment")

    @pytest.mark.parametrize("sn_kva", [1000.0, 1600.0, 2500.0, None])
    @pytest.mark.parametrize("moc_zrodla_kw", [400.0, 5000.0])
    def test_bez_podstawy_progu_87t_nie_ma_blokady_dwurdzeniowej(
        self, sn_kva: float | None, moc_zrodla_kw: float
    ) -> None:
        # Podmiot: S_n transformatora (nie moc źródła); żaden profil operatora nie niesie
        # progu 87T z podstawą (`prog_87t_sn_transformatora: null`), więc wymaganie nie
        # powstaje — BRAK_PODSTAWY nazywa dobór funkcji, gotowość nie wymyśla blokady.
        wejscie = we(
            connection_side="dedicated_transformer",
            nominal_power_kw=moc_zrodla_kw,
            block_transformer_sn_kva=sn_kva,
            block_transformer_catalog_ref="tr-sn-nn-15-04-1000kva-dyn11-tier2-suchy",
            ct_application="protection",
        )
        assert macierz_gotowosci_der(wejscie)["protection"] == "ready"
        assert "der.ct_87t_dual_core.required" not in kody(
            osie_gotowosci_der(wejscie), "protection"
        )

    @pytest.mark.parametrize(
        ("sn_kva", "moc_zrodla_kw", "blokada"),
        [(1599.0, 5000.0, False), (1600.0, 400.0, True), (2500.0, 400.0, True)],
    )
    def test_z_podstawa_progu_blokada_wynika_z_s_n_transformatora(
        self,
        sn_kva: float,
        moc_zrodla_kw: float,
        blokada: bool,
    ) -> None:
        from werdykt.kontrakt import LimitKryterium, PodstawaWymagania, Wielkosc

        prog = LimitKryterium(
            wartosc=Wielkosc(wartosc=1600.0, jednostka="kVA"),
            podstawa=PodstawaWymagania(
                rodzaj="OSD",
                dokument="Warunki przyłączenia — dokument testowy",
                wydanie="wydanie testowe",
                jednostka_redakcyjna="pkt 4.2 (test)",
                status="WSKAZANE",
            ),
        )
        # Próg z profilu operatora wytwórcy — ta sama droga co końcówka gotowości
        # (`api.generators._prog_87t_operatora` → `wejscie_z_generatora(prog_87t=...)`).
        z_profilu = {"prog_87t": prog, "profil_operatora_pl": "Operator testowy"}
        wejscie = we(
            connection_side="dedicated_transformer",
            nominal_power_kw=moc_zrodla_kw,
            block_transformer_sn_kva=sn_kva,
            block_transformer_catalog_ref="tr-sn-nn-15-04-1000kva-dyn11-tier2-suchy",
            ct_application="protection",
            **z_profilu,
        )
        kody_ochrony = kody(osie_gotowosci_der(wejscie), "protection")
        assert ("der.ct_87t_dual_core.required" in kody_ochrony) is blokada
        assert macierz_gotowosci_der(wejscie)["protection"] == ("partial" if blokada else "ready")
        dwurdzeniowy = we(
            connection_side="dedicated_transformer",
            nominal_power_kw=moc_zrodla_kw,
            block_transformer_sn_kva=sn_kva,
            block_transformer_catalog_ref="tr-sn-nn-15-04-1000kva-dyn11-tier2-suchy",
            ct_application="dual",
            **z_profilu,
        )
        assert macierz_gotowosci_der(dwurdzeniowy)["protection"] == "ready"
        if blokada:
            blok = next(
                b
                for o in osie_gotowosci_der(wejscie)
                for b in o.blockers
                if b.code == "der.ct_87t_dual_core.required"
            )
            assert "Warunki przyłączenia — dokument testowy, pkt 4.2 (test)" in blok.message_pl

    def test_s_n_czytane_z_elementu_transformatora_modelu(self) -> None:
        generator = {
            "ref_id": "g1",
            "gen_type": "pv_inverter",
            "p_mw": 5.0,
            "connection_variant": "block_transformer",
            "blocking_transformer_ref": "tr-blok",
        }
        transformatory = [
            {"ref_id": "inny", "sn_mva": 0.63},
            {"ref_id": "tr-blok", "sn_mva": 2.5, "catalog_ref": "tr-x"},
        ]
        wejscie = wejscie_z_generatora(generator, transformatory=transformatory)
        assert wejscie.block_transformer_sn_kva == 2500.0
        assert wejscie.nominal_power_kw == 5000.0
        assert wejscie_z_generatora(generator).block_transformer_sn_kva is None


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
            # Pozycja transformatora dedykowanego to `catalog_ref` JEGO rekordu w modelu
            # (karta JEDNA-SCIEZKA-EDYCJI) — wytwórca wskazuje element, nie kopiuje referencji.
            "blocking_transformer_ref": "tr-ded-1",
            "materialized_params": {
                "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
                "vt_catalog_ref": "vt_10kv_100v_05_abb",
                "protection_catalog_ref": "ABB_REB670",
                "profiles": {"nc_rfg_profile_ref": "pse", "lvrt_curve_ref": "lvrt_pse"},
            },
        }
        wejscie = wejscie_z_generatora(
            generator,
            transformatory=[
                {
                    "ref_id": "tr-ded-1",
                    "catalog_ref": "tr-sn-nn-15-04-1000kva-dyn11-tier2-suchy",
                }
            ],
            ct_accuracy_class="5P10",
            ct_application="protection",
        )
        assert wejscie.der_kind == "PV"
        assert wejscie.connection_side == "dedicated_transformer"
        assert wejscie.nominal_power_kw == 2500.0
        assert wejscie.ct_catalog_ref == "ct_200_5_5p10_10va_abb"
        assert wejscie.block_transformer_catalog_ref == "tr-sn-nn-15-04-1000kva-dyn11-tier2-suchy"
        assert wejscie.nc_rfg_profile_ref == "pse"
        assert wejscie.hvrt_curve_ref is None  # brak danej zostaje brakiem

    @pytest.mark.parametrize(
        ("generator", "transformatory"),
        [
            # Kopia referencji w wytwórcy (klucz, którego żadna operacja nie zapisuje) NIE
            # jest pozycją transformatora — bez wskazanego elementu brak zostaje brakiem.
            (
                {
                    "connection_variant": "block_transformer",
                    "materialized_params": {"block_transformer_catalog_ref": "tr-x"},
                },
                [{"ref_id": "tr-x", "catalog_ref": "tr-x"}],
            ),
            # Wskazanie elementu, którego nie ma w modelu.
            (
                {"blocking_transformer_ref": "tr-brak"},
                [{"ref_id": "tr-1", "catalog_ref": "x"}],
            ),
            # Element bez pozycji katalogu (wpisany ręcznie) albo z pustą referencją.
            (
                {"blocking_transformer_ref": "tr-1"},
                [{"ref_id": "tr-1", "catalog_ref": None}],
            ),
            (
                {"blocking_transformer_ref": "tr-1"},
                [{"ref_id": "tr-1", "catalog_ref": "  "}],
            ),
        ],
    )
    def test_pozycja_transformatora_dedykowanego_tylko_z_elementu_modelu(
        self, generator: dict, transformatory: list
    ) -> None:
        wejscie = wejscie_z_generatora(
            {"ref_id": "g", "gen_type": "pv_inverter", **generator},
            transformatory=transformatory,
        )
        assert wejscie.block_transformer_catalog_ref is None

    def test_pusty_lancuch_to_BRAK_a_nie_wartosc(self) -> None:
        wejscie = wejscie_z_generatora(
            {
                "ref_id": "gen-2",
                "gen_type": "bess",
                "materialized_params": {"ct_catalog_ref": "  "},
            }
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
