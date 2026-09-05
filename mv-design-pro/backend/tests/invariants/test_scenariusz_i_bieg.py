"""Inwarianty scenariusza roboczego i biegu kanonicznego (CV-3.1).

I-S1: bieg bez scenariusza i bieg na `SCENARIUSZ_NORMALNY` sa TYM SAMYM biegiem
      (hash migawki, hash wejscia, odcisk semantyczny koperty wersji 1 — bit w bit
      jak przed CV-3.1); koperta wersji 1 z bazy czyta sie jako stan normalny.
I-S2: bieg na scenariuszu z nadpisaniami liczy MIGAWKE EFEKTYWNA: `run.snapshot`
      to ona, `snapshot_hash` = jej hash, walidacja dotyczy jej (odmowa z powodem,
      gdy scenariusz psuje model), koperta wersji 2 niesie referencje i hash.
I-S3: swiezosc biegu na scenariuszu NAZWANYM wynika z rewizji scenariusza w
      magazynie: nowa rewizja → OUTDATED (scenariusz zmieniony), nagrobek →
      OUTDATED (scenariusz usuniety); scenariusz przejsciowy nie ma rewizji i nie
      uniewaznia niczego.
I-S4: scenariusz przejsciowy NIGDY nie trafia do magazynu ani do modelu projektu
      (`set_enm` nie jest wolany, katalog `.scen` nie powstaje).
I-S5: `bieg_wariantu` mowi prawde o tym, co liczy (hash migawki efektywnej, hash
      wejscia z niej, koperta wariantu z rewizja bazy i odciskiem katalogu bazy),
      a wykonanie w pamieci nie dotyka biegu bazowego ani modelu w magazynie.
"""

from __future__ import annotations

import hashlib
import json
from uuid import uuid4

import pytest
from application.result_freshness import (
    FreshnessReason,
    ResultFreshness,
    StanBiezacyModelu,
    swiezosc_biegu_kanonicznego,
)
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm import store
from enm.canonical_analysis import (
    bieg_wariantu,
    create_run,
    execute_run,
    reset_canonical_runs,
    wykonaj_bieg_w_pamieci,
)
from enm.envelope import RevisionEnvelope, zbuduj_koperte
from enm.hash import compute_enm_hash, hash_migawki_enm
from enm.models import EnergyNetworkModel
from enm.scenariusze import (
    SCENARIUSZ_NORMALNY,
    OperatingScenario,
    RodzajScenariusza,
    apply_scenario,
    katalog_scenariuszy,
    lista_scenariuszy,
    usun_scenariusz,
    zapisz_scenariusz,
)
from network_model.catalog.odcisk import odcisk_katalogu_domyslnego

from tests.cgmes.golden_enm import build_golden_enm

KLUCZ = "projekt:6d3f1a2b-7c8d-4e9f-a0b1-c2d3e4f5a6b7"
CASE = "case-scen"


@pytest.fixture(autouse=True)
def _czysty(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_canonical_runs()
    store.reset_enm_store()
    yield
    reset_canonical_runs()
    store.reset_enm_store()


def _model() -> EnergyNetworkModel:
    store.set_enm(KLUCZ, build_golden_enm())
    return store.get_enm(KLUCZ)


def _linia_do_wylaczenia(enm: EnergyNetworkModel) -> str:
    """Galaz, ktorej brak nie odcina zasilania (siec zlota ma rownolegle drogi)."""
    kandydaci = [b.ref_id for b in enm.branches]
    assert kandydaci
    return kandydaci[-1]


def _scenariusz(ident: str, **pola) -> OperatingScenario:
    return OperatingScenario(
        scenario_id=ident, name=f"Scenariusz {ident}", kind=RodzajScenariusza.CUSTOM, **pola
    )


def _stan(enm: EnergyNetworkModel) -> StanBiezacyModelu:
    return StanBiezacyModelu(
        KLUCZ, enm.header.revision, compute_enm_hash(enm), odcisk_katalogu_domyslnego()
    )


# ---------------------------------------------------------------------------
# I-S1
# ---------------------------------------------------------------------------


def test_is1_bieg_bez_scenariusza_i_na_stanie_normalnym_to_ten_sam_bieg() -> None:
    enm = _model()
    bez = create_run(case_id=CASE, klucz_twin=KLUCZ, analysis_type="PF")
    normalny = create_run(
        case_id=CASE, klucz_twin=KLUCZ, analysis_type="PF", scenariusz=SCENARIUSZ_NORMALNY
    )
    assert bez.snapshot_hash == normalny.snapshot_hash == compute_enm_hash(enm)
    assert bez.input_hash == normalny.input_hash
    assert bez.snapshot == normalny.snapshot == enm.model_dump(mode="json")
    assert bez.envelope == normalny.envelope
    assert bez.envelope is not None and bez.envelope["wersja"] == 1
    assert "scenario_ref" not in bez.envelope and "scenario_hash" not in bez.envelope
    assert hash_migawki_enm(bez.snapshot) == bez.snapshot_hash


def test_is1_koperta_wersji_1_ma_odcisk_sprzed_cv3_i_czyta_sie_jako_stan_normalny() -> None:
    koperta = zbuduj_koperte(
        project_id="p",
        model_revision=3,
        snapshot_hash="s",
        catalog_fingerprint="k",
        options_hash="o",
    )
    ladunek = {
        "wersja": 1,
        "project_id": "p",
        "model_revision": 3,
        "snapshot_hash": "s",
        "catalog_fingerprint": "k",
        "options_hash": "o",
    }
    tekst = json.dumps(ladunek, sort_keys=True, separators=(",", ":"))
    assert koperta.semantic_fingerprint == hashlib.sha256(tekst.encode("utf-8")).hexdigest()
    odczyt = RevisionEnvelope.from_dict(koperta.to_dict())
    assert (
        odczyt == koperta and odczyt.scenario_ref is None and odczyt.wersja == 1 and odczyt.spojna
    )


def test_koperta_wersji_2_niesie_scenariusz_i_wykrywa_manipulacje() -> None:
    koperta = zbuduj_koperte(
        project_id="p",
        model_revision=3,
        snapshot_hash="s",
        catalog_fingerprint="k",
        options_hash="o",
        scenario_ref=("n1", 2),
        scenario_hash="h",
    )
    assert koperta.wersja == 2 and koperta.spojna
    dane = koperta.to_dict()
    assert (
        dane["scenario_ref"] == {"scenario_id": "n1", "revision": 2}
        and dane["scenario_hash"] == "h"
    )
    assert RevisionEnvelope.from_dict(dane) == koperta
    zmanipulowana = dict(dane, scenario_hash="inny")
    odczyt = RevisionEnvelope.from_dict(zmanipulowana)
    assert odczyt is not None and not odczyt.spojna
    bez_rewizji = dict(dane, scenario_ref={"scenario_id": "n1"})
    assert RevisionEnvelope.from_dict(bez_rewizji) is None
    with pytest.raises(ValueError):
        zbuduj_koperte(
            project_id="p",
            model_revision=3,
            snapshot_hash="s",
            catalog_fingerprint="k",
            options_hash="o",
            scenario_ref=("n1", 1),
        )


# ---------------------------------------------------------------------------
# I-S2
# ---------------------------------------------------------------------------


def test_is2_bieg_na_scenariuszu_liczy_migawke_efektywna() -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    scenariusz = zapisz_scenariusz(KLUCZ, _scenariusz("n1", out_of_service=(galaz,)))
    run = create_run(case_id=CASE, klucz_twin=KLUCZ, analysis_type="PF", scenariusz=scenariusz)
    efektywna = apply_scenario(enm, scenariusz)
    assert run.snapshot == efektywna.snapshot
    assert galaz not in {b["ref_id"] for b in run.snapshot["branches"]}
    assert run.snapshot_hash == efektywna.snapshot_hash == hash_migawki_enm(run.snapshot)
    assert run.snapshot_hash != compute_enm_hash(enm)
    koperta = run.koperta
    assert koperta is not None and koperta.wersja == 2
    assert koperta.scenario_ref == ("n1", 1) and koperta.scenario_hash == scenariusz.hash
    assert koperta.model_revision == enm.header.revision
    assert (
        koperta.snapshot_hash == compute_enm_hash(enm) != run.snapshot_hash
    ), "koperta identyfikuje BAZE (HEAD), bieg — migawke efektywna"
    assert run.validation and run.readiness, "walidacja policzona dla modelu, ktory jest liczony"
    assert store.get_enm(KLUCZ).model_dump(mode="json") == enm.model_dump(
        mode="json"
    ), "model projektu nietkniety"
    wykonany = execute_run(run.id)
    assert wykonany.status == "FINISHED", wykonany.error_message


def test_is2_scenariusz_psujacy_model_to_odmowa_z_powodem_nie_cicha_degradacja() -> None:
    enm = _model()
    zrodlo = enm.sources[0].ref_id
    with pytest.raises(ValueError):
        create_run(
            case_id=CASE,
            klucz_twin=KLUCZ,
            analysis_type="PF",
            scenariusz=_scenariusz("__bez_zrodla__", out_of_service=(zrodlo,)),
        )


def test_is2_scenariusz_zwarciowy_projektuje_opcje_a_jawne_opcje_maja_pierwszenstwo() -> None:
    enm = _model()
    szyna = enm.buses[0].ref_id
    spec = new_fault_scenario(
        study_case_id=uuid4(),
        name="Zwarcie",
        fault_type=FaultType.SC_3F,
        location=FaultLocation(element_ref=szyna, location_type="BUS"),
        config=ShortCircuitConfig(c_factor=1.05, thermal_time_seconds=0.7),
    )
    scenariusz = OperatingScenario(
        scenario_id="z1", name="Zwarcie", kind=RodzajScenariusza.FAULT_STUDY, fault_spec=spec
    )
    run = create_run(
        case_id=CASE,
        klucz_twin=KLUCZ,
        analysis_type="short_circuit_sn",
        scenariusz=scenariusz,
        options={"c_factor": 1.1},
    )
    assert run.options["fault_type"] == "SC_3F" and run.options["thermal_time_seconds"] == 0.7
    assert run.options["c_factor"] == 1.1, "jawna opcja wolajacego ma pierwszenstwo nad projekcja"
    assert run.options["location"]["element_ref"] == szyna
    assert run.snapshot_hash == compute_enm_hash(enm), "scenariusz zwarciowy nie zmienia migawki"
    assert run.koperta is not None and run.koperta.scenario_ref == ("z1", 1)


# ---------------------------------------------------------------------------
# I-S3
# ---------------------------------------------------------------------------


def test_is3_swiezosc_biegu_wynika_z_rewizji_scenariusza_nazwanego() -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    scenariusz = zapisz_scenariusz(KLUCZ, _scenariusz("n1", out_of_service=(galaz,)))
    run = execute_run(
        create_run(case_id=CASE, klucz_twin=KLUCZ, analysis_type="PF", scenariusz=scenariusz).id
    )
    assert run.status == "FINISHED", run.error_message
    stan = _stan(enm)
    assert swiezosc_biegu_kanonicznego(run, stan).status == ResultFreshness.FRESH
    zapisz_scenariusz(KLUCZ, _scenariusz("n1", gen_scaling={"*": 0.5}))
    werdykt = swiezosc_biegu_kanonicznego(run, stan)
    assert (werdykt.status, werdykt.reason) == (
        ResultFreshness.OUTDATED,
        FreshnessReason.SCENARIUSZ_ZMIENIONY,
    )
    assert werdykt.reason_pl
    usun_scenariusz(KLUCZ, "n1")
    werdykt = swiezosc_biegu_kanonicznego(run, stan)
    assert (werdykt.status, werdykt.reason) == (
        ResultFreshness.OUTDATED,
        FreshnessReason.SCENARIUSZ_USUNIETY,
    )


def test_is3_update_serwisu_scenariusza_zwarciowego_daje_swiezosc_zmieniony() -> None:
    """Karta C6-PERSIST (b): `FaultScenarioService.update_scenario` (nie tylko
    `zapisz_scenariusz` wprost) tworzy NOWĄ rewizję, która unieważnia bieg
    utworzony na rewizji wcześniejszej — ta sama reguła świeżości (I-S3), teraz
    przez publiczne API serwisu scenariuszy zwarciowych. `analysis_type="PF"`
    celowo (fizyka zwarciowa nie jest tu pod testem — mechanizm koperty/rewizji
    jest niezależny od typu analizy)."""
    from application.fault_scenario_service import FaultScenarioService

    enm = _model()
    szyna = enm.buses[0].ref_id
    service = FaultScenarioService()
    scenario = service.create_scenario(
        klucz=KLUCZ,
        study_case_id=uuid4(),
        name="Zwarcie serwisu",
        fault_type="SC_3F",
        location={"element_ref": szyna, "location_type": "BUS"},
    )
    wpis = OperatingScenario(
        scenario_id=str(scenario.scenario_id),
        name=scenario.name,
        kind=RodzajScenariusza.FAULT_STUDY,
        fault_spec=scenario,
    )
    run = execute_run(
        create_run(case_id=CASE, klucz_twin=KLUCZ, analysis_type="PF", scenariusz=wpis).id
    )
    assert run.status == "FINISHED", run.error_message
    assert run.koperta is not None
    assert run.koperta.scenario_ref == (str(scenario.scenario_id), 1)
    stan = _stan(enm)
    assert swiezosc_biegu_kanonicznego(run, stan).status == ResultFreshness.FRESH

    service.update_scenario(KLUCZ, scenario.scenario_id, name="Zwarcie serwisu — po zmianie")
    werdykt = swiezosc_biegu_kanonicznego(run, stan)
    assert (werdykt.status, werdykt.reason) == (
        ResultFreshness.OUTDATED,
        FreshnessReason.SCENARIUSZ_ZMIENIONY,
    )


def test_is3_scenariusz_nieobecny_w_magazynie_to_scenariusz_usuniety() -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    # scenariusz nazwany, ale NIE zapisany (np. bieg przeniesiony z innego magazynu)
    run = execute_run(
        create_run(
            case_id=CASE,
            klucz_twin=KLUCZ,
            analysis_type="PF",
            scenariusz=_scenariusz("obcy", out_of_service=(galaz,)),
        ).id
    )
    werdykt = swiezosc_biegu_kanonicznego(run, _stan(enm))
    assert (werdykt.status, werdykt.reason) == (
        ResultFreshness.OUTDATED,
        FreshnessReason.SCENARIUSZ_USUNIETY,
    )


def test_is3_scenariusz_przejsciowy_nie_uniewaznia_biegu() -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    run = execute_run(
        create_run(
            case_id=CASE,
            klucz_twin=KLUCZ,
            analysis_type="PF",
            scenariusz=_scenariusz("__wariant__", out_of_service=(galaz,)),
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    assert run.koperta is not None and run.koperta.scenario_ref == ("__wariant__", 1)
    assert swiezosc_biegu_kanonicznego(run, _stan(enm)).status == ResultFreshness.FRESH


# ---------------------------------------------------------------------------
# I-S4
# ---------------------------------------------------------------------------


def test_is4_scenariusz_przejsciowy_nigdy_nie_trafia_do_magazynu_ani_do_modelu(monkeypatch) -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    rewizja_przed = store.rewizja_biezaca(KLUCZ)
    wywolania: list[str] = []
    prawdziwy_set_enm = store.set_enm
    monkeypatch.setattr(
        store,
        "set_enm",
        lambda *a, **k: (wywolania.append("set_enm"), prawdziwy_set_enm(*a, **k))[1],
    )
    create_run(
        case_id=CASE,
        klucz_twin=KLUCZ,
        analysis_type="PF",
        scenariusz=_scenariusz("__probe__x", out_of_service=(galaz,)),
    )
    assert wywolania == []
    assert store.rewizja_biezaca(KLUCZ) == rewizja_przed
    assert not katalog_scenariuszy(KLUCZ).exists() and lista_scenariuszy(KLUCZ) == []


# ---------------------------------------------------------------------------
# I-S5
# ---------------------------------------------------------------------------


def test_is5_bieg_wariantu_mowi_prawde_o_migawce_i_nie_dotyka_bazy() -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    baza = execute_run(create_run(case_id=CASE, klucz_twin=KLUCZ, analysis_type="PF").id)
    assert baza.status == "FINISHED", baza.error_message
    migawka_bazy = json.loads(json.dumps(baza.snapshot))
    hash_magazynu = compute_enm_hash(store.get_enm(KLUCZ))
    migawka = apply_scenario(
        EnergyNetworkModel.model_validate(baza.snapshot),
        _scenariusz("__n1__", out_of_service=(galaz,)),
    )
    wariant = bieg_wariantu(baza, migawka, analysis_type="PF")
    assert wariant.snapshot is migawka.snapshot and wariant.snapshot_hash == migawka.snapshot_hash
    assert wariant.input_hash != baza.input_hash and wariant.options == baza.options
    assert wariant.status == "FINISHED" and wariant.raw_result is None
    koperta = wariant.koperta
    assert koperta is not None and koperta.wersja == 2
    assert koperta.scenario_ref == ("__n1__", 1) and koperta.scenario_hash == migawka.scenario_hash
    assert koperta.model_revision == baza.koperta.model_revision == migawka.base_revision
    assert koperta.catalog_fingerprint == baza.koperta.catalog_fingerprint
    assert koperta.snapshot_hash == baza.koperta.snapshot_hash == baza.snapshot_hash
    wykonaj_bieg_w_pamieci(wariant)
    assert wariant.raw_result and wariant.raw_result.get("result_v1")
    assert baza.snapshot == migawka_bazy and baza.raw_result is not None
    assert compute_enm_hash(store.get_enm(KLUCZ)) == hash_magazynu


def test_is5_wariant_na_biegu_scenariusza_z_nadpisaniami_to_odmowa() -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    baza = create_run(
        case_id=CASE,
        klucz_twin=KLUCZ,
        analysis_type="PF",
        scenariusz=_scenariusz("__s1__", out_of_service=(galaz,)),
    )
    migawka = apply_scenario(EnergyNetworkModel.model_validate(baza.snapshot), SCENARIUSZ_NORMALNY)
    with pytest.raises(ValueError, match="skladanie scenariuszy"):
        bieg_wariantu(baza, migawka, analysis_type="PF")


def test_is5_wariant_bazy_bez_koperty_nie_zgaduje_koperty() -> None:
    enm = _model()
    galaz = _linia_do_wylaczenia(enm)
    baza = create_run(case_id=CASE, klucz_twin=KLUCZ, analysis_type="PF")
    baza.envelope = None
    migawka = apply_scenario(enm, _scenariusz("__n1__", out_of_service=(galaz,)))
    wariant = bieg_wariantu(baza, migawka, analysis_type="PF", options={"base_mva": 100.0})
    assert wariant.envelope is None and wariant.options == {"base_mva": 100.0}
    assert wariant.snapshot_hash == migawka.snapshot_hash
