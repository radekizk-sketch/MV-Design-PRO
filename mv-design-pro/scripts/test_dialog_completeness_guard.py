"""Samotest dialog_completeness_guard (V12K-351).

Intencja: KAŻDA operacja `CANONICAL_OPERATIONS` ma dokładnie jedną klasyfikację ścieżki
użytkownika — okno (wpis rejestru formularzy z rozwiązywalnym importem), bez okna (plik
interfejsu z literałem operacji + uzasadnienie) albo ścieżka menu (pozycja
`SLD_MENU_REGISTRY` + wykonawca z literałem operacji i pozycji). Operacja niesklasyfikowana
= RC 1. Drzewa syntetyczne w `tmp_path`; iniekcje na rzeczywistym drzewie zdejmują po jednej
klasyfikacji.

ILOCZYN CECH: klasa {okno, bez okna, menu} × usterka {brak, plik dowodu bez literału, plik
nie istnieje, import nierozwiązywalny, pozycja menu nieistniejąca, wykonawca bez pozycji,
klasyfikacja nieaktualna, klasyfikacja przy oknie, wpis spoza rejestru, operacja bez wpisu}.
"""

from __future__ import annotations

from pathlib import Path

import dialog_completeness_guard as guard
import pytest

_REJESTR_TSX = """import type {{ ComponentType }} from 'react';
import {{ KreatorA }} from '../../ui2/kreatory/a';
{importy}
export const OPERATION_FORM_REGISTRY: Readonly<Record<string, ComponentType | null>> = {{
{wpisy}
}};
"""


def _drzewo(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    operacje: tuple[str, ...] = ("add_a", "zmien_b", "przelacz_c"),
    wpisy: dict[str, str] | None = None,
    klasyfikacja: dict[str, object] | None = None,
    plik_b: str = "executeDomainOperation(id, 'zmien_b', {});\n",
    wykonawca: str = "if (a === 'przelacz-c') run('przelacz_c');\n",
    menu: str = "{ id: 'przelacz-c', labelPl: 'Przełącz', section: 'Operacje' },\n",
    importy: str = "",
    z_kreatorem: bool = True,
) -> None:
    backend = tmp_path / "backend" / "src" / "domain"
    backend.mkdir(parents=True)
    (backend / "canonical_operations.py").write_text(
        "CANONICAL_OPERATIONS: dict[str, object] = {\n"
        + "".join(f'    "{op}": object(),\n' for op in operacje)
        + "}\n",
        encoding="utf-8",
    )
    src = tmp_path / "frontend" / "src"
    workspace = src / "ui" / "workspace"
    workspace.mkdir(parents=True)
    if z_kreatorem:
        (src / "ui2" / "kreatory" / "a").mkdir(parents=True)
        (src / "ui2" / "kreatory" / "a" / "index.ts").write_text("export {};\n", encoding="utf-8")
    wpisy = (
        wpisy
        if wpisy is not None
        else {"add_a": "KreatorA", "zmien_b": "null", "przelacz_c": "null"}
    )
    (workspace / "operationFormRegistry.tsx").write_text(
        _REJESTR_TSX.format(
            importy=importy,
            wpisy="\n".join(f"  {k}: {v}," for k, v in wpisy.items()),
        ),
        encoding="utf-8",
    )
    (src / "ui" / "field").mkdir(parents=True)
    (src / "ui" / "field" / "EdytorB.tsx").write_text(plik_b, encoding="utf-8")
    (src / "ui" / "exec.ts").write_text(wykonawca, encoding="utf-8")
    menu_plik = src / "ui" / "SldCommandService.ts"
    menu_plik.write_text(menu, encoding="utf-8")
    modals = src / "ui" / "topology" / "modals"
    modals.mkdir(parents=True)
    (modals / "OknoX.tsx").write_text("export {};\n", encoding="utf-8")
    (modals / "index.ts").write_text("export { OknoX } from './OknoX';\n", encoding="utf-8")

    monkeypatch.setattr(guard, "CANONICAL_OPS_FILE", backend / "canonical_operations.py")
    monkeypatch.setattr(guard, "FRONTEND_SRC", src)
    monkeypatch.setattr(guard, "FORM_REGISTRY_FILE", workspace / "operationFormRegistry.tsx")
    monkeypatch.setattr(guard, "SLD_MENU_FILE", menu_plik)
    monkeypatch.setattr(guard, "MODALS_DIR", modals)
    monkeypatch.setattr(guard, "INDEX_FILE", modals / "index.ts")
    monkeypatch.setattr(
        guard,
        "KLASYFIKACJA_BEZ_FORMULARZA",
        (
            klasyfikacja
            if klasyfikacja is not None
            else {
                "zmien_b": guard.BezOkna(("ui/field/EdytorB.tsx",), "Edycja w miejscu."),
                "przelacz_c": guard.SciezkaMenu(("przelacz-c",), "ui/exec.ts"),
            }
        ),
    )


def _wyjscie(capsys: pytest.CaptureFixture[str]) -> str:
    return capsys.readouterr().out


def test_rzeczywiste_drzewo_jest_czyste(capsys) -> None:
    assert guard.main() == 0
    assert "Dialog Completeness Guard: OK" in _wyjscie(capsys)


@pytest.mark.parametrize("op", sorted(guard.KLASYFIKACJA_BEZ_FORMULARZA))
def test_iniekcja_zdjecie_klasyfikacji_na_rzeczywistym_drzewie(op, monkeypatch, capsys) -> None:
    """Iniekcja: każda operacja bez okna, pozbawiona klasyfikacji, czerwieni strażnika."""
    bez = {k: v for k, v in guard.KLASYFIKACJA_BEZ_FORMULARZA.items() if k != op}
    monkeypatch.setattr(guard, "KLASYFIKACJA_BEZ_FORMULARZA", bez)
    assert guard.main() == 1
    assert f"operacja '{op}' nie ma okna ani klasyfikacji" in _wyjscie(capsys)


def test_komplet_trzech_klas_jest_zielony(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch)
    assert guard.main() == 0
    assert "3 operacji: 1 z oknem, 1 bez okna, 1 z menu" in _wyjscie(capsys)


def test_operacja_niesklasyfikowana_jest_czerwona(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        klasyfikacja={"zmien_b": guard.BezOkna(("ui/field/EdytorB.tsx",), "Edycja w miejscu.")},
    )
    assert guard.main() == 1
    assert "operacja 'przelacz_c' nie ma okna ani klasyfikacji" in _wyjscie(capsys)


def test_operacja_bez_wpisu_w_rejestrze_formularzy(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, operacje=("add_a", "zmien_b", "przelacz_c", "nowa_d"))
    assert guard.main() == 1
    assert "operacja 'nowa_d' nie ma wpisu w OPERATION_FORM_REGISTRY" in _wyjscie(capsys)


def test_wpis_spoza_rejestru_i_klasyfikacja_nieaktualna(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, operacje=("add_a", "zmien_b"))
    assert guard.main() == 1
    wyjscie = _wyjscie(capsys)
    assert "wpis OPERATION_FORM_REGISTRY 'przelacz_c' nie jest operacją kanoniczną" in wyjscie
    assert "klasyfikacja 'przelacz_c' dotyczy operacji spoza rejestru" in wyjscie


def test_klasyfikacja_przy_oknie_jest_czerwona(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        klasyfikacja={
            "add_a": guard.BezOkna(("ui/field/EdytorB.tsx",), "x"),
            "zmien_b": guard.BezOkna(("ui/field/EdytorB.tsx",), "Edycja w miejscu."),
            "przelacz_c": guard.SciezkaMenu(("przelacz-c",), "ui/exec.ts"),
        },
    )
    assert guard.main() == 1
    assert "operacja 'add_a' ma okno KreatorA i jednocześnie klasyfikację" in _wyjscie(capsys)


def test_import_okna_nierozwiazywalny(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, z_kreatorem=False)
    assert guard.main() == 1
    assert "okno operacji 'add_a' (KreatorA) nie rozwiązuje się" in _wyjscie(capsys)


def test_plik_dowodu_bez_literalu_operacji(tmp_path, monkeypatch, capsys) -> None:
    # Wzmianka w komentarzu (`zmien_b`) nie jest wywołaniem.
    _drzewo(tmp_path, monkeypatch, plik_b="// operacja `zmien_b`\n")
    assert guard.main() == 1
    assert "plik ui/field/EdytorB.tsx nie woła tej operacji" in _wyjscie(capsys)


def test_plik_dowodu_nie_istnieje_i_puste_uzasadnienie(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(
        tmp_path,
        monkeypatch,
        klasyfikacja={
            "zmien_b": guard.BezOkna(("ui/field/Brak.tsx",), "  "),
            "przelacz_c": guard.SciezkaMenu(("przelacz-c",), "ui/exec.ts"),
        },
    )
    assert guard.main() == 1
    wyjscie = _wyjscie(capsys)
    assert "plik dowodu ui/field/Brak.tsx nie istnieje" in wyjscie
    assert "klasyfikacja bez okna 'zmien_b' nie ma uzasadnienia" in wyjscie


def test_pozycja_menu_nieistniejaca(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, menu="{ id: 'inna', labelPl: 'Inna' },\n")
    assert guard.main() == 1
    assert "pozycji menu 'przelacz-c' nie ma w rejestrze" in _wyjscie(capsys)


def test_wykonawca_bez_pozycji_albo_bez_operacji(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch, wykonawca="run('przelacz_c');\n")
    assert guard.main() == 1
    assert "nie obsługuje pozycji 'przelacz-c'" in _wyjscie(capsys)
    _drzewo(tmp_path / "2", monkeypatch, wykonawca="if (a === 'przelacz-c') run(x);\n")
    assert guard.main() == 1
    assert "wykonawca ui/exec.ts jej nie woła" in _wyjscie(capsys)


def test_okno_topologii_bez_eksportu(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch)
    (guard.MODALS_DIR / "OknoY.tsx").write_text("export {};\n", encoding="utf-8")
    assert guard.main() == 1
    assert "okno 'OknoY' nie jest eksportowane z index.ts" in _wyjscie(capsys)


def test_brak_zrodla_jest_czerwony(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch)
    guard.SLD_MENU_FILE.unlink()
    assert guard.main() == 1
    assert "brak źródła strażnika" in _wyjscie(capsys)


def test_zmieniony_ksztalt_rejestru_jest_czerwony(tmp_path, monkeypatch, capsys) -> None:
    _drzewo(tmp_path, monkeypatch)
    guard.FORM_REGISTRY_FILE.write_text("export const INNY = {};\n", encoding="utf-8")
    assert guard.main() == 1
    assert "nie odczytano OPERATION_FORM_REGISTRY" in _wyjscie(capsys)
