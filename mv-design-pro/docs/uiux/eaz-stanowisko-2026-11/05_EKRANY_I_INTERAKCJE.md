# Interfejs: jeden ekran CAD/CAE EAZ, pełne czynności

**Bazowy układ z dwóch zrzutów pozostaje:** lewa kolumna pól/IED, centralny wykres i wyniki, prawa kolumna nastaw. Otwieranie nowych rodzin zabezpieczeń **przełącza narzędzie centralne i parametry**, a nie tworzy kilka niezależnych ekranów o innych zasadach nawigacji.

## 1. Układ 1440×900

**Górny wiersz kontekstu:**
\`Koordynacja zabezpieczeń\` | \`Pole SN 2 — Stacja S1\` | \`Bieg: 3F MAX / ...\` | \`Model rev.\` | \`Nastawy grupa 1 (zapisane/robocze)\` | \`Wyniki aktualne/nieaktualne\`.
Bez sprzeczności z dolnym globalnym paskiem biegów; jeśli bieg strony różni się od globalnego, pokaż oba identyfikatory.

**Lewa kolumna (ok. 210–250 px):**
- hierarchia GPZ → stacja → pole → IED/funkcja, nie duplikować tego samego urządzenia;
- przeszukiwanie nazw/oznaczeń, filtry \`wszystkie / z naruszeniami / bez oceny / zaznaczone\`, zaznaczenie;
- status nie jest wykrzyknikiem bez opisu; wiersz: nazwa pola, 50/51 lub typ, grupa, stan oceny, kod przyczyny;
- skrócone nazwy w wierszu, pełne w szczegółach; własne przewijanie listy;
- czynność \`Pokaż na schemacie\` z jedyną istniejącą ścieżką nawigacji i powrotem do wybranego wiersza.

**Centrum (elastyczne):**
- wiersz \`Podrzędne / Nadrzędne / zakres przypadku / rodzaj zwarcia\`;
- zawsze widoczny pasek liczb: \`I_CT,p\`, \`I_CT,n\`, \`t_p\`, \`t_n\`, \`Δt\`, \`Δt_wym\`, \`zapas\` + zakres werdyktu;
- poniżej TCC (oś X \(I\,[A]\), Y \(t\,[s]\), log/log) z siatką 1/2/5 lub podobną, własnymi kontrolkami \`Powiększ / Pomniejsz / Dopasuj do krzywych / Pełny zakres\`;
- legenda: 2–6 urządzeń (pierwsza para wyróżniona), funkcje tylko aktywne, granice obiektu jako warstwa wyboru; znaczniki prądów rzeczywistych CT i zwarcia odrębne;
- poniżej przewijane: \`Ocena wskazanego zwarcia\`, \`Ocena zakresu\`, \`Przypadki krytyczne\`, \`Przewidywana kolejność zadziałania\`, \`Podstawa obliczeń\`;
- kliknięcie na krzywej pokazuje \(I\), \(t\), aktywny stopień, IED, przekładnię, nastawy i źródło wyniku. Przeciąganie krzywej opcjonalnie tylko z aktywnym trybem edycji i walidacją rzeczywistej zmiany nastawy w backendzie.

**Prawa kolumna (280–320 px):**
- \`Sterownik pola — [realny producent/model]\`, \`CT [ratio, rdzeń]\`, \`Przyłączony wyłącznik [Q0]\`;
- grupa nastaw 1–4 wg możliwości urządzenia, status i wersja; wybór jednostek A pierw./A wt. dla każdego progu, bez zmiany fizycznego znaczenia;
- sekcje \`51\`, \`50\`, potem \`51N/67N/87T...\` wg właściwej funkcji; pola min/max/step/units/description;
- \`Zapisz nastawy\` dostępne, komunikat o wymaganych danych i dowód przeliczenia; przy różnicach \`Porównaj z zapisanymi\`, \`Przywróć\` i \`Zastosuj do nowego wariantu\`;
- \`Porównanie z innym zabezpieczeniem\` pokazuje konkretną relację elektryczną, nazwę oraz położenie CT. Szczegóły bez otwierania dodatkowego okna.
- Oddzielny scroll, nie podnosić dolnego przycisku ponad widok przez ukryty overflow.

## 2. 1280×720 — bez utraty funkcji

- Zachować 3 kolumny tylko jeżeli środkowy wykres ma użyteczną szerokość; prawa kolumna może być zwijanym inspektorem z natywnym przyciskiem \`Nastawy\`, lewa zwijana \`Pola\`. Nie zmniejszać tekstu poniżej przyjętych 8 px. Docelowo funkcjonalnie wszystkie czynności dostępne bez poziomego paska całej strony.
- Stały pasek \`Δt, wymagany, zapas\` nad wykresem, nie pod spodem. Zawartość sekcji szczegółowej przewijana.
- Lista \`Porównaj z\` musi mieścić się w prawym panelu; długie nazwy są skracane na powierzchni, pełne przy otwarciu listy.
- Maksymalizacja wykresu korzysta z istniejącego shell, nie otwiera drugiej strony.
- Kontrola: można wybrać pole, zmienić grupę, edytować nastawę, uzyskać nowy wynik i powrócić do SLD bez przewijania całej aplikacji w poziomie.

## 3. Tryby analizy w JEDNYM stanowisku

Centralna sekcja otrzymuje podwidoki:
- \`50/51 — Nadprądowe fazowe\`: TCC, próg, czas, selektywność.
- \`50N/51N — Ziemnozwarciowe nadprądowe\`: TCC, \(3I_0\), warunki uziemienia, czułość.
- \`67/67N — Kierunkowe\`: charakterystyka kierunkowa / kąt fazowy, \(U_0\), \(I_0\), kierunek i brak polaryzacji.
- \`Admitancyjne — G_0/B_0/Y_0\`: płaszczyzna admitancji z obszarem działania, rzeczywiste fazory i konwencja.
- \`87T — Różnicowe\`: \(I_{diff}/I_{bias}\), obszar zadziałania, blokady, pomiar CT obu stron.
- \`50BF/LRW — Rezerwa wyłącznikowa\`: schemat czasowy pobudzenie → trip → kontrola prądu/styku → trip rezerwy.
- \`27/59/59N/81U/81R, SCO\`: progi i czas, przebiegi napięcia/częstotliwości wyłącznie jeśli odpowiedni bieg to obsługuje; stopnie SCO i SPZ po SCO wyłącznie gdy aktywne.
- \`Ocena całej sieci\`: wykaz krytycznych punktów, ochrona zasadnicza i rezerwowa, mapa na SLD, analiza zakresu.
Każdy podwidok obsługuje jedną rodzinę funkcji i tę samą nawigację, a nie dodatkowe osobne „stanowisko”.

## 4. Interakcje i dostępność

- Zmiana scenariusza lub grupy unieważnia ocenę zależną od tej zmiany; ujawnić „ocena w trakcie / historyczna / aktualna”.
- Kliknięcie w wiersz wyniku -> odpowiednia krzywa i marker; kliknięcie w krzywą -> właściwe IED/funkcja; kliknięcie \`Pokaż na SLD\` -> rzeczywisty obiekt w modelu; powrót zachowuje filtry, zoom TCC, punkt, grupę i zaznaczenie.
- Klawiatura i dostępność: focus visible, tab, aria/tekst alternatywny do kolorów, kontrast nie tylko kolor, czytelność obu motywów.
- Kolor: turkus = wybrana krzywa, fiolet = porównywana, neutralny = inne; czerwony = stwierdzone naruszenie, bursztynowy = wymagająca uwagi granica/nieaktualność, szary = brak oceny. Sam wybrany prąd lub funkcja nie jest alarmem.
- Wynik i status nie powstają z heurystyki frontendowej; UI tylko prezentuje kod oceny, jednostki i pochodzenie.

## 5. Wydruki i dokumentacja

- Eksport „Karta nastaw” (wydanie/wersja, CT/VT, IED, funkcje, min/max/step/units, aktywna grupa, data, autor), „Ocena koordynacji” (zasięg, scenariusze, punkty krytyczne, tabelaryczne prądy CT, czasy i \(\Delta t\), źródło kryterium), TCC SVG/PDF/DOCX w istniejących ścieżkach, bez kolejnego generatora raportów;
- Bezpodstawne sformułowanie „zgodne z IEC 60255” jest niedopuszczalne; wskazać dokładny aspekt i dokument, a jeśli nie zweryfikowano pełnego tekstu, status niepotwierdzony;
- Przy eksporcie zawsze informować, czy pracowano na nastawach roboczych czy zapisanych. Eksport historyczny musi mieć rzeczywistą rewizję.

## 6. Teksty zakazane / właściwe

Nie stosować: \`niepełny\`, \`pełny wywód\`, \`Pełny LaTeX\`, \`trace\`, \`unsupported\`, \`selectivity pass\`, \`Raw\`, \`fix settings\` w interfejsie. Stosować: \`Nie obliczono czasu wyłączenia dla pola... z powodu...\`, \`Podstawa obliczeń\`, \`Zabezpieczenie podrzędne\`, \`Zabezpieczenie nadrzędne\`, \`Wymagany odstęp czasowy\`, \`Oceniono 12 z 15 przypadków; 3 nieocenione z powodu...\`. Angielskie nazwiska producentów i nazwy własne produktów mogą pozostać nazwami własnymi.
