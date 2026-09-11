"""Udostępnia `backend/research` na ścieżce importu — WYŁĄCZNIE dla testów.

Żaden moduł w `src/` tego nie robi i nie może: `research/` nie jest pakietem
produkcyjnym (`pyproject.toml::packages`), więc to jedyne miejsce, w którym
laboratorium staje się importowalne. Granica jest strukturalna, nie umowna.
"""

from __future__ import annotations

import sys
from pathlib import Path

_RESEARCH = Path(__file__).resolve().parents[2] / "research"
if str(_RESEARCH) not in sys.path:
    sys.path.insert(0, str(_RESEARCH))
