# KARTA ZADANIA W1 — SEKCJA „KONTRAKT ANALIZY" W PANELU PRZEBIEGÓW (wygaszanie mostu, fala W1)

**Faza:** U4/U5 · **Plan:** `docs/uiux/PLAN_WYGASZANIA_MOSTU_WYNIKI.md` (fala W1)
· **Wykonawca:** Opus · **Warstwa:** frontend · **Wiążące:** CLAUDE.md (ZERO
fizyki; etykiety PL; granica SLD — kart mini-SLD NIE przenosimy, zostają
w wątku SLD).

## 0. Rozstrzygnięcia zarządcy (z rekonesansu)
Powierzchnie mostu E-29 (składowe symetryczne), E-34 (weryfikacja cieplna
i dynamiczna toru) i E-32? (zbieżność — ZWERYFIKUJ kod ekranu w routerze) to
CIENKIE panele `AnalysisContractPanel`
(`ui/workspace/WorkspaceSurfaceRouter.tsx:202` — dane z
`useAnalysisRunContract(runId)`; definicje wierszy fokusowych:
SymmetricalComponents:2396-2418, ThermalDynamic:2534-2553,
Convergence:2555-2575) + `MiniSldCard` (SLD — poza zakresem). Migracja W1 =
odwzorowanie treści kontraktowych w nowej powłoce; trasy legacy zostają do
fali W5 (zasada pokrycia 1:1).

## 1. Cel
Sekcja „Kontrakt analizy" w szczegółach przebiegu panelu przebiegów
(`ui2/spaces/obliczenia/przebiegi/SzczegolyPrzebiegu.tsx`): dla wybranego
przebiegu pokaż dane kontraktu (`useAnalysisRunContract` — reużyj istniejący
hook read-only; ZBADAJ jego moduł źródłowy i kształt danych) w trzech
grupach odpowiadających panelom mostu:
1) ogólne: typ analizy, ważność wyniku, wersja układu (snapshotRef),
   kompletność, zakres stosowalności;
2) założenia rozpływu/zbieżności: OLTC (transformer_tap_assumptions_ref);
3) założenia zwarciowo-sieciowe: uziemienie (grounding_assumptions_ref),
   stan łączników (switching_state_ref), temperatura
   (temperature_assumptions_ref), obciążenia (load_assumptions_ref),
   źródła (source_assumptions_ref).
Wartości brakujące → uczciwe „—"/opis PL (jak formatContractValue mostu —
odwzoruj semantykę, nie kopiuj kodu na ślepo). Etykiety PL 1:1 z mostem
(już są PL). Sekcja zwijana, domyślnie zwinięta w trybie podstawowym,
rozwinięta w zaawansowanym.

## 2. Zakres
1. Sekcja w `SzczegolyPrzebiegu.tsx` (+ strings + css modułu przebiegi);
   hook kontraktu reużyty bez zmian (import z jego modułu — jeżeli żyje
   w warstwie mostu, dopuszczalny import hooka/typów, ZERO importu
   komponentów mostu).
2. Aktualizacja `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` §4: wpis W1 (data, commit,
   zakres pokrycia; adnotacja że MiniSldCard pozostaje w wątku SLD).
3. Testy Vitest ≥ 8: sekcja renderuje trzy grupy z fixture kontraktu 1:1,
   braki wartości → „—", stany ładowania/błędu PL, zwijanie/tryby,
   istniejące testy panelu bez regresji.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8647, ZERO failed. Środowisko: symlink
node_modules (NIE commituj); pętla `until` przed pełnym vitest; pełny vitest
do pliku (usuń przed commitem); NIE edytuj src w trakcie; po biegu
NATYCHMIAST commit. Bramki (pipefail, z frontend/): type-check, lint
--max-warnings 0, PEŁNY npm test ZERO failed (twoje ≥8), guard:codenames;
z mv-design-pro: forbidden_ui_terms, ui_terminology, utf8_mojibake.
NIE dotykaj SLD ani plików mostu (tylko import hooka/typów). Commit:
`feat(ui2): sekcja kontraktu analizy w panelu przebiegów (W1)` BEZ push.
Raport standardowy (plik:linia).
