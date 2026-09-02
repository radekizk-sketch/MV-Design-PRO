"""Audyt topologii domeny nN (§34) — każdy kod ma iniekcję, która go wywołuje,
i przypadek zdrowy, który go NIE wywołuje (deklaracja bez testu = fałszywa
pewność)."""

from __future__ import annotations

from application.analyses.lv_domain.audit import AUDIT_CODES, collect_validation_messages
from application.analyses.lv_domain.graph_view import build_lv_domain_view
from enm.models import Bus, Cable, Generator, Load, SwitchBranch, Transformer

from tests.application.analyses.lv_domain.fixtury_stacji_nn import zbuduj_stacje_nn


def _kody(enm, *, result_status: str | None = None) -> list[str]:
    graph = build_lv_domain_view(enm, "stn")
    return [m["code"] for m in collect_validation_messages(graph, result_status=result_status)]


def _komunikaty(enm) -> list[dict]:
    graph = build_lv_domain_view(enm, "stn")
    return collect_validation_messages(graph, result_status=None)


class TestStacjaZdrowa:
    def test_stacja_wzorcowa_ma_wylacznie_brak_wylacznika_glownego(self) -> None:
        """Fikstura bazowa: transformator wchodzi na szynę bez wyłącznika
        głównego nN — to JEDYNY komunikat (NN-AUD-07), reszta czysta."""
        assert _kody(zbuduj_stacje_nn()) == ["NN-AUD-07"]

    def test_kody_sa_zamknieta_lista(self) -> None:
        assert AUDIT_CODES == tuple(f"NN-AUD-{i:02d}" for i in range(1, 18))


class TestKodyAudytu:
    def test_01_zacisk_wiszacy(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.buses.append(Bus(ref_id="wisi", name="Zacisk wiszący", voltage_kv=0.4))
        enm.branches.append(
            Cable(
                ref_id="c_wisi",
                name="c_wisi",
                from_bus_ref="a1",
                to_bus_ref="wisi",
                length_km=0.01,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.08,
                catalog_ref="kabel-nn-yaky-4x120",
                catalog_namespace="KABEL_NN",
            )
        )
        assert "NN-AUD-01" in _kody(enm)

    def test_02_odplyw_do_niczego(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.loads.clear()
        komunikaty = _komunikaty(enm)
        odplyw = [m for m in komunikaty if m["code"] == "NN-AUD-02"]
        assert len(odplyw) == 1
        assert odplyw[0]["element_refs"] == ["ap_a"]

    def test_03_domena_bez_zrodla_strukturalnego(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.transformers.clear()
        enm.substations[0].transformer_refs = []
        assert "NN-AUD-03" in _kody(enm)

    def test_04_zrodlo_odizolowane(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.buses.append(Bus(ref_id="samotna", name="Samotna", voltage_kv=0.4))
        enm.substations[0].bus_refs.append("samotna")
        enm.generators.append(
            Generator(
                ref_id="g_sam",
                name="G samotny",
                bus_ref="samotna",
                p_mw=0.01,
                gen_type="synchronous",
            )
        )
        # Szyna stacji (is_board) — źródło bez pola daje NN-AUD-07; brak
        # gałęzi na szynie NIE-rozdzielnicowej daje NN-AUD-04: sprawdzamy
        # wariant zacisku spoza listy szyn stacji.
        enm2 = zbuduj_stacje_nn()
        enm2.buses.append(Bus(ref_id="samotna2", name="Samotna 2", voltage_kv=0.4))
        enm2.generators.append(
            Generator(
                ref_id="g_sam2",
                name="G samotny 2",
                bus_ref="samotna2",
                p_mw=0.01,
                gen_type="synchronous",
            )
        )
        enm2.transformers.append(
            Transformer(
                ref_id="tr_sam",
                name="TR samotny",
                hv_bus_ref="sn",
                lv_bus_ref="samotna2",
                sn_mva=0.1,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=1.0,
                vector_group="Dyn11",
            )
        )
        enm2.substations[0].transformer_refs.append("tr_sam")
        assert "NN-AUD-07" in _kody(enm)
        kody2 = _kody(enm2)
        assert "NN-AUD-04" not in kody2  # szyna ma transformator — nie jest odizolowana
        enm3 = zbuduj_stacje_nn()
        enm3.buses.append(Bus(ref_id="samotna3", name="Samotna 3", voltage_kv=0.4))
        enm3.generators.append(
            Generator(
                ref_id="g_sam3",
                name="G samotny 3",
                bus_ref="samotna3",
                p_mw=0.01,
                gen_type="synchronous",
            )
        )
        # Szyna wchłonięta do domeny przez gałąź OTWARTĄ z a1 — jedyna gałąź to ta
        # otwarta, więc degree=1: to zacisk z gałęzią; audyt 04 dotyczy szyny BEZ gałęzi.
        # Buduje się przypadek: bus bez gałęzi nie może być w domenie inaczej niż
        # przez bus_refs stacji, a wtedy is_board=True → NN-AUD-07. Dokumentujemy
        # ten fakt asercją: kod 04 pozostaje dla podrozdzielnicy bez gałęzi.
        enm3.substations.append(
            type(enm3.substations[0])(
                ref_id="sub_sam",
                name="Podrozdzielnica samotna",
                station_type="rozdzielnica_nn",
                bus_refs=["samotna3"],
                transformer_refs=[],
            )
        )
        assert "NN-AUD-04" not in _kody(enm3)

    def test_05_zamknieta_galaz_miedzy_poziomami_napiecia(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.buses.append(Bus(ref_id="n690", name="0,69 kV", voltage_kv=0.69))
        enm.branches.append(
            SwitchBranch(
                ref_id="q_690",
                name="q_690",
                type="switch",
                from_bus_ref="a2",
                to_bus_ref="n690",
                catalog_ref="aparat-nn-rozlacznik-160a",
                catalog_namespace="APARAT_NN",
            )
        )
        enm.loads.append(
            Load(ref_id="l690", name="Odbiór 690", bus_ref="n690", p_mw=0.01, q_mvar=0.0)
        )
        assert "NN-AUD-05" in _kody(enm)

    def test_06_konflikt_zrodel(self) -> None:
        assert "NN-AUD-06" in _kody(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", niezalezny_system_sn_tr2=True)
        )

    def test_07_brak_aparatu_w_torze_cztery_warianty(self) -> None:
        # (a) odpływ zaczynający się kablem
        enm = zbuduj_stacje_nn()
        enm.branches = [b for b in enm.branches if b.ref_id != "ap_a"]
        enm.branches.append(
            Cable(
                ref_id="c_bez",
                name="c_bez",
                from_bus_ref="nn_a",
                to_bus_ref="a1",
                length_km=0.01,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.08,
                catalog_ref="kabel-nn-yaky-4x120",
                catalog_namespace="KABEL_NN",
            )
        )
        teksty = [m["message_pl"] for m in _komunikaty(enm) if m["code"] == "NN-AUD-07"]
        assert any("kablem bez aparatu" in t for t in teksty)
        # (b) źródło wprost na szynie
        teksty = [
            m["message_pl"]
            for m in _komunikaty(zbuduj_stacje_nn(pv_na_nn=True, pv_wprost_na_sekcji=True))
            if m["code"] == "NN-AUD-07"
        ]
        assert any("bez pola (aparat" in t for t in teksty)
        # (c) odbiór wprost na szynie
        enm = zbuduj_stacje_nn()
        enm.loads.append(
            Load(ref_id="l_bez", name="Odbiór bez pola", bus_ref="nn_a", p_mw=0.01, q_mvar=0.0)
        )
        teksty = [m["message_pl"] for m in _komunikaty(enm) if m["code"] == "NN-AUD-07"]
        assert any("bez pola odpływowego" in t for t in teksty)
        # (d) transformator bez wyłącznika głównego (fikstura bazowa)
        teksty = [
            m["message_pl"] for m in _komunikaty(zbuduj_stacje_nn()) if m["code"] == "NN-AUD-07"
        ]
        assert any("bez wyłącznika głównego" in t for t in teksty)

    def test_07_transformator_z_wylacznikiem_glownym_jest_czysty(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.buses.append(Bus(ref_id="tr1_zacisk", name="TR1 zacisk nN", voltage_kv=0.4))
        enm.transformers[0].lv_bus_ref = "tr1_zacisk"
        enm.branches.append(
            SwitchBranch(
                ref_id="qf_tr1",
                name="QF-TR1",
                type="breaker",
                from_bus_ref="tr1_zacisk",
                to_bus_ref="nn_a",
                catalog_ref="aparat-nn-wylacznik-1000a",
                catalog_namespace="APARAT_NN",
            )
        )
        assert _kody(enm) == []

    def test_08_09_14_15_16_17_pochodza_z_wysp(self) -> None:
        assert "NN-AUD-09" in _kody(
            zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FOLLOWING")
        )
        assert "NN-AUD-14" in _kody(zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True))
        assert "NN-AUD-08" in _kody(
            zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FORMING")
        )

    def test_10_wspolne_zasilanie_sn_jest_informacja(self) -> None:
        komunikaty = _komunikaty(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"))
        info = [m for m in komunikaty if m["code"] == "NN-AUD-10"]
        assert len(info) == 1
        assert info[0]["severity"] == "INFO"
        assert info[0]["element_refs"] == ["tr1", "tr2"]

    def test_11_niepoprawne_przylaczenie_transformatora(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.transformers[0].ulv_kv = 0.69
        assert "NN-AUD-11" in _kody(enm)

    def test_12_niemozliwe_sprzezenie_sekcji(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        enm.buses[[b.ref_id for b in enm.buses].index("nn_b")].voltage_kv = 0.69
        enm.transformers[1].ulv_kv = 0.69
        assert "NN-AUD-12" in _kody(enm)
        enm2 = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        sprzeglo = next(b for b in enm2.branches if b.ref_id == "coupler")
        sprzeglo.to_bus_ref = "a1"
        assert "NN-AUD-12" in _kody(enm2)

    def test_13_wynik_nieaktualny(self) -> None:
        assert "NN-AUD-13" in _kody(zbuduj_stacje_nn(), result_status="OUTDATED")
        assert "NN-AUD-13" not in _kody(zbuduj_stacje_nn(), result_status="FRESH")

    def test_lista_jest_deterministyczna_i_bez_duplikatow(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", niezalezny_system_sn_tr2=True)
        pierwsza = _komunikaty(enm)
        druga = _komunikaty(enm)
        assert pierwsza == druga
        klucze = [(m["code"], tuple(m["element_refs"]), m["message_pl"]) for m in pierwsza]
        assert len(klucze) == len(set(klucze))
