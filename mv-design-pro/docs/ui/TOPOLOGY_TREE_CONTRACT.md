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
  └── STATION
        └── VOLTAGE_LEVEL
              ├── BUSES
              ├── LINES
              ├── TRANSFORMERS
              ├── SOURCES
              ├── LOADS
              └── SWITCHES
```

---

## 3. Synchronizacja (BINDING)

| Klik w Tree | Reakcja |
|-------------|---------|
| Element | SLD centruje + highlight, Inspector otwiera się |
| Station | SLD zoom do stacji |
| Voltage Level | Filtruje wyświetlanie |

---

## 4. SINGLE GLOBAL FOCUS (Phase 2.x.2)

```
Global Focus = (Target Element, Active Case, Active Run, Active Snapshot, Active Analysis)
```

**Zasady:**
1. Jeden globalny fokus współdzielony przez Tree, SLD, Results, Inspector
2. Zmiana w jednym widoku → aktualizacja WSZYSTKICH
3. ESC cofa fokus o poziom (Element→Run→Snapshot→Case)

---

## 5. FORBIDDEN

- Wiele aktywnych fokusów jednocześnie
- Rozjazd kontekstu między widokami
- Reset kontekstu przy przełączaniu widoków

---

## 6. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Hierarchical Tree | ✓ | ✓ | ✓ | ✅ FULL |
| Sync with SLD | ✓ | ✓ | ✓ | ✅ FULL |
| Focus Lock | ✗ | ✗ | ✓ | ➕ SUPERIOR |

---

**KONIEC KONTRAKTU TOPOLOGY TREE**

