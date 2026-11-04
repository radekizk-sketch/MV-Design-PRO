"""Szyny zbiorcze sekcji GPZ — JEDEN czytelnik modelu dla analiz szyn (karta GPZ-DANE-ANALIZ).

Pytanie „jakie są sekcje GPZ tej stacji, jakie dane znamionowe ma rozdzielnica każdej z nich,
które pola i transformatory zasilają sekcję i jak długo trwa zwarcie na jej szynach" zadają dwie
analizy: werdykt wytrzymałości aparatury (``wytrzymalosc_aparatury_pol`` — wiersze szyn sekcji)
i widok Arc Flash (``arc_flash_view`` — geometria łuku z rozdzielnicy sekcji). Odpowiedź jest
jedna, więc czytelnik jest jeden.

WARSTWA APLIKACJI — ZERO FIZYKI WŁASNEJ. Prąd znamionowy strony transformatora liczy lista
dozwolona ``network_model.pochodne`` (``prad_znamionowy_a``), napięcie najwyższe sieci — tablica
IEC 60038 (``network_model.pochodne.pasma_napieciowe``); znamiona rozstrzyga rejestr wartości
roboczych (``network_model.catalog.wartosci_robocze.rozstrzygnij_parametry_aparatu_sn`` — ta
sama reguła pierwszeństwa projektant > karta > propozycja normy co dla aparatu pola).

POCHODZENIE ZNAMION. Rozdzielnica z ``dokument_zrodlowy`` (karta producenta, DTR) niesie liczby
z dokumentu — rejestr traktuje je jak dane karty producenta. Bez dokumentu liczby są wartościami
nadanymi przez projektanta na elemencie modelu: dana przyjęta (jakość ``ESTIMATED``),
kompletność dowodu ``NIEPELNY``. Brak liczby: t_k proponuje norma (1 s, IEC 62271-1:2017 p. 5.8),
I_p — relacja normowa 2,5·I_k z I_k z dokumentu albo od projektanta (p. 5.7); I_k nie ma
uzasadnionej propozycji (wytrzymałość szyn deklaruje producent rozdzielnicy), więc jego brak
jest nazwany, a nie zastąpiony.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal

from enm.models import (
    EnergyNetworkModel,
    GPZSection,
    RozdzielnicaSekcjiGpz,
    Substation,
    liczba_torow,
)
from enm.nazwy_elementow import nazwa_elementu
from enm.pola import pola_stacji
from enm.rola_pola_sn import kanoniczna_rola_pola_sn
from enm.tor_pola import szyna_raportowa
from network_model.catalog.wartosci_robocze import (
    PARAMETR_I_DYN,
    PARAMETR_I_TH,
    PARAMETR_T_TH,
    WartoscProjektanta,
    WartoscRozstrzygnieta,
    rozstrzygnij_parametry_aparatu_sn,
)
from network_model.nazwy import nazwa_nadana
from network_model.pochodne import prad_znamionowy_a

StronaSekcji = Literal["SN", "WN"]

#: Rodzaj „aparatu" szyn zbiorczych w rejestrze wartości roboczych — spoza rodzajów łączników,
#: więc żadna wielkość zwarciowa nie jest „nie dotyczy" z rodzaju (szyny przewodzą zwarcie).
RODZAJ_SZYNY_ZBIORCZE = "SZYNY_ZBIORCZE"

#: Kanoniczne role pól ZASILAJĄCYCH sekcję — zwarcie na szynach trwa do wyłączenia ostatniego
#: z nich (pole transformatorowe, pole liniowe wejściowe, sprzęgło sekcji).
ROLE_POL_ZASILAJACYCH: frozenset[str] = frozenset({"TRANSFORMATOROWE", "LINIA_IN", "SPRZEGLO"})

#: Kod gotowości: zwarcie na szynach sekcji bez ustalonego czasu wyłączenia (żadne pole
#: zasilające albo pole zasilające bez czasu).
READINESS_CZAS_SZYN_NIEUSTALONY = "aparatura.szyny_czas_wylaczenia_nieustalony"


@dataclass(frozen=True)
class SekcjaGpz:
    """Jedna sekcja szyn GPZ stacji z jej rozdzielnicą i zbiorem szyn sekcji."""

    stacja_ref: str
    section_id: str
    strona: StronaSekcji
    order: int
    nazwa_pl: str
    bus_ref: str
    rozdzielnica: RozdzielnicaSekcjiGpz | None
    #: Szyna sekcji i szyny/zaciski jej pól — zbiór, po którym rozpoznaje się transformator
    #: przyłączony do sekcji (wprost albo przez zacisk pola transformatorowego).
    szyny: frozenset[str] = field(default_factory=frozenset)
    #: Pola stacji należące do sekcji (``gpz_section_id`` albo szyna pola = szyna sekcji).
    pola_refs: tuple[str, ...] = ()


def _nazwa_sekcji(sekcja: GPZSection, strona: StronaSekcji) -> str:
    nazwa = nazwa_nadana(sekcja.name)
    strona_pl = "SN" if strona == "SN" else "110 kV"
    if nazwa is not None:
        return f"{nazwa} ({strona_pl})"
    return f"sekcja {sekcja.order} szyn {strona_pl}"


def sekcje_gpz_stacji(enm: EnergyNetworkModel, stacja: Substation) -> list[SekcjaGpz]:
    """Sekcje szyn GPZ stacji (strona SN, potem 110 kV; w stronie po kolejności i id)."""
    pola = list(pola_stacji(enm, stacja.ref_id))
    wynik: list[SekcjaGpz] = []
    for strona, sekcje in (("SN", stacja.gpz_sections), ("WN", stacja.gpz_hv_sections)):
        for sekcja in sorted(sekcje, key=lambda s: (s.order, s.section_id)):
            pola_sekcji = [
                bay
                for bay in pola
                if bay.bus_ref == sekcja.bus_ref or bay.gpz_section_id == sekcja.section_id
            ]
            szyny = {sekcja.bus_ref}
            for bay in pola_sekcji:
                szyny.add(bay.bus_ref)
                if bay.terminal_bus_ref:
                    szyny.add(bay.terminal_bus_ref)
            wynik.append(
                SekcjaGpz(
                    stacja_ref=stacja.ref_id,
                    section_id=sekcja.section_id,
                    strona=strona,  # type: ignore[arg-type]
                    order=sekcja.order,
                    nazwa_pl=_nazwa_sekcji(sekcja, strona),  # type: ignore[arg-type]
                    bus_ref=sekcja.bus_ref,
                    rozdzielnica=sekcja.rozdzielnica,
                    szyny=frozenset(szyny),
                    pola_refs=tuple(sorted(bay.ref_id for bay in pola_sekcji)),
                )
            )
    return wynik


def sekcja_szyny(
    enm: EnergyNetworkModel, migawka: Mapping[str, Any], szyna_ref: str
) -> SekcjaGpz | None:
    """Sekcja GPZ, której szyną (węzłem raportowym) jest ``szyna_ref`` — ``None`` poza GPZ."""
    cel = szyna_raportowa(migawka, szyna_ref)
    for stacja in enm.substations:
        for sekcja in sekcje_gpz_stacji(enm, stacja):
            if szyna_raportowa(migawka, sekcja.bus_ref) == cel:
                return sekcja
    return None


@dataclass(frozen=True)
class _KartaRozdzielnicy:
    """Rozdzielnica sekcji jako „karta" rejestru wartości roboczych (protokół ``KartaAparatuSN``).

    Z dokumentem źródłowym liczby są danymi karty (producent = dokument); bez niego karta jest
    pusta, a liczby wchodzą jako wartości projektanta (``wartosci_projektanta``)."""

    manufacturer: str | None
    i_th_ka: float | None
    i_th_duration_s: float | None
    i_dyn_ka: float | None
    device_kind: str = RODZAJ_SZYNY_ZBIORCZE
    breaking_capacity_ka: float | None = None
    break_time_s: float | None = None


_POWOD_PROJEKTANTA = "dane rozdzielnicy sekcji wpisane bez dokumentu źródłowego"


def rozstrzygnij_znamiona_szyn(
    rozdzielnica: RozdzielnicaSekcjiGpz | None,
) -> dict[str, WartoscRozstrzygnieta]:
    """I_k, t_k i I_p szyn sekcji z pochodzeniem — JEDNO rozstrzygnięcie (rejestr wartości
    roboczych, reguła projektant > karta > propozycja normy)."""
    blok = rozdzielnica or RozdzielnicaSekcjiGpz()
    liczby = {
        PARAMETR_I_TH: blok.i_k_ka,
        PARAMETR_T_TH: blok.t_k_s,
        PARAMETR_I_DYN: blok.i_p_ka,
    }
    if blok.dokument_zrodlowy:
        karta = _KartaRozdzielnicy(
            manufacturer=blok.dokument_zrodlowy,
            i_th_ka=liczby[PARAMETR_I_TH],
            i_th_duration_s=liczby[PARAMETR_T_TH],
            i_dyn_ka=liczby[PARAMETR_I_DYN],
        )
        return rozstrzygnij_parametry_aparatu_sn(karta)
    karta = _KartaRozdzielnicy(manufacturer=None, i_th_ka=None, i_th_duration_s=None, i_dyn_ka=None)
    projektant = {
        parametr: WartoscProjektanta(
            parametr=parametr, wartosc=wartosc, powod_pl=_POWOD_PROJEKTANTA
        )
        for parametr, wartosc in liczby.items()
        if wartosc is not None
    }
    return rozstrzygnij_parametry_aparatu_sn(karta, projektant)


@dataclass(frozen=True)
class TransformatorSekcji:
    """Transformator przyłączony do sekcji: strona przy sekcji i jej prąd znamionowy."""

    ref_id: str
    nazwa_pl: str | None
    #: Nazwa do tekstu oceny: nazwa nadana albo opis rodzaju (`enm.nazwy_elementow`).
    opis_pl: str
    strona: StronaSekcji
    sn_mva: float
    liczba_jednostek: int
    u_kv: float
    i_r_a: float


def transformatory_sekcji(enm: EnergyNetworkModel, sekcja: SekcjaGpz) -> list[TransformatorSekcji]:
    """Transformatory, których uzwojenie przyłączone jest do sekcji (wprost albo przez zacisk
    pola sekcji), z prądem znamionowym strony przy sekcji (IEC 60076-1: I_r = S_r/(√3·U_r),
    ``pochodne.prad_znamionowy_a``; n jednostek równoległych — moc n·S_r)."""
    wynik: list[TransformatorSekcji] = []
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        if trafo.lv_bus_ref in sekcja.szyny:
            strona: StronaSekcji = "SN"
            u_kv = trafo.ulv_kv
        elif trafo.hv_bus_ref in sekcja.szyny:
            strona = "WN"
            u_kv = trafo.uhv_kv
        else:
            continue
        n = liczba_torow(trafo)
        wynik.append(
            TransformatorSekcji(
                ref_id=trafo.ref_id,
                nazwa_pl=nazwa_nadana(trafo.name),
                opis_pl=nazwa_elementu(trafo, "transformers"),
                strona=strona,
                sn_mva=trafo.sn_mva,
                liczba_jednostek=n,
                u_kv=u_kv,
                i_r_a=prad_znamionowy_a(trafo.sn_mva * n, u_kv),
            )
        )
    return wynik


def czas_wylaczenia_szyn(
    enm: EnergyNetworkModel,
    sekcja: SekcjaGpz,
    czasy_pol: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Czas trwania zwarcia na szynach sekcji: zwarcie zasilają WSZYSTKIE pola zasilające sekcję
    (transformatorowe, liniowe wejściowe, sprzęgło), więc trwa do wyłączenia OSTATNIEGO z nich —
    najdłuższy z czasów tych pól (``czasy_wylaczenia_pol_stacji`` przy prądzie punktu). Pole
    zasilające bez czasu czyni czas szyn nieustalonym (krótszy czas pozostałych pól zaniżyłby
    nagrzewanie szyn); sekcja bez pola zasilającego — nieustalony z nazwaną przyczyną."""
    pola = {bay.ref_id: bay for bay in pola_stacji(enm, sekcja.stacja_ref)}
    zasilajace = [
        ref
        for ref in sekcja.pola_refs
        if kanoniczna_rola_pola_sn(pola[ref].field_role or pola[ref].bay_role)
        in ROLE_POL_ZASILAJACYCH
    ]
    bez_czasu = {
        "t_clearing_s": None,
        "zrodlo": None,
        "czlon_nastawczy_s": None,
        "czas_wlasny_wylacznika_s": None,
        "czas_wlasny": None,
        "zalozenia_pl": [],
        "kody_gotowosci": [READINESS_CZAS_SZYN_NIEUSTALONY],
    }
    if not zasilajace:
        return {
            **bez_czasu,
            "powod_pl": (
                f"Sekcja {sekcja.nazwa_pl} nie ma w modelu pola zasilającego (transformatorowego, "
                "liniowego wejściowego ani sprzęgła) — nie wiadomo, które zabezpieczenie wyłącza "
                "zwarcie na jej szynach."
            ),
        }
    nieustalone = [
        ref for ref in zasilajace if (czasy_pol.get(ref) or {}).get("t_clearing_s") is None
    ]
    if nieustalone:
        powody = "; ".join(
            f"pole {nazwa_nadana(pola[ref].name) or ref}: "
            + str((czasy_pol.get(ref) or {}).get("powod_pl") or "czas wyłączenia nieustalony")
            for ref in nieustalone
        )
        return {
            **bez_czasu,
            "powod_pl": (
                f"Czas wyłączenia zwarcia na szynach sekcji {sekcja.nazwa_pl} wymaga czasów "
                f"wszystkich pól zasilających; nieustalone: {powody}"
            ),
        }
    decydujace = max(zasilajace, key=lambda ref: (float(czasy_pol[ref]["t_clearing_s"]), ref))
    czas = dict(czasy_pol[decydujace])
    czas["powod_pl"] = (
        f"Zwarcie na szynach sekcji {sekcja.nazwa_pl} trwa do wyłączenia ostatniego pola "
        f"zasilającego — decyduje pole {nazwa_nadana(pola[decydujace].name) or decydujace}: "
        f"{czas.get('powod_pl')}"
    )
    czas["pole_decydujace_ref"] = decydujace
    return czas
