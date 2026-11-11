"""Punkt neutralny transformatora uziemiającego zespołu uziemiającego — gałęzie, Z_N i dane
przyjęte (karta ZU-JEDEN-NOSNIK, moduł liściowy).

Zespół uziemiający sieci SN to TRANSFORMATOR uziemiający (``Transformer``, grupa z zygzakiem
uziemionym po stronie SN — ENEA Zeszyt 1 §16: ZNyn11) z wyposażeniem punktu neutralnego
w ``Transformer.hv_neutral`` (``GroundingConfig.dlawik`` / ``rezystor``; rysunki Z.13, Z.14,
Z.15). Ten moduł jest JEDYNYM miejscem, które z rekordu wyposażenia wyprowadza gałęzie punktu
neutralnego (dławik, rezystor wymuszający AWSC, rezystor, połączenie wprost), ich impedancje
per stan automatyki AWSC i wartości robocze (zasada nr 4: projekt > katalog > propozycja,
jakość ``ESTIMATED``). Czytają go: model składowej zerowej transformatora
(``enm.zero_sequence_transformer`` — Z_N do bocznika Z_0,zyg + 3·Z_N tą samą tablicą połączeń co
każdy transformator), prawda o uziemieniu sekcji (``enm.uziemienie_sekcji``), walidator
i operacje domenowe (ten sam predykat spójności ``blad_wyposazenia_punktu_neutralnego``).

Moduł liściowy: nie importuje ``zero_sequence_transformer`` ani ``uziemienie_sekcji`` (oba
importują jego) — inaczej cykl importów. Fizyka Z_N (X_L = U_f/I_L, R = U_f/I_R, Z_a‖Z_b) mieszka
w ``network_model/pochodne`` — tu tylko jej wywołania.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from network_model.catalog.governance import Poziom, brakuje_wymaganej_referencji
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_neutral_earthing_resistor_records,
)
from network_model.catalog.wartosci_robocze import (
    KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU,
    ZALOZENIE_Z0_ZYGZAKA,
    wartosc_projektanta,
)
from network_model.core.uziemienie import (
    ETYKIETA_PL_PUNKTU_NEUTRALNEGO,
    StanAwsc,
    TrybDoziemienia,
    WariantUziemieniaSekcji,
    tryb_doziemienia_wariantu,
)
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import (
    impedancja_punktu_neutralnego_ohm,
    impedancja_rownolegla_ohm,
    impedancja_zerowa_zygzaka_robocza_ohm,
    prad_elementu_punktu_neutralnego_a,
    reaktancja_dlawika_ohm,
    rezystancja_z_pradu_ohm,
)
from network_model.pochodne.pasma_napieciowe import w_pasmie_sn
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality

from .grupa_polaczen import parsuj_grupe_polaczen
from .models import DlawikGaszacy, GroundingConfig, RezystorUziemiajacy, Transformer
from .nazwy_elementow import nazwa_elementu


def grupa_transformatora_uziemiajacego(grupa_polaczen: str | None) -> bool:
    """Czy grupa połączeń ma uzwojenie GÓRNE w zygzak z wyprowadzonym punktem neutralnym
    (litera ``ZN`` grupy IEC 60076-1, np. ZNyn11) — JEDEN predykat grupy dla rekordu modelu
    (``jest_transformatorem_uziemiajacym``), pisarza zespołu (pozycja katalogu
    ``add_zespol_uziemiajacy_sn``) i listy katalogu transformatorów uziemiających (API).
    Grupa spoza słownika — nie."""
    if not grupa_polaczen:
        return False
    try:
        grupa = parsuj_grupe_polaczen(grupa_polaczen)
    except OdmowaDanychError:
        return False
    return grupa.gn_typ == "Z" and grupa.gn_punkt_neutralny


def jest_transformatorem_uziemiajacym(trafo: Transformer | Mapping[str, Any]) -> bool:
    """Czy transformator jest transformatorem uziemiającym sieci SN (zespół uziemiający).

    JEDEN predykat dla modelu składowej zerowej, prawdy o uziemieniu sekcji, walidatora,
    operacji domenowych i danych przyjętych biegu: uzwojenie GÓRNE w zygzak z wyprowadzonym
    punktem neutralnym (litera ``ZN`` grupy połączeń IEC 60076-1) na napięciu z pasma SN —
    zygzak jest drogą prądu zerowego do ziemi sieci SN, a jego punkt neutralny nośnikiem
    sposobu uziemienia tej sieci (ENEA Zeszyt 1 §16: ZNyn11). Grupa spoza słownika — nie
    (zgłasza ją E-W5-02). Czyta rekord modelu albo surowy słownik migawki (pisarze operacji,
    powiązanie pola ZU z transformatorem) — jeden predykat dla obu nośników."""
    if isinstance(trafo, Mapping):
        u_hv, grupa = trafo.get("uhv_kv"), trafo.get("vector_group")
    else:
        u_hv, grupa = trafo.uhv_kv, trafo.vector_group
    napiecie = float(u_hv) if isinstance(u_hv, int | float) and not isinstance(u_hv, bool) else None
    return w_pasmie_sn(napiecie) and grupa_transformatora_uziemiajacego(
        grupa if isinstance(grupa, str) else None
    )


#: Źródło wartości parametru urządzenia punktu neutralnego.
#: ``MODEL`` — wartość projektanta w rekordzie elementu; ``KATALOG`` — dana pozycji katalogu
#: (nieoznaczona jako robocza); ``KATALOG_ROBOCZA`` — pozycja typowa katalogu oznaczona
#: w ``wartosci_robocze``; ``PROPOZYCJA`` — wartość robocza tego modułu (zasada nr 4);
#: ``WYPROWADZONA`` — wynika z innej danej modelu (np. R z prądu znamionowego).
ZrodloParametru = Literal["MODEL", "KATALOG", "KATALOG_ROBOCZA", "PROPOZYCJA", "WYPROWADZONA"]
_ZRODLA_ROBOCZE: frozenset[str] = frozenset({"KATALOG_ROBOCZA", "PROPOZYCJA"})

RodzajGalezi = Literal["dlawik", "rezystor", "rezystor_awsc", "bezposrednie"]
#: Zakres dławika przyjmowany, gdy ani rekord, ani katalog go nie podaje.
PROPOZYCJA_ZAKRESU_DLAWIKA_A: tuple[float, float] = (40.0, 400.0)
_PODSTAWA_ZAKRESU_DLAWIKA = (
    "ENEA Zeszyt 1 §16 s. 29: parametry dławika minimum 40–400 A (wartość robocza)"
)
#: Prąd czynny wymuszany przez AWSC po stronie pierwotnej — środek przedziału 20–40 A.
PROPOZYCJA_PRADU_AWSC_A = 30.0
_PODSTAWA_PRADU_AWSC = (
    "ENEA Zeszyt 1 §16 s. 30: AWSC wymusza po stronie pierwotnej prądy 20–40 A; przyjęto "
    "środek przedziału 30 A (wartość robocza)"
)
_PODSTAWA_NASTAWY_DLAWIKA = (
    "środek zakresu regulacji dławika (połowa sumy prądu minimalnego i maksymalnego) — wartość robocza do zastąpienia "
    "nastawą regulatora albo położeniem zaczepu"
)
#: Rozstrojenie, poniżej którego nastawa dławika jest uznana za pracę w punkcie
#: rezonansowym (Zeszyt 1 §16 s. 30: „nie dopuszcza się pracy … w punkcie rezonansowym … IL
#: = IC”). Próg 0,1 % jest założeniem jawnym: równość prądów z dokładnością zaokrąglenia
#: nastawy.
PROG_REZONANSU = 1e-3


@dataclass(frozen=True)
class ParametrPunktuNeutralnego:
    """Jeden parametr urządzenia punktu neutralnego z pochodzeniem i podstawą."""

    nazwa: str
    etykieta_pl: str
    wartosc: float
    jednostka: str
    zrodlo: ZrodloParametru
    podstawa_pl: str

    @property
    def roboczy(self) -> bool:
        return self.zrodlo in _ZRODLA_ROBOCZE

    def to_dict(self) -> dict[str, Any]:
        return {
            "nazwa": self.nazwa,
            "etykieta_pl": self.etykieta_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "zrodlo": self.zrodlo,
            "podstawa_pl": self.podstawa_pl,
        }


def _zespolona(z: complex | None) -> dict[str, float] | None:
    return None if z is None else {"r_ohm": z.real, "x_ohm": z.imag}


@dataclass(frozen=True)
class GalazPunktuNeutralnego:
    """Gałąź punktu neutralnego zespołu (dławik, rezystor, rezystor AWSC, połączenie wprost).

    ``z_ohm`` — impedancja gałęzi [Ω] (bez mnożnika 3 obwodu zerowego); ``w_ruchu`` — gałąź
    przewodzi w danym stanie: odłącznik zamknięty (AWSC: wyłącznie w stanie załączonym).
    """

    rodzaj: RodzajGalezi
    z_ohm: complex
    prad_a: float | None
    odlacznik_zamkniety: bool
    tylko_awsc_zalaczony: bool = False
    #: Parametry, z których wynika ``z_ohm`` (dławik: nastawa, a zakres tylko wtedy, gdy
    #: nastawa jest jego środkiem; rezystor: R; AWSC: prąd wymuszany) — podstawa danych
    #: przyjętych WYNIKU z tą gałęzią (``PunktUziemienia.dane_przyjete_bocznika``).
    parametry_z: tuple[ParametrPunktuNeutralnego, ...] = ()

    def w_ruchu(self, stan_awsc: StanAwsc) -> bool:
        if not self.odlacznik_zamkniety:
            return False
        return not self.tylko_awsc_zalaczony or stan_awsc == "zalaczony"

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodzaj": self.rodzaj,
            "z_ohm": _zespolona(self.z_ohm),
            "prad_a": self.prad_a,
            "odlacznik_zamkniety": self.odlacznik_zamkniety,
            "tylko_awsc_zalaczony": self.tylko_awsc_zalaczony,
        }


def _dana_przyjeta_parametru(p: ParametrPunktuNeutralnego, nazwa_punktu: str) -> DanaPrzyjeta:
    """Dana przyjęta ``ESTIMATED`` z parametru roboczego urządzenia punktu neutralnego."""
    return DanaPrzyjeta(
        nazwa_pl=f"{p.etykieta_pl} ({nazwa_punktu})",
        wartosc=Wielkosc(wartosc=p.wartosc, jednostka=p.jednostka),
        powod_pl=(
            f"{p.podstawa_pl}. Zmień wartość: {p.etykieta_pl} w parametrach zespołu "
            "uziemiającego (dane producenta albo nastawa)."
        ),
        jakosc=FieldQuality.ESTIMATED,
    )


@dataclass(frozen=True)
class RezystorPunktuNeutralnego:
    """Rezystor w punkcie neutralnym sieci SN — dane do sprawdzenia rezystora (projekt
    uziemienia V12.6): R, prąd znamionowy I_n i dopuszczalny czas jego przepływu t_n.

    R i I_n to TE SAME rozstrzygnięcia co gałąź bocznika składowej zerowej (``_galaz_rezystora``
    — jedno miejsce pierwszeństwa projekt > katalog > wartość robocza); t_n wchodzi wyłącznie
    do sprawdzenia cieplnego rezystora, więc nie należy do danych przyjętych zwarcia.
    """

    element_ref: str
    nazwa_pl: str
    r: ParametrPunktuNeutralnego
    i_n: ParametrPunktuNeutralnego
    t_n: ParametrPunktuNeutralnego
    #: Impedancja zerowa w szeregu z rezystorem [Ω/fazę] (droga prądu rezystora przy
    #: doziemieniu: Z_0/3 + R — sprawdzenie cieplne rezystora wg IEC 60909-0 i prąd
    #: doziemienia ``doziemienie_sn``): transformator uziemiający zespołu Z_0,TU albo — dla
    #: rezystora w punkcie neutralnym uzwojenia transformatora sieci — impedancja zerowa
    #: transformatora Z_T0 (ten sam model co stempel mapowania, ``z0_uzwojenia_ohm``).
    z0_tu_ohm: complex | None = None
    #: Parametry Z_0,TU (R0, X0) zespołu — dane przyjęte sprawdzenia cieplnego, gdy robocze.
    parametry_tu: tuple[ParametrPunktuNeutralnego, ...] = ()

    def dane_przyjete(self) -> tuple[DanaPrzyjeta, ...]:
        return tuple(
            _dana_przyjeta_parametru(p, self.nazwa_pl)
            for p in (self.r, self.i_n, self.t_n, *self.parametry_tu)
            if p.roboczy
        )


# ---------------------------------------------------------------------------
# Rozstrzygnięcie parametrów (projekt > katalog > wartość robocza)
# ---------------------------------------------------------------------------


def _rozstrzygnij(
    nazwa: str,
    etykieta_pl: str,
    jednostka: str,
    wartosc_elementu: float | None,
    params: Mapping[str, Any] | None,
    *,
    nazwa_w_katalogu: str | None = None,
    propozycja: tuple[float, str] | None = None,
) -> ParametrPunktuNeutralnego | None:
    """Jedno miejsce pierwszeństwa: wartość projektanta > katalog > wartość robocza.

    Wartość elementu równa katalogowej jest wartością katalogu (z jej założeniem) — ten sam
    predykat ``wartosc_projektanta`` co uzupełnienie katalogu i dane przyjęte gałęzi.
    """
    klucz = nazwa_w_katalogu or nazwa
    params = params or {}
    katalogowa = params.get(klucz)
    katalogowa = float(katalogowa) if isinstance(katalogowa, int | float) else None
    if wartosc_elementu is not None and (
        katalogowa is None or wartosc_projektanta(wartosc_elementu, katalogowa)
    ):
        return ParametrPunktuNeutralnego(
            nazwa, etykieta_pl, float(wartosc_elementu), jednostka, "MODEL", "wartość projektanta"
        )
    if katalogowa is not None:
        robocze = params.get(KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU)
        zalozenie = robocze.get(klucz) if isinstance(robocze, Mapping) else None
        if isinstance(zalozenie, str):
            return ParametrPunktuNeutralnego(
                nazwa, etykieta_pl, katalogowa, jednostka, "KATALOG_ROBOCZA", zalozenie
            )
        return ParametrPunktuNeutralnego(
            nazwa, etykieta_pl, katalogowa, jednostka, "KATALOG", "dana pozycji katalogu"
        )
    if propozycja is not None:
        return ParametrPunktuNeutralnego(
            nazwa, etykieta_pl, propozycja[0], jednostka, "PROPOZYCJA", propozycja[1]
        )
    return None


def _najblizsza_pozycja(rekordy: list[dict], u_kv: float) -> dict:
    return min(rekordy, key=lambda r: (abs(float(r["params"]["u_n_kv"]) - u_kv), r["id"]))


def _propozycja_pradu_rezystora(u_kv: float) -> tuple[float, str]:
    pozycja = _najblizsza_pozycja(get_all_neutral_earthing_resistor_records(), u_kv)
    p = pozycja["params"]
    return float(p["i_n_a"]), (
        f"prąd znamionowy pozycji typowej katalogu „{pozycja['name']}” — "
        f"{p[KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU]['i_n_a']}"
    )


def _propozycja_czasu_rezystora(u_kv: float) -> tuple[float, str]:
    pozycja = _najblizsza_pozycja(get_all_neutral_earthing_resistor_records(), u_kv)
    p = pozycja["params"]
    return float(p["t_s"]), (
        f"dopuszczalny czas przepływu prądu znamionowego pozycji typowej katalogu "
        f"„{pozycja['name']}” — {p[KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU]['t_s']}"
    )


_ETYKIETA_R = "Rezystancja rezystora uziemiającego"
_ETYKIETA_I_N = "Prąd znamionowy rezystora uziemiającego"
_ETYKIETA_T_N = "Dopuszczalny czas przepływu prądu znamionowego rezystora"


def _zamkniety(stan: str) -> bool:
    return stan == "zamkniety"


def _galaz_dlawika(
    dlawik: DlawikGaszacy, u_kv: float, parametry: list[ParametrPunktuNeutralnego]
) -> tuple[GalazPunktuNeutralnego, ...]:
    mp = dlawik.materialized_params
    i_min = _rozstrzygnij(
        "dlawik.i_min_a",
        "Prąd minimalny zakresu dławika",
        "A",
        dlawik.i_min_a,
        mp,
        nazwa_w_katalogu="i_min_a",
        propozycja=(PROPOZYCJA_ZAKRESU_DLAWIKA_A[0], _PODSTAWA_ZAKRESU_DLAWIKA),
    )
    i_max = _rozstrzygnij(
        "dlawik.i_max_a",
        "Prąd maksymalny zakresu dławika",
        "A",
        dlawik.i_max_a,
        mp,
        nazwa_w_katalogu="i_max_a",
        propozycja=(PROPOZYCJA_ZAKRESU_DLAWIKA_A[1], _PODSTAWA_ZAKRESU_DLAWIKA),
    )
    assert i_min is not None and i_max is not None
    if dlawik.i_nastawy_a is not None:
        nastawa = ParametrPunktuNeutralnego(
            "dlawik.i_nastawy_a",
            "Prąd nastawy dławika",
            float(dlawik.i_nastawy_a),
            "A",
            "MODEL",
            "nastawa projektanta",
        )
    else:
        robocza_zakresu = i_min.roboczy or i_max.roboczy
        nastawa = ParametrPunktuNeutralnego(
            "dlawik.i_nastawy_a",
            "Prąd nastawy dławika",
            (i_min.wartosc + i_max.wartosc) / 2.0,
            "A",
            "PROPOZYCJA",
            _PODSTAWA_NASTAWY_DLAWIKA
            + (" (zakres z wartości roboczej)" if robocza_zakresu else ""),
        )
    parametry.extend((i_min, i_max, nastawa))
    galezie = [
        GalazPunktuNeutralnego(
            rodzaj="dlawik",
            z_ohm=impedancja_punktu_neutralnego_ohm(
                None, reaktancja_dlawika_ohm(u_kv, nastawa.wartosc)
            ),
            prad_a=nastawa.wartosc,
            odlacznik_zamkniety=_zamkniety(dlawik.stan_odlacznika),
            parametry_z=(nastawa,) if nastawa.zrodlo == "MODEL" else (i_min, i_max, nastawa),
        )
    ]
    if dlawik.awsc is not None:
        i_w = _rozstrzygnij(
            "awsc.i_wymuszany_a",
            "Prąd czynny wymuszany przez AWSC (strona pierwotna)",
            "A",
            dlawik.awsc.i_wymuszany_a,
            None,
            propozycja=(PROPOZYCJA_PRADU_AWSC_A, _PODSTAWA_PRADU_AWSC),
        )
        assert i_w is not None
        parametry.append(i_w)
        galezie.append(
            GalazPunktuNeutralnego(
                rodzaj="rezystor_awsc",
                z_ohm=impedancja_punktu_neutralnego_ohm(
                    rezystancja_z_pradu_ohm(u_kv, i_w.wartosc), None
                ),
                prad_a=i_w.wartosc,
                # Rezystor AWSC jest przyłączony do uzwojenia wtórnego dławika — przewodzi
                # tylko przez dławik, więc odłącznik dławika odłącza także jego.
                odlacznik_zamkniety=_zamkniety(dlawik.stan_odlacznika),
                tylko_awsc_zalaczony=True,
                parametry_z=(i_w,),
            )
        )
    return tuple(galezie)


def _galaz_rezystora(
    rezystor: RezystorUziemiajacy,
    u_kv: float,
    parametry: list[ParametrPunktuNeutralnego],
    element_ref: str,
    nazwa_pl: str,
) -> tuple[GalazPunktuNeutralnego, RezystorPunktuNeutralnego]:
    mp = rezystor.materialized_params
    r = _rozstrzygnij(
        "rezystor.r_ohm", _ETYKIETA_R, "Ω", rezystor.r_ohm, mp, nazwa_w_katalogu="r_ohm"
    )
    i_n = _rozstrzygnij(
        "rezystor.i_n_a", _ETYKIETA_I_N, "A", rezystor.i_n_a, mp, nazwa_w_katalogu="i_n_a"
    )
    if r is None:
        if i_n is None:
            prad, podstawa = _propozycja_pradu_rezystora(u_kv)
            i_n = ParametrPunktuNeutralnego(
                "rezystor.i_n_a", _ETYKIETA_I_N, prad, "A", "PROPOZYCJA", podstawa
            )
        r = ParametrPunktuNeutralnego(
            "rezystor.r_ohm",
            _ETYKIETA_R,
            rezystancja_z_pradu_ohm(u_kv, i_n.wartosc),
            "Ω",
            "PROPOZYCJA" if i_n.roboczy else "WYPROWADZONA",
            f"Rezystancja z napięcia fazowego i prądu znamionowego {i_n.wartosc:g} A ({i_n.podstawa_pl})",
        )
    parametry.append(r)
    if i_n is not None:
        parametry.append(i_n)
    z = impedancja_punktu_neutralnego_ohm(r.wartosc, None)
    galaz = GalazPunktuNeutralnego(
        rodzaj="rezystor",
        z_ohm=z,
        prad_a=prad_elementu_punktu_neutralnego_a(u_kv, z),
        odlacznik_zamkniety=_zamkniety(rezystor.stan_odlacznika),
        parametry_z=(r,),
    )
    t_n = _rozstrzygnij(
        "rezystor.t_s",
        _ETYKIETA_T_N,
        "s",
        rezystor.t_s,
        mp,
        nazwa_w_katalogu="t_s",
        propozycja=_propozycja_czasu_rezystora(u_kv),
    )
    assert t_n is not None
    return galaz, RezystorPunktuNeutralnego(
        element_ref=element_ref,
        nazwa_pl=nazwa_pl,
        r=r,
        i_n=i_n if i_n is not None else _prad_z_rezystancji(u_kv, r),
        t_n=t_n,
    )


def _prad_z_rezystancji(u_kv: float, r: ParametrPunktuNeutralnego) -> ParametrPunktuNeutralnego:
    """I_n = U_n/(√3·R) — prąd rezystora przy pełnym U_f, gdy model podaje tylko R."""
    return ParametrPunktuNeutralnego(
        "rezystor.i_n_a",
        _ETYKIETA_I_N,
        prad_elementu_punktu_neutralnego_a(u_kv, complex(r.wartosc, 0.0)),
        "A",
        "PROPOZYCJA" if r.roboczy else "WYPROWADZONA",
        f"Prąd znamionowy z napięcia fazowego i rezystancji {r.wartosc:g} Ω ({r.podstawa_pl})",
    )


def _rezystor_uzwojenia(
    cfg: GroundingConfig | None, u_kv: float, element_ref: str, nazwa_pl: str
) -> RezystorPunktuNeutralnego | None:
    """Rezystor punktu neutralnego uzwojenia TR uziemionego przez rezystor (R z konfiguracji
    uzwojenia — wartość projektanta; I_n wyprowadzony z R; t_n — wartość robocza)."""
    if cfg is None or cfg.type != "resistor_grounded" or not cfg.r_ohm or cfg.r_ohm <= 0:
        return None
    r = ParametrPunktuNeutralnego(
        "rezystor.r_ohm", _ETYKIETA_R, float(cfg.r_ohm), "Ω", "MODEL", "wartość projektanta"
    )
    t_s, podstawa = _propozycja_czasu_rezystora(u_kv)
    return RezystorPunktuNeutralnego(
        element_ref=element_ref,
        nazwa_pl=nazwa_pl,
        r=r,
        i_n=_prad_z_rezystancji(u_kv, r),
        t_n=ParametrPunktuNeutralnego(
            "rezystor.t_s", _ETYKIETA_T_N, t_s, "s", "PROPOZYCJA", podstawa
        ),
    )


def _regulacja_dlawika(dlawik: DlawikGaszacy) -> str:
    if dlawik.regulacja is not None:
        return dlawik.regulacja
    z_katalogu = (dlawik.materialized_params or {}).get("regulacja")
    # Zeszyt 1 §16 s. 31: dławik z automatyczną, płynną regulacją — rozwiązanie wymagane;
    # zaczepy są wyłącznie wtedy, gdy rekord albo katalog je podaje.
    return str(z_katalogu) if isinstance(z_katalogu, str) else "ciagla"


@dataclass(frozen=True)
class WyposazeniePunktuNeutralnego:
    """Punkt neutralny transformatora uziemiającego: gałęzie, parametry, odmowa nazwana."""

    element_ref: str
    nazwa_pl: str
    galezie: tuple[GalazPunktuNeutralnego, ...] = ()
    parametry: tuple[ParametrPunktuNeutralnego, ...] = ()
    rezystor: RezystorPunktuNeutralnego | None = None
    #: Odmowa nazwana (brak elementu w punkcie neutralnym, sprzeczna deklaracja).
    odmowa_pl: str | None = None
    ma_awsc: bool = False
    regulacja_ciagla: bool | None = None

    def galezie_w_ruchu(self, stan_awsc: StanAwsc) -> tuple[GalazPunktuNeutralnego, ...]:
        return tuple(g for g in self.galezie if g.w_ruchu(stan_awsc))

    def wariant(self, stan_awsc: StanAwsc = "spoczynek") -> WariantUziemieniaSekcji:
        """Wariant punktu w danym stanie AWSC (po stanach odłączników gałęzi)."""
        if self.odmowa_pl is not None:
            return "izolowany"
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

    def tryb_doziemienia(self, stan_awsc: StanAwsc) -> TrybDoziemienia:
        return tryb_doziemienia_wariantu(self.wariant(stan_awsc))

    def z_n_ohm(self, stan_awsc: StanAwsc) -> complex | None:
        """Z_N [Ω] — gałęzie w ruchu równolegle; ``None`` = brak drogi do ziemi (wszystkie
        gałęzie odłączone, punkt izolowany, odmowa)."""
        if self.odmowa_pl is not None:
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


def _odmowa_wyposazenia(cfg: GroundingConfig | None, nazwa: str) -> str | None:
    """Odmowa nazwana dla punktu neutralnego transformatora uziemiającego (``None`` = spójny)."""
    if cfg is None:
        return (
            f"Zespół uziemiający {nazwa}: brak elementu w punkcie neutralnym transformatora "
            "uziemiającego (dławika gaszącego, rezystora albo deklaracji uziemienia "
            "bezpośredniego) — sposób uziemienia sieci nieokreślony."
        )
    if cfg.r_ohm is not None or cfg.x_ohm is not None:
        return (
            f"Zespół uziemiający {nazwa}: impedancję punktu neutralnego transformatora "
            "uziemiającego opisują gałęzie (dławik gaszący, rezystor) z katalogu i nastawy — "
            "nie wpisana wprost rezystancja ani reaktancja punktu neutralnego; usuń wpisane wprost "
            "wartości i opisz gałęzie punktu neutralnego."
        )
    ma_element = cfg.dlawik is not None or cfg.rezystor is not None
    if cfg.type == "directly_grounded":
        if ma_element:
            return (
                f"Zespół uziemiający {nazwa}: zadeklarowano uziemienie bezpośrednie punktu "
                "neutralnego razem z dławikiem lub rezystorem — sprzeczne (punkt neutralny "
                "połączony wprost z ziemią zwiera element w punkcie neutralnym)."
            )
        return None
    if cfg.type == "isolated":
        if ma_element:
            return (
                f"Zespół uziemiający {nazwa}: punkt neutralny opisany jako izolowany razem "
                "z dławikiem lub rezystorem — sprzeczne (element w punkcie neutralnym łączy go "
                "z ziemią)."
            )
        return None
    if cfg.type == "petersen_coil" and cfg.dlawik is None:
        return (
            f"Zespół uziemiający {nazwa}: punkt neutralny uziemiony przez dławik gaszący "
            "(Z.13/Z.14) bez dławika w punkcie neutralnym — dodaj dławik gaszący z katalogu."
        )
    if cfg.type == "resistor_grounded" and (cfg.rezystor is None or cfg.dlawik is not None):
        return f"Zespół uziemiający {nazwa}: punkt neutralny uziemiony przez rezystor (Z.15) " + (
            "bez rezystora w punkcie neutralnym — dodaj rezystor uziemiający z katalogu."
            if cfg.rezystor is None
            else "z dławikiem gaszącym — dławik i rezystor równolegle to wariant Z.14 "
            "(punkt neutralny uziemiony przez dławik gaszący)."
        )
    return None


def blad_wyposazenia_punktu_neutralnego(
    cfg: GroundingConfig | None, *, zespol: bool, nazwa: str
) -> str | None:
    """Spójność wyposażenia punktu neutralnego — JEDEN predykat walidatora, operacji
    domenowych i modelu składowej zerowej (``None`` = spójne).

    ``zespol`` — konfiguracja punktu neutralnego transformatora uziemiającego
    (``jest_transformatorem_uziemiajacym``, strona górna): wymaga opisu sposobu uziemienia
    (A: deklaracja uziemienia bezpośredniego nigdy nie jest wnioskiem z braku elementów)
    i spójności typu z gałęziami. Każdy inny nośnik (źródło, uzwojenie zwykłego transformatora,
    strona dolna transformatora uziemiającego) nie niesie wyposażenia zespołu."""
    if zespol:
        return _odmowa_wyposazenia(cfg, nazwa)
    if cfg is not None and cfg.ma_wyposazenie_zespolu:
        return (
            f"{nazwa}: dławik gaszący, rezystor uziemiający, SPZ, wyłączenie od transformatorów "
            "i zapis przeniesienia punktu neutralnego dotyczą wyłącznie punktu neutralnego "
            "transformatora uziemiającego (uzwojenie górne w zygzak z punktem neutralnym, sieć "
            f"SN); ten punkt neutralny ({ETYKIETA_PL_PUNKTU_NEUTRALNEGO.get(cfg.type, cfg.type)}) "
            "opisuje rezystancję albo reaktancję uziemienia."
        )
    return None


def nazwa_zespolu(trafo: Transformer) -> str:
    return nazwa_elementu(trafo, "transformers")


def wyposazenie_zespolu(trafo: Transformer) -> WyposazeniePunktuNeutralnego:
    """Wyposażenie punktu neutralnego transformatora uziemiającego przy jego napięciu górnym.

    Napięcie gałęzi (X_L = U_f/I_L, R = U_f/I_R) — ``uhv_kv`` transformatora: ta sama
    wartość dla modelu składowej zerowej i dla prawdy o uziemieniu sekcji (jedno źródło)."""
    nazwa = nazwa_zespolu(trafo)
    cfg = trafo.hv_neutral
    odmowa = _odmowa_wyposazenia(cfg, nazwa)
    u_kv = float(trafo.uhv_kv)
    parametry: list[ParametrPunktuNeutralnego] = []
    galezie: list[GalazPunktuNeutralnego] = []
    rezystor: RezystorPunktuNeutralnego | None = None
    if cfg is not None and odmowa is None:
        if cfg.dlawik is not None:
            galezie.extend(_galaz_dlawika(cfg.dlawik, u_kv, parametry))
        if cfg.rezystor is not None:
            galaz_r, rezystor = _galaz_rezystora(cfg.rezystor, u_kv, parametry, trafo.ref_id, nazwa)
            galezie.append(galaz_r)
        if cfg.type == "directly_grounded":
            galezie.append(
                GalazPunktuNeutralnego(
                    rodzaj="bezposrednie",
                    z_ohm=complex(0.0, 0.0),
                    prad_a=None,
                    odlacznik_zamkniety=True,
                )
            )
    dlawik = cfg.dlawik if cfg is not None else None
    return WyposazeniePunktuNeutralnego(
        element_ref=trafo.ref_id,
        nazwa_pl=nazwa,
        galezie=tuple(galezie),
        parametry=tuple(parametry),
        rezystor=rezystor,
        odmowa_pl=odmowa,
        ma_awsc=dlawik is not None and dlawik.awsc is not None,
        regulacja_ciagla=None if dlawik is None else _regulacja_dlawika(dlawik) == "ciagla",
    )


def parametry_z0_zygzaka(
    trafo: Transformer, u_kv: float
) -> tuple[ParametrPunktuNeutralnego, ParametrPunktuNeutralnego]:
    """R0 i X0 na fazę uzwojenia zygzakowego [Ω] z pochodzeniem: wartość projektanta > dana
    pozycji katalogu (``materialized_params``; oznaczona w ``wartosci_robocze`` = robocza) >
    wartość robocza ``impedancja_zerowa_zygzaka_robocza_ohm`` (IEC 60076-6, zasada nr 4).
    JEDNO rozstrzygnięcie dla modelu składowej zerowej i danych przyjętych biegu."""
    robocza = impedancja_zerowa_zygzaka_robocza_ohm(u_kv)
    r0 = _rozstrzygnij(
        "r0_ohm",
        "Rezystancja zerowa transformatora uziemiającego",
        "Ω",
        trafo.r0_ohm,
        trafo.materialized_params,
        propozycja=(robocza.real, ZALOZENIE_Z0_ZYGZAKA),
    )
    x0 = _rozstrzygnij(
        "x0_ohm",
        "Reaktancja zerowa transformatora uziemiającego",
        "Ω",
        trafo.x0_ohm,
        trafo.materialized_params,
        propozycja=(robocza.imag, ZALOZENIE_Z0_ZYGZAKA),
    )
    assert r0 is not None and x0 is not None
    return r0, x0


def czesci_zespolu_bez_katalogu(trafo: Transformer, poziom: Poziom) -> tuple[str, ...]:
    """Części wyposażenia punktu neutralnego transformatora uziemiającego bez pozycji
    katalogu, której oś ``poziom`` wymaga (``catalog.governance.wymagalnosc_katalogu(
    "zespol_uziemiajacy")``). Sam transformator wiąże reguła transformatora (E009).

    JEDEN predykat dla walidatora (E009), gotowości zwarciowej i bram importu ZIP/CGMES
    (Catalog Binding Rule). Zwraca polskie nazwy części w stałej kolejności."""
    cfg = trafo.hv_neutral
    if cfg is None or not jest_transformatorem_uziemiajacym(trafo):
        return ()
    czesci: list[str] = []
    if cfg.dlawik is not None and brakuje_wymaganej_referencji(poziom, cfg.dlawik.catalog_ref):
        czesci.append("dławik gaszący")
    if cfg.rezystor is not None and brakuje_wymaganej_referencji(poziom, cfg.rezystor.catalog_ref):
        czesci.append("rezystor uziemiający")
    return tuple(czesci)
