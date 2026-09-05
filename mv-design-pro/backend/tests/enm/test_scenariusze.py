"""Scenariusz roboczy i migawka efektywna (CV-3.1, `enm/scenariusze.py`).

Twierdzenia przypiete testami (nie deklaracja w docstringu modulu):
1. Hash migawki ze slownika == hash modelu z obiektu (dla sieci zlotej i pierscienia).
2. Stan normalny i scenariusz zwarciowy sa TOZSAME z modelem (ten sam slownik, ten sam hash).
3. Kazde pole nadpisania × {element istnieje, element nie istnieje}: nadpisanie
   trafia dokladnie tam, gdzie ma trafic, a brak elementu jest bledem z nazwa.
4. Sondy scenariusza sa bit w bit tymi samymi elementami, ktore budowaly rodziny
   D2/D3/D5 wlasnymi pomocnikami (parytet migawki PRZED migracja rodzin).
5. Magazyn: rewizje append-only, brak zmiany = brak rewizji, nagrobek, odmowa dla
   scenariusza przejsciowego, awaria zapisu bez sladu, migracja klucza (CV-1).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid4, uuid5

import pytest
from application.analyses.hosting_capacity import _probe_generator as _sonda_hosting
from application.analyses.pq_area import _probe_generator as _sonda_pq
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm import scenariusze
from enm.hash import compute_enm_hash, hash_migawki_enm
from enm.models import (
    BranchRating,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    OverheadLine,
    ShuntCapacitor,
    Source,
)
from enm.scenariusze import (
    SCENARIUSZ_NORMALNY,
    Nastawa,
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszNieistniejeError,
    ScenariuszNieprzystajeError,
    ScenariuszPrzejsciowyError,
    ScenariuszUszkodzonyError,
    SondaKondensatora,
    Wstrzyk,
    apply_scenario,
    katalog_scenariuszy,
    lista_scenariuszy,
    opcje_biegu_ze_scenariusza,
    stan_scenariusza,
    usun_scenariusz,
    wczytaj_scenariusz,
    zapisz_scenariusz,
)
from enm.store import (
    migruj_klucz_przypadku_do_projektu,
    reset_enm_store,
    set_enm,
    wiersze_manifestu_legacy,
)

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _czysty_magazyn(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    yield
    reset_enm_store()


def _pierscien() -> EnergyNetworkModel:
    """Pierscien z generatorem i bateria — kazde pole nadpisania ma tu adresata."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Pierscien scenariuszy"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System 15 kV",
                bus_ref="b_src",
                model="short_circuit_power",
                sk3_mva=500.0,
                r_ohm=0.1,
                x_ohm=1.0,
            )
        ],
        loads=[
            Load(ref_id="ld_a", name="Odbior A", bus_ref="b_a", p_mw=1.0, q_mvar=0.3),
            Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3),
        ],
        generators=[
            Generator(ref_id="gen_a", name="PV A", bus_ref="b_a", p_mw=0.5, q_mvar=0.1),
            Generator(ref_id="gen_b", name="PV B", bus_ref="b_b", p_mw=-0.2, q_mvar=None),
        ],
        shunt_capacitors=[
            ShuntCapacitor(
                ref_id="bat_b", name="Bateria B", bus_ref="b_b", rated_mvar=0.3, rated_kv=15.0
            )
        ],
        branches=[
            OverheadLine(
                ref_id="ln_src_a",
                name="Linia GPZ-A",
                from_bus_ref="b_src",
                to_bus_ref="b_a",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=200.0),
            ),
            OverheadLine(
                ref_id="ln_src_b",
                name="Linia GPZ-B",
                from_bus_ref="b_src",
                to_bus_ref="b_b",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=60.0),
            ),
            Cable(
                ref_id="ka_a_b",
                name="Kabel A-B",
                from_bus_ref="b_a",
                to_bus_ref="b_b",
                length_km=1.0,
                r_ohm_per_km=0.16,
                x_ohm_per_km=0.1,
                rating=BranchRating(in_a=280.0),
            ),
        ],
    )


def _scenariusz(**pola: Any) -> OperatingScenario:
    bazowe: dict[str, Any] = {
        "scenario_id": "s-test",
        "name": "Scenariusz testowy",
        "kind": RodzajScenariusza.CUSTOM,
    }
    bazowe.update(pola)
    return OperatingScenario(**bazowe)


def _refy(snapshot: dict[str, Any], kolekcja: str) -> list[str]:
    return [str(e["ref_id"]) for e in snapshot.get(kolekcja) or []]


def _element(snapshot: dict[str, Any], kolekcja: str, ref_id: str) -> dict[str, Any]:
    return next(e for e in snapshot[kolekcja] if e["ref_id"] == ref_id)


# ---------------------------------------------------------------------------
# 1–2. Hash ze slownika == hash z obiektu; tozsamosc stanu normalnego
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("budowniczy", [build_golden_enm, _pierscien])
def test_hash_migawki_rowny_hashowi_modelu(budowniczy) -> None:
    enm = budowniczy()
    migawka = enm.model_dump(mode="json")
    kopia = json.loads(json.dumps(migawka))
    assert hash_migawki_enm(migawka) == compute_enm_hash(enm)
    assert migawka == kopia, "hash_migawki_enm nie moze zmieniac migawki wolajacego"


@pytest.mark.parametrize("budowniczy", [build_golden_enm, _pierscien])
def test_stan_normalny_tozsamy_z_modelem(budowniczy) -> None:
    enm = budowniczy()
    efektywna = apply_scenario(enm, SCENARIUSZ_NORMALNY)
    assert efektywna.snapshot == enm.model_dump(mode="json")
    assert efektywna.snapshot_hash == efektywna.base_hash == compute_enm_hash(enm)
    assert efektywna.tozsama_z_baza and efektywna.nadpisania == ()
    assert efektywna.base_revision == enm.header.revision
    assert efektywna.scenario_ref == ("__normal__", 1)


def test_scenariusz_zwarciowy_nie_zmienia_migawki_a_daje_opcje_biegu() -> None:
    enm = _pierscien()
    spec = new_fault_scenario(
        study_case_id=uuid4(),
        name="Zwarcie na A",
        fault_type=FaultType.SC_3F,
        location=FaultLocation(element_ref="b_a", location_type="BUS"),
        config=ShortCircuitConfig(c_factor=1.05, thermal_time_seconds=0.5),
    )
    scenariusz = _scenariusz(kind=RodzajScenariusza.FAULT_STUDY, fault_spec=spec)
    efektywna = apply_scenario(enm, scenariusz)
    assert efektywna.snapshot_hash == compute_enm_hash(enm)
    assert not scenariusz.ma_nadpisania_modelu and efektywna.tozsama_z_baza
    opcje = opcje_biegu_ze_scenariusza(scenariusz)
    assert opcje == {
        "scenario_id": str(spec.scenario_id),
        "fault_type": "SC_3F",
        "location": {"element_ref": "b_a", "location_type": "BUS", "position": None},
        "config": spec.config.to_dict(),
        "c_factor": 1.05,
        "thermal_time_seconds": 0.5,
    }
    assert opcje_biegu_ze_scenariusza(SCENARIUSZ_NORMALNY) == {}
    # Hash tresci scenariusza zwarciowego nie zalezy od znacznikow czasu ani nazwy.
    spec_pozniej = spec.with_updates(updated_at="2099-01-01T00:00:00+00:00", name="Inna nazwa")
    assert (
        _scenariusz(kind=RodzajScenariusza.FAULT_STUDY, fault_spec=spec_pozniej).hash
        == scenariusz.hash
    )


# ---------------------------------------------------------------------------
# 3. Kazde pole × element istnieje / nie istnieje
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ref_id", "kolekcja"),
    [
        ("ka_a_b", "branches"),
        ("gen_a", "generators"),
        ("ld_b", "loads"),
        ("bat_b", "shunt_capacitors"),
    ],
)
def test_out_of_service_usuwa_dokladnie_ten_element(ref_id: str, kolekcja: str) -> None:
    enm = _pierscien()
    baza = enm.model_dump(mode="json")
    efektywna = apply_scenario(enm, _scenariusz(out_of_service=(ref_id,)))
    assert ref_id not in _refy(efektywna.snapshot, kolekcja)
    oczekiwane = dict(baza)
    oczekiwane[kolekcja] = [e for e in baza[kolekcja] if e["ref_id"] != ref_id]
    assert efektywna.snapshot == oczekiwane, "poza wylaczonym elementem migawka bez zmian"
    assert efektywna.snapshot_hash == hash_migawki_enm(oczekiwane) != efektywna.base_hash
    assert [n.to_dict() for n in efektywna.nadpisania] == [
        {
            "pole": "out_of_service",
            "kolekcja": kolekcja,
            "ref_id": ref_id,
            "przed": "obecny",
            "po": "nieobecny",
        }
    ]
    assert enm.model_dump(mode="json") == baza, "model wejsciowy nietkniety"


def test_setpoint_nadpisuje_tylko_podane_pola() -> None:
    efektywna = apply_scenario(
        _pierscien(),
        _scenariusz(setpoints={"gen_a": Nastawa(p_mw=0.25), "gen_b": Nastawa(q_mvar=0.05)}),
    )
    gen_a = _element(efektywna.snapshot, "generators", "gen_a")
    gen_b = _element(efektywna.snapshot, "generators", "gen_b")
    assert (gen_a["p_mw"], gen_a["q_mvar"]) == (0.25, 0.1)
    assert (gen_b["p_mw"], gen_b["q_mvar"]) == (-0.2, 0.05)
    assert [(n.pole, n.ref_id, n.przed, n.po) for n in efektywna.nadpisania] == [
        ("setpoints.p_mw", "gen_a", 0.5, 0.25),
        ("setpoints.q_mvar", "gen_b", None, 0.05),
    ]


def test_gen_scaling_gwiazdka_i_pojedynczy_oraz_zero_bez_minus_zera() -> None:
    noc = apply_scenario(_pierscien(), _scenariusz(gen_scaling={"*": 0.0}))
    for gen in noc.snapshot["generators"]:
        assert gen["p_mw"] == 0.0
    assert '"p_mw":-0.0' not in json.dumps(noc.snapshot, separators=(",", ":"))
    polowa = apply_scenario(_pierscien(), _scenariusz(gen_scaling={"gen_b": 0.5}))
    assert _element(polowa.snapshot, "generators", "gen_b")["p_mw"] == -0.1
    assert _element(polowa.snapshot, "generators", "gen_a")["p_mw"] == 0.5
    assert [(n.ref_id, n.przed, n.po) for n in polowa.nadpisania] == [("gen_b", -0.2, -0.1)]


def test_sondy_scenariusza_sa_tymi_samymi_elementami_co_pomocniki_rodzin() -> None:
    """Parytet migawki: sonda z `Wstrzyk`/`SondaKondensatora` == element z pomocnika rodziny.

    Czesc D5 (bateria kondensatorow, `dobor_kompensacji.py`) PRZEPISANA na kanon
    CV-3-W (2026-09-05): pomocnik `_probe_capacitor`, ktory byl tu WYROCZNIA,
    zostal USUNIETY razem z migracja rodziny D5 na `apply_scenario`. Wyrocznia
    D5 jest teraz jawny slownik literalny (`oczekiwana_bateria` nizej) — pola i
    wartosci PRZEPISANE bez zmian z dawnego pomocnika: `ShuntCapacitor(id=uuid5(
    NAMESPACE_URL, sonda.id_seed), ref_id=sonda.ref_id, name=sonda.name,
    bus_ref=sonda.bus_ref, rated_mvar=sonda.rated_mvar, rated_kv=sonda.rated_kv,
    status="closed", catalog_ref=sonda.catalog_ref, catalog_namespace=sonda.
    catalog_namespace, parameter_source="CATALOG", source_mode="KATALOG",
    ).model_dump(mode="json")` (identyczna konstrukcja, ktorej dzis uzywa
    `enm.scenariusze._bateria_sondy` — rdzen CV-3.1, nie do zmiany w tej karcie).
    Czesc D2/D3 (`_sonda_hosting`/`_sonda_pq`) NIETKNIETA (inny wykonawca, rodziny
    D1-D3).
    """
    enm = _pierscien()
    hosting = Wstrzyk(
        bus_ref="b_a",
        ref_id="__hc_probe__b_a",
        name="Próbne przyłączenie OZE",
        p_mw=1.5,
        q_mvar=0.0,
        id_seed="hosting-capacity-probe:b_a",
    )
    pq = Wstrzyk(
        bus_ref="b_b",
        ref_id="__pq_probe__b_b",
        name="Próbne przyłączenie OZE (P–Q)",
        p_mw=0.7,
        q_mvar=-0.2,
        id_seed="pq-area-probe:b_b",
    )
    rekord = {
        "id": "kond-15kv-0p6",
        "name": "Bateria 0,6 Mvar",
        "params": {"rated_mvar": 0.6, "rated_kv": 15.0},
    }
    # `bateria` zbudowana Z `rekord` DOKLADNIE tak, jak usuniety `_probe_capacitor`
    # budowal SondaKondensatore z rekordu katalogu (zero powtorzonych literalow).
    bateria = SondaKondensatora(
        bus_ref="b_a",
        ref_id=f"__komp_probe__b_a__{rekord['id']}",
        name=str(rekord["name"]),
        rated_mvar=float(rekord["params"]["rated_mvar"]),
        rated_kv=float(rekord["params"]["rated_kv"]),
        catalog_ref=str(rekord["id"]),
        id_seed=f"compensation-probe:b_a:{rekord['id']}",
    )
    # Wyrocznia D5 (literalna, karta CV-3-W — patrz docstring testu): pola i
    # wartosci z usunietego pomocnika `dobor_kompensacji._probe_capacitor`, tu
    # skladane ze STAŁYCH pol `bateria` powyzej (zero powtorzonych literalow).
    oczekiwana_bateria = {
        "id": str(uuid5(NAMESPACE_URL, bateria.id_seed)),
        "ref_id": bateria.ref_id,
        "name": bateria.name,
        "tags": [],
        "meta": {},
        "bus_ref": bateria.bus_ref,
        "rated_mvar": bateria.rated_mvar,
        "rated_kv": bateria.rated_kv,
        "status": "closed",
        "catalog_ref": bateria.catalog_ref,
        "catalog_namespace": bateria.catalog_namespace,
        "parameter_source": "CATALOG",
        "source_mode": "KATALOG",
        "materialized_params": None,
        "overrides": [],
    }
    efektywna = apply_scenario(enm, _scenariusz(injections=(hosting, pq), probe_shunts=(bateria,)))
    generatory = efektywna.snapshot["generators"]
    assert generatory[-2] == _sonda_hosting("b_a", 1.5)
    assert generatory[-1] == _sonda_pq("b_b", 0.7, -0.2)
    assert efektywna.snapshot["shunt_capacitors"][-1] == oczekiwana_bateria
    assert _refy(efektywna.snapshot, "generators")[:2] == ["gen_a", "gen_b"], "istniejace bez zmian"
    assert [n.pole for n in efektywna.nadpisania] == ["injections", "injections", "probe_shunts"]


def test_domyslne_ziarno_identyfikatora_sondy() -> None:
    w = Wstrzyk(bus_ref="b_a", ref_id="__s__b_a", name="Sonda", p_mw=1.0, q_mvar=0.0)
    assert w.id_seed == "scenario-probe:__s__b_a"
    efektywna = apply_scenario(_pierscien(), _scenariusz(injections=(w,)))
    assert efektywna.snapshot["generators"][-1]["id"] == str(uuid5(NAMESPACE_URL, w.id_seed))


@pytest.mark.parametrize(
    ("pola", "ref_w_bledzie"),
    [
        ({"out_of_service": ("nie_ma",)}, "nie_ma"),
        ({"out_of_service": ("b_a",)}, "b_a"),  # szyna nie jest elementem wylaczalnym
        ({"setpoints": {"ld_a": Nastawa(p_mw=1.0)}}, "ld_a"),  # odbior nie jest generatorem
        ({"setpoints": {"nie_ma": Nastawa(p_mw=1.0)}}, "nie_ma"),
        ({"gen_scaling": {"nie_ma": 0.5}}, "nie_ma"),
        (
            {
                "injections": (
                    Wstrzyk(bus_ref="nie_ma", ref_id="__p__x", name="S", p_mw=1.0, q_mvar=0.0),
                )
            },
            "nie_ma",
        ),
        (
            {
                "injections": (
                    Wstrzyk(bus_ref="b_a", ref_id="gen_a", name="S", p_mw=1.0, q_mvar=0.0),
                )
            },
            "gen_a",
        ),
        (
            {
                "probe_shunts": (
                    SondaKondensatora(
                        bus_ref="nie_ma",
                        ref_id="__k__x",
                        name="B",
                        rated_mvar=0.3,
                        rated_kv=15.0,
                        catalog_ref="k",
                    ),
                )
            },
            "nie_ma",
        ),
        (
            {
                "probe_shunts": (
                    SondaKondensatora(
                        bus_ref="b_b",
                        ref_id="bat_b",
                        name="B",
                        rated_mvar=0.3,
                        rated_kv=15.0,
                        catalog_ref="k",
                    ),
                )
            },
            "bat_b",
        ),
    ],
)
def test_brak_adresata_nadpisania_to_blad_z_nazwa_nie_cichy_skip(pola, ref_w_bledzie: str) -> None:
    with pytest.raises(ScenariuszNieprzystajeError) as info:
        apply_scenario(_pierscien(), _scenariusz(**pola))
    assert info.value.ref_id == ref_w_bledzie and info.value.scenario_id == "s-test"
    assert ref_w_bledzie in str(info.value) and "s-test" in str(info.value)


def test_kolejnosc_nadpisan_jest_stala_i_zapisana_w_proweniencji() -> None:
    scenariusz = _scenariusz(
        out_of_service=("ka_a_b",),
        setpoints={"gen_a": Nastawa(p_mw=1.0)},
        gen_scaling={"gen_a": 0.5},
        injections=(Wstrzyk(bus_ref="b_b", ref_id="__p__b_b", name="S", p_mw=0.2, q_mvar=0.0),),
        probe_shunts=(
            SondaKondensatora(
                bus_ref="b_a",
                ref_id="__k__b_a",
                name="B",
                rated_mvar=0.3,
                rated_kv=15.0,
                catalog_ref="k",
            ),
        ),
    )
    efektywna = apply_scenario(_pierscien(), scenariusz)
    assert [n.pole for n in efektywna.nadpisania] == [
        "out_of_service",
        "setpoints.p_mw",
        "gen_scaling.p_mw",
        "injections",
        "probe_shunts",
    ]
    # nastawa (1.0) zostala przeskalowana (0.5) — bo skalowanie idzie PO nastawie
    assert _element(efektywna.snapshot, "generators", "gen_a")["p_mw"] == 0.5
    assert efektywna.nadpisania[2].przed == 1.0


# ---------------------------------------------------------------------------
# Hash i walidacja scenariusza
# ---------------------------------------------------------------------------


def test_hash_scenariusza_to_tozsamosc_tresci_nie_etykiety() -> None:
    a = _scenariusz(
        setpoints={"g1": Nastawa(p_mw=1.0), "g2": Nastawa(q_mvar=2.0)},
        gen_scaling={"x": 1.0, "y": 2.0},
    )
    b = OperatingScenario(
        scenario_id="inny",
        name="Inna nazwa",
        kind=RodzajScenariusza.CUSTOM,
        revision=7,
        setpoints={"g2": Nastawa(q_mvar=2.0), "g1": Nastawa(p_mw=1.0)},
        gen_scaling={"y": 2.0, "x": 1.0},
    )
    assert a.hash == b.hash
    assert a.hash != _scenariusz(setpoints={"g1": Nastawa(p_mw=1.5)}).hash
    assert (
        a.hash
        != _scenariusz(
            kind=RodzajScenariusza.N_1,
            setpoints={"g1": Nastawa(p_mw=1.0), "g2": Nastawa(q_mvar=2.0)},
            gen_scaling={"x": 1.0, "y": 2.0},
        ).hash
    )
    assert SCENARIUSZ_NORMALNY.przejsciowy and not a.przejsciowy


@pytest.mark.parametrize(
    "pola",
    [
        {"out_of_service": ("a", "a")},
        {"gen_scaling": {"g": -0.1}},
        {"gen_scaling": {"": 1.0}},
        {"injections": (Wstrzyk(bus_ref="b", ref_id="__p", name="S", p_mw=1.0, q_mvar=0.0),) * 2},
    ],
)
def test_scenariusz_niespojny_odrzucany_przy_budowie(pola) -> None:
    with pytest.raises(ValueError):
        _scenariusz(**pola)


def test_nastawa_bez_wartosci_nie_jest_nadpisaniem() -> None:
    with pytest.raises(ValueError):
        Nastawa()


# ---------------------------------------------------------------------------
# 5. Magazyn scenariuszy nazwanych
# ---------------------------------------------------------------------------

KLUCZ = "projekt:2f7c1d9e-4b1a-4f6e-9b3a-1d2e3f4a5b6c"


def test_magazyn_rewizje_append_only_brak_zmiany_bez_rewizji_i_nagrobek() -> None:
    s1 = zapisz_scenariusz(
        KLUCZ, _scenariusz(scenario_id="n1", revision=42, out_of_service=("ka_a_b",))
    )
    assert s1.revision == 1, "numer rewizji nadaje magazyn, nie wolajacy"
    assert zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="n1", out_of_service=("ka_a_b",))) == s1
    assert stan_scenariusza(KLUCZ, "n1") == scenariusze.StanScenariusza(1, False)
    s2 = zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="n1", out_of_service=("ln_src_b",)))
    assert s2.revision == 2
    assert wczytaj_scenariusz(KLUCZ, "n1") == s2
    assert wczytaj_scenariusz(KLUCZ, "n1", 1) == s1
    assert [s.scenario_id for s in lista_scenariuszy(KLUCZ)] == ["n1"]
    assert usun_scenariusz(KLUCZ, "n1") == 3
    assert stan_scenariusza(KLUCZ, "n1") == scenariusze.StanScenariusza(3, True)
    assert lista_scenariuszy(KLUCZ) == []
    with pytest.raises(ScenariuszNieistniejeError):
        wczytaj_scenariusz(KLUCZ, "n1")
    with pytest.raises(ScenariuszNieistniejeError):
        wczytaj_scenariusz(KLUCZ, "n1", 3)
    with pytest.raises(ScenariuszNieistniejeError):
        usun_scenariusz(KLUCZ, "n1")
    assert wczytaj_scenariusz(KLUCZ, "n1", 1) == s1, "historia zostaje po nagrobku"
    s4 = zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="n1", out_of_service=("ka_a_b",)))
    assert s4.revision == 4, "po nagrobku rewizje rosna dalej"
    assert stan_scenariusza(KLUCZ, "nigdy") is None
    with pytest.raises(ScenariuszNieistniejeError):
        wczytaj_scenariusz(KLUCZ, "nigdy")


def test_magazyn_odmawia_scenariuszy_przejsciowych_i_nie_tworzy_katalogu() -> None:
    with pytest.raises(ScenariuszPrzejsciowyError):
        zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="__probe__b_a"))
    with pytest.raises(ScenariuszPrzejsciowyError):
        zapisz_scenariusz(KLUCZ, SCENARIUSZ_NORMALNY)
    assert not katalog_scenariuszy(KLUCZ).exists()
    assert lista_scenariuszy(KLUCZ) == []


def test_lista_scenariuszy_posortowana_po_identyfikatorze() -> None:
    for ident in ("zeta", "alfa", "mid"):
        zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id=ident))
    assert [s.scenario_id for s in lista_scenariuszy(KLUCZ)] == ["alfa", "mid", "zeta"]


def test_uszkodzony_plik_scenariusza_to_jawny_blad() -> None:
    zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="n1"))
    plik = katalog_scenariuszy(KLUCZ) / "n1.json"
    plik.write_text("{to nie jest json", encoding="utf-8")
    with pytest.raises(ScenariuszUszkodzonyError):
        wczytaj_scenariusz(KLUCZ, "n1")
    plik.write_text(
        json.dumps({"rewizje": [{"revision": 1, "scenariusz": {"zle": 1}}]}), encoding="utf-8"
    )
    with pytest.raises(ScenariuszUszkodzonyError):
        wczytaj_scenariusz(KLUCZ, "n1")


def test_awaria_zapisu_nie_zostawia_pliku_roboczego_ani_pol_rewizji(monkeypatch) -> None:
    zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="n1"))
    przed = (katalog_scenariuszy(KLUCZ) / "n1.json").read_bytes()

    def _awaria(self: Path, cel: Path) -> Path:
        raise OSError("nosnik pelny")

    with monkeypatch.context() as kontekst:
        kontekst.setattr(Path, "replace", _awaria)
        with pytest.raises(OSError):
            zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="n1", out_of_service=("ka_a_b",)))
    assert (katalog_scenariuszy(KLUCZ) / "n1.json").read_bytes() == przed
    assert not list(katalog_scenariuszy(KLUCZ).glob("*.tmp"))
    assert stan_scenariusza(KLUCZ, "n1") == scenariusze.StanScenariusza(1, False)


def test_reset_magazynu_kasuje_scenariusze() -> None:
    zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="n1"))
    assert katalog_scenariuszy(KLUCZ).is_dir()
    reset_enm_store()
    assert not katalog_scenariuszy(KLUCZ).exists()


# ---------------------------------------------------------------------------
# Migracja klucza przypadku (CV-1): scenariusze ida za modelem
# ---------------------------------------------------------------------------


def _manifest_scenariusze() -> str:
    wiersze = wiersze_manifestu_legacy()
    assert len(wiersze) == 1
    return str(wiersze[0]["scenariusze"])


def test_migracja_klucza_przenosi_scenariusze_za_modelem() -> None:
    set_enm("case-1", _pierscien())
    zapisz_scenariusz("case-1", _scenariusz(scenario_id="n1", out_of_service=("ka_a_b",)))
    wynik = migruj_klucz_przypadku_do_projektu("case-1", KLUCZ, przyjmij_jako_model_projektu=True)
    assert wynik.status == "PRZENIESIONY" and wynik.scenariusze_przeniesione is True
    assert [s.scenario_id for s in lista_scenariuszy(KLUCZ)] == ["n1"]
    assert not katalog_scenariuszy("case-1").exists()
    assert _manifest_scenariusze() == "ZA_MODELEM"
    rejestr = json.loads((katalog_scenariuszy(KLUCZ) / "n1.json").read_text(encoding="utf-8"))
    assert rejestr["klucz"] == KLUCZ, "plik mowi prawde o tym, gdzie lezy"


def test_migracja_klucza_nie_nadpisuje_scenariuszy_projektu() -> None:
    set_enm("case-1", _pierscien())
    zapisz_scenariusz("case-1", _scenariusz(scenario_id="n1"))
    zapisz_scenariusz(KLUCZ, _scenariusz(scenario_id="wlasny"))
    wynik = migruj_klucz_przypadku_do_projektu("case-1", KLUCZ, przyjmij_jako_model_projektu=True)
    assert wynik.status == "PRZENIESIONY" and wynik.scenariusze_przeniesione is False
    assert [s.scenario_id for s in lista_scenariuszy(KLUCZ)] == ["wlasny"]
    assert _manifest_scenariusze() == "ODLOZONE"
    legacy = (
        Path(scenariusze._store_dir()) / "legacy_przypadki" / katalog_scenariuszy("case-1").name
    )
    assert (legacy / "n1.json").exists()


def test_migracja_klucza_bez_scenariuszy_nazywa_brak() -> None:
    set_enm("case-1", _pierscien())
    wynik = migruj_klucz_przypadku_do_projektu("case-1", KLUCZ, przyjmij_jako_model_projektu=True)
    assert wynik.scenariusze_przeniesione is False
    assert _manifest_scenariusze() == "BRAK"
