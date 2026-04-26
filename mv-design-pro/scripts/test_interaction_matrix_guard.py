from __future__ import annotations

from pathlib import Path

import interaction_matrix_guard as guard


def write_doc(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def test_guard_reports_missing_required_object(tmp_path, monkeypatch) -> None:
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_INTERAKCJI.md",
        """
| Obiekt | Stan | Klik | 2x klik | Prawy klik | Hover | Skrot | Efekt | Okno docelowe | ENM | Wyniki | Gotowosc |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tlo SLD | edycja | odznacz | dopasuj widok | menu schematu | wspolrzedne | Esc | reset | brak | brak | brak | brak |
""",
    )
    monkeypatch.setattr(guard, "INTERACTION_MATRIX_PATH", matrix_path)

    violations = guard.check_interaction_matrix()

    assert any("[interaction-matrix-object]" in violation for violation in violations)
    assert any("GPZ" in violation for violation in violations)


def test_guard_accepts_complete_required_minimum(tmp_path, monkeypatch) -> None:
    rows = []
    for object_name in sorted(guard.REQUIRED_OBJECTS):
        rows.append(
            f"| {object_name} | kompletny | wybierz | otworz | menu | szczegoly | Enter | inspektor | okno | brak | brak | brak |"
        )
    matrix_path = write_doc(
        tmp_path,
        "MACIERZ_INTERAKCJI.md",
        "\n".join(
            [
                "| Obiekt | Stan | Klik | 2x klik | Prawy klik | Hover | Skrot | Efekt | Okno docelowe | ENM | Wyniki | Gotowosc |",
                "|---|---|---|---|---|---|---|---|---|---|---|---|",
                *rows,
            ]
        ),
    )
    monkeypatch.setattr(guard, "INTERACTION_MATRIX_PATH", matrix_path)

    assert guard.check_interaction_matrix() == []
