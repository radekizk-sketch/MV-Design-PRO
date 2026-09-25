"""Proces B dla `tests/test_v126_canonical_run_persistence.py`.

WŁASNY interpreter Pythona, uruchomiony jako subprocess przez test — czyta
bieg V12.6 zapisany przez proces A (test) WYŁĄCZNIE przez plik bazy wskazany
`DATABASE_URL` (env var), zero stanu współdzielonego poza tym plikiem. Wypisuje
JEDNĄ linię JSON na stdout; kod wyjścia 0 = bieg znaleziony i odczytany.
"""

from __future__ import annotations

import json
import sys
from uuid import UUID

from enm.canonical_analysis import get_run


def main() -> int:
    run_id = UUID(sys.argv[1])
    run = get_run(run_id)
    if run is None:
        print(json.dumps({"found": False}))
        return 1
    print(
        json.dumps(
            {
                "found": True,
                "run_id": str(run.id),
                "case_id": run.case_id,
                "status": run.status,
                "analysis_type": run.analysis_type,
                "deterministic_hash": (run.raw_result or {}).get("deterministic_hash"),
                "result_present": bool((run.raw_result or {}).get("result")),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
