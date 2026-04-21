# SC Node Results Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 2.x.4  
**Standard:** IEC 60909, DIgSILENT benchmark â€” **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **wynikĂłw zwarciowych WYĹÄ„CZNIE per BUS** (wÄ™zĹ‚owo-centryczne).

---

## 2. FUNDAMENTALNA ZASADA (BINDING)

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚              SC RESULTS = RESULTS AT BUS (NODE)                  â”‚
â”‚                                                                  â”‚
â”‚  âś“ Ikâ€ł, ip, Ith â†’ BUS                                           â”‚
â”‚  âś— NIE ISTNIEJE "wynik zwarcia na linii"                        â”‚
â”‚  âś— NIE ISTNIEJE "wynik zwarcia na transformatorze"              â”‚
â”‚                                                                  â”‚
â”‚  Linia / Transformator = IMPEDANCJA, nie wÄ™zeĹ‚                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 3. Struktura wyniku SC per BUS

| Pole | Typ | Jednostka |
|------|-----|-----------|
| bus_id | UUID | â€” |
| fault_type | Enum | 3PH / 1PH / 2PH |
| Ik_max | Float | kA |
| Ik_min | Float | kA |
| ip | Float | kA |
| Ith | Float | kA |
| Sk | Float | MVA |
| X_R | Float | â€” |
| status | Enum | OK / WARNING / VIOLATION |

---

## 4. Prezentacja UI

### 4.1 Results Browser
- Tabela SC z kolumnami: Bus ID, Name, U, Fault Type, Ik_max, Ik_min, ip, Ith, Sk, Status

### 4.2 Element Inspector (Bus)
- ZakĹ‚adka Results â†’ sekcja Short-Circuit Results
- ZakĹ‚adka Contributions â†’ kontrybutorzy do Ikâ€ł

### 4.3 SLD Overlay
- NakĹ‚adka SC **TYLKO na Bus** (Ik_max [kA], Status kolor)
- **FORBIDDEN:** NakĹ‚adka SC na linii lub transformatorze

---

## 5. FORBIDDEN Terminology

| FORBIDDEN | CORRECT |
|-----------|---------|
| "PrÄ…d zwarciowy na linii" | "PrÄ…d zwarciowy w wÄ™Ĺşle BUS_X" |
| "Ikâ€ł na transformatorze" | "Ikâ€ł w wÄ™Ĺşle strony HV/LV transformatora" |
| "Fault current in line" | "Fault current at bus" |

---

## 6. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| SC Results per BUS | âś“ | âś“ | âś“ | âś… FULL |
| Contributions | âś“ | âś“ | âś“ | âś… FULL |
| Bus-only overlay | âś“ | âś“ | âś“ | âś… FULL |
| BRAK SC na linii | âś“ | âś“ | âś“ | âś… FULL |

---

**KONIEC KONTRAKTU SC NODE RESULTS**

