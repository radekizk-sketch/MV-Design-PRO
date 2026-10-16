"""Testy serwisu weryfikacji ochrony przed pracą wyspową (LoM, D10).

Zakres: obecność funkcji LoM przy module wytwórczym, okna normatywne (81R/81U/81O),
uczciwy INFO dla 78 (brak okna), koordynacja z SPZ (werdykty deterministyczne),
determinizm hash, walidacja wstecz ENM oraz regresja sanity 81R.
"""

from __future__ import annotations

import json

import pytest
from application.analyses.ochrona_lom import _spz_verdict, build_ochrona_lom_view
from enm.migrations.field_specs_promocja import (
    KLUCZ_FIELD_SPECS as KLUCZ_SN,
)
from enm.migrations.field_specs_promocja import (
    KLUCZ_NN_FIELD_SPECS as KLUCZ_NN,
)
from enm.migrations.field_specs_promocja import BladMigracjiPol
from enm.migrations.field_specs_promocja import migruj as migruj_pola
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    ProtectionAssignment,
    ProtectionSetting,
    Substation,
)


def _enm(
    *,
    bays: list[Bay],
    generators: list[Generator],
    protection_assignments: list[ProtectionAssignment],
    buses: list[Bus] | None = None,
) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="LoM test", hash_sha256="hash-lom-test"),
        buses=buses or [Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15.0)],
        generators=generators,
        bays=bays,
        protection_assignments=protection_assignments,
    )


def _generator(ref: str = "gen_pv", bus: str = "bus_oze") -> Generator:
    return Generator(ref_id=ref, name="PV", bus_ref=bus, p_mw=2.0, gen_type="pv_inverter")


def _bay(
    ref: str = "bay_oze",
    bus: str = "bus_oze",
    protection_ref: str | None = "prot_lom",
    protection_codes: list[str] | None = None,
) -> Bay:
    return Bay(
        ref_id=ref,
        name="Pole OZE",
        bay_role="OZE",
        substation_ref="stac_1",
        bus_ref=bus,
        protection_ref=protection_ref,
        protection_codes=protection_codes or [],
    )


def _assignment(settings: list[ProtectionSetting], ref: str = "prot_lom") -> ProtectionAssignment:
    return ProtectionAssignment(
        ref_id=ref,
        name="Zabezpieczenie LoM",
        breaker_ref="cb_1",
        device_type="custom",
        settings=settings,
    )


def _field_status(view: dict, bay_ref: str = "bay_oze") -> str:
    for field in view["fields"]:
        if field["bay_ref"] == bay_ref:
            return field["status"]
    raise AssertionError(f"Brak pola {bay_ref} w widoku")


def _checks(view: dict, bay_ref: str = "bay_oze") -> list[dict]:
    for field in view["fields"]:
        if field["bay_ref"] == bay_ref:
            return field["checks"]
    raise AssertionError(f"Brak pola {bay_ref} w widoku")


# ---------------------------------------------------------------------------
# Obecność funkcji LoM
# ---------------------------------------------------------------------------


def test_module_without_lom_is_error() -> None:
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([])],
    )
    view = build_ochrona_lom_view(enm)
    presence = [c for c in _checks(view) if c["kind"] == "obecnosc"]
    assert presence and presence[0]["severity"] == "ERROR"
    # Intencja zachowana: pole bez funkcji LoM jest wykazane (porównanie ERROR, rekord z wynikiem
    # logicznym 0). Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): status pola to status
    # rekordu werdyktu — podstawa wymagania LoM (IRiESD) ma stan NIEUSTALONE, więc reguła K daje
    # BRAK_PODSTAWY zamiast „ERROR" ze słownika modułu.
    assert _field_status(view) == "BRAK_PODSTAWY"
    rekord = presence[0]["ocena"]
    assert rekord["wynik"]["wartosc"]["wartosc"] == 0.0
    assert rekord["status_maszynowy"] == "BRAK_PODSTAWY"


def test_declared_code_without_settings_is_info() -> None:
    bay = _bay(protection_ref="prot_lom", protection_codes=["81R"])
    enm = _enm(
        bays=[bay],
        generators=[_generator()],
        protection_assignments=[_assignment([])],
    )
    view = build_ochrona_lom_view(enm)
    info = [c for c in _checks(view) if c["function_ansi"] == "81R" and c["kind"] == "obecnosc"]
    assert info and info[0]["severity"] == "INFO"
    assert "bez nastaw" in info[0]["message_pl"]


# ---------------------------------------------------------------------------
# Okna normatywne
# ---------------------------------------------------------------------------


def test_rocof_within_window_is_ok() -> None:
    setting = ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5, time_delay_s=0.1)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    rocof = [c for c in _checks(view) if c["function_ansi"] == "81R"][0]
    assert rocof["severity"] == "OK"
    assert rocof["source_pl"] and "NC RfG" in rocof["source_pl"]


def test_rocof_below_window_is_warn_false_island() -> None:
    setting = ProtectionSetting(function_type="rocof_81R", threshold_hz_s=1.0)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    rocof = [c for c in _checks(view) if c["function_ansi"] == "81R"][0]
    assert rocof["severity"] == "WARN"
    assert "fałszywe wykrycie pracy wyspowej" in rocof["message_pl"]


def test_underfrequency_above_window_is_warn() -> None:
    setting = ProtectionSetting(function_type="underfrequency_81U", threshold_hz=48.0)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    u = [c for c in _checks(view) if c["function_ansi"] == "81U"][0]
    assert u["severity"] == "WARN"


def test_underfrequency_within_window_is_ok() -> None:
    setting = ProtectionSetting(function_type="underfrequency_81U", threshold_hz=47.5)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    u = [c for c in _checks(view) if c["function_ansi"] == "81U"][0]
    assert u["severity"] == "OK"


def test_overfrequency_below_window_is_warn() -> None:
    setting = ProtectionSetting(function_type="overfrequency_81O", threshold_hz=51.0)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    o = [c for c in _checks(view) if c["function_ansi"] == "81O"][0]
    assert o["severity"] == "WARN"


def test_vector_shift_has_no_window_and_is_info() -> None:
    setting = ProtectionSetting(function_type="vector_shift_78", threshold_deg=8.0)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    vs = [c for c in _checks(view) if c["function_ansi"] == "78"][0]
    assert vs["severity"] == "INFO"
    assert vs["window"] is None
    assert vs["source_pl"] is None
    assert view["normative_sources"]["vector_shift_78"]["window_pl"] is None


# ---------------------------------------------------------------------------
# Koordynacja z SPZ — czyste werdykty
# ---------------------------------------------------------------------------


def test_spz_verdict_lom_slower_than_spz_is_error() -> None:
    v = _spz_verdict(0.5, 0.3, None)
    assert v.severity == "ERROR"
    assert "ryzyko załączenia na pracującą wyspę" in v.message_pl


def test_spz_verdict_lom_faster_than_spz_is_ok() -> None:
    v = _spz_verdict(0.1, 0.3, 0.5)
    assert v.severity == "OK"
    assert "przed ponownym załączeniem SPZ" in v.message_pl


def test_spz_verdict_no_spz_state_is_info() -> None:
    v = _spz_verdict(0.5, None, None)
    assert v.severity == "INFO"


def test_spz_verdict_no_lom_time_is_info() -> None:
    v = _spz_verdict(None, 0.3, 0.5)
    assert v.severity == "INFO"


def test_spz_coordination_in_full_view_is_info() -> None:
    setting = ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5, time_delay_s=0.2)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    spz = [c for c in _checks(view) if c["kind"] == "koordynacja_spz"][0]
    assert spz["severity"] == "INFO"
    assert spz["value"] == 0.2


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


def test_deterministic_hash_and_field_order() -> None:
    settings = [ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5)]

    def build() -> dict:
        enm = _enm(
            bays=[_bay("bay_b", "bus_oze"), _bay("bay_a", "bus_oze")],
            generators=[_generator()],
            protection_assignments=[_assignment(settings)],
        )
        return build_ochrona_lom_view(enm)

    view1 = build()
    view2 = build()
    assert view1["input_hash"] == view2["input_hash"]
    assert json.dumps(view1, sort_keys=True) == json.dumps(view2, sort_keys=True)
    assert [f["bay_ref"] for f in view1["fields"]] == ["bay_a", "bay_b"]


def test_module_without_field_is_reported() -> None:
    # Generator na szynie bez pola przyłączeniowego.
    enm = _enm(
        bays=[],
        generators=[_generator(ref="gen_lonely", bus="bus_no_bay")],
        protection_assignments=[],
        buses=[Bus(ref_id="bus_no_bay", name="Szyna bez pola", voltage_kv=15.0)],
    )
    view = build_ochrona_lom_view(enm)
    assert view["modules_without_field"] == ["gen_lonely"]
    # Intencja zachowana: moduł bez pola nie daje oceny poprawnej całości. Zmiana kanonu
    # (2026-09-23): całość to rekord wymagania sieci — moduł bez pola wnosi rekord oceny
    # niewykonanej, więc wymaganie sieci jest NIE_OCENIONO (dawniej „INFO" ze słownika modułu).
    assert view["summary"]["ocena"]["status_maszynowy"] == "NIE_OCENIONO"


# ---------------------------------------------------------------------------
# Walidacja wstecz + nowe literały
# ---------------------------------------------------------------------------


def test_legacy_protection_setting_still_validates() -> None:
    # Stary dokument ENM bez nowych pól — parsuje się bez zmian.
    legacy = ProtectionSetting.model_validate(
        {"function_type": "overcurrent_51", "threshold_a": 500.0, "time_delay_s": 0.4}
    )
    assert legacy.threshold_hz_s is None
    assert legacy.threshold_deg is None
    assert legacy.threshold_hz is None


def test_new_lom_function_literals_validate() -> None:
    for function_type in (
        "rocof_81R",
        "vector_shift_78",
        "underfrequency_81U",
        "overfrequency_81O",
    ):
        setting = ProtectionSetting.model_validate({"function_type": function_type})
        assert setting.function_type == function_type


def test_invalid_function_type_rejected() -> None:
    with pytest.raises(Exception):
        ProtectionSetting.model_validate({"function_type": "not_a_function"})


# ---------------------------------------------------------------------------
# Regresja sanity 81R (niezmienione)
# ---------------------------------------------------------------------------


def test_sanity_rocof_rule_unchanged() -> None:
    from application.analyses.protection.base_values.models import (
        BaseValues,
        BaseValueSourceIn,
        BaseValueSourceUn,
        ProtectionSetpoint,
        ProtectionSetpointBasis,
        ProtectionSetpointOperator,
    )
    from application.analyses.protection.sanity_checks import SanityCheckCode
    from application.analyses.protection.sanity_checks.rules import (
        ElementContext,
        ProtectionFunctionSummary,
        check_rocof_rules,
    )

    setpoint = ProtectionSetpoint(
        basis=ProtectionSetpointBasis.ABS,
        operator=ProtectionSetpointOperator.GT,
        abs_value=15.0,
        unit="Hz/s",
        display_pl="15 Hz/s",
    )
    fn = ProtectionFunctionSummary(code="ROCOF", ansi=("81R",), label_pl="ROCOF", setpoint=setpoint)
    base = BaseValues(
        un_kv=15.0,
        in_a=503.0,
        source_un=BaseValueSourceUn.BUS,
        source_in=BaseValueSourceIn.LINE,
    )
    results = check_rocof_rules([fn], base, ElementContext(element_id="e1", element_type="LINE"))
    assert any(r.code == SanityCheckCode.ROCOF_TOO_HIGH for r in results)


# ---------------------------------------------------------------------------
# Wywod dyplomowy per porownanie (zasada wywodow KaTeX 2026-07-22)
# ---------------------------------------------------------------------------


def test_rocof_wywod_has_formula_substitution_and_verdict() -> None:
    setting = ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5, time_delay_s=0.1)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    rocof = [c for c in _checks(view) if c["function_ansi"] == "81R"][0]
    kroki = rocof["wywod"]
    # Struktura dyplomowa: wzor -> dane -> podstawienie -> werdykt.
    assert len(kroki) == 4
    assert all(set(k) == {"tekst", "latex"} for k in kroki)
    # Wzor ogolny (LaTeX) z krawedzia okna.
    assert kroki[0]["latex"] is not None and r"\ge 2.0" in kroki[0]["latex"]
    # Krok danych tekstowy (latex=None).
    # Karta #145: liczba w zdaniu dla projektanta z przecinkiem dziesiętnym.
    assert kroki[1]["latex"] is None and "2,5000" in kroki[1]["tekst"]
    # Podstawienie liczbowe (LaTeX) z realnej nastawy.
    assert kroki[2]["latex"] is not None
    assert "2.5000" in kroki[2]["latex"] and r"\ge 2.0" in kroki[2]["latex"]
    # Wynik porównania tekstowy (zmiana kanonu 2026-09-23: ocenę niesie rekord porównania,
    # ostatni krok śladu nie jest werdyktem — intencja zachowana: krok kończy wywód).
    assert kroki[3]["latex"] is None and kroki[3]["tekst"].startswith("Wynik porównania: w oknie")


def test_rocof_below_window_wywod_uses_opposite_sign() -> None:
    setting = ProtectionSetting(function_type="rocof_81R", threshold_hz_s=1.0)
    enm = _enm(
        bays=[_bay()],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    rocof = [c for c in _checks(view) if c["function_ansi"] == "81R"][0]
    kroki = rocof["wywod"]
    assert "1.0000 < 2.0" in kroki[2]["latex"]
    assert "warunek niespełniony" in kroki[2]["tekst"]
    assert kroki[3]["tekst"].startswith("Wynik porównania: poza oknem")


def test_wywod_empty_when_no_real_comparison() -> None:
    # Pole bez funkcji (obecnosc), funkcja zadeklarowana bez nastaw, 78 bez okna,
    # SPZ bez danych — wszystkie bez wywodu (uczciwy brak, ZERO fabrykacji).
    setting = ProtectionSetting(function_type="vector_shift_78", threshold_deg=10.0)
    enm = _enm(
        bays=[_bay(protection_codes=["81U"])],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    for check in _checks(view):
        if check["kind"] == "okno_normatywne" and check["function_ansi"] == "78":
            assert check["wywod"] == []
        if check["kind"] in ("obecnosc", "koordynacja_spz"):
            assert check["wywod"] == []


def test_wywod_deterministic_two_builds_identical() -> None:
    def _view() -> dict:
        setting = ProtectionSetting(
            function_type="underfrequency_81U", threshold_hz=47.0, time_delay_s=0.2
        )
        enm = _enm(
            bays=[_bay()],
            generators=[_generator()],
            protection_assignments=[_assignment([setting])],
        )
        return build_ochrona_lom_view(enm)

    w1 = [c["wywod"] for c in _checks(_view())]
    w2 = [c["wywod"] for c in _checks(_view())]
    assert json.dumps(w1, sort_keys=True) == json.dumps(w2, sort_keys=True)


# ---------------------------------------------------------------------------
# Pola z rekordów `bays` — jedyny nośnik pól (karta W5-B)
# ---------------------------------------------------------------------------


def _wpis_pola_archiwum(
    field_ref: str = "stn/1/sn_field/001",
    bus_ref: str = "bus_oze",
    bay_role: str = "OUT",
    protection_ref: str | None = "prot_lom",
) -> dict:
    """Dawny wpis pola z archiwum (sprzed karty W5-B) — tak zapisywały go operacje
    domenowe w `Substation.meta` stacji."""
    return {
        "field_ref": field_ref,
        "name": "Pole liniowe wyjściowe 2",
        "bay_role": bay_role,
        "bus_ref": bus_ref,
        "equipment_refs": ["cb_1"],
        "protection_ref": protection_ref,
        "tags": [],
        "meta": {"field_role": "LINIA_OUT"},
    }


def _enm_z_archiwum(
    wpisy: list[dict],
    *,
    klucz_archiwum: str = KLUCZ_SN,
    protection_assignments: list[ProtectionAssignment] | None = None,
    bays: list[Bay] | None = None,
) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="LoM pola z archiwum", hash_sha256="hash-lom-pola"),
        buses=[Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15.0)],
        generators=[_generator()],
        bays=bays or [],
        substations=[
            Substation(
                ref_id="stn/1/station",
                name="Stacja",
                station_type="mv_lv",
                bus_refs=["bus_oze"],
                meta={klucz_archiwum: wpisy},
            )
        ],
        protection_assignments=protection_assignments or [],
    )


@pytest.mark.parametrize("klucz", [KLUCZ_SN, KLUCZ_NN])
def test_pole_z_archiwum_po_migracji_jest_oceniane(klucz: str) -> None:
    """Pole zapisane dawnym wpisem stacji MUSI być oceniane — po migracji wejścia do
    rekordu `bays` (karta W5-B), nie drugą projekcją wpisu w ocenie LoM.

    Intencja zachowana (defekt 2026-09-17: ocena czytała wyłącznie `bays`, a operacje
    pisały wpisy `meta` — zero ocenionych pól). Po W5-B operacje i migracja piszą rekord
    `bays`, a ocena czyta wyłącznie go; iloczyn obu dawnych kluczy wpisu."""
    setting = ProtectionSetting(function_type="rocof_81R", threshold_hz_s=1.0, time_delay_s=0.2)
    archiwum = _enm_z_archiwum(
        [_wpis_pola_archiwum()],
        klucz_archiwum=klucz,
        protection_assignments=[_assignment([setting])],
    )
    enm, zmieniono = migruj_pola(archiwum)
    assert zmieniono
    view = build_ochrona_lom_view(enm)
    assert view["modules_without_field"] == []
    assert [pole["bay_ref"] for pole in view["fields"]] == ["stn/1/sn_field/001"]
    rocof = [c for c in _checks(view, "stn/1/sn_field/001") if c["function_ansi"] == "81R"]
    assert rocof and rocof[0]["severity"] == "WARN"


def test_pole_liczy_sie_raz_bo_rekord_pola_jest_jedynym_nosnikiem() -> None:
    """Jedno pole = jeden rekord `bays` — widok nie ma drugiego kanału, z którego pole
    mogłoby przyjść drugi raz (dawniej: `bays` + wpis `meta` o tej samej referencji).
    Migracja wpisu o referencji istniejącego rekordu bez `bay_ref` odmawia nazwanym błędem
    zamiast zgadywać, który z dwóch jest prawdą."""
    setting = ProtectionSetting(function_type="rocof_81R", threshold_hz_s=3.0)
    enm = _enm(
        bays=[_bay(ref="bay_oze")],
        generators=[_generator()],
        protection_assignments=[_assignment([setting])],
    )
    view = build_ochrona_lom_view(enm)
    assert [pole["bay_ref"] for pole in view["fields"]] == ["bay_oze"]
    assert view["summary"]["fields_total"] == 1
    with pytest.raises(BladMigracjiPol):
        migruj_pola(
            _enm_z_archiwum([_wpis_pola_archiwum(field_ref="bay_oze")], bays=[_bay(ref="bay_oze")])
        )


@pytest.mark.parametrize(
    "wpis",
    [
        {"field_ref": "bez_szyny", "bay_role": "OUT"},
        {"bus_ref": "bus_oze", "bay_role": "OUT"},
        _wpis_pola_archiwum(field_ref="zla_rola", bay_role="NIEZNANA"),
    ],
    ids=["bez-szyny", "bez-referencji", "rola-spoza-kontraktu"],
)
def test_wpis_bez_tozsamosci_pola_to_nazwana_odmowa_migracji(wpis: dict) -> None:
    """Wpis bez referencji, szyny albo roli z kontraktu NIE staje się polem po cichu:
    migracja odmawia nazwanym błędem (bez zgadywania roli albo szyny), a ocena LoM modelu
    bez pola zgłasza wytwórcę uczciwie jako moduł BEZ pola przyłączeniowego."""
    with pytest.raises(ValueError):
        migruj_pola(_enm_z_archiwum([wpis]))
    view = build_ochrona_lom_view(
        _enm(bays=[], generators=[_generator()], protection_assignments=[])
    )
    assert view["fields"] == []
    assert view["modules_without_field"] == ["gen_pv"]


@pytest.mark.parametrize("wytworca_na_zacisku", [True, False])
@pytest.mark.parametrize("rola_pola_obok", ["IN", "OUT", "TR", "FEEDER"])
def test_modul_nalezy_do_pola_w_punkcie_przylaczenia(
    wytworca_na_zacisku: bool, rola_pola_obok: str
) -> None:
    """Karta W5-B (POLA-W-TORZE w ocenie LoM): moduł wytwórczy należy do pola, w którego
    PUNKCIE PRZYŁĄCZENIA stoi — własny zacisk za aparatem pola, a bez zacisku szyna pola
    (`enm.pola.punkt_przylaczenia_pola`). Iloczyn: {wytwórca na zacisku pola źródłowego, na
    szynie} × {inne pole stojące na tej samej szynie stacji}. Pole obok (wejściowe, wyjściowe,
    transformatorowe, odpływowe) nigdy nie przypisuje sobie cudzego modułu, a pole źródłowe
    z zaciskiem nie gubi swojego."""
    zacisk = "bus_oze_zacisk"
    pole_zrodlowe = _bay(ref="bay_oze").model_copy(
        update={"terminal_bus_ref": zacisk if wytworca_na_zacisku else None}
    )
    pole_obok = Bay(
        ref_id="bay_obok",
        name="Pole obok",
        bay_role=rola_pola_obok,
        substation_ref="stac_1",
        bus_ref="bus_oze",
        terminal_bus_ref="bus_obok_zacisk",
    )
    enm = _enm(
        bays=[pole_zrodlowe, pole_obok],
        generators=[_generator(bus=zacisk if wytworca_na_zacisku else "bus_oze")],
        protection_assignments=[],
        buses=[
            Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15.0),
            Bus(ref_id=zacisk, name="Zacisk pola OZE", voltage_kv=15.0),
            Bus(ref_id="bus_obok_zacisk", name="Zacisk pola obok", voltage_kv=15.0),
        ],
    )
    view = build_ochrona_lom_view(enm)
    assert view["modules_without_field"] == []
    moduly = {pole["bay_ref"]: pole["generating_module_refs"] for pole in view["fields"]}
    assert moduly == {"bay_oze": ["gen_pv"]}
