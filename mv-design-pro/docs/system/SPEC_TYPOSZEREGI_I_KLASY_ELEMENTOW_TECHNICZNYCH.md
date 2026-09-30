# SPEC_TYPOSZEREGI_I_KLASY_ELEMENTOW_TECHNICZNYCH

Status: wiazacy dla aktualnego modelu katalogowego.

Kod:
- `backend/src/network_model/catalog/types.py`
- `backend/src/network_model/catalog/repository.py`
- `backend/src/api/catalog.py`

Namespace katalogowe zdefiniowane w kodzie:
- `KABEL_SN`
- `LINIA_SN`
- `TRAFO_SN_NN`
- `APARAT_SN`
- `APARAT_NN`
- `KABEL_NN`
- `CT`
- `VT`
- `OBCIAZENIE`
- `ZRODLO_NN_PV`
- `ZRODLO_NN_BESS`
- `ZABEZPIECZENIE`
- `NASTAWY_ZABEZPIECZEN`
- `CONVERTER`

Klasy techniczne zdefiniowane w modelu:
- `LineType`, `CableType`, `TransformerType`, `SwitchEquipmentType`,
- `MVApparatusType`, `LVApparatusType`, `LVCableType`, `LoadType`,
- `CTType`, `VTType`,
- `ConverterType`, `PVInverterType`, `BESSInverterType`,
- `ProtectionDeviceType`.

Stan katalogu domyslnego:
- realnie wypelnione i wystawiane sa co najmniej: linie SN, kable SN, transformatory SN/nN, aparaty SN, PV, BESS,
- `mv_apparatus_types`, `pv_inverter_types` i `bess_inverter_types` moga byc pochodnymi widokami z innych rekordow,
- obszar ochrony w katalogu domyslnym pozostaje pusty,
- sam fakt istnienia namespace w `types.py` nie oznacza, ze katalog domyslny ma juz realny typoszereg dla tej klasy.

Kontrakt materializacji:
- `MATERIALIZATION_CONTRACTS` istnieja dla wielu namespace,
- aktywna, domknieta sciezka materializacji jest obecnie potwierdzona glownie dla branches, transformers, PV i BESS.
