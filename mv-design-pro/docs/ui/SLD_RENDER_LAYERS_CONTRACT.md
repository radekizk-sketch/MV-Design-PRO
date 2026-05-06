# SLD Render Layers Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 2.x  
**Standard:** DIgSILENT benchmark — **FULL PARITY**

---

## 1. Cel dokumentu

Definicja **dwĂłch warstw renderingu SLD**: CAD (statyczny schemat) vs SCADA (runtime).

---

## 2. Warstwy (BINDING)

### 2.1 SLD_CAD_LAYER (Statyczny)

| Aspekt | Opis |
|--------|------|
| Cel | Schemat techniczny zgodny z IEC 61082, IEEE 315 |
| ZawartoĹ›ć | Symbole, etykiety, parametry katalogowe |
| Tryb | Wszystkie elementy widoczne (w tym out_of_service) |
| Kolory | Czarno-biaĹ‚y lub paleta IEC |
| Wydruk | âś“ TAK (PDF, DWG) |

### 2.2 SLD_SCADA_LAYER (Runtime)

| Aspekt | Opis |
|--------|------|
| Cel | Monitoring, operacje Ĺ‚ączeniowe |
| ZawartoĹ›ć | Stany aparatĂłw, wyniki, alarmy |
| Kolory | Semantyczne (czerwony=alarm, zielony=OK) |
| Animacje | PrzepĹ‚yw mocy, miganie alarmĂłw |
| Wydruk | âś“ TAK (z legendą kolorĂłw) |

---

## 3. Tryby pracy

| Tryb | CAD Layer | SCADA Layer |
|------|-----------|-------------|
| CAD Mode | âś“ WIDOCZNY | âś— UKRYTY |
| SCADA Mode | âś“ WIDOCZNY (tĹ‚o) | âś“ WIDOCZNY (overlay) |
| HYBRID Mode | âś“ WIDOCZNY | âś“ KONFIGUROWALNE nakĹ‚adki |

---

## 4. FORBIDDEN

- Mieszanie parametrĂłw katalogowych w SCADA
- Eksport SCADA bez CAD (wyniki bez schematu)
- Brak legendy kolorĂłw w PDF z SCADA

---

## 5. benchmark / benchmark Parity

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| CAD Layer | âś“ | âś“ | âś“ | âś… FULL |
| SCADA Layer | âś— | âś“ | âś“ | âś… FULL |
| Hybrid Mode | âś— | âś— | âś“ | âž• SUPERIOR |

---

**KONIEC KONTRAKTU SLD RENDER LAYERS**

