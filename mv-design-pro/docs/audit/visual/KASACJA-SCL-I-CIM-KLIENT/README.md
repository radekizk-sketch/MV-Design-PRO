# Karta KASACJA-SCL-I-CIM-KLIENT — menu eksportu schematu, przed i po

Warunki zrzutu (oba identyczne): realny backend (uvicorn) i frontend (vite) uruchomione przez
`scripts/playwright-run.mjs`, Chromium, okno 1600 × 900, motyw ciemny, schemat (SLD) projektu
zbudowanego operacjami domenowymi jak w `frontend/e2e/eksport-cgmes.spec.ts` (źródło GPZ 15 kV,
dwa odcinki kabla, stacja SN/nN typu B z polami IN/OUT/FEEDER/TR i transformatorem), menu
„Eksportuj schemat” rozwinięte natywnym klikiem.

- `menu-eksportu-przed.png` — drzewo bazy `d6c26c3f` (5 pozycji: SVG, PDF, DXF, SCD, CIM).
- `menu-eksportu-po.png` — drzewo karty (4 pozycje: SVG, PDF, DXF, „CGMES — model sieci
  (IEC 61970 EQ+TP)”); zrzut wykonany przez spec `e2e/eksport-cgmes.spec.ts`.

Werdykt wizualny należy do właściciela (bramka B-02); ten katalog niesie wyłącznie materiał.
