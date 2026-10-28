#!/usr/bin/env python3
"""Samotesty strażników dostawców dialogów operacji domenowych (karta PODSTAWA-Q, commit 3).

Do 2026-10-22 cztery strażniki zaliczały zdolności na podstawie modali
`frontend/src/ui/topology/modals/*.tsx`, których nic nie montowało (jedynym konsumentem był
nierenderowany `TopologyPanel`): `dialog_completeness_guard` (dopasowanie fragmentu nazwy),
`dead_click_guard` (próg liczby eksportów `*Modal`), `audit_contract_guard` (istnienie
`modals/index.ts`, odczyt nieistniejącego `modalRegistry.ts` jako pustego zbioru)
i `nn_source_menu_guard` (dostawcy PV/BESS = martwe pliki modali). Modale skasowano;
strażniki czytają teraz żywych dostawców. Testy niżej przypinają, że:

- każdy strażnik jest zielony na drzewie repozytorium i nie wskazuje katalogu modali,
- dostawca bez literału operacji, nieistniejący komponent, operacja rejestru bez specyfikacji
  w backendzie i brak pliku rejestru są NARUSZENIAMI (iniekcje), a nie cichym zerem.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import audit_contract_guard  # noqa: E402
import dead_click_guard  # noqa: E402
import dialog_completeness_guard  # noqa: E402
import nn_source_menu_guard  # noqa: E402


def _kreator(katalog: Path, nazwa: str, tresc: str) -> Path:
    katalog.mkdir(parents=True, exist_ok=True)
    plik = katalog / f"{nazwa}.tsx"
    plik.write_text(tresc, encoding="utf-8")
    return plik


# --- dialog_completeness_guard -------------------------------------------------------------


def test_dialog_completeness_zielony_na_repo() -> None:
    assert dialog_completeness_guard.main() == 0


def test_dialog_completeness_kazde_okno_ma_zywy_modul_z_literalem_poza_topologia() -> None:
    """Każde okno rejestru formularzy rozwiązuje się do żywego modułu, który wysyła operację,
    i żaden nie leży w skasowanym katalogu modali warstwy topologii (scalenie 2026-10-28:
    wymóg literału programu przeniesiony do klasy OKNO strażnika z gałęzi UI/UX)."""
    g = dialog_completeness_guard
    wpisy, importy = g.rejestr_formularzy(g.FORM_REGISTRY_FILE)
    okna = {op: k for op, k in wpisy.items() if k != "null"}
    assert okna
    for op, komponent in sorted(okna.items()):
        plik = g._rozwiaz_import(g.FORM_REGISTRY_FILE, importy[komponent])
        assert plik is not None, (op, komponent)
        assert "topology" not in plik.relative_to(g.FRONTEND_SRC).parts, (op, plik)
        assert g.modul_wysyla_operacje(plik, op), (op, plik)


def test_dialog_completeness_dostawca_bez_literalu_operacji_jest_naruszeniem(
    tmp_path: Path,
) -> None:
    plik = _kreator(tmp_path / "pomiar", "KreatorPomiaru", "export function KreatorPomiaru() {}\n")

    assert not dialog_completeness_guard.modul_wysyla_operacje(plik, "add_ct")


def test_dialog_completeness_literal_tylko_w_tescie_nie_zalicza(tmp_path: Path) -> None:
    plik = _kreator(tmp_path / "pomiar", "KreatorPomiaru", "export function KreatorPomiaru() {}\n")
    _kreator(tmp_path / "pomiar" / "__tests__", "KreatorPomiaru.test", "op('add_ct');\n")

    assert not dialog_completeness_guard.modul_wysyla_operacje(plik, "add_ct")


def test_dialog_completeness_literal_w_modelu_kreatora_zalicza(tmp_path: Path) -> None:
    plik = _kreator(tmp_path / "pomiar", "KreatorPomiaru", "export function KreatorPomiaru() {}\n")
    (tmp_path / "pomiar" / "pomiarModel.ts").write_text("const OP = 'add_ct';\n", "utf-8")

    assert dialog_completeness_guard.modul_wysyla_operacje(plik, "add_ct")


def test_dialog_completeness_nieistniejacy_dostawca_jest_naruszeniem(tmp_path: Path) -> None:
    rejestr = tmp_path / "operationFormRegistry.tsx"
    rejestr.write_text("", "utf-8")

    assert dialog_completeness_guard._rozwiaz_import(rejestr, "./modals/MeasurementModal") is None


# --- dead_click_guard ----------------------------------------------------------------------


def test_dead_click_rejestr_powierzchni_zielony_na_repo() -> None:
    assert dead_click_guard.check_modal_registry() == []


def test_dead_click_powierzchnia_bez_pliku_komponentu_jest_naruszeniem(
    tmp_path: Path, monkeypatch
) -> None:
    rejestr = tmp_path / "operationSurfaceRegistry.ts"
    wpisy = "".join(
        f"  entry(\n    'op_{i}',\n    'KreatorPomiaru',\n    'x',\n  ),\n"
        for i in range(dead_click_guard.MIN_WPISOW_POWIERZCHNI)
    )
    rejestr.write_text(
        wpisy + "  entry('add_ct', 'MeasurementModal', 'Dodaj przekładnik'),\n", "utf-8"
    )
    monkeypatch.setattr(dead_click_guard, "OPERATION_SURFACE_REGISTRY_FILE", rejestr)

    bledy = dead_click_guard.check_modal_registry()

    assert len(bledy) == 1 and "MeasurementModal" in bledy[0]


def test_dead_click_rejestr_ponizej_progu_jest_naruszeniem(tmp_path: Path, monkeypatch) -> None:
    rejestr = tmp_path / "operationSurfaceRegistry.ts"
    rejestr.write_text("  entry('add_ct', 'KreatorPomiaru', 'Dodaj przekładnik'),\n", "utf-8")
    monkeypatch.setattr(dead_click_guard, "OPERATION_SURFACE_REGISTRY_FILE", rejestr)

    bledy = dead_click_guard.check_modal_registry()

    assert len(bledy) == 1 and "at least" in bledy[0]


# --- audit_contract_guard ------------------------------------------------------------------


def test_audit_contract_zielony_na_repo() -> None:
    assert audit_contract_guard.main() == 0


def test_audit_contract_operacje_rejestru_maja_specyfikacje_backendu() -> None:
    operacje_backendu = audit_contract_guard.extract_backend_operations(
        audit_contract_guard.CANONICAL_OPS_FILE
    )
    operacje, naruszenia = audit_contract_guard.check_operation_surface_registry(
        audit_contract_guard.OPERATION_SURFACE_REGISTRY_FILE, operacje_backendu
    )
    assert naruszenia == []
    assert operacje and operacje <= operacje_backendu


def test_audit_contract_operacja_bez_specyfikacji_jest_naruszeniem(
    tmp_path: Path,
) -> None:
    rejestr = tmp_path / "operationSurfaceRegistry.ts"
    rejestr.write_text("  entry('nieistniejaca_operacja', 'KreatorPomiaru'),\n", "utf-8")

    _, naruszenia = audit_contract_guard.check_operation_surface_registry(rejestr, {"add_ct"})

    assert naruszenia == [
        "Operation surface 'nieistniejaca_operacja' has no backend spec in CANONICAL_OPERATIONS"
    ]


def test_audit_contract_brak_rejestru_jest_naruszeniem(monkeypatch) -> None:
    brak = audit_contract_guard.REPO_ROOT / "frontend" / "src" / "nieistniejacy_rejestr.ts"
    _, naruszenia = audit_contract_guard.check_operation_surface_registry(brak, {"add_ct"})

    assert len(naruszenia) == 1 and "not found" in naruszenia[0]


# --- nn_source_menu_guard ------------------------------------------------------------------


def test_nn_source_dostawcy_zrodel_sa_zywi_i_poza_modalami() -> None:
    for zdolnosc, sciezki in nn_source_menu_guard.DOSTAWCY_ZRODEL_NN:
        assert sciezki, zdolnosc
        for sciezka in sciezki:
            assert "topology/modals" not in sciezka, (zdolnosc, sciezka)
            assert (nn_source_menu_guard.REPO_ROOT / sciezka).is_file(), (
                zdolnosc,
                sciezka,
            )
    assert nn_source_menu_guard.main() == 0


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))
