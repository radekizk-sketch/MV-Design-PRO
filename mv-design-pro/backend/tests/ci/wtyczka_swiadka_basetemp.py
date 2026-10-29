"""Wtyczka testu `test_sprzatanie_basetemp.py`: dowód, że katalog bazowy powstał w trakcie
biegu (inaczej test sprzątania przechodziłby na katalogu, którego nigdy nie było). Ścieżkę
`tmp_path` każdego testu dopisuje do pliku `SWIADEK_BASETEMP` (poza katalogiem bazowym)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_teardown(item: pytest.Item):
    tmp = getattr(item, "funcargs", {}).get("tmp_path")
    if tmp is not None and Path(tmp).exists():
        with open(os.environ["SWIADEK_BASETEMP"], "a", encoding="utf-8") as plik:
            plik.write(f"{tmp}\n")
    yield
