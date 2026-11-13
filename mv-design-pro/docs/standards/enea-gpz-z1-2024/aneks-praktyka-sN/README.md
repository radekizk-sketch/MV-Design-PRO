# Atlas zweryfikowanych i dopuszczonych rozwiązań SN — aneks do PR #532

**Status: ZWERYFIKOWANE I DOPUSZCZONE WZORCE PROJEKTOWE (decyzja właściciela, 13.11.2026).**
**Zakres: rozbudowa bazy rozwiązań MV-DESIGN-PRO. Dokumentacja źródłowa nie jest publikowana.**

## Materiał i przyjęty status

Właściciel udostępnił dwa pełne tomy dokumentacji wykonawczej: P1 — 67 stron pierwotnych; P2 — 319 stron wtórnych. Ich rozwiązania i konfiguracje przyjmujemy jako **zweryfikowane i dopuszczone projektowo**, podstawę do kart typowych, katalogów producentów, szablonów EAZ i walidatorów. To świadomie wyższy status niż „niepotwierdzony przykład”.

Rozróżniamy jedynie **dopuszczenie zastosowanego rozwiązania w jego warunkach technicznych** od dosłownego, ogólnego wymagania normy albo standardu ENEA. Praktyka referencyjna nie znosi sprawdzenia zakresu zastosowania, doboru zwarciowego i aktualnego wydania standardu przy następnym projekcie. W szczególności wykonanie 17,5 kV w modernizacji **nie zastępuje** wymagań 24 kV dla nowych pól według aktualnego zakresu standardu opisanych już w PR #532.

## Maksymalna anonimizacja — obowiązuje wszystkie nowe rekordy

Nie ujawniać w repo: nazwy GPZ, adresu/lokalizacji, osób, numerów inwestycji, wykonawców, OZE po nazwie, geometrii obiektu, rzeczywistej numeracji pól, indywidualnych mocy źródeł, identyfikatorów wyjść i obwodów, mapy sygnałów lub telekomunikacji, pełnych tabel nastaw aktualnie pracującej stacji, rysunków montażowych, schematów połączeń ani oryginalnych PDF. **Producent i rodzina urządzenia są publicznymi metadanymi technicznymi i pozostają jawne.**

Wartości nastaw z P2 wykorzystano do **wzorców grup parametrów, klas wielkości i testów składni/jednostek**, ale nie do publikacji operacyjnego „pliku nastaw stacji”. Rozdzielamy numer katalogowy urządzenia, dane konkretnego wykonania oraz regułę inżynierską.


## Katalog pól dostępny w API referencji

[Pełne profile e²ALPHA i dane producentów](PAKIET_E2ALPHA_PELNE_POLA_DANE_PRODUCENTA.md) — 86 pozycji, 7 profili oraz 10 zanonimizowanych przykładów, połączonych z istniejącym pakietem `elektrometal_e2alpha`.

Plik: `backend/src/reference_engine/packs/elektrometal_e2alpha/approved_project_fields.json`. Kontrakt: `GET /api/reference/packs/elektrometal_e2alpha` → `approved_project_reference`. Dane zatwierdzone projektowo nie są mieszane z `cell_configurations` oficjalnego katalogu producenta. Kod ładowania i 10 testów integralności dodano w tym samym PR; nie przeprowadzono jeszcze uruchomienia CI.

## Zawartość aneksu

- [PRODUCENCI_I_KATALOGI.md](PRODUCENCI_I_KATALOGI.md): osobne katalogi produktów, cech, wariantów i źródeł producenta.
- [TYPOWE_POLA_I_EAZ.md](TYPOWE_POLA_I_EAZ.md): referencyjne konfiguracje pól SN, przekładników i logik EAZ oraz szablony nastaw.
- [WALIDATORY_I_KONTROLA_JAKOSCI.md](WALIDATORY_I_KONTROLA_JAKOSCI.md): wykryte błędy transkrypcji/arytmetyki oraz rzeczywiste scenariusze testowe.
- [REJESTR_ROZWIAZAN.csv](REJESTR_ROZWIAZAN.csv): rejestr zanonimizowanych rekordów, statusów i miejsc pochodzenia.
- [ZADANIE_INTEGRACYJNE.md](ZADANIE_INTEGRACYJNE.md): wymagania połączenia z obecnym katalogiem MV-DESIGN-PRO i bieżącą przebudową GPZ.

## Udokumentowany zakres przebadany w P1/P2

| Materiał | Strony PDF | Wartość dla systemu |
|---|---|---|
| P1 | 12–20 | architektura rozdzielni, rodzaje pól, aparaty, CT, VT, Ferranti |
| P1 | 23–28 | zwarcia, przekładniki, obciążenia, kryteria ALF |
| P1 | 29–35 | pozycje zestawienia materiałów i warianty katalogowe |
| P1 | 38–67 | schematy jednokreskowe, widoki montażowe i sposób włączania w istniejącą rozdzielnię |
| P2 | 8–22 | opisy funkcji pól, SPZ, SCO, ZS, LRW, OWG, sterowanie i pomiary |
| P2 | 23–44 | zakres funkcjonalny sygnałów i pomiarów — **bez przepisywania operacyjnej mapy punktów** |
| P2 | 45–52 | opisy sygnalizacji i nastaw EAZ — **bez kopiowania wartości z rzeczywistego GPZ** |
| P2 | 54–83 | zestawienia urządzeń wtórnych, akcesoria, przekaźniki, łączność |
| P2 | 84–319 | schematy zasadnicze i montażowe — wyłącznie do oceny funkcji i relacji, bez reprodukcji |

**Ważne:** zachować wszystkie istniejące ustalenia PR #532 (ENEA Z.7/Z.17, wersje producentów, GPZ AIS 24 kV, B-02) oraz kanon repo. Nie tworzyć obok nich nowego projektanta pól ani nowego planu.
