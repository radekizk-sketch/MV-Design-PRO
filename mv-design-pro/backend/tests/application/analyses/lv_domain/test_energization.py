"""Testy energizacji domeny nN — ZACISKI, ODCINKI, WYSPY (kontrakt 3.0.0).

ILOCZYN CECH, nie przykład z karty: {1 TR, 2 TR} × {sprzęgło otwarte/zamknięte}
× {DER: brak / PV na sekcji / PV na odciętej podszynie} × {zdolność DER:
niezadeklarowana / podążająca / tworząca / podwójna} × {podszyna odcięta} ×
{system SN: wspólny / niezależny}. Każdy przypadek sprawdza stan ZACISKU,
ODCINKA i WYSPY naraz — trzy pytania liczone osobno (§5), więc badanie ich
pojedynczo przepuściłoby rozjechanie się definicji.
"""

from __future__ import annotations

from application.analyses.lv_domain.energization import (
    build_energization_view,
    resolve_der_island_capability,
)
from application.analyses.lv_domain.graph_view import build_lv_domain_view
from enm.models import Generator, Source

from tests.application.analyses.lv_domain.fixtury_stacji_nn import zbuduj_stacje_nn


def _stany(view_buses: list[dict]) -> dict[str, dict]:
    return {bus["ref_id"]: bus for bus in view_buses}


def _segmenty(graph: dict) -> dict[str, dict]:
    return {segment["segment_id"]: segment for segment in graph["segments"]}


def _wyspa_szyny(graph: dict, bus_ref: str) -> dict:
    return next(w for w in graph["islands"] if bus_ref in w["bus_refs"])


class TestZdolnoscPracyWyspowej:
    """Zdolność DER czytana Z DANYCH, nigdy zgadywana — kolejność źródeł
    deklaracji i klasa maszyny."""

    def _gen(self, **kwargs) -> Generator:
        base: dict = {
            "ref_id": "g",
            "name": "g",
            "bus_ref": "b",
            "p_mw": 0.1,
            "gen_type": "pv_inverter",
        }
        base.update(kwargs)
        return Generator(**base)

    def test_falownik_bez_deklaracji_ma_zdolnosc_nieznana(self) -> None:
        capability, source = resolve_der_island_capability(self._gen())
        assert capability == "UNKNOWN"
        assert "brak deklaracji" in source

    def test_jawna_deklaracja_meta_wygrywa_z_trybem_regulacji(self) -> None:
        gen = self._gen(
            meta={"island_capability": "grid-forming", "control_mode": "GRID_FOLLOWING"}
        )
        assert resolve_der_island_capability(gen)[0] == "GRID_FORMING"

    def test_tryb_regulacji_z_meta_i_z_katalogu(self) -> None:
        assert resolve_der_island_capability(self._gen(meta={"control_mode": "GRID_FOLLOWING"}))[
            0
        ] == ("GRID_FOLLOWING")
        capability, source = resolve_der_island_capability(
            self._gen(materialized_params={"control_mode": "GRID_FORMING"})
        )
        assert capability == "GRID_FORMING"
        assert "katalog" in source

    def test_tryb_podwojny(self) -> None:
        assert resolve_der_island_capability(self._gen(meta={"island_capability": "DUAL_MODE"}))[
            0
        ] == ("DUAL_MODE")

    def test_klasa_maszyny_rozstrzyga_bez_deklaracji(self) -> None:
        assert resolve_der_island_capability(self._gen(gen_type="synchronous"))[0] == "DUAL_MODE"
        assert resolve_der_island_capability(self._gen(gen_type="fw_scig"))[0] == "GRID_FOLLOWING"
        assert resolve_der_island_capability(self._gen(gen_type="fw_dfig"))[0] == "GRID_FOLLOWING"
        assert resolve_der_island_capability(self._gen(gen_type="bess"))[0] == "UNKNOWN"

    def test_wartosc_spoza_slownika_nie_jest_zgadywana(self) -> None:
        assert resolve_der_island_capability(self._gen(meta={"island_capability": "cokolwiek"}))[
            0
        ] == ("UNKNOWN")


class TestEnergizacjaJednegoTransformatora:
    def test_wszystkie_szyny_zasilane_z_jednego_transformatora(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(), "stn")
        stany = _stany(graph["buses"])
        assert set(stany) == {"nn_a", "a1", "a2"}
        for bus in stany.values():
            assert bus["energization_state"] == "ENERGIZED"
            assert bus["is_energized"] is True
            assert bus["supply_refs"] == ["tr1"]
            assert bus["island_ref"] == "island-1"
            assert bus["grid_energized"] is True
        assert [wyspa["island_ref"] for wyspa in graph["islands"]] == ["island-1"]
        wyspa = graph["islands"][0]
        assert wyspa["bus_refs"] == ["a1", "a2", "nn_a"]
        assert wyspa["is_islanded"] is False
        assert wyspa["energizing_source_ids"] == ["tr1"]
        assert wyspa["grid_source_refs"] == ["src"]
        assert wyspa["frequency_reference_source_id"] == "src"
        assert wyspa["island_operation_allowed"] is None
        assert wyspa["power_balance"]["state"] == "z_sieci"

    def test_podszyna_za_otwartym_lacznikiem_jest_niezasilona_topologicznie(self) -> None:
        """Domena obejmuje szynę odciętą (topologia), ale energizacja mówi
        wprost: NIEZASILONA wg aktualnej topologii, bez źródła, bez DER."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(wyspa_odcieta=True), "stn")
        stany = _stany(graph["buses"])
        assert stany["wyspa"]["energization_state"] == "DEENERGIZED"
        assert stany["wyspa"]["is_energized"] is False
        assert stany["wyspa"]["supply_refs"] == []
        assert stany["nn_a"]["energization_state"] == "ENERGIZED"

        wyspy = {w["island_ref"]: w for w in graph["islands"]}
        assert len(wyspy) == 2
        assert wyspy["island-2"]["bus_refs"] == ["wyspa"]
        assert wyspy["island-2"]["energization_state"] == "DEENERGIZED"
        assert wyspy["island-2"]["is_islanded"] is True
        assert wyspy["island-2"]["der_refs"] == []
        assert wyspy["island-2"]["island_operation_allowed"] is False
        assert graph["measured_voltage_states"] == {}
        assert "topologiczne" in graph["energization_basis_pl"]

    def test_pv_podazajace_na_odcietej_podszynie_nie_utrzymuje_napiecia(self) -> None:
        """§14: PV wyłącznie grid-following w wyspie ⇒ wyspa NIEZASILONA, ale
        z komunikatem NN-AUD-09 (to nie „martwa szyna", to brak źródła
        tworzącego napięcie)."""
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FOLLOWING"),
            "stn",
        )
        stany = _stany(graph["buses"])
        assert stany["wyspa"]["energization_state"] == "DEENERGIZED"
        assert stany["wyspa"]["supply_refs"] == []
        wyspa = _wyspa_szyny(graph, "wyspa")
        assert wyspa["is_islanded"] is True
        assert wyspa["der_refs"] == ["pv_wyspa"]
        assert wyspa["has_grid_forming_source"] is False
        assert wyspa["is_energized"] is False
        assert [m["code"] for m in wyspa["validation_messages"]] == ["NN-AUD-09"]

    def test_pv_tworzace_napiecie_na_odcietej_podszynie_zasila_wyspe(self) -> None:
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FORMING"),
            "stn",
        )
        stany = _stany(graph["buses"])
        assert stany["wyspa"]["energization_state"] == "ENERGIZED"
        assert stany["wyspa"]["grid_energized"] is False
        assert stany["wyspa"]["supply_refs"] == ["pv_wyspa"]
        wyspa = _wyspa_szyny(graph, "wyspa")
        assert wyspa["is_islanded"] is True
        assert wyspa["has_grid_forming_source"] is True
        assert wyspa["energizing_source_ids"] == ["pv_wyspa"]
        assert wyspa["frequency_reference_source_id"] == "pv_wyspa"
        assert wyspa["voltage_reference_source_id"] == "pv_wyspa"
        # Bilans mocy znamionowej: PV 0,05 MW, brak odbioru na wyspie → nadwyżka.
        assert wyspa["power_balance"]["state"] == "nadwyzka"
        # Odniesienie N/PE: układ zadeklarowany, ale źródło DER nie wnosi punktu
        # neutralnego → brak źródła, SWZ nieoceniane, praca wyspowa NIEdopuszczona.
        assert wyspa["neutral_reference"]["status"] == "brak_zrodla"
        assert wyspa["neutral_reference"]["swz_evaluable"] is False
        assert wyspa["island_operation_allowed"] is False
        assert "NN-AUD-08" in {m["code"] for m in wyspa["validation_messages"]}

    def test_pv_bez_deklaracji_na_odcietej_podszynie_daje_stan_nieznany(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True), "stn")
        stany = _stany(graph["buses"])
        assert stany["wyspa"]["energization_state"] == "UNKNOWN"
        assert stany["wyspa"]["is_energized"] is None
        wyspa = _wyspa_szyny(graph, "wyspa")
        assert wyspa["is_energized"] is None
        assert [m["code"] for m in wyspa["validation_messages"]] == ["NN-AUD-14"]

    def test_pv_na_zasilanej_sekcji_nie_zmienia_stanu_sieciowego(self) -> None:
        """PV podążające na szynie POD NAPIĘCIEM — sekcja ENERGIZED z jednego
        transformatora; PV nie jest źródłem zasilania sekcji."""
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(pv_na_nn=True, zdolnosc_pv="GRID_FOLLOWING"), "stn"
        )
        stany = _stany(graph["buses"])
        assert stany["a2"]["energization_state"] == "ENERGIZED"
        assert stany["a2"]["supply_refs"] == ["tr1"]
        wyspa = _wyspa_szyny(graph, "a2")
        assert wyspa["der_refs"] == ["pv_nn"]
        assert wyspa["energizing_source_ids"] == ["tr1"]

    def test_pv_tworzace_bez_trybu_podwojnego_rownolegle_z_siecia_to_konflikt(self) -> None:
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(pv_na_nn=True, zdolnosc_pv="GRID_FORMING"), "stn"
        )
        stany = _stany(graph["buses"])
        assert stany["a2"]["energization_state"] == "CONFLICT"
        wyspa = _wyspa_szyny(graph, "a2")
        assert wyspa["energization_state"] == "CONFLICT"
        assert wyspa["is_energized"] is True
        assert [m["code"] for m in wyspa["validation_messages"]] == ["NN-AUD-06"]

    def test_pv_w_trybie_podwojnym_rownolegle_z_siecia_nie_zmienia_zasilania_sekcji(self) -> None:
        """Źródło z trybem podwójnym przy pracy Z SIECIĄ podąża za siecią —
        napięcie sekcji trzyma transformator; zdolność tworzenia napięcia
        ujawni się dopiero w wyspie (`has_grid_forming_source` = True)."""
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(pv_na_nn=True, zdolnosc_pv="DUAL_MODE"), "stn"
        )
        stany = _stany(graph["buses"])
        assert stany["a2"]["energization_state"] == "ENERGIZED"
        assert stany["a2"]["supply_refs"] == ["tr1"]
        wyspa = _wyspa_szyny(graph, "a2")
        assert wyspa["energization_state"] == "ENERGIZED"
        assert wyspa["has_grid_forming_source"] is True
        assert wyspa["validation_messages"] == []


class TestEnergizacjaDwochTransformatorow:
    def test_sprzeglo_zamkniete_obie_sekcje_wielozrodlowe(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"), "stn")
        stany = _stany(graph["buses"])
        for ref in ("nn_a", "a1", "a2", "nn_b", "b1", "b2"):
            assert stany[ref]["energization_state"] == "MULTISOURCE", ref
            assert stany[ref]["supply_refs"] == ["tr1", "tr2"], ref
        assert len(graph["islands"]) == 1
        wyspa = graph["islands"][0]
        assert wyspa["energization_state"] == "MULTISOURCE"
        assert wyspa["upstream_system_ids"] == ["sn"]
        assert wyspa["energizing_source_ids"] == ["tr1", "tr2"]

    def test_sprzeglo_otwarte_kazda_sekcja_ma_swoj_transformator(self) -> None:
        """Sedno rozdzielenia składowych: przy sprzęgle OTWARTYM sekcja A nie
        może meldować TR2 jako zasilającego (choć oba są w jednej wyspie)."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"), "stn")
        stany = _stany(graph["buses"])
        assert stany["nn_a"]["supply_refs"] == ["tr1"]
        assert stany["a2"]["supply_refs"] == ["tr1"]
        assert stany["nn_b"]["supply_refs"] == ["tr2"]
        assert stany["b2"]["supply_refs"] == ["tr2"]
        for ref in ("nn_a", "a2", "nn_b", "b2"):
            assert stany[ref]["energization_state"] == "ENERGIZED"

    def test_wyspa_laczy_sekcje_przez_siec_sn_mimo_otwartego_sprzegla(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"), "stn")
        assert len(graph["islands"]) == 1
        wyspa = graph["islands"][0]
        assert wyspa["bus_refs"] == ["a1", "a2", "b1", "b2", "nn_a", "nn_b"]
        assert wyspa["energizing_source_ids"] == ["tr1", "tr2"]
        assert wyspa["energization_state"] == "ENERGIZED"

    def test_dwa_transformatory_na_wspolnej_szynie_to_wielozrodlowosc(self) -> None:
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(transformatory=2, wspolna_szyna_nn=True), "stn"
        )
        stany = _stany(graph["buses"])
        assert stany["nn_a"]["supply_refs"] == ["tr1", "tr2"]
        assert stany["nn_a"]["energization_state"] == "MULTISOURCE"
        assert stany["b2"]["supply_refs"] == ["tr1", "tr2"]

    def test_niezalezne_systemy_sn_ze_sprzeglem_otwartym_to_dwie_wyspy(self) -> None:
        """§39 F: upstream TA ≠ TB — dwa systemy, dwie wyspy, każda ENERGIZED."""
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="open", niezalezny_system_sn_tr2=True),
            "stn",
        )
        assert len(graph["islands"]) == 2
        a, b = _wyspa_szyny(graph, "nn_a"), _wyspa_szyny(graph, "nn_b")
        assert a["upstream_system_ids"] == ["sn"]
        assert b["upstream_system_ids"] == ["sn2"]
        assert a["energization_state"] == b["energization_state"] == "ENERGIZED"
        trafo = {t["ref_id"]: t for t in graph["transformers"]}
        assert trafo["tr1"]["upstream_system_id"] == "sn"
        assert trafo["tr2"]["upstream_system_id"] == "sn2"

    def test_niezalezne_systemy_sn_spiete_sprzeglem_to_konflikt(self) -> None:
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", niezalezny_system_sn_tr2=True),
            "stn",
        )
        assert len(graph["islands"]) == 1
        wyspa = graph["islands"][0]
        assert wyspa["energization_state"] == "CONFLICT"
        assert wyspa["upstream_system_ids"] == ["sn", "sn2"]
        assert [m["code"] for m in wyspa["validation_messages"]] == ["NN-AUD-06"]
        stany = _stany(graph["buses"])
        assert {stany[ref]["energization_state"] for ref in ("nn_a", "nn_b", "a2", "b2")} == {
            "CONFLICT"
        }

    def test_wspolny_system_sn_ma_ten_sam_identyfikator(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"), "stn")
        trafo = {t["ref_id"]: t for t in graph["transformers"]}
        assert trafo["tr1"]["upstream_system_id"] == trafo["tr2"]["upstream_system_id"] == "sn"


class TestOdcinki:
    """Mapa energizacji ODCINKÓW: łączność, stan zacisków obu stron, stan
    przewodnika — trzy pytania rozdzielone (§5/§6)."""

    def test_odcinek_zamkniety_niesie_stan_wyspy_i_zrodla(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(), "stn")
        segmenty = _segmenty(graph)
        assert set(segmenty) == {"ap_a", "c_a"}
        ap = segmenty["ap_a"]
        assert ap["connectivity_state"] == "CLOSED"
        assert ap["energization_state"] == "ENERGIZED"
        assert ap["source_ids"] == ["tr1"]
        assert ap["island_ref"] == "island-1"
        assert ap["from_terminal"]["energization_state"] == "ENERGIZED"
        assert ap["to_terminal"]["energization_state"] == "ENERGIZED"
        assert ap["voltage_level_id"] == "kv:0.4"

    def test_aparat_otwarty_zasilony_od_gory_i_niezasilony_od_dolu(self) -> None:
        """Wyłącznik otwarty od strony zasilania: zacisk górny ENERGIZED, dolny
        DEENERGIZED, przewodnik nie prowadzi prądu — trzy różne fakty."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(wyspa_odcieta=True), "stn")
        seg = _segmenty(graph)["roz_wyspa"]
        assert seg["connectivity_state"] == "OPEN"
        assert seg["energization_state"] == "DEENERGIZED"
        assert seg["source_ids"] == []
        assert seg["island_ref"] is None
        assert seg["from_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["from_terminal"]["island_ref"] == "island-1"
        assert seg["to_terminal"]["energization_state"] == "DEENERGIZED"
        assert seg["to_terminal"]["island_ref"] == "island-2"

    def test_aparat_otwarty_zasilony_z_obu_stron_z_roznych_wysp(self) -> None:
        """Energizacja dwustronna: PV tworzące napięcie za otwartym rozłącznikiem
        — OBA zaciski pod napięciem, z DWÓCH RÓŻNYCH wysp."""
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FORMING"),
            "stn",
        )
        seg = _segmenty(graph)["roz_wyspa"]
        assert seg["connectivity_state"] == "OPEN"
        assert seg["from_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["to_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["from_terminal"]["island_ref"] != seg["to_terminal"]["island_ref"]
        assert seg["from_terminal"]["supply_refs"] == ["tr1"]
        assert seg["to_terminal"]["supply_refs"] == ["pv_wyspa"]

    def test_sprzeglo_otwarte_ma_oba_zaciski_zasilone_z_roznych_transformatorow(self) -> None:
        """§7: sprzęgło OTWARTE nie wygasza żadnej z dwóch zasilonych sekcji."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"), "stn")
        seg = _segmenty(graph)["coupler"]
        assert seg["connectivity_state"] == "OPEN"
        assert seg["from_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["to_terminal"]["energization_state"] == "ENERGIZED"
        assert seg["from_terminal"]["supply_refs"] == ["tr1"]
        assert seg["to_terminal"]["supply_refs"] == ["tr2"]

    def test_sprzeglo_zamkniete_jest_odcinkiem_wielozrodlowym(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"), "stn")
        seg = _segmenty(graph)["coupler"]
        assert seg["connectivity_state"] == "CLOSED"
        assert seg["energization_state"] == "MULTISOURCE"
        assert seg["source_ids"] == ["tr1", "tr2"]


class TestToryZasilania:
    def test_kazda_zasilona_szyna_ma_tor_od_swojego_zrodla(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"), "stn")
        tory = {(p["bus_ref"], p["source_ref"]): p for p in graph["supply_paths"]}
        assert tory[("a2", "tr1")]["branch_refs"] == ["ap_a", "c_a"]
        assert tory[("a2", "tr1")]["source_bus_ref"] == "nn_a"
        assert tory[("b2", "tr2")]["branch_refs"] == ["ap_b", "c_b"]
        assert tory[("nn_a", "tr1")]["branch_refs"] == []
        assert ("a2", "tr2") not in tory

    def test_sprzeglo_zamkniete_daje_tor_od_obu_transformatorow(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"), "stn")
        tory = {(p["bus_ref"], p["source_ref"]): p for p in graph["supply_paths"]}
        assert tory[("b2", "tr1")]["branch_refs"] == ["coupler", "ap_b", "c_b"]
        assert tory[("b2", "tr2")]["branch_refs"] == ["ap_b", "c_b"]

    def test_szyna_niezasilona_nie_ma_toru(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(wyspa_odcieta=True), "stn")
        assert all(p["bus_ref"] != "wyspa" for p in graph["supply_paths"])

    def test_wyspa_der_ma_tor_od_zrodla_tworzacego(self) -> None:
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FORMING"),
            "stn",
        )
        tory = {(p["bus_ref"], p["source_ref"]): p for p in graph["supply_paths"]}
        assert tory[("wyspa", "pv_wyspa")]["branch_refs"] == []


class TestZrodloNnJestZrodlemEnergizacji:
    """`Source` na szynie nN (agregat, zasilanie rezerwowe zamodelowane jako
    sieć) energizuje odciętą sekcję — definicja „źródła energizacji" jest TA
    SAMA co w walidatorze: KAŻDY Source, SN albo nN."""

    def test_source_nn_na_odcietej_podszynie_energizuje_ja(self) -> None:
        enm = zbuduj_stacje_nn(wyspa_odcieta=True)
        enm.sources.append(
            Source(
                ref_id="agregat",
                name="Agregat nN",
                bus_ref="wyspa",
                model="thevenin",
                r_ohm=0.05,
                x_ohm=0.05,
            )
        )
        graph = build_lv_domain_view(enm, "stn")
        stany = _stany(graph["buses"])
        assert stany["wyspa"]["energization_state"] == "ENERGIZED"
        assert stany["wyspa"]["supply_refs"] == ["agregat"]
        assert stany["wyspa"]["grid_energized"] is True
        wyspa = _wyspa_szyny(graph, "wyspa")
        assert wyspa["is_islanded"] is False
        assert wyspa["grid_source_refs"] == ["agregat"]
        assert wyspa["neutral_reference"]["source_ref"] == "agregat"


class TestOdniesienieNPe:
    def test_uklad_niezadeklarowany_daje_brak_ukladu(self) -> None:
        enm = zbuduj_stacje_nn()
        enm.substations[0].meta = {}
        graph = build_lv_domain_view(enm, "stn")
        neutral = graph["islands"][0]["neutral_reference"]
        assert neutral["status"] == "brak_ukladu"
        assert neutral["swz_evaluable"] is False
        assert "NN-AUD-08" in {m["code"] for m in graph["islands"][0]["validation_messages"]}

    def test_uklad_it_nie_pozwala_oceniac_swz(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(uklad_uziemienia="IT"), "stn")
        neutral = graph["islands"][0]["neutral_reference"]
        assert neutral["status"] == "OK"
        assert neutral["system"] == "IT"
        assert neutral["swz_evaluable"] is False

    def test_uklad_tn_z_transformatorem_daje_ok(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(), "stn")
        neutral = graph["islands"][0]["neutral_reference"]
        assert neutral == {
            "system": "TN-C-S",
            "source_ref": "tr1",
            "status": "OK",
            "status_pl": "Układ TN-C-S; punkt neutralny: tr1.",
            "swz_evaluable": True,
        }


class TestBilansMocyWyspy:
    def test_wyspa_der_z_odbiorem_wiekszym_niz_generacja_ma_deficyt(self) -> None:
        enm = zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FORMING")
        from enm.models import Load

        enm.loads.append(
            Load(ref_id="load_w", name="Odbiór wyspy", bus_ref="wyspa", p_mw=0.08, q_mvar=0.0)
        )
        graph = build_lv_domain_view(enm, "stn")
        wyspa = _wyspa_szyny(graph, "wyspa")
        assert wyspa["power_balance"] == {
            "p_generation_mw": 0.05,
            "p_load_mw": 0.08,
            "state": "deficyt",
            "basis_pl": "suma mocy znamionowych z modelu (dane źródłowe, nie wynik rozpływu)",
        }
        assert wyspa["island_operation_allowed"] is False
        assert "NN-AUD-17" in {m["code"] for m in wyspa["validation_messages"]}

    def test_wyspa_zrownowazona(self) -> None:
        enm = zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True, zdolnosc_pv="GRID_FORMING")
        from enm.models import Load

        enm.loads.append(
            Load(ref_id="load_w", name="Odbiór wyspy", bus_ref="wyspa", p_mw=0.05, q_mvar=0.0)
        )
        graph = build_lv_domain_view(enm, "stn")
        assert _wyspa_szyny(graph, "wyspa")["power_balance"]["state"] == "zrownowazony"


class TestSpojnoscWyspyIDeterminizm:
    def test_wszystkie_szyny_wyspy_maja_stan_zgodny_z_wyspa(self) -> None:
        """Wyspa niesie JEDEN stan; szyna może się różnić WYŁĄCZNIE tym, że
        sekcja z ≥2 źródłami jest MULTISOURCE w wyspie ENERGIZED."""
        enm = zbuduj_stacje_nn(
            transformatory=2,
            sprzeglo="open",
            wyspa_odcieta=True,
            pv_na_wyspie=True,
            zdolnosc_pv="GRID_FORMING",
        )
        graph = build_lv_domain_view(enm, "stn")
        stany = _stany(graph["buses"])
        for wyspa in graph["islands"]:
            for ref in wyspa["bus_refs"]:
                stan = stany[ref]["energization_state"]
                assert stan == wyspa["energization_state"] or (
                    stan == "MULTISOURCE"
                    and wyspa["energization_state"] in ("ENERGIZED", "MULTISOURCE")
                )
                assert stany[ref]["island_ref"] == wyspa["island_ref"]

    def test_dwa_wywolania_daja_identyczny_wynik(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", wyspa_odcieta=True)
        pierwszy = build_energization_view(enm, {"nn_a", "nn_b", "a1", "a2", "b1", "b2", "wyspa"})
        drugi = build_energization_view(enm, {"wyspa", "b2", "b1", "a2", "a1", "nn_b", "nn_a"})
        assert pierwszy.islands == drugi.islands
        assert pierwszy.terminals == drugi.terminals
        assert pierwszy.supply_paths == drugi.supply_paths
