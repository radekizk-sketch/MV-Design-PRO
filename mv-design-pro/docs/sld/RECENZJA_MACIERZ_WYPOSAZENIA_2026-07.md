# RECENZJA EKSPERCKA — MACIERZ WYPOSAŻENIA PÓL L2 (2026-07-23) — WIĄŻĄCA

Status: **WIĄŻĄCA** (uwagi właściciela do dostawy W1, ocena **7,5/10** —
„kierunek dobry, ale macierz zbyt uproszczona jako referencja globalna").
Uzupełnia `RECENZJA_L2_POLA_WYPOSAZENIE_2026-07.md` (V12K-145); przy
sprzeczności wygrywa TEN dokument w zakresie macierzy wyposażenia.

## Uwagi (1–18, skondensowane bez utraty treści)

1. Macierz GENEROWANA BEZPOŚREDNIO z konfiguracji kreatora, nie z ręcznych
   przykładów — każda kombinacja aparatów dostępna w kreatorze ma wzorzec SLD.
2. Sześć przykładów to podzbiór — w praktyce dziesiątki wariantów pól
   (liniowe, transformatorowe, sprzęgłowe, pomiarowe, odpływowe, sekcyjne,
   OZE, BESS, generatorowe) — jeden GLOBALNY silnik dla wszystkich.
3. Kolejność aparatów zawsze wg realnego toru pierwotnego: PN-EN 61936,
   IEC 60617, praktyka producentów (Elektrometal, ZPUE, Schneider RM6/SM6,
   Siemens 8DJH, ABB SafeRing/SafePlus, Eaton Xiria…).
4. GŁOWICA nie jest aparatem pola — jest zakończeniem KABLA: rysowana
   dokładnie w miejscu przejścia kabla do wnętrza pola, nigdy oderwana.
5. UZIEMNIK jednoznacznie powiązany z odcinkiem toru (funkcjonalnie na
   przewodzie, z węzłem przyłączenia), nie „osobny symbol obok kolumny".
6. OGRANICZNIK PRZEPIĘĆ = odgałęzienie od toru DO ZIEMI — nigdy jako kolejny
   aparat w torze głównym.
7. CT ≠ VT jednoznacznymi symbolami biblioteki; przyszłość (rejestr braków,
   wymaga danych ENM): CT pomiarowy vs zabezpieczeniowy, zestawy
   wielordzeniowe, VT szynowy vs kablowy.
8. Pole TR konfigurowalne: LBS+bezpieczniki / CB / CB+zabezpieczenie cyfrowe
   / przekładniki / ograniczniki / pomiar energii / automatyka SZR.
9. Brakujące typy pól: sprzęgło sekcyjne, pomiarowe, bateria kondensatorów,
   potrzeby własne, OZE, BESS, generator, rezerwowe.
10. Każdy wariant ma IDENTYFIKATOR KONFIGURACJI używany przez silnik —
    render nie zgaduje wyposażenia z typu pola.
11. Jednolity raster/odstępy/pozycjonowanie symboli między konfiguracjami
    (dziś różnice wysokości utrudniają porównanie).
12. OBOWIĄZKOWE odległości pionowe między aparatami + minimalne odległości
    od szyn i kabla — stałe kontraktowe, nie „na oko".
13. Macierz pokazuje też warianty aparat OTWARTY/ZAMKNIĘTY (weryfikacja
    stanów pracy).
14. Warianty z 2× uziemnikiem, 2× przekładnikiem, dodatkowymi aparatami
    pomiarowymi.
15. Grupowanie funkcjonalne: liniowe / transformatorowe / OZE / sprzęgłowe /
    pomiarowe / specjalne.
16. Macierz = TEST REFERENCYJNY SILNIKA (nie dokumentacja poglądowa) —
    zmiana w kreatorze automatycznie generuje przypadki testowe.
17. GLOBALNIE: algorytm nie może być dopasowany do sześciu przykładów ani
    sieci demonstracyjnej — dowolna konfiguracja realnych sieci SN różnych
    operatorów i producentów.
18. Auto-weryfikacja per konfiguracja: kolejność aparatów · ciągłość toru ·
    zgodność z kreatorem · zgodność z biblioteką symboli · brak kolizji ·
    poprawne odgałęzienia doziemne · poprawny render na wszystkich LOD.

## Mapowanie na program (rozszerzenie V12K-145)

- **W1b (P0, po scaleniu W2 — te same pliki kompozycji):** semantyka toru:
  głowica dokładnie na przejściu kabla (uwaga 4), uziemnik funkcjonalnie na
  odcinku toru z węzłem (5), SA jako odgałęzienie tor→ziemia (6), jednolity
  raster + kontraktowe odstępy pionowe aparatów i od szyny/kabla (11, 12),
  warianty stanów otwarty/zamknięty i krotności (2×ES/2×CT) w macierzy
  (13, 14).
- **W1c (P0/P1):** macierz GENERATYWNA: enumeracja realnych kombinacji z
  katalogu szablonów (kanonicznych + most producencki `cell_configurations`
  → `primary_devices` — jawny dług W1), identyfikator konfiguracji w meta
  sceny (10), grupowanie funkcjonalne (15), typy pól z uwagi 9 w zakresie,
  w jakim ENM/kreator je niesie (bez fabrykacji — brakujące typy pól w
  kreatorze = jawny rejestr braków), wyrocznie auto-weryfikacji 18 jako
  sondy accept, generacja przypadków testowych z katalogu (16, 17).
- **W5:** warianty CT/VT z uwagi 7 (wymagają rozszerzenia danych ENM —
  rejestr braków, decyzja danych, zero zgadywania).

Zasada nadrzędna (17): reguły wyłącznie z danych konfiguracji i stałych
kontraktowych — żadnych wyjątków pod przykłady; wykrycie dopasowania pod
fixture = odrzucenie (spójne z WYTYCZNE_GENERALIZACJA).
