# HANDOFF — plan i specyfikacja kontynuacji (2026-07-22, wieczór)

**Status: WIĄŻĄCY. Adresat: KAŻDY agent kontynuujący tę pracę w nowej sesji,
bez dostępu do historii rozmowy. Wykonuj BEZ ZADAWANIA PYTAŃ — wszystkie
rozstrzygnięcia produktowe są w §2. Jedyny dopuszczalny powód zatrzymania:
konflikt z kanonem V12.xx (wtedy wpis do REJESTR_KONFLIKTOW i stop).**

Gałąź robocza: `claude/power-network-design-ui-ir91mv` (repo radekizk-sketch/MV-Design-PRO).
Zawsze: `git fetch origin claude/power-network-design-ui-ir91mv` i pracuj na jej czubku.
NIGDY nie pushuj na inną gałąź. Commity ze stopką dokładnie:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KyqX3x2UY6tyGCiMhNbA3u
```

---

## §1 STAN NA MOMENT PRZEKAZANIA

### 1.1 Zamknięte i wypchnięte (nie ruszać, tylko kontekst)
- Fala „POZIOM EKSPERTA" (V12K-124…126): kody E-29…E-34 mają realnych dostawców;
  moduł `ui2/wyniki/kontrakt-analizy` WYGASZONY; 9 kreatorów ui2 zastąpiło legacy.
- Dowody wizualne (V12K-127, 134): 26+11 PNG w `docs/audit/visual/flow-ekspert/`.
- Delty zatwierdzone przez właściciela — WYKONANE: z1/z2/z0 addytywnie w FROZEN
  (V12K-128), show-results z preselekcją (V12K-129), szereg czasowy stabilności
  (V12K-130), pulse+menu DER (V12K-131), rozpływ Thevenina WHITE BOX (V12K-132),
  strzałki wielokawałkowe (V12K-133).
- Program **SCHEMAT-10** (V12K-135): kanon w
  `docs/sld/PROMPT_RUNDA_SCHEMAT_10_2026-07.md` (defekty D1–D12 + §0bis) i
  `docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` (przyczyny źródłowe per plik,
  **MACIERZ PRAWDY LOD §3** — bramkuje każdą implementację, §5 fazy S1–S5).
  Fazy i statusy: `docs/plan/PLAN_SLD_REWORK.md` §0.
  **S1 SCALONA** (jedna kotwica LOD, jeden słownik, footprint per LOD; test
  „JEDNA KOTWICA"; zrzuty `docs/audit/visual/schemat-10/s1-l{0,1,2}.png`).

### 1.2 W LOCIE w chwili przekazania — NAJPIERW TO DOMKNIJ
Dwóch wykonawców pracowało w worktree'ach (`/home/user/MV-Design-PRO/.claude/worktrees/agent-*`):
- **S2 (silnik etykiet)** i **S3 (tokeny kolorów + sekcje + GPZ)** — pełne karty
  z zakresem i bramkami: §3.2 i §3.3 poniżej (są samowystarczalne).

**Procedura odzysku pracy wykonawcy (sprawdzona — tak odzyskano S1):**
1. `git worktree list` — dla każdego worktree `agent-*`: `git -C <ścieżka> log --oneline -2`
   i `git -C <ścieżka> status --short`.
2. Jeśli jest commit „SCHEMAT-10 S2…"/„SCHEMAT-10 S3…" → NIE zlecaj od nowa:
   zweryfikuj bramki fazy (komendy w §4) na cherry-picku do gałęzi głównej.
3. Jeśli worktree ma tylko zmiany bez commita lub nic → wykonaj fazę wg §3.2/§3.3
   samodzielnie lub zleć nową kartę (szablon §5).
4. Konflikty przy cherry-pick S2×S3 spodziewane w `ui/sld/v3/scene/buildScene.ts`
   — rozwiązuj zachowując OBIE funkcje (silnik etykiet Z S2 + tokeny/sekcje Z S3);
   po scaleniu OBU: pełna weryfikacja łączna (§4) przed pushem.
5. Po scaleniu: wpis rejestru (procedura §6), status w PLAN_SLD_REWORK §0 → ✅,
   push, usuń worktree (`git worktree remove --force <ścieżka>`).

---

## §2 ROZSTRZYGNIĘCIA PRODUKTOWE — ZAMKNIĘTE, NIE PYTAĆ PONOWNIE

| # | Decyzja | Treść |
|---|---------|-------|
| R1 | D11 motyw kanwy | Kanwa na ekranie ZAWSZE SCADA-dark (tokeny z `docs/sld/DARK_SCADA_NEON_THEME_SPEC.md` jako baza); JASNY wariant techniczny wyłącznie w EKSPORCIE/wydruku (S4). Właściciel odrzucił pytanie o to — decyzja domyślna przyjęta, odwracalna tylko jego słowem. |
| R2 | LOD | 3 poziomy `SceneLod` 0/1/2, nazwy: L0 „Przegląd sieci", L1 „Widok operatorski", L2 „Stacje i aparatura". Słownik v2 zdeprecjonowany (S1). Macierz prawdy LOD (audyt §3) jest JEDYNĄ prawdą zawartości poziomów. |
| R3 | Zoom | Ciągłość tożsamości: kotwica stacji i oś magistrali identyczne na każdym LOD (test „JEDNA KOTWICA" musi być zielony zawsze). |
| R4 | Kolizje etykiet | ZERO kolizji tekst-tekst i tekst-symbol, mierzone AUTOMATYCZNIE (wyrocznia S2); przegrany priorytet NIE renderuje się zamiast nachodzić. |
| R5 | Gęstość | Typ kabla ≤1× na korytarz na L1; pełne parametry tylko L2. L0: wyłącznie S-id + nazwa korytarza 1×. |
| R6 | Język | 100% PL w treściach kanwy; wartości ENUM nigdy surowo (słownik PL). |
| R7 | Fizyka/kontrakty | Zero fizyki w UI; FROZEN nietknięte; sankcje solvera przez SANCTIONED_CHANGES w solver_boundary_guard (wpisy V12K-120/128/132 do USUNIĘCIA dopiero po scaleniu gałęzi do main). |
| R8 | Goldeny SLD | Wymiana goldenów = świadoma, JEDEN commit z listą i uzasadnieniem per plik; nigdy hurtowo bez listy. |
| R9 | Funkcje kanwy | Nic nie ginie: overlaye (moc/zwarcia/OLTC), strzałki kierunku (w tym wielokawałkowe), znacznik pulse, menu kontekstowe (w tym DER), selekcja/centrowanie, edycja CAD, wiązanie kreatorów, deep-linki. Macierz parytetu w S5. |
| R10 | Etykiety wkładów | Wartości < 0,1 kA w amperach („24 A"), nigdy „0,0 kA" (formatMagnitudeKa). |

## §3 SPECYFIKACJE FAZ DO WYKONANIA (samowystarczalne)

### 3.2 S2 — Silnik etykiet (jeśli nie odzyskany z worktree)
Cel: D2/D3/D4/D5/D10 z audytu. Zakres DOKŁADNY:
1. Centralny silnik etykiet w scenie v3 (`ui/sld/v3/scene/`): każda etykieta
   deklaruje bbox (font/rozmiar/tekst), silnik deterministycznie rozstrzyga
   kolizje wg priorytetów S-id > nazwa stacji > moc > parametry; przegrany tekst
   nie renderuje się na danym LOD. Kolizje tekst-tekst i tekst-symbol.
2. Wyrocznia testowa „zero kolizji": dla L0/L1/L2 sieci referencyjnej 52+ stacji
   (fixture substrate) zbiór bboxów etykiet i symboli bez przecięć (tolerancja 0).
   Zostaje w suicie na zawsze.
3. Budżet tekstu per glif per LOD wg macierzy (L0: S-id; L1: nazwa+moc; L2 pełne).
4. Gęstość: typ kabla ≤1×/korytarz na L1 (agregacja; różne typy → „różne typy
   katalogowe · Σ długość" — wzorzec istnieje na L0); per-przęsło tylko L2.
5. Słownik PL enumów w JEDNYM miejscu (adapter captionów;
   `ui/sld/v2/canvas/enmToSldAdapter.ts:479-498` to źródło 'OVERHEAD') + test
   czerwony na surowym enumie.
6. Manhattanizacja dołączeń DER/odczepów (koniec ukośnych linii przez arkusz).
Bramki: §4 + zrzuty `s2-l0/l1/l2.png` do `docs/audit/visual/schemat-10/`.

### 3.3 S3 — Tokeny koloru + sekcje + GPZ (jeśli nie odzyskany z worktree)
Cel: D6/D7/D8. Zakres DOKŁADNY:
1. Moduł tokenów kanwy (jedno źródło): napięcie (110/SN/nN) × stan
   (załączony/wyłączony/NOP) × wyróżnienie (selekcja/overlay); wszystkie kolory
   torów/glifów/szyn v3 czytają z tokenów; pomiar literałów kolorów przed/po
   (grep) w raporcie/commicie. Tabela identyczna na L0/L1/L2.
2. Znaczniki sekcji/NOP rysowane względem RENDEROWANEJ szyny danego LOD
   (koniec dryfu/ucinania); NOP wyróżniony wg tabeli stanów na każdym poziomie.
3. GPZ na tych samych tokenach i typografii co stacje (koniec białej ramki);
   pełna sylwetka w gramatyce S1 — jeśli wymaga geometrii ponad fazę, minimum
   tokeny+typografia, GAP do S5.
4. Kontrast rodzin: overlaye (czerwień zwarć, przepływ mocy, energizacja) muszą
   pozostać odróżnialne od nowych tokenów.
Bramki: §4 + zrzuty `s3-l0/l1/l2.png`.

### 3.4 S4 — Motyw + kadr (start po scaleniu S2+S3)
1. Wdrożenie R1: kanwa SCADA-dark na ekranie (tokeny S3 = jedyna prawda);
   eksport SLD (PNG/PDF — istniejący tor `ui/sld/export`) dostaje JASNY wariant
   techniczny: druga tabela tokenów (te same klucze, jasne wartości) wybierana
   WYŁĄCZNIE w torze eksportu; zero wpływu na render ekranowy i goldeny sceny.
2. Kadr fit-do-treści: domyślny kadr = bbox treści + margines (żadnych martwych
   pól > 20% kadru na L0/L1 — miara w teście; reuse poprawki footprintu S1).
3. Test: eksport jasny zawiera te same elementy co scena (parytet liczby
   elementów warstw), kolory z jasnej tabeli.
Bramki: §4 + zrzuty ekran vs eksport.

### 3.5 S5 — Goldeny + dowód końcowy (ostatnia faza)
1. Przegląd WSZYSTKICH goldenów SLD po S1–S4: wymiana jednym commitem z listą.
2. Dowód zoomu: sekwencja zrzutów zoom-out→in ≥3 kroki, oba kierunki, sieć 52+
   stacji — stacja nie zmienia tożsamości/kotwicy (`docs/audit/visual/schemat-10/
   zoom-sekwencja-*.png`).
3. MACIERZ PARYTETU FUNKCJI (test lub tabela z dowodami per pozycja): overlay
   mocy, overlay zwarć (strzałki jedno- i wielokawałkowe, znacznik pulse, tercyle),
   overlay OLTC (glif+badge), menu kontekstowe (wszystkie rodzaje elementów + DER),
   selekcja/centrowanie/deep-linki (`setWynikiTab`, pokazNaSchemacie), edycja CAD,
   wiązanie kreatorów (selekcjaPoOperacji), eksport. Każda pozycja: test zielony
   lub zrzut.
4. Aktualizacja `PLAN_SLD_REWORK.md` §0 (statusy ✅), wpis rejestru zamykający
   V12K-135 (ROZSTRZYGNIETY), zrzuty finalne dla właściciela (SendUserFile,
   jeśli dostępny — inaczej ścieżki w raporcie).

## §4 BRAMKI I KOMENDY (dyscyplina cwd — NAJCZĘSTSZA PRZYCZYNA FAŁSZYWYCH CZERWIENI)

- Frontend (`cd mv-design-pro/frontend`): `npm ci`; `npm run type-check`;
  `npm run lint`; `npx vitest run --no-file-parallelism src/ui/sld src/ui/sld-overlay src/engine/sld-layout`;
  specy Playwright: `npx playwright test e2e/<spec>` (Chromium preinstalowany —
  NIGDY `playwright install`). Zły cwd = „No tests found"/masowe faile.
- Guardy (`cd mv-design-pro`): `PYTHONUTF8=1 python scripts/sld_determinism_guards.py`,
  `overlay_no_physics_guard.py`, `no_codenames_guard.py`, `forbidden_ui_terms_guard.py`,
  `docs_guard.py`, `v12xx_canon_guard.py`, `utf8_mojibake_guard.py`.
- Backend (`cd mv-design-pro/backend`): `poetry run pytest -q -k "<wzór>"`;
  trace_determinism TYLKO przez `poetry run python ../scripts/trace_determinism_guard.py`
  (goły python nie ma pydantic → fałszywa czerwień).
- Kody wyjścia łapane WPROST (nigdy `cmd | tail; echo $?`).
- Push: `git push -u origin claude/power-network-design-ui-ir91mv` (retry 2/4/8/16 s
  tylko przy błędach sieci).

## §5 SZABLON KARTY WYKONAWCY (gdy delegujesz)
Worktree, commit BEZ push, raport z SHA. W karcie zawsze: §0 SETUP (fetch+reset
na gałąź, npm ci, dyscyplina cwd, „SYNCHRONICZNIE, kody wprost, żadnych pętli/
monitorów w tle, nie kończ tury bez commita i raportu"), kanon do przeczytania,
zakres DOKŁADNY, bramki z §4, stopka commita jak wyżej. Znany anty-wzorzec:
wykonawca kończy turę „czekam na monitor w tle" → wznowienie wiadomością:
„dokończ SYNCHRONICZNIE na pierwszym planie… nie kończ tury bez commita i
raportu" (działało 5/5 razy). Wykonawca może też skończyć i zacommitować, a
raport ginie — ZAWSZE sprawdź worktree zanim zlecisz od nowa (§1.2).

## §6 PROCEDURA REJESTRU I DOKUMENTÓW
- `docs/v12xx/REJESTR_KONFLIKTOW.md`: nowy wpis NAD najwyższym `| V12K-1XX |`
  (Edit kotwiczony na tym wierszu); format 7 kolumn jak sąsiednie wpisy; ASCII-PL
  w tabeli (bez znaków typograficznych). Po edycji: docs_guard + v12xx_canon_guard
  + utf8_mojibake_guard z mv-design-pro.
- Statusy programów: `PLAN_SLD_REWORK.md` §0 (SCHEMAT-10),
  `docs/uiux/FLOW_PROJEKTANTA_2026-07.md` §3 (flow), PLANS.md sekcja sesji.
- Zrzuty dowodowe: commitowane do `docs/audit/visual/…`; spec Playwright z
  twardymi asercjami TREŚCI przed zrzutem (wzorce: `e2e/dowody-*.spec.ts`,
  `e2e/zwarcia-rozplyw-screenshot.spec.ts`).

## §7 KOLEJKA PO SCHEMAT-10 (w tej kolejności, bez pytań)
1. **E-24 show-results pozostałe konteksty**: zwarciowe wiersze per element —
   deep-link `setWynikiTab('zwarcia', ref)` z preselekcją analogicznie do D-2
   (rozszerzenie EkranZwarc o preselekcję punktu zwarcia po ref).
2. **show-frt-hvrt w menu DER** (GAP V12K-131): najpierw recon czy E-26/FRT
   honoruje preselekcję po entityRef; jeśli tak — dołożyć pozycję menu; jeśli
   nie — dobudować preselekcję wzorcem MacierzNcRfg (P-1).
3. **F-E8.3 backend magazynu dokumentów** (FLOW §3: persystencja wygenerowanego
   dokumentu: status/liczba stron/data/plik; potem karty huba czytają realny stan).
4. **F-E6.2 pętla decyzji — akcje kontekstowe** (ΔU→konfigurator odcinka,
   przeciążenie→dobór kabla, miscoordination→nastawy).
5. **Pełny solver RMS w biegu fault-clear** (GAP V12K-130): mapowanie modeli
   dynamicznych z ENM, kąt wirnika/eigenvalues w szeregu — duża karta, osobny
   przebieg z sankcją.
6. Po scaleniu gałęzi do main: usunąć wpisy SANCTIONED_CHANGES z
   solver_boundary_guard (V12K-120/128/132) — zapisane w guardzie.

## §8 CZEGO NIE ROBIĆ
- Nie pytać właściciela o rzeczy z §2. Nie używać AskUserQuestion bez realnie
  NOWEJ decyzji produktowej.
- Nie dotykać FROZEN bez sankcji i dowodu addytywności bajt-w-bajt
  (wzorzec: `TestSequenceComponentsAdditive` w `tests/test_result_api_contract.py`).
- Nie wyłączać/pomijać testów i guardów (Zero-Debt: naprawa u źródła, także
  pre-existing; wyjątek tylko z pomiarem i wpisem do planu).
- Nie regenerować cudzych PNG „przy okazji" (różnice bajtowe font-hinting) —
  `git checkout --` na niezwiązanych.
- Nie tworzyć PR (właściciel nie prosił) ani nie scalać do main.
