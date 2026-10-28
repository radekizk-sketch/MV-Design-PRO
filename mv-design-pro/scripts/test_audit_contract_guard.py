"""Samotest audit_contract_guard (korekta V12K-352: opis = wykonywane kontrole).

ILOCZYN CECH: schemat {ścisły, bez additionalProperties, additionalProperties: true,
bez required, zamrożony, niepoprawny JSON} × katalog {istnieje, brak} × rejestr powierzchni
operacji {wpisy ze specyfikacją backendu, wpis bez specyfikacji, bez wpisów, brak pliku} ×
rejestr operacji backendu {niepusty, pusty}.
"""

from __future__ import annotations

import json
from pathlib import Path

import audit_contract_guard as guard
import pytest


def _drzewo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, schematy: dict[str, str]) -> None:
    schemas = tmp_path / "schemas"
    schemas.mkdir()
    for nazwa, tresc in schematy.items():
        (schemas / nazwa).write_text(tresc, encoding="utf-8")
    rejestr = tmp_path / "operationSurfaceRegistry.ts"
    rejestr.write_text("entry('add_a', 'KreatorA'),\n", encoding="utf-8")
    operacje = tmp_path / "canonical_operations.py"
    operacje.write_text(
        'CANONICAL_OPERATIONS = {\n    "add_a": OperationSpec(),\n}\n', encoding="utf-8"
    )
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "SCHEMAS_DIR", schemas)
    monkeypatch.setattr(guard, "OPERATION_SURFACE_REGISTRY_FILE", rejestr)
    monkeypatch.setattr(guard, "CANONICAL_OPS_FILE", operacje)


_SCISLY = json.dumps({"type": "object", "additionalProperties": False, "required": ["a"]})


def test_rzeczywiste_drzewo_jest_czyste() -> None:
    assert guard.main() == 0


def test_schemat_scisly_i_zamrozony_sa_zielone(tmp_path, monkeypatch) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        {"a.json": _SCISLY, "resultset_v1_schema.json": json.dumps({"type": "object"})},
    )
    assert guard.main() == 0


@pytest.mark.parametrize(
    ("schemat", "fraza"),
    [
        ({"type": "object", "required": ["a"]}, "missing 'additionalProperties'"),
        (
            {"type": "object", "additionalProperties": True, "required": ["a"]},
            "'additionalProperties: true'",
        ),
        ({"type": "object", "additionalProperties": False}, "no 'required' field"),
    ],
)
def test_schemat_nie_scisly_jest_czerwony(tmp_path, monkeypatch, capsys, schemat, fraza) -> None:
    _drzewo(tmp_path, monkeypatch, {"a.json": json.dumps(schemat)})
    assert guard.main() == 1
    assert fraza in capsys.readouterr().out


def test_niepoprawny_json_jest_czerwony(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, {"a.json": "{nie json"})
    assert guard.main() == 1
    assert "Invalid JSON in a.json" in capsys.readouterr().out


def test_brak_katalogu_schematow_jest_czerwony(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, {"a.json": _SCISLY})
    monkeypatch.setattr(guard, "SCHEMAS_DIR", tmp_path / "brak")
    assert guard.main() == 1
    assert "schemas directory not found" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("tresc", "fraza"),
    [
        (None, "operationSurfaceRegistry.ts not found"),
        ("// pusto\n", "Operation surface registry has no entries"),
        (
            "entry('add_a', 'KreatorA'),\nentry('nowa_b', 'KreatorB'),\n",
            "Operation surface 'nowa_b' has no backend spec in CANONICAL_OPERATIONS",
        ),
    ],
)
def test_rejestr_powierzchni_operacji(tmp_path, monkeypatch, capsys, tresc, fraza) -> None:
    _drzewo(tmp_path, monkeypatch, {"a.json": _SCISLY})
    if tresc is None:
        guard.OPERATION_SURFACE_REGISTRY_FILE.unlink()
    else:
        guard.OPERATION_SURFACE_REGISTRY_FILE.write_text(tresc, encoding="utf-8")
    assert guard.main() == 1
    assert fraza in capsys.readouterr().out


def test_pusty_rejestr_operacji_backendu_jest_czerwony(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, {"a.json": _SCISLY})
    guard.CANONICAL_OPS_FILE.write_text("CANONICAL_OPERATIONS = {}\n", encoding="utf-8")
    assert guard.main() == 1
    assert "No CANONICAL_OPERATIONS found" in capsys.readouterr().out
