"""Fabryka urzadzen: szew kontrakt ENM -> rdzen dynamiki (karta W6-3A).

TO JEST TEST SZWU, a nie fizyki. Fizyke sprawdzaja `test_biblioteka_urzadzen`
(jakobiany, rownowaga) i `test_biblioteka_przebiegi` (mody, ograniczenia, skoki).
Tutaj sprawdzamy trzy rzeczy, ktorych tamte testy nie widza:

1. **Iloczyn cech kontraktu.** Kazda rodzina x kazdy jej wariant wewnetrzny
   (typ turbiny, tryb i strategia przeksztaltnika, obecnosc AVR/GOV/PSS,
   przeksztaltnik magazynu GFL vs GFM, kierunek pracy magazynu) buduje sie z
   PRAWDZIWEGO obiektu kontraktu ENM — nie z atrapy o wygodnym ksztalcie.
2. **Rozliczenie POL kontraktu.** `INWENTARZ_POL` musi pokrywac KAZDE pole
   kazdej klasy `enm/dynamika_modele.py`: albo jako konsumowane, albo jako
   nieskonsumowane Z POWODEM. Nowe pole kontraktu bez decyzji wywala ten test —
   i o to chodzi, bo pole, ktore po cichu wypada z rachunku, jest fabrykacja w
   druga strone (projektant wpisuje dana bez wplywu na wynik).
3. **Nazwane odmowy.** Rodzina spoza zbioru, wariant regulatora bez parametrow,
   sprzecznosc parametrow i punkt pracy poza ograniczeniem koncza sie KODEM z
   zamknietego rejestru, a nie wyjatkiem ogolnym ani cicha degradacja.

Ten modul JAKO JEDYNY w pakiecie testow rdzenia importuje `enm` — i to jest
zamierzone: granica importow obowiazuje KOD rdzenia, a szew trzeba sprawdzic na
prawdziwym kontrakcie, inaczej test potwierdzalby zgodnosc atrapy z atrapa.
"""

from __future__ import annotations

import cmath
from typing import Any

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
from network_model.solvers.dynamika.kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
    KOD_RODZINA_NIEOBSLUGIWANA,
    KOD_WARIANT_BEZ_PARAMETROW,
    KODY_ODMOW,
    OdmowaDynamiki,
)
from network_model.solvers.dynamika.urzadzenia import (
    INWENTARZ_POL,
    RODZINY_OBSLUGIWANE,
    PunktPracyUrzadzenia,
    moc_znamionowa_rodziny_pu,
    okno_tylko_oddawanie,
    zbuduj_turbine_wiatrowa,
    zbuduj_urzadzenie,
)
from network_model.solvers.dynamika.urzadzenia.magazyn import Magazyn as MagazynRdzenia
from network_model.solvers.dynamika.urzadzenia.maszyna_synchroniczna import (
    MaszynaSynchroniczna as MaszynaRdzenia,
)
from network_model.solvers.dynamika.urzadzenia.przeksztaltnik_gfl import (
    PrzeksztaltnikGFL as GflRdzenia,
)
from network_model.solvers.dynamika.urzadzenia.przeksztaltnik_gfm import (
    PrzeksztaltnikGFM as GfmRdzenia,
)
from network_model.solvers.dynamika.urzadzenia.turbina_wiatrowa import (
    TurbinaWiatrowa as TurbinaRdzenia,
)
from pydantic import ValidationError

S_BAZOWA_MVA = 100.0
F_BAZOWA_HZ = 50.0

PROWENIENCJA = ProweniencjaParametrow(
    zrodlo="profil_typowy_normy", odniesienie="IEC 61400-27-1:2015"
)


def punkt(p_pu: float, q_pu: float = 0.05, u_pu: float = 1.02) -> PunktPracyUrzadzenia:
    return PunktPracyUrzadzenia(napiecie_pu=u_pu * cmath.exp(1j * 0.05), moc_pu=complex(p_pu, q_pu))


# ---------------------------------------------------------------------------
# Kompletne bloki kontraktu ENM
# ---------------------------------------------------------------------------


def maszyna_enm(**nadpisania: Any) -> MaszynaSynchroniczna:
    pola: dict[str, Any] = {
        "proweniencja": PROWENIENCJA,
        "s_n_mva": 100.0,
        "h_s": 3.5,
        "d_pu": 2.0,
        "xd_pu": 1.8,
        "xq_pu": 1.7,
        "xd_prim_pu": 0.3,
        "xq_prim_pu": 0.55,
        "xd_bis_pu": 0.22,
        "xq_bis_pu": 0.25,
        "td0_prim_s": 6.0,
        "tq0_prim_s": 0.9,
        "td0_bis_s": 0.04,
        "tq0_bis_s": 0.08,
        "xl_pu": 0.15,
        "nasycenie_s10": 0.1,
        "nasycenie_s12": 0.35,
        "ra_pu": 0.005,
    }
    pola.update(nadpisania)
    return MaszynaSynchroniczna(**pola)


def wzbudzenie_enm(typ: str = "SEXS", **nadpisania: Any) -> RegulatorNapiecia:
    pola: dict[str, Any] = {
        "typ": typ,
        "ka": 200.0,
        "ta_s": 0.05,
        "tb_s": 1.0,
        "tc_s": 0.2,
        "efd_min_pu": -4.0,
        "efd_max_pu": 6.0,
    }
    pola.update(nadpisania)
    return RegulatorNapiecia(**pola)


def turbina_regulator_enm(typ: str = "TGOV1", **nadpisania: Any) -> RegulatorObrotow:
    pola: dict[str, Any] = {
        "typ": typ,
        "r_pu": 0.05,
        "t1_s": 0.4,
        "t2_s": 1.5,
        "t3_s": 5.0,
        "p_max_pu": 1.1,
        "p_min_pu": 0.0,
    }
    pola.update(nadpisania)
    return RegulatorObrotow(**pola)


def stabilizator_enm(**nadpisania: Any) -> StabilizatorSystemowy:
    pola: dict[str, Any] = {
        "typ": "PSS1A",
        "ks": 10.0,
        "tw_s": 10.0,
        "t1_s": 0.15,
        "t2_s": 0.03,
        "t3_s": 0.15,
        "t4_s": 0.03,
        "limit_min_pu": -0.1,
        "limit_max_pu": 0.1,
    }
    pola.update(nadpisania)
    return StabilizatorSystemowy(**pola)


def gfl_enm(**nadpisania: Any) -> PrzeksztaltnikGFL:
    pola: dict[str, Any] = {
        "proweniencja": PROWENIENCJA,
        "s_n_mva": 30.0,
        "i_max_pu": 1.2,
        "priorytet_ogranicznika": "bierna",
        "pll_kp": 6.0,
        "pll_ki": 60.0,
        "reg_pradu_kp": 0.8,
        "reg_pradu_ki": 120.0,
        "k_frt": 2.0,
        "prog_frt_pu": 0.9,
        "tp_s": 0.02,
        "tiq_s": 0.01,
        "p_odbudowa_pu_na_s": 1.0,
        "p_odbudowa_opoznienie_s": 0.05,
        "droop_p_f_pu": 0.04,
        "martwa_strefa_f_hz": 0.02,
        "droop_q_u_pu": 0.05,
        "martwa_strefa_u_pu": 0.01,
        "u_min_ciagle_pu": 0.85,
        "u_max_ciagle_pu": 1.1,
    }
    pola.update(nadpisania)
    return PrzeksztaltnikGFL(**pola)


def gfm_enm(**nadpisania: Any) -> PrzeksztaltnikGFM:
    pola: dict[str, Any] = {
        "proweniencja": PROWENIENCJA,
        "s_n_mva": 40.0,
        "tryb": "droop",
        "mp_pu": 0.04,
        "mq_pu": 0.05,
        "h_wirtualne_s": 4.0,
        "d_wirtualne_pu": 20.0,
        "r_wirtualne_pu": 0.02,
        "x_wirtualne_pu": 0.15,
        "i_max_pu": 1.2,
        "strategia_ograniczenia": "impedancja_wirtualna",
        "tp_s": 0.05,
        "tiq_s": 0.05,
    }
    pola.update(nadpisania)
    return PrzeksztaltnikGFM(**pola)


def magazyn_enm(**nadpisania: Any) -> Magazyn:
    pola: dict[str, Any] = {
        "proweniencja": PROWENIENCJA,
        "e_n_kwh": 20_000.0,
        "p_ladowania_max_kw": 25_000.0,
        "p_rozladowania_max_kw": 25_000.0,
        "sprawnosc_ladowania": 0.95,
        "sprawnosc_rozladowania": 0.93,
        "soc_min": 0.1,
        "soc_max": 0.9,
        "soc_poczatkowy": 0.5,
        "przeksztaltnik": gfl_enm(),
    }
    pola.update(nadpisania)
    return Magazyn(**pola)


def turbina_enm(rodzina: str = "wiatr_typ_4", **nadpisania: Any) -> TurbinaWiatrowa:
    pola: dict[str, Any] = {
        "rodzina": rodzina,
        "proweniencja": PROWENIENCJA,
        "h_calkowite_s": 4.5,
        "sztywnosc_walu_pu": 80.0,
        "tlumienie_walu_pu": 1.5,
        "poslizg_ustalony_pu": -0.01,
        "pitch_tempo_deg_s": 8.0,
        "pitch_min_deg": 0.0,
        "pitch_max_deg": 25.0,
        "przeksztaltnik": gfl_enm() if rodzina in ("wiatr_typ_3", "wiatr_typ_4") else None,
    }
    pola.update(nadpisania)
    return TurbinaWiatrowa(**pola)


def zbuduj(parametry: Any, punkt_pracy: PunktPracyUrzadzenia, ident: str = "X1") -> Any:
    return zbuduj_urzadzenie(
        parametry,
        ident=ident,
        wezel="GEN",
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        punkt_pracy_wezla=punkt_pracy,
    )


# ---------------------------------------------------------------------------
# Iloczyn cech
# ---------------------------------------------------------------------------

PRZYPADKI_ILOCZYNU: list[tuple[str, Any, PunktPracyUrzadzenia, type]] = [
    ("maszyna/bez regulacji", maszyna_enm(), punkt(0.8), MaszynaRdzenia),
    (
        "maszyna/AVR SEXS",
        maszyna_enm(wzbudzenie=wzbudzenie_enm("SEXS")),
        punkt(0.8),
        MaszynaRdzenia,
    ),
    (
        "maszyna/AVR IEEE_ST1A",
        maszyna_enm(wzbudzenie=wzbudzenie_enm("IEEE_ST1A")),
        punkt(0.8),
        MaszynaRdzenia,
    ),
    (
        "maszyna/AVR+GOV",
        maszyna_enm(wzbudzenie=wzbudzenie_enm(), turbina=turbina_regulator_enm()),
        punkt(0.8),
        MaszynaRdzenia,
    ),
    (
        "maszyna/AVR+GOV+PSS",
        maszyna_enm(
            wzbudzenie=wzbudzenie_enm(),
            turbina=turbina_regulator_enm(),
            stabilizator=stabilizator_enm(),
        ),
        punkt(0.8),
        MaszynaRdzenia,
    ),
    ("gfl/priorytet bierny", gfl_enm(priorytet_ogranicznika="bierna"), punkt(0.25), GflRdzenia),
    ("gfl/priorytet czynny", gfl_enm(priorytet_ogranicznika="czynna"), punkt(0.25), GflRdzenia),
    (
        "gfl/bez opoznienia odbudowy",
        gfl_enm(p_odbudowa_opoznienie_s=0.0),
        punkt(0.25),
        GflRdzenia,
    ),
    ("gfm/droop+impedancja", gfm_enm(tryb="droop"), punkt(0.3), GfmRdzenia),
    (
        "gfm/droop+nasycenie",
        gfm_enm(tryb="droop", strategia_ograniczenia="nasycenie_zadania"),
        punkt(0.3),
        GfmRdzenia,
    ),
    ("gfm/vsm+impedancja", gfm_enm(tryb="vsm"), punkt(0.3), GfmRdzenia),
    (
        "gfm/vsm+nasycenie",
        gfm_enm(tryb="vsm", strategia_ograniczenia="nasycenie_zadania"),
        punkt(0.3),
        GfmRdzenia,
    ),
    ("magazyn/GFL rozladowanie", magazyn_enm(), punkt(0.2), MagazynRdzenia),
    ("magazyn/GFL ladowanie", magazyn_enm(), punkt(-0.2), MagazynRdzenia),
    (
        "magazyn/GFM rozladowanie",
        magazyn_enm(przeksztaltnik=gfm_enm(tryb="vsm")),
        punkt(0.2),
        MagazynRdzenia,
    ),
    (
        "magazyn/GFL z regulacja czestotliwosci",
        magazyn_enm(
            regulacja_f=RegulacjaCzestotliwosciMagazynu(
                droop_pu=0.02, martwa_strefa_hz=0.01, p_rezerwa_pu=0.1
            )
        ),
        punkt(0.15),
        MagazynRdzenia,
    ),
    (
        "magazyn/GFM z regulacja czestotliwosci bez martwej strefy",
        magazyn_enm(
            przeksztaltnik=gfm_enm(tryb="vsm"),
            regulacja_f=RegulacjaCzestotliwosciMagazynu(
                droop_pu=0.02, martwa_strefa_hz=0.0, p_rezerwa_pu=0.1
            ),
        ),
        punkt(0.15),
        MagazynRdzenia,
    ),
    ("turbina/typ 4", turbina_enm("wiatr_typ_4"), punkt(0.2), TurbinaRdzenia),
    ("turbina/typ 3 bez crowbar", turbina_enm("wiatr_typ_3"), punkt(0.2), TurbinaRdzenia),
    (
        "turbina/typ 3 z crowbar",
        turbina_enm(
            "wiatr_typ_3",
            crowbar=Crowbar(prog_pradu_pu=1.05, czas_zwloki_s=0.02, czas_trwania_s=0.15),
        ),
        punkt(0.2),
        TurbinaRdzenia,
    ),
]


@pytest.mark.parametrize(
    ("opis", "parametry", "punkt_pracy", "oczekiwany_typ"),
    PRZYPADKI_ILOCZYNU,
    ids=[opis for opis, _, _, _ in PRZYPADKI_ILOCZYNU],
)
def test_fabryka_buduje_kazdy_wariant_kontraktu(
    opis: str, parametry: Any, punkt_pracy: PunktPracyUrzadzenia, oczekiwany_typ: type
) -> None:
    """Kazda rodzina x kazdy wariant wewnetrzny buduje sie i ma rownowage."""
    urzadzenie = zbuduj(parametry, punkt_pracy)
    assert isinstance(urzadzenie, oczekiwany_typ), f"{opis}: fabryka zbudowala {type(urzadzenie)}"
    assert urzadzenie.ident == "X1"
    assert urzadzenie.wezel == "GEN"
    assert len(urzadzenie.nazwy_stanow) >= 2
    stan = urzadzenie.stan_poczatkowy(punkt_pracy.napiecie_pu, punkt_pracy.moc_pu)
    prad = urzadzenie.prad_pu(stan, punkt_pracy.napiecie_pu)
    moc = punkt_pracy.napiecie_pu * prad.conjugate()
    assert (
        abs(moc - punkt_pracy.moc_pu) < 1.0e-10
    ), f"{opis}: moc odtworzona {moc} rozni sie od punktu pracy {punkt_pracy.moc_pu}"


def test_fabryka_pokrywa_kazda_rodzine_kontraktu() -> None:
    """Suma rodzin obslugiwanych i rodzin bez modelu = ZBIOR rodzin kontraktu ENM.

    Deklaracja „kazda rodzina ma model albo nazwana odmowe" bez tego testu bylaby
    obietnica bez pokrycia: nowa rodzina w kontrakcie przeszlaby niezauwazona.
    """
    from network_model.solvers.dynamika.urzadzenia import RODZINY_BEZ_MODELU

    rozliczone = set(RODZINY_OBSLUGIWANE) | set(RODZINY_BEZ_MODELU)
    assert rozliczone == set(RODZINY_PARAMETROW_DYNAMICZNYCH), (
        f"Rodziny kontraktu bez decyzji: "
        f"{set(RODZINY_PARAMETROW_DYNAMICZNYCH) - rozliczone}; rodziny nadmiarowe: "
        f"{rozliczone - set(RODZINY_PARAMETROW_DYNAMICZNYCH)}"
    )


# ---------------------------------------------------------------------------
# Inwentarz pol
# ---------------------------------------------------------------------------

KLASY_KONTRAKTU: dict[str, type] = {
    "MaszynaSynchroniczna": MaszynaSynchroniczna,
    "RegulatorNapiecia": RegulatorNapiecia,
    "RegulatorObrotow": RegulatorObrotow,
    "StabilizatorSystemowy": StabilizatorSystemowy,
    "PrzeksztaltnikGFL": PrzeksztaltnikGFL,
    "PrzeksztaltnikGFM": PrzeksztaltnikGFM,
    "RegulacjaCzestotliwosciMagazynu": RegulacjaCzestotliwosciMagazynu,
    "Magazyn": Magazyn,
    "Crowbar": Crowbar,
    "TurbinaWiatrowa": TurbinaWiatrowa,
}


def test_inwentarz_pol_pokrywa_kontrakt_enm() -> None:
    """KAZDE pole KAZDEJ klasy kontraktu jest rozliczone w `INWENTARZ_POL`.

    To jest bramka przeciw fabrykacji W DRUGA STRONE: pole, ktore projektant
    wypelnia, a solver po cichu pomija, jest kontrolka bez pokrycia — tyle ze po
    stronie danych, a nie interfejsu.
    """
    assert set(INWENTARZ_POL) == set(KLASY_KONTRAKTU), (
        f"Inwentarz rozlicza klasy {set(INWENTARZ_POL)} wobec kontraktu " f"{set(KLASY_KONTRAKTU)}"
    )
    for nazwa_klasy, klasa in KLASY_KONTRAKTU.items():
        pola_kontraktu = set(klasa.model_fields)
        rozliczenie = INWENTARZ_POL[nazwa_klasy]
        assert rozliczenie.wszystkie == pola_kontraktu, (
            f"{nazwa_klasy}: pola bez decyzji {pola_kontraktu - rozliczenie.wszystkie}; "
            f"pola nadmiarowe w inwentarzu {rozliczenie.wszystkie - pola_kontraktu}"
        )
        assert not (
            set(rozliczenie.konsumowane) & {n for n, _ in rozliczenie.nieskonsumowane}
        ), f"{nazwa_klasy}: pole jednoczesnie konsumowane i nieskonsumowane"
        for nazwa_pola, powod in rozliczenie.nieskonsumowane:
            assert len(powod) > 40, (
                f"{nazwa_klasy}.{nazwa_pola}: powod niekonsumowania ma {len(powod)} znakow — "
                "to ma byc uzasadnienie merytoryczne, nie etykieta"
            )


def test_moc_znamionowa_rodziny_bierze_sie_z_wlasciwego_bloku() -> None:
    """Magazyn i turbina dziedzicza baze mocy po SWOIM przeksztaltniku (kontrakt ENM)."""
    assert moc_znamionowa_rodziny_pu(maszyna_enm(), S_BAZOWA_MVA) == pytest.approx(1.0)
    assert moc_znamionowa_rodziny_pu(gfl_enm(), S_BAZOWA_MVA) == pytest.approx(0.3)
    assert moc_znamionowa_rodziny_pu(gfm_enm(), S_BAZOWA_MVA) == pytest.approx(0.4)
    assert moc_znamionowa_rodziny_pu(magazyn_enm(), S_BAZOWA_MVA) == pytest.approx(0.3)
    assert moc_znamionowa_rodziny_pu(
        magazyn_enm(przeksztaltnik=gfm_enm()), S_BAZOWA_MVA
    ) == pytest.approx(0.4)
    assert moc_znamionowa_rodziny_pu(turbina_enm("wiatr_typ_3"), S_BAZOWA_MVA) == pytest.approx(0.3)


# ---------------------------------------------------------------------------
# Nazwane odmowy
# ---------------------------------------------------------------------------


class _RodzinaSpozaZbioru:
    """Blok o ksztalcie kontraktu, ale z rodzina, ktorej rejestr nie zna."""

    rodzina = "rodzina_ktorej_kontrakt_nie_ma"


def test_rodzina_spoza_zbioru_konczy_sie_nazwana_odmowa() -> None:
    """Rodzina bez modelu = NAZWANA odmowa z rejestru, nie wyjatek ogolny."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(_RodzinaSpozaZbioru(), punkt(0.5))
    assert blad.value.kod == KOD_RODZINA_NIEOBSLUGIWANA
    assert blad.value.kod in KODY_ODMOW
    assert blad.value.szczegoly["obslugiwane"] == RODZINY_OBSLUGIWANE


@pytest.mark.parametrize("rodzina", ["wiatr_typ_1", "wiatr_typ_2"])
def test_turbina_bez_modelu_elektrycznego_konczy_sie_nazwana_odmowa(rodzina: str) -> None:
    """Typ 1/2: kontrakt nie niesie schematu zastepczego maszyny indukcyjnej."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(turbina_enm(rodzina), punkt(0.2))
    assert blad.value.kod == KOD_WARIANT_BEZ_PARAMETROW
    assert "Rs" in str(blad.value) and "Xm" in str(blad.value)


@pytest.mark.parametrize(
    ("opis", "parametry"),
    [
        ("wzbudnica wirujaca AC1A", maszyna_enm(wzbudzenie=wzbudzenie_enm("IEEE_AC1A"))),
        (
            "regulator turbiny wodnej HYGOV",
            maszyna_enm(turbina=turbina_regulator_enm("HYGOV")),
        ),
    ],
    ids=["IEEE_AC1A", "HYGOV"],
)
def test_wariant_regulatora_bez_parametrow_konczy_sie_nazwana_odmowa(
    opis: str, parametry: MaszynaSynchroniczna
) -> None:
    """Wariant nazwany w kontrakcie, ktorego POZOSTALE pola nie parametryzuja."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(parametry, punkt(0.8))
    assert blad.value.kod == KOD_WARIANT_BEZ_PARAMETROW, opis
    assert blad.value.szczegoly["zlozalne"], "Odmowa musi wymienic warianty zlozalne"


def test_stabilizator_bez_regulatora_napiecia_konczy_sie_odmowa() -> None:
    """PSS oddaje sygnal na wejscie AVR — bez AVR nie ma gdzie dzialac.

    Kontrakt ENM tej sprzecznosci NIE waliduje (oba bloki sa niezalezne), wiec
    lapie ja dopiero rdzen. To jest jeden z wnioskow do zgloszenia autorowi
    kontraktu, a nie powod do cichego pominiecia stabilizatora.
    """
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(maszyna_enm(stabilizator=stabilizator_enm()), punkt(0.8))
    assert blad.value.kod == KOD_PARAMETRY_SPRZECZNE
    assert "PSS bez AVR" in str(blad.value)


def test_martwa_strefa_magazynu_z_przeksztaltnikiem_gfm_konczy_sie_odmowa() -> None:
    """Statyzm tworzacy siec WYZNACZA czestotliwosc — nie ma czego przepuscic
    przez strefe nieczulosci, wiec martwa strefa nie ma tam realizacji."""
    parametry = magazyn_enm(
        przeksztaltnik=gfm_enm(tryb="vsm"),
        regulacja_f=RegulacjaCzestotliwosciMagazynu(
            droop_pu=0.02, martwa_strefa_hz=0.05, p_rezerwa_pu=0.1
        ),
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(parametry, punkt(0.15))
    assert blad.value.kod == KOD_PARAMETRY_SPRZECZNE
    assert blad.value.szczegoly["martwa_strefa_hz"] == 0.05


def test_punkt_pracy_ponad_ogranicznikiem_pradu_konczy_sie_odmowa() -> None:
    """Punkt pracy niemozliwy do utrzymania = odmowa Z TOZSAMOSCIA urzadzenia."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(gfl_enm(s_n_mva=5.0), punkt(0.4), ident="PV_ZA_MALY")
    assert blad.value.kod == KOD_PUNKT_PRACY_POZA_OGRANICZENIEM
    assert "PV_ZA_MALY" in str(blad.value)


def test_punkt_pracy_wymagajacy_wzbudzenia_poza_zakresem_konczy_sie_odmowa() -> None:
    """Regulator o waskim zakresie wzbudzenia nie utrzyma punktu pracy — odmowa."""
    parametry = maszyna_enm(wzbudzenie=wzbudzenie_enm(efd_min_pu=-0.5, efd_max_pu=1.2))
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(parametry, punkt(0.8, q_pu=0.6))
    assert blad.value.kod == KOD_PUNKT_PRACY_POZA_OGRANICZENIEM
    assert blad.value.szczegoly["efd_max_pu"] == 1.2


def test_magazyn_z_soc_poza_zakresem_konczy_sie_odmowa() -> None:
    """Kontrakt ENM waliduje SOC, ale rdzen NIE UFA wejsciu i sprawdza sam.

    Predykat jest ten sam po obu stronach (SOC w `[min, max]`), ale rdzen dostaje
    obiekt o KSZTALCIE kontraktu, nie sam kontrakt — walidacja pydantic nie
    obowiazuje atrapy, ktora poda adapter.
    """

    class MagazynZeZlymSoc:
        rodzina = "magazyn"
        e_n_kwh = 20_000.0
        p_ladowania_max_kw = 25_000.0
        p_rozladowania_max_kw = 25_000.0
        sprawnosc_ladowania = 0.95
        sprawnosc_rozladowania = 0.93
        soc_min = 0.1
        soc_max = 0.9
        soc_poczatkowy = 0.95
        regulacja_f = None
        przeksztaltnik = gfl_enm()

    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(MagazynZeZlymSoc(), punkt(0.2))
    assert blad.value.kod == KOD_PUNKT_PRACY_POZA_OGRANICZENIEM


def test_krzywa_nasycenia_bez_rozwiazania_konczy_sie_odmowa() -> None:
    """Krzywa nasycenia, ktora nie rosnie, nie ma dopasowania — odmowa, nie domysl."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(maszyna_enm(nasycenie_s10=0.5, nasycenie_s12=0.1), punkt(0.8))
    assert blad.value.kod == KOD_PARAMETRY_SPRZECZNE
    assert "nierosnaca" in str(blad.value)


def test_przeksztaltnik_gfm_o_zerowej_impedancji_wirtualnej_konczy_sie_odmowa() -> None:
    """Zrodlo napieciowe bez impedancji nie ma skonczonej admitancji."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(gfm_enm(r_wirtualne_pu=0.0, x_wirtualne_pu=0.0), punkt(0.3))
    assert blad.value.kod == KOD_PARAMETRY_SPRZECZNE


def test_maszyna_wirtualna_bez_bezwladnosci_konczy_sie_odmowa() -> None:
    """Tryb VSM bez wirtualnej stalej bezwladnosci to rownanie ruchu bez masy."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj(gfm_enm(tryb="vsm", h_wirtualne_s=0.0), punkt(0.3))
    assert blad.value.kod == KOD_PARAMETRY_SPRZECZNE
    assert blad.value.szczegoly["h_wirtualne_s"] == 0.0


def test_turbina_bez_bloku_przeksztaltnika_konczy_sie_nazwana_odmowa() -> None:
    """Turbina typu 3/4 bez bloku przeksztaltnika = ODMOWA, nie liczby zastepcze.

    Ta sciezka dlugo nie miala dowodu, a fabryka wolala wtedy konstruktor turbiny
    z LICZBAMI, ktore nie pochodzily z zadnej danej wejsciowej (`s_n_mva = 1.0`,
    okno mocy `[0, 0]`, crowbar wyrzucony mimo obecnosci w kontrakcie) — tylko po
    to, zeby konstruktor odmowil. Gdyby kiedykolwiek ubyla odmowa po drugiej
    stronie, te liczby staly by sie cicho wartosciami dzialajacymi. Teraz warunek
    i odmowa leza w jednym miejscu, a ten test to przypina.

    WEJSCIEM KONTRAKTU ENM TEJ SYTUACJI NIE DA SIE ZBUDOWAC — i to jest dobra
    wiadomosc, sprawdzona tu wprost: walidator `TurbinaWiatrowa` w `enm/
    dynamika_modele.py` odrzuca typ 3/4 bez bloku przeksztaltnika juz na
    poziomie kontraktu. Odmowa biblioteki jest wiec druga linia, na wypadek
    zmiany kontraktu i dla wywolan konstruktora wprost.
    """
    with pytest.raises(ValidationError):
        turbina_enm(rodzina="wiatr_typ_4", przeksztaltnik=None)

    with pytest.raises(OdmowaDynamiki) as odmowa_konstruktora:
        zbuduj_turbine_wiatrowa(
            ident="WT1",
            wezel="GEN",
            typ="wiatr_typ_4",
            rdzen=None,
            h_calkowite_s=4.5,
            pitch_tempo_deg_s=8.0,
            pitch_min_deg=0.0,
            pitch_max_deg=25.0,
            crowbar=None,
            okno_mocy=okno_tylko_oddawanie(0.3),
            s_n_mva=30.0,
            s_bazowa_mva=S_BAZOWA_MVA,
            f_bazowa_hz=F_BAZOWA_HZ,
        )
    assert odmowa_konstruktora.value.kod == KOD_PARAMETRY_SPRZECZNE


def test_crowbar_z_kontraktu_dostaje_prad_pelnego_zadzialania_z_przeksztaltnika() -> None:
    """Prad pelnego zadzialania crowbar bierze sie z `i_max` TEGO przeksztaltnika.

    Kontrakt ENM niesie dla crowbar trzy nastawy (prog, zwloka, czas trwania);
    czwarta liczba modelu — prad, przy ktorym zadzialanie jest pelne — NIE jest
    nastawa i nie wolno jej dobrac. Jest nia ogranicznik pradu przeksztaltnika
    tej samej turbiny, przeliczony na baze ukladu. Ten test pilnuje, ze fabryka
    bierze ja stamtad, a nie z wartosci domyslnej.
    """
    przeksztaltnik = gfl_enm(i_max_pu=2.0, s_n_mva=30.0)
    urzadzenie = zbuduj(
        turbina_enm(
            rodzina="wiatr_typ_3",
            przeksztaltnik=przeksztaltnik,
            crowbar=Crowbar(prog_pradu_pu=1.05, czas_zwloki_s=0.02, czas_trwania_s=0.15),
        ),
        PunktPracyUrzadzenia(napiecie_pu=complex(1.0, 0.0), moc_pu=complex(0.2, 0.0)),
        ident="WT1",
    )
    crowbar = urzadzenie.crowbar
    assert crowbar is not None
    assert crowbar.prad_pelnego_zadzialania_pu == pytest.approx(
        urzadzenie.rdzen.i_max_pu, abs=1.0e-12
    ), "Prad pelnego zadzialania musi byc ogranicznikiem pradu TEGO przeksztaltnika"
    assert crowbar.prog_pradu_pu == pytest.approx(
        1.05 * 30.0 / S_BAZOWA_MVA, abs=1.0e-12
    ), "Prog crowbar jest wielkoscia wzgledna bazy URZADZENIA i musi przejsc zmiane bazy"
