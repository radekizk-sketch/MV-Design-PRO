# QET-SCADA Frame 1.0 — wzorzec komponentu, odbiór właścicielski

**Data:** 24.10.2026 · **Koncepcja graficzna:** zatwierdzona · **Warianty ruchomych styków:** do zatwierdzenia · **B-02:** ODRZUCONE.

## Decyzja projektowa

Zachowujemy źródłowe geometrie **7 symboli QElectroTech** z PR #499 i dodajemy czytelną **ramkę stanu mechanicznego**:

| Położenie | Ramka / geometria | Pozostałe dane |
|---|---|---|
| ZAMKNIĘTY | czerwona `#F05260`, styki połączone | Nie oznacza ani zasilenia, ani prądu |
| OTWARTY | zielona `#2CCF93`, widoczna przerwa | Obie strony aparatu mogą być pod napięciem |
| NIEZNANY | szara `#96AAB6`, przerywana + `?` | Brak pewnego położenia; nie pokazywać ostatniego stanu jako aktualnego |
| W PRZEŁĄCZANIU | bursztynowa `#FAB356` | Położenie docelowe ≠ osiągnięte |
| WYZWOLONY | ramka faktycznego położenia + znak alarmu `!` | Wyzwolony zamknięty = sprzeczność, stan NIEZNANY |
| ZABLOKOWANY | ramka faktycznego położenia + symbol `B` | Blokuje akcje symulacji; stan nie zmienia się |
| BEZPIECZNIK | **bez czerwonej/zielonej ramki łącznika** | Alarm `WKŁADKA PRZEPALONA`, nie da się „otworzyć bezpiecznika” |

Kolor nie stanowi jedynego nośnika. Druk mono i etykieta pod aparatem mają zachować informację.

## Implementacja na gałęzi

- `frontend/src/ui/sld/v3/cad/scada-frame/scadaFrameState.ts` — czysta funkcja rozstrzygająca.
- `frontend/src/ui/sld/v3/cad/scada-frame/QetScadaFrame.tsx` — nakładka SVG, **nie tworzy drugiego renderera CAD**.
- `frontend/src/ui/sld/v3/cad/CadSymbol.tsx` — wyłącznie dodatkowy eksport `CadPrimitiveLayer`, który wykorzystuje dotychczasowy `rysujPrymityw`.
- `frontend/src/ui/sld/v3/cad/scada-frame/qetPilotSourceGeometry.ts` — 7 oryginalnych geometrii wyprowadzonych z źródeł `.elmt`, udokumentowane SHA plików, autorskie propozycje zamknięcia **DRAFT**.
- `frontend/qet-scada-frame-review.html` i `frontend/src/qet-scada-frame-review-main.tsx` — własny ekran React, **lokalna demonstracja** 7 symboli.
- `frontend/src/ui/sld/v3/cad/scada-frame/__tests__/QetScadaFrame.test.tsx` — testy kontraktów.
- `frontend/e2e/qet-scada-frame-review.spec.ts` — kliknięcia i cztery zrzuty (ciemny/jasny × 1400×800 / 1000×700) po uruchomieniu.

Uruchomienie lokalnie: `cd mv-design-pro/frontend && npm ci && npm run dev`, następnie `http://127.0.0.1:5173/qet-scada-frame-review.html`.

**Licencja źródeł:** QElectroTech team / CC BY 3.0, por. `docs/sld/vendor/qet/ELEMENTS.LICENSE`. Nie używać jako danych do trenowania ML. Nie deklarować zgodności IEC 60617 bez porównania licencjonowanego wzorca.

## Granice demonstracji — bez fałszywego E2E

Stan ruchomego kontaktu dla trybu ZAMKNIĘTY jest **autorskim wariantem wymagającym zatwierdzenia**. Pierwotne źródło QET dostarcza tylko statyczny wariant OTWARTY. Nie przeskalowywać punktów przyłączeniowych ani nie dopowiadać funkcji elektrycznych na podstawie nazwy pliku.

Wersja demonstracyjna **nie zmienia ENM, nie wywołuje solverów i nie steruje rzeczywistą SCADA**. Klikanie służy WYŁĄCZNIE ocenie estetyki/ergonomii. Nie podszywać się pod realne funkcjonowanie.

Zasada integracji produkcyjnej:

```text
ENM/scenariusz (wersjonowany) -> stan aparatu (z jakością i pochodzeniem)
 -> funkcja ocenStanRamki -> osobne projekcje SLD: SN / nN
 -> CadPrimitiveLayer (rzeczywisty symbol QET)
 -> QetScadaFrame (nakładka)
 -> dane wyniku z tego SAMEGO scenariusza i wersji ENM
```

**K-S2:** wynik obliczeń jest aktualny tylko jeśli pasują identyfikator scenariusza, wersja ENM i skrót topologii. Same zgodne kolory nie są dowodem aktualności.

Niezależne kanały: mechanika, stan eksploatacyjny, pochodzenie (telemetria/ENM/symulacja), jakość, zasilenie, P/Q/I/U/Ik, alarm, blokada.

Wynik przebiegu symulacji nigdy nie jest prezentowany jako rzeczywista telemetria. Nie implementować rzeczywistych komend IEC 60870-5-104/61850 dla tej misji. Interfejs jest **czytnikiem** wyników i lokalnym inicjatorem odrębnego scenariusza.

## Bramki odbioru

1. Geometria OTWARTA 7/7 zachowana (weryfikacja przeciw źródłowym SVG), propozycje ZAMKNIĘTA ocenione przez właściciela.
2. Ramka opiera się na mechanicznym stanie, nie napięciu.
3. NIEZNANY/stary/nieprawidłowy = brak sugerowania położenia.
4. WYZWOLONY + ZAMKNIĘTY = konflikt.
5. Bezpiecznik bez fikcyjnych poleceń łączeniowych.
6. Porty QET nie mogą zmieniać współrzędnych przy zmianie stanu.
7. Zgodność ENM → SLD → solver → wyniki oraz przypadki wielobiegunowe — **nieukończone**, osobna bramka.
8. Komponenty produkcyjne `LvDomainView` i `SldCanvasV3` niezmienione przed decyzją.
9. Testy nie są zaliczone dopóki CI nie zwróci rzeczywistych PASS.

**B-02 nadal odrzucone.** Nie scalać przed odbiorem właścicielskim.
