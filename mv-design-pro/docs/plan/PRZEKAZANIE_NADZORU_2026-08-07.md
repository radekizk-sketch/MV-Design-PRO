# PRZEKAZANIE NADZORU — 2026-08-07 (BINDING dla sesji przejmującej)

Dokument przekazania nadzoru nad programem napraw SLD/G-09 dla następnej sesji
(wykonawca-nadzorca: Opus). Cel: dokończyć BEZ dryfu i BEZ zgadywania — wszystko,
czego nie ma w tym dokumencie, jest w rejestrze (`docs/v12xx/REJESTR_KONFLIKTOW.md`)
i w audycie (`docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`); w razie konfliktu rejestr wygrywa.

## 1. STAN (2026-08-07 ~10:00 UTC)

- Gałąź nadzorcy: `claude/przejecie-nadzoru-fable-dtie3b`, szczyt **`1ca9c70b`**, CI **8/8 zielone**
  (potwierdzone także dla `bf6994e3`). Origin jest JEDYNĄ prawdą — po każdym restarcie kontenera
  `git fetch` + reset lokalnej gałęzi do origin.
- Scalone dziś po niezależnych odbiorach (każda karta: własna iniekcja nadzorcy + pełne bramki
  drzewa łączonego + dopisek odbioru w wierszu rejestru): **S9-10** (cykl e2e, deviceRef→inspektor,
  kotwica LOD), **ROUTERY-4A** (4 łańcuchy analiz; macierz §6 do 1❌), **S9-11** (pętla wyników
  W-3/W-4/W-5/W-6/P-8), **POMIAR-RODZAJ** (taksonomia układów pomiarowych ZE standardu [E-UP]
  po erracie V12K-336; brama tranzytu na wszystkich drogach; walidacja 5 MW), **S9-12**
  (oznaczniki F wg PN-EN 81346-2, klasa C-8, zamknięcia C-3/C-5/C-7/C-9/C-13/P-4).
- Decyzje właściciela dnia: **V12K-335** (1: cel gęstości >5% wycofany, jedna kotwica zostaje;
  2: rodzaj pomiaru w modelu; 3: ograniczniki = rodzina F) i **V12K-336** (ERRATA: taksonomia
  pomiarów wyłącznie ze standardu — lista zamknięta podstawowy/rezerwowy/równoważny/kontrolny,
  kontrolny dla obiektów > 5 MW, pole pomiarowe szyn GPZ = pomiar NAPIĘCIA, nie energii).
  KAŻDĄ przyszłą decyzję kompozycji rozdzielnic/pomiarów weryfikuj ze standardem OSD
  (wyciąg: scratchpad `enea_pomiarowe.txt`; źródło [E-UP] 05.2022-2), nigdy z pamięci.

## 2A. AKTUALIZACJA — PRZEJĘCIE DOWODZENIA (2026-08-07, Opus)

Dowodzenie przejął Opus na dyrektywę właściciela. Zmiany wobec §2 niżej (który opisuje
stan sprzed przejęcia i zostaje jako zapis historyczny):

- **S9-13 i BATCH-ROUTER ODEBRANE I SCALONE** (odbiory z własnymi iniekcjami nadzorcy):
  S9-13 zamknęła W-8 i klasę KLIENT-BEZ-DOSTAWCY dla `sldDeltaOverlay`; BATCH-ROUTER
  obalił tezę inwentarza — niewpięte routery **fabrykowały wyniki** (bieg kończony
  wartościami z żądania klienta, sztuczny ślad = naruszenie WHITE BOX), więc fantomy
  usunięto u źródła, a seria przebiegów liczy się teraz biegami kanonicznymi.
- Szczyt: **`3f056860`**, CI **8/8 zielone**.
- **FALA 2 W BIEGU** (strefy rozłączne, protokoły §3–§4 bez zmian):
  `kopia/B-2` (kotwiczenie kamery na zmianie — wiersz B-2 audytu),
  `kopia/PACK-DOWODY` (cztery końcówki pakietów dowodowych bez konsumenta — §6 macierzy),
  `kopia/XLSX-IMPORT` (ostatni ❌ macierzy; domknięcie zeruje kolumnę ❌).
- Zmiana protokołu bramek: przy TRZECH równoległych wykonawcach pełny vitest dzielimy
  na **4 shardy** (`--shard=k/4`) — przy dwóch wystarczały 2, przy trzech rywalizacja
  o CPU wywracała bieg na limicie 10 min (RC=143 = SIGTERM limitu, nie defekt).
- **POTWIERDZONY TRYB AWARII (2026-08-07, drugie wystąpienie)**: restart kontenera
  potrafi cofnąć LOKALNE repo do starszej migawki dysku (zmierzone: HEAD wrócił z
  `3f056860` na `101378c2`, czyli sprzed całej fali, przy CZYSTYM drzewie roboczym —
  więc bez `git status` wygląda to na stan poprawny). Origin był nietknięty. Procedura:
  `git fetch` → porównaj `origin/<gałąź>` z HEAD → `git checkout <gałąź> && git reset
  --hard origin/<gałąź>`. Worktree wykonawców zakładane z `origin/...` po restarcie są
  poprawne. **Każda runda nadzoru zaczyna się od tego porównania.**
- **FALA 3 (po odbiorach fali 2)**: V126-OKNA; Reference Engine — wybór pakietu
  (`fetchReferencePacks` ma konsumenta wyłącznie w teście, ekran zgodności ma zaszyte
  `PAKIET_OSD = 'osd_enea'`, `ZgodnoscReferencyjna.tsx:30`); S9-12-DLUG-LATERAL-ETYKIETA;
  reszta klasy KLIENT-BEZ-DOSTAWCY; B-5 (kontrakt kopii, V12K-325).

## 2. W BIEGU — DWIE KARTY DO ODEBRANIA (stan sprzed przejęcia — historyczny)

| Karta | Kopia | Zakres | Odbiór — na co zwrócić uwagę |
|---|---|---|---|
| **S9-13** | `kopia/S9-13` | W-8: porównanie A/B z kanwy; reużycie osieroconego store `sldDeltaOverlay` (klasa KLIENT-BEZ-DOSTAWCY, V12K-326); zero fizyki w UI (delta = prezentacja dwóch liczb backendu) | iniekcja w świeżość nakładki (stale-badge musi czytać `rewizjaBiezacegoModelu` z S9-11 — NIE liczyć osobno); sprawdź czy nowa końcówka (jeśli jest) przeszła route_prefix + api_lifecycle; zrzuty dla właściciela |
| **BATCH-ROUTER** | `kopia/BATCH-ROUTER` | wpięcie `api/batch_execution.py` (8 końcówek) + `api/case_runs.py` do `main.py` + powierzchnia serii przebiegów w ui2/obliczenia | NIE wpinać martwych końcówek dla wpięcia (fantom); iniekcja w stan zerowy powierzchni albo w kontrakt jednej końcówki; pełny pytest + zapadka mypy (backend) |

Wykonawcy znają protokół §0 (jest w ich promptach). Meldunki przyjdą jako powiadomienia.

## 3. PROTOKÓŁ ODBIORU KARTY (sprawdzony ~15 razy — NIE zmieniać)

1. `git fetch origin kopia/<KARTA>`; zweryfikuj twierdzenia meldunku diffem
   (`git diff --stat/--name-only BAZA..FETCH_HEAD`; „backend nietknięty" ⇒ grep 0 plików backend/).
2. Cherry-pick commitów kopii na szczyt. Konflikt rejestru = ZAWSZE keep-both
   (python: wytnij markery, wiersz przychodzący NAD wierszem HEAD). Jeśli commit kopii dodał
   do indeksu ścieżkę spoza zakresu (precedens: SYMLINK node_modules w S9-11) — `reset --soft`
   do szczytu + `git rm --cached` + JEDEN commit squash z uczciwym opisem (granulacja zostaje na kopii).
3. WŁASNA INIEKCJA w róg NIEpokryty iniekcjami wykonawcy. Sprawdzone wzorce dnia:
   drugi koniec pary predykatów (scena↔kanwa, compose↔wyrocznia), mocna deklaracja
   z docstringa/komentarza bez przypiętego testu (znaleziono 1 realną lukę: pin wykluczenia
   `connection_conditions` z odcisku — domknięta przy odbiorze). Procedura: `cp plik plik.KOPIA`
   + sha256 przed; przywrócenie WYŁĄCZNIE z kopii pliku; diff sha po. Iniekcja MUSI dać czerwień,
   inaczej deklaracja nie ma strażnika — wtedy dopisz brakujący pin sam (zero-debt).
4. Bramki drzewa łączonego (RC ZAWSZE bezpośrednio: `cmd > log 2>&1; echo $? > plik.rc`):
   - frontend: pełna suita w **SHARDACH ≤2** (`npx vitest run --no-file-parallelism --shard=k/2`;
     limit narzędzia 10 min/komendę — pełny bieg pod obciążeniem NIE mieści się, RC=143=SIGTERM
     limitu, nie defekt), `npm run accept:sld-v3` (ALL PASS), type-check, lint;
   - backend dotknięty: pełny pytest + `python scripts/mypy_ratchet_guard.py` (próg 18/13;
     spadek długu ⇒ obniż próg POMIAREM w guardzie ORAZ teście-pinezce `tests/ci/test_mypy_ratchet_guard.py`);
   - guardy ZAWSZE z katalogu `mv-design-pro/` (inny cwd = fałszywe RC=2).
5. Dopisek „ODBIOR NIEZALEZNY" do wiersza karty w rejestrze (python surgery, wzór: wiersze
   S9-10…S9-12), commit `-F plik` (NIGDY inline -m z polskimi cudzysłowami), push na gałąź nadzorcy.
6. Karta zmienia rysunek ⇒ zrzuty (oba motywy) do `docs/sld/audyt-2026-08/` + dostarczenie właścicielowi.

Stopka KAŻDEGO commita (dokładnie te dwie linie, autor `-c user.name="Claude" -c user.email="noreply@anthropic.com"`):
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SQrF1rEGrDZ4E8gehUeRZk
```

## 4. PROTOKÓŁ TRWAŁOŚCI ŚRODOWISKA (twarde zakazy — złamania kosztowały godziny)

- **pkill/killall po wzorcu tekstowym ZAKAZANY** — kill wyłącznie po własnym zapisanym PID.
- **node_modules**: główne repo (`mv-design-pro/frontend/node_modules`) MUSI być realnym
  katalogiem; worktree wykonawcy dostaje WYŁĄCZNIE symlink DO niego. Wykonawca, który przenosi
  katalog albo tworzy symlink-cykl, wywraca wszystkie bramki (RC=216). `.gitignore` łapie już
  także symlink (wzorzec bez ukośnika).
- Iniekcje NIGDY podczas biegnącej pełnej suity; przywracanie z KOPII PLIKU, nie `git checkout`.
- Restart kontenera: origin = prawda; wykonawcy budzeni SendMessage („zabezpiecz pracę: commit
  wip + push -f na kopię, kontynuuj"); kopie `kopia/*` zawsze przeżywają.
- Subagent NIE dostaje powiadomień o zadaniach tła — każe mu się pracować SYNCHRONICZNIE;
  jeśli mimo to zamilkł „czekając", obudź SendMessage z instrukcją odczytu RC z plików.
- Wartownik (Monitor 28 min, przezbrajany po timeout): sygnatura cofnięcia szczytu
  (`merge-base --is-ancestor TIP origin/...`), symlink node_modules, mtime transkryptów
  wykonawców >25 min. W TRYBIE OSZCZĘDNYM emituj TYLKO alarmy (bez echa ruchu kopii).

## 5. KOLEJKA DO 100% (kolejność wg wartości; sekwencjonowanie wg kolizji plików)

1. Odbiory S9-13 i BATCH-ROUTER (pkt 2).
2. **B-2 kotwiczenie kamery** (audyt §4.3): po wstawieniu stacji kamera utrzymuje obiekt
   wstawiony w kadrze (ogon +752 j.św. wyjeżdża z kadru). PO scaleniu S9-13 (kolizja kanwy).
3. **V126-OKNA** (inwentarz §6 wiersz „Pakiet akademicki V12.6", ◐): 12 rodzajów analiz E-40…E-50
   ma JEDNĄ zastaną powierzchnię `V126AcademicSurface.tsx` (334 w., zero testów, ślad ucięty
   do 8 kroków, raport do 3 sekcji, kolory poza tokenami) — okno w ui2 wg kontraktu ekranu
   prowadzącego, pełny ślad/raport, testy.
4. **PACK-DOWODY** (TOP G-09; doprecyzuj zakres z macierzy §6 inwentarza — wiersze pakietów
   dowodowych ze statusem ◐; nie zgaduj: przeczytaj wiersz przed napisaniem karty).
5. **Import XLSX — ostatni ❌ macierzy**: końcówka `POST /api/import/xlsx` działa, front ma
   ZERO odwołań — zbuduj konsumenta w ui2 (miejsce: przestrzeń danych/projektu) z realną ścieżką testową.
6. **KLIENT-BEZ-DOSTAWCY** (klasa z V12K-326, 6 modułów / 22 ścieżki): po S9-13 zaktualizuj
   inwentarz klasy (sldDeltaOverlay powinien zejść z listy) i domknij pozostałe.
7. **S9-12-DLUG-LATERAL-ETYKIETA**: etykieta lateralnego VT przegrywa w declutterze z ES
   w tej samej kolumnie X (pin 405/406 w teście; naprawa = geometria kolumny lateralnej).
8. Dług kontraktowy B-5 (koszt `apply` liniowy — zmiana kontraktu kopii, zarezerwowana V12K-325);
   nested branch points + punkt odgałęźny za GPZ (stopNote); menu punktu odgałęźnego
   (najpierw zweryfikuj realne operacje domenowe); SA→F: sprawdź czy wiersz V12K-329 wymaga
   aktualizacji po S9-12.

## 5A. FALA 3 — FAKTY ZMIERZONE Z GÓRY (2026-08-07, Opus; nie mierzyć ponownie)

Pomiar wykonany w repo głównym na szczycie `aa053500`, żeby karty fali 3 poszły bez
rozpoznania od zera. Liczby są stanem PRZED dla tych kart.

**V126-OKNA** (wiersz „Pakiet akademicki V12.6" §6 inwentarza, ◐):
- Powierzchnia zastana `frontend/src/ui/workspace/surfaces/V126AcademicSurface.tsx` —
  **334 wiersze, ZERO testów** (brak pliku w `surfaces/__tests__/`); osiągalna przez most
  „Pozostałe analizy"; wg wiersza macierzy ślad ucięty do 8 kroków, raport do 3 sekcji,
  kolory poza tokenami `--mvd-*`.
- Backend `backend/src/api/v126_academic.py` (prefiks `/api`, wpięty) niesie SIEDEM
  rodzin końcówek — to jest kontrakt, z którego wyprowadza się kompletność okien:
  `POST /api/cases/{case_id}/runs/v126/{analysis_type}` (uruchomienie),
  `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}` (wynik),
  `…/{analysis_type}/trace` (ŚLAD — pełny, nie 8 kroków),
  `…/ssci_impedance/stability` (dedykowany wynik SSCI),
  `…/{analysis_type}/proof` (DOWÓD), `…/{analysis_type}/report` (RAPORT),
  `GET /api/catalog/v126/{namespace}` (katalog danych wejściowych).
- Wzorzec do REUŻYCIA (jedna z 12 analiz ma już własne okno ui2): `frontend/src/ui2/wyniki/ssci/`
  (`EkranSsci.tsx` + `api.ts`). Karta ma zmierzyć, które z 12 rodzajów mają okno, a które
  jadą na powierzchni zastanej, i domknąć różnicę wzorcem SSCI + lądowiskiem wyników K3.

**REF-PAKIET** (wiersz „Reference Engine" §6, ◐ — zaszyty pakiet zamiast wyboru):
- `frontend/src/ui2/spaces/model/ZgodnoscReferencyjna.tsx:30` → `const PAKIET_OSD = 'osd_enea';`
  użyte w `:83` (`fetchReferencePack(PAKIET_OSD)`) — ekran zgodności ma pakiet ZASZYTY.
- `frontend/src/ui2/referencje/api.ts:67` → `fetchReferencePacks(...)` (lista `/api/reference/packs`,
  wspiera filtr rodzaju, np. `'manufacturer'`) ma konsumenta **wyłącznie w teście**
  (`ui2/referencje/__tests__/api.test.ts:73,79`).
- Karta: wybór pakietu z listy backendu w obu miejscach zgodności (`spaces/model/ZgodnoscReferencyjna`
  ORAZ `spaces/gotowosc/SekcjaZgodnosciReferencyjnej` — sprawdzić, czy ma tę samą zaszytą stałą:
  KLASA, nie instancja), uczciwy stan zerowy (brak pakietów), pamięć wyboru wg zasad przypadku.

OTWARTE DECYZJE PRODUKTOWE WŁAŚCICIELA (nie rozstrzygać samodzielnie; AskUserQuestion gdy aktywny):
- ujednolicenie podziałki pól L1/L2 (S9-10 pkt C: dwie drogi z kosztami — rezerwacja szerokości
  L2 na L1 poszerza arkusz vs ściśnięcie L2 nakłada aparaty);
- edycja ról istniejących pól mogąca rozbroić pętlę OSD złącza C (dług POMIAR-RODZAJ pkt 1).

## 6. DEFINICJA „100% URUCHOMIENIA"

1. Wszystkie karty z pkt 2 i pkt 5.1–5.6 scalone po odbiorach; CI 8/8 zielone na szczycie.
2. Macierz pokrycia §6 inwentarza: **zero ❌** (uczciwie — ◐ dopuszczalne wyłącznie z jednym
   zdaniem czego brakuje i wpisem w kolejce).
3. Audyt SLD: wszystkie wiersze znalezisk ZAMKNIĘTE / CZĘŚCIOWO z nazwanym długiem w rejestrze
   (żadnego wiersza bez statusu).
4. Zapadka mypy: próg ≤ 18/13 (nigdy podniesiony bez erraty właściciela).
5. Rejestr: każda karta ma wiersz + dopisek odbioru; każdy dług imienny ma właściciela w kolejce.
6. Zrzuty żywej aplikacji (oba motywy) dostarczone właścicielowi po każdej zmianie rysunku.

## 7. SZABLON PROMPTU WYKONAWCY (kopiuj i wypełniaj — sprawdzony na 7 kartach)

```
Jesteś WYKONAWCĄ karty <NAZWA> w /home/user/MV-Design-PRO. Pracujesz wyłącznie po polsku.
Przeczytaj CLAUDE.md — obowiązują: Zero-Debt, KLASA-NIE-INSTANCJA, zakaz fantomów, zakaz
fizyki w UI, polskie etykiety, zakaz kodenamów, determinizm, FROZEN nietknięte.
Kontekst: <wiersze rejestru/audytu/inwentarza — DOKŁADNE ścieżki i numery>.

§0 PROTOKÓŁ TRWAŁOŚCI:
1. NAJPIERW fetch origin claude/przejecie-nadzoru-fable-dtie3b i worktree add
   /tmp/claude-0/-home-user-MV-Design-PRO/wt-<karta> origin/claude/przejecie-nadzoru-fable-dtie3b.
   Pracuj TYLKO w worktree.
2. Po KAŻDYM commicie: git push -f origin HEAD:kopia/<KARTA>. Autor i stopka: patrz §3 dokumentu
   przekazania (dwie linie Co-Authored-By/Claude-Session, commit -F plik).
3. RC bezpośrednio; długie komendy SYNCHRONICZNIE; pełny vitest w SHARDACH ≤2 (limit 10 min).
4. ZAKAZ pkill po wzorcu. 5. Iniekcje: kopia pliku + sha256, przywracanie TYLKO z kopii.
6. node_modules: TWARDY ZAKAZ operacji na katalogu głównego repo — w worktree WYŁĄCZNIE
   symlink DO niego. 7. Guardy z katalogu mv-design-pro/.

ZAKRES (pomiar przed projektem): <1..N punktów; każdy z kryterium PRZED zmierzonym;
inwentarz KLASY przed naprawą; reużycie przed budową; mocne deklaracje = przypięte testy>.
STREFY ZAKAZANE: <pliki równoległych kart>.
BRAMKI KOŃCOWE (RC bezpośrednio): <vitest shardy / pytest+zapadka / accept / tc / lint / guardy>.
DOKUMENTY: wiersz | <KARTA> | w rejestrze (stan PRZED zmierzony, inwentarz, naprawy, iniekcje,
bramki z RC) + aktualizacja audytu/macierzy. MELDUNEK: obalone/potwierdzone, przed/po,
iniekcje, bramki z RC, świadome pominięcia. Commity WYŁĄCZNIE na kopia/<KARTA>.
```

## 8. REJESTR ZMIAN DOKUMENTU

- 2026-08-07: utworzony na dyrektywę właściciela („przygotuj spec i prompty tak, żeby Opus
  dokończył bezbłędnie, bez dryfu i bez zgadywania — do 100% uruchomienia") przy wyczerpującym
  się budżecie sesji nadzorcy Fable.
