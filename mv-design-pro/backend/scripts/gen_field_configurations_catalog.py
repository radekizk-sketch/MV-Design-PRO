"""Generuje komitowany artefakt katalogu konfiguracji pól (W1c) czytany przez
generator macierzy we frontendzie. JEDNO źródło logiki katalogu — backend
`reference_engine.field_configuration_catalog.enumerate_field_configurations()`;
frontend WYŁĄCZNIE konsumuje ten JSON (zero duplikacji logiki, uwaga 16/17).

Anty-dryf: `tests/network_model/test_field_configurations_catalog.py` asercją
porównuje ten plik z żywym wynikiem enumeracji — plik nie może się rozjechać z
katalogiem bez czerwonego testu.

Uruchomienie (cwd: mv-design-pro/backend):
    poetry run python scripts/gen_field_configurations_catalog.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from reference_engine.field_configuration_catalog import (  # noqa: E402
    enumerate_field_configurations,
)

OUT = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend"
    / "src"
    / "ui"
    / "sld"
    / "v3"
    / "scene"
    / "__tests__"
    / "fixtures"
    / "fieldConfigurationsCatalog.json"
)


def serialize() -> str:
    catalog = enumerate_field_configurations()
    return json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> None:
    OUT.write_text(serialize(), encoding="utf-8")
    catalog = enumerate_field_configurations()
    print(
        f"Zapisano {OUT} — kanoniczne={len(catalog['canonical'])} "
        f"producenckie={len(catalog['producer'])}"
    )


if __name__ == "__main__":
    main()
