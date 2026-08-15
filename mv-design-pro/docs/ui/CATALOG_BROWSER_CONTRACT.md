# Catalog Browser Contract

**Version:** 1.1  
**Status:** CANONICAL  
**Phase:** 2.x.5  
**Standard:** DIgSILENT benchmark — **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **Catalog Browser** dla przeglądania typów elementów pasywnych sieci.

---

## 2. FUNDAMENTALNA ZASADA (BINDING)

```
┌─────────────────────────────────────────────────────────────────┐
│          TYPE jest źródłem prawdy. INSTANCES są użyciami.       │
│                                                                  │
│  TYPE definiuje: R, X, B, I_nom, S_nom (NIEZMIENNE)             │
│  INSTANCE odwołuje się do TYPE (1:N relacja)                    │
│  Edycja TYPE → propagacja do WSZYSTKICH INSTANCES               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Zakres — PASYWNE ELEMENTY TYLKO

| Kategoria | Typy | Status |
|-----------|------|--------|
| **LineType** | Linie napowietrzne, kable | ✓ WŁĄCZONE |
| **CableType** | Kable SN/nN | ✓ WŁĄCZONE |
| **TransformerType** | Transformatory 2/3-uzwojeniowe | ✓ WŁĄCZONE |
| **SwitchType** | Rozłączniki, wyłączniki | ✓ WŁĄCZONE |

---

## 4. FORBIDDEN Categories

| Kategoria | Powód |
|-----------|-------|
| **Source Types** | Parametry Case-dependent (P_gen, Q_gen) |
| **Load Types** | Parametry Case-dependent (P_load, cosφ) |
| **Protection Types** | Parametry nastawcze (I_trip, t_trip) |

---

## 5. Struktura UI

### 5.1 Category List
- Lista kategorii (LineType, CableType, TransformerType, SwitchType)

### 5.2 Type List
- Tabela typów: Type ID, Name, Manufacturer, Rating, Instances Count

### 5.3 Type Details
- Zakładki: Overview, Parameters, Instances, Technical Data

### 5.4 Type → Instances
- Lista wszystkich instancji używających danego Type
- Link do Element Inspector dla każdej instancji

---

## 6. Propagacja zmian TYPE → INSTANCES

1. Edycja TYPE (Designer Mode)
2. Ostrzeżenie: "This change affects {N} instances"
3. Potwierdzenie użytkownika
4. Propagacja do WSZYSTKICH INSTANCES
5. Wyniki → OUTDATED

---

## 7. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Type Library | ✓ | ✓ | ✓ | ✅ FULL |
| Type → Instances | ✓ | ✓ | ✓ | ✅ FULL |
| Propagation | ✓ | ✓ | ✓ | ✅ FULL |
| PASYWNE ONLY | ✓ | ✓ | ✓ | ✅ FULL |

---

**KONIEC KONTRAKTU CATALOG BROWSER**

