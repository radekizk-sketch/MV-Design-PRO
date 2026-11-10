# EKC — Globalny Rdzeń Wiedzy Normowej MV-DESIGN-PRO

**Status:** ARCHITECTURE PROPOSAL / DECISION REQUIRED; tylko dokumentacja, brak zmian produkcyjnych.  
**Data opracowania:** 2026-11-10.  
**Zakres:** cała platforma MV-DESIGN-PRO, wszystkie przyszłe rodziny dokumentów i wszyscy konsumenci domenowi; opcjonalne wykorzystanie w SN-SAG-LAB poprzez kontrakt publikacji.  
**Właściciel decyzji:** właściciel produktu. **Wykonawca/reviewer:** Claude Opus 5.5 lub Fable 5.2.  
**Wersja specyfikacji:** EKC-ARCH-V1 / niezatwierdzona.

## Cel PR

Ten PR jest **projektem specyfikacji, a nie PR implementacyjnym**. Ma umożliwić kolejnemu agentowi:
1. niezależne sprawdzenie stanu repo i obu wcześniejszych linii prac;
2. świadomy wybór wariantu architektury bez obowiązku realizowania wszystkich propozycji;
3. zamknięcie kontraktów wersjonowania, pochodzenia wiedzy i zgodności źródeł;
4. implementację etapami z niezależnymi bramkami dowodowymi;
5. zachowanie dotychczasowej fizyki, ENM, SLD i katalogów bez regresji.

**Zasada kluczowa:** Oryginalna norma/standard ≠ wydanie dokumentu ≠ wyodrębniony fakt ≠ zatwierdzona interpretacja ≠ wdrożona reguła ≠ wynik obliczenia ≠ decyzja projektanta.

System ma dawać **cytowalną odpowiedź na pytanie**, **deterministycznie dobrać obowiązującą wersję**, **podać zatwierdzoną regułę lub tabelę** i **przekazać ją konsumentowi** bez wykonywania fizyki w systemie wiedzy. Dokumenty mają być przechowywane zgodnie z licencją w osobnej, chronionej przestrzeni.

## Dokumenty tego pakietu

| Dokument | Funkcja |
| --- | --- |
| [01-ARCHITEKTURA-KONTRAKTY.md](01-ARCHITEKTURA-KONTRAKTY.md) | Warstwy, domena, identity, lifecycles, graph, RAG, API, wersjonowanie i interoperacyjność |
| [02-ENERGETYKA-I-MODULY.md](02-ENERGETYKA-I-MODULY.md) | Szczegółowa mapa zastosowań energetycznych i integracji każdego podsystemu |
| [03-SCHEMATY-I-API.md](03-SCHEMATY-I-API.md) | Projektowane modele JSON/Pydantic, zdarzenia, endpointy, resolve, przykłady użycia |
| [04-INGESTION-I-JAKOSC.md](04-INGESTION-I-JAKOSC.md) | PDF/OCR/wzory/tabele/rysunki, evidence, walidacja, licencje, bezpieczeństwo |
| [05-MIGRACJA-ROADMAPA-ODBIOR.md](05-MIGRACJA-ROADMAPA-ODBIOR.md) | Audyt stanu, migracja #493/#521, fazy, testy, dowody, failure modes |
| [06-KONTRAKT-DLA-OPUS-FABLE.md](06-KONTRAKT-DLA-OPUS-FABLE.md) | Misja i zakres autonomii recenzenta/wykonawcy, decyzje, stop conditions, DoD |
| [07-MAPA-ZRODEL-I-ODNIESIEN.md](07-MAPA-ZRODEL-I-ODNIESIEN.md) | Pochodzenie ustaleń, wersje, ścieżki repo, ryzyka normowe, źródła publiczne |

## Potwierdzony punkt wejścia — stan main

- **backend/src/reference_engine**: modele pakietów, registry, compliance, validation, bazowe powiązanie z ENM.
- **backend/src/reference_engine/packs/osd_enea/pack.json**: istniejący pakiet ENEA, w tym reguły zaimplementowane i niezrealizowane.
- **backend/src/api/reference_engine.py**: GET /api/reference/packs, GET /api/reference/packs/{pack_id}, GET /api/cases/{case_id}/reference/compliance.
- **backend/src/network_model/solvers/**: m.in. short_circuit_iec60909.py, short_circuit_core.py, short_circuit_asymmetrical_quantities.py, power_flow_newton.py, power_flow_unbalanced.py, conductor_thermal_withstand.py, cable_ampacity_derating.py, protection_iec60255.py, ncrfg_ptpiree/.
- **backend/src/enm/**: modele, walidacja, scenariusze, topologia, snapshot/hashe, odwołania do katalogów.
- **frontend/src/ui2/referencje/**: istniejąca powierzchnia UI; utrzymanie, nie klonowanie.
- **PR #493**: otwarty draft, katalog 25 standardów ENEA + 2 IRiESD, prywatny indeks, pytania z dowodami; **nie jest scalony**.
- **PR #521**: zamknięty draft bez merge; bazę R4 (230 kart/9 źródeł/79 propozycji reguł) należy traktować jako materiał do selektywnej migracji, nie jako produkcyjny kanon.

Dokumentacja w repo ma własne źródła prawdy: PRODUCT_CAPABILITY_CONSTITUTION, CANONICAL_TWIN_ARCHITECTURE, REFERENCE_ENGINE_SPEC_V1 i inne. W razie konfliktu nowy EKC-ARCH-V1 **nie superseduje** istniejących norm architektonicznych bez osobnej decyzji ADR. Agent musi wykonać analizę kompatybilności przed wdrożeniem.

## Kluczowe niezmienniki

1. **Jedna sieć obliczeniowa i kanoniczny ENM.** EKC nie ma własnego modelu topologii ani solvera.
2. **Bez automatycznego wykonania treści PDF.** Ekstrakcja tworzy kandydatów; produkcja używa zatwierdzonych rekordów i testowanych adapterów.
3. **Pochodzenie end-to-end.** Każde normatywne twierdzenie/wartość/wynik ma rozwiązywalną ścieżkę do edycji, punktu, tabeli/wzoru, dowodu i rewizji.
4. **Nieodwracalność historyczna.** Stare projekty i wyniki zachowują przypięte wydania, reguły, model i wersję solvera. Nowy dokument niczego nie przelicza po cichu.
5. **Brak fałszywego PASS.** Brak źródła, OCR niepewny, konflikt, brak danych lub nieokreślony zakres = NIEOCENIONE/BRAK PODSTAWY, nie „zgodny”.
6. **Jurysdykcja i kontekst.** IEC, EN/PN-EN, ENEA/OSD, IRiESD, warunki przyłączenia, projekt i producent są osobnymi źródłami; nie ma globalnej sztywnej reguły „wygrywa ENEA”.
7. **Data wydania ≠ data obowiązywania ≠ data zastosowania w projekcie.** Rozróżnia się edycje IEC, EN, PN-EN i konkretne wymagania OSD.
8. **Prawa autorskie.** Prywatne pełne PDF, skany, wyekstrahowane duże fragmenty i indeksy pełnotekstowe poza publicznym repo i nieautoryzowanym API.
9. **Brak nowej drugiej prawdy katalogowej.** Materiał, aparat, kabel i transformator mają parametr w kanonicznym katalogu; wiedza przechowuje źródło i kontekst.
10. **Powiązania wielu modułów z jednym rekordem.** Reguła/parametr jest reużywalny przez typowany consumer binding, bez importowania modułu SLD do solvera.
11. **Niezależność od asystenta AI.** Wyszukiwanie AI pomaga odnaleźć evidence, nie decyduje o zgodności i nie uruchamia wzorów.
12. **Wersjonowanie oparte na manifestach i zawartości, nie tylko napisie version.** Każdy release ma hash, dependency lock oraz jawny zakres dat i zmian.

## Granice normatywne — bez halucynacji

- Załącznik PN-EN 60909-0:2016-09 jest skanem wydania 2016 (82 strony PDF). Przykład: wzór (33) dla trójfazowego I''k (§7.2.1, IEC s.43/PDF s.51), tabela współczynnika c (IEC s.22/PDF s.30). To **historyczne źródło przykładowe**, nie dowód treści wydania 2026.
- IEC 60909-0:2026, wydanie 3.0, publikacja 2026-07-23: https://webstore.iec.ch/en/publication/68454 . Publikacja IEC nie dowodzi automatycznie statusu polskiego PN.
- ENEA ma osobny rejestr i zmienną historię standardów: https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji i https://www.operator.enea.pl/uslugi-dystrybucyjne/iriesd .
- Książka W. Dołęgi i wykład Z./T. Zdun to źródła naukowo-dydaktyczne, **nie normy**. Egzemplarze mają problemy ekstrakcyjne (kodowanie/skany): nie przyznawać im statusu VERIFIED_NORM.
- Parametry, szeregi urządzeń, wartości graniczne, symbole i wzory opisane jako TO_VERIFY w poddokumentach nie są twierdzeniami o aktualnej normie; są wymaganiami **na proces weryfikacji**.
- Aktualny fakt o normie i wymóg zastosowania normy to nie to samo. Należy stosować ustalenia prawne, umowne, projektowe i operatorowe właściwe dla przypadku. Daty i wydania trzeba zweryfikować w oficjalnych katalogach na dzień odbioru.

## Wyjściowy stan proponowany do decyzji

**Preferowany wariant:** modularne rozszerzenie istniejącego reference_engine jako Engineering Knowledge Core, osobny magazyn dokumentów, transakcyjny rejestr metadanych i zatwierdzonych rekordów, deterministyczny resolver pakietów, adapters/ports dla konsumentów, niezmienne release'y i projektowe lockfile.

**Wariant dopuszczalny:** usługa wydzielona w przyszłości, lecz dopiero gdy testy kontraktowe i operacyjne udowodnią potrzebę; nie rozpoczynać od rozproszonego mikroserwisu.

**Wariant odrzucony:** osobne „bazy norm” per solver/SLD/OSD, RAG jako bezpośredni system reguł, ręczne kopiowanie norm do kodu, runtime eval wzorów wyjętych z PDF, automatyczne uznawanie najnowszego wydania za zastosowane w historycznym projekcie.

## Punkt końcowy

Autor specyfikacji nie implementował kodu ani nie przeprowadził testów wykonawczych. Przyjęcie do realizacji wymaga zatwierdzonej decyzji architektonicznej, recenzji normowej i planu migracji z dowodami. Czytanie tego PR ma pozwolić Opus/Fable podważyć dowolne rozwiązanie, jeśli repo lub norma dowodzi jego niepoprawności.
