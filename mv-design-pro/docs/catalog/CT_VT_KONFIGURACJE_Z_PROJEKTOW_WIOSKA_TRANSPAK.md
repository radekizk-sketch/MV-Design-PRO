# MV-DESIGN-PRO — przekładniki CT/VT z dokumentacji projektowej

Stan: 30.10.2026. Zakres: dwa udostępnione projekty: **WIOSKA** oraz
**TRANSPAK**. Cel: katalog ma odzwierciedlać konkretne konstrukcje,
liczbę rdzeni/uzwojeń, klasy i funkcje obwodów wtórnych, również w
istniejących stacjach. Nie budujemy iloczynu kombinacji „wszystkich możliwych”
klas, VA, przekładni i rdzeni.

## 1. Weryfikowalne wpisy projektowe

| Projekt | Typ / stan w projekcie | Przekładnia i uzwojenia | Parametry z projektu |
|---|---|---|---|
| WIOSKA | TESAR AD11, 3 CT | 40/5/5/5 A, **3 rdzenie**, nie 3 zaczepy | I–III: po 5 VA, 0,2S (UP, ND45, e2TANGO); FS5 zapis zbiorczy; Ith=6 kA/1s; Idyn=10 kA |
| WIOSKA | TESAR, 3 VT jednofazowe | 15/√3 kV; **4 wtórne**: 3×100/√3 V, 1×100/3 V | I: 0–7,5 VA kl.0,2 UP; II: 0–5 VA kl.0,2 ND45; III: 0–5 VA kl.0,2 e2TANGO UL; IV: 0–5 VA kl.3P e2TANGO U0 |
| TRANSPAK | IMPa, **istniejący / demontaż** | 200/5 A, 1 rdzeń | 5 VA kl.0,5; FS5; Ith=12 kA |
| TRANSPAK | SIGMA S40, **projektowany** | 200/5 A, 1 rdzeń | 2,5 VA kl.0,2S; FS5; Ith=12 kA |
| TRANSPAK | MBS SASK 41.6, **EAZ** | 250/5 A, 1 rdzeń | 2,5 VA kl.5P10, ALF=10; FS pominięty w zapisie rdzenia |

**Dokumenty źródłowe** (udostępnione przez użytkownika, celowo
**niekopiowane do repozytorium**):
- `WIOSKA - Schematy elektryczne 1.pdf`, strona 1:
  oznaczenia T11–T13 i T21–T23;
- `119kW PV Transpak v1.-sig_podpisany.pdf`, PDF str. 16,
  25, 32–33 i 40, opis projektowy oraz zestawienie materiałów.

To **dowód zapisów w projekcie**, a nie niezależna weryfikacja fabrycznych
właściwości i obecności konkretnego aparatu na obiekcie. Każdy nowy rekord
ma `REFERENCYJNY_V1` i `verification_status=REFERENCYJNY`,
mimo że jego układ rdzeni i napięć jest zaczerpnięty ze schematu.

## 2. Dwie istotne uwagi inżynierskie

**TESAR AD11 40/5/5/5 A:**
na schemacie odczytano `Ith=6 kA/1s` oraz `Idyn=10 kA`.
Relacja katalogowa 2,5×Ith daje **15 kA**, a więc nie jest zgodna
z wartością wpisaną na schemacie. Nie zmieniono automatycznie
10 kA na 15 kA, bo byłoby to fałszowanie dokumentu. Pozycja
powinna otrzymać ostrzeżenie inżynierskie przed potwierdzeniem
przydatności zwarciowej. Potrzebna DTR/świadectwo dla konkretnego
wykonania i sprawdzenie wymagań bieżącego projektu.

**MBS SASK 41.6 250/5 kl.5P10:**
na jednym rysunku TRANSPAK pojawia się również oznaczenie `FS5`,
ale nie jest ono właściwym parametrem rdzenia zabezpieczeniowego 5P.
Wprowadzono `ALF=10` wynikający z 5P10; **nie przypisano FS5**
bez odrębnego rdzenia pomiarowego i karty wyrobu. Zachowano
osobny tor e2TANGO.

## 3. Zastosowanie ENEA i integracja z Opusem

- **200/5 A jednozakresowy** w stanie istniejącym i projektowanym pozostaje
  pełnoprawną pozycją katalogową; jego zgodność z konkretnym nowym
  rozliczeniowym układem ENEA podlega odrębnej ocenie.
- **200–400/5 A wieloprzekładniowy** pozostaje osobną konstrukcją, z
  `primary_taps_a=[200,400]` i wyborem aktywnego zaczepu
  wyłącznie w modelu instancji pola. Nie przypisano „400 A”
  przekładnikom IMPa/SIGMA 200/5.
- **Liczba rdzeni nie jest liczbą zaczepów.** TESAR 40/5/5/5 A
  jest trójrdzeniowy z jedną przekładnią pierwotną.
- **3P to klasa dokładności**, nie dowód istnienia 3U₀. W projekcie
  WIOSKA potwierdzono dedykowane czwarte uzwojenie
  100/3 V i funkcję e2TANGO U0. **Sam opis projektowy nie przedstawia
  jednoznacznie połączeń wtórnych trzech VT**, więc otwarty trójkąt
  pozostaje `TO_CONFIRM` do weryfikacji na schemacie obwodów wtórnych.
  Nie wolno przenosić uzwojenia resztkowego na inny wariant TESAR.
- **Przykładowe obciążenie wtórne SIGMA S40:** 2,077 VA
  obliczone w projekcie TRANSPAK, a moc znamionowa CT 2,5 VA.
  Nie mylić obciążenia obwodu z parametrem producenta.

## 4. Wdrożenie

Rekordy są w jednym, dotychczasowym
`get_default_mv_catalog().list_ct_types()` i
`list_vt_types()`; nie dodano konkurencyjnej bazy.
Nowy moduł:
`backend/src/network_model/catalog/mv_ct_vt_project_references.py`.

W gałęzi obejmującej PR #511:
- CT: **103 → 107** (4 źródłowe konfiguracje);
- VT: **37 → 38** (czterouzwojeniowy TESAR);
- surowe rekordy audytu: **8142 → 8147**;
- Ferranti: bez zmian.

Testy:
`backend/tests/network_model/catalog/test_project_reference_ct_vt_2026.py`
oraz `bash scripts/catalog_audit_ubuntu.sh`.

Brak zmian w ENM, Opusie, aktywnych zaczepach, grafie SLD i fizyce
obliczeniowej. Przed scaleniem obowiązuje zielony CI oraz analiza
dwóch niejednoznaczności (Idyn TESAR i dopisek FS5 przy MBS).
