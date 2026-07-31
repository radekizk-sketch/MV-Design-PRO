# SC Node Results Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 2.x.4  
**Standard:** IEC 60909, DIgSILENT benchmark — **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **wyników zwarciowych WYŁĄCZNIE per BUS** (węzłowo-centryczne).

---

## 2. FUNDAMENTALNA ZASADA (BINDING)

```
┌─────────────────────────────────────────────────────────────────┐
│              SC RESULTS = RESULTS AT BUS (NODE)                  │
│                                                                  │
│  ✓ Ik″, ip, Ith → BUS                                           │
│  ✗ NIE ISTNIEJE "wynik zwarcia na linii"                        │
│  ✗ NIE ISTNIEJE "wynik zwarcia na transformatorze"              │
│                                                                  │
│  Linia / Transformator = IMPEDANCJA, nie węzeł                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Struktura wyniku SC per BUS

| Pole | Typ | Jednostka |
|------|-----|-----------|
| bus_id | UUID | — |
| fault_type | Enum | 3PH / 1PH / 2PH |
| Ik_max | Float | kA |
| Ik_min | Float | kA |
| ip | Float | kA |
| Ith | Float | kA |
| Sk | Float | MVA |
| X_R | Float | — |
| status | Enum | OK / WARNING / VIOLATION |

---

## 4. Prezentacja UI

### 4.1 Results Browser
- Tabela SC z kolumnami: Bus ID, Name, U, Fault Type, Ik_max, Ik_min, ip, Ith, Sk, Status

### 4.2 Element Inspector (Bus)
- Zakładka Results → sekcja Short-Circuit Results
- Zakładka Contributions → kontrybutorzy do Ik″

### 4.3 SLD Overlay
- Nakładka SC **TYLKO na Bus** (Ik_max [kA], Status kolor)
- **FORBIDDEN:** Nakładka SC na linii lub transformatorze

---

## 5. FORBIDDEN Terminology

| FORBIDDEN | CORRECT |
|-----------|---------|
| "Prąd zwarciowy na linii" | "Prąd zwarciowy w węźle BUS_X" |
| "Ik″ na transformatorze" | "Ik″ w węźle strony HV/LV transformatora" |
| "Fault current in line" | "Fault current at bus" |

---

## 6. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| SC Results per BUS | ✓ | ✓ | ✓ | ✅ FULL |
| Contributions | ✓ | ✓ | ✓ | ✅ FULL |
| Bus-only overlay | ✓ | ✓ | ✓ | ✅ FULL |
| BRAK SC na linii | ✓ | ✓ | ✓ | ✅ FULL |

---

**KONIEC KONTRAKTU SC NODE RESULTS**

