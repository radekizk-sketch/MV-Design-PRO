"""Generator wykazu PTPiREE: jeden przebieg emituje DWIE projekcje.

Zrodlowych PDF-ow nie ma w repozytorium, wiec testowana jest warstwa emisji i
wyprowadzenia (te same funkcje, ktorych uzyje nastepna regeneracja z PDF-ow) —
bez zaleznosci od pypdf.
"""

from __future__ import annotations

import json
from pathlib import Path

import generate_ptpiree_inverter_catalog as generator
import pytest

WIERSZE = [
    {
        "id": "ptpiree-wipwc-1-3-row-8-probny-ezhi",
        "sourceId": "ptpiree-wipwc-1-3-2026-05-08",
        "sourceVersion": "WiPWC 1.3",
        "sourceUrl": "https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-08-Wykaz-urzadzen_1.3.pdf",
        "sourcePage": 1,
        "sourceRow": 8,
        "documentNumber": "4479923053408",
        "acceptanceDate": "05.02.2029",
        "manufacturer": "ALTENERGY POWER SYSTEM INC",
        "deviceKind": "Falownik",
        "model": "EZHI - Tylko z modułem zdalnego pozyskiwania danych VCB-5131LN-WB",
        "moduleTypes": ["A"],
        "firmware": "REV 1.0",
        "certificateStatus": "ptpiree_verified",
        "electricalDataStatus": "requires_datasheet",
        "wosVersion": "WOS 2025",
    },
    {
        "id": "ptpiree-wipwc-1-2-row-3254-probny-sun2000",
        "sourceId": "ptpiree-wipwc-1-2-2026-05-06",
        "sourceVersion": "WiPWC 1.2",
        "sourceUrl": "https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-06-Wykaz-urzadzen_1.2.pdf",
        "sourcePage": 300,
        "sourceRow": 3254,
        "documentNumber": "PL-2026-0001",
        "acceptanceDate": "31.12.2026",
        "manufacturer": "HUAWEI Technologies CO., Ltd",
        "deviceKind": "Falownik fotowoltaiczny",
        "model": "PV SUN2000-215KTL-H3",
        "moduleTypes": ["A", "B"],
        "firmware": "V100R001",
        "certificateStatus": "ptpiree_verified",
        "electricalDataStatus": "requires_datasheet",
    },
]


def test_wiersze_wracaja_z_artefaktu_ts_bez_zmian() -> None:
    """Artefakt TS jest wejsciem wyprowadzenia — musi dac sie odczytac 1:1."""

    odczytane = generator.items_from_generated_ts(generator.render_ts(WIERSZE))

    assert odczytane == WIERSZE


def test_artefakt_ts_wskazuje_druga_projekcje() -> None:
    naglowek = generator.render_ts(WIERSZE).split("*/", 1)[0]

    assert generator.BACKEND_ARTIFACT_PATH in naglowek


def test_snapshot_backendu_niesie_te_same_wiersze() -> None:
    snapshot = json.loads(generator.render_backend_snapshot(WIERSZE))

    assert snapshot["schema"] == generator.SNAPSHOT_SCHEMA
    assert snapshot["derived_from"] == generator.FRONTEND_ARTIFACT_PATH
    assert snapshot["record_count"] == len(WIERSZE) == len(snapshot["records"])
    assert {r["id"] for r in snapshot["records"]} == {w["id"] for w in WIERSZE}

    po_id = {r["id"]: r for r in snapshot["records"]}
    ezhi = po_id["ptpiree-wipwc-1-3-row-8-probny-ezhi"]
    assert ezhi["document_number"] == "4479923053408"
    assert ezhi["model"] == WIERSZE[0]["model"]
    assert ezhi["module_types"] == ["A"]
    assert ezhi["wos_version"] == "WOS 2025"
    # ZERO FABRYKACJI: wykaz 1.2 nie podaje wersji WOS.
    assert po_id["ptpiree-wipwc-1-2-row-3254-probny-sun2000"]["wos_version"] is None


def test_snapshot_agreguje_zrodla_z_data_publikacji() -> None:
    snapshot = json.loads(generator.render_backend_snapshot(WIERSZE))

    assert [
        (s["source_id"], s["record_count"], s["publication_date"]) for s in snapshot["sources"]
    ] == [
        ("ptpiree-wipwc-1-2-2026-05-06", 1, "2026-05-06"),
        ("ptpiree-wipwc-1-3-2026-05-08", 1, "2026-05-08"),
    ]


def test_emisja_snapshotu_jest_deterministyczna() -> None:
    pierwszy = generator.render_backend_snapshot(WIERSZE)
    drugi = generator.render_backend_snapshot(list(reversed(WIERSZE)))

    assert pierwszy == drugi
    assert pierwszy.endswith("\n")


def test_data_publikacji_bez_zgadywania() -> None:
    with pytest.raises(ValueError):
        generator.publication_date_from_source_url("https://ptpiree.pl/wykaz.pdf")

    assert (
        generator.publication_date_from_source_url(
            "https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-08-Wykaz-urzadzen_1.3.pdf"
        )
        == "2026-05-08"
    )


def test_brak_ladunku_w_artefakcie_jest_bledem() -> None:
    with pytest.raises(ValueError):
        generator.items_from_generated_ts("const COS_INNEGO = 1;")


def test_jeden_przebieg_emituje_oba_artefakty(tmp_path: Path, monkeypatch) -> None:
    zrodlo = tmp_path / "ptpireeCertifiedInverters.generated.ts"
    zrodlo.write_text(generator.render_ts(WIERSZE), encoding="utf-8")
    ts_out = tmp_path / "out.generated.ts"
    json_out = tmp_path / "out.snapshot.json"

    monkeypatch.setattr(
        "sys.argv",
        [
            "generate_ptpiree_inverter_catalog.py",
            "--from-generated-ts",
            str(zrodlo),
            "--output",
            str(ts_out),
            "--backend-output",
            str(json_out),
        ],
    )
    generator.main()

    assert generator.items_from_generated_ts(ts_out.read_text(encoding="utf-8")) == WIERSZE
    assert json.loads(json_out.read_text(encoding="utf-8"))["record_count"] == len(WIERSZE)


def test_bez_zrodel_generator_odmawia(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["generate_ptpiree_inverter_catalog.py"])

    with pytest.raises(SystemExit):
        generator.parse_args()
