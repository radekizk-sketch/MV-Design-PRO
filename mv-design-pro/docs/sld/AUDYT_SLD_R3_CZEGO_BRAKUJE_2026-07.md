# Audyt SLD — runda R3: „czego na schemacie brakuje"

**Data:** 2026-07-26 · **Zadanie:** #76 (audyt powykonawczy SLD) · **Rejestr:** V12K-214
**Autor:** Fable (osobiście — zadanie jakościowe, opcja MAX)
**Poprzednie rundy:** `AUDYT_POWYKONAWCZY_SLD_2026-07.md` (R1/R2/R2b)

## Metoda

Rundy R1/R2 pytały „czy to, co narysowane, jest poprawne". Ta runda pyta odwrotnie:
**czego na rysunku NIE MA, choć model to niesie**. Metoda jest pomiarowa, nie oględzinowa —
sonda `frontend/scripts/sonda_inwentarz_sld.mjs` zestawia inwentarz sceny L2 (symbole,
etykiety, styl odcinków) z inwentarzem modelu ENM sieci wzorcowej 52 stacji, plus oględziny
kadrów 1:1 w trzech miejscach diagnostycznych rysunku technicznego (narożnik z ramką, pas
legendy, pas tabelki).

Rozróżnienie kluczowe dla werdyktów niżej: **defekt rysunku** (dane są w modelu, rysunek ich
nie używa) vs **brak danych** (model ma pole, sieć wzorcowa go nie wypełnia — wtedy bramka
mierzy pustkę i przechodzi trywialnie).

## Pomiar

Scena L2: 14 rodzajów symboli (196 junction, 173 earthSwitch, 119 cableHead,
118 loadBreakSwitch, 54 transformer2W, 53 fuseSwitch, 20 loadArrow, 8 derPv, 8 derBess,
4 disconnector, 4 derWind, 3 breaker, 3 currentTransformer, 1 gridSource), 8 rodzajów
etykiet (1135 sztuk), 689 odcinków toru pierwotnego.

Model: 315 szyn (261 × 15 kV, 53 × 0,4 kV, 1 × 110 kV), 260 gałęzi, 54 transformatory,
20 odbiorów, 20 generatorów, 1 źródło. Puste: `measurements` (0), `protection_assignments`
(0), `bays` (0), szyny z `grounding` (0/315).

## Znaleziska

### Z1 — brak kodowania poziomów napięcia kolorem · DEFEKT RYSUNKU · waga: krytyczna

**Pomiar:** wszystkie **689 odcinków toru pierwotnego mają styl `(brak)`** — zero informacji
o kolorze czy grubości. Model niesie **trzy poziomy napięcia**: 110 kV, 15 kV (261 szyn),
0,4 kV (53 szyny).

Poziom napięcia to pierwsza informacja, jakiej projektant szuka na schemacie, i w każdym
narzędziu klasy przemysłowej (PowerFactory, ETAP, rysunki OSD) koduje się ją **kolorem**.
Tutaj strona 110 kV, magistrala 15 kV i 53 szyny 0,4 kV są jedną, nieodróżnialną zielenią.
Około 1/6 sieci (nN) zlewa się ze SN.

Scena ma wprawdzie 55 etykiet `busbar-voltage`, ale to nie zastępuje koloru z dwóch powodów:
etykiet jest 55 na 315 szyn, a przy pełnym widoku sieci tekst ma 2 px (karta R2-B) — więc
informacja jest formalnie obecna i praktycznie nieczytelna. Kolor działa na każdym zoomie
i nie wymaga czytania.

### Z2 — stan łącznika nie istnieje w scenie · DEFEKT RYSUNKU · waga: krytyczna

**Pomiar:** żadne pole symbolu ani odcinka nie koduje stanu łącznika — sonda przeszła
wszystkie klucze `meta` symboli i wszystkie klucze odcinków szukając `open|status|closed|
position|dash`: **wynik ZERO**. Zbiór glifów to `disconnector, breaker, earthSwitch,
loadBreakSwitch, fuseSwitch` — **bez wariantów stanu**. Model niesie `status: closed|open`
na `BranchBase`, a sieć wzorcowa ma realnie jedną gałąź otwartą
(`sw/97895176…/switch`) — która na rysunku nie ma nawet własnego odcinka.

Na schemacie jednoliniowym stan łączników jest informacją pierwszorzędną: rozłącznik otwarty
rysuje się z rozwartym stykiem, i na tym opiera się czytanie schematu ruchowo. Tu 118
rozłączników, 173 uziemniki i 3 wyłączniki wyglądają identycznie niezależnie od stanu.

Dwie konsekwencje praktyczne. Projektant nie widzi, **gdzie sieć jest rozcięta** — dla sieci
SN pracującej promieniowo z rezerwowaniem to dyskwalifikujące. Oraz: **uziemnik zamknięty
wygląda jak otwarty**, a to już kwestia bezpieczeństwa, nie estetyki.

### Z3 — punkt normalnie otwarty (NOP) nieoznaczony · DEFEKT RYSUNKU · waga: wysoka

Domena zna NOP — operacja `set_normal_open_point` jest wdrożona (zadanie G-RING). Rysunek
nie oznacza go w żaden sposób. Uwaga metodyczna: 13 etykiet trafia w wzorzec „otwarty", ale
to `port-caption` **„koniec otwarty"** — opis końca magistrali bez kontynuacji, zupełnie inna
rzecz niż punkt rozcięcia pierścienia. Werdykt „brak" stoi.

Z1 rozwiązuje się razem z Z2: NOP to szczególny przypadek stanu łącznika, ale wymaga
**własnego oznaczenia** (w praktyce OSD: symbol rozwarty + opis „NOP"), bo nosi intencję
ruchową, a nie tylko stan chwilowy.

### Z4 — brak tabelki rysunkowej · BRAK · waga: wysoka (blokuje dokumentację)

Oględziny 1:1: rysunek ma **ramkę** i **legendę symboli** (lewy dolny róg — istnieje,
poprawna), ale prawy dolny róg jest **pusty**. Pomiar potwierdza: zero etykiet z numerem
rysunku, rewizją, skalą, datą.

Bez tabelki (PN-EN 61082-1 / ISO 7200: tytuł, numer rysunku, rewizja, skala, data,
projektant, sprawdzający) rysunek nie jest dokumentem projektowym — a repozytorium ma eksport
PDF/DOCX i Hub Dokumentacji, więc ten rysunek ma trafiać do dokumentacji.

### Z5 — brak uk% na tabliczce transformatora · DEFEKT RYSUNKU · waga: średnia

Tabliczka pokazuje moc (MVA), przekładnię (110/20 kV) i grupę połączeń (Yd11) — **bez
napięcia zwarcia**. Model ma `uk_percent: 11.0` wprost na transformatorze.

uk% rozstrzyga o prądzie zwarciowym za transformatorem i o rozdziale obciążenia między
jednostkami pracującymi równolegle — na tabliczce SLD to dana standardowa. Klasyczna
zdolność bez odbiorcy: wartość jest w modelu, liczy z niej solver, rysunek ją pomija.

### Z6 — sposób pracy punktu neutralnego nieokreślony · BRAK DANYCH + brak odbiorcy · waga: wysoka

Model ma `GroundingConfig` na szynie (izolowany / dławik Petersena / uziemiony bezpośrednio /
przez rezystor), ale sieć wzorcowa nie wypełnia go **ani raz** (0/315 szyn), a rysunek nie ma
symbolu punktu neutralnego.

Dla sieci 15 kV to nie ozdoba: sposób pracy punktu neutralnego rozstrzyga o prądzie zwarcia
doziemnego, o doborze zabezpieczeń ziemnozwarciowych i o dopuszczalnych napięciach dotyku.
Na schemacie GPZ symbol punktu neutralnego (z dławikiem lub rezystorem) rysuje się zawsze.

### Z7 — warstwa zabezpieczeniowa niesprawdzona na realnej sieci · DŁUG POMIAROWY · waga: średnia

Kod ma pełną warstwę adnotacji zabezpieczeń z bramkami §17.5, §18.3, §20.1, §20.4. Na sieci
wzorcowej wszystkie mierzą **pustkę**: `measurements: 0`, `protection_assignments: 0`, więc
raporty brzmią „okręgi=0 mierniki=0 tory=0 luki=0" i przechodzą **trywialnie**. Scena ma 3
przekładniki CT przy 3 wyłącznikach, zero numerów funkcji (50/51/67), zero przekładni CT.

Bramka, która nie ma czego mierzyć, nie chroni niczego. Dopóki sieć wzorcowa nie ma
przypisań zabezpieczeń i przekładników, cała ta warstwa rysunku jest bez pokrycia
regresyjnego — mimo czterech pozornie zielonych bramek.

## Co audyt potwierdził jako poprawne

- **Legenda symboli** istnieje i jest kompletna względem użytych glifów.
- **Ramka rysunku** ze znacznikami podziałki na krawędziach.
- **Dane gałęzi** obecne: typ/przekrój przewodu (mm²), długość odcinka — 37 etykiet
  `segment-span`, 12 `segment-lateral`.
- **Dane systemu zasilającego** (Sk″) obecne przy źródle.
- **Tabliczki transformatorów** z mocą, przekładnią i grupą połączeń (brak tylko uk%, Z5).
- **Odbiory i generacja** spójne z modelem: 20 `loadArrow` na 20 odbiorów,
  8 PV + 8 BESS + 4 wiatr na 20 generatorów.
- **Pola stacji** generowane z topologii (171 etykiet `field-role`) przy `bays: 0` w modelu —
  sylwetki pól nie wymagają ręcznego wypełniania.

## Rekomendowana kolejność naprawy

| Karta | Znalezisko | Zakres | Zależność |
|-------|-----------|--------|-----------|
| R3-1 | Z2 + Z3 — stan łącznika + NOP | glify wariantowe (5 rodzajów) + przeniesienie `status` do sceny + oznaczenie NOP | brak |
| R3-2 | Z1 — kolor poziomów napięcia | paleta napięć + przypisanie do odcinków wg szyny | wymaga decyzji o palecie |
| R3-3 | Z6 — punkt neutralny | symbol + wypełnienie sieci wzorcowej | brak |
| R3-4 | Z4 — tabelka rysunkowa | blok tabelki + źródło danych projektu | wymaga decyzji o zakresie pól |
| R3-5 | Z5 — uk% na tabliczce | jedna dana do istniejącej tabliczki | brak |
| R3-6 | Z7 — pokrycie warstwy zabezpieczeń | wypełnienie sieci wzorcowej + odkłamanie bramek | po R3-1 |

R3-1 przed R3-2, bo stan łącznika jest informacją ruchową (bezpieczeństwo), a kolor —
orientacyjną. R3-5 jest najtańsza i można ją dołączyć do dowolnej karty.

## Dług zapisany

Z7 oznacza, że cztery bramki warstwy zabezpieczeniowej są dziś **zielone bez pokrycia**.
Do czasu R3-6 nie wolno ich traktować jako dowodu poprawności tej warstwy — to jest
dokładnie wzorzec „test maskujący defekt produktu" z Zero-Debt pkt 5, tylko w wersji
łagodniejszej: test nie maskuje defektu, ale też nie potwierdza jego braku.
