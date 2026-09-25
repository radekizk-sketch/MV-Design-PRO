"""Testy harmonogramu zdarzen dynamicznych scenariusza (karta W6-1 SS0 p.5, SS2).

Iloczyn cech: zdarzenia x (t poza horyzontem / ref nieistniejacy / kolejnosc) x
hash. Zero fizyki: `apply_scenario` NIE stosuje zdarzen do migawki — solver
W6-2 (nieistniejacy w tej karcie) czyta harmonogram bezposrednio.
"""

from __future__ import annotations

import math

import pytest
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    OverheadLine,
    Source,
)
from enm.scenariusze import (
    KomendaRegulacji,
    Nastawa,
    NastawaDynamiczna,
    OdlaczenieZrodla,
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszDynamiczny,
    ScenariuszNieprzystajeError,
    SkokObciazenia,
    Synchronizacja,
    UtrataCzesciowaZrodla,
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
        z = Zwarcie(
            t_s=0.1,
            bus_ref="b1",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=0.0,
            t_usuniecia_s=0.2,
            sposob_usuniecia="izolacja",
        )
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

    def test_komenda_regulacji_niesie_nastawe_dynamiczna(self):
        """PRZEPISANY SWIADOMIE (karta AB-1b.1 par. 0 pkt 9): komenda niosla `Nastawa`
        scenariusza statycznego; niesie `NastawaDynamiczna` (P, Q i napiecie odniesienia),
        bo rozplyw nie ma zadanego napiecia wytworcy — `u_pu` w `Nastawa` byloby fantomem.
        Intencja zachowana: komenda niesie nastawe z co najmniej jedna wielkoscia."""
        k = KomendaRegulacji(t_s=2.0, ref_id="g1", nastawa=NastawaDynamiczna(p_mw=1.5))
        assert k.nastawa.p_mw == 1.5
        assert KomendaRegulacji(t_s=2.0, ref_id="g1", nastawa={"u_pu": 1.02}).nastawa.u_pu == 1.02
        with pytest.raises(ValidationError):
            KomendaRegulacji(t_s=2.0, ref_id="g1", nastawa=Nastawa(p_mw=1.5))

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
                        t_s=0.5,
                        bus_ref="b1",
                        typ="3F",
                        r_f_ohm=0.0,
                        x_f_ohm=0.0,
                        t_usuniecia_s=2.0,
                        sposob_usuniecia="samoczynne",
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
                        sposob_usuniecia="samoczynne",
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


# ---------------------------------------------------------------------------
# Karta AB-1b.1 (P6-P8): nastawa dynamiczna, czesciowa utrata, stanowisko, detektory
# ---------------------------------------------------------------------------


def _enm_ze_zrodlem() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec testowa AB-1b.1"),
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
        sources=[
            Source(
                ref_id="s1",
                name="Siec",
                bus_ref="b1",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
            )
        ],
        generators=[Generator(ref_id="g1", name="G1", bus_ref="b2", p_mw=1.0)],
        loads=[Load(ref_id="ld1", name="Odbior 1", bus_ref="b2", p_mw=0.5, q_mvar=0.1)],
    )


def _scenariusz_operacyjny(dynamika: ScenariuszDynamiczny) -> OperatingScenario:
    return OperatingScenario(
        scenario_id="s-ab1b1",
        name="Karta AB-1b.1",
        kind=RodzajScenariusza.FAULT_STUDY,
        dynamika=dynamika,
    )


_PROFIL = ({"rodzaj": "skok_napiecia", "t_s": 0.2, "u_pu": 0.5},)


class TestNastawaDynamicznaIUtrataCzesciowa:
    @pytest.mark.parametrize(
        "pola",
        [{}, {"p_mw": math.nan}, {"q_mvar": math.inf}, {"u_pu": 0.0}, {"u_pu": -1.0}],
        ids=["pusta", "p_nan", "q_inf", "u_zero", "u_ujemne"],
    )
    def test_nastawa_dynamiczna_niepoprawna_odrzucona(self, pola):
        with pytest.raises(ValidationError):
            NastawaDynamiczna(**pola)

    @pytest.mark.parametrize("udzial", [0.0, 1.0, -0.1, 1.2])
    def test_udzial_pozostaly_poza_przedzialem_otwartym_odrzucony(self, udzial):
        with pytest.raises(ValidationError):
            UtrataCzesciowaZrodla(t_s=0.1, ref_id="g1", udzial_pozostaly=udzial)

    def test_utrata_czesciowa_zrodla_sieciowego_odrzucona_przy_walidacji_refow(self):
        """Ekwiwalent sieci nie jest agregatem jednostek — zdarzenie dziala na generatory
        (ten sam predykat roli co pozostale zdarzenia, `_refy_zdarzenia`)."""
        scen = _scenariusz_operacyjny(
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(UtrataCzesciowaZrodla(t_s=0.1, ref_id="s1", udzial_pozostaly=0.5),),
            )
        )
        with pytest.raises(ScenariuszNieprzystajeError, match="sources"):
            apply_scenario(_enm_ze_zrodlem(), scen)
        ok = _scenariusz_operacyjny(
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(UtrataCzesciowaZrodla(t_s=0.1, ref_id="g1", udzial_pozostaly=0.5),),
            )
        )
        apply_scenario(_enm_ze_zrodlem(), ok)


class TestStanowiskoBadawcze:
    @pytest.mark.parametrize(
        "zdarzenie",
        [
            Zwarcie(t_s=0.3, bus_ref="b2", typ="3F", r_f_ohm=0.0, x_f_ohm=1.0),
            WylaczenieGalezi(t_s=0.3, element_ref="l1"),
            UtrataCzesciowaZrodla(t_s=0.3, ref_id="g1", udzial_pozostaly=0.5),
            SkokObciazenia(t_s=0.3, ref_id="ld1", delta_p_mw=0.1, delta_q_mvar=0.0),
        ],
        ids=["zwarcie", "laczenie", "utrata_czesciowa", "skok_obciazenia"],
    )
    def test_mieszanie_trybu_stanowiska_z_zakloceniem_sieci_odrzucone(self, zdarzenie):
        with pytest.raises(ValidationError, match="stanowiska"):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                zdarzenia=(zdarzenie,),
                stanowisko={"zrodlo_ref": "s1", "impedancja": "idealna", "profil": _PROFIL},
            )

    def test_stanowisko_z_komenda_regulacji_przyjete(self):
        scen = ScenariuszDynamiczny(
            horyzont_s=1.0,
            krok_wyjscia_s=0.1,
            zdarzenia=(KomendaRegulacji(t_s=0.4, ref_id="g1", nastawa={"q_mvar": 0.2}),),
            stanowisko={"zrodlo_ref": "s1", "impedancja": "z_modelu", "profil": _PROFIL},
        )
        apply_scenario(_enm_ze_zrodlem(), _scenariusz_operacyjny(scen))

    @pytest.mark.parametrize(
        "profil, fragment",
        [
            (
                (
                    {"rodzaj": "skok_napiecia", "t_s": 0.2, "u_pu": 0.5},
                    {"rodzaj": "skok_napiecia", "t_s": 0.2, "u_pu": 0.6},
                ),
                "w tej samej chwili",
            ),
            (
                (
                    {
                        "rodzaj": "rampa_napiecia",
                        "t_s": 0.2,
                        "tempo_pu_na_s": 0.1,
                        "czas_trwania_s": 0.3,
                    },
                    {
                        "rodzaj": "rampa_napiecia",
                        "t_s": 0.4,
                        "tempo_pu_na_s": 0.1,
                        "czas_trwania_s": 0.1,
                    },
                ),
                "nakladaja",
            ),
            (
                (
                    {
                        "rodzaj": "rampa_czestotliwosci",
                        "t_s": 0.2,
                        "tempo_hz_na_s": 0.5,
                        "czas_trwania_s": 0.3,
                    },
                    {"rodzaj": "skok_czestotliwosci", "t_s": 0.3, "odchylka_hz": 0.2},
                ),
                "wewnatrz",
            ),
        ],
        ids=["dwa_skoki_U", "rampy_U_nakladaja", "skok_f_w_rampie"],
    )
    def test_profil_niespojny_odrzucony(self, profil, fragment):
        with pytest.raises(ValidationError, match=fragment):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                stanowisko={"zrodlo_ref": "s1", "impedancja": "idealna", "profil": profil},
            )

    def test_segment_poza_horyzontem_odrzucony(self):
        with pytest.raises(ValidationError, match="poza horyzont"):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                stanowisko={
                    "zrodlo_ref": "s1",
                    "impedancja": "idealna",
                    "profil": (
                        {
                            "rodzaj": "rampa_napiecia",
                            "t_s": 0.8,
                            "tempo_pu_na_s": 0.1,
                            "czas_trwania_s": 0.5,
                        },
                    ),
                },
            )

    @pytest.mark.parametrize("ref, fragment", [("g1", "generators"), ("brak", "zadnej kolekcji")])
    def test_stanowisko_wskazuje_wylacznie_zrodlo_sieciowe(self, ref, fragment):
        scen = ScenariuszDynamiczny(
            horyzont_s=1.0,
            krok_wyjscia_s=0.1,
            stanowisko={"zrodlo_ref": ref, "impedancja": "idealna", "profil": _PROFIL},
        )
        with pytest.raises(ScenariuszNieprzystajeError, match=fragment):
            apply_scenario(_enm_ze_zrodlem(), _scenariusz_operacyjny(scen))


def _detektor(wielkosc: dict, ident: str = "d1") -> dict:
    return {
        "ident": ident,
        "wielkosc": wielkosc,
        "prog": 0.85,
        "kierunek": "w_dol",
        "jednorazowy": True,
    }


class TestDetektory:
    def test_detektor_nie_ma_akcji_z_konstrukcji(self):
        """Dozor z akcjami w scenariuszu bylby druga kopia nastaw zabezpieczen (OD-34)."""
        with pytest.raises(ValidationError, match="akcje"):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                detektory=(
                    {
                        **_detektor({"rodzaj": "modul_napiecia", "bus_ref": "b1"}),
                        "akcje": [{"rodzaj": "wylaczenie_galezi", "t_s": 0.0, "element_ref": "l1"}],
                    },
                ),
            )

    def test_powtorzony_identyfikator_detektora_odrzucony(self):
        wielkosc = {"rodzaj": "modul_napiecia", "bus_ref": "b1"}
        with pytest.raises(ValidationError, match="powtorzonych"):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                detektory=(_detektor(wielkosc), _detektor(wielkosc)),
            )

    @pytest.mark.parametrize(
        "wielkosc",
        [
            {"rodzaj": "modul_napiecia", "bus_ref": "b2"},
            {"rodzaj": "czestotliwosc", "bus_ref": "b1"},
            {"rodzaj": "modul_pradu_zacisku", "element_ref": "l1", "zacisk": "do"},
            {"rodzaj": "stan_urzadzenia", "ref_id": "g1", "stan": "p_zadane_pu"},
            {"rodzaj": "moc_urzadzenia", "ref_id": "s1", "skladowa": "q"},
        ],
        ids=["u", "f", "i_zacisku", "stan", "moc"],
    )
    def test_referencje_detektora_przyjete(self, wielkosc):
        scen = ScenariuszDynamiczny(
            horyzont_s=1.0, krok_wyjscia_s=0.1, detektory=(_detektor(wielkosc),)
        )
        apply_scenario(_enm_ze_zrodlem(), _scenariusz_operacyjny(scen))

    @pytest.mark.parametrize(
        "wielkosc, fragment",
        [
            ({"rodzaj": "modul_napiecia", "bus_ref": "brak"}, "brak elementu"),
            ({"rodzaj": "modul_napiecia", "bus_ref": "l1"}, "brak elementu"),
            ({"rodzaj": "modul_pradu_zacisku", "element_ref": "g1", "zacisk": "od"}, "generators"),
            ({"rodzaj": "moc_urzadzenia", "ref_id": "ld1", "skladowa": "p"}, "loads"),
        ],
        ids=["szyna_brak", "szyna_to_galaz", "prad_generatora", "moc_odbioru"],
    )
    def test_referencje_detektora_spoza_roli_odrzucone(self, wielkosc, fragment):
        scen = ScenariuszDynamiczny(
            horyzont_s=1.0, krok_wyjscia_s=0.1, detektory=(_detektor(wielkosc),)
        )
        with pytest.raises(ScenariuszNieprzystajeError, match=fragment):
            apply_scenario(_enm_ze_zrodlem(), _scenariusz_operacyjny(scen))

    def test_zacisk_pradu_bez_domyslnego(self):
        """Prad galezi czyta sie z JAWNIE nazwanego zacisku — brak pola to blad danych."""
        with pytest.raises(ValidationError):
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                detektory=(_detektor({"rodzaj": "modul_pradu_zacisku", "element_ref": "l1"}),),
            )


class TestTrescKartyAB1b1:
    def test_tresc_bez_stanowiska_i_detektorow_bez_nowych_kluczy(self):
        """Scenariusze sprzed karty maja bajtowo te sama tresc (hash, `input_hash` biegu)."""
        scen = ScenariuszDynamiczny(horyzont_s=1.0, krok_wyjscia_s=0.1)
        assert set(scen.tresc()) == {"horyzont_s", "krok_wyjscia_s", "zdarzenia"}

    def test_stanowisko_i_detektory_zmieniaja_hash(self):
        podstawa = _scenariusz_operacyjny(ScenariuszDynamiczny(horyzont_s=1.0, krok_wyjscia_s=0.1))
        ze_stanowiskiem = _scenariusz_operacyjny(
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                stanowisko={"zrodlo_ref": "s1", "impedancja": "idealna", "profil": _PROFIL},
            )
        )
        z_detektorem = _scenariusz_operacyjny(
            ScenariuszDynamiczny(
                horyzont_s=1.0,
                krok_wyjscia_s=0.1,
                detektory=(_detektor({"rodzaj": "modul_napiecia", "bus_ref": "b1"}),),
            )
        )
        assert len({podstawa.hash, ze_stanowiskiem.hash, z_detektorem.hash}) == 3
