Jesteś niezależnym reviewerem i implementatorem frontend/SCADA-CAD dla MV-DESIGN-PRO. Masz być brutalnie szczery i maksymalnie praktyczny.

Problem zgłoszony przez użytkownika:
- Aktywny SLD V2 nadal wygląda 0/10 w widoku stacji SN/nN.
- Symbol transformatora SN/nN jest nieakceptowalny: okręgi uzwojeń muszą się wyraźnie przecinać, a symbol ma wyglądać jak kanoniczny symbol transformatora, nie jak przypadkowe kółka.
- Każdy element widoczny w stacji ma być klikalny i konfigurowalny: pola WE/WY/TR, porty, aparaty, transformator, strona nN/PCC/DER.
- UI ma być po polsku technicznym, bez dead-clicks, bez fałszywego 0.00.

Kontekst repo:
- Pracujesz w repo mv-design-pro.
- Zachowaj granice architektury: UI/renderery nie liczą fizyki, nie zmieniają solverów ani frozen result API.
- SLD musi wynikać z ENM/domain topology, ale w tej iteracji skup się na renderze i interakcji zgłoszonego widoku.
- Nie proponuj dekoracji. Proponuj przemysłowy SCADA/CAD: czytelność, semantyka, hit-area, tooltip, aria-label, testy.

Pliki do audytu i możliwej poprawy:
- frontend/src/ui/sld/v2/canvas/StationInternalView.tsx
- frontend/src/ui/sld/v2/renderer/DeviceRenderer.tsx
- frontend/src/ui/sld/v2/renderer/GpzApparatusSymbols.tsx
- frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx
- frontend/src/ui/sld/v2/renderer/BayRenderer.tsx
- frontend/src/ui/sld/v2/__tests__/StationInternalView.test.tsx
- frontend/src/ui/sld/v2/__tests__/renderers.test.tsx
- frontend/src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx

Zadanie:
1. Przejrzyj powyższe pliki i oceń, dlaczego symbol TR i klikalność są nadal słabe.
2. Zaproponuj konkretne poprawki implementacyjne, najlepiej jako unified diff albo bardzo precyzyjny patch per plik.
3. Wymagaj, aby symbol transformatora miał:
   - dwa przecinające się okręgi o jednoznacznej geometrii,
   - jawne data-symbol-canon="transformer_intersecting_circles",
   - data-transformer-circles-intersect="true",
   - data-transformer-winding="SN" i "nN",
   - większy transparentny hit-area,
   - title/aria-label/role/keyboard handlers tam, gdzie element jest interaktywny.
4. Wymagaj, aby pole/aparat/port/transformator miały spójną ścieżkę konfiguracji: click/double-click/right-click/Enter/Space prowadzi do karty technicznej lub konfiguratora właściwego obiektu.
5. Dodaj/zmień testy tak, żeby regresja była niemożliwa: geometria przecięcia okręgów, hit-area, klik pola, klik portu, klik transformatora, brak martwego symbolu TR.
6. Nie wymyślaj fizyki sieci i nie ruszaj solverów. To jest UI/SLD/interaction fix.

Zwróć dokładnie sekcje:
# Ocena 0/10: przyczyny
# Poprawki must-fix
# Patch rekomendowany
# Testy akceptacyjne
# Ryzyka
# Czego nie ruszać
