"""Testy widoku pętli zwarcia nN — dowolny punkt + najdalszy punkt per odpływ
(karta P0.6, G-05)."""

from __future__ import annotations

from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    build_feeder_fault_loop_view,
    build_feeder_fault_loop_view_for_transformer,
    build_station_fault_loop_view,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)

from tests.application.analyses.lv_domain.fixtury_stacji_nn import zbuduj_stacje_nn


def _base_enm(branches: list, extra_buses: list[str]) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            *[Bus(ref_id=b, name=b, voltage_kv=0.4) for b in extra_buses],
        ],
        sources=[
            Source(ref_id="src", name="GPZ", bus_ref="sn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
            )
        ],
        branches=branches,
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )


def _cable(ref_id: str, from_bus: str, to_bus: str, *, return_r: float, return_x: float) -> Cable:
    return Cable(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        length_km=0.05,
        r_ohm_per_km=0.32,
        x_ohm_per_km=0.08,
        return_conductor_r_ohm_per_km_20c=return_r,
        return_conductor_x_ohm_per_km=return_x,
    )


class TestBuildFaultLoopViewAtPoint:
    def test_point_at_source_matches_station_view(self) -> None:
        """Trasa zerodługościowa (bus_ref = szyna TR) daje TEN SAM wynik co
        widok „u źródła" — jedna ścieżka fizyki, zero duplikacji."""
        enm = _base_enm([], [])
        at_point = build_fault_loop_view_at_point(enm, "stn", "nn")
        at_source = build_station_fault_loop_view(enm, "stn")
        assert at_point["fault_loop"]["z_loop_ohm"] == at_source["fault_loop"]["z_loop_ohm"]

    def test_point_further_down_route_has_larger_impedance(self) -> None:
        enm = _base_enm(
            [_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)],
            ["b1"],
        )
        at_source = build_station_fault_loop_view(enm, "stn")
        at_b1 = build_fault_loop_view_at_point(enm, "stn", "b1")
        assert at_b1["status"] == "OK"
        assert (
            at_b1["fault_loop"]["z_loop_ohm"]["magnitude"]
            > at_source["fault_loop"]["z_loop_ohm"]["magnitude"]
        )
        assert at_b1["hop_count"] == 1
        assert at_b1["route_branch_refs"] == ["c1"]

    def test_unreachable_point_is_honest(self) -> None:
        """Bus istnieje w modelu (LV-INV wymaga ciągłej ścieżki dla aktywnych
        odbiorów, ale sam bus bez odbioru/gałęzi jest dopuszczalny) — brak
        gałęzi kablowej/łącznikowej do niego = uczciwy brak trasy."""
        enm = _base_enm([], ["izolowana"])
        view = build_fault_loop_view_at_point(enm, "stn", "izolowana")
        assert view["status"] == "brak danych"
        # Do 2026-09-01 izolowany bus robił Y-bus osobliwym GLOBALNIE i upstream
        # Thevenina zawodził PIERWSZY („upstream_network_singular") — dla KAŻDEGO
        # punktu stacji, także zasilanych. Od karty B-02 upstream liczy się na
        # wyspie zasilania węzła HV (`restrict_graph_to_island_of`), więc brak
        # jest tym, czym jest naprawdę: brakiem TRASY do izolowanego punktu.
        # Wciąż uczciwy brak (nigdy 500, nigdy fabrykacja) — zob.
        # test_upstream_map_error_is_honest_not_a_crash dla grafu niepoprawnego.
        assert view["missing_data"] == ["route"]

    def test_upstream_map_error_is_honest_not_a_crash(self) -> None:
        """Model topologicznie niepoprawny (dwa węzły SLACK) → uczciwy brak
        danych, NIGDY wyjątek/500 (napotkany defekt karty P0.6: budowa grafu
        rzucała ValueError poza obsługą błędów)."""
        enm = _base_enm([], ["druga_szyna_zrodlowa"])
        enm.sources.append(
            Source(
                ref_id="src2",
                name="Drugie zasilanie",
                bus_ref="druga_szyna_zrodlowa",
                model="thevenin",
                r_ohm=1.0,
                x_ohm=1.0,
            )
        )
        view = build_fault_loop_view_at_point(enm, "stn", "nn")
        assert view["status"] == "brak danych"
        assert "upstream_network_topology_invalid" in view["missing_data"]


class TestTnCVsTnS:
    """Ten sam kabel, różne dane żyły powrotnej → różne Z_loop (§0 test #2)."""

    def test_tn_c_pen_vs_tn_s_pe_give_different_z_loop(self) -> None:
        # TN-C-S/PEN: żyła powrotna = ten sam przekrój co fazowa (typowe PEN).
        enm_pen = _base_enm([_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)], ["b1"])
        # TN-S/PE: żyła powrotna cieńsza (typowe PE, wyższa R).
        enm_pe = _base_enm([_cable("c1", "nn", "b1", return_r=0.64, return_x=0.16)], ["b1"])
        view_pen = build_fault_loop_view_at_point(enm_pen, "stn", "b1")
        view_pe = build_fault_loop_view_at_point(enm_pe, "stn", "b1")
        assert view_pen["status"] == "OK"
        assert view_pe["status"] == "OK"
        assert (
            view_pe["fault_loop"]["z_loop_ohm"]["magnitude"]
            > view_pen["fault_loop"]["z_loop_ohm"]["magnitude"]
        )

    def test_missing_return_conductor_data_fails_closed_not_default(self) -> None:
        enm = _base_enm(
            [
                Cable(
                    ref_id="c1",
                    name="c1",
                    from_bus_ref="nn",
                    to_bus_ref="b1",
                    length_km=0.05,
                    r_ohm_per_km=0.32,
                    x_ohm_per_km=0.08,
                    return_conductor_r_ohm_per_km_20c=None,
                    return_conductor_x_ohm_per_km=None,
                )
            ],
            ["b1"],
        )
        view = build_fault_loop_view_at_point(enm, "stn", "b1")
        assert view["status"] == "brak danych"
        assert "route" in view["missing_data"]
        assert "żyły powrotnej" in view["reason_pl"]


class TestFarthestPointPerFeeder:
    def test_worst_point_is_by_actual_impedance_not_hop_count(self) -> None:
        """Rozgałęzienie: leafA (1 hop, DUŻA impedancja) vs leafB (2 hopy,
        MAŁA impedancja łączna) — wygrywa leafA mimo mniejszej liczby hopów
        (dowód, że ranking liczy Z, nie topologiczną „długość" po hopach)."""
        branches = [
            _cable("c1", "nn", "f", return_r=0.32, return_x=0.08),  # korzeń odpływu
            Cable(
                ref_id="c2a",
                name="c2a",
                from_bus_ref="f",
                to_bus_ref="leafA",
                length_km=0.1,
                r_ohm_per_km=2.0,
                x_ohm_per_km=0.5,
                return_conductor_r_ohm_per_km_20c=2.0,
                return_conductor_x_ohm_per_km=0.5,
            ),
            Cable(
                ref_id="c2b",
                name="c2b",
                from_bus_ref="f",
                to_bus_ref="mid",
                length_km=0.02,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.05,
                return_conductor_r_ohm_per_km_20c=0.1,
                return_conductor_x_ohm_per_km=0.05,
            ),
            Cable(
                ref_id="c3b",
                name="c3b",
                from_bus_ref="mid",
                to_bus_ref="leafB",
                length_km=0.02,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.05,
                return_conductor_r_ohm_per_km_20c=0.1,
                return_conductor_x_ohm_per_km=0.05,
            ),
        ]
        enm = _base_enm(branches, ["f", "leafA", "mid", "leafB"])
        view = build_feeder_fault_loop_view(enm, "stn")
        assert view["status"] == "OK"
        assert len(view["feeders"]) == 1
        feeder = view["feeders"][0]
        assert feeder["feeder_root_branch_ref"] == "c1"
        assert feeder["worst_point_bus_ref"] == "leafA"
        bus_refs = {p["bus_ref"] for p in feeder["points"]}
        assert bus_refs == {"f", "leafA", "mid", "leafB"}

    def test_two_independent_feeders_from_same_station(self) -> None:
        branches = [
            _cable("c1", "nn", "b1", return_r=0.32, return_x=0.08),
            _cable("c2", "nn", "b2", return_r=0.32, return_x=0.08),
        ]
        enm = _base_enm(branches, ["b1", "b2"])
        view = build_feeder_fault_loop_view(enm, "stn")
        assert view["status"] == "OK"
        roots = {f["feeder_root_branch_ref"] for f in view["feeders"]}
        assert roots == {"c1", "c2"}
        for feeder in view["feeders"]:
            assert feeder["worst_point_bus_ref"] is not None
            assert all(p["status"] == "OK" for p in feeder["points"])

    def test_missing_data_on_one_point_does_not_hide_others(self) -> None:
        branches = [
            _cable("c1", "nn", "f", return_r=0.32, return_x=0.08),
            Cable(
                ref_id="c2a",
                name="c2a",
                from_bus_ref="f",
                to_bus_ref="leafA",
                length_km=0.1,
                r_ohm_per_km=0.5,
                x_ohm_per_km=0.2,
                return_conductor_r_ohm_per_km_20c=None,  # brak danych
                return_conductor_x_ohm_per_km=None,
            ),
            Cable(
                ref_id="c2b",
                name="c2b",
                from_bus_ref="f",
                to_bus_ref="leafB",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
            ),
        ]
        enm = _base_enm(branches, ["f", "leafA", "leafB"])
        view = build_feeder_fault_loop_view(enm, "stn")
        feeder = view["feeders"][0]
        by_bus = {p["bus_ref"]: p for p in feeder["points"]}
        assert by_bus["leafA"]["status"] == "brak danych"
        assert by_bus["leafB"]["status"] == "OK"
        assert by_bus["f"]["status"] == "OK"
        # najgorszy punkt liczy się TYLKO spośród policzalnych
        assert feeder["worst_point_bus_ref"] in {"f", "leafB"}


class TestStacjaWielotransformatorowa:
    """Karta B-02 §0.1: odpływ liczy się od SWOJEGO transformatora.

    Iloczyn cech: {sprzęgło otwarte, zamknięte, wspólna szyna} × {odpływy w obu
    sekcjach} — bo defekt („pierwszy transformator stacji dla wszystkich
    odpływów") ujawnia się inaczej w każdej z tych kombinacji: przy sprzęgle
    otwartym GUBIŁ odpływy drugiej sekcji, przy zamkniętym liczył je od złego
    transformatora, a przy wspólnej szynie w ogóle nie ma „własnej sekcji".
    """

    def test_kazdy_transformator_liczy_wlasne_odplywy(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")
        tr1 = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr1")
        tr2 = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr2")
        assert [f["feeder_root_branch_ref"] for f in tr1["feeders"]] == ["ap_a"]
        assert [f["feeder_root_branch_ref"] for f in tr2["feeders"]] == ["ap_b"]
        assert tr1["nn_bus_ref"] == "nn_a"
        assert tr2["nn_bus_ref"] == "nn_b"

    def test_widok_stacji_scala_odplywy_obu_transformatorow_bez_duplikatow(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")
        view = build_feeder_fault_loop_view(enm, "stn")
        roots = [f["feeder_root_branch_ref"] for f in view["feeders"]]
        assert roots == ["ap_a", "ap_b"], "posortowane i bez powtórzeń"
        punkty = [p["bus_ref"] for f in view["feeders"] for p in f["points"]]
        assert sorted(punkty) == ["a1", "a2", "b1", "b2"]

    def test_sprzeglo_otwarte_nie_gubi_odplywow_drugiej_sekcji(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        view = build_feeder_fault_loop_view(enm, "stn")
        assert [f["feeder_root_branch_ref"] for f in view["feeders"]] == ["ap_a", "ap_b"]
        assert all(f["supply"] == "jednostronne" for f in view["feeders"])

    def test_sprzeglo_zamkniete_znakuje_zasilanie_wielostronne(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")
        view = build_feeder_fault_loop_view(enm, "stn")
        for feeder in view["feeders"]:
            assert feeder["supply"] == "wielostronne"
            assert "zachowawcze" in feeder["supply_assumption_pl"]

    def test_slabszy_transformator_daje_mniejszy_prad_zwarcia_w_swojej_sekcji(self) -> None:
        """Dowód, że użyto impedancji WŁAŚCIWEGO transformatora — nie samego
        przypisania etykiety."""
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", moc_tr2_mva=0.25)
        tr1 = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr1")
        tr2 = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr2")
        z_a = tr1["feeders"][0]["points"][0]["fault_loop"]["z_loop_ohm"]["magnitude"]
        z_b = tr2["feeders"][0]["points"][0]["fault_loop"]["z_loop_ohm"]["magnitude"]
        assert z_b > z_a

    def test_wspolna_szyna_nn_przypisuje_odplywy_deterministycznie(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, wspolna_szyna_nn=True)
        tr1 = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr1")
        tr2 = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr2")
        assert [f["feeder_root_branch_ref"] for f in tr1["feeders"]] == ["ap_a", "ap_b"]
        assert tr2["feeders"] == []
        assert all(f["supply"] == "wielostronne" for f in tr1["feeders"])

    def test_transformator_spoza_stacji_jest_odrzucony_uczciwie(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        enm.substations[0].transformer_refs = ["tr1"]
        view = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr2")
        assert view["status"] == "brak danych"
        assert view["missing_data"] == ["transformer_not_in_station"]

    def test_brak_danych_jednego_transformatora_nie_ukrywa_drugiego(self) -> None:
        """TR2 bez grupy połączeń (brak lokalnej drogi uziemienia nN) — jego
        pętla jest nieobliczalna, ale odpływy TR1 zostają w odpowiedzi, a brak
        jest nazwany z prefiksem transformatora."""
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        enm.transformers[1].vector_group = None
        view = build_feeder_fault_loop_view(enm, "stn")
        assert view["status"] == "OK"
        assert [f["feeder_root_branch_ref"] for f in view["feeders"]] == ["ap_a"]
        assert view["missing_data"] == ["tr2:vector_group"]
        assert view["transformer_ref"] == "tr1"

    def test_punkt_w_sekcji_b_liczy_sie_od_transformatora_ktory_go_zasila(self) -> None:
        """`build_fault_loop_view_at_point` bez wskazania transformatora bierze
        WŁAŚCICIELA szyny. Przy sprzęgle OTWARTYM punkt sekcji B był wcześniej
        „bez trasy" (liczony od TR1), teraz liczy się od TR2."""
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        view = build_fault_loop_view_at_point(enm, "stn", "b2")
        assert view["status"] == "OK"
        assert view["transformer_ref"] == "tr2"
        assert view["nn_bus_ref"] == "nn_b"
        assert view["route_branch_refs"] == ["ap_b", "c_b"]

    def test_punkt_sekcji_b_przy_zamknietym_sprzegle_nie_idzie_przez_sprzeglo(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")
        view = build_fault_loop_view_at_point(enm, "stn", "b2")
        assert view["transformer_ref"] == "tr2"
        assert "coupler" not in view["route_branch_refs"]

    def test_jawne_wskazanie_transformatora_wygrywa_nad_wlascicielem(self) -> None:
        """Świadomy wybór projektanta (np. analiza rezerwowego toru zasilania)
        musi być możliwy — i musi zmieniać trasę."""
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed")
        view = build_fault_loop_view_at_point(enm, "stn", "b2", transformer_ref="tr1")
        assert view["status"] == "OK"
        assert view["transformer_ref"] == "tr1"
        assert "coupler" in view["route_branch_refs"]

    def test_punkt_nieosiagalny_z_zadnego_transformatora_jest_uczciwy(self) -> None:
        """Szyna bez właściciela (odcięta otwartym rozłącznikiem) zostaje przy
        domyślnym transformatorze i kończy się UCZCIWYM brakiem — nigdy wynikiem
        policzonym „jakkolwiek". Brak melduje się jako `route` (nie ma drogi po
        zamkniętych gałęziach), a NIE jako `upstream_network_singular`: od karty
        B-02 upstream Thevenina liczy się na wyspie zasilania węzła HV, więc
        odcięta podszyna nie unieważnia obliczeń (ta sama własność co
        `test_unreachable_point_is_honest` wyżej)."""
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open", wyspa_odcieta=True)
        view = build_fault_loop_view_at_point(enm, "stn", "wyspa")
        assert view["status"] == "brak danych"
        assert view["missing_data"] == ["route"]

    def test_widok_u_zrodla_da_sie_zapytac_o_kazdy_transformator(self) -> None:
        """Stacja 2×TR ma DWA źródła nN — bez wskazania transformatora drugiego
        w ogóle nie dało się zapytać."""
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open", moc_tr2_mva=0.25)
        domyslny = build_station_fault_loop_view(enm, "stn")
        od_tr2 = build_station_fault_loop_view(enm, "stn", transformer_ref="tr2")
        assert domyslny["transformer_ref"] == "tr1"
        assert od_tr2["transformer_ref"] == "tr2"
        assert od_tr2["nn_bus_ref"] == "nn_b"
        assert (
            od_tr2["fault_loop"]["z_loop_ohm"]["magnitude"]
            > domyslny["fault_loop"]["z_loop_ohm"]["magnitude"]
        )

    def test_widok_u_zrodla_odrzuca_transformator_spoza_stacji(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="open")
        enm.substations[0].transformer_refs = ["tr1"]
        view = build_station_fault_loop_view(enm, "stn", transformer_ref="tr2")
        assert view["status"] == "brak danych"
        assert view["missing_data"] == ["transformer_not_in_station"]

    def test_stacja_jednotransformatorowa_ma_niezmieniony_ksztalt(self) -> None:
        """Zgodność kształtu dla dotychczasowych konsumentów: te same klucze i
        te same wartości nagłówkowe co przed rozbiciem per transformator."""
        enm = zbuduj_stacje_nn()
        view = build_feeder_fault_loop_view(enm, "stn")
        per_tr = build_feeder_fault_loop_view_for_transformer(enm, "stn", "tr1")
        assert view["status"] == "OK"
        assert view["transformer_ref"] == "tr1"
        assert view["nn_bus_ref"] == "nn_a"
        assert view["missing_data"] == []
        assert view["feeders"] == per_tr["feeders"]


class TestDeterminism:
    def test_two_runs_identical_point_view(self) -> None:
        enm = _base_enm([_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)], ["b1"])
        a = build_fault_loop_view_at_point(enm, "stn", "b1")
        b = build_fault_loop_view_at_point(enm, "stn", "b1")
        assert a == b

    def test_two_runs_identical_feeder_view(self) -> None:
        enm = _base_enm([_cable("c1", "nn", "b1", return_r=0.32, return_x=0.08)], ["b1"])
        a = build_feeder_fault_loop_view(enm, "stn")
        b = build_feeder_fault_loop_view(enm, "stn")
        assert a == b
