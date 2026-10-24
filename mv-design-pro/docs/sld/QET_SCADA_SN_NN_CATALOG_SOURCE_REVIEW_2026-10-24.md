# QET-SCADA Frame: biblioteka nN/SN i deterministyczne wyśrodkowanie

**Data:** 24.10.2026 · **Gałąź:** feature/qet-scada-frame-v1-20261024 · **PR:** #500 · **B-02:** ODRZUCONE.

## Decyzja właścicielska

**Nie używać generatorów obrazów do tworzenia symboli, atlasu ani ocen makiet.**

Wszystkie symbole są **kodem źródłowym** (SVG z istniejącego renderera CAD) i pochodzą wyłącznie z:

1. Zaakceptowanych wizualnie oryginałów QElectroTech .elmt (PR #499, 7 szt., licencja CC BY 3.0, oryginalne SHA).
2. Istniejącego `ELECTRICAL_CAD_SYMBOL_REGISTRY` (20 rodzin, odpowiedni status normatywny w rekordzie).
3. Elementów **bez geometrii** oznaczonych jako `WYMAGA_ZRODLA` lub `ZLOZENIE_ENM`. Nie wolno domalować ich z wyobraźni.

### Zmienione pliki

- `frontend/src/ui/sld/v3/cad/scada-frame/qetSymbolBounds.ts` — matematyczny obrys SVG bez DOM, zbiór geometrii OPEN/CLOSED i portów, ścisła walidacja ścieżek; wyśrodkowanie z marginesem.
- `frontend/src/qet-scada-frame-review-main.tsx` — siedem źródłowych QET używa stabilnej obwiedni w ramce 84×100 u, min. 12 u marginesu; zakładka „Katalog nN / SN”.
- `frontend/src/ui/sld/v3/cad/scada-frame/QetScadaCanvasGlyph.tsx` — rzeczywista kanwa `LvDomainView` wyznacza ramkę z pełnego obrysu po obrocie o 90°, bez sztucznego skracania `height * .64`; zaciski pozostają zakotwiczone w ENM.
- `frontend/src/ui/sld/v3/cad/scada-frame/sldSymbolLibraryCatalog.ts` — 73 rekordy do odbioru, w tym 38 pozycji z istniejącą geometrią (źródłowy QET lub obecny CAD), 16 brakujących źródeł i 19 złożeń ENM. Liczba pozycji NIE oznacza gotowych, normatywnie zweryfikowanych symboli.
- `frontend/src/ui/sld/v3/cad/scada-frame/SldSymbolLibraryAtlas.tsx` — przeszukiwalny rejestr nN/SN, filtry źródła, dwie pozycje łącznika, jawne blokady pustych pozycji; bez drugiego renderera.

### Zasady geometrii

Na podstawie `CadPrimitive` obliczamy obrys wszystkich odcinków, ścieżek, łuków, kół, oznaczeń i zacisków dla OBU położeń. Wektorowe przekształcenie jest wspólne dla całego glifu:

```ts
const scale = Math.min((frame.width - 2*padding) / bounds.width,
                       (frame.height - 2*padding) / bounds.height);
const x = frame.x + frame.width/2 - bounds.centerX*scale;
const y = frame.y + frame.height/2 - bounds.centerY*scale;
```

Gwarantuje to wyśrodkowanie obrysu i ustaloną ramkę przy zmianie stanu. Dla `LvDomainView` analogiczny obrys obliczany jest po przekształceniu do współrzędnych sceny; środki punktów QET zachowują połączenie z ENM.

Zatwierdzone kolory mechaniczne: **ZAMKNIĘTY `#F05260`** i **OTWARTY `#2CCF93`**. Żadnych stanów graficznych „nieznany”, „przejściowy”, alarmu ani blokady. Brak stanu = odmowa walidacji, brak ramki.

**Nie wolno stosować czerwono-zielonej ramki do źródła PV, transformatora, kabla, CT, VT ani bezpiecznika bez funkcji łączeniowej.** Tego typu elementy nie posiadają położenia mechanicznego łącznika.

## Dostępne do odbioru wyłącznie w uruchomionej aplikacji (nie obraz)

```text
/qet-scada-frame-review.html
```

Domyślna zakładka: oryginały 7 QET. Przycisk **Katalog nN / SN**: wyszukiwanie, kategorie, dwie pozycje łączników, jawne statusy źródła i puste miejsca wymagające importu.

W rzeczywistej kanwie nN (backendowe fixtury ENM):

```text
/lv-domain-harness.html?scenariusz=02_two_tr_qbc_open&lod=2&qetScada=1
/lv-domain-harness.html?scenariusz=03_two_tr_qbc_closed&lod=2&qetScada=1
```

Nie są to przebiegi solvera uruchomione w odpowiedzi na kliknięcie. Zestawy wyników K-S2 i walidacje topologii pozostają w backendzie.

## Testy kodu

- `qetSymbolBounds.test.ts`: wszystkie siedem definicji, stabilne ramki w obu położeniach i orientacjach, właściwy zapas od krawędzi, odrzucenie nieznanej komendy SVG.
- `sldSymbolLibraryCatalog.test.ts`: autentyczne odniesienia QET/CAD, brak ikon zastępczych i wyraźny podział elementów/złożeń.
- `qet-scada-frame-review.spec.ts`: pomiar położeń faktycznie renderowanych obiektów `<g>` względem ramek `<rect>`, bez sztucznych obrazów, plus przełączniki nN/SN i źródła.
- `qet-scada-lv-domain-projection.spec.ts`: oryginalne projekcje ENM z otwartym i zamkniętym sprzęgłem.

**ŻADNE TESTY nie mogą być oznaczone PASS do czasu ukończenia rzeczywistego CI.**

## Braki przed produkcją

- 16 pozycji bez zatwierdzonej geometrii musi zostać rzeczywiście pozyskanych, zaimportowanych i ocenionych.
- 19 złożeń (np. pola SN, RGnN 630/400 kVA, stacje, ZKSN) wymaga kompozycji aparatury zgodnej z fizyczną topologią ENM i standardami ENEA.
- Warianty QET `closed` pozostają `DRAFT` do potwierdzenia geometrii i zgodności normowej.
- Brak produkcyjnego obiegu kliknięcie → zmiana ENM → solver LF/SC → atomowy snapshot → SLD/White-Box. Brak dowodu = brak odbioru B-02.

**PR #500 pozostaje DRAFT, a produkcyjna opcja `qetScadaFrames` jest domyślnie wyłączona. Nie scalać bez decyzji właściciela.**
