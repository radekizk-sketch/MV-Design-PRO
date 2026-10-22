"""Samotest dialog_completeness_guard (V12K-351).

Intencja: strażnik ma czerwienieć, gdy operacja z OPERATION_TO_MODAL nie ma dostawcy okna
(ani okna w `ui/topology/modals`, ani kreatora ui2), gdy okno nie jest eksportowane z
`index.ts` oraz gdy katalogu okien brak (fail-closed — wcześniej „brak plików" dawał RC=0).
Drzewa syntetyczne w `tmp_path`; dopasowanie wzorca bez względu na wielkość liter.
"""

from __future__ import annotations

from pathlib import Path

import dialog_completeness_guard as guard


def _drzewo(
    tmp_path: Path,
    monkeypatch,
    *,
    okna: tuple[str, ...],
    kreatory: tuple[str, ...],
    eksporty: tuple[str, ...] | None = None,
    operacje: dict[str, list[str]] | None = None,
) -> None:
    modals = tmp_path / "ui" / "topology" / "modals"
    creators = tmp_path / "ui2" / "kreatory"
    modals.mkdir(parents=True)
    creators.mkdir(parents=True)
    for nazwa in okna:
        (modals / f"{nazwa}.tsx").write_text("export {};\n", encoding="utf-8")
    for nazwa in kreatory:
        (creators / f"{nazwa}.tsx").write_text("export {};\n", encoding="utf-8")
    # Plik testu kreatora nie jest dostawcą okna.
    (creators / "KreatorWidmo.test.tsx").write_text("export {};\n", encoding="utf-8")
    eksportowane = okna if eksporty is None else eksporty
    (modals / "index.ts").write_text(
        "".join(f"export {{ {n} }} from './{n}';\n" for n in eksportowane),
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "MODALS_DIR", modals)
    monkeypatch.setattr(guard, "INDEX_FILE", modals / "index.ts")
    monkeypatch.setattr(guard, "CREATORS_DIR", creators)
    monkeypatch.setattr(
        guard,
        "OPERATION_TO_MODAL",
        operacje
        or {
            "insert_station_on_segment_sn": ["TransformerStation"],
            "add_relay": ["RelayModal"],
            "add_grid_source_sn": ["KreatorZrodlo"],
        },
    )


def test_rzeczywiste_drzewo_jest_czyste() -> None:
    assert guard.main() == 0


def test_komplet_dostawcow_okno_i_kreator_jest_zielony(
    tmp_path, monkeypatch, capsys
) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        okna=("TransformerStationModal", "relaymodal"),
        kreatory=("KreatorZrodloZasilania",),
    )
    assert guard.main() == 0
    assert "OK (2 modals, 3 operations covered)" in capsys.readouterr().out


def test_operacja_bez_dostawcy_jest_czerwona(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, okna=("TransformerStationModal",), kreatory=())
    assert guard.main() == 1
    wyjscie = capsys.readouterr().out
    assert "Operation 'add_relay' has no matching dialog" in wyjscie
    assert "Operation 'add_grid_source_sn' has no matching dialog" in wyjscie


def test_plik_testu_kreatora_nie_jest_dostawca(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        okna=("TransformerStationModal", "RelayModal"),
        kreatory=(),
        operacje={"add_relay": ["RelayModal"], "dodaj_widmo": ["KreatorWidmo"]},
    )
    assert guard.main() == 1
    assert "Operation 'dodaj_widmo' has no matching dialog" in capsys.readouterr().out


def test_okno_bez_eksportu_z_index_jest_czerwone(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        okna=("TransformerStationModal", "RelayModal"),
        kreatory=("KreatorZrodloZasilania",),
        eksporty=("TransformerStationModal",),
    )
    assert guard.main() == 1
    assert "Modal 'RelayModal' not exported from index.ts" in capsys.readouterr().out


def test_brak_katalogu_okien_jest_czerwony(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "MODALS_DIR", tmp_path / "brak")
    monkeypatch.setattr(guard, "INDEX_FILE", tmp_path / "brak" / "index.ts")
    assert guard.main() == 1


def test_brak_index_ts_jest_czerwony(tmp_path, monkeypatch) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        okna=("TransformerStationModal", "RelayModal"),
        kreatory=("KreatorZrodloZasilania",),
    )
    (guard.MODALS_DIR / "index.ts").unlink()
    assert guard.main() == 1
