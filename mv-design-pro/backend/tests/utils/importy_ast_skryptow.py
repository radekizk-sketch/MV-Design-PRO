"""Rozwiązywanie importów w drzewie składni dla testów backendu — `scripts/importy_ast.py`.

Testy backendu, które pilnują granic importów (liść `werdykt`, jedna ścieżka predykatu
nazwy, inwentarz tras sięgających po magazyn ENM), używają TEJ SAMEJ funkcji co bramki CI
w `scripts/` — semantyka interpretera (`importlib.util.resolve_name`), import względny
ponad korzeń drzewa jako jawny wyjątek. Moduł leży poza pakietami backendu, więc jest
ładowany ze ścieżki (ta sama konwencja co ładowanie strażników w `tests/ci/`).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

SCIEZKA = Path(__file__).resolve().parents[3] / "scripts" / "importy_ast.py"


def _zaladuj() -> ModuleType:
    istniejacy = sys.modules.get("importy_ast")
    if istniejacy is not None and Path(istniejacy.__file__ or "").resolve() == SCIEZKA:
        return istniejacy
    spec = importlib.util.spec_from_file_location("importy_ast", SCIEZKA)
    assert spec is not None and spec.loader is not None, SCIEZKA
    modul = importlib.util.module_from_spec(spec)
    sys.modules["importy_ast"] = modul
    spec.loader.exec_module(modul)
    return modul


importy_ast = _zaladuj()

__all__ = ["importy_ast"]
