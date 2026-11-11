"""P0.1 nN — automigracja promocji pól nN → realne elementy (karta P0.1, C §4.2; karta W5-B).

Sprawdzamy to, na czym zależy projektantowi: pole nN (rekord `bays` na szynie nN — karta
W5-B: jedyny nośnik pól; poziom z napięcia szyny, `enm.pola.czy_pole_nn`) bez aparatu
dostaje po wczytaniu REALNY `SwitchBranch` (aparat) + szynę odpływu — solver i SLD czytają
odtąd JEDEN graf (LV-INV-12), a rekord pola niesie swój aparat (`equipment_refs`) i zacisk
(`terminal_bus_ref` = szyna odpływu) tak jak pole SN z aparatem w torze. Migracja jest
idempotentna (per pole, nie per stacja — patrz docstring modułu) i podnosi rewizję modelu
DOKŁADNIE RAZ.

Dawny test promocji aparatu pola nN z dawnego słownika `meta` stacji (8 przypadków
wołających nieistniejącą funkcję `_materializuj_aparat`) skasowany w karcie W5-B; jego
intencja — {odmowa danych pozycji spoza katalogu bez wyjątku, brak wiązania = brak
materializacji, błąd programu wybucha} — jest przypięta testami niżej, na realnej ścieżce
wiązania (`assign_catalog_to_element`).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.migrations.promocja_aparatow_nn import (
    META_KLUCZ_GALAZ_ROLA_POLA,
    META_KLUCZ_GALAZ_ZRODLO_FIELD_REF,
    META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA,
    META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA,
    META_KLUCZ_STACJA_PROMOWANA,
    migruj,
    wymaga_migracji,
)
from enm.models import (
    Bay,
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


def _pole_nn(ref: str, nazwa: str, **dane: Any) -> Bay:
    """Rekord pola odpływowego nN na szynie nN stacji `st1` (bez aparatu)."""
    return Bay(
        ref_id=ref,
        name=nazwa,
        bay_role="FEEDER",
        substation_ref="st1",
        bus_ref=dane.pop("bus_ref", "bus-nn"),
        meta={"feeder_role": "ODPLYW_NN", **dane.pop("meta", {})},
        **dane,
    )


def _stary_model(*, z_wiazaniem: bool = False) -> EnergyNetworkModel:
    """Model „sprzed P0.1": pole odpływowe nN bez aparatu (rekord `bays` na szynie nN) +
    odbiór na szynie stacji."""
    meta: dict[str, Any] = {}
    if z_wiazaniem:
        meta["catalog_binding"] = {"catalog_item_id": REF_APARAT_NN}

    return EnergyNetworkModel(
        header=ENMHeader(name="stary", defaults=ENMDefaults()),
        buses=[Bus(ref_id="bus-nn", name="Szyna nN", voltage_kv=0.4)],
        substations=[
            Substation(ref_id="st1", name="ST-1", station_type="mv_lv", bus_refs=["bus-nn"])
        ],
        bays=[_pole_nn("nn/legacy/outgoing-1", "Odpływ 1", meta=meta)],
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


def _pole(model: EnergyNetworkModel, ref: str = "nn/legacy/outgoing-1") -> Bay:
    return next(b for b in model.bays if b.ref_id == ref)


# ---------------------------------------------------------------------------
# Migracja bezpośrednio (jednostkowo, jak test_punkt_przylaczenia_der.py)
# ---------------------------------------------------------------------------


def test_wymaga_migracji_true_dla_niepromowanego_wpisu() -> None:
    assert wymaga_migracji(_stary_model()) is True


def test_wymaga_migracji_false_dla_modelu_bez_pol_nn() -> None:
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

    # Karta W5-B: rekord pola niesie swój aparat i zacisk (szyna odpływu) — jedna reguła
    # zacisku pola dla SN i nN (`enm.pola.zacisk_pola`); rekord wejściowy nietknięty.
    pole = _pole(zmigrowany)
    assert pole.equipment_refs == [aparat.ref_id]
    assert pole.terminal_bus_ref == nowa_szyna_ref
    assert pole.bus_ref == "bus-nn"
    assert _pole(stary).equipment_refs == [] and _pole(stary).terminal_bus_ref is None
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
    _pole(stary).meta["catalog_binding"]["catalog_item_id"] = "nieistnieje-w-katalogu"
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
    zostawiłaby drugie, dopisane później pole nN NIGDY nie promowanym — mimo że
    stacja formalnie „już przeszła" migrację.
    """
    stary = _stary_model()
    raz, _ = migruj(stary)
    assert raz.substations[0].meta[META_KLUCZ_STACJA_PROMOWANA] is True

    z_nowym_wpisem = raz.model_copy(deep=True)
    z_nowym_wpisem.bays.append(_pole_nn("nn/legacy/outgoing-2", "Odpływ 2"))
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
    assert _pole(dwa, "nn/legacy/outgoing-2").equipment_refs == [nowy_aparat.ref_id]


def test_migracja_pomija_wpis_osierocony_bez_awarii() -> None:
    """Pole wskazujące nieistniejącą szynę — poziom pola nierozstrzygalny (szyna nieznana =
    NIE nN), pomijamy, nie crashujemy migracji."""
    stary = _stary_model()
    _pole(stary).bus_ref = "szyna-widmo"
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


def test_get_enm_bez_pol_nn_nie_podbija_rewizji() -> None:
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


# ---------------------------------------------------------------------------
# Karta SLD-SUBSTRAT (kontynuacja): migracja wiąże aparat TĄ SAMĄ operacją co
# akcja naprawcza projektanta (`assign_catalog_to_element`). Iloczyn cech:
# nośnik wiązania na polu {meta.catalog_binding, Bay.catalog_bindings} × stan pozycji
# {istniejąca, nieistniejąca, wiązanie nie-aparatu (źródło przekształtnikowe)}.
# ---------------------------------------------------------------------------

_POLA_WIAZANIA = (
    "catalog_ref",
    "catalog_namespace",
    "source_mode",
    "parameter_source",
    "materialized_params",
)


def _model_z_wiazaniem(klucz: str, wiazanie: Any) -> EnergyNetworkModel:
    """Wiązanie zapisane na polu: `meta.catalog_binding` (operacja, import) albo typowane
    `Bay.catalog_bindings` (szablon stacji; karta W5-B — dawne `meta.catalog_bindings`)."""
    stary = _stary_model()
    if klucz == "catalog_bindings":
        _pole(stary).catalog_bindings = wiazanie
    else:
        _pole(stary).meta[klucz] = wiazanie
    return stary


@pytest.mark.parametrize("klucz", ["catalog_binding", "catalog_bindings"])
def test_migracja_wiaze_tak_samo_jak_akcja_naprawcza(klucz: str) -> None:
    zmigrowany, _ = migruj(
        _model_z_wiazaniem(
            klucz, {"catalog_item_id": REF_APARAT_NN, "catalog_item_version": "2024.1"}
        )
    )
    z_migracji = zmigrowany.branches[0].model_dump(mode="json")

    bez_wiazania, _ = migruj(_stary_model())
    naprawa = execute_domain_operation(
        enm_dict=bez_wiazania.model_dump(mode="json"),
        op_name="assign_catalog_to_element",
        payload={
            "element_ref": bez_wiazania.branches[0].ref_id,
            "catalog_binding": {
                "catalog_namespace": "APARAT_NN",
                "catalog_item_id": REF_APARAT_NN,
                "catalog_item_version": "2024.1",
            },
        },
    )
    assert not naprawa.get("error"), naprawa
    z_naprawy = next(
        b for b in naprawa["snapshot"]["branches"] if b["ref_id"] == z_migracji["ref_id"]
    )
    for pole in _POLA_WIAZANIA:
        assert z_migracji[pole] == z_naprawy[pole], pole
    assert z_migracji["meta"] == z_naprawy["meta"]
    assert META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA not in z_migracji["meta"]


@pytest.mark.parametrize("klucz", ["catalog_binding", "catalog_bindings"])
def test_odmowa_wiazania_zostawia_nazwany_brak(klucz: str) -> None:
    zmigrowany, _ = migruj(_model_z_wiazaniem(klucz, {"catalog_item_id": "nieistnieje"}))
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA]


def test_wiazanie_zrodla_przeksztaltnikowego_nie_jest_wiazaniem_aparatu() -> None:
    zmigrowany, _ = migruj(
        _model_z_wiazaniem(
            "catalog_bindings",
            {"source_converter": {"catalog_item_id": "conv-pv-nn-0p5mw-0p4kv"}},
        )
    )
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA not in aparat.meta


def test_akcja_naprawcza_zdejmuje_znacznik_braku_wiazania() -> None:
    zmigrowany, _ = migruj(_stary_model())
    wynik = execute_domain_operation(
        enm_dict=zmigrowany.model_dump(mode="json"),
        op_name="assign_catalog_to_element",
        payload={
            "element_ref": zmigrowany.branches[0].ref_id,
            "catalog_binding": {
                "catalog_namespace": "APARAT_NN",
                "catalog_item_id": REF_APARAT_NN,
                "catalog_item_version": "2024.1",
            },
        },
    )
    aparat = next(
        b for b in wynik["snapshot"]["branches"] if b["ref_id"] == zmigrowany.branches[0].ref_id
    )
    assert aparat["catalog_ref"] == REF_APARAT_NN
    assert META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA not in aparat["meta"]
    kody = {
        i.code
        for i in ENMValidator()
        .validate(EnergyNetworkModel.model_validate(wynik["snapshot"]))
        .issues
    }
    assert "W061" not in kody and "E061" not in kody


def test_w061_nazywa_pole_i_stacje_a_akcja_wskazuje_aparat_i_pole() -> None:
    zmigrowany, _ = migruj(_stary_model())
    aparat = zmigrowany.branches[0]
    w061 = [i for i in ENMValidator().validate(zmigrowany).issues if i.code == "W061"]
    assert len(w061) == 1
    assert "„Odpływ 1”" in w061[0].message_pl and "„ST-1”" in w061[0].message_pl
    assert w061[0].element_refs == [aparat.ref_id]
    assert w061[0].fix_action is not None
    assert w061[0].fix_action.action_type == "SELECT_CATALOG"
    assert w061[0].fix_action.element_ref == aparat.ref_id
    assert w061[0].fix_action.payload_hint == {
        "required": "catalog_ref",
        "catalog_namespace": "APARAT_NN",
        "field_ref": "nn/legacy/outgoing-1",
    }


# ---------------------------------------------------------------------------
# Intencja skasowanego dawnego testu promocji aparatu nN (karta #151) na realnej
# ścieżce wiązania: {odmowa danych, brak wiązania, błąd programu} — iloczyn z nośnikiem.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wiazanie", [None, "napis", {}, {"catalog_item_id": "  "}])
def test_brak_wiazania_to_aparat_bez_materializacji(wiazanie: Any) -> None:
    """Pole bez wskazania pozycji: aparat powstaje BEZ wiązania i z nazwanym brakiem
    (W061), bez kodu odmowy — operacja wiązania nie jest w ogóle wołana."""
    zmigrowany, zmieniono = migruj(_model_z_wiazaniem("catalog_binding", wiazanie))
    assert zmieniono is True
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.materialized_params is None
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    assert META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA not in aparat.meta


@pytest.mark.parametrize("klucz", ["catalog_binding", "catalog_bindings"])
def test_pozycja_spoza_katalogu_to_odmowa_danych_bez_wyjatku(klucz: str) -> None:
    """Odmowa danych (pozycji nie ma w katalogu) nie przerywa migracji wyjątkiem — aparat
    zostaje bez wiązania z kodem odmowy operacji."""
    zmigrowany, zmieniono = migruj(
        _model_z_wiazaniem(klucz, {"catalog_item_id": "aparat-ktorego-nie-ma"})
    )
    assert zmieniono is True
    aparat = zmigrowany.branches[0]
    assert aparat.catalog_ref is None
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA] is True
    # Kod odmowy NAZWANY, czytany wprost z odpowiedzi operacji (bez zapasu spoza rejestru).
    assert aparat.meta[META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] == "catalog.item_not_found"


@pytest.mark.parametrize("typ", [AttributeError, KeyError, TypeError])
def test_blad_programu_wiazania_wybucha(typ: type[Exception], monkeypatch: Any) -> None:
    """Wyjątek operacji wiązania to błąd programu — migracja go NIE połyka (dawne
    `except Exception: return None, None` gubiło wiązanie po cichu)."""
    import enm.domain_operations as operacje

    # Psujemy materializator, z którego czyta operacja akcji naprawczej — wyjątek musi
    # przejść przez `assign_catalog_to_element` i `_przypisz_wiazania` aż do `migruj`.
    # Dowodem jest TOŻSAMOŚĆ rekordu wyjątku (ten sam obiekt, ten sam typ), nie treść
    # komunikatu: przepakowanie w inny wyjątek z tym samym napisem też by „pasowało”.
    wstrzykniety = typ("wyjątek wstrzyknięty do materializatora")

    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise wstrzykniety

    monkeypatch.setattr(operacje, "materialize_catalog_binding", _zepsuty)
    with pytest.raises(typ) as zlapany:
        migruj(_stary_model(z_wiazaniem=True))
    assert type(zlapany.value) is typ
    assert zlapany.value is wstrzykniety


def test_rekord_pola_promowanego_przed_w5b_dostaje_aparat_i_zacisk() -> None:
    """Migawka sprzed karty W5-B: aparat pola istnieje (znacznik gałęzi), rekord pola go nie
    niesie — migracja zapisuje aparat i zacisk na rekordzie (idempotentnie). Iloczyn: {pole
    nN, pole zapisane dawniej jako pole nN, lecz na szynie SN (pole źródła przekształtnika —
    zmierzone na scenach harnessu OZE/LoM)}."""
    for szyna, napiecie in (("bus-nn", 0.4), ("bus-sn", 15.0)):
        aparat = SwitchBranch(
            ref_id="nn/x/feeder_device",
            name="Aparat",
            type="breaker",
            from_bus_ref=szyna,
            to_bus_ref="nn/x/feeder_bus",
            status="closed",
            meta={META_KLUCZ_GALAZ_ZRODLO_FIELD_REF: "pole-1", META_KLUCZ_GALAZ_ROLA_POLA: "OZE"},
        )
        model = EnergyNetworkModel(
            header=ENMHeader(name="dawny", defaults=ENMDefaults()),
            buses=[
                Bus(ref_id=szyna, name="Szyna", voltage_kv=napiecie),
                Bus(ref_id="nn/x/feeder_bus", name="Odpływ", voltage_kv=napiecie),
            ],
            substations=[
                Substation(ref_id="st1", name="ST-1", station_type="mv_lv", bus_refs=[szyna])
            ],
            bays=[
                Bay(
                    ref_id="pole-1",
                    name="Pole",
                    bay_role="OZE",
                    substation_ref="st1",
                    bus_ref=szyna,
                )
            ],
            branches=[aparat],
        )
        assert wymaga_migracji(model) is True
        zmigrowany, zmieniono = migruj(model)
        assert zmieniono is True, szyna
        assert len(zmigrowany.branches) == 1, "pole z aparatem nie dostaje drugiego aparatu"
        pole = _pole(zmigrowany, "pole-1")
        assert pole.equipment_refs == ["nn/x/feeder_device"]
        assert pole.terminal_bus_ref == "nn/x/feeder_bus"
        assert migruj(zmigrowany) == (zmigrowany, False)


# Iloczyn {nazwa pola: nadana, same spacje, pusta} × {nazwa stacji: nadana, same spacje}.
# Rekord `bays` ma nazwę obowiązkową (napis), więc „brak” nazwy to napis pusty.
# Walidator pyta o nazwę moduł nazw (`network_model.nazwy`, zapadka NAZWY-JEDNO-ZRODLO):
# napis z samych spacji nie jest nazwą, więc W061 nie opisuje pola cudzysłowem wokół pustki.
@pytest.mark.parametrize("nazwa_pola", ["Odpływ 1", "   ", ""])
@pytest.mark.parametrize("nazwa_stacji", ["ST-1", "", "   "])
def test_w061_opisuje_pole_tylko_gdy_pole_i_stacja_maja_nazwe(
    nazwa_pola: str, nazwa_stacji: str
) -> None:
    stary = _stary_model()
    stary.substations[0].name = nazwa_stacji
    stary.bays[0].name = nazwa_pola
    zmigrowany, _ = migruj(stary)
    w061 = [i for i in ENMValidator().validate(zmigrowany).issues if i.code == "W061"]
    assert len(w061) == 1
    opisuje = nazwa_pola == "Odpływ 1" and nazwa_stacji == "ST-1"
    assert (" — pole „" in w061[0].message_pl) is opisuje
    assert "„   ”" not in w061[0].message_pl and "„”" not in w061[0].message_pl
    if opisuje:
        assert "„Odpływ 1”" in w061[0].message_pl and "„ST-1”" in w061[0].message_pl
