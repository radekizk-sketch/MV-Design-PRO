"""Generator wykazu PTPiREE: jeden przebieg emituje JEDNA projekcje — snapshot JSON.

Zrodlowych PDF-ow nie ma w repozytorium, wiec testowana jest warstwa emisji
(te same funkcje, ktorych uzyje nastepna regeneracja z PDF-ow) — bez zaleznosci
od pypdf; parser PDF-ow jest w tescie przebiegu podmieniony na gotowe wiersze.
Dawna druga projekcja (kopia TS wykazu we froncie) i tryb wyprowadzania snapshotu
z niej zostaly skasowane w karcie AB-1a D1 (2026-09-23).
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


def test_generator_nie_ma_projekcji_ts() -> None:
    """KLASA: zadna funkcja, stala ani opcja generatora nie emituje ani nie czyta kopii TS."""

    nazwy = {nazwa.lower() for nazwa in vars(generator)}
    assert not {n for n in nazwy if "_ts" in n or n.endswith("ts_path") or "frontend" in n}
    zrodlo = Path(generator.__file__).read_text(encoding="utf-8")
    for slad in ("String.raw", "--from-generated-ts", "--skip-frontend", "render_ts"):
        assert slad not in zrodlo, slad


def test_snapshot_backendu_niesie_te_same_wiersze() -> None:
    snapshot = json.loads(generator.render_backend_snapshot(WIERSZE))

    assert snapshot["schema"] == generator.SNAPSHOT_SCHEMA
    assert snapshot["derived_from"] == generator.DERIVED_FROM
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


def test_przebieg_z_pdf_emituje_wylacznie_snapshot(tmp_path: Path, monkeypatch) -> None:
    """Przebieg `main()` z obu PDF-ow zapisuje JEDEN plik: snapshot JSON w postaci emitera."""

    pdf_1_3 = tmp_path / "wykaz_1_3.pdf"
    pdf_1_2 = tmp_path / "wykaz_1_2.pdf"
    json_out = tmp_path / "wyjscie" / "snapshot.json"
    przekazane: list[dict[str, Path]] = []

    def parser_pdf(sciezki: dict[str, Path]) -> list[dict[str, object]]:
        przekazane.append(dict(sciezki))
        return WIERSZE

    monkeypatch.setattr(generator, "generate_items", parser_pdf)
    monkeypatch.setattr(
        "sys.argv",
        [
            "generate_ptpiree_inverter_catalog.py",
            "--wipwc-1-3-pdf",
            str(pdf_1_3),
            "--wipwc-1-2-pdf",
            str(pdf_1_2),
            "--backend-output",
            str(json_out),
        ],
    )
    generator.main()

    assert przekazane == [{"wipwc_1_3": pdf_1_3, "wipwc_1_2": pdf_1_2}]
    assert sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*")) == [
        "wyjscie",
        "wyjscie/snapshot.json",
    ]
    assert json_out.read_text(encoding="utf-8") == generator.render_backend_snapshot(WIERSZE)


@pytest.mark.parametrize(
    "argumenty",
    [
        [],
        ["--wipwc-1-3-pdf", "a.pdf"],
        ["--wipwc-1-2-pdf", "b.pdf"],
    ],
    ids=["bez-pdf", "tylko-1-3", "tylko-1-2"],
)
def test_bez_obu_pdf_generator_odmawia(monkeypatch, argumenty: list[str]) -> None:
    """Jedynym zrodlem wierszy sa oba PDF-y — brak ktoregokolwiek to odmowa, nie domysl."""

    monkeypatch.setattr("sys.argv", ["generate_ptpiree_inverter_catalog.py", *argumenty])

    with pytest.raises(SystemExit):
        generator.parse_args()
