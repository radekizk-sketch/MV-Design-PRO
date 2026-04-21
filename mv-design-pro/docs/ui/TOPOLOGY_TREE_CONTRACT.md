# Topology Tree Contract

**Version:** 1.1  
**Status:** CANONICAL  
**Phase:** 2.x.2  
**Standard:** DIgSILENT benchmark â€” **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **Topology Tree** â€” hierarchicznej eksploracji sieci jako alternatywy dla SLD.

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
| Element | SLD centruje + highlight, Inspector otwiera siÄ™ |
| Station | SLD zoom do stacji |
| Voltage Level | Filtruje wyĹ›wietlanie |

---

## 4. SINGLE GLOBAL FOCUS (Phase 2.x.2)

```
Global Focus = (Target Element, Active Case, Active Run, Active Snapshot, Active Analysis)
```

**Zasady:**
1. Jeden globalny fokus wspĂłĹ‚dzielony przez Tree, SLD, Results, Inspector
2. Zmiana w jednym widoku â†’ aktualizacja WSZYSTKICH
3. ESC cofa fokus o poziom (Elementâ†’Runâ†’Snapshotâ†’Case)

---

## 5. FORBIDDEN

- Wiele aktywnych fokusĂłw jednoczeĹ›nie
- Rozjazd kontekstu miÄ™dzy widokami
- Reset kontekstu przy przeĹ‚Ä…czaniu widokĂłw

---

## 6. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Hierarchical Tree | âś“ | âś“ | âś“ | âś… FULL |
| Sync with SLD | âś“ | âś“ | âś“ | âś… FULL |
| Focus Lock | âś— | âś— | âś“ | âž• SUPERIOR |

---

**KONIEC KONTRAKTU TOPOLOGY TREE**

