"""Skladanie pakietu dowodow rozszerzen stacji z MODELU sieci (ENM).

PO CO (karta PROOFPACK-KONTRAKT, karta JEDNA-SCIEZKA-EDYCJI). Pakiet dowodow walidacji
rozszerzen stacji sklada backend, w jednym miejscu, dla KAZDEJ stacji modelu — wylacznie
z danych modelu sieci. Dawna zapisana konfiguracja stacji (tabela obok modelu z lustrem
zrodel, mapa przelacznikow zaczepow, przekladnikow i aparatury pol) byla druga prawda:
wybory projektanta zyly w niej zamiast w modelu, a solver dostawal je bocznym wejsciem.
Teraz kazda dana pochodzi z elementu modelu, ktory ja niesie:

* tryby pracy magazynu — `Generator.materialized_params.profiles.bess_operation_mode_refs`
  (operacja `set_der_catalog_bindings`, kreator zrodla OZE);
* moc zrodla do bilansu eksportu — `Generator.p_mw` (ta sama wielkosc, z ktorej konfigurator
  stacji pokazuje moc zrodla); zdolnosci przeksztaltnika z karty katalogowej typu zrodla;
* przelacznik zaczepow transformatora — `Transformer.tap_changer.catalog_ref` (operacja
  `update_element_parameters`), klasa transformatora z napiec modelu
  (`klasa_transformatora_przelacznika`), wymaganie regulacji automatycznej z trybu sterowania
  przelacznika w modelu;
* przekladnik napieciowy pola — przekladnik `Measurement` rodzaju VT wskazujacy pole
  (`bay_ref`, operacja `add_vt`), wspolczynnik napieciowy z katalogu typow VT, sposob
  uziemienia punktu neutralnego sieci SN pola z JEDYNEJ prawdy modelu
  (`enm.uziemienie_sekcji`).

Zrodlo nalezy do stacji, gdy wskazuje ja (`Generator.station_ref`) albo jest przylaczone do
szyny stacji (`enm.tor_pola.szyny_stacji`) — jedna regula dla trybow pracy i bilansu.

BRAK DANYCH NIE JEST ZGODNOSCIA. Kazdy z czterech rodzajow dowodu ma w pakiecie stacji albo
co najmniej jeden dowod, albo co najmniej jeden jawny brak z przyczyna po polsku
(`BrakDanychDowodu`). Rodzaj nie znika po cichu i nie dostaje zgodnosci na domysl.

WARSTWA: aplikacja — zero fizyki (werdykty licza funkcje katalogu konfiguracji stacji),
zero mutacji.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from enm.models import (
    GEN_TYPES_PRZEKSZTALTNIKOWE,
    Bay,
    EnergyNetworkModel,
    Generator,
    Substation,
    Transformer,
)
from enm.nazwy_elementow import SPOZA_MODELU, nazwa_elementu, nazwa_po_identyfikatorze
from enm.pola import poziom_pol
from enm.tor_pola import szyny_stacji
from enm.uziemienie_sekcji import UziemienieSekcji, uziemienie_sieci
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.katalogi_stacji import klasa_transformatora_przelacznika
from network_model.catalog.types import ConverterType
from network_model.core.uziemienie import (
    STANY_AWSC,
    UZIEMIENIA_WYMAGAJACE_FV_19,
    TypPunktuNeutralnego,
)
from network_model.pochodne import mw_na_kw
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from pydantic import ValidationError

from .dowody_rozszerzen_stacji import (
    CHWILA_GENERACJI_DOMYSLNA,
    BrakDanychDowodu,
    DowodRozszerzenStacji,
    PakietRozszerzenStacji,
    RodzajDowoduRozszerzen,
    SpecDowoduEksportuStacji,
    SpecDowoduPlanuZaczepow,
    SpecDowoduTrybowBess,
    SpecDowoduUziemieniaPrzekladnika,
    generate_bess_modes_proof,
    generate_hosting_capacity_export_proof,
    generate_tap_changer_plan_proof,
    generate_vt_grounding_validation_proof,
    zloz_pakiet_dowodow_stacji,
)

BESS: RodzajDowoduRozszerzen = "BESS_OPERATION_MODES"
ZACZEPY: RodzajDowoduRozszerzen = "TAP_CHANGER_PLAN"
EKSPORT: RodzajDowoduRozszerzen = "HOSTING_CAPACITY_EXPORT"
PRZEKLADNIKI: RodzajDowoduRozszerzen = "VT_GROUNDING_VALIDATION"
#: Cztery rodzaje dowodu w kolejnosci prezentacji.
RODZAJE_DOWODOW: tuple[RodzajDowoduRozszerzen, ...] = (
    BESS,
    ZACZEPY,
    EKSPORT,
    PRZEKLADNIKI,
)

# =============================================================================
# Przyczyny brakow — teksty dla projektanta (bez identyfikatorow i kodow)
# =============================================================================

STACJA_SPOZA_MODELU = (
    "Stacji nie ma w modelu sieci — danych stacji (źródeł, transformatorów, przekładników) "
    "nie ma skąd odczytać."
)
BRAK_MAGAZYNU = "Stacja nie ma w modelu magazynu energii — trybów pracy nie ma czego sprawdzić."
BRAK_PRZELACZNIKOW = (
    "Żaden transformator stacji nie ma w modelu przełącznika zaczepów z katalogu — wybierz "
    "przełącznik w karcie transformatora konfiguratora stacji."
)
BRAK_ZRODEL = "Stacja nie ma w modelu źródeł — bilansu eksportu nie ma czego liczyć."
STACJA_BEZ_SZYN = (
    "Stacja nie ma przypisanych szyn w modelu sieci — odbiorów stacji nie da się zsumować, "
    "a zero importu byłoby twierdzeniem o sieci."
)
POLE_BEZ_OZNACZENIA = (
    "Pole z przekładnikiem napięciowym nie ma oznaczenia — dowodu nie da się przypisać do pola."
)
BRAK_PRZEKLADNIKOW = (
    "Żadne pole stacji nie ma w modelu przekładnika napięciowego — dodaj przekładnik "
    "w karcie zabezpieczeń konfiguratora stacji."
)
BRAK_PRZEKLADNIKOW = "Konfiguracja stacji nie przypisuje przekładników napięciowych polom."
BRAK_PRZEKLADNIKOW = "Konfiguracja stacji nie przypisuje przekładników napięciowych polom."
STACJA_SPOZA_MODELU_UZIEMIENIE = (
    "Stacji nie ma w modelu sieci — sposobu uziemienia punktu neutralnego sieci SN nie da "
    "się ustalić, a zgodności przekładników napięciowych nie da się ocenić."
)
STACJA_BEZ_SZYN_SN = (
    "Stacja nie ma szyn SN w modelu sieci — sposobu uziemienia punktu neutralnego sieci SN "
    "nie da się ustalić, a zgodności przekładników napięciowych nie da się ocenić."
)


def _pole_w_sekcjach_roznie_uziemionych(oznaczenie: str) -> str:
    return (
        f"Pole {oznaczenie} nie jest przypisane w modelu do sekcji szyn SN, a sekcje stacji "
        "mają różny sposób uziemienia punktu neutralnego — przypisz pole do sekcji, aby "
        "ocenić zgodność przekładnika napięciowego."
    )


def _sekcja_z_uziemieniem_nieokreslonym(odmowy: tuple[str, ...]) -> str:
    return (
        "Sposób uziemienia punktu neutralnego sieci SN jest nieokreślony — "
        + " ".join(odmowy)
        + " Zgodności przekładników napięciowych nie da się ocenić."
    )


def _magazyn_bez_trybow(nazwa: str) -> str:
    return f"Magazyn energii {nazwa}: nie wybrano trybów pracy."


def _transformator_bez_klasy(tr: Transformer, nazwa: str) -> str:
    return (
        f"Transformator {nazwa} ({tr.uhv_kv:g}/{tr.ulv_kv:g} kV) nie należy do żadnej klasy "
        "katalogu przełączników zaczepów (110/15 kV, 110/20 kV, SN/nN)."
    )


def _zrodlo_bez_mocy(nazwa: str) -> str:
    return (
        f"Źródło {nazwa} nie ma w modelu dodatniej mocy czynnej — bilans eksportu byłby zaniżony."
    )


# =============================================================================
# Dane z modelu i katalogu
# =============================================================================


def zdolnosci_przeksztaltnika(typ: ConverterType | None) -> tuple[bool | None, bool | None]:
    """(praca w czterech ćwiartkach, tworzenie napięcia) z karty typu przekształtnika.

    Cztery ćwiartki WYŁĄCZNIE z granic mocy biernej karty: `qmin < 0 < qmax` (karta FAB-J
    — ta sama reguła, którą kreator źródła filtruje oferowane tryby). Tworzenie napięcia
    WYŁĄCZNIE z trybu sterowania karty (`control_mode == "GRID_FORMING"` — istniejący
    sygnał zdolności, `ConverterType.control_mode`). Brak karty albo brak danej w karcie
    daje `None` („nieustalone"), nigdy domysł.
    """
    if typ is None:
        return None, None
    cztery_cwiartki = (
        typ.qmin_mvar < 0 < typ.qmax_mvar
        if typ.qmin_mvar is not None and typ.qmax_mvar is not None
        else None
    )
    tworzy_napiecie = typ.control_mode == "GRID_FORMING" if typ.control_mode is not None else None
    return cztery_cwiartki, tworzy_napiecie


def wspolczynnik_napieciowy_typu_vt(vt_ref: str) -> float | None:
    """Współczynnik napięciowy typu VT z KATALOGU — bez wartości domyślnej (V12K-258).

    Brak typu w katalogu albo brak danej w karcie daje `None`; generator dowodu zamienia
    to w dowód NIEZALICZONY z nazwanym powodem, zamiast liczby z powietrza.
    """
    typ = get_default_mv_catalog().get_vt_type(vt_ref)
    if typ is None:
        return None
    wartosc = typ.to_dict().get("rated_voltage_factor")
    return float(wartosc) if isinstance(wartosc, int | float) else None


def moce_odbiorow_stacji_kw(model: EnergyNetworkModel | None) -> dict[str, float]:
    """Moce czynne odbiorów [kW] zsumowane per stacja z MODELU ENM.

    Źródłem jest jedyna prawda sieci: `Load.bus_ref` → stacja przez `Substation.bus_refs`.
    Stacja ma wpis wtedy i tylko wtedy, gdy istnieje w modelu i ma co najmniej jedną
    szynę — wtedy suma jest wiedzą (także 0.0 dla stacji bez odbiorów). Stacji spoza
    modelu i stacji bez szyn NIE MA w słowniku: import nieznany to nie zero. Odbiór na
    szynie spoza stacji nie należy do żadnej stacji (nie jest doliczany ani zgadywany).
    Przeliczenie MW→kW to zamiana jednostki, nie wielkość elektryczna.
    """
    if model is None:
        return {}
    stacja_szyny: dict[str, str] = {}
    moce: dict[str, float] = {}
    poziom = poziom_pol(model)
    for stacja in model.substations:
        if not stacja.bus_refs:
            continue
        moce[stacja.ref_id] = 0.0
        # POLA-W-TORZE: odbiór nN leży za aparatem pola nN (szyna odpływu) — przynależność
        # szyn do stacji z jednego źródła (`enm.tor_pola.szyny_stacji`).
        for bus_ref in sorted(szyny_stacji(model, stacja, poziom)):
            stacja_szyny.setdefault(bus_ref, stacja.ref_id)
    for odbior in model.loads:
        stacja_ref = stacja_szyny.get(odbior.bus_ref)
        if stacja_ref is not None:
            moce[stacja_ref] += mw_na_kw(float(odbior.p_mw))
    return moce


def tryby_pracy_magazynu(generator: Generator) -> tuple[str, ...]:
    """Tryby pracy magazynu z MODELU (`materialized_params.profiles.bess_operation_mode_refs`).

    Ten sam podsłownik zapisuje operacja `set_der_catalog_bindings` (`DER_PROFILE_KEYS`) —
    lista w kolejności wyboru projektanta (bez powtórzeń); wpis pusty albo nie-łańcuch nie
    jest trybem.
    """
    profile = (generator.materialized_params or {}).get("profiles")
    wpisy = profile.get("bess_operation_mode_refs") if isinstance(profile, dict) else None
    if not isinstance(wpisy, list | tuple):
        return ()
    return tuple(dict.fromkeys(w for w in wpisy if isinstance(w, str) and w.strip()))


class _Kontekst:
    """Indeksy modelu potrzebne przy składaniu (budowane raz na projekt)."""

    def __init__(self, model: EnergyNetworkModel | None) -> None:
        self.model = model
        self.stacje: dict[str, Substation] = {
            s.ref_id: s for s in (model.substations if model else [])
        }
        self.moce_odbiorow_kw = moce_odbiorow_stacji_kw(model)
        self.katalog = get_default_mv_catalog()
        # Uziemienie punktu neutralnego każdej sieci SN — JEDNA funkcja modelu, liczona raz.
        self.uziemienie: tuple[UziemienieSekcji, ...] = (
            uziemienie_sieci(model) if model is not None else ()
        )
        self.poziom = poziom_pol(model) if model is not None else None

    def szyny(self, stacja: Substation) -> set[str]:
        assert self.model is not None  # stacja pochodzi z modelu
        return set(szyny_stacji(self.model, stacja, self.poziom))

    def zrodla_stacji(self, stacja: Substation) -> list[Generator]:
        """Źródła przekształtnikowe stacji: wskazujące ją albo przyłączone do jej szyny."""
        assert self.model is not None
        szyny = self.szyny(stacja)
        return sorted(
            (
                g
                for g in self.model.generators
                if g.gen_type in GEN_TYPES_PRZEKSZTALTNIKOWE
                and (g.station_ref == stacja.ref_id or g.bus_ref in szyny)
            ),
            key=lambda g: g.ref_id,
        )

    def transformatory_stacji(self, stacja: Substation) -> list[Transformer]:
        """Transformatory, których oba zaciski leżą na szynach stacji."""
        assert self.model is not None
        szyny = self.szyny(stacja)
        return sorted(
            (t for t in self.model.transformers if t.hv_bus_ref in szyny and t.lv_bus_ref in szyny),
            key=lambda t: t.ref_id,
        )

    def przekladniki_vt_pol(self, stacja: Substation) -> list[tuple[Bay, str]]:
        """(pole stacji, typ katalogowy VT) — przekładniki napięciowe wskazujące pole stacji."""
        assert self.model is not None
        pola = {b.ref_id: b for b in self.model.bays if b.substation_ref == stacja.ref_id}
        wynik = [
            (pola[m.bay_ref], m.catalog_ref)
            for m in self.model.measurements
            if m.measurement_type == "VT"
            and m.bay_ref in pola
            and isinstance(m.catalog_ref, str)
            and m.catalog_ref.strip()
        ]
        return sorted(wynik, key=lambda w: (w[0].ref_id, w[1]))


def _oznaczenie_pola(pole: Bay) -> str | None:
    """Oznaczenie pola tą samą regułą co konfigurator stacji (numer → skrót odpływu → nazwa)."""
    # Lustro `bayDesignation` konfiguratora stacji (`??` — pierwsza wartość różna od
    # braku): oznaczenie, którym konfigurator pyta o uziemienie pola, i którym dowód je nazywa.
    for oznaczenie in (pole.bay_number, pole.feeder_short_name, pole.name):
        if oznaczenie is not None:
            return oznaczenie
    return None


def _typ_dla_przekladnika(sekcja: UziemienieSekcji) -> TypPunktuNeutralnego:
    """Typ punktu neutralnego sekcji dla doboru F_v przekładnika — stan AWSC najbardziej
    wymagający: gdy w którymkolwiek stanie automatyki (spoczynek / załączona) sieć wymaga
    F_v = 1,9 (IEC 61869-3 tab. 2), dowód ocenia ten stan; w pozostałych przypadkach oba
    stany dają ten sam typ."""
    typy = [sekcja.typ_punktu_neutralnego(stan) for stan in STANY_AWSC]  # type: ignore[arg-type]
    for typ in typy:
        if typ in UZIEMIENIA_WYMAGAJACE_FV_19:
            return typ
    return typy[0]


def _sekcje_sn_stacji(ctx: _Kontekst, station_id: str) -> tuple[list[UziemienieSekcji], str | None]:
    """Sieci SN (``enm.uziemienie_sekcji``) obejmujące szyny SN stacji albo nazwana przyczyna
    braku (stacja spoza modelu, stacja bez szyn SN)."""
    stacja = ctx.stacje.get(station_id)
    if stacja is None or ctx.model is None:
        return [], STACJA_SPOZA_MODELU_UZIEMIENIE
    napiecia = {b.ref_id: b.voltage_kv for b in ctx.model.buses}
    szyny_sn = {
        s
        for s in szyny_stacji(ctx.model, stacja, ctx.poziom)
        if napiecia.get(s) and pasmo_napieciowe(napiecia[s]) == "SN"
    }
    sekcje = [u for u in ctx.uziemienie if szyny_sn & set(u.szyny)]
    if not sekcje:
        return [], STACJA_BEZ_SZYN_SN
    return sekcje, None


def uziemienie_pola_stacji(
    ctx: _Kontekst, station_id: str, oznaczenie: str
) -> tuple[TypPunktuNeutralnego | None, str | None]:
    """Typ punktu neutralnego sieci SN pola ``oznaczenie`` stacji albo nazwana przyczyna braku.

    Źródło: ``enm.uziemienie_sekcji`` (jedyna prawda o uziemieniu SN). Pole odnalezione
    w modelu po oznaczeniu wskazuje swoją sekcję (szyna pola); pole nieodnalezione dziedziczy
    typ stacji wyłącznie wtedy, gdy wszystkie sieci SN stacji mają ten sam typ.
    """
    sekcje, przyczyna = _sekcje_sn_stacji(ctx, station_id)
    if przyczyna is not None:
        return None, przyczyna
    assert ctx.model is not None  # kontrakt `_sekcje_sn_stacji`: sekcje tylko z modelu
    pola = [
        p
        for p in ctx.model.bays
        if p.substation_ref == station_id and _oznaczenie_pola(p) == oznaczenie
    ]
    if len(pola) == 1:
        sekcje_pola = [u for u in sekcje if pola[0].bus_ref in u.szyny]
        if sekcje_pola:
            sekcje = sekcje_pola
    odmowy = tuple(o for u in sekcje for o in u.odmowy)
    if odmowy:
        return None, _sekcja_z_uziemieniem_nieokreslonym(odmowy)
    typy = {_typ_dla_przekladnika(u) for u in sekcje}
    if len(typy) != 1:
        return None, _pole_w_sekcjach_roznie_uziemionych(oznaczenie)
    return typy.pop(), None


def _dowody_trybow_bess(
    stacja: Substation, ctx: _Kontekst, chwila: str
) -> tuple[list[DowodRozszerzenStacji], list[BrakDanychDowodu]]:
    dowody: list[DowodRozszerzenStacji] = []
    braki: list[BrakDanychDowodu] = []
    magazyny = [g for g in ctx.zrodla_stacji(stacja) if g.gen_type == "bess"]
    if not magazyny:
        return dowody, [BrakDanychDowodu(BESS, BRAK_MAGAZYNU)]
    for generator in magazyny:
        nazwa = nazwa_elementu(generator, "generators")
        tryby = tryby_pracy_magazynu(generator)
        if not tryby:
            braki.append(BrakDanychDowodu(BESS, _magazyn_bez_trybow(nazwa)))
            continue
        typ = (
            ctx.katalog.get_converter_type(generator.catalog_ref) if generator.catalog_ref else None
        )
        cztery_cwiartki, tworzy_napiecie = zdolnosci_przeksztaltnika(typ)
        dowody.append(
            generate_bess_modes_proof(
                SpecDowoduTrybowBess(
                    der_id=generator.ref_id,
                    der_nazwa=nazwa,
                    pcs_four_quadrant=cztery_cwiartki,
                    pcs_grid_forming=tworzy_napiecie,
                    selected_mode_refs=tryby,
                ),
                generated_at_iso=chwila,
            )
        )
    return dowody, braki


def _dowody_planu_zaczepow(
    stacja: Substation, ctx: _Kontekst, chwila: str
) -> tuple[list[DowodRozszerzenStacji], list[BrakDanychDowodu]]:
    dowody: list[DowodRozszerzenStacji] = []
    braki: list[BrakDanychDowodu] = []
    z_przelacznikiem = [
        tr
        for tr in ctx.transformatory_stacji(stacja)
        if tr.tap_changer is not None and tr.tap_changer.catalog_ref
    ]
    if not z_przelacznikiem:
        return dowody, [BrakDanychDowodu(ZACZEPY, BRAK_PRZELACZNIKOW)]
    for tr in z_przelacznikiem:
        assert tr.tap_changer is not None and tr.tap_changer.catalog_ref  # filtr wyżej
        nazwa = nazwa_elementu(tr, "transformers")
        klasa = klasa_transformatora_przelacznika(tr.uhv_kv, tr.ulv_kv)
        if klasa is None:
            braki.append(BrakDanychDowodu(ZACZEPY, _transformator_bez_klasy(tr, nazwa)))
            continue
        # Regulacja automatyczna wymagana wtedy, gdy MODEL deklaruje sterowanie
        # automatyczne przełącznika (`TapChanger.control_mode`), a nie „zawsze, gdy
        # przełącznik ją ma" (dawny warunek tautologiczny).
        dowody.append(
            generate_tap_changer_plan_proof(
                SpecDowoduPlanuZaczepow(
                    transformer_id=tr.ref_id,
                    transformer_nazwa=nazwa,
                    transformer_type=klasa,
                    tap_changer_ref=tr.tap_changer.catalog_ref,
                    requires_avr=tr.tap_changer.control_mode == "AUTOMATIC",
                ),
                generated_at_iso=chwila,
            )
        )
    return dowody, braki


def _dowod_eksportu(
    stacja: Substation, ctx: _Kontekst, chwila: str
) -> tuple[list[DowodRozszerzenStacji], list[BrakDanychDowodu]]:
    zrodla = ctx.zrodla_stacji(stacja)
    if not zrodla:
        return [], [BrakDanychDowodu(EKSPORT, BRAK_ZRODEL)]
    braki: list[BrakDanychDowodu] = []
    p_import_kw = ctx.moce_odbiorow_kw.get(stacja.ref_id)
    if p_import_kw is None:
        braki.append(BrakDanychDowodu(EKSPORT, STACJA_BEZ_SZYN))
    p_export_kw = 0.0
    for generator in zrodla:
        moc = float(generator.p_mw)
        if not math.isfinite(moc) or moc <= 0:
            braki.append(
                BrakDanychDowodu(EKSPORT, _zrodlo_bez_mocy(nazwa_elementu(generator, "generators")))
            )
            continue
        p_export_kw += mw_na_kw(moc)
    if braki or p_import_kw is None:
        # Bilans z częścią źródeł albo bez importu byłby liczbą o sieci, której nie ma.
        return [], braki
    return [
        generate_hosting_capacity_export_proof(
            SpecDowoduEksportuStacji(
                station_id=stacja.ref_id,
                p_export_kw=p_export_kw,
                p_import_kw=p_import_kw,
            ),
            generated_at_iso=chwila,
        )
    ], []


def _dowody_przekladnikow(
    stacja: Substation, ctx: _Kontekst, chwila: str
) -> tuple[list[DowodRozszerzenStacji], list[BrakDanychDowodu]]:
    wpisy = ctx.przekladniki_vt_pol(stacja)
    if not wpisy:
        return [], [BrakDanychDowodu(PRZEKLADNIKI, BRAK_PRZEKLADNIKOW)]
    dowody: list[DowodRozszerzenStacji] = []
    braki: list[BrakDanychDowodu] = []
    for pole, vt_ref in wpisy:
        oznaczenie = _oznaczenie_pola(pole)
        if oznaczenie is None:
            braki.append(BrakDanychDowodu(PRZEKLADNIKI, POLE_BEZ_OZNACZENIA))
            continue
        typ, przyczyna = uziemienie_pola_stacji(ctx, stacja.ref_id, oznaczenie)
        if typ is None:
            assert przyczyna is not None  # kontrakt funkcji: brak typu ⇔ nazwana przyczyna
            braki.append(BrakDanychDowodu(PRZEKLADNIKI, przyczyna))
            continue
        try:
            spec = SpecDowoduUziemieniaPrzekladnika(
                bay_designation=oznaczenie,
                vt_voltage_factor=wspolczynnik_napieciowy_typu_vt(vt_ref),
                grounding_type=typ,
            )
        except ValidationError:
            braki.append(BrakDanychDowodu(PRZEKLADNIKI, POLE_BEZ_OZNACZENIA))
            continue
        dowody.append(generate_vt_grounding_validation_proof(spec, generated_at_iso=chwila))
    return dowody, braki


def zloz_pakiet_stacji(
    station_id: str,
    model: EnergyNetworkModel | None,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
    _ctx: _Kontekst | None = None,
) -> PakietRozszerzenStacji:
    """Pakiet dowodów jednej stacji — wyłącznie z modelu sieci.

    Stacja spoza modelu: każdy rodzaj jest jawnym brakiem (pakiet nie znika i nie dostaje
    zgodności na domysł).
    """
    ctx = _ctx or _Kontekst(model)
    nazwa_stacji = nazwa_po_identyfikatorze(
        station_id, model, spoza_modelu=f"Stacja {SPOZA_MODELU}"
    )
    stacja = ctx.stacje.get(station_id)
    if stacja is None:
        return zloz_pakiet_dowodow_stacji(
            station_id=station_id,
            station_nazwa=nazwa_stacji,
            proofs=[],
            braki_danych=[BrakDanychDowodu(r, STACJA_SPOZA_MODELU) for r in RODZAJE_DOWODOW],
            generated_at_iso=generated_at_iso,
        )
    dowody: list[DowodRozszerzenStacji] = []
    braki: list[BrakDanychDowodu] = []
    for czesc in (
        _dowody_trybow_bess(stacja, ctx, generated_at_iso),
        _dowody_planu_zaczepow(stacja, ctx, generated_at_iso),
        _dowod_eksportu(stacja, ctx, generated_at_iso),
        _dowody_przekladnikow(stacja, ctx, generated_at_iso),
    ):
        dowody.extend(czesc[0])
        braki.extend(czesc[1])
    return zloz_pakiet_dowodow_stacji(
        station_id=station_id,
        station_nazwa=nazwa_stacji,
        proofs=dowody,
        braki_danych=braki,
        generated_at_iso=generated_at_iso,
    )


def zloz_pakiety_projektu(
    model: EnergyNetworkModel | None,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> list[PakietRozszerzenStacji]:
    """Pakiety dowodów KAŻDEJ stacji modelu sieci (kolejność: `ref_id` stacji)."""
    ctx = _Kontekst(model)
    return [
        zloz_pakiet_stacji(station_id, model, generated_at_iso=generated_at_iso, _ctx=ctx)
        for station_id in sorted(ctx.stacje)
    ]


def uziemienie_sn_stacji(
    model: EnergyNetworkModel | None, station_id: str, oznaczenia: Sequence[str]
) -> dict[str, Any]:
    """Uziemienie punktu neutralnego sieci SN stacji dla konfiguratora (karta
    UX-04/POLE-ZU-SKLADOWA-ZEROWA: konfigurator nie wybiera już uziemienia, czyta je z modelu).

    ``sekcje`` — sieci SN obejmujące szyny stacji (``UziemienieSekcji.to_dict``: wariant
    w obu stanach AWSC, punkty uziemienia, I_C, ΣI_L, rozstrojenie, odmowy, kompletność);
    ``przyczyna_braku`` — nazwana przyczyna, gdy sekcji nie ma. ``pola`` — typ punktu
    neutralnego dla pól ``oznaczenia`` tą samą regułą co dowód zgodności przekładników
    (``uziemienie_pola_stacji``): każde pole ma typ albo nazwaną przyczynę — nigdy oba
    i nigdy żadne (kolejność: oznaczenie rosnąco, bez powtórzeń)."""
    ctx = _Kontekst(model)
    sekcje, przyczyna = _sekcje_sn_stacji(ctx, station_id)
    pola: list[dict[str, str | None]] = []
    for oznaczenie in sorted(set(oznaczenia)):
        typ, przyczyna_pola = uziemienie_pola_stacji(ctx, station_id, oznaczenie)
        pola.append(
            {
                "oznaczenie": oznaczenie,
                "typ_punktu_neutralnego": typ,
                "przyczyna_braku": przyczyna_pola,
            }
        )
    return {
        "sekcje": [u.to_dict() for u in sekcje],
        "przyczyna_braku": przyczyna,
        "pola": pola,
    }
