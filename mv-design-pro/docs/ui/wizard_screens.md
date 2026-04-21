# Wizard Screens â€” Profesjonalna Edycja InĹĽynierska

**Status:** KANONICZNY
**Wersja:** 2.0
**Referencje:** SYSTEM_SPEC.md, ARCHITECTURE.md, PLANS.md, sld_rules.md
**Wzorzec:** DIgSILENT benchmark

---

## Spis TreĹ›ci

1. [Globalna Koncepcja UI](#1-globalna-koncepcja-ui)
2. [Globalny UkĹ‚ad Paneli](#2-globalny-ukĹ‚ad-paneli)
3. [Siatka WĹ‚aĹ›ciwoĹ›ci Obiektu](#3-siatka-wĹ‚aĹ›ciwoĹ›ci-obiektu)
4. [Menu Kontekstowe](#4-menu-kontekstowe)
5. [Przebieg Kreatora â€” PeĹ‚ny Cykl InĹĽynierski](#5-przebieg-kreatora--peĹ‚ny-cykl-inĹĽynierski)
6. [SzczegĂłĹ‚owe Ekrany i Modale](#6-szczegĂłĹ‚owe-ekrany-i-modale)
7. [Modale Zaawansowane](#7-modale-zaawansowane)
8. [Ekrany PrzypadkĂłw Obliczeniowych](#8-ekrany-przypadkĂłw-obliczeniowych)
9. [Obliczenia i Diagnostyka](#9-obliczenia-i-diagnostyka)
10. [Tryb WynikĂłw](#10-tryb-wynikĂłw)
11. [Filozofia KomunikatĂłw](#11-filozofia-komunikatĂłw)
12. [Odniesienia](#12-odniesienia)

---

## 1. Globalna Koncepcja UI

### 1.1 Rola Kreatora (Wizard)

Kreator (Wizard) w MV-DESIGN-PRO peĹ‚ni rolÄ™ analogicznÄ… do **Data Managera** oraz **dialogĂłw edycyjnych obiektĂłw** w DIgSILENT benchmark. Jest to **gĹ‚Ăłwny interfejs** do:

- Definiowania topologii sieci elektroenergetycznej
- Parametryzacji wszystkich elementĂłw modelu
- Konfiguracji przypadkĂłw obliczeniowych
- PrzeglÄ…dania wynikĂłw analiz

**ZASADA KARDYNALNA:** Kreator NIE JEST narzÄ™dziem do "szybkiego projektowania". Jest profesjonalnym Ĺ›rodowiskiem inĹĽynierskim wymagajÄ…cym peĹ‚nej parametryzacji kaĹĽdego elementu.

### 1.2 Tryby Pracy

System operuje w trzech rozĹ‚Ä…cznych trybach pracy:

#### 1.2.1 Tryb Edycji Modelu (MODEL_EDIT)

| Aspekt | Opis |
|--------|------|
| Stan modelu | MUTOWALNY |
| Stan wynikĂłw | NIEAKTYWNE (uniewaĹĽnione przy kaĹĽdej zmianie) |
| Dozwolone akcje | Dodawanie, edycja, usuwanie elementĂłw |
| NakĹ‚adki wynikĂłw | UKRYTE |
| Walidacja | AKTYWNA (inline) |

#### 1.2.2 Tryb Konfiguracji Przypadku (CASE_CONFIG)

| Aspekt | Opis |
|--------|------|
| Stan modelu | TYLKO DO ODCZYTU |
| Stan przypadku | MUTOWALNY |
| Dozwolone akcje | Parametryzacja przypadku, wybĂłr scenariusza |
| NakĹ‚adki wynikĂłw | UKRYTE |
| Obliczenia | DOZWOLONE |

#### 1.2.3 Tryb WynikĂłw (RESULT_VIEW)

| Aspekt | Opis |
|--------|------|
| Stan modelu | TYLKO DO ODCZYTU |
| Stan przypadku | TYLKO DO ODCZYTU |
| Stan wynikĂłw | AKTYWNE |
| Dozwolone akcje | PrzeglÄ…danie, eksport, porĂłwnanie |
| NakĹ‚adki wynikĂłw | WIDOCZNE |
| Edycja | ZABLOKOWANA |

### 1.3 ĹšwiadomoĹ›Ä‡ Aktywnego Przypadku Obliczeniowego

System MUSI utrzymywaÄ‡ Ĺ›wiadomoĹ›Ä‡ aktywnego przypadku obliczeniowego:

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PASEK STANU PRZYPADKU (zawsze widoczny)                        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Aktywny przypadek: [SC-001: Zwarcie 3f na szynie SN]          â”‚
â”‚ Typ: ShortCircuitCase | Metoda: IEC 60909 | Stan: GOTOWY      â”‚
â”‚ [ZmieĹ„ przypadek â–Ľ] [Oblicz] [Wyniki]                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**REGUĹA BLOKADY:** Brak aktywnego przypadku â†’ przycisk [Oblicz] NIEAKTYWNY.

**REGUĹA SPĂ“JNOĹšCI:** Zmiana modelu â†’ stan wszystkich przypadkĂłw = NIEAKTUALNY (STALE).

### 1.4 Deterministyczne UI

#### 1.4.1 Sortowanie

| Kontekst | ReguĹ‚a sortowania |
|----------|-------------------|
| Drzewo projektu | Alfabetycznie wedĹ‚ug nazwy |
| Lista elementĂłw | Alfabetycznie wedĹ‚ug nazwy |
| Lista przypadkĂłw | Chronologicznie (data utworzenia) |
| Lista wynikĂłw | Chronologicznie (data obliczenia) |
| Pola w siatce wĹ‚aĹ›ciwoĹ›ci | WedĹ‚ug zdefiniowanej kolejnoĹ›ci grup |

#### 1.4.2 Nazewnictwo Automatyczne

| Typ obiektu | Wzorzec nazwy | PrzykĹ‚ad |
|-------------|---------------|----------|
| Szyna (Bus) | `SZ-{NR_STACJI}-{NR_SZYNY}` | SZ-ST01-01 |
| Linia (LineBranch) | `LN-{NAZWA_OD}-{NAZWA_DO}` | LN-ST01-ST02 |
| Transformator (TransformerBranch) | `TR-{STACJA}-{NR}` | TR-ST01-01 |
| WyĹ‚Ä…cznik (CircuitBreaker) | `WĹ-{SZYNA}-{NR}` | WĹ-SZ01-01 |
| ĹąrĂłdĹ‚o (ExternalGrid) | `ZR-{STACJA}` | ZR-ST01 |
| Odbiornik (Load) | `OD-{SZYNA}-{NR}` | OD-SZ01-01 |
| Przypadek zwarciowy | `SC-{NNN}` | SC-001 |
| Przypadek rozpĹ‚ywowy | `PF-{NNN}` | PF-001 |

#### 1.4.3 Jednostki (Deterministyczne)

| WielkoĹ›Ä‡ | Jednostka wyĹ›wietlana | Jednostka wewnÄ™trzna |
|----------|----------------------|---------------------|
| NapiÄ™cie znamionowe | kV | V |
| PrÄ…d znamionowy | A | A |
| Moc czynna | MW | W |
| Moc bierna | Mvar | var |
| Moc pozorna | MVA | VA |
| Impedancja | Î© | Î© |
| Reaktancja | Î© | Î© |
| Rezystancja | Î© | Î© |
| DĹ‚ugoĹ›Ä‡ | km | m |
| PrzekrĂłj | mmÂ˛ | mmÂ˛ |
| Czas | ms | ms |
| Temperatura | Â°C | Â°C |
| WspĂłĹ‚czynnik mocy | - (bezwymiarowy) | - |

---

## 2. Globalny UkĹ‚ad Paneli

### 2.1 Struktura GĹ‚Ăłwnego Okna

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PASEK MENU                                                                  â”‚
â”‚ Plik | Edycja | Widok | Model | Przypadki | Obliczenia | Analiza | Pomoc   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ PASEK NARZÄDZI                                                              â”‚
â”‚ [Nowy] [OtwĂłrz] [Zapisz] | [Cofnij] [PonĂłw] | [Tryb edycji] [Tryb wynikĂłw] â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚               â”‚                                     â”‚                       â”‚
â”‚  DRZEWO       â”‚     WIDOK CENTRALNY                 â”‚  SIATKA WĹAĹšCIWOĹšCI   â”‚
â”‚  PROJEKTU     â”‚     (Schemat jednokreskowy /        â”‚  (Prawy panel)        â”‚
â”‚               â”‚      Fokus obiektu)                 â”‚                       â”‚
â”‚  â–Ľ Projekt    â”‚                                     â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚    â–Ľ Model    â”‚     â•â•â•â•â•¦â•â•â•â•â•â•â•â•â•â•â•¦â•â•â•â•            â”‚  â”‚ Identyfikacja   â”‚  â”‚
â”‚      â–Ľ Stacje â”‚         â•‘          â•‘                â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚        ST01   â”‚        [TR]       [OD]              â”‚  â”‚ Stan            â”‚  â”‚
â”‚        ST02   â”‚         â•‘          â•‘                â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚      â–Ľ Linie  â”‚     â•â•â•â•â•©â•â•â•â•â•â•â•â•â•â•â•©â•â•â•â•            â”‚  â”‚ Parametry       â”‚  â”‚
â”‚        LN01   â”‚                                     â”‚  â”‚ elektryczne     â”‚  â”‚
â”‚      â–Ľ ĹąrĂłdĹ‚a â”‚                                     â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚        ZR01   â”‚                                     â”‚  â”‚ Dane znamionowe â”‚  â”‚
â”‚    â–Ľ Przypadkiâ”‚                                     â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚      SC-001   â”‚                                     â”‚  â”‚ Walidacja       â”‚  â”‚
â”‚      PF-001   â”‚                                     â”‚  â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚    â–Ľ Wyniki   â”‚                                     â”‚  â”‚ Metadane        â”‚  â”‚
â”‚      SC-001-R â”‚                                     â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚               â”‚                                     â”‚                       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ PANEL KOMUNIKATĂ“W I DIAGNOSTYKI                                             â”‚
â”‚ [BĹ‚Ä™dy: 0] [OstrzeĹĽenia: 2] [Informacje: 5]                                â”‚
â”‚ âš  W-VAL-001 | OstrzeĹĽenie | TR-ST01-01 | PrzekĹ‚adnia poza zakresem normy  â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ KONSOLA OBLICZEĹ                                                            â”‚
â”‚ > Solver: IEC60909ShortCircuitSolver                                        â”‚
â”‚ > Walidacja sieci: OK                                                       â”‚
â”‚ > Iteracja 1: zbieĹĽnoĹ›Ä‡ = 1.2e-4                                           â”‚
â”‚ > Obliczenia zakoĹ„czone: 0.34s                                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ PASEK STANU                                                                 â”‚
â”‚ Aktywny przypadek: SC-001 | Tryb: Edycja modelu | Zoom: 100%               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 2.2 Drzewo Projektu (Struktura benchmark)

```
â–Ľ đź“ Projekt: "SieÄ‡ SN ZakĹ‚ad PrzemysĹ‚owy"
  â”‚
  â”śâ”€â–Ľ đź“ Model sieci
  â”‚   â”‚
  â”‚   â”śâ”€â–Ľ đź“ Stacje
  â”‚   â”‚   â”śâ”€ đźŹ­ GPZ GĹ‚Ăłwny (110/15 kV)
  â”‚   â”‚   â”śâ”€ đźŹ­ Stacja A (15 kV)
  â”‚   â”‚   â””â”€ đźŹ­ Stacja B (15 kV)
  â”‚   â”‚
  â”‚   â”śâ”€â–Ľ đź“ Szyny
  â”‚   â”‚   â”śâ”€ â•â•â• SZ-GPZ-WN (110 kV)
  â”‚   â”‚   â”śâ”€ â•â•â• SZ-GPZ-SN (15 kV)
  â”‚   â”‚   â”śâ”€ â•â•â• SZ-STA-01 (15 kV)
  â”‚   â”‚   â””â”€ â•â•â• SZ-STB-01 (15 kV)
  â”‚   â”‚
  â”‚   â”śâ”€â–Ľ đź“ Linie i kable
  â”‚   â”‚   â”śâ”€ â”€â”€â”€ LN-GPZ-STA (kabel XRUHAKXS 3x240)
  â”‚   â”‚   â””â”€ â”€â”€â”€ LN-GPZ-STB (linia napowietrzna AFL-6 120)
  â”‚   â”‚
  â”‚   â”śâ”€â–Ľ đź“ Transformatory
  â”‚   â”‚   â”śâ”€ âŠ— TR-GPZ-01 (110/15 kV, 25 MVA)
  â”‚   â”‚   â””â”€ âŠ— TR-GPZ-02 (110/15 kV, 25 MVA)
  â”‚   â”‚
  â”‚   â”śâ”€â–Ľ đź“ Aparatura Ĺ‚Ä…czeniowa
  â”‚   â”‚   â”śâ”€ â—Ż WĹ-GPZ-SN-01 (wyĹ‚Ä…cznik)
  â”‚   â”‚   â”śâ”€ â—Ż WĹ-GPZ-SN-02 (wyĹ‚Ä…cznik)
  â”‚   â”‚   â””â”€ â”€ RZ-STA-01 (rozĹ‚Ä…cznik)
  â”‚   â”‚
  â”‚   â”śâ”€â–Ľ đź“ ĹąrĂłdĹ‚a
  â”‚   â”‚   â””â”€ âšˇ ZR-GPZ (sieÄ‡ zewnÄ™trzna 110 kV)
  â”‚   â”‚
  â”‚   â””â”€â–Ľ đź“ Odbiorniki
  â”‚       â”śâ”€ â–˝ OD-STA-01 (P=2.5 MW, Q=1.2 Mvar)
  â”‚       â””â”€ â–˝ OD-STB-01 (P=1.8 MW, Q=0.9 Mvar)
  â”‚
  â”śâ”€â–Ľ đź“ Przypadki obliczeniowe
  â”‚   â”śâ”€â–Ľ đź“ Analizy zwarciowe (ShortCircuitCase)
  â”‚   â”‚   â”śâ”€ âšˇ SC-001: Zwarcie 3f na szynie SN GPZ
  â”‚   â”‚   â””â”€ âšˇ SC-002: Zwarcie 1f na szynie STA
  â”‚   â”‚
  â”‚   â””â”€â–Ľ đź“ RozpĹ‚ywy mocy (PowerFlowCase)
  â”‚       â””â”€ đź”„ PF-001: Stan normalny pracy
  â”‚
  â””â”€â–Ľ đź“ Wyniki
      â”śâ”€ đź“Š SC-001-R-2024-01-15-14:30
      â””â”€ đź“Š PF-001-R-2024-01-15-14:35
```

### 2.3 Widok Centralny (Schemat Jednokreskowy)

Schemat jednokreskowy (SLD) jest gĹ‚Ăłwnym widokiem graficznym sieci. Realizuje zasady zdefiniowane w `sld_rules.md`:

| Funkcja | Tryb Edycji | Tryb WynikĂłw |
|---------|-------------|--------------|
| WyĹ›wietlanie topologii | âś“ | âś“ |
| PrzeciÄ…ganie symboli | âś“ | âś— |
| Dodawanie elementĂłw | âś“ | âś— |
| Usuwanie elementĂłw | âś“ | âś— |
| WyĹ›wietlanie nakĹ‚adek wynikĂłw | âś— | âś“ |
| Dymki z wartoĹ›ciami | Parametry | Wyniki |
| Menu kontekstowe | PeĹ‚ne | Tylko do odczytu |

### 2.4 Siatka WĹ‚aĹ›ciwoĹ›ci (Prawy Panel)

Siatka wĹ‚aĹ›ciwoĹ›ci jest **GĹĂ“WNYM INTERFEJSEM** edycji parametrĂłw. WyĹ›wietla wĹ‚aĹ›ciwoĹ›ci aktualnie zaznaczonego obiektu w strukturze grup:

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SIATKA WĹAĹšCIWOĹšCI                      â”‚
â”‚ Obiekt: TR-GPZ-01 (TransformerBranch)   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ Identyfikacja                         â”‚
â”‚   ID:           tr-gpz-01-uuid          â”‚
â”‚   Nazwa:        TR-GPZ-01               â”‚
â”‚   UUID:         550e8400-e29b-41d4...   â”‚
â”‚   Typ obiektu:  TransformerBranch       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ Stan                                  â”‚
â”‚   W eksploatacji: [âś“]                   â”‚
â”‚   Stan cyklu:     Aktywny               â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ Parametry elektryczne                 â”‚
â”‚   Moc znamionowa:     [25.0    ] MVA    â”‚
â”‚   NapiÄ™cie GN:        [110.0   ] kV     â”‚
â”‚   NapiÄ™cie DN:        [15.0    ] kV     â”‚
â”‚   Grupa poĹ‚Ä…czeĹ„:     [Dyn11   ] â–Ľ      â”‚
â”‚   uk%:                [10.5    ] %      â”‚
â”‚   Straty Cu (Pk):     [125.0   ] kW     â”‚
â”‚   Straty Fe (P0):     [25.0    ] kW     â”‚
â”‚   PrÄ…d jaĹ‚owy (i0%):  [0.5     ] %      â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ Dane znamionowe (tabliczka)           â”‚
â”‚   Producent:          [ABB         ]    â”‚
â”‚   Typ:                [RESIBLOC    ]    â”‚
â”‚   Rok produkcji:      [2018        ]    â”‚
â”‚   Numer seryjny:      [TR-2018-001 ]    â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ WartoĹ›ci obliczeniowe (tylko odczyt)  â”‚
â”‚   Zk [Î©]:             0.726             â”‚
â”‚   Rk [Î©]:             0.0363            â”‚
â”‚   Xk [Î©]:             0.725             â”‚
â”‚   In_GN [A]:          131.2             â”‚
â”‚   In_DN [A]:          962.3             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ Stan walidacji                        â”‚
â”‚   âś“ Wszystkie parametry poprawne        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ Metadane audytowe (tylko odczyt)      â”‚
â”‚   Utworzono:      2024-01-10 09:15      â”‚
â”‚   UtworzyĹ‚:       jan.kowalski          â”‚
â”‚   Zmodyfikowano:  2024-01-15 14:22      â”‚
â”‚   ZmodyfikowaĹ‚:   anna.nowak            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 2.5 Panel KomunikatĂłw i Diagnostyki

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PANEL KOMUNIKATĂ“W                                          [BĹ‚Ä™dy][Ostrz.][Info]â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ KOD      â”‚ POZIOM   â”‚ ELEMENT        â”‚ WYJAĹšNIENIE                          â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ E-TOP-001â”‚ BĹ‚Ä…d     â”‚ Model sieci    â”‚ SieÄ‡ niespĂłjna: szyna SZ-STA-02     â”‚
â”‚          â”‚          â”‚                â”‚ nie jest poĹ‚Ä…czona z ĹĽadnÄ… gaĹ‚Ä™ziÄ…   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ W-VAL-001â”‚OstrzeĹĽenieâ”‚ TR-GPZ-01     â”‚ PrzekĹ‚adnia transformatora (7.33)    â”‚
â”‚          â”‚          â”‚                â”‚ poza typowym zakresem (1.0-5.0)      â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ I-SLV-001â”‚ Info     â”‚ SC-001         â”‚ Obliczenia zakoĹ„czone pomyĹ›lnie      â”‚
â”‚          â”‚          â”‚                â”‚ w czasie 0.34s                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 2.6 Konsola ObliczeĹ„

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ KONSOLA OBLICZEĹ                                                    [WyczyĹ›Ä‡]â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [2024-01-15 14:30:01] Inicjalizacja solvera: IEC60909ShortCircuitSolver    â”‚
â”‚ [2024-01-15 14:30:01] Walidacja modelu sieci...                            â”‚
â”‚ [2024-01-15 14:30:01]   âś“ Topologia spĂłjna                                 â”‚
â”‚ [2024-01-15 14:30:01]   âś“ Wszystkie parametry zdefiniowane                 â”‚
â”‚ [2024-01-15 14:30:01]   âś“ ĹąrĂłdĹ‚o zdefiniowane                              â”‚
â”‚ [2024-01-15 14:30:02] Budowanie macierzy admitancyjnej...                  â”‚
â”‚ [2024-01-15 14:30:02] Obliczanie prÄ…dĂłw zwarciowych...                     â”‚
â”‚ [2024-01-15 14:30:02]   Lokalizacja zwarcia: SZ-GPZ-SN                     â”‚
â”‚ [2024-01-15 14:30:02]   Typ zwarcia: trĂłjfazowe symetryczne                â”‚
â”‚ [2024-01-15 14:30:02]   Ik" = 12.45 kA                                     â”‚
â”‚ [2024-01-15 14:30:02]   ip = 31.67 kA                                      â”‚
â”‚ [2024-01-15 14:30:02]   Ith = 12.89 kA (dla tk=1.0s)                       â”‚
â”‚ [2024-01-15 14:30:02] âś“ Obliczenia zakoĹ„czone pomyĹ›lnie (0.34s)            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 3. Siatka WĹ‚aĹ›ciwoĹ›ci Obiektu (Standard Enterprise)

Dla KAĹ»DEGO typu obiektu w modelu definiuje siÄ™ kompletnÄ… specyfikacjÄ™ siatki wĹ‚aĹ›ciwoĹ›ci.

### 3.1 Szyna (Bus)

#### 3.1.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa wyĹ›wietlana (wzorzec: SZ-{STACJA}-{NR}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | Zawsze: Bus |

#### 3.1.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy szyna jest aktywna w obliczeniach |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.1.3 Grupa: Parametry elektryczne

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| NapiÄ™cie znamionowe | float | kV | 0.4 - 400 | 15.0 | Wymagane, > 0 |
| Typ szyny | enum | - | ZBIORCZA / SEKCYJNA / ODCZEPOWA | ZBIORCZA | Wymagane |
| PrÄ…d znamionowy | float | A | 100 - 10000 | 1000 | Wymagane, > 0 |

#### 3.1.4 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Producent | string | TAK | Nazwa producenta rozdzielnicy |
| Typ rozdzielnicy | string | TAK | Oznaczenie katalogowe |
| Rok instalacji | int | TAK | Rok oddania do eksploatacji |

#### 3.1.5 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| U obliczone | float | kV | PowerFlowResult | NapiÄ™cie z rozpĹ‚ywu mocy |
| KÄ…t napiÄ™cia | float | Â° | PowerFlowResult | KÄ…t fazowy napiÄ™cia |
| Ik" | float | kA | ShortCircuitResult | PrÄ…d zwarciowy poczÄ…tkowy |
| ip | float | kA | ShortCircuitResult | PrÄ…d udarowy |

#### 3.1.6 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-BUS-001 | BĹ‚Ä…d | Un â‰¤ 0 | NapiÄ™cie znamionowe musi byÄ‡ wiÄ™ksze od zera |
| E-BUS-002 | BĹ‚Ä…d | In â‰¤ 0 | PrÄ…d znamionowy musi byÄ‡ wiÄ™kszy od zera |
| W-BUS-001 | OstrzeĹĽenie | Brak poĹ‚Ä…czeĹ„ | Szyna nie ma ĹĽadnych poĹ‚Ä…czeĹ„ |

#### 3.1.7 Grupa: Metadane audytowe

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Data utworzenia | datetime | NIE | Znacznik czasu utworzenia |
| UtworzyĹ‚ | string | NIE | Identyfikator uĹĽytkownika |
| Data modyfikacji | datetime | NIE | Znacznik ostatniej modyfikacji |
| ZmodyfikowaĹ‚ | string | NIE | Identyfikator uĹĽytkownika |

---

### 3.2 Linia / Kabel (LineBranch)

#### 3.2.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: LN-{OD}-{DO}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | Zawsze: LineBranch |

#### 3.2.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy linia jest aktywna |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.2.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna poczÄ…tkowa (from_bus) | ref:Bus | TAK | Wymagane | Referencja do szyny ĹşrĂłdĹ‚owej |
| Szyna koĹ„cowa (to_bus) | ref:Bus | TAK | Wymagane | Referencja do szyny docelowej |

#### 3.2.4 Grupa: Parametry elektryczne

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Typ przewodu | enum | - | KABEL / NAPOWIETRZNA | KABEL | Wymagane |
| DĹ‚ugoĹ›Ä‡ | float | km | 0.001 - 1000 | 1.0 | Wymagane, > 0 |
| Rezystancja jednostkowa R' | float | Î©/km | 0.001 - 10 | 0.125 | Wymagane, > 0 |
| Reaktancja jednostkowa X' | float | Î©/km | 0.001 - 10 | 0.08 | Wymagane, > 0 |
| Susceptancja jednostkowa B' | float | ÂµS/km | 0 - 1000 | 0 | â‰Ą 0 |
| Konduktancja jednostkowa G' | float | ÂµS/km | 0 - 100 | 0 | â‰Ą 0 |
| PrÄ…d dopuszczalny dĹ‚ugotrwaĹ‚y | float | A | 10 - 5000 | 300 | Wymagane, > 0 |
| PrzekrĂłj przewodu | float | mmÂ˛ | 1 - 2000 | 240 | Wymagane, > 0 |
| Liczba przewodĂłw w wiÄ…zce | int | - | 1 - 4 | 1 | Wymagane, â‰Ą 1 |

#### 3.2.5 Grupa: Parametry kabla (tylko gdy Typ = KABEL)

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Typ kabla | string | - | - | XRUHAKXS | - |
| NapiÄ™cie znamionowe izolacji U0/U | string | kV | - | 8.7/15 | - |
| SposĂłb uĹ‚oĹĽenia | enum | - | ZIEMIA_BEZPOĹšREDNIO / RURY / KANAĹ | ZIEMIA_BEZPOĹšREDNIO | - |
| GĹ‚Ä™bokoĹ›Ä‡ uĹ‚oĹĽenia | float | m | 0.5 - 3.0 | 0.7 | - |
| Temperatura gruntu | float | Â°C | -20 - 50 | 20 | - |
| RezystywnoĹ›Ä‡ termiczna gruntu | float | KÂ·m/W | 0.5 - 3.0 | 1.0 | - |

#### 3.2.6 Grupa: Parametry linii napowietrznej (tylko gdy Typ = NAPOWIETRZNA)

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Typ przewodu | string | - | - | AFL-6 | - |
| Ĺšrednia wysokoĹ›Ä‡ zawieszenia | float | m | 5 - 50 | 10 | - |
| Ĺšrednia rozpiÄ™toĹ›Ä‡ przÄ™sĹ‚a | float | m | 30 - 500 | 150 | - |
| Temperatura przewodu | float | Â°C | -30 - 80 | 40 | - |

#### 3.2.7 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Producent | string | TAK | Producent kabla/przewodu |
| Oznaczenie katalogowe | string | TAK | PeĹ‚ne oznaczenie |
| Rok instalacji | int | TAK | Rok oddania do eksploatacji |
| Numer ewidencyjny | string | TAK | Numer wewnÄ™trzny |

#### 3.2.8 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| R caĹ‚kowite | float | Î© | Obliczone | R' Ă— dĹ‚ugoĹ›Ä‡ |
| X caĹ‚kowite | float | Î© | Obliczone | X' Ă— dĹ‚ugoĹ›Ä‡ |
| Z caĹ‚kowite | float | Î© | Obliczone | âš(RÂ˛ + XÂ˛) |
| I obliczony | float | A | PowerFlowResult | PrÄ…d z rozpĹ‚ywu |
| ObciÄ…ĹĽenie | float | % | PowerFlowResult | I/Idop Ă— 100% |
| P strat | float | kW | PowerFlowResult | Straty mocy czynnej |

#### 3.2.9 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-LIN-001 | BĹ‚Ä…d | from_bus == null | Szyna poczÄ…tkowa nie jest zdefiniowana |
| E-LIN-002 | BĹ‚Ä…d | to_bus == null | Szyna koĹ„cowa nie jest zdefiniowana |
| E-LIN-003 | BĹ‚Ä…d | from_bus == to_bus | Szyna poczÄ…tkowa i koĹ„cowa sÄ… identyczne |
| E-LIN-004 | BĹ‚Ä…d | dĹ‚ugoĹ›Ä‡ â‰¤ 0 | DĹ‚ugoĹ›Ä‡ linii musi byÄ‡ wiÄ™ksza od zera |
| W-LIN-001 | OstrzeĹĽenie | ObciÄ…ĹĽenie > 80% | Linia obciÄ…ĹĽona powyĹĽej 80% dopuszczalnego prÄ…du |

#### 3.2.10 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.3 Transformator 2-uzwojeniowy (TransformerBranch)

#### 3.3.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: TR-{STACJA}-{NR}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | TransformerBranch |
| Podtyp | enum | NIE | DWUUZWOJENIOWY |

#### 3.3.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy transformator jest aktywny |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.3.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna GN (hv_bus) | ref:Bus | TAK | Wymagane | Strona gĂłrnego napiÄ™cia |
| Szyna DN (lv_bus) | ref:Bus | TAK | Wymagane | Strona dolnego napiÄ™cia |

#### 3.3.4 Grupa: Parametry znamionowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Moc znamionowa Sn | float | MVA | 0.05 - 1000 | 25.0 | Wymagane, > 0 |
| NapiÄ™cie znamionowe GN (Un_hv) | float | kV | 0.4 - 800 | 110.0 | Wymagane, > 0 |
| NapiÄ™cie znamionowe DN (Un_lv) | float | kV | 0.4 - 400 | 15.0 | Wymagane, > 0 |
| Grupa poĹ‚Ä…czeĹ„ | enum | - | Dyn11 / Yyn0 / Dyn5 / Yd11 / ... | Dyn11 | Wymagane |
| NapiÄ™cie zwarcia uk% | float | % | 4 - 25 | 10.5 | Wymagane, 4 â‰¤ uk â‰¤ 25 |
| SkĹ‚adowa czynna napiÄ™cia zwarcia ur% | float | % | 0.1 - 5 | 1.0 | Opcjonalne |
| Straty obciÄ…ĹĽeniowe (Pk) | float | kW | 1 - 1000 | 125.0 | Wymagane, > 0 |
| Straty jaĹ‚owe (P0) | float | kW | 0.1 - 200 | 25.0 | Wymagane, > 0 |
| PrÄ…d jaĹ‚owy (i0%) | float | % | 0.1 - 5 | 0.5 | Opcjonalne |

#### 3.3.5 Grupa: PodobciÄ…ĹĽeniowy przeĹ‚Ä…cznik zaczepĂłw (OLTC)

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| OLTC zainstalowany | boolean | - | - | false | - |
| Strona przeĹ‚Ä…cznika | enum | - | GN / DN | GN | Gdy OLTC = true |
| Liczba zaczepĂłw (gĂłra) | int | - | 0 - 20 | 8 | Gdy OLTC = true |
| Liczba zaczepĂłw (dĂłĹ‚) | int | - | 0 - 20 | 8 | Gdy OLTC = true |
| Krok napiÄ™cia na zaczep | float | % | 0.5 - 5 | 1.25 | Gdy OLTC = true |
| Aktualny zaczep | int | - | -n_low ... +n_high | 0 | Zakres zgodny z liczbÄ… zaczepĂłw |

#### 3.3.6 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Producent | string | TAK | Nazwa producenta |
| Typ | string | TAK | Oznaczenie typu |
| Rok produkcji | int | TAK | Rok produkcji |
| Numer seryjny | string | TAK | Numer fabryczny |
| Klasa chĹ‚odzenia | enum | TAK | ONAN / ONAF / OFAF / ODAF |
| Masa oleju | float | TAK | kg |
| Masa caĹ‚kowita | float | TAK | kg |

#### 3.3.7 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| Impedancja zwarcia Zk | float | Î© | Obliczone | uk% Ă— UnÂ˛/Sn |
| Rezystancja zwarcia Rk | float | Î© | Obliczone | Pk Ă— UnÂ˛/SnÂ˛ |
| Reaktancja zwarcia Xk | float | Î© | Obliczone | âš(ZkÂ˛ - RkÂ˛) |
| PrzekĹ‚adnia nominalna | float | - | Obliczone | Un_hv / Un_lv |
| PrzekĹ‚adnia rzeczywista | float | - | Obliczone | UwzglÄ™dnia aktualny zaczep |
| PrÄ…d znamionowy GN | float | A | Obliczone | Sn / (âš3 Ă— Un_hv) |
| PrÄ…d znamionowy DN | float | A | Obliczone | Sn / (âš3 Ă— Un_lv) |
| ObciÄ…ĹĽenie | float | % | PowerFlowResult | S/Sn Ă— 100% |
| Straty | float | kW | PowerFlowResult | Straty w transformatorze |

#### 3.3.8 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-TRF-001 | BĹ‚Ä…d | hv_bus == null | Szyna GN nie jest zdefiniowana |
| E-TRF-002 | BĹ‚Ä…d | lv_bus == null | Szyna DN nie jest zdefiniowana |
| E-TRF-003 | BĹ‚Ä…d | Un_hv â‰¤ Un_lv | NapiÄ™cie GN musi byÄ‡ wiÄ™ksze od napiÄ™cia DN |
| E-TRF-004 | BĹ‚Ä…d | uk% < 4 lub uk% > 25 | NapiÄ™cie zwarcia poza dopuszczalnym zakresem |
| W-TRF-001 | OstrzeĹĽenie | ObciÄ…ĹĽenie > 100% | Transformator przeciÄ…ĹĽony |
| W-TRF-002 | OstrzeĹĽenie | PrzekĹ‚adnia > 5 | Nietypowa przekĹ‚adnia transformatora |

#### 3.3.9 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.4 Transformator 3-uzwojeniowy (TransformerBranch3W)

#### 3.4.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: TR3-{STACJA}-{NR}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | TransformerBranch |
| Podtyp | enum | NIE | TRĂ“JUZWOJENIOWY |

#### 3.4.2 Grupa: Stan

(Struktura identyczna jak dla TransformerBranch)

#### 3.4.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna GN (hv_bus) | ref:Bus | TAK | Wymagane | Strona gĂłrnego napiÄ™cia |
| Szyna SN (mv_bus) | ref:Bus | TAK | Wymagane | Strona Ĺ›redniego napiÄ™cia |
| Szyna DN (lv_bus) | ref:Bus | TAK | Wymagane | Strona dolnego napiÄ™cia |

#### 3.4.4 Grupa: Parametry znamionowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Moc znamionowa GN-SN | float | MVA | 0.05 - 1000 | 40.0 | Wymagane, > 0 |
| Moc znamionowa GN-DN | float | MVA | 0.05 - 1000 | 25.0 | Wymagane, > 0 |
| Moc znamionowa SN-DN | float | MVA | 0.05 - 1000 | 25.0 | Wymagane, > 0 |
| NapiÄ™cie znamionowe GN | float | kV | 0.4 - 800 | 110.0 | Wymagane |
| NapiÄ™cie znamionowe SN | float | kV | 0.4 - 400 | 30.0 | Wymagane |
| NapiÄ™cie znamionowe DN | float | kV | 0.4 - 110 | 15.0 | Wymagane |
| Grupa poĹ‚Ä…czeĹ„ | enum | - | YNyn0d11 / ... | YNyn0d11 | Wymagane |
| uk% GN-SN | float | % | 4 - 25 | 12.0 | Wymagane |
| uk% GN-DN | float | % | 4 - 25 | 18.0 | Wymagane |
| uk% SN-DN | float | % | 4 - 25 | 6.0 | Wymagane |
| Pk GN-SN | float | kW | 1 - 1000 | 200.0 | Wymagane |
| Pk GN-DN | float | kW | 1 - 1000 | 150.0 | Wymagane |
| Pk SN-DN | float | kW | 1 - 1000 | 100.0 | Wymagane |
| P0 | float | kW | 0.1 - 200 | 30.0 | Wymagane |

#### 3.4.5 Grupa: OLTC

(Struktura analogiczna do transformatora 2-uzwojeniowego)

#### 3.4.6 Grupa: Dane znamionowe (tabliczka)

(Struktura identyczna jak dla TransformerBranch)

#### 3.4.7 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| Zk GN | float | Î© | Obliczone | Impedancja gaĹ‚Ä™zi GN |
| Zk SN | float | Î© | Obliczone | Impedancja gaĹ‚Ä™zi SN |
| Zk DN | float | Î© | Obliczone | Impedancja gaĹ‚Ä™zi DN |
| In GN | float | A | Obliczone | PrÄ…d znamionowy GN |
| In SN | float | A | Obliczone | PrÄ…d znamionowy SN |
| In DN | float | A | Obliczone | PrÄ…d znamionowy DN |

#### 3.4.8 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-T3W-001 | BĹ‚Ä…d | Brak szyny GN | Szyna GN nie jest zdefiniowana |
| E-T3W-002 | BĹ‚Ä…d | Brak szyny SN | Szyna SN nie jest zdefiniowana |
| E-T3W-003 | BĹ‚Ä…d | Brak szyny DN | Szyna DN nie jest zdefiniowana |
| E-T3W-004 | BĹ‚Ä…d | Un_hv â‰¤ Un_mv | NapiÄ™cie GN musi byÄ‡ wiÄ™ksze od SN |
| E-T3W-005 | BĹ‚Ä…d | Un_mv â‰¤ Un_lv | NapiÄ™cie SN musi byÄ‡ wiÄ™ksze od DN |

#### 3.4.9 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.5 WyĹ‚Ä…cznik (CircuitBreaker)

#### 3.5.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: WĹ-{SZYNA}-{NR}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | Switch |
| Podtyp | enum | NIE | WYĹÄ„CZNIK |

#### 3.5.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy wyĹ‚Ä…cznik jest zamontowany |
| Pozycja | enum | TAK | ZAMKNIÄTY | ZAMKNIÄTY / OTWARTY |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.5.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna | ref:Bus | TAK | Wymagane | Szyna, do ktĂłrej jest przyĹ‚Ä…czony |
| GaĹ‚Ä…Ĺş | ref:Branch | TAK | Opcjonalne | GaĹ‚Ä…Ĺş (linia/transformator) |

#### 3.5.4 Grupa: Parametry znamionowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| NapiÄ™cie znamionowe Un | float | kV | 0.4 - 800 | 15.0 | Wymagane |
| PrÄ…d znamionowy In | float | A | 100 - 10000 | 1250 | Wymagane |
| Znamionowy prÄ…d wyĹ‚Ä…czalny Ik | float | kA | 5 - 100 | 25.0 | Wymagane |
| Znamionowy prÄ…d zaĹ‚Ä…czalny Ima | float | kA | 10 - 250 | 63.0 | Wymagane |
| Znamionowy prÄ…d zwarciowy krĂłtkotrwaĹ‚y Icw | float | kA | 5 - 100 | 25.0 | Wymagane |
| Czas wytrzymywania zwarcia tcw | float | s | 0.5 - 3.0 | 1.0 | Wymagane |
| Czas wĹ‚asny wyĹ‚Ä…czenia | float | ms | 20 - 100 | 60 | Opcjonalne |
| Czas Ĺ‚ukowy | float | ms | 5 - 50 | 15 | Opcjonalne |

#### 3.5.5 Grupa: Medium gaszÄ…ce

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Typ medium | enum | TAK | PRĂ“Ĺ»NIOWY / SF6 / OLEJOWY / POWIETRZNY |
| CiĹ›nienie nominalne SF6 | float | TAK | bar (tylko dla SF6) |

#### 3.5.6 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Producent | string | TAK | Nazwa producenta |
| Typ | string | TAK | Oznaczenie typu |
| Rok produkcji | int | TAK | Rok produkcji |
| Numer seryjny | string | TAK | Numer fabryczny |
| Licznik operacji | int | TAK | Liczba wykonanych Ĺ‚Ä…czeĹ„ |
| Resursy mechaniczne | int | TAK | Dopuszczalna liczba Ĺ‚Ä…czeĹ„ |

#### 3.5.7 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| I obliczony | float | A | PowerFlowResult | PrÄ…d pĹ‚ynÄ…cy przez wyĹ‚Ä…cznik |
| Ik" w miejscu | float | kA | ShortCircuitResult | PrÄ…d zwarciowy w miejscu wyĹ‚Ä…cznika |
| WspĂłĹ‚czynnik wykorzystania | float | % | Obliczone | Ik"/Ik_znamionowy Ă— 100% |

#### 3.5.8 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-CBR-001 | BĹ‚Ä…d | Brak szyny | WyĹ‚Ä…cznik nie jest przyĹ‚Ä…czony do szyny |
| E-CBR-002 | BĹ‚Ä…d | Ik" > Ik_znam | Znamionowy prÄ…d wyĹ‚Ä…czalny niewystarczajÄ…cy dla prÄ…du zwarciowego |
| E-CBR-003 | BĹ‚Ä…d | ip > Ima | Znamionowy prÄ…d zaĹ‚Ä…czalny niewystarczajÄ…cy dla prÄ…du udarowego |
| W-CBR-001 | OstrzeĹĽenie | Wykorzystanie > 80% | WyĹ‚Ä…cznik blisko granicy zdolnoĹ›ci Ĺ‚Ä…czeniowej |
| W-CBR-002 | OstrzeĹĽenie | Licznik > 80% resursĂłw | WyĹ‚Ä…cznik bliski wyczerpania resursĂłw mechanicznych |

#### 3.5.9 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.6 RozĹ‚Ä…cznik (Disconnector)

#### 3.6.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: RZ-{SZYNA}-{NR}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | Switch |
| Podtyp | enum | NIE | ROZĹÄ„CZNIK |

#### 3.6.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy rozĹ‚Ä…cznik jest zamontowany |
| Pozycja | enum | TAK | ZAMKNIÄTY | ZAMKNIÄTY / OTWARTY |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.6.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna | ref:Bus | TAK | Wymagane | Szyna, do ktĂłrej jest przyĹ‚Ä…czony |
| GaĹ‚Ä…Ĺş | ref:Branch | TAK | Opcjonalne | GaĹ‚Ä…Ĺş (linia/transformator) |

#### 3.6.4 Grupa: Parametry znamionowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| NapiÄ™cie znamionowe Un | float | kV | 0.4 - 800 | 15.0 | Wymagane |
| PrÄ…d znamionowy In | float | A | 100 - 10000 | 630 | Wymagane |
| Znamionowy prÄ…d zwarciowy krĂłtkotrwaĹ‚y Icw | float | kA | 5 - 100 | 25.0 | Wymagane |
| Czas wytrzymywania zwarcia tcw | float | s | 0.5 - 3.0 | 1.0 | Wymagane |
| ZdolnoĹ›Ä‡ zaĹ‚Ä…czania na zwarcie | boolean | - | - | false | - |
| PrÄ…d zaĹ‚Ä…czalny zwarciowy (jeĹ›li ma zdolnoĹ›Ä‡) | float | kA | 10 - 250 | 0 | Gdy zdolnoĹ›Ä‡ = true |

#### 3.6.5 Grupa: Dane znamionowe (tabliczka)

(Struktura identyczna jak dla CircuitBreaker)

#### 3.6.6 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| I obliczony | float | A | PowerFlowResult | PrÄ…d pĹ‚ynÄ…cy przez rozĹ‚Ä…cznik |
| Icw w miejscu | float | kA | ShortCircuitResult | PrÄ…d zwarciowy krĂłtkotrwaĹ‚y |

#### 3.6.7 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-DSC-001 | BĹ‚Ä…d | Brak szyny | RozĹ‚Ä…cznik nie jest przyĹ‚Ä…czony do szyny |
| E-DSC-002 | BĹ‚Ä…d | Pozycja OTWARTY podczas rozpĹ‚ywu | RozĹ‚Ä…cznik otwarty powoduje przerwÄ™ w sieci |
| W-DSC-001 | OstrzeĹĽenie | Icw < Ik" | PrÄ…d zwarciowy krĂłtkotrwaĹ‚y przekracza zdolnoĹ›Ä‡ rozĹ‚Ä…cznika |

#### 3.6.8 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.7 SieÄ‡ ZewnÄ™trzna (ExternalGrid)

#### 3.7.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: ZR-{STACJA}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | ExternalGrid |

#### 3.7.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy ĹşrĂłdĹ‚o jest aktywne |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.7.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna przyĹ‚Ä…czenia | ref:Bus | TAK | Wymagane | Szyna, do ktĂłrej jest przyĹ‚Ä…czone ĹşrĂłdĹ‚o |

#### 3.7.4 Grupa: Parametry znamionowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| NapiÄ™cie znamionowe Un | float | kV | 0.4 - 800 | 110.0 | Wymagane |
| NapiÄ™cie odniesienia (p.u.) | float | p.u. | 0.9 - 1.1 | 1.0 | Wymagane |
| CzÄ™stotliwoĹ›Ä‡ | float | Hz | 50 / 60 | 50 | Wymagane |

#### 3.7.5 Grupa: Parametry zwarciowe (zgodnie z IEC 60909)

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Metoda wprowadzania | enum | - | SK_IK / SK_XR / RX_BEZPOĹšREDNIO | SK_IK | - |
| **Gdy SK_IK:** | | | | | |
| Moc zwarciowa Sk" | float | MVA | 100 - 100000 | 5000 | Wymagane |
| Stosunek Ik"/Ik | float | - | 1.0 - 2.0 | 1.1 | Opcjonalne |
| Stosunek R/X | float | - | 0.05 - 0.5 | 0.1 | Wymagane |
| **Gdy SK_XR:** | | | | | |
| Moc zwarciowa Sk" | float | MVA | 100 - 100000 | 5000 | Wymagane |
| Reaktancja X | float | Î© | 0.01 - 100 | - | Obliczone z Sk" |
| Stosunek R/X | float | - | 0.05 - 0.5 | 0.1 | Wymagane |
| **Gdy RX_BEZPOĹšREDNIO:** | | | | | |
| Rezystancja R | float | Î© | 0.001 - 100 | 0.5 | Wymagane |
| Reaktancja X | float | Î© | 0.01 - 100 | 5.0 | Wymagane |

#### 3.7.6 Grupa: Parametry skĹ‚adowej zerowej

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Stosunek R0/R1 | float | - | 0.5 - 5.0 | 1.0 | Wymagane |
| Stosunek X0/X1 | float | - | 0.5 - 5.0 | 1.0 | Wymagane |

#### 3.7.7 Grupa: Parametry rozpĹ‚ywu mocy

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Typ wÄ™zĹ‚a | enum | - | SLACK / PV | SLACK | Wymagane |
| Moc czynna (gdy PV) | float | MW | -1000 - 1000 | 0 | Gdy typ = PV |
| NapiÄ™cie zadane (gdy PV) | float | p.u. | 0.9 - 1.1 | 1.0 | Gdy typ = PV |

#### 3.7.8 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Operator sieci | string | TAK | Nazwa operatora sieci przesyĹ‚owej/dystrybucyjnej |
| Punkt przyĹ‚Ä…czenia | string | TAK | Oznaczenie punktu przyĹ‚Ä…czenia |
| Umowa przyĹ‚Ä…czeniowa | string | TAK | Numer umowy |

#### 3.7.9 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| Impedancja zwarciowa Zk | float | Î© | Obliczone | Impedancja zastÄ™pcza sieci |
| Rk | float | Î© | Obliczone | Rezystancja zastÄ™pcza |
| Xk | float | Î© | Obliczone | Reaktancja zastÄ™pcza |
| Ik" | float | kA | Obliczone | PrÄ…d zwarciowy poczÄ…tkowy |
| P wpĹ‚ywajÄ…ce | float | MW | PowerFlowResult | Moc czynna z sieci |
| Q wpĹ‚ywajÄ…ce | float | Mvar | PowerFlowResult | Moc bierna z sieci |

#### 3.7.10 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-EXG-001 | BĹ‚Ä…d | Brak szyny | ĹąrĂłdĹ‚o nie jest przyĹ‚Ä…czone do szyny |
| E-EXG-002 | BĹ‚Ä…d | Sk" â‰¤ 0 | Moc zwarciowa musi byÄ‡ wiÄ™ksza od zera |
| E-EXG-003 | BĹ‚Ä…d | R/X â‰¤ 0 | Stosunek R/X musi byÄ‡ wiÄ™kszy od zera |
| W-EXG-001 | OstrzeĹĽenie | Un â‰  Un_szyny | NapiÄ™cie ĹşrĂłdĹ‚a rĂłĹĽni siÄ™ od napiÄ™cia szyny |

#### 3.7.11 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.8 Generator synchroniczny (SynchronousGenerator)

#### 3.8.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: GEN-{STACJA}-{NR}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | SynchronousGenerator |

#### 3.8.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy generator jest aktywny |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.8.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna przyĹ‚Ä…czenia | ref:Bus | TAK | Wymagane | Szyna, do ktĂłrej jest przyĹ‚Ä…czony |

#### 3.8.4 Grupa: Parametry znamionowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Moc znamionowa pozorna Sn | float | MVA | 0.1 - 1000 | 10.0 | Wymagane |
| Moc znamionowa czynna Pn | float | MW | 0.1 - 1000 | 8.0 | Wymagane |
| NapiÄ™cie znamionowe Un | float | kV | 0.4 - 36 | 6.3 | Wymagane |
| WspĂłĹ‚czynnik mocy cos Ď†n | float | - | 0.7 - 1.0 | 0.8 | Wymagane |
| PrÄ™dkoĹ›Ä‡ obrotowa nn | float | obr/min | 300 - 3600 | 1500 | Wymagane |
| CzÄ™stotliwoĹ›Ä‡ | float | Hz | 50 / 60 | 50 | Wymagane |

#### 3.8.5 Grupa: Parametry zwarciowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Reaktancja synchroniczna Xd | float | p.u. | 0.5 - 3.0 | 1.8 | Wymagane |
| Reaktancja przejĹ›ciowa X'd | float | p.u. | 0.1 - 0.5 | 0.25 | Wymagane |
| Reaktancja subtransientalna X"d | float | p.u. | 0.05 - 0.3 | 0.15 | Wymagane |
| Reaktancja zerowa X0 | float | p.u. | 0.01 - 0.2 | 0.08 | Wymagane |
| Reaktancja przeciwna X2 | float | p.u. | 0.05 - 0.3 | 0.18 | Wymagane |
| StaĹ‚a czasowa przejĹ›ciowa T'd | float | s | 0.5 - 5.0 | 1.5 | Opcjonalne |
| StaĹ‚a czasowa subtrans. T"d | float | s | 0.01 - 0.1 | 0.035 | Opcjonalne |

#### 3.8.6 Grupa: Parametry rozpĹ‚ywu mocy

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Typ wÄ™zĹ‚a | enum | - | PV / PQ | PV | Wymagane |
| Moc czynna zadana P | float | MW | 0 - Pn | 8.0 | Wymagane |
| NapiÄ™cie zadane (gdy PV) | float | p.u. | 0.9 - 1.1 | 1.0 | Gdy typ = PV |
| Moc bierna zadana (gdy PQ) | float | Mvar | -Qmax - Qmax | 0 | Gdy typ = PQ |
| Qmin | float | Mvar | -Sn - 0 | -6.0 | Ograniczenie |
| Qmax | float | Mvar | 0 - Sn | 6.0 | Ograniczenie |

#### 3.8.7 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Producent | string | TAK | Nazwa producenta |
| Typ | string | TAK | Oznaczenie typu |
| Rok produkcji | int | TAK | Rok produkcji |
| Numer seryjny | string | TAK | Numer fabryczny |
| Klasa izolacji | enum | TAK | B / F / H |
| Typ chĹ‚odzenia | enum | TAK | IC01 / IC11 / IC21 / ... |

#### 3.8.8 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| PrÄ…d znamionowy In | float | A | Obliczone | Sn / (âš3 Ă— Un) |
| Ik" (wkĹ‚ad do zwarcia) | float | kA | ShortCircuitResult | PrÄ…d zwarciowy poczÄ…tkowy |
| P generowane | float | MW | PowerFlowResult | Moc czynna |
| Q generowane | float | Mvar | PowerFlowResult | Moc bierna |
| ObciÄ…ĹĽenie | float | % | PowerFlowResult | S/Sn Ă— 100% |

#### 3.8.9 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-GEN-001 | BĹ‚Ä…d | Brak szyny | Generator nie jest przyĹ‚Ä…czony do szyny |
| E-GEN-002 | BĹ‚Ä…d | Pn > Sn | Moc czynna wiÄ™ksza od mocy pozornej |
| E-GEN-003 | BĹ‚Ä…d | X"d â‰¤ 0 | Reaktancja subtransientalna musi byÄ‡ > 0 |
| W-GEN-001 | OstrzeĹĽenie | cos Ď†n < 0.8 | Nietypowy wspĂłĹ‚czynnik mocy |

#### 3.8.10 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.9 Odbiornik (Load)

#### 3.9.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa (wzorzec: OD-{SZYNA}-{NR}) |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | Load |

#### 3.9.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy odbiornik jest aktywny |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.9.3 Grupa: Topologia

| Pole | Typ | Edytowalne | Walidacja | Opis |
|------|-----|------------|-----------|------|
| Szyna przyĹ‚Ä…czenia | ref:Bus | TAK | Wymagane | Szyna, do ktĂłrej jest przyĹ‚Ä…czony |

#### 3.9.4 Grupa: Model obciÄ…ĹĽenia

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Typ modelu | enum | - | PQ / ZIP / SILNIK | PQ | Wymagane |

#### 3.9.5 Grupa: Parametry modelu PQ (podstawowy)

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Moc czynna P | float | MW | 0 - 1000 | 1.0 | Wymagane, â‰Ą 0 |
| Moc bierna Q | float | Mvar | -1000 - 1000 | 0.5 | Wymagane |
| WspĂłĹ‚czynnik mocy cos Ď† | float | - | 0.5 - 1.0 | - | Obliczony z P, Q |

#### 3.9.6 Grupa: Parametry modelu ZIP (zaawansowany)

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Moc bazowa P0 | float | MW | 0 - 1000 | 1.0 | Wymagane |
| Moc bazowa Q0 | float | Mvar | -1000 - 1000 | 0.5 | Wymagane |
| NapiÄ™cie bazowe U0 | float | kV | 0.4 - 400 | - | Z szyny |
| Wsp. impedancji ZIP (ap) | float | - | 0 - 1 | 0.4 | Suma = 1 |
| Wsp. prÄ…du ZIP (bp) | float | - | 0 - 1 | 0.4 | Suma = 1 |
| Wsp. mocy ZIP (cp) | float | - | 0 - 1 | 0.2 | Suma = 1 |
| Wsp. impedancji ZIQ (aq) | float | - | 0 - 1 | 0.4 | Suma = 1 |
| Wsp. prÄ…du ZIQ (bq) | float | - | 0 - 1 | 0.4 | Suma = 1 |
| Wsp. mocy ZIQ (cq) | float | - | 0 - 1 | 0.2 | Suma = 1 |

**WzĂłr ZIP:**
```
P = P0 Ă— [apĂ—(U/U0)Â˛ + bpĂ—(U/U0) + cp]
Q = Q0 Ă— [aqĂ—(U/U0)Â˛ + bqĂ—(U/U0) + cq]
```

#### 3.9.7 Grupa: Parametry modelu silnikowego

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| Moc znamionowa silnika Pn | float | kW | 0.1 - 10000 | 100 | Wymagane |
| SprawnoĹ›Ä‡ Î· | float | % | 70 - 98 | 95 | Wymagane |
| WspĂłĹ‚czynnik mocy cos Ď† | float | - | 0.7 - 0.95 | 0.85 | Wymagane |
| PrÄ…d rozruchowy Ir/In | float | - | 4 - 8 | 6 | Wymagane |
| WspĂłĹ‚czynnik mocy rozruchowy cos Ď†r | float | - | 0.1 - 0.4 | 0.2 | Wymagane |
| Stosunek Ik"/In | float | - | 4 - 10 | 6.5 | Dla obliczeĹ„ zwarciowych |

#### 3.9.8 Grupa: Parametry zwarciowe

| Pole | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|-----|-----------|--------|----------|-----------|
| UwzglÄ™dnij w zwarciu | boolean | - | - | true | Dla silnikĂłw |
| WkĹ‚ad do Ik" | enum | - | PEĹNY / ZREDUKOWANY / BRAK | PEĹNY | Zgodnie z IEC 60909 |

#### 3.9.9 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Opis odbiornika | string | TAK | Opis funkcjonalny |
| Numer ewidencyjny | string | TAK | Numer wewnÄ™trzny |
| Lokalizacja | string | TAK | Miejsce instalacji |

#### 3.9.10 Grupa: WartoĹ›ci obliczeniowe (tylko odczyt)

| Pole | Typ | Jednostka | ĹąrĂłdĹ‚o | Opis |
|------|-----|-----------|--------|------|
| P obliczone | float | MW | PowerFlowResult | Moc czynna pobierana |
| Q obliczone | float | Mvar | PowerFlowResult | Moc bierna pobierana |
| S obliczone | float | MVA | PowerFlowResult | Moc pozorna |
| I obliczony | float | A | PowerFlowResult | PrÄ…d pobierany |
| Ik" (wkĹ‚ad silnikĂłw) | float | kA | ShortCircuitResult | Tylko dla modelu silnikowego |

#### 3.9.11 Grupa: Stan walidacji

| Kod | Poziom | Warunek | Komunikat |
|-----|--------|---------|-----------|
| E-LOD-001 | BĹ‚Ä…d | Brak szyny | Odbiornik nie jest przyĹ‚Ä…czony do szyny |
| E-LOD-002 | BĹ‚Ä…d | P < 0 | Moc czynna odbiornika nie moĹĽe byÄ‡ ujemna |
| E-LOD-003 | BĹ‚Ä…d | ZIP: suma â‰  1 | WspĂłĹ‚czynniki ZIP muszÄ… sumowaÄ‡ siÄ™ do 1 |
| W-LOD-001 | OstrzeĹĽenie | cos Ď† < 0.85 | Niski wspĂłĹ‚czynnik mocy |

#### 3.9.12 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

### 3.10 Stacja (Substation) â€” obiekt grupujÄ…cy

#### 3.10.1 Grupa: Identyfikacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| ID | string | NIE | Unikalny identyfikator systemowy |
| Nazwa | string | TAK | Nazwa stacji |
| UUID | UUID | NIE | Globalnie unikalny identyfikator |
| Typ obiektu | enum | NIE | Substation |

#### 3.10.2 Grupa: Stan

| Pole | Typ | Edytowalne | DomyĹ›lna | Opis |
|------|-----|------------|----------|------|
| W eksploatacji | boolean | TAK | true | Czy stacja jest aktywna |
| Stan cyklu ĹĽycia | enum | TAK | AKTYWNY | PROJEKTOWANY / AKTYWNY / WYĹÄ„CZONY |

#### 3.10.3 Grupa: Lokalizacja

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| WspĂłĹ‚rzÄ™dne GPS | (float, float) | TAK | SzerokoĹ›Ä‡, dĹ‚ugoĹ›Ä‡ geograficzna |
| Adres | string | TAK | Adres pocztowy |
| DziaĹ‚ka | string | TAK | Numer dziaĹ‚ki ewidencyjnej |

#### 3.10.4 Grupa: Elementy stacji (tylko odczyt)

| Pole | Typ | Opis |
|------|-----|------|
| Szyny | list:Bus | Lista szyn naleĹĽÄ…cych do stacji |
| Transformatory | list:Transformer | Lista transformatorĂłw |
| Pola rozdzielcze | int | Liczba pĂłl |

#### 3.10.5 Grupa: Dane znamionowe (tabliczka)

| Pole | Typ | Edytowalne | Opis |
|------|-----|------------|------|
| Typ stacji | enum | TAK | GPZ / RPZ / STACJA_KOĹCOWA / ROZDZIELNIA |
| Poziomy napiÄ™Ä‡ | string | TAK | np. "110/15 kV" |
| Moc zainstalowana | float | TAK | MVA |
| WĹ‚aĹ›ciciel | string | TAK | Operator/wĹ‚aĹ›ciciel |
| Rok budowy | int | TAK | Rok oddania do eksploatacji |

#### 3.10.6 Grupa: Metadane audytowe

(Struktura identyczna jak dla Bus)

---

## 4. Menu Kontekstowe

Dla KAĹ»DEGO typu obiektu definiuje siÄ™ peĹ‚ne menu kontekstowe dostÄ™pne po klikniÄ™ciu prawym przyciskiem myszy. Menu MUSZÄ„ byÄ‡ w jÄ™zyku polskim.

### 4.1 Menu Kontekstowe: Projekt

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ đź“ Projekt: "SieÄ‡ SN ZakĹ‚ad"            â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nowy projekt...                         â”‚
â”‚ OtwĂłrz projekt...                       â”‚
â”‚ Zapisz projekt                          â”‚
â”‚ Zapisz jako...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ WĹ‚aĹ›ciwoĹ›ci projektu...                 â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Eksportuj do benchmark...            â”‚
â”‚ Eksportuj do CIM...                     â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Zamknij projekt                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| Nowy projekt... | âś“ | âś— | Tworzy nowy projekt |
| OtwĂłrz projekt... | âś“ | âś— | Otwiera istniejÄ…cy projekt |
| Zapisz projekt | âś“ | âś“ | Zapisuje stan projektu |
| Zapisz jako... | âś“ | âś“ | Zapisuje kopiÄ™ projektu |
| WĹ‚aĹ›ciwoĹ›ci projektu... | âś“ | âś“ (RO) | Otwiera dialog wĹ‚aĹ›ciwoĹ›ci |
| Eksportuj do benchmark... | âś“ | âś“ | Eksportuje model do formatu PF |
| Eksportuj do CIM... | âś“ | âś“ | Eksportuje do formatu CIM |
| Zamknij projekt | âś“ | âś“ | Zamyka projekt (z potwierdzeniem) |

### 4.2 Menu Kontekstowe: Model Sieci

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ đź“ Model sieci                          â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–¶ Dodaj                                 â”‚
â”‚   â”śâ”€ StacjÄ™...                          â”‚
â”‚   â”śâ”€ SzynÄ™...                           â”‚
â”‚   â”śâ”€ LiniÄ™/kabel...                     â”‚
â”‚   â”śâ”€ Transformator 2-uzwojeniowy...     â”‚
â”‚   â”śâ”€ Transformator 3-uzwojeniowy...     â”‚
â”‚   â”śâ”€ WyĹ‚Ä…cznik...                       â”‚
â”‚   â”śâ”€ RozĹ‚Ä…cznik...                      â”‚
â”‚   â”śâ”€ ĹąrĂłdĹ‚o (sieÄ‡ zewnÄ™trzna)...        â”‚
â”‚   â”śâ”€ Generator...                       â”‚
â”‚   â””â”€ Odbiornik...                       â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Waliduj model sieci                     â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ WĹ‚aĹ›ciwoĹ›ci modelu...                   â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ wszystkie elementy...              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| Dodaj > StacjÄ™... | âś“ | âś— | Otwiera kreator stacji |
| Dodaj > SzynÄ™... | âś“ | âś— | Otwiera kreator szyny |
| Dodaj > LiniÄ™/kabel... | âś“ | âś— | Otwiera kreator linii |
| Dodaj > Transformator... | âś“ | âś— | Otwiera kreator transformatora |
| Dodaj > WyĹ‚Ä…cznik... | âś“ | âś— | Otwiera kreator wyĹ‚Ä…cznika |
| Dodaj > RozĹ‚Ä…cznik... | âś“ | âś— | Otwiera kreator rozĹ‚Ä…cznika |
| Dodaj > ĹąrĂłdĹ‚o... | âś“ | âś— | Otwiera kreator ĹşrĂłdĹ‚a |
| Dodaj > Generator... | âś“ | âś— | Otwiera kreator generatora |
| Dodaj > Odbiornik... | âś“ | âś— | Otwiera kreator odbiornika |
| Waliduj model sieci | âś“ | âś“ | Uruchamia NetworkValidator |
| WĹ‚aĹ›ciwoĹ›ci modelu... | âś“ | âś“ (RO) | Otwiera wĹ‚aĹ›ciwoĹ›ci modelu |
| UsuĹ„ wszystkie elementy... | âś“ | âś— | Usuwa z potwierdzeniem |

### 4.3 Menu Kontekstowe: Stacja

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ đźŹ­ Stacja: GPZ GĹ‚Ăłwny                   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ â–¶ Dodaj do stacji                       â”‚
â”‚   â”śâ”€ SzynÄ™...                           â”‚
â”‚   â”śâ”€ Transformator...                   â”‚
â”‚   â”śâ”€ Pole rozdzielcze...                â”‚
â”‚   â””â”€ WyposaĹĽenie pomocnicze...          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ elementy stacji                   â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Kopiuj stacjÄ™...                        â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ stacjÄ™...                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| Dodaj do stacji > ... | âś“ | âś— | Dodaje element do stacji |
| PokaĹĽ elementy stacji | âś“ | âś“ | Filtruje drzewo do elementĂłw stacji |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na stacji |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| Kopiuj stacjÄ™... | âś“ | âś— | Tworzy kopiÄ™ stacji z elementami |
| UsuĹ„ stacjÄ™... | âś“ | âś— | Usuwa stacjÄ™ (z potwierdzeniem) |

### 4.4 Menu Kontekstowe: Szyna

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â•â•â• Szyna: SZ-GPZ-SN                    â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ â–¶ PodĹ‚Ä…cz do szyny                      â”‚
â”‚   â”śâ”€ LiniÄ™/kabel...                     â”‚
â”‚   â”śâ”€ Transformator...                   â”‚
â”‚   â”śâ”€ WyĹ‚Ä…cznik...                       â”‚
â”‚   â”śâ”€ RozĹ‚Ä…cznik...                      â”‚
â”‚   â”śâ”€ ĹąrĂłdĹ‚o...                          â”‚
â”‚   â”śâ”€ Generator...                       â”‚
â”‚   â””â”€ Odbiornik...                       â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ poĹ‚Ä…czone elementy                â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Ustaw jako lokalizacjÄ™ zwarcia          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ szynÄ™...                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| PodĹ‚Ä…cz do szyny > ... | âś“ | âś— | Tworzy nowy element poĹ‚Ä…czony z szynÄ… |
| PokaĹĽ poĹ‚Ä…czone elementy | âś“ | âś“ | WyĹ›wietla listÄ™ poĹ‚Ä…czonych elementĂłw |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na szynie |
| Ustaw jako lokalizacjÄ™ zwarcia | âś“ | âś— | Ustawia szynÄ™ jako fault_location w aktywnym przypadku |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| UsuĹ„ szynÄ™... | âś“ | âś— | Usuwa szynÄ™ (sprawdza poĹ‚Ä…czenia) |

### 4.5 Menu Kontekstowe: Linia/Kabel

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â”€â”€â”€ Linia: LN-GPZ-STA                   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ ZmieĹ„ szynÄ™ poczÄ…tkowÄ…...               â”‚
â”‚ ZmieĹ„ szynÄ™ koĹ„cowÄ…...                  â”‚
â”‚ ZamieĹ„ kierunek                         â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Edytor impedancji...                    â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Podziel liniÄ™...                        â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ liniÄ™...                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| ZmieĹ„ szynÄ™ poczÄ…tkowÄ…... | âś“ | âś— | Otwiera selektor szyny |
| ZmieĹ„ szynÄ™ koĹ„cowÄ…... | âś“ | âś— | Otwiera selektor szyny |
| ZamieĹ„ kierunek | âś“ | âś— | Zamienia from_bus i to_bus |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na linii |
| Edytor impedancji... | âś“ | âś— | Otwiera zaawansowany edytor impedancji |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| Podziel liniÄ™... | âś“ | âś— | Dzieli liniÄ™ na dwie czÄ™Ĺ›ci |
| UsuĹ„ liniÄ™... | âś“ | âś— | Usuwa liniÄ™ (z potwierdzeniem) |

### 4.6 Menu Kontekstowe: Transformator

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ âŠ— Transformator: TR-GPZ-01              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ ZmieĹ„ szynÄ™ GN...                       â”‚
â”‚ ZmieĹ„ szynÄ™ DN...                       â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ SzczegĂłĹ‚owy model transformatora...     â”‚
â”‚ Konfiguracja OLTC...                    â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Ustaw zaczep:  [â–˛] [0] [â–Ľ]              â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ transformator...                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| ZmieĹ„ szynÄ™ GN... | âś“ | âś— | Otwiera selektor szyny |
| ZmieĹ„ szynÄ™ DN... | âś“ | âś— | Otwiera selektor szyny |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na transformatorze |
| SzczegĂłĹ‚owy model transformatora... | âś“ | âś— | Otwiera modal zaawansowany |
| Konfiguracja OLTC... | âś“ | âś— | Otwiera konfiguracjÄ™ OLTC |
| Ustaw zaczep | âś“ | âś— | Zmienia aktualny zaczep |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| UsuĹ„ transformator... | âś“ | âś— | Usuwa transformator (z potwierdzeniem) |

### 4.7 Menu Kontekstowe: WyĹ‚Ä…cznik

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â—Ż WyĹ‚Ä…cznik: WĹ-GPZ-SN-01               â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Pozycja: ZAMKNIJ                        â”‚
â”‚ Pozycja: OTWĂ“RZ                         â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ ZmieĹ„ szynÄ™...                          â”‚
â”‚ ZmieĹ„ gaĹ‚Ä…Ĺş...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ SprawdĹş zdolnoĹ›Ä‡ Ĺ‚Ä…czeniowÄ…...          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ wyĹ‚Ä…cznik...                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| Pozycja: ZAMKNIJ | âś“ | âś— | Ustawia pozycjÄ™ = ZAMKNIÄTY |
| Pozycja: OTWĂ“RZ | âś“ | âś— | Ustawia pozycjÄ™ = OTWARTY |
| ZmieĹ„ szynÄ™... | âś“ | âś— | Otwiera selektor szyny |
| ZmieĹ„ gaĹ‚Ä…Ĺş... | âś“ | âś— | Otwiera selektor gaĹ‚Ä™zi |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na wyĹ‚Ä…czniku |
| SprawdĹş zdolnoĹ›Ä‡ Ĺ‚Ä…czeniowÄ…... | âś“ | âś“ | PorĂłwnuje Ik" z parametrami znamionowymi |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| UsuĹ„ wyĹ‚Ä…cznik... | âś“ | âś— | Usuwa wyĹ‚Ä…cznik (z potwierdzeniem) |

### 4.8 Menu Kontekstowe: RozĹ‚Ä…cznik

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â”€ RozĹ‚Ä…cznik: RZ-STA-01                 â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Pozycja: ZAMKNIJ                        â”‚
â”‚ Pozycja: OTWĂ“RZ                         â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ ZmieĹ„ szynÄ™...                          â”‚
â”‚ ZmieĹ„ gaĹ‚Ä…Ĺş...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ rozĹ‚Ä…cznik...                      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| Pozycja: ZAMKNIJ | âś“ | âś— | Ustawia pozycjÄ™ = ZAMKNIÄTY |
| Pozycja: OTWĂ“RZ | âś“ | âś— | Ustawia pozycjÄ™ = OTWARTY |
| ZmieĹ„ szynÄ™... | âś“ | âś— | Otwiera selektor szyny |
| ZmieĹ„ gaĹ‚Ä…Ĺş... | âś“ | âś— | Otwiera selektor gaĹ‚Ä™zi |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na rozĹ‚Ä…czniku |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| UsuĹ„ rozĹ‚Ä…cznik... | âś“ | âś— | Usuwa rozĹ‚Ä…cznik (z potwierdzeniem) |

### 4.9 Menu Kontekstowe: ĹąrĂłdĹ‚o (SieÄ‡ ZewnÄ™trzna)

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ âšˇ ĹąrĂłdĹ‚o: ZR-GPZ                        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ ZmieĹ„ szynÄ™ przyĹ‚Ä…czenia...             â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Model zwarciowy ĹşrĂłdĹ‚a...               â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Ustaw jako wÄ™zeĹ‚ bilansujÄ…cy (SLACK)    â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ ĹşrĂłdĹ‚o...                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| ZmieĹ„ szynÄ™ przyĹ‚Ä…czenia... | âś“ | âś— | Otwiera selektor szyny |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na ĹşrĂłdle |
| Model zwarciowy ĹşrĂłdĹ‚a... | âś“ | âś— | Otwiera modal modelu zwarciowego |
| Ustaw jako wÄ™zeĹ‚ bilansujÄ…cy | âś“ | âś— | Ustawia typ wÄ™zĹ‚a = SLACK |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| UsuĹ„ ĹşrĂłdĹ‚o... | âś“ | âś— | Usuwa ĹşrĂłdĹ‚o (sprawdza czy nie jedyne) |

### 4.10 Menu Kontekstowe: Generator

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ âšˇ Generator: GEN-ST01-01                â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ ZmieĹ„ szynÄ™ przyĹ‚Ä…czenia...             â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Parametry zwarciowe generatora...       â”‚
â”‚ Krzywa zdolnoĹ›ci (PQ diagram)...        â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Ustaw moc zadanÄ…...                     â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ generator...                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| ZmieĹ„ szynÄ™ przyĹ‚Ä…czenia... | âś“ | âś— | Otwiera selektor szyny |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na generatorze |
| Parametry zwarciowe generatora... | âś“ | âś— | Otwiera modal parametrĂłw zwarciowych |
| Krzywa zdolnoĹ›ci... | âś“ | âś“ | WyĹ›wietla diagram PQ generatora |
| Ustaw moc zadanÄ…... | âś“ | âś— | Otwiera dialog ustawienia mocy P, Q |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| UsuĹ„ generator... | âś“ | âś— | Usuwa generator (z potwierdzeniem) |

### 4.11 Menu Kontekstowe: Odbiornik

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â–˝ Odbiornik: OD-STA-01                  â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci...                          â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ ZmieĹ„ szynÄ™ przyĹ‚Ä…czenia...             â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ na schemacie                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Model obciÄ…ĹĽenia...                     â”‚
â”‚   â”śâ”€ Model PQ                           â”‚
â”‚   â”śâ”€ Model ZIP                          â”‚
â”‚   â””â”€ Model silnikowy                    â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Ustaw moc zadanÄ…...                     â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ W eksploatacji                     [âś“]  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ odbiornik...                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci... | âś“ | âś“ (RO) | Otwiera siatkÄ™ wĹ‚aĹ›ciwoĹ›ci |
| ZmieĹ„ szynÄ™ przyĹ‚Ä…czenia... | âś“ | âś— | Otwiera selektor szyny |
| PokaĹĽ na schemacie | âś“ | âś“ | Centruje widok na odbiorniku |
| Model obciÄ…ĹĽenia > Model PQ | âś“ | âś— | Ustawia typ modelu = PQ |
| Model obciÄ…ĹĽenia > Model ZIP | âś“ | âś— | Ustawia typ modelu = ZIP |
| Model obciÄ…ĹĽenia > Model silnikowy | âś“ | âś— | Ustawia typ modelu = SILNIK |
| Ustaw moc zadanÄ…... | âś“ | âś— | Otwiera dialog ustawienia mocy P, Q |
| W eksploatacji | âś“ | âś— | PrzeĹ‚Ä…cza stan in_service |
| UsuĹ„ odbiornik... | âś“ | âś— | Usuwa odbiornik (z potwierdzeniem) |

### 4.12 Menu Kontekstowe: Przypadek Obliczeniowy

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ âšˇ Przypadek: SC-001                     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ‚aĹ›ciwoĹ›ci przypadku...                â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Ustaw jako aktywny                      â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Oblicz                                  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PokaĹĽ wyniki                            â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Klonuj przypadek...                     â”‚
â”‚ PorĂłwnaj z przypadkiem...               â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Eksportuj wyniki...                     â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ przypadek...                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| WĹ‚aĹ›ciwoĹ›ci przypadku... | âś“ | âś“ (RO) | Otwiera parametry przypadku |
| Ustaw jako aktywny | âś“ | âś“ | Ustawia przypadek jako aktywny |
| Oblicz | âś“ | âś“ | Uruchamia solver dla przypadku |
| PokaĹĽ wyniki | âś“ (gdy dostÄ™pne) | âś“ | PrzeĹ‚Ä…cza do trybu wynikĂłw |
| Klonuj przypadek... | âś“ | âś“ | Tworzy kopiÄ™ przypadku z parametrami |
| PorĂłwnaj z przypadkiem... | âś“ | âś“ | Otwiera porĂłwnanie wynikĂłw |
| Eksportuj wyniki... | âś“ (gdy dostÄ™pne) | âś“ | Eksportuje wyniki do pliku |
| UsuĹ„ przypadek... | âś“ | âś— | Usuwa przypadek (z potwierdzeniem) |

### 4.13 Menu Kontekstowe: Wynik

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ đź“Š Wynik: SC-001-R-2024-01-15-14:30     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ PokaĹĽ wyniki                            â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ SzczegĂłĹ‚y wyniku...                     â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Eksportuj do CSV...                     â”‚
â”‚ Eksportuj do PDF...                     â”‚
â”‚ Eksportuj do Excel...                   â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ PorĂłwnaj z innym wynikiem...            â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ UsuĹ„ wynik...                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

| Akcja | Tryb Edycji | Tryb WynikĂłw | WpĹ‚yw |
|-------|-------------|--------------|-------|
| PokaĹĽ wyniki | âś“ | âś“ | PrzeĹ‚Ä…cza do trybu wynikĂłw |
| SzczegĂłĹ‚y wyniku... | âś“ | âś“ | Otwiera peĹ‚ny raport wynikĂłw |
| Eksportuj do CSV... | âś“ | âś“ | Eksportuje dane do CSV |
| Eksportuj do PDF... | âś“ | âś“ | Generuje raport PDF |
| Eksportuj do Excel... | âś“ | âś“ | Eksportuje do formatu XLSX |
| PorĂłwnaj z innym wynikiem... | âś“ | âś“ | Otwiera porĂłwnanie wynikĂłw |
| UsuĹ„ wynik... | âś“ | âś“ | Usuwa wynik (z potwierdzeniem) |

---

## 5. Przebieg Kreatora â€” PeĹ‚ny Cykl InĹĽynierski

### 5.1 ObowiÄ…zkowa KolejnoĹ›Ä‡ KrokĂłw

Kreator wymusza nastÄ™pujÄ…cÄ… sekwencjÄ™ krokĂłw dla peĹ‚nego cyklu projektowania i analizy sieci:

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                           PEĹNY CYKL INĹ»YNIERSKI                            â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚  1. DEFINICJA PROJEKTU                                                      â”‚
â”‚     â””â”€â–ş 2. SZKIELET TOPOLOGII SIECI                                         â”‚
â”‚           â””â”€â–ş 3. POZIOMY NAPIÄÄ† I SZYNY                                     â”‚
â”‚                 â””â”€â–ş 4. STACJE                                               â”‚
â”‚                       â””â”€â–ş 5. LINIE I KABLE                                  â”‚
â”‚                             â””â”€â–ş 6. TRANSFORMATORY (2W/3W)                   â”‚
â”‚                                   â””â”€â–ş 7. APARATURA ĹÄ„CZENIOWA               â”‚
â”‚                                         â””â”€â–ş 8. ĹąRĂ“DĹA I GENERATORY          â”‚
â”‚                                               â””â”€â–ş 9. ODBIORY                â”‚
â”‚                                                     â””â”€â–ş 10. WALIDACJA SIECI â”‚
â”‚                                                           â”‚                 â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”               â”‚
â”‚  â”‚                                                                          â”‚
â”‚  â””â”€â–ş 11. TWORZENIE PRZYPADKU OBLICZENIOWEGO                                 â”‚
â”‚         â””â”€â–ş 12. PARAMETRYZACJA PRZYPADKU                                    â”‚
â”‚               â””â”€â–ş 13. OBLICZENIA                                            â”‚
â”‚                     â””â”€â–ş 14. ANALIZA WYNIKĂ“W                                 â”‚
â”‚                                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 5.2 Faza I: Budowanie Modelu Sieci (Kroki 1-10)

| Krok | Identyfikator | TytuĹ‚ | Cel | Warunek PrzejĹ›cia |
|------|---------------|-------|-----|-------------------|
| 1 | WZ-01 | Definicja projektu | Utworzenie lub wybĂłr projektu | Projekt zapisany |
| 2 | WZ-02 | Szkielet topologii | OkreĹ›lenie struktury sieci | Minimum 1 szyna |
| 3 | WZ-03 | Poziomy napiÄ™Ä‡ | Definicja poziomĂłw napiÄ™Ä‡ | Wszystkie szyny majÄ… Un |
| 4 | WZ-04 | Stacje | Grupowanie elementĂłw w stacje | Opcjonalne |
| 5 | WZ-05 | Linie i kable | Definicja gaĹ‚Ä™zi liniowych | Wszystkie linie majÄ… R', X' |
| 6 | WZ-06 | Transformatory | Definicja transformatorĂłw | Wszystkie TR majÄ… uk%, Sn |
| 7 | WZ-07 | Aparatura Ĺ‚Ä…czeniowa | Definicja wyĹ‚Ä…cznikĂłw i rozĹ‚Ä…cznikĂłw | Wszystkie majÄ… pozycjÄ™ |
| 8 | WZ-08 | ĹąrĂłdĹ‚a i generatory | Definicja ĹşrĂłdeĹ‚ zasilania | Minimum 1 ĹşrĂłdĹ‚o |
| 9 | WZ-09 | Odbiory | Definicja odbiornikĂłw | Wszystkie majÄ… P, Q |
| 10 | WZ-10 | Walidacja sieci | Sprawdzenie poprawnoĹ›ci modelu | Brak bĹ‚Ä™dĂłw krytycznych |

### 5.3 Faza II: Analiza (Kroki 11-14)

| Krok | Identyfikator | TytuĹ‚ | Cel | Warunek PrzejĹ›cia |
|------|---------------|-------|-----|-------------------|
| 11 | WZ-11 | Tworzenie przypadku | Utworzenie przypadku obliczeniowego | Przypadek utworzony |
| 12 | WZ-12 | Parametryzacja przypadku | Konfiguracja parametrĂłw solvera | Wszystkie parametry zdefiniowane |
| 13 | WZ-13 | Obliczenia | Wykonanie obliczeĹ„ | Solver zakoĹ„czony bez bĹ‚Ä™dĂłw |
| 14 | WZ-14 | Analiza wynikĂłw | PrzeglÄ…danie i eksport wynikĂłw | N/A (krok koĹ„cowy) |

### 5.4 ReguĹ‚y Nawigacji

| Przycisk | Akcja | Walidacja |
|----------|-------|-----------|
| â—€ Wstecz | PowrĂłt do poprzedniego kroku | Brak (dane zachowane) |
| Dalej â–¶ | PrzejĹ›cie do nastÄ™pnego kroku | Walidacja bieĹĽÄ…cego kroku |
| Zapisz | Zapisuje model bez przejĹ›cia | Brak |
| Anuluj | Anuluje kreator | Potwierdzenie jeĹ›li sÄ… zmiany |
| ZakoĹ„cz | KoĹ„czy kreator (tylko z WZ-10 lub WZ-14) | PeĹ‚na walidacja modelu |

### 5.5 Walidacja Przed Solverem

**WYMĂ“G BEZWZGLÄDNY:** Krok 10 (Walidacja sieci) MUSI zakoĹ„czyÄ‡ siÄ™ sukcesem przed przejĹ›ciem do krokĂłw obliczeniowych.

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ KROK 10: WALIDACJA SIECI                                        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                 â”‚
â”‚ NetworkValidator.validate(model)                                â”‚
â”‚         â”‚                                                       â”‚
â”‚         â”śâ”€â”€ BĹÄDY KRYTYCZNE â†’ [Dalej â–¶] ZABLOKOWANY             â”‚
â”‚         â”‚                                                       â”‚
â”‚         â”śâ”€â”€ OSTRZEĹ»ENIA â†’ [Dalej â–¶] AKTYWNY                     â”‚
â”‚         â”‚                 (UĹĽytkownik musi potwierdziÄ‡)          â”‚
â”‚         â”‚                                                       â”‚
â”‚         â””â”€â”€ BRAK PROBLEMĂ“W â†’ [Dalej â–¶] AKTYWNY                  â”‚
â”‚                                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 6. SzczegĂłĹ‚owe Ekrany i Modale

Dla KAĹ»DEGO ekranu kreatora definiuje siÄ™ kompletnÄ… specyfikacjÄ™.

### 6.1 Ekran WZ-01: Definicja Projektu

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-01 |
| **TytuĹ‚** | Definicja projektu |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | Uruchomienie kreatora / Menu: Plik > Nowy projekt |
| **Warunki wstÄ™pne** | Brak |

#### 6.1.1 Pola formularza

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| project_name | Nazwa projektu | string | - | 1-255 znakĂłw | "Nowy projekt" | Wymagane, niepuste |
| project_description | Opis projektu | textarea | - | 0-2000 znakĂłw | "" | Opcjonalne |
| client_name | Nazwa klienta | string | - | 0-255 znakĂłw | "" | Opcjonalne |
| project_number | Numer projektu | string | - | 0-50 znakĂłw | "" | Opcjonalne |
| project_date | Data projektu | date | - | - | Dzisiaj | Wymagane |
| author | Autor | string | - | 0-100 znakĂłw | Zalogowany uĹĽytkownik | Opcjonalne |
| base_frequency | CzÄ™stotliwoĹ›Ä‡ bazowa | enum | Hz | 50 / 60 | 50 | Wymagane |
| base_voltage_levels | Poziomy napiÄ™Ä‡ | multi-select | kV | 0.4, 6, 10, 15, 20, 30, 110, 220, 400 | [15, 110] | Minimum 1 |

#### 6.1.2 ZakĹ‚adki

| ZakĹ‚adka | ZawartoĹ›Ä‡ |
|----------|-----------|
| OgĂłlne | Pola podstawowe (nazwa, opis, klient) |
| Parametry systemu | CzÄ™stotliwoĹ›Ä‡, poziomy napiÄ™Ä‡ |
| Metadane | Autor, data, numer projektu |

#### 6.1.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| Dalej â–¶ | PrzejdĹş do WZ-02 | Nazwa projektu niepusta |
| Anuluj | Zamknij kreator | - |

#### 6.1.4 WpĹ‚yw na model

- Tworzy nowy obiekt Project
- Inicjalizuje pusty NetworkModel
- Ustawia parametry systemowe (czÄ™stotliwoĹ›Ä‡, poziomy napiÄ™Ä‡)

---

### 6.2 Ekran WZ-02: Szkielet Topologii Sieci

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-02 |
| **TytuĹ‚** | Szkielet topologii sieci |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-01 |
| **Warunki wstÄ™pne** | Projekt utworzony |

#### 6.2.1 Pola formularza

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| network_type | Typ sieci | enum | - | PROMIENIOWA / PIERĹšCIENIOWA / MIESZANA | PROMIENIOWA | Wymagane |
| network_name | Nazwa sieci | string | - | 1-255 znakĂłw | "Model sieci" | Wymagane |
| initial_buses_count | Liczba poczÄ…tkowych szyn | int | - | 1 - 100 | 3 | Wymagane, â‰Ą 1 |

#### 6.2.2 Widok graficzny

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PODGLÄ„D TOPOLOGII                                               â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                 â”‚
â”‚     â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Szyna 1 (Un = ? kV)       â”‚
â”‚              â”‚                                                  â”‚
â”‚             [?]                                                 â”‚
â”‚              â”‚                                                  â”‚
â”‚     â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Szyna 2 (Un = ? kV)       â”‚
â”‚              â”‚                                                  â”‚
â”‚             [?]                                                 â”‚
â”‚              â”‚                                                  â”‚
â”‚     â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Szyna 3 (Un = ? kV)       â”‚
â”‚                                                                 â”‚
â”‚ [+ Dodaj szynÄ™] [- UsuĹ„ ostatniÄ…]                              â”‚
â”‚                                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.2.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj szynÄ™ | Dodaje nowÄ… szynÄ™ do listy | - |
| - UsuĹ„ ostatniÄ… | Usuwa ostatniÄ… szynÄ™ | Minimum 1 szyna pozostaje |
| â—€ Wstecz | PowrĂłt do WZ-01 | - |
| Dalej â–¶ | PrzejdĹş do WZ-03 | Minimum 1 szyna |

#### 6.2.4 WpĹ‚yw na model

- Tworzy obiekty Bus dla kaĹĽdej szyny
- Ustawia wstÄ™pnÄ… topologiÄ™

---

### 6.3 Ekran WZ-03: Poziomy NapiÄ™Ä‡ i Szyny

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-03 |
| **TytuĹ‚** | Poziomy napiÄ™Ä‡ i parametry szyn |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-02 |
| **Warunki wstÄ™pne** | Minimum 1 szyna utworzona |

#### 6.3.1 Tabela edycyjna szyn

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PARAMETRY SZYN                                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa         â”‚ NapiÄ™cie [kV]  â”‚ Typ szyny  â”‚ PrÄ…d zn [A] â”‚ Stacja          â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [SZ-GPZ-WN  ] â”‚ [110.0     ] â–Ľ â”‚ [ZBIORCZA] â”‚ [1250     ] â”‚ [GPZ GĹ‚Ăłwny  ] â–Ľâ”‚
â”‚ [SZ-GPZ-SN  ] â”‚ [15.0      ] â–Ľ â”‚ [ZBIORCZA] â”‚ [2000     ] â”‚ [GPZ GĹ‚Ăłwny  ] â–Ľâ”‚
â”‚ [SZ-STA-01  ] â”‚ [15.0      ] â–Ľ â”‚ [ZBIORCZA] â”‚ [1000     ] â”‚ [Stacja A    ] â–Ľâ”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj szynÄ™] [Importuj z listy...]                                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.3.2 Pola dla kaĹĽdej szyny

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| name | Nazwa | string | - | 1-100 znakĂłw | SZ-{NR} | Wymagane, unikalne |
| nominal_voltage | NapiÄ™cie znamionowe | select | kV | Z listy projektu | 15.0 | Wymagane |
| bus_type | Typ szyny | enum | - | ZBIORCZA / SEKCYJNA / ODCZEPOWA | ZBIORCZA | Wymagane |
| rated_current | PrÄ…d znamionowy | float | A | 100 - 10000 | 1000 | Wymagane, > 0 |
| substation | Stacja | ref:Substation | - | Lista stacji | - | Opcjonalne |

#### 6.3.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj szynÄ™ | Dodaje nowy wiersz | - |
| Importuj z listy... | Importuje szyny z pliku CSV | - |
| â—€ Wstecz | PowrĂłt do WZ-02 | - |
| Dalej â–¶ | PrzejdĹş do WZ-04 | Wszystkie szyny majÄ… Un > 0 |

#### 6.3.4 WpĹ‚yw na model

- Aktualizuje parametry obiektĂłw Bus
- Przypisuje szyny do stacji

---

### 6.4 Ekran WZ-04: Stacje

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-04 |
| **TytuĹ‚** | Definicja stacji |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-03 |
| **Warunki wstÄ™pne** | Szyny zdefiniowane |

#### 6.4.1 Tabela edycyjna stacji

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ STACJE                                                                      â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa         â”‚ Typ stacji     â”‚ Poziomy napiÄ™Ä‡    â”‚ Szyny                  â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [GPZ GĹ‚Ăłwny ] â”‚ [GPZ        ] â–Ľâ”‚ 110/15 kV         â”‚ SZ-GPZ-WN, SZ-GPZ-SN   â”‚
â”‚ [Stacja A   ] â”‚ [ROZDZIELNIA] â–Ľâ”‚ 15 kV             â”‚ SZ-STA-01              â”‚
â”‚ [Stacja B   ] â”‚ [ROZDZIELNIA] â–Ľâ”‚ 15 kV             â”‚ SZ-STB-01              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj stacjÄ™]                                                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.4.2 Pola dla kaĹĽdej stacji

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| name | Nazwa stacji | string | - | 1-100 znakĂłw | "Stacja {NR}" | Wymagane, unikalne |
| station_type | Typ stacji | enum | - | GPZ / RPZ / STACJA_KOĹCOWA / ROZDZIELNIA | ROZDZIELNIA | Wymagane |
| voltage_levels | Poziomy napiÄ™Ä‡ | calculated | kV | - | - | Z przypisanych szyn |
| buses | Szyny | multi-ref:Bus | - | - | - | Minimum 1 szyna |
| address | Adres | string | - | 0-255 znakĂłw | "" | Opcjonalne |
| gps_lat | SzerokoĹ›Ä‡ GPS | float | Â° | -90 - 90 | - | Opcjonalne |
| gps_lon | DĹ‚ugoĹ›Ä‡ GPS | float | Â° | -180 - 180 | - | Opcjonalne |

#### 6.4.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj stacjÄ™ | Dodaje nowÄ… stacjÄ™ | - |
| â—€ Wstecz | PowrĂłt do WZ-03 | - |
| Dalej â–¶ | PrzejdĹş do WZ-05 | - |
| PomiĹ„ | PrzejdĹş do WZ-05 bez definiowania stacji | - |

#### 6.4.4 WpĹ‚yw na model

- Tworzy obiekty Substation
- Przypisuje szyny do stacji

---

### 6.5 Ekran WZ-05: Linie i Kable

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-05 |
| **TytuĹ‚** | Definicja linii i kabli |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-04 |
| **Warunki wstÄ™pne** | Minimum 2 szyny zdefiniowane |

#### 6.5.1 Tabela edycyjna linii

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ LINIE I KABLE                                                                           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa      â”‚ Od szyny â”‚ Do szyny â”‚ Typ   â”‚ DĹ‚ugoĹ›Ä‡    â”‚ R' [Î©/km]â”‚ X' [Î©/km]â”‚ Idop [A]  â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [LN-GPZ-A ]â”‚ [SZ-GPZ ]â–Ľâ”‚ [SZ-STA]â–Ľâ”‚[KABEL]â–Ľâ”‚ [2.5     ]â”‚ [0.125  ]â”‚ [0.08   ]â”‚ [350     ]â”‚
â”‚ [LN-GPZ-B ]â”‚ [SZ-GPZ ]â–Ľâ”‚ [SZ-STB]â–Ľâ”‚[NAPOW]â–Ľâ”‚ [5.0     ]â”‚ [0.27   ]â”‚ [0.35   ]â”‚ [280     ]â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj liniÄ™] [Wybierz z katalogu...]                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.5.2 Pola dla kaĹĽdej linii

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| name | Nazwa | string | - | 1-100 znakĂłw | LN-{OD}-{DO} | Wymagane, unikalne |
| from_bus | Szyna poczÄ…tkowa | ref:Bus | - | Lista szyn | - | Wymagane |
| to_bus | Szyna koĹ„cowa | ref:Bus | - | Lista szyn | - | Wymagane, â‰  from_bus |
| line_type | Typ przewodu | enum | - | KABEL / NAPOWIETRZNA | KABEL | Wymagane |
| length | DĹ‚ugoĹ›Ä‡ | float | km | 0.001 - 1000 | 1.0 | Wymagane, > 0 |
| r_per_km | Rezystancja R' | float | Î©/km | 0.001 - 10 | 0.125 | Wymagane, > 0 |
| x_per_km | Reaktancja X' | float | Î©/km | 0.001 - 10 | 0.08 | Wymagane, > 0 |
| b_per_km | Susceptancja B' | float | ÂµS/km | 0 - 1000 | 0 | â‰Ą 0 |
| rated_current | PrÄ…d dopuszczalny | float | A | 10 - 5000 | 300 | Wymagane, > 0 |
| cross_section | PrzekrĂłj | float | mmÂ˛ | 1 - 2000 | 240 | Wymagane, > 0 |

#### 6.5.3 Przycisk "Wybierz z katalogu..."

Otwiera modal wyboru przewodu z predefiniowanego katalogu:

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ KATALOG PRZEWODĂ“W                                    [X]        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Filtr: [Wszystkie      ] â–Ľ  Szukaj: [               ]          â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–Ľ KABLE SN                                                      â”‚
â”‚   â”śâ”€ XRUHAKXS 3x70    R'=0.443 X'=0.099 Idop=195A              â”‚
â”‚   â”śâ”€ XRUHAKXS 3x120   R'=0.253 X'=0.094 Idop=260A              â”‚
â”‚   â”śâ”€ XRUHAKXS 3x185   R'=0.164 X'=0.089 Idop=325A              â”‚
â”‚   â”śâ”€ XRUHAKXS 3x240   R'=0.125 X'=0.086 Idop=380A      [âś“]     â”‚
â”‚   â””â”€ XRUHAKXS 3x300   R'=0.100 X'=0.083 Idop=430A              â”‚
â”‚ â–Ľ LINIE NAPOWIETRZNE SN                                         â”‚
â”‚   â”śâ”€ AFL-6 35         R'=0.85  X'=0.38  Idop=135A              â”‚
â”‚   â”śâ”€ AFL-6 70         R'=0.44  X'=0.36  Idop=210A              â”‚
â”‚   â””â”€ AFL-6 120        R'=0.27  X'=0.35  Idop=280A              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                    [Anuluj] [Wybierz]          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.5.4 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj liniÄ™ | Dodaje nowy wiersz | - |
| Wybierz z katalogu... | Otwiera katalog przewodĂłw | - |
| â—€ Wstecz | PowrĂłt do WZ-04 | - |
| Dalej â–¶ | PrzejdĹş do WZ-06 | Wszystkie linie majÄ… R', X' > 0 |

#### 6.5.5 WpĹ‚yw na model

- Tworzy obiekty LineBranch
- ĹÄ…czy szyny zgodnie z topologiÄ…

---

### 6.6 Ekran WZ-06: Transformatory

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-06 |
| **TytuĹ‚** | Definicja transformatorĂłw |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-05 |
| **Warunki wstÄ™pne** | Szyny o rĂłĹĽnych poziomach napiÄ™Ä‡ |

#### 6.6.1 WybĂłr typu transformatora

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TYP TRANSFORMATORA                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                 â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”            â”‚
â”‚  â”‚                     â”‚    â”‚                     â”‚            â”‚
â”‚  â”‚   âŠ—                 â”‚    â”‚     âŠ—               â”‚            â”‚
â”‚  â”‚  â•± â•˛                â”‚    â”‚    â•±â”‚â•˛              â”‚            â”‚
â”‚  â”‚ â•±   â•˛               â”‚    â”‚   â•± â”‚ â•˛             â”‚            â”‚
â”‚  â”‚ GN   DN             â”‚    â”‚  GN SN DN           â”‚            â”‚
â”‚  â”‚                     â”‚    â”‚                     â”‚            â”‚
â”‚  â”‚  2-uzwojeniowy      â”‚    â”‚  3-uzwojeniowy      â”‚            â”‚
â”‚  â”‚                     â”‚    â”‚                     â”‚            â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”            â”‚
â”‚                                                                 â”‚
â”‚  [â—‹] Transformator 2-uzwojeniowy                               â”‚
â”‚  [ ] Transformator 3-uzwojeniowy                               â”‚
â”‚                                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.6.2 Tabela edycyjna transformatorĂłw 2-uzwojeniowych

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TRANSFORMATORY 2-UZWOJENIOWE                                                                    â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa    â”‚ Szyna GN â”‚ Szyna DN â”‚ Sn[MVA]â”‚ Un_GN   â”‚ Un_DN   â”‚ uk [%] â”‚ Pk [kW]â”‚ Grupa poĹ‚Ä…czeĹ„  â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [TR-01  ]â”‚ [SZ-WN ]â–Ľâ”‚ [SZ-SN ]â–Ľâ”‚ [25.0 ]â”‚ [110.0 ]â”‚ [15.0  ]â”‚ [10.5 ]â”‚ [125  ]â”‚ [Dyn11       ] â–Ľâ”‚
â”‚ [TR-02  ]â”‚ [SZ-WN ]â–Ľâ”‚ [SZ-SN ]â–Ľâ”‚ [25.0 ]â”‚ [110.0 ]â”‚ [15.0  ]â”‚ [10.5 ]â”‚ [125  ]â”‚ [Dyn11       ] â–Ľâ”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj transformator] [Wybierz z katalogu...] [Konfiguruj OLTC...]                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.6.3 Pola dla transformatora 2-uzwojeniowego

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| name | Nazwa | string | - | 1-100 znakĂłw | TR-{STACJA}-{NR} | Wymagane, unikalne |
| hv_bus | Szyna GN | ref:Bus | - | Lista szyn | - | Wymagane |
| lv_bus | Szyna DN | ref:Bus | - | Lista szyn | - | Wymagane, â‰  hv_bus |
| rated_power | Moc znamionowa Sn | float | MVA | 0.05 - 1000 | 25.0 | Wymagane, > 0 |
| hv_voltage | NapiÄ™cie GN | float | kV | 0.4 - 800 | 110.0 | Wymagane, > lv_voltage |
| lv_voltage | NapiÄ™cie DN | float | kV | 0.4 - 400 | 15.0 | Wymagane, > 0 |
| uk_percent | NapiÄ™cie zwarcia uk% | float | % | 4 - 25 | 10.5 | Wymagane, 4 â‰¤ uk â‰¤ 25 |
| pk | Straty obciÄ…ĹĽeniowe Pk | float | kW | 1 - 1000 | 125.0 | Wymagane, > 0 |
| p0 | Straty jaĹ‚owe P0 | float | kW | 0.1 - 200 | 25.0 | Wymagane, > 0 |
| i0_percent | PrÄ…d jaĹ‚owy i0% | float | % | 0.1 - 5 | 0.5 | Opcjonalne |
| vector_group | Grupa poĹ‚Ä…czeĹ„ | enum | - | Lista grup | Dyn11 | Wymagane |

#### 6.6.4 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj transformator | Dodaje nowy wiersz | - |
| Wybierz z katalogu... | Otwiera katalog transformatorĂłw | - |
| Konfiguruj OLTC... | Otwiera modal OLTC | Transformator wybrany |
| â—€ Wstecz | PowrĂłt do WZ-05 | - |
| Dalej â–¶ | PrzejdĹş do WZ-07 | Wszystkie TR majÄ… uk%, Sn > 0 |

#### 6.6.5 WpĹ‚yw na model

- Tworzy obiekty TransformerBranch
- ĹÄ…czy szyny o rĂłĹĽnych poziomach napiÄ™Ä‡

---

### 6.7 Ekran WZ-07: Aparatura ĹÄ…czeniowa

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-07 |
| **TytuĹ‚** | Definicja aparatury Ĺ‚Ä…czeniowej |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-06 |
| **Warunki wstÄ™pne** | Szyny zdefiniowane |

#### 6.7.1 Tabela edycyjna wyĹ‚Ä…cznikĂłw

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ WYĹÄ„CZNIKI                                                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa        â”‚ Szyna    â”‚ GaĹ‚Ä…Ĺş    â”‚ Un [kV]   â”‚ In [A]    â”‚ Ik [kA]   â”‚ Pozycja        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [WĹ-GPZ-01 ]â”‚ [SZ-SN ]â–Ľâ”‚ [LN-01 ]â–Ľâ”‚ [15.0    ]â”‚ [1250    ]â”‚ [25.0    ]â”‚ [ZAMKNIÄTY  ] â–Ľâ”‚
â”‚ [WĹ-GPZ-02 ]â”‚ [SZ-SN ]â–Ľâ”‚ [LN-02 ]â–Ľâ”‚ [15.0    ]â”‚ [1250    ]â”‚ [25.0    ]â”‚ [ZAMKNIÄTY  ] â–Ľâ”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj wyĹ‚Ä…cznik] [Wybierz z katalogu...]                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.7.2 Tabela edycyjna rozĹ‚Ä…cznikĂłw

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ ROZĹÄ„CZNIKI                                                                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa        â”‚ Szyna    â”‚ GaĹ‚Ä…Ĺş    â”‚ Un [kV]   â”‚ In [A]    â”‚ Icw [kA]  â”‚ Pozycja        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [RZ-STA-01 ]â”‚ [SZ-STA]â–Ľâ”‚ [LN-01 ]â–Ľâ”‚ [15.0    ]â”‚ [630     ]â”‚ [25.0    ]â”‚ [ZAMKNIÄTY  ] â–Ľâ”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj rozĹ‚Ä…cznik] [Wybierz z katalogu...]                                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.7.3 Pola dla wyĹ‚Ä…cznika

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| name | Nazwa | string | - | 1-100 znakĂłw | WĹ-{SZYNA}-{NR} | Wymagane, unikalne |
| bus | Szyna | ref:Bus | - | Lista szyn | - | Wymagane |
| branch | GaĹ‚Ä…Ĺş | ref:Branch | - | Lista gaĹ‚Ä™zi | - | Opcjonalne |
| rated_voltage | NapiÄ™cie znamionowe Un | float | kV | 0.4 - 800 | 15.0 | Wymagane |
| rated_current | PrÄ…d znamionowy In | float | A | 100 - 10000 | 1250 | Wymagane |
| breaking_current | PrÄ…d wyĹ‚Ä…czalny Ik | float | kA | 5 - 100 | 25.0 | Wymagane |
| making_current | PrÄ…d zaĹ‚Ä…czalny Ima | float | kA | 10 - 250 | 63.0 | Wymagane |
| position | Pozycja | enum | - | ZAMKNIÄTY / OTWARTY | ZAMKNIÄTY | Wymagane |

#### 6.7.4 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj wyĹ‚Ä…cznik | Dodaje nowy wyĹ‚Ä…cznik | - |
| + Dodaj rozĹ‚Ä…cznik | Dodaje nowy rozĹ‚Ä…cznik | - |
| Wybierz z katalogu... | Otwiera katalog aparatury | - |
| â—€ Wstecz | PowrĂłt do WZ-06 | - |
| Dalej â–¶ | PrzejdĹş do WZ-08 | - |
| PomiĹ„ | PrzejdĹş do WZ-08 bez definiowania aparatury | - |

#### 6.7.5 WpĹ‚yw na model

- Tworzy obiekty Switch (typ: CircuitBreaker / Disconnector)
- Przypisuje do szyn i gaĹ‚Ä™zi

---

### 6.8 Ekran WZ-08: ĹąrĂłdĹ‚a i Generatory

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-08 |
| **TytuĹ‚** | Definicja ĹşrĂłdeĹ‚ zasilania |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-07 |
| **Warunki wstÄ™pne** | Szyny zdefiniowane |

#### 6.8.1 Tabela edycyjna sieci zewnÄ™trznych

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SIECI ZEWNÄTRZNE (EXTERNAL GRID)                                                        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa      â”‚ Szyna    â”‚ Un [kV]   â”‚ Sk" [MVA]  â”‚ R/X       â”‚ Typ wÄ™zĹ‚a â”‚ Operator       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [ZR-GPZ   ]â”‚ [SZ-WN ]â–Ľâ”‚ [110.0   ]â”‚ [5000     ]â”‚ [0.1     ]â”‚ [SLACK  ]â–Ľâ”‚ [PGE Dystr.  ]â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj sieÄ‡ zewnÄ™trznÄ…] [Model zwarciowy...]                                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.8.2 Tabela edycyjna generatorĂłw

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ GENERATORY SYNCHRONICZNE                                                                â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa      â”‚ Szyna    â”‚ Un [kV]   â”‚ Sn [MVA]   â”‚ Pn [MW]   â”‚ X"d [p.u.]â”‚ Typ wÄ™zĹ‚a      â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [GEN-01   ]â”‚ [SZ-GEN]â–Ľâ”‚ [6.3     ]â”‚ [10.0     ]â”‚ [8.0     ]â”‚ [0.15    ]â”‚ [PV         ] â–Ľâ”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj generator] [Parametry zwarciowe...]                                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.8.3 Pola dla sieci zewnÄ™trznej

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| name | Nazwa | string | - | 1-100 znakĂłw | ZR-{STACJA} | Wymagane, unikalne |
| bus | Szyna przyĹ‚Ä…czenia | ref:Bus | - | Lista szyn | - | Wymagane |
| rated_voltage | NapiÄ™cie znamionowe | float | kV | 0.4 - 800 | 110.0 | Wymagane |
| sk_3ph | Moc zwarciowa Sk" | float | MVA | 100 - 100000 | 5000 | Wymagane |
| rx_ratio | Stosunek R/X | float | - | 0.05 - 0.5 | 0.1 | Wymagane |
| node_type | Typ wÄ™zĹ‚a | enum | - | SLACK / PV | SLACK | Wymagane |
| operator | Operator sieci | string | - | 0-100 znakĂłw | "" | Opcjonalne |

#### 6.8.4 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj sieÄ‡ zewnÄ™trznÄ… | Dodaje nowe ĹşrĂłdĹ‚o | - |
| + Dodaj generator | Dodaje nowy generator | - |
| Model zwarciowy... | Otwiera modal modelu zwarciowego | ĹąrĂłdĹ‚o wybrane |
| Parametry zwarciowe... | Otwiera modal parametrĂłw generatora | Generator wybrany |
| â—€ Wstecz | PowrĂłt do WZ-07 | - |
| Dalej â–¶ | PrzejdĹş do WZ-09 | Minimum 1 ĹşrĂłdĹ‚o zdefiniowane |

#### 6.8.5 WpĹ‚yw na model

- Tworzy obiekty ExternalGrid i/lub SynchronousGenerator
- Definiuje punkt zasilania sieci

#### 6.8.6 ĹąrĂłdĹ‚a konwerterowe (Converter-Based Sources) â€” tryb statyczny

Ekran WZ-08 obejmuje rĂłwnieĹĽ **ĹşrĂłdĹ‚a konwerterowe** (converter-based sources):

| Typ ĹşrĂłdĹ‚a | Nazwa peĹ‚na | Symbol | Opis |
|------------|-------------|--------|------|
| **PV** | Fotowoltaika | âĽ | ĹąrĂłdĹ‚o energii sĹ‚onecznej |
| **WIND** | Elektrownia wiatrowa | âšˇ | Turbina wiatrowa |
| **BESS** | Magazyn energii | âŠž | Battery Energy Storage System |

**Tryb statyczny (Static Mode):**

W trybie statycznym ĹşrĂłdĹ‚a konwerterowe dziaĹ‚ajÄ… wyĹ‚Ä…cznie jako ĹşrĂłdĹ‚a PQ lub z zadanym cosĎ†:

| Parametr | Lokalizacja | Opis |
|----------|-------------|------|
| Typ, Sn, Un | NetworkModel (type_ref â†’ Catalog) | Parametry znamionowe â€” niezmienne |
| PrzyĹ‚Ä…czenie (Bus) | NetworkModel | Szyna przyĹ‚Ä…czenia â€” topologia |
| P, Q, cosĎ† (setpointy) | Case (Active Case) | Parametry pracy â€” zmienne per scenariusz |

**INVARIANT:** Setpointy pracy (P, Q, cosĎ†) naleĹĽÄ… wyĹ‚Ä…cznie do Case â€” nie do NetworkModel. Model sieci zawiera tylko przyĹ‚Ä…czenie i referencjÄ™ do typu.

**BESS â€” interpretacja znaku mocy:**

| Znak P | Interpretacja | Kierunek przepĹ‚ywu energii |
|--------|---------------|---------------------------|
| P > 0 | Eksport (rozĹ‚adowanie) | BESS â†’ sieÄ‡ |
| P < 0 | Import (Ĺ‚adowanie) | sieÄ‡ â†’ BESS |

**Ograniczenia trybu statycznego:**
- Brak regulatorĂłw (Volt-VAR, Volt-Watt, droop)
- Brak modeli dynamicznych (RMS/EMT)
- BoundaryNode â€“ wÄ™zeĹ‚ przyĹ‚Ä…czenia nie istnieje w NetworkModel (analysis-only)

---

### 6.9 Ekran WZ-09: Odbiory

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-09 |
| **TytuĹ‚** | Definicja odbiornikĂłw |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-08 |
| **Warunki wstÄ™pne** | Szyny zdefiniowane |

#### 6.9.1 Tabela edycyjna odbiornikĂłw

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ ODBIORNIKI                                                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa      â”‚ Szyna    â”‚ Model     â”‚ P [MW]     â”‚ Q [Mvar]  â”‚ cos Ď†     â”‚ Opis           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [OD-STA-01]â”‚ [SZ-STA]â–Ľâ”‚ [PQ     ]â–Ľâ”‚ [2.5      ]â”‚ [1.2     ]â”‚ 0.90      â”‚ [Hala produkcji]â”‚
â”‚ [OD-STB-01]â”‚ [SZ-STB]â–Ľâ”‚ [PQ     ]â–Ľâ”‚ [1.8      ]â”‚ [0.9     ]â”‚ 0.89      â”‚ [Biurowiec     ]â”‚
â”‚ [OD-SIL-01]â”‚ [SZ-STA]â–Ľâ”‚ [SILNIK ]â–Ľâ”‚ [0.5      ]â”‚ [0.3     ]â”‚ 0.86      â”‚ [Silnik wentyl.]â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [+ Dodaj odbiornik] [Model obciÄ…ĹĽenia...]                                               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.9.2 Pola dla odbiornika

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| name | Nazwa | string | - | 1-100 znakĂłw | OD-{SZYNA}-{NR} | Wymagane, unikalne |
| bus | Szyna przyĹ‚Ä…czenia | ref:Bus | - | Lista szyn | - | Wymagane |
| load_model | Model obciÄ…ĹĽenia | enum | - | PQ / ZIP / SILNIK | PQ | Wymagane |
| active_power | Moc czynna P | float | MW | 0 - 1000 | 1.0 | Wymagane, â‰Ą 0 |
| reactive_power | Moc bierna Q | float | Mvar | -1000 - 1000 | 0.5 | Wymagane |
| power_factor | WspĂłĹ‚czynnik mocy | float | - | 0.5 - 1.0 | - | Obliczony automatycznie |
| description | Opis | string | - | 0-255 znakĂłw | "" | Opcjonalne |

#### 6.9.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| + Dodaj odbiornik | Dodaje nowy odbiornik | - |
| Model obciÄ…ĹĽenia... | Otwiera modal modelu obciÄ…ĹĽenia | Odbiornik wybrany |
| â—€ Wstecz | PowrĂłt do WZ-08 | - |
| Dalej â–¶ | PrzejdĹş do WZ-10 | Wszystkie odbiorniki majÄ… P â‰Ą 0 |

#### 6.9.4 WpĹ‚yw na model

- Tworzy obiekty Load
- Definiuje pobĂłr mocy w sieci

---

### 6.10 Ekran WZ-10: Walidacja Sieci

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-10 |
| **TytuĹ‚** | Walidacja modelu sieci |
| **Tryb** | MODEL_EDIT |
| **Wyzwalacz** | PrzejĹ›cie z WZ-09 |
| **Warunki wstÄ™pne** | Model sieci zdefiniowany |

#### 6.10.1 Widok walidacji

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ WALIDACJA MODELU SIECI                                                      â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚ â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—  â”‚
â”‚ â•‘ PODSUMOWANIE WALIDACJI                                                 â•‘  â”‚
â”‚ â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•Ł  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   BĹ‚Ä™dy krytyczne:    0  âś“                                            â•‘  â”‚
â”‚ â•‘   OstrzeĹĽenia:        2  âš                                             â•‘  â”‚
â”‚ â•‘   Informacje:         3  â„ą                                            â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   Status:  âś“ SIEÄ† GOTOWA DO OBLICZEĹ                                  â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť  â”‚
â”‚                                                                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ SZCZEGĂ“ĹY WALIDACJI                                                         â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ KOD      â”‚ POZIOM   â”‚ ELEMENT        â”‚ OPIS                                 â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ W-TRF-002â”‚OstrzeĹĽenieâ”‚ TR-GPZ-01     â”‚ PrzekĹ‚adnia (7.33) poza typowym      â”‚
â”‚          â”‚          â”‚                â”‚ zakresem (1.0-5.0)                   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ W-LOD-001â”‚OstrzeĹĽenieâ”‚ OD-STA-01     â”‚ Niski wspĂłĹ‚czynnik mocy (cos Ď†=0.78) â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ I-TOP-001â”‚ Info     â”‚ Model sieci    â”‚ SieÄ‡ zawiera 4 szyny, 3 linie,       â”‚
â”‚          â”‚          â”‚                â”‚ 2 transformatory, 1 ĹşrĂłdĹ‚o           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [Waliduj ponownie] [Eksportuj raport...]                                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.10.2 Kategorie walidacji

| Kategoria | Kod | Opis |
|-----------|-----|------|
| Topologia | TOP | SpĂłjnoĹ›Ä‡ sieci, izolowane elementy |
| Parametry | PAR | KompletnoĹ›Ä‡ i zakresy parametrĂłw |
| Transformatory | TRF | PrzekĹ‚adnie, grupy poĹ‚Ä…czeĹ„ |
| Linie | LIN | Impedancje, dĹ‚ugoĹ›ci |
| ĹąrĂłdĹ‚a | SRC | ObecnoĹ›Ä‡ ĹşrĂłdĹ‚a, parametry zwarciowe |
| Odbiorniki | LOD | Moce, wspĂłĹ‚czynniki mocy |
| Aparatura | SWT | Pozycje, parametry znamionowe |

#### 6.10.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| Waliduj ponownie | Uruchamia NetworkValidator | - |
| Eksportuj raport... | Eksportuje raport walidacji do PDF | - |
| â—€ Wstecz | PowrĂłt do WZ-09 | - |
| Dalej â–¶ | PrzejdĹş do WZ-11 | Brak bĹ‚Ä™dĂłw krytycznych |
| ZakoĹ„cz | KoĹ„czy kreator, zapisuje model | Brak bĹ‚Ä™dĂłw krytycznych |

#### 6.10.4 ReguĹ‚a blokady

**JEĹšLI** liczba bĹ‚Ä™dĂłw krytycznych > 0:
- Przycisk [Dalej â–¶] = NIEAKTYWNY
- Przycisk [ZakoĹ„cz] = NIEAKTYWNY
- WyĹ›wietl komunikat: "UsuĹ„ bĹ‚Ä™dy krytyczne przed kontynuacjÄ…"

---

### 6.11 Ekran WZ-11: Tworzenie Przypadku Obliczeniowego

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-11 |
| **TytuĹ‚** | Tworzenie przypadku obliczeniowego |
| **Tryb** | CASE_CONFIG |
| **Wyzwalacz** | PrzejĹ›cie z WZ-10 |
| **Warunki wstÄ™pne** | Model sieci zwalidowany |

#### 6.11.1 WybĂłr typu przypadku

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TWORZENIE PRZYPADKU OBLICZENIOWEGO                                          â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚  Wybierz typ analizy:                                                       â”‚
â”‚                                                                             â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚                                 â”‚  â”‚                                 â”‚  â”‚
â”‚  â”‚         âšˇ                       â”‚  â”‚         đź”„                       â”‚  â”‚
â”‚  â”‚                                 â”‚  â”‚                                 â”‚  â”‚
â”‚  â”‚  ANALIZA ZWARCIOWA             â”‚  â”‚  ROZPĹYW MOCY                   â”‚  â”‚
â”‚  â”‚  (ShortCircuitCase)             â”‚  â”‚  (PowerFlowCase)                â”‚  â”‚
â”‚  â”‚                                 â”‚  â”‚                                 â”‚  â”‚
â”‚  â”‚  Obliczenia prÄ…dĂłw zwarciowych â”‚  â”‚  Obliczenia stanu ustalonego    â”‚  â”‚
â”‚  â”‚  zgodnie z IEC 60909            â”‚  â”‚  Newton-Raphson                 â”‚  â”‚
â”‚  â”‚                                 â”‚  â”‚                                 â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â”‚  [â—Ź] Analiza zwarciowa (ShortCircuitCase)                                  â”‚
â”‚  [ ] RozpĹ‚yw mocy (PowerFlowCase)                                          â”‚
â”‚                                                                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Nazwa przypadku: [SC-001: Zwarcie 3f na szynie SN GPZ                    ] â”‚
â”‚ Opis:            [Analiza zwarcia trĂłjfazowego na szynie 15 kV           ] â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.11.2 Pola formularza

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| case_type | Typ przypadku | enum | - | ShortCircuitCase / PowerFlowCase | ShortCircuitCase | Wymagane |
| case_name | Nazwa przypadku | string | - | 1-255 znakĂłw | SC-001 / PF-001 | Wymagane, unikalne |
| case_description | Opis | string | - | 0-1000 znakĂłw | "" | Opcjonalne |

#### 6.11.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| â—€ Wstecz | PowrĂłt do WZ-10 | - |
| Dalej â–¶ | PrzejdĹş do WZ-12 | Nazwa przypadku niepusta |

#### 6.11.4 WpĹ‚yw na model

- Tworzy nowy obiekt Case (ShortCircuitCase lub PowerFlowCase)
- Ustawia przypadek jako aktywny

---

### 6.12 Ekran WZ-12: Parametryzacja Przypadku

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-12 |
| **TytuĹ‚** | Parametry przypadku obliczeniowego |
| **Tryb** | CASE_CONFIG |
| **Wyzwalacz** | PrzejĹ›cie z WZ-11 |
| **Warunki wstÄ™pne** | Przypadek utworzony |

#### 6.12.1 Parametry ShortCircuitCase

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PARAMETRY ANALIZY ZWARCIOWEJ                                                â”‚
â”‚ Przypadek: SC-001                                                           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚ â–Ľ Lokalizacja zwarcia                                                       â”‚
â”‚   â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚   â”‚ Szyna zwarcia:        [SZ-GPZ-SN                              ] â–Ľ  â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ Typ zwarcia:          [TrĂłjfazowe symetryczne (3f)            ] â–Ľ  â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ Rezystancja Ĺ‚uku Rf:  [0.0                          ] Î©           â”‚  â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â”‚ â–Ľ Metoda obliczeniowa                                                       â”‚
â”‚   â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚   â”‚ Standard:             [IEC 60909                              ] â–Ľ  â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ Metoda:               [Metoda B (dokĹ‚adna)                    ] â–Ľ  â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ WspĂłĹ‚czynnik c_max:   [1.10                         ]              â”‚  â”‚
â”‚   â”‚ WspĂłĹ‚czynnik c_min:   [1.00                         ]              â”‚  â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â”‚ â–Ľ Parametry termiczne                                                       â”‚
â”‚   â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚   â”‚ Czas trwania zwarcia tk: [1.0                       ] s           â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ WspĂłĹ‚czynnik m (DC):     [0.0                       ]              â”‚  â”‚
â”‚   â”‚ WspĂłĹ‚czynnik n (AC):     [1.0                       ]              â”‚  â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â”‚ â–Ľ WkĹ‚ad silnikĂłw                                                            â”‚
â”‚   â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚   â”‚ UwzglÄ™dnij silniki:   [âś“] Tak                                      â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ Metoda:               [Zgodnie z IEC 60909                    ] â–Ľ  â”‚  â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.12.2 Pola dla ShortCircuitCase

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| fault_location | Szyna zwarcia | ref:Bus | - | Lista szyn | - | Wymagane |
| fault_type | Typ zwarcia | enum | - | 3PH / 2PH / 1PH / 2PH_GND | 3PH | Wymagane |
| fault_resistance | Rezystancja Ĺ‚uku | float | Î© | 0 - 100 | 0 | â‰Ą 0 |
| standard | Standard | enum | - | IEC_60909 | IEC_60909 | Wymagane |
| method | Metoda | enum | - | METHOD_B / METHOD_C | METHOD_B | Wymagane |
| c_max | WspĂłĹ‚czynnik c_max | float | - | 1.0 - 1.2 | 1.10 | Wymagane |
| c_min | WspĂłĹ‚czynnik c_min | float | - | 0.9 - 1.1 | 1.00 | Wymagane |
| fault_duration | Czas trwania zwarcia | float | s | 0.1 - 5.0 | 1.0 | Wymagane |
| include_motors | UwzglÄ™dnij silniki | boolean | - | - | true | - |

#### 6.12.3 Parametry PowerFlowCase

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PARAMETRY ROZPĹYWU MOCY                                                     â”‚
â”‚ Przypadek: PF-001                                                           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚ â–Ľ Metoda obliczeniowa                                                       â”‚
â”‚   â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚   â”‚ Algorytm:             [Newton-Raphson                         ] â–Ľ  â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ Maks. liczba iteracji:[100                          ]              â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ Tolerancja mocy:      [1e-6                         ] MW           â”‚  â”‚
â”‚   â”‚                                                                     â”‚  â”‚
â”‚   â”‚ Tolerancja napiÄ™cia:  [1e-6                         ] p.u.         â”‚  â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â”‚ â–Ľ Opcje obliczeĹ„                                                            â”‚
â”‚   â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚   â”‚ [âś“] UwzglÄ™dnij straty w transformatorach                           â”‚  â”‚
â”‚   â”‚ [âś“] UwzglÄ™dnij straty w liniach                                    â”‚  â”‚
â”‚   â”‚ [âś“] Automatyczna regulacja zaczepĂłw OLTC                           â”‚  â”‚
â”‚   â”‚ [ ] Ograniczenie mocy biernej generatorĂłw                          â”‚  â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â”‚ â–Ľ Warunki poczÄ…tkowe                                                        â”‚
â”‚   â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚   â”‚ NapiÄ™cie startowe:    [1.0                          ] p.u.         â”‚  â”‚
â”‚   â”‚ KÄ…t startowy:         [0.0                          ] Â°            â”‚  â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.12.4 Pola dla PowerFlowCase

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| algorithm | Algorytm | enum | - | NEWTON_RAPHSON / GAUSS_SEIDEL | NEWTON_RAPHSON | Wymagane |
| max_iterations | Maks. iteracji | int | - | 10 - 1000 | 100 | Wymagane |
| power_tolerance | Tolerancja mocy | float | MW | 1e-10 - 1e-3 | 1e-6 | Wymagane |
| voltage_tolerance | Tolerancja napiÄ™cia | float | p.u. | 1e-10 - 1e-3 | 1e-6 | Wymagane |
| include_transformer_losses | Straty w transformatorach | boolean | - | - | true | - |
| include_line_losses | Straty w liniach | boolean | - | - | true | - |
| auto_tap_control | Automatyczne zaczepy | boolean | - | - | true | - |
| initial_voltage | NapiÄ™cie startowe | float | p.u. | 0.8 - 1.2 | 1.0 | Wymagane |

#### 6.12.5 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| â—€ Wstecz | PowrĂłt do WZ-11 | - |
| Dalej â–¶ | PrzejdĹş do WZ-13 | Wszystkie parametry zdefiniowane |
| Zapisz parametry | Zapisuje bez przejĹ›cia | - |

#### 6.12.6 WpĹ‚yw na model

- Aktualizuje parametry obiektu Case
- Przygotowuje przypadek do obliczeĹ„

---

### 6.13 Ekran WZ-13: Obliczenia

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-13 |
| **TytuĹ‚** | Wykonywanie obliczeĹ„ |
| **Tryb** | CASE_CONFIG |
| **Wyzwalacz** | PrzejĹ›cie z WZ-12 |
| **Warunki wstÄ™pne** | Przypadek sparametryzowany |

#### 6.13.1 Widok obliczeĹ„

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ WYKONYWANIE OBLICZEĹ                                                        â”‚
â”‚ Przypadek: SC-001 (ShortCircuitCase)                                        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚ â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—  â”‚
â”‚ â•‘ KONTROLA PRZEDOBLICZENIOWA                                             â•‘  â”‚
â”‚ â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•Ł  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   [âś“] Model sieci spĂłjny                                              â•‘  â”‚
â”‚ â•‘   [âś“] Wszystkie parametry zdefiniowane                                â•‘  â”‚
â”‚ â•‘   [âś“] ĹąrĂłdĹ‚o zasilania dostÄ™pne                                       â•‘  â”‚
â”‚ â•‘   [âś“] Przypadek sparametryzowany                                      â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   Status: GOTOWY DO OBLICZEĹ                                          â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť  â”‚
â”‚                                                                             â”‚
â”‚                        â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                          â”‚
â”‚                        â”‚                         â”‚                          â”‚
â”‚                        â”‚       [OBLICZ]          â”‚                          â”‚
â”‚                        â”‚                         â”‚                          â”‚
â”‚                        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                          â”‚
â”‚                                                                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ KONSOLA OBLICZEĹ                                                            â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ Oczekiwanie na uruchomienie...                                              â”‚
â”‚                                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Network Wizard                                    [X]       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                             â”‚
â”‚  Step 3 of 10: Buses                                       â”‚
â”‚                                                             â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚                                                     â”‚   â”‚
â”‚  â”‚  [Property Grid / Form Content]                     â”‚   â”‚
â”‚  â”‚                                                     â”‚   â”‚
â”‚  â”‚                                                     â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚                                                             â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”           â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  Back  â”‚  â”‚  Next  â”‚           â”‚   OK   â”‚  â”‚ Cancel â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”           â””â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ WYKONYWANIE OBLICZEĹ                                                        â”‚
â”‚ Przypadek: SC-001 (ShortCircuitCase)                                        â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚ â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—  â”‚
â”‚ â•‘ POSTÄP OBLICZEĹ                                                        â•‘  â”‚
â”‚ â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•Ł  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   [â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘] 65%              â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   benchmark: Obliczanie prÄ…dĂłw zwarciowych...                              â•‘  â”‚
â”‚ â•‘   Czas: 0.23s                                                         â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť  â”‚
â”‚                                                                             â”‚
â”‚                        â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                          â”‚
â”‚                        â”‚                         â”‚                          â”‚
â”‚                        â”‚       [PRZERWIJ]        â”‚                          â”‚
â”‚                        â”‚                         â”‚                          â”‚
â”‚                        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                          â”‚
â”‚                                                                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ KONSOLA OBLICZEĹ                                                            â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
â”‚ [14:30:01] Inicjalizacja solvera: IEC60909ShortCircuitSolver               â”‚
â”‚ [14:30:01] Walidacja modelu sieci...                                        â”‚
â”‚ [14:30:01]   âś“ Topologia spĂłjna                                            â”‚
â”‚ [14:30:01]   âś“ Wszystkie parametry zdefiniowane                            â”‚
â”‚ [14:30:02] Budowanie macierzy admitancyjnej...                              â”‚
â”‚ [14:30:02] Obliczanie prÄ…dĂłw zwarciowych...                                 â”‚
â”‚                                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.13.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| OBLICZ | Uruchamia solver | Kontrola przedobliczeniowa OK |
| PRZERWIJ | Przerywa obliczenia | Obliczenia w toku |
| â—€ Wstecz | PowrĂłt do WZ-12 | Obliczenia zakoĹ„czone lub nie rozpoczÄ™te |
| Dalej â–¶ | PrzejdĹş do WZ-14 | Obliczenia zakoĹ„czone sukcesem |

#### 6.13.4 ObsĹ‚uga bĹ‚Ä™dĂłw

| Typ bĹ‚Ä™du | Komunikat | Akcja |
|-----------|-----------|-------|
| Brak zbieĹĽnoĹ›ci | Solver nie osiÄ…gnÄ…Ĺ‚ zbieĹĽnoĹ›ci po {N} iteracjach | WyĹ›wietl szczegĂłĹ‚y, zaproponuj zmianÄ™ parametrĂłw |
| Singularna macierz | Macierz admitancyjna singularna (sieÄ‡ niespĂłjna?) | Uruchom ponownÄ… walidacjÄ™ topologii |
| Przekroczony czas | Obliczenia przekroczyĹ‚y maksymalny czas | Zaproponuj uproszczenie modelu lub zwiÄ™kszenie czasu |

#### 6.13.5 WpĹ‚yw na model

- Tworzy obiekt Result (ShortCircuitResult lub PowerFlowResult)
- Przypisuje wynik do przypadku
- Oznacza przypadek jako COMPUTED

---

### 6.14 Ekran WZ-14: Analiza WynikĂłw

| Atrybut | WartoĹ›Ä‡ |
|---------|---------|
| **Identyfikator** | WZ-14 |
| **TytuĹ‚** | Analiza wynikĂłw |
| **Tryb** | RESULT_VIEW |
| **Wyzwalacz** | PrzejĹ›cie z WZ-13 |
| **Warunki wstÄ™pne** | Obliczenia zakoĹ„czone sukcesem |

#### 6.14.1 Widok wynikĂłw zwarciowych

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ WYNIKI ANALIZY ZWARCIOWEJ                                                   â”‚
â”‚ Przypadek: SC-001 | Wynik: SC-001-R-2024-01-15-14:30                       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚ â–Ľ Podsumowanie                                                              â”‚
â”‚ â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—  â”‚
â”‚ â•‘ Lokalizacja zwarcia:  SZ-GPZ-SN (15 kV)                               â•‘  â”‚
â”‚ â•‘ Typ zwarcia:          TrĂłjfazowe symetryczne                          â•‘  â”‚
â”‚ â•‘ Standard:             IEC 60909, Metoda B                             â•‘  â”‚
â”‚ â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•Ł  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   Ik" (poczÄ…tkowy prÄ…d zwarciowy):     12.45 kA                       â•‘  â”‚
â”‚ â•‘   ip  (prÄ…d udarowy):                  31.67 kA                       â•‘  â”‚
â”‚ â•‘   Ib  (prÄ…d wyĹ‚Ä…czeniowy):             12.45 kA                       â•‘  â”‚
â”‚ â•‘   Ith (prÄ…d cieplny, tk=1.0s):         12.89 kA                       â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť  â”‚
â”‚                                                                             â”‚
â”‚ â–Ľ WkĹ‚ady do prÄ…du zwarciowego                                               â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ ĹąRĂ“DĹO           â”‚ Ik" [kA]  â”‚ ip [kA]   â”‚ UdziaĹ‚ [%]  â”‚ Stan              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ ZR-GPZ (sieÄ‡)    â”‚ 11.23     â”‚ 28.54     â”‚ 90.2%       â”‚ âś“                 â”‚
â”‚ GEN-01 (generator)â”‚ 1.22      â”‚ 3.13      â”‚ 9.8%        â”‚ âś“                 â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ SUMA             â”‚ 12.45     â”‚ 31.67     â”‚ 100.0%      â”‚                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                             â”‚
â”‚ â–Ľ Weryfikacja aparatury Ĺ‚Ä…czeniowej                                         â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WYĹÄ„CZNIK        â”‚ Ik" [kA]  â”‚ Ik_zn[kA] â”‚ Margines    â”‚ Status            â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ WĹ-GPZ-SN-01     â”‚ 12.45     â”‚ 25.0      â”‚ +50.2%      â”‚ âś“ OK              â”‚
â”‚ WĹ-GPZ-SN-02     â”‚ 12.45     â”‚ 25.0      â”‚ +50.2%      â”‚ âś“ OK              â”‚
â”‚ WĹ-STA-01        â”‚ 8.32      â”‚ 16.0      â”‚ +48.0%      â”‚ âś“ OK              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                             â”‚
â”‚ [Eksportuj do PDF...] [Eksportuj do CSV...] [PokaĹĽ na schemacie]           â”‚
â”‚                                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.14.2 Widok wynikĂłw rozpĹ‚ywu mocy

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ WYNIKI ROZPĹYWU MOCY                                                        â”‚
â”‚ Przypadek: PF-001 | Wynik: PF-001-R-2024-01-15-14:35                       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                             â”‚
â”‚ â–Ľ Podsumowanie                                                              â”‚
â”‚ â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—  â”‚
â”‚ â•‘ Algorytm:             Newton-Raphson                                  â•‘  â”‚
â”‚ â•‘ Iteracje:             4                                               â•‘  â”‚
â”‚ â•‘ ZbieĹĽnoĹ›Ä‡:            1.2e-8 MW                                       â•‘  â”‚
â”‚ â•‘ Czas obliczeĹ„:        0.12s                                           â•‘  â”‚
â”‚ â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•Ł  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•‘   Moc z sieci:            P = 4.52 MW,  Q = 2.34 Mvar                 â•‘  â”‚
â”‚ â•‘   Moc odbiornikĂłw:        P = 4.30 MW,  Q = 2.10 Mvar                 â•‘  â”‚
â”‚ â•‘   Straty w sieci:         P = 0.22 MW,  Q = 0.24 Mvar                 â•‘  â”‚
â”‚ â•‘                                                                        â•‘  â”‚
â”‚ â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť  â”‚
â”‚                                                                             â”‚
â”‚ â–Ľ NapiÄ™cia na szynach                                                       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ SZYNA            â”‚ Un [kV]   â”‚ U [kV]    â”‚ U [p.u.]  â”‚ Î´ [Â°]    â”‚ Status   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ SZ-GPZ-WN        â”‚ 110.0     â”‚ 110.0     â”‚ 1.000     â”‚ 0.0      â”‚ SLACK    â”‚
â”‚ SZ-GPZ-SN        â”‚ 15.0      â”‚ 14.92     â”‚ 0.995     â”‚ -1.2     â”‚ âś“        â”‚
â”‚ SZ-STA-01        â”‚ 15.0      â”‚ 14.78     â”‚ 0.985     â”‚ -2.5     â”‚ âś“        â”‚
â”‚ SZ-STB-01        â”‚ 15.0      â”‚ 14.65     â”‚ 0.977     â”‚ -3.1     â”‚ âš  <0.98  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                             â”‚
â”‚ â–Ľ ObciÄ…ĹĽenie gaĹ‚Ä™zi                                                         â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ GAĹÄ„Ĺą            â”‚ I [A]     â”‚ Idop [A]  â”‚ ObciÄ…ĹĽenieâ”‚ P_strat  â”‚ Status   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ LN-GPZ-STA       â”‚ 125.3     â”‚ 380       â”‚ 33.0%     â”‚ 4.9 kW   â”‚ âś“        â”‚
â”‚ LN-GPZ-STB       â”‚ 98.2      â”‚ 280       â”‚ 35.1%     â”‚ 6.8 kW   â”‚ âś“        â”‚
â”‚ TR-GPZ-01        â”‚ 174.2     â”‚ 962       â”‚ 18.1%     â”‚ 3.8 kW   â”‚ âś“        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                             â”‚
â”‚ [Eksportuj do PDF...] [Eksportuj do CSV...] [PokaĹĽ na schemacie]           â”‚
â”‚                                                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

#### 6.14.3 Akcje

| Przycisk | Akcja | Warunek |
|----------|-------|---------|
| Eksportuj do PDF... | Generuje raport PDF | - |
| Eksportuj do CSV... | Eksportuje dane do CSV | - |
| PokaĹĽ na schemacie | PrzeĹ‚Ä…cza do SLD z nakĹ‚adkami wynikĂłw | - |
| PorĂłwnaj z... | Otwiera porĂłwnanie z innym wynikiem | - |
| â—€ Wstecz | PowrĂłt do WZ-13 | - |
| ZakoĹ„cz | KoĹ„czy kreator | - |
| Nowy przypadek | Tworzy nowy przypadek (â†’ WZ-11) | - |

#### 6.14.4 WpĹ‚yw na model

- Brak (tryb tylko do odczytu)
- Wynik zapisany w strukturze projektu

---

## 7. Modale Zaawansowane

### 7.1 Modal: SzczegĂłĹ‚owy Model Transformatora (MOD-TRF-01)

**Wyzwalacz:** Menu kontekstowe transformatora > "SzczegĂłĹ‚owy model transformatora..."

#### 7.1.1 ZakĹ‚adka: Schemat zastÄ™pczy

| Pole | Etykieta (PL) | Typ | Jednostka | ĹąrĂłdĹ‚o | Edytowalne |
|------|---------------|-----|-----------|--------|------------|
| Zk | Impedancja zwarcia | float | Î© | Obliczone z uk%, Sn, Un | NIE |
| Rk | Rezystancja zwarcia | float | Î© | Obliczone z Pk, Sn, Un | NIE |
| Xk | Reaktancja zwarcia | float | Î© | âš(ZkÂ˛ - RkÂ˛) | NIE |
| Gm | Konduktancja magnetyzujÄ…ca | float | S | P0 / UnÂ˛ | NIE |
| Bm | Susceptancja magnetyzujÄ…ca | float | S | i0% Ă— Sn / UnÂ˛ | NIE |
| uk% | NapiÄ™cie zwarcia | float | % | Dane wejĹ›ciowe | TAK |
| ur% | SkĹ‚adowa czynna uk | float | % | Obliczone z Pk | NIE |
| ux% | SkĹ‚adowa bierna uk | float | % | âš(uk%Â˛ - ur%Â˛) | NIE |

#### 7.1.2 ZakĹ‚adka: OLTC

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna |
|------|---------------|-----|-----------|--------|----------|
| oltc_installed | OLTC zainstalowany | boolean | - | - | false |
| oltc_side | Strona przeĹ‚Ä…cznika | enum | - | GN / DN | GN |
| tap_high | Liczba zaczepĂłw (gĂłra) | int | - | 0 - 20 | 8 |
| tap_low | Liczba zaczepĂłw (dĂłĹ‚) | int | - | 0 - 20 | 8 |
| tap_step | Krok napiÄ™cia | float | % | 0.5 - 5 | 1.25 |
| tap_position | Aktualny zaczep | int | - | -tap_low ... +tap_high | 0 |

#### 7.1.3 ZakĹ‚adka: Dane katalogowe

| Pole | Etykieta (PL) | Typ | Jednostka |
|------|---------------|-----|-----------|
| manufacturer | Producent | string | - |
| type_designation | Oznaczenie typu | string | - |
| serial_number | Numer seryjny | string | - |
| year_of_manufacture | Rok produkcji | int | - |
| cooling_class | Klasa chĹ‚odzenia | enum | ONAN/ONAF/OFAF/ODAF |
| oil_mass | Masa oleju | float | kg |
| total_mass | Masa caĹ‚kowita | float | kg |

---

### 7.2 Modal: Edytor Impedancji Linii/Kabla (MOD-LIN-01)

**Wyzwalacz:** Menu kontekstowe linii > "Edytor impedancji..."

#### 7.2.1 Parametry jednostkowe (skĹ‚adowa zgodna)

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna |
|------|---------------|-----|-----------|--------|----------|
| r_per_km | Rezystancja R' | float | Î©/km | 0.001 - 10 | 0.125 |
| x_per_km | Reaktancja X' | float | Î©/km | 0.001 - 10 | 0.08 |
| b_per_km | Susceptancja B' | float | ÂµS/km | 0 - 1000 | 0 |
| g_per_km | Konduktancja G' | float | ÂµS/km | 0 - 100 | 0 |

#### 7.2.2 Parametry skĹ‚adowej zerowej

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna |
|------|---------------|-----|-----------|--------|----------|
| r0_per_km | Rezystancja R0' | float | Î©/km | 0.001 - 50 | 3 Ă— R' |
| x0_per_km | Reaktancja X0' | float | Î©/km | 0.001 - 50 | 3 Ă— X' |
| r0_r1_ratio | Stosunek R0/R1 | float | - | 0.5 - 10 | 3.0 |
| x0_x1_ratio | Stosunek X0/X1 | float | - | 0.5 - 10 | 3.0 |

---

### 7.3 Modal: Model Zwarciowy ĹąrĂłdĹ‚a (MOD-SRC-01)

**Wyzwalacz:** Menu kontekstowe ĹşrĂłdĹ‚a > "Model zwarciowy ĹşrĂłdĹ‚a..."

#### 7.3.1 Metody wprowadzania

| Metoda | Wymagane pola | Obliczane pola |
|--------|---------------|----------------|
| SK_IK | Sk", R/X | Rk, Xk, Zk |
| SK_XR | Sk", R/X | Rk, Xk z Sk" |
| RX_BEZPOĹšREDNIO | R, X | Zk, Sk" |

#### 7.3.2 Pola formularza

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna |
|------|---------------|-----|-----------|--------|----------|
| input_method | Metoda wprowadzania | enum | - | SK_IK / SK_XR / RX | SK_IK |
| sk_3ph | Moc zwarciowa Sk" | float | MVA | 100 - 100000 | 5000 |
| rx_ratio | Stosunek R/X | float | - | 0.05 - 0.5 | 0.1 |
| r_ohm | Rezystancja R | float | Î© | 0.001 - 100 | - |
| x_ohm | Reaktancja X | float | Î© | 0.01 - 100 | - |
| r0_r1_ratio | Stosunek R0/R1 | float | - | 0.5 - 5.0 | 1.0 |
| x0_x1_ratio | Stosunek X0/X1 | float | - | 0.5 - 5.0 | 1.0 |

---

### 7.4 Modal: Model ObciÄ…ĹĽenia (MOD-LOD-01)

**Wyzwalacz:** Menu kontekstowe odbiornika > "Model obciÄ…ĹĽenia..."

#### 7.4.1 ZakĹ‚adka: Model ZIP

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna | Walidacja |
|------|---------------|-----|-----------|--------|----------|-----------|
| p0 | Moc bazowa P0 | float | MW | 0 - 1000 | 1.0 | Wymagane |
| q0 | Moc bazowa Q0 | float | Mvar | -1000 - 1000 | 0.5 | Wymagane |
| ap | Wsp. impedancji (P) | float | - | 0 - 1 | 0.4 | ap+bp+cp=1 |
| bp | Wsp. prÄ…du (P) | float | - | 0 - 1 | 0.4 | ap+bp+cp=1 |
| cp | Wsp. mocy (P) | float | - | 0 - 1 | 0.2 | ap+bp+cp=1 |
| aq | Wsp. impedancji (Q) | float | - | 0 - 1 | 0.4 | aq+bq+cq=1 |
| bq | Wsp. prÄ…du (Q) | float | - | 0 - 1 | 0.4 | aq+bq+cq=1 |
| cq | Wsp. mocy (Q) | float | - | 0 - 1 | 0.2 | aq+bq+cq=1 |

#### 7.4.2 ZakĹ‚adka: Model silnikowy

| Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna |
|------|---------------|-----|-----------|--------|----------|
| motor_pn | Moc znamionowa | float | kW | 0.1 - 10000 | 100 |
| motor_un | NapiÄ™cie znamionowe | float | kV | 0.4 - 36 | 6.0 |
| motor_eta | SprawnoĹ›Ä‡ | float | % | 70 - 98 | 95 |
| motor_cos_phi | WspĂłĹ‚czynnik mocy | float | - | 0.7 - 0.95 | 0.85 |
| motor_ir_in | PrÄ…d rozruchowy | float | - | 4 - 8 | 6 |
| motor_cos_phi_start | Cos Ď† rozruchowy | float | - | 0.1 - 0.4 | 0.2 |
| motor_ik_in | Stosunek Ik"/In | float | - | 4 - 10 | 6.5 |
| include_in_sc | UwzglÄ™dnij w zwarciu | boolean | - | - | true |

---

### 7.5 Modal: Raport Walidacji (MOD-VAL-01)

**Wyzwalacz:** Krok WZ-10 / Menu: Model > Walidacja

#### 7.5.1 Struktura raportu

| Sekcja | ZawartoĹ›Ä‡ |
|--------|-----------|
| Podsumowanie | Liczba bĹ‚Ä™dĂłw, ostrzeĹĽeĹ„, informacji; status gotowoĹ›ci |
| Lista komunikatĂłw | Tabela z KOD, POZIOM, ELEMENT, OPIS |
| Statystyki modelu | Liczba elementĂłw kaĹĽdego typu |
| Czas walidacji | Znacznik czasu i czas trwania |

#### 7.5.2 Akcje

| Przycisk | Akcja |
|----------|-------|
| Waliduj ponownie | Uruchamia NetworkValidator |
| Eksportuj do PDF... | Generuje raport PDF |
| Eksportuj do CSV... | Eksportuje komunikaty do CSV |
| PrzejdĹş do elementu | Zaznacza element w drzewie i SLD |

---

### 7.6 Modal: Klonowanie Przypadku (MOD-CAS-01)

**Wyzwalacz:** Menu kontekstowe przypadku > "Klonuj przypadek..."

#### 7.6.1 Pola formularza

| Pole | Etykieta (PL) | Typ | DomyĹ›lna |
|------|---------------|-----|----------|
| new_name | Nazwa nowego przypadku | string | {STARY}-kopia |
| new_description | Opis | string | "" |
| copy_solver_params | Kopiuj parametry solvera | boolean | true |
| copy_fault_location | Kopiuj lokalizacjÄ™ zwarcia | boolean | false |
| copy_fault_type | Kopiuj typ zwarcia | boolean | false |
| copy_thermal_params | Kopiuj parametry termiczne | boolean | true |
| copy_motor_settings | Kopiuj ustawienia silnikĂłw | boolean | true |

---

### 7.7 Modal: PorĂłwnanie WynikĂłw (MOD-RES-01)

**Wyzwalacz:** Menu kontekstowe wyniku > "PorĂłwnaj z innym wynikiem..."

#### 7.7.1 Struktura porĂłwnania

| Sekcja | ZawartoĹ›Ä‡ |
|--------|-----------|
| Parametry przypadkĂłw | Tabela rĂłĹĽnic w parametrach |
| Wyniki liczbowe | Tabela wartoĹ›ci z kolumnami A, B, Î”, Î”% |
| Wykres porĂłwnawczy | Wizualizacja rĂłĹĽnic |

---

### 7.8 Modal: Opcje ObliczeĹ„ (MOD-OPT-01)

**Wyzwalacz:** Menu: Obliczenia > Opcje...

#### 7.8.1 Pola konfiguracyjne

| Grupa | Pole | Etykieta (PL) | Typ | DomyĹ›lna |
|-------|------|---------------|-----|----------|
| Walidacja | validate_before_calc | Waliduj przed obliczeniem | boolean | true |
| Walidacja | block_on_errors | Blokuj przy bĹ‚Ä™dach | boolean | true |
| Walidacja | block_on_warnings | Blokuj przy ostrzeĹĽeniach | boolean | false |
| WydajnoĹ›Ä‡ | max_calc_time | Maks. czas obliczeĹ„ | int (s) | 300 |
| WydajnoĹ›Ä‡ | log_level | Poziom logĂłw | enum | NORMAL |
| Automatyzacja | auto_open_results | OtwĂłrz wyniki automatycznie | boolean | false |
| Automatyzacja | auto_save_project | Zapisz projekt automatycznie | boolean | true |
| Automatyzacja | auto_export_pdf | Eksportuj PDF automatycznie | boolean | false |

---

## 8. Ekrany PrzypadkĂłw Obliczeniowych

### 8.1 MenedĹĽer PrzypadkĂłw

#### 8.1.1 Struktura listy przypadkĂłw

| Kolumna | Opis |
|---------|------|
| ID | Unikalny identyfikator przypadku |
| Nazwa | Nazwa opisowa |
| Typ | ShortCircuitCase / PowerFlowCase |
| Stan | OBLICZONY / GOTOWY / NIEAKTUALNY / BĹÄ„D |
| Wynik gĹ‚Ăłwny | Ik" (zwarcie) / ZbieĹĽnoĹ›Ä‡ (rozpĹ‚yw) |
| Data obliczenia | Znacznik czasu ostatniego obliczenia |

#### 8.1.2 Stany przypadkĂłw

| Stan | Symbol | Opis | Kolor |
|------|--------|------|-------|
| OBLICZONY | â—Ź | Wyniki dostÄ™pne | Zielony |
| GOTOWY | â—‹ | Gotowy do obliczeĹ„ | Niebieski |
| NIEAKTUALNY | â— | Model zmieniony | Ĺ»ĂłĹ‚ty |
| BĹÄ„D | âś— | Ostatnie obliczenie bĹ‚Ä™dne | Czerwony |

### 8.2 ReguĹ‚a Blokady ObliczeĹ„

**WYMĂ“G:** Przycisk [Oblicz] jest AKTYWNY tylko gdy:
1. Przypadek jest wybrany jako aktywny
2. Walidacja modelu wykonana
3. Brak bĹ‚Ä™dĂłw krytycznych w walidacji
4. Wszystkie parametry przypadku zdefiniowane

### 8.3 Parametry ShortCircuitCase

| Grupa | Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna |
|-------|------|---------------|-----|-----------|--------|----------|
| Lokalizacja | fault_location | Szyna zwarcia | ref:Bus | - | - | Wymagane |
| Lokalizacja | fault_type | Typ zwarcia | enum | - | 3PH/2PH/1PH/2PH_GND | 3PH |
| Lokalizacja | fault_resistance | Rezystancja Ĺ‚uku | float | Î© | 0-100 | 0 |
| Metoda | standard | Standard | enum | - | IEC_60909 | IEC_60909 |
| Metoda | method | Metoda | enum | - | METHOD_B/METHOD_C | METHOD_B |
| Metoda | c_max | WspĂłĹ‚czynnik c_max | float | - | 1.0-1.2 | 1.10 |
| Metoda | c_min | WspĂłĹ‚czynnik c_min | float | - | 0.9-1.1 | 1.00 |
| Termiczne | fault_duration | Czas trwania tk | float | s | 0.1-5.0 | 1.0 |
| Silniki | include_motors | UwzglÄ™dnij silniki | boolean | - | - | true |

### 8.4 Parametry PowerFlowCase

| Grupa | Pole | Etykieta (PL) | Typ | Jednostka | Zakres | DomyĹ›lna |
|-------|------|---------------|-----|-----------|--------|----------|
| Algorytm | algorithm | Algorytm | enum | - | NR/GS | NR |
| Algorytm | max_iterations | Maks. iteracji | int | - | 10-1000 | 100 |
| ZbieĹĽnoĹ›Ä‡ | power_tolerance | Tolerancja mocy | float | MW | 1e-10-1e-3 | 1e-6 |
| ZbieĹĽnoĹ›Ä‡ | voltage_tolerance | Tolerancja napiÄ™cia | float | p.u. | 1e-10-1e-3 | 1e-6 |
| Opcje | transformer_losses | Straty w TR | boolean | - | - | true |
| Opcje | line_losses | Straty w liniach | boolean | - | - | true |
| Opcje | auto_tap | Automatyczne zaczepy | boolean | - | - | true |
| Start | initial_voltage | NapiÄ™cie startowe | float | p.u. | 0.8-1.2 | 1.0 |

---

## 9. Obliczenia i Diagnostyka

### 9.1 Kontrola Przedobliczeniowa

| Kontrola | Opis | Blokuje |
|----------|------|---------|
| Topologia spĂłjna | SieÄ‡ nie zawiera izolowanych elementĂłw | TAK |
| ĹąrĂłdĹ‚o zdefiniowane | Istnieje co najmniej jedno aktywne ĹşrĂłdĹ‚o | TAK |
| Parametry kompletne | Wszystkie wymagane parametry zdefiniowane | TAK |
| Przypadek aktywny | Przypadek obliczeniowy jest wybrany | TAK |
| Model zwalidowany | NetworkValidator bez bĹ‚Ä™dĂłw | TAK |

### 9.2 Format LogĂłw Konsoli

```
[TIMESTAMP] POZIOM | KOMPONENT | KOMUNIKAT

Poziomy: DEBUG, INFO, WARNING, ERROR, SUCCESS
```

### 9.3 Kody BĹ‚Ä™dĂłw Solvera

| Kod | Opis | Przyczyna | RozwiÄ…zanie |
|-----|------|-----------|-------------|
| E-SLV-001 | Singularna macierz | SieÄ‡ niespĂłjna | SprawdĹş topologiÄ™ |
| E-SLV-002 | Brak zbieĹĽnoĹ›ci | ZĹ‚e parametry | SprawdĹş dane, zwiÄ™ksz iteracje |
| E-SLV-003 | Brak ĹşrĂłdĹ‚a | Brak aktywnego ĹşrĂłdĹ‚a | Dodaj ĹşrĂłdĹ‚o |
| E-SLV-004 | Przekroczony czas | Obliczenia zbyt dĹ‚ugie | UproĹ›Ä‡ model |
| E-SLV-005 | BĹ‚Ä…d pamiÄ™ci | NiewystarczajÄ…ca pamiÄ™Ä‡ | Zamknij inne aplikacje |
| E-SLV-006 | NiespĂłjne napiÄ™cia | RĂłĹĽne Un bez TR | SprawdĹş napiÄ™cia szyn |

---

## 10. Tryb WynikĂłw

### 10.1 Zasady Trybu WynikĂłw

| Zasada | Opis |
|--------|------|
| TYLKO DO ODCZYTU | Ĺ»adne modyfikacje nie sÄ… dozwolone |
| NAKĹADKI AKTYWNE | Wyniki wyĹ›wietlane na SLD |
| SELEKCJA INFORMACYJNA | KlikniÄ™cie pokazuje wyniki, nie edycjÄ™ |
| EKSPORT DOZWOLONY | Eksport do rĂłĹĽnych formatĂłw |

### 10.2 Warstwy WynikĂłw na SLD

| Warstwa | ZawartoĹ›Ä‡ | Wizualizacja |
|---------|-----------|--------------|
| PrÄ…dy | WartoĹ›ci prÄ…dĂłw w gaĹ‚Ä™ziach | Etykiety [I=xxx A] |
| NapiÄ™cia | WartoĹ›ci napiÄ™Ä‡ na szynach | Etykiety [U=xxx kV] |
| ObciÄ…ĹĽenie | StopieĹ„ obciÄ…ĹĽenia gaĹ‚Ä™zi | Kolor: zielony/ĹĽĂłĹ‚ty/czerwony |
| Naruszenia | Szyny z napiÄ™ciem poza zakresem | Marker czerwony |
| PrÄ…dy zwarciowe | WartoĹ›ci Ik" na szynach | Etykiety [Ik"=xxx kA] |

### 10.3 Formaty Eksportu

| Format | ZawartoĹ›Ä‡ | Zastosowanie |
|--------|-----------|--------------|
| PDF | PeĹ‚ny raport z tabelami | Dokumentacja |
| CSV | Surowe dane tabelaryczne | Import do Excel |
| XLSX | Arkusz z formatowaniem | Raportowanie |
| JSON | Dane strukturalne | Integracja |
| DXF | Schemat SLD | Import do CAD |

---

## 11. Filozofia KomunikatĂłw

### 11.1 Format KomunikatĂłw

```
KOD | POZIOM | ELEMENT | WYJAĹšNIENIE

Gdzie:
  KOD        = {KATEGORIA}-{TYP}-{NNN}
  POZIOM     = BĹ‚Ä…d | OstrzeĹĽenie | Info
  ELEMENT    = Nazwa obiektu
  WYJAĹšNIENIE = PeĹ‚ny opis + sugestia rozwiÄ…zania
```

### 11.2 Kategorie KomunikatĂłw

| Kategoria | Prefiks | Opis |
|-----------|---------|------|
| TOP | Topologia | BĹ‚Ä™dy struktury sieci |
| VAL | Walidacja | BĹ‚Ä™dy walidacji parametrĂłw |
| TRF | Transformator | BĹ‚Ä™dy transformatorĂłw |
| LIN | Linia | BĹ‚Ä™dy linii/kabli |
| SRC | ĹąrĂłdĹ‚o | BĹ‚Ä™dy ĹşrĂłdeĹ‚ |
| LOD | Odbiornik | BĹ‚Ä™dy odbiornikĂłw |
| CBR | WyĹ‚Ä…cznik | BĹ‚Ä™dy wyĹ‚Ä…cznikĂłw |
| DSC | RozĹ‚Ä…cznik | BĹ‚Ä™dy rozĹ‚Ä…cznikĂłw |
| BUS | Szyna | BĹ‚Ä™dy szyn |
| CAS | Przypadek | BĹ‚Ä™dy przypadkĂłw |
| SLV | Solver | BĹ‚Ä™dy obliczeĹ„ |

### 11.3 Poziomy KomunikatĂłw

| Poziom | Ikona | Znaczenie | WpĹ‚yw |
|--------|-------|-----------|-------|
| BĹ‚Ä…d | âś— | Problem krytyczny | BLOKUJE |
| OstrzeĹĽenie | âš  | Problem wymagajÄ…cy uwagi | NIE BLOKUJE |
| Info | â„ą | Informacja pomocnicza | NIE BLOKUJE |

### 11.4 Zasada Braku KomunikatĂłw OgĂłlnych

**ZAKAZANE:**
- "WystÄ…piĹ‚ bĹ‚Ä…d"
- "Operacja nie powiodĹ‚a siÄ™"
- "NieprawidĹ‚owe dane"

**WYMAGANE zawsze:**
- Konkretny kod bĹ‚Ä™du
- Nazwa elementu
- PeĹ‚ny opis problemu
- Sugestia rozwiÄ…zania

---

## 12. Odniesienia

### 12.1 Dokumenty WewnÄ™trzne

| Dokument | ĹšcieĹĽka | Opis |
|----------|---------|------|
| SYSTEM_SPEC.md | /docs/SYSTEM_SPEC.md | Specyfikacja systemu |
| ARCHITECTURE.md | /docs/ARCHITECTURE.md | Architektura aplikacji |
| PLANS.md | /docs/PLANS.md | Plany rozwoju |
| sld_rules.md | /docs/ui/sld_rules.md | ReguĹ‚y SLD |
| CANONICAL_COMPLIANCE.md | /docs/CANONICAL_COMPLIANCE.md | ZgodnoĹ›Ä‡ z benchmark |

### 12.2 Standardy ZewnÄ™trzne

| Standard | Opis | Zastosowanie |
|----------|------|--------------|
| IEC 60909 | Obliczanie prÄ…dĂłw zwarciowych | ShortCircuitSolver |
| IEC 60076 | Transformatory mocy | Parametry TR |
| IEC 60287 | ObciÄ…ĹĽalnoĹ›Ä‡ prÄ…dowa kabli | Parametry kabli |
| EN 50160 | Charakterystyki napiÄ™cia | Walidacja napiÄ™Ä‡ |

### 12.3 Wzorzec UI

| Oprogramowanie | Producent | Rola |
|----------------|-----------|------|
| DIgSILENT benchmark | DIgSILENT GmbH | Wzorzec UI/UX |

---

## ZaĹ‚Ä…cznik A: SĹ‚ownik TerminĂłw UI (PL/EN)

| Polski | Angielski |
|--------|-----------|
| Szyna | Bus |
| Linia | Line |
| Kabel | Cable |
| Transformator | Transformer |
| WyĹ‚Ä…cznik | Circuit Breaker |
| RozĹ‚Ä…cznik | Disconnector |
| ĹąrĂłdĹ‚o | Source |
| SieÄ‡ zewnÄ™trzna | External Grid |
| Generator | Generator |
| Odbiornik | Load |
| Przypadek obliczeniowy | Calculation Case |
| Analiza zwarciowa | Short Circuit Analysis |
| RozpĹ‚yw mocy | Power Flow |
| Wynik | Result |
| Schemat jednokreskowy | Single Line Diagram (SLD) |
| Siatka wĹ‚aĹ›ciwoĹ›ci | Property Grid |
| Drzewo projektu | Project Tree |
| Kreator | Wizard |
| Walidacja | Validation |
| NapiÄ™cie znamionowe | Rated Voltage |
| PrÄ…d znamionowy | Rated Current |
| Moc zwarciowa | Short Circuit Power |
| PrÄ…d zwarciowy poczÄ…tkowy | Initial Short Circuit Current |
| PrÄ…d udarowy | Peak Short Circuit Current |

---

## ZaĹ‚Ä…cznik B: SkrĂłty Klawiszowe

| SkrĂłt | Akcja |
|-------|-------|
| Ctrl+N | Nowy projekt |
| Ctrl+O | OtwĂłrz projekt |
| Ctrl+S | Zapisz projekt |
| Ctrl+Z | Cofnij |
| Ctrl+Y | PonĂłw |
| F5 | Uruchom obliczenia |
| F6 | Waliduj model |
| F7 | PrzeĹ‚Ä…cz tryb |
| Delete | UsuĹ„ element |
| Escape | Anuluj operacjÄ™ |
| Ctrl+A | Zaznacz wszystko |
| Ctrl+F | ZnajdĹş element |
| Ctrl+P | Drukuj/Eksportuj PDF |

---

**KONIEC DOKUMENTU**

**Wersja:** 2.0
**Status:** KANONICZNY
**Data:** 2024-01-15
**Wzorzec:** DIgSILENT benchmark

