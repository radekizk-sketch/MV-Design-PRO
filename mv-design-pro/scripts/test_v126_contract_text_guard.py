from pathlib import Path

import v126_contract_text_guard as guard


def test_odrzuca_zakazany_znacznik(tmp_path: Path) -> None:
    (tmp_path / "contract.py").write_text("# TODO\n", encoding="utf-8")
    assert guard.check_contract_text(tmp_path, ("contract.py",)) == [
        "[v126-contract-text] contract.py: TODO"
    ]


def test_odrzuca_brakujacy_kontrakt(tmp_path: Path) -> None:
    assert guard.check_contract_text(tmp_path, ("brak.py",)) == ["[v126-contract-missing] brak.py"]
