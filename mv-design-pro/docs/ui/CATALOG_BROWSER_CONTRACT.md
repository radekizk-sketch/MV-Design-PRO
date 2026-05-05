# Catalog Browser Contract

**Version:** 1.1  
**Status:** CANONICAL  
**Phase:** 2.x.5  
**Standard:** DIgSILENT benchmark — **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **Catalog Browser** dla przeglądania typĂłw elementĂłw pasywnych sieci.

---

## 2. FUNDAMENTALNA ZASADA (BINDING)

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚          TYPE jest ĹşrĂłdĹ‚em prawdy. INSTANCES są uĹĽyciami.       â”‚
â”‚                                                                  â”‚
â”‚  TYPE definiuje: R, X, B, I_nom, S_nom (NIEZMIENNE)             â”‚
â”‚  INSTANCE odwoĹ‚uje się do TYPE (1:N relacja)                    â”‚
â”‚  Edycja TYPE → propagacja do WSZYSTKICH INSTANCES               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 3. Zakres — PASYWNE ELEMENTY TYLKO

| Kategoria | Typy | Status |
|-----------|------|--------|
| **LineType** | Linie napowietrzne, kable | âś“ WĹĄCZONE |
| **CableType** | Kable SN/nN | âś“ WĹĄCZONE |
| **TransformerType** | Transformatory 2/3-uzwojeniowe | âś“ WĹĄCZONE |
| **SwitchType** | RozĹ‚ączniki, wyĹ‚ączniki | âś“ WĹĄCZONE |

---

## 4. FORBIDDEN Categories

| Kategoria | PowĂłd |
|-----------|-------|
| **Source Types** | Parametry Case-dependent (P_gen, Q_gen) |
| **Load Types** | Parametry Case-dependent (P_load, cosĎ†) |
| **Protection Types** | Parametry nastawcze (I_trip, t_trip) |

---

## 5. Struktura UI

### 5.1 Category List
- Lista kategorii (LineType, CableType, TransformerType, SwitchType)

### 5.2 Type List
- Tabela typĂłw: Type ID, Name, Manufacturer, Rating, Instances Count

### 5.3 Type Details
- ZakĹ‚adki: Overview, Parameters, Instances, Technical Data

### 5.4 Type → Instances
- Lista wszystkich instancji uĹĽywających danego Type
- Link do Element Inspector dla kaĹĽdej instancji

---

## 6. Propagacja zmian TYPE → INSTANCES

1. Edycja TYPE (Designer Mode)
2. OstrzeĹĽenie: "This change affects {N} instances"
3. Potwierdzenie uĹĽytkownika
4. Propagacja do WSZYSTKICH INSTANCES
5. Wyniki → OUTDATED

---

## 7. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Type Library | âś“ | âś“ | âś“ | âś… FULL |
| Type → Instances | âś“ | âś“ | âś“ | âś… FULL |
| Propagation | âś“ | âś“ | âś“ | âś… FULL |
| PASYWNE ONLY | âś“ | âś“ | âś“ | âś… FULL |

---

**KONIEC KONTRAKTU CATALOG BROWSER**

