"""P0.1 nN — automigracja promocji `nn_field_specs` → realne elementy (karta P0.1, C §4.2).

Sprawdzamy to, na czym zależy projektantowi: stary ENM zapisany przed P0.1
(odpływ/pole źródłowe nN wyłącznie jako wpis w `Substation.meta.nn_field_specs`)
dostaje po wczytaniu REALNY `SwitchBranch` (aparat) + szynę odpływu — solver i
SLD czytają odtąd JEDEN graf (LV-INV-12), a `nn_field_specs` zostaje wyłącznie
projekcją odczytu. Migracja jest idempotentna (per wpis, nie per stacja —
patrz docstring modułu) i podnosi rewizję modelu DOKŁADNIE RAZ.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.migrations.nn_field_specs_promocja import (
    META_KLUCZ_GALAZ_ROLA_POLA,
    META_KLUCZ_GALAZ_ZRODLO_FIELD_REF,
    META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA,
    META_KLUCZ_STACJA_PROMOWANA,
    migruj,
    wymaga_migracji,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Load,
    Substation,
    SwitchBranch,
)
from enm.store import get_enm, reset_enm_store, set_enm
from enm.validator import ENMValidator

REF_APARAT_NN = "cb_nn_630a"


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> Any:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    yield
    reset_enm_store()


def _stary_model(*, z_wiazaniem: bool = False) -> EnergyNetworkModel:
    """Model „sprzed P0.1": odpływ nN WYŁĄCZNIE jako wpis nn_field_specs + odbiór na szynie stacji."""
    field_spec: dict[str, Any] = {
        "field_ref": "nn/legacy/outgoing-1",
        "name": "Odpływ 1",
        "bay_role": "FEEDER",
        "bus_ref": "bus-nn",
        "equipment_refs": [],
        "protection_ref": None,
        "tags": [],
        "meta": {"feeder_role": "ODPLYW_NN"},
    }
    if z_wiazaniem:
        field_spec["meta"]["catalog_binding"] = {"catalog_item_id": REF_APARAT_NN}

    return EnergyNetworkModel(
        header=ENMHeader(name="stary", defaults=ENMDefaults()),
        buses=[Bus(ref_id="bus-nn", name="Szyna nN", voltage_kv=0.4)],
        substations=[
            Substation(
                ref_id="st1",
                name="ST-1",
                station_type="mv_lv",
                bus_refs=["bus-nn"],
                meta={"nn_field_specs": [field_spec]},
            )
        ],
        loads=[
            Load(
                ref_id="ld1",
                name="Odbiór 1",
                bus_ref="bus-nn",
                p_mw=0.01,
                q_mvar=0.0,
                meta={"feeder_ref": "nn/legacy/outgoing-1"},
            )
        ],
    )


# ---------------------------------------------------------------------------
# Migracja bezpośrednio (jednostkowo, jak test_punkt_przylaczenia_der.py)
# ---------------------------------------------------------------------------


def test_wymaga_migracji_true_dla_niepromowanego_wpisu() -> None:
    assert wymaga_migracji(_stary_model()) is True


def test_wymaga_migracji_false_dla_modelu_bez_nn_field_specs() -> None:
    pusty = EnergyNetworkModel(header=ENMHeader(name="pusty", defaults=ENMDefaults()))
    assert wymaga_migracji(pusty) is False


def test_migracja_tworzy_realny_aparat_i_szyne_odplywu() -> None:
    stary = _stary_model()
    zmigrowany, zmieniono = migruj(stary)

    assert zmieniono is True
    assert len(zmigrowany.branches) == 1
    aparat = zmigrowany.branches[0]
    assert aparat.type == "breaker"
    assert aparat.from_bus_ref == "bus-nn"
    assert aparat.to_bus_ref != "bus-nn"
    assert aparat.meta[META_KLUCZ_GALAZ_ZRODLO_FIELD_REF] == "nn/legacy/outgoing-1"
    assert aparat.meta[META_KLUCZ_GALAZ_ROLA_POLA] == "FEEDER"
    # Brak wiązania w danych historycznych -> znacznik dla walidatora (W061 zamiast E061).
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert aparat.catalog_ref is None

    nowa_szyna_ref = aparat.to_bus_ref
    assert any(b.ref_id == nowa_szyna_ref for b in zmigrowany.buses)

    # LV-INV-12: odbiór PRZENIESIONY z szyny stacji na szynę odpływu.
    assert zmigrowany.loads[0].bus_ref == nowa_szyna_ref

    # `nn_field_specs` NIE jest kasowany — zostaje projekcją odczytu.
    assert (
        zmigrowany.substations[0].meta["nn_field_specs"]
        == stary.substations[0].meta["nn_field_specs"]
    )
    assert zmigrowany.substations[0].meta[META_KLUCZ_STACJA_PROMOWANA] is True


def test_migracja_materializuje_wiazanie_katalogowe_gdy_jest() -> None:
    stary = _stary_model(z_wiazaniem=True)
    zmigrowany, zmieniono = migruj(stary)

    assert zmieniono is True
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref == REF_APARAT_NN
    assert aparat.catalog_namespace == "APARAT_NN"
    assert aparat.source_mode == "KATALOG"
    assert aparat.materialized_params is not None
    assert aparat.materialized_params["catalog_item_id"] == REF_APARAT_NN
    assert META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA not in aparat.meta


def test_migracja_z_nieistniejaca_pozycja_katalogowa_nie_wywala_migracji() -> None:
    """Dane historyczne mogą wskazywać pozycję, której już nie ma — migracja nie ma prawa runąć."""
    stary = _stary_model(z_wiazaniem=True)
    stary.substations[0].meta["nn_field_specs"][0]["meta"]["catalog_binding"][
        "catalog_item_id"
    ] = "nieistnieje-w-katalogu"
    zmigrowany, zmieniono = migruj(stary)

    assert zmieniono is True
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True


def test_migracja_jest_idempotentna() -> None:
    stary = _stary_model()
    raz, _ = migruj(stary)
    dwa, zmieniono_drugi_raz = migruj(raz)

    assert zmieniono_drugi_raz is False
    assert dwa is raz, "brak zmian musi zwrócić TEN SAM obiekt (bez podbicia rewizji)"
    assert wymaga_migracji(raz) is False


def test_migracja_jest_idempotentna_per_wpis_nie_per_stacja() -> None:
    """Znacznik stacji jest INFORMACYJNY — nowy wpis po promocji nadal się migruje.

    To jest dokładnie ta klasa błędu, którą CLAUDE.md nazywa „reguła KLASA, nie
    INSTANCJA": bramka pilnująca idempotencji PO CAŁEJ stacji (a nie per wpis)
    zostawiłaby drugi, dopisany później wpis `nn_field_specs` NIGDY nie
    promowanym — mimo że stacja formalnie „już przeszła" migrację.
    """
    stary = _stary_model()
    raz, _ = migruj(stary)
    assert raz.substations[0].meta[META_KLUCZ_STACJA_PROMOWANA] is True

    z_nowym_wpisem = raz.model_copy(deep=True)
    z_nowym_wpisem.substations[0].meta["nn_field_specs"].append(
        {
            "field_ref": "nn/legacy/outgoing-2",
            "name": "Odpływ 2",
            "bay_role": "FEEDER",
            "bus_ref": "bus-nn",
            "equipment_refs": [],
            "protection_ref": None,
            "tags": [],
            "meta": {"feeder_role": "ODPLYW_NN"},
        }
    )
    assert wymaga_migracji(z_nowym_wpisem) is True
    dwa, zmieniono = migruj(z_nowym_wpisem)
    assert zmieniono is True
    assert len(dwa.branches) == 2
    nowy_aparat = next(
        b
        for b in dwa.branches
        if b.meta.get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF) == "nn/legacy/outgoing-2"
    )
    assert nowy_aparat.from_bus_ref == "bus-nn"


def test_migracja_pomija_wpis_osierocony_bez_awarii() -> None:
    """Wpis wskazujący nieistniejącą szynę stacji — pomijamy, nie crashujemy migracji."""
    stary = _stary_model()
    stary.substations[0].meta["nn_field_specs"][0]["bus_ref"] = "szyna-widmo"
    zmigrowany, zmieniono = migruj(stary)
    assert zmieniono is False
    assert zmigrowany is stary


def test_model_bez_wpisow_nie_jest_ruszany() -> None:
    pusty = EnergyNetworkModel(header=ENMHeader(name="pusty", defaults=ENMDefaults()))
    zmigrowany, zmieniono = migruj(pusty)
    assert zmieniono is False
    assert zmigrowany is pusty


# ---------------------------------------------------------------------------
# Migracja WPIĘTA w enm/store.py::get_enm (automatyczna, przy odczycie)
# ---------------------------------------------------------------------------


def test_get_enm_promuje_automatycznie_i_podbija_rewizje_raz() -> None:
    case_id = "case-promocja-1"
    stary = _stary_model()
    zapisany = set_enm(case_id, stary)
    rewizja_przed = zapisany.header.revision
    hash_przed = zapisany.header.hash_sha256

    odczytany = get_enm(case_id)

    assert odczytany.header.revision == rewizja_przed + 1
    assert odczytany.header.hash_sha256 != hash_przed
    assert len(odczytany.branches) == 1
    assert odczytany.substations[0].meta[META_KLUCZ_STACJA_PROMOWANA] is True

    # Drugi odczyt: ŻADNEJ kolejnej zmiany rewizji (migracja per wpis, wpis już promowany).
    rewizja_po_pierwszym = odczytany.header.revision
    hash_po_pierwszym = odczytany.header.hash_sha256
    odczytany_ponownie = get_enm(case_id)
    assert odczytany_ponownie.header.revision == rewizja_po_pierwszym
    assert odczytany_ponownie.header.hash_sha256 == hash_po_pierwszym


def test_get_enm_bez_nn_field_specs_nie_podbija_rewizji() -> None:
    case_id = "case-bez-promocji"
    czysty = EnergyNetworkModel(
        header=ENMHeader(name="czysty", defaults=ENMDefaults()),
        buses=[Bus(ref_id="b0", name="b0", voltage_kv=0.4)],
    )
    zapisany = set_enm(case_id, czysty)
    rewizja_przed = zapisany.header.revision

    odczytany = get_enm(case_id)
    assert odczytany.header.revision == rewizja_przed


def test_add_nn_load_po_promocji_wpina_odbior_za_aparatem() -> None:
    """§0 pkt 5 karty P0.1: add_nn_load po migracji NIE wiesza odbioru wprost na szynie stacji."""
    case_id = "case-add-load-po-promocji"
    set_enm(case_id, _stary_model())
    promowany = get_enm(case_id)
    snap = promowany.model_dump(mode="json")

    wynik = execute_domain_operation(
        snap,
        "add_nn_load",
        {
            "feeder_ref": "nn/legacy/outgoing-1",
            "active_power_kw": 5.0,
            "load_name": "Nowy odbiór",
            # cos_phi jawny: `add_nn_load` wymaga rozstrzygalnej mocy biernej
            # (FAB-D1 D5) — ten test sprawdza promocję pola, nie moc bierną.
            "cos_phi": 0.9,
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    nowy = wynik["snapshot"]["loads"][-1]
    aparat = next(
        b
        for b in wynik["snapshot"]["branches"]
        if b.get("meta", {}).get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF) == "nn/legacy/outgoing-1"
    )
    assert nowy["bus_ref"] == aparat["to_bus_ref"]
    assert nowy["bus_ref"] != "bus-nn"


def test_walidator_po_promocji_ma_najwyzej_ostrzezenie_nie_blocker_katalogowy() -> None:
    """Gałąź z migracji bez wiązania -> W061 (WARNING), nie E061 (BLOCKER)."""
    case_id = "case-walidator-po-promocji"
    set_enm(case_id, _stary_model())
    promowany = get_enm(case_id)

    wynik = ENMValidator().validate(promowany)
    kody = {i.code for i in wynik.issues}
    assert "E061" not in kody
    assert "W061" in kody


def test_walidator_po_promocji_z_wiazaniem_nie_ma_ani_e061_ani_w061() -> None:
    case_id = "case-walidator-po-promocji-z-wiazaniem"
    set_enm(case_id, _stary_model(z_wiazaniem=True))
    promowany = get_enm(case_id)

    wynik = ENMValidator().validate(promowany)
    kody = {i.code for i in wynik.issues}
    assert "E061" not in kody
    assert "W061" not in kody


# ---------------------------------------------------------------------------
# Regresja #472 / karta CI-D: DWA ŹRÓDŁA gotowości muszą się zgadzać (predykaty
# parami, CLAUDE.md reguła KLASA NIE INSTANCJA). `/api/cases/{id}/engineering-
# readiness` liczy WYŁĄCZNIE `ENMValidator` (testy wyżej: W061, nie E061).
# Odpowiedź operacji domenowej `refresh_snapshot` — JEDYNE źródło
# `useSnapshotStore.readiness` we froncie, czyli chip powłoki „Model: …" (H-6,
# `ui2/shell/shellStatus.ts`) — ma WŁASNY, odrębny domenowy check "łącznik bez
# catalog_ref = BLOKER" (`domain_operations._build_readiness`), który NIE znał
# znacznika migracji `nn_promocja_bez_wiazania_katalogowej` i dokładał DRUGI,
# sprzeczny blocker dla TEJ SAMEJ gałęzi, którą walidator już poprawnie liczył
# jako ostrzeżenie. Efekt zmierzony w e2e: `/engineering-readiness` mówiła
# `ready: true`, chrom mówił „Model: w budowie" (`stany-zerowe-akcje.spec.ts`
# H-6, `gotowosc-po-biegu.spec.ts`, `restart-po-biegu.spec.ts` i inne specy
# budujące sieć wzorcem `insert_station_on_segment_sn` + strona nN stacji).
# ---------------------------------------------------------------------------


def test_gotowosc_operacji_domenowej_po_promocji_bez_wiazania_nie_ma_blokera_lacznika() -> None:
    """Odpowiedź `refresh_snapshot` (chip H-6) zgadza się z ENMValidator: W061, nie BLOKER."""
    case_id = "case-gotowosc-domenowa-po-promocji"
    set_enm(case_id, _stary_model())
    promowany = get_enm(case_id)
    snap = promowany.model_dump(mode="json")

    wynik = execute_domain_operation(snap, "refresh_snapshot", {})
    assert not wynik.get("error"), wynik.get("error")
    readiness = wynik["readiness"]

    kody_blokad = {b["code"] for b in readiness["blockers"]}
    kody_ostrzezen = {w["code"] for w in readiness["warnings"]}
    assert "switch.catalog_ref_missing" not in kody_blokad
    assert "W061" in kody_ostrzezen


def test_gotowosc_operacji_domenowej_recznego_lacznika_bez_katalogu_nadal_blokuje() -> None:
    """Kontrola graniczna (iloczyn cech): wyjątek migracji NIE zwalnia RĘCZNIE

    utworzonego łącznika (poza automigracją) bez wiązania katalogowego — inaczej
    naprawa regresji #472 poszłaby ZA SZEROKO i ukryłaby realny brak danych
    katalogowych, którego walidator też nie zna (bez znacznika migracji trafia
    w E009/`catalog.binding_missing`, a domenowy check ma to wykryć niezależnie).
    """
    case_id = "case-gotowosc-domenowa-lacznik-reczny"
    reczny = EnergyNetworkModel(
        header=ENMHeader(name="reczny", defaults=ENMDefaults()),
        buses=[
            Bus(ref_id="bus-a", name="Szyna A", voltage_kv=0.4),
            Bus(ref_id="bus-b", name="Szyna B", voltage_kv=0.4),
        ],
        branches=[
            SwitchBranch(
                ref_id="sw-reczny",
                name="Łącznik ręczny",
                type="breaker",
                from_bus_ref="bus-a",
                to_bus_ref="bus-b",
                status="closed",
                catalog_ref=None,
            )
        ],
    )
    set_enm(case_id, reczny)
    snap = get_enm(case_id).model_dump(mode="json")

    wynik = execute_domain_operation(snap, "refresh_snapshot", {})
    assert not wynik.get("error"), wynik.get("error")
    readiness = wynik["readiness"]
    kody_blokad = {b["code"] for b in readiness["blockers"]}
    assert "switch.catalog_ref_missing" in kody_blokad


# ---------------------------------------------------------------------------
# Reguła KLASA (przekazanie P0.1): _field_bus_ref po promocji = szyna odpływu
# dla WSZYSTKICH konsumentów pola — nie tylko add_nn_load. Bez tej pary
# (predykaty parami: _field_station_bus_ref vs _field_bus_ref) pomiar CT/VT
# i kabel startujący z pola trafiałyby w opuszczoną szynę stacji.
# ---------------------------------------------------------------------------


def test_po_promocji_ct_przylacza_sie_do_szyny_odplywu() -> None:
    from enm.domain_operations import execute_domain_operation

    zmigrowany, zmieniono = migruj(_stary_model())
    assert zmieniono is True
    szyna_odplywu = zmigrowany.branches[0].to_bus_ref
    assert szyna_odplywu != "bus-nn"

    wynik = execute_domain_operation(
        zmigrowany.model_dump(mode="json"),
        "add_ct",
        {
            "field_ref": "nn/legacy/outgoing-1",
            "catalog_ref": "ct_400_5_5p20_15va_abb",
            "ratio_primary_a": 400.0,
            "ratio_secondary_a": 5.0,
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    pomiary = wynik["snapshot"].get("measurements", [])
    assert len(pomiary) == 1
    # Sedno klasy: pomiar NA szynie odpływu (za aparatem), nie na szynie stacji.
    assert pomiary[0]["bus_ref"] == szyna_odplywu
