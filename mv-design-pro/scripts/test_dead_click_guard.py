"""Samotest dead_click_guard (V12K-352).

Intencja: strażnik czyta WSZYSTKIE pozycje żywego rejestru menu SLD — tablice per rodzaj
w `SLD_MENU_REGISTRY` oraz wspólne listy `POZYCJE_*` rozwijane w nie. Przed poprawką kotwica
na pierwszym wystąpieniu nazwy rejestru (komentarz dokumentacyjny) ucinała rejestr do 3 pozycji
i strażnik przechodził „na zielono", sprawdzając prawie nic. Testy:
 - rzeczywiste drzewo: zbiór pozycji strażnika == zbiór obiektów `{ id, …, section }` w pliku
   (także pozycje list `POZYCJE_*`), zero martwych klików;
 - iniekcja pozycji bez wykonawcy w tablicy rodzaju i w liście `POZYCJE_*` → czerwony;
 - pozycje budowy = sekcje „Dodaj" i „Operacje".
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import dead_click_guard as guard

PLIKI = (
    Path("ui/sld/v2/command/SldCommandService.ts"),
    Path("ui/sld/shared/sldActionExecutor.ts"),
    Path("ui/context-menu/SldContextMenuController.tsx"),
    Path("ui/sld/v3/canvas/SldCanvasV3Workspace.tsx"),
)


def _kopia_frontu(tmp_path: Path, monkeypatch) -> Path:
    src = tmp_path / "src"
    for wzgledna in PLIKI:
        cel = src / wzgledna
        cel.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(guard.FRONTEND_SRC / wzgledna, cel)
    monkeypatch.setattr(guard, "FRONTEND_SRC", src)
    monkeypatch.setattr(guard, "CONTEXT_MENU_DIR", src / "ui" / "context-menu")
    monkeypatch.setattr(guard, "SLD_V2_DIR", src / "ui" / "sld" / "v2")
    return src / PLIKI[0]


def _pozycje_w_pliku() -> set[str]:
    tresc = (guard.SLD_V2_DIR / "command" / "SldCommandService.ts").read_text(encoding="utf-8")
    return set(
        re.findall(r"""\{\s*id:\s*'([a-z][a-z0-9_-]+)'[^{}]*?section:\s*'""", tresc, re.DOTALL)
    )


def test_rzeczywiste_drzewo_wszystkie_pozycje_i_brak_martwych_klikow() -> None:
    pozycje = guard.extract_sld_registry_ids()
    assert pozycje == _pozycje_w_pliku()
    # Pozycje list wspólnych `POZYCJE_*` (zdefiniowanych przed literałem rejestru).
    assert {
        "open-switch",
        "close-switch",
        "edit-source-module",
        "show-sc-contributions",
    } <= pozycje
    assert len(pozycje) > 50
    assert guard.check_sld_menu_path() == []


def test_pozycje_budowy_to_sekcje_dodaj_i_operacje() -> None:
    budowa = guard.extract_sld_build_action_ids()
    assert {"insert-gpz", "add-bay", "insert-station", "open-switch"} <= budowa
    assert "conscious-split-on-segment" in budowa
    assert not {"delete-station", "show-results", "open-station-config"} & budowa


def test_iniekcja_pozycji_bez_wykonawcy_w_tablicy_rodzaju(tmp_path, monkeypatch) -> None:
    plik = _kopia_frontu(tmp_path, monkeypatch)
    tresc = plik.read_text(encoding="utf-8")
    kotwica = "{ id: 'open-station-config',"
    assert kotwica in tresc
    plik.write_text(
        tresc.replace(
            kotwica,
            "{ id: 'akcja-bez-wykonawcy', labelPl: 'Pozycja wstrzyknięta', section: 'Otwórz' },\n"
            f"    {kotwica}",
            1,
        ),
        encoding="utf-8",
    )
    bledy = guard.check_sld_menu_path()
    assert any("akcja-bez-wykonawcy" in blad for blad in bledy)


def test_iniekcja_pozycji_bez_wykonawcy_w_liscie_wspolnej(tmp_path, monkeypatch) -> None:
    plik = _kopia_frontu(tmp_path, monkeypatch)
    tresc = plik.read_text(encoding="utf-8")
    kotwica = "const POZYCJE_STANU_LACZNIKA: readonly SldMenuAction[] = ["
    assert kotwica in tresc
    plik.write_text(
        tresc.replace(
            kotwica,
            kotwica + "\n  { id: 'operacja-bez-wykonawcy', labelPl: 'Pozycja wstrzyknięta',"
            " section: 'Operacje' },",
            1,
        ),
        encoding="utf-8",
    )
    bledy = guard.check_sld_menu_path()
    assert any("operacja-bez-wykonawcy" in blad for blad in bledy)
    assert "operacja-bez-wykonawcy" in guard.extract_sld_build_action_ids()


def test_wykonawca_bez_jednego_klasyfikatora_jest_czerwony(tmp_path, monkeypatch) -> None:
    _kopia_frontu(tmp_path, monkeypatch)
    wykonawca = guard.FRONTEND_SRC / "ui" / "sld" / "shared" / "sldActionExecutor.ts"
    tresc = wykonawca.read_text(encoding="utf-8")
    assert "switch (wykonawcaAkcjiMenu(" in tresc
    wykonawca.write_text(
        tresc.replace("switch (wykonawcaAkcjiMenu(", "switch (innyKlasyfikator("),
        encoding="utf-8",
    )
    bledy = guard.check_sld_menu_path()
    assert any("switch (wykonawcaAkcjiMenu(" in blad for blad in bledy)


# Rejestr powierzchni operacji (scalenie 2026-10-28). ILOCZYN CECH: dostawca {plik `.tsx`
# o nazwie komponentu, drugi komponent eksportowany z pliku o innej nazwie, komponent tylko
# w pliku testu, brak} × rejestr {ponad próg, poniżej progu}.
def _rejestr_powierzchni(tmp_path: Path, monkeypatch, wpisy: list[str]) -> Path:
    src = tmp_path / "src"
    kreator = src / "ui2" / "kreatory" / "odbior"
    kreator.mkdir(parents=True)
    (kreator / "KreatorA.tsx").write_text("export function KreatorA() {}\n", encoding="utf-8")
    (kreator / "KreatorOdbioruNn.tsx").write_text(
        "export function KreatorOdbioruNn() {}\nexport function KreatorOdbioruSn() {}\n",
        encoding="utf-8",
    )
    (kreator / "__tests__").mkdir()
    (kreator / "__tests__" / "KreatorTest.test.tsx").write_text(
        "export function KreatorTylkoWTescie() {}\n", encoding="utf-8"
    )
    rejestr = src / "operationSurfaceRegistry.ts"
    rejestr.write_text(
        "\n".join(f"entry('op_{i}', '{k}')," for i, k in enumerate(wpisy)), encoding="utf-8"
    )
    monkeypatch.setattr(guard, "FRONTEND_SRC", src)
    monkeypatch.setattr(guard, "OPERATION_SURFACE_REGISTRY_FILE", rejestr)
    monkeypatch.setattr(guard, "MIN_WPISOW_POWIERZCHNI", 2)
    return rejestr


def test_dostawca_z_pliku_i_z_eksportu_drugiego_komponentu_jest_zywy(tmp_path, monkeypatch):
    _rejestr_powierzchni(tmp_path, monkeypatch, ["KreatorA", "KreatorOdbioruSn"])
    assert guard.check_modal_registry() == []


def test_dostawca_tylko_w_tescie_albo_brak_jest_martwy(tmp_path, monkeypatch):
    _rejestr_powierzchni(
        tmp_path, monkeypatch, ["KreatorA", "KreatorTylkoWTescie", "KreatorNieistniejacy"]
    )
    bledy = guard.check_modal_registry()
    assert len(bledy) == 2
    assert "'KreatorTylkoWTescie'" in bledy[0] and "dead provider" in bledy[0]
    assert "'KreatorNieistniejacy'" in bledy[1]


def test_rejestr_ponizej_progu_jest_czerwony(tmp_path, monkeypatch):
    _rejestr_powierzchni(tmp_path, monkeypatch, ["KreatorA"])
    assert any("expected at least 2" in b for b in guard.check_modal_registry())
