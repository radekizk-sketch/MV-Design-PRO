# PLAN DOKOŃCZENIA 100% — 2026-08-14 (BINDING)

Gałąź nadzoru: `claude/przejecie-nadzoru-fable-dtie3b` (PR #470). Stan na chwilę
spisania: HEAD `3f367743`, `origin/main` w całości zawarty w gałęzi (0 commitów
w tyle, 605 do przodu — merge bez konfliktów).

Ten plan jest napisany tak, żeby DOWOLNY agent (Claude, Codex, inny) wykonał go
BEZ interpretacji: każda karta ma granice plikowe, kroki, dokładne komendy,
bramki z oczekiwanym wynikiem i definicję ukończenia. Gdzie krok wymaga decyzji
właściciela, stoi jawny STOP `[B-01]` / `[B-02]` — niczego nie zgadywać.

---

## §0 KONTRAKT WYKONANIA (obowiązuje każdą kartę tego planu)

### 0.1 Reguły nadrzędne (skrót — pełny kanon w `CLAUDE.md` repo)
1. **Zero-Debt**: każdy napotkany błąd (także pre-existing) naprawiasz u źródła
   w tej samej kolejce. Wykluczenie/skip ≠ naprawa.
2. **KLASA, NIE INSTANCJA**: przed naprawą inwentarz WSZYSTKICH miejsc tej samej
   klasy; testy jako iloczyn cech; deklaracja bez testu = fałszywa pewność.
3. **Zero fabrykacji**: każda kontrolka UI mapuje na realne pole backendu; każda
   dana katalogowa ma źródło http(s) producenta; brak w karcie = jawny brak
   (None), nigdy wartość zmyślona.
4. **FROZEN**: `ShortCircuitResult`/`PowerFlowResult` nietykalne; nowe pola
   addytywne; determinizm (ten sam input = ten sam output, stabilne sha256).
5. **Fizyka wyłącznie w solverach** (`network_model/solvers/`); UI/analiza/
   aplikacja tylko interpretują.
6. **Polski język UI**, zakaz codenames (P7/P11/...), zakaz identyfikatorów
   modeli AI w artefaktach repo.

### 0.2 Jedyne dozwolone zatrzymania
- `[B-01]` edycja zamrożonego rdzenia solvera → pytanie do właściciela.
- `[B-02]` werdykt wizualny ekranu/SLD → zrzuty na stronę oceny, werdykt
  właściciela. Strona oceny: artefakt „MV-DESIGN-PRO · ekrany do oceny"
  (sekcje dokłada się NA GÓRĘ po `</header>`; obrazy jako data-URI base64).
Wszystko inne: działać do końca autonomicznie.

### 0.3 Środowisko (dokładne ścieżki) i pułapki
- Interpreter backendu (WYMAGANY — systemowy python3 daje fałszywie czerwone
  guardy zależne od bibliotek):
  `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`
  (dalej: `$VENV`).
- Kody wyjścia łapać BEZPOŚREDNIO: nigdy `cmd | tail; echo $?` (pipe zwraca kod
  ostatniego członu). Wzorzec: `cmd > plik 2>&1; echo "RC=$?"`.
- `cwd` NIE utrzymuje się między wywołaniami powłoki w niektórych harnessach —
  każde polecenie zaczynać od `cd /home/user/MV-Design-PRO/...`.
- `black` dla plików w `mv-design-pro/scripts/`: OBOWIĄZKOWO
  `$VENV -m black --config backend/pyproject.toml <plik>` (szerokość 100;
  domyślne 88 psuło CI).
- Po rewercie kontenera znika `@types/jsdom` → `npm i -D @types/jsdom --no-save`
  w `mv-design-pro/frontend`, inaczej type-check RC=2.
- Porty zajęte: `fuser -k 5173/tcp 8000/tcp`.
- **Uvicorn serwuje STARY kod po cherry-picku backendu** (proces trzyma
  załadowane moduły): po KAŻDYM cherry-picku dotykającym `backend/src/**`
  obowiązkowy restart (`fuser -k 8000/tcp` + ponowne uruchomienie), inaczej
  weryfikacja wizualna/API mierzy kod sprzed zmiany (incydent 2026-08-14:
  „wszystkie rodziny wyłączone" było artefaktem stęchłego serwera, nie regresją).
- **Literały motywu `mvd-theme-mode`: WYŁĄCZNIE `dark_scada` i
  `light_technical`.** Zapis `light`/`dark` jest niepoprawny i NIE przełącza
  motywu (porównanie `=== 'dark_scada'` daje false → zawsze jasny). Skrypty
  zrzutów mapują nazwę sceny na kanoniczny literał; bramka pary dark/light w
  `e2e/kreator-stacji-zrzuty.spec.ts` wymusza bajtową różność każdej pary
  kadrów (incydent AUDYT-KOMPLETNOSCI-2026-08-14 w rejestrze).
- Zapadki dwustronne (para pin↔próg aktualizowana RAZEM w jednym commicie):
  `tsconfig_gate_guard` (budżet błędów poza bramką: 531 — wolno tylko obniżać),
  `mypy_ratchet_guard` (para próg↔meta-test; AKTUALNE liczby w guardzie i jego
  meta-teście, nie w tym planie), listy imienne długu w testach.

### 0.4 Konwencje commitów
- Autor: `git -c user.name="Claude" -c user.email="noreply@anthropic.com"`
  (agent inny niż Claude: analogiczna stała tożsamość narzędzia, nie osoba).
- Komunikat po polsku BEZ znaków diakrytycznych; treść mówi CO i DLACZEGO.
- Stopka `Co-Authored-By:` + link sesji agenta wykonującego (własny, nie cudzy).
- Wykonawcy kart pushują WYŁĄCZNIE na `kopia/<KARTA>`; na gałąź nadzoru pushuje
  tylko odbierający. Push po KAŻDYM commicie (doktryna anty-rewertowa —
  kontener bywa cofany; origin jest jedyną trwałą pamięcią).
- ZAKAZ biegów w tle u wykonawców kart: polecenia inline z timeoutem.

### 0.5 Bramki pełne (komplet do scalenia każdej karty; wynik = RC dosłownie)
```
cd /home/user/MV-Design-PRO/mv-design-pro/backend
$VENV -m pytest tests ../scripts -q          # oczekiwane: 0 failed, RC=0
cd /home/user/MV-Design-PRO/mv-design-pro/frontend
npm run test:ci                               # RC=0
npm run type-check                            # RC=0
npm run lint                                  # RC=0
cd /home/user/MV-Design-PRO/mv-design-pro
# guardy (venv!): minimum dla karty = te z jej sekcji; komplet przed merge:
for g in arch_guard pcc_zero_guard domain_no_guessing_guard solver_boundary_guard \
  canonical_ops_guard catalog_binding_guard catalog_enforcement_guard \
  catalog_gate_guard catalog_metadata_guard no_codenames_guard \
  forbidden_ui_terms_guard ui_terminology_guard dead_click_guard \
  ui_no_physics_guard dialog_completeness_guard tsconfig_gate_guard \
  overlay_no_physics_guard load_flow_no_heuristics_guard \
  protection_no_heuristics_guard trace_ui_leak_guard no_direct_fault_params_guard \
  sld_determinism_guards trace_determinism_guard fault_scenarios_determinism_guard \
  resultset_v1_schema_guard severity_contract_guard readiness_codes_guard \
  audit_contract_guard api_lifecycle_guard docs_guard repo_hygiene_guard \
  utf8_mojibake_guard; do $VENV scripts/$g.py >/dev/null 2>&1; echo "$g RC=$?"; done
# e2e na realnym backendzie (uruchom serwery jak w §0.6):
cd /home/user/MV-Design-PRO/mv-design-pro/frontend && npm run test:e2e:real   # RC=0
```

### 0.6 Serwery deweloperskie
```
cd /home/user/MV-Design-PRO/mv-design-pro/backend
nohup $VENV -m uvicorn src.api.main:app --port 8000 > /tmp/uvicorn.log 2>&1 &
cd /home/user/MV-Design-PRO/mv-design-pro/frontend
nohup npm run dev > /tmp/vite.log 2>&1 &     # port 5173, proxy /api -> 8000
```

### 0.7 Protokół ODBIORU NIEZALEŻNEGO karty (krok po kroku, bez skrótów)
1. `git fetch origin kopia/<KARTA>`; przegląd `git diff --stat` i pełnego diffu
   kluczowych plików PRZED scaleniem.
2. `git cherry-pick <commity łańcucha>` na gałąź nadzoru; konflikty rozstrzygać
   na rzecz NOWSZEJ prawdy pomiarowej (przykład wzorcowy: odbiór EKRAN-N1 —
   docstring wydajności zachował pomiar po optymalizacji).
3. **PUSH natychmiast po cherry-picku** (przed bramkami!) — anty-rewert.
4. **INIEKCJA WŁASNA** w rogu NIEpokrytym iniekcjami wykonawcy: wybierz mocną
   deklarację z meldunku/docstringów, wprowadź celowy defekt dokładnie tej
   klasy (`sha256sum <plik> > /tmp/inj_sha.txt` PRZED zmianą), uruchom właściwy
   pakiet testów. Iniekcja PRZETRWAŁA = znalezisko klasy „deklaracja bez testu"
   → dopisz pin KLASY (nie przykładu), zweryfikuj parę (iniekcja czerwona /
   czysto zielone), przywróć plik: `git checkout -- <plik>` +
   `sha256sum -c /tmp/inj_sha.txt` (musi być OK).
5. Bramki wg sekcji karty + minimum §0.5.
6. Adnotacja `**ODBIOR NIEZALEZNY (...)**` w wierszu rejestru
   `mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md`: wiersz ma DOKŁADNIE
   8 znaków `|`, zero `|` w treści komórek, zero diakrytyków w dopisku;
   edycja przez skrypt pythonowy kotwiczony numerem linii (nie sed na ślepo);
   po edycji `$VENV scripts/docs_guard.py` RC=0.
7. Commit + push gałęzi nadzoru.

---

**Lekcja infrastruktury (2026-08-14, incydent wspoldzielonego drzewa):**
kazdy wykonawca karty MUSI dostac WLASNY worktree od pierwszego polecenia
(`git worktree add <katalog> -B kopia/<KARTA> origin/<galaz-nadzoru>`), a
nadzorca operacje na galezi nadzoru prowadzi z osobnego worktree, gdy
jakikolwiek wykonawca zyje. Trzech wykonawcow zleconych bez tej klauzuli
pracowalo w glownym katalogu repo jednoczesnie — przelaczali sobie galezie
pod biegami testow (pomiar: cudzy commit na galezi kopia/K-S-FRESH, brudne
pliki trzeciej karty w glownym drzewie). Pomiary z drzewa wspoldzielonego sa
NIEWAZNE i musza byc powtorzone w izolacji. Frontend w worktree: symlink
node_modules z glownego katalogu wystarcza do vitest/tsc; backend: wolac
$VENV bezposrednio (poetry w worktree tworzy pusty venv).

## §1 GOTOWE DO MERGE (stan HEAD `3f367743`)

> **NOTA AKTUALNOŚCI (2026-08-14, po południu):** stany §1.1 i §2 opisują
> chwilę spisania planu. Od tego czasu odebrano i scalono na gałąź nadzoru
> także: S3, S5, BLOKI-RMU, K-K, K-N, K-E (częściowy uczciwy), K-J, K-L,
> K-M, K-O oraz naprawę incydentu kadrów. Bieżący stan kart: §6–§8 + rejestr
> (wiersze z adnotacją ODBIOR NIEZALEZNY). Procedura merge §1.2 pozostaje
> obowiązująca — zmienia się tylko SHA szczytu (mierzyć `git log` przy
> wykonaniu, nie przepisywać z tego dokumentu).

### 1.1 Zawartość (odebrane fale — wszystkie z adnotacją w rejestrze)
Fale K1–K14, KD, TOPO-COPY, PREFIKSY, TOP-5, fale 2–3 i 7–12, w tym ostatnio:
NAWIGACJA-JEDEN-KANON, PACK-NASTAWY, RATCHET-DICT-READ, DIAGNOZA-PRZEBIEGU,
PULPIT-NBA, EPE-MARTWY, N-D5-FUSE, N1-WYDAJNOSC (B-01 zatwierdzona przez
właściciela), EKRAN-N1 (kontyngencje N-1 z zapowiedzią zakresu), program
KONFIGURATOR-POL-RMU etapy: SCALENIE-KANONU-ROZDZIELNIC (18 rodzin,
`FactoryConfiguration`, 15 bloków, walidator) i S4 SLD-GEN-POLA (generator
mini-SLD z BOM, glify `fuse`+`voltageIndicator`), karty katalogowe RELF 2S/RXD,
dziedziczenie nazw połówek odcinka, 3 piny klasy z iniekcji odbiorczych
(źródła bloków, odróżnialność rejestru glifów, treść każdej zakładki
warsztatu Wyników).

### 1.2 Procedura merge PR #470 (wykonać dosłownie)
1. Upewnij się, że wszystkie karty W BIEGU (§2) są scalone na gałęzi ALBO
   właściciel jawnie każe merge'ować stan bieżący (karty w biegu zostaną wtedy
   scalone w kolejnym PR z tej samej gałęzi).
2. Sprawdź, że `origin/main` nadal jest zawarty w gałęzi:
   `git fetch origin main && git log --oneline origin/claude/przejecie-nadzoru-fable-dtie3b..origin/main | wc -l`
   → musi być `0`. Jeśli >0: `git merge origin/main` na gałęzi, konflikty wg
   §0.7 pkt 2, pełne bramki §0.5, push.
3. Sprawdź w PR #470, że WSZYSTKIE workflow CI są zielone (9 workflowów).
   Czerwony workflow = STOP, naprawa u źródła wg Zero-Debt, nie merge.
4. Merge przez GitHub (zwykły merge commit — historia kart zostaje; NIE squash:
   adnotacje rejestru odwołują się do sha commitów).
5. Po merge: wątek nN wykonuje §4.3 (przebazowanie), a karty §3 oznaczone
   [PO MERGE nN] czekają na §4.3, pozostałe można zlecać od razu.

---

## §2 KARTY W BIEGU (3) — stan, wznowienie, odbiór

Wspólne: wykonawcy pracują w worktree na gałęziach `kopia/*`. Jeśli wykonawca
nie odpowiada / kontener padł: `git fetch origin kopia/<KARTA>` — jeżeli gałąź
istnieje na origin, odebrać ze stanu gałęzi (meldunek może być w treści
commitów/rejestrze — wzorzec EKRAN-N1); jeżeli nie istnieje, wykonać kartę od
zera wg treści poniżej (samodzielnie lub nowym wykonawcą).

### 2.1 S3-KREATOR-POLA (gałąź: `kopia/S3-KREATOR`; stan: commit lokalny
`9384230a` „krok 4 kreatora stacji na CATALOG-FIRST", testy w toku)
**Cel**: przebudowa kroku 4 kreatora stacji SN/nN na CATALOG-FIRST wg
`docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` (BINDING).
**Granice plikowe**: `frontend/src/ui2/kreatory/stacja/**` (+ addytywnie
`ui2/adapters/**`); generatora `generatorSldPola.ts`/`podgladRozdzielnicy.ts`
NIE edytować (tylko konsumować); backendu NIE dotykać.
**Wymagania (§0 karty — dosłownie)**:
1. Dane WYŁĄCZNIE z API: `GET /api/catalog/switchgear-families`,
   `GET /api/catalog/complete-bay-templates`, subzasób `factory-configurations`.
   Zero lokalnych list rodzin/bloków/aparatów.
2. Dwa tory wg `tor_konfiguracji` rodziny: MODULARNY (kompozycja rozdzielnicy
   z kompletnych pól katalogowych `CompleteMvBayTemplate`) i BLOK_RMU (wybór
   bloku z `FACTORY_CONFIGURATION_REGISTRY`, jednostki bloku STAŁE, doposażenie
   tylko opcjami). Rodziny RMU bez bloków (imienna lista długu) → uczciwy stan
   zerowy z komunikatem, bez fabrykacji.
3. Nagłówek rodziny: producent, Un/In/Ik z karty, technologia, tor; wyposażenie
   pola ze statusem FABRYCZNY (stały) / OPCJA (przełączalny), oznaczniki Q.
4. Werdykt VALID/INVALID wyłącznie z backendu (dry_run operacji domenowej) —
   zero walidacji elektrycznej w UI; kontrolka bez pokrycia backendu zakazana.
5. Pełna lista rodzin producenta z API (18 w kanonie), nie filtr do jednej;
   napis „pakiet standardowy producenta" USUNĄĆ (dyspozycja właściciela).
6. Naprawa fikstur zrzutów w tej samej karcie:
   `e2e/mini-rmu-podglad-screenshot.spec.ts` (fikcyjne id `ap-1/2/3` → realne
   pozycje APARAT_SN; selektory nowego UI), scena `creator=stacja` w
   `src/creator-harness-main.tsx` (payload atrapy = kształt realnego API,
   refy `ZPUE_WLOSZCZOWA__*`), `e2e/kreator-stacji-zrzuty.spec.ts` (testidy).
7. Testy Vitest realną ścieżką (natywne kliknięcia); iloczyn cech:
   (MODULARNY × BLOK_RMU) × (rodzina z danymi × z długiem) × (FABRYCZNY ×
   OPCJA) × (VALID × INVALID z mocka fetch na granicy kontraktu).
**Bramki karty**: `npm test` (pełny), type-check, lint, guardy:
no_codenames, forbidden_ui_terms, ui_terminology, dead_click, ui_no_physics,
dialog_completeness, tsconfig_gate (budżet 531 — nie podnosić).
**Odbiór (nadzorca / agent odbierający)** wg §0.7; rogi iniekcji własnej do
sprawdzenia (wybrać JEDEN niepokryty meldunkiem):
(a) rodzina BLOK_RMU renderowana torem MODULARNYM (podmiana warunku toru) —
    czy test klasy łapie; (b) kontrolka-phantom: dodaj pole formularza nie
    mapowane na operację — czy guard/test łapie; (c) werdykt liczony w UI
    zamiast z dry_run (zamockowana odpowiedź ignorowana).
**Po scaleniu**: zrzuty żywej aplikacji (wzorzec §3 K-A) → strona oceny →
STOP `[B-02]`.
**Definicja ukończenia**: bramki RC=0 na scalonym drzewie + adnotacja rejestru
+ push + sekcja na stronie oceny.

### 2.2 S5-ENM-POLA (gałąź: `kopia/S5-ENM`; stan: commit lokalny `14bfb3d3`
„materializacja pola stacji z katalogu rozdzielnic")
**Cel**: operacja domenowa w `backend/src/enm/domain_operations_v2.py` —
materializacja pola stacji z `complete_bay_template_ref` (dla RMU +
`factory_configuration_ref`): aparaty z `device_instances` szablonu wyłącznie
przez referencje katalogowe; tryb `dry_run` zwraca werdykt z twardymi błędami
`family_supports_*` (polskie komunikaty) BEZ mutacji; API addytywnie na
istniejącej trasie operacji.
**Granice plikowe**: `backend/src/enm/domain_operations_v2.py` (+ małe moduły
pomocnicze `enm/`), `backend/src/api/**` addytywnie, `backend/tests/enm/**`,
`backend/tests/api/**`. `network_model/catalog/switchgear/**` tylko czytać;
frontendu nie dotykać. Operacje wątku nN: bez zmian sygnatur (zgłoszone
rundą 9 uzgodnień).
**Wymagania**: KLASA-NIE-INSTANCJA — inwentarz istniejących ścieżek tworzenia
pól/aparatów; nowa ścieżka wpięta wszędzie gdzie pasuje; przestarzałe ścieżki
niekatalogowe usunięte na amen (chyba że obsługują przypadki spoza szablonów —
wtedy uzasadnienie w meldunku). Predykaty parami (co szablon deklaruje ↔ co
powstało w ENM) z jednego źródła prawdy, przypięte testem. Determinizm
identyfikatorów (konwencja ENM, zero random/now).
**Testy**: iloczyn (MODULARNY × BLOK_RMU) × (szablon poprawny × jednostka
spoza słownika → twardy błąd) × (dry_run × wykonanie) × (fuse_set × breaker)
+ pin klasy: KAŻDY rodzaj aparatu szablonu zmaterializowany ma referencję
katalogową (pętla po rodzajach, nie przykład).
**Bramki karty**: pytest `tests/enm tests/api` + PEŁNY `tests ../scripts`;
black/ruff/mypy dotkniętych plików; guardy: catalog_binding,
catalog_enforcement, catalog_gate, arch, api_lifecycle, domain_no_guessing,
solver_boundary, canonical_ops, no_direct_fault_params.
**Uwaga koordynacyjna**: przed końcowym pełnym pytest przebazować na aktualny
HEAD gałęzi nadzoru (doszła zmiana `enm/domain_operations.py` —
`_nazwa_polowki_odcinka` + odświeżone odciski N-1).
**Odbiór** wg §0.7; rogi iniekcji: (a) aparat zmaterializowany z parametrami
wprost zamiast przez referencję katalogową → catalog_binding_guard i/lub pin
klasy musi czerwienieć; (b) dry_run wykonujący mutację (zapis do ENM) → test
niemutowalności musi łapać; (c) rozjazd predykatów pary (szablon deklaruje
CT, materializacja go gubi) → test parzystości.
**Definicja ukończenia**: jak w 2.1 + wpis w uzgodnieniach nN (runda 13):
„S5 scalony, sygnatury operacji nN nietknięte — potwierdzone bramką".

### 2.3 BLOKI-RMU-5-RODZIN (gałąź: `kopia/BLOKI-RMU`; stan: zlecona)
**Cel**: transkrypcja konfiguracji fabrycznych bloków RMU z PUBLICZNYCH kart
producentów dla rodzin z imiennej listy długu `RMU_BEZ_TRANSKRYBOWANYCH_BLOKOW`
(`ZPUE_WLOSZCZOWA__TPM`, `ABB__SAFEPLUS`, `SCHNEIDER__RM6`,
`SCHNEIDER__RM_AIRSET`, `SIEMENS__8DJH`) + szerokości `width_mm` JEŚLI źródło
je podaje.
**Granice plikowe**: `backend/src/network_model/catalog/switchgear/**`,
`backend/tests/network_model/catalog/**`. NIC poza tym.
**Wymagania**: wzorzec danych DOKŁADNIE jak TPM Air/SafeRing w
`factory_configuration.py`; każdy blok z `source_refs` http(s) do strony,
która REALNIE wymienia konfigurację (pin `test_kazda_konfiguracja_ma_zrodlo_
producenta` już stoi); konfiguracja niewymieniona w źródle NIE wchodzi;
rodzina bez wiarygodnego zestawu ZOSTAJE na liście długu z komentarzem, co
sprawdzono. Każdy blok przechodzi `family_supports_factory_configuration`;
rozszerzenie słownika rodziny tylko addytywnie i tylko za źródłem. Zdjęcie
rodziny z listy długu w TYM SAMYM commicie co dopisanie bloków (para zapadek).
Test kompletu kodów per rodzina wzorem `test_tpm_air_ma_bloki_z_karty_
producenta`.
**Bramki**: pytest `tests/network_model/catalog tests/api/test_catalog_api.py`
+ pełny `tests ../scripts`; black/ruff; guardy catalog_metadata,
catalog_binding, catalog_gate, arch, docs.
**Odbiór** wg §0.7 + WERYFIKACJA ŹRÓDEŁ: odbierający otwiera (WebFetch) każdy
URL z meldunku i porównuje kody bloków z wpisami — rozjazd = odrzucenie wpisu
(precedens: dane S1 Rotoblok i bloki „K/KKT" były sfabrykowane).
**Definicja ukończenia**: jak w 2.1 + w rejestrze adnotacja per rodzina
(źródło, co przepisano, co zostało długiem i dlaczego).

---

## §3 KOLEJKA PO KARTACH W BIEGU (zlecać w tej kolejności)

### K-A EKRANY-B02-KONFIGURATOR (natychmiast po scaleniu S3+S5)
1. Serwery §0.6; zbudować projekt przez API wzorem skryptu
   (`docs/audit/visual/n1/` powstało tym wzorcem): projekt → przypadek →
   `add_grid_source_sn` → 3× `continue_trunk_segment_sn` →
   `insert_station_on_segment_sn` (z `field_apparatus_catalog_ref`).
2. Playwright (chromium: `/opt/pw-browsers/chromium-1208/chrome-linux64/chrome`):
   otworzyć kreator przez `window.__mvdpOpenOperationForm(
   'insert_station_on_segment_sn', {segment_id, ...})`, krok 4; kadry:
   (a) tor MODULARNY — rodzina Rotoblok, kompozycja pól; (b) tor BLOK_RMU —
   rodzina TPM Air, wybór bloku L-L-T, podgląd; (c) rodzina z długiem danych
   — uczciwy stan zerowy; wszystko × {light, dark} przez localStorage
   `mvd-theme-mode`.
3. Obejrzeć KAŻDY kadr (agent czyta pliki PNG i opisuje, co widzi — kadr
   nieczytelny/pusty = defekt do naprawy przed publikacją).
4. PNG do `docs/audit/visual/konfigurator/` (commit) + sekcja na górze strony
   oceny (wzorzec: pobierz aktualny HTML artefaktu, wstaw `<section>` po
   `</header>`, obrazy data-URI, publikuj pod TYM SAMYM adresem artefaktu).
5. STOP `[B-02]` — werdykt właściciela. Uwagi z werdyktu = karty naprawcze.

### K-B TCC-INTERAKTYWNY `[PO MERGE nN — §4.3]`
Zakres wg wiersza rejestru `N-D5-FUSE` i uzgodnień nN (rundy 5–7): wspólna
baza krzywych zabezpieczeń z adapterami N-D4 wątku nN; ekran TCC
interaktywny; test krzyżowy pasm FUSE (oferta nN z uzgodnień). Przed
zleceniem: przeczytać WIERSZ rejestru (zawiera pełną specyfikację długu) —
wiersz jest źródłem prawdy, nie ten akapit.

### K-C RATCHET-41 `[PO MERGE nN — §4.3]`
Zdjęcie jawnie zamrożonego długu z wiersza rejestru `RATCHET-DICT-READ`:
41 pozycji odczytów słownikowych w `enm/domain_operations*.py`. Procedura:
uruchomić guard fabrykacji wejść, sklasyfikować RĘCZNIE każdą pozycję
dyskryminatorem opisanym w tym wierszu (klucz = zadeklarowane pole AnnAssign
w CONTRACT_SOURCES), fabrykacje naprawić u źródła (wzorzec: trzy naprawy
z tamtej karty), pozycje legalne uzasadnić per grupa. Zakaz ślepego
rozszerzania wzorców (poprzednia próba: 73/79 fałszywych).

### K-D IEC-CURVES-DEDUP `[PO MERGE nN — §4.3]`
Dwie implementacje krzywych IEC 60255 (strona nadzoru i strona nN) → JEDNA.
Inwentarz: `grep -rn "60255" backend/src frontend/src` + porównanie modułów
krzywych w `analysis/protection_curves_it/` i odpowiedniku nN. Wybrać
implementację kompletniejszą, drugą usunąć na amen, konsumentów przepiąć,
test zgodności wartości na siatce punktów (przed usunięciem!) jako dowód
równoważności.

### K-E FUSE-TCC-KATALOG
Pasma czasowo-prądowe wkładek ETI VV (rozłącznik bezpiecznikowy z karty
`sw-fuse-eti-vv-17kv-63a`) z PUBLICZNEJ karty ETI: WebSearch/WebFetch,
transkrypcja punktów pasma do katalogu zabezpieczeń (wzorzec istniejących
krzywych w katalogu), wpięcie w `rozstrzygnij_podstawe_krzywej` (wiersz
rejestru `N-D5-FUSE` opisuje mechanizm). Zero fabrykacji: brak danych
publicznych = dług jawny z komentarzem, nie wymyślone punkty.

### K-F N1-WSADOWY `[B-02 — decyzja produktowa PRZED implementacją]`
Dług z wiersza `EKRAN-N1`: komplet N-1 dużej sieci (~67 s) biegnie
synchronicznie przy otwartym oknie. Propozycja do werdyktu właściciela:
bieg wsadowy w tle (istniejąca infrastruktura biegów) + powiadomienie
o wyniku. ZAKAZY twarde: zrównoleglenie per kontyngencja (niedeterminizm
SQLite), heurystyczne skracanie listy, wyrażanie kosztu czasem.

### K-G SLOWNIK-SLD-GLOBALNY `[B-02]`
Długi §9 dokumentu konfiguratora: rozłącznik (LBS) i wskaźnik napięcia (VPIS)
w słowniku `BayDeviceTemplate` globalnego SLD; głowica kablowa w
`BAY_TEMPLATE_TRANSFORMER`. To zmiana kanonu globalnego SLD → najpierw
werdykt właściciela, potem karta (backend `network_model/catalog/
bay_templates.py` + mapowanie symboli + testy + zrzuty).

### K-H KONWERGENCJA-ELECTRICAL `[PO T0 WĄTKU nN — sygnał w uzgodnieniach]`
Generator mini-SLD pola (S4) przechodzi na wspólną warstwę grafu
elektrycznego `ui/sld/v3/electrical/` budowaną przez program nN (jedno źródło
prawdy elektrycznej mini- i globalnego SLD — dyspozycja właściciela).
Kontrakt podglądu (`podgladRozdzielnicy`) bez zmian; wymiana wnętrza
`generatorSldPola.ts` na klienta `electrical/`; pin: scena pola z generatora
== scena pola z warstwy electrical dla tych samych danych (test równoważności
NA SIATCE przypadków: każdy rodzaj pola × każdy rodzaj aparatu).

### K-I Długi nazwane ŚWIADOMIE pozostawione (bez akcji, chyba że właściciel
zdecyduje inaczej): ~20 gołych `setActiveSpace` w ekranach ui2 (semantyka
deep-linków bez mandatu), NBA kończy się na E5 (E6–E8 bez mierzalnego
sygnału — reguła celowo nie zgaduje, przypięte testem), słownik surowych
kodów `reporting_limitations`/`quality_status` (zbiór nieograniczony),
ostrzeżenia nie tworzą NBA (semantyka kontraktu, przypięta testem).

---

## §4 WĄTEK nN — PLAN DODATKOWY

Gałąź nN: `claude/mv-design-lv-module-n0dnqr`. Kanał koordynacji: plik
`mv-design-pro/docs/nn/UZGODNIENIA_WATKOW_2026-08-13.md` (rundy numerowane;
obie strony dopisują sekcje NA KOŃCU; synchronizacja do gałęzi nadzoru:
`git fetch origin claude/mv-design-lv-module-n0dnqr && git checkout FETCH_HEAD
-- mv-design-pro/docs/nn/` + commit).

### 4.1 Stan nN (2026-08-14)
- Cel „PEŁNY WERDYKT nN" wykonany 4/4 (D1–D4 scalone u nich, bramka zielona).
- P0.8 (SLD nN) dostał od właściciela werdykt **B-02: 0/10 HARD FAIL** —
  kompozycja układała dzieci wizualne zamiast projektować graf elektryczny.
- Program naprawczy nN (BINDING dla nN):
  `mv-design-pro/docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` — najpierw dowód
  grafowy (inwarianty napięciowe, wyrocznia zgodności sceny z grafem), wygląd
  na końcu. Granice nN: `ui/sld/v3/{electrical,compose,scene}`; kanon symboli
  tylko addytywnie; `engine/` i `ui2/kreatory/stacja/**` nietykalne.

### 4.2 Zadania wykonawcy prowadzącego wątek nN (bez interpretacji)
1. Wykonać `PLAN_SLD_NN_TOPOLOGIA_2026-08.md` DOSŁOWNIE, faza po fazie,
   zaczynając od T0 (dowód grafowy). Ten plan jest ich dokumentem wykonawczym —
   niniejszy plan go NIE nadpisuje, tylko włącza przez odesłanie.
2. Po każdej fazie: commit+push własnej gałęzi, wpis rundy w uzgodnieniach
   (stan, pomiary, granice dotrzymane — z dowodami grep/diff).
3. Po odbiorze T0: zgłosić rundą gotowość warstwy `electrical/` dla
   konwergencji (odblokowuje kartę K-H po stronie nadzoru).
4. Ekrany SLD nN po każdej fazie wizualnej: zrzuty żywej aplikacji na stronę
   oceny, STOP `[B-02]` — werdykt właściciela (lekcja P0.8: bez werdyktu nie
   uznawać jakości wizualnej za dowiedzioną).
5. Utrzymywać zielone piny nadzoru (TR2W/KOMPLETNOSC, pin rejestru glifów)
   BEZ modyfikacji asercji — zmiana asercji pinu cudzej karty wymaga rundy
   uzgodnień PRZED commitem.

### 4.3 Procedura MERGE wątku nN (po merge PR #470 do main)
1. Na gałęzi nN: `git fetch origin main && git merge origin/main` —
   konflikty w plikach kanału (`docs/nn/*`, rejestr): zachować OBIE treści
   (sekcje addytywne), wiersze rejestru scalać przez dopisanie, nie nadpisanie.
2. Pełne bramki §0.5 na scalonym drzewie nN.
3. PR gałęzi nN do main; 9 workflowów zielonych; merge (zwykły merge commit).
4. PO merge nN wykonalne stają się karty: K-B (TCC-INTERAKTYWNY),
   K-C (RATCHET-41), K-D (IEC-CURVES-DEDUP) — zlecać w tej kolejności,
   każda osobnym wykonawcą, odbiór wg §0.7.

### 4.4 Nadzór nad nN (rola odbierającego)
- Czytać każdą rundę uzgodnień; odpowiadać rundą (nie zostawiać pytań bez
  odpowiedzi dłużej niż jeden cykl pracy).
- Weryfikować deklaracje granic pomiarem: `git diff --stat` ich łańcucha vs
  lista plików z granic; naruszenie = wpis do rejestru + runda.
- Nie edytować ich plików programu topologii; nasze piny w ich obszarze
  chronią nas automatycznie (pin rejestru glifów, piny TR2W/KOMPLETNOSC).

---

## §5 DEFINICJA „100% DOKOŃCZONE"

Wszystkie poniższe PRAWDZIWE jednocześnie:
1. PR #470 scalony do main (§1.2), wątek nN scalony (§4.3).
2. Karty §2 (S3, S5, BLOKI-RMU) odebrane z adnotacjami rejestru.
3. Karty §3: K-A wykonana i oceniona `[B-02]`; K-B/K-C/K-D wykonane po merge
   nN; K-E wykonana; K-F/K-G rozstrzygnięte przez właściciela (werdykt lub
   jawna rezygnacja wpisana do rejestru); K-H wykonana po T0 nN.
4. Program nN: `PLAN_SLD_NN_TOPOLOGIA` domknięty z werdyktem `[B-02]`
   właściciela na ekranach końcowych.
5. Imienna lista `RMU_BEZ_TRANSKRYBOWANYCH_BLOKOW` pusta ALBO każda pozostała
   pozycja ma w rejestrze uzasadnienie „źródło publiczne nie istnieje".
6. Pełna bateria §0.5 zielona na main po ostatnim merge; strona oceny ma
   sekcje wszystkich ekranów objętych werdyktami.

---

## §6 UZUPEŁNIENIA KOLEJKI (2026-08-14, po odbiorze S5)

Stan: karta §2.2 (S5-ENM-POLA) ODEBRANA (cherry `06ac2901`, adnotacja w wierszu
KONFIGURATOR-POL-RMU rejestru). Dwie nowe karty kolejki z długów S5:

### K-J NORMALIZACJA-NAPIEC-RODZIN
`SwitchgearFamily.voltage_levels` ma niejednorodną semantykę (Rotoblok: napięcia
SIECI 15/20; SafeRing/Rotoblok Air: klasy izolacji Um 12/17,5/24). Karta:
(1) rozdzielić na dwa jawne pola (np. `network_voltages_kv` i `um_classes_kv`)
z transkrypcją per rodzina ZE ŹRÓDŁA (karta producenta — zero zgadywania,
rodzina bez danych = None z komentarzem); (2) przepisać `family_supports_voltage`
na jednoznaczną semantykę; (3) WŁĄCZYĆ walidację napięciową w
`add_sn_bay_from_catalog` (dziś celowo wyłączona — sekcja 10 dokumentu
konfiguratora); (4) testy iloczynu (rodzina sieciowa × klasowa × brak danych).
Granice: `network_model/catalog/switchgear/**`, `enm/pole_katalogowe.py`,
testy. UWAGA: nie zlecać równolegle z BLOKI-RMU-5-RODZIN (te same pliki) —
dopiero po jej scaleniu.

### K-K POLA-V1-PRZEZ-RESOLVER `[wymaga rozstrzygnięcia inżynierskiego]`
V1 `_build_field_spec` (7 miejsc: GPZ, wstawianie stacji, sekcje) buduje pola
producenckie BEZ aparatów. Blokada: test referencyjny buduje pola GPZ na
rodzinie SafeRing (BLOK_RMU) z pojedynczej referencji szablonu — kanał zakazany
dla rodzin blokowych. Rozstrzygnięcie do podjęcia PRZED implementacją (STOP —
pytanie do właściciela albo decyzja architekta z wpisem do rejestru): (a) GPZ
używa wyłącznie rodzin o torze MODULARNYM (dane referencyjne do poprawy), albo
(b) rodziny RMU dostają jawny kanał pól GPZ. Po rozstrzygnięciu: przepiąć
7 miejsc przez resolver `pole_katalogowe`, test klasy po wszystkich 7.

---

## §7 UZUPEŁNIENIA (2026-08-14, po odbiorach S3 / BLOKI-RMU / K-K)

Stan: karty §2.1 (S3), §2.3 (BLOKI-RMU) i §6/K-K ODEBRANE (adnotacje w rejestrze).
Program KONFIGURATOR-POL-RMU domknięty S1–S5; ekrany na stronie oceny — STOP `[B-02]`.

Pułapka środowiskowa (dopisek do §0.3): `mypy_ratchet_guard.py` woła `poetry run
mypy`, a poetry wylicza nazwę venva ze ścieżki projektu — w WORKTREE tworzy pusty
venv i guard pada na braku zależności. Guard uruchamiać z głównego checkoutu;
w worktree mierzyć `$VENV -m mypy src` ręcznie i porównywać z parą próg/meta-test.

### K-L PROWENIENCJA-CONFIG-ID
`config_ref_for_template` dokleja prefiks `kanoniczny:` także referencji
producenckiej (pole katalogowe rodziny dostaje `kanoniczny:ZPUE_WLOSZCZOWA__...`).
Dziś bez skutku funkcjonalnego (`config_id` jest kluczem nieprzezroczystym — 
zweryfikowane grepem konsumentów), ale identyfikator FABRYKUJE pochodzenie.
Naprawa wg propozycji z odbioru K-K: dla pola rodziny emitować
`producent:<manufacturer_ref>:<template_ref>` wzorem
`reference_engine/field_configuration_catalog.py`; test klasy po obu
nomenklaturach; sprawdzić stabilność identyfikatora w istniejących migawkach
(zmiana wartości = wpływ na determinizm scen — jeśli tak, migracja odczytu
starych wartości albo pin odświeżony z wykazaniem źródła).

### K-M OPCJA-I-BLOK-PIERWSZEJ-KLASY (kontrakt kreator→operacje)
Dwa długi S3 wymagające backendu: (1) aparaty OPCJONALNE poza CT/VT/przekaźnikiem
(ogranicznik przepięć, VPIS) nie mają pola w kontrakcie operacji — kontrolka
zakazana phantom rule, UI pokazuje status z powodem; dodać addytywne pole
payloadu + materializację + testy. (2) `factory_configuration_ref` jedzie w
`catalog_bindings.factory_configuration` (metadane) zamiast pola pierwszej
klasy operacji stacyjnej — wyrównać do kontraktu `add_sn_bay_from_catalog`
(jedno nazewnictwo pola w obu operacjach). Granice: `enm/domain_ops_models.py`,
`enm/domain_operations*.py`, kreator stacji (odczyt pola), testy obu warstw.

### K-N MARTWA-POWIERZCHNIA-STEPPER
`ui/catalog/SwitchgearTemplateStepper.tsx` — zero konsumentów produkcyjnych
(pomiar S3), tylko własny test. Zasada inżynierska nr 1: usunąć na amen wraz
z testem; przed usunięciem grep po imporcie/lazy-route dla pewności.

### K-O HV-FUSE-CATALOG-PROWENIENCJA (dług tej samej klasy co 31,5 kA)
Frontendowy `ui/network-build/station-der/protection-catalogs.ts` (ok. linii 551,
`HV_FUSE_CATALOG`) niesie 2 punkty pasma przy 6×In BEZ proweniencji — ta sama
klasa fabrykacji, którą K-E wyczyścił z backendu. Rozstrzygnięcie wzorem K-E:
punkt bez źródła tabelarycznego producenta NIE istnieje — usunąć punkty i
poprowadzić konsumentów przez uczciwą jawną pozycję bez pasma (wzorzec
`BRAK_PASMA_BEZPIECZNIKA`); jeśli konsument wymaga pasma do działania, pokazać
stan „pasmo wymaga karty producenta". Test klasy po wszystkich pozycjach
frontendowego katalogu bezpieczników: każda wartość liczbowa ma źródło albo
pozycji nie ma. Granice: `frontend/src/ui/network-build/station-der/**` + testy.
UWAGA: dług pasma ETI VV (K-E) NIE jest zamykalny dalszym szukaniem w sieci —
nie zlecać ponownej transkrypcji bez nowych danych tabelarycznych producenta.

### K-P PROMOCJA-UNISEC (znalezisko K-J)
Oficjalny katalog ABB UniSec 1VFM200003 podaje komplet danych rodziny (rated
voltage 12/17,5/24 kV, prąd szyn 630/800/1250 A), których brakowało stronie
portfolio — rodzina może wyjść ze statusu `requires_catalog`. Warunek pełny:
transkrypcja danych rodziny ZE ŹRÓDŁA + przepisanie co najmniej jednego
kompletnego pola katalogowego (`CompleteMvBayTemplate`) z karty — promocja bez
pól nie zmaterializuje żadnego pola w kreatorze (fałszywa oferta). Granice:
`network_model/catalog/switchgear/**` + testy; wzorzec: karty RELF 2S/RXD.

---

## §8 KOLEJKA Z AUDYTU KOMPLETNOŚCI (2026-08-14; wiersz
`AUDYT-KOMPLETNOSCI-2026-08-14` w rejestrze)

Źródło: równoległy audyt (6 soczewek × weryfikacja adwersaryjna; 12 znalezisk
POTWIERDZONYCH). Z tej dwunastki DOMKNIĘTE przed spisaniem kolejki: incydent
ciemnych kadrów (naprawa + bramka pary — patrz §0.3), fabrykacje katalogowe
frontu (karta K-O, odebrana), blok RMU bez drogi zapisu (karta K-M, odebrana),
korekty dokumentów (§9 dokumentu konfiguratora, licznik końcówek i wiersze
inwentarza — commit odbiorczy 2026-08-14). Poniżej pozostałe karty — kolejność
zlecania wg wagi. Każda karta podlega KONTRAKTOWI §0 (w tym §0.7 odbiór).

### K-Q AUDIT2-KATALOGI-BEZ-PROWENIENCJI `[backend + mirror frontu]`
`backend/src/api/audit2_catalogs.py` niesie TĘ SAMĄ klasę fabrykacji, którą
K-O usunął z frontu (identyczne id pozycji, te same liczby, ci sami zmyśleni
producenci) i serwuje ją przez `/api/v1/catalog/audit2`. Autorytet danych leży
w backendzie — naprawa u źródła TAM, a 21 pozycji `catalogs.ts` z imiennym
producentem (SMA, Huawei, FIMER, Vestas, CATL, BYD…, id potwierdzone w
`mv_converter_catalog.py`) oraz `fault_current_capability_pu` wyrównać do
stanu backendu PO naprawie (strip tylko po stronie frontu = rozjazd, nie
naprawa). Reguła jak w K-O: każda wartość liczbowa ma źródło http(s)
producenta albo pozycji nie ma; brak danych = jawny brak. Przy okazji:
`catalog_version: '2024.1'` bez źródła — zastąpić wersją mierzalną (data
transkrypcji źródła), nie wymyślonym numerem. Granice: `backend/src/api/
audit2_catalogs.py`, `backend/src/network_model/catalog/**` (właściwe moduły
danych), `frontend/src/ui/network-build/station-der/catalogs.ts` + testy obu
warstw. Bramki: piny klasy po WSZYSTKICH pozycjach (wzorzec
`test_kazda_konfiguracja_ma_zrodlo_producenta`), kontrakt API bez zmian
łamiących (pola addytywne/usuwane świadomie), pełny pytest + vitest celowane.

### K-R NCRFG-NO-MODULE `[zaślepki z kodami produkcyjnymi]`
`backend/src/application/ncrfg_compliance/checker.py:248-254`: sześć testów
zgodności (T8/T10/T11/T16/T17/T18) zwraca werdykt-zaślepkę `no_module`, a
komunikat dla użytkownika (l. 76-80) zawiera kod produkcyjny `PR-16-impl` i
nazwę klasy — złamane ZASADA NR 1 (zakaz `no_module`) i zakaz kodenamów w UI.
Wykonanie MAX: zaimplementować brakujące testy dynamiczne wg właściwej normy
(NC RfG / PTPiREE) na istniejącym silniku RMS + FRT/HVRT — solver + kontrakt +
White Box + sanity-bounds + wpięcie w checker, API i ekran `ncrfg-tests`;
usunąć `no_module` z `ComplianceVerdict` (l. 17) razem z `no_module_count`
i wszystkimi konsumentami UI. Granice: `application/ncrfg_compliance/**`,
właściwe solvery RMS/FRT (rozszerzenie addytywne, FROZEN nietknięte),
`frontend/src/ui/ncrfg-tests/**`. To karta duża — jeśli którykolwiek test
normy wymaga danych, których nie ma w modelu, brak danych meldować jawnym
kodem gotowości (readiness), nigdy werdyktem-zaślepką.

### K-S PROTECTION-FRESH-NA-SZTYWNO
`backend/src/api/protection_runs.py:379-380`: nakładka zabezpieczeń ZAWSZE
melduje `result_status = "FRESH"` — obietnica FRESH/OUTDATED/NONE bez
implementacji. Naprawa: status z porównania hasza snapshotu zapisanego przy
biegu z haszem bieżącego snapshotu modelu (mechanizm istnieje dla przypadków
obliczeniowych: `frontend/src/ui/study-cases/store.ts:360`,
`StudyCaseEditor.tsx:113-115` obsługuje OUTDATED). NONE gdy brak wyniku,
OUTDATED gdy hasz różny. Test iloczynu cech: {bieg zakończony, brak biegu} ×
{model niezmieniony, model zmieniony po biegu} — 4 kombinacje, każda z
asercją statusu; ścieżka natywna (mutacja modelu operacją kanoniczną, nie
podmiana pola).

### K-T FIELD-SPEC-JEDEN-BUILDER `[resztka klasy K-M]` — **WYKONANA I ODEBRANA (2026-08-14; wiersz K-T-FIELD-SPEC-JEDEN-BUILDER w rejestrze; dlugi jawne przeniesione do kart K-X/K-Y/K-Z ponizej)**
`insert_station_on_segment_sn` cicho gubi klucze pól SN `source_status`,
`source_refs`, `bay_kind` (K-M naprawił wyłącznie kanał bloku fabrycznego;
`catalog_bindings` usunięte na amen), a `append_station_on_endpoint` składa
`field_spec` ręcznie zamiast przez `_build_field_spec` — dwie drogi, jedno
źródło rozjazdu. Naprawa klasy: dołożyć brakujące klucze do sygnatury
`_build_field_spec` (addytywnie, exclude gdy None) i OBIE operacje stacyjne
przestawić na ten builder. Test iloczynu cech: {insert, append} × {każdy klucz
niesiony osobno i wszystkie razem} × {tor MODULARNY, tor BLOK_RMU}. Granice:
`backend/src/enm/domain_operations.py` + testy enm. Migawki istniejące bajtowo
niezmienione (exclude_none).

### K-U CT-VT-WERDYKT-BRAMKUJE
`frontend/src/ui2/kryteria/SekcjaBilansuCtVt.tsx`: werdykt bilansu CT/VT
(PASS/FAIL) jest ozdobą — nie wraca do kreatora i niczego nie bramkuje przed
zapisem stacji. Naprawa: callback werdyktu per pole w
`SekcjaBilansuCtVtProps`, zbiór werdyktów w kreatorze, bramka kroku 4:
FAIL = blokada zapisu z komunikatem i wskazaniem pola; UNAVAILABLE =
ostrzeżenie z kodem gotowości. Test ścieżką natywną: pole z CT dającym FAIL →
przycisk zapisu niedostępny (bez wymuszania stanu store). Zero fizyki w UI —
werdykt liczy backend, UI tylko go egzekwuje.

### K-V MARTWE-WYSPY-UI `[klasa K-N — precedens c4669cea]`
Inwentarz zmierzony audytem: (1) `ui/catalog/CatalogMaterializationDialog.tsx`
— 337 linii, zero referencji w repo, bez własnego testu; (2)
`ui/catalog/ManufacturerPicker.tsx` + predykaty statusu producenta — martwa
wyspa, przy czym żywy kreator stacji milcząco gubi status producenta; (3) po
K-O: `SPZ_CATALOG`, `SZR_CATALOG`, `PROTECTION_FUNCTION_CATALOG`,
`selectHvFusesForRating` w `station-der/**` — zero konsumentów produkcyjnych.
Rozstrzygnięcia (bez interpretacji): (1) PRZED kasacją zmierzyć, czy podgląd
materializacji katalogowej jest dostarczany gdziekolwiek indziej — jeśli NIE,
kasacja + osobna karta luki funkcjonalnej do planu; (2) status producenta MA
być widoczny (kontrakt backendu niesie pole `status`) — wpiąć
`describeManufacturerStatusPl` jako plakietkę producenta w
`KreatorStacjiSnNn.tsx` (okolice l. 1767-1780) i skasować pickera z testem i
nieużywanymi predykatami; (3) kasacja na amen — funkcje SPZ/SZR mają kanał
katalogowy w backendzie, resztki frontowe bez konsumenta to duplikat klasy
K-Q. Po każdej kasacji: type-check, lint, vulture_guard, dead_click_guard.

### K-W SLD-AUDYT-POLARYZACJA-MOTYWOW — **WYCOFANA (znalezisko OBALONE
pomiarem, 2026-08-14)**
Diagnoza wstępna („odwrócona polaryzacja motywów") była błędna DWUKROTNIE:
pomiar sha256 pokazuje, że pary L0/L1/L2 w `docs/audit/visual/sld_audyt/` są
bajtowo IDENTYCZNE (obie strony ciemne), a to jest **przypięty testem
niezmiennik, nie defekt**: kanwa v3 ma STAŁE tło techniczne
(`CANVAS_BACKGROUND = '#0B0F14'` w `sld/v3/theme/colorTokens.ts`) — rysunek
techniczny świadomie NIE reaguje na motyw interfejsu. Test
`niezmiennik: kanwa techniczna jest NIEZALEZNA od motywu` w
`e2e/sld-audyt-powykonawczy-screenshot.spec.ts` (który wprost ostrzega, że
identyczność par raz już błędnie zdiagnozowano jako defekt renderu) wymusza
decyzję przy każdej zmianie tego zachowania. ŻADNEJ akcji — regeneracja
„naprawiająca" pary złamałaby przypięty niezmiennik. Lekcja: przed
zakwalifikowaniem duplikatu kadrów jako fabrykacji sprawdź, czy identyczność
nie jest przypiętym niezmiennikiem danego materiału (incydent konfiguratora
dotyczył ekranów APLIKACJI, które motywom podlegają; kanwa techniczna SLD —
nie).

### K-X KASACJA-CATALOG-BINDINGS `[dlug K-T]`
`catalog_bindings.switchgear_template` w specyfikacji pola nie ma ANI JEDNEGO
czytelnika (grep backend + frontend, pomiar K-T) — martwy duplikat danych,
ktore obie drogi niosa jako klucze pierwszej klasy. Kasacja na amen: przestac
ZAPISYWAC klucz w nowych migawkach (koniec ciagu) i usunac emisje po stronie
kreatora; istniejace migawki pozostaja nietkniete (czytelnika nie ma, wiec
stary klucz w starych migawkach jest bezpiecznie ignorowany). Testy: pin
nieobecnosci klucza w NOWYCH specyfikacjach obu drog + pin, ze stare migawki
z kluczem dalej sie wczytuja. Granice: `enm/domain_operations.py`,
`ui2/kreatory/stacja/**`, `types/domainOps.ts` + testy.

### K-Y PROWENIENCJA-W-INSPEKTORZE `[dlug K-T]`
Metadane pochodzenia pola (source_status, source_refs, bay_kind) sa po K-T w
modelu obiema drogami, ale inspektor pola ich NIE pokazuje — proweniencja
widoczna tylko w pickerze szablonow przed zapisem. Wpiac do inspektora pola
sekcje pochodzenia danych szablonu (status zrodla po polsku, lista referencji
zrodlowych klikalna, rodzaj pola) — uczciwy stan zerowy gdy metadanych brak
(stare migawki). Zero fizyki; wylacznie prezentacja danych modelu. Testy
sciezka natywna: pole z metadanymi pokazuje komplet, pole bez metadanych
pokazuje jawny brak.

### K-Z TYP-SNFIELDSPEC-FRONT `[dlug K-T]`
Frontowy typ kontraktu `SNFieldSpec` w `types/domainOps.ts` deklaruje tylko
`field_role` + `catalog_bindings`, a kreator wysyla 12 kluczy (pomiar K-T) —
typ klamie o drucie. Uzupelnic typ do stanu faktycznego emisji (backendowy
odpowiednik juz uzupelniony przez K-T o 8 kluczy realnie czytanych),
skoordynowac z K-X (po kasacji catalog_bindings typ nie moze go deklarowac).
Bramka: type-check RC=0; pin zgodnosci kluczy typu z kluczami emisji
zbudujPolaSnZWpisow (test czyta oba zbiory i porownuje).

### Sygnały PLAUSIBLE (zmierzyć przy zleceniu — NIE są potwierdzone)
Z surowej listy 35 znalezisk audytu weryfikację adwersaryjną przeszło 12;
poniższe sygnały weryfikacji nie przeszły albo nie zostały do niej
skierowane. Przy zlecaniu kart z tej sekcji NAJPIERW pomiar, potem praca —
sygnał niepotwierdzony nie jest długiem: przeznaczenie uzwojeń VT
(winding purpose) niezapisywane; persystencja obwodów wtórnych CT/VT;
kontrolka EN bez pokrycia w backendzie (phantom); puste zakładki inspektora
bez uczciwego stanu zerowego; `i_from_ka`/`i_to_ka` w wynikach zwarciowych;
kasacja `cell_type`; `SHELL_EVENT_CONTRACT` i beczka eksportów bez
konsumentów; zapis konfiguracji zabezpieczeń ufa frontendowi (walidacja
po stronie backendu do zmierzenia).
