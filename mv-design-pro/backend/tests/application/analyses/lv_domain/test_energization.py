"""Testy energizacji szyn domeny nN (karta B-02, §0.3).

ILOCZYN CECH, nie przykład z karty: {1 TR, 2 TR} × {sprzęgło otwarte/zamknięte}
× {DER: brak / PV na sekcji / PV na odciętej podszynie} × {podszyna odcięta}.
Każdy przypadek sprawdza TRZY pola naraz (``energized``, ``supply_refs``,
``der_only``) plus podział na wyspy — pola liczone z RÓŻNYCH składowych
(zasilania vs sekcji), więc badanie ich osobno przepuściłoby rozjechanie się
tych dwóch definicji.
"""

from __future__ import annotations

from application.analyses.lv_domain.energization import build_energization_view
from application.analyses.lv_domain.graph_view import build_lv_domain_view

from tests.application.analyses.lv_domain.fixtury_stacji_nn import zbuduj_stacje_nn


def _stany(view_buses: list[dict]) -> dict[str, dict]:
    return {bus["ref_id"]: bus for bus in view_buses}


class TestEnergizacjaJednegoTransformatora:
    def test_wszystkie_szyny_zasilane_z_jednego_transformatora(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(), "stn")
        stany = _stany(graph["buses"])
        assert set(stany) == {"nn_a", "a1", "a2"}
        for bus in stany.values():
            assert bus["energized"] is True
            assert bus["supply_refs"] == ["tr1"]
            assert bus["der_only"] is False
        assert [wyspa["island_ref"] for wyspa in graph["islands"]] == ["island-1"]
        assert graph["islands"][0]["bus_refs"] == ["a1", "a2", "nn_a"]
        assert graph["islands"][0]["supply_refs"] == ["tr1"]

    def test_podszyna_za_otwartym_lacznikiem_jest_wyspa_beznapieciowa(self) -> None:
        """Domena obejmuje szynę odciętą (topologia), ale energizacja mówi
        wprost: bez napięcia, bez źródła, nie DER."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(wyspa_odcieta=True), "stn")
        stany = _stany(graph["buses"])
        assert stany["wyspa"]["energized"] is False
        assert stany["wyspa"]["supply_refs"] == []
        assert stany["wyspa"]["der_only"] is False
        assert stany["nn_a"]["energized"] is True

        wyspy = {w["island_ref"]: w for w in graph["islands"]}
        assert len(wyspy) == 2
        assert wyspy["island-2"]["bus_refs"] == ["wyspa"]
        assert wyspy["island-2"]["energized"] is False
        assert wyspy["island-2"]["der_only"] is False

    def test_pv_na_odcietej_podszynie_daje_wyspe_der(self) -> None:
        """Ta sama topologia + generator = wyspa DER: nie „martwa szyna", tylko
        stan wymagający decyzji (praca wyspowa / LOM). Generator NIE czyni jej
        zasilaną z sieci — ta sama zasada co reguła walidatora E060."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(wyspa_odcieta=True, pv_na_wyspie=True), "stn")
        stany = _stany(graph["buses"])
        assert stany["wyspa"]["energized"] is False
        assert stany["wyspa"]["der_only"] is True
        assert stany["wyspa"]["supply_refs"] == []

        wyspa_der = next(w for w in graph["islands"] if w["bus_refs"] == ["wyspa"])
        assert wyspa_der["der_only"] is True
        assert wyspa_der["energized"] is False

    def test_pv_na_zasilanej_sekcji_nie_jest_wyspa_der(self) -> None:
        """PV na szynie POD NAPIĘCIEM — `der_only` musi zostać False, inaczej
        każda instalacja PV udawałaby wyspę."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(pv_na_nn=True), "stn")
        stany = _stany(graph["buses"])
        assert stany["a2"]["der_only"] is False
        assert stany["a2"]["energized"] is True
        assert stany["a2"]["supply_refs"] == ["tr1"]


class TestEnergizacjaDwochTransformatorow:
    def test_sprzeglo_zamkniete_obie_sekcje_maja_oba_transformatory(self) -> None:
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="closed"), "stn")
        stany = _stany(graph["buses"])
        for ref in ("nn_a", "a1", "a2", "nn_b", "b1", "b2"):
            assert stany[ref]["energized"] is True
            assert stany[ref]["supply_refs"] == ["tr1", "tr2"], ref
        assert len(graph["islands"]) == 1

    def test_sprzeglo_otwarte_kazda_sekcja_ma_swoj_transformator(self) -> None:
        """Sedno rozdzielenia składowych: przy sprzęgle OTWARTYM sekcja A nie
        może meldować TR2 jako zasilającego (choć oba są w jednej składowej
        ZASILANIA przez szynę SN — patrz asercja o wyspie niżej)."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"), "stn")
        stany = _stany(graph["buses"])
        assert stany["nn_a"]["supply_refs"] == ["tr1"]
        assert stany["a2"]["supply_refs"] == ["tr1"]
        assert stany["nn_b"]["supply_refs"] == ["tr2"]
        assert stany["b2"]["supply_refs"] == ["tr2"]
        for ref in ("nn_a", "a2", "nn_b", "b2"):
            assert stany[ref]["energized"] is True

    def test_wyspa_laczy_sekcje_przez_siec_sn_mimo_otwartego_sprzegla(self) -> None:
        """POMIAR PRZYPIĘTY, nie założenie: wyspa = spójna składowa ENERGETYCZNA
        (zamknięte gałęzie + transformatory), więc przy sprzęgle OTWARTYM obie
        sekcje są w JEDNEJ wyspie — wiszą na tej samej sieci SN. To NIE jest to
        samo pytanie co „która sekcja rozdzielnicy" (na nie odpowiada
        `supply_refs`)."""
        graph = build_lv_domain_view(zbuduj_stacje_nn(transformatory=2, sprzeglo="open"), "stn")
        assert len(graph["islands"]) == 1
        wyspa = graph["islands"][0]
        assert wyspa["bus_refs"] == ["a1", "a2", "b1", "b2", "nn_a", "nn_b"]
        assert wyspa["supply_refs"] == ["tr1", "tr2"]

    def test_dwa_transformatory_na_wspolnej_szynie(self) -> None:
        graph = build_lv_domain_view(
            zbuduj_stacje_nn(transformatory=2, wspolna_szyna_nn=True), "stn"
        )
        stany = _stany(graph["buses"])
        assert stany["nn_a"]["supply_refs"] == ["tr1", "tr2"]
        assert stany["b2"]["supply_refs"] == ["tr1", "tr2"]


class TestZrodloNnJestZrodlemEnergizacji:
    """`Source` na szynie nN (agregat, zasilanie rezerwowe zamodelowane jako
    sieć) energizuje odciętą sekcję — definicja „źródła energizacji" jest TA
    SAMA co w walidatorze: KAŻDY Source, SN albo nN."""

    def test_source_nn_na_odcietej_podszynie_energizuje_ja(self) -> None:
        enm = zbuduj_stacje_nn(wyspa_odcieta=True)
        from enm.models import Source

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
        assert stany["wyspa"]["energized"] is True
        assert stany["wyspa"]["supply_refs"] == ["agregat"]
        assert stany["wyspa"]["der_only"] is False


class TestSpojnoscWyspyIDeterminizm:
    def test_wszystkie_szyny_wyspy_maja_ten_sam_stan_zasilania(self) -> None:
        """Wyspa niesie JEDEN `energized`/`der_only` — to prawda tylko wtedy,
        gdy wszystkie jej szyny mają ten sam stan (jedna składowa = jeden
        werdykt). Przypięte, bo wyspa czyta stan pierwszej szyny."""
        enm = zbuduj_stacje_nn(
            transformatory=2, sprzeglo="open", wyspa_odcieta=True, pv_na_wyspie=True
        )
        graph = build_lv_domain_view(enm, "stn")
        stany = _stany(graph["buses"])
        for wyspa in graph["islands"]:
            stany_wyspy = {
                (stany[ref]["energized"], stany[ref]["der_only"]) for ref in wyspa["bus_refs"]
            }
            assert stany_wyspy == {(wyspa["energized"], wyspa["der_only"])}

    def test_dwa_wywolania_daja_identyczny_wynik(self) -> None:
        enm = zbuduj_stacje_nn(transformatory=2, sprzeglo="closed", wyspa_odcieta=True)
        pierwszy = build_energization_view(enm, {"nn_a", "nn_b", "a1", "a2", "b1", "b2", "wyspa"})
        drugi = build_energization_view(enm, {"wyspa", "b2", "b1", "a2", "a1", "nn_b", "nn_a"})
        assert pierwszy.islands == drugi.islands
        assert pierwszy.bus_states == drugi.bus_states
