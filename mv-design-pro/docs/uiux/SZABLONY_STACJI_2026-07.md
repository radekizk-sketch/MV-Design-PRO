# BIBLIOTEKA SZABLONÓW STACJI — TAKSONOMIA I PRZEGLĄDARKA (2026-07)

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (epik E3, okno W-203)
**Data:** 2026-07-15 (dyrektywa właściciela: „szablonów stacji musi być więcej i grupowane w logiczne typy")
**Stan faktyczny (zweryfikowany, 2026-09-17 — karta SZABLONY-ROLA-A, V12T-016 zamknięty):**
backend ma bibliotekę **73+ szablonów w 15 kategoriach**
(`backend/src/application/station_templates/` — typowe SN/nn, słupowe ZSP, ZKSN wnętrzowe z RMU,
prosument PV, farmy PV, BESS, hybrydowe PV+BESS, przemysłowe, wiatrowe, sekcyjne, GPZ 110/SN,
rozdzielnie sieciowe RS/RSM, stacje abonenckie SN z pomiarem, kompensacja mocy biernej, rezerwa
zasilania) z API podglądu i zastosowania (`/api/station-templates`, preview/apply, pełna
edytowalność). Rola A (poprzednio licznik zero), reszta roli C i reszta roli E (§1 tabela) mają
teraz pełne pokrycie kategorii — delta backendowa §4 zrealizowana. Przeglądarka (`ui2/spaces/
model/szablony`) pokazuje wszystkie 5 ról z drzewkiem A–E (`GrupyRol.ts`).

---

## 1. Taksonomia docelowa — 3 poziomy grupowania logicznego

**Poziom 1 — rola w sieci** (główne zakładki przeglądarki) → **Poziom 2 — typ konstrukcyjny**
(kategoria) → **Poziom 3 — wariant** (moc / liczba pól / typ rozdzielnicy / opcje).

| Rola w sieci | Typy (kategorie) | Stan |
|---|---|---|
| **A. Zasilanie sieci** | GPZ 110/SN (2-sekcyjny, układ H5, mostek); rozdzielnia sieciowa RS/RSM | istnieje (`GPZ_110_SN` 3, `ROZDZIELNIA_SIECIOWA` 3 — zamknięte kartą SZABLONY-ROLA-A, V12T-016) |
| **B. Dystrybucja SN/nn** | miejska wnętrzowa (przelotowa / odgałęźna / końcowa); kontenerowa; ZKSN wnętrzowa z RMU; słupowa ZSP (wieś, 50–400 kVA) | istnieje (typowe, zksn, słupowe) |
| **C. Odbiorcze** | abonencka SN z układem pomiarowym; przemysłowa (rozdzielnia zakładowa) | istnieje (przemysłowe 5; `STACJA_ABONENCKA` 4 — zamknięte kartą SZABLONY-ROLA-A) |
| **D. Źródła i magazyny (OZE)** | prosument PV; farma PV (blok inwerterowy + TR blokowy); wiatrowa; BESS; hybrydowa PV+BESS | istnieje (5 kategorii) |
| **E. Specjalne** | sekcyjna (łącznik sieciowy); kompensacja mocy biernej (bateria kondensatorów / dławik); rezerwa zasilania (agregat / UPS / SZR) | istnieje (sekcyjne 3; `KOMPENSACJA` 3 — bateria kondensatorów, bez dławika; `REZERWA_ZASILANIA` 3 — pole rezerwowe, bez agregatu/UPS — zamknięte kartą SZABLONY-ROLA-A) |

**Cel liczbowy:** ≥ 80 szablonów (57+ istniejących + delta A/C/E). Nowe szablony powstają w tym
samym module backendu, tym samym schematem danych (`StationTemplate`), z pełnym kompletem danych
(zasada „zero pustych pól" — `SPEC_KREATORY_2026-07.md` Z1).

## 2. Wymogi na każdy szablon (bez wyjątków)

1. **Komplet danych:** transformator(y), rozdzielnica SN (lista pól z aparatami), strona nn
   (odpływy), pomiary (przekładniki), zabezpieczenia z nastawami wstępnymi, uziemienie —
   wszystko z typów katalogowych; po zastosowaniu gotowość bez blokad.
2. **Miniatura jednokreskowa** (schemat pól) — generowana deterministycznie, widoczna w kaflu.
3. **Opis zastosowania PL** („kiedy użyć"): gęstość odbiorów, teren, typ sieci, moc.
4. **Parametry edytowalne** wystawione w kreatorze (istniejący mechanizm editable schema).
5. **Etykiety wyłącznie po polsku** (MODEL_INTERAKCJI §2.7); identyfikator szablonu = szczegół techniczny.

## 3. Przeglądarka szablonów w kreatorze (rozszerzenie okna W-203)

- **Układ:** drzewko ról A–E (poziom 1–2) po lewej → kafle wariantów z miniaturą, mocą,
  liczbą pól i opisem zastosowania → panel szczegółów (pełny schemat pól + lista aparatów).
- **Filtry:** moc transformatora, napięcie, liczba pól SN, opcje (prosument / pomiar / SZR).
- **Porównanie:** zaznacz 2 szablony → tabela różnic (pola, aparaty, koszt względny).
- **Gramatyka:** klik = podgląd w panelu; 2× klik = „Zastosuj i edytuj" (operacje domenowe
  przez istniejące apply); prawy klik = menu (porównaj / pokaż wymagania danych / dokumentacja).
- **Rekomendacja kontekstowa:** przeglądarka podpowiada grupę na podstawie miejsca wstawienia
  (segment magistrali wiejskiej → słupowe; szyna nn z PV → prosument/hybrydowe) — podpowiedź,
  nigdy przymus.

## 4a. Szablony użytkownika (dyrektywa „na max" 2026-07-15)

Inżynier może zapisać dowolną skonfigurowaną stację (w tym zmodyfikowany gotowiec) jako
**własny szablon**: „Zapisz jako szablon…" → nazwa PL + opis zastosowania + przypisanie do
grupy A–E. Szablony użytkownika żyją w bibliotece projektu (eksportowane z archiwum ZIP)
z opcją awansu do biblioteki organizacji. W przeglądarce oznaczone jako „własne", w pełni
równoprawne (miniatura, filtry, porównanie, apply). Wymaga delty backendowej: zapis definicji
szablonu z modelu (odwrotność apply) — karta E3, ten sam schemat `StationTemplate`.

## 4. Delta backendowa (karty E3, w granicach programu)

Dodanie kategorii A/C/E to rozszerzenie ISTNIEJĄCEGO modułu szablonów (nowe pliki kategorii
w `templates/`, wpisy w rejestrze kategorii) — bez zmian solverów i Result API. Szablony GPZ
mają dodatkowy wymóg: definiują sekcje szyn i pole sprzęgła zgodnie z kanonem operacji
domenowych. Każda nowa kategoria = karta zadania z listą wariantów, kompletem danych
katalogowych i testami (apply → gotowość bez blokad → zwarcia+rozpływ przechodzą).
