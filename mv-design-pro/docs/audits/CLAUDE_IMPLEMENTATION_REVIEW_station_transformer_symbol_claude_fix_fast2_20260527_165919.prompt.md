MV-DESIGN-PRO SLD V2: zrób niezależny, bezlitosny code review konkretnego defektu i podaj patch.

Defekt: w aktywnym widoku stacji SN/nN symbol transformatora wygląda źle. Okręgi uzwojeń TR muszą się wyraźnie przecinać. Każdy element pola/stacji ma być klikalny i konfigurowalny. Użytkownik ocenia 0/10.

Sprawdź pliki:
frontend/src/ui/sld/v2/canvas/StationInternalView.tsx
frontend/src/ui/sld/v2/renderer/DeviceRenderer.tsx
frontend/src/ui/sld/v2/renderer/GpzApparatusSymbols.tsx
frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx
frontend/src/ui/sld/v2/__tests__/StationInternalView.test.tsx
frontend/src/ui/sld/v2/__tests__/renderers.test.tsx

Nie ruszaj solverów/fizyki. To tylko UI/SLD/interaction. Nie udawaj, nie ogólnikuj.

Zwróć krótko:
1. Największe błędy w obecnym kodzie.
2. Dokładny patch/rekomendacje na poziomie plików i atrybutów.
3. Testy, które muszą przejść.
4. Acceptance criteria.
