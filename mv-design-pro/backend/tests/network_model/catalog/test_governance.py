"""
Testy governance katalogu: tryb importu, biblioteka zabezpieczeń, bramka
katalogowa (`wymagalnosc_katalogu`) — karta W3-I (2026-09-09).

W1 (2026-09-09): governance biblioteki typów sieci (P13b — `TypeLibraryManifest`,
`TypeLibraryExport`, `compute_fingerprint`, `sort_types_deterministically`,
końcówki `GET|POST /api/catalog/export|import`) skasowane razem z tabelami typów
w bazie (`line_types`, `cable_types`, `transformer_types`, `switch_equipment_types`,
`inverter_types`) — jedyny konsument końcówek (przyciski eksportu/importu w
`ui/catalog/TypeLibraryBrowser.tsx`) skasowany razem z nimi; w bazie deweloperskiej
0 wierszy w każdej tabeli. Jedyna prawda typów: katalog
statyczny + katalog projektu w ENM (`enm/katalog_projektu.py`). Testy eksportu/
importu zeszły razem z kodem; `ImportMode` zostaje, bo steruje importem biblioteki
zabezpieczeń (`CatalogGovernanceService.import_protection_library`, pin:
`tests/test_protection_library.py`).

W3-I (2026-09-09): `wymaga_referencji_katalogowej` skasowana (0 wołających w
produkcji po migracji wszystkich sześciu konsumentów na `wymagalnosc_katalogu` —
patrz `network_model/catalog/governance.py`, sekcja „Bramka katalogowa"). Testy
poniżej pokrywają TABELĘ jako iloczyn cech: rodzaj × oś (tworzenie/walidacja/
import) × (`catalog_ref` obecny/brak) × (`parameter_source` MANUAL_EQUIVALENT/
inny) × (`gen_type` przekształtnikowy/inny) — zgodnie z kartą W3-I §0 pkt 3.
"""

from __future__ import annotations

import pytest
from network_model.catalog.governance import (
    ImportMode,
    Poziom,
    WymagalnoscKatalogu,
    brakuje_wymaganej_referencji,
    wymagalnosc_katalogu,
)


def test_import_mode_enum():
    """ImportMode enum has MERGE and REPLACE."""
    assert ImportMode.MERGE.value == "merge"
    assert ImportMode.REPLACE.value == "replace"
    assert ImportMode("merge") == ImportMode.MERGE
    assert ImportMode("replace") == ImportMode.REPLACE


# ---------------------------------------------------------------------------
# `wymagalnosc_katalogu` — tabela jako iloczyn cech (karta W3-I §0 pkt 3)
# ---------------------------------------------------------------------------

#: Rodzaj (w OBU nazewnictwach, gdzie ma to znaczenie) -> oczekiwana wymagalność
#: na trzech osiach, dla DOMYŚLNYCH wartości `parameter_source`/`gen_type` (bez
#: żadnego z wyjątków — gałąź "inna" tabeli). Każdy wiersz odpowiada JEDNEJ
#: komórce §0.15 karty W3-I, zmierzonej z pliku:linii cytowanych w
#: `network_model/catalog/governance.py`.
_RODZAJE_BEZ_WYJATKOW: tuple[tuple[str, WymagalnoscKatalogu], ...] = (
    ("cable", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009")),
    ("line_overhead", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009")),
    ("line", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009")),
    (
        "overhead_line",
        WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009"),
    ),
    ("CABLE", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009")),
    ("LINE", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009")),
    (
        "transformer",
        WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009"),
    ),
    (
        "TRANSFORMER",
        WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009"),
    ),
    ("load", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)),
    ("switch", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)),
    ("breaker", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)),
    ("fuse", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)),
    ("measurement", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)),
    ("protection", WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)),
    ("shunt_capacitor", WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)),
    ("", WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)),
    ("nieznany_rodzaj_xyz", WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)),
)


@pytest.mark.parametrize("rodzaj,oczekiwane", _RODZAJE_BEZ_WYJATKOW)
def test_wymagalnosc_katalogu_rodzaje_bez_wyjatkow(
    rodzaj: str, oczekiwane: WymagalnoscKatalogu
) -> None:
    """Rodzaje bez żadnego wyjątku (nie źródło, nie generator) — jedna wartość
    niezależna od `parameter_source`/`gen_type`."""
    assert wymagalnosc_katalogu(rodzaj) == oczekiwane


def test_wymagalnosc_katalogu_rodzaj_none_nie_fabrykuje_wymogu() -> None:
    """`rodzaj=None` normalizuje jak pusty łańcuch — zero fabrykacji wymogu."""
    assert wymagalnosc_katalogu(None) == WymagalnoscKatalogu(  # type: ignore[arg-type]
        Poziom.NIE, Poziom.NIE, Poziom.NIE, None
    )


@pytest.mark.parametrize("biale_znaki", [" cable ", "Cable", "CaBlE", "\tcable\n"])
def test_wymagalnosc_katalogu_normalizuje_wielkosc_liter_i_biale_znaki(biale_znaki: str) -> None:
    assert wymagalnosc_katalogu(biale_znaki).walidacja is Poziom.BLOCKER


# --- Źródło systemowe: iloczyn parameter_source × (obecność catalog_ref przez
#     brakuje_wymaganej_referencji, osobny test niżej) --------------------------


@pytest.mark.parametrize("parameter_source", [None, "CATALOG", "OVERRIDE", "cokolwiek_innego", ""])
def test_wymagalnosc_katalogu_zrodlo_bez_manual_equivalent_jest_blocker(
    parameter_source: str | None,
) -> None:
    """Źródło BEZ `parameter_source == "MANUAL_EQUIVALENT"` — BLOCKER na
    wszystkich trzech osiach, kod E009."""
    wynik = wymagalnosc_katalogu("source", parameter_source=parameter_source)
    assert wynik == WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, "E009")


def test_wymagalnosc_katalogu_zrodlo_manual_equivalent_jest_nie_na_wszystkich_osiach() -> None:
    """K1.2 — źródło z jawnym Sk''/RX (`parameter_source == "MANUAL_EQUIVALENT"`)
    nie wymaga katalogu na ŻADNEJ z trzech osi."""
    wynik = wymagalnosc_katalogu("source", parameter_source="MANUAL_EQUIVALENT")
    assert wynik == WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)


def test_wymagalnosc_katalogu_zrodlo_bez_parameter_source_ignoruje_gen_type() -> None:
    """`gen_type` nie ma znaczenia dla rodzaju `source` (parametr tego rodzaju nie
    dotyczy) — obecność/brak nie zmienia wyniku."""
    bez = wymagalnosc_katalogu("source")
    z_gen_type = wymagalnosc_katalogu("source", gen_type="pv_inverter")
    assert bez == z_gen_type


# --- Generator: iloczyn gen_type (przekształtnikowy / inny / None) -------------

_GEN_TYPES_PRZEKSZTALTNIKOWE_SC = ("pv_inverter", "bess", "wind_inverter", "fw_pmsg")
#: `fw_dfig`/`fw_scig` są maszynami WIRUJĄCYMI w klasyfikacji zwarciowej
#: (`enm/mapping.py::FULL_CONVERTER_SC_GEN_TYPES` ich NIE zawiera) — mimo że
#: `enm/models.py::GEN_TYPES_PRZEKSZTALTNIKOWE` (INNE pytanie: czy DER) je
#: zawiera. Test przypina tę różnicę: gdyby tabela kiedyś pomyliła oba zbiory
#: (regresja zmierzona w karcie W3-I — `v2_projection.py` miał własną,
#: 6-elementową kopię pokrywającą się z `GEN_TYPES_PRZEKSZTALTNIKOWE`, NIE z
#: `FULL_CONVERTER_SC_GEN_TYPES`), ten test poczerwienieje.
_GEN_TYPES_NIE_ZWARCIOWO_PRZEKSZTALTNIKOWE = (
    "synchronous",
    "fw_dfig",
    "fw_scig",
    None,
    "nieznany_typ_generatora",
)


@pytest.mark.parametrize("gen_type", _GEN_TYPES_PRZEKSZTALTNIKOWE_SC)
@pytest.mark.parametrize("catalog_ref_obecny", [True, False])
def test_wymagalnosc_katalogu_generator_przeksztaltnikowy(
    gen_type: str, catalog_ref_obecny: bool
) -> None:
    """Generator przekształtnikowy (sens zwarciowy IEC 60909 §6.7) — tworzenie
    BLOCKER niezależnie od `catalog_ref` (oś `tworzenie` nie zależy od
    obecności referencji — to inny wymiar), walidacja/import WARNING kod W010
    na walidacji."""
    wynik = wymagalnosc_katalogu("generator", gen_type=gen_type)
    assert wynik.tworzenie is Poziom.BLOCKER
    assert wynik.walidacja is Poziom.WARNING
    assert wynik.import_ is Poziom.WARNING
    assert wynik.kod_walidacji == "W010"


@pytest.mark.parametrize("gen_type", _GEN_TYPES_NIE_ZWARCIOWO_PRZEKSZTALTNIKOWE)
def test_wymagalnosc_katalogu_generator_inny(gen_type: str | None) -> None:
    """Generator inny niż przekształtnikowy (w tym `"synchronous"`, DFIG/SCIG
    wirujące i `gen_type=None`) — tworzenie WCIĄŻ BLOCKER (zmierzone:
    `add_generator_sn` i `add_converter_source` nie mają wyjątku dla ŻADNEGO
    gen_type), ale walidacja/import NIE (brak kodu E0xx/W0xx, brak
    sprawdzenia w ZIP/CGMES/XLSX dla generatorów innych niż przekształtnikowe)."""
    wynik = wymagalnosc_katalogu("generator", gen_type=gen_type)
    assert wynik == WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)


def test_wymagalnosc_katalogu_generator_tworzenie_zawsze_blocker() -> None:
    """Oś `tworzenie` dla `rodzaj="generator"` jest BLOCKER dla KAŻDEGO
    zmierzonego gen_type — żaden tor tworzenia generatora (`add_generator_sn`,
    `add_converter_source`) nie ma wyjątku (K1.2: „element fizyczny, bez
    wyjątku dla generatorów")."""
    wszystkie = _GEN_TYPES_PRZEKSZTALTNIKOWE_SC + _GEN_TYPES_NIE_ZWARCIOWO_PRZEKSZTALTNIKOWE
    for gen_type in wszystkie:
        assert wymagalnosc_katalogu("generator", gen_type=gen_type).tworzenie is Poziom.BLOCKER


# ---------------------------------------------------------------------------
# `brakuje_wymaganej_referencji` — iloczyn (poziom × obecność catalog_ref)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("catalog_ref", [None, "", "  ", "poz-1"])
def test_brakuje_wymaganej_referencji_poziom_nie_zawsze_false(catalog_ref: str | None) -> None:
    """Poziom `NIE` nigdy nie zgłasza braku, niezależnie od `catalog_ref`."""
    assert brakuje_wymaganej_referencji(Poziom.NIE, catalog_ref) is False


@pytest.mark.parametrize("poziom", [Poziom.BLOCKER, Poziom.WARNING])
@pytest.mark.parametrize("catalog_ref", [None, ""])
def test_brakuje_wymaganej_referencji_brak_referencji(
    poziom: Poziom, catalog_ref: str | None
) -> None:
    """BLOCKER i WARNING oba zgłaszają brak, gdy `catalog_ref` jest puste —
    severity wybiera WOŁAJĄCY (`SEVERITY_BLOCKER`/`SEVERITY_IMPORTANT`), nie
    ta funkcja."""
    assert brakuje_wymaganej_referencji(poziom, catalog_ref) is True


@pytest.mark.parametrize("poziom", [Poziom.BLOCKER, Poziom.WARNING])
def test_brakuje_wymaganej_referencji_referencja_obecna(poziom: Poziom) -> None:
    assert brakuje_wymaganej_referencji(poziom, "poz-1") is False
