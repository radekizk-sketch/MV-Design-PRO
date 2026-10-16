"""Stan zasilenia i tor zasilania elementów ENM — z topologii łączeniowej (karta K6a).

Po co: kanwa SLD barwiła przewody „zasilone" własnym przeszukiwaniem grafu we froncie
(druga, niekanoniczna prawda topologii), a nawigacja po torze elektrycznym (UI-08) nie miała
dostawcy w backendzie. Ten moduł wystawia JEDNĄ prawdę: zasilenie i drogi wyprowadzone z
``enm.topology`` (``derive`` + ``podziel_krawedzie`` — ta sama semantyka „w ruchu" co assembler
IR, walidator i gotowość) i jądra grafowego ``network_model.core.topologia``.

Podstawa odpowiedzi: ``topologia_laczeniowa``. Zasilenie topologiczne znaczy „element jest
dołączony do wyspy, w której jest źródło sieciowe (``Source``), przez gałęzie w ruchu
i transformatory". To NIE jest wynik obliczeń napięciowych (rozpływu ani zwarć) — front nie
może go przedstawiać jako „pod napięciem" z wyniku. Generator nie zasila wyspy (semantyka
``Wyspa.zasilona``: może zniknąć ze scenariusza) — jest wykazywany jako generator wyspy.

Stan łącznika „nieustalony": stan łącznika w modelu to ``status`` gałęzi łączeniowej. Model
niesie też rekord stanu aparatu pola, który tę gałąź obsługuje (``Bay.primary_devices`` /
``Bay.runtime_state``, odczyt WYŁĄCZNIE przez ``enm.interlock_rules.device_state_record``).
Gdy ten rekord mówi „nieznany"/„awaria" albo przeczy ``status`` gałęzi, model nie rozstrzyga,
czy łącznik łączy — łącznik jest nieustalony. Zasilenie liczone jest wtedy dwa razy tym samym
``derive``: z nieustalonymi łącznikami otwartymi (zasilenie PEWNE) i zamkniętymi (zasilenie
MOŻLIWE); element zasilony tylko w drugim wariancie jest „nierozstrzygnięty" z przyczyną
i listą łączników — nigdy „zasilany" z domysłu. Tor liczony jest na grafie wariantu
„możliwe", a każda droga przez łącznik nieustalony jest oznaczona jako warunkowa: zasilany
pewnie ⇔ istnieje droga pewna (jeden wariant migawki dla obu odpowiedzi — predykaty parami).

Zero fizyki: wyłącznie przynależność do składowych grafu i drogi proste.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from enm.interlock_rules import MAIN_SWITCH_KINDS, device_state_record, is_closed
from enm.models import Bay, EnergyNetworkModel
from enm.pola import KLUCZ_POLA_WYTWORCY, poziom_pol
from enm.topology import (
    TYPY_LACZNIKOW_ENM,
    PodzialKrawedzi,
    TopologyView,
    derive,
    podziel_krawedzie,
)
from enm.tor_pola import szyny_stacji
from network_model.core.topologia import drogi_proste
from pydantic import BaseModel, ConfigDict

PODSTAWA_TOPOLOGII = "topologia_laczeniowa"
OPIS_PODSTAWY = (
    "Zasilenie wyznaczone z topologii łączeniowej modelu sieci: stany łączników zapisane w "
    "modelu, gałęzie w ruchu i transformatory, źródła sieciowe. To nie jest wynik obliczeń "
    "napięciowych (rozpływu ani zwarć) i nie oznacza stanu „pod napięciem” z wyniku."
)
#: Najwięcej dróg oddawanych na jedno źródło (sieć oczkowa ma ich wykładniczo wiele).
LIMIT_DROG_NA_ZRODLO = 16
#: Najwięcej krawędzi rozpatrzonych przy wyliczaniu dróg z jednego źródła.
BUDZET_KROKOW_NA_ZRODLO = 200_000

StanZasilenia = Literal["zasilany", "niezasilany", "nierozstrzygniety"]
StanLacznika = Literal["zamkniety", "otwarty", "nieustalony"]
RodzajElementu = Literal[
    "szyna",
    "odcinek",
    "lacznik",
    "transformator",
    "zrodlo",
    "generator",
    "odbior",
    "kondensator",
    "pole",
    "stacja",
]
#: Kolejność rodzajów w odpowiedziach (stabilna, czytelna dla inżyniera).
KOLEJNOSC_RODZAJOW: tuple[str, ...] = (
    "zrodlo",
    "szyna",
    "odcinek",
    "lacznik",
    "transformator",
    "generator",
    "odbior",
    "kondensator",
    "pole",
    "stacja",
)

KOD_WYSPA_BEZ_ZRODLA = "WYSPA_BEZ_ZRODLA_SIECIOWEGO"
KOD_LACZNIK_NIEUSTALONY = "LACZNIK_STAN_NIEUSTALONY"
KOD_PETLA = "PETLA_BEZ_PUNKTU_PODZIALU"
KOD_PUNKT_PODZIALU_ZAMKNIETY = "PUNKT_PODZIALU_ZAMKNIETY"
KOD_LIMIT_DROG = "LIMIT_DROG_PRZEKROCZONY"
KOD_STAN_APARATU_NIEZNANY = "STAN_APARATU_NIEZNANY"
KOD_AWARIA_APARATU = "AWARIA_APARATU"
KOD_ROZBIEZNOSC_STANU = "ROZBIEZNOSC_STANU_LACZNIKA"


# ---------------------------------------------------------------------------
# Kontrakt odpowiedzi
# ---------------------------------------------------------------------------


class _Kontrakt(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class PrzyczynaTopologii(_Kontrakt):
    """Przyczyna stanu (niezasilenia, nierozstrzygnięcia) z elementami, które ją niosą."""

    kod: str
    opis: str
    elementy: list[str] = []


class StronaElementu(_Kontrakt):
    """Stan zasilenia jednej szyny, do której element jest dołączony."""

    szyna_ref: str
    stan: StanZasilenia
    zrodla: list[str] = []


class StanZasileniaElementu(_Kontrakt):
    ref_id: str
    rodzaj: RodzajElementu
    #: Typ ENM (np. ``cable``, ``breaker``, ``gpz``, rola pola) — doprecyzowanie rodzaju.
    typ: str | None = None
    nazwa: str
    stan: StanZasilenia
    #: Źródła sieciowe zasilające element PEWNIE (bez łączników nieustalonych).
    zrodla: list[str] = []
    #: Źródła, które zasilają element tylko przy zamknięciu łączników nieustalonych.
    zrodla_warunkowe: list[str] = []
    #: Status ``open`` elementu w modelu (gałąź, kondensator) — element nie łączy.
    otwarty: bool = False
    #: Stan łącznika (tylko rodzaj ``lacznik``).
    stan_lacznika: StanLacznika | None = None
    #: Indeksy wysp modelu (``wyspy``), do których element jest dołączony.
    wyspy: list[int] = []
    #: Stan per szyna — dla elementów dołączonych do więcej niż jednej szyny.
    strony: list[StronaElementu] = []
    przyczyny: list[PrzyczynaTopologii] = []


class WyspaTopologiczna(_Kontrakt):
    indeks: int
    szyny: list[str]
    zrodla_sieciowe: list[str]
    generatory: list[str]
    zasilona: bool


class LacznikNieustalony(_Kontrakt):
    ref_id: str
    nazwa: str
    stan_w_modelu: Literal["zamkniety", "otwarty"]
    #: ``actual_state`` rekordu aparatu (``nieznany``, ``awaria``, ``zamkniety``…).
    stan_zgloszony: str
    aparat_ref: str
    pole_ref: str
    przyczyna: PrzyczynaTopologii


class StanZasileniaOdpowiedz(_Kontrakt):
    case_id: str
    enm_revision: int
    enm_hash: str
    podstawa: Literal["topologia_laczeniowa"]
    opis_podstawy: str
    elementy: list[StanZasileniaElementu]
    wyspy: list[WyspaTopologiczna]
    laczniki_otwarte: list[str]
    galezie_otwarte: list[str]
    laczniki_nieustalone: list[LacznikNieustalony]
    krawedzie_pominiete: list[str]


class OdnosnikElementu(_Kontrakt):
    ref_id: str
    rodzaj: RodzajElementu
    typ: str | None = None
    nazwa: str


class ElementDrogi(_Kontrakt):
    ref_id: str
    rodzaj: RodzajElementu
    typ: str | None = None
    nazwa: str
    stan_lacznika: StanLacznika | None = None
    pole_ref: str | None = None
    stacja_ref: str | None = None


class DrogaZasilania(_Kontrakt):
    zrodlo_ref: str
    #: ``False`` — droga prowadzi przez łącznik nieustalony (``laczniki_nieustalone``).
    pewna: bool
    elementy: list[ElementDrogi]
    laczniki_nieustalone: list[str] = []


class PrzekladnikPola(_Kontrakt):
    ref_id: str
    nazwa: str
    rodzaj: Literal["CT", "VT"]
    pole_ref: str | None = None


class ZabezpieczeniePola(_Kontrakt):
    ref_id: str
    nazwa: str
    rodzaj: str
    wylacznik_ref: str
    aktywne: bool


class SasiedztwoElementu(_Kontrakt):
    #: ``False`` — element nie ma drogi od źródła, więc kierunek „poprzedni/następny"
    #: jest nieustalony: wszyscy sąsiedzi są w ``nastepne``.
    kierunek_ustalony: bool
    poprzednie: list[OdnosnikElementu]
    nastepne: list[OdnosnikElementu]
    pola_wejsciowe: list[OdnosnikElementu]
    pola_wyjsciowe: list[OdnosnikElementu]
    pole: OdnosnikElementu | None = None
    stacja: OdnosnikElementu | None = None
    przekladniki: list[PrzekladnikPola] = []
    zabezpieczenia: list[ZabezpieczeniePola] = []


class TorElementuOdpowiedz(_Kontrakt):
    case_id: str
    enm_revision: int
    enm_hash: str
    podstawa: Literal["topologia_laczeniowa"]
    opis_podstawy: str
    element: OdnosnikElementu
    stan: StanZasilenia
    status: Literal["rozstrzygniety", "nierozstrzygniety", "brak_drogi"]
    przyczyny: list[PrzyczynaTopologii]
    drogi: list[DrogaZasilania]
    drogi_obciete: bool
    sasiedztwo: SasiedztwoElementu


class ElementNieistniejeError(LookupError):
    """Wskazany ``ref_id`` nie jest elementem modelu, dla którego istnieje tor."""

    def __init__(self, ref_id: str) -> None:
        super().__init__(f"Element {ref_id!r} nie istnieje w modelu sieci")
        self.ref_id = ref_id


# ---------------------------------------------------------------------------
# Rejestr elementów i wariantów migawki
# ---------------------------------------------------------------------------


@dataclass
class _Element:
    ref_id: str
    rodzaj: RodzajElementu
    typ: str | None
    nazwa: str
    #: Szyny, przez które element jest dołączony do grafu (kotwice drogi).
    kotwice: tuple[str, ...]
    #: Elementy grafu należące do elementu (zacisk i aparaty pola, szyny stacji…).
    czesc: frozenset[str] = frozenset()
    otwarty: bool = False

    def odnosnik(self) -> OdnosnikElementu:
        return OdnosnikElementu(
            ref_id=self.ref_id, rodzaj=self.rodzaj, typ=self.typ, nazwa=self.nazwa
        )


@dataclass(frozen=True)
class _Nieustalony:
    ref_id: str
    nazwa: str
    stan_w_modelu: Literal["zamkniety", "otwarty"]
    stan_zgloszony: str
    aparat_ref: str
    pole_ref: str
    kod: str
    opis: str


@dataclass
class _Kontekst:
    enm: EnergyNetworkModel
    elementy: dict[str, _Element]
    widok: TopologyView
    pewne: TopologyView
    mozliwe: TopologyView
    podzial_mozliwy: PodzialKrawedzi
    nieustalone: dict[str, _Nieustalony]
    #: element grafu (szyna, gałąź, transformator, przyłączony) → sąsiedzi w grafie elementów.
    sasiedzi: dict[str, list[str]]
    pole_elementu: dict[str, str]
    stacja_szyny: dict[str, str]
    stacja_elementu: dict[str, str]
    pola: dict[str, Bay]
    _wyspa_szyny: dict[int, dict[str, int]] = field(default_factory=dict)
    _granice: dict[int, list[str]] = field(default_factory=dict)
    _nieustalone_wysp: dict[int, list[str]] = field(default_factory=dict)

    def wyspa(self, widok: TopologyView, szyna: str) -> int | None:
        mapa = self._wyspa_szyny.get(id(widok))
        if mapa is None:
            mapa = {s: i for i, w in enumerate(widok.wyspy) for s in w.szyny}
            self._wyspa_szyny[id(widok)] = mapa
        return mapa.get(szyna)

    def zrodla_szyny(self, widok: TopologyView, szyna: str) -> tuple[str, ...]:
        indeks = self.wyspa(widok, szyna)
        return () if indeks is None else widok.wyspy[indeks].zrodla_sieciowe


def _klucz_elementu(element: _Element) -> tuple[int, str]:
    return (KOLEJNOSC_RODZAJOW.index(element.rodzaj), element.ref_id)


def _nieustalone_laczniki(enm: EnergyNetworkModel) -> dict[str, _Nieustalony]:
    """Łączniki, których stanu model nie rozstrzyga (rekord aparatu pola: nieznany, awaria,
    sprzeczny z ``status`` gałęzi). Pierwszy rekord w kolejności pól i aparatów wygrywa."""
    laczniki = {g.ref_id: g for g in enm.branches if g.type in TYPY_LACZNIKOW_ENM}
    wynik: dict[str, _Nieustalony] = {}
    for bay in sorted(enm.bays, key=lambda b: b.ref_id):
        for aparat in bay.primary_devices:
            if aparat.kind not in MAIN_SWITCH_KINDS:
                continue
            ref = aparat.linked_ref if aparat.linked_ref in laczniki else aparat.device_ref
            galaz = laczniki.get(ref)
            if galaz is None or ref in wynik:
                continue
            rekord = device_state_record(bay, aparat)
            if rekord is None:
                continue
            w_modelu: Literal["zamkniety", "otwarty"] = (
                "zamkniety" if galaz.status == "closed" else "otwarty"
            )
            zgloszony = rekord.actual_state
            if zgloszony == "nieznany":
                kod, opis = (
                    KOD_STAN_APARATU_NIEZNANY,
                    f"Rekord stanu aparatu {aparat.device_ref} pola {bay.ref_id} ma stan "
                    f"„nieznany” — model nie rozstrzyga, czy łącznik {ref} łączy.",
                )
            elif zgloszony == "awaria":
                kod, opis = (
                    KOD_AWARIA_APARATU,
                    f"Rekord stanu aparatu {aparat.device_ref} pola {bay.ref_id} zgłasza awarię "
                    f"— model nie rozstrzyga, czy łącznik {ref} łączy.",
                )
            elif is_closed(zgloszony) != (galaz.status == "closed"):
                kod, opis = (
                    KOD_ROZBIEZNOSC_STANU,
                    f"Łącznik {ref} jest w modelu {w_modelu}, a rekord stanu aparatu "
                    f"{aparat.device_ref} pola {bay.ref_id} mówi „{zgloszony}” — model nie "
                    "rozstrzyga stanu łączeniowego.",
                )
            else:
                continue
            wynik[ref] = _Nieustalony(
                ref_id=ref,
                nazwa=galaz.name,
                stan_w_modelu=w_modelu,
                stan_zgloszony=zgloszony,
                aparat_ref=aparat.device_ref,
                pole_ref=bay.ref_id,
                kod=kod,
                opis=opis,
            )
    return dict(sorted(wynik.items()))


def _wariant(enm: EnergyNetworkModel, laczniki: Iterable[str], status: str) -> dict[str, Any]:
    """Migawka do ``derive`` z łącznikami ``laczniki`` ustawionymi na ``status``."""
    zmieniane = set(laczniki)
    return {
        "buses": enm.buses,
        "branches": [
            g.model_copy(update={"status": status}) if g.ref_id in zmieniane else g
            for g in enm.branches
        ],
        "transformers": enm.transformers,
        "sources": enm.sources,
        "generators": enm.generators,
    }


def _zbuduj_kontekst(enm: EnergyNetworkModel) -> _Kontekst:
    szyny = {b.ref_id for b in enm.buses}
    elementy: dict[str, _Element] = {}

    def dodaj(element: _Element) -> None:
        elementy.setdefault(element.ref_id, element)

    for bus in enm.buses:
        dodaj(_Element(bus.ref_id, "szyna", None, bus.name, (bus.ref_id,), frozenset({bus.ref_id})))
    for galaz in enm.branches:
        rodzaj: RodzajElementu = "lacznik" if galaz.type in TYPY_LACZNIKOW_ENM else "odcinek"
        kotwice = tuple(s for s in (galaz.from_bus_ref, galaz.to_bus_ref) if s in szyny)
        dodaj(
            _Element(
                galaz.ref_id,
                rodzaj,
                galaz.type,
                galaz.name,
                tuple(dict.fromkeys(kotwice)),
                frozenset({galaz.ref_id}),
                otwarty=galaz.status != "closed",
            )
        )
    for trafo in enm.transformers:
        kotwice = tuple(s for s in (trafo.hv_bus_ref, trafo.lv_bus_ref) if s in szyny)
        dodaj(
            _Element(
                trafo.ref_id,
                "transformator",
                None,
                trafo.name,
                tuple(dict.fromkeys(kotwice)),
                frozenset({trafo.ref_id}),
            )
        )
    przylaczone: list[tuple[str, RodzajElementu, str | None, str, str, bool]] = []
    przylaczone += [(s.ref_id, "zrodlo", None, s.name, s.bus_ref, False) for s in enm.sources]
    przylaczone += [
        (g.ref_id, "generator", g.gen_type, g.name, g.bus_ref, False) for g in enm.generators
    ]
    przylaczone += [(o.ref_id, "odbior", None, o.name, o.bus_ref, False) for o in enm.loads]
    przylaczone += [
        (k.ref_id, "kondensator", None, k.name, k.bus_ref, k.status != "closed")
        for k in enm.shunt_capacitors
    ]
    for ref, rodzaj_p, typ, nazwa, szyna, otwarty in przylaczone:
        kotwice = (szyna,) if szyna in szyny else ()
        dodaj(_Element(ref, rodzaj_p, typ, nazwa, kotwice, frozenset({ref}), otwarty=otwarty))

    galezie = {g.ref_id: g for g in enm.branches}
    pola = {b.ref_id: b for b in enm.bays}
    for bay in sorted(enm.bays, key=lambda b: b.ref_id):
        aparaty = sorted(
            {
                r
                for r in [
                    *bay.equipment_refs,
                    *(d.linked_ref or d.device_ref for d in bay.primary_devices),
                ]
                if r in galezie and galezie[r].type in TYPY_LACZNIKOW_ENM
            }
        )
        czesc = set(aparaty)
        kotwice_pola = [bay.bus_ref]
        if bay.terminal_bus_ref:
            czesc.add(bay.terminal_bus_ref)
            kotwice_pola.append(bay.terminal_bus_ref)
        for ref in aparaty:
            kotwice_pola += [galezie[ref].from_bus_ref, galezie[ref].to_bus_ref]
        dodaj(
            _Element(
                bay.ref_id,
                "pole",
                bay.bay_role,
                bay.name,
                tuple(sorted({s for s in kotwice_pola if s in szyny})),
                frozenset(czesc),
            )
        )

    poziom = poziom_pol(enm)
    stacja_szyny: dict[str, str] = {}
    for stacja in sorted(enm.substations, key=lambda s: s.ref_id):
        szyny_st = sorted(s for s in szyny_stacji(enm, stacja, poziom) if s in szyny)
        for s in szyny_st:
            stacja_szyny.setdefault(s, stacja.ref_id)
        zbior = set(szyny_st)
        wewnetrzne = {
            g.ref_id for g in enm.branches if g.from_bus_ref in zbior and g.to_bus_ref in zbior
        } | {t.ref_id for t in enm.transformers if t.hv_bus_ref in zbior and t.lv_bus_ref in zbior}
        dodaj(
            _Element(
                stacja.ref_id,
                "stacja",
                stacja.station_type,
                stacja.name,
                tuple(szyny_st),
                frozenset(zbior | wewnetrzne),
            )
        )

    # Graf elementów: szyna ↔ gałąź/transformator/przyłączony.
    sasiedzi_zb: dict[str, set[str]] = {}

    def polacz(a: str, b: str) -> None:
        sasiedzi_zb.setdefault(a, set()).add(b)
        sasiedzi_zb.setdefault(b, set()).add(a)

    for galaz in enm.branches:
        for s in (galaz.from_bus_ref, galaz.to_bus_ref):
            if s in szyny:
                polacz(galaz.ref_id, s)
    for trafo in enm.transformers:
        for s in (trafo.hv_bus_ref, trafo.lv_bus_ref):
            if s in szyny:
                polacz(trafo.ref_id, s)
    for ref, _r, _t, _n, szyna, _o in przylaczone:
        if szyna in szyny:
            polacz(ref, szyna)
    sasiedzi = {k: sorted(v) for k, v in sorted(sasiedzi_zb.items())}

    # Przynależność do pola: aparat/transformator/źródło (`equipment_refs`), aparat pierwotny,
    # zacisk pola, pole wytwórcy, przekładnik.
    pole_elementu: dict[str, str] = {}
    for bay in sorted(enm.bays, key=lambda b: b.ref_id):
        pole_elementu.setdefault(bay.ref_id, bay.ref_id)
        for ref in bay.equipment_refs:
            pole_elementu.setdefault(ref, bay.ref_id)
        for aparat in bay.primary_devices:
            if aparat.linked_ref:
                pole_elementu.setdefault(aparat.linked_ref, bay.ref_id)
        if bay.terminal_bus_ref:
            pole_elementu.setdefault(bay.terminal_bus_ref, bay.ref_id)
    for gen in enm.generators:
        pole_gen = gen.meta.get(KLUCZ_POLA_WYTWORCY) if isinstance(gen.meta, Mapping) else None
        if isinstance(pole_gen, str) and pole_gen in pola:
            pole_elementu.setdefault(gen.ref_id, pole_gen)
    for pomiar in enm.measurements:
        if pomiar.bay_ref in pola:
            pole_elementu.setdefault(pomiar.ref_id, str(pomiar.bay_ref))

    stacja_elementu: dict[str, str] = dict(stacja_szyny)
    for stacja in enm.substations:
        stacja_elementu.setdefault(stacja.ref_id, stacja.ref_id)
        for ref in stacja.transformer_refs:
            stacja_elementu.setdefault(ref, stacja.ref_id)
    for bay in enm.bays:
        if bay.substation_ref:
            stacja_elementu.setdefault(bay.ref_id, bay.substation_ref)
    for element in elementy.values():
        if element.ref_id in stacja_elementu:
            continue
        pole_el = pole_elementu.get(element.ref_id)
        if pole_el is not None and pole_el in stacja_elementu:
            stacja_elementu[element.ref_id] = stacja_elementu[pole_el]
            continue
        stacje = {stacja_szyny.get(s) for s in element.kotwice}
        if len(stacje) == 1 and None not in stacje:
            stacja_elementu[element.ref_id] = str(next(iter(stacje)))

    nieustalone = _nieustalone_laczniki(enm)
    widok = derive(enm)
    if nieustalone:
        pewne = derive(_wariant(enm, nieustalone, "open"))
        snapshot_mozliwy = _wariant(enm, nieustalone, "closed")
        mozliwe = derive(snapshot_mozliwy)
        podzial_mozliwy = podziel_krawedzie(snapshot_mozliwy)
    else:
        pewne = mozliwe = widok
        podzial_mozliwy = podziel_krawedzie(enm)

    return _Kontekst(
        enm=enm,
        elementy=elementy,
        widok=widok,
        pewne=pewne,
        mozliwe=mozliwe,
        podzial_mozliwy=podzial_mozliwy,
        nieustalone=nieustalone,
        sasiedzi=sasiedzi,
        pole_elementu=pole_elementu,
        stacja_szyny=stacja_szyny,
        stacja_elementu=stacja_elementu,
        pola=pola,
    )


# ---------------------------------------------------------------------------
# Stan zasilenia
# ---------------------------------------------------------------------------


def _scal_przyczyny(przyczyny: Iterable[PrzyczynaTopologii]) -> list[PrzyczynaTopologii]:
    """Jedna przyczyna na kod: elementy zsumowane, opis pierwszego wystąpienia."""
    wg_kodu: dict[str, tuple[str, set[str]]] = {}
    for p in przyczyny:
        opis, elementy = wg_kodu.setdefault(p.kod, (p.opis, set()))
        elementy.update(p.elementy)
    return [
        PrzyczynaTopologii(kod=kod, opis=opis, elementy=sorted(elementy))
        for kod, (opis, elementy) in sorted(wg_kodu.items())
    ]


def _nieustalone_w_wyspie(kontekst: _Kontekst, szyna: str) -> list[str]:
    """Łączniki nieustalone, których koniec leży w wyspie wariantu „możliwe" szyny."""
    indeks = kontekst.wyspa(kontekst.mozliwe, szyna)
    if indeks is None:
        return []
    if indeks not in kontekst._nieustalone_wysp:
        galezie = {g.ref_id: g for g in kontekst.enm.branches}
        kontekst._nieustalone_wysp[indeks] = [
            ref
            for ref in kontekst.nieustalone
            if kontekst.wyspa(kontekst.mozliwe, galezie[ref].from_bus_ref) == indeks
            or kontekst.wyspa(kontekst.mozliwe, galezie[ref].to_bus_ref) == indeks
        ]
    return kontekst._nieustalone_wysp[indeks]


def _granica_wyspy(kontekst: _Kontekst, szyna: str) -> list[str]:
    """Otwarte gałęzie i łączniki z końcem w wyspie modelu szyny (gdzie wyspa się urywa)."""
    indeks = kontekst.wyspa(kontekst.widok, szyna)
    if indeks is None:
        return []
    if not kontekst._granice and (
        kontekst.widok.laczniki_otwarte or kontekst.widok.galezie_otwarte
    ):
        otwarte = set(kontekst.widok.laczniki_otwarte) | set(kontekst.widok.galezie_otwarte)
        granice: dict[int, set[str]] = {}
        for g in kontekst.enm.branches:
            if g.ref_id not in otwarte:
                continue
            for koniec in (g.from_bus_ref, g.to_bus_ref):
                i = kontekst.wyspa(kontekst.widok, koniec)
                if i is not None:
                    granice.setdefault(i, set()).add(g.ref_id)
        kontekst._granice.update({i: sorted(r) for i, r in granice.items()})
    return kontekst._granice.get(indeks, [])


def _stan_szyny(kontekst: _Kontekst, szyna: str) -> StronaElementu:
    pewne = kontekst.zrodla_szyny(kontekst.pewne, szyna)
    mozliwe = kontekst.zrodla_szyny(kontekst.mozliwe, szyna)
    stan: StanZasilenia = (
        "zasilany" if pewne else ("nierozstrzygniety" if mozliwe else "niezasilany")
    )
    return StronaElementu(szyna_ref=szyna, stan=stan, zrodla=list(pewne))


def _przyczyny_szyny(kontekst: _Kontekst, szyna: str) -> list[PrzyczynaTopologii]:
    pewne = set(kontekst.zrodla_szyny(kontekst.pewne, szyna))
    mozliwe = set(kontekst.zrodla_szyny(kontekst.mozliwe, szyna))
    if mozliwe - pewne:
        laczniki = _nieustalone_w_wyspie(kontekst, szyna)
        return [
            PrzyczynaTopologii(
                kod=KOD_LACZNIK_NIEUSTALONY,
                opis=(
                    "Zasilenie ze źródeł "
                    + ", ".join(sorted(mozliwe - pewne))
                    + " zależy od łączników, których stanu model nie rozstrzyga."
                ),
                elementy=laczniki,
            )
        ]
    if mozliwe:
        return []
    indeks = kontekst.wyspa(kontekst.widok, szyna)
    generatory = list(kontekst.widok.wyspy[indeks].generatory) if indeks is not None else []
    opis = "Element leży w wyspie bez źródła sieciowego"
    granica = _granica_wyspy(kontekst, szyna)
    if granica:
        opis += "; wyspę ograniczają otwarte elementy: " + ", ".join(granica)
    if generatory:
        opis += (
            "; generatory wyspy (" + ", ".join(generatory) + ") nie są źródłem sieciowym "
            "— topologia łączeniowa nie traktuje ich jako zasilania"
        )
    return [PrzyczynaTopologii(kod=KOD_WYSPA_BEZ_ZRODLA, opis=opis + ".", elementy=granica)]


def _stan_elementu(kontekst: _Kontekst, element: _Element) -> StanZasileniaElementu:
    strony = [_stan_szyny(kontekst, s) for s in element.kotwice]
    pewne = sorted({z for s in element.kotwice for z in kontekst.zrodla_szyny(kontekst.pewne, s)})
    mozliwe = sorted(
        {z for s in element.kotwice for z in kontekst.zrodla_szyny(kontekst.mozliwe, s)}
    )
    stan: StanZasilenia = (
        "zasilany" if pewne else ("nierozstrzygniety" if mozliwe else "niezasilany")
    )
    przyczyny: list[PrzyczynaTopologii] = []
    if not element.kotwice:
        przyczyny.append(
            PrzyczynaTopologii(
                kod=KOD_WYSPA_BEZ_ZRODLA,
                opis="Element nie jest dołączony do żadnej szyny modelu.",
                elementy=[],
            )
        )
    elif stan == "zasilany":
        if set(mozliwe) - set(pewne):
            for s in element.kotwice:
                przyczyny += _przyczyny_szyny(kontekst, s)
    elif stan == "nierozstrzygniety":
        for s in element.kotwice:
            przyczyny += [
                p for p in _przyczyny_szyny(kontekst, s) if p.kod == KOD_LACZNIK_NIEUSTALONY
            ]
    else:
        for s in element.kotwice:
            przyczyny += _przyczyny_szyny(kontekst, s)
    stan_lacznika: StanLacznika | None = None
    if element.rodzaj == "lacznik":
        stan_lacznika = (
            "nieustalony"
            if element.ref_id in kontekst.nieustalone
            else ("otwarty" if element.otwarty else "zamkniety")
        )
    wyspy = sorted(
        {i for s in element.kotwice if (i := kontekst.wyspa(kontekst.widok, s)) is not None}
    )
    return StanZasileniaElementu(
        ref_id=element.ref_id,
        rodzaj=element.rodzaj,
        typ=element.typ,
        nazwa=element.nazwa,
        stan=stan,
        zrodla=pewne,
        zrodla_warunkowe=[z for z in mozliwe if z not in pewne],
        otwarty=element.otwarty,
        stan_lacznika=stan_lacznika,
        wyspy=wyspy,
        strony=strony if len(strony) > 1 else [],
        przyczyny=_scal_przyczyny(przyczyny),
    )


def zbuduj_stan_zasilenia(case_id: str, enm: EnergyNetworkModel) -> StanZasileniaOdpowiedz:
    """Stan zasilenia KAŻDEGO elementu ENM z topologii łączeniowej (patrz docstring modułu)."""
    kontekst = _zbuduj_kontekst(enm)
    elementy = sorted(kontekst.elementy.values(), key=_klucz_elementu)
    return StanZasileniaOdpowiedz(
        case_id=case_id,
        enm_revision=enm.header.revision,
        enm_hash=enm.header.hash_sha256,
        podstawa=PODSTAWA_TOPOLOGII,
        opis_podstawy=OPIS_PODSTAWY,
        elementy=[_stan_elementu(kontekst, e) for e in elementy],
        wyspy=[
            WyspaTopologiczna(
                indeks=i,
                szyny=list(w.szyny),
                zrodla_sieciowe=list(w.zrodla_sieciowe),
                generatory=list(w.generatory),
                zasilona=w.zasilona,
            )
            for i, w in enumerate(kontekst.widok.wyspy)
        ],
        laczniki_otwarte=list(kontekst.widok.laczniki_otwarte),
        galezie_otwarte=list(kontekst.widok.galezie_otwarte),
        laczniki_nieustalone=[
            LacznikNieustalony(
                ref_id=n.ref_id,
                nazwa=n.nazwa,
                stan_w_modelu=n.stan_w_modelu,
                stan_zgloszony=n.stan_zgloszony,
                aparat_ref=n.aparat_ref,
                pole_ref=n.pole_ref,
                przyczyna=PrzyczynaTopologii(kod=n.kod, opis=n.opis, elementy=[n.ref_id]),
            )
            for n in kontekst.nieustalone.values()
        ],
        krawedzie_pominiete=list(kontekst.widok.krawedzie_pominiete),
    )


# ---------------------------------------------------------------------------
# Tor zasilania i sąsiedztwo
# ---------------------------------------------------------------------------


def _element_drogi(
    kontekst: _Kontekst, ref: str, stan_lacznika: StanLacznika | None = None
) -> ElementDrogi:
    element = kontekst.elementy[ref]
    if stan_lacznika is None and element.rodzaj == "lacznik":
        stan_lacznika = "nieustalony" if ref in kontekst.nieustalone else "zamkniety"
    return ElementDrogi(
        ref_id=ref,
        rodzaj=element.rodzaj,
        typ=element.typ,
        nazwa=element.nazwa,
        stan_lacznika=stan_lacznika,
        pole_ref=kontekst.pole_elementu.get(ref),
        stacja_ref=kontekst.stacja_elementu.get(ref),
    )


def _drogi(
    kontekst: _Kontekst, cel: _Element
) -> tuple[list[DrogaZasilania], list[PrzyczynaTopologii], bool]:
    kotwice = set(cel.kotwice)
    pomijane = cel.czesc
    sasiedztwo: dict[str, list[tuple[str, str]]] = {}
    for k in kontekst.podzial_mozliwy.w_ruchu:
        if k.ref_id in pomijane:
            continue
        sasiedztwo.setdefault(k.szyna_a, []).append((k.ref_id, k.szyna_b))
        sasiedztwo.setdefault(k.szyna_b, []).append((k.ref_id, k.szyna_a))
    for lista in sasiedztwo.values():
        lista.sort()

    def sasiedzi(szyna: str) -> list[tuple[str, str]]:
        return sasiedztwo.get(szyna, [])

    wyspy_celu = {i for s in kotwice if (i := kontekst.wyspa(kontekst.mozliwe, s)) is not None}
    drogi: list[DrogaZasilania] = []
    przyczyny: list[PrzyczynaTopologii] = []
    obciete = False
    for zrodlo in sorted(kontekst.enm.sources, key=lambda s: s.ref_id):
        if kontekst.wyspa(kontekst.mozliwe, zrodlo.bus_ref) not in wyspy_celu:
            continue
        if zrodlo.ref_id == cel.ref_id:
            drogi.append(
                DrogaZasilania(
                    zrodlo_ref=zrodlo.ref_id,
                    pewna=True,
                    elementy=[_element_drogi(kontekst, cel.ref_id)],
                )
            )
            continue
        kroki_drog, kompletne = drogi_proste(
            zrodlo.bus_ref,
            kotwice,
            sasiedzi,
            limit=LIMIT_DROG_NA_ZRODLO,
            budzet_krokow=BUDZET_KROKOW_NA_ZRODLO,
        )
        if not kompletne:
            obciete = True
            przyczyny.append(
                PrzyczynaTopologii(
                    kod=KOD_LIMIT_DROG,
                    opis=(
                        f"Od źródła {zrodlo.ref_id} istnieje więcej dróg prostych niż "
                        f"{len(kroki_drog)} wyliczonych (granica {LIMIT_DROG_NA_ZRODLO} dróg, "
                        f"{BUDZET_KROKOW_NA_ZRODLO} kroków przeglądu) — lista dróg jest obcięta."
                    ),
                    elementy=[zrodlo.ref_id],
                )
            )
        drogi_zrodla: list[DrogaZasilania] = []
        for kroki in kroki_drog:
            refy = [zrodlo.ref_id, zrodlo.bus_ref]
            for _od, krawedz, do in kroki:
                refy += [krawedz, do]
            elementy_drogi = [_element_drogi(kontekst, r) for r in refy]
            if cel.rodzaj != "szyna":
                stan_celu: StanLacznika | None = None
                if cel.rodzaj == "lacznik":
                    stan_celu = (
                        "nieustalony"
                        if cel.ref_id in kontekst.nieustalone
                        else ("otwarty" if cel.otwarty else "zamkniety")
                    )
                elementy_drogi.append(_element_drogi(kontekst, cel.ref_id, stan_celu))
            nieustalone = sorted({k for _o, k, _d in kroki if k in kontekst.nieustalone})
            drogi_zrodla.append(
                DrogaZasilania(
                    zrodlo_ref=zrodlo.ref_id,
                    pewna=not nieustalone,
                    elementy=elementy_drogi,
                    laczniki_nieustalone=nieustalone,
                )
            )
        pewne = [d for d in drogi_zrodla if d.pewna]
        if len(pewne) > 1:
            zbiory = [{e.ref_id for e in d.elementy} for d in pewne]
            wspolne = set(zbiory[0]).intersection(*zbiory[1:])
            petla = sorted(set().union(*zbiory) - wspolne)
            przyczyny.append(
                PrzyczynaTopologii(
                    kod=KOD_PETLA,
                    opis=(
                        f"Od źródła {zrodlo.ref_id} do elementu prowadzi {len(pewne)}"
                        f"{' lub więcej' if not kompletne else ''} dróg przez zamknięte "
                        "elementy — pętla bez punktu podziału; tor nie jest jednoznaczny."
                    ),
                    elementy=petla,
                )
            )
            for korytarz in sorted(kontekst.enm.corridors, key=lambda c: c.ref_id):
                if korytarz.no_point_ref and korytarz.no_point_ref in petla:
                    przyczyny.append(
                        PrzyczynaTopologii(
                            kod=KOD_PUNKT_PODZIALU_ZAMKNIETY,
                            opis=(
                                f"Magistrala {korytarz.ref_id} wskazuje punkt podziału "
                                f"{korytarz.no_point_ref}, ale ten element jest w modelu "
                                "zamknięty — o stanie łączeniowym rozstrzyga model, nie "
                                "deklaracja magistrali."
                            ),
                            elementy=[korytarz.no_point_ref, korytarz.ref_id],
                        )
                    )
        drogi += drogi_zrodla
    warunkowe = sorted({r for d in drogi for r in d.laczniki_nieustalone})
    if warunkowe:
        przyczyny.append(
            PrzyczynaTopologii(
                kod=KOD_LACZNIK_NIEUSTALONY,
                opis=(
                    "Część dróg prowadzi przez łączniki, których stanu model nie rozstrzyga "
                    "— te drogi są warunkowe."
                ),
                elementy=warunkowe,
            )
        )
    drogi.sort(
        key=lambda d: (d.zrodlo_ref, not d.pewna, len(d.elementy), [e.ref_id for e in d.elementy])
    )
    return drogi, _scal_przyczyny(przyczyny), obciete


def _odnosniki(kontekst: _Kontekst, refy: Iterable[str]) -> list[OdnosnikElementu]:
    elementy = [kontekst.elementy[r] for r in set(refy) if r in kontekst.elementy]
    return [e.odnosnik() for e in sorted(elementy, key=_klucz_elementu)]


def _sasiedztwo(
    kontekst: _Kontekst, cel: _Element, drogi: Sequence[DrogaZasilania]
) -> SasiedztwoElementu:
    czesc = set(cel.czesc) | {cel.ref_id}
    sasiedzi: set[str] = set()
    for ref in czesc:
        sasiedzi.update(kontekst.sasiedzi.get(ref, []))
    if cel.rodzaj == "pole":
        sasiedzi.add(kontekst.pola[cel.ref_id].bus_ref)
    sasiedzi -= czesc

    poprzednie: set[str] = set()
    for droga in drogi:
        for element in reversed(droga.elementy):
            if element.ref_id not in czesc:
                poprzednie.add(element.ref_id)
                break
    nastepne = sasiedzi - poprzednie

    # Pole wejściowe: pierwsze pole (inne niż sam cel) wstecz po drodze — dla transformatora
    # w polu TR to samo pole TR (przez nie dochodzi zasilanie), dla pola IN — pole OUT stacji
    # zasilającej. Pola wyjściowe: pola następnych elementów.
    wlasne_pole = kontekst.pole_elementu.get(cel.ref_id)
    pola_wejsciowe: set[str] = set()
    for droga in drogi:
        for element in reversed(droga.elementy):
            if element.ref_id in czesc:
                continue
            pole_drogi = kontekst.pole_elementu.get(element.ref_id)
            if pole_drogi is not None and pole_drogi != cel.ref_id:
                pola_wejsciowe.add(pole_drogi)
                break
    pola_wyjsciowe = {
        p for r in nastepne if (p := kontekst.pole_elementu.get(r)) is not None and p != cel.ref_id
    } - pola_wejsciowe

    pole_ref = wlasne_pole
    przekladniki: list[PrzekladnikPola] = []
    zabezpieczenia: list[ZabezpieczeniePola] = []
    enm = kontekst.enm
    pole: Bay | None = None
    aparaty: set[str] = set()
    if pole_ref is not None:
        pole = kontekst.pola[pole_ref]
        wyposazenie = set(pole.equipment_refs)
        aparaty = (
            wyposazenie
            | {d.device_ref for d in pole.primary_devices}
            | {d.linked_ref for d in pole.primary_devices if d.linked_ref}
        )
        pomiary = [m for m in enm.measurements if m.bay_ref == pole_ref or m.ref_id in wyposazenie]
    else:
        pomiary = (
            [m for m in enm.measurements if m.bus_ref == cel.ref_id and m.bay_ref is None]
            if cel.rodzaj == "szyna"
            else []
        )
    refy_pomiarow = {m.ref_id for m in pomiary}
    for m in sorted(pomiary, key=lambda m: m.ref_id):
        przekladniki.append(
            PrzekladnikPola(
                ref_id=m.ref_id, nazwa=m.name, rodzaj=m.measurement_type, pole_ref=m.bay_ref
            )
        )
    for pa in sorted(enm.protection_assignments, key=lambda p: p.ref_id):
        przekladniki_pa = {pa.ct_ref, pa.vt_ref, *pa.ct_refs_secondary}
        if (
            pa.breaker_ref in aparaty
            or (pole is not None and pole.protection_ref == pa.ref_id)
            or przekladniki_pa & refy_pomiarow
        ):
            zabezpieczenia.append(
                ZabezpieczeniePola(
                    ref_id=pa.ref_id,
                    nazwa=pa.name,
                    rodzaj=pa.device_type,
                    wylacznik_ref=pa.breaker_ref,
                    aktywne=pa.is_enabled,
                )
            )
    stacja_ref = kontekst.stacja_elementu.get(cel.ref_id)
    return SasiedztwoElementu(
        kierunek_ustalony=bool(drogi),
        poprzednie=_odnosniki(kontekst, poprzednie),
        nastepne=_odnosniki(kontekst, nastepne),
        pola_wejsciowe=_odnosniki(kontekst, pola_wejsciowe),
        pola_wyjsciowe=_odnosniki(kontekst, pola_wyjsciowe),
        pole=kontekst.elementy[pole_ref].odnosnik() if pole_ref in kontekst.elementy else None,
        stacja=(
            kontekst.elementy[stacja_ref].odnosnik() if stacja_ref in kontekst.elementy else None
        ),
        przekladniki=przekladniki,
        zabezpieczenia=zabezpieczenia,
    )


def zbuduj_tor_elementu(
    case_id: str, enm: EnergyNetworkModel, element_ref: str
) -> TorElementuOdpowiedz:
    """Wszystkie drogi od źródeł sieciowych do elementu i jego sąsiedztwo nawigacyjne.

    Status: ``brak_drogi`` — element w wyspie bez źródła (przyczyny jak w stanie zasilenia);
    ``nierozstrzygniety`` — droga przez łącznik nieustalony, pętla bez punktu podziału albo
    obcięta lista dróg (każda przyczyna jawnie); ``rozstrzygniety`` — od każdego źródła
    co najwyżej jedna droga i wszystkie pewne (sieć wieloźródłowa → droga per źródło).
    """
    kontekst = _zbuduj_kontekst(enm)
    cel = kontekst.elementy.get(element_ref)
    if cel is None:
        raise ElementNieistniejeError(element_ref)
    drogi, przyczyny, obciete = _drogi(kontekst, cel)
    stan = _stan_elementu(kontekst, cel)
    if not drogi:
        status: Literal["rozstrzygniety", "nierozstrzygniety", "brak_drogi"] = "brak_drogi"
        przyczyny = stan.przyczyny
    elif przyczyny:
        status = "nierozstrzygniety"
    else:
        status = "rozstrzygniety"
    return TorElementuOdpowiedz(
        case_id=case_id,
        enm_revision=enm.header.revision,
        enm_hash=enm.header.hash_sha256,
        podstawa=PODSTAWA_TOPOLOGII,
        opis_podstawy=OPIS_PODSTAWY,
        element=cel.odnosnik(),
        stan=stan.stan,
        status=status,
        przyczyny=przyczyny,
        drogi=drogi,
        drogi_obciete=obciete,
        sasiedztwo=_sasiedztwo(kontekst, cel, drogi),
    )
