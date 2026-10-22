# Kontrakt produktu — selektor wydania IEC 60909-0 w analizach zwarciowych

**Identyfikator:** SC-NORM-SELECT-01 · **Wersja:** 1.0 · **Status:** gotowy projekt do wdrożenia (nie jest wdrożonym interfejsem ani potwierdzeniem zgodności).

## 1. Efekt widoczny dla projektanta

W karcie **Zwarcia → Parametry analizy** projektant wybiera:

**Norma obliczeniowa:** 
- **IEC 60909-0:2016** — istniejąca ścieżka obliczeń; po implementacji kontraktu opatrzona wydaniem.
- **IEC 60909-0:2026** — opcja prezentowana ze stanem **NIEDOSTĘPNA DO OBLICZEŃ — NIEZWERYFIKOWANA**, aż zakończy się walidacja całej ścieżki 2026.

Pozostałe ustawienia: rodzaj zwarcia (3F/2F/2F-Z/1F-Z), scenariusz maksimum/minimum, punkt zwarcia, czas zwarcia, konfiguracja źródeł, przyjęte założenia. Nie łączyć selektora **wydania normy** z selektorem **typu zwarcia** ani z polem sposobu uziemienia sieci. Profile producentów/OSD i metody IEC 60909-3 są odrębnymi kryteriami.

Obok wyboru należy pokazać:
- pełny tytuł normy, wydanie i rok;
- status: **Zweryfikowana implementacja / Implementacja nieweryfikowana / Nieobsługiwana**;
- różnice istotne dla bieżącej analizy;
- brakujące dane wejściowe (np. `Z0`, model punktu neutralnego, składowe udziału DER);
- po wykonaniu: odsyłacz **Pokaż podstawę i przebieg obliczeń**.

**Bez pozorowania zgodności:** wyszarzona opcja 2026 nie uruchamia starego solvera z nową etykietą. Jeżeli dane normy nie są zatwierdzone, backend odrzuca żądanie 2026 jawnym błędem domenowym, a nie wynikiem opatrzonym statusem PASS.

## 2. Źródło prawdy i przepływ

**Model sieci ENM** → niezmienna **konfiguracja `StudyCaseConfig`** (pole `short_circuit_standard_id`) → **migawka przypadku i hash** → `solver_input` i `application.solvers.short_circuit_binding` → **wybór profilu metod obliczeń** → istniejący solver / weryfikowana implementacja nowego wydania → **niezmienny zapis biegu** → wyniki, ślad White-Box, raport, eksport, nakładka SLD, porównanie biegów, EAZ.

To samo pole musi być konsekwentnie użyte przez wszystkie analizy pochodne z prądów zwarcia: dobór zdolności zwarciowej aparatów, obciążalność cieplna, nastawy i selektywność EAZ, parametry obwodu zwarciowego, przekroje/kable, raporty i wyniki na schemacie. **Żadna warstwa pochodna nie przelicza zwarć.** Rozpływ mocy zachowuje własny tryb obliczeń i nie podlega selektorowi IEC 60909.

Zmiana `short_circuit_standard_id`:
1. jest zmianą konfiguracji przypadku, **nie** topologii ani parametrów ENM;
2. tworzy nową wersję / migawkę przypadku, inwaliduje zależne aktualne wyniki;
3. nie zmienia nieodwracalnie dawnych biegów; stare wyniki wyświetlać z zapamiętanym wydaniem, nawet gdy użytkownik wybrał już inne;
4. musi zmienić odcisk wejścia biegu (`run_fingerprint`) i identyfikatory/odciski powiązanych wyników;
5. nigdy nie przełącza po cichu profilu na inne wydanie.

### 2.1 Proponowany kontrakt typowany

```python
from enum import StrEnum

class ShortCircuitStandardId(StrEnum):
    IEC_60909_0_2016 = "IEC_60909_0_2016"
    IEC_60909_0_2026 = "IEC_60909_0_2026"

# Rozszerzenie istniejącej niezmiennej StudyCaseConfig:
short_circuit_standard_id: ShortCircuitStandardId = ShortCircuitStandardId.IEC_60909_0_2016
```

Klucz w JSON: `short_circuit_standard_id` z kanonicznymi wartościami powyżej. Dla **historycznych zapisów bez pola** jawna migracja metadanych do profilu bazowego 2016 tylko jeśli dowód rzeczywiście potwierdza, że były liczone według dotychczasowej ścieżki 2016; w przeciwnym razie etykieta **WYDANIE NIEUSTALONE**. Nie zmieniać podpisanego historycznego artefaktu.

Przebieg wyniku powinien przenosić **`short_circuit_standard_id`, `normative_ruleset_revision`, `solver_version`, `normative_verification_status`, `evidence_manifest_hash`, `study_case_snapshot_hash`, `model_snapshot_hash`**; w odpowiedzi czytelnej: wydanie, metoda, założenia, ograniczenia, odrzucone przypadki i powody. Zachować stabilny zamrożony `ShortCircuitResult` poprzez jedno jawne miejsce powiązania z metadanymi biegu / manifestem; zakaz anonimowego dopinania atrybutów do frozen dataclass.

## 3. Warstwa reguł normowych — bez drugiego solvera fizycznego

Profil wydania ma dostarczać wersjonowane zestawy zasad i obliczeń. Dla każdej decyzji `norm_rule_id` + `clause` + `source_status`, np.:
- `VOLTAGE_FACTOR_TABLE` — dobór `c` wg napięcia punktu i MAX/MIN;
- `SEQUENCE_NETWORK_ASSUMPTIONS` — jakie admitancje/pojemności i kiedy stemplować;
- `EARTHING_APPLICABILITY` — ograniczenia 1F-Z dla sieci z izolowanym lub kompensowanym punktem neutralnym;
- `TRANSFORMER_CORRECTIONS` — `K_T`, układy połączeń i trzyuzwojeniowe;
- `CONVERTER_CONTRIBUTIONS` — DER/DFIG/FSC/BESS, ograniczenia danych;
- `INITIAL_FAULT_CURRENT`, `PEAK_CURRENT`, `BREAKING_CURRENT`, `STEADY_STATE_CURRENT`, `THERMAL_EQUIVALENT`;
- `BRANCH_CURRENT_RECONSTRUCTION` — prądy zespolone poszczególnych gałęzi i ich faz;
- `PROOF_CLAUSE_MAPPING` — równanie → wydanie → punkt normy → wejście → podstawienie → wynik.

Reużywać wspólną fizykę **tylko tam, gdzie identyczność wymagań 2016/2026 jest potwierdzona źródłowo i testami**. W pozostałych miejscach różnice implementować przez jawną strategię reguł wybranego wydania. Nie tworzyć odrębnej kopii całego ENM, SLD ani ekranu wynikowego. Nie modyfikować zamrożonej struktury wyniku; fizyka pozostaje w dedykowanych solverach.

## 4. Istniejące punkty integracji

| Warstwa | Plik (stan zastany) | Wymagana zmiana |
|---|---|---|
| konfiguracja przypadku | `backend/src/domain/study_case.py` | identyfikator wydania, serializacja, walidacja |
| obliczenia | `backend/src/application/solvers/short_circuit_binding.py` | przekazanie wyboru do jednego jawnego dyspozytora; brak cichego powrotu do 2016 |
| wspólne dane `c` | `backend/src/network_model/core/voltage_factor.py` | wartości przypięte do dowodów odpowiedniego wydania |
| fizyka SC | `backend/src/network_model/solvers/short_circuit_iec60909.py` | nie zmieniać frozen API; ADR-007 i zatwierdzona procedura zmian fizyki |
| wyniki | `backend/src/application/result_mapping/short_circuit_to_resultset_v1.py` | metadane normowe z biegu |
| analizy zależne | `backend/src/domain/zwarcia_porownanie.py`, `backend/src/api/zwarcia_porownania.py` | wykazywać, gdy biegi mają inne wydania |
| UI | `frontend/src/ui2/wyniki/zwarcia/EkranZwarc.tsx` | etykieta wydania z wyniku oraz wejście do konfiguracji przypadku, bez fizyki |
| proof | `docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md` i rzeczywisty silnik dowodowy | nowe mapowanie 2026 bez przemianowania starych równań |

**Uwaga:** tabela jest mapą miejsc, nie poświadczeniem, że wszystkie wymienione połączenia już istnieją. Przed edycją wykonawca audytuje realny tor `ENM→StudyCase→snapshot→run→result/proof/export` i aktualne `AGENTS.md`.

## 5. Widok porównania wyników dwóch wydań

Tabela porównania na **tej samej migawce ENM i identycznych danych fizycznych**:
`węzeł, typ zwarcia, scenariusz, I''k 2016, I''k 2026, ΔI''k [kA], Δ[%], ip, Ib, Ith, wkłady źródeł, prądy gałęziowe, status dowodu, przyczyna różnicy`.

`ΔI = I_2026 - I_2016`, `Δ[%] = 100ΔI/I_2016` tylko przy skończonym, niezerowym mianowniku. Brak wyniku / brak modelu / inna topologia: **NIEPORÓWNYWALNE** z powodem. Nie przypisywać każdej różnicy numerowi normy: ślad musi wskazać rzeczywistą zmianę reguły, danych lub konfiguracji.

## 6. Reguła zakresu normy przy doziemieniach

`IEC_60909_0_2026` dla **1F-Z w sieci izolowanej lub z uziemieniem rezonansowym** → `OUTSIDE_STANDARD_SCOPE`; nie uruchamiać uniwersalnego `Z0=∞` ani sztucznego `I=0` jako wyniku normowego. Dla innych sieci uzasadnić warunki `Y0,C` według autoryzowanego 5.2.4; 2016 i 2026 nie dziedziczą automatycznie tej reguły po sobie.

## 7. Bramka włączenia profilu 2026

Profil 2026 wolno udostępnić do obliczeń dopiero przy **łącznie** spełnionych:
1. pełny legalny egzemplarz 2026 przeczytany przez uprawnioną osobę; każde istotne odstępstwo oznaczone w rejestrze;
2. reguły 5.2.4, 5.2.5, 6, 7, 8, 9, 11, 14 powiązane z kodem i dowodami;
3. niezależne wyrocznie liczbowe i testy 3F, 2F, 2F-Z, 1F-Z, MAX, MIN, wieloźródłowe, nN przez TR, pojemności Z0, DER, neutralne i przypadki spoza zakresu;
4. zbieżność bilansu zespolonego prądów w węzłach, deterministyczna reprodukcja wyników i poprawne jednostki;
5. kompletne przebiegi UI→API→ENM→solver→wyniki→SLD→EAZ→proof→eksport→odczyt z zapisu, dwa motywy wizualne;
6. osobne podpisane zatwierdzenie profilu 2026, identyfikator wydania w raporcie, brak stale results i test negatywny zakazu fallback;
7. zachowane wyniki i funkcje 2016 przy zmianie selektora, testy regresji fizyki.

**Werdykt o stanie dziś:** kontrakt i źródła są przygotowane, ale selektor nie jest zaimplementowany w systemie produkcyjnym; `2026` nie jest certyfikowany ani dostępny dla obliczeń. Nie prezentować dokumentacji jako wdrożenia.

## 8. Ograniczenia architektury

Nadrzędne: `docs/v12xx/KANON_V12_XX.md`, `docs/system/`, `docs/domain/`, `AGENTS.md`, `CLAUDE.md`, ADR-007. Gdy modyfikacja rdzenia jest objęta bramką zgody właściciela, nie omijać jej nową kopią solvera. W raportach nie ujawniać rzeczywistych danych projektowych. Wszystkie etykiety po polsku technicznym.
