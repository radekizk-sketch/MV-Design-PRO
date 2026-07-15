# MODEL INTERAKCJI APLIKACJI — CAŁY SYSTEM OD NOWA (2026-07)

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (podrzędny wobec kanonu V12.xx)
**Data:** 2026-07-15
**Zakres:** KAŻDE okno, KAŻDY widok, KAŻDA interakcja (klik, dwuklik, prawy przycisk, hover,
klawiatura, przeciąganie) w całej aplikacji — zaprojektowane od nowa i wykonane od nowa.
**Relacja do kanonu (zero dwóch prawd):**
- `docs/v12xx/MACIERZ_INTERAKCJI.md` — pozostaje kanonem interakcji dla obiektów SLD
  (własność wątku SLD; guard `interaction_matrix_guard.py`). Ten dokument DZIEDZICZY jej
  reguły globalne i rozszerza je na resztę aplikacji — nie dubluje wierszy obiektów SLD.
- `docs/ui/MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md` — 17 dialogów domenowych A–Q pozostaje
  BINDING; rejestr okien (§4) odwołuje się do nich po ID, nie kopiuje ich definicji.

---

## 1. Mandat: system od nowa

Warstwa prezentacji jest budowana OD ZERA (clean-room UI): każde okno projektowane na nowo
(układ, treść, interakcje, stany), a stare okno ginie w tym samym PR, w którym nowe przejmuje
jego funkcję. Zakaz „liftingu" starych komponentów przez dosztukowanie stylów — dozwolone jest
wyłącznie ponowne użycie logiki niewizualnej (klienci API, typy, store'y) po przeglądzie karty.
Backend, solvery, kontrakty API i pliki wątku SLD pozostają nietknięte.

## 2. Gramatyka interakcji — reguły globalne (obowiązują w KAŻDYM oknie)

Dziedziczone z `MACIERZ_INTERAKCJI.md` i rozszerzone na całą aplikację:

| Gest | Semantyka systemowa (bez wyjątków) |
|---|---|
| **1× klik** | Wybiera obiekt/wiersz/kartę i aktualizuje inspektor (panel prawy). Nigdy nie mutuje modelu. |
| **2× klik** | Otwiera domyślne okno edycji lub szczegółu obiektu (dla wyniku: uzasadnienie WHITE BOX). |
| **Prawy klik** | Menu kontekstowe zgodne ze stanem obiektu (akcje niedostępne = widoczne, wyszarzone, z powodem). |
| **Hover** | Pełna nazwa, jednostka, status jakości danych, status aktualności wyniku (tooltip ≤ 500 ms). |
| **Przeciąganie** | Tylko tam, gdzie karta okna jawnie je definiuje; zawsze z podglądem i `Esc` = anuluj. |
| **`Esc`** | Zamyka menu/dialog bez zapisu; w widoku — czyści zaznaczenie. |
| **`Enter`** | W dialogu: akcja główna. Na zaznaczonym obiekcie: otwiera inspektor/edycję (jak 2× klik). |
| **`Ctrl+Z` / `Ctrl+Y`** | Undo/redo operacji domenowych (moduł history) — dostępne globalnie. |
| **`F1`** | Pomoc kontekstowa dla aktywnego okna. |
| **Skróty destrukcyjne** | Żaden skrót nie wykonuje operacji destrukcyjnej bez potwierdzenia. |

Reguły twarde:
1. **Zero martwych kliknięć** — każdy klikalny element ma zdefiniowany efekt (guard `dead_click_guard.py`).
2. **Zatwierdzenie dialogu = dokładnie jedna operacja domenowa** (reguła z matrycy okien §4);
   zero mutacji modelu poza operacjami domenowymi.
3. **Każda liczba klikalna** — wynik liczbowy prowadzi (2× klik) do uzasadnienia WHITE BOX.
4. **Stany obowiązkowe każdego okna:** pusty / ładowanie / błąd / brak danych / gotowy —
   zaprojektowane, nie domyślne.
5. **Fokus i klawiatura:** pełna ścieżka klawiaturowa przez każde okno (Tab-order zdefiniowany
   w karcie okna), ARIA, kontrast ≥ WCAG AA.
6. **Polskie etykiety, zakaz codenames** (guardy).
7. **Wyłącznie polski język techniczny** (dyrektywa właściciela 2026-07-15): zakaz surowych
   identyfikatorów z kodu w widocznych tekstach UI — żadnych nazw modułów/solverów
   (`short_circuit_iec60909`), kodów snake_case (`earthing.resistance_missing`), angielskich
   statusów ani skrótów kodowych pakietów. Etykieta główna ZAWSZE po polsku, terminologią
   inżynierską (normy wolno cytować: „IEC 60909-0"). Identyfikatory techniczne (kody gotowości,
   identyfikatory przebiegów, odciski SHA-256) wolno pokazać wyłącznie w strefie „szczegóły
   techniczne" (inspektor, tooltip, eksport diagnostyczny) — nigdy jako treść pierwszoplanową.

## 3. Standard okna (każde okno od nowa wg tego wzorca)

Karta każdego okna definiuje: (a) nagłówek — co, dla jakiego obiektu, status; (b) treść —
sekcje w kolejności pracy inżyniera; (c) pas akcji — akcja główna po prawej, `Esc`/anuluj
zawsze dostępne; (d) tabelę interakcji okna (rozszerzenie gramatyki §2 o gesty specyficzne);
(e) źródła danych (endpointy) i operację domenową zatwierdzenia; (f) stany §2.4; (g) testy.
Układ dialogów domenowych — zgodny z `MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md` §3.

## 4. REJESTR OKIEN — kompletna lista do zaprojektowania od nowa

Reguła: NIE WOLNO zbudować okna bez wpisu w rejestrze i bez karty zadania z kontraktem
interakcji. Rejestr uzupełnia zarządca przy rozpisywaniu epików; każde okno dostaje ID `W-…`.
Każde okno deklaruje też **minimalny tryb widoczności** (Podstawowy / Rozszerzony / Ekspercki —
`SPEC_UKLAD_PANELI_2026-07.md` §2); zarządca dopisuje tryb w kartach epików.
Stan początkowy (seed, wg przestrzeni N1–N7 z Programu §4):

| ID | Okno (etykieta PL) | Przestrzeń | Epik | Zastępuje (stan zastany) |
|---|---|---|---|---|
| W-101 | Pulpit projektu | N1 | E2 | projects (lista) |
| W-102 | Nowy projekt / otwórz projekt | N1 | E2 | projects |
| W-103 | Archiwum projektu (eksport/import ZIP, diff) | N1 | E2 | project-archive |
| W-104 | Ustawienia aplikacji | N1 | E1 | settings |
| W-110 | Powłoka: nawigacja główna + pasek stanu + powiadomienia | wszystkie | E1 | shell, navigation, status-bar, notifications |
| W-201 | Kreator sieci — krok źródło (GPZ) | N2 | E3 | designer + dialog A |
| W-202 | Kreator sieci — magistrale i odgałęzienia | N2 | E3 | designer + dialogi B/D/E/F/G |
| W-203 | Kreator stacji SN/nn (pola, aparaty, trafo) | N2 | E3 | designer + dialogi C/J–Q |
| W-204 | Kreator DER (PV/BESS/FW/agregat/UPS) | N2 | E3 | dialogi L/M/N/O |
| W-205 | Przeglądarka katalogu typów | N2 | E4 | catalog |
| W-206 | Karta techniczna typu | N2 | E4 | tech-card |
| W-207 | Siatka właściwości elementu (multi-edit) | N2 | E5 | property-grid + dialogi H/I |
| W-208 | Drzewo topologii | N2 | E5 | topology |
| W-209 | Inspektor ENM | N2 | E5 | enm-inspector |
| W-210 | Import XLSX | N2 | E13 | xlsx (rozproszone) |
| W-301 | Widok SLD w powłoce (osadzenie) | N3 | E14 | WŁASNOŚĆ WĄTKU SLD — tylko rama |
| W-401 | Panel gotowości (readiness + fix-actions) | N4 | E6 | engineering-readiness |
| W-402 | Panel problemów walidacji | N4 | E6 | issue-panel |
| W-403 | Kwalifikacja analiz (eligibility) | N4 | E6 | analysis-eligibility |
| W-501 | Menedżer przypadków obliczeniowych | N5 | E7 | study-cases |
| W-502 | Konfiguracja scenariuszy zwarć | N5 | E7 | fault-scenarios |
| W-503 | Przebiegi (kolejka, wsadowe, historia) | N5 | E7 | (batch_execution — API niewpięte) |
| W-601 | Przeglądarka wyników (hierarchia przebiegów) | N6 | E8 | results |
| W-602 | Inspektor wyniku (z traceem) | N6 | E8/E9 | results-inspector |
| W-603 | Wyniki rozpływu mocy (tabele + profil) | N6 | E8 | power-flow-results, voltage-profile, power-distribution |
| W-604 | Wyniki zwarciowe (bus-centric) | N6 | E8 | results (SC) |
| W-605 | Wrażliwość | N6 | E8 | sensitivity |
| W-606 | NOWE: estymacja stanu, stan fazowy, rozpływ niesymetryczny | N6 | E8 | BRAK (luka ❌/◐) |
| W-607 | NOWE: sanity bounds + walidacja energetyczna (flagi jakości) | N6 | E8 | BRAK (luka ❌) |
| W-608 | Inspektor dowodu WHITE BOX (LaTeX, krok po kroku) | N6 | E9 | proof |
| W-609 | Porównanie A/B (jeden moduł: LF/SC/zabezpieczenia/scenariusze) | N6 | E12 | comparison ×3 (konsolidacja) |
| W-610 | Zabezpieczenia: biblioteka + nastawy | N6 | E10 | protection |
| W-611 | Koordynacja TCC (krzywe I–t) | N6 | E10 | protection-coordination, protection-curves |
| W-612 | NOWE: pętla zwarciowa nn (IEC 60364) | N6 | E10 | szczątkowe (◐) |
| W-613 | NOWE: zwarcia maszyn | N6 | E10 | BRAK (luka ❌) |
| W-614 | Testy zgodności NC RfG / PTPiREE (w tym FRT/HVRT) | N6 | E11 | ncrfg-tests |
| W-615 | NOWE: arc flash / siła sieci / adekwatność Q / SSCI | N6 | E11 | BRAK (luki ❌; wymagają wpięcia API) |
| W-701 | Centrum raportów (PDF/DOCX, paczki dowodowe) | N7 | E13 | reports, proof (eksport) |
| W-702 | Zestawienia materiałowe i kompletność techniczna | N7 | E13 | audit |
| W-703 | Bilans mocy do wniosku przyłączeniowego | N7 | E11/E13 | rozproszone w SLD (panel) |

Rejestr jest ŻYWY: zarządca dodaje/uszczegóławia wiersze w kartach epików; usunięcie wiersza
wymaga zgody właściciela (to usunięcie funkcji).

## 5. Definicja „100× lepiej" — mierzalna, nie sloganowa

Każde okno przechodzi bramkę jakości względem stanu zastanego:
1. **Kompletność:** obsługuje 100% funkcji swojego zakresu z inwentarza (stare często < 50%).
2. **Interakcje:** pełna gramatyka §2 (stare: przeważnie tylko klik) + zero martwych kliknięć.
3. **Stany:** 5/5 stanów zaprojektowanych (stare: przeważnie 1–2).
4. **Droga do informacji:** każda funkcja ≤ 3 kliknięcia; każdy wynik → dowód w ≤ 2 kliknięcia.
5. **Klawiatura:** 100% ścieżek dostępnych bez myszy.
6. **Ocena rady specjalistów:** ≥ 9/10 (checklista pisemna per okno).
Wynik bramki zapisany w karcie okna (przed/po) — to jest dowód „lepiej", nie deklaracja.

## 6. Egzekwowanie

Guardy istniejące: `dead_click_guard.py`, `dialog_completeness_guard.py`,
`interaction_matrix_guard.py` (SLD), `forbidden_ui_terms_guard.py`, `ui_terminology_guard.py`.
Nowe testy per okno (obowiązkowe w karcie): test gramatyki interakcji (klik/2×klik/prawy/
klawiatura), test 5 stanów, test etykiet PL. Zmiany wizualne: artefakt renderu + porównanie
z makietą zatwierdzoną w U0.6.
