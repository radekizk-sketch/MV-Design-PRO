"""FieldInstance → BOM: wyposażenie pola stacji z KATALOGU rozdzielnic SN.

Kanon: `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` (§2 hierarchia
katalogowa, §3 encje, §4 walidator rodziny, §5 generator SLD pola, §7 etap S5).

CO TU JEST. Jedno przejście od WYBORU KATALOGOWEGO projektanta (instancja pola:
katalogowe pole rodziny albo jednostka bloku fabrycznego RMU) do BOM pola, czyli
listy aparatów w kształcie `BayPrimaryDevice`, którą operacja domenowa zapisuje
do ENM. Z tego samego BOM-u rysuje mini-SLD kreatora i globalny SLD — pole ma
JEDNO źródło wyposażenia, nie dwa (zakaz osobnej rekonstrukcji, §2/§5).

DWIE NOMENKLATURY REFERENCJI POLA, JEDEN RESOLVER. W danych krążą dwa rodzaje
`bay_template_ref`:

* kanoniczny szablon pola (`bay_template_line_out` — `catalog/bay_templates.py`),
* katalogowe pole rodziny (`ABB__SAFERING__LINE_OUT` — `CompleteMvBayTemplate`
  z `catalog/switchgear/`).

Do etapu S5 aparaty pola materializował WYŁĄCZNIE `template_primary_devices`,
który zna tylko pierwszą nomenklaturę. Referencja producencka dawała po cichu
PUSTĄ listę aparatów: pole wybrane z katalogu rodziny lądowało w ENM bez ani
jednego aparatu, a SLD wracał do rysowania z konwencji. `rozwiaz_aparaty_pola`
jest jednym wejściem dla OBU nomenklatur, więc ta sama referencja nie może już
znaczyć „pełne pole" w jednym miejscu i „brak danych" w drugim.

ZERO FABRYKACJI. Każdy zmaterializowany aparat niesie referencję katalogową
(`catalog_ref` = `BayDeviceInstanceTemplate.device_template_ref`) — pochodzenie
jest daną, nie domysłem. Aparat, którego katalogowe pole nie przewiduje, nie
powstaje; aparat, który pole przewiduje, a ENM nie umie go reprezentować, kończy
się TWARDYM błędem (`NiezgodnoscKonfiguracjiError`), nigdy cichym pominięciem
(§5: „zakaz pomijania aparatu obecnego w BOM").

PREDYKATY PARAMI. Warunek WEJŚCIA (co katalogowe pole deklaruje) i warunek
WYJŚCIA (co powstaje w ENM) mają JEDNO źródło: tablica
`RODZAJ_ENM_DLA_APARATU_KATALOGU` nie jest przepisana ręcznie, tylko ZŁOŻONA
z dwóch istniejących tablic o wspólnym kluczu (`BayDeviceTemplate.kind`).
Dopisanie rodzaju aparatu po jednej stronie bez drugiej wywala asercję modułu.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from network_model.catalog.bay_templates import (
    _SWITCHABLE_PRIMARY_KINDS,
    _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND,
    BAY_TEMPLATE_REGISTRY,
    template_primary_devices,
)
from network_model.catalog.switchgear import (
    CompleteMvBayTemplate,
    FactoryConfiguration,
    FactoryConfigurationUnit,
    NiezgodnoscKonfiguracjiError,
    family_supports_bay_template,
    family_supports_factory_configuration,
    get_factory_configuration,
    list_switchgear_solution_templates_for_manufacturer,
    wymagaj_rodziny_oferowanej,
)
from network_model.catalog.switchgear.apparatus_vocabulary import (
    APPARATUS_KIND_FOR_TEMPLATE_KIND,
)

# ---------------------------------------------------------------------------
# Tożsamość aparatu: katalog rodzin ↔ aparat pierwotny ENM
# ---------------------------------------------------------------------------

#: Rodzaj aparatu ENM (`BayPrimaryDevice.kind`) dla kanonicznej tożsamości
#: katalogowej (`ApparatusKind`). ZŁOŻENIE dwóch istniejących tablic o wspólnym
#: kluczu `BayDeviceTemplate.kind` — nie druga, ręcznie utrzymywana lista:
#:   APPARATUS_KIND_FOR_TEMPLATE_KIND      : kind szablonu → ApparatusKind
#:   _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND : kind szablonu → BayPrimaryDevice.kind
RODZAJ_ENM_DLA_APARATU_KATALOGU: dict[str, str] = {
    APPARATUS_KIND_FOR_TEMPLATE_KIND[kind]: rodzaj_enm
    for kind, rodzaj_enm in _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND.items()
}

assert set(APPARATUS_KIND_FOR_TEMPLATE_KIND) == set(_TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND), (
    "Tożsamość katalogowa aparatu i jego rodzaj w ENM MUSZĄ być opisane na tym "
    "samym zbiorze rodzajów szablonu — inaczej złożenie gubi aparat po cichu."
)
assert len(RODZAJ_ENM_DLA_APARATU_KATALOGU) == len(APPARATUS_KIND_FOR_TEMPLATE_KIND), (
    "Tożsamości katalogowe aparatów muszą być różnowartościowe — powtórzenie "
    "sklejałoby dwa aparaty w jeden wpis odwzorowania."
)

#: Rozłącznik: słownik rodziny NIE rozróżnia odłącznika od rozłącznika (jedno
#: `switch_disconnector`), więc kierunek katalog → ENM trzeba rozstrzygnąć jawnie.
#: Rodzina rozdzielnicy deklaruje tym wpisem ROZŁĄCZNIK (główny łącznik celki
#: RMU: ZPUE TPM Air „L", ABB SafeRing „C"), a nie odłącznik sekcyjny — odłączniki
#: kanoniczne mają własne, drobnoziarniste tożsamości (`disconnector_busbar`,
#: `disconnector_line`) pochodzące ze złożenia powyżej.
RODZAJ_ENM_DLA_APARATU_KATALOGU["switch_disconnector"] = "LOAD_SWITCH"

#: Aparaty łącznika GŁÓWNEGO pola (wyłącznik albo rozłącznik). Odłącznik jest
#: aparatem odłączającym (Q1/Q2), nie łącznikiem głównym — dlatego nie tutaj.
_RODZAJE_LACZNIKA_GLOWNEGO: frozenset[str] = frozenset({"CB", "LOAD_SWITCH"})

#: Kod błędu niezgodności katalogowej pola — JEDEN dla WSZYSTKICH kanałów, które
#: materializują pole z katalogu rodzin rozdzielnic (operacja katalogowa, blok
#: fabryczny RMU, pole GPZ/stacyjne z referencją producencką). Mieszka w module
#: resolvera, bo to on tę niezgodność rozpoznaje — kod trzymany osobno po stronie
#: każdego wołającego rozjechałby obsługę tej samej klasy błędu po kreatorze.
KOD_BLEDU_POLA_KATALOGOWEGO = "sn.pole_katalogowe_niezgodne"


def _oznaczenia_kanoniczne() -> dict[str, str]:
    """Kanoniczne oznaczenie operatorskie aparatu (Q0, Q9, T1, F1, GK, TR).

    WYPROWADZONE z 10 kanonicznych szablonów pola, nie wymyślone: oznaczenie
    aparatu jest daną kanonu rysunku pola. Rodzaj, który w kanonie występuje
    z RÓŻNYMI oznaczeniami (odłącznik szynowy: Q1 w polu liniowym, Q2 w drugim
    slocie sprzęgła), jest niejednoznaczny i NIE trafia do tablicy — takiemu
    aparatowi oznaczenie musi dać slot szablonu, a nie ta funkcja.
    """
    oznaczenia_wg_rodzaju: dict[str, set[str]] = {}
    for szablon in BAY_TEMPLATE_REGISTRY.values():
        for aparat in szablon.devices:
            oznaczenia_wg_rodzaju.setdefault(aparat.kind, set()).add(aparat.designation_q)
    return {
        APPARATUS_KIND_FOR_TEMPLATE_KIND[kind]: next(iter(oznaczenia))
        for kind, oznaczenia in oznaczenia_wg_rodzaju.items()
        if len(oznaczenia) == 1
    }


#: Oznaczenie aparatu dokładanego przez jednostkę bloku fabrycznego (np.
#: bezpieczniki F1 jednostki „T"/„F"). Aparat spoza tej tablicy nie dostaje
#: oznaczenia z domysłu — kończy się twardym błędem.
OZNACZENIE_KANONICZNE_APARATU: dict[str, str] = _oznaczenia_kanoniczne()


def rodzaj_enm_aparatu(apparatus_kind: str) -> str:
    """Rodzaj aparatu pierwotnego ENM dla tożsamości katalogowej (albo błąd).

    Aparat, którego model ENM nie reprezentuje jako aparatu pierwotnego pola
    (szyna, sygnalizator obecności napięcia, przekaźnik, licznik, blokada),
    NIE jest po cichu pomijany: katalogowe pole, które go deklaruje, opisuje
    wyrób, którego rysunek pola nie odda w całości.
    """
    rodzaj = RODZAJ_ENM_DLA_APARATU_KATALOGU.get(apparatus_kind)
    if rodzaj is None:
        raise NiezgodnoscKonfiguracjiError(
            f"Aparat {apparatus_kind!r} katalogowego pola nie ma odpowiednika "
            "wsrod aparatow pierwotnych pola w modelu sieci — pole nie moze "
            "powstac z pominieciem aparatu, ktory katalog przewiduje."
        )
    return rodzaj


# ---------------------------------------------------------------------------
# Rejestr katalogowych pól rodzin (leniwy, deterministyczny)
# ---------------------------------------------------------------------------

_REJESTR_POL_KATALOGOWYCH: dict[str, CompleteMvBayTemplate] | None = None


def _rejestr_pol_katalogowych() -> dict[str, CompleteMvBayTemplate]:
    """Katalogowe pola WSZYSTKICH oferowanych rodzin, wg `template_ref`.

    Budowane raz: rejestr rodzin jest stałą modułu katalogu, więc powtórne
    składanie dawałoby te same obiekty przy każdym wywołaniu operacji.
    """
    global _REJESTR_POL_KATALOGOWYCH
    if _REJESTR_POL_KATALOGOWYCH is None:
        _REJESTR_POL_KATALOGOWYCH = {
            szablon.template_ref: szablon
            for szablon in list_switchgear_solution_templates_for_manufacturer(None)
        }
    return _REJESTR_POL_KATALOGOWYCH


def pole_katalogowe(template_ref: str) -> CompleteMvBayTemplate | None:
    """Katalogowe pole rodziny po referencji (`None`, gdy to nie jest ono)."""
    return _rejestr_pol_katalogowych().get(template_ref)


# ---------------------------------------------------------------------------
# Plan pola (BOM) — wynik rozwiązania wyboru katalogowego
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PlanPolaKatalogowego:
    """BOM pola stacji wyprowadzony z wyboru katalogowego projektanta."""

    bay_template_ref: str
    switchgear_family_ref: str
    manufacturer_ref: str | None
    bay_kind: str
    bay_role: str
    #: Rodzaj aparatu głównego w nomenklaturze `BayPrimaryDevice.kind`
    #: (`None`, gdy katalogowe pole nie ma łącznika ani odłącznika — np. pole
    #: rezerwowe z samym uziemnikiem).
    rodzaj_aparatu_glownego: str | None
    aparaty: tuple[dict[str, Any], ...]
    zrodlo_opis_pl: str
    factory_configuration_ref: str | None = None
    factory_unit_index: int | None = None


def _tekst(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def czy_wybor_katalogowy(payload: dict[str, Any]) -> bool:
    """Czy payload wskazuje POLE KATALOGOWE (a nie kanoniczny szablon)?

    Trzy kanały tego samego wyboru: jawna referencja katalogowego pola, blok
    fabryczny RMU oraz `bay_template_ref` wskazujące katalogowe pole rodziny
    (tak wysyła kreator pola SN). Referencja spoza katalogu (np. kanoniczne
    `bay_template_line_out` albo ref, którego katalog nie zna) NIE jest wyborem
    katalogowym — idzie ścieżką kanoniczną bez zmiany zachowania.
    """
    if _tekst(payload.get("complete_bay_template_ref")):
        return True
    if _tekst(payload.get("factory_configuration_ref")):
        return True
    ref = _tekst(payload.get("bay_template_ref"))
    return ref is not None and pole_katalogowe(ref) is not None


def _aparat_pierwotny(
    *,
    field_ref: str | None,
    pozycja: int,
    rodzaj_enm: str,
    oznaczenie: str,
    placement: str,
    catalog_ref: str,
) -> dict[str, Any]:
    """Pojedynczy aparat pierwotny pola w kształcie `BayPrimaryDevice`.

    `field_ref=None` (podgląd konfiguracji): aparat NIE dostaje identyfikatora.
    Tożsamość aparatu powstaje razem z polem — podgląd, który by ją nadał,
    obiecywałby identyfikator, którego w modelu jeszcze nie ma.
    """
    aparat: dict[str, Any] = {}
    if field_ref is not None:
        aparat["device_ref"] = f"{field_ref}::dev::{pozycja}"
    aparat |= {
        "symbol_ref": f"symbol:{rodzaj_enm.lower()}",
        "kind": rodzaj_enm,
        "placement": placement,
        "is_controllable": rodzaj_enm in _SWITCHABLE_PRIMARY_KINDS,
        "render_variant": "kanoniczny",
        "designation": oznaczenie,
        # Pochodzenie katalogowe APARATU (§2: BOM → ENM → SLD). Referencja
        # wskazuje pozycję wyposażenia katalogowego pola, z której aparat
        # powstał — bez niej „katalog-first" byłoby deklaracją bez dowodu.
        "catalog_ref": catalog_ref,
    }
    if rodzaj_enm == "ES":
        aparat["earthing_role"] = "field_earth"
    elif rodzaj_enm == "SURGE_ARRESTER":
        aparat["earthing_role"] = "surge_ground"
    return aparat


@dataclass(frozen=True)
class _SlotPola:
    """Slot katalogowego pola: kanoniczne miejsce w torze + tożsamość katalogowa.

    Katalogowe pole niesie DWA opisy tego samego aparatu: `base_template.devices`
    (miejsce w torze pola — umiejscowienie i oznaczenie operatorskie) oraz
    `device_instances` (tożsamość katalogowa i referencja wyposażenia). Powstają
    z jednego przebiegu (`instancje_aparatow_z_szablonu`), więc są parą — a nie
    dwiema listami do rozjechania. Ta klasa trzyma je razem, żeby żadna ścieżka
    nie czytała jednej bez drugiej.
    """

    umiejscowienie: str
    oznaczenie: str
    apparatus_kind: str
    catalog_ref: str


def _sloty_pola(szablon: CompleteMvBayTemplate) -> list[_SlotPola]:
    """Sparowane sloty katalogowego pola (albo twardy błąd przy rozjeździe).

    Parowanie po POZYCJI jest bezpieczne wyłącznie wtedy, gdy obie listy opisują
    ten sam zbiór aparatów w tej samej kolejności. Rozjazd długości oznacza, że
    katalogowe pole opisuje dwa różne wyposażenia — materializacja z takiego
    pola byłaby zgadywaniem, które z nich jest prawdziwe.
    """
    urzadzenia = szablon.base_template.devices
    instancje = szablon.device_instances
    if len(urzadzenia) != len(instancje):
        raise NiezgodnoscKonfiguracjiError(
            f"Katalogowe pole {szablon.template_ref} ma {len(urzadzenia)} aparatow "
            f"w torze i {len(instancje)} pozycji wyposazenia — obie listy musza "
            "opisywac to samo pole."
        )
    return [
        _SlotPola(
            umiejscowienie=urzadzenie.placement,
            oznaczenie=urzadzenie.designation_q,
            apparatus_kind=instancja.apparatus_kind,
            catalog_ref=instancja.device_template_ref,
        )
        for urzadzenie, instancja in zip(urzadzenia, instancje, strict=True)
    ]


def _indeks_lacznika_glownego(szablon: CompleteMvBayTemplate, sloty: list[_SlotPola]) -> int | None:
    """Pozycja slotu łącznika głównego pola (wyłącznik albo rozłącznik).

    Pole ma DOKŁADNIE jeden łącznik główny albo nie ma go wcale (pole pomiarowe,
    rezerwowe). Dwa łączniki główne w jednym polu to niejednoznaczność, której
    nie wolno rozstrzygać kolejnością listy — kończy się twardym błędem.
    """
    indeksy = [
        indeks
        for indeks, slot in enumerate(sloty)
        if rodzaj_enm_aparatu(slot.apparatus_kind) in _RODZAJE_LACZNIKA_GLOWNEGO
    ]
    if len(indeksy) > 1:
        etykiety = ", ".join(sloty[indeks].oznaczenie for indeks in indeksy)
        raise NiezgodnoscKonfiguracjiError(
            f"Katalogowe pole {szablon.template_ref} ma wiecej niz jeden lacznik "
            f"glowny ({etykiety}) — nie da sie rozstrzygnac, ktory aparat opisuje "
            "tor glowny pola."
        )
    return indeksy[0] if indeksy else None


def _aparaty_z_pola_katalogowego(
    szablon: CompleteMvBayTemplate,
    *,
    field_ref: str | None,
    podmiana_toru_glownego: tuple[tuple[str, str], ...] | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    """BOM katalogowego pola → aparaty pierwotne ENM (+ rodzaj aparatu głównego).

    `podmiana_toru_glownego` (tor BLOK_RMU): pary (aparat, referencja katalogowa)
    zadeklarowane przez JEDNOSTKĘ bloku fabrycznego zastępują łącznik główny
    katalogowego pola. Blok fabryczny jest wyrobem: bloki różniące się wyłącznie
    aparatem jednostki (SafeRing CCF z rozłącznikiem bezpiecznikowym vs CCV
    z wyłącznikiem) to różne wyroby, więc pole jednostki nie może dziedziczyć
    łącznika po ogólnym polu rodziny. Reszta toru (odłączniki, uziemnik,
    przekładniki, głowica, transformator) pochodzi z katalogowego pola rodziny —
    nic nie jest zmyślane. Aparat z jednostki niesie referencję JEDNOSTKI, a nie
    slotu, który zastąpił: inaczej model twierdziłby, że bezpieczniki bloku
    pochodzą z pozycji wyłącznika pola ogólnego.
    """
    sloty = _sloty_pola(szablon)
    indeks_lacznika = _indeks_lacznika_glownego(szablon, sloty)
    if podmiana_toru_glownego is not None and indeks_lacznika is None:
        raise NiezgodnoscKonfiguracjiError(
            f"Katalogowe pole {szablon.template_ref} nie ma slotu lacznika "
            "glownego, wiec nie da sie w nim osadzic aparatury jednostki bloku "
            "fabrycznego."
        )

    aparaty: list[dict[str, Any]] = []
    rodzaj_glownego: str | None = None
    for indeks, slot in enumerate(sloty):
        if podmiana_toru_glownego is not None and indeks == indeks_lacznika:
            for kolejnosc, (apparatus_kind, catalog_ref) in enumerate(podmiana_toru_glownego):
                rodzaj_enm = rodzaj_enm_aparatu(apparatus_kind)
                # Pierwszy aparat jednostki wchodzi w SLOT łącznika głównego
                # pola (przejmuje jego oznaczenie); kolejne aparaty toru
                # (np. bezpieczniki rozłącznika bezpiecznikowego) dostają
                # oznaczenie kanoniczne swojego rodzaju.
                if kolejnosc == 0:
                    oznaczenie = slot.oznaczenie
                else:
                    oznaczenie_kanoniczne = OZNACZENIE_KANONICZNE_APARATU.get(apparatus_kind)
                    if oznaczenie_kanoniczne is None:
                        raise NiezgodnoscKonfiguracjiError(
                            f"Aparat {apparatus_kind!r} jednostki bloku nie ma "
                            "jednoznacznego oznaczenia w kanonie pola — nie "
                            "wolno go oznaczyc z domyslu."
                        )
                    oznaczenie = oznaczenie_kanoniczne
                if rodzaj_enm in _RODZAJE_LACZNIKA_GLOWNEGO:
                    rodzaj_glownego = rodzaj_enm
                aparaty.append(
                    _aparat_pierwotny(
                        field_ref=field_ref,
                        pozycja=len(aparaty),
                        rodzaj_enm=rodzaj_enm,
                        oznaczenie=oznaczenie,
                        placement=slot.umiejscowienie,
                        catalog_ref=catalog_ref,
                    )
                )
            continue
        rodzaj_enm = rodzaj_enm_aparatu(slot.apparatus_kind)
        if rodzaj_enm in _RODZAJE_LACZNIKA_GLOWNEGO:
            rodzaj_glownego = rodzaj_enm
        aparaty.append(
            _aparat_pierwotny(
                field_ref=field_ref,
                pozycja=len(aparaty),
                rodzaj_enm=rodzaj_enm,
                oznaczenie=slot.oznaczenie,
                placement=slot.umiejscowienie,
                catalog_ref=slot.catalog_ref,
            )
        )

    if rodzaj_glownego is None:
        # Pole bez łącznika głównego (pomiarowe, rezerwowe): aparatem
        # rozstrzygającym typ gałęzi jest pierwszy aparat odłączający toru.
        rodzaj_glownego = next(
            (aparat["kind"] for aparat in aparaty if aparat["kind"] in _SWITCHABLE_PRIMARY_KINDS),
            None,
        )
    return aparaty, rodzaj_glownego


def _jednostka_bloku(
    konfiguracja: FactoryConfiguration, indeks: object
) -> tuple[int, FactoryConfigurationUnit]:
    """Jednostka bloku fabrycznego wskazana przez projektanta (1-based).

    Numer, a nie litera: blok powtarza litery jednostek (LLT ma dwie jednostki
    „L"), więc litera nie identyfikuje jednostki jednoznacznie.
    """
    liczba = len(konfiguracja.units)
    if not isinstance(indeks, int) or isinstance(indeks, bool):
        raise NiezgodnoscKonfiguracjiError(
            f"Blok fabryczny {konfiguracja.code} wymaga numeru jednostki "
            f"(1..{liczba}) — bez niego nie wiadomo, ktore pole bloku powstaje."
        )
    if indeks < 1 or indeks > liczba:
        raise NiezgodnoscKonfiguracjiError(
            f"Blok fabryczny {konfiguracja.code} ({konfiguracja.unit_sequence}) ma "
            f"{liczba} jednostek — numer {indeks} jest poza zakresem 1..{liczba}."
        )
    return indeks, konfiguracja.units[indeks - 1]


def _aparatura_jednostki(
    konfiguracja: FactoryConfiguration, numer: int, jednostka: FactoryConfigurationUnit
) -> tuple[tuple[str, str], ...]:
    """Aparaty toru głównego jednostki bloku + ich referencje katalogowe.

    Referencja aparatu jednostki jest WYPROWADZONĄ współrzędną katalogową
    (blok · numer jednostki · aparat): karta producenta opisuje blok i skład
    jego jednostek, ale nie nadaje osobnych kodów pojedynczym aparatom
    jednostki. Wskazanie w to miejsce referencji slotu pola ogólnego byłoby
    fałszem o pochodzeniu — aparat pochodzi z bloku, nie z tamtego slotu.
    """
    return tuple(
        (apparatus_kind, f"{konfiguracja.configuration_ref}__U{numer}__{apparatus_kind}")
        for apparatus_kind in jednostka.apparatus_kinds
    )


def _pole_rodziny_dla_funkcji(switchgear_family_ref: str, bay_kind: str) -> CompleteMvBayTemplate:
    """Katalogowe pole rodziny o zadanej funkcji (albo twardy błąd)."""
    kandydaci = [
        szablon
        for szablon in _rejestr_pol_katalogowych().values()
        if szablon.switchgear_family_ref == switchgear_family_ref and szablon.bay_kind == bay_kind
    ]
    if not kandydaci:
        raise NiezgodnoscKonfiguracjiError(
            f"Katalog rodziny {switchgear_family_ref} nie zawiera pola o funkcji "
            f"{bay_kind!r} — jednostki bloku nie da sie zmaterializowac."
        )
    return sorted(kandydaci, key=lambda szablon: szablon.template_ref)[0]


def rozwiaz_plan_pola(payload: dict[str, Any], *, field_ref: str | None) -> PlanPolaKatalogowego:
    """Wybór katalogowy projektanta → BOM pola (albo twardy błąd po polsku).

    Tor pracy rozstrzyga RODZINA (`tor_konfiguracji`), a nie payload: rodzina
    modułowa składa się z pojedynczych pól katalogowych, rodzina RMU wybiera
    BLOK fabryczny i jego jednostkę. Wskazanie niezgodne z torem rodziny jest
    twardym błędem, bo opisuje wyrób, którego producent nie robi (§3).

    TRZY KANAŁY, JEDEN WYBÓR. `complete_bay_template_ref` i
    `factory_configuration_ref` to dwa RÓŻNE wskazania projektanta — razem są
    sprzecznością. `bay_template_ref` jest slotem pola, który tor blokowy sam
    WYPEŁNIA, więc przy bloku nie jest osobnym wskazaniem: musi się zgadzać
    z polem wyliczonym z jednostki (rozjazd = twardy błąd, nie ciche nadpisanie).
    """
    ref_pola_jawny = _tekst(payload.get("complete_bay_template_ref"))
    ref_slotu = _tekst(payload.get("bay_template_ref"))
    ref_bloku = _tekst(payload.get("factory_configuration_ref"))
    if ref_pola_jawny and ref_bloku:
        raise NiezgodnoscKonfiguracjiError(
            "Wskazano jednoczesnie katalogowe pole i blok fabryczny — pole "
            "powstaje albo z pojedynczej celki rodziny modulowej, albo z "
            "jednostki bloku RMU."
        )
    ref_pola = ref_pola_jawny or (None if ref_bloku else ref_slotu)
    if not ref_pola and not ref_bloku:
        raise NiezgodnoscKonfiguracjiError(
            "Brak wyboru katalogowego: wskaz katalogowe pole rodziny "
            "(complete_bay_template_ref) albo blok fabryczny RMU "
            "(factory_configuration_ref) wraz z numerem jednostki."
        )

    if ref_bloku:
        konfiguracja = _konfiguracja_bloku(ref_bloku)
        # Walidator rodziny: blok należy do rodziny, rodzina prowadzi torem
        # blokowym, a każda jednostka ma funkcję i aparaturę ze słownika rodziny.
        family_supports_factory_configuration(konfiguracja)
        rodzina = wymagaj_rodziny_oferowanej(konfiguracja.switchgear_family_ref)
        numer, jednostka = _jednostka_bloku(konfiguracja, payload.get("factory_unit_index"))
        szablon = _pole_rodziny_dla_funkcji(rodzina.switchgear_family_ref, jednostka.bay_kind)
        if ref_slotu and ref_slotu != szablon.template_ref:
            raise NiezgodnoscKonfiguracjiError(
                f"Jednostka {numer} bloku {konfiguracja.code} materializuje pole "
                f"{szablon.template_ref}, a wskazano pole {ref_slotu} — blok "
                "rozstrzyga, ktore pole rodziny powstaje."
            )
        aparaty, rodzaj_glownego = _aparaty_z_pola_katalogowego(
            szablon,
            field_ref=field_ref,
            podmiana_toru_glownego=_aparatura_jednostki(konfiguracja, numer, jednostka),
        )
        return PlanPolaKatalogowego(
            bay_template_ref=szablon.template_ref,
            switchgear_family_ref=rodzina.switchgear_family_ref,
            manufacturer_ref=szablon.manufacturer_ref,
            bay_kind=szablon.bay_kind,
            bay_role=szablon.bay_role,
            rodzaj_aparatu_glownego=rodzaj_glownego,
            aparaty=tuple(aparaty),
            zrodlo_opis_pl=(
                f"{rodzina.family_name}: blok fabryczny {konfiguracja.code} "
                f"({konfiguracja.unit_sequence}), jednostka {numer} "
                f"— {jednostka.unit_name_pl}"
            ),
            factory_configuration_ref=konfiguracja.configuration_ref,
            factory_unit_index=numer,
        )

    assert ref_pola is not None  # rozstrzygnięte wyżej: dokładnie jeden kanał
    szablon = pole_katalogowe(ref_pola)
    if szablon is None:
        raise NiezgodnoscKonfiguracjiError(
            f"Katalog rodzin rozdzielnic nie zna pola {ref_pola!r} — pola stacji "
            "nie da sie zmaterializowac z pozycji spoza katalogu."
        )
    if szablon.switchgear_family_ref is None:
        raise NiezgodnoscKonfiguracjiError(
            f"Katalogowe pole {szablon.template_ref} nie deklaruje rodziny "
            "rozdzielnicy — bez rodziny nie ma czego walidowac."
        )
    rodzina = wymagaj_rodziny_oferowanej(szablon.switchgear_family_ref)
    zadeklarowana_rodzina = _tekst(payload.get("switchgear_family_ref"))
    if zadeklarowana_rodzina and zadeklarowana_rodzina != rodzina.switchgear_family_ref:
        raise NiezgodnoscKonfiguracjiError(
            f"Pole {szablon.template_ref} nalezy do rodziny "
            f"{rodzina.switchgear_family_ref}, a wskazano rodzine "
            f"{zadeklarowana_rodzina} — katalog nie przewiduje takiej kombinacji."
        )
    # Walidator rodziny (§4): pole należy do TEJ rodziny i jest polem, które
    # rodzina przewiduje.
    family_supports_bay_template(rodzina.switchgear_family_ref, szablon)
    if rodzina.tor_konfiguracji == "BLOK_RMU":
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {rodzina.family_name} jest rozdzielnica pierscieniowa "
            "skladana z BLOKOW fabrycznych — pole powstaje przez wskazanie bloku "
            "i jednostki, a nie pojedynczej celki. Uzyj operacji "
            "add_sn_bay_from_catalog z factory_configuration_ref i "
            "factory_unit_index."
        )
    aparaty, rodzaj_glownego = _aparaty_z_pola_katalogowego(szablon, field_ref=field_ref)
    return PlanPolaKatalogowego(
        bay_template_ref=szablon.template_ref,
        switchgear_family_ref=rodzina.switchgear_family_ref,
        manufacturer_ref=szablon.manufacturer_ref,
        bay_kind=szablon.bay_kind,
        bay_role=szablon.bay_role,
        rodzaj_aparatu_glownego=rodzaj_glownego,
        aparaty=tuple(aparaty),
        zrodlo_opis_pl=(
            f"{rodzina.family_name}: katalogowe pole {szablon.template_ref} "
            f"({szablon.bay_kind})"
        ),
    )


def _konfiguracja_bloku(configuration_ref: str) -> FactoryConfiguration:
    try:
        return get_factory_configuration(configuration_ref)
    except KeyError as exc:
        raise NiezgodnoscKonfiguracjiError(
            f"Katalog nie zna bloku fabrycznego {configuration_ref!r} — pola "
            "jednostki nie da sie zmaterializowac."
        ) from exc


def rozwiaz_aparaty_pola(
    payload: dict[str, Any],
    *,
    field_ref: str,
    bay_template_ref: str | None,
    main_apparatus_kind: str | None,
) -> list[dict[str, Any]]:
    """Aparaty pierwotne pola — JEDNO wejście dla obu nomenklatur referencji.

    Wybór katalogowy (pole rodziny / jednostka bloku RMU) materializuje się
    z BOM-u katalogowego pola i przechodzi PEŁNĄ walidację rodziny; kanoniczny
    szablon idzie dotychczasową ścieżką `template_primary_devices` (wynik
    bajtowo bez zmian). Referencja, której katalog nie zna, daje pustą listę —
    tak jak dotąd (ścieżka konwencji rysunku pola).
    """
    if czy_wybor_katalogowy(payload):
        return list(rozwiaz_plan_pola(payload, field_ref=field_ref).aparaty)
    return template_primary_devices(
        bay_template_ref,
        field_ref=field_ref,
        main_apparatus_kind=main_apparatus_kind,
    )


def aparaty_pola_z_referencji(
    *,
    field_ref: str,
    bay_template_ref: str | None,
    switchgear_family_ref: str | None = None,
) -> list[dict[str, Any]]:
    """Aparaty pierwotne pola z SAMYCH REFERENCJI pola (bez payloadu operacji).

    Drugie wejście tego samego resolvera — dla ścieżek, które nie mają payloadu
    kreatora, tylko rozstrzygnięte już referencje wpisywane do `field_spec`
    (`_build_field_spec`: pola GPZ, pola stacji wstawianej na odcinku, pola
    sekcji, pola nN). Do tej pory te ścieżki wołały WYŁĄCZNIE
    `template_primary_devices`, który zna jedną nomenklaturę: referencja
    katalogowego pola rodziny dawała po cichu PUSTĄ listę aparatów, więc pole
    GPZ/stacyjne wybrane z katalogu producenta lądowało w ENM bez ani jednego
    aparatu (dług wykryty przy odbiorze S5 — tam domknięty tylko dla
    `add_sn_bay`).

    NOMENKLATURĘ ROZSTRZYGA KATALOG, NIE WOŁAJĄCY. Referencja, którą zna rejestr
    rodzin, idzie przez pełny resolver (walidacja rodziny, zgodność
    rodzina↔pole, tor konfiguracji, BOM z referencjami katalogowymi); każda inna
    — dotychczasową ścieżką kanoniczną, bajtowo bez zmian. Dzięki temu ta sama
    referencja nie znaczy „pełne pole" w jednym miejscu i „brak danych" w drugim.

    RODZINA BLOKOWA (BLOK_RMU) KOŃCZY SIĘ TWARDYM BŁĘDEM. Rozstrzyga o tym
    `rozwiaz_plan_pola` na `tor_konfiguracji` rodziny — DOKŁADNIE tym samym
    predykatem, którym kanał blokowy (`add_sn_bay_from_catalog` z
    `factory_configuration_ref`) pole PRZYJMUJE. Jedno źródło prawdy dla obu
    kierunków: rodzina, której nie da się złożyć z pojedynczych celek, nie
    zostanie przyjęta tutaj ani odrzucona tam wskutek drugiego, niezależnego
    warunku.
    """
    if not bay_template_ref:
        return []
    if pole_katalogowe(bay_template_ref) is None:
        return template_primary_devices(bay_template_ref, field_ref=field_ref)
    payload: dict[str, Any] = {"bay_template_ref": bay_template_ref}
    if switchgear_family_ref:
        payload["switchgear_family_ref"] = switchgear_family_ref
    return list(rozwiaz_plan_pola(payload, field_ref=field_ref).aparaty)
