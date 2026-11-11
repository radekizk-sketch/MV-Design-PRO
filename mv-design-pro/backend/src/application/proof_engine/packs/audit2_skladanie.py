"""Skladanie pakietu dowodow audytu 2 z utrwalonych konfiguracji stacji i z modelu sieci.

PO CO (karta PROOFPACK-KONTRAKT). Pakiet dowodow walidacji rozszerzen stacji skladal
interfejs: sumowal moc eksportu z `nominal_power_kw`, wysylal wylacznie zdolnosc
przylaczeniowa (obiecujac piec rodzajow uzasadnien), a identyfikatorem pakietu byla
pierwsza stacja albo zmyslone `'aggregate'`. Wszystko to dzieje sie teraz TUTAJ, w jednym
miejscu backendu, dla KAZDEJ stacji z zapisana konfiguracja:

* nazwy elementow z modelu wg jednej reguly nazwy (`enm.nazwy_elementow`);
* arytmetyka bilansu (suma mocy znamionowych zrodel, suma mocy odbiorow stacji);
* zdolnosci przeksztaltnika z karty katalogowej typu zrodla w modelu;
* klasa transformatora z napiec modelu (`klasa_transformatora_przelacznika`), wymaganie
  regulacji automatycznej z trybu sterowania przelacznika w modelu;
* wspolczynnik napieciowy przekladnika z katalogu typow VT, sposob uziemienia punktu
  neutralnego sieci SN pola z JEDYNEJ prawdy modelu (`enm.uziemienie_sekcji` — zespoly
  uziemiajace i punkty neutralne uzwojen transformatorow; karta UX-04/POLE-ZU-SKLADOWA-ZEROWA
  skasowala dawny wybor wariantu z katalogu uziemien w konfiguracji stacji — druga prawde).

BRAK DANYCH NIE JEST ZGODNOSCIA. Kazdy z pieciu rodzajow dowodu ma w pakiecie stacji albo
co najmniej jeden dowod, albo co najmniej jeden jawny brak z przyczyna po polsku
(`BrakDanychDowodu`). Rodzaj nie znika po cichu i nie dostaje zgodnosci na domysl:
nie ma tu mocy „typowej" (dawna mediana per rodzaj zrodla), klasy transformatora
„pierwszej z katalogu" ani uziemienia „izolowanego" dla nieznanego wpisu.

WARSTWA: aplikacja — zero fizyki (werdykty licza funkcje katalogu audytu 2), zero mutacji.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from enm.models import Bay, EnergyNetworkModel, Generator, Substation, Transformer
from enm.nazwy_elementow import SPOZA_MODELU, nazwa_elementu, nazwa_po_identyfikatorze
from enm.pola import poziom_pol
from enm.tor_pola import szyny_stacji
from enm.uziemienie_sekcji import UziemienieSekcji, uziemienie_sieci
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.audit2_catalogs import klasa_transformatora_przelacznika
from network_model.catalog.types import ConverterType
from network_model.core.uziemienie import (
    STANY_AWSC,
    UZIEMIENIA_WYMAGAJACE_FV_19,
    TypPunktuNeutralnego,
)
from network_model.pochodne import mw_na_kw
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .audit2_validation import (
    CHWILA_GENERACJI_DOMYSLNA,
    Audit2ProofResult,
    BrakDanychDowodu,
    RodzajDowoduAudytu2,
    SpecDowoduEksportuStacji,
    SpecDowoduPlanuZaczepow,
    SpecDowoduTrybowBess,
    SpecDowoduUziemieniaPrzekladnika,
    SpecDowoduWytrzymalosciAparatu,
    StationAudit2ProofPack,
    generate_bess_modes_proof,
    generate_device_withstand_proof,
    generate_hosting_capacity_export_proof,
    generate_station_audit2_proof_pack,
    generate_tap_changer_plan_proof,
    generate_vt_grounding_validation_proof,
)

# =============================================================================
# Kontrakt konfiguracji stacji audytu 2 — JEDNA klasa dla zapisu (PUT) i dla skladania
# =============================================================================


class DerAudit2SpecPayload(BaseModel):
    der_id: str
    der_kind: str  # "PV" | "BESS" | "FW"
    bess_operation_mode_refs: list[str] | None = None
    block_transformer_catalog_ref: str | None = None
    pf_curve_ref: str | None = None
    # Phase 23: real device + power persisted (nie wiecej median fallback).
    device_catalog_ref: str | None = None
    nominal_power_kw: float | None = None


class BayDeviceWithstandSpec(BaseModel):
    """Prady zwarciowe w miejscu pola i czas wylaczenia — dane wejscia dowodu wytrzymalosci.

    Ograniczenia sa te same co w specyfikacji dowodu (`SpecDowoduWytrzymalosciAparatu`):
    zapis przyjmuje wylacznie dane, z ktorych dowod da sie zlozyc (prady nieujemne i
    skonczone, czas wylaczenia dodatni) — odmowa 422 przy zapisie zamiast bledu przy
    skladaniu pakietu.
    """

    model_config = ConfigDict(allow_inf_nan=False)

    device_id: str = Field(min_length=1)
    i_peak_calculated_ka: float = Field(ge=0)
    i_thermal_calculated_ka: float = Field(ge=0)
    t_clearing_s: float = Field(gt=0)


class StationAudit2ConfigBody(BaseModel):
    tap_changer_refs: list[str] = Field(default_factory=list)
    der_specs: list[DerAudit2SpecPayload] = Field(default_factory=list)
    # Phase 8: per-transformer/bay mappings.
    transformer_tap_changers: dict[str, str] = Field(default_factory=dict)
    bay_hv_fuses: dict[str, str] = Field(default_factory=dict)
    bay_vts: dict[str, str] = Field(default_factory=dict)
    bay_device_withstand: dict[str, BayDeviceWithstandSpec] = Field(default_factory=dict)


# =============================================================================
# Przyczyny brakow — teksty dla projektanta (bez identyfikatorow i kodow)
# =============================================================================

BESS: RodzajDowoduAudytu2 = "AUDIT2_BESS_OPERATION_MODES"
ZACZEPY: RodzajDowoduAudytu2 = "AUDIT2_TAP_CHANGER_PLAN"
EKSPORT: RodzajDowoduAudytu2 = "AUDIT2_HOSTING_CAPACITY_EXPORT"
WYTRZYMALOSC: RodzajDowoduAudytu2 = "AUDIT2_DEVICE_WITHSTAND"
PRZEKLADNIKI: RodzajDowoduAudytu2 = "AUDIT2_VT_GROUNDING_VALIDATION"
#: Piec rodzajow dowodu w kolejnosci prezentacji.
RODZAJE_DOWODOW: tuple[RodzajDowoduAudytu2, ...] = (
    BESS,
    ZACZEPY,
    EKSPORT,
    WYTRZYMALOSC,
    PRZEKLADNIKI,
)

BRAK_KONFIGURACJI = (
    "Stacja nie ma zapisanej konfiguracji rozszerzeń — otwórz konfigurator stacji, aby "
    "przypisać przełączniki zaczepów, przekładniki, dane aparatury i źródła."
)
KONFIGURACJA_NIEPOPRAWNA = (
    "Zapisana konfiguracja stacji ma niepoprawny kształt — otwórz konfigurator stacji "
    "i zapisz ją ponownie."
)
BRAK_MAGAZYNU = (
    "Konfiguracja stacji nie zawiera magazynu energii — trybów pracy nie ma czego sprawdzić."
)
MAGAZYN_SPOZA_MODELU = (
    "Magazyn energii wskazany w konfiguracji stacji nie istnieje w modelu sieci — otwórz "
    "konfigurator stacji, aby zsynchronizować źródła."
)
BRAK_PRZELACZNIKOW = (
    "Konfiguracja stacji nie przypisuje przełącznika zaczepów żadnemu transformatorowi."
)
TRANSFORMATOR_SPOZA_MODELU = (
    "Transformator wskazany w konfiguracji stacji nie istnieje w modelu sieci."
)
BRAK_ZRODEL = "Konfiguracja stacji nie zawiera źródeł — bilansu eksportu nie ma czego liczyć."
STACJA_BEZ_SZYN = (
    "Stacji nie ma w modelu sieci albo nie ma ona przypisanych szyn — odbiorów stacji nie "
    "da się zsumować, a zero importu byłoby twierdzeniem o sieci."
)
ZRODLO_SPOZA_MODELU = (
    "Źródło wskazane w konfiguracji stacji nie istnieje w modelu sieci — bilans eksportu "
    "byłby niepełny; otwórz konfigurator stacji, aby zsynchronizować źródła."
)
BRAK_WYTRZYMALOSCI = (
    "Konfiguracja stacji nie zawiera danych wytrzymałości zwarciowej aparatury pól."
)
POLE_BEZ_OZNACZENIA = (
    "Wpis konfiguracji stacji nie ma oznaczenia pola — dowodu nie da się przypisać do pola."
)
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
    return f"Źródło {nazwa} nie ma mocy znamionowej z katalogu — bilans eksportu byłby zaniżony."


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


# =============================================================================
# Skladanie
# =============================================================================


class _Kontekst:
    """Indeksy modelu potrzebne przy składaniu (budowane raz na projekt)."""

    def __init__(self, model: EnergyNetworkModel | None) -> None:
        self.generatory: dict[str, Generator] = {
            g.ref_id: g for g in (model.generators if model else [])
        }
        self.transformatory: dict[str, Transformer] = {
            t.ref_id: t for t in (model.transformers if model else [])
        }
        self.stacje: dict[str, Substation] = {
            s.ref_id: s for s in (model.substations if model else [])
        }
        self.moce_odbiorow_kw = moce_odbiorow_stacji_kw(model)
        self.katalog = get_default_mv_catalog()
        self.model = model
        # Uziemienie punktu neutralnego każdej sieci SN — JEDNA funkcja modelu, liczona raz.
        self.uziemienie: tuple[UziemienieSekcji, ...] = (
            uziemienie_sieci(model) if model is not None else ()
        )
        self.poziom = poziom_pol(model) if model is not None else None


def _oznaczenie_pola(pole: Bay) -> str | None:
    """Oznaczenie pola tą samą regułą co konfigurator stacji (numer → skrót odpływu → nazwa)."""
    # Lustro `bayDesignation` konfiguratora stacji (`??` — pierwsza wartość różna od
    # braku): klucz wpisu `bay_vts` jest tym oznaczeniem, a nie nazwą elementu do zdania.
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
    cfg: StationAudit2ConfigBody, ctx: _Kontekst, chwila: str
) -> tuple[list[Audit2ProofResult], list[BrakDanychDowodu]]:
    dowody: list[Audit2ProofResult] = []
    braki: list[BrakDanychDowodu] = []
    magazyny = sorted((d for d in cfg.der_specs if d.der_kind == "BESS"), key=lambda d: d.der_id)
    if not magazyny:
        return dowody, [BrakDanychDowodu(BESS, BRAK_MAGAZYNU)]
    for der in magazyny:
        generator = ctx.generatory.get(der.der_id)
        if generator is None:
            braki.append(BrakDanychDowodu(BESS, MAGAZYN_SPOZA_MODELU))
            continue
        nazwa = nazwa_elementu(generator, "generators")
        tryby = tuple(ref for ref in (der.bess_operation_mode_refs or []) if ref)
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
                    der_id=der.der_id,
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
    cfg: StationAudit2ConfigBody, ctx: _Kontekst, chwila: str
) -> tuple[list[Audit2ProofResult], list[BrakDanychDowodu]]:
    dowody: list[Audit2ProofResult] = []
    braki: list[BrakDanychDowodu] = []
    # Pusty wpis to „bez przełącznika" (konfigurator zapisuje wyczyszczony wybór jako "").
    wpisy = sorted((tr, tc) for tr, tc in cfg.transformer_tap_changers.items() if tc)
    if not wpisy:
        return dowody, [BrakDanychDowodu(ZACZEPY, BRAK_PRZELACZNIKOW)]
    for transformer_id, tap_changer_ref in wpisy:
        tr = ctx.transformatory.get(transformer_id)
        if tr is None:
            braki.append(BrakDanychDowodu(ZACZEPY, TRANSFORMATOR_SPOZA_MODELU))
            continue
        nazwa = nazwa_elementu(tr, "transformers")
        klasa = klasa_transformatora_przelacznika(tr.uhv_kv, tr.ulv_kv)
        if klasa is None:
            braki.append(BrakDanychDowodu(ZACZEPY, _transformator_bez_klasy(tr, nazwa)))
            continue
        # Regulacja automatyczna wymagana wtedy, gdy MODEL deklaruje sterowanie
        # automatyczne przełącznika (`TapChanger.control_mode`), a nie „zawsze, gdy
        # przełącznik ją ma" (dawny warunek tautologiczny: sprawdzenie AVR nie mogło
        # nigdy zawieść).
        wymaga_avr = tr.tap_changer is not None and tr.tap_changer.control_mode == "AUTOMATIC"
        dowody.append(
            generate_tap_changer_plan_proof(
                SpecDowoduPlanuZaczepow(
                    transformer_id=transformer_id,
                    transformer_nazwa=nazwa,
                    transformer_type=klasa,
                    tap_changer_ref=tap_changer_ref,
                    requires_avr=wymaga_avr,
                ),
                generated_at_iso=chwila,
            )
        )
    return dowody, braki


def _dowod_eksportu(
    station_id: str, cfg: StationAudit2ConfigBody, ctx: _Kontekst, chwila: str
) -> tuple[list[Audit2ProofResult], list[BrakDanychDowodu]]:
    if not cfg.der_specs:
        return [], [BrakDanychDowodu(EKSPORT, BRAK_ZRODEL)]
    braki: list[BrakDanychDowodu] = []
    p_import_kw = ctx.moce_odbiorow_kw.get(station_id)
    if p_import_kw is None:
        braki.append(BrakDanychDowodu(EKSPORT, STACJA_BEZ_SZYN))
    p_export_kw = 0.0
    for der in sorted(cfg.der_specs, key=lambda d: d.der_id):
        generator = ctx.generatory.get(der.der_id)
        if generator is None:
            braki.append(BrakDanychDowodu(EKSPORT, ZRODLO_SPOZA_MODELU))
            continue
        moc = der.nominal_power_kw
        if moc is None or not math.isfinite(moc) or moc <= 0:
            braki.append(
                BrakDanychDowodu(EKSPORT, _zrodlo_bez_mocy(nazwa_elementu(generator, "generators")))
            )
            continue
        p_export_kw += moc
    if braki or p_import_kw is None:
        # Bilans z częścią źródeł albo bez importu byłby liczbą o sieci, której nie ma.
        return [], braki
    return [
        generate_hosting_capacity_export_proof(
            SpecDowoduEksportuStacji(
                station_id=station_id, p_export_kw=p_export_kw, p_import_kw=p_import_kw
            ),
            generated_at_iso=chwila,
        )
    ], []


def _dowody_wytrzymalosci(
    cfg: StationAudit2ConfigBody, chwila: str
) -> tuple[list[Audit2ProofResult], list[BrakDanychDowodu]]:
    if not cfg.bay_device_withstand:
        return [], [BrakDanychDowodu(WYTRZYMALOSC, BRAK_WYTRZYMALOSCI)]
    dowody: list[Audit2ProofResult] = []
    braki: list[BrakDanychDowodu] = []
    for pole, dane in sorted(cfg.bay_device_withstand.items()):
        # Pola jawnie, nie `**` ze slownika (karta PROOFPACK-KONTRAKT): rozjazd ksztaltu
        # zapisu i specyfikacji ma byc bledem typow, nie cichym bledem walidacji.
        try:
            spec = SpecDowoduWytrzymalosciAparatu(
                bay_designation=pole,
                device_id=dane.device_id,
                i_peak_calculated_ka=dane.i_peak_calculated_ka,
                i_thermal_calculated_ka=dane.i_thermal_calculated_ka,
                t_clearing_s=dane.t_clearing_s,
            )
        except ValidationError:
            braki.append(BrakDanychDowodu(WYTRZYMALOSC, POLE_BEZ_OZNACZENIA))
            continue
        dowody.append(generate_device_withstand_proof(spec, generated_at_iso=chwila))
    return dowody, braki


def _dowody_przekladnikow(
    station_id: str, cfg: StationAudit2ConfigBody, ctx: _Kontekst, chwila: str
) -> tuple[list[Audit2ProofResult], list[BrakDanychDowodu]]:
    # Pusty wpis to „bez przekładnika" (konfigurator zapisuje wyczyszczony wybór jako "").
    wpisy = sorted((pole, vt) for pole, vt in cfg.bay_vts.items() if vt)
    if not wpisy:
        return [], [BrakDanychDowodu(PRZEKLADNIKI, BRAK_PRZEKLADNIKOW)]
    dowody: list[Audit2ProofResult] = []
    braki: list[BrakDanychDowodu] = []
    for pole, vt_ref in wpisy:
        typ, przyczyna = uziemienie_pola_stacji(ctx, station_id, pole)
        if typ is None:
            assert przyczyna is not None  # kontrakt funkcji: brak typu ⇔ nazwana przyczyna
            braki.append(BrakDanychDowodu(PRZEKLADNIKI, przyczyna))
            continue
        try:
            spec = SpecDowoduUziemieniaPrzekladnika(
                bay_designation=pole,
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
    konfiguracja: Mapping[str, Any] | None,
    model: EnergyNetworkModel | None,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
    _ctx: _Kontekst | None = None,
) -> StationAudit2ProofPack:
    """Pakiet dowodów jednej stacji z zapisanej konfiguracji (słownik pól) i z modelu.

    `konfiguracja is None` — stacja modelu bez zapisanej konfiguracji: każdy rodzaj jest
    jawnym brakiem (stacja nie znika z pakietu i nie dostaje zgodności na domysł).
    """
    ctx = _ctx or _Kontekst(model)
    nazwa_stacji = nazwa_po_identyfikatorze(
        station_id, model, spoza_modelu=f"Stacja {SPOZA_MODELU}"
    )
    if konfiguracja is None:
        return generate_station_audit2_proof_pack(
            station_id=station_id,
            station_nazwa=nazwa_stacji,
            proofs=[],
            braki_danych=[BrakDanychDowodu(r, BRAK_KONFIGURACJI) for r in RODZAJE_DOWODOW],
            generated_at_iso=generated_at_iso,
        )
    try:
        cfg = StationAudit2ConfigBody.model_validate(dict(konfiguracja))
    except ValidationError:
        return generate_station_audit2_proof_pack(
            station_id=station_id,
            station_nazwa=nazwa_stacji,
            proofs=[],
            braki_danych=[BrakDanychDowodu(r, KONFIGURACJA_NIEPOPRAWNA) for r in RODZAJE_DOWODOW],
            generated_at_iso=generated_at_iso,
        )
    dowody: list[Audit2ProofResult] = []
    braki: list[BrakDanychDowodu] = []
    for czesc in (
        _dowody_trybow_bess(cfg, ctx, generated_at_iso),
        _dowody_planu_zaczepow(cfg, ctx, generated_at_iso),
        _dowod_eksportu(station_id, cfg, ctx, generated_at_iso),
        _dowody_wytrzymalosci(cfg, generated_at_iso),
        _dowody_przekladnikow(station_id, cfg, ctx, generated_at_iso),
    ):
        dowody.extend(czesc[0])
        braki.extend(czesc[1])
    return generate_station_audit2_proof_pack(
        station_id=station_id,
        station_nazwa=nazwa_stacji,
        proofs=dowody,
        braki_danych=braki,
        generated_at_iso=generated_at_iso,
    )


def zloz_pakiety_projektu(
    konfiguracje: Sequence[Mapping[str, Any]],
    model: EnergyNetworkModel | None,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> list[StationAudit2ProofPack]:
    """Pakiety dowodów KAŻDEJ stacji w zakresie projektu (kolejność: `station_id`).

    Zakres = stacje modelu sieci ∪ stacje z zapisaną konfiguracją. Stacja modelu bez
    konfiguracji dostaje pakiet z samymi brakami (nie znika); konfiguracja stacji, której
    nie ma w modelu, dostaje nazwę „Stacja spoza modelu" i braki wynikające z modelu.
    `konfiguracje` — słowniki z kluczem `station_id` i polami `StationAudit2ConfigBody`.
    """
    ctx = _Kontekst(model)
    po_stacji: dict[str, Mapping[str, Any] | None] = {s: None for s in ctx.stacje}
    for wiersz in konfiguracje:
        po_stacji[str(wiersz["station_id"])] = {
            k: v for k, v in wiersz.items() if k != "station_id"
        }
    return [
        zloz_pakiet_stacji(
            station_id, po_stacji[station_id], model, generated_at_iso=generated_at_iso, _ctx=ctx
        )
        for station_id in sorted(po_stacji)
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
