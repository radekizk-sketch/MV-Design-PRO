# Global Context Bar Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Standard:** DIgSILENT benchmark / benchmark UI Parity — **SUPERIOR**

---

## 1. Cel dokumentu

Definicja **Global Context Bar** — sticky top bar zawsze widoczny, drukowany w nagĹ‚Ăłwku PDF.

---

## 2. Struktura Context Bar (BINDING)

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ đź“ Project: MV_Network â”‚ đź“‹ Case: SC_MAX â”‚ đź“¸ Snap: 2026-01-28 â”‚ âšˇ Analysis: SC â”‚
â”‚ đź“Ź Norm: IEC 60909 â”‚ đź”§ Mode: Analyst â”‚ đźŽŻ Element: BUS_007 â”‚ đź• 19:30:15 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 3. Sekcje Context Bar

| Sekcja | ZawartoĹ›ć | Dropdown | Akcja klik |
|--------|-----------|----------|------------|
| **Project** | Nazwa projektu | Lista projektĂłw | PrzeĹ‚ącz projekt |
| **Case** | Aktywny Case | Lista Cases | PrzeĹ‚ącz Case |
| **Snapshot** | Aktywny Snapshot | Lista SnapshotĂłw | PrzeĹ‚ącz Snapshot |
| **Analysis** | Typ analizy | SC / PF / THERMAL | PrzeĹ‚ącz Analysis |
| **Norm** | Aktywna norma | IEC / IEEE / PN-EN | PrzeĹ‚ącz normę |
| **Mode** | Expert Mode | 4 tryby | PrzeĹ‚ącz Mode |
| **Element** | Aktywny element | — | OtwĂłrz Inspector |
| **Timestamp** | BieĹĽący czas | — | — |

---

## 4. WĹ‚aĹ›ciwoĹ›ci (BINDING)

1. **Sticky** — zawsze widoczny przy scrollowaniu
2. **Always visible** — nigdy nie ukrywany
3. **Print-First** — drukowany w nagĹ‚Ăłwku PDF/DOCX
4. **Responsive** — collapse na mniejszych ekranach (hamburger menu)
5. **Sync** — aktualizacja przy kaĹĽdej zmianie kontekstu

---

## 5. Drukowanie w PDF

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ MV-DESIGN-PRO — Short-Circuit Analysis Report                   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Project: MV_Network    Case: SC_MAX    Snapshot: 2026-01-28    â”‚
â”‚ Analysis: IEC 60909    Generated: 2026-01-28 19:30:15          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 6. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Sticky Context Bar | âś— | âś— | âś“ | âž• SUPERIOR |
| PDF Header with context | âś— | âś“ | âś“ | âś… FULL |
| Dropdown navigation | âś— | âś“ | âś“ | âś… FULL |
| Expert Mode in bar | âś— | âś— | âś“ | âž• SUPERIOR |
| Element indicator | âś— | âś— | âś“ | âž• SUPERIOR |
| Timestamp live | âś— | âś— | âś“ | âž• SUPERIOR |

**Ocena:** MV-DESIGN-PRO Global Context Bar = SUPERIOR feature âś…

---

## 7. Compliance Checklist

- [ ] Context Bar sticky (always visible)
- [ ] Wszystkie 8 sekcji zaimplementowane
- [ ] Dropdown menu dla przeĹ‚ączania
- [ ] Drukowany w nagĹ‚Ăłwku PDF
- [ ] Responsive design (hamburger < 1024px)

---

**KONIEC KONTRAKTU GLOBAL CONTEXT BAR**

