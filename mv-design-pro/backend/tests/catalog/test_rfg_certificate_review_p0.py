"""P0: stale register is not a certificate; metadata-only historical observation.

Tests use isolated manifest fixtures, so later successful synchronization
will not break the suite and no private PDF or 6k+ registry records required.
"""
from __future__ import annotations

import json
from datetime import date

import pytest
from pydantic import ValidationError

from application.ncrfg_compliance import certificate_review as review
from enm.dowody_urzadzenia import DowodKonfiguracjiUrzadzenia


def test_old_catalog_detected_as_stale(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        review, "get_ptpiree_catalog_manifest",
        lambda: {
            "sources": [
                {"wipwc_version": "1.2", "publication_date": "2026-05-06"},
                {"wipwc_version": "1.3", "publication_date": "2026-05-08"},
            ]
        },
    )
    got = review.ocen_stan_rejestru()
    assert got.stan == "STARSZY_NIZ_OBSERWACJA"
    assert set(got.przestarzale_wersje) == {"1.2", "1.3"}


def test_synced_catalog_only_current_relative_to_observation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        review, "get_ptpiree_catalog_manifest",
        lambda: {
            "sources": [
                {"wipwc_version": "1.2", "publication_date": "2026-10-26"},
                {"wipwc_version": "1.3", "publication_date": "2026-11-06"},
            ]
        },
    )
    got = review.ocen_stan_rejestru()
    assert got.stan == "AKTUALNY_WOBEC_OBSERWACJI"
    assert "nie potwierdza" in got.ostrzezenie_pl


def test_missing_version_not_fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        review, "get_ptpiree_catalog_manifest",
        lambda: {"sources": [{"wipwc_version": "1.3", "publication_date": "2026-11-06"}]},
    )
    got = review.ocen_stan_rejestru()
    assert got.stan == "NIEUSTALONY"
    assert "1.2" in got.brakujace_wersje


def test_installed_firmware_requires_source_and_does_not_use_catalog_as_actual() -> None:
    with pytest.raises(ValidationError, match="dowodu źródłowego"):
        DowodKonfiguracjiUrzadzenia(wersja_oprogramowania="FW1")
    good = DowodKonfiguracjiUrzadzenia(
        wersja_oprogramowania="FW1",
        data_potwierdzenia="2026-11-01",
        zrodlo_pl="protokol SAT nr 2",
    )
    assert good.wersja_oprogramowania == "FW1"


def test_valid_date_parse_and_absence() -> None:
    assert review._data("2026-12-31") == date(2026, 12, 31)
    assert review._data("invalid") is None
    assert review._data(None) is None


def test_certificate_reviewer_no_true_compliance_boolean() -> None:
    result = review._odmowa(
        "pv-1", date(2027, 1, 1), "BRAK_FIRMWARE_AS_BUILT",
        "Nie odczytano wersji."
    )
    assert result.status == "NIE_OCENIONO"
    assert not result.akceptacja_operatora
    assert "BRAK_FIRMWARE" in result.kod


def test_approval_observation_has_no_certification_records() -> None:
    with review._OBSERVATIONS.open(encoding="utf-8") as f:
        observed = json.load(f)
    assert observed["source_use"] == "METADATA_ONLY_NOT_IMPORTED_REGISTRY"
    assert "records" not in observed
    assert observed["checked_at"] == "2026-11-10"
