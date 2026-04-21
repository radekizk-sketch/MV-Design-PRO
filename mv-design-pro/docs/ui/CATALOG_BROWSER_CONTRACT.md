# Catalog Browser Contract

**Version:** 1.1  
**Status:** CANONICAL  
**Phase:** 2.x.5  
**Standard:** DIgSILENT benchmark â€” **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **Catalog Browser** dla przeglÄ…dania typĂłw elementĂłw pasywnych sieci.

---

## 2. FUNDAMENTALNA ZASADA (BINDING)

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚          TYPE jest ĹşrĂłdĹ‚em prawdy. INSTANCES sÄ… uĹĽyciami.       â”‚
â”‚                                                                  â”‚
â”‚  TYPE definiuje: R, X, B, I_nom, S_nom (NIEZMIENNE)             â”‚
â”‚  INSTANCE odwoĹ‚uje siÄ™ do TYPE (1:N relacja)                    â”‚
â”‚  Edycja TYPE â†’ propagacja do WSZYSTKICH INSTANCES               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 3. Zakres â€” PASYWNE ELEMENTY TYLKO

| Kategoria | Typy | Status |
|-----------|------|--------|
| **LineType** | Linie napowietrzne, kable | âś“ WĹÄ„CZONE |
| **CableType** | Kable SN/nN | âś“ WĹÄ„CZONE |
| **TransformerType** | Transformatory 2/3-uzwojeniowe | âś“ WĹÄ„CZONE |
| **SwitchType** | RozĹ‚Ä…czniki, wyĹ‚Ä…czniki | âś“ WĹÄ„CZONE |

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

### 5.4 Type â†’ Instances
- Lista wszystkich instancji uĹĽywajÄ…cych danego Type
- Link do Element Inspector dla kaĹĽdej instancji

---

## 6. Propagacja zmian TYPE â†’ INSTANCES

1. Edycja TYPE (Designer Mode)
2. OstrzeĹĽenie: "This change affects {N} instances"
3. Potwierdzenie uĹĽytkownika
4. Propagacja do WSZYSTKICH INSTANCES
5. Wyniki â†’ OUTDATED

---

## 7. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Type Library | âś“ | âś“ | âś“ | âś… FULL |
| Type â†’ Instances | âś“ | âś“ | âś“ | âś… FULL |
| Propagation | âś“ | âś“ | âś“ | âś… FULL |
| PASYWNE ONLY | âś“ | âś“ | âś“ | âś… FULL |

---

**KONIEC KONTRAKTU CATALOG BROWSER**

