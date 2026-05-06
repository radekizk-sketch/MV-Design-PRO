# Expert Modes Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Standard:** DIgSILENT benchmark / benchmark UI Parity — **SUPERIOR**

---

## 1. Cel dokumentu

Definicja **Expert Modes** — systemu trybĂłw eksperckich dostosowujących UI do roli uĹĽytkownika **BEZ ukrywania danych**.

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
- **Default Columns:** WSZYSTKIE (wĹ‚ącznie z X/R, Contributions)
- **Edit Rights:** READ_ONLY
- **Proof Access:** VIEW + EXPORT

### 2.4 Auditor Mode
- **Focus:** Proof, Audit Trail, Metadata
- **Default Columns:** WSZYSTKIE + Metadata (Timestamp, User, Version)
- **Edit Rights:** READ_ONLY
- **Proof Access:** FULL (VIEW + EXPORT + VERIFY)
- **Special:** Proof P11 domyĹ›lnie otwarty

---

## 3. NO SIMPLIFICATION RULE (INVARIANT)

1. NIE istnieje "Basic Mode" z okrojonym UI
2. NIE istnieje "Advanced Mode" z peĹ‚nym UI
3. ISTNIEJE JEDEN UI z opcjami widocznoĹ›ci
4. Expert Modes zmieniają DOMYĹšLNE ustawienia, NIE ukrywają
5. UĹĽytkownik ZAWSZE moĹĽe pokazać ukryte sekcje/kolumny

**VIOLATION = REGRESJA wymagająca HOTFIX**

---

## 4. Expert Modes â‰  Access Control

| Expert Modes | Access Control |
|--------------|----------------|
| Zmieniają *domyĹ›lne widocznoĹ›ci* | Blokują *dostęp* |
| UĹĽytkownik moĹĽe pokazać ukryte | UĹĽytkownik NIE moĹĽe odblokować |
| UX convenience | Security enforcement |
| Frontend-only | Backend-enforced |

---

## 5. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| User Modes | âś— | âś— | âś“ (4 modes) | âž• SUPERIOR |
| Mode-based Visibility | âś— | âś— | âś“ | âž• SUPERIOR |
| NO SIMPLIFICATION RULE | N/A | N/A | âś“ | âž• SUPERIOR |

**Ocena:** MV-DESIGN-PRO Expert Modes = SUPERIOR feature âś…

---

## 6. Compliance Checklist

- [ ] 4 tryby: Operator, Designer, Analyst, Auditor
- [ ] NO SIMPLIFICATION RULE (wszystko dostępne)
- [ ] Column Picker dla WSZYSTKICH kolumn
- [ ] Edit Rights = FULL tylko dla Designer
- [ ] Zmiana trybu zachowuje kontekst

---

**KONIEC KONTRAKTU EXPERT MODES**

