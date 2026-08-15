# Global Context Bar Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Standard:** DIgSILENT benchmark / benchmark UI Parity — **SUPERIOR**

---

## 1. Cel dokumentu

Definicja **Global Context Bar** — sticky top bar zawsze widoczny, drukowany w nagłówku PDF.

---

## 2. Struktura Context Bar (BINDING)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 📁 Project: MV_Network │ 📋 Case: SC_MAX │ 📸 Snap: 2026-01-28 │ ⚡ Analysis: SC │
│ 📏 Norm: IEC 60909 │ 🔧 Mode: Analyst │ 🎯 Element: BUS_007 │ 🕐 19:30:15 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Sekcje Context Bar

| Sekcja | Zawartość | Dropdown | Akcja klik |
|--------|-----------|----------|------------|
| **Project** | Nazwa projektu | Lista projektów | Przełącz projekt |
| **Case** | Aktywny Case | Lista Cases | Przełącz Case |
| **Snapshot** | Aktywny Snapshot | Lista Snapshotów | Przełącz Snapshot |
| **Analysis** | Typ analizy | SC / PF / THERMAL | Przełącz Analysis |
| **Norm** | Aktywna norma | IEC / IEEE / PN-EN | Przełącz normę |
| **Mode** | Expert Mode | 4 tryby | Przełącz Mode |
| **Element** | Aktywny element | — | Otwórz Inspector |
| **Timestamp** | Bieżący czas | — | — |

---

## 4. Właściwości (BINDING)

1. **Sticky** — zawsze widoczny przy scrollowaniu
2. **Always visible** — nigdy nie ukrywany
3. **Print-First** — drukowany w nagłówku PDF/DOCX
4. **Responsive** — collapse na mniejszych ekranach (hamburger menu)
5. **Sync** — aktualizacja przy każdej zmianie kontekstu

---

## 5. Drukowanie w PDF

```
┌─────────────────────────────────────────────────────────────────┐
│ MV-DESIGN-PRO — Short-Circuit Analysis Report                   │
├─────────────────────────────────────────────────────────────────┤
│ Project: MV_Network    Case: SC_MAX    Snapshot: 2026-01-28    │
│ Analysis: IEC 60909    Generated: 2026-01-28 19:30:15          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Sticky Context Bar | ✗ | ✗ | ✓ | ➕ SUPERIOR |
| PDF Header with context | ✗ | ✓ | ✓ | ✅ FULL |
| Dropdown navigation | ✗ | ✓ | ✓ | ✅ FULL |
| Expert Mode in bar | ✗ | ✗ | ✓ | ➕ SUPERIOR |
| Element indicator | ✗ | ✗ | ✓ | ➕ SUPERIOR |
| Timestamp live | ✗ | ✗ | ✓ | ➕ SUPERIOR |

**Ocena:** MV-DESIGN-PRO Global Context Bar = SUPERIOR feature ✅

---

## 7. Compliance Checklist

- [ ] Context Bar sticky (always visible)
- [ ] Wszystkie 8 sekcji zaimplementowane
- [ ] Dropdown menu dla przełączania
- [ ] Drukowany w nagłówku PDF
- [ ] Responsive design (hamburger < 1024px)

---

**KONIEC KONTRAKTU GLOBAL CONTEXT BAR**

