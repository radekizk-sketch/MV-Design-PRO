# KARTA KRE-1 — KREATOR „DODAJ TRANSFORMATOR SN/nN” NA FRAMEWORKU ui2

**Priorytet:** wysoki (pierwszy port po flagowcu) · **Etap flow:** E2 (budowa modelu)
· **Wykonawca:** Opus (worktree) · **Wiążące:** CLAUDE.md; `docs/uiux/KREATORY_STANDARD_2026-07.md`
(procedura §3, kontrakt §2); precedens: `ui2/kreatory/zrodlo/KreatorZrodloZasilania`.

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **Zakres:** operacja domenowa `add_transformer_sn_nn` (legacy `AddTransformerForm`
   + ewentualny shared `TransformerStationEditor`) przechodzi na framework kreatorów
   ui2 metodą Opcja 1. **Kontrakt operacji domenowej BEZ ZMIAN** — payload przenieś
   1:1 do modułu modelu (`ui2/kreatory/transformator/transformatorModel.ts`), tak jak
   `zrodloModel` przeniósł payload GPZ. RECON w KROK 0: przeczytaj `AddTransformerForm.tsx`,
   `shared/TransformerStationEditor.tsx`, `catalogPayload`/`catalogFirstRules`, końcówkę
   podglądu prądów transformatora (`transformer-rated-currents-preview`, jeśli formularz
   jej używa) i wynik zanotuj w raporcie (kontrakt payload + pola).
2. **Nowy moduł** `ui2/kreatory/transformator/`: `KreatorTransformator.tsx` (kontener:
   kontekst→dane, submit przez `executeDomainOperation` + `validateCatalogFirst`),
   `transformatorModel.ts` (czysta logika: dane, walidacja, payload, gotowość, formatery),
   `strings.ts`, `index.ts`, testy. Prezentacja WYŁĄCZNIE na `../rama`
   (`KreatorRama`, `KreatorSekcja`, `KreatorSiatka`, `Pole*`, `KreatorGotowosc`,
   `KreatorPodsumowanie`, `KreatorNastepnyKrok`) — tokeny `--mvd-*`, ZERO klas scada-*,
   ZERO twardych heksów.
3. **Kontrakt ekranu prowadzącego** (STANDARD §2): cel jednym zdaniem (po co
   transformator, z czego dobierany, co daje); katalog-first (typ z katalogu
   transformatorów SN/nN — parametry Sn/uk/grupa z katalogu, nie z wpisu); uczciwe
   stany braków; podsumowanie liczbowe (prądy znamionowe/ Ik po stronie nN itd.)
   WYŁĄCZNIE z backendu jeśli istnieje końcówka — inaczej pokaż tylko dane katalogowe;
   lista gotowości; następny krok (np. dodaj pola nN / obciążenia). ZERO fizyki w UI.
4. **Podmiana dostawcy:** `operationFormRegistry.add_transformer_sn_nn = KreatorTransformator`;
   `operationSurfaceRegistry` componentName → `'KreatorTransformator'`. Kanon poza
   componentName NIETKNIĘTY.
5. **Retirement:** usuń `AddTransformerForm.tsx` (+ shared editor jeśli nie ma innych
   konsumentów — SPRAWDŹ grepem) i osierocone testy; **przenieś intencję** do
   `transformatorModel.test.ts` (kontrakt payload/walidacja) + `KreatorTransformator.test.tsx`
   (realna ścieżka: render → katalog → natywny zapis → operacja domenowa), Zero-Debt §5.
   Zaktualizuj barrel `forms/index.ts` i ewentualne mocki w testach powłoki.

## 1. Bramki
KROK 0: fetch+reset (HEAD zawiera tę kartę). Standard frontendowy: type-check;
lint --max-warnings 0; PEŁNY vitest ZERO failed (do pliku po pętli `until`);
guard:codenames; venv D2vgvUMQ: `ui_no_physics_guard`, `ui_terminology_guard`,
`forbidden_ui_terms_guard`, `utf8_mojibake_guard`, `dead_click_guard`,
`v12xx_canon_guard` = 0. ZERO zmian `enm/**`, solverów, kanonu poza componentName,
`ui/sld/**`; ZERO nowych końcówek. Commit BEZ push:
`feat(ui2): kreator „Dodaj transformator SN/nN\" na frameworku (KRE-1)`.
Raport: plik:linia; kontrakt payload (co przeniesione 1:1); mapowanie pól ENM→UI;
lista usuniętych sierot + gdzie przeniesiono intencję testów; komplet bramek.
