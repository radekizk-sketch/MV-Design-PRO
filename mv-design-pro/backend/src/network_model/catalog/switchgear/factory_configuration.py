"""Konfiguracje fabryczne bloków RMU (model + dane + rejestr).

DLACZEGO TO ISTNIEJE (`docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §3):
rozdzielnica pierścieniowa NIE jest zbiorem luźnych szaf. Dla rodzin o torze
konfiguracji `BLOK_RMU` projektant najpierw wybiera BLOK fabryczny (sekwencję
jednostek, np. L-L-T), a dopiero potem doposaża jednostki. Kreator, który
pozwala „dostawić czwarte pole" do bloku trzyfunkcyjnego, opisuje wyrób,
którego producent nie robi.

JEDNA PRAWDA O JEDNOSTCE. Jednostka bloku nie zakłada własnego słownika: jej
funkcja to `BayKind` pakietu, a jej aparatura to `ApparatusKind` pakietu — te
same wartości, którymi rodzina deklaruje `allowed_bay_kinds` i
`allowed_apparatus_kinds`. Dzięki temu walidator porównuje jabłka z jabłkami
(`family_validation.family_supports_factory_configuration`), zamiast tłumaczyć
między dwiema nomenklaturami.

SZEROKOŚĆ. `total_width_mm` jest WYLICZANA z szerokości jednostek — jedno
źródło (szerokość jednostki), suma jako projekcja. Gdy karta producenta nie
podaje szerokości jednostki, pole zostaje `None` (jawny brak, nigdy zmyślony
milimetr) i suma również jest `None`.

SZEROKOŚĆ JEDNOSTKI ≠ SZEROKOŚĆ ZESTAWU (transkrypcja 2026-08-14). Karty
producentów podają szerokości na DWA różne sposoby i tylko jeden z nich
wypełnia `width_mm`:

* Siemens HA 40.2 podaje osobną tabelę „Panel type / Width" (R 310 mm,
  T 430 mm ...) — to szerokość JEDNOSTKI, więc wchodzi do `width_mm`, a suma
  jest realną liczbą (zgodność z tabelą bloków producenta jest przypięta
  testem);
* ZPUE, Schneider i ABB podają wyłącznie szerokość CAŁEGO zestawu wg liczby
  pól (np. RM6 NE-III = 1186 mm, TPM LLT = 1050 mm). Szerokość pojedynczej
  jednostki NIE wynika z tych liczb — zestawy zawierają stały naddatek
  obudowy (TPM: TT = LL = 681 mm, ale TL = 732 mm), więc dzielenie sumy
  byłoby zmyśleniem. Takie jednostki mają `width_mm=None`, a szerokość
  zestawu z karty siedzi w `notes_pl` bloku — jako cytat z karty, nie jako
  drugie pole modelu do rozjechania się z pierwszym.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, computed_field

from .complete_mv_bay_template import BayKind
from .device_instance import ApparatusKind


class FactoryConfigurationUnit(BaseModel):
    """Jednostka funkcjonalna w sekwencji bloku fabrycznego.

    Pola:
        unit_code: litera katalogowa jednostki wg producenta (np. „L", „T",
            „W" dla ZPUE TPM Air; „C", „F", „V" dla ABB SafeRing).
        unit_name_pl: nazwa jednostki po polsku.
        bay_kind: funkcja pola w kanonie pakietu (`BayKind`).
        apparatus_kinds: aparaty toru głównego, które ODRÓŻNIAJĄ tę jednostkę
            (np. rozłącznik z bezpiecznikami = switch_disconnector + fuse_set,
            jednostka wyłącznikowa = circuit_breaker). Walidator sprawdza je
            wobec `SwitchgearFamily.allowed_apparatus_kinds`.
        width_mm: szerokość jednostki [mm]; `None` = karta jej nie podaje.
    """

    unit_code: str
    unit_name_pl: str
    bay_kind: BayKind
    apparatus_kinds: list[ApparatusKind] = Field(min_length=1)
    width_mm: int | None = None


class FactoryConfiguration(BaseModel):
    """Blok fabryczny rodziny RMU — sekwencja jednostek o stałym składzie.

    `units` ma co najmniej DWIE jednostki: blok jednofunkcyjny to jednostka,
    a nie konfiguracja bloku (zapadka `min_length=2`).
    """

    configuration_ref: str
    switchgear_family_ref: str
    code: str
    name_pl: str
    units: list[FactoryConfigurationUnit] = Field(min_length=2)
    source_refs: list[str] = Field(default_factory=list)
    notes_pl: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_width_mm(self) -> int | None:
        """Szerokość całkowita bloku = suma szerokości jednostek.

        `None`, gdy choć jedna jednostka nie ma szerokości w karcie — suma
        części, z których jednej nie znamy, nie jest liczbą, tylko brakiem.
        """
        szerokosci = [unit.width_mm for unit in self.units]
        if any(width is None for width in szerokosci):
            return None
        return sum(width for width in szerokosci if width is not None)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def unit_sequence(self) -> str:
        """Sekwencja jednostek zapisana literami katalogowymi (np. „L-L-T")."""
        return "-".join(unit.unit_code for unit in self.units)


def _ref_z_kodu(switchgear_family_ref: str, code: str) -> str:
    """`configuration_ref` wyprowadzony z kodu producenta.

    Kod katalogowy bywa zapisany znakami spoza alfanumeryki (Siemens „K(E)T"),
    a `configuration_ref` jest identyfikatorem technicznym: trafia do payloadu
    API i do porównań, więc nie może nieść nawiasów. Odsiew zostawia kod
    producenta NIETKNIĘTY w polu `code` — identyfikator jest projekcją kodu,
    nie jego drugą wersją. Dla kodów już alfanumerycznych (LLT, CCF, IQI)
    wynik jest identyczny jak dawne sklejanie ręczne, więc istniejące refy się
    nie zmieniają (determinizm rejestru przypięty testem).
    """
    return f"{switchgear_family_ref}__{''.join(ch for ch in code if ch.isalnum())}"


# =============================================================================
# ZPUE TPM Air — jednostki i bloki wg publicznej karty produktu
# (https://zpue.pl/rozdzielnice-sn/tpm-air, odczyt 2026-08-14)
# =============================================================================

_TPM_AIR_ZRODLA = ["https://zpue.pl/rozdzielnice-sn/tpm-air"]

_TPM_AIR_L = FactoryConfigurationUnit(
    unit_code="L",
    unit_name_pl="Jednostka liniowa (rozłącznik 630 A)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["switch_disconnector"],
)
_TPM_AIR_T = FactoryConfigurationUnit(
    unit_code="T",
    unit_name_pl="Jednostka transformatorowa (rozłącznik z bezpiecznikami 250 A)",
    bay_kind="transformatorowe",
    apparatus_kinds=["switch_disconnector", "fuse_set"],
)
_TPM_AIR_W = FactoryConfigurationUnit(
    unit_code="W",
    unit_name_pl="Jednostka wyłącznikowa (wyłącznik 630 A)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["circuit_breaker"],
)

#: Bloki wielopolowe wymienione na karcie TPM Air. Jednostki pojedyncze
#: (L, T, W, S, M840) NIE są konfiguracjami bloku — to składniki.
_TPM_AIR_BLOKI: tuple[tuple[str, tuple[FactoryConfigurationUnit, ...]], ...] = (
    ("LL", (_TPM_AIR_L, _TPM_AIR_L)),
    ("LT", (_TPM_AIR_L, _TPM_AIR_T)),
    ("LW", (_TPM_AIR_L, _TPM_AIR_W)),
    ("LLL", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_L)),
    ("LLT", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_T)),
    ("LLW", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_W)),
    ("LTT", (_TPM_AIR_L, _TPM_AIR_T, _TPM_AIR_T)),
    ("LWW", (_TPM_AIR_L, _TPM_AIR_W, _TPM_AIR_W)),
    ("LLLL", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_L)),
    ("LLLT", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_T)),
    ("LLLW", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_W)),
    ("LLTT", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_T, _TPM_AIR_T)),
    ("LLWW", (_TPM_AIR_L, _TPM_AIR_L, _TPM_AIR_W, _TPM_AIR_W)),
)

_NAZWA_JEDNOSTKI_TPM_AIR = {"L": "kabel", "T": "transformator", "W": "wyłącznik"}


def _tpm_air_configuration(
    code: str, units: tuple[FactoryConfigurationUnit, ...]
) -> FactoryConfiguration:
    opis = "-".join(_NAZWA_JEDNOSTKI_TPM_AIR[unit.unit_code] for unit in units)
    return FactoryConfiguration(
        configuration_ref=_ref_z_kodu("ZPUE_WLOSZCZOWA__TPM_AIR", code),
        switchgear_family_ref="ZPUE_WLOSZCZOWA__TPM_AIR",
        code=code,
        name_pl=f"Blok {opis}",
        units=list(units),
        source_refs=list(_TPM_AIR_ZRODLA),
        notes_pl=(
            "Konfiguracja fabryczna wg publicznej karty produktu ZPUE TPM Air "
            "(odczyt 2026-08-14). Litery jednostek zgodne z nomenklaturą "
            "producenta: L — rozłącznik liniowy 630 A, T — rozłącznik z "
            "bezpiecznikami 250 A (prąd przejęcia 1250 A), W — wyłącznik "
            "630 A. Szerokości jednostek nie są podane na stronie produktowej, "
            "dlatego szerokość całkowita pozostaje niezadeklarowana."
        ),
    )


# =============================================================================
# ZPUE TPM — jednostki i bloki wg katalogu producenta (rozdział „TPM —
# KONFIGURACJE TYPOWE", strony 236-243)
# =============================================================================

_TPM_ZRODLA = [
    "https://zpue.pl/component/phocadownload/category/17-rozdzielnice-sn?download=42%3Atpm"
]

#: Legenda „Typ pola/konfiguracja" z katalogu ZPUE, przepisana dosłownie:
#: L — Pole rozłącznikowe - Liniowe/Odpływowe; W — Pole wyłącznikowe -
#: Liniowe/Transformatorowe/Odpływowe; T — Pole rozłącznikowe -
#: Transformatorowe (rozdział „WYPOSAŻENIE POLA T - ROZŁĄCZNIKOWE Z
#: BEZPIECZNIKAMI - TRANSFORMATOROWYMI"); S — Pole rozłącznikowe - Sprzęgłowe;
#: M — Pole pomiarowe. S i M NIE występują w żadnej konfiguracji wielopolowej
#: karty (katalog pokazuje je wyłącznie jako pola pojedyncze), więc nie mają tu
#: jednostki — jednostka bez bloku byłaby martwym wpisem.
_TPM_L = FactoryConfigurationUnit(
    unit_code="L",
    unit_name_pl="Pole rozłącznikowe liniowe/odpływowe",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["switch_disconnector"],
)
_TPM_T = FactoryConfigurationUnit(
    unit_code="T",
    unit_name_pl="Pole rozłącznikowe transformatorowe (rozłącznik z bezpiecznikami)",
    bay_kind="transformatorowe",
    apparatus_kinds=["switch_disconnector", "fuse_set"],
)
_TPM_W = FactoryConfigurationUnit(
    unit_code="W",
    unit_name_pl="Pole wyłącznikowe (liniowe/transformatorowe/odpływowe)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["circuit_breaker"],
)

#: Konfiguracje typowe TPM: (kod, jednostki, nazwa katalogowa, szerokość
#: zestawu z rysunku wymiarowego karty [mm]).
#:
#: JEDEN WPIS NA PARĘ LUSTRZANĄ. Karta nazywa część konfiguracji parą
#: („TL / LT"), bo pole specjalne może stać po lewej albo prawej stronie — to
#: ten sam wyrób w dwóch orientacjach, nie dwa wyroby. Rejestr trzyma jedną
#: orientację (pole specjalne na końcu, jak w bliźniaczej rodzinie TPM Air), a
#: pełne brzmienie pary siedzi w `notes_pl`. Rejestrowanie obu orientacji
#: podwajałoby katalog wpisami, których karta nie liczy osobno.
_TPM_BLOKI: tuple[tuple[str, tuple[FactoryConfigurationUnit, ...], str, int | None], ...] = (
    ("LT", (_TPM_L, _TPM_T), "TL / LT (pole transformatorowe i pole liniowe)", 732),
    ("LLT", (_TPM_L, _TPM_L, _TPM_T), "TLL / LLT (pole transformatorowe i 2 pola liniowe)", 1050),
    (
        "LLLT",
        (_TPM_L, _TPM_L, _TPM_L, _TPM_T),
        "TLLL / LLLT (pole transformatorowe i 3 pola liniowe)",
        1368,
    ),
    (
        "TLLT",
        (_TPM_T, _TPM_L, _TPM_L, _TPM_T),
        "TLLT (2 pola transformatorowe i 2 pola liniowe)",
        1426,
    ),
    ("TT", (_TPM_T, _TPM_T), "TT (2 pola transformatorowe)", 681),
    ("LL", (_TPM_L, _TPM_L), "LL (2 pola liniowe)", 681),
    ("LLL", (_TPM_L, _TPM_L, _TPM_L), "LLL (3 pola liniowe)", 997),
    ("LLLL", (_TPM_L, _TPM_L, _TPM_L, _TPM_L), "LLLL (4 pola liniowe)", 1315),
    ("LW", (_TPM_L, _TPM_W), "WL / LW (pole wyłącznikowe i pole liniowe)", 764),
    ("LLW", (_TPM_L, _TPM_L, _TPM_W), "WLL / LLW (pole wyłącznikowe i 2 pola liniowe)", 1082),
    (
        "LLLW",
        (_TPM_L, _TPM_L, _TPM_L, _TPM_W),
        "WLLL / LLLW (pole wyłącznikowe i 3 pola liniowe)",
        1400,
    ),
    (
        "WLLW",
        (_TPM_W, _TPM_L, _TPM_L, _TPM_W),
        "WLLW (2 pola wyłącznikowe i 2 pola liniowe)",
        1520,
    ),
    ("WW", (_TPM_W, _TPM_W), "WW (2 pola wyłącznikowe)", 867),
    ("WWW", (_TPM_W, _TPM_W, _TPM_W), "WWW (3 pola wyłącznikowe)", 1302),
    ("WWWW", (_TPM_W, _TPM_W, _TPM_W, _TPM_W), "WWWW (4 pola wyłącznikowe)", 1637),
    ("LWWW", (_TPM_L, _TPM_W, _TPM_W, _TPM_W), "LWWW (pole liniowe i 3 pola wyłącznikowe)", 1602),
    (
        "LTL",
        (_TPM_L, _TPM_T, _TPM_L),
        "LTL (pole transformatorowe i 2 pola liniowe), układ Kompakt",
        None,
    ),
    (
        "LLTL",
        (_TPM_L, _TPM_L, _TPM_T, _TPM_L),
        "LLTL (pole transformatorowe i 3 pola liniowe), układ Kompakt",
        None,
    ),
)

_NAZWA_JEDNOSTKI_TPM = {"L": "liniowe", "T": "transformatorowe", "W": "wyłącznikowe"}


def _tpm_configuration(
    code: str,
    units: tuple[FactoryConfigurationUnit, ...],
    nazwa_katalogowa: str,
    szerokosc_zestawu_mm: int | None,
) -> FactoryConfiguration:
    opis = "-".join(_NAZWA_JEDNOSTKI_TPM[unit.unit_code] for unit in units)
    if szerokosc_zestawu_mm is None:
        # Rysunki układu Kompakt podają wymiary innego rozstawienia pól niż
        # rzut szerokości zestawu — przypisanie któregokolwiek z nich jako
        # „szerokości" byłoby zgadywaniem, więc karta zostaje bez liczby.
        zdanie_o_szerokosci = (
            "Karta pokazuje ten blok w układzie Kompakt, którego rysunek nie "
            "daje jednoznacznej szerokości zestawu — dlatego szerokość nie "
            "jest deklarowana."
        )
    else:
        zdanie_o_szerokosci = f"Szerokość zestawu wg rysunku karty: {szerokosc_zestawu_mm} mm."
    return FactoryConfiguration(
        configuration_ref=_ref_z_kodu("ZPUE_WLOSZCZOWA__TPM", code),
        switchgear_family_ref="ZPUE_WLOSZCZOWA__TPM",
        code=code,
        name_pl=f"Blok {opis}",
        units=list(units),
        source_refs=list(_TPM_ZRODLA),
        notes_pl=(
            "Konfiguracja typowa wg katalogu ZPUE, rozdział „TPM — "
            "KONFIGURACJE TYPOWE”. "
            f"Nazwa katalogowa: {nazwa_katalogowa}. "
            "Litery pól wg legendy karty: L — pole rozłącznikowe "
            "liniowe/odpływowe, T — pole rozłącznikowe transformatorowe z "
            "bezpiecznikami, W — pole wyłącznikowe. "
            f"{zdanie_o_szerokosci} Szerokości pojedynczych pól karta podaje "
            "wyłącznie jako szerokość całego zestawu, więc jednostki nie mają "
            "zadeklarowanej szerokości (suma pozostaje jawnym brakiem)."
        ),
    )


# =============================================================================
# ABB SafeRing — bloki CCF / CCV (nomenklatura modułów ABB: C, F, V)
# =============================================================================

_SAFERING_ZRODLA = [
    "https://library.e.abb.com/public/9fd3ed5c1b184898b9c06c470a1c769f/SafeRing_SafePlus%2012_24kV_Catalogue_EN_1YVA000022_REV%20C-VI%2003-2023_web_link_26.03.16.pdf",
    "https://electrification.us.abb.com/products/switchgear/safering-gas-insulated-ring-main-unit",
    "https://www.abb.com/global/en/areas/electrification/medium-voltage/switchgear/gas-insulated/safering-safeplus",
]

_SAFERING_C = FactoryConfigurationUnit(
    unit_code="C",
    unit_name_pl="Jednostka kablowa (rozłącznik)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["switch_disconnector"],
)
_SAFERING_F = FactoryConfigurationUnit(
    unit_code="F",
    unit_name_pl="Jednostka transformatorowa (rozłącznik z bezpiecznikami)",
    bay_kind="transformatorowe",
    apparatus_kinds=["switch_disconnector", "fuse_set"],
)
_SAFERING_V = FactoryConfigurationUnit(
    unit_code="V",
    unit_name_pl="Jednostka wyłącznikowa (wyłącznik próżniowy)",
    bay_kind="transformatorowe",
    apparatus_kinds=["circuit_breaker"],
)

_SAFERING_D = FactoryConfigurationUnit(
    unit_code="D",
    unit_name_pl="Jednostka przyłącza kablowego (bezpośrednie połączenie kablowe)",
    bay_kind="liniowe_doplywowe",
    apparatus_kinds=["cable_head"],
)
_SAFERING_DE = FactoryConfigurationUnit(
    unit_code="De",
    unit_name_pl="Jednostka przyłącza kablowego z uziemnikiem",
    bay_kind="liniowe_doplywowe",
    apparatus_kinds=["cable_head", "earthing_switch"],
)

#: Szerokość CAŁEGO zestawu wg liczby jednostek — tabela „Overall dimensions of
#: the fully assembled RMU" katalogu ABB 1YVA000022 (wysokość 1336 mm, głębokość
#: 765 mm). Karta NIE podaje szerokości pojedynczego modułu, więc jednostki mają
#: `width_mm=None`; te liczby są cytatem do `notes_pl`, nie drugim polem modelu.
_SAFERING_SZEROKOSC_ZESTAWU_MM = {1: 371, 2: 696, 3: 1021, 4: 1346, 5: 1671}

#: Konfiguracje SafeRing nazwane WPROST w katalogu ABB 1YVA000022: rozdział
#: „SafeRing configurations" (rysunki konfiguracji z wymiarami) oraz tabela
#: „Maximum weights for standard SafeRing". Karta deklaruje „SafeRing can be
#: supplied in 15 different configurations" i tyle właśnie liczy tabela mas;
#: rysunki konfiguracji dokładają cztery dalsze (DeF, DeV, CCV, CCCV) z
#: modułami De oraz V. Rejestr bierze SUMĘ obu miejsc — każda pozycja jest
#: wymieniona w karcie dosłownie, żadna nie jest złożona z domysłu.
_SAFERING_BLOKI: tuple[tuple[str, tuple[FactoryConfigurationUnit, ...]], ...] = (
    ("CCC", (_SAFERING_C, _SAFERING_C, _SAFERING_C)),
    ("CCCC", (_SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_C)),
    ("CCCCC", (_SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_C)),
    ("CCCCF", (_SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_F)),
    ("CCCF", (_SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_F)),
    ("CCCFF", (_SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_F, _SAFERING_F)),
    ("CCCV", (_SAFERING_C, _SAFERING_C, _SAFERING_C, _SAFERING_V)),
    ("CCF", (_SAFERING_C, _SAFERING_C, _SAFERING_F)),
    ("CCFF", (_SAFERING_C, _SAFERING_C, _SAFERING_F, _SAFERING_F)),
    ("CCFFF", (_SAFERING_C, _SAFERING_C, _SAFERING_F, _SAFERING_F, _SAFERING_F)),
    ("CCV", (_SAFERING_C, _SAFERING_C, _SAFERING_V)),
    ("CCVV", (_SAFERING_C, _SAFERING_C, _SAFERING_V, _SAFERING_V)),
    ("CF", (_SAFERING_C, _SAFERING_F)),
    ("CFC", (_SAFERING_C, _SAFERING_F, _SAFERING_C)),
    ("CFFC", (_SAFERING_C, _SAFERING_F, _SAFERING_F, _SAFERING_C)),
    ("DF", (_SAFERING_D, _SAFERING_F)),
    ("DeF", (_SAFERING_DE, _SAFERING_F)),
    ("DeV", (_SAFERING_DE, _SAFERING_V)),
    ("FCC", (_SAFERING_F, _SAFERING_C, _SAFERING_C)),
)

_NAZWA_JEDNOSTKI_SAFERING = {
    "C": "kabel",
    "D": "przyłącze",
    "De": "przyłącze z uziemnikiem",
    "F": "transformator",
    "V": "wyłącznik",
}


def _safering_configuration(
    code: str, units: tuple[FactoryConfigurationUnit, ...]
) -> FactoryConfiguration:
    opis = "-".join(_NAZWA_JEDNOSTKI_SAFERING[unit.unit_code] for unit in units)
    szerokosc = _SAFERING_SZEROKOSC_ZESTAWU_MM[len(units)]
    return FactoryConfiguration(
        configuration_ref=_ref_z_kodu("ABB__SAFERING", code),
        switchgear_family_ref="ABB__SAFERING",
        code=code,
        name_pl=f"Blok {opis}",
        units=list(units),
        source_refs=list(_SAFERING_ZRODLA),
        notes_pl=(
            "Konfiguracja fabryczna SafeRing wg katalogu ABB 1YVA000022 "
            "(„Gas-insulated ring main unit and gas-insulated compact "
            "switchgear product catalogue”, 12/24 kV). Moduły wg rozdziału "
            "„Available modules”: C — jednostka kablowa z rozłącznikiem "
            "(cable switch), D — przyłącze kablowe (direct cable connection), "
            "De — przyłącze kablowe z uziemnikiem, F — rozłącznik z "
            "bezpiecznikami (switch-fuse disconnector) do transformatora, "
            "V — wyłącznik próżniowy. Szerokość zestawu "
            f"{len(units)}-polowego wg tabeli wymiarów karty: {szerokosc} mm "
            "(wysokość 1336 mm, głębokość 765 mm). Karta nie podaje szerokości "
            "pojedynczego modułu, dlatego jednostki nie mają zadeklarowanej "
            "szerokości, a suma pozostaje jawnym brakiem."
        ),
    )


# =============================================================================
# Schneider Electric RM6 — jednostki i płyty wg katalogu producenta
# (dokument Schneider AMTED398032EN, tabela „Complete board configuration
# table" oraz rozdział „Choice of functional units")
# =============================================================================

_RM6_ZRODLA = ["https://www.se.com/uk/en/download/document/AMTED398032EN/"]

#: Tabela „RM6 functions" katalogu, przepisana dosłownie (funkcja → jednostka →
#: aparat): Network switch → I → 630 A switch; Line feeder → B → 630 A circuit
#: breaker; Transformer feeder → D → 200 A circuit breaker; Transformer feeder
#: → Q → combined fuse-switch. Jednostki IC/BC (network coupling), O (cable
#: connection) i Mt (MV metering) karta pokazuje WYŁĄCZNIE jako płyty
#: jednofunkcyjne — nie wchodzą do żadnej sekwencji wielofunkcyjnej, więc nie
#: mają tu wpisu.
_RM6_I = FactoryConfigurationUnit(
    unit_code="I",
    unit_name_pl="Jednostka sieciowa (rozłącznik 630 A)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["switch_disconnector"],
)
_RM6_B = FactoryConfigurationUnit(
    unit_code="B",
    unit_name_pl="Jednostka liniowa (wyłącznik 630 A)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["circuit_breaker"],
)
_RM6_D = FactoryConfigurationUnit(
    unit_code="D",
    unit_name_pl="Jednostka transformatorowa (wyłącznik 200 A)",
    bay_kind="transformatorowe",
    apparatus_kinds=["circuit_breaker"],
)
_RM6_Q = FactoryConfigurationUnit(
    unit_code="Q",
    unit_name_pl="Jednostka transformatorowa (rozłącznik z bezpiecznikami)",
    bay_kind="transformatorowe",
    apparatus_kinds=["switch_disconnector", "fuse_set"],
)

#: Sekwencje funkcji z „Complete board configuration table" wraz z szerokościami
#: płyty w wariantach rozszerzalności (NE — nierozszerzalna, RE — rozszerzalna w
#: prawo, DE — rozszerzalna obustronnie; LE jest lustrem RE).
#:
#: PREFIKS ROZSZERZALNOŚCI NIE JEST BLOKIEM. Karta nazywa płyty „NE-IQI",
#: „RE-IQI", „DE-IQI" — różni je wyłącznie obudowa (o 30 mm), a sekwencja
#: jednostek jest identyczna. Model opisuje SEKWENCJĘ, więc trzy takie wiersze
#: byłyby trzema nierozróżnialnymi wpisami; rejestr trzyma jeden blok o kodzie
#: sekwencji (Schneider używa go samodzielnie, np. „IDI"/„IQI" w tabeli
#: recyklingu), a warianty i ich szerokości siedzą w `notes_pl`.
_RM6_BLOKI: tuple[tuple[str, tuple[FactoryConfigurationUnit, ...], dict[str, int]], ...] = (
    ("BI", (_RM6_B, _RM6_I), {"NE": 829}),
    ("BIBI", (_RM6_B, _RM6_I, _RM6_B, _RM6_I), {"NE": 1619, "RE": 1649}),
    ("DI", (_RM6_D, _RM6_I), {"NE": 829}),
    ("DIDI", (_RM6_D, _RM6_I, _RM6_D, _RM6_I), {"NE": 1619, "RE": 1649}),
    ("IBI", (_RM6_I, _RM6_B, _RM6_I), {"NE": 1186, "RE": 1216, "DE": 1246}),
    ("IDI", (_RM6_I, _RM6_D, _RM6_I), {"NE": 1186, "RE": 1216, "DE": 1246}),
    ("II", (_RM6_I, _RM6_I), {"NE": 829, "RE": 859}),
    ("IIBI", (_RM6_I, _RM6_I, _RM6_B, _RM6_I), {"NE": 1619, "RE": 1649, "DE": 1679}),
    ("IIDI", (_RM6_I, _RM6_I, _RM6_D, _RM6_I), {"NE": 1619, "RE": 1649, "DE": 1679}),
    ("III", (_RM6_I, _RM6_I, _RM6_I), {"NE": 1186, "RE": 1216, "DE": 1246}),
    ("IIII", (_RM6_I, _RM6_I, _RM6_I, _RM6_I), {"NE": 1619, "RE": 1649, "DE": 1679}),
    ("IIQI", (_RM6_I, _RM6_I, _RM6_Q, _RM6_I), {"NE": 1619, "RE": 1649, "DE": 1679}),
    ("IQI", (_RM6_I, _RM6_Q, _RM6_I), {"NE": 1186, "RE": 1216, "DE": 1246}),
    ("QI", (_RM6_Q, _RM6_I), {"NE": 829}),
    ("QIQI", (_RM6_Q, _RM6_I, _RM6_Q, _RM6_I), {"NE": 1619, "RE": 1649}),
)

_NAZWA_JEDNOSTKI_RM6 = {
    "I": "sieciowa",
    "B": "liniowa",
    "D": "transformatorowa",
    "Q": "transformatorowa",
}


def _rm6_configuration(
    code: str,
    units: tuple[FactoryConfigurationUnit, ...],
    szerokosci_mm: dict[str, int],
) -> FactoryConfiguration:
    opis = "-".join(_NAZWA_JEDNOSTKI_RM6[unit.unit_code] for unit in units)
    warianty = ", ".join(f"{wariant}-{code}: {mm} mm" for wariant, mm in szerokosci_mm.items())
    return FactoryConfiguration(
        configuration_ref=_ref_z_kodu("SCHNEIDER__RM6", code),
        switchgear_family_ref="SCHNEIDER__RM6",
        code=code,
        name_pl=f"Blok {opis}",
        units=list(units),
        source_refs=list(_RM6_ZRODLA),
        notes_pl=(
            "Konfiguracja fabryczna RM6 wg katalogu Schneider Electric, "
            "dokument AMTED398032EN, tabela „Complete board configuration "
            "table”. Jednostki wg rozdziału „Choice of functional units”: "
            "I — łącznik sieciowy (rozłącznik 630 A), B — pole liniowe "
            "(wyłącznik 630 A), D — pole transformatorowe (wyłącznik 200 A), "
            "Q — pole transformatorowe (rozłącznik z bezpiecznikami). "
            f"Szerokości płyty wg wariantu rozszerzalności: {warianty} "
            "(NE — nierozszerzalna, RE — rozszerzalna w prawo, DE — "
            "rozszerzalna obustronnie; LE jest lustrem RE). Karta nie podaje "
            "szerokości pojedynczej jednostki, dlatego jednostki nie mają "
            "zadeklarowanej szerokości, a suma pozostaje jawnym brakiem."
        ),
    )


# =============================================================================
# Siemens 8DJH — pola i bloki wg katalogu HA 40.2 (2017)
# =============================================================================

_8DJH_ZRODLA = [
    "https://assets.new.siemens.com/siemens/assets/api/uuid:a154c8cc-b58e-42b9-963d-28d73019016f/8djhcompact-en-cataloge.pdf"
]

#: Litery pól wg legendy katalogu HA 40.2 (przepisane dosłownie): K = Cable
#: feeder, K(E) = Cable feeder with make-proof earthing switch, R = Ring-main
#: feeder, T = Transformer feeder, L = Circuit-breaker feeder, S = Bus
#: sectionalizer panel with switch-disconnector, H = Bus sectionalizer panel
#: with switch-fuse combination.
#:
#: SZEROKOŚĆ JEDNOSTKI POCHODZI Z KARTY. Katalog ma osobną tabelę „Panel type /
#: Width” (K 310 mm, K(E) 430 mm, R 310 mm, T 430 mm, L 430 mm, S 430 mm,
#: H 430 mm) — to szerokość POJEDYNCZEGO pola, nie zestawu, więc wchodzi do
#: `width_mm`. Zgodność sumy z osobno podaną szerokością bloku (tabela mas
#: transportowych) jest przypięta testem — dwa niezależne zdania karty muszą
#: się zgadzać, inaczej transkrypcja jest błędna.
_8DJH_K = FactoryConfigurationUnit(
    unit_code="K",
    unit_name_pl="Pole kablowe (przyłącze kablowe promieniowe)",
    bay_kind="liniowe_doplywowe",
    apparatus_kinds=["cable_head"],
    width_mm=310,
)
_8DJH_KE = FactoryConfigurationUnit(
    unit_code="K(E)",
    unit_name_pl="Pole kablowe z uziemnikiem zwarciowym",
    bay_kind="liniowe_doplywowe",
    apparatus_kinds=["cable_head", "earthing_switch"],
    width_mm=430,
)
_8DJH_R = FactoryConfigurationUnit(
    unit_code="R",
    unit_name_pl="Pole liniowe pierścieniowe (rozłącznik)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["switch_disconnector"],
    width_mm=310,
)
_8DJH_T = FactoryConfigurationUnit(
    unit_code="T",
    unit_name_pl="Pole transformatorowe (rozłącznik z bezpiecznikami)",
    bay_kind="transformatorowe",
    apparatus_kinds=["switch_disconnector", "fuse_set"],
    width_mm=430,
)
_8DJH_L = FactoryConfigurationUnit(
    unit_code="L",
    unit_name_pl="Pole wyłącznikowe (wyłącznik próżniowy)",
    bay_kind="liniowe_odplywowe",
    apparatus_kinds=["circuit_breaker"],
    width_mm=430,
)
_8DJH_S = FactoryConfigurationUnit(
    unit_code="S",
    unit_name_pl="Pole sprzęgłowe z rozłącznikiem",
    bay_kind="sprzeglowe_poprzeczne",
    apparatus_kinds=["switch_disconnector"],
    width_mm=430,
)
_8DJH_H = FactoryConfigurationUnit(
    unit_code="H",
    unit_name_pl="Pole sprzęgłowe z rozłącznikiem bezpiecznikowym",
    bay_kind="sprzeglowe_poprzeczne",
    apparatus_kinds=["switch_disconnector", "fuse_set"],
    width_mm=430,
)

#: Bloki pól z katalogu HA 40.2: zestawienie „Product range overview of panel
#: blocks" oraz tabela mas transportowych (kolumna „Panel block / Width").
#:
#: JEDEN WPIS NA PARĘ LUSTRZANĄ — jak w rodzinach ZPUE. Tabela mas wypisuje
#: pary („KT, TK", „RT, TR", „RK, KR", „KL, LK", „RL, LR"): to ten sam blok
#: odbity, o tej samej szerokości. Rejestr trzyma orientację wypisaną przez
#: kartę jako pierwszą.
#:
#: BLOKI 8DJH Compact (RRT 620/700 mm, RRT-R, RRT-RRT) ŚWIADOMIE POZA
#: REJESTREM: to osobna odmiana wyrobu („without busbar extension"), w której
#: blok RRT ma INNĄ szerokość niż RRT rozszerzalny (620/700 mm wobec 1050 mm).
#: Wpisanie obu pod jednym kodem skleiłoby dwa różne wyroby w jeden — a katalog
#: rodziny `SIEMENS__8DJH` opisuje odmianę rozszerzalną.
_8DJH_BLOKI: tuple[tuple[str, tuple[FactoryConfigurationUnit, ...]], ...] = (
    ("K(E)L", (_8DJH_KE, _8DJH_L)),
    ("K(E)T", (_8DJH_KE, _8DJH_T)),
    ("KL", (_8DJH_K, _8DJH_L)),
    ("KT", (_8DJH_K, _8DJH_T)),
    ("LL", (_8DJH_L, _8DJH_L)),
    ("LLL", (_8DJH_L, _8DJH_L, _8DJH_L)),
    ("LLLL", (_8DJH_L, _8DJH_L, _8DJH_L, _8DJH_L)),
    ("LRRL", (_8DJH_L, _8DJH_R, _8DJH_R, _8DJH_L)),
    ("RH", (_8DJH_R, _8DJH_H)),
    ("RK", (_8DJH_R, _8DJH_K)),
    ("RL", (_8DJH_R, _8DJH_L)),
    ("RLR", (_8DJH_R, _8DJH_L, _8DJH_R)),
    ("RR", (_8DJH_R, _8DJH_R)),
    ("RRH", (_8DJH_R, _8DJH_R, _8DJH_H)),
    ("RRL", (_8DJH_R, _8DJH_R, _8DJH_L)),
    ("RRR", (_8DJH_R, _8DJH_R, _8DJH_R)),
    ("RRRH", (_8DJH_R, _8DJH_R, _8DJH_R, _8DJH_H)),
    ("RRRL", (_8DJH_R, _8DJH_R, _8DJH_R, _8DJH_L)),
    ("RRRR", (_8DJH_R, _8DJH_R, _8DJH_R, _8DJH_R)),
    ("RRRS", (_8DJH_R, _8DJH_R, _8DJH_R, _8DJH_S)),
    ("RRRT", (_8DJH_R, _8DJH_R, _8DJH_R, _8DJH_T)),
    ("RRS", (_8DJH_R, _8DJH_R, _8DJH_S)),
    ("RRT", (_8DJH_R, _8DJH_R, _8DJH_T)),
    ("RS", (_8DJH_R, _8DJH_S)),
    ("RT", (_8DJH_R, _8DJH_T)),
    ("RTR", (_8DJH_R, _8DJH_T, _8DJH_R)),
    ("TRRT", (_8DJH_T, _8DJH_R, _8DJH_R, _8DJH_T)),
    ("TT", (_8DJH_T, _8DJH_T)),
    ("TTT", (_8DJH_T, _8DJH_T, _8DJH_T)),
    ("TTTT", (_8DJH_T, _8DJH_T, _8DJH_T, _8DJH_T)),
)

_NAZWA_JEDNOSTKI_8DJH = {
    "K": "kablowe",
    "K(E)": "kablowe z uziemnikiem",
    "R": "pierścieniowe",
    "T": "transformatorowe",
    "L": "wyłącznikowe",
    "S": "sprzęgłowe",
    "H": "sprzęgłowe bezpiecznikowe",
}


def _8djh_configuration(
    code: str, units: tuple[FactoryConfigurationUnit, ...]
) -> FactoryConfiguration:
    opis = "-".join(_NAZWA_JEDNOSTKI_8DJH[unit.unit_code] for unit in units)
    return FactoryConfiguration(
        configuration_ref=_ref_z_kodu("SIEMENS__8DJH", code),
        switchgear_family_ref="SIEMENS__8DJH",
        code=code,
        name_pl=f"Blok {opis}",
        units=list(units),
        source_refs=list(_8DJH_ZRODLA),
        notes_pl=(
            "Blok pól wg katalogu Siemens HA 40.2 (2017), zestawienie „Product "
            "range overview of panel blocks” oraz tabela mas transportowych. "
            "Litery pól wg legendy katalogu: K — pole kablowe, K(E) — pole "
            "kablowe z uziemnikiem zwarciowym, R — pole liniowe pierścieniowe, "
            "T — pole transformatorowe (rozłącznik z bezpiecznikami), L — pole "
            "wyłącznikowe, S — pole sprzęgłowe z rozłącznikiem, H — pole "
            "sprzęgłowe z rozłącznikiem bezpiecznikowym. Szerokości jednostek "
            "pochodzą z tabeli „Panel type / Width” tego samego katalogu, więc "
            "szerokość całkowita bloku jest realną sumą (zgodność z podaną "
            "osobno szerokością bloku jest przypięta testem)."
        ),
    )


FACTORY_CONFIGURATIONS: tuple[FactoryConfiguration, ...] = tuple(
    [_tpm_air_configuration(code, units) for code, units in _TPM_AIR_BLOKI]
    + [
        _tpm_configuration(code, units, nazwa, szerokosc)
        for code, units, nazwa, szerokosc in _TPM_BLOKI
    ]
    + [_safering_configuration(code, units) for code, units in _SAFERING_BLOKI]
    + [_rm6_configuration(code, units, szerokosci) for code, units, szerokosci in _RM6_BLOKI]
    + [_8djh_configuration(code, units) for code, units in _8DJH_BLOKI]
)

FACTORY_CONFIGURATION_REGISTRY: dict[str, FactoryConfiguration] = {
    c.configuration_ref: c for c in FACTORY_CONFIGURATIONS
}


def list_factory_configurations() -> list[FactoryConfiguration]:
    """Wszystkie konfiguracje fabryczne, posortowane deterministycznie."""
    return sorted(FACTORY_CONFIGURATION_REGISTRY.values(), key=lambda c: c.configuration_ref)


def list_factory_configurations_for_family(
    switchgear_family_ref: str,
) -> list[FactoryConfiguration]:
    """Konfiguracje fabryczne danej rodziny (pusta lista dla rodzin modułowych)."""
    return [
        configuration
        for configuration in list_factory_configurations()
        if configuration.switchgear_family_ref == switchgear_family_ref
    ]


def get_factory_configuration(configuration_ref: str) -> FactoryConfiguration:
    """Konfiguracja po ref. `KeyError` gdy brak (spójnie z resztą pakietu)."""
    if configuration_ref not in FACTORY_CONFIGURATION_REGISTRY:
        available = ", ".join(sorted(FACTORY_CONFIGURATION_REGISTRY))
        raise KeyError(
            f"Unknown factory configuration_ref: {configuration_ref}. Available: {available}"
        )
    return FACTORY_CONFIGURATION_REGISTRY[configuration_ref]
