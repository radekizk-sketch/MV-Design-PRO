# Topology Tree Contract

**Version:** 1.1  
**Status:** CANONICAL  
**Phase:** 2.x.2  
**Standard:** DIgSILENT benchmark — **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **Topology Tree** — hierarchicznej eksploracji sieci jako alternatywy dla SLD.

---

## 2. Hierarchia (BINDING)

```
PROJECT
  â””â”€â”€ STATION
        â””â”€â”€ VOLTAGE_LEVEL
              â”śâ”€â”€ BUSES
              â”śâ”€â”€ LINES
              â”śâ”€â”€ TRANSFORMERS
              â”śâ”€â”€ SOURCES
              â”śâ”€â”€ LOADS
              â””â”€â”€ SWITCHES
```

---

## 3. Synchronizacja (BINDING)

| Klik w Tree | Reakcja |
|-------------|---------|
| Element | SLD centruje + highlight, Inspector otwiera się |
| Station | SLD zoom do stacji |
| Voltage Level | Filtruje wyĹ›wietlanie |

---

## 4. SINGLE GLOBAL FOCUS (Phase 2.x.2)

```
Global Focus = (Target Element, Active Case, Active Run, Active Snapshot, Active Analysis)
```

**Zasady:**
1. Jeden globalny fokus wspĂłĹ‚dzielony przez Tree, SLD, Results, Inspector
2. Zmiana w jednym widoku → aktualizacja WSZYSTKICH
3. ESC cofa fokus o poziom (Element→Run→Snapshot→Case)

---

## 5. FORBIDDEN

- Wiele aktywnych fokusĂłw jednoczeĹ›nie
- Rozjazd kontekstu między widokami
- Reset kontekstu przy przeĹ‚ączaniu widokĂłw

---

## 6. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Hierarchical Tree | âś“ | âś“ | âś“ | âś… FULL |
| Sync with SLD | âś“ | âś“ | âś“ | âś… FULL |
| Focus Lock | âś— | âś— | âś“ | âž• SUPERIOR |

---

**KONIEC KONTRAKTU TOPOLOGY TREE**

