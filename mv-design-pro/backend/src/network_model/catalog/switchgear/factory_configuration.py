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
        configuration_ref=f"ZPUE_WLOSZCZOWA__TPM_AIR__{code}",
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
# ABB SafeRing — bloki CCF / CCV (nomenklatura modułów ABB: C, F, V)
# =============================================================================

_SAFERING_ZRODLA = [
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

_SAFERING_NOTA = (
    "Konfiguracja fabryczna SafeRing w nomenklaturze modułów ABB: C — "
    "jednostka kablowa z rozłącznikiem, F — rozłącznik z bezpiecznikami "
    "(switch-fuse) do transformatora, V — jednostka z wyłącznikiem "
    "próżniowym. Rejestr obejmuje bloki CCF i CCV; producent oferuje szerszy "
    "zestaw konfiguracji modułowych, którego pełne zestawienie wymaga "
    "oficjalnej karty katalogowej ABB. Szerokości modułów nie są podane w "
    "źródle publicznym, dlatego szerokość całkowita pozostaje "
    "niezadeklarowana."
)

FACTORY_CONFIGURATIONS: tuple[FactoryConfiguration, ...] = tuple(
    [_tpm_air_configuration(code, units) for code, units in _TPM_AIR_BLOKI]
    + [
        FactoryConfiguration(
            configuration_ref="ABB__SAFERING__CCF",
            switchgear_family_ref="ABB__SAFERING",
            code="CCF",
            name_pl="Blok kabel-kabel-transformator (switch-fuse)",
            units=[_SAFERING_C, _SAFERING_C, _SAFERING_F],
            source_refs=list(_SAFERING_ZRODLA),
            notes_pl=_SAFERING_NOTA,
        ),
        FactoryConfiguration(
            configuration_ref="ABB__SAFERING__CCV",
            switchgear_family_ref="ABB__SAFERING",
            code="CCV",
            name_pl="Blok kabel-kabel-wyłącznik",
            units=[_SAFERING_C, _SAFERING_C, _SAFERING_V],
            source_refs=list(_SAFERING_ZRODLA),
            notes_pl=_SAFERING_NOTA,
        ),
    ]
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
