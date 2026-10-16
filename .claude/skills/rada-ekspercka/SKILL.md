---
name: rada-ekspercka
description: Dobiera ekspertów elektroenergetycznych do projektowania SN/nN, stacji, aparatury, EAZ, zwarć, rozpływów, jakości energii, dynamiki, OZE/BESS i zgodności NC RfG/WOS. Weryfikuje model fizyczny, wymagania normowe, wyniki i dowody przed zmianą kodu lub interfejsu MV-DESIGN PRO.
argument-hint: "[opis problemu elektroenergetycznego]"
---

# Rada Techniczna MV-DESIGN PRO

Ta umiejętność jest merytorycznym kontraktem zadaniowym, nie alternatywną architekturą programu. Najwyższy autorytet zachowują kanony repozytorium, B-01/B-02 i `CLAUDE.md`.

## Kwalifikacja zagadnienia

- Rozpoznaj rzeczywisty problem energetyczny i zależności w ENM, katalogu, solwerach, EAZ, SLD, NC RfG, interfejsie i raporcie.
- Z katalogu głównego repozytorium uruchom: `python mv-design-pro/scripts/rada_ekspercka.py "$ARGUMENTS"` dla wywołania jawnego; przy automatycznym użyciu zastosuj opis aktualnego zadania. Nie uruchamiaj z parametrem pustym. Alternatywnie: `python mv-design-pro/scripts/rada_ekspercka.py --check`.
- Kwalifikator tworzy **propozycję** obsady. Zweryfikuj ją na podstawie sensu technicznego. Jeśli zgłasza `WYMAGA_KWALIFIKACJI`, dobierz kompetencje jawnie, nie zgaduj.
- Pełny rejestr: `mv-design-pro/docs/eksperci/rejestr_240.json`. Dokumentacja: `mv-design-pro/docs/eksperci/README.md`. Czytaj tylko powiązane specjalizacje, nie 240 pełnych rekordów w każdym zadaniu.
- Przy problemie wielodziedzinowym dołącz konieczne kompetencje niezależnie od wyniku dopasowania. Gdy zadanie jest typograficzne bez znaczenia technicznego, nie organizuj fikcyjnej Rady.

## Obowiązkowy sposób pracy

1. **Zakres fizyczny:** nazwij konkretny obiekt, poziom napięcia, topologię, stany łączeniowe, urządzenia i analizowany przypadek.
2. **Dane:** wskaż źródła, parametry znamionowe, brakujące dane, założenia, ograniczenia modelu. Nie podstawiaj parametrów domyślnych bez jawnego kontraktu.
3. **Podstawy:** ustal właściwe wydanie normy, wymagania operatora, instrukcję albo dokument producenta; podaj punkt dopiero po weryfikacji. Nie przypisuj źródłu twierdzeń z pamięci.
4. **Wynik:** wymagaj równań, podstawień, jednostek, warunków brzegowych, porównania z limitem, marginesu i WHITE BOX A–D.
5. **Realizacja:** dopiero po rozstrzygnięciu wymagań branżowych zleć zmianę implementacyjną istniejącej architektury. Zachowaj ENM, rozdzielenie SN/nN, solwery i kontrakty.
6. **Recenzja:** dla istotnych ryzyk zleć niezależną recenzję odizolowanemu subagentowi `recenzent-elektroenergetyczny` z konkretnymi danymi, dowodami, zakresem i obowiązkiem wskazania błędów.
7. **Odbiór:** dowiedź faktycznej ścieżki użytkownika, regresji liczbowej, spójności wyników, źródeł i ograniczeń. Nie nazywaj opinii LLM formalnym świadectwem zgodności.

## Werdykt

Przestrzegaj `mv-design-pro/docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`: status bez wyjaśnienia jest błędem. Brak danych, certyfikatu, symulacji lub zwalidowanego modelu nie oznacza `SPELNIA`. Oddziel wynik obliczenia, symulacji, pomiaru i formalnego odbioru.

Meldunek: **problem → aktywne kompetencje (identyfikatory) → dane i metoda → wynik z jednostkami → kryterium i źródło → margines → ograniczenia → dowody → niezależna recenzja → werdykt**.

Niedozwolone: 240 fikcyjnych agentów, domniemane opinie ekspertów, kopiowanie wyników między źródłami, pozorna aprobata B-01/B-02, ocena samego UI przed oceną procesu inżynierskiego.
