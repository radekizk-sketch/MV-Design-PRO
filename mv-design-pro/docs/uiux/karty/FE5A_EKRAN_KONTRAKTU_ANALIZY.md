# KARTA ZADANIA F-E5a — EKRAN KONTRAKTU ANALIZY OD FLOW (dostawca E-29…E-34)

**Epika:** FLOW PROJEKTANTA §2 poz. 1 (F-E5) · **Etap flow:** E5 Interpretacja
wyników · **Wykonawca:** Opus (worktree) · **Wiążące:** CLAUDE.md; FLOW §0
(zasady twarde: NIE przenosimy starego ekranu — projektujemy od potrzeby
inżyniera; kanon = zdolności, `componentKey` = metadana dostawcy, V12K-041);
wzorzec wizualny i kodowy: `ui2/wyniki/analizy/` (EkranAnalizTechnicznych —
tokeny --mvd-*, skala promieni 10/8/999, chipy, sekcje, strings/model/css/testy).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **Przedmiot:** sześć ekranów kanonicznych E-29/E-30/E-31/E-32/E-33/E-34
   dziś renderuje `ThinContractSurface` (`ui/workspace/WorkspaceSurfaceRouter.tsx`
   — skonsolidowany W5b-4: `MiniSldCard` + `AnalysisContractPanel` z wierszami
   kontraktu). To legacy W WYGLĄDZIE (Tailwind przez remap) i BEZ prowadzenia.
   Zdolność (kanon): pokazać KONTRAKT analizy danego obszaru — wiersze fokusowe
   per ekran (`THIN_CONTRACT_SURFACES` — tytuły/eyebrow/wiersze/flagi to
   źródło parytetu ZDOLNOŚCI, nie wzorzec wyglądu).
2. **NOWY moduł ui2:** `ui2/wyniki/kontrakt-analizy/` (EkranKontraktuAnalizy +
   model + strings + css + testy). Kontrakt ekranu prowadzącego (FLOW §0.3):
   - nagłówek: tytuł obszaru (PL, z konfiguracji per kod ekranu) + JEDNO
     zdanie celu inżynierskiego (napisz per obszar — po co ta analiza,
     z czego czyta; wzoruj na opisach kart huba `GRUPY_ANALIZ`),
   - stan wejścia: gdy brak aktywnego przebiegu → uczciwy stan zerowy
     z akcją „Przejdź do obliczeń" (`useShellStore.setActiveSpace`), NIE pusta
     tabela „Do konfiguracji",
   - sekcja WIERSZE KONTRAKTU: te same dane co dziś (hook
     `useAnalysisRunContract` z `ui/workspace/analysisRunContract.ts` +
     `formatContractValue` — REUŻYCIE read-only bez zmian, jak fale W1–W3;
     wiersze fokusowe per ekran = parytet 1:1 z `THIN_CONTRACT_SURFACES`),
     w siatce klucz→wartość w tokenach --mvd-*; wartości brakujące jako
     zwykły stan „Do konfiguracji" z chipem, bez udawania danych,
   - sekcje warunkowe (założenia/pochodzenie/reprodukowalność) per flagi
     ekranu — parytet flag z konfiguracji W5b-4,
   - „następny krok": łącze powrotu do huba analiz (czyści powierzchnię jak
     pasek powrotu `MostAnalizTechnicznych`) + tam gdzie obszar ma pełne okno
     ui2 (E-30 zbieżność → zakładka rozpływu? NIE — bez fabrykowania: TYLKO
     powrót do huba; pełne okna analiz to przyszłe karty).
3. **Podmiana dostawcy (Opcja 1, jak E-26):** router `case 'E-29'…'E-34'` →
   `<EkranKontraktuAnalizy surface={surface} />` (props: kod ekranu z surface);
   `THIN_CONTRACT_SURFACES`/`ThinContractSurface` USUŃ z routera po podmianie
   (konfigurację przenieś do nowego modułu ui2 jako źródło danych ekranu);
   `screenCanonRegistry.componentKey` dla sześciu kodów →
   `'EkranKontraktuAnalizy'` (metadana dostawcy — precedens E-26, V12K-041).
   Kanon (label/area/testId/transitions/coverageMatrix) NIETKNIĘTY.
   `MiniSldCard` w tych ekranach: NIE przenoś (kontekst schematu daje hub
   i przestrzeń Schemat; ekran kontraktu ma być czysty) — odnotuj w raporcie
   jako świadomą decyzję karty (zdolność podglądu SLD pozostaje w E-35/hubie).
4. Testy Vitest ≥ 10 (kliki natywne): render per kod ekranu (6 tytułów +
   zdania celu), stan bez przebiegu z akcją (klik → obliczenia), wiersze
   fokusowe 1:1 dla min. dwóch ekranów (mock kontraktu jak w testach W1–W3),
   flagi sekcji warunkowych, powrót do huba, brak regresji testów routera
   (zaktualizuj asercje z W5b-4 na nowego dostawcę Z INTENCJĄ w komentarzu).

## 1. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera tę kartę). node_modules symlink; pełny vitest
do pliku po pętli `until`; kody bezpośrednio; po biegu NATYCHMIAST commit.
Bramki: type-check; lint --max-warnings 0; PEŁNY vitest ZERO failed
(baza 8863 + Twoje ≥10 − ewentualnie zdjęte asercje W5b-4); guard:codenames;
z mv-design-pro (venv D2vgvUMQ): v12xx_canon_guard (KRYTYCZNY exit 0),
forbidden_ui_terms, ui_terminology, utf8_mojibake, dead_click, ui_no_physics
= 0. ZERO zmian: backend, `enm/**`, `ui/sld/**`, kanon poza `componentKey`.
Commit BEZ push: `feat(ui2): ekran kontraktu analizy od flow — dostawca
E-29…E-34 (F-E5a)`. Raport: plik:linia, tabela parytetu wierszy per ekran,
decyzja MiniSldCard, komplet bramek.
