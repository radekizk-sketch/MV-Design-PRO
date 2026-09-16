"""Testy harmonogramu zdarzen dynamicznych scenariusza (karta W6-1 SS0 p.5, SS2).

Iloczyn cech: zdarzenia x (t poza horyzontem / ref nieistniejacy / kolejnosc) x
hash. Zero fizyki: `apply_scenario` NIE stosuje zdarzen do migawki — solver
W6-2 (nieistniejacy w tej karcie) czyta harmonogram bezposrednio.
"""

from __future__ import annotations

import pytest
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator, Load, OverheadLine
from enm.scenariusze import (
    KomendaRegulacji,
    Nastawa,
    OdlaczenieZrodla,
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszDynamiczny,
    ScenariuszNieprzystajeError,
    SkokObciazenia,
    Synchronizacja,
    WylaczenieGalezi,
    ZalaczenieGalezi,
    Zwarcie,
    apply_scenario,
)
from pydantic import ValidationError


@pytest.fixture
def enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec testowa W6-1"),
        buses=[
            Bus(ref_id="b1", name="Szyna 1", voltage_kv=15.0),
            Bus(ref_id="b2", name="Szyna 2", voltage_kv=15.0),
        ],
        branches=[
            OverheadLine(
                ref_id="l1",
                name="Linia 1",
                from_bus_ref="b1",
                to_bus_ref="b2",
                length_km=1.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.3,
                b_siemens_per_km=0.0,
            ),
        ],
        generators=[Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0)],
        loads=[Load(ref_id="ld1", name="Odbior 1", bus_ref="b2", p_mw=0.5, q_mvar=0.1)],
    )


# ---------------------------------------------------------------------------
# Kazdy rodzaj zdarzenia buduje sie i wchodzi do scenariusza
# ---------------------------------------------------------------------------


class TestKazdyRodzajZdarzenia:
    def test_zwarcie_z_usunieciem(self):
        z = Zwarcie(t_s=0.1, bus_ref="b1", typ="3F", r_f_ohm=0.0, x_f_ohm=0.0, t_usuniecia_s=0.2)
        assert z.rodzaj == "zwarcie"

    def test_zwarcie_bez_usuniecia_jawnie_nieusuwane(self):
        z = Zwarcie(t_s=0.1, bus_ref="b1", typ="1F", r_f_ohm=5.0, x_f_ohm=0.0, t_usuniecia_s=None)
        assert z.t_usuniecia_s is None

    @pytest.mark.parametrize("typ", ["3F", "2F", "1F", "2FZ"])
    def test_zwarcie_kazdy_typ(self, typ):
        z = Zwarcie(t_s=0.0, bus_ref="b1", typ=typ, r_f_ohm=0.0, x_f_ohm=0.0)
        assert z.typ == typ

    def test_wylaczenie_galezi(self):
        assert WylaczenieGalezi(t_s=0.5, element_ref="l1").rodzaj == "wylaczenie_galezi"

    def test_zalaczenie_galezi(self):
        assert ZalaczenieGalezi(t_s=0.5, element_ref="l1").rodzaj == "zalaczenie_galezi"

    def test_odlaczenie_zrodla(self):
        assert OdlaczenieZrodla(t_s=0.5, ref_id="g1").rodzaj == "odlaczenie_zrodla"

    def test_skok_obciazenia_dodatni_i_ujemny(self):
        SkokObciazenia(t_s=1.0, ref_id="ld1", delta_p_mw=0.1, delta_q_mvar=0.0)
        SkokObciazenia(t_s=1.0, ref_id="ld1", delta_p_mw=-0.1, delta_q_mvar=-0.05)

    def test_komenda_regulacji_reuzywa_nastawa(self):
        k = KomendaRegulacji(t_s=2.0, ref_id="g1", nastawa=Nastawa(p_mw=1.5))
        assert k.nastawa.p_mw == 1.5

    def test_synchronizacja(self):
        s = Synchronizacja(t_s=3.0, ref_id="g1", bus_ref="b1")
        assert s.rodzaj == "synchronizacja"


# ---------------------------------------------------------------------------
# t poza horyzontem
# ---------------------------------------------------------------------------


class TestTPozaHoryzontem:
    def test_zdarzenie_w_horyzoncie_ok(self):
        ScenariuszDynamiczny(
            horyzont_s=5.0,
            krok_wyjscia_s=0.1,
            zdarzenia=(WylaczenieGalezi(t_s=4.999, element_ref="l1"),),
        )

    def test_zdarzenie_poza_horyzontem_odrzucone(self):
        with pytest.raises(ValidationError, match="wykracza poza horyzont_s"):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(WylaczenieGalezi(t_s=1.5, element_ref="l1"),),
            )

    def test_zwarcie_usuniecie_poza_horyzontem_odrzucone(self):
        with pytest.raises(ValidationError, match="t_usuniecia_s=.* poza horyzont_s"):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(
                    Zwarcie(
                        t_s=0.5, bus_ref="b1", typ="3F", r_f_ohm=0.0, x_f_ohm=0.0, t_usuniecia_s=2.0
                    ),
                ),
            )

    def test_krok_wyjscia_wiekszy_niz_horyzont_odrzucony(self):
        with pytest.raises(ValidationError, match="krok_wyjscia_s"):
            ScenariuszDynamiczny(horyzont_s=1.0, krok_wyjscia_s=2.0, zdarzenia=())

    def test_t_s_ujemne_odrzucone(self):
        with pytest.raises(ValidationError):
            WylaczenieGalezi(t_s=-0.1, element_ref="l1")


# ---------------------------------------------------------------------------
# ref nieistniejacy — per rodzaj zdarzenia, walidowany przez apply_scenario
# ---------------------------------------------------------------------------


class TestRefNieistniejacy:
    def test_zwarcie_bus_ref_nieistniejacy(self, enm):
        scen = OperatingScenario(
            scenario_id="s1",
            name="Zle zwarcie",
            kind=RodzajScenariusza.FAULT_STUDY,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(Zwarcie(t_s=0.1, bus_ref="brak", typ="3F", r_f_ohm=0.0, x_f_ohm=0.0),),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError, match="brak takiej szyny"):
            apply_scenario(enm, scen)

    def test_wylaczenie_galezi_ref_nieistniejacy(self, enm):
        scen = OperatingScenario(
            scenario_id="s2",
            name="Zle wylaczenie",
            kind=RodzajScenariusza.FAULT_STUDY,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(WylaczenieGalezi(t_s=0.1, element_ref="brak"),),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError, match="brak elementu"):
            apply_scenario(enm, scen)

    def test_odlaczenie_zrodla_ref_nieistniejacy(self, enm):
        scen = OperatingScenario(
            scenario_id="s3",
            name="Zle odlaczenie",
            kind=RodzajScenariusza.FAULT_STUDY,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(OdlaczenieZrodla(t_s=0.1, ref_id="brak"),),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError, match="brak elementu"):
            apply_scenario(enm, scen)

    def test_synchronizacja_ref_id_ok_ale_bus_ref_nieistniejacy(self, enm):
        scen = OperatingScenario(
            scenario_id="s4",
            name="Zla synchronizacja",
            kind=RodzajScenariusza.FAULT_STUDY,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(Synchronizacja(t_s=0.1, ref_id="g1", bus_ref="brak"),),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError, match="brak takiej szyny"):
            apply_scenario(enm, scen)

    def test_zdarzenie_na_elemencie_wylaczonym_statycznie_odrzucone(self, enm):
        """Element usuniety przez out_of_service nie istnieje w migawce, na
        ktorej harmonogram operuje — dynamiczne zdarzenie na nim jest tym
        samym brakiem co ref nigdy nieistniejacy (jedna migawka, jedna prawda)."""
        scen = OperatingScenario(
            scenario_id="s5",
            name="Wylaczone + dynamika",
            kind=RodzajScenariusza.FAULT_STUDY,
            out_of_service=("l1",),
            dynamika=ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(ZalaczenieGalezi(t_s=0.1, element_ref="l1"),),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError, match="brak elementu"):
            apply_scenario(enm, scen)

    def test_referencje_poprawne_apply_scenario_nie_mutuje_migawki(self, enm):
        scen = OperatingScenario(
            scenario_id="s6",
            name="Dynamika poprawna",
            kind=RodzajScenariusza.FAULT_STUDY,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=2.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(
                    Zwarcie(
                        t_s=0.1,
                        bus_ref="b1",
                        typ="3F",
                        r_f_ohm=0.0,
                        x_f_ohm=0.0,
                        t_usuniecia_s=0.15,
                    ),
                    SkokObciazenia(t_s=1.0, ref_id="ld1", delta_p_mw=0.2, delta_q_mvar=0.0),
                ),
            ),
        )
        migawka = apply_scenario(enm, scen)
        assert migawka.snapshot_hash == migawka.base_hash
        assert migawka.nadpisania == ()


# ---------------------------------------------------------------------------
# Kolejnosc kanoniczna (t_s, indeks)
# ---------------------------------------------------------------------------


class TestKolejnoscKanoniczna:
    def test_sortowanie_po_t_s(self):
        dyn = ScenariuszDynamiczny(
            horyzont_s=5.0,
            krok_wyjscia_s=0.1,
            zdarzenia=(
                WylaczenieGalezi(t_s=3.0, element_ref="l1"),
                WylaczenieGalezi(t_s=1.0, element_ref="l1"),
                WylaczenieGalezi(t_s=2.0, element_ref="l1"),
            ),
        )
        czasy = [z.t_s for z in dyn.zdarzenia_uporzadkowane]
        assert czasy == [1.0, 2.0, 3.0]

    def test_remis_t_s_zachowuje_kolejnosc_zapisu_indeks(self):
        """Sort stabilny: dwa zdarzenia w tej samej chwili t_s zachowuja
        kolejnosc, w jakiej zostaly ZAPISANE (indeks) — solver W6-2 potrzebuje
        deterministycznego porzadku egzekucji rownoczesnych zdarzen."""
        zwarcie = Zwarcie(t_s=1.0, bus_ref="b1", typ="3F", r_f_ohm=0.0, x_f_ohm=0.0)
        wylaczenie = WylaczenieGalezi(t_s=1.0, element_ref="l1")
        dyn = ScenariuszDynamiczny(
            horyzont_s=5.0, krok_wyjscia_s=0.1, zdarzenia=(zwarcie, wylaczenie)
        )
        assert dyn.zdarzenia_uporzadkowane == (zwarcie, wylaczenie)

        dyn_odwrotnie = ScenariuszDynamiczny(
            horyzont_s=5.0, krok_wyjscia_s=0.1, zdarzenia=(wylaczenie, zwarcie)
        )
        assert dyn_odwrotnie.zdarzenia_uporzadkowane == (wylaczenie, zwarcie)

    def test_pusty_harmonogram_dozwolony(self):
        dyn = ScenariuszDynamiczny(horyzont_s=1.0, krok_wyjscia_s=0.1, zdarzenia=())
        assert dyn.zdarzenia_uporzadkowane == ()


# ---------------------------------------------------------------------------
# Hash — addytywnosc, determinizm, wrazliwosc na kolejnosc zapisu
# ---------------------------------------------------------------------------


class TestHash:
    def test_scenariusz_bez_dynamiki_hash_bez_klucza_dynamika(self):
        scen = OperatingScenario(
            scenario_id="s1", name="Bez dynamiki", kind=RodzajScenariusza.NORMAL
        )
        assert "dynamika" not in scen.tresc()

    def test_scenariusz_z_dynamika_hash_ma_klucz_dynamika(self):
        scen = OperatingScenario(
            scenario_id="s1",
            name="Z dynamika",
            kind=RodzajScenariusza.FAULT_STUDY,
            dynamika=ScenariuszDynamiczny(horyzont_s=1.0, krok_wyjscia_s=0.1, zdarzenia=()),
        )
        assert "dynamika" in scen.tresc()

    def test_dwa_scenariusze_rozne_harmonogramy_rozny_hash(self):
        base = {"scenario_id": "s1", "name": "X", "kind": RodzajScenariusza.FAULT_STUDY}
        a = OperatingScenario(
            **base,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(WylaczenieGalezi(t_s=0.1, element_ref="l1"),),
            ),
        )
        b = OperatingScenario(
            **base,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(WylaczenieGalezi(t_s=0.2, element_ref="l1"),),
            ),
        )
        assert a.hash != b.hash

    def test_ten_sam_harmonogram_ten_sam_hash_deterministycznie(self):
        def buduj():
            return OperatingScenario(
                scenario_id="s1",
                name="X",
                kind=RodzajScenariusza.FAULT_STUDY,
                dynamika=ScenariuszDynamiczny(
                    horyzont_s=1.0,
                    krok_wyjscia_s=0.1,
                    zdarzenia=(Zwarcie(t_s=0.1, bus_ref="b1", typ="3F", r_f_ohm=0.0, x_f_ohm=0.0),),
                ),
            )

        assert buduj().hash == buduj().hash

    def test_istniejace_scenariusze_bez_dynamiki_hash_pinned(self):
        """Regresja: scenariusz zbudowany DOKLADNIE jak przed karta W6-1 (bez
        `dynamika`) ma zamrozony hash — wartosc zmierzona na tym kodzie i
        przypieta, zeby przyszla zmiana `tresc()` nie przeszla bez zauwazenia."""
        scen = OperatingScenario(
            scenario_id="s1",
            name="Kontyngencja N-1",
            kind=RodzajScenariusza.N_1,
            out_of_service=("l1",),
        )
        assert scen.hash == "a60610dffc00e827a4efd5f765bf63dd70dc3a27a07318b74cdec5704c2f50e7"

    def test_tresc_bez_dynamiki_ma_dokladnie_te_same_klucze_co_przed_karta(self):
        scen = OperatingScenario(
            scenario_id="s1",
            name="Kontyngencja N-1",
            kind=RodzajScenariusza.N_1,
            out_of_service=("l1",),
        )
        assert set(scen.tresc().keys()) == {
            "kind",
            "out_of_service",
            "setpoints",
            "gen_scaling",
            "injections",
            "probe_shunts",
            "fault_spec",
        }
