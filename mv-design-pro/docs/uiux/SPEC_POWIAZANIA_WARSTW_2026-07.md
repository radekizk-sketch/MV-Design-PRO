# SPECYFIKACJA POWIĄZANIA WARSTW — JEDEN MODEL, WSZYSTKO POŁĄCZONE (2026-07)

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (dotyczy KAŻDEGO okna z rejestru)
**Data:** 2026-07-15 (dyrektywa właściciela: „wszystkie warstwy interfejsu powiązane ze schematem,
wynikami, analizami — wielowarstwowo, nie oderwane; zmiana w kreatorze aktualizuje schemat i wszystko inne")
**Fundament kanoniczny (istnieje w repo — nie budujemy od zera):**
- Single Model Rule (`CLAUDE.md`): jeden NetworkModel; kreator i SLD edytują TEN SAM model.
- Case Immutability Rule: zmiana modelu unieważnia wyniki WSZYSTKICH przypadków.
- Kanon „na żywo" (`docs/ui/KANON_KREATOR_SN_NN_NA_ZYWO.md`): 1 klik = 1 operacja domenowa
  → natychmiastowa aktualizacja SLD.
- Mechanika istniejąca: `executeDomainOp` → snapshot ENM (`snapshotStore`) + `logical_views`
  + `readiness`/`fix_actions` + `selection_hint` zwracane przez backend po każdej operacji.
Ten dokument podnosi te zasady do rangi kontraktu obowiązującego CAŁĄ nową powłokę.

---

## 1. Zasada naczelna: projekcje jednego źródła prawdy

Każde okno interfejsu jest PROJEKCJĄ tego samego snapshotu modelu (ENM) i tego samego zbioru
wyników — nigdy właścicielem własnej kopii danych. Zakazane: lokalne grafy, zdublowane stany,
„odświeżanie ręczne" jako warunek spójności. Jeśli dwa okna pokazują ten sam obiekt, pokazują
go z tej samej rewizji snapshotu — zawsze.

## 2. Kanoniczny cykl propagacji (obowiązuje dla KAŻDEJ mutacji)

```
akcja użytkownika (kreator / SLD / siatka właściwości / drzewo / menu kontekstowe)
  → JEDNA operacja domenowa (zero mutacji poza operacjami)
  → backend: walidacja → snapshot rev N+1 + logical_views + readiness + selection_hint
  → magistrala zdarzeń powłoki (jedno zdarzenie: „model zmieniony, rev N+1, zakres zmian")
  → subskrybenci reagują RÓWNOCZEŚNIE (bez odpytywania ręcznego):
      SCHEMAT (SLD)        — przerysowanie zakresu zmian (kanon „na żywo")
      DRZEWO TOPOLOGII     — wstawienie/aktualizacja węzła + podświetlenie
      SIATKA WŁAŚCIWOŚCI   — odświeżenie wartości zmienionego elementu
      GOTOWOŚĆ             — nowe kody gotowości / fix-actions (pasek przypadku + panel N4)
      KWALIFIKACJA ANALIZ  — przeliczenie dostępności analiz
      WYNIKI               — WSZYSTKIE wyniki przypadków → „nieaktualne" (znacznik + powód)
      NAKŁADKI NA SLD      — wygaszenie nakładek nieaktualnych wyników
      PORÓWNANIA           — oznaczenie porównań zawierających nieaktualną stronę
      RAPORTY / BILANS     — status „wymaga przeliczenia" na dokumentach zależnych
      PASEK STANU          — rev modelu + status spójności
```
Analogiczny cykl dla zakończenia przebiegu obliczeń: „wyniki gotowe, run X" → wyniki, nakładki,
porównania, dowody, raporty, bilans, pasek przypadku — wszystkie reagują z tego samego zdarzenia.

## 3. Wspólny kontekst: selekcja, przypadek, rewizja

1. **Jedna selekcja globalna.** Obiekt zaznaczony w dowolnym oknie jest zaznaczony WSZĘDZIE:
   kreator ↔ SLD ↔ drzewo ↔ siatka właściwości ↔ wyniki ↔ inspektor. `selection_hint`
   z operacji domenowej ustawia selekcję po każdej mutacji (nowo wstawiona stacja jest od razu
   zaznaczona na schemacie, w drzewie i w inspektorze).
2. **Jeden aktywny przypadek.** Pasek aktywnego przypadku to ten sam kontekst dla obliczeń,
   wyników, nakładek i raportów; zmiana przypadku przełącza całą powłokę atomowo.
3. **Jedna rewizja.** Każdy wynik/nakładka/raport/dowód nosi rewizję modelu, z której powstał;
   rozjazd rewizji = widoczny znacznik „nieaktualne względem modelu (rev 214 → 215)" + akcja
   „Przelicz". Zakaz pokazywania nieaktualnego wyniku bez znacznika — to reguła twarda.

## 4. Nawigacja dwukierunkowa (każda para warstw)

| Z → do | Gest | Zachowanie |
|---|---|---|
| Kreator → schemat | automatycznie | każdy krok kreatora widoczny na żywo na SLD (podgląd + selekcja) |
| Schemat → dane | 2× klik | okno edycji elementu; zapis = operacja → pełny cykl §2 |
| Wynik → schemat | „Pokaż na schemacie" | SLD centruje i podświetla element, nakładka aktywna |
| Schemat → wyniki | klik na etykietę wyniku | inspektor wyniku + przejście do uzasadnienia |
| Gotowość → dane | klik fix-action | otwiera właściwe okno edycji z fokusem na brakującym polu |
| Wynik → dowód | 2× klik | dowód WHITE BOX; z dowodu powrót do wyniku i elementu |
| Porównanie → przypadki | klik strony A/B | przełączenie kontekstu przypadku z zachowaniem selekcji |
| Raport → źródła | klik pozycji raportu | element / wynik / dowód, z którego pozycja pochodzi |

Reguła: ŻADNA warstwa nie jest ślepą uliczką — z każdego miejsca da się przejść do powiązanych
warstw bez szukania ręcznego.

## 5. Macierz propagacji zdarzeń (kontrakt dla kart zadań)

Zdarzenia magistrali: `model-zmieniony(rev, zakres)`, `wyniki-gotowe(run)`,
`wyniki-nieaktualne(przyczyna)`, `selekcja(obiekt)`, `przypadek-aktywny(id)`,
`gotowość-zmieniona(kody)`. Każda karta okna DEKLARUJE: (a) które zdarzenia subskrybuje
i jak reaguje, (b) które emituje i kiedy. Okno bez deklaracji subskrypcji nie przechodzi
recenzji karty. Wzorzec deklaracji:

```
OKNO W-xxx — POWIĄZANIA
Subskrybuje: model-zmieniony → <reakcja>; selekcja → <reakcja>; …
Emituje:     selekcja (klik wiersza); operacja domenowa <nazwa> (zatwierdzenie dialogu); …
Rewizja:     pokazuje rev modelu przy każdej danej pochodnej: TAK/ND
Nawigacja:   wchodzące (skąd można tu trafić) / wychodzące (dokąd prowadzi dalej)
```

## 6. Wymogi implementacyjne (karty E15 — fundament stanu)

1. **Magistrala zdarzeń powłoki** — jedna, typowana (zdarzenia §5); zbudowana na istniejących
   store'ach (snapshot, selekcja, przypadek) — bez drugiego źródła prawdy, bez nowych kopii danych.
2. **Kontrakt świeżości** — pole rewizji na każdej danej pochodnej + komponent znacznika
   „nieaktualne" (jeden, współdzielony; zakaz lokalnych wariantów).
3. **Selekcja globalna** — jeden store selekcji; `selection_hint` z backendu ma pierwszeństwo.
4. **Determinizm** — kolejność reakcji subskrybentów nie wpływa na stan końcowy (reakcje czyste
   względem zdarzenia); testy: po dowolnej operacji wszystkie projekcje pokazują rev N+1.
5. **Testy kontraktowe propagacji** (obowiązkowe per epik): „zmiana w kreatorze → schemat,
   drzewo, gotowość, znaczniki wyników zaktualizowane w jednym cyklu, bez odświeżania".
6. Granica wątku SLD: SLD subskrybuje magistralę przez swój publiczny adapter (karta
   koordynacyjna SLD-02 do założenia przy E14); wnętrza SLD nie dotykamy.

## 7. Kryterium odbioru dyrektywy

Scenariusz akceptacyjny e2e (wchodzi do testów U2): inżynier w kreatorze wstawia stację na
magistrali → BEZ ŻADNEGO odświeżenia: stacja widoczna na SLD z selekcją, w drzewie topologii,
w siatce właściwości; gotowość pokazuje nowe braki stacji; kwalifikacja analiz przeliczona;
wszystkie wyniki oznaczone „nieaktualne (model rev +1)" z akcją „Przelicz"; bilans mocy
i raporty oznaczone „wymaga przeliczenia"; pasek stanu pokazuje nową rewizję. Jedna zmiana —
dziesięć warstw zaktualizowanych z jednego zdarzenia.
