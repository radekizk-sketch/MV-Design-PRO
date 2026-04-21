# SLD_TYPY_STACJI_KANONICZNE

Status: wiazacy dla aktywnego UI i aktywnego renderingu SLD.

Kod:
- `backend/src/enm/domain_operations.py`
- `frontend/src/ui/sld/FieldBlockRenderer.tsx`
- `frontend/src/ui/sld/core/stationBlockBuilder.ts`

Klasyfikacja widoczna dla uzytkownika:
- stacja koncowa,
- stacja przelotowa,
- stacja odgalezna,
- stacja sekcyjna.

Regula wiazaca:
- aktywne UI, SLD, formularze, karty i inspektory uzywaja wylacznie klasyfikacji topologicznej,
- oznaczenia budowlane i techniczne nie moga wyciekac do warstwy uzytkownika,
- wewnetrzne mapowania techniczne moga istniec wyłącznie jako implementacja backendu lub adaptera migracyjnego.

Mapowanie techniczne:
- `terminal` -> stacja koncowa,
- `inline` -> stacja przelotowa,
- `branch` -> stacja odgalezna,
- `sectional` -> stacja sekcyjna.

Zakazy:
- nie wolno prezentowac uzytkownikowi typow `A/B/C/D`,
- nie wolno prezentowac uzytkownikowi typow budowlanych jako kanonicznych nazw stacji,
- nie wolno utrzymywac drugiej aktywnej prawdy typologii stacji w rendererze pola.
