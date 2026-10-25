# GPZ SN — wykonanie P0 w gałęzi PR #504 (raport rzeczywistego zakresu)

**Status:** W TRAKCIE / NIE ODEBRANO / B-02 ODRZUCONE.
**Repozytorium:** `radekizk-sketch/MV-Design-PRO`.
**Gałąź:** `work/gpz-sn-p0-interlocks-20261025`.
**PR:** https://github.com/radekizk-sketch/MV-Design-PRO/pull/504 (draft; bez scalenia).

## Zakres wykonany — kod istniejącej architektury

| Obszar | Zmieniony plik | Zachowanie i dowód testowy |
|---|---|---|
| Blokada nieznanego położenia | `backend/src/enm/interlock_rules.py` | `nieznany`, `awaria`, brak rekordu nie zwalniają lokalnej blokady zamknięcia. Testy `backend/tests/enm/test_gpz_blokady_nieustalonego_polozenia.py` i rozszerzone `test_stan_ruchowy_pola_bez_fabrykacji.py`. |
| Sprzęgło SN | `frontend/src/ui/sld/v3/compose/gpz.ts` | Dotychczasowy ciągły przewód A–B obejmujący pionowy symbol wyłącznika zastąpiono DWIEMA trasami zakończonymi na portach W/E istniejącego `lineBreaker`. Brak dopasowania ref aparatu jest jawny. Test `gpzCouplerTerminals.test.ts`. |
| Ref i położenie CB sprzęgła | `frontend/src/ui/sld/v2/{renderer/GpzCanonicalRenderer.tsx,canvas/enmToCanonicalGpzAdapter.ts}` | `breakerDeviceRef` tylko dla dokładnie jednego CB; stan z rekordu TEGO aparatu, a dopiero potem z runtime o dokładnym kluczu ref. Brak/konflikt = `unknown`. Test `enmToCanonicalGpzAdapter.test.ts`. |
| Skład pól SN | `frontend/src/ui/sld/v3/compose/gpz.ts` | Jeśli `Bay.primary_devices` są dostarczone, sekwencja symboli oparta jest na tych danych; brak danych sygnalizowany kodem `gpz.bay.primary_devices_missing`. Test `gpzModelDrivenBay.test.ts`. Starsze rekordy nadal mogą używać konwencji — nie są gotowe do operacji. |
| Fizyczne dojścia aparatów | `frontend/src/ui/sld/v3/compose/gpz.ts`, `symbols/{defs.ts,glyphs.tsx}` | Odcinki pomiędzy portami S/N kolejnych aparatów pola, bez domykania pary bez portów. Głowica kablowa ma port wejściowy u góry i zachowany port wyjściowy na dole. Test `gpzModelDrivenBay.test.ts`. |
| Rodzaj FUSE | `frontend/src/ui/sld/v3/compose/apparatusSequence.ts` | `FUSE` → osobny bezpiecznik `fuse`, nie rozłącznik `fuseSwitch`. Test `gpzModelDrivenBay.test.ts`. |
| Ramki stanów | `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx` | Dla symboli łączników GPZ dwa kolory: ZAMKNIĘTY `#F05260`, OTWARTY `#2CCF93`. Brak wiarygodnego stanu: brak glifu/ramki, jawna walidacja w DOM. Test `gpzQetStateFrame.test.ts`. Natywne glify V3 — to NIE import pełnej biblioteki QET. |
| Komunikaty braków | `frontend/src/ui/sld/v3/scene/buildScene.ts` | Brak rejestru aparatów i ref CB sprzęgła przeniesiony do notatek diagnostycznych sceny. |
| Lokalny walidator przełączeń | `frontend/src/ui/network-build/forms/switchingSequenceValidator.ts` | Nie wydaje zgody na załączenie CB (źródła/synchronizm), operację DS (obciążenie zwrotne) ani zamknięcie ES (potencjał zwrotny) jedynie na podstawie trzech lokalnych stanów. Testy `switchingSequenceValidator.test.ts`. Lokalna odmowa to NIE wdrożenie serwerowego procesu zatwierdzania operacji. |

## Nieukończone — bez prawa do odbioru

1. **Sprzęgło dwucelkowe ENEA/OEM:** obecny model `CanonicalGpzCoupler` opisuje jedno pole sprzęgłowe. Dwie fizyczne celki (łącznik + wznios) nie są jeszcze zmaterializowane jako prawdziwe aparaty/porty/połączenia ENM; obecna poprawka naprawia tylko nieprawidłowy bypass na SLD.
2. **Pełna biblioteka pól ENEA:** nie uzyskano jeszcze potwierdzonego wariantu producenta i kompletnych zestawów aparatów pola TR, linii, pomiarowego VT, sprzęgła oraz wzniosu szyn; wszelkie szablonowe aparaty dla starszych przypadków nadal podlegają zakazowi kwalifikowania do operacji.
3. **QElectroTech:** PR #499 i #500 wciąż są robocze; dotychczasowe poprawki korzystają z istniejących symboli V3 i nie dowodzą normatywnego przyjęcia .elmt/IEC.
4. **Pełna logika łączeniowa w ENM:** brak serwerowego scenariusza operacji oceniającego spójność sieci A/B, źródła OZE/BESS, napięcie zwrotne, synchronizm, obciążenia odłączników i zatwierdzoną rewizję wyniku. Istniejące blokady lokalne nie są warunkiem dostatecznym.
5. **Wiązanie LF/SC, K-S2 i White Box:** brak pełnego przetestowanego przebiegu po zmianie położenia aparatu i unieważnieniu wyników.
6. **Wariant SN bez nadmiaru WN:** kod GPZ w V3 wciąż zawiera konstrukcję pól i szyny 110 kV, która wymaga ograniczenia do interfejsu źródła w osobnym, kontrolowanym etapie.
7. **Odbiór przeglądarkowy i CI:** nie zweryfikowano jeszcze uruchomienia faktycznej aplikacji, testów Playwright i poprawności wizualnej w dwóch motywach. Nie wolno deklarować PASS dla zadań ze statusem queued.

## Bramka odbiorowa

Uznanie produktu za wykonany wymaga finalnie: porównania ENEA Z.2/Z.7/Z.10/Z.11/Z.12/Z.17 i rysunku rzeczywistego OEM; pełnych relacji port–port w kanonicznym modelu; dwucelek sprzęgła; przeciwnych prób ruchowych na całym grafie; rzeczywistych obliczeń powiązanych z rewizją; testów CI i klikanych E2E. Dopiero potem możliwy jest werdykt właścicielski.

**Werdykt:** kod P0 został zmieniony i zapisany do gałęzi, ale **cała misja rozdzielni SN GPZ nie została zakończona**. B-02 pozostaje ODRZUCONE.
