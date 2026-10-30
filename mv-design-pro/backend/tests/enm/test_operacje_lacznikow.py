"""W5-C: operacje stanu łączeniowego — iloczyn cech, atomowość, determinizm, scenariusz.

Iloczyn cech karty: {open_switch, close_switch, set_normal_open_point} × {pierścień
z punktem podziału, sieć promieniowa, łącznik sekcyjny szyn} × {model bazowy, scenariusz
roboczy}. Ten sam OCZEKIWANY skutek (stany łączników po operacji) jest sprawdzany w obu
trybach: w modelu bazowym jako wynik operacji kanonicznej, w scenariuszu jako migawka
efektywna ``apply_scenario`` przy NIETKNIĘTYM modelu bazowym.

Dodatkowo (cechy, w których defekt mógłby się schować):
* atomowość — każda odmowa (brak ref, nieistniejący łącznik, nie-łącznik, stan bez
  zmiany, bezpiecznik jako punkt podziału, zły ``close_ref``) zostawia migawkę wejściową
  bez zmiany co do bitu i nie zwraca migawki;
* determinizm — ta sama operacja dwa razy daje identyczną migawkę i identyczny odcisk;
* pozycja normalna ≠ położenie bieżące — ``open_switch``/``close_switch`` nie ruszają
  ``normal_state``, scenariusz nie rusza ``normal_state``;
* topologia „theta" — kilka poprzednich punktów podziału → odmowa z nazwami, wybór
  przez ``close_ref``;
* parytet fizyki — rozpływ na scenariuszu z przełączeniem = rozpływ na modelu, w którym
  to samo przełączenie wykonano operacjami (co do bitu).
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest
from enm import store
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash, compute_input_hash, compute_switching_snapshot_hash
from enm.models import RODZAJE_GALEZI_APARATU, EnergyNetworkModel
from enm.scenariusze import (
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszNieprzystajeError,
    apply_scenario,
)
from enm.topology import poprzednie_punkty_podzialu, punkty_podzialu

from tests.enm.siec_lacznikowa import (
    KABEL,
    ROZLACZNIK,
    SIECI,
    SiecLacznikowa,
    _gpz,
    _kable,
    _odcinki,
    _wstaw_lacznik,
    bezpiecznik_nn,
    galaz,
    pierscien_z_nop,
    wykonaj,
    z_odbiorami,
)

OPERACJE = ("open_switch", "close_switch", "set_normal_open_point")

Stany = dict[str, tuple[str | None, str | None]]


def _stany(enm: dict[str, Any]) -> Stany:
    """Łącznik → (status, normal_state) dla każdego łącznika migawki."""
    return {
        g["ref_id"]: (g.get("status"), g.get("normal_state"))
        for g in enm["branches"]
        if g.get("type") in RODZAJE_GALEZI_APARATU
    }


def _bez_stanow(enm: dict[str, Any]) -> dict[str, Any]:
    """Migawka bez stanów łączników i nagłówka — reszta modelu musi zostać bez zmian."""
    kopia = copy.deepcopy(enm)
    kopia.pop("header", None)
    for galaz_ in kopia["branches"]:
        galaz_.pop("status", None)
        galaz_.pop("normal_state", None)
    return kopia


def _hash(enm: dict[str, Any]) -> str:
    return compute_enm_hash(EnergyNetworkModel.model_validate(enm))


def _przygotuj(siec: SiecLacznikowa, operacja: str) -> dict[str, Any]:
    """Migawka WEJŚCIOWA operacji: dla zamknięcia — z łącznikiem celu otwartym operacją."""
    if operacja == "close_switch":
        return wykonaj(siec.enm, "open_switch", {"switch_ref": siec.cel})
    return siec.enm


def _oczekiwane(siec: SiecLacznikowa, wejscie: dict[str, Any], operacja: str) -> Stany:
    """Oczekiwane stany łączników po operacji — wyprowadzone z KONTRAKTU, nie z kodu."""
    stany = _stany(wejscie)
    status, normalny = stany[siec.cel]
    if operacja == "open_switch":
        stany[siec.cel] = ("open", normalny)
    elif operacja == "close_switch":
        stany[siec.cel] = ("closed", normalny)
    else:
        stany[siec.cel] = ("open", "open")
        if siec.poprzedni_nop is not None:
            stany[siec.poprzedni_nop] = ("closed", "closed")
    return stany


def _zmienione(przed: Stany, po: Stany) -> set[str]:
    return {ref for ref in po if po[ref] != przed[ref]}


def _scenariusz(ident: str, stany: dict[str, str]) -> OperatingScenario:
    return OperatingScenario(
        scenario_id=ident,
        name=f"Scenariusz {ident}",
        kind=RodzajScenariusza.CUSTOM,
        switch_states=stany,
    )


PRZYPADKI = [
    pytest.param(budowa, operacja, id=f"{budowa.__name__}-{operacja}")
    for budowa in SIECI
    for operacja in OPERACJE
]


# ---------------------------------------------------------------------------
# Iloczyn × model bazowy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("budowa", "operacja"), PRZYPADKI)
def test_operacja_w_modelu_bazowym(budowa: Callable[[], SiecLacznikowa], operacja: str) -> None:
    siec = budowa()
    wejscie = _przygotuj(siec, operacja)
    kopia_wejscia = copy.deepcopy(wejscie)
    oczekiwane = _oczekiwane(siec, wejscie, operacja)

    wynik = execute_domain_operation(wejscie, operacja, {"switch_ref": siec.cel})

    assert wynik.get("error") is None, (wynik.get("error"), wynik.get("error_code"))
    assert wejscie == kopia_wejscia, "operacja zmieniła migawkę wołającego"
    po = wynik["snapshot"]
    assert _stany(po) == oczekiwane
    # Poza stanami łączników model się nie zmienia (żadnej gałęzi, szyny, korytarza).
    assert _bez_stanow(po) == _bez_stanow(wejscie)
    zmienione = _zmienione(_stany(wejscie), oczekiwane)
    assert set(wynik["changes"]["updated_element_ids"]) == zmienione
    assert wynik["changes"]["created_element_ids"] == []
    assert wynik["changes"]["deleted_element_ids"] == []
    zdarzenia = [z["event_type"] for z in wynik["domain_events"]]
    if operacja == "set_normal_open_point":
        assert zdarzenia == ["NOP_SET"] + ["NOP_CLEARED"] * (siec.poprzedni_nop is not None)
        assert punkty_podzialu(po) == (siec.cel,)
    else:
        assert zdarzenia == ["SWITCH_OPENED" if operacja == "open_switch" else "SWITCH_CLOSED"]
        # Chwilowe przełączenie NIE jest deklaracją punktu podziału.
        assert punkty_podzialu(po) == punkty_podzialu(wejscie)
    # Odcisk danych wejściowych analizy (bez stanu łączeniowego) — bez zmian; odcisk
    # przełączeń — zmieniony (stan łączeniowy jest jego treścią).
    model_przed = EnergyNetworkModel.model_validate(wejscie)
    model_po = EnergyNetworkModel.model_validate(po)
    assert compute_enm_hash(model_po) != compute_enm_hash(model_przed)
    assert compute_input_hash(model_po) == compute_input_hash(model_przed)
    assert compute_switching_snapshot_hash(model_po) != compute_switching_snapshot_hash(model_przed)


@pytest.mark.parametrize(("budowa", "operacja"), PRZYPADKI)
def test_operacja_jest_deterministyczna(
    budowa: Callable[[], SiecLacznikowa], operacja: str
) -> None:
    siec_1, siec_2 = budowa(), budowa()
    assert siec_1.enm == siec_2.enm and siec_1.cel == siec_2.cel
    wynik_1 = execute_domain_operation(
        _przygotuj(siec_1, operacja), operacja, {"switch_ref": siec_1.cel}
    )
    wynik_2 = execute_domain_operation(
        _przygotuj(siec_2, operacja), operacja, {"switch_ref": siec_2.cel}
    )
    assert wynik_1["snapshot"] == wynik_2["snapshot"]
    assert wynik_1["domain_events"] == wynik_2["domain_events"]
    assert _hash(wynik_1["snapshot"]) == _hash(wynik_2["snapshot"])


# ---------------------------------------------------------------------------
# Iloczyn × scenariusz roboczy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("budowa", "operacja"), PRZYPADKI)
def test_ten_sam_skutek_w_scenariuszu_bez_zmiany_modelu(
    budowa: Callable[[], SiecLacznikowa], operacja: str
) -> None:
    """Scenariusz z położeniami łączników = te same położenia co po operacji w modelu.

    Scenariusz niesie WYŁĄCZNIE położenie bieżące (``status``) — pozycja normalna jest
    daną projektu, więc migawka efektywna zachowuje ``normal_state`` modelu bazowego.
    """
    siec = budowa()
    wejscie = _przygotuj(siec, operacja)
    oczekiwane = _oczekiwane(siec, wejscie, operacja)
    zmienione = _zmienione(_stany(wejscie), oczekiwane)
    model = EnergyNetworkModel.model_validate(wejscie)
    hash_bazy = compute_enm_hash(model)
    zrzut_bazy = model.model_dump(mode="json")

    scenariusz = _scenariusz("s-" + operacja, {ref: oczekiwane[ref][0] for ref in zmienione})
    efektywna = apply_scenario(model, scenariusz)

    assert compute_enm_hash(model) == hash_bazy and model.model_dump(mode="json") == zrzut_bazy
    stany_efektywne = _stany(efektywna.snapshot)
    assert {ref: s for ref, (s, _n) in stany_efektywne.items()} == {
        ref: s for ref, (s, _n) in oczekiwane.items()
    }
    assert {ref: n for ref, (_s, n) in stany_efektywne.items()} == {
        ref: n for ref, (_s, n) in _stany(wejscie).items()
    }
    assert sorted((n.ref_id, n.pole, n.przed, n.po) for n in efektywna.nadpisania) == sorted(
        (ref, "switch_states.status", _stany(wejscie)[ref][0] or "closed", oczekiwane[ref][0])
        for ref in zmienione
    )
    assert efektywna.base_hash == hash_bazy
    assert efektywna.snapshot_hash != hash_bazy
    # Determinizm migawki efektywnej.
    assert apply_scenario(model, scenariusz).snapshot_hash == efektywna.snapshot_hash


@pytest.mark.parametrize("budowa", [*SIECI, bezpiecznik_nn])
def test_scenariusz_bez_realnej_zmiany_nie_nadpisuje_niczego(
    budowa: Callable[[], SiecLacznikowa],
) -> None:
    siec = budowa()
    model = EnergyNetworkModel.model_validate(siec.enm)
    biezacy = galaz(siec.enm, siec.cel).get("status") or "closed"
    efektywna = apply_scenario(model, _scenariusz("s-bez-zmiany", {siec.cel: biezacy}))
    assert efektywna.nadpisania == ()
    assert efektywna.tozsama_z_baza
    assert efektywna.snapshot_hash == efektywna.base_hash == compute_enm_hash(model)


def test_scenariusz_odrzuca_element_spoza_lacznikow() -> None:
    siec = pierscien_z_nop()
    model = EnergyNetworkModel.model_validate(siec.enm)
    kabel = next(g["ref_id"] for g in siec.enm["branches"] if g.get("type") == "cable")
    with pytest.raises(ScenariuszNieprzystajeError, match="nie jest łącznikiem"):
        apply_scenario(model, _scenariusz("s-kabel", {kabel: "open"}))
    with pytest.raises(ScenariuszNieprzystajeError, match="nie istnieje w modelu sieci"):
        apply_scenario(model, _scenariusz("s-brak", {"sw/nie-ma-takiego": "open"}))
    with pytest.raises(ScenariuszNieprzystajeError, match="wyłączony z eksploatacji"):
        apply_scenario(
            model,
            OperatingScenario(
                scenario_id="s-wylaczony",
                name="Wyłączony i przełączony",
                kind=RodzajScenariusza.CUSTOM,
                out_of_service=(siec.cel,),
                switch_states={siec.cel: "open"},
            ),
        )


def test_scenariusz_przyjmuje_bezpiecznik() -> None:
    siec = bezpiecznik_nn()
    efektywna = apply_scenario(
        EnergyNetworkModel.model_validate(siec.enm), _scenariusz("s-bezp", {siec.cel: "open"})
    )
    assert galaz(efektywna.snapshot, siec.cel)["status"] == "open"


def test_stany_scenariusza_wchodza_do_tresci_tylko_gdy_niepuste() -> None:
    pusty = _scenariusz("s-pusty", {})
    assert "switch_states" not in pusty.tresc()
    assert not pusty.ma_nadpisania_modelu
    pelny = _scenariusz("s-pelny", {"sw/b": "open", "sw/a": "closed"})
    assert pelny.tresc()["switch_states"] == {"sw/a": "closed", "sw/b": "open"}
    assert pelny.ma_nadpisania_modelu
    assert pelny.hash != pusty.hash
    assert _scenariusz("s-pelny", {"sw/a": "closed", "sw/b": "open"}).hash == pelny.hash


# ---------------------------------------------------------------------------
# Parytet fizyki: scenariusz ≡ ten sam stan wykonany operacjami
# ---------------------------------------------------------------------------


KLUCZ_SCENARIUSZA = "projekt:5c0a1b2c-3d4e-4f50-8a1b-2c3d4e5f6a01"
KLUCZ_OPERACJI = "projekt:5c0a1b2c-3d4e-4f50-8a1b-2c3d4e5f6a02"


@pytest.fixture()
def _magazyn(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_canonical_runs()
    store.reset_enm_store()
    yield
    reset_canonical_runs()
    store.reset_enm_store()


def _bez_tozsamosci_biegu(wartosc: Any) -> Any:
    """Wynik solvera bez ``proof_ref`` — pole niesie tożsamość KONKRETNEGO biegu (nie
    fizyki), jedyne, które ma prawo różnić się między dwoma biegami tej samej sieci
    (ta sama zasada co `tests/invariants/test_scenariusz_i_bieg.py::test_is6_*`)."""
    if isinstance(wartosc, dict):
        return {k: _bez_tozsamosci_biegu(v) for k, v in wartosc.items() if k != "proof_ref"}
    if isinstance(wartosc, list):
        return [_bez_tozsamosci_biegu(v) for v in wartosc]
    return wartosc


@pytest.mark.parametrize(
    ("analiza", "klucz_wyniku"), [("PF", "result_v1"), ("short_circuit_sn", "results")]
)
def test_bieg_na_scenariuszu_rowny_biegowi_na_modelu_przelaczonym(
    _magazyn: None, analiza: str, klucz_wyniku: str
) -> None:
    """Przeniesienie punktu podziału w scenariuszu daje TEN SAM wynik solvera co model,
    w którym to samo przełączenie wykonano operacjami — co do bitu."""
    siec = z_odbiorami(pierscien_z_nop())
    assert siec.poprzedni_nop is not None
    przelaczony = wykonaj(
        wykonaj(siec.enm, "close_switch", {"switch_ref": siec.poprzedni_nop}),
        "open_switch",
        {"switch_ref": siec.cel},
    )
    store.set_enm(KLUCZ_SCENARIUSZA, EnergyNetworkModel.model_validate(siec.enm))
    store.set_enm(KLUCZ_OPERACJI, EnergyNetworkModel.model_validate(przelaczony))
    scenariusz = _scenariusz("s-przeniesienie", {siec.poprzedni_nop: "closed", siec.cel: "open"})

    na_scenariuszu = execute_run(
        create_run(
            case_id="c-scen",
            klucz_twin=KLUCZ_SCENARIUSZA,
            analysis_type=analiza,
            scenariusz=scenariusz,
        ).id
    )
    na_modelu = execute_run(
        create_run(case_id="c-op", klucz_twin=KLUCZ_OPERACJI, analysis_type=analiza).id
    )
    bazowy = execute_run(
        create_run(case_id="c-baza", klucz_twin=KLUCZ_SCENARIUSZA, analysis_type=analiza).id
    )

    for bieg in (na_scenariuszu, na_modelu, bazowy):
        assert bieg.status == "FINISHED", bieg.error_message
        assert bieg.raw_result and bieg.raw_result.get(klucz_wyniku)
    wynik_scenariusza = _bez_tozsamosci_biegu(na_scenariuszu.raw_result[klucz_wyniku])
    assert wynik_scenariusza == _bez_tozsamosci_biegu(na_modelu.raw_result[klucz_wyniku])
    # Kontrola żywotności: przełączenie realnie zmienia wynik względem stanu normalnego.
    assert wynik_scenariusza != _bez_tozsamosci_biegu(bazowy.raw_result[klucz_wyniku])


# ---------------------------------------------------------------------------
# Atomowość odmów
# ---------------------------------------------------------------------------


def _odmowa(enm: dict[str, Any], operacja: str, ladunek: dict[str, Any], kod: str) -> str:
    przed = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, operacja, ladunek)
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert wynik.get("snapshot") is None
    assert enm == przed, "odmowa zmieniła migawkę wołającego"
    komunikat = str(wynik.get("error"))
    assert kod not in komunikat, "komunikat dla projektanta nie może nieść kodu"
    return komunikat


@pytest.mark.parametrize("operacja", OPERACJE)
@pytest.mark.parametrize("budowa", SIECI)
def test_odmowy_nie_zostawiaja_skutku(budowa: Callable[[], SiecLacznikowa], operacja: str) -> None:
    siec = budowa()
    prefiks = "nop" if operacja == "set_normal_open_point" else "switch"
    brak = "nop.switch_missing" if prefiks == "nop" else "switch.ref_missing"
    _odmowa(siec.enm, operacja, {}, brak)
    _odmowa(siec.enm, operacja, {"switch_ref": "  "}, brak)
    _odmowa(
        siec.enm,
        operacja,
        {"switch_ref": "sw/nie-ma"},
        f"{prefiks}.switch_not_found" if prefiks == "nop" else "switch.not_found",
    )
    kabel = next(g["ref_id"] for g in siec.enm["branches"] if g.get("type") == "cable")
    _odmowa(
        siec.enm,
        operacja,
        {"switch_ref": kabel},
        "nop.not_a_switch" if prefiks == "nop" else "switch.not_a_switch",
    )


@pytest.mark.parametrize("budowa", SIECI)
def test_stan_bez_zmiany_to_odmowa(budowa: Callable[[], SiecLacznikowa]) -> None:
    siec = budowa()
    komunikat = _odmowa(
        siec.enm, "close_switch", {"switch_ref": siec.cel}, "switch.state_unchanged"
    )
    assert "jest już zamknięty" in komunikat
    otwarty = wykonaj(siec.enm, "open_switch", {"switch_ref": siec.cel})
    komunikat = _odmowa(otwarty, "open_switch", {"switch_ref": siec.cel}, "switch.state_unchanged")
    assert "jest już otwarty" in komunikat


def test_bezpiecznik_przelacza_sie_ale_nie_jest_punktem_podzialu() -> None:
    siec = bezpiecznik_nn()
    otwarty = wykonaj(siec.enm, "open_switch", {"switch_ref": siec.cel})
    assert galaz(otwarty, siec.cel)["status"] == "open"
    assert "normal_state" not in galaz(otwarty, siec.cel)
    zamkniety = wykonaj(otwarty, "close_switch", {"switch_ref": siec.cel})
    assert galaz(zamkniety, siec.cel)["status"] == "closed"
    komunikat = _odmowa(
        siec.enm, "set_normal_open_point", {"switch_ref": siec.cel}, "nop.not_a_switch"
    )
    assert "bezpiecznik" in komunikat


def test_close_ref_spoza_kandydatow_to_odmowa() -> None:
    siec = pierscien_z_nop()
    kabel = next(g["ref_id"] for g in siec.enm["branches"] if g.get("type") == "cable")
    komunikat = _odmowa(
        siec.enm,
        "set_normal_open_point",
        {"switch_ref": siec.cel, "close_ref": kabel},
        "nop.close_ref_invalid",
    )
    assert "poprzednim punktem podziału tego pierścienia może być wyłącznie" in komunikat
    promieniowa = SIECI[1]()
    komunikat = _odmowa(
        promieniowa.enm,
        "set_normal_open_point",
        {"switch_ref": promieniowa.cel, "close_ref": siec.cel},
        "nop.close_ref_invalid",
    )
    assert "żaden poprzedni punkt podziału" in komunikat


def test_close_ref_jawny_przy_jednym_kandydacie_daje_ten_sam_wynik() -> None:
    siec = pierscien_z_nop()
    domyslny = wykonaj(siec.enm, "set_normal_open_point", {"switch_ref": siec.cel})
    jawny = wykonaj(
        siec.enm,
        "set_normal_open_point",
        {"switch_ref": siec.cel, "close_ref": siec.poprzedni_nop},
    )
    assert domyslny == jawny


def test_ponowne_wskazanie_tego_samego_punktu_podzialu_jest_idempotentne() -> None:
    siec = pierscien_z_nop()
    assert siec.poprzedni_nop is not None
    wynik = wykonaj(siec.enm, "set_normal_open_point", {"switch_ref": siec.poprzedni_nop})
    assert _stany(wynik) == _stany(siec.enm)
    assert punkty_podzialu(wynik) == (siec.poprzedni_nop,)


# ---------------------------------------------------------------------------
# Topologia „theta": kilka punktów podziału zależnych od jednego łącznika
# ---------------------------------------------------------------------------


def _theta(z_lacznikiem: bool = True) -> tuple[dict[str, Any], str, tuple[str, str]]:
    """GPZ → 3 odcinki; łącznik L na odcinku 1; dwa pierścienie (GPZ → koniec magistrali
    i GPZ → szyna środkowa), każdy z własnym punktem podziału. Oba punkty zależą od L:
    przeniesienie punktu podziału na L musi zamknąć DOKŁADNIE jeden z nich.

    ``z_lacznikiem=False`` — bez L; zwrócony ref to odcinek 1 (miejsce wstawienia L)."""
    enm = _odcinki(_gpz(), [200, 250, 300])
    kable = _kable(enm)
    szyna_gpz = kable[0]["from_bus_ref"]
    konce = (kable[2]["to_bus_ref"], kable[1]["to_bus_ref"])
    if z_lacznikiem:
        enm, lacznik = _wstaw_lacznik(enm, kable[0]["ref_id"])
    else:
        lacznik = kable[0]["ref_id"]
    punkty: list[str] = []
    for koniec in konce:
        przed = {b["ref_id"] for b in enm["branches"]}
        enm = wykonaj(
            enm,
            "connect_secondary_ring_sn",
            {
                "from_bus_ref": szyna_gpz,
                "to_bus_ref": koniec,
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": KABEL},
            },
        )
        (kabel_pierscienia,) = (
            b["ref_id"]
            for b in enm["branches"]
            if b["ref_id"] not in przed and b.get("type") == "cable"
        )
        enm, punkt = _wstaw_lacznik(enm, kabel_pierscienia)
        enm = wykonaj(enm, "set_normal_open_point", {"switch_ref": punkt})
        punkty.append(punkt)
    return enm, lacznik, (punkty[0], punkty[1])


def test_theta_wymaga_wskazania_ktory_punkt_zamknac() -> None:
    enm, lacznik, punkty = _theta()
    assert set(poprzednie_punkty_podzialu(enm, lacznik)) == set(punkty)
    komunikat = _odmowa(
        enm, "set_normal_open_point", {"switch_ref": lacznik}, "nop.previous_ambiguous"
    )
    assert "Wskaż w polu" in komunikat
    for zamykany in punkty:
        wynik = wykonaj(
            enm, "set_normal_open_point", {"switch_ref": lacznik, "close_ref": zamykany}
        )
        pozostaly = next(p for p in punkty if p != zamykany)
        assert galaz(wynik, zamykany)["normal_state"] == "closed"
        assert galaz(wynik, zamykany)["status"] == "closed"
        assert galaz(wynik, pozostaly)["normal_state"] == "open"
        assert galaz(wynik, pozostaly)["status"] == "open"
        assert set(punkty_podzialu(wynik)) == {lacznik, pozostaly}


def _wstaw_otwarty(enm: dict[str, Any], odcinek: str, **dodatkowe: Any) -> dict[str, Any]:
    return execute_domain_operation(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK,
            "normal_state": "open",
            **dodatkowe,
        },
    )


def test_wstawienie_punktu_podzialu_w_pierscien_zamyka_poprzedni() -> None:
    """Wstawienie łącznika z pozycją „open" w pierścień z punktem podziału = TA SAMA reguła
    co ``set_normal_open_point``: nowy łącznik punktem podziału, poprzedni zamknięty
    w tej samej operacji (dawniej: pierścień z dwoma punktami i wyspą między nimi)."""
    siec = pierscien_z_nop()
    assert siec.poprzedni_nop is not None
    pierscien = next(k for k in _kable(siec.enm) if k["ref_id"] not in {siec.cel})
    przed = {b["ref_id"] for b in siec.enm["branches"]}
    wynik = _wstaw_otwarty(siec.enm, pierscien["ref_id"])
    assert wynik.get("error") is None, wynik.get("error")
    migawka = wynik["snapshot"]
    (nowy,) = (
        b["ref_id"]
        for b in migawka["branches"]
        if b["ref_id"] not in przed and b.get("type") in {"switch", "breaker"}
    )
    assert punkty_podzialu(migawka) == (nowy,)
    assert (galaz(migawka, nowy)["normal_state"], galaz(migawka, nowy)["status"]) == (
        "open",
        "open",
    )
    poprzedni = galaz(migawka, siec.poprzedni_nop)
    assert (poprzedni["normal_state"], poprzedni["status"]) == ("closed", "closed")
    assert nowy in wynik["changes"]["created_element_ids"]
    assert wynik["changes"]["updated_element_ids"] == [siec.poprzedni_nop]
    assert pierscien["ref_id"] in wynik["changes"]["deleted_element_ids"]
    zdarzenia = [(z["event_seq"], z["event_type"], z["element_id"]) for z in wynik["domain_events"]]
    assert [z[1] for z in zdarzenia][-3:] == ["SWITCH_INSERTED", "NOP_SET", "NOP_CLEARED"]
    assert [z[0] for z in zdarzenia] == list(range(1, len(zdarzenia) + 1))
    # Ta sama migawka co wstawienie zamkniętego łącznika + `set_normal_open_point`.
    dwa_kroki = wykonaj(
        wykonaj(
            siec.enm,
            "insert_section_switch_sn",
            {
                "segment_id": pierscien["ref_id"],
                "insert_at": {"mode": "RATIO", "value": 0.5},
                "catalog_ref": ROZLACZNIK,
            },
        ),
        "set_normal_open_point",
        {"switch_ref": nowy},
    )
    assert migawka == dwa_kroki


def test_wstawienie_punktu_podzialu_w_theta_wymaga_wskazania() -> None:
    enm, odcinek, punkty = _theta(z_lacznikiem=False)
    komunikat = _odmowa(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK,
            "normal_state": "open",
        },
        "nop.previous_ambiguous",
    )
    assert "Wskaż w polu" in komunikat
    for zamykany in punkty:
        wynik = _wstaw_otwarty(enm, odcinek, close_ref=zamykany)
        assert wynik.get("error") is None, wynik.get("error")
        pozostaly = next(p for p in punkty if p != zamykany)
        (nowy,) = (
            ref
            for ref in wynik["changes"]["created_element_ids"]
            if any(
                b["ref_id"] == ref and b.get("type") in {"switch", "breaker"}
                for b in wynik["snapshot"]["branches"]
            )
        )
        assert galaz(wynik["snapshot"], zamykany)["status"] == "closed"
        assert set(punkty_podzialu(wynik["snapshot"])) == {nowy, pozostaly}
    _odmowa(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK,
            "normal_state": "open",
            "close_ref": odcinek,
        },
        "nop.close_ref_invalid",
    )


# ---------------------------------------------------------------------------
# Pozycja normalna chroniona przed edycją parametrów
# ---------------------------------------------------------------------------


def test_edycja_parametrow_nie_przestawia_stanu_lacznika() -> None:
    siec = pierscien_z_nop()
    _odmowa(
        siec.enm,
        "update_element_parameters",
        {"element_ref": siec.cel, "parameters": {"status": "open"}},
        "switch.state_via_operation",
    )
    kabel = next(g["ref_id"] for g in siec.enm["branches"] if g.get("type") == "cable")
    _odmowa(
        siec.enm,
        "update_element_parameters",
        {"element_ref": kabel, "parameters": {"normal_state": "open"}},
        "switch.normal_state_not_applicable",
    )
    _odmowa(
        siec.enm,
        "update_element_parameters",
        {"element_ref": siec.cel, "parameters": {"normal_state": "półotwarty"}},
        "switch.normal_state_invalid",
    )


def test_wstawienie_lacznika_z_jawna_pozycja_normalna() -> None:
    enm = _odcinki(_gpz(), [200, 250])
    przed = {b["ref_id"] for b in enm["branches"]}
    wynik = wykonaj(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": _kable(enm)[0]["ref_id"],
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK,
            "normal_state": "open",
        },
    )
    (lacznik,) = (
        b["ref_id"]
        for b in wynik["branches"]
        if b["ref_id"] not in przed and b.get("type") in {"switch", "breaker"}
    )
    assert galaz(wynik, lacznik)["normal_state"] == "open"
    assert galaz(wynik, lacznik)["status"] == "open"
    bez_pozycji = wykonaj(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": _kable(enm)[0]["ref_id"],
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK,
        },
    )
    nowy = next(
        b
        for b in bez_pozycji["branches"]
        if b["ref_id"] not in przed and b.get("type") in {"switch", "breaker"}
    )
    assert nowy.get("normal_state") is None and nowy["status"] == "closed"
    _odmowa(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": _kable(enm)[0]["ref_id"],
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK,
            "normal_state": "zamkniety",
        },
        "switch.normal_state_invalid",
    )
