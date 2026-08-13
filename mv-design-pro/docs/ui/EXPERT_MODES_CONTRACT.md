# Expert Modes Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Standard:** DIgSILENT benchmark / benchmark UI Parity — **SUPERIOR**

---

## 1. Cel dokumentu

Definicja **Expert Modes** — systemu trybów eksperckich dostosowujących UI do roli użytkownika **BEZ ukrywania danych**.

**NO SIMPLIFICATION RULE:** Brak "basic UI" i "advanced UI". Jeden interfejs z opcjami.

---

## 2. Tryby eksperckie (BINDING)

### 2.1 Operator Mode
- **Focus:** Status, Violations, Quick Actions
- **Default Columns:** Name, Status, Voltage, Violation
- **Edit Rights:** READ_ONLY
- **Proof Access:** NONE (ukryte, ale dostępne przez menu)

### 2.2 Designer Mode
- **Focus:** Parameters, Catalog, Case Config
- **Default Columns:** Name, Type, Voltage, P, Q, I, Loading, Status
- **Edit Rights:** FULL (edycja modelu)
- **Proof Access:** VIEW (read-only)

### 2.3 Analyst Mode
- **Focus:** Results, Comparisons, Charts
- **Default Columns:** WSZYSTKIE (włącznie z X/R, Contributions)
- **Edit Rights:** READ_ONLY
- **Proof Access:** VIEW + EXPORT

### 2.4 Auditor Mode
- **Focus:** Proof, Audit Trail, Metadata
- **Default Columns:** WSZYSTKIE + Metadata (Timestamp, User, Version)
- **Edit Rights:** READ_ONLY
- **Proof Access:** FULL (VIEW + EXPORT + VERIFY)
- **Special:** Proof P11 domyślnie otwarty

---

## 3. NO SIMPLIFICATION RULE (INVARIANT)

1. NIE istnieje "Basic Mode" z okrojonym UI
2. NIE istnieje "Advanced Mode" z pełnym UI
3. ISTNIEJE JEDEN UI z opcjami widoczności
4. Expert Modes zmieniają DOMYŚLNE ustawienia, NIE ukrywają
5. Użytkownik ZAWSZE może pokazać ukryte sekcje/kolumny

**VIOLATION = REGRESJA wymagająca HOTFIX**

---

## 4. Expert Modes ≠ Access Control

| Expert Modes | Access Control |
|--------------|----------------|
| Zmieniają *domyślne widoczności* | Blokują *dostęp* |
| Użytkownik może pokazać ukryte | Użytkownik NIE może odblokować |
| UX convenience | Security enforcement |
| Frontend-only | Backend-enforced |

---

## 5. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| User Modes | ✗ | ✗ | ✓ (4 modes) | ➕ SUPERIOR |
| Mode-based Visibility | ✗ | ✗ | ✓ | ➕ SUPERIOR |
| NO SIMPLIFICATION RULE | N/A | N/A | ✓ | ➕ SUPERIOR |

**Ocena:** MV-DESIGN-PRO Expert Modes = SUPERIOR feature ✅

---

## 6. Compliance Checklist

- [ ] 4 tryby: Operator, Designer, Analyst, Auditor
- [ ] NO SIMPLIFICATION RULE (wszystko dostępne)
- [ ] Column Picker dla WSZYSTKICH kolumn
- [ ] Edit Rights = FULL tylko dla Designer
- [ ] Zmiana trybu zachowuje kontekst

---

**KONIEC KONTRAKTU EXPERT MODES**

