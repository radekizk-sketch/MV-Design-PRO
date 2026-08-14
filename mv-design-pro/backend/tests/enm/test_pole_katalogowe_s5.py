"""Materializacja pola stacji z katalogu rozdzielnic (S5: FieldInstance → BOM → ENM).

Kanon: `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §2–§5 oraz §7 etap S5.
Pole SN jest KOMPLETNĄ JEDNOSTKĄ FUNKCJONALNĄ konkretnej rodziny rozdzielnicy,
a nie parą „rola + pojedynczy aparat". Operacja `add_sn_bay_from_catalog`
konsumuje jednostkę katalogową (katalogowe pole rodziny modułowej albo jednostkę
bloku fabrycznego RMU) i zapisuje pole do ENM przez tę samą ścieżkę pisania,
którą ma `add_sn_bay`.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2 — testujemy klasę, nie przykład
z karty). Tablica `PRZYPADKI` niesie pełny iloczyn:

    tor konfiguracji  × zgodność konfiguracji × aparat główny pola
    (MODULARNY/RMU)     (zgodna / spoza katalogu) (wyłącznik / bezpieczniki)

a każdy wiersz przechodzi OBA tryby operacji (próba `dry_run` i wykonanie).
Defekt, który schowałby się w jednej komórce tego iloczynu — np. „bloki RMU
materializują się poprawnie, ale jednostka z bezpiecznikami dostaje wyłącznik",
albo „niezgodność jest wykrywana w wykonaniu, a próba melduje VALID" — wywala
konkretny wiersz, a nie całą tablicę.

PIN KLASY (a nie przykładu): `test_kazdy_aparat_kazdego_pola_ma_referencje_katalogowa`
przechodzi po WSZYSTKICH katalogowych polach WSZYSTKICH oferowanych rodzin i po
WSZYSTKICH jednostkach WSZYSTKICH bloków fabrycznych — nie po jednym przykładzie.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.pole_katalogowe import (
    OZNACZENIE_KANONICZNE_APARATU,
    RODZAJ_ENM_DLA_APARATU_KATALOGU,
    _rejestr_pol_katalogowych,
    _sloty_pola,
    rodzaj_enm_aparatu,
    rozwiaz_plan_pola,
)
from network_model.catalog.bay_templates import (
    _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND,
)
from network_model.catalog.switchgear import (
    FACTORY_CONFIGURATION_REGISTRY,
    FactoryConfiguration,
    FactoryConfigurationUnit,
    NiezgodnoscKonfiguracjiError,
    get_switchgear_family,
    list_factory_configurations,
)
from network_model.catalog.switchgear.apparatus_vocabulary import (
    APPARATUS_KIND_FOR_TEMPLATE_KIND,
)

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    _siec_ze_stacja,
    _stacja_ref,
    _szyna_sn_ref,
)

OPERACJA = "add_sn_bay_from_catalog"
KOD_NIEZGODNOSCI = "sn.pole_katalogowe_niezgodne"

#: Rodzina modułowa 15 kV (fikstura sieci jest siecią 15 kV) z polem
#: transformatorowym (wyłącznik) i polem potrzeb własnych (bezpieczniki).
POLE_MODULARNE_WYLACZNIK = "ZPUE_WLOSZCZOWA__ROTOBLOK__TRANSFORMER"
POLE_MODULARNE_BEZPIECZNIKI = "ZPUE_WLOSZCZOWA__ROTOBLOK__AUX"

#: Bloki fabryczne ABB SafeRing różniące się WYŁĄCZNIE aparatem jednostki
#: transformatorowej — to są dwa różne wyroby (§3), więc pole jednostki CCF
#: musi dostać rozłącznik z bezpiecznikami, a pole jednostki CCV wyłącznik.
BLOK_RMU_BEZPIECZNIKI = "ABB__SAFERING__CCF"
BLOK_RMU_WYLACZNIK = "ABB__SAFERING__CCV"
JEDNOSTKA_TRANSFORMATOROWA = 3

#: Blok fabryczny spreparowany na potrzeby testu niezgodności: jednostka żąda
#: ogranicznika przepięć, którego słownik aparatów rodziny SafeRing nie zna.
APARAT_SPOZA_SLOWNIKA_RODZINY = "surge_arrester"


def _blok_z_aparatem_spoza_slownika(
    ref: str, code: str, aparaty_jednostki: list[str]
) -> FactoryConfiguration:
    return FactoryConfiguration(
        configuration_ref=ref,
        switchgear_family_ref="ABB__SAFERING",
        code=code,
        name_pl="Blok testowy z aparatem spoza slownika rodziny",
        units=[
            FactoryConfigurationUnit(
                unit_code="C",
                unit_name_pl="Jednostka kablowa (rozłącznik)",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
            FactoryConfigurationUnit(
                unit_code="X",
                unit_name_pl="Jednostka testowa spoza slownika",
                bay_kind="transformatorowe",
                apparatus_kinds=aparaty_jednostki,  # type: ignore[arg-type]
            ),
        ],
    )


BLOK_NIEZGODNY_BEZPIECZNIKI = _blok_z_aparatem_spoza_slownika(
    "ABB__SAFERING__TEST_NIEZGODNY_F",
    "CXF",
    ["switch_disconnector", "fuse_set", APARAT_SPOZA_SLOWNIKA_RODZINY],
)
BLOK_NIEZGODNY_WYLACZNIK = _blok_z_aparatem_spoza_slownika(
    "ABB__SAFERING__TEST_NIEZGODNY_V",
    "CXV",
    ["circuit_breaker", APARAT_SPOZA_SLOWNIKA_RODZINY],
)


@dataclass(frozen=True)
class Przypadek:
    """Wiersz iloczynu cech: tor × zgodność × aparat główny pola."""

    opis_pl: str
    tor: str
    zgodnosc: str
    aparat_glowny: str
    payload: dict[str, Any]
    #: Rodzaj aparatu, który MUSI znaleźć się w polu (odróżnia pole
    #: bezpiecznikowe od wyłącznikowego).
    oczekiwany_aparat: str | None = None
    #: Typ gałęzi ENM aparatu głównego pola.
    oczekiwany_typ_galezi: str | None = None
    #: Bloki fabryczne, które trzeba wstrzyknąć do rejestru katalogu.
    bloki_testowe: tuple[FactoryConfiguration, ...] = field(default_factory=tuple)


PRZYPADKI: tuple[Przypadek, ...] = (
    Przypadek(
        opis_pl="Pole modułowe Rotoblok TR — wyłącznik z katalogu rodziny",
        tor="MODULARNY",
        zgodnosc="zgodna",
        aparat_glowny="wylacznik",
        payload={"complete_bay_template_ref": POLE_MODULARNE_WYLACZNIK},
        oczekiwany_aparat="CB",
        oczekiwany_typ_galezi="breaker",
    ),
    Przypadek(
        opis_pl="Pole modułowe Rotoblok potrzeb własnych — bezpieczniki",
        tor="MODULARNY",
        zgodnosc="zgodna",
        aparat_glowny="bezpieczniki",
        payload={"complete_bay_template_ref": POLE_MODULARNE_BEZPIECZNIKI},
        oczekiwany_aparat="FUSE",
        oczekiwany_typ_galezi="disconnector",
    ),
    Przypadek(
        opis_pl="Pole modułowe wskazane z CUDZĄ rodziną — kombinacja spoza katalogu",
        tor="MODULARNY",
        zgodnosc="spoza_katalogu",
        aparat_glowny="wylacznik",
        payload={
            "complete_bay_template_ref": POLE_MODULARNE_WYLACZNIK,
            "switchgear_family_ref": "SIEMENS__NXAIR",
        },
    ),
    Przypadek(
        opis_pl="Pole bezpiecznikowe wskazane z CUDZĄ rodziną — spoza katalogu",
        tor="MODULARNY",
        zgodnosc="spoza_katalogu",
        aparat_glowny="bezpieczniki",
        payload={
            "complete_bay_template_ref": POLE_MODULARNE_BEZPIECZNIKI,
            "switchgear_family_ref": "SIEMENS__NXAIR",
        },
    ),
    Przypadek(
        opis_pl="Jednostka bloku SafeRing CCF — rozłącznik z bezpiecznikami",
        tor="BLOK_RMU",
        zgodnosc="zgodna",
        aparat_glowny="bezpieczniki",
        payload={
            "factory_configuration_ref": BLOK_RMU_BEZPIECZNIKI,
            "factory_unit_index": JEDNOSTKA_TRANSFORMATOROWA,
        },
        oczekiwany_aparat="FUSE",
        oczekiwany_typ_galezi="switch",
    ),
    Przypadek(
        opis_pl="Jednostka bloku SafeRing CCV — wyłącznik próżniowy",
        tor="BLOK_RMU",
        zgodnosc="zgodna",
        aparat_glowny="wylacznik",
        payload={
            "factory_configuration_ref": BLOK_RMU_WYLACZNIK,
            "factory_unit_index": JEDNOSTKA_TRANSFORMATOROWA,
        },
        oczekiwany_aparat="CB",
        oczekiwany_typ_galezi="breaker",
    ),
    Przypadek(
        opis_pl="Jednostka bloku z bezpiecznikami ORAZ aparatem spoza słownika rodziny",
        tor="BLOK_RMU",
        zgodnosc="spoza_katalogu",
        aparat_glowny="bezpieczniki",
        payload={
            "factory_configuration_ref": BLOK_NIEZGODNY_BEZPIECZNIKI.configuration_ref,
            "factory_unit_index": 2,
        },
        bloki_testowe=(BLOK_NIEZGODNY_BEZPIECZNIKI,),
    ),
    Przypadek(
        opis_pl="Jednostka bloku wyłącznikowa z aparatem spoza słownika rodziny",
        tor="BLOK_RMU",
        zgodnosc="spoza_katalogu",
        aparat_glowny="wylacznik",
        payload={
            "factory_configuration_ref": BLOK_NIEZGODNY_WYLACZNIK.configuration_ref,
            "factory_unit_index": 2,
        },
        bloki_testowe=(BLOK_NIEZGODNY_WYLACZNIK,),
    ),
)


# ---------------------------------------------------------------------------
# Pomocnicze
# ---------------------------------------------------------------------------


def _siec() -> dict[str, Any]:
    return _siec_ze_stacja()


def _payload_pola(przypadek: Przypadek, snapshot: dict[str, Any], **nadpisania: Any) -> dict:
    return {
        "bus_ref": _szyna_sn_ref(snapshot),
        "station_ref": _stacja_ref(snapshot),
        **przypadek.payload,
        **nadpisania,
    }


def _specyfikacje_pol(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    return list((stacja.get("meta") or {}).get("field_specs") or [])


def _nowe_pole(snapshot: dict[str, Any], przed: dict[str, Any]) -> dict[str, Any]:
    znane = {spec["field_ref"] for spec in _specyfikacje_pol(przed)}
    nowe = [spec for spec in _specyfikacje_pol(snapshot) if spec["field_ref"] not in znane]
    assert len(nowe) == 1, f"Oczekiwano jednego nowego pola, jest {len(nowe)}"
    return nowe[0]


def _pola_torem_modularnym() -> dict[str, Any]:
    """Katalogowe pola rodzin MODUŁOWYCH — jedyne osiągalne pojedynczą celką.

    Pole rodziny RMU jest osiągalne WYŁĄCZNIE przez blok fabryczny i jego
    jednostkę (§3), więc pętla po katalogu musi iść oboma torami, a nie jednym.
    """
    return {
        template_ref: szablon
        for template_ref, szablon in _rejestr_pol_katalogowych().items()
        if get_switchgear_family(str(szablon.switchgear_family_ref)).tor_konfiguracji == "MODULARNY"
    }


def test_podzial_katalogu_na_tory_nie_gubi_pola() -> None:
    """Pole pominięte w torze modułowym MUSI należeć do rodziny blokowej.

    Bez tego pinu zawężenie pętli „bo się wywalała" po cichu zmniejszyłoby
    pokrycie pinu klasy — dokładnie ten ruch, przed którym ostrzega Zero-Debt.
    """
    pominiete = set(_rejestr_pol_katalogowych()) - set(_pola_torem_modularnym())
    for template_ref in pominiete:
        szablon = _rejestr_pol_katalogowych()[template_ref]
        rodzina = get_switchgear_family(str(szablon.switchgear_family_ref))
        assert rodzina.tor_konfiguracji == "BLOK_RMU", template_ref
    assert pominiete, "Katalog musi zawierać rodziny blokowe, inaczej pin jest pusty"


@pytest.fixture()
def rejestr_z_blokami_testowymi(monkeypatch: pytest.MonkeyPatch):
    """Wstrzykuje bloki testowe do rejestru katalogu na czas jednego testu."""

    def _wstrzyknij(bloki: tuple[FactoryConfiguration, ...]) -> None:
        for blok in bloki:
            monkeypatch.setitem(FACTORY_CONFIGURATION_REGISTRY, blok.configuration_ref, blok)

    return _wstrzyknij


# ---------------------------------------------------------------------------
# ILOCZYN CECH: tor × zgodność × aparat główny × tryb operacji
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "przypadek", PRZYPADKI, ids=lambda p: f"{p.tor}-{p.zgodnosc}-{p.aparat_glowny}"
)
@pytest.mark.parametrize("tryb", ["proba", "wykonanie"])
def test_iloczyn_cech_materializacji_pola(
    przypadek: Przypadek, tryb: str, rejestr_z_blokami_testowymi
) -> None:
    """Każda komórka iloczynu cech zachowuje się tak, jak stanowi kanon."""
    rejestr_z_blokami_testowymi(przypadek.bloki_testowe)
    snapshot = _siec()
    przed = copy.deepcopy(snapshot)
    dry_run = tryb == "proba"

    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name=OPERACJA,
        payload=_payload_pola(przypadek, snapshot, dry_run=dry_run),
    )

    if przypadek.zgodnosc == "spoza_katalogu":
        assert wynik.get("error"), f"{przypadek.opis_pl}: kombinacja spoza katalogu przeszła"
        assert wynik["error_code"] == KOD_NIEZGODNOSCI, przypadek.opis_pl
        # Twardy błąd niesie polskie zdanie walidatora rodziny, nie kod techniczny.
        assert len(str(wynik["error"])) > 20, przypadek.opis_pl
        assert not wynik.get("snapshot"), "Niezgodność nie może zostawić migawki do zapisu"
        if dry_run:
            assert wynik["dry_run"] is True
            assert wynik["preview"]["werdykt"] == "INVALID"
        assert snapshot == przed, "Odrzucona operacja nie może zmienić modelu"
        return

    assert not wynik.get("error"), f"{przypadek.opis_pl}: {wynik.get('error')}"

    if dry_run:
        # Próba: werdykt + BOM, ZERO mutacji i ZERO migawki (brak migawki =
        # końcówka API nie ma czego zapisać).
        assert wynik["dry_run"] is True
        assert "snapshot" not in wynik
        assert snapshot == przed, "Tryb próby nie może zmienić modelu"
        podglad = wynik["preview"]
        assert podglad["werdykt"] == "VALID"
        assert podglad["aparaty"], przypadek.opis_pl
        rodzaje = [aparat["kind"] for aparat in podglad["aparaty"]]
        assert przypadek.oczekiwany_aparat in rodzaje, f"{przypadek.opis_pl}: {rodzaje}"
        for aparat in podglad["aparaty"]:
            assert aparat["catalog_ref"], f"{przypadek.opis_pl}: aparat bez referencji katalogu"
            # Podgląd NIE nadaje tożsamości — powstaje razem z polem.
            assert "device_ref" not in aparat
        assert podglad["switchgear_family_ref"]
        assert podglad["bay_template_ref"]
        return

    snapshot_po = wynik["snapshot"]
    pole = _nowe_pole(snapshot_po, przed)
    aparaty = pole["primary_devices"]
    rodzaje = [aparat["kind"] for aparat in aparaty]
    assert przypadek.oczekiwany_aparat in rodzaje, f"{przypadek.opis_pl}: {rodzaje}"
    for aparat in aparaty:
        assert aparat["catalog_ref"], f"{przypadek.opis_pl}: aparat bez referencji katalogu"
        assert aparat["device_ref"].startswith(pole["field_ref"])
    # Powiązania katalogowe pola (rodzina/szablon/producent) są DANĄ pola.
    assert pole["bay_template_ref"]
    assert pole["switchgear_family_ref"]
    # Aparat główny pola w modelu jest tym aparatem, który deklaruje katalog.
    galezie_pola = [
        galaz
        for galaz in snapshot_po["branches"]
        if (galaz.get("meta") or {}).get("field_ref") == pole["field_ref"]
    ]
    assert len(galezie_pola) == 1, przypadek.opis_pl
    assert galezie_pola[0]["type"] == przypadek.oczekiwany_typ_galezi, przypadek.opis_pl


def test_tablica_pokrywa_pelny_iloczyn_cech() -> None:
    """Tablica MUSI nieść pełny iloczyn — inaczej brak wiersza byłby niewidoczny.

    Deklaracja „testujemy iloczyn cech" bez testu tej deklaracji jest fałszywą
    pewnością: usunięcie wiersza „RMU × bezpieczniki" zostawiłoby zieloną
    regresję przy defekcie, który dotyczy dokładnie tej komórki.
    """
    cechy = {(p.tor, p.zgodnosc, p.aparat_glowny) for p in PRZYPADKI}
    oczekiwane = {
        (tor, zgodnosc, aparat)
        for tor in ("MODULARNY", "BLOK_RMU")
        for zgodnosc in ("zgodna", "spoza_katalogu")
        for aparat in ("wylacznik", "bezpieczniki")
    }
    assert cechy == oczekiwane, f"Brakujące komórki iloczynu: {oczekiwane - cechy}"


# ---------------------------------------------------------------------------
# PIN KLASY: referencja katalogowa każdego aparatu każdego pola
# ---------------------------------------------------------------------------


def test_kazdy_aparat_kazdego_pola_ma_referencje_katalogowa() -> None:
    """KLASA, nie przykład: WSZYSTKIE katalogowe pola i WSZYSTKIE jednostki bloków.

    Materializacja przez referencję katalogową jest regułą karty S5 §0 pkt 1.
    Sprawdzenie jednego pola dowodziłoby tylko, że jedno pole ją spełnia —
    pętla po całym katalogu dowodzi reguły.
    """
    zbadane_rodzaje: set[str] = set()
    sprawdzone_pola = 0

    for template_ref in sorted(_pola_torem_modularnym()):
        plan = rozwiaz_plan_pola(
            {"complete_bay_template_ref": template_ref}, field_ref="pole-testowe"
        )
        assert plan.aparaty, f"{template_ref}: katalogowe pole bez aparatów"
        for aparat in plan.aparaty:
            assert aparat["catalog_ref"], f"{template_ref}: aparat bez referencji katalogu"
            assert aparat["device_ref"] == (f"pole-testowe::dev::{plan.aparaty.index(aparat)}")
            zbadane_rodzaje.add(aparat["kind"])
        sprawdzone_pola += 1

    for konfiguracja in list_factory_configurations():
        for numer in range(1, len(konfiguracja.units) + 1):
            plan = rozwiaz_plan_pola(
                {
                    "factory_configuration_ref": konfiguracja.configuration_ref,
                    "factory_unit_index": numer,
                },
                field_ref="pole-testowe",
            )
            assert plan.aparaty, f"{konfiguracja.code}/{numer}: jednostka bez aparatów"
            for aparat in plan.aparaty:
                assert aparat[
                    "catalog_ref"
                ], f"{konfiguracja.code}/{numer}: aparat bez referencji katalogu"
                zbadane_rodzaje.add(aparat["kind"])
            sprawdzone_pola += 1

    assert sprawdzone_pola > 40, "Pętla musi objąć cały katalog, nie próbkę"
    # Pętla naprawdę dotknęła aparatów RÓŻNYCH rodzajów (inaczej „wszystkie
    # aparaty mają referencję" mogłoby znaczyć „jeden rodzaj ją ma").
    assert {"CB", "LOAD_SWITCH", "DS", "ES", "FUSE", "CT", "VT"} <= zbadane_rodzaje


def test_pola_rodzin_maja_sparowane_wyposazenie() -> None:
    """Tor pola i wyposażenie katalogowe opisują TEN SAM zbiór aparatów.

    `base_template.devices` (miejsce w torze) i `device_instances` (tożsamość
    katalogowa) powstają z jednego przebiegu, więc parowanie po pozycji jest
    poprawne wyłącznie dopóki obie listy są tej samej długości. Ten pin trzyma
    założenie, na którym stoi cała materializacja.
    """
    for template_ref, szablon in sorted(_rejestr_pol_katalogowych().items()):
        sloty = _sloty_pola(szablon)
        assert len(sloty) == len(szablon.device_instances), template_ref
        assert len(sloty) == len(szablon.base_template.devices), template_ref


# ---------------------------------------------------------------------------
# PREDYKATY PARAMI: wejście (katalog) i wyjście (ENM) z jednego źródła
# ---------------------------------------------------------------------------


def test_odwzorowanie_aparatu_jest_zlozeniem_a_nie_druga_lista() -> None:
    """Rodzaj aparatu w ENM wynika ZE ZŁOŻENIA istniejących tablic katalogu.

    Gdyby tablica była przepisana ręcznie, rozjazd z kanonem szablonów byłby
    niewidoczny aż do pierwszego nowego rodzaju aparatu.
    """
    for kind, apparatus_kind in APPARATUS_KIND_FOR_TEMPLATE_KIND.items():
        assert (
            RODZAJ_ENM_DLA_APARATU_KATALOGU[apparatus_kind]
            == _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND[kind]
        ), kind
    # Rozłącznik rodziny RMU — jedyny wpis rozstrzygnięty jawnie (słownik
    # rodziny nie rozróżnia odłącznika od rozłącznika).
    assert RODZAJ_ENM_DLA_APARATU_KATALOGU["switch_disconnector"] == "LOAD_SWITCH"


@pytest.mark.parametrize(
    "apparatus_kind",
    ["voltage_indicator", "protection_relay", "meter", "busbar", "bus_coupler", "interlock"],
)
def test_aparat_bez_odpowiednika_w_modelu_jest_twardym_bledem(apparatus_kind: str) -> None:
    """Aparat, którego model nie reprezentuje, NIE jest po cichu pomijany (§5).

    Ciche pominięcie dałoby pole narysowane niezgodnie z wyrobem — bez śladu
    w modelu i bez ostrzeżenia dla projektanta.
    """
    with pytest.raises(NiezgodnoscKonfiguracjiError) as blad:
        rodzaj_enm_aparatu(apparatus_kind)
    assert apparatus_kind in str(blad.value)


def test_wyposazenie_pola_odpowiada_wyposazeniu_katalogowemu() -> None:
    """Warunek WEJŚCIA i WYJŚCIA: co katalog deklaruje, to w ENM powstaje.

    Nie „tyle samo sztuk", tylko rodzaj po rodzaju w tej samej kolejności —
    inaczej podmiana aparatu na inny przeszłaby przy zgodnej liczbie.
    """
    for template_ref, szablon in sorted(_pola_torem_modularnym().items()):
        plan = rozwiaz_plan_pola(
            {"complete_bay_template_ref": template_ref}, field_ref="pole-testowe"
        )
        oczekiwane = [
            RODZAJ_ENM_DLA_APARATU_KATALOGU[instancja.apparatus_kind]
            for instancja in szablon.device_instances
        ]
        assert [aparat["kind"] for aparat in plan.aparaty] == oczekiwane, template_ref
        assert [aparat["catalog_ref"] for aparat in plan.aparaty] == [
            instancja.device_template_ref for instancja in szablon.device_instances
        ], template_ref


def test_jednostka_bloku_rozstrzyga_aparat_toru_glownego() -> None:
    """CCF i CCV różnią się WYŁĄCZNIE aparatem jednostki — i tak muszą się różnić.

    Gdyby pole jednostki dziedziczyło łącznik po ogólnym polu rodziny, oba bloki
    dałyby identyczne pole transformatorowe z wyłącznikiem — czyli model
    opisywałby wyrób, którego w bloku CCF nie ma.
    """
    ccf = rozwiaz_plan_pola(
        {
            "factory_configuration_ref": BLOK_RMU_BEZPIECZNIKI,
            "factory_unit_index": JEDNOSTKA_TRANSFORMATOROWA,
        },
        field_ref="pole-ccf",
    )
    ccv = rozwiaz_plan_pola(
        {
            "factory_configuration_ref": BLOK_RMU_WYLACZNIK,
            "factory_unit_index": JEDNOSTKA_TRANSFORMATOROWA,
        },
        field_ref="pole-ccv",
    )
    assert ccf.rodzaj_aparatu_glownego == "LOAD_SWITCH"
    assert ccv.rodzaj_aparatu_glownego == "CB"
    assert [a["kind"] for a in ccf.aparaty].count("FUSE") == 1
    assert "FUSE" not in [a["kind"] for a in ccv.aparaty]
    # Aparat jednostki niesie referencję JEDNOSTKI, nie slotu pola ogólnego —
    # inaczej model twierdziłby, że bezpieczniki bloku pochodzą z pozycji
    # wyłącznika pola ogólnego rodziny.
    bezpiecznik = next(a for a in ccf.aparaty if a["kind"] == "FUSE")
    assert bezpiecznik["catalog_ref"].startswith(BLOK_RMU_BEZPIECZNIKI)
    assert bezpiecznik["designation"] == OZNACZENIE_KANONICZNE_APARATU["fuse_set"]
    # Reszta toru pochodzi z katalogowego pola rodziny (nic nie jest zmyślane).
    uziemnik = next(a for a in ccf.aparaty if a["kind"] == "ES")
    assert uziemnik["catalog_ref"].startswith(ccf.bay_template_ref)


# ---------------------------------------------------------------------------
# Tor konfiguracji rozstrzyga RODZINA, nie payload
# ---------------------------------------------------------------------------


def test_rodzina_rmu_nie_daje_sie_zbudowac_pojedyncza_celka() -> None:
    """RMU ≠ zbiór luźnych szaf (§3): pole powstaje przez blok i jednostkę."""
    assert get_switchgear_family("ABB__SAFERING").tor_konfiguracji == "BLOK_RMU"
    with pytest.raises(NiezgodnoscKonfiguracjiError) as blad:
        rozwiaz_plan_pola(
            {"complete_bay_template_ref": "ABB__SAFERING__TRANSFORMER"},
            field_ref="pole-testowe",
        )
    assert "BLOK" in str(blad.value)


def test_blok_fabryczny_w_rodzinie_modulowej_jest_odrzucony(
    rejestr_z_blokami_testowymi,
) -> None:
    """Blok fabryczny rodziny składanej z pojedynczych pól to sprzeczność."""
    blok = FactoryConfiguration(
        configuration_ref="ZPUE_WLOSZCZOWA__ROTOBLOK__TEST_BLOK",
        switchgear_family_ref="ZPUE_WLOSZCZOWA__ROTOBLOK",
        code="TEST",
        name_pl="Blok w rodzinie modulowej",
        units=[
            FactoryConfigurationUnit(
                unit_code="L",
                unit_name_pl="Jednostka liniowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
            FactoryConfigurationUnit(
                unit_code="T",
                unit_name_pl="Jednostka transformatorowa",
                bay_kind="transformatorowe",
                apparatus_kinds=["circuit_breaker"],
            ),
        ],
    )
    rejestr_z_blokami_testowymi((blok,))
    with pytest.raises(NiezgodnoscKonfiguracjiError) as blad:
        rozwiaz_plan_pola(
            {"factory_configuration_ref": blok.configuration_ref, "factory_unit_index": 1},
            field_ref="pole-testowe",
        )
    assert "blok" in str(blad.value).lower()


@pytest.mark.parametrize(
    ("numer", "fragment"),
    [(0, "poza zakresem"), (4, "poza zakresem"), (None, "numeru jednostki")],
)
def test_numer_jednostki_bloku_musi_wskazywac_istniejaca_jednostke(
    numer: object, fragment: str
) -> None:
    """Numer jednostki poza zakresem nie jest przycinany do zakresu."""
    payload: dict[str, Any] = {"factory_configuration_ref": BLOK_RMU_BEZPIECZNIKI}
    if numer is not None:
        payload["factory_unit_index"] = numer
    with pytest.raises(NiezgodnoscKonfiguracjiError) as blad:
        rozwiaz_plan_pola(payload, field_ref="pole-testowe")
    assert fragment in str(blad.value)


def test_rola_pola_wynika_z_katalogu_a_nie_z_deklaracji() -> None:
    """Deklaracja roli niezgodna z katalogiem jest błędem, nie cichym nadpisaniem."""
    snapshot = _siec()
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name=OPERACJA,
        payload={
            "bus_ref": _szyna_sn_ref(snapshot),
            "station_ref": _stacja_ref(snapshot),
            "complete_bay_template_ref": POLE_MODULARNE_WYLACZNIK,
            "bay_role": "COUPLER",
        },
    )
    assert wynik["error_code"] == KOD_NIEZGODNOSCI
    assert "TR" in str(wynik["error"])


def test_blok_nie_koliduje_ze_slotem_szablonu_ktory_sam_wypelnia() -> None:
    """Blok WYPEŁNIA slot pola — zgodny slot przechodzi, rozjazd jest błędem."""
    zgodny = rozwiaz_plan_pola(
        {
            "factory_configuration_ref": BLOK_RMU_BEZPIECZNIKI,
            "factory_unit_index": JEDNOSTKA_TRANSFORMATOROWA,
            "bay_template_ref": "ABB__SAFERING__TRANSFORMER",
        },
        field_ref="pole-testowe",
    )
    assert zgodny.bay_template_ref == "ABB__SAFERING__TRANSFORMER"
    with pytest.raises(NiezgodnoscKonfiguracjiError):
        rozwiaz_plan_pola(
            {
                "factory_configuration_ref": BLOK_RMU_BEZPIECZNIKI,
                "factory_unit_index": JEDNOSTKA_TRANSFORMATOROWA,
                "bay_template_ref": "ABB__SAFERING__LINE_OUT",
            },
            field_ref="pole-testowe",
        )


# ---------------------------------------------------------------------------
# Determinizm i dług zastany
# ---------------------------------------------------------------------------


def test_ta_sama_operacja_na_tym_samym_modelu_daje_identyczny_wynik() -> None:
    """Determinizm (§0 pkt 5): zero losowości i zero czasu w ścieżce."""
    pierwszy = _siec()
    drugi = copy.deepcopy(pierwszy)
    payload = {
        "bus_ref": _szyna_sn_ref(pierwszy),
        "station_ref": _stacja_ref(pierwszy),
        "complete_bay_template_ref": POLE_MODULARNE_WYLACZNIK,
    }
    wynik_a = execute_domain_operation(pierwszy, OPERACJA, copy.deepcopy(payload))
    wynik_b = execute_domain_operation(drugi, OPERACJA, copy.deepcopy(payload))
    assert not wynik_a.get("error") and not wynik_b.get("error")
    assert wynik_a["snapshot"] == wynik_b["snapshot"]
    assert wynik_a["changes"] == wynik_b["changes"]


def test_pole_z_referencja_producencka_nie_jest_juz_polem_bez_aparatow() -> None:
    """Dług zastany domknięty: `add_sn_bay` z referencją producencką.

    Przed etapem S5 `bay_template_ref` wskazujące katalogowe pole rodziny dawało
    po cichu PUSTĄ listę aparatów (materializacja znała tylko nomenklaturę
    kanoniczną), więc pole wybrane z katalogu producenta lądowało w modelu bez
    ani jednego aparatu. Ten test pilnuje, że obie nomenklatury wchodzą tym
    samym wejściem.
    """
    snapshot = _siec()
    przed = copy.deepcopy(snapshot)
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_sn_bay",
        payload={
            "bus_ref": _szyna_sn_ref(snapshot),
            "station_ref": _stacja_ref(snapshot),
            "bay_role": "TR",
            "bay_template_ref": POLE_MODULARNE_WYLACZNIK,
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    pole = _nowe_pole(wynik["snapshot"], przed)
    assert pole["primary_devices"], "Pole z katalogu producenta bez aparatów"
    assert all(aparat["catalog_ref"] for aparat in pole["primary_devices"])


def test_kanoniczny_szablon_pola_zachowuje_dotychczasowa_sciezke() -> None:
    """Nomenklatura kanoniczna działa bez zmian (materializacja bez regresu)."""
    snapshot = _siec()
    przed = copy.deepcopy(snapshot)
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_sn_bay",
        payload={
            "bus_ref": _szyna_sn_ref(snapshot),
            "station_ref": _stacja_ref(snapshot),
            "bay_role": "OUT",
            "bay_template_ref": "bay_template_line_out",
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    pole = _nowe_pole(wynik["snapshot"], przed)
    assert [aparat["kind"] for aparat in pole["primary_devices"]] == [
        "DS",
        "CB",
        "CT",
        "DS",
        "ES",
        "CABLE_HEAD",
    ]
    # Ścieżka kanoniczna NIE dorabia referencji katalogowej, której nie ma.
    assert all("catalog_ref" not in aparat for aparat in pole["primary_devices"])
