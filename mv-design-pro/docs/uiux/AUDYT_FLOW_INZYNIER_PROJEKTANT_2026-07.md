# AUDYT ZESPOŁU EKSPERTÓW — czego potrzebuje inżynier analiz i projektant w całym FLOW (2026-07-21)

**Status:** WIĄŻĄCY dokument programowy (dyrektywa właściciela 2026-07-21:
„przeprowadź audyt zespołu ekspertów czego potrzebuje w interfejsie inżynier
analiz i projektant w całym flow, uzupełnij"). Podporządkowany kanonowi V12.xx
i `FLOW_PROJEKTANTA_2026-07.md`. Braki → uzupełniane end-to-end (dyrektywa #4),
zero fabrykacji (dyrektywa #3): kontrolka bez pokrycia backendu jest zakazana.

## 0. Metoda

Wielosoczewkowy przegląd (dyrektywa #5) **dwóch person** przez **cały łańcuch
pracy E1–E8** (FLOW §1). Każdy brak jest GRUNTOWANY dowodem w kodzie (ścieżka),
nie wyobrażony. Priorytet = ból persony na etapie, nie wiek kodu.

**Persony:**
- **IA — Inżynier analiz:** konfiguruje i uruchamia obliczenia (LF/SC/zabezpieczenia/
  OZE), interpretuje wyniki per obiekt, produkuje dowody WHITE BOX, porównuje warianty.
- **PS — Projektant sieci:** buduje model z katalogów, podejmuje decyzje projektowe
  (dobór kabla/kompensacji/nastaw), iteruje model wg wyników, domyka dokumentację.

**Soczewki eksperckie** (PROGRAM_UIUX §3): profesor energetyki (IEC), specjalista
OZE/NC RfG, specjalista analiz sieciowych, projektant stacji, specjalista
zabezpieczeń, audytor WHITE BOX, projektant sieci end-to-end, UX/IA.

## 1. Stan pokrycia per etap (grunt)

| Etap | Pokrycie ui2 (dowód) | Ocena |
|---|---|---|
| E1 Projekt/wejście | `spaces/projekt/PulpitProjektu` + kafle | ◐ — kafle „Bilans przyłączeniowy"/„Postęp wg celu" = **stan „wkrótce"** (`KafelWkrotce.tsx`), brak warunków przyłączenia (Sk″/U/cosφ) jako jawnego wejścia |
| E2 Model | 10 kreatorów (`kreatory/**`), SLD v3, `spaces/model/{Wlasciwosci,ZgodnoscReferencyjna}` | ✅ dobry |
| E3 Gotowość | `spaces/gotowosc/PanelGotowosci` (blokery/ostrzeżenia + akcje) | ✅ dobry |
| E4 Obliczenia | `spaces/obliczenia` (przypadki + przebiegi) | ✅ dobry |
| E5 Wyniki | rozpływ/zwarcia/jakość/koordynacja/dowód/porównanie/estymacja/ssci/odbior + hub analiz | ✅ szeroki |
| E6 Decyzje | świeżość (`freshness/`), nastawy (E-27), **pętla wynik→model (F-E6.1)** | ◐ — pętla wpięta tylko w rozpływ; brak akcji kontekstowych |
| E7 Zgodność OZE | strumień OZE (studium/wniosek/OSD/zdolność/macierz NC RfG/FRT…) | ✅ dobry |
| E8 Dokumentacja | hub F-E8.1/8.2 (raport/dowód/archiwum/studium) | ◐ — brak cyklu życia dokumentu + BOM (F-E8.3 backend) |

## 2. Znaleziska (rejestr braków, gruntowane) — priorytet malejąco

| # | Persona | Brak (co boli) | Dowód | Priorytet | Dyspozycja |
|---|---|---|---|---|---|
| **A1** | IA | **Brak skonsolidowanego „Co wymaga uwagi"** — przekroczenia są rozproszone per zakładka (rozpływ osobno, zwarcia osobno…). Inżynier nie widzi WSZYSTKICH problemów sieci w jednym miejscu z akcją naprawczą. | Werdykty `WartoscKomorki.ostrzezenie` liczone per adapter, brak agregatora | **KRYTYCZNY** | Rejestr przekroczeń „Co wymaga uwagi" w przestrzeni Wyniki: zbiera ostrzeżenia ze wszystkich zakończonych analiz + „Popraw w modelu" per pozycja (rozszerza F-E6.1). **← UZUPEŁNIONE (patrz §4)** |
| **A2** | IA | Pętla decyzji wpięta tylko w rozpływ (F-E6.1); jakość/zgodność nie prowadzą z werdyktu do modelu. | `TabelaSzyn/Galezi` mają `onPoprawWModelu`, reszta nie | wysoki | **← UZUPEŁNIONE (F-E6.2, V12K-099).** Wpięte w Jakość (walidacja energetyczna — typ z `check_type`; migotanie — Bus) i Zgodność powykonawczą (pomiar U → Bus). Zwarcia BEZ pętli (kontrakt SC nie niesie werdyktu przekroczenia — brak `ostrzezenie`, byłby phantom). Wzorzec `TabelaWynikow` +predykat `wierszDecyzyjny` (agregat systemowy `target_id=network` bez elementu → brak martwego przycisku). |
| **A3** | IA/PS | Akcja pętli jest OGÓLNA („przejdź do modelu"); nie prowadzi do WŁAŚCIWEGO konfiguratora (ΔU→dobór odcinka, przeciążenie→dobór kabla, miskoordynacja→nastawy). | `usePoprawWModelu` robi tylko selekcję+nawigację do „Schemat" | średni | F-E6.3: akcja kontekstowa per rodzaj przekroczenia (mapowanie werdykt→operacja). |
| **B1** | PS | E1: warunki przyłączenia i dane OSD (Sk″, U, wymagany cosφ, tryb pracy) nie mają jawnego kroku wejściowego — kafel „wkrótce". | `KafelWkrotce.tsx` (Bilans przyłączeniowy / Postęp wg celu) | wysoki | F-E1: krok „Warunki przyłączenia" na pulpicie (wymaga pola danych OSD w modelu/nagłówku — recon backendu). |
| **B2** | PS | Bilans mocy przyłączeniowej (moc przyłączeniowa vs zainstalowana OZE) brak — kluczowy dla wniosku OSD. | `KafelWkrotce` „Bilans przyłączeniowy" | wysoki | F-E1/E7: bilans z realnego backendu (moc źródeł/odbiorów + limit OSD). Recon: czy backend liczy? jeśli nie — rozbudowa (osobny krok). |
| **C1** | IA | Dowód WHITE BOX osiągalny z zakładki „Dowód", ale nie ZAWSZE 1 klik z konkretnej liczby wyniku na wielu ekranach. | `WartoscKomorki.dowodRef` + 2×klik (wzorzec) — zależny od adaptera | niski | Domknąć `dowodRef` w adapterach bez pokrycia (przemiar). |
| **D1** | PS | Brak jawnej informacji o unieważnieniu wyników PO zmianie modelu w miejscu zmiany (jest FreshnessBadge na ekranie wyniku, ale nie na kanwie/modelu). | `freshness/` na ekranach wyników | niski | Rozważyć znacznik świeżości w pasku aktywnego przypadku (poza tą turą). |

## 3. Werdykty soczewek (sign-off stanu)

- **Analiz sieciowych:** ekrany wyników szerokie i czytelne (wzorzec `EkranAnalizy`),
  porównania A/B obecne. Największy ból: **brak jednego miejsca z listą przekroczeń**
  (A1) — inżynier iteruje po zakładkach. Po uzupełnieniu A1 — OK.
- **Zabezpieczeń:** koordynacja I-t (E-28) + nastawy (E-27) obecne; brak prowadzenia
  z miskoordynacji do nastaw (A3).
- **Projektant end-to-end:** łańcuch E2→E8 spójny; słabe wejście E1 (B1/B2) — projekt
  zaczyna się „w środku", bez jawnych warunków OSD.
- **OZE/NC RfG:** strumień kompletny; studium wpięte do huba (F-E8.2). OK.
- **Audytor WHITE BOX:** dowód dostępny; drobne luki `dowodRef` (C1).
- **UX/IA:** pętla decyzji (F-E6.1) domyka ergonomię iteracji; rozszerzyć (A2/A3).

## 4. Uzupełnienie wykonane w tej turze (dyrektywa #4 — nie „na potem")

**A1 (KRYTYCZNY) — „Co wymaga uwagi": skonsolidowany rejestr przekroczeń** (V12K-098):
nowa zakładka w przestrzeni Wyniki (`ui2/wyniki/co-wymaga-uwagi`, pierwsza w grupie
„Analizy sieci") zbierająca werdykty przekroczeń w jedną, znormalizowaną listę
(`Przekroczenie`), każda pozycja z akcją „Popraw w modelu" (reużycie
`usePoprawWModelu`, F-E6.1: selekcja + zoom SLD + przejście do „Schemat"). Uczciwe
stany zerowe rozróżnione (FLOW §0): brak zakończonego przebiegu ≠ „sieć w normie".
ZERO fizyki, ZERO fabrykacji — czyta gotowe werdykty adapterów, nie liczy progów.

**Zakres źródeł (uczciwość, dyrektywa #3):** rejestr konsoliduje analizy trzymające
wynik w SYNCHRONICZNYM store — bieżąco **rozpływ mocy** (`usePowerFlowResultsStore`):
szyny z napięciem poza normatywnym przedziałem (`napiecePozaZakresem`, ten sam
werdykt co adapter tabeli szyn — spójność ekran↔rejestr). Analizy pobierane
asynchronicznie per ekran (jakość/zwarcia — `fetch…` on-demand) NIE są zgadywane:
gdy ich wynik trafi do store (kolejka §5, A2), dokłada się kolejny kolektor
`przekroczenia*` i konkatenuje w `useRejestrPrzekroczen` (architektura rozszerzalna,
nie wyspa). Testy: `co-wymaga-uwagi/__tests__/{model,EkranCoWymagaUwagi}.test.tsx`.

## 5. Kolejka uzupełnień (pozostałe — zarejestrowane, nie ciche)

1. ~~**A2** F-E6.2 — pętla decyzji w pozostałych ekranach wzorca.~~ **✅ UZUPEŁNIONE (V12K-099).**
2. **B1/B2** F-E1 — warunki przyłączenia + bilans mocy (recon backendu → rozbudowa jeśli brak).
3. **A3** F-E6.3 — akcje kontekstowe per rodzaj przekroczenia (ΔU→dobór odcinka, przeciążenie→dobór kabla, miskoordynacja→nastawy).
4. **C1/D1** — domknięcie `dowodRef` + znacznik świeżości w pasku przypadku.

Priorytet realizacji wg bólu: A1 (✅) → A2 (✅) → B1/B2 → A3 → C1/D1.
