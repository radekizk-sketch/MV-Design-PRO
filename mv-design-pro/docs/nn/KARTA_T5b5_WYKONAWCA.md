# KARTA WYKONAWCZA T5b-5 — SYMBOL GRAMMAR JAKOŚCI CAD (L2 nN)

**Status:** DO WYKONANIA · **Zleceniodawca:** Fable (zarządca wątku nN) ·
**Podstawa:** werdykt właściciela B-02 dla T5b-4 (7/10 technika, 6,5/10
wizual) — pełna treść w `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`, sekcja
„WERDYKT B-02 dla T5b-4 … mandat T5b-5".
**Gałąź:** `claude/mv-design-lv-module-n0dnqr` (baza: `ffc42fa6`).

---

## 1. KONTEKST — CO JUŻ JEST (nie budować od zera)

Warstwa L2 (`frontend/src/ui/sld/v3/lv-domain/`) po trzech iteracjach:

| Plik | Rola | Stan |
|---|---|---|
| `composeLvDomainScene.ts` | silnik layoutu: rangi elektroenergetyczne, sekcja jako kontener, FEEDER SLOT (szerokość slotu = szerokość poddrzewa), oś TR == środek sekcji, boundary jako tor | działa, **nie przebudowywać** |
| `LvDomainView.tsx` | renderer: fit+centrowanie, typografia screen-stable, halo etykiet, dwa tryby etykiet, overlaye | działa, rozbudowa |
| `visualGrammar.ts` | JEDEN język wizualny: occupancy/fit, `TYPE_SCREEN_PX`, `SYMBOL_SCREEN_PX`, `BUS_STROKE_SCREEN_PX`, `LINE_SCREEN_PX` | działa, rozszerzać TU (nie w komponencie) |
| `types.ts` | mirror kontraktu backendu `/enm/lv-domain` | **nie zmieniać bez zmiany backendu** |
| `fixtures/multiSourceDomain.ts` | ROOT: 2×TR (bez incomerów) + QBC + PV wprost na szynie + podrozdzielnica + boundary | odzwierciedla realny kształt API — **nie „poprawiać" fixtury, żeby rysunek ładniej wyglądał** |
| `fixtures/stationBoardDomain.ts` | Stacja C: incomer jawny + 3 odpływy w pełnym torze + PV z pełnym torem | j.w. |
| `__tests__/*` | 95 testów (composeScene, sceneConformance, hardChecks, remainingP0, visualGrammar, LvDomainView, stationBoardDomain) | **piny — czytać przed zmianą** |

Biblioteka symboli kanonu: `frontend/src/ui/sld/v3/symbols/defs.ts` (dane:
bbox + porty na siatce GRID=8) i `glyphs.tsx` (rysunek). To jest SYMBOL
REGISTRY, o którym mówi werdykt — **nowe symbole idą TU, nie do lv-domain**.

Harness zrzutowy: `frontend/src/lv-domain-harness-main.tsx` +
`frontend/e2e/lv-domain-screenshot.spec.ts` (`?fixture=`, `?qbc=`,
`?overlay=`, `?theme=`), zrzuty do `docs/audit/visual/lv_domain_*.png`.

---

## 2. §0 ROZSTRZYGNIĘCIA (WIĄŻĄCE — nie podejmować ich ponownie)

**§0.1 — Symbol transformatora żyje w KANONIE, nie w L2.**
Zmieniasz `Transformer2WGlyph` w `symbols/glyphs.tsx`. Gabaryt w `defs.ts`
(32×40, porty `hv` (16,0) i `lv` (16,40)) **zostaje** — porty JUŻ są
terminalami HV/LV; wymaganie właściciela („jawne HV/LV terminal") realizujesz
przez UWIDOCZNIENIE stron w rysunku, nie przez nowe porty (zmiana bboxu
złamie `grid_probe`/`port_probe` i layouty SN, które ten sam glif rysują).

**§0.2 — Nakładające się okręgi to POPRAWNA symbolika IEC 60617 — problem
jest w proporcjach i braku informacji, nie w koncepcji.** Nie zamieniaj
transformatora na wymyślony kształt. Wymagana zmiana:
1. mniejszy promień uzwojeń i mniejsze nakładanie (lżejszy optycznie),
2. **znaczniki grupy połączeń WEWNĄTRZ uzwojeń** (Δ dla D, Y dla Y/y,
   kropka neutralnego dla `n`) — to jest różnica między schematem
   profesjonalnym a placeholderem i to realizuje „komunikuje dwa poziomy
   napięcia" oraz „HV/LV jednoznaczne",
3. kikuty HV (góra) i LV (dół) wyraźnie różne długością/zakończeniem.
   Źródło danych grupy: `LvDomainTransformer.vector_group` (np. `Dyn11`).
   **Parser oznaczenia grupy (`Dyn11` → HV=`D`, LV=`yn`, przesunięcie 11)
   to PREZENTACJA, nie fizyka** — umieszczasz go w warstwie prezentacji
   (`symbols/vectorGroup.ts`), z uczciwym fallbackiem: brak/nierozpoznana
   grupa ⇒ gołe okręgi bez znaczników (ZERO zmyślania Δ/Y).
4. `hasFieldGapWarning` (marker „!") **zostaje bez zmian** — używa go
   ścieżka SN, nie wolno go zgubić.

**§0.3 — Rozmiar TR nie zależy od Sn i nigdy nie będzie.** Skala glifu idzie
wyłącznie z `SYMBOL_SCREEN_PX.transformer` (`visualGrammar.ts`). Obniż tę
wartość z 84 na **64 px ekranu** (werdykt: „większy od QF, ale nie 3–4× cięższy
optycznie"; aparat = 34 px ⇒ stosunek 1,9× zamiast 2,5×). Pin: test dowodzi,
że scena z TR 250 kVA i scena z TR 1600 kVA mają IDENTYCZNĄ geometrię glifu.

**§0.4 — Jeden rejestr mapowania aparatów, wspólny dla całego systemu.**
Tworzysz `symbols/apparatusRegistry.ts` z jedną funkcją:
`symbolForApparatus({ type, catalogNamespace, catalogRef, role })
 → SymbolId | undefined`.
Zasada: symbol wynika z TYPU/FUNKCJI, nigdy z oznaczenia („QF"). Mapowanie
bazowe (już działa w L2, przenieś bez zmiany zachowania):
`breaker→nnBreaker`, `switch→loadBreakSwitch`, `disconnector→disconnector`,
`fuse→nnFuseSwitch`, `bus_coupler→couplerBreaker` (nowy glif, §0.5).
Rozszerzenie MCB/MCCB/ACB: rozróżniasz **wyłącznie** gdy dane je niosą
(`catalog_namespace === 'APARAT_NN_MCB'` ⇒ MCB modułowy;
`catalog_ref` z `WYLACZNIK_GLOWNY` ⇒ aparat główny kompaktowy) — brak danych
⇒ glif generyczny. ZERO zgadywania po nazwie elementu.
**Przed napisaniem rejestru zmierz `grep`em wszystkie miejsca w repo, które
dziś mapują typ aparatu na symbol** (co najmniej `v3/compose/`, `v2/renderer/`)
i wpnij rejestr wszędzie tam, gdzie mapowanie jest tożsame. Miejsce, którego
nie da się wpiąć bez zmiany zachowania, **wypisujesz w raporcie** (nie
zmieniasz go po cichu i nie zostawiasz bez wzmianki).

**§0.5 — Sprzęgło dostaje własny glif `couplerBreaker`.** Dziś L2 obraca
`nnBreaker` o 90° i wychodzi „klocek". Nowy glif rysowany dla toru
POZIOMEGO (porty `w`/`e`), z geometrią stanu: CLOSED = styki zwarte, tor
przechodzi; OPEN = **fizyczna przerwa** (rozwarte styki, widoczna szczelina).
Po dodaniu glifu usuwasz z `LvDomainView.tsx` obrót 90° (`rotation`).

**§0.6 — Niekompletność toru to JEDNA KLASA, nie trzy łatki.** P0-3 (brak
incomera), P0-4 (brak toru DER), P0-5 (brak aparatu/kabla przed granicą) mają
wspólny mechanizm:
- kompozytor emituje **węzeł** `kind: 'gapMarker'` na torze, w miejscu
  brakującego ogniwa, z `meta.gapPl` (zdanie po polsku, co konkretnie brakuje
  i skąd to wiadomo) — wzorzec `apparatusGapPl`/`gapPl` już istnieje, ale dziś
  siedzi **wyłącznie w `<title>` (hover)**, a to jest dokładnie wada nazwana
  przez właściciela („niekompletna konfiguracja wygląda identycznie jak
  kompletna");
- renderer rysuje znacznik CAD: przerywany prostokąt w miejscu aparatu +
  znak `!`, ton `TONE_UNKNOWN`;
- nagłówek widoku dostaje licznik ostrzeżeń inżynierskich
  („Konfiguracja niekompletna: N") z listą po kliknięciu.
**Kryterium niekompletności bierzesz z TOPOLOGII, nie z domysłu:**
`findTransformerIncomer` zwraca `incomerBranch === null` ⇔ TR wisi wprost na
sekcji (fixtura ROOT) ⇒ brak aparatu głównego. Analogicznie DER bez gałęzi
własnego pola i boundary bez znanej gałęzi.
**ZAKAZ: rysowania aparatu, którego nie ma w modelu.**

**§0.7 — STATE ≠ VERDICT egzekwujesz pinem, nie deklaracją.** Stan łączeniowy
nigdy nie używa tonu werdyktu: `TONE_OK` (zielony) wolno użyć **wyłącznie**
dla werdyktu inżynierskiego z danych (SWZ „spełnia"). Zamknięty aparat = ton
bazowy. Pin klasy: dla obu fixtur, dla obu stanów QBC — żaden element
niosący `meta.status` nie renderuje się w `TONE_OK`/`TONE_FAIL`.
Kanału werdyktu pracy równoległej 2×TR backend **nie ma** (luka nazwana w
raporcie T5b-2) ⇒ L2 nie pokazuje żadnego werdyktu dla QBC; miejsce na badge
przygotowujesz, ale bez dostawcy **nie renderujesz nic** (phantom zakazany).

**§0.8 — Kabel: pokazujesz DANE modelu, nie wymyślony kod.** Etykieta kabla =
`branch.name` z modelu (fixtury niosą np. „Kabel odpływu QF-01"). Nie
generujesz „K-01", jeśli model tak nie nazywa elementu. Etykieta:
SECONDARY, przy środku odcinka, z halo, w trybie projektowym; parametry
(katalog/przekrój/długość) — hover/inspektor. Przekrój i długość **nie są
dziś w kontrakcie** (`LvDomainBranch` bez `length_m`/`cross_section_mm2`) —
to luka nazwana, nie fabrykuj.

**§0.9 — Dedup etykiety szyny to PREZENTACJA, nie edycja danych.** Nie
skracasz `bus.name`. Renderer nie dokleja `· 0,4 kV`, jeżeli nazwa już
zawiera to napięcie (dopasowanie do sformatowanej wartości). Pin: dla nazwy
zawierającej napięcie tekst kanwy zawiera je dokładnie raz.

**§0.10 — Dowód SWZ pochodzi z REALNEGO biegu.** Nie wpisujesz liczb ręcznie.
Ścieżka: skrypt `backend/scripts/emit_swz_evidence.py` (wzorzec:
`backend/scripts/emit_sld_network_fixture.py`) uruchamia realną ścieżkę
`build_swz_view` na sieci referencyjnej i zapisuje JSON do
`frontend/src/ui/sld/v3/lv-domain/fixtures/swzEvidence.generated.json`;
harness czyta go pod `?swz=evidence`; e2e robi zrzut PASS+FAIL. Nagłówek
pliku JSON niesie `run_id`/`scenario_id`/`model_revision` — to jest dowód, że
liczby są z biegu, nie z klawiatury.

---

## 3. PAKIETY PRACY (A–D; A i D-backend są rozłączne, można równolegle)

### PAKIET A — SYMBOL GRAMMAR (P0-1, P0-2, P0-6)
Pliki: `symbols/glyphs.tsx`, `symbols/defs.ts`, `symbols/vectorGroup.ts`
(nowy), `symbols/apparatusRegistry.ts` (nowy), `symbols/__tests__/*`,
`lv-domain/composeLvDomainScene.ts` (użycie rejestru),
`lv-domain/LvDomainView.tsx` (usunięcie obrotu 90°),
`lv-domain/visualGrammar.ts` (`transformer: 84 → 64`).

Kroki:
1. `vectorGroup.ts`: parser oznaczenia grupy + testy (Dyn11/Yzn5/Dd0/brak/
   śmieć → uczciwy `null`).
2. `Transformer2WGlyph`: nowa geometria wg §0.2 (znaczniki Δ/Y z `GlyphProps`,
   nowe pole opcjonalne `vectorGroupMarks` — wzorzec `meterQuantity`).
3. `couplerBreaker`: def (16×32, porty `w`/`e`) + glif ze stanem geometrycznym.
4. `apparatusRegistry.ts` + wpięcie w L2 i w zmierzone miejsca wspólne.
5. `SYMBOL_SCREEN_PX.transformer = 64`, usunięcie `rotation` sprzęgła.

Piny (nowe testy): identyczna geometria TR dla 250/630/1000/1600 kVA;
Dyn11 rysuje Δ po stronie HV i Y+n po LV; brak grupy ⇒ zero znaczników;
`couplerBreaker` OPEN ma przerwę geometryczną (brak ciągłości toru w markupie);
rejestr aparatów zwraca różne symbole dla różnych `type` i ten sam symbol dla
tego samego `type` niezależnie od `name`.

### PAKIET B — KOMPLETNOŚĆ TORU (P0-3, P0-4, P0-5)
Pliki: `composeLvDomainScene.ts`, `LvDomainView.tsx`, testy L2.
Kroki: nowy `kind: 'gapMarker'` + emisja w trzech miejscach (incomer TR, pole
DER, boundary), renderer znacznika, licznik ostrzeżeń w nagłówku, podniesienie
istniejących `gapPl`/`apparatusGapPl` z hovera do widocznego znacznika.
Piny: ROOT ma 2 gapMarkery incomera + 1 dla PV; Stacja C ma ZERO (tor pełny) —
**ten kontrast jest dowodem, że znacznik mierzy dane, nie rysunek**;
`sceneConformance` rozszerzony o klasyfikację `gapMarker` (żeby wyrocznia
„zero węzłów UNCLASSIFIED" dalej gryzła).

### PAKIET C — ETYKIETY I KABEL (P0-8, P0-9, P1 hierarchia szyn)
Pliki: `LvDomainView.tsx`, `visualGrammar.ts`, testy.
Kroki: etykieta kabla w trybie projektowym; dedup napięcia w nazwie szyny;
trzeci poziom szyn (`LOCAL/PCC`) w `BUS_STROKE_SCREEN_PX`; pin klasy „w trybie
projektowym żaden tekst kanwy nie zawiera 'zacisk'/'terminal'/'port'".

### PAKIET D — DOWÓD WYNIKOWY SWZ (P0-10) — backend + frontend
D-backend (rozłączny z A/B/C): `build_swz_view` + `SwzApiResponse` o pola
`zs_ohm` i `ta_s` (czas zadziałania z krzywej aparatu — **fizyka wyłącznie w
backendzie**, NOT-A-SOLVER; źródło: istniejąca ścieżka krzywych
`nn_device_selection.py`), addytywnie, `exclude_none`, determinizm nietknięty,
testy backendu + skrypt `emit_swz_evidence.py`.
D-frontend: rozwinięcie badge'a SWZ (Zs/Ikmin/Ia/ta/tlim/scenarioId/runId/
modelRevision), harness `?swz=evidence`, dwa nowe zrzuty (PASS i FAIL).

---

## 4. BRAMKI (wszystkie muszą być zielone przed zgłoszeniem)

```bash
cd mv-design-pro/frontend
npx tsc --noEmit -p tsconfig.json                       # 0
npx vitest run src/ui/sld --no-file-parallelism         # 268+ plików, 0 fail
npm run accept:sld-v3                                   # === WYNIK: ALL PASS ===
npm run lint                                            # 0 warnings
npx playwright test e2e/lv-domain-screenshot.spec.ts    # 7/7 (+ nowe zrzuty)
cd ../ && for g in sld_determinism_guards overlay_no_physics_guard \
  forbidden_ui_terms_guard ui_terminology_guard utf8_mojibake_guard \
  ui_no_physics_guard; do python scripts/$g.py; echo "$g=$?"; done
# Pakiet D dodatkowo: cd backend && poetry run pytest -q
```

Kody wyjścia łapiesz **bezpośrednio** (nigdy `cmd | tail; echo $?` — pipe
zwraca kod ostatniego członu).

---

## 5. ZAKAZY I GRANICE

1. **Nie przebudowywać layoutu** (rangi/sekcje/feeder-sloty/fit) — werdykt
   wprost tego zabrania.
2. **Nie zmieniać ENM ani solverów po to, żeby rysunek wyglądał lepiej.**
3. **Nie wymyślać aparatów** i **nie ukrywać istniejących**.
4. **Nie modyfikować fixtur**, żeby rysunek był ładniejszy — fixtury
   odzwierciedlają realny kształt API (mają dowodzić także braków).
5. Poza wątkiem nN (własność innego programu — nie dotykać):
   `backend/src/network_model/catalog/switchgear/**`, `backend/src/api/catalog.py`,
   `frontend/src/ui2/kreatory/stacja/**`, `frontend/src/engine/`,
   `coordination/**`.
6. Kontrakty FROZEN (ResultSet v1, wyniki solverów) — tylko zmiany addytywne
   z `exclude_none` i nietkniętym determinizmem.
7. Test maskujący defekt = dwa defekty. Zmiana pinu wymaga **komentarza w
   pliku**: co było starym kanonem, dlaczego kanon się zmienił, że INTENCJA
   pinu została zachowana.

---

## 6. PROTOKÓŁ ZGŁOSZENIA

Commit **bez push** (integruje zarządca), na końcu raport w formacie:

```
PAKIET <A|B|C|D> · <STATUS>
IMPLEMENTACJA: <pliki + istota zmiany>
PINY: <nowe/zmienione testy + co dowodzą>
FLIPY: <pin, stary kanon, nowy kanon, zachowana intencja>
BRAMKI: tsc=… vitest=… accept=… lint=… guardy=… e2e=…
ZRZUTY: <ścieżki regenerowanych PNG>
LUKI MODELU: <co nazwane, bez fabrykacji>
NIEWPIĘTE: <miejsca, których nie dało się zunifikować + powód>
```

Dowód wizualny: zrzuty z DOMYŚLNEGO wejścia (viewport 1400×1000, bez zoomu,
tryb etykiet projektowy). Kryterium właściciela: **bez czytania napisów**
rozpoznawalne TRANSFORMATOR, WYŁĄCZNIK, ROZŁĄCZNIK, SPRZĘGŁO, KABEL, DER,
BUS, BOUNDARY.
