from __future__ import annotations

from application.analyses.protection.catalog.pipeline import run_device_mapping_v0
from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)
from application.analyses.run_index import index_run

from tests.utils.determinism import assert_deterministic


def _seed_protection_run(uow_factory, *, settings: dict | None = None, sufiks: str = "seed") -> str:
    run_id = f"protection.overcurrent.v0:{sufiks}"
    settings = settings or {
        "curve": "IEC_NI",
        "i_pickup_51_a": 120.0,
        "tms_51": 0.2,
        "i_inst_50_a": 800.0,
        "i_pickup_51n_a": 60.0,
        "tms_51n": 0.3,
        "i_inst_50n_a": 300.0,
    }
    report = {"settings": settings}

    inputs = InputsRef(
        base_snapshot_id="snapshot-1",
        spec_ref=None,
        inline={
            "connection_node": {
                "id": "BoundaryNode-1",
                "label": "BoundaryNode – węzeł przyłączenia",
            }
        },
    )
    artifacts = (ArtifactRef(type="protection_report_v0", id="protection_report_v0:seed"),)
    trace = TraceRef(type="white_box", id=None, inline={"steps": ["seed"]})
    created_at_utc = "2024-01-01T00:00:00+00:00"
    envelope_dict = {
        "schema_version": "v0",
        "run_id": run_id,
        "analysis_type": "protection.overcurrent.v0",
        "case_id": "case-1",
        "inputs": inputs.to_dict(),
        "artifacts": [artifact.to_dict() for artifact in artifacts],
        "trace": trace.to_dict(),
        "created_at_utc": created_at_utc,
        "fingerprint": "",
    }
    fingerprint = fingerprint_envelope(envelope_dict)
    envelope = AnalysisRunEnvelope(
        run_id=run_id,
        analysis_type="protection.overcurrent.v0",
        case_id="case-1",
        inputs=inputs,
        artifacts=artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fingerprint,
    )
    entry = index_run(
        envelope,
        primary_artifact_type="protection_report_v0",
        primary_artifact_id="protection_report_v0:seed",
        base_snapshot_id="snapshot-1",
        case_id="case-1",
        status="SUCCEEDED",
        meta={"protection_report_v0": report},
    )

    with uow_factory() as uow:
        if uow.analysis_runs_index.get(run_id) is None:
            uow.analysis_runs_index.add(entry)
    return run_id


def test_device_mapping_accepts_supported_device(uow_factory) -> None:
    protection_run_id = _seed_protection_run(uow_factory)

    envelope = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="REF-OC-EF-500",
        uow_factory=uow_factory,
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope.run_id)
    assert stored is not None
    report = stored.meta_json["device_mapping_report_v0"]
    assert report["mapping"]["compatible"] is True
    assert report["mapping"]["violations"] == []


def test_device_mapping_rejects_missing_neutral_functions(uow_factory) -> None:
    protection_run_id = _seed_protection_run(uow_factory)

    envelope = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="REF-OC-200",
        uow_factory=uow_factory,
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope.run_id)
    assert stored is not None
    report = stored.meta_json["device_mapping_report_v0"]
    assert report["mapping"]["compatible"] is False
    assert "UNSUPPORTED_FUNCTION_50N" in report["mapping"]["violations"]
    assert "UNSUPPORTED_FUNCTION_51N" in report["mapping"]["violations"]


def test_device_mapping_is_deterministic(uow_factory) -> None:
    protection_run_id = _seed_protection_run(uow_factory)

    envelope1 = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="REF-OC-EF-500",
        uow_factory=uow_factory,
    )
    envelope2 = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="REF-OC-EF-500",
        uow_factory=uow_factory,
    )

    assert envelope1.fingerprint == envelope2.fingerprint
    assert_deterministic(
        envelope1.to_dict(),
        envelope2.to_dict(),
        scrub_keys=("created_at_utc",),
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope1.run_id)
    assert stored is not None
    report_fingerprint = stored.meta_json["device_mapping_report_v0"]["fingerprint"]
    assert report_fingerprint in envelope1.artifacts[2].id


# ---------------------------------------------------------------------------
# Karta F-K5: nastawa NIEDOSTEPNA (V12K-189) w doborze aparatu.
# Adapter wymuszal float() na kazdym polu, wiec po V12K-189 niedostepna nastawa
# wywalala TypeError w srodku doboru — dokladnie w scenariuszu, ktory V12K-189
# uczynil normalnym (sam bieg 3F: nastawy ziemnozwarciowe sa niewyznaczalne).
# ---------------------------------------------------------------------------

_NASTAWY_BEZ_ZIEMNOZWARCIOWYCH = {
    "curve": "IEC_NI",
    "i_pickup_51_a": 120.0,
    "tms_51": 0.2,
    "i_inst_50_a": 800.0,
    # Bez biegu 1F nie ma podstawy dla nastaw 51N/50N — V12K-189 zwraca None.
    "i_pickup_51n_a": None,
    "tms_51n": 0.3,
    "i_inst_50n_a": None,
    "readiness_codes": ["protection.fault_current_missing"],
    "is_complete": False,
}


def test_niedostepna_nastawa_nie_wywala_doboru_i_nie_staje_sie_zerem(uow_factory) -> None:
    protection_run_id = _seed_protection_run(
        uow_factory,
        settings=_NASTAWY_BEZ_ZIEMNOZWARCIOWYCH,
        sufiks="seed-niedostepne",
    )

    envelope = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="REF-OC-EF-500",
        uow_factory=uow_factory,
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope.run_id)
    assert stored is not None
    report = stored.meta_json["device_mapping_report_v0"]
    wymaganie = report["inputs"]["requirement"]
    # Nastawa niedostepna zostaje None — 0,0 byloby wymaganiem, ktorego projekt nie policzyl.
    assert wymaganie["i_pickup_51n_a"] is None
    assert wymaganie["i_inst_50n_a"] is None
    # Do przekaznika nie trafia nastawa, ktorej nie ma; brak jest zadeklarowany jawnie.
    assert "I51N" not in report["mapping"]["mapped_settings"]
    assert "I50N" not in report["mapping"]["mapped_settings"]
    assert "SETTINGS_INCOMPLETE_MISSING_INPUT_DATA" in report["mapping"]["assumptions"]


def test_brak_wartosci_nastawy_nie_moze_naruszyc_zakresu_aparatu(uow_factory) -> None:
    """Niewyznaczona nastawa nie tworzy naruszenia ZAKRESU — nie ma czego porownac.

    Rozroznienie, ktore ten test utrwala: ZAMIAR stopnia i WARTOSC nastawy to dwie
    rozne rzeczy. Mnoznik czasowy tms_51n = 0,3 jest decyzja projektowa (projekt CHCE
    stopnia ziemnozwarciowego zwloocznego), wiec wymaganie funkcji 51N wobec aparatu
    STOI — przekaznik bez 51N tego zamiaru nie zrealizuje. Natomiast prad rozruchowy
    51N jest niewyznaczalny (brak biegu 1F), wiec nie moze wypasc z zakresu aparatu:
    „I51N poza zakresem" byloby werdyktem o liczbie, ktorej nie ma.
    """
    protection_run_id = _seed_protection_run(
        uow_factory,
        settings=_NASTAWY_BEZ_ZIEMNOZWARCIOWYCH,
        sufiks="seed-niedostepne-zakres",
    )

    envelope = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="REF-OC-200",
        uow_factory=uow_factory,
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope.run_id)
    assert stored is not None
    naruszenia = stored.meta_json["device_mapping_report_v0"]["mapping"]["violations"]
    assert "I51N_OUT_OF_RANGE" not in naruszenia
    assert "I50N_OUT_OF_RANGE" not in naruszenia
    # Zamiar stopnia zwlocznego 51N (tms_51n > 0) nadal stawia wymaganie funkcji:
    # aparat bez 51N jest realnie niezgodny z projektem, nie „niesprawdzony".
    assert "UNSUPPORTED_FUNCTION_51N" in naruszenia
