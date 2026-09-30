"""Wspólne założenie testów adapterów producentów (karta BIEG-ZABEZPIECZEN-Z-MODELU, PZ-09).

Pozycje katalogu producentów nie niosą jednostki zakresów prądowych (``None`` — „jednostka
nieustalona", zakresy nie są używane do sprawdzenia). Testy adapterów badają konwencję KLUCZY
producenta, nie zakresy, więc DEKLARUJĄ jawnie jednostkę ``A_WTORNY`` i przekładnię 1:1
(prąd wymagania = wartość strony wtórnej) — założenie testu, nie dana katalogu. Prawdę
katalogu (odmowa ``ZAKRES_PRADOWY_NIEUSTALONY``) przypina
``test_device_mapping_v0.py::test_zakres_pradowy_porownywany_po_stronie_wtornej``.
"""

from __future__ import annotations

import dataclasses

import pytest
from application.analyses.protection.catalog import pipeline

PRZEKLADNIA_TESTU = (1.0, 1.0)


@pytest.fixture()
def jednostka_zakresu_testu(monkeypatch: pytest.MonkeyPatch) -> tuple[float, float]:
    oryginal = pipeline.load_device_capability

    def z_jednostka(device_id: str):  # type: ignore[no-untyped-def]
        zdolnosc = oryginal(device_id)
        if zdolnosc is None or zdolnosc.jednostka_zakresow_pradowych is not None:
            return zdolnosc
        return dataclasses.replace(
            zdolnosc,
            jednostka_zakresow_pradowych="A_WTORNY",
            podstawa_zakresow_pl="założenie testu adaptera producenta",
        )

    monkeypatch.setattr(pipeline, "load_device_capability", z_jednostka)
    return PRZEKLADNIA_TESTU
