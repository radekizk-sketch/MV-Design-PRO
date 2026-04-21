from __future__ import annotations

import sys

import verify_v12_5 as base

base.REPORT_PATH = base.ROOT / "verification_v12_5_1.md"


if __name__ == "__main__":
    sys.exit(base.main())
