# SLD Render Layers Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 2.x  
**Standard:** DIgSILENT benchmark — **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **dwóch warstw renderingu SLD**: CAD (statyczny schemat) vs SCADA (runtime).

---

## 2. Warstwy (BINDING)

### 2.1 SLD_CAD_LAYER (Statyczny)

| Aspekt | Opis |
|--------|------|
| Cel | Schemat techniczny zgodny z IEC 61082, IEEE 315 |
| Zawartość | Symbole, etykiety, parametry katalogowe |
| Tryb | Wszystkie elementy widoczne (w tym out_of_service) |
| Kolory | Czarno-biały lub paleta IEC |
| Wydruk | ✓ TAK (PDF, DWG) |

### 2.2 SLD_SCADA_LAYER (Runtime)

| Aspekt | Opis |
|--------|------|
| Cel | Monitoring, operacje łączeniowe |
| Zawartość | Stany aparatów, wyniki, alarmy |
| Kolory | Semantyczne (czerwony=alarm, zielony=OK) |
| Animacje | Przepływ mocy, miganie alarmów |
| Wydruk | ✓ TAK (z legendą kolorów) |

---

## 3. Tryby pracy

| Tryb | CAD Layer | SCADA Layer |
|------|-----------|-------------|
| CAD Mode | ✓ WIDOCZNY | ✗ UKRYTY |
| SCADA Mode | ✓ WIDOCZNY (tło) | ✓ WIDOCZNY (overlay) |
| HYBRID Mode | ✓ WIDOCZNY | ✓ KONFIGUROWALNE nakładki |

---

## 4. FORBIDDEN

- Mieszanie parametrów katalogowych w SCADA
- Eksport SCADA bez CAD (wyniki bez schematu)
- Brak legendy kolorów w PDF z SCADA

---

## 5. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| CAD Layer | ✓ | ✓ | ✓ | ✅ FULL |
| SCADA Layer | ✗ | ✓ | ✓ | ✅ FULL |
| Hybrid Mode | ✗ | ✗ | ✓ | ➕ SUPERIOR |

---

**KONIEC KONTRAKTU SLD RENDER LAYERS**

