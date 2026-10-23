"""Skład pola rozdzielnicy — JEDNA funkcja aparatów pola i statusu gniazd (karta GPZ-H5-APARATURA).

PO CO. Pytanie „jakie aparaty stoją w tym polu i czy pole jest kompletne wobec standardu"
miało trzy odpowiedzi: rysunek i odczyt pola czytały ``Bay.primary_devices`` (gdy niepuste) albo
wyprowadzały aparaty z gałęzi łącznikowych ``equipment_refs`` (gdy puste — nigdy obu), analizy
wytrzymałości i czasu wyłączenia czytały gałęzie z wiązaniem APARAT_SN po kluczu ``meta`` gałęzi,
a stan danych (MODEL/PROPOZYCJA/BRAK_DANYCH) liczono z samego rekordu. Ten moduł jest jedynym
miejscem tej reguły:

* ``aparaty_pola`` — aparaty pola: rekord ``Bay.primary_devices`` w kolejności zapisu, a elementy
  modelu tego pola (gałęzie łącznikowe z ``equipment_refs``, przekładniki ``Measurement`` z
  ``bay_ref``, ograniczniki ``Bay.surge_arresters``, transformator pola transformatorowego,
  wytwórca pola źródłowego) WIĄŻĄ się z aparatem rekordu tego samego rodzaju (``linked_ref``);
  element bez aparatu w rekordzie dochodzi jako aparat wyprowadzony. Jawne ``linked_ref`` w rekordzie
  ma pierwszeństwo (wiązanie zapisane przez operację), dopasowanie rodzajem — tylko dla elementów
  bez jawnego wiązania;
* ``katalog_aparatu`` — pozycja katalogu aparatu: element modelu (gałąź, przekładnik) niesie
  katalog, aparat rekordu go nie dubluje; aparat bez elementu — własne ``catalog_ref``;
* ``sklad_pola`` — wiersze składu: gniazda szablonu standardu (``Bay.szablon_standardu_ref``,
  ``network_model/catalog/gniazda_pol_enea.py``) w kolejności od szyny, każde ze statusem
  ``ZAPROJEKTOWANE`` / ``WYMAGANE_STANDARDEM_BRAK``, a potem aparaty spoza gniazd ze statusem
  ``ZAPROJEKTOWANE`` / ``BRAK_POZYCJI_KATALOGU`` / ``RODZAJ_BEZ_KATALOGU`` /
  ``BRAK_TYPU_GRANICA_WN``. Każdy wiersz niesie zdanie wyjaśnienia (kontrakt werdyktu
  wyjaśnialnego), wymagania gniazda i ich podstawę;
* ``pole_granicy_wn`` — JEDEN predykat strony 110 kV jako granicy zasilania sieci SN (decyzja
  właściciela 2026-10-22): pole na szynie w paśmie WN ma wyłącznie łącznik pola z gałęzią
  modelu, bez katalogu (status ``BRAK_TYPU_GRANICA_WN`` — jawne „brak typu”, nie brak do
  uzupełnienia), operacja wyposażenia pola mu odmawia, a analiza wytrzymałości aparatury go
  pomija.

Moduł nie ocenia doboru aparatu (U_r ≥ U_m sieci, I_th ≥ prąd zwarciowy) — to analiza dowodu
aparatury (``application/analyses/wytrzymalosc_aparatury_pol.py``) z wynikiem i limitem.
Zgodność U_m aparatu z szyną pola na wejściu sprawdza ``zgodnosc_um_aparatu`` (jedna funkcja,
wołana przez operacje zapisu wyposażenia).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from network_model.catalog.gniazda_pol_enea import (
    GniazdoPola,
    SzablonPolaStandardu,
    szablon_pola_standardu,
)
from network_model.pochodne.pasma_napieciowe import (
    napiecie_najwyzsze_sieci_kv,
    pasmo_napieciowe,
    tabela_napiec_sieci,
    tabela_napiec_urzadzenia,
)

from .models import (
    Bay,
    BayPrimaryDevice,
    Branch,
    EnergyNetworkModel,
    Generator,
    Measurement,
    OgranicznikPrzepiecPola,
    Transformer,
    WierszSkladuPola,
)
from .pola import punkt_przylaczenia_pola
from .rola_pola_sn import ROLA_POLA_SN_Z_ALIASU

# ---------------------------------------------------------------------------
# Rodzaje aparatu pola — JEDNE tablice (operacja zapisu, odczyt pola, analizy, front-lustro)
# ---------------------------------------------------------------------------

#: Rodzaj aparatu pierwotnego pola → przestrzeń katalogu. JEDYNA tablica tej reguły (lustro
#: frontu ``ui/field/wyposazeniePola.ts`` przypięte testem
#: ``tests/enm/test_wyposazenie_pola_lustro_frontu.py``).
PRZESTRZEN_KATALOGU_APARATU: dict[str, str] = {
    "CB": "APARAT_SN",
    "LOAD_SWITCH": "APARAT_SN",
    "DS": "APARAT_SN",
    "ES": "APARAT_SN",
    "DS_ES": "APARAT_SN",
    "CT": "CT",
    "VT": "VT",
    "SURGE_ARRESTER": "OGRANICZNIK_SN",
    "VOLTAGE_INDICATOR": "ELEMENT_POLA_SN",
    "EARTHING_TRANSFORMER": "ELEMENT_POLA_SN",
    "NEUTRAL_REACTOR": "ELEMENT_POLA_SN",
    "NEUTRAL_RESISTOR": "ELEMENT_POLA_SN",
    "CAPACITOR_BANK": "ELEMENT_POLA_SN",
}

#: Rodzaj pozycji katalogu (``MVApparatusType.device_kind`` dla APARAT_SN,
#: ``ElementPolaType.rodzaj`` dla ELEMENT_POLA_SN) dopuszczony dla rodzaju aparatu pola.
#: Reklozer jest wyłącznikiem z automatyką SPZ; rozłącznik bezpiecznikowy — rozłącznikiem pola
#: transformatorowego (wkładki są jego częścią).
RODZAJE_KATALOGOWE_APARATU: dict[str, frozenset[str]] = {
    "CB": frozenset({"WYLACZNIK", "REKLOZER"}),
    "LOAD_SWITCH": frozenset({"ROZLACZNIK", "ROZLACZNIK_BEZPIECZNIKOWY"}),
    "DS": frozenset({"ODLACZNIK"}),
    "ES": frozenset({"UZIEMNIK"}),
    "DS_ES": frozenset({"ODLACZNIK_TROJPOLOZENIOWY"}),
    "VOLTAGE_INDICATOR": frozenset({"WSKAZNIK_NAPIECIA"}),
    "EARTHING_TRANSFORMER": frozenset({"TRANSFORMATOR_UZIEMIAJACY"}),
    "NEUTRAL_REACTOR": frozenset({"DLAWIK_GASZACY"}),
    # Rezystor uziemiający punktu neutralnego albo rezystor wymuszający AWSC (strona wtórna
    # dławika, ENEA Zeszyt 1 §16) — oba są rezystorem obwodu punktu neutralnego.
    "NEUTRAL_RESISTOR": frozenset({"REZYSTOR_UZIEMIAJACY", "REZYSTOR_WYMUSZAJACY"}),
    "CAPACITOR_BANK": frozenset({"BATERIA_KONDENSATOROW"}),
}

#: Rodzaje aparatu pola bez katalogu w repozytorium — przyjmowane bez ``catalog_ref``
#: (status ``RODZAJ_BEZ_KATALOGU``): głowica kablowa należy do gałęzi kablowej, transformator
#: pola i wytwórca mają katalog na SWOIM elemencie modelu (wiązanie ``linked_ref``), wkładki
#: bezpiecznikowe pola SN są częścią rozłącznika bezpiecznikowego.
RODZAJE_BEZ_KATALOGU_SN: frozenset[str] = frozenset({"FUSE", "CABLE_HEAD", "TRANSFORMER_DEVICE"})

#: Rodzaje aparatu wskazujące gałąź łącznikową modelu (``linked_ref``) — ich stan
#: (otwarty/zamknięty) jest stanem tej gałęzi.
RODZAJE_Z_GALEZIA: frozenset[str] = frozenset({"CB", "LOAD_SWITCH", "DS", "DS_ES", "FUSE"})
#: Rodzaje wskazujące przekładnik modelu (``Measurement``) — przekładnik pola wiązany z
#: zabezpieczeniem (jedna reprezentacja przekładnika: rekord ``Measurement``).
RODZAJE_Z_PRZEKLADNIKIEM: frozenset[str] = frozenset({"CT", "VT"})
#: Rodzaje z rolą uziemienia (``earthing_role``).
RODZAJE_Z_ROLA_UZIEMIENIA: frozenset[str] = frozenset({"ES", "DS_ES", "SURGE_ARRESTER"})
#: Aparaty łączeniowe toru (sterowalne) — ta sama reguła, co szablony pola.
RODZAJE_STEROWALNE: frozenset[str] = frozenset({"CB", "LOAD_SWITCH", "DS", "DS_ES", "ES"})

#: Nazwa rodzaju aparatu w zdaniu dla projektanta.
NAZWY_RODZAJOW_APARATU_POLA_PL: dict[str, str] = {
    "CB": "wyłącznik",
    "LOAD_SWITCH": "rozłącznik",
    "DS": "odłącznik",
    "ES": "uziemnik",
    "DS_ES": "odłącznik trójpołożeniowy (zamknięty / otwarty / uziemiony)",
    "CT": "przekładnik prądowy",
    "VT": "przekładnik napięciowy",
    "SURGE_ARRESTER": "ogranicznik przepięć",
    "VOLTAGE_INDICATOR": "wskaźnik obecności napięcia",
    "EARTHING_TRANSFORMER": "transformator uziemiający",
    "NEUTRAL_REACTOR": "dławik gaszący",
    "NEUTRAL_RESISTOR": "rezystor uziemiający",
    "CAPACITOR_BANK": "bateria kondensatorów",
    "FUSE": "bezpieczniki",
    "CABLE_HEAD": "głowica kablowa",
    "TRANSFORMER_DEVICE": "transformator pola",
    "GENERATOR_PV": "jednostka wytwórcza PV",
    "GENERATOR_BESS": "magazyn energii",
    "GENERATOR_FW": "turbina wiatrowa",
    "PCS": "przekształtnik",
    "BATTERY": "bateria magazynu",
}

#: Statusy składu pola — etykieta dla projektanta (lustro frontu, ten sam test lustra).
NAZWY_STATUSOW_SKLADU_PL: dict[str, str] = {
    "ZAPROJEKTOWANE": "zaprojektowane",
    "WYMAGANE_STANDARDEM_BRAK": "wymagane standardem — brak aparatu z katalogu",
    "BRAK_POZYCJI_KATALOGU": "aparat bez pozycji katalogowej",
    "RODZAJ_BEZ_KATALOGU": "rodzaj bez katalogu (dane elementu modelu)",
    "BRAK_TYPU_GRANICA_WN": "brak typu — łącznik pola 110 kV (granica zasilania sieci SN)",
}

#: Typ gałęzi łącznikowej modelu → (rodzaj aparatu, umiejscowienie, sterowalny) aparatu
#: wyprowadzonego, gdy rekord pola nie ma aparatu tego rodzaju.
RODZAJ_APARATU_GALEZI: dict[str, tuple[str, str, bool]] = {
    "breaker": ("CB", "MIDSTREAM", True),
    "bus_coupler": ("CB", "MIDSTREAM", True),
    "disconnector": ("DS", "UPSTREAM", True),
    "switch": ("LOAD_SWITCH", "MIDSTREAM", True),
    "fuse": ("FUSE", "DOWNSTREAM", False),
    "cable": ("CABLE_HEAD", "DOWNSTREAM", False),
}

#: Rodzaj elementu modelu → rodzaje aparatu rekordu, z którymi element się wiąże.
_RODZAJE_DOPASOWANIA: dict[str, frozenset[str]] = {
    "CB": frozenset({"CB"}),
    "DS": frozenset({"DS", "DS_ES"}),
    "LOAD_SWITCH": frozenset({"LOAD_SWITCH"}),
    "FUSE": frozenset({"FUSE"}),
    "CABLE_HEAD": frozenset({"CABLE_HEAD"}),
    "CT": frozenset({"CT"}),
    "VT": frozenset({"VT"}),
    "SURGE_ARRESTER": frozenset({"SURGE_ARRESTER"}),
    "TRANSFORMER_DEVICE": frozenset({"TRANSFORMER_DEVICE"}),
    "GENERATOR_PV": frozenset({"GENERATOR_PV"}),
    "GENERATOR_BESS": frozenset({"GENERATOR_BESS"}),
    "GENERATOR_FW": frozenset({"GENERATOR_FW"}),
}

#: Rola kanoniczna pola w odczycie (``BayBaseModel.bay_role``) — z kanonu ról pola SN.
ROLA_KANONICZNA_Z_ALIASU: dict[str, str] = {
    alias: rola for alias, rola in ROLA_POLA_SN_Z_ALIASU.items() if alias != rola
}


# ---------------------------------------------------------------------------
# Indeks modelu (raz na model — odczyt pola dla wszystkich pól stacji)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IndeksModeluPola:
    """Elementy modelu po kluczach, których szuka skład pola (budowany raz na model)."""

    galezie: dict[str, Branch] = field(default_factory=dict)
    przekladniki_pola: dict[str, list[Measurement]] = field(default_factory=dict)
    transformatory_szyny: dict[str, list[Transformer]] = field(default_factory=dict)
    wytworcy_szyny: dict[str, list[Generator]] = field(default_factory=dict)
    napiecia_szyn: dict[str, float] = field(default_factory=dict)
    przekladniki: dict[str, Measurement] = field(default_factory=dict)
    #: Ograniczniki pól (`Bay.surge_arresters`) po identyfikatorze aparatu — wpis ogranicznika
    #: jest rekordem ogranicznika pola (z katalogiem), aparat rekordu go wskazuje.
    ograniczniki: dict[str, OgranicznikPrzepiecPola] = field(default_factory=dict)


def indeks_modelu_pola(enm: EnergyNetworkModel) -> IndeksModeluPola:
    """Indeks elementów modelu dla składu pola (kolejność deterministyczna: ``ref_id``)."""
    przekladniki: dict[str, list[Measurement]] = {}
    for pomiar in enm.measurements:
        if pomiar.bay_ref:
            przekladniki.setdefault(pomiar.bay_ref, []).append(pomiar)
    transformatory: dict[str, list[Transformer]] = {}
    for transformator in enm.transformers:
        transformatory.setdefault(transformator.hv_bus_ref, []).append(transformator)
        transformatory.setdefault(transformator.lv_bus_ref, []).append(transformator)
    wytworcy: dict[str, list[Generator]] = {}
    for wytworca in enm.generators:
        wytworcy.setdefault(wytworca.bus_ref, []).append(wytworca)
    for grupa in (przekladniki, transformatory, wytworcy):
        for lista in grupa.values():
            lista.sort(key=lambda e: e.ref_id)
    return IndeksModeluPola(
        galezie={g.ref_id: g for g in enm.branches},
        przekladniki_pola=przekladniki,
        transformatory_szyny=transformatory,
        wytworcy_szyny=wytworcy,
        napiecia_szyn={b.ref_id: float(b.voltage_kv) for b in enm.buses if b.voltage_kv},
        przekladniki={m.ref_id: m for m in enm.measurements},
        ograniczniki={o.device_ref: o for b in enm.bays for o in b.surge_arresters if o.device_ref},
    )


def rola_pola_w_skladzie(indeks: IndeksModeluPola, bay: Bay) -> str:
    """Rola kanoniczna pola w odczycie: alias ``bay_role`` przez kanon, a pole źródłowe (``OZE``)
    wg rodzaju wytwórcy na szynie pola (BESS / turbina wiatrowa / PV)."""
    if bay.bay_role == "OZE":
        typy = {str(g.gen_type).upper() for g in indeks.wytworcy_szyny.get(bay.bus_ref, [])}
        if {"BESS", "BESS_INVERTER"} & typy:
            return "BESS_SN"
        if {"WIND_INVERTER", "FW_PMSG", "FW_DFIG", "FW_SCIG"} & typy:
            return "FW_SN"
        return "PV_SN"
    # Każda rola `Bay.bay_role` poza `OZE` jest w mapie kanonu (zamknięty `Literal`).
    return ROLA_KANONICZNA_Z_ALIASU[bay.bay_role]


# ---------------------------------------------------------------------------
# Aparaty pola (rekord + elementy modelu)
# ---------------------------------------------------------------------------


def _aparat_elementu(
    *,
    ref: str,
    rodzaj: str,
    umiejscowienie: str,
    sterowalny: bool,
    catalog_ref: str | None,
    earthing_role: str | None = None,
    symbol: str | None = None,
) -> BayPrimaryDevice:
    return BayPrimaryDevice(
        device_ref=ref,
        linked_ref=ref,
        catalog_ref=catalog_ref,
        symbol_ref=symbol or f"symbol:{rodzaj.lower()}",
        kind=rodzaj,  # type: ignore[arg-type]
        placement=umiejscowienie,  # type: ignore[arg-type]
        is_controllable=sterowalny,
        render_variant="kanoniczny",
        earthing_role=earthing_role,  # type: ignore[arg-type]
    )


def _elementy_pola(indeks: IndeksModeluPola, bay: Bay, rola: str) -> list[BayPrimaryDevice]:
    """Elementy modelu należące do pola, jako aparaty wyprowadzone (kolejność: gałęzie wg
    ``equipment_refs`` posortowanych, przekładniki, ograniczniki, transformator, wytwórca)."""
    wynik: list[BayPrimaryDevice] = []
    for ref in sorted(bay.equipment_refs):
        galaz = indeks.galezie.get(ref)
        mapa = RODZAJ_APARATU_GALEZI.get(getattr(galaz, "type", "")) if galaz else None
        if galaz is None or mapa is None:
            continue
        rodzaj, umiejscowienie, sterowalny = mapa
        wynik.append(
            _aparat_elementu(
                ref=galaz.ref_id,
                rodzaj=rodzaj,
                umiejscowienie=umiejscowienie,
                sterowalny=sterowalny,
                catalog_ref=getattr(galaz, "catalog_ref", None),
            )
        )
    for pomiar in indeks.przekladniki_pola.get(bay.ref_id, []):
        rodzaj = "CT" if pomiar.measurement_type == "CT" else "VT"
        wynik.append(
            _aparat_elementu(
                ref=pomiar.ref_id,
                rodzaj=rodzaj,
                umiejscowienie="MIDSTREAM" if rodzaj == "CT" else "OFF_PATH",
                sterowalny=False,
                catalog_ref=pomiar.catalog_ref,
            )
        )
    for ogranicznik in bay.surge_arresters:
        if ogranicznik.device_ref:
            wynik.append(
                _aparat_elementu(
                    ref=ogranicznik.device_ref,
                    rodzaj="SURGE_ARRESTER",
                    umiejscowienie="GROUND_BRANCH",
                    sterowalny=False,
                    catalog_ref=ogranicznik.catalog_ref,
                    earthing_role="surge_ground",
                    symbol="symbol:surge_arrester_10ka",
                )
            )
    if rola == "TRANSFORMATOROWE":
        # POLA-W-TORZE: transformator leży na ZACISKU pola transformatorowego (aparat pola
        # w torze) — pole bez własnego zacisku (dane zastane) wskazuje szynę pola.
        punkt = punkt_przylaczenia_pola(bay)
        transformatory = indeks.transformatory_szyny.get(punkt, []) if punkt else []
        if transformatory:
            wynik.append(
                _aparat_elementu(
                    ref=transformatory[0].ref_id,
                    rodzaj="TRANSFORMER_DEVICE",
                    umiejscowienie="DOWNSTREAM",
                    sterowalny=False,
                    catalog_ref=transformatory[0].catalog_ref,
                )
            )
    rodzaj_wytworcy = {
        "PV_SN": "GENERATOR_PV",
        "BESS_SN": "GENERATOR_BESS",
        "FW_SN": "GENERATOR_FW",
    }
    wytworcy = indeks.wytworcy_szyny.get(bay.bus_ref, [])
    if rola in rodzaj_wytworcy and wytworcy:
        wynik.append(
            _aparat_elementu(
                ref=wytworcy[0].ref_id,
                rodzaj=rodzaj_wytworcy[rola],
                umiejscowienie="DOWNSTREAM",
                sterowalny=False,
                catalog_ref=wytworcy[0].catalog_ref,
            )
        )
    return wynik


def aparaty_pola(indeks: IndeksModeluPola, bay: Bay) -> list[BayPrimaryDevice]:
    """JEDNA lista aparatów pola: rekord ``primary_devices`` + elementy modelu pola.

    Element modelu wskazany jawnie (``linked_ref`` aparatu rekordu) jest już w liście. Element
    bez jawnego wskazania wiąże się z PIERWSZYM aparatem rekordu tego samego rodzaju bez
    wiązania (kolejność rekordu = kolejność gniazd od szyny); katalog wiązanego aparatu
    niesie odtąd element (``katalog_aparatu``). Dla elementu bez takiego aparatu dopisany
    jest aparat wyprowadzony
    (posortowany po umiejscowieniu i identyfikatorze, jak pole bez rekordu). Elementy: gałąź
    łącznikowa, przekładnik ``Measurement``, wpis ogranicznika ``surge_arresters`` (rekord
    ogranicznika pola z katalogiem), transformator, wytwórca.
    """
    rola = rola_pola_w_skladzie(indeks, bay)
    rekord = [d.model_copy(deep=True) for d in bay.primary_devices]
    wskazane = {d.linked_ref for d in rekord if d.linked_ref}
    identyfikatory = {d.device_ref for d in rekord}
    dopisane: list[BayPrimaryDevice] = []
    for element in _elementy_pola(indeks, bay, rola):
        ref = str(element.linked_ref)
        if ref in wskazane or ref in identyfikatory:
            continue
        dopuszczalne = _RODZAJE_DOPASOWANIA.get(element.kind, frozenset({element.kind}))
        wolny = next(
            (i for i, d in enumerate(rekord) if d.kind in dopuszczalne and d.linked_ref is None),
            None,
        )
        if wolny is not None:
            rekord[wolny] = rekord[wolny].model_copy(update={"linked_ref": ref})
            wskazane.add(ref)
            continue
        dopisane.append(element)
    dopisane.sort(key=lambda d: (d.placement, d.device_ref))
    return [*rekord, *dopisane]


def aparaty_gniazd_standardu(bay_ref: str, szablon: SzablonPolaStandardu) -> list[dict[str, Any]]:
    """Aparaty rekordu pola dla gniazd szablonu standardu — każde gniazdo jako aparat bez
    pozycji katalogu (status ``WYMAGANE_STANDARDEM_BRAK``), w kolejności gniazd od szyny.

    JEDNO miejsce budowy gniazd pola: tryb ``standard`` operacji ``set_bay_equipment`` i budowa
    pól GPZ (``add_grid_source_sn``; stąd ten moduł — operacja budowy GPZ nie importuje modułu
    operacji wyposażenia, cykl importu). Identyfikator aparatu wynika z pola i gniazda
    (determinizm)."""
    return [
        {
            "device_ref": f"{bay_ref}::gn::{gniazdo.id}",
            "symbol_ref": f"symbol:{gniazdo.rodzaj.lower()}",
            "kind": gniazdo.rodzaj,
            "placement": gniazdo.placement,
            "is_controllable": gniazdo.rodzaj in RODZAJE_STEROWALNE,
            "render_variant": "kanoniczny",
            "gniazdo_ref": gniazdo.id,
            **({"earthing_role": gniazdo.earthing_role} if gniazdo.earthing_role else {}),
        }
        for gniazdo in szablon.gniazda
    ]


def katalog_aparatu(
    indeks: IndeksModeluPola, aparat: BayPrimaryDevice
) -> tuple[str | None, str | None]:
    """``(catalog_ref, przestrzeń)`` aparatu: katalog ELEMENTU modelu, który aparat wskazuje
    (gałąź łącznikowa, przekładnik), a bez elementu — własne ``catalog_ref`` aparatu w
    przestrzeni jego rodzaju. Element bez katalogu nie przejmuje katalogu aparatu rekordu
    (operacja zapisu odmawia takiego dubla — jedna prawda katalogu)."""
    if aparat.linked_ref:
        galaz = indeks.galezie.get(aparat.linked_ref)
        if galaz is not None:
            ref = getattr(galaz, "catalog_ref", None)
            if not ref:
                return None, None
            return ref, getattr(galaz, "catalog_namespace", None) or "APARAT_SN"
        pomiar = indeks.przekladniki.get(aparat.linked_ref)
        if pomiar is not None:
            if not pomiar.catalog_ref:
                return None, None
            return pomiar.catalog_ref, pomiar.catalog_namespace or pomiar.measurement_type
        ogranicznik = indeks.ograniczniki.get(aparat.linked_ref)
        if ogranicznik is not None:
            if not ogranicznik.catalog_ref:
                return None, None
            return ogranicznik.catalog_ref, ogranicznik.catalog_namespace or "OGRANICZNIK_SN"
        # Transformator i wytwórca: katalog elementu przepisany na aparat wyprowadzony
        # (przestrzeń niesie element — aparat jej nie zgaduje).
        return (aparat.catalog_ref, None) if aparat.catalog_ref else (None, None)
    if not aparat.catalog_ref:
        return None, None
    return aparat.catalog_ref, PRZESTRZEN_KATALOGU_APARATU.get(aparat.kind)


# ---------------------------------------------------------------------------
# Skład pola: gniazda standardu + aparaty spoza gniazd
# ---------------------------------------------------------------------------


def nazwa_aparatu_pola(aparat: BayPrimaryDevice) -> str:
    rodzaj = NAZWY_RODZAJOW_APARATU_POLA_PL.get(aparat.kind, aparat.kind)
    return f"{rodzaj} {aparat.designation}" if aparat.designation else rodzaj


def _wiersz_gniazda(
    indeks: IndeksModeluPola,
    szablon: SzablonPolaStandardu,
    gniazdo: GniazdoPola,
    aparat: BayPrimaryDevice | None,
) -> WierszSkladuPola:
    catalog_ref, przestrzen = katalog_aparatu(indeks, aparat) if aparat else (None, None)
    rodzaj_pl = NAZWY_RODZAJOW_APARATU_POLA_PL.get(gniazdo.rodzaj, gniazdo.rodzaj)
    if catalog_ref:
        status = "ZAPROJEKTOWANE"
        opis = (
            f"Gniazdo „{gniazdo.nazwa_pl}” ({szablon.nazwa_pl}) obsadzone aparatem z katalogu "
            f"(pozycja {catalog_ref}); wymagania gniazda ocenia dowód doboru aparatury."
        )
    elif aparat is not None:
        status = "WYMAGANE_STANDARDEM_BRAK"
        opis = (
            f"Gniazdo „{gniazdo.nazwa_pl}” ({szablon.nazwa_pl}) ma aparat bez pozycji "
            "katalogowej — standard wymaga aparatu o podanych znamionach; wskaż typ z katalogu."
        )
    else:
        status = "WYMAGANE_STANDARDEM_BRAK"
        opis = (
            f"Gniazdo „{gniazdo.nazwa_pl}” ({szablon.nazwa_pl}) jest wymagane standardem, a pole "
            "nie ma w nim aparatu — wskaż typ z katalogu."
        )
    return WierszSkladuPola(
        gniazdo_ref=gniazdo.id,
        gniazdo_nazwa_pl=gniazdo.nazwa_pl,
        rodzaj=gniazdo.rodzaj,
        rodzaj_pl=rodzaj_pl,
        device_ref=aparat.device_ref if aparat else None,
        linked_ref=aparat.linked_ref if aparat else None,
        catalog_ref=catalog_ref,
        catalog_namespace=przestrzen,
        status=status,  # type: ignore[arg-type]
        opis_pl=opis,
        podstawa_pl=gniazdo.podstawa_pl,
        interpretacja_pl=gniazdo.interpretacja_pl,
        wymagania=[w.to_dict() for w in gniazdo.wymagania],
    )


def pole_granicy_wn(u_n_szyny_kv: float | None) -> bool:
    """Czy pole leży na stronie 110 kV — granicy zasilania sieci SN (decyzja właściciela
    2026-10-22): szyna pola w paśmie WN (``pasma_napieciowe.pasmo_napieciowe`` = ``'WN'``,
    Uₙ ≥ 110 kV). JEDEN predykat dla statusu składu ``BRAK_TYPU_GRANICA_WN``, odmowy
    ``bay_equipment.bay_hv_boundary`` operacji wyposażenia pola i pominięcia pola w analizie
    wytrzymałości aparatury. Szyna bez napięcia = NIE (strona nieustalona nie jest granicą)."""
    return pasmo_napieciowe(u_n_szyny_kv) == "WN"


def _wiersz_aparatu(
    indeks: IndeksModeluPola, aparat: BayPrimaryDevice, *, granica_wn: bool
) -> WierszSkladuPola:
    catalog_ref, przestrzen = katalog_aparatu(indeks, aparat)
    nazwa = nazwa_aparatu_pola(aparat)
    if catalog_ref:
        status = "ZAPROJEKTOWANE"
        opis = f"Aparat pola ({nazwa}) z pozycją katalogową {catalog_ref}."
    elif granica_wn and aparat.kind in PRZESTRZEN_KATALOGU_APARATU:
        status = "BRAK_TYPU_GRANICA_WN"
        opis = (
            f"Łącznik pola 110 kV ({nazwa}) — brak typu: strona 110 kV jest granicą zasilania "
            "sieci SN i nie ma katalogu aparatury. Do obliczeń wchodzi stan łącznika (gałąź "
            "modelu), nie jego znamiona."
        )
    elif aparat.kind in PRZESTRZEN_KATALOGU_APARATU:
        status = "BRAK_POZYCJI_KATALOGU"
        opis = (
            f"Aparat pola ({nazwa}) nie ma pozycji katalogowej — dobór aparatu nie ma danych "
            "znamionowych; wskaż typ z katalogu."
        )
    else:
        status = "RODZAJ_BEZ_KATALOGU"
        opis = (
            f"Aparat pola ({nazwa}) to rodzaj bez katalogu aparatów pola — jego dane niesie "
            "element modelu, któremu służy (albo nie są wymagane)."
        )
    return WierszSkladuPola(
        rodzaj=aparat.kind,
        rodzaj_pl=NAZWY_RODZAJOW_APARATU_POLA_PL.get(aparat.kind, aparat.kind),
        device_ref=aparat.device_ref,
        linked_ref=aparat.linked_ref,
        catalog_ref=catalog_ref,
        catalog_namespace=przestrzen,
        status=status,  # type: ignore[arg-type]
        opis_pl=opis,
    )


def sklad_pola(indeks: IndeksModeluPola, bay: Bay) -> list[WierszSkladuPola]:
    """Wiersze składu pola: gniazda szablonu standardu (kolejność od szyny), potem aparaty
    spoza gniazd (kolejność listy aparatów). Gniazdo obsadzone kilkoma aparatami daje wiersz
    na aparat (rekord nie dubluje gniazd — operacja zapisu odmawia dwóch aparatów w gnieździe)."""
    aparaty = aparaty_pola(indeks, bay)
    szablon = szablon_pola_standardu(bay.szablon_standardu_ref)
    wiersze: list[WierszSkladuPola] = []
    obsadzone: set[str] = set()
    if szablon is not None:
        for gniazdo in szablon.gniazda:
            w_gniezdzie = [a for a in aparaty if a.gniazdo_ref == gniazdo.id]
            if not w_gniezdzie:
                wiersze.append(_wiersz_gniazda(indeks, szablon, gniazdo, None))
            for aparat in w_gniezdzie:
                obsadzone.add(aparat.device_ref)
                wiersze.append(_wiersz_gniazda(indeks, szablon, gniazdo, aparat))
    granica_wn = pole_granicy_wn(napiecie_szyny_pola(indeks, bay))
    for aparat in aparaty:
        if aparat.device_ref not in obsadzone:
            wiersze.append(_wiersz_aparatu(indeks, aparat, granica_wn=granica_wn))
    return wiersze


# ---------------------------------------------------------------------------
# Zgodność U_m aparatu z szyną pola (jedna funkcja — operacje zapisu wyposażenia)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ZgodnoscUm:
    """Wynik porównania U_m aparatu z napięciem najwyższym sieci szyny pola."""

    zgodna: bool
    u_m_aparatu_kv: float | None
    u_m_sieci_kv: float | None
    u_n_szyny_kv: float | None
    przyczyna_pl: str | None = None


def zgodnosc_um_aparatu(
    u_m_aparatu_kv: float | None, u_n_szyny_kv: float | None, *, wymagane_znane: bool
) -> ZgodnoscUm:
    """Zgodność napięcia najwyższego aparatu U_m z szyną pola — DWA warunki IEC 60038:

    1. ta sama tabela napięć: sieć o Uₙ ≤ 35 kV (tabela 3) przyjmuje urządzenia o U_m ≤ 40,5 kV,
       sieć o Uₙ > 35 kV (tabela 4) — urządzenia o U_m ≥ 52 kV (aparat 123 kV w rozdzielnicy SN
       i aparat 24 kV w polu 110 kV są błędem modelu, nie doborem);
    2. U_m aparatu ≥ U_m sieci (szereg ``NAPIECIE_NAJWYZSZE_SIECI_KV``: ENEA Zeszyt 1 tabela 5,
       IEC 60038 tabele 3 i 4).

    Aparat o U_m nieznanym przechodzi, gdy ``wymagane_znane`` jest fałszem (brak danej pokazuje
    dowód doboru aparatury), a jest odmawiany, gdy prawdą (pole WN — tam aparat bez U_m nie
    daje się odróżnić od aparatu SN). Szyna bez napięcia albo spoza szeregu nie daje
    kryterium 2 (U_m sieci nieustalone — przyczyna nazwana, odmowy brak).
    """
    tabela_sieci = tabela_napiec_sieci(u_n_szyny_kv)
    if tabela_sieci is None:
        return ZgodnoscUm(True, u_m_aparatu_kv, None, u_n_szyny_kv)
    u_m_sieci = napiecie_najwyzsze_sieci_kv(u_n_szyny_kv)
    assert u_n_szyny_kv is not None
    if u_m_aparatu_kv is None:
        if wymagane_znane:
            return ZgodnoscUm(
                False,
                None,
                u_m_sieci,
                u_n_szyny_kv,
                f"pozycja katalogowa nie podaje U_m, a pole pracuje w sieci {u_n_szyny_kv:g} kV — "
                "aparat pola WN wymaga znanego napięcia najwyższego urządzenia",
            )
        return ZgodnoscUm(True, None, u_m_sieci, u_n_szyny_kv)
    tabela_aparatu = tabela_napiec_urzadzenia(u_m_aparatu_kv)
    if tabela_aparatu != tabela_sieci:
        opis_sieci = "do 35 kV" if tabela_sieci == "TAB3" else "powyżej 35 kV"
        return ZgodnoscUm(
            False,
            u_m_aparatu_kv,
            u_m_sieci,
            u_n_szyny_kv,
            f"aparat o U_m {u_m_aparatu_kv:g} kV nie należy do urządzeń sieci {opis_sieci} "
            f"(IEC 60038 tabela {'3' if tabela_sieci == 'TAB3' else '4'}), a szyna pola ma "
            f"{u_n_szyny_kv:g} kV",
        )
    if u_m_sieci is not None and u_m_aparatu_kv < u_m_sieci:
        return ZgodnoscUm(
            False,
            u_m_aparatu_kv,
            u_m_sieci,
            u_n_szyny_kv,
            f"U_m aparatu {u_m_aparatu_kv:g} kV < U_m sieci {u_m_sieci:g} kV szyny "
            f"{u_n_szyny_kv:g} kV (ENEA Zeszyt 1 tabela 5, IEC 60038)",
        )
    return ZgodnoscUm(
        True,
        u_m_aparatu_kv,
        u_m_sieci,
        u_n_szyny_kv,
        (
            None
            if u_m_sieci is not None
            else (
                f"napięcie znamionowe szyny {u_n_szyny_kv:g} kV spoza szeregu IEC 60038 — U_m sieci "
                "nieustalone, sprawdzono wyłącznie tabelę napięć urządzenia"
            )
        ),
    )


@dataclass(frozen=True)
class DanePozycjiAparatu:
    """Dane pozycji katalogu potrzebne regułom składu pola (rodzaj pozycji i U_m)."""

    istnieje: bool
    rodzaj_pozycji: str | None = None
    u_m_kv: float | None = None


def dane_pozycji_aparatu(
    katalog: Any, przestrzen: str | None, catalog_ref: str
) -> DanePozycjiAparatu:
    """Rodzaj pozycji i napięcie najwyższe U_m pozycji katalogu aparatu pola — JEDNO miejsce
    odczytu dla operacji zapisu wyposażenia i analizy wytrzymałości aparatury.

    APARAT_SN: ``device_kind`` i ``u_m_kv`` pozycji, a gdy pozycja nie niesie ``u_m_kv`` —
    ``u_n_kv`` (konwencja katalogu aparatury: napięcie znamionowe aparatu U_r = U_m,
    IEC 62271-1, nagłówek ``mv_switch_catalog.py``). OGRANICZNIK_SN, ELEMENT_POLA_SN —
    ``u_m_kv`` pozycji (``None`` = źródło nie podaje). CT i VT — karta przekładnika w katalogu
    nie niesie napięcia najwyższego (``CTType``/``VTType`` bez pola U_m), więc ``None``: w sieci
    z tabeli 3 IEC 60038 aparat przechodzi (brak danej pokazuje dowód doboru), w paśmie tabeli 4
    jest odmawiany (``zgodnosc_um_aparatu``, ``wymagane_znane``). ``katalog`` —
    ``CatalogRepository`` (typ ``Any``, by moduł modelu nie importował repozytorium katalogu)."""
    if przestrzen == "APARAT_SN":
        pozycja = katalog.mv_apparatus_types.get(catalog_ref)
        if pozycja is None:
            return DanePozycjiAparatu(False)
        u_m = pozycja.u_m_kv if pozycja.u_m_kv is not None else pozycja.u_n_kv
        return DanePozycjiAparatu(True, pozycja.device_kind, float(u_m) if u_m else None)
    if przestrzen in ("CT", "VT"):
        przekladniki = katalog.ct_types if przestrzen == "CT" else katalog.vt_types
        if catalog_ref not in przekladniki:
            return DanePozycjiAparatu(False)
        return DanePozycjiAparatu(True)
    if przestrzen == "OGRANICZNIK_SN":
        ogranicznik = katalog.surge_arrester_types.get(catalog_ref)
        if ogranicznik is None:
            return DanePozycjiAparatu(False)
        return DanePozycjiAparatu(True, None, ogranicznik.u_m_kv)
    if przestrzen == "ELEMENT_POLA_SN":
        element = katalog.element_pola_types.get(catalog_ref)
        if element is None:
            return DanePozycjiAparatu(False)
        return DanePozycjiAparatu(True, element.rodzaj, element.u_m_kv)
    return DanePozycjiAparatu(False)


def wymagane_um_gniazda_kv(gniazdo: GniazdoPola) -> float | None:
    """Wymaganie U_m gniazda (``CO_NAJMNIEJ``) albo ``None`` — gniazdo go nie stawia."""
    for wymaganie in gniazdo.wymagania:
        if wymaganie.parametr == "u_m_kv" and isinstance(wymaganie.wartosc, int | float):
            return float(wymaganie.wartosc)
    return None


def zgodnosc_um_w_gniezdzie(
    u_m_aparatu_kv: float | None, u_n_szyny_kv: float | None, gniazdo: GniazdoPola | None
) -> ZgodnoscUm:
    """Zgodność U_m aparatu z miejscem w polu — JEDEN predykat dla operacji i analizy.

    Gniazdo izolacji sieci (albo aparat spoza gniazd) — ``zgodnosc_um_aparatu`` wobec szyny
    pola, z U_m wymaganym jako znane w paśmie WN (tabela 4 IEC 60038). Gniazdo punktu
    neutralnego transformatora (izolacja stopniowana, ``izolacja == "PUNKT_NEUTRALNY"``) —
    wyłącznie wymaganie U_m gniazda, gdy je stawia (U_m nieznane przy wymaganiu = odmowa);
    porównanie z napięciem szyny byłoby tam błędem (punkt neutralny nie pracuje na U_m sieci)."""
    if gniazdo is not None and gniazdo.izolacja == "PUNKT_NEUTRALNY":
        wymagane = wymagane_um_gniazda_kv(gniazdo)
        if wymagane is None:
            return ZgodnoscUm(True, u_m_aparatu_kv, None, u_n_szyny_kv)
        if u_m_aparatu_kv is None or u_m_aparatu_kv < wymagane:
            opis = "nie podaje U_m" if u_m_aparatu_kv is None else f"ma U_m {u_m_aparatu_kv:g} kV"
            return ZgodnoscUm(
                False,
                u_m_aparatu_kv,
                wymagane,
                u_n_szyny_kv,
                f"pozycja {opis}, a gniazdo „{gniazdo.nazwa_pl}” wymaga U_m ≥ {wymagane:g} kV "
                f"({gniazdo.podstawa_pl})",
            )
        return ZgodnoscUm(True, u_m_aparatu_kv, wymagane, u_n_szyny_kv)
    return zgodnosc_um_aparatu(
        u_m_aparatu_kv,
        u_n_szyny_kv,
        wymagane_znane=tabela_napiec_sieci(u_n_szyny_kv) == "TAB4",
    )


def napiecie_szyny_pola(indeks: IndeksModeluPola, bay: Bay | Mapping[str, Any]) -> float | None:
    """Napięcie znamionowe szyny pola [kV] (``None`` — szyna bez napięcia)."""
    bus_ref = bay.get("bus_ref") if isinstance(bay, Mapping) else bay.bus_ref
    return indeks.napiecia_szyn.get(str(bus_ref)) if bus_ref else None
