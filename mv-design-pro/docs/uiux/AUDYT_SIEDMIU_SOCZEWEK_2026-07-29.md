# AUDYT SIEDMIU SOCZEWEK + PROJEKT ŁAŃCUCHA (2026-07-29)

**Status:** materiał wejściowy przebudowy (mandat §5: audyt PRZED przebudową, nie po).
**Podstawa pomiarowa:** osobiste przejście FLOW E1–E8 na realnym stosie (zrzuty:
`docs/audit/visual/flow-nadzor/`), inwentarz wszystkich kreatorów/ekranów/przestrzeni
zweryfikowany w KODZIE (nie w dokumentach), pełny bieg e2e (275/20/2), zielone bramki
zrzutów obu motywów. Zarzut właściciela („ekrany nieprzemyślane, od pierwszego do
ostatniego klika oderwane od siebie") — **potwierdzony pomiarem i nazwany co do mechanizmu**.

---

## 0. Diagnoza centralna — jeden mechanizm, wiele objawów

Aplikacja ma dwa równoległe światy pamięci: **store'y sesji przeglądarki** (Zustand,
częściowo persystowane w localStorage) i **stan serwera** (projekty, przypadki, przebiegi,
wyniki, model). Łańcuch pracy działa wyłącznie tak długo, jak długo żyje sesja, w której
został wykonany. Po ponownym wejściu:

| Ekran | Co mówi | Prawda serwera |
|---|---|---|
| Obliczenia | „Brak przypadków obliczeniowych", „Przypadków: 0" | przypadek istnieje, jest AKTYWNY (chip u góry!) |
| Obliczenia | „Brak aktywnego przypadku z historią przebiegów" | 2 przebiegi DONE |
| Wyniki → Zwarcia | „Brak wyniku zwarciowego do wyświetlenia" | bieg SC_3F DONE, legacy go wyświetla |
| Pasek statusu | „Model: rew. 12 · Przebieg: — · Odcisk: —" | rewizja 13, przebieg istnieje |

**To nie jest N osobnych usterek — to jedna zasada architektoniczna, której brakuje:**
przestrzeń po wejściu ma się HYDRATOWAĆ z serwera (aktywny przypadek → lista przypadków →
ostatni przebieg → wyniki), a nie zakładać, że ktoś wcześniej kliknął we właściwej kolejności.
Dopóki to nie stanie, każdy nowy ekran (w tym znacznik świeżości z V12K-265/266) będzie
„wpięty i niewidoczny", bo droga, którą dane mają na niego dojechać, istnieje tylko in-session.

## 1. Soczewka: projektant sieci (E1→E8 jako całość)

- **Działa:** budowa modelu od katalogu end-to-end (GPZ → magistrala → stacja → katalogi →
  gotowość zielona → biegi DONE); bramka gotowości mówi „możesz liczyć"; pulpit projektu
  prowadzi dalej; mutacja modelu poprawnie podbija rewizję i hash.
- **Zerwane:** (a) zimny start — patrz §0; (b) deep-link po biegu `#analysis?run=` ląduje
  na powierzchni legacy zamiast w warsztacie ui2 (użytkownik ma DWA różne ekrany wyników
  zwarć, każdy z innym wyglądem i innym zestawem akcji); (c) pierwsze wejście świeżego
  użytkownika: pusta powłoka bez sekwencji „załóż projekt → warunki OSD → model";
  (d) sprzeczne prawdy w pasku (chipy liczone z innych źródeł niż treść przestrzeni).
- **Martwe stany zerowe:** „Uruchom obliczenie zwarciowe (IEC 60909), aby zobaczyć…" —
  bez przycisku. Stan zerowy ma być instrukcją Z AKCJĄ (FLOW §0.3c) — tu jest tablicą
  informacyjną.

## 2. Soczewka: zwarciowiec

- Ekran wzorca zwarć (scena) trzyma poziom: pełny bilans IEC 60909 (Rk/Xk/Zk, X/R, κ,
  I²t), rozbicie wkładów, ślady WHITE BOX. Legacy ekran „Analizy techniczne" pokazuje
  te same liczby inną powierzchnią — **dwa źródła prezentacji jednej prawdy** do wygaszenia.
- e2e: `zwarcia-rozplyw-screenshot` (tabela rozpływu zwarciowego, tor Thevenina + maszyny)
  padał w obu motywach — do triażu jako możliwy dryf treści względem asercji bramki.
- Brak w łańcuchu: z wyniku zwarciowego nie ma przejścia do weryfikacji wytrzymałości
  aparatu (ta logika siedzi… w UI legacy `validateDeviceWithstand` — fizyka w UI, patrz
  raport nadzoru) ani do nastaw zabezpieczeń.

## 3. Soczewka: zabezpieczenia

- **E-28 Koordynacja** ma krzywe TCC/CTI i nastawy, ale: wejście wyłącznie przez hub
  „Pozostałe analizy" (2 poziomy w głąb), **nastawy nie mają wykonawcy** (brak zapisu do
  ENM, brak `usePoprawWModelu`) — werdykt braku selektywności prowadzi do przycisku,
  który pokazuje, ale nie zapisuje.
- Kreatory pomiaru (CT/VT) i przekaźnika — jedyne wejście z ukrytego ProcessPanel;
  menu kontekstowe pola SN (`configure-protection`) prowadzi do ekranu E-11 zamiast
  do kreatora. Łańcuch „pole → CT/VT → przekaźnik → koordynacja" istnieje w danych,
  ale nie w nawigacji.
- **EkranLom**: statusy pól bez akcji naprawczej (brak przejścia do nastaw pola).

## 4. Soczewka: rozdzielnie / stacje

- Kreator stacji, pola SN, transformatora, magistrali — OGNIWA z wieloma wejściami
  (menu SLD, karty, ProcessPanel) i realnym „następnym krokiem" w magistrali
  (`scheduleNextOperationForm` — jedyny kreator z prawdziwym łańcuchowaniem; wzorzec
  do skopiowania).
- **Pierścień wtórny:** krok domknięcia (`connect_secondary_ring_sn`) praktycznie
  nieosiągalny z kanwy (tylko ProcessPanel); NOP ma 4 wejścia. Pół-ogniwo o dużym
  ciężarze inżynierskim (układy pierścieniowe to codzienność SN).
- Pole nN — jedyny write-path przez ProcessPanel.

## 5. Soczewka: katalogi / Reference Engine

- Katalog-first realnie działa: budowa bez katalogu blokowana, readiness dociska
  wiązania, `assign_catalog_to_element` ma 7 żywych wejść + naprawy z bramki gotowości.
- **Wyjątek zaprzeczający regule:** `DEVICE_WITHSTAND_CATALOG` — katalog RÓWNOLEGŁY
  zaszyty we froncie (protection-catalogs.ts) z własną fizyką werdyktu, podczas gdy
  backendowy odpowiednik (`validateDeviceWithstandApi`) istnieje i nie jest używany.
- Trzy kreatory katalogowe są WYSPAMI (patrz §7-lista) — katalog ma pozycje
  (kompensatory, ograniczniki, agregaty/UPS), których nie da się użyć z żywego UI.

## 6. Soczewka: przyłączenia / OZE

- Najlepiej domknięty kreator systemu: `KreatorZrodlaOze` (katalog → dobór toru →
  auto-bieg → macierz NC RfG → wniosek). Macierz i Wniosek są OGNIWAMI z prawdziwym
  odbiorcą (dokumenty OSD).
- **Systemowa słabość strumienia OZE:** 8 z 11 ekranów wyników OZE to PÓŁ-OGNIWA —
  werdykt jest, odbiorcy nie ma: Zdolność/Ranking nie prowadzą do wyboru punktu
  przyłączenia w kreatorze; Krzywe/Obszar PQ nie zasilają nastaw źródła; FRT nie
  raportuje do `ncRfgStore` (macierz go nie widzi); OSD-odpowiedź nie zapisuje nastaw;
  **Kompensacja** ma wzorowe wejście (deep-link z bilansu Q z preselekcją węzła), ale
  jej odbiorca — kreator kompensatora — jest wyspą. Pętla „wynik → decyzja → model"
  w OZE jest przerwana w ośmiu miejscach tym samym wzorcem (`onOtworzDowod={() => undefined}`).

## 7. Soczewka: UX / IA

- **3 WYSPY twarde** (pełny kreator + backend, zero wejścia z żywego UI):
  `KreatorKompensatoraSn`, `KreatorOgranicznikaSn`, `KreatorZrodloDyspozycyjne` —
  wszystkie przez martwy `EngineeringContextMenu` (nierenderowany) + martwe zaplecze
  (`actionMenuBuilders`, `actionRouting`, `CreatorToolbar`).
- E-29…E-32: cztery porządne ekrany analiz odkrywalne WYŁĄCZNIE kartą huba
  (nieobecne w zakładkach warsztatu Wyników).
- Mieszanka motywów: powierzchnie legacy (scada-dark) renderują się ciemne w motywie
  jasnym — użytkownik przechodzi między światami wizualnymi wewnątrz jednego zadania.
- `EkranCoWymagaUwagi` obiecuje „wszystkie problemy w jednym miejscu", czyta tylko rozpływ.

---

## 8. PROJEKT ŁAŃCUCHA (nie ekranów)

Zasada nadrzędna: **projektujemy przepływ danych i decyzji, ekrany są przystankami.**
Kontrakt ekranu prowadzącego (FLOW §0.3) obowiązuje bez zmian; poniżej to, co między ekranami.

### 8.1 Kręgosłup: hydratacja przestrzeni (karta H-0, PRZED wszystkim innym)
Jedna reguła dla całej powłoki: wejście do przestrzeni = odtworzenie kontekstu z serwera.
- `projekt` → lista projektów + aktywny projekt; `obliczenia` → przypadki projektu +
  przebiegi aktywnego przypadku; `wyniki` → ostatni przebieg per typ analizy dla aktywnego
  przypadku (`useWpiecieWynikow` dostaje ścieżkę zimnego startu); pasek statusu → rewizja
  z `GET /enm` (nie z pamięci).
- Definition of done: test e2e „restart po biegu": zbuduj → policz → **nowy kontekst
  przeglądarki** → Wyniki pokazują bieg, pasek pokazuje rewizję i odcisk. Dziś ten test
  jest czerwony z definicji — to jest właściwa bramka przebudowy.
- Dopiero po H-0 znacznik świeżości (V12K-265/266) stanie się widoczny i weryfikowalny.

### 8.2 Jedno lądowisko wyników (karta H-1)
`#analysis?run=` oraz wszystkie „pokaż wyniki" prowadzą do warsztatu ui2 (właściwa
zakładka wg typu analizy). Powierzchnia legacy „Analizy techniczne" przestaje być
lądowiskiem (zostaje mostem do czasu wygaszenia, bez wejść z nowych ścieżek).

### 8.3 Pętla decyzji domknięta tam, gdzie jest urwana (karty H-2…H-4)
- H-2: nastawy E-28 dostają wykonawcę (zapis do ENM przez operację kanoniczną
  + unieważnienie wyników + powrót do koordynacji po przeliczeniu).
- H-3: OZE — osiem pół-ogniw dostaje po JEDNEJ akcji wyjściowej (Zdolność/Ranking →
  preselekcja węzła w KreatorZrodlaOze; Kompensacja → KreatorKompensatoraSn po jego
  ożywieniu; FRT → wpis do ncRfgStore; OSD → zapis nastaw jako wariant).
- H-4: trzy wyspy dostają wejścia w ŻYWYM menu SLD (`SLD_MENU_REGISTRY`): kompensator
  na szynie SN, ogranicznik na polu, agregat/UPS na rozdzielnicy nN; martwe zaplecze
  (`EngineeringContextMenu`, `actionMenuBuilders`, `actionRouting`, `CreatorToolbar`)
  do usunięcia w tej samej karcie.

### 8.4 Stany zerowe z akcją (karta H-5)
Audyt wszystkich `Brak…` w ui2: każdy stan zerowy dostaje przycisk wykonujący
pierwszy krok instrukcji (wzorzec: bramka gotowości). Zaczynając od Wyniki→Zwarcia
(„Uruchom obliczenie" = realny start biegu SC dla aktywnego przypadku).

### 8.5 Jedna prawda w chromie (karta H-6)
Chipy paska („Wyniki: brak", „Przypadków: N") liczone z TEGO SAMEGO źródła, które
zasila przestrzenie (po H-0: serwer). Zakaz dwóch liczników jednej wielkości.

### Kolejność i bramki
H-0 → H-1 → (H-2, H-3, H-4 równolegle) → H-5 → H-6. Po każdej karcie: zrzuty obu
motywów na stałej stronie oceny + test e2e zimnego startu jako regresja stała.
Wygaszanie mostów (model/schemat/wyniki-część/dokumentacja-część) NIE wchodzi do tej
kolejki — najpierw łańcuch, potem wymiana powierzchni (FLOW §2 pozostaje mapą priorytetów).
