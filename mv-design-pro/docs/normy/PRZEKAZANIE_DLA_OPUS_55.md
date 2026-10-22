# Przekazanie gotowego pakietu normowego — Claude Opus 5.5

**Cel:** integracja przygotowanego przez GPT-6 pakietu dokumentacji IEC 60909-0:2026 z `radekizk-sketch/MV-Design-PRO`.  
**Zakres roli Opusa 5.5:** **recenzja techniczna spójności integracji i scalanie gotowych zmian**. Nie projektować od nowa architektury selektora, nie zastępować reguł własnymi domysłami i nie deklarować zgodności normowej bez audytu źródła.

## Co zostało dostarczone

1. Autorskie dossier normy 2026 z metryką IEC, spisem klauzul i statusem dowodu.
2. Mapa migracji odniesień 2016→2026 bez nieuprawnionego założenia tożsamości treści.
3. Pełny kontrakt produktu: selektor normy per `StudyCaseConfig`, propagacja przez analizę, wyniki, SLD, EAZ, raport, utrwalone biegi.
4. Macierz 34 scenariuszy odbiorowych (20 fizycznych i 14 integracyjnych).
5. Rejestr maszynowy z 33 pozycjami klauzul/reguł i dwoma wydaniami normy; tylko informacyjny, a nie aktywny algorytm.

## Reguła bazowa

Obecny solver 2016 pozostaje nietknięty przez ten pakiet. Profil 2026 pozostaje **NIEDOSTĘPNY**, bo pełna treść normy oraz liczbowy audyt wydania 3.0 nie zostały jeszcze dostarczone. Jego przedwczesne uruchomienie byłoby błędem merytorycznym. Nie istnieje „zgodność przez zmianę etykiety”.

## Gotowość do scalenia — kontrola Opusa

- [ ] Przejrzeć diff tylko nowych plików `docs/normy/*`.
- [ ] Potwierdzić, że nie zmieniono `network_model/solvers`, frozen Result API, `domain/study_case.py`, SLD i warstw analizy.
- [ ] Potwierdzić brak pełnego tekstu chronionej normy, skanów, tabel licencjonowanych i rzeczywistych danych projektowych.
- [ ] Potwierdzić poprawność składni `rejestr_iec60909.json`.
- [ ] Sprawdzić, że aktywny `KANON_V12_XX.md`, `AGENTS.md` i ADR-007 nie są zastępowane tym materiałem.
- [ ] Scalić pakiet dokumentacji, zachowując status **SPECYFIKACJA / BRAK WDROŻENIA**.
- [ ] Jeśli w repo istnieje konkurencyjna praca nad SC, nie rozstrzygać jej samodzielnie; zachować separację i zgłosić konflikt.

## Warunek przekazania wdrożenia produktu (do GPT-6 Astra)

Implementacja selektora jest **oddzielnym zadaniem kodowym**, objętym obowiązkowymi kontrolami:
- pełny audyt bieżącego toru ENM, konfiguracji przypadku i biegów;
- świadomy zapis wydania do config, run, hash, proof, API, wyników i eksportów;
- osobny stan poprawności implementacji każdej edycji;
- zachowanie prawdziwego źródła prądów gałęziowych z macierzy zespolonych, bez dzielenia I''k „na oko”;
- aktualizacja analiz pochodnych i regresje dla wydania 2016;
- 2026 dopiero po sprawdzeniu pełnego egzemplarza i niezależnych testach.

**Minimalny raport scalenia:** URL PR, SHA merge, lista ścieżek, JSON syntax PASS/FAIL, uwagi o kolizjach. Nie ogłaszać „IEC 60909-0:2026 wdrożona” po samym scaleniu dokumentacji.

## Materiał referencyjny dla wdrożenia

- `docs/v12xx/KANON_V12_XX.md`
- `AGENTS.md` i główne `CLAUDE.md`
- `docs/adr/ADR-007-iec60909-frozen-reference.md`
- `docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md`
- `backend/src/application/solvers/short_circuit_binding.py`
- `backend/src/network_model/core/voltage_factor.py`
- `backend/src/domain/study_case.py`
- `frontend/src/ui2/wyniki/zwarcia/EkranZwarc.tsx`
- Oficjalne wydanie: https://webstore.iec.ch/en/publication/68454

**Treść normy:** pełne brzmienie i tablice muszą zostać sprawdzone w licencjonowanym egzemplarzu poza publicznym repozytorium; Opus nie ma podstaw do uznania niezweryfikowanego wzoru za obowiązujący w 2026.
