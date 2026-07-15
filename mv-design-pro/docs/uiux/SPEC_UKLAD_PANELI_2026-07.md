# SPECYFIKACJA UKŁADU PANELI — LEWY / ŚRODKOWY / PRAWY (2026-07)

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (powłoka W-110; obowiązuje każde okno w rejestrze)
**Data:** 2026-07-15 (dyrektywa właściciela: „panel prawy, środkowy i lewy, rozszerzalne
i ukrywane; bardziej zaawansowane okna ukrywane")
**Fundament istniejący:** `ui/mode-gate` (bramkowanie trybu eksperckiego), `ui/inspector-panel`,
`ui/workspace`, `ui/layout` — nowa powłoka przejmuje ich role wg tej specyfikacji.

---

## 1. Architektura trzech paneli

```
┌─ pasek tytułowy + pasek aktywnego przypadku ──────────────────────────────┐
│ LEWY (nawigacja+kontekst) │  ŚRODKOWY (warsztat)   │ PRAWY (inspektor)    │
│ 48–320 px, chowany do     │  elastyczny, karty     │ 280–560 px, chowany, │
│ listwy ikon               │  + podział 2 widoków   │ sekcje akordeonowe   │
└─ opcjonalny panel dolny (problemy/przebiegi) ── pasek stanu ──────────────┘
```

### 1.1 LEWY panel — nawigacja i kontekst przestrzeni
- **Górna część:** 7 przestrzeni roboczych (stała kolejność, skróty 1–7).
- **Dolna część (kontekstowa):** drzewo właściwe dla aktywnej przestrzeni — Projekt: lista
  projektów; Model: drzewo topologii; Obliczenia: lista przypadków; Wyniki: hierarchia
  przebiegów; Dokumentacja: lista raportów.
- **Stany:** pełny (240 px domyślnie, uchwyt 200–320 px) → **listwa ikon** (48 px; podpisy
  w dymkach) → nawigacja pozostaje zawsze osiągalna (nigdy pełne ukrycie).
- Przełączanie: uchwyt przeciągania, 2× klik na krawędzi = zwiń/rozwiń, skrót `Ctrl+B`.

### 1.2 ŚRODKOWY panel — warsztat
- Zawsze widoczny (nie da się go schować); minimalna szerokość chroniona — panele boczne
  zwężają się lub chowają pierwsze.
- **Karty dokumentów** (jak w środowiskach CAD/IDE): otwarte widoki przestrzeni jako karty
  z przypięciem; środkowy klik = zamknij.
- **Podział widoku** (na żądanie): 2 widoki obok siebie (np. schemat + wyniki, kreator +
  podgląd SLD) z niezależnym przewijaniem i wspólną selekcją (SPEC_POWIAZANIA §3).

### 1.3 PRAWY panel — inspektor kontekstowy
- **Zakładki stałe:** Właściwości · Wyniki · Dowód · Powiązania (nawigacja wychodząca).
- **Sekcje akordeonowe** wewnątrz zakładki: podstawowe rozwinięte, „Zaawansowane" zwinięte
  domyślnie (patrz §2). Stan rozwinięcia zapamiętywany per typ obiektu.
- **Stany:** pełny (320 px domyślnie, uchwyt 280–560 px) → schowany (przywołanie: klik na
  dowolny obiekt otwiera inspektor automatycznie; skrót `Ctrl+I`).
- **Przypięcie:** „pinezka" blokuje inspektor na wybranym obiekcie (porównywanie dwóch
  obiektów: przypięty + podgląd bieżącej selekcji w podzielonym inspektorze).

### 1.4 DOLNY panel (opcjonalny, domyślnie schowany)
Problemy walidacji · kolejka przebiegów · dziennik operacji. Przywoływany klikiem w pasek
stanu (np. klik na „Gotowość: 2 ostrzeżenia" otwiera dolny panel na zakładce Problemy).

### 1.5 Trwałość układu
Szerokości, zwinięcia, rozkład kart i tryb zaawansowania zapamiętywane per użytkownik ×
przestrzeń (magazyn ustawień powłoki). „Przywróć układ domyślny" w menu Widok. Zapis układu
nie jest danymi modelu — nie przechodzi przez operacje domenowe.

## 2. Progresywne odsłanianie — ukrywanie okien zaawansowanych

Trzy **tryby zaawansowania** (przełącznik w pasku tytułowym; buduje na `mode-gate`):

| Tryb | Kto | Co widzi |
|---|---|---|
| **Podstawowy** | inżynier prowadzący typowy projekt SN+OZE | 7 przestrzeni, kreatory, standardowe analizy (zwarcia, rozpływ, profil, zabezpieczenia, NC RfG), wyniki, dowody, raporty |
| **Rozszerzony** | specjalista analiz | + analizy specjalistyczne (niesymetryczny, stan fazowy, harmoniczne, rozruch silników, niezawodność, łuk, SSCI…), porównania zaawansowane, tryb przełączeń |
| **Ekspercki** | audytor / profesor / diagnostyka | + estymacja stanu, analiza niepewności, benchmarki, surowe ślady, szczegóły techniczne (identyfikatory, kody) w inspektorze |

Zasady twarde:
1. Ukrycie ≠ usunięcie: każda funkcja z inwentarza jest osiągalna w co najwyżej trybie
   eksperckim; macierz pokrycia liczy funkcję za pokrytą tylko, gdy ma przypisany tryb.
2. Wyszukiwarka poleceń (`Ctrl+K`) znajduje także funkcje ukryte w wyższych trybach —
   z podpowiedzią „dostępne w trybie rozszerzonym — przełączyć?".
3. W formularzach: sekcja „Zaawansowane" zwinięta domyślnie (parametry rzadko zmieniane,
   z wartościami z katalogu/szablonu wg SPEC_KREATORY Z1); zwinięcie nigdy nie ukrywa pola
   z błędem walidacji.
4. Tryb NIE zmienia wyników ani danych — wyłącznie widoczność powierzchni. Przełączenie
   trybu nie przeładowuje widoku (zachowuje kontekst i selekcję).
5. Rejestr okien (`MODEL_INTERAKCJI` §4) dostaje kolumnę „Tryb" — każde okno deklaruje
   minimalny tryb widoczności; karta zadania okna określa też, które sekcje są „Zaawansowane".

## 3. Gramatyka paneli (uzupełnienie MODEL_INTERAKCJI §2)

| Gest | Efekt |
|---|---|
| przeciągnięcie krawędzi panelu | zmiana szerokości w granicach min–max |
| 2× klik na krawędzi / `Ctrl+B`, `Ctrl+I` | zwiń–rozwiń lewy / prawy panel |
| `Ctrl+K` | wyszukiwarka poleceń i funkcji (wszystkie tryby) |
| klik obiektu przy schowanym inspektorze | inspektor otwiera się automatycznie |
| klik pozycji paska stanu | otwiera dolny panel na właściwej zakładce |
| `Esc` w panelu dolnym | chowa panel dolny |

## 4. Wymogi do kart zadań (E1 powłoka)

Karty E1 implementują: kontener trzech paneli z uchwytami i stanami zwinięcia; listwę ikon;
karty dokumentów + podział widoku; inspektor z zakładkami/akordeonem/pinezką; panel dolny;
przełącznik trybów na `mode-gate`; wyszukiwarkę poleceń; magazyn układu per użytkownik ×
przestrzeń. Testy: gramatyka §3, trwałość układu, reguła 2.1 (osiągalność funkcji per tryb),
responsywność (wąskie okno: panele boczne → nakładki wysuwane).
