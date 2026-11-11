"""Uziemienie punktu neutralnego sekcji SN — JEDYNA prawda wyprowadzana z elementów fizycznych
modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, rozstrzygnięcie §0 pkt 1).

Sposób uziemienia punktu neutralnego galwanicznie połączonej sieci SN (sekcja szyn GPZ razem
z odpływami; dwie sekcje przy zamkniętym łączniku szyn są JEDNĄ siecią) wynika wyłącznie z:

* punktów neutralnych uzwojeń transformatorów, których zacisk leży w tej sieci i których
  model składowej zerowej (``enm.zero_sequence_transformer``, ten sam co w solverze) daje
  drogę prądu zerowego po tej stronie — w tym transformatora uziemiającego zespołu
  uziemiającego (karta ZU-JEDEN-NOSNIK: JEDYNY nośnik — transformator ZNyn11, którego
  ``hv_neutral`` niesie wyposażenie punktu neutralnego: dławik gaszący z rezystorem
  wymuszającym AWSC, rezystor uziemiający, oba równolegle; ENEA Zeszyt 1 §16, rysunki
  Z.13/Z.14/Z.15; ``enm.punkt_neutralny_zespolu``). Stan wyłącznika pola ZU wynika
  z topologii (zespół za otwartym łącznikiem nie leży w sieci), stan odłączników gałęzi
  punktu neutralnego — z rekordu transformatora, stan automatyki AWSC — z przypadku
  obliczeniowego (``stan_awsc``, Case Immutability Rule).

Czytelnicy (jedna funkcja, wiele miejsc): walidator (reguły zespołu i E-W5-01), mapowanie
składowej zerowej (klasyfikacja przyczyn braku wyniku; Z_0 zygzaka + 3·Z_N stampuje
model transformatora — jedna droga), dowód
przekładników napięciowych, ładunek DER, analizy V12.6, ``BayEarthFaultPath`` i SLD.

Fizyka Z_N (X_L = U_f/I_L, R = U_f/I_R, Z_a‖Z_b, Z_0,TU + 3·Z_N, I_C = √3·U·B_0) mieszka
w ``network_model/pochodne/punkt_neutralny.py`` — ten moduł tylko ją woła.

Brak parametru urządzenia nie blokuje obliczeń (zasada nr 4): wartość robocza z podstawą
(pozycja typowa katalogu §16, środek zakresu dławika, środek przedziału prądu AWSC), jakość
``ESTIMATED``, wpis ``dane_przyjete``, kompletność ``NIEPELNY``. Brak samego zespołu w sieci
nie jest daną do zaproponowania — sieć jest wtedy izolowana albo uziemiona przez uzwojenie
transformatora, a brak drogi prądu zerowego jest nazwaną przyczyną braku wyniku zerowego.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any, Literal

from network_model.catalog.wartosci_robocze import (
    ETYKIETA_B0,
    POLE_B0,
    dana_przyjeta_z0,
)
from network_model.core.uziemienie import (
    ETYKIETA_PL_WARIANTU_UZIEMIENIA,
    TRYBY_IEC60909,
    TYP_PUNKTU_NEUTRALNEGO_WARIANTU,
    StanAwsc,
    TrybDoziemienia,
    TypPunktuNeutralnego,
    WariantUziemieniaSekcji,
    tryb_doziemienia_wariantu,
)
from network_model.core.ybus import S_BASE_MVA
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import (
    impedancja_rownolegla_ohm,
    impedancja_z_napiecia_i_mocy_ohm,
    impedancja_zerowa_zespolu_ohm,
    prad_pojemnosciowy_doziemienia_a,
)
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from network_model.solvers.doziemienie_sn import (
    DaneDoziemienia,
    PunktNeutralnyDoziemienia,
    WynikDoziemienia,
    oblicz_doziemienie,
)
from werdykt.kontrakt import DanaPrzyjeta

from .bateria_kondensatorow import admitancja_zerowa_baterii_s
from .models import (
    Cable,
    EnergyNetworkModel,
    GroundingConfig,
    OverheadLine,
    ShuntCapacitor,
    Transformer,
)
from .nazwy_elementow import nazwa_elementu
from .punkt_neutralny_zespolu import (
    PROG_REZONANSU,
    GalazPunktuNeutralnego,
    ParametrPunktuNeutralnego,
    RezystorPunktuNeutralnego,
    _dana_przyjeta_parametru,
    _rezystor_uzwojenia,
    _zespolona,
    jest_transformatorem_uziemiajacym,
    parametry_z0_zygzaka,
    wyposazenie_zespolu,
)
from .skladowa_zerowa_galezi import napiecia_szyn_kv, skladowa_zerowa_galezi
from .topology import derive
from .uziemienie import uziemienie_grounded
from .zero_sequence_transformer import ZeroSeqConnection, build_transformer_zero_seq_model

RodzajPunktu = Literal["zespol_uziemiajacy", "uzwojenie_transformatora"]

#: Przyczyny braku wyniku składowej zerowej — trzy nazwane (wiersz §C SKLADOWA-ZEROWA).
#: ``brak_drogi`` — fizycznie brak drogi prądu zerowego do ziemi (status NIE_DOTYCZY: zwarcie
#: doziemne nie płynie; doziemienie ocenia analiza doziemień); ``poza_zakresem_iec60909`` —
#: sieć izolowana albo skompensowana (droga wyłącznie przez pojemności doziemne i/lub
#: dławik — IEC 60909-0 liczy zwarcia w sieciach uziemionych przez małą impedancję;
#: założenie jawne, tekstu normy brak w repo); ``brak_danych`` — węzeł odcięty od uziemienia
#: brakiem danych składowej zerowej gałęzi (R′0/X′0), którą model ma, albo leżący w sieci
#: zerowej źródła 110 kV / nN bez impedancji zerowej (Z0 sieci zasilającej nieznane).
PrzyczynaBrakuZerowej = Literal["brak_drogi", "poza_zakresem_iec60909", "brak_danych"]

#: Status maszynowy przyczyny (kontrakt werdyktu — wyłącznie z wyjaśnieniem).
STATUS_PRZYCZYNY_BRAKU_ZEROWEJ: Mapping[str, str] = {
    "brak_drogi": "NIE_DOTYCZY",
    "poza_zakresem_iec60909": "NIE_DOTYCZY",
    "brak_danych": "BRAK_PODSTAWY",
}

#: Kody przyczyn braku wyniku zerowego (rodzina ``fault.zero_sequence_*``).
KOD_PRZYCZYNY_BRAKU_ZEROWEJ: Mapping[str, str] = {
    "brak_drogi": "fault.zero_sequence_no_path",
    "poza_zakresem_iec60909": "fault.zero_sequence_outside_iec60909",
    "brak_danych": "fault.zero_sequence_missing_data",
}


def impedancja_zerowa_zrodla_dozwolona(napiecie_kv: float) -> bool:
    """Czy źródło na szynie o napięciu ``napiecie_kv`` może nieść impedancję zerową (Z0).

    JEDEN predykat dla walidatora (E-W5-01) i mapowania składowej zerowej (karta
    UX-04/POLE-ZU-SKLADOWA-ZEROWA, §0 pkt 3): uziemienie punktu neutralnego sieci SN opisuje
    wyłącznie zespół uziemiający albo punkt neutralny uzwojenia transformatora — źródło
    w paśmie SN nie. Źródło WN (sieć 110 kV z jej punktem neutralnym) i nN — tak. Napięcie
    nieznane nie leży w żadnym paśmie (``pasmo_napieciowe`` → None) — dozwolone, bo brak
    napięcia zgłasza osobna reguła, a odmowa tutaj ukryłaby tamten brak.
    """
    return pasmo_napieciowe(napiecie_kv) != "SN"


@dataclass(frozen=True)
class PunktUziemienia:
    """Punkt uziemienia sieci SN: zespół uziemiający albo punkt neutralny uzwojenia TR."""

    rodzaj: RodzajPunktu
    element_ref: str
    bus_ref: str
    nazwa_pl: str
    galezie: tuple[GalazPunktuNeutralnego, ...] = ()
    #: Impedancja zerowa transformatora uziemiającego Z_0,TU [Ω/fazę]; ``None`` dla uzwojenia
    #: transformatora (jego składową zerową stampuje model transformatora w mapowaniu).
    z0_tu_ohm: complex | None = None
    #: Typ uziemienia punktu neutralnego uzwojenia transformatora (tylko ``uzwojenie_…``).
    typ_uzwojenia: TypPunktuNeutralnego | None = None
    parametry: tuple[ParametrPunktuNeutralnego, ...] = ()
    #: Parametry Z_0,TU transformatora uziemiającego (R0, X0) — część ``parametry``.
    parametry_tu: tuple[ParametrPunktuNeutralnego, ...] = ()
    #: Odmowa nazwana (brak elementu w punkcie neutralnym, sprzeczna deklaracja).
    odmowa_pl: str | None = None
    #: Zespół ma rezystor wymuszający AWSC (Z.13).
    ma_awsc: bool = False
    #: Dławik z regulacją płynną (regulacja nadążna, §16) — ``None`` gdy brak dławika.
    regulacja_ciagla: bool | None = None
    #: Rezystor punktu neutralnego (gałąź rezystora zespołu albo rezystor uzwojenia TR
    #: uziemionego przez rezystor) — ``None`` bez rezystora.
    rezystor: RezystorPunktuNeutralnego | None = None
    #: Punkt neutralny uzwojenia transformatora: Z_N z konfiguracji uzwojenia [Ω] (0 —
    #: bezpośrednio) i impedancja zerowa transformatora Z_T0 [Ω] na napięciu sieci — te same
    #: wielkości, z których mapowanie stampuje bocznik Z_T0 + 3·Z_N
    #: (``build_transformer_zero_seq_model``); ``droga_szeregowa`` — obie gwiazdy uziemione
    #: (YNyn), droga prądu zerowego biegnie dalej przez sieć drugiej strony.
    z_n_uzwojenia_ohm: complex | None = None
    z0_uzwojenia_ohm: complex | None = None
    droga_szeregowa: bool = False
    #: Sposób uziemienia zadeklarowany konfiguracją (``GroundingConfig``) — zespół zawsze;
    #: uzwojenie wyłącznie z litery grupy (bez konfiguracji) — ``False`` (bloker E-W5-04).
    jawny: bool = True

    def rezystor_w_ruchu(self, stan_awsc: StanAwsc) -> RezystorPunktuNeutralnego | None:
        """Rezystor punktu, gdy przewodzi w stanie ``stan_awsc`` (odłącznik gałęzi zamknięty)."""
        if self.rezystor is None or self.odmowa_pl is not None:
            return None
        if self.rodzaj == "uzwojenie_transformatora":
            return self.rezystor
        if any(g.rodzaj == "rezystor" for g in self.galezie_w_ruchu(stan_awsc)):
            return self.rezystor
        return None

    def galezie_w_ruchu(self, stan_awsc: StanAwsc) -> tuple[GalazPunktuNeutralnego, ...]:
        return tuple(g for g in self.galezie if g.w_ruchu(stan_awsc))

    def wariant(self, stan_awsc: StanAwsc = "spoczynek") -> WariantUziemieniaSekcji:
        """Wariant punktu w danym stanie AWSC (po stanach odłączników)."""
        if self.odmowa_pl is not None:
            return "izolowany"
        if self.rodzaj == "uzwojenie_transformatora":
            return _WARIANT_TYPU_UZWOJENIA[self.typ_uzwojenia or "directly_grounded"]
        rodzaje = {g.rodzaj for g in self.galezie_w_ruchu(stan_awsc)}
        if "bezposrednie" in rodzaje:
            return "bezposrednie"
        if "dlawik" in rodzaje and "rezystor" in rodzaje:
            return "dlawik_rezystor"
        if "dlawik" in rodzaje:
            return "dlawik_awsc" if self.ma_awsc else "dlawik"
        if "rezystor" in rodzaje:
            return "rezystor"
        return "izolowany"

    def z_n_ohm(self, stan_awsc: StanAwsc) -> complex | None:
        """Z_N punktu neutralnego zespołu [Ω] (gałęzie w ruchu równolegle); ``None`` = brak
        drogi (wszystkie gałęzie odłączone, odmowa) albo punkt uzwojenia TR."""
        if self.rodzaj != "zespol_uziemiajacy" or self.odmowa_pl is not None:
            return None
        galezie = self.galezie_w_ruchu(stan_awsc)
        if not galezie:
            return None
        if any(g.rodzaj == "bezposrednie" for g in galezie):
            return complex(0.0, 0.0)
        wynik = galezie[0].z_ohm
        for galaz in galezie[1:]:
            wynik = impedancja_rownolegla_ohm(wynik, galaz.z_ohm)
        return wynik

    def z0_bocznika_ohm(self, stan_awsc: StanAwsc) -> complex | None:
        """Bocznik składowej zerowej zespołu Z_0 = Z_0,TU + 3·Z_N [Ω] albo ``None``."""
        z_n = self.z_n_ohm(stan_awsc)
        if z_n is None or self.z0_tu_ohm is None:
            return None
        return impedancja_zerowa_zespolu_ohm(self.z0_tu_ohm, z_n)

    def tryb_doziemienia(self, stan_awsc: StanAwsc) -> TrybDoziemienia:
        """Tryb doziemienia punktu (``network_model.core.uziemienie`` — jedno odwzorowanie)."""
        return tryb_doziemienia_wariantu(self.wariant(stan_awsc))

    def bocznik_rezystancyjny(self, stan_awsc: StanAwsc) -> bool:
        """Bocznik uziemia sieć przez małą impedancję w zakresie IEC 60909 (rezystor, Z.14,
        wprost). Dławik — także z rezystorem wymuszającym AWSC w stanie załączonym (Z.13) —
        nie: sieć skompensowana, prąd doziemny to prąd resztkowy, nie zwarciowy. Ten sam
        predykat ``TRYBY_IEC60909`` co tryb doziemienia sieci."""
        return self.tryb_doziemienia(stan_awsc) in TRYBY_IEC60909

    def impedancje_doziemienia(self, stan_awsc: StanAwsc) -> tuple[complex, complex | None] | None:
        """(Z_N, Z_0 w szeregu) punktu w ruchu do prądu doziemienia ``doziemienie_sn``:
        zespół — Z_N gałęzi w ruchu i Z_0,TU; uzwojenie — Z_N konfiguracji i Z_T0. ``None`` —
        punkt bez drogi (odmowa, gałęzie odłączone, uzwojenie izolowane)."""
        if self.odmowa_pl is not None:
            return None
        if self.rodzaj == "uzwojenie_transformatora":
            if self.z_n_uzwojenia_ohm is None:
                return None
            return self.z_n_uzwojenia_ohm, self.z0_uzwojenia_ohm
        z_n = self.z_n_ohm(stan_awsc)
        if z_n is None:
            return None
        return z_n, self.z0_tu_ohm

    def dane_przyjete(self) -> tuple[DanaPrzyjeta, ...]:
        """Wszystkie parametry robocze urządzeń punktu (kompletność danych zespołu)."""
        return tuple(
            _dana_przyjeta_parametru(p, self.nazwa_pl) for p in self.parametry if p.roboczy
        )

    def dane_przyjete_bocznika(self, stan_awsc: StanAwsc) -> tuple[DanaPrzyjeta, ...]:
        """Dane przyjęte, które WCHODZĄ do bocznika składowej zerowej w stanie ``stan_awsc``:
        Z_0,TU oraz parametry gałęzi w ruchu (``parametry_z``) — wynik zwarcia doziemnego
        nie niesie założenia parametru, który go nie kształtuje (np. prąd AWSC w spoczynku,
        zakres dławika przy nastawie projektanta). Bez bocznika (odmowa, gałęzie odłączone,
        uzwojenie TR) — pusto."""
        if self.z0_bocznika_ohm(stan_awsc) is None:
            return ()
        parametry = [*self.parametry_tu] + [
            p for g in self.galezie_w_ruchu(stan_awsc) for p in g.parametry_z
        ]
        return tuple(_dana_przyjeta_parametru(p, self.nazwa_pl) for p in parametry if p.roboczy)

    def to_dict(self, stan_awsc: StanAwsc = "spoczynek") -> dict[str, Any]:
        return {
            "rodzaj": self.rodzaj,
            "element_ref": self.element_ref,
            "bus_ref": self.bus_ref,
            "nazwa_pl": self.nazwa_pl,
            "wariant": self.wariant(stan_awsc),
            "z0_tu_ohm": _zespolona(self.z0_tu_ohm),
            "z_n_spoczynek_ohm": _zespolona(self.z_n_ohm("spoczynek")),
            "z_n_awsc_zalaczony_ohm": _zespolona(self.z_n_ohm("zalaczony")),
            "typ_uzwojenia": self.typ_uzwojenia,
            "galezie": [g.to_dict() for g in self.galezie],
            "parametry": [p.to_dict() for p in self.parametry],
            "odmowa_pl": self.odmowa_pl,
        }


_WARIANT_TYPU_UZWOJENIA: Mapping[str, WariantUziemieniaSekcji] = {
    "directly_grounded": "bezposrednie",
    "resistor_grounded": "rezystor",
    "petersen_coil": "dlawik",
    "isolated": "izolowany",
}


@dataclass(frozen=True)
class UziemienieSekcji:
    """Uziemienie punktu neutralnego galwanicznie połączonej sieci SN."""

    szyny: tuple[str, ...]
    napiecie_kv: float
    punkty: tuple[PunktUziemienia, ...]
    #: Σ B_0 linii i kabli w ruchu (B′0 z modelu albo z wartości roboczej odcinka SN — jedno
    #: źródło ``enm.skladowa_zerowa_galezi``) i baterii kondensatorów w gwieździe uziemionej
    #: tej sieci [S]; gałęzie bez podstawy B′0 (B′1 nieznane) wymienione obok.
    b0_s: float
    #: Odcinki bez podstawy B′0: (ref, nazwa) — JEDNO źródło dla danych API (identyfikatory)
    #: i zdania dla projektanta (nazwy); dwie listy rozjechałyby się na danych brzegowych.
    galezie_bez_b0: tuple[tuple[str, str], ...]
    ostrzezenia: tuple[str, ...] = field(default=())
    #: Baterie kondensatorów załączone na szynach tej sieci z drogą zerową (gwiazda uziemiona,
    #: Y0 = Y1) i ich B_0 [S] — składnik ``b0_s`` (karta UX-04/POLE-BKR-MODEL; przynależność
    #: do sieci tym samym predykatem co gałęzie: szyna baterii w składowej galwanicznej).
    baterie_b0: tuple[tuple[str, float], ...] = field(default=())
    #: Odcinki tej sieci, których B′0 jest wartością roboczą (zasada nr 4): (ref, nazwa,
    #: B′0 [S/km], założenie) — dana przyjęta ``ESTIMATED`` każdego wyniku opartego na I_C.
    galezie_b0_robocze: tuple[tuple[str, str, float, str], ...] = field(default=())

    @property
    def punkty_w_ruchu(self) -> tuple[PunktUziemienia, ...]:
        return tuple(p for p in self.punkty if p.odmowa_pl is None)

    @property
    def odmowy(self) -> tuple[str, ...]:
        return tuple(p.odmowa_pl for p in self.punkty if p.odmowa_pl is not None)

    def wariant(self, stan_awsc: StanAwsc = "spoczynek") -> WariantUziemieniaSekcji:
        warianty = {p.wariant(stan_awsc) for p in self.punkty_w_ruchu} - {"izolowany"}
        if not warianty:
            return "izolowany"
        if "bezposrednie" in warianty:
            return "bezposrednie"
        z_dlawikiem = warianty & {"dlawik", "dlawik_awsc", "dlawik_rezystor"}
        z_rezystorem = warianty & {"rezystor", "dlawik_rezystor"}
        if z_dlawikiem and z_rezystorem:
            return "dlawik_rezystor"
        if z_rezystorem:
            return "rezystor"
        return "dlawik_awsc" if "dlawik_awsc" in warianty else "dlawik"

    def typ_punktu_neutralnego(self, stan_awsc: StanAwsc = "spoczynek") -> TypPunktuNeutralnego:
        return TYP_PUNKTU_NEUTRALNEGO_WARIANTU[self.wariant(stan_awsc)]  # type: ignore[return-value]

    @property
    def prad_pojemnosciowy_a(self) -> float | None:
        """I_C = √3·U_n·B_0 [A]; ``None`` gdy żadna gałąź ani bateria nie wnosi B_0 albo gdy
        choć jeden odcinek sieci nie ma podstawy B′0 — suma bez niego zaniżałaby I_C (wynik
        częściowy nie jest wynikiem; ``galezie_bez_b0`` nazywa odcinki)."""
        if self.b0_s <= 0.0 or self.galezie_bez_b0:
            return None
        return prad_pojemnosciowy_doziemienia_a(self.napiecie_kv, self.b0_s)

    def dane_przyjete_pojemnosci(self) -> tuple[DanaPrzyjeta, ...]:
        """Dane przyjęte ``ESTIMATED`` B′0 odcinków z wartości roboczej — jedna na (założenie,
        wartość) z listą odcinków (rozmiar rośnie z liczbą TYPÓW odcinków, nie ich liczbą)."""
        grupy: dict[tuple[str, float], list[str]] = {}
        for _, nazwa, b0, zalozenie in self.galezie_b0_robocze:
            grupy.setdefault((zalozenie, b0), []).append(nazwa)
        return tuple(
            dana_przyjeta_z0(
                pole=POLE_B0,
                etykieta=ETYKIETA_B0,
                zalozenie=zalozenie,
                wartosc=b0,
                miejsce_pl=", ".join(sorted(nazwy)),
            )
            for (zalozenie, b0), nazwy in sorted(grupy.items())
        )

    def prad_dlawikow_a(self) -> float | None:
        """Σ I_L dławików w ruchu [A] (nastawa albo wartość robocza)."""
        prady = [
            g.prad_a
            for p in self.punkty_w_ruchu
            for g in p.galezie_w_ruchu("spoczynek")
            if g.rodzaj == "dlawik" and g.prad_a is not None
        ]
        return sum(prady) if prady else None

    def tryb_doziemienia(self, stan_awsc: StanAwsc = "spoczynek") -> TrybDoziemienia:
        """Tryb doziemienia sieci (``network_model.core.uziemienie`` — jedno odwzorowanie)."""
        return tryb_doziemienia_wariantu(self.wariant(stan_awsc))

    def dane_doziemienia(
        self,
        stan_awsc: StanAwsc = "spoczynek",
        *,
        z1_ohm: complex | None = None,
        z2_ohm: complex | None = None,
        z0_ohm: complex | None = None,
        ikss_iec_a: float | None = None,
        z_f_ohm: complex | None = None,
    ) -> DaneDoziemienia:
        """Wejście solvera doziemienia tej sieci w stanie AWSC ``stan_awsc``: B_0 sieci (ten
        sam co ``prad_pojemnosciowy_a``; odcinki bez podstawy B′0 — ``None`` z nazwą) i punkty
        neutralne w ruchu (Z_N, Z_0 w szeregu); impedancje składowych i Ik1 punktu zwarcia —
        z rdzenia IEC 60909 (tryby uziemione przez małą impedancję)."""
        brak_b0 = (
            "odcinki sieci bez susceptancji zerowej i bez podstawy wartości roboczej "
            "(susceptancja zgodna nieznana): "
            + ", ".join(nazwa_pl for _, nazwa_pl in self.galezie_bez_b0)
            if self.galezie_bez_b0
            else None
        )
        punkty: list[PunktNeutralnyDoziemienia] = []
        for punkt in self.punkty_w_ruchu:
            impedancje = punkt.impedancje_doziemienia(stan_awsc)
            if impedancje is None:
                continue
            punkty.append(
                PunktNeutralnyDoziemienia(
                    nazwa_pl=punkt.nazwa_pl, z_n_ohm=impedancje[0], z0_tu_ohm=impedancje[1]
                )
            )
        return DaneDoziemienia(
            tryb=self.tryb_doziemienia(stan_awsc),
            napiecie_kv=self.napiecie_kv,
            b0_s=None if brak_b0 else self.b0_s,
            punkty=tuple(punkty),
            brak_b0_pl=brak_b0,
            dlawik_w_ruchu=any(
                g.rodzaj == "dlawik"
                for p in self.punkty_w_ruchu
                for g in p.galezie_w_ruchu(stan_awsc)
            )
            or any(
                p.rodzaj == "uzwojenie_transformatora" and p.typ_uzwojenia == "petersen_coil"
                for p in self.punkty_w_ruchu
            ),
            droga_szeregowa=any(p.droga_szeregowa for p in self.punkty_w_ruchu),
            z1_ohm=z1_ohm,
            z2_ohm=z2_ohm,
            z0_ohm=z0_ohm,
            ikss_iec_a=ikss_iec_a,
            z_f_ohm=z_f_ohm,
        )

    def doziemienie(self, stan_awsc: StanAwsc = "spoczynek") -> WynikDoziemienia:
        """Doziemienie metaliczne sieci bez impedancji składowych punktu zwarcia (prąd sieci
        izolowanej, skompensowanej i rezystorowej nie zależy od miejsca doziemienia)."""
        return oblicz_doziemienie(self.dane_doziemienia(stan_awsc))

    def dane_przyjete_doziemienia(
        self, stan_awsc: StanAwsc = "spoczynek"
    ) -> tuple[DanaPrzyjeta, ...]:
        """Dane przyjęte ESTIMATED, które kształtują prąd doziemienia w stanie ``stan_awsc``:
        B′0 odcinków z wartości roboczej (I_C) i parametry gałęzi punktów neutralnych w ruchu
        z Z_0,TU (te same, co bocznik składowej zerowej)."""
        return (
            *self.dane_przyjete_pojemnosci(),
            *(d for p in self.punkty_w_ruchu for d in p.dane_przyjete_bocznika(stan_awsc)),
        )

    @property
    def rozstrojenie(self) -> float | None:
        """v = (I_C − I_L)/I_C w stanie normalnym (AWSC w spoczynku) — z solvera doziemienia
        (I_L = −Im I_N: prąd dławików przy U0 = U_f z impedancją zerową transformatora
        uziemiającego); ``None`` bez dławika w ruchu albo bez I_C."""
        return self.doziemienie("spoczynek").rozstrojenie

    def rezystory_w_ruchu(
        self, stan_awsc: StanAwsc = "spoczynek"
    ) -> tuple[RezystorPunktuNeutralnego, ...]:
        """Rezystory punktów neutralnych sieci przewodzące w stanie ``stan_awsc``."""
        return tuple(
            r for p in self.punkty_w_ruchu if (r := p.rezystor_w_ruchu(stan_awsc)) is not None
        )

    @property
    def regulacja_nadazna(self) -> bool:
        """Każdy dławik w ruchu ma regulację płynną (praca nadążna §16)."""
        dlawiki = [p for p in self.punkty_w_ruchu if p.regulacja_ciagla is not None]
        return bool(dlawiki) and all(p.regulacja_ciagla for p in dlawiki)

    def dane_przyjete(self) -> tuple[DanaPrzyjeta, ...]:
        return tuple(d for p in self.punkty_w_ruchu for d in p.dane_przyjete())

    @property
    def kompletnosc(self) -> Literal["PELNY", "NIEPELNY"]:
        """Kompletność danych sieci: punkty uziemienia ORAZ pojemność doziemna (I_C liczone
        z B′0 roboczego nie jest potwierdzonym dowodem — kontrakt werdyktu §3)."""
        if self.dane_przyjete() or self.galezie_b0_robocze:
            return "NIEPELNY"
        return "PELNY"

    def opis_pl(self, stan_awsc: StanAwsc = "spoczynek") -> str:
        wariant = self.wariant(stan_awsc)
        etykieta = ETYKIETA_PL_WARIANTU_UZIEMIENIA[wariant]
        if not self.punkty_w_ruchu:
            return f"Punkt neutralny sieci {self.napiecie_kv:g} kV: {etykieta} (brak uziemienia)."
        punkty = "; ".join(
            f"{p.nazwa_pl}: {ETYKIETA_PL_WARIANTU_UZIEMIENIA[p.wariant(stan_awsc)]}"
            for p in self.punkty_w_ruchu
        )
        return f"Punkt neutralny sieci {self.napiecie_kv:g} kV: {etykieta} ({punkty})."

    @property
    def ma_awsc(self) -> bool:
        """Choć jeden punkt uziemienia w ruchu ma automatykę wymuszania składowej czynnej."""
        return any(p.ma_awsc for p in self.punkty_w_ruchu)

    def to_dict(self, stan_awsc: StanAwsc = "spoczynek") -> dict[str, Any]:
        return {
            "szyny": list(self.szyny),
            "napiecie_kv": self.napiecie_kv,
            "wariant": self.wariant(stan_awsc),
            "wariant_awsc_zalaczony": self.wariant("zalaczony"),
            "typ_punktu_neutralnego": self.typ_punktu_neutralnego(stan_awsc),
            "punkty": [p.to_dict(stan_awsc) for p in self.punkty],
            "b0_s": self.b0_s,
            "galezie_bez_b0": [ref for ref, _ in self.galezie_bez_b0],
            "baterie_b0": [{"ref": ref, "b0_s": b0} for ref, b0 in self.baterie_b0],
            "prad_pojemnosciowy_a": self.prad_pojemnosciowy_a,
            "dane_przyjete_pojemnosci": [
                d.model_dump(mode="json") for d in self.dane_przyjete_pojemnosci()
            ],
            "prad_dlawikow_a": self.prad_dlawikow_a(),
            "rozstrojenie": self.rozstrojenie,
            "tryb_doziemienia": self.tryb_doziemienia(stan_awsc),
            "doziemienie": self.doziemienie(stan_awsc).to_dict(),
            # Z.13: automatyka wymuszania składowej czynnej — doziemienie także po jej
            # załączeniu (sieć nadal skompensowana: rośnie składowa czynna I_w); bez AWSC None.
            "ma_awsc": self.ma_awsc,
            "doziemienie_awsc_zalaczony": (
                self.doziemienie("zalaczony").to_dict() if self.ma_awsc else None
            ),
            "ostrzezenia": list(self.ostrzezenia),
            "odmowy": list(self.odmowy),
            "kompletnosc": self.kompletnosc,
            "opis_pl": self.opis_pl(stan_awsc),
        }


def _punkt_zespolu(trafo: Transformer) -> PunktUziemienia:
    """Punkt uziemienia zespołu uziemiającego — transformatora uziemiającego z wyposażeniem
    punktu neutralnego (karta ZU-JEDEN-NOSNIK). Gałęzie, Z_N i Z_0,zyg z TYCH SAMYCH
    rozstrzygnięć co model składowej zerowej (``wyposazenie_zespolu``, ``parametry_z0_zygzaka``
    przy napięciu górnym transformatora) — bocznik prawdy o uziemieniu i stempel Y0 nie mogą
    się rozjechać."""
    wyposazenie = wyposazenie_zespolu(trafo)
    r0, x0 = parametry_z0_zygzaka(trafo, float(trafo.uhv_kv))
    z0_tu = complex(r0.wartosc, x0.wartosc)
    rezystor = wyposazenie.rezystor
    return PunktUziemienia(
        rodzaj="zespol_uziemiajacy",
        element_ref=trafo.ref_id,
        bus_ref=trafo.hv_bus_ref,
        nazwa_pl=wyposazenie.nazwa_pl,
        galezie=wyposazenie.galezie,
        z0_tu_ohm=z0_tu,
        parametry=(r0, x0, *wyposazenie.parametry),
        parametry_tu=(r0, x0),
        odmowa_pl=wyposazenie.odmowa_pl,
        ma_awsc=wyposazenie.ma_awsc,
        regulacja_ciagla=wyposazenie.regulacja_ciagla,
        rezystor=(
            None if rezystor is None else replace(rezystor, z0_tu_ohm=z0_tu, parametry_tu=(r0, x0))
        ),
        typ_uzwojenia=trafo.hv_neutral.type if trafo.hv_neutral is not None else None,
    )


def _punkty_uzwojen(
    transformatory: list[Transformer], szyny: frozenset[str], u_kv: float
) -> list[PunktUziemienia]:
    """Punkty neutralne uzwojeń transformatorów z drogą prądu zerowego po stronie tej sieci.

    Transformator uziemiający (zespół uziemiający) z zaciskiem górnym w tej sieci — punkt
    ``zespol_uziemiajacy`` z gałęziami wyposażenia (także z odmową nazwaną: brak elementu,
    sprzeczna deklaracja — sieć widzi wtedy zespół, którego sposób uziemienia jest nieokreślony).
    Pozostałe — ten sam model połączeń co solver (``build_transformer_zero_seq_model``): bocznik
    po stronie leżącej w sieci albo połączenie szeregowe (obie gwiazdy uziemione — droga do ziemi
    przez sieć drugiej strony). Transformator, którego modelu nie da się zbudować, zgłaszają
    jego kody (E-W5-02/03) — tu nie jest punktem uziemienia.
    """
    wynik: list[PunktUziemienia] = []
    for trafo in sorted(transformatory, key=lambda t: t.ref_id):
        if jest_transformatorem_uziemiajacym(trafo):
            if trafo.hv_bus_ref in szyny:
                wynik.append(_punkt_zespolu(trafo))
            continue
        strony = [
            s for s, szyna in (("HV", trafo.hv_bus_ref), ("LV", trafo.lv_bus_ref)) if szyna in szyny
        ]
        if not strony:
            continue
        try:
            model = build_transformer_zero_seq_model(trafo)
        except (OdmowaDanychError, ValueError):
            continue
        for strona in strony:
            droga = model.connection == ZeroSeqConnection.SERIES_THROUGH or (
                model.connection
                == (
                    ZeroSeqConnection.HV_SHUNT_GROUND
                    if strona == "HV"
                    else ZeroSeqConnection.LV_SHUNT_GROUND
                )
            )
            if not droga:
                continue
            cfg = trafo.hv_neutral if strona == "HV" else trafo.lv_neutral
            typ = (cfg or GroundingConfig(type="directly_grounded")).type
            nazwa = (
                f"{nazwa_elementu(trafo, 'transformers')}, uzwojenie "
                f"{'górne' if strona == 'HV' else 'dolne'}"
            )
            # Z_T0 [Ω] na napięciu sieci — ta sama baza co stempel bocznika w mapowaniu
            # (Y0 = Z_base(U_n szyny)/Z0: z0_pu na S_base przeliczone bazą szyny).
            assert model.z_t0_pu is not None
            z0_uzwojenia = model.z_t0_pu * impedancja_z_napiecia_i_mocy_ohm(u_kv, S_BASE_MVA)
            rezystor = _rezystor_uzwojenia(cfg, u_kv, trafo.ref_id, nazwa)
            wynik.append(
                PunktUziemienia(
                    rodzaj="uzwojenie_transformatora",
                    element_ref=trafo.ref_id,
                    bus_ref=trafo.hv_bus_ref if strona == "HV" else trafo.lv_bus_ref,
                    nazwa_pl=nazwa,
                    typ_uzwojenia=typ,
                    rezystor=(
                        None if rezystor is None else replace(rezystor, z0_tu_ohm=z0_uzwojenia)
                    ),
                    z_n_uzwojenia_ohm=model.zn_hv_ohm if strona == "HV" else model.zn_lv_ohm,
                    z0_uzwojenia_ohm=z0_uzwojenia,
                    droga_szeregowa=model.connection == ZeroSeqConnection.SERIES_THROUGH,
                    jawny=cfg is not None,
                )
            )
    return wynik


@dataclass(frozen=True)
class NosnikPunktuNeutralnego:
    """Zadeklarowany uziemiony nośnik punktu neutralnego sieci SN (bloker E-W5-04)."""

    element_ref: str
    bus_ref: str
    #: Klucz nośnika w rekordzie transformatora: ``hv_neutral`` | ``lv_neutral``.
    pole: str
    typ: str


def nosniki_sieci(
    enm: EnergyNetworkModel,
) -> list[tuple[UziemienieSekcji, tuple[NosnikPunktuNeutralnego, ...]]]:
    """Sieci SN z co najmniej dwoma ZADEKLAROWANYMI uziemionymi nośnikami punktu neutralnego
    (decyzja architekta D1 karty POLA-GPZ-SZABLONY, kod E-W5-04): punkt neutralny sieci SN
    uziemia się w JEDNYM miejscu — dwa boczniki zerowe w jednej sieci liczyłyby się równolegle.

    JEDNO źródło sieci i punktów: ``uziemienie_sieci`` (ta sama prawda co mapowanie Y0).
    Nośnik zadeklarowany: zespół uziemiający z typem uziemionym (niezależnie od stanów
    odłączników gałęzi — to stan ruchowy, nie opis sieci) i uzwojenie transformatora
    z jawną konfiguracją uziemioną. Punkt wyprowadzony bez konfiguracji (litera grupy, np. Dyn11
    dwóch transformatorów GPZ za zamkniętym sprzęgłem) jest domyślną fizyką modelu (W5-A), nie
    decyzją projektanta — nie jest nośnikiem (pomiar 2026-11-05: golden network ENM). Źródło na
    szynie SN nie jest nośnikiem: jego opis punktu neutralnego fizyka pomija (W-W5-02,
    ``impedancja_zerowa_zrodla_dozwolona``)."""
    wynik: list[tuple[UziemienieSekcji, tuple[NosnikPunktuNeutralnego, ...]]] = []
    trafo = {t.ref_id: t for t in enm.transformers}
    for sekcja in uziemienie_sieci(enm):
        nosniki: list[NosnikPunktuNeutralnego] = []
        for punkt in sekcja.punkty:
            if not punkt.jawny:
                continue
            element = trafo[punkt.element_ref]
            pole = "hv_neutral" if punkt.bus_ref == element.hv_bus_ref else "lv_neutral"
            cfg = element.hv_neutral if pole == "hv_neutral" else element.lv_neutral
            if cfg is None or not uziemienie_grounded(cfg.type):
                continue
            nosniki.append(
                NosnikPunktuNeutralnego(punkt.element_ref, punkt.bus_ref, pole, cfg.type)
            )
        if len(nosniki) > 1:
            wynik.append((sekcja, tuple(nosniki)))
    return wynik


def galezie_sieci_sn(
    enm: EnergyNetworkModel, szyny: frozenset[str]
) -> tuple[OverheadLine | Cable, ...]:
    """Linie i kable w ruchu połączonej sieci SN o szynach ``szyny`` (sortowane po ``ref_id``).

    JEDYNY predykat przynależności gałęzi do sieci SN: z niego idzie suma B0 tej prawdy
    (``UziemienieSekcji.b0_s`` → I_C) i zakres gałęzi analiz V12.6 (``galezie_sieci`` —
    projekt uziemienia, ferrorezonans), żeby oba zbiory nie rozjechały się na gałęzi otwartej
    albo na granicy sieci."""
    return tuple(
        galaz
        for galaz in sorted(enm.branches, key=lambda g: g.ref_id)
        if isinstance(galaz, OverheadLine | Cable)
        and galaz.status == "closed"
        and galaz.from_bus_ref in szyny
    )


def b0_baterii_s(enm: EnergyNetworkModel, bateria: ShuntCapacitor) -> float:
    """Susceptancja zerowa fazy baterii względem ziemi B_0 [S] przy częstotliwości studium.

    JEDNO źródło B_0 baterii dla prawdy o uziemieniu sieci (I_C, rozstrojenie) i dla wejścia
    V12.6 (``V126ShuntCapacitorInput.b0_siemens``): gwiazda uziemiona B_0 = B (Y0 = Y1),
    pozostałe układy 0 (``enm.bateria_kondensatorow.admitancja_zerowa_baterii_s``). Częstotliwość
    z nagłówka modelu — to samo pole, z którego mapowanie Y0 liczy admitancję baterii."""
    return admitancja_zerowa_baterii_s(
        bateria.model_dump(mode="json"), float(enm.header.defaults.frequency_hz)
    ).imag


def baterie_sieci_sn(enm: EnergyNetworkModel, szyny: frozenset[str]) -> tuple[ShuntCapacitor, ...]:
    """Baterie kondensatorów załączone na szynach połączonej sieci SN o szynach ``szyny``
    (sortowane po ``ref_id``) — JEDYNY predykat przynależności baterii do sieci (suma B_0 tej
    prawdy i zakres baterii analiz V12.6)."""
    return tuple(
        bateria
        for bateria in sorted(enm.shunt_capacitors, key=lambda b: b.ref_id)
        if bateria.status == "closed" and bateria.bus_ref in szyny
    )


def _b0_sieci(enm: EnergyNetworkModel, szyny: frozenset[str]) -> tuple[
    float,
    tuple[tuple[str, str], ...],
    tuple[tuple[str, float], ...],
    tuple[tuple[str, str, float, str], ...],
]:
    b0 = 0.0
    brak: list[tuple[str, str]] = []
    robocze: list[tuple[str, str, float, str]] = []
    napiecia = napiecia_szyn_kv(enm)
    for galaz in galezie_sieci_sn(enm, szyny):
        # B′0 z modelu albo wartość robocza odcinka SN — ta sama wartość co kandydat bocznika
        # pojemności w sieci zerowej zwarć (``enm.mapping``, warunek pkt 5.2 f)) i wejście V12.6.
        skladowa = skladowa_zerowa_galezi(galaz, napiecia.get(galaz.from_bus_ref))
        if skladowa.b0_s_per_km is None:
            brak.append((galaz.ref_id, nazwa_elementu(galaz, "branches")))
            continue
        b0 += skladowa.b0_s_per_km * galaz.length_km
        robocze.extend(
            (galaz.ref_id, nazwa_elementu(galaz, "branches"), wartosc, zalozenie)
            for _, _, zalozenie, wartosc in skladowa.robocze_b0
        )
    baterie: list[tuple[str, float]] = []
    for bateria in baterie_sieci_sn(enm, szyny):
        b0_baterii = b0_baterii_s(enm, bateria)
        if b0_baterii > 0.0:
            baterie.append((bateria.ref_id, b0_baterii))
            b0 += b0_baterii
    return b0, tuple(brak), tuple(baterie), tuple(robocze)


def _ostrzezenia(sekcja: UziemienieSekcji) -> tuple[str, ...]:
    # Więcej niż jeden zespół uziemiający w sieci to bloker E-W5-04 (``nosniki_sieci``),
    # nie ostrzeżenie — ENEA Zeszyt 1 §16 s. 29 dobiera zespół na pracę jednego zespołu na sieć
    # sekcji A+B; §26.10.7 s. 56: przy zamkniętym łączniku szyn AWSCz blokowane w jednej sekcji.
    wynik: list[str] = []
    v = sekcja.rozstrojenie
    if v is not None and abs(v) < PROG_REZONANSU:
        wynik.append(
            "Nastawa dławików równa prądowi pojemnościowemu sieci (rozstrojenie "
            f"{v * 100:.2f} %) — ENEA Zeszyt 1 §16 s. 30 zakazuje pracy w punkcie rezonansowym "
            "(prąd dławika równy prądowi pojemnościowemu)."
        )
    return tuple(wynik)


def tor_odlaczonego_pola_zu(enm: EnergyNetworkModel, szyny: Iterable[str]) -> bool:
    """Czy zbiór szyn to wyłącznie zaciski torów pól zespołu uziemiającego (rola ``ZU``).

    JEDEN predykat dla uziemienia sieci (zespół za otwartym wyłącznikiem pola nie jest
    siecią SN i nie uziemia niczego) i walidatora (E003: tor odłączonego pola ZU nie jest
    „wyspą odciętą od zasilania”, tylko zespołem wyłączonym z ruchu — stan ruchowy, nie
    błąd modelu). Pusty zbiór — ``False``."""
    zaciski = {b.terminal_bus_ref for b in enm.bays if b.bay_role == "ZU" and b.terminal_bus_ref}
    lista = list(szyny)
    return bool(lista) and all(s in zaciski for s in lista)


def uziemienie_sieci(enm: EnergyNetworkModel) -> tuple[UziemienieSekcji, ...]:
    """Uziemienie każdej galwanicznie połączonej sieci SN modelu (kolejność ``derive``)."""
    napiecie = {b.ref_id: b.voltage_kv for b in enm.buses}
    wynik: list[UziemienieSekcji] = []
    for skladowa in derive(enm).sekcje:
        napiecia = [napiecie[s] for s in skladowa if napiecie.get(s)]
        if not napiecia:
            continue
        if tor_odlaczonego_pola_zu(enm, skladowa):
            # Zespół odłączony od sieci (otwarty łącznik pola ZU): sam zacisk toru pola ZU
            # nie jest siecią SN — nie uziemia niczego i nie jest osobną siecią (inaczej V12.6
            # widziałby „drugą sieć” o innym sposobie uziemienia, a dowód przekładników —
            # sekcję bez szyn stacji).
            continue
        u_kv = max(napiecia)
        if pasmo_napieciowe(u_kv) != "SN":
            continue
        szyny = frozenset(skladowa)
        punkty = _punkty_uzwojen(list(enm.transformers), szyny, u_kv)
        b0, bez_b0, baterie_b0, b0_robocze = _b0_sieci(enm, szyny)
        sekcja = UziemienieSekcji(
            szyny=tuple(sorted(szyny)),
            napiecie_kv=u_kv,
            punkty=tuple(punkty),
            b0_s=b0,
            galezie_bez_b0=bez_b0,
            baterie_b0=baterie_b0,
            galezie_b0_robocze=b0_robocze,
        )
        wynik.append(
            UziemienieSekcji(
                szyny=sekcja.szyny,
                napiecie_kv=sekcja.napiecie_kv,
                punkty=sekcja.punkty,
                b0_s=sekcja.b0_s,
                galezie_bez_b0=sekcja.galezie_bez_b0,
                ostrzezenia=_ostrzezenia(sekcja),
                baterie_b0=sekcja.baterie_b0,
                galezie_b0_robocze=sekcja.galezie_b0_robocze,
            )
        )
    return tuple(wynik)


def uziemienie_szyny(enm: EnergyNetworkModel, bus_ref: str) -> UziemienieSekcji | None:
    """Uziemienie sieci SN, do której należy szyna ``bus_ref`` (``None`` poza pasmem SN)."""
    for sekcja in uziemienie_sieci(enm):
        if bus_ref in sekcja.szyny:
            return sekcja
    return None
