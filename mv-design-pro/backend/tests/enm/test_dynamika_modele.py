"""Testy kontraktu `ParametryDynamiczne` (karta W6-1 SS0 p.1-2, SS2).

Iloczyn cech: rodzina x (komplet / brak pola / poza zakresem / niespojnosc
krzyzowa) x proweniencja (karta / certyfikat / profil typowy / deklaracja).
Zero fizyki: wylacznie ksztalt i walidacja kontraktu, zaden test nie zaklada
istnienia solvera W6-2.
"""

from __future__ import annotations

import pytest
from enm.dynamika_modele import (
    RODZINY_PARAMETROW_DYNAMICZNYCH,
    Crowbar,
    Magazyn,
    MaszynaSynchroniczna,
    ProweniencjaParametrow,
    PrzeksztaltnikGFL,
    PrzeksztaltnikGFM,
    RegulacjaCzestotliwosciMagazynu,
    RegulatorNapiecia,
    RegulatorObrotow,
    StabilizatorSystemowy,
    TurbinaWiatrowa,
)
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Fixtures — kazda rodzina w komplecie (bazowe instancje wielokrotnego uzytku)
# ---------------------------------------------------------------------------


def _prow(zrodlo: str = "karta_producenta") -> ProweniencjaParametrow:
    return ProweniencjaParametrow(zrodlo=zrodlo, odniesienie="DS-0001", data="2026-01-01")


def _sm_komplet(**override) -> dict:
    dane = {
        "proweniencja": _prow(),
        "s_n_mva": 10.0,
        "h_s": 3.0,
        "d_pu": 1.0,
        "xd_pu": 1.8,
        "xq_pu": 1.7,
        "xd_prim_pu": 0.3,
        "xq_prim_pu": 0.4,
        "xd_bis_pu": 0.2,
        "xq_bis_pu": 0.25,
        "td0_prim_s": 6.0,
        "tq0_prim_s": 0.5,
        "td0_bis_s": 0.03,
        "tq0_bis_s": 0.05,
        "xl_pu": 0.15,
        "nasycenie_s10": 0.1,
        "nasycenie_s12": 0.3,
        "ra_pu": 0.003,
    }
    dane.update(override)
    return dane


def _gfl_komplet(**override) -> dict:
    dane = {
        "proweniencja": _prow(),
        "s_n_mva": 1.0,
        "i_max_pu": 1.2,
        "priorytet_ogranicznika": "bierna",
        "pll_kp": 50.0,
        "pll_ki": 500.0,
        "reg_pradu_kp": 1.0,
        "reg_pradu_ki": 100.0,
        "k_frt": 2.0,
        "prog_frt_pu": 0.9,
        "tp_s": 0.02,
        "tiq_s": 0.02,
        "p_odbudowa_pu_na_s": 1.0,
        "p_odbudowa_opoznienie_s": 0.1,
        "droop_p_f_pu": 0.04,
        "martwa_strefa_f_hz": 0.02,
        "droop_q_u_pu": 0.05,
        "martwa_strefa_u_pu": 0.01,
        "u_min_ciagle_pu": 0.85,
        "u_max_ciagle_pu": 1.1,
    }
    dane.update(override)
    return dane


def _gfm_komplet(**override) -> dict:
    dane = {
        "proweniencja": _prow(),
        "s_n_mva": 1.0,
        "tryb": "droop",
        "mp_pu": 0.04,
        "mq_pu": 0.04,
        "h_wirtualne_s": 4.0,
        "d_wirtualne_pu": 10.0,
        "r_wirtualne_pu": 0.02,
        "x_wirtualne_pu": 0.1,
        "i_max_pu": 1.3,
        "strategia_ograniczenia": "impedancja_wirtualna",
        "tp_s": 0.02,
        "tiq_s": 0.02,
    }
    dane.update(override)
    return dane


def _magazyn_komplet(**override) -> dict:
    dane = {
        "proweniencja": _prow(),
        "e_n_kwh": 1000.0,
        "p_ladowania_max_kw": 500.0,
        "p_rozladowania_max_kw": 500.0,
        "sprawnosc_ladowania": 0.95,
        "sprawnosc_rozladowania": 0.95,
        "soc_min": 0.1,
        "soc_max": 0.9,
        "soc_poczatkowy": 0.5,
        "przeksztaltnik": PrzeksztaltnikGFL(**_gfl_komplet()),
    }
    dane.update(override)
    return dane


def _wiatr_komplet(rodzina: str, **override) -> dict:
    dane = {
        "rodzina": rodzina,
        "proweniencja": _prow(),
        "h_calkowite_s": 5.0,
        "sztywnosc_walu_pu": 80.0,
        "tlumienie_walu_pu": 1.5,
        "poslizg_ustalony_pu": 0.02,
        "pitch_tempo_deg_s": 8.0,
        "pitch_min_deg": 0.0,
        "pitch_max_deg": 27.0,
    }
    if rodzina in ("wiatr_typ_3", "wiatr_typ_4"):
        dane["przeksztaltnik"] = PrzeksztaltnikGFL(**_gfl_komplet())
    dane.update(override)
    return dane


# ---------------------------------------------------------------------------
# Rodzina x komplet — kazda z 5 rodzin (8 wartosci dyskryminatora) buduje sie
# ---------------------------------------------------------------------------


class TestKompletKazdaRodzina:
    def test_maszyna_synchroniczna_komplet(self):
        sm = MaszynaSynchroniczna(**_sm_komplet())
        assert sm.rodzina == "synchroniczna"

    def test_maszyna_synchroniczna_z_pelnym_lancuchem_regulatorow(self):
        sm = MaszynaSynchroniczna(
            **_sm_komplet(
                wzbudzenie=RegulatorNapiecia(
                    typ="SEXS",
                    ka=200.0,
                    ta_s=0.02,
                    tb_s=0.0,
                    tc_s=0.0,
                    efd_min_pu=-5.0,
                    efd_max_pu=5.0,
                ),
                turbina=RegulatorObrotow(
                    typ="TGOV1",
                    r_pu=0.05,
                    t1_s=0.5,
                    t2_s=1.0,
                    t3_s=2.0,
                    p_max_pu=1.1,
                    p_min_pu=0.0,
                ),
                stabilizator=StabilizatorSystemowy(
                    typ="PSS1A",
                    ks=10.0,
                    tw_s=5.0,
                    t1_s=0.5,
                    t2_s=0.1,
                    t3_s=0.5,
                    t4_s=0.1,
                    limit_min_pu=-0.1,
                    limit_max_pu=0.1,
                ),
            )
        )
        assert sm.wzbudzenie is not None
        assert sm.turbina is not None
        assert sm.stabilizator is not None

    def test_gfl_komplet(self):
        gfl = PrzeksztaltnikGFL(**_gfl_komplet())
        assert gfl.rodzina == "przeksztaltnikowa_gfl"

    def test_gfm_komplet(self):
        gfm = PrzeksztaltnikGFM(**_gfm_komplet())
        assert gfm.rodzina == "przeksztaltnikowa_gfm"

    def test_magazyn_komplet_z_gfl(self):
        mag = Magazyn(**_magazyn_komplet())
        assert mag.rodzina == "magazyn"
        assert mag.przeksztaltnik.rodzina == "przeksztaltnikowa_gfl"

    def test_magazyn_komplet_z_gfm(self):
        mag = Magazyn(**_magazyn_komplet(przeksztaltnik=PrzeksztaltnikGFM(**_gfm_komplet())))
        assert mag.przeksztaltnik.rodzina == "przeksztaltnikowa_gfm"

    def test_magazyn_z_regulacja_czestotliwosci(self):
        mag = Magazyn(
            **_magazyn_komplet(
                regulacja_f=RegulacjaCzestotliwosciMagazynu(
                    droop_pu=0.04, martwa_strefa_hz=0.02, p_rezerwa_pu=0.1
                )
            )
        )
        assert mag.regulacja_f is not None

    @pytest.mark.parametrize(
        "rodzina", ["wiatr_typ_1", "wiatr_typ_2", "wiatr_typ_3", "wiatr_typ_4"]
    )
    def test_turbina_komplet_kazdy_typ_iec(self, rodzina):
        turbina = TurbinaWiatrowa(**_wiatr_komplet(rodzina))
        assert turbina.rodzina == rodzina

    def test_turbina_typ3_z_crowbar(self):
        turbina = TurbinaWiatrowa(
            **_wiatr_komplet(
                "wiatr_typ_3",
                crowbar=Crowbar(prog_pradu_pu=2.0, czas_zwloki_s=0.01, czas_trwania_s=0.2),
            )
        )
        assert turbina.crowbar is not None

    def test_rodziny_stale_kompletne(self):
        assert set(RODZINY_PARAMETROW_DYNAMICZNYCH) == {
            "synchroniczna",
            "przeksztaltnikowa_gfl",
            "przeksztaltnikowa_gfm",
            "magazyn",
            "wiatr_typ_1",
            "wiatr_typ_2",
            "wiatr_typ_3",
            "wiatr_typ_4",
        }


# ---------------------------------------------------------------------------
# Rodzina x brak pola — zero domyslek liczbowych: kazde required pole musi
# realnie blokowac budowe obiektu
# ---------------------------------------------------------------------------


class TestBrakPola:
    def test_maszyna_synchroniczna_brak_s_n_mva(self):
        dane = _sm_komplet()
        del dane["s_n_mva"]
        with pytest.raises(ValidationError):
            MaszynaSynchroniczna(**dane)

    def test_maszyna_synchroniczna_brak_proweniencji(self):
        dane = _sm_komplet()
        del dane["proweniencja"]
        with pytest.raises(ValidationError):
            MaszynaSynchroniczna(**dane)

    def test_gfl_brak_priorytetu_ogranicznika(self):
        """A-9: priorytet_ogranicznika NIGDY nie ma domyslki."""
        dane = _gfl_komplet()
        del dane["priorytet_ogranicznika"]
        with pytest.raises(ValidationError):
            PrzeksztaltnikGFL(**dane)

    def test_gfm_brak_strategii_ograniczenia(self):
        """Shadow review SS12: postac zmierzona, nie wybrana — bez domyslki."""
        dane = _gfm_komplet()
        del dane["strategia_ograniczenia"]
        with pytest.raises(ValidationError):
            PrzeksztaltnikGFM(**dane)

    def test_magazyn_brak_przeksztaltnika(self):
        dane = _magazyn_komplet()
        del dane["przeksztaltnik"]
        with pytest.raises(ValidationError):
            Magazyn(**dane)

    def test_turbina_typ3_brak_przeksztaltnika(self):
        dane = _wiatr_komplet("wiatr_typ_3")
        del dane["przeksztaltnik"]
        with pytest.raises(ValidationError):
            TurbinaWiatrowa(**dane)

    def test_zaden_blok_nie_ma_default_liczbowego(self):
        """Iniekcja czerwona zapadki AST (`scripts/dynamika_zero_default_guard.py`):
        kazde required numeryczne pole faktycznie odmawia budowy bez wartosci."""
        for cls, komplet in (
            (MaszynaSynchroniczna, _sm_komplet),
            (PrzeksztaltnikGFL, _gfl_komplet),
            (PrzeksztaltnikGFM, _gfm_komplet),
        ):
            pelne = komplet()
            for pole, info in cls.model_fields.items():
                if pole in ("rodzina", "proweniencja"):
                    continue
                if info.annotation in (float, int) and info.is_required():
                    okrojone = dict(pelne)
                    del okrojone[pole]
                    with pytest.raises(ValidationError):
                        cls(**okrojone)


# ---------------------------------------------------------------------------
# Rodzina x poza zakresem — Field(ge=/le=) faktycznie odrzuca
# ---------------------------------------------------------------------------


class TestPozaZakresem:
    def test_maszyna_synchroniczna_h_s_ujemne(self):
        with pytest.raises(ValidationError):
            MaszynaSynchroniczna(**_sm_komplet(h_s=-1.0))

    def test_maszyna_synchroniczna_h_s_powyzej_gornej_granicy(self):
        with pytest.raises(ValidationError):
            MaszynaSynchroniczna(**_sm_komplet(h_s=100.0))

    def test_gfl_i_max_ponizej_1pu(self):
        with pytest.raises(ValidationError):
            PrzeksztaltnikGFL(**_gfl_komplet(i_max_pu=0.5))

    def test_gfm_i_max_powyzej_3pu(self):
        with pytest.raises(ValidationError):
            PrzeksztaltnikGFM(**_gfm_komplet(i_max_pu=5.0))

    def test_magazyn_soc_min_poza_01(self):
        with pytest.raises(ValidationError):
            Magazyn(**_magazyn_komplet(soc_min=-0.1))

    def test_turbina_pitch_max_poza_zakresem(self):
        with pytest.raises(ValidationError):
            TurbinaWiatrowa(**_wiatr_komplet("wiatr_typ_1", pitch_max_deg=200.0))


# ---------------------------------------------------------------------------
# Rodzina x niespojnosc krzyzowa — model_validator(mode="after")
# ---------------------------------------------------------------------------


class TestNiespojnoscKrzyzowa:
    def test_sm_xd_bis_wiekszy_niz_xd_prim(self):
        """Wartosci PRZY WLASNYCH granicach pola (xd_bis_pu<=0.35, xd_prim_pu<=0.6)
        — narusza WYLACZNIE porzadek krzyzowy, nie Field(ge=/le=)."""
        with pytest.raises(ValidationError, match="xd_bis_pu <= xd_prim_pu <= xd_pu"):
            MaszynaSynchroniczna(**_sm_komplet(xd_bis_pu=0.35, xd_prim_pu=0.30, xd_pu=1.8))

    def test_sm_xq_bis_wiekszy_niz_xq_prim(self):
        """Symetria klasy (CLAUDE.md KLASA NIE INSTANCJA) — ta sama reguła co xd, os q."""
        with pytest.raises(ValidationError, match="xq_bis_pu <= xq_prim_pu <= xq_pu"):
            MaszynaSynchroniczna(**_sm_komplet(xq_bis_pu=0.40, xq_prim_pu=0.30, xq_pu=1.7))

    def test_sm_td0_bis_wiekszy_niz_td0_prim(self):
        with pytest.raises(ValidationError, match="td0_bis_s musi byc"):
            MaszynaSynchroniczna(**_sm_komplet(td0_prim_s=0.10, td0_bis_s=0.15))

    def test_sm_tq0_bis_wiekszy_niz_tq0_prim(self):
        with pytest.raises(ValidationError, match="tq0_bis_s musi byc"):
            MaszynaSynchroniczna(**_sm_komplet(tq0_prim_s=0.10, tq0_bis_s=0.20))

    def test_sm_regulator_napiecia_limity_odwrocone(self):
        with pytest.raises(ValidationError):
            RegulatorNapiecia(
                typ="SEXS",
                ka=200.0,
                ta_s=0.02,
                tb_s=0.0,
                tc_s=0.0,
                efd_min_pu=-1.0,
                efd_max_pu=-2.0,
            )

    def test_sm_regulator_obrotow_limity_odwrocone(self):
        with pytest.raises(ValidationError):
            RegulatorObrotow(
                typ="TGOV1", r_pu=0.05, t1_s=0.5, t2_s=1.0, t3_s=2.0, p_max_pu=0.5, p_min_pu=0.9
            )

    def test_gfl_napiecie_ciagle_rowne_odrzucone(self):
        """Zakresy pol sa rozlaczne (u_min<=1.0, u_max>=1.0) — jedyny sposob na
        naruszenie porzadku BEZ lamania Field(ge=/le=) to rownosc na granicy."""
        with pytest.raises(ValidationError, match="u_min_ciagle_pu musi byc mniejsze"):
            PrzeksztaltnikGFL(**_gfl_komplet(u_min_ciagle_pu=1.0, u_max_ciagle_pu=1.0))

    def test_magazyn_soc_min_wiekszy_niz_soc_max(self):
        with pytest.raises(ValidationError, match="soc_min .* musi byc mniejsze niz soc_max"):
            Magazyn(**_magazyn_komplet(soc_min=0.9, soc_max=0.1))

    def test_magazyn_soc_poczatkowy_poza_przedzialem(self):
        with pytest.raises(ValidationError, match="soc_poczatkowy"):
            Magazyn(**_magazyn_komplet(soc_min=0.2, soc_max=0.8, soc_poczatkowy=0.9))

    def test_magazyn_moc_rozladowania_przekracza_baze_przeksztaltnika(self):
        gfl = PrzeksztaltnikGFL(**_gfl_komplet(s_n_mva=0.3))
        with pytest.raises(ValidationError, match="p_rozladowania_max_kw"):
            Magazyn(**_magazyn_komplet(przeksztaltnik=gfl, p_rozladowania_max_kw=500.0))

    def test_magazyn_moc_ladowania_przekracza_baze_przeksztaltnika(self):
        gfl = PrzeksztaltnikGFL(**_gfl_komplet(s_n_mva=0.3))
        with pytest.raises(ValidationError, match="p_ladowania_max_kw"):
            Magazyn(
                **_magazyn_komplet(
                    przeksztaltnik=gfl, p_ladowania_max_kw=500.0, p_rozladowania_max_kw=250.0
                )
            )

    def test_turbina_pitch_min_wiekszy_niz_pitch_max(self):
        with pytest.raises(ValidationError, match="pitch_min_deg"):
            TurbinaWiatrowa(**_wiatr_komplet("wiatr_typ_1", pitch_min_deg=20.0, pitch_max_deg=10.0))

    def test_turbina_typ1_z_crowbar_zabroniony(self):
        with pytest.raises(ValidationError, match="crowbar dotyczy wylacznie typ_3"):
            TurbinaWiatrowa(
                **_wiatr_komplet(
                    "wiatr_typ_1",
                    crowbar=Crowbar(prog_pradu_pu=2.0, czas_zwloki_s=0.01, czas_trwania_s=0.2),
                )
            )

    def test_turbina_typ2_z_przeksztaltnikiem_zabroniony(self):
        with pytest.raises(ValidationError, match="przeksztaltnik dotyczy wylacznie typ_3"):
            TurbinaWiatrowa(
                **_wiatr_komplet("wiatr_typ_2", przeksztaltnik=PrzeksztaltnikGFL(**_gfl_komplet()))
            )

    def test_turbina_typ4_bez_przeksztaltnika_zabroniony(self):
        dane = _wiatr_komplet("wiatr_typ_4")
        del dane["przeksztaltnik"]
        with pytest.raises(ValidationError, match="wymaga bloku przeksztaltnik"):
            TurbinaWiatrowa(**dane)


# ---------------------------------------------------------------------------
# Proweniencja x (karta / certyfikat / profil typowy / deklaracja)
# ---------------------------------------------------------------------------


class TestProweniencja:
    @pytest.mark.parametrize(
        "zrodlo",
        [
            "karta_producenta",
            "certyfikat_jednostki",
            "profil_typowy_normy",
            "deklaracja_uzytkownika",
        ],
    )
    def test_kazde_dopuszczalne_zrodlo_buduje_sie(self, zrodlo):
        sm = MaszynaSynchroniczna(**_sm_komplet(proweniencja=_prow(zrodlo)))
        assert sm.proweniencja.zrodlo == zrodlo

    def test_zrodlo_nieznane_odrzucone(self):
        with pytest.raises(ValidationError):
            ProweniencjaParametrow(zrodlo="zgadywanie_agenta", odniesienie="x")

    def test_odniesienie_puste_odrzucone(self):
        with pytest.raises(ValidationError):
            ProweniencjaParametrow(zrodlo="karta_producenta", odniesienie="")

    def test_data_opcjonalna(self):
        prow = ProweniencjaParametrow(zrodlo="deklaracja_uzytkownika", odniesienie="oswiadczenie-1")
        assert prow.data is None


# ---------------------------------------------------------------------------
# Generator.dynamika — pole addytywne, None domyslnie, round-trip ENM
# ---------------------------------------------------------------------------


class TestGeneratorDynamika:
    def test_generator_bez_dynamiki_domyslnie_none(self):
        gen = Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0)
        assert gen.dynamika is None

    def test_generator_dynamika_roundtrip_kazda_rodzina(self):
        bloki = [
            MaszynaSynchroniczna(**_sm_komplet()),
            PrzeksztaltnikGFL(**_gfl_komplet()),
            PrzeksztaltnikGFM(**_gfm_komplet()),
            Magazyn(**_magazyn_komplet()),
            TurbinaWiatrowa(**_wiatr_komplet("wiatr_typ_3")),
        ]
        for blok in bloki:
            gen = Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0, dynamika=blok)
            dumped = gen.model_dump(mode="json")
            gen2 = Generator.model_validate(dumped)
            assert gen2.dynamika is not None
            assert gen2.dynamika.rodzina == blok.rodzina

    def test_enm_model_z_generatorem_dynamicznym_roundtrip(self):
        """Pelny model ENM (nie tylko Generator w izolacji) — dynamika NIE psuje
        walidacji reszty modelu ani round-tripu ZIP/JSON."""
        enm = EnergyNetworkModel(
            header=ENMHeader(name="Test W6-1"),
            buses=[Bus(ref_id="b1", name="Szyna 1", voltage_kv=15.0)],
            generators=[
                Generator(
                    ref_id="g1",
                    name="SM1",
                    bus_ref="b1",
                    p_mw=5.0,
                    gen_type="synchronous",
                    dynamika=MaszynaSynchroniczna(**_sm_komplet()),
                )
            ],
        )
        dumped = enm.model_dump(mode="json", exclude_none=True)
        enm2 = EnergyNetworkModel.model_validate(dumped)
        assert enm2.generators[0].dynamika is not None
        assert enm2.generators[0].dynamika.rodzina == "synchroniczna"

    def test_generator_bez_dynamiki_nie_niesie_klucza_po_exclude_none(self):
        """`model_dump(exclude_none=True)` recznie pomija `None` — WLASNOSC
        pydantic, nie dowod stabilnosci odcisku (patrz test ponizej: zadna
        funkcja hasza w `enm/hash.py` nie wola `exclude_none=True`)."""
        gen = Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0)
        dumped = gen.model_dump(mode="json", exclude_none=True)
        assert "dynamika" not in dumped

    def test_generator_bez_dynamiki_ma_ten_sam_odcisk_co_przed_karta(self):
        """WLASCIWY dowod addytywnosci (KLASA NIE INSTANCJA §4 — deklaracja bez
        testu jest falszywa pewnoscia): trzy funkcje hasza produkcyjnego
        (`enm/hash.py`) NIE wolaja `exclude_none=True` — dumpuja PELNY model i
        dopiero `_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE` zdejmuje `None`. Test
        powyzej tego nie sprawdzal (sprawdzal inna, nieuzywana przez hash sciezke
        dumpu) — luka znaleziona pomiarem golden-registry PRZED/PO (55/56 sieci
        bez zmiany odcisku po dopisaniu `"generators": ("dynamika",)` do
        `_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE`; rejestr pinowany osobno w
        `tests/enm/test_hash_pola_addytywne.py`)."""
        from enm.hash import compute_enm_hash, compute_input_hash, hash_migawki_enm

        def _enm_z_generatorem(**pola: object) -> EnergyNetworkModel:
            return EnergyNetworkModel(
                header=ENMHeader(name="hash-generators-dynamika"),
                buses=[Bus(ref_id="b1", name="B1", voltage_kv=15.0)],
                generators=[Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0, **pola)],
            )

        def _migawka_sprzed_karty(enm: EnergyNetworkModel) -> dict:
            """Postac zrzutu sprzed W6-1: bez klucza `dynamika` na generatorze."""
            dane = enm.model_dump(mode="json")
            for gen in dane["generators"]:
                gen.pop("dynamika", None)
            return dane

        bez_dynamiki = _enm_z_generatorem()
        sprzed_karty = _migawka_sprzed_karty(bez_dynamiki)
        assert hash_migawki_enm(bez_dynamiki.model_dump(mode="json")) == hash_migawki_enm(
            sprzed_karty
        )
        assert compute_enm_hash(bez_dynamiki) == hash_migawki_enm(sprzed_karty)
        assert compute_input_hash(bez_dynamiki) == compute_input_hash(
            EnergyNetworkModel.model_validate(sprzed_karty)
        )

        z_dynamika = _enm_z_generatorem(dynamika=MaszynaSynchroniczna(**_sm_komplet()))
        assert compute_enm_hash(bez_dynamiki) != compute_enm_hash(z_dynamika)
        assert hash_migawki_enm(bez_dynamiki.model_dump(mode="json")) != hash_migawki_enm(
            z_dynamika.model_dump(mode="json")
        )
