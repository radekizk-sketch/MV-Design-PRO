"""Katalog pakietów baterii BESS (karta FAB-J).

Pakiet baterii to sprzęt ODDZIELNY od przekształtnika/PCS magazynu energii
(`ConverterType`/`ZRODLO_NN_BESS` — moc, Q, cosφ) — magazyn BESS to zawsze
dwie pozycje zakupowe: przekształtnik i pakiet baterii (energia, napięcie DC,
C-rate, chemia). Backend NIE MIAŁ tego katalogu w ogóle; front trzymał go
jako statyczną listę frontendową (`station-der/catalogs.ts::BESS_BATTERY_CATALOG`).

PROWENIENCJA. Dwie pozycje mirrorowane z frontendu (`bess_bat_byd_2880`/
`bess_bat_catl_5000`) niosły w identyfikatorze markę producenta (BYD, CATL)
BEZ karty katalogowej potwierdzającej te konkretne liczby — dokładnie ten sam
wzorzec „marka + zaokrąglone liczby bez źródła", jaki karta K-Q usunęła z
`PV_INVERTER_CATALOG`/`WIND_TURBINE_CATALOG` (patrz `_DEFAULT_SOURCE_REFERENCE`
poniżej). Liczby (2880/5000 kWh, 1230/1500 V DC) są fizycznie wiarygodne dla
kontenerowych magazynów sieciowych LFP tej klasy — zostają jako profile
REFERENCYJNE, tylko bez marki w identyfikatorze i z jawnym źródłem.
C-rate 0,5 (2-godzinny czas pełnego rozładowania) to typowa wartość
referencyjna dla magazynów sieciowych — nie dana konkretnego wyrobu.
"""

from __future__ import annotations

from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

_DEFAULT_SOURCE_REFERENCE = "Katalog przeksztaltnikow MV-DESIGN-PRO / profil przemyslowy V1"
_DEFAULT_VERIFICATION_STATUS = CatalogVerificationStatus.REFERENCYJNY.value
_DEFAULT_CATALOG_STATUS = CatalogStatus.REFERENCYJNY_V1.value


def _battery_record(
    *,
    item_id: str,
    name: str,
    chemistry: str,
    capacity_kwh: float,
    nominal_voltage_dc_v: float,
    c_rate: float,
    note: str,
) -> dict:
    return {
        "id": item_id,
        "name": name,
        "params": {
            "chemistry": chemistry,
            "capacity_kwh": capacity_kwh,
            "nominal_voltage_dc_v": nominal_voltage_dc_v,
            "c_rate": c_rate,
            "verification_status": _DEFAULT_VERIFICATION_STATUS,
            "source_reference": _DEFAULT_SOURCE_REFERENCE,
            "catalog_status": _DEFAULT_CATALOG_STATUS,
            "contract_version": CATALOG_CONTRACT_VERSION,
            "verification_note": note,
        },
    }


def get_all_bess_battery_types() -> list[dict]:
    """Zwraca surowe rekordy (id/name/params) — wzorzec `mv_converter_catalog.py`."""
    return [
        _battery_record(
            item_id="bess_bat_lfp_2880kwh_1230vdc",
            name="Pakiet baterii LFP 2 880 kWh · 1 230 V DC (kontenerowy, 2h)",
            chemistry="LFP",
            capacity_kwh=2880.0,
            nominal_voltage_dc_v=1230.0,
            c_rate=0.5,
            note=(
                "Profil referencyjny magazynu kontenerowego LFP klasy 2-3 MWh — "
                "C-rate 0,5 (2 h) typowy dla magazynów sieciowych; niepowiązany "
                "z konkretnym wyrobem/producentem."
            ),
        ),
        _battery_record(
            item_id="bess_bat_lfp_5000kwh_1500vdc",
            name="Pakiet baterii LFP 5 000 kWh · 1 500 V DC (kontenerowy, 2h)",
            chemistry="LFP",
            capacity_kwh=5000.0,
            nominal_voltage_dc_v=1500.0,
            c_rate=0.5,
            note=(
                "Profil referencyjny magazynu kontenerowego LFP dużej pojemności — "
                "C-rate 0,5 (2 h) typowy dla magazynów sieciowych; niepowiązany "
                "z konkretnym wyrobem/producentem."
            ),
        ),
    ]
