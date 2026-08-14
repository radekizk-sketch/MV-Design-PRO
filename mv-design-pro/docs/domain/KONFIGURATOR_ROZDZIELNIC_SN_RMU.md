# KONFIGURATOR ROZDZIELNIC SN / RMU — MODEL KATALOGOWY (BINDING)

Status: WIĄŻĄCY (dyspozycja właściciela 2026-08-14, ocena ekranu „Pola
rozdzielnicy SN" 3/10 — ODRZUCONY; wykonanie osobiste Fable).
Rejestr: wiersz KONFIGURATOR-POL-RMU w `docs/v12xx/REJESTR_KONFLIKTOW.md`.

## 1. Diagnoza (przyjęta w całości)

Obecny kreator myli POLE ROZDZIELCZE z APARATEM ŁĄCZENIOWYM: użytkownik
wybiera rolę pola i dobiera do niej pojedynczy aparat. „Rodzina standardowa
producenta" jest atrapą katalogu. RMU traktowane jest jak zbiór luźnych szaf.
Mini-SLD rysuje cztery identyczne ikony różniące się podpisem.

POLE SN JEST KOMPLETNĄ JEDNOSTKĄ FUNKCJONALNĄ KONKRETNEJ RODZINY
ROZDZIELNICY. Aparat łączeniowy jest tylko jednym z jej elementów.

## 2. Hierarchia kanoniczna (CATALOG-FIRST)

```
PRODUCENT
  → RODZINA ROZDZIELNICY        (SwitchgearFamily)
    → WARIANT / TECHNOLOGIA     (atrybuty rodziny: architektura, medium)
      → TYP JEDNOSTKI FUNKCJONALNEJ (rola funkcjonalna)
        → KATALOGOWE POLE       (CatalogFunctionalUnit — kod katalogowy)
          → WYPOSAŻENIE FABRYCZNE  (kompozycja aparatów, required)
          → WYPOSAŻENIE OPCJONALNE (optional; reszta = NIEDOPUSZCZALNE)
            → PARAMETRY (Un, In, Ik, Ith, IAC, szerokość)
              → BOM → ENM → mini-SLD → globalny SLD
```

JEDNO ŹRÓDŁO PRAWDY ELEKTRYCZNEJ: instancja pola (FieldInstance) buduje BOM;
z BOM powstają terminale elektryczne i wpis ENM; mini-SLD kreatora i globalny
SLD renderują TEN SAM model (zakaz osobnej rekonstrukcji).

## 3. Encje (warstwa katalogowa, immutable)

- `SwitchgearArchitecture`: MODULAR_AIS | MODULAR_GIS | COMPACT_RMU | BLOCK_RMU.
- `SwitchgearFamily`: producent, kod rodziny, nazwa, architektura, medium
  izolacyjne/technologia, klasy Un [kV], In szyn [A], Ik [kA]/Ith/tk, klasa
  łuku (IAC), proweniencja (`source_reference` = katalog producenta),
  `parametry_potwierdzone: bool` — rodzina bez potwierdzonych parametrów NIE
  jest oferowana w kreatorze (jawny status, nigdy zgadywanie).
- `CatalogFunctionalUnit`: rodzina (ref), kod katalogowy, rola funkcjonalna
  (INCOMING/OUTGOING/RING/TRANSFORMER/COUPLER/SECTIONALIZER/METERING/
  AUXILIARY/GENERATOR_DER), kompozycja aparatów w kanonicznym słowniku
  `BayDeviceTemplate.kind` (REUŻYCIE `bay_templates.py`: CB, DS_*, ES, CT, VT,
  FUSE, SURGE_ARRESTER, CABLE_HEAD, TRANSFORMER_DEVICE + VPIS jako
  sygnalizacja), status każdego elementu: FABRYCZNY | OPCJA | NIEDOPUSZCZALNY,
  parametry znamionowe pola, szerokość [mm], przedział kablowy/typ przyłącza.
- `FactoryConfiguration` (dla COMPACT_RMU/BLOCK_RMU): rodzina, kod bloku,
  sekwencja jednostek (np. K-K-T), szerokość całkowita. RMU ≠ zbiór luźnych
  szaf — konfigurator RMU wybiera BLOK, potem doposaża jednostki.
- `FieldInstance` (warstwa projektu, NIE katalog): ref jednostki katalogowej +
  wybrane opcje → `zbuduj_bom()`. Instancja NIE dubluje parametrów katalogu.

## 4. Walidator rodziny (twarde błędy)

`familySupports(family, ...)` — jedno źródło prawdy zgodności:
rola pola, aparat, napięcie, prąd, zwarcie, ochrona, przyłącze kablowe,
napęd silnikowy, zdalne sterowanie. Kombinacja spoza katalogu = HARD ERROR
z polskim zdaniem (nigdy ciche przycięcie ani dowolny dropdown).
Aparat OEM innego producenta jest dopuszczalny wyłącznie przez jawną macierz
zgodności jednostki (nie przez ogólną listę aparatów).

## 5. Generator SLD pola

`FIELD MODEL → BOM → terminale elektryczne → mapowanie symboli IEC (kanon
ui/sld/v3/symbols) → mini-SLD → globalny SLD`. Zakaz rysowania aparatu
nieobecnego w BOM; zakaz pomijania aparatu obecnego w BOM. Pole TR rysuje
pełny tor: szyna → łącznik/CB → zabezpieczenie → uziemnik → przedział →
głowice → kabel → TR → strona nN (o ile elementy SĄ w BOM danej rodziny).

## 6. Dane katalogowe — polityka zero fabrykacji

Rodziny wprowadzamy z realnego portfolio producentów (ZPUE: TPM Air, TPM,
Rotoblok Air, Rotoblok, Rotoblok VCB, RELF, RELF 2S, RXD; ABB: SafeRing,
SafePlus, UniSec; Schneider: SM6, RM6, RM AirSeT; Siemens: 8DJH; dalsi wg
katalogu). Parametry wyłącznie klasowe wartości z publicznych katalogów
producenta (proweniencja w `source_reference`). Rodzina, dla której wartości
nie są potwierdzone kartą — `parametry_potwierdzone=False` i jawny status
„wymaga karty katalogowej" (przypięty testem: taka rodzina nie wchodzi do
ofert kreatora). Listy NIE są zaszywane w UI — UI czyta katalog przez API.

## 7. Etapy wykonania (osobiste, commit po etapie)

- S1: encje + walidator + pierwsza transza rodzin/jednostek + testy (KLASA:
  dwustronna kompletność, twarde błędy, zapadki polityki danych).
- S2: API (`/api/catalog/switchgear-families`, `/functional-units`,
  `/factory-configurations`) + macierz cyklu życia API.
- S3: przebudowa kroku 4 kreatora (nagłówek rodziny Un/In/Ik/technologia;
  tor MODULAR: komponowanie jednostek; tor RMU: blok fabryczny → jednostki →
  opcje; karta pola z wyposażeniem ✓/opcje; status VALID/INVALID rozdzielnicy).
- S4: Field SLD Generator (mini-SLD z BOM; ten sam model → globalny SLD).
- S5: FieldInstance → BOM → ENM (operacje domenowe konsumują jednostkę
  katalogową zamiast pary rola+aparat); migracja operacji kreatora.

Werdykt wizualny każdego etapu UI: właściciel (B-02).
