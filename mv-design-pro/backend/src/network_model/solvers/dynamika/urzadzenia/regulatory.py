"""Bloki regulacji maszyny synchronicznej: AVR, regulator obrotow, stabilizator.

ZAKRES JEST WYZNACZONY PRZEZ KONTRAKT, NIE PRZEZ NAZWE MODELU. Kontrakt ENM
(`enm/dynamika_modele.py`) niesie dla wzbudnicy DOKLADNIE piec liczb (Ka, Ta,
Tb, Tc, Efd_min, Efd_max), dla regulatora obrotow szesc (R, T1, T2, T3, P_max,
P_min), dla stabilizatora dziewiec (Ks, Tw, T1..T4, limity). Te zestawy
parametryzuja konkretne struktury i tylko je:

* **AVR — wyprzedzenie/opoznienie + czlon inercyjny z ogranicznikiem
  nienawrotnym.** To jest DOKLADNIE model `SEXS` (PSS/E) i DOKLADNIE zredukowany
  `IEEE ST1A` (IEEE 421.5) przy `Kf = 0`, `Kc = 0` i bez ograniczników
  wzbudzenia — czyli statyczny uklad wzbudzenia bez sprzezenia stabilizujacego.
  `IEEE AC1A` ma wzbudnice WIRUJACA (`Te`, `Ke`, `Se(Ve)`), sprzezenie
  `Kf/(1+sTf)` i regulacje prostownika `Kc` — ani jednego z tych parametrow
  kontrakt nie niesie, wiec model o tej nazwie NIE DA SIE zlozyc. Podstawienie
  pod nazwe `AC1A` struktury `SEXS` byloby fabrykacja (etykieta obiecuje inna
  fizyke niz liczy kod), dlatego konczy sie odmowa
  `dynamika.wariant_regulatora_bez_parametrow`.
* **Regulator obrotow — statyzm + ogranicznik + inercja + wyprzedzenie.** To jest
  DOKLADNIE `TGOV1`. `HYGOV` jest regulatorem turbiny WODNEJ: ma serwomotor
  kierownicy (`Tg`, `Tr`, `Tf`, `velm`), czas rozruchu wody `Tw`, wzmocnienie
  turbiny `At`, przeplyw jalowy `q_nl` i tlumienie `Dturb`. Kontrakt nie niesie
  ani jednego z nich; uderzenie hydrauliczne (odwrotna odpowiedz poczatkowa)
  jest cala istota tego modelu i nie da sie go udac trzema stalymi czasowymi.
  Stad odmowa, nie „analogicznie jak TGOV1".
* **Stabilizator — filtr wash-out, wzmocnienie, dwa czlony wyprzedzajace,
  ogranicznik.** To jest `PSS1A` bez filtru pasmowo-zaporowego (`A1`, `A2`),
  ktorego kontrakt nie niesie; brak filtru jest POMINIECIEM BLOKU (struktura
  ubozsza), a nie podmiana liczby — i jest tu nazwany, zeby nikt nie szukal go
  w kodzie.

TLUMIENIE TURBINY. `TGOV1` ma wspolczynnik `Dt` (tlumienie turbiny). Kontrakt go
nie niesie, wiec bloku NIE MA — jedynym tlumieniem mechanicznym jest `d_pu`
maszyny. To jest brak bloku, nie zerowa domyslka liczby: gdyby `Dt` istnialo w
kontrakcie i wynosilo zero, znaczyloby to to samo, ale decyzje podejmowalby
projektant, a nie ten modul.

OGRANICZNIK NIENAWROTNY (anti-windup). Ogranicznik na wyjsciu czlonu inercyjnego
zatrzymuje CALKOWANIE, gdy stan siedzi na granicy i pochodna wypychalaby go
dalej. Ogranicznik nawrotny (obciecie samej wartosci przy dalej rosnacym stanie)
dawalby opoznienie wyjscia z nasycenia rowne calce nadmiaru — to jest defekt
klasy „regulator nie schodzi z limitu", dlatego jest tu wykluczony z konstrukcji.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

from ..kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_WARIANT_BEZ_PARAMETROW,
    OdmowaDynamiki,
)
from .pochodne_kierunkowe import Dual, ogranicz

#: Warianty wzbudnicy, ktore kontrakt ENM parametryzuje w calosci.
WARIANTY_WZBUDZENIA_ZLOZALNE: tuple[str, ...] = ("SEXS", "IEEE_ST1A")
#: Warianty regulatora obrotow, ktore kontrakt ENM parametryzuje w calosci.
WARIANTY_TURBINY_ZLOZALNE: tuple[str, ...] = ("TGOV1",)
#: Warianty stabilizatora, ktore kontrakt ENM parametryzuje w calosci.
WARIANTY_STABILIZATORA_ZLOZALNE: tuple[str, ...] = ("PSS1A",)


def _sprawdz_wyprzedzenie(nazwa_bloku: str, t_wyprzedzenia_s: float, t_opoznienia_s: float) -> None:
    """Czlon wyprzedzajacy bez opozniajacego to rozniczkowanie idealne — odmowa.

    `(1 + sTc)/(1 + sTb)` przy `Tb = 0` i `Tc > 0` jest transmitancja niewlasciwa
    (stopien licznika wyzszy niz mianownika): nie ma realizacji stanowej i
    wzmacnia szum bez granicy. `Tb = Tc = 0` jest przejsciem tozsamosciowym i
    jest dozwolone.
    """
    if t_opoznienia_s <= 0.0 and t_wyprzedzenia_s > 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"{nazwa_bloku}: czlon wyprzedzajacy T={t_wyprzedzenia_s} s bez czlonu "
            "opozniajacego (T=0) jest rozniczkowaniem idealnym — transmitancja "
            "niewlasciwa nie ma realizacji stanowej",
            blok=nazwa_bloku,
            t_wyprzedzenia_s=t_wyprzedzenia_s,
            t_opoznienia_s=t_opoznienia_s,
        )


def wyjscie_wyprzedzenia(
    wejscie: Dual, stan: Dual | None, t_wyprzedzenia_s: float, t_opoznienia_s: float
) -> Dual:
    """Wyjscie czlonu `(1 + sTc)/(1 + sTb)` w realizacji `dx/dt = (u - x)/Tb`.

    `y = (Tc/Tb) u + (1 - Tc/Tb) x`. Przy `Tb = 0` blok nie ma stanu i jest
    przejsciem tozsamosciowym (`stan is None`).
    """
    if t_opoznienia_s <= 0.0 or stan is None:
        return wejscie
    udzial = t_wyprzedzenia_s / t_opoznienia_s
    return wejscie * udzial + stan * (1.0 - udzial)


def pochodna_opoznienia(wejscie: Dual, stan: Dual, t_opoznienia_s: float) -> Dual:
    """`dx/dt = (u - x)/T` — czlon inercyjny pierwszego rzedu."""
    return (wejscie - stan) / t_opoznienia_s


#: GDZIE JEST OGRANICZNIK NIENAWROTNY. Nie ma go w pochodnych — i to jest decyzja
#: mierzona, nie przeoczenie. Zerowanie pochodnej na granicy („anti-windup w
#: rownaniu") czyni funkcje NIECIAGLA, a metoda niejawna gubi wtedy rozwiazanie
#: rownania kroku: residuum stawalo w miejscu na 4,2e-02 niezaleznie od liczby
#: nawrotow i od skrocenia kroku do 2e-05 s (maszyna z AVR Ka=200, Ta=0,05 s,
#: zwarcie na zaciskach). Granica jest wiec ZADEKLAROWANA przez urzadzenie
#: (`Urzadzenie.granice_stanow`) i egzekwowana przez calkowanie jako ograniczenie
#: ALGEBRAICZNE `x = granica` ze zbiorem aktywnym. Efekt fizyczny jest ten sam
#: (stan nie wychodzi poza zakres i nie „odrabia" calki po zejsciu z limitu), a
#: rownanie kroku ma rozwiazanie i jest DOKLADNE — bez przestrzelenia rzedu
#: `dt/2 * f` (pomiar przed naprawa: Efd = 7,165 pu przy granicy 6,0 pu).
NIENAWROTNOSC_JEST_W_CALKOWANIU = True


# ---------------------------------------------------------------------------
# Regulator napiecia (AVR)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RegulatorNapieciaSEXS:
    """Wzbudnica statyczna: `(1+sTc)/(1+sTb)` -> `Ka/(1+sTa)` -> ogranicznik.

    Parametry sa w jednostkach NAPIECIOWYCH (pu napiecia wzbudzenia odniesionego
    do napiecia znamionowego stojana), wiec NIE przeliczaja sie przy zmianie bazy
    mocy — inaczej niz stale bezwladnosci i reaktancje.
    """

    wariant: str
    ka: float
    ta_s: float
    tb_s: float
    tc_s: float
    efd_min_pu: float
    efd_max_pu: float

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Komplet parametrow do odcisku migawki — jawnie, pole po polu."""
        return {
            "wariant": self.wariant,
            "ka": self.ka,
            "ta_s": self.ta_s,
            "tb_s": self.tb_s,
            "tc_s": self.tc_s,
            "efd_min_pu": self.efd_min_pu,
            "efd_max_pu": self.efd_max_pu,
        }

    @property
    def ma_wyprzedzenie(self) -> bool:
        return self.tb_s > 0.0

    def pochodna_wyprzedzenia(self, wejscie: Dual, stan: Dual) -> Dual:
        return pochodna_opoznienia(wejscie, stan, self.tb_s)

    def pochodna_wzbudzenia(self, wejscie: Dual, stan_wyprzedzenia: Dual | None, efd: Dual) -> Dual:
        """`dEfd/dt = (Ka*y - Efd)/Ta` — BEZ ogranicznika (patrz staly modulu)."""
        wyjscie = wyjscie_wyprzedzenia(wejscie, stan_wyprzedzenia, self.tc_s, self.tb_s)
        return (wyjscie * self.ka - efd) / self.ta_s

    def odniesienie_rownowagi(self, napiecie_zaciskow_pu: float, efd_pu: float) -> float:
        """`Vref` zgodne z rownowaga: `Efd = Ka (Vref - Vt)` przy `Vs = 0`."""
        return napiecie_zaciskow_pu + efd_pu / self.ka


def zbuduj_regulator_napiecia(
    *,
    wariant: str,
    ka: float,
    ta_s: float,
    tb_s: float,
    tc_s: float,
    efd_min_pu: float,
    efd_max_pu: float,
) -> RegulatorNapieciaSEXS:
    """Zbuduj wzbudnice albo odmow, gdy kontrakt nie parametryzuje wariantu."""
    if wariant not in WARIANTY_WZBUDZENIA_ZLOZALNE:
        raise OdmowaDynamiki(
            KOD_WARIANT_BEZ_PARAMETROW,
            f"Wzbudnica {wariant!r} wymaga parametrow, ktorych kontrakt nie niesie "
            "(wzbudnica wirujaca: Te, Ke, Se(Ve); sprzezenie stabilizujace: Kf, Tf; "
            f"regulacja prostownika: Kc). Zlozalne warianty: {WARIANTY_WZBUDZENIA_ZLOZALNE}",
            wariant=wariant,
            zlozalne=WARIANTY_WZBUDZENIA_ZLOZALNE,
        )
    _sprawdz_wyprzedzenie(f"RegulatorNapiecia[{wariant}]", tc_s, tb_s)
    return RegulatorNapieciaSEXS(
        wariant=wariant,
        ka=ka,
        ta_s=ta_s,
        tb_s=tb_s,
        tc_s=tc_s,
        efd_min_pu=efd_min_pu,
        efd_max_pu=efd_max_pu,
    )


# ---------------------------------------------------------------------------
# Regulator obrotow (GOV)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RegulatorObrotowTGOV1:
    """Regulator obrotow TGOV1: statyzm -> ogranicznik -> `1/(1+sT1)` -> `(1+sT2)/(1+sT3)`.

    `r_pu` (statyzm) i granice mocy sa w bazie MOCY, wiec przeliczaja sie przy
    zmianie bazy ukladu: granice jak moc (mnoznik `S_urz/S_uklad`), statyzm
    ODWROTNIE (wzmocnienie `1/R` jest moca na jednostke odchylki predkosci).
    """

    wariant: str
    r_pu: float
    t1_s: float
    t2_s: float
    t3_s: float
    p_min_pu: float
    p_max_pu: float

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Komplet parametrow do odcisku migawki — jawnie, pole po polu."""
        return {
            "wariant": self.wariant,
            "r_pu": self.r_pu,
            "t1_s": self.t1_s,
            "t2_s": self.t2_s,
            "t3_s": self.t3_s,
            "p_min_pu": self.p_min_pu,
            "p_max_pu": self.p_max_pu,
        }

    @property
    def ma_zawor(self) -> bool:
        return self.t1_s > 0.0

    @property
    def ma_wyprzedzenie(self) -> bool:
        return self.t3_s > 0.0

    def zadanie_ograniczone(self, odniesienie: Dual, odchylka_predkosci: Dual) -> Dual:
        """`clamp(Pref - dOmega/R, Pmin, Pmax)` — statyzm z ogranicznikiem mocy."""
        return ogranicz(odniesienie - odchylka_predkosci / self.r_pu, self.p_min_pu, self.p_max_pu)

    def pochodna_zaworu(self, zadanie: Dual, stan: Dual) -> Dual:
        return pochodna_opoznienia(zadanie, stan, self.t1_s)

    def pochodna_wyprzedzenia(self, wejscie: Dual, stan: Dual) -> Dual:
        return pochodna_opoznienia(wejscie, stan, self.t3_s)

    def moc_mechaniczna(self, wejscie: Dual, stan_wyprzedzenia: Dual | None) -> Dual:
        return wyjscie_wyprzedzenia(wejscie, stan_wyprzedzenia, self.t2_s, self.t3_s)


def zbuduj_regulator_obrotow(
    *,
    wariant: str,
    r_pu: float,
    t1_s: float,
    t2_s: float,
    t3_s: float,
    p_min_pu: float,
    p_max_pu: float,
) -> RegulatorObrotowTGOV1:
    """Zbuduj regulator obrotow albo odmow, gdy kontrakt nie parametryzuje wariantu."""
    if wariant not in WARIANTY_TURBINY_ZLOZALNE:
        raise OdmowaDynamiki(
            KOD_WARIANT_BEZ_PARAMETROW,
            f"Regulator obrotow {wariant!r} wymaga parametrow, ktorych kontrakt nie niesie "
            "(turbina wodna: czas rozruchu wody Tw, wzmocnienie At, przeplyw jalowy q_nl, "
            "serwomotor kierownicy Tg/Tr/Tf/velm, tlumienie Dturb). Zlozalne warianty: "
            f"{WARIANTY_TURBINY_ZLOZALNE}",
            wariant=wariant,
            zlozalne=WARIANTY_TURBINY_ZLOZALNE,
        )
    _sprawdz_wyprzedzenie(f"RegulatorObrotow[{wariant}]", t2_s, t3_s)
    return RegulatorObrotowTGOV1(
        wariant=wariant,
        r_pu=r_pu,
        t1_s=t1_s,
        t2_s=t2_s,
        t3_s=t3_s,
        p_min_pu=p_min_pu,
        p_max_pu=p_max_pu,
    )


# ---------------------------------------------------------------------------
# Stabilizator systemowy (PSS)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StabilizatorPSS1A:
    """PSS1A: wash-out `sTw/(1+sTw)` -> `Ks` -> dwa czlony wyprzedzajace -> ogranicznik.

    Wejsciem jest odchylka predkosci wirnika. Wzmocnienie i limity sa w
    jednostkach NAPIECIOWYCH wyjscia (pu wzbudzenia), wiec nie przeliczaja sie
    przy zmianie bazy mocy.
    """

    wariant: str
    ks: float
    tw_s: float
    t1_s: float
    t2_s: float
    t3_s: float
    t4_s: float
    limit_min_pu: float
    limit_max_pu: float

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Komplet parametrow do odcisku migawki — jawnie, pole po polu."""
        return {
            "wariant": self.wariant,
            "ks": self.ks,
            "tw_s": self.tw_s,
            "t1_s": self.t1_s,
            "t2_s": self.t2_s,
            "t3_s": self.t3_s,
            "t4_s": self.t4_s,
            "limit_min_pu": self.limit_min_pu,
            "limit_max_pu": self.limit_max_pu,
        }

    @property
    def ma_wyprzedzenie1(self) -> bool:
        return self.t2_s > 0.0

    @property
    def ma_wyprzedzenie2(self) -> bool:
        return self.t4_s > 0.0

    def pochodna_filtru(self, wejscie: Dual, stan: Dual) -> Dual:
        """Wash-out w realizacji `dx/dt = (u - x)/Tw`, wyjscie `u - x`."""
        return pochodna_opoznienia(wejscie, stan, self.tw_s)

    def wyjscie_filtru(self, wejscie: Dual, stan: Dual) -> Dual:
        return (wejscie - stan) * self.ks

    def pochodna_wyprzedzenia1(self, wejscie: Dual, stan: Dual) -> Dual:
        return pochodna_opoznienia(wejscie, stan, self.t2_s)

    def wyjscie_wyprzedzenia1(self, wejscie: Dual, stan: Dual | None) -> Dual:
        return wyjscie_wyprzedzenia(wejscie, stan, self.t1_s, self.t2_s)

    def pochodna_wyprzedzenia2(self, wejscie: Dual, stan: Dual) -> Dual:
        return pochodna_opoznienia(wejscie, stan, self.t4_s)

    def wyjscie_wyprzedzenia2(self, wejscie: Dual, stan: Dual | None) -> Dual:
        return wyjscie_wyprzedzenia(wejscie, stan, self.t3_s, self.t4_s)

    def sygnal(self, wyjscie_drugiego_czlonu: Dual) -> Dual:
        return ogranicz(wyjscie_drugiego_czlonu, self.limit_min_pu, self.limit_max_pu)


def zbuduj_stabilizator(
    *,
    wariant: str,
    ks: float,
    tw_s: float,
    t1_s: float,
    t2_s: float,
    t3_s: float,
    t4_s: float,
    limit_min_pu: float,
    limit_max_pu: float,
) -> StabilizatorPSS1A:
    """Zbuduj stabilizator albo odmow, gdy kontrakt nie parametryzuje wariantu."""
    if wariant not in WARIANTY_STABILIZATORA_ZLOZALNE:
        raise OdmowaDynamiki(
            KOD_WARIANT_BEZ_PARAMETROW,
            f"Stabilizator {wariant!r} nie jest zlozalny z pol kontraktu. "
            f"Zlozalne warianty: {WARIANTY_STABILIZATORA_ZLOZALNE}",
            wariant=wariant,
            zlozalne=WARIANTY_STABILIZATORA_ZLOZALNE,
        )
    _sprawdz_wyprzedzenie(f"Stabilizator[{wariant}] czlon 1", t1_s, t2_s)
    _sprawdz_wyprzedzenie(f"Stabilizator[{wariant}] czlon 2", t3_s, t4_s)
    return StabilizatorPSS1A(
        wariant=wariant,
        ks=ks,
        tw_s=tw_s,
        t1_s=t1_s,
        t2_s=t2_s,
        t3_s=t3_s,
        t4_s=t4_s,
        limit_min_pu=limit_min_pu,
        limit_max_pu=limit_max_pu,
    )


__all__ = [
    "WARIANTY_STABILIZATORA_ZLOZALNE",
    "WARIANTY_TURBINY_ZLOZALNE",
    "WARIANTY_WZBUDZENIA_ZLOZALNE",
    "RegulatorNapieciaSEXS",
    "RegulatorObrotowTGOV1",
    "StabilizatorPSS1A",
    "pochodna_opoznienia",
    "NIENAWROTNOSC_JEST_W_CALKOWANIU",
    "wyjscie_wyprzedzenia",
    "zbuduj_regulator_napiecia",
    "zbuduj_regulator_obrotow",
    "zbuduj_stabilizator",
]
