# POLECENIE WDROŻENIOWE — POPRAWNA TOPOLOGIA DER PRZYŁĄCZONEGO PO STRONIE SN (2026-07-23) — WIĄŻĄCE

Status: **WIĄŻĄCE** (polecenie właściciela 2026-07-23; koryguje i rozszerza
fazę W2/V12K-149). Zakaz utożsamiania `connectionSide=SN` z prostym symbolem
źródła wpiętym bezpośrednio do szyny SN.

## Zasada nadrzędna
DER przyłączony po stronie SN wymaga KOMPLETNEGO toru technologicznego:
(1) źródło/układ falownikowy → (2) ewent. rozdzielnia nN producenta →
(3) transformator blokowy nN/SN → (4) kabel/szynoprzewód SN → (5) głowica
kablowa → (6) kompletne POLE ŹRÓDŁOWE SN → (7) szyna SN stacji. Zakaz
renderu PV/BESS jako samego symbolu falownika na szynie SN, jeżeli model
źródła wymaga transformacji napięcia.

## Semantyka `connectionSide`
Określa POZIOM NAPIĘCIA PUNKTU PRZYŁĄCZENIA do sieci nadrzędnej — NIE
napięcie wyjściowe falownika, NIE zakres elementów toru. `SN` nie oznacza:
usunięcia TR blokowego, usunięcia części nN producenta, bezpośredniego
połączenia ikony PV z szyną SN.

## Wymagane topologie
- **Wariant A (nn):** PV/falowniki → rozdzielnia nN DER → SZYNA nN STACJI →
  TR SN/nN stacji → pole transformatorowe SN → szyna SN (źródło na wspólnej
  rozdzielni nN, strona wtórna transformatora STACYJNEGO).
- **Wariant B (sn):** PV/falowniki → rozdzielnia nN PRODUCENTA → TR BLOKOWY
  nN/SN → kabel SN → głowica → POLE ŹRÓDŁOWE SN → szyna SN stacji.
  Część nN (pełna rozdzielnica / szynoprzewód / kilka odpływów / odpływ
  zbiorczy / zestaw TR-falownik / stacja kompaktowa) zależy od producenta —
  silnik NIE narzuca jednego wariantu nN.

## Model danych (minimum — kontrakt)
`DerTopology`: connectionLevel 'nn'|'sn'; inverterOutputVoltageKv;
hasManufacturerLvSwitchgear; lvSwitchgearVariant 'none'|'single-bus'|
'multi-feeder'|'combiner'|'integrated-skid'; hasBlockTransformer;
blockTransformer {ratedPowerMva, primaryVoltageKv, secondaryVoltageKv,
ukPercent?, vectorGroup?}; hasDedicatedMvField; mvFieldConfiguration
{switchingDevice 'CB'|'LBS', ct, vt, earthingSwitch, surgeArrester,
protectionRelay, cableHead…}. **Zakaz wyprowadzania obecności TR wyłącznie
z connectionLevel.**

## Reguły renderowania (1–7)
1. `sn` ∧ hasBlockTransformer ⇒ pełny tor DER→nN→TR blokowy→kabel→głowica→
   pole SN→szyna SN. 2. `sn` ∧ zintegrowana część nN ⇒ wolno uprościć
   wizualnie, NIE wolno usunąć TR ani przerwać ciągłości. 3. `nn` ⇒ źródło
   do wskazanej szyny/rozdzielni nN STACJI. 4. Zakaz prowadzenia źródła SN
   przez TR odbiorczy stacji (chyba że model jawnie tak stanowi). 5. TR
   blokowy DER i TR stacyjny = OSOBNE elementy modelu z osobnymi id.
   6. Pole źródłowe SN = pełnoprawne pole z wyposażeniem z kreatora (aparat,
   CT, opc. VT, uziemnik, zabezpieczenie, SA, głowica). 7. Symbol PV/BESS
   nie może wisieć bezpośrednio na końcu szyny SN jako skrót.

## Zakazane uproszczenia
`SN→źródło na szynie` · `SN→usuń TR` · `SN→usuń część nN` · `SN→bez pola
źródłowego` · `PV→jedna identyczna topologia`.

## Testy regresyjne (minimum 8)
1) PV na wspólnej szynie nN stacji; 2) PV z TR blokowym i polem SN;
3) BESS z rozdzielnicą nN i TR blokowym; 4) generator synchroniczny WPROST
na SN bez TR blokowego; 5) PV z kilkoma falownikami i wspólną rozdzielnią
nN; 6) PV ze stacją kompaktową producenta; 7) dwa DER o różnych topologiach
na tej samej szynie SN; 8) DER na SN obok niezależnego pola TR odbiorczego.
Per przypadek: ciągłość toru · poprawne napięcie każdego odcinka · TR DER ≠
TR stacji · obecność pola źródłowego · zgodność wyposażenia z kreatorem ·
położenie głowicy · brak bezpośredniego połączenia falownik–szyna SN ·
poprawny load-flow/zwarcia/ochrona NA TEJ SAMEJ topologii.

## Kryterium akceptacji
Dla DER na SN silnik generuje RZECZYWISTY tor techniczny (źródło → układ nN
producenta → TR blokowy → pole SN → szyna SN), z wariantami producenta w
części nN, bez pomijania elementów koniecznych elektrycznie i funkcjonalnie.

## Plan wdrożenia (zarządca)
- **W2b-DANE (backend, najpierw):** kontrakt DerTopology w modelu/operacji
  (`add_converter_source` — recon istniejącego block-trafo/rozdzielni nN;
  rozbudowa ADDYTYWNA), TR blokowy jako REALNY, OSOBNY element (Branch) z
  własnym id (konsumowany przez LF/SC bez zmian solverów), kabel SN +
  pole źródłowe SN z primary_devices (łańcuch W1), kreator OZE mapuje 1:1;
  pełna regresja backendu.
- **W2c-RENDER (scena, po W2b):** reguły 1–7, 8 testów regresyjnych,
  uproszczenie wizualne części nN zintegrowanej (bez usuwania TR), zrzut.
- Do czasu W2b/W2c: obecna uczciwa degradacja W2 (sam symbol przy odczepie
  SN) pozostaje JAWNIE oznaczona jako niepełna (stopNote), a wariant B z
  danymi bez TR blokowego = generator synchroniczny (przypadek 4).
