"""Fabryka urzadzen dynamicznych — JEDYNY szew miedzy kontraktem danych a rdzeniem.

PO CO. Adapter warstwy aplikacyjnej (karta W6-3B) sklada wejscie biegu z migawki
efektywnej i musi zamienic blok `Generator.dynamika` na obiekt spelniajacy
protokol `kontrakty.Urzadzenie`. Robi to WYLACZNIE przez `zbuduj_urzadzenie` —
nie wchodzi do `solvers/dynamika/**` i nie zna ani jednej klasy urzadzenia.
Dzieki temu biblioteka urzadzen moze sie rozrastac bez zmiany adaptera, a adapter
nie ma gdzie „poprawic" fizyki.

GRANICA IMPORTOW. Pakiet dynamiki NIE MOZE importowac `enm/` (bramka
`scripts/dynamika_granica_importow_guard.py`), wiec fabryka nie przyjmuje typu
pydantic z kontraktu ENM, tylko obiekt o TYM SAMYM KSZTALCIE — opisany tu
protokolami strukturalnymi. To nie jest obejscie granicy: to jest jej wlasciwa
postac. Rdzen obliczeniowy opisuje, JAKICH DANYCH potrzebuje; warstwa wyzsza
dostarcza je z kontraktu, ktory sama posiada.

RODZINA BEZ IMPLEMENTACJI = NAZWANA ODMOWA. Zadna sciezka tego modulu nie
degraduje urzadzenia do maszyny klasycznej ani do zrodla stalego. Rodzina spoza
zbioru konczy sie `OdmowaDynamiki(KOD_RODZINA_NIEOBSLUGIWANA)` z wypisanym
zbiorem rodzin obslugiwanych — projektant dostaje informacje, a nie przebieg
policzony z innej fizyki niz zadeklarowal.

INWENTARZ POL (`INWENTARZ_POL`). Kazde pole kontraktu jest tu przypisane do
jednej z dwoch list: KONSUMOWANE (wchodzi do rownan) albo NIESKONSUMOWANE (z
POWODEM merytorycznym). Pole, ktore po cichu wypada z rachunku, jest fabrykacja
w drugą strone — projektant wpisuje dana, ktora nie ma zadnego wplywu na wynik.
Inwentarz jest przypiety testem porownujacym go z rzeczywistymi polami modeli
`enm/dynamika_modele.py`: nowe pole kontraktu bez decyzji „konsumujemy / nie i
dlaczego" wywala test.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, cast, runtime_checkable

from ..kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_RODZINA_NIEOBSLUGIWANA,
    OdmowaDynamiki,
    Urzadzenie,
)
from .magazyn import Magazyn, zbuduj_magazyn, zbuduj_zasobnik
from .maszyna_synchroniczna import MaszynaSynchroniczna, zbuduj_maszyne_synchroniczna
from .okno_mocy import (
    moc_znamionowa_pu,
    okno_symetryczne,
    okno_tylko_oddawanie,
)
from .przeksztaltnik_gfl import PrzeksztaltnikGFL, RdzenGFL, zbuduj_rdzen_gfl
from .przeksztaltnik_gfm import (
    TRYB_MASZYNA_WIRTUALNA,
    PrzeksztaltnikGFM,
    RdzenGFM,
    zbuduj_rdzen_gfm,
)
from .regulatory import (
    zbuduj_regulator_napiecia,
    zbuduj_regulator_obrotow,
    zbuduj_stabilizator,
)
from .turbina_wiatrowa import (
    TYPY_BEZ_MODELU_ELEKTRYCZNEGO,
    TYPY_ZLOZALNE,
    NastawyCrowbar,
    TurbinaWiatrowa,
    sprawdz_typ_turbiny,
    zbuduj_turbine_wiatrowa,
)

#: Rodziny parametrow dynamicznych, ktore ta fabryka potrafi zbudowac.
#: ZAMKNIETY zbior — kazda inna wartosc `rodzina` konczy sie nazwana odmowa.
RODZINY_OBSLUGIWANE: tuple[str, ...] = (
    "synchroniczna",
    "przeksztaltnikowa_gfl",
    "przeksztaltnikowa_gfm",
    "magazyn",
    *TYPY_ZLOZALNE,
)

#: Rodziny obecne w kontrakcie ENM, ktorych model elektryczny nie da sie zlozyc z
#: pol tego kontraktu (maszyna indukcyjna wprost na sieci — patrz
#: `turbina_wiatrowa`). Sa tu wymienione, zeby odmowa niosla POWOD, a nie tylko
#: „rodzina nieznana".
RODZINY_BEZ_MODELU: tuple[str, ...] = TYPY_BEZ_MODELU_ELEKTRYCZNEGO


@dataclass(frozen=True)
class PolaRodziny:
    """Rozliczenie pol jednej klasy kontraktu: co wchodzi do rownan, a co nie."""

    konsumowane: tuple[str, ...]
    nieskonsumowane: tuple[tuple[str, str], ...]

    @property
    def wszystkie(self) -> frozenset[str]:
        return frozenset(self.konsumowane) | frozenset(nazwa for nazwa, _ in self.nieskonsumowane)


#: Pola wspolne kazdej rodziny, ktorych rdzen dynamiki nie konsumuje z zasady.
_POLA_TOZSAMOSCI: tuple[tuple[str, str], ...] = (
    ("rodzina", "dyskryminator unii — wybiera model, nie wchodzi do rownan"),
    (
        "proweniencja",
        "pochodzenie danych; konsumuje je warstwa wyzsza przy ustalaniu stopnia "
        "dowodowego wyniku (solver_input/provenance.py), nie rownania ruchu",
    ),
)

#: Rozliczenie pol KAZDEJ klasy kontraktu `enm/dynamika_modele.py`.
#: Przypiete testem `test_fabryka.py::test_inwentarz_pol_pokrywa_kontrakt_enm`.
INWENTARZ_POL: dict[str, PolaRodziny] = {
    "MaszynaSynchroniczna": PolaRodziny(
        konsumowane=(
            "s_n_mva",
            "h_s",
            "d_pu",
            "xd_pu",
            "xq_pu",
            "xd_prim_pu",
            "xq_prim_pu",
            "xd_bis_pu",
            "xq_bis_pu",
            "td0_prim_s",
            "tq0_prim_s",
            "td0_bis_s",
            "tq0_bis_s",
            "xl_pu",
            "nasycenie_s10",
            "nasycenie_s12",
            "ra_pu",
            "wzbudzenie",
            "turbina",
            "stabilizator",
        ),
        nieskonsumowane=_POLA_TOZSAMOSCI,
    ),
    "RegulatorNapiecia": PolaRodziny(
        konsumowane=("typ", "ka", "ta_s", "tb_s", "tc_s", "efd_min_pu", "efd_max_pu"),
        nieskonsumowane=(),
    ),
    "RegulatorObrotow": PolaRodziny(
        konsumowane=("typ", "r_pu", "t1_s", "t2_s", "t3_s", "p_max_pu", "p_min_pu"),
        nieskonsumowane=(),
    ),
    "StabilizatorSystemowy": PolaRodziny(
        konsumowane=(
            "typ",
            "ks",
            "tw_s",
            "t1_s",
            "t2_s",
            "t3_s",
            "t4_s",
            "limit_min_pu",
            "limit_max_pu",
        ),
        nieskonsumowane=(),
    ),
    "PrzeksztaltnikGFL": PolaRodziny(
        konsumowane=(
            "s_n_mva",
            "i_max_pu",
            "priorytet_ogranicznika",
            "pll_kp",
            "pll_ki",
            "k_frt",
            "prog_frt_pu",
            "tp_s",
            "tiq_s",
            "p_odbudowa_pu_na_s",
            "p_odbudowa_opoznienie_s",
            "droop_p_f_pu",
            "martwa_strefa_f_hz",
            "droop_q_u_pu",
            "martwa_strefa_u_pu",
            "u_min_ciagle_pu",
            "u_max_ciagle_pu",
        ),
        nieskonsumowane=(
            *_POLA_TOZSAMOSCI,
            (
                "reg_pradu_kp",
                "wzmocnienia wewnetrznej petli pradu opisuja regulacje na poziomie "
                "chwilowym (EMT); w modelu RMS petla pradu jest zastapiona czlonami "
                "inercyjnymi `tp_s`/`tiq_s`, a przeliczenie wzmocnien na stala czasowa "
                "zamknietej petli wymaga indukcyjnosci i rezystancji filtru, ktorych "
                "kontrakt nie niesie",
            ),
            (
                "reg_pradu_ki",
                "jak `reg_pradu_kp` — czlon calkujacy tej samej petli pradu",
            ),
        ),
    ),
    "PrzeksztaltnikGFM": PolaRodziny(
        konsumowane=(
            "s_n_mva",
            "tryb",
            "mp_pu",
            "mq_pu",
            "h_wirtualne_s",
            "d_wirtualne_pu",
            "r_wirtualne_pu",
            "x_wirtualne_pu",
            "i_max_pu",
            "strategia_ograniczenia",
            "tp_s",
            "tiq_s",
        ),
        nieskonsumowane=_POLA_TOZSAMOSCI,
    ),
    "RegulacjaCzestotliwosciMagazynu": PolaRodziny(
        konsumowane=("droop_pu", "martwa_strefa_hz", "p_rezerwa_pu"),
        nieskonsumowane=(),
    ),
    "Magazyn": PolaRodziny(
        konsumowane=(
            "e_n_kwh",
            "p_ladowania_max_kw",
            "p_rozladowania_max_kw",
            "sprawnosc_ladowania",
            "sprawnosc_rozladowania",
            "soc_min",
            "soc_max",
            "soc_poczatkowy",
            "regulacja_f",
            "przeksztaltnik",
        ),
        nieskonsumowane=_POLA_TOZSAMOSCI,
    ),
    "Crowbar": PolaRodziny(
        konsumowane=("prog_pradu_pu", "czas_zwloki_s", "czas_trwania_s"),
        nieskonsumowane=(),
    ),
    "TurbinaWiatrowa": PolaRodziny(
        konsumowane=(
            "h_calkowite_s",
            "pitch_tempo_deg_s",
            "pitch_min_deg",
            "pitch_max_deg",
            "crowbar",
            "przeksztaltnik",
        ),
        nieskonsumowane=(
            *_POLA_TOZSAMOSCI,
            (
                "sztywnosc_walu_pu",
                "model dwumasowy IEC 61400-27-1 wymaga PODZIALU bezwladnosci na mase "
                "turbiny i mase generatora; kontrakt niesie wylacznie bezwladnosc "
                "calkowita, wiec czestotliwosc drgan skretnych nie jest wyznaczona — "
                "dobranie podzialu zmienialoby wynik badania, wiec tor mechaniczny jest "
                "jednomasowy (wariant dopuszczony norma)",
            ),
            (
                "tlumienie_walu_pu",
                "jak `sztywnosc_walu_pu` — parametr walu w modelu dwumasowym, ktorego "
                "kontrakt nie parametryzuje",
            ),
            (
                "poslizg_ustalony_pu",
                "poslizg opisuje maszyne indukcyjna; typy 3/4 sa sprzezone z siecia przez "
                "przeksztaltnik, ktory ten poslizg odsprzega od zaciskow, a typy 1/2 nie "
                "maja w kontrakcie schematu zastepczego maszyny (odmowa rodziny)",
            ),
        ),
    ),
}


# ---------------------------------------------------------------------------
# Ksztalt danych wejsciowych (protokoly strukturalne)
# ---------------------------------------------------------------------------


@runtime_checkable
class ParametryZRodzina(Protocol):
    """Wspolny mianownik: kazdy blok kontraktu niesie dyskryminator `rodzina`."""

    @property
    def rodzina(self) -> str: ...


class BlokWzbudzenia(Protocol):
    @property
    def typ(self) -> str: ...
    @property
    def ka(self) -> float: ...
    @property
    def ta_s(self) -> float: ...
    @property
    def tb_s(self) -> float: ...
    @property
    def tc_s(self) -> float: ...
    @property
    def efd_min_pu(self) -> float: ...
    @property
    def efd_max_pu(self) -> float: ...


class BlokTurbiny(Protocol):
    @property
    def typ(self) -> str: ...
    @property
    def r_pu(self) -> float: ...
    @property
    def t1_s(self) -> float: ...
    @property
    def t2_s(self) -> float: ...
    @property
    def t3_s(self) -> float: ...
    @property
    def p_max_pu(self) -> float: ...
    @property
    def p_min_pu(self) -> float: ...


class BlokStabilizatora(Protocol):
    @property
    def typ(self) -> str: ...
    @property
    def ks(self) -> float: ...
    @property
    def tw_s(self) -> float: ...
    @property
    def t1_s(self) -> float: ...
    @property
    def t2_s(self) -> float: ...
    @property
    def t3_s(self) -> float: ...
    @property
    def t4_s(self) -> float: ...
    @property
    def limit_min_pu(self) -> float: ...
    @property
    def limit_max_pu(self) -> float: ...


class ParametryMaszyny(Protocol):
    @property
    def s_n_mva(self) -> float: ...
    @property
    def h_s(self) -> float: ...
    @property
    def d_pu(self) -> float: ...
    @property
    def xd_pu(self) -> float: ...
    @property
    def xq_pu(self) -> float: ...
    @property
    def xd_prim_pu(self) -> float: ...
    @property
    def xq_prim_pu(self) -> float: ...
    @property
    def xd_bis_pu(self) -> float: ...
    @property
    def xq_bis_pu(self) -> float: ...
    @property
    def td0_prim_s(self) -> float: ...
    @property
    def tq0_prim_s(self) -> float: ...
    @property
    def td0_bis_s(self) -> float: ...
    @property
    def tq0_bis_s(self) -> float: ...
    @property
    def xl_pu(self) -> float: ...
    @property
    def nasycenie_s10(self) -> float: ...
    @property
    def nasycenie_s12(self) -> float: ...
    @property
    def ra_pu(self) -> float: ...
    @property
    def wzbudzenie(self) -> BlokWzbudzenia | None: ...
    @property
    def turbina(self) -> BlokTurbiny | None: ...
    @property
    def stabilizator(self) -> BlokStabilizatora | None: ...


class ParametryGFL(Protocol):
    @property
    def rodzina(self) -> str: ...
    @property
    def s_n_mva(self) -> float: ...
    @property
    def i_max_pu(self) -> float: ...
    @property
    def priorytet_ogranicznika(self) -> str: ...
    @property
    def pll_kp(self) -> float: ...
    @property
    def pll_ki(self) -> float: ...
    @property
    def k_frt(self) -> float: ...
    @property
    def prog_frt_pu(self) -> float: ...
    @property
    def tp_s(self) -> float: ...
    @property
    def tiq_s(self) -> float: ...
    @property
    def p_odbudowa_pu_na_s(self) -> float: ...
    @property
    def p_odbudowa_opoznienie_s(self) -> float: ...
    @property
    def droop_p_f_pu(self) -> float: ...
    @property
    def martwa_strefa_f_hz(self) -> float: ...
    @property
    def droop_q_u_pu(self) -> float: ...
    @property
    def martwa_strefa_u_pu(self) -> float: ...
    @property
    def u_min_ciagle_pu(self) -> float: ...
    @property
    def u_max_ciagle_pu(self) -> float: ...


class ParametryGFM(Protocol):
    @property
    def rodzina(self) -> str: ...
    @property
    def s_n_mva(self) -> float: ...
    @property
    def tryb(self) -> str: ...
    @property
    def mp_pu(self) -> float: ...
    @property
    def mq_pu(self) -> float: ...
    @property
    def h_wirtualne_s(self) -> float: ...
    @property
    def d_wirtualne_pu(self) -> float: ...
    @property
    def r_wirtualne_pu(self) -> float: ...
    @property
    def x_wirtualne_pu(self) -> float: ...
    @property
    def i_max_pu(self) -> float: ...
    @property
    def strategia_ograniczenia(self) -> str: ...
    @property
    def tp_s(self) -> float: ...
    @property
    def tiq_s(self) -> float: ...


class BlokRegulacjiCzestotliwosci(Protocol):
    @property
    def droop_pu(self) -> float: ...
    @property
    def martwa_strefa_hz(self) -> float: ...
    @property
    def p_rezerwa_pu(self) -> float: ...


class ParametryMagazynu(Protocol):
    @property
    def e_n_kwh(self) -> float: ...
    @property
    def p_ladowania_max_kw(self) -> float: ...
    @property
    def p_rozladowania_max_kw(self) -> float: ...
    @property
    def sprawnosc_ladowania(self) -> float: ...
    @property
    def sprawnosc_rozladowania(self) -> float: ...
    @property
    def soc_min(self) -> float: ...
    @property
    def soc_max(self) -> float: ...
    @property
    def soc_poczatkowy(self) -> float: ...
    @property
    def regulacja_f(self) -> BlokRegulacjiCzestotliwosci | None: ...
    @property
    def przeksztaltnik(self) -> ParametryGFL | ParametryGFM: ...


class BlokCrowbar(Protocol):
    @property
    def prog_pradu_pu(self) -> float: ...
    @property
    def czas_zwloki_s(self) -> float: ...
    @property
    def czas_trwania_s(self) -> float: ...


class ParametryTurbiny(Protocol):
    @property
    def rodzina(self) -> str: ...
    @property
    def h_calkowite_s(self) -> float: ...
    @property
    def pitch_tempo_deg_s(self) -> float: ...
    @property
    def pitch_min_deg(self) -> float: ...
    @property
    def pitch_max_deg(self) -> float: ...
    @property
    def crowbar(self) -> BlokCrowbar | None: ...
    @property
    def przeksztaltnik(self) -> ParametryGFL | None: ...


@dataclass(frozen=True)
class PunktPracyUrzadzenia:
    """Napiecie zaciskow i moc oddawana do sieci — z rozpływu, nie z domyslu.

    Fabryka uzywa go do WERYFIKACJI: buduje stan rownowagi od razu po zlozeniu
    urzadzenia, wiec punkt pracy niezgodny z ograniczeniami (prad ponad `i_max`,
    wzbudzenie poza zakresem regulatora, moc turbiny poza granicami) konczy sie
    nazwana odmowa Z TOZSAMOSCIA URZADZENIA — w miejscu, gdzie da sie powiedziec,
    KTORE zrodlo jest niespojne, a nie dopiero w bramce rownowagi calego ukladu.
    """

    napiecie_pu: complex
    moc_pu: complex


# ---------------------------------------------------------------------------
# Budowa
# ---------------------------------------------------------------------------


def _rdzen_przeksztaltnika_gfl(
    parametry: ParametryGFL,
    *,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
    droop_p_f_pu: float | None = None,
    martwa_strefa_f_hz: float | None = None,
) -> RdzenGFL:
    """Rdzen GFL; `droop_*` nadpisane, gdy regulacje narzuca zasob nadrzedny."""
    return zbuduj_rdzen_gfl(
        s_n_mva=parametry.s_n_mva,
        i_max_pu=parametry.i_max_pu,
        priorytet_ogranicznika=parametry.priorytet_ogranicznika,
        pll_kp=parametry.pll_kp,
        pll_ki=parametry.pll_ki,
        k_frt=parametry.k_frt,
        prog_frt_pu=parametry.prog_frt_pu,
        tp_s=parametry.tp_s,
        tiq_s=parametry.tiq_s,
        p_odbudowa_pu_na_s=parametry.p_odbudowa_pu_na_s,
        p_odbudowa_opoznienie_s=parametry.p_odbudowa_opoznienie_s,
        droop_p_f_pu=(parametry.droop_p_f_pu if droop_p_f_pu is None else droop_p_f_pu),
        martwa_strefa_f_hz=(
            parametry.martwa_strefa_f_hz if martwa_strefa_f_hz is None else martwa_strefa_f_hz
        ),
        droop_q_u_pu=parametry.droop_q_u_pu,
        martwa_strefa_u_pu=parametry.martwa_strefa_u_pu,
        u_min_ciagle_pu=parametry.u_min_ciagle_pu,
        u_max_ciagle_pu=parametry.u_max_ciagle_pu,
        s_bazowa_mva=s_bazowa_mva,
        f_bazowa_hz=f_bazowa_hz,
    )


def _rdzen_przeksztaltnika_gfm(
    parametry: ParametryGFM,
    *,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
    mp_pu: float | None = None,
) -> RdzenGFM:
    """Rdzen GFM; `mp_pu` nadpisane, gdy statyzm narzuca zasob nadrzedny."""
    return zbuduj_rdzen_gfm(
        s_n_mva=parametry.s_n_mva,
        tryb=parametry.tryb,
        mp_pu=parametry.mp_pu if mp_pu is None else mp_pu,
        mq_pu=parametry.mq_pu,
        h_wirtualne_s=parametry.h_wirtualne_s,
        d_wirtualne_pu=parametry.d_wirtualne_pu,
        r_wirtualne_pu=parametry.r_wirtualne_pu,
        x_wirtualne_pu=parametry.x_wirtualne_pu,
        i_max_pu=parametry.i_max_pu,
        strategia_ograniczenia=parametry.strategia_ograniczenia,
        tp_s=parametry.tp_s,
        tiq_s=parametry.tiq_s,
        s_bazowa_mva=s_bazowa_mva,
        f_bazowa_hz=f_bazowa_hz,
    )


def _zbuduj_maszyne(
    parametry: ParametryMaszyny,
    *,
    ident: str,
    wezel: str,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> MaszynaSynchroniczna:
    wzbudzenie = parametry.wzbudzenie
    turbina = parametry.turbina
    stabilizator = parametry.stabilizator
    return zbuduj_maszyne_synchroniczna(
        ident=ident,
        wezel=wezel,
        s_n_mva=parametry.s_n_mva,
        h_s=parametry.h_s,
        d_pu=parametry.d_pu,
        xd_pu=parametry.xd_pu,
        xq_pu=parametry.xq_pu,
        xd_prim_pu=parametry.xd_prim_pu,
        xq_prim_pu=parametry.xq_prim_pu,
        xd_bis_pu=parametry.xd_bis_pu,
        xq_bis_pu=parametry.xq_bis_pu,
        xl_pu=parametry.xl_pu,
        ra_pu=parametry.ra_pu,
        td0_prim_s=parametry.td0_prim_s,
        tq0_prim_s=parametry.tq0_prim_s,
        td0_bis_s=parametry.td0_bis_s,
        tq0_bis_s=parametry.tq0_bis_s,
        nasycenie_s10=parametry.nasycenie_s10,
        nasycenie_s12=parametry.nasycenie_s12,
        wzbudzenie=(
            None
            if wzbudzenie is None
            else zbuduj_regulator_napiecia(
                wariant=wzbudzenie.typ,
                ka=wzbudzenie.ka,
                ta_s=wzbudzenie.ta_s,
                tb_s=wzbudzenie.tb_s,
                tc_s=wzbudzenie.tc_s,
                efd_min_pu=wzbudzenie.efd_min_pu,
                efd_max_pu=wzbudzenie.efd_max_pu,
            )
        ),
        turbina=(
            None
            if turbina is None
            else zbuduj_regulator_obrotow(
                wariant=turbina.typ,
                r_pu=turbina.r_pu,
                t1_s=turbina.t1_s,
                t2_s=turbina.t2_s,
                t3_s=turbina.t3_s,
                p_min_pu=turbina.p_min_pu,
                p_max_pu=turbina.p_max_pu,
            )
        ),
        stabilizator=(
            None
            if stabilizator is None
            else zbuduj_stabilizator(
                wariant=stabilizator.typ,
                ks=stabilizator.ks,
                tw_s=stabilizator.tw_s,
                t1_s=stabilizator.t1_s,
                t2_s=stabilizator.t2_s,
                t3_s=stabilizator.t3_s,
                t4_s=stabilizator.t4_s,
                limit_min_pu=stabilizator.limit_min_pu,
                limit_max_pu=stabilizator.limit_max_pu,
            )
        ),
        s_bazowa_mva=s_bazowa_mva,
        f_bazowa_hz=f_bazowa_hz,
    )


def _zbuduj_magazyn(
    parametry: ParametryMagazynu,
    *,
    ident: str,
    wezel: str,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> Magazyn:
    przeksztaltnik = parametry.przeksztaltnik
    regulacja = parametry.regulacja_f
    rezerwa_pu = 0.0 if regulacja is None else regulacja.p_rezerwa_pu
    if przeksztaltnik.rodzina == "przeksztaltnikowa_gfl":
        gfl = cast(ParametryGFL, przeksztaltnik)
        rdzen: RdzenGFL | RdzenGFM = _rdzen_przeksztaltnika_gfl(
            gfl,
            s_bazowa_mva=s_bazowa_mva,
            f_bazowa_hz=f_bazowa_hz,
            droop_p_f_pu=None if regulacja is None else regulacja.droop_pu,
            martwa_strefa_f_hz=None if regulacja is None else regulacja.martwa_strefa_hz,
        )
    else:
        gfm = cast(ParametryGFM, przeksztaltnik)
        if regulacja is not None and regulacja.martwa_strefa_hz > 0.0:
            raise OdmowaDynamiki(
                KOD_PARAMETRY_SPRZECZNE,
                f"Magazyn {ident!r}: martwa strefa czestotliwosci "
                f"{regulacja.martwa_strefa_hz} Hz nie ma realizacji w przeksztaltniku "
                "tworzacym siec — statyzm GFM WYZNACZA czestotliwosc zamiast na nia "
                "odpowiadac, wiec nie ma sygnalu, ktory dalo by sie przepuscic przez "
                "strefe nieczulosci. Martwa strefa jest wlasciwoscia zrodla nadaznego.",
                urzadzenie=ident,
                martwa_strefa_hz=regulacja.martwa_strefa_hz,
            )
        rdzen = _rdzen_przeksztaltnika_gfm(
            gfm,
            s_bazowa_mva=s_bazowa_mva,
            f_bazowa_hz=f_bazowa_hz,
            mp_pu=None if regulacja is None else regulacja.droop_pu,
        )
    zasobnik = zbuduj_zasobnik(
        e_n_kwh=parametry.e_n_kwh,
        p_ladowania_max_kw=parametry.p_ladowania_max_kw,
        p_rozladowania_max_kw=parametry.p_rozladowania_max_kw,
        sprawnosc_ladowania=parametry.sprawnosc_ladowania,
        sprawnosc_rozladowania=parametry.sprawnosc_rozladowania,
        soc_min=parametry.soc_min,
        soc_max=parametry.soc_max,
        soc_poczatkowy=parametry.soc_poczatkowy,
        p_rezerwa_pu=rezerwa_pu,
        s_n_przeksztaltnika_mva=przeksztaltnik.s_n_mva,
        s_bazowa_mva=s_bazowa_mva,
    )
    return zbuduj_magazyn(ident=ident, wezel=wezel, rdzen=rdzen, zasobnik=zasobnik)


def _zbuduj_turbine(
    parametry: ParametryTurbiny,
    *,
    ident: str,
    wezel: str,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> TurbinaWiatrowa:
    przeksztaltnik = parametry.przeksztaltnik
    crowbar = parametry.crowbar
    # TYP NAJPIERW, DOPIERO POTEM BLOKI. Typy 1/2 nie maja przeksztaltnika z
    # definicji, wiec pytanie o blok zadane wczesniej odpowiadaloby im odmowa
    # „brak bloku przeksztaltnika" zamiast wlasciwej „kontrakt nie niesie
    # schematu zastepczego maszyny". Ten sam warunek obowiazuje konstruktor
    # biblioteki — dlatego jest JEDNA funkcja, a nie kopia w kazdym z tych miejsc.
    sprawdz_typ_turbiny(parametry.rodzina)
    if przeksztaltnik is None:
        # Kontrakt ENM sam pilnuje, ze typ 3/4 niesie blok przeksztaltnika
        # (walidator `TurbinaWiatrowa`), wiec tu dochodzi sie tylko przy zmianie
        # kontraktu. Odmowa jest NAZWANA, bo alternatywa byloby zlozenie turbiny
        # z liczb, ktorych nikt nie podal.
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Turbina {parametry.rodzina!r} wymaga bloku przeksztaltnika — bez niego "
            "nie ma sprzezenia z siecia",
            urzadzenie=ident,
            typ=parametry.rodzina,
        )
    return zbuduj_turbine_wiatrowa(
        ident=ident,
        wezel=wezel,
        typ=parametry.rodzina,
        rdzen=_rdzen_przeksztaltnika_gfl(
            przeksztaltnik, s_bazowa_mva=s_bazowa_mva, f_bazowa_hz=f_bazowa_hz
        ),
        h_calkowite_s=parametry.h_calkowite_s,
        pitch_tempo_deg_s=parametry.pitch_tempo_deg_s,
        pitch_min_deg=parametry.pitch_min_deg,
        pitch_max_deg=parametry.pitch_max_deg,
        crowbar=(
            None
            if crowbar is None
            else NastawyCrowbar(
                prog_pradu_pu=crowbar.prog_pradu_pu,
                czas_zwloki_s=crowbar.czas_zwloki_s,
                czas_trwania_s=crowbar.czas_trwania_s,
            )
        ),
        okno_mocy=okno_tylko_oddawanie(moc_znamionowa_pu(przeksztaltnik.s_n_mva, s_bazowa_mva)),
        s_n_mva=przeksztaltnik.s_n_mva,
        s_bazowa_mva=s_bazowa_mva,
        f_bazowa_hz=f_bazowa_hz,
    )


def zbuduj_urzadzenie(
    parametry: ParametryZRodzina,
    *,
    ident: str,
    wezel: str,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
    punkt_pracy_wezla: PunktPracyUrzadzenia,
) -> Urzadzenie:
    """Zbuduj urzadzenie dynamiczne z bloku parametrow kontraktu ENM.

    To jest SZEW karty W6-3B: adapter wola wylacznie te funkcje. Rodzina spoza
    `RODZINY_OBSLUGIWANE` konczy sie nazwana odmowa — nigdy podmiana na inny
    model.

    Punkt pracy wezla jest uzyty OD RAZU do wyznaczenia stanu rownowagi: dzieki
    temu niespojnosc miedzy rozplywem a ograniczeniami urzadzenia jest widoczna z
    nazwa urzadzenia, zamiast wyplywac dopiero z bramki rownowagi calego ukladu
    jako jedna liczba residuum.
    """
    rodzina = parametry.rodzina
    urzadzenie: Urzadzenie
    if rodzina == "synchroniczna":
        urzadzenie = _zbuduj_maszyne(
            cast(ParametryMaszyny, parametry),
            ident=ident,
            wezel=wezel,
            s_bazowa_mva=s_bazowa_mva,
            f_bazowa_hz=f_bazowa_hz,
        )
    elif rodzina == "przeksztaltnikowa_gfl":
        gfl = cast(ParametryGFL, parametry)
        urzadzenie = PrzeksztaltnikGFL(
            ident=ident,
            wezel=wezel,
            rdzen=_rdzen_przeksztaltnika_gfl(
                gfl, s_bazowa_mva=s_bazowa_mva, f_bazowa_hz=f_bazowa_hz
            ),
            okno_mocy=okno_tylko_oddawanie(moc_znamionowa_pu(gfl.s_n_mva, s_bazowa_mva)),
        )
    elif rodzina == "przeksztaltnikowa_gfm":
        gfm = cast(ParametryGFM, parametry)
        urzadzenie = PrzeksztaltnikGFM(
            ident=ident,
            wezel=wezel,
            rdzen=_rdzen_przeksztaltnika_gfm(
                gfm, s_bazowa_mva=s_bazowa_mva, f_bazowa_hz=f_bazowa_hz
            ),
            okno_mocy=okno_symetryczne(moc_znamionowa_pu(gfm.s_n_mva, s_bazowa_mva)),
        )
    elif rodzina == "magazyn":
        urzadzenie = _zbuduj_magazyn(
            cast(ParametryMagazynu, parametry),
            ident=ident,
            wezel=wezel,
            s_bazowa_mva=s_bazowa_mva,
            f_bazowa_hz=f_bazowa_hz,
        )
    elif rodzina in TYPY_ZLOZALNE or rodzina in RODZINY_BEZ_MODELU:
        urzadzenie = _zbuduj_turbine(
            cast(ParametryTurbiny, parametry),
            ident=ident,
            wezel=wezel,
            s_bazowa_mva=s_bazowa_mva,
            f_bazowa_hz=f_bazowa_hz,
        )
    else:
        raise OdmowaDynamiki(
            KOD_RODZINA_NIEOBSLUGIWANA,
            f"Urzadzenie {ident!r} deklaruje rodzine parametrow dynamicznych "
            f"{rodzina!r}, dla ktorej biblioteka nie ma modelu. Rodziny obslugiwane: "
            f"{RODZINY_OBSLUGIWANE}",
            urzadzenie=ident,
            rodzina=rodzina,
            obslugiwane=RODZINY_OBSLUGIWANE,
        )
    urzadzenie.stan_poczatkowy(punkt_pracy_wezla.napiecie_pu, punkt_pracy_wezla.moc_pu)
    return urzadzenie


def moc_znamionowa_rodziny_pu(parametry: ParametryZRodzina, s_bazowa_mva: float) -> float:
    """Moc znamionowa urzadzenia w pu bazy ukladu — dla rodzin, ktore ja niosa.

    Maszyna synchroniczna i przeksztaltniki maja `s_n_mva` wprost; magazyn i
    turbina dziedzicza ja po swoim przeksztaltniku (kontrakt ENM wprost: baza
    mocy magazynu to `przeksztaltnik.s_n_mva`). Rodzina bez mocy znamionowej
    (turbina typu 1/2) konczy sie ta sama odmowa, co przy budowie.
    """
    rodzina = parametry.rodzina
    if rodzina in ("synchroniczna", "przeksztaltnikowa_gfl", "przeksztaltnikowa_gfm"):
        return moc_znamionowa_pu(cast(ParametryGFL, parametry).s_n_mva, s_bazowa_mva)
    if rodzina == "magazyn":
        return moc_znamionowa_pu(
            cast(ParametryMagazynu, parametry).przeksztaltnik.s_n_mva, s_bazowa_mva
        )
    if rodzina in TYPY_ZLOZALNE:
        przeksztaltnik = cast(ParametryTurbiny, parametry).przeksztaltnik
        if przeksztaltnik is not None:
            return moc_znamionowa_pu(przeksztaltnik.s_n_mva, s_bazowa_mva)
    raise OdmowaDynamiki(
        KOD_RODZINA_NIEOBSLUGIWANA,
        f"Rodzina {rodzina!r} nie niesie mocy znamionowej w kontrakcie. "
        f"Rodziny obslugiwane: {RODZINY_OBSLUGIWANE}",
        rodzina=rodzina,
        obslugiwane=RODZINY_OBSLUGIWANE,
    )


#: Tryb maszyny wirtualnej — reeksport dla warstwy wyzszej, ktora buduje
#: scenariusze porownawcze (statyzm vs bezwladnosc wirtualna) bez siegania do
#: modulu przeksztaltnika.
TRYB_GFM_MASZYNA_WIRTUALNA = TRYB_MASZYNA_WIRTUALNA


__all__ = [
    "INWENTARZ_POL",
    "RODZINY_BEZ_MODELU",
    "RODZINY_OBSLUGIWANE",
    "TRYB_GFM_MASZYNA_WIRTUALNA",
    "ParametryZRodzina",
    "PolaRodziny",
    "PunktPracyUrzadzenia",
    "moc_znamionowa_rodziny_pu",
    "zbuduj_urzadzenie",
]
