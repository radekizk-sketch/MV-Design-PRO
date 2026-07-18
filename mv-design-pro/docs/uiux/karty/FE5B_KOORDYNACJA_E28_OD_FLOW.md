# KARTA ZADANIA F-E5b — KOORDYNACJA ZABEZPIECZEŃ E-28: REALNA STRONA ZAMIAST ATRAPY

**Epika:** FLOW PROJEKTANTA §2 poz. 1 (F-E5) · **Etap flow:** E5/E6 ·
**Wykonawca:** Opus (worktree) · **Wiążące:** CLAUDE.md; FLOW §0 (V12K-041 —
legacy nie jest wzorcem, kanon = zdolności); wzorce: EkranAnalizTechnicznych
(rama prowadząca), F-E5a (podmiana dostawcy + componentKey), R3 (zdolności
API koordynacji potwierdzone reconem).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. **Stan zastany (dwa grzechy):** kanoniczny E-28 (i E-27 — zweryfikuj
   zdolność w rejestrze) renderuje `ProtectionCoordinationSurface`
   (`WorkspaceSurfaceRouter.tsx:2197`) = ATRAPA: dwie demonstracyjne krzywe
   liczone w UI (`generateIec60255SiCurvePoints` z `routerPureHelpers.ts:73`
   — fizyka IEC 60255 w prezentacji, nieobjęta R3). RÓWNOCZEŚNIE istnieje
   PEŁNA realna strona `ui/protection-coordination/ProtectionCoordinationPage.tsx`
   z klientem `api.ts` (runCoordinationAnalysis / getCoordinationResult /
   getTCCData / getCoordinationTrace / getSensitivity/Selectivity/Overload
   Checks / eksporty PDF/DOCX — `POST/GET /api/protection-coordination/...`)
   — **bez żadnego renderera produkcyjnego** (grep konsumentów pusty).
2. **Kierunek:** dostawcą E-28 zostaje REALNA strona, opakowana w cienką ramę
   prowadzącą ui2 `ui2/wyniki/koordynacja/EkranKoordynacji.tsx` (kontrakt FLOW
   §0.3): nagłówek celu („Dobór nastaw i selektywność zabezpieczeń
   nadprądowych: werdykty par PASS/MARGINAL/FAIL, marginesy CTI i krzywe
   czasowo-prądowe — z przebiegu zwarciowego i biblioteki zabezpieczeń."),
   stan zerowy bez projektu/przebiegu zwarciowego → uczciwa instrukcja
   z akcjami (`setActiveSpace`), poniżej `<ProtectionCoordinationPage/>`
   (RECON propsów: skąd projectId — jeśli strona czyta store, nie dubluj;
   jeśli wymaga propsa, podaj z `useAppStateStore.activeProjectId`).
   NIE przebudowuj wnętrza strony (to działająca implementacja z testami) —
   rama prowadząca + wiring + spójność motywu (jeżeli strona ma zaszyte
   ciemne/jasne klasy łamiące motyw — TYLKO zamiany klas wg reguły TM2,
   zero zmian logiki).
3. **Usunięcie atrapy i fizyki:** `ProtectionCoordinationSurface` (router)
   + `generateIec60255SiCurvePoints` (`routerPureHelpers.ts`) USUŃ po
   sprawdzeniu konsumentów (jeśli TimeCurrentChart tylko rysuje punkty
   z props — zostaje; generator znika; testy generatora usuń/przenieś
   intencję do testów backendowych JEŚLI istnieją — NIE dopisuj fizyki).
   Router: `case 'E-28'` (i `'E-27'` jeżeli zdolność tożsama — RECON
   `screenCanonRegistry` E-27 vs E-28; jeżeli E-27 to INNA zdolność,
   zostaw mu dotychczasowego dostawcę i odnotuj) → `<EkranKoordynacji/>`.
   `componentKey` → `'EkranKoordynacji'` (metadana, precedens F-E5a).
4. **Zero fabrykacji:** żadnych demo-danych; puste stany uczciwe (brak
   urządzeń/nastaw → instrukcja co skonfigurować). Werdykty/marginesy/krzywe
   wyłącznie z API.
5. Testy Vitest ≥ 8 (kliki natywne): rama celu, stan zerowy z akcją,
   render strony przy kompletnym kontekście (mock fetch 1:1 z kontraktem
   `api.ts`), podmiana dostawcy w routerze (aktualizacja asercji z intencją),
   brak regresji testów strony koordynacji (istnieją w
   `protection-coordination/__tests__/`).

## 1. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera tę kartę). node_modules symlink; pełny vitest
do pliku po pętli `until`; kody bezpośrednio; po biegu NATYCHMIAST commit
i raport. Bramki: type-check; lint --max-warnings 0; PEŁNY vitest ZERO failed
(baza 8878 ± wg zmian testów); guard:codenames; z mv-design-pro (venv
D2vgvUMQ): v12xx_canon_guard (KRYTYCZNY), forbidden_ui_terms, ui_terminology,
utf8_mojibake, dead_click, ui_no_physics = 0. ZERO zmian: backend, `enm/**`,
`ui/sld/**`, kanon poza componentKey. Commit BEZ push:
`feat(ui2): koordynacja zabezpieczeń E-28 — realna strona z ramą prowadzącą
zamiast atrapy (F-E5b)`. Raport: plik:linia, rozstrzygnięcie E-27, los
generatora i konsumentów, komplet bramek.
