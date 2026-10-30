"""Rodzaj aparatu i przekształtnika słowami w odmowach rekordu katalogu (KAT-T-042, KAT-T-050).

Iloczyn cech: {rodzaj aparatury łączeniowej, rodzaj aparatu SN projekcji} × {słownik nazw}
oraz {rodzaj przekształtnika} × {słownik nazw} — słownik RÓWNY zbiorowi rodzajów (węższy
kończyłby się ``KeyError`` w chwili odmowy, szerszy byłby fantomem), a tekst odmowy nie
niesie kodu rodzaju.
"""

from __future__ import annotations

import pytest
from network_model.catalog.niezmienniki_katalogu import OdmowaKatalogu
from network_model.catalog.rodzaje_aparatury import (
    NAZWY_RODZAJOW_APARATU_PL,
    RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA,
    RODZAJE_APARATURY_LACZENIOWEJ,
)
from network_model.catalog.types import (
    NAZWY_RODZAJOW_PRZEKSZTALTNIKA_PL,
    ConverterKind,
    MVApparatusType,
    SwitchEquipmentType,
)


def test_nazwy_rodzajow_aparatu_rowne_rodzajom() -> None:
    rodzaje = set(RODZAJE_APARATURY_LACZENIOWEJ) | set(
        RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA.values()
    )
    assert set(NAZWY_RODZAJOW_APARATU_PL) == rodzaje


def test_nazwy_rodzajow_przeksztaltnika_rowne_wyliczeniu() -> None:
    assert set(NAZWY_RODZAJOW_PRZEKSZTALTNIKA_PL) == set(ConverterKind)


@pytest.mark.parametrize("rodzaj", ["LOAD_SWITCH", "DISCONNECTOR", "EARTH_SWITCH"])
def test_odmowa_wielkosci_niewlasciwej_nazywa_rodzaj_lacznika(rodzaj: str) -> None:
    with pytest.raises(OdmowaKatalogu) as odmowa:
        SwitchEquipmentType(id="t", name="t", equipment_kind=rodzaj, un_kv=12.0, ik_ka=16.0)
    tekst = str(odmowa.value)
    assert f"({NAZWY_RODZAJOW_APARATU_PL[rodzaj]})" in tekst
    assert rodzaj not in tekst


@pytest.mark.parametrize("rodzaj", ["ROZLACZNIK", "ODLACZNIK", "UZIEMNIK"])
def test_odmowa_wielkosci_niewlasciwej_nazywa_rodzaj_aparatu_sn(rodzaj: str) -> None:
    with pytest.raises(OdmowaKatalogu) as odmowa:
        MVApparatusType(
            id="t", name="t", device_kind=rodzaj, u_n_kv=12.0, breaking_capacity_ka=16.0
        )
    tekst = str(odmowa.value)
    assert f"({NAZWY_RODZAJOW_APARATU_PL[rodzaj]})" in tekst
    assert f"({rodzaj})" not in tekst
