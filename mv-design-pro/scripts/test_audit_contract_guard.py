"""Samotest audit_contract_guard (korekta V12K-352: opis = wykonywane kontrole).

ILOCZYN CECH: schemat {ścisły, bez additionalProperties, additionalProperties: true,
bez required, zamrożony, niepoprawny JSON} × katalog {istnieje, brak} × index okien
{z eksportem, bez eksportu, brak}.
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
    index = tmp_path / "index.ts"
    index.write_text("export { A } from './A';\n", encoding="utf-8")
    monkeypatch.setattr(guard, "SCHEMAS_DIR", schemas)
    monkeypatch.setattr(guard, "MODAL_INDEX_FILE", index)


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


@pytest.mark.parametrize(("tresc", "fraza"), [(None, "not found"), ("// pusto\n", "no exports")])
def test_index_okien_bez_eksportu_albo_brak(tmp_path, monkeypatch, capsys, tresc, fraza) -> None:
    _drzewo(tmp_path, monkeypatch, {"a.json": _SCISLY})
    if tresc is None:
        guard.MODAL_INDEX_FILE.unlink()
    else:
        guard.MODAL_INDEX_FILE.write_text(tresc, encoding="utf-8")
    assert guard.main() == 1
    assert fraza in capsys.readouterr().out
