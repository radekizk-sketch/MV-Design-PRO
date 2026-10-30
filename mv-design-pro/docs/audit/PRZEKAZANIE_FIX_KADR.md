# Przekazanie karty FIX-KADR-NIESTABILNY

Gałąź `claude/mv-design-pro-twin-audit-u4lhy0-fix-kadr` (baza `ab750bdc6`), drzewo `/home/user/wt-lom`.

## Przyczyna (ustalona)

Test `frontend/src/ui/sld/v3/canvas/__tests__/kadrowanieWidoku.workspace.test.tsx`, „drogi pewna
i warunkowa” (dawna linia 528), czekał na pojawienie się komunikatu kadru, a zaraz potem porównywał
`viewBox` z kadrem sprzed akcji.

W produkcie komunikat i żądanie kadru wchodzą w jednym renderze (`useKadrowanieWidoku.ts`,
`wykonajKadr`). Kamera przelicza kadr dopiero w efekcie kanwy na `zadanieKadru.seq`
(`SldCanvasV3.tsx`, efekt „K2 (UI-04): KADR zakresu pracy”), czyli w następnym renderze.

Zieleń testu zależała od tego, czy planista Reacta zdąży wykonać ten drugi render przed jednym
tikiem `setTimeout(0)`. Tym tikiem `asyncWrapper` z `@testing-library/react` 14.3.1 kończy `waitFor`
(`dist/pure.js:84-100`). Planista dzieli pracę na plasterki około 5 ms, mierzone
`performance.now()`. Pod obciążeniem procesora render kanwy przekracza plasterek, planista oddaje
wątek i odczyt łapie `viewBox` sprzed przeliczenia.

To nie jest defekt produktu: stan końcowy kadru nie zależy od kolejności ani od czasu.

## Inwentarz klasy

Przegląd objął porównania `not.toBe` / `not.toEqual` po akcji asynchronicznej w testach `ui/sld`,
`ui/sld-editor`, `ui/sld-overlay`, `ui2` i `engine/sld-layout`. Takie porównanie z `await` ma
17 plików. Jedynym porównaniem stanu „przed/po” po akcji asynchronicznej bez czekania na warunek
jest ten test.

Pozostałe pliki porównują jedną z trzech rzeczy:

- stałe;
- wyniki funkcji czystych;
- stan po akcji synchronicznej (`fireEvent` / `userEvent` w `act`) albo po `waitFor` na tym samym
  warunku.

Lista plików i oceny są w meldunku karty. Asynchroniczną kamerę w testach SLD ćwiczą jeszcze
`lvDomainPortal.test.tsx` i `workspacePanels.test.tsx`, ale tam kadr zmienia się w akcji
synchronicznej, więc nie należą do tej klasy.

## Co zrobione (zmiana tylko w pliku testu)

- **Test pozytywny** czeka na sam warunek: `await waitFor(() => expect(viewBox).not.toBe(przed))`.
- **Testy „kamera stoi”** (brak drogi, błąd HTTP) czekają na koniec żądania toru. Warunkiem jest
  ponowna aktywność pozycji menu „Tor zasilania”, bo `torWToku` jest zdejmowane w `finally`. Dopiero
  potem test sprawdza kadr.
- **Iloczyn trybów planisty:** blok toru biegnie w `describe.each` po dwóch trybach — planista
  zwykły oraz planista oddający wątek po każdej jednostce pracy. W drugim trybie `performance.now`
  przesuwa się o 50 ms przy każdym odczycie, co deterministycznie odtwarza obciążony procesor.

## Dowody

- **Iniekcja deterministyczna:** dawne czekanie w trybie oddającym wątek daje RC=1 z dokładnie tym
  samym `AssertionError` co w bramce. W trybie zwykłym ta sama iniekcja jest zielona.
- **Bieg samodzielny po naprawie:** RC=0, 47 z 47 testów.
- **20 biegów całego pliku pod obciążeniem** (5 rund po 4 równoległe vitest i 2 procesy `node`
  w pętli, load około 20–30 na 4 vCPU): 0 czerwonych, każdy bieg 47 z 47.
- **Ta sama iniekcja pod realnym obciążeniem:** 0 czerwonych na 20. Wyścig w realnym obciążeniu
  jest rzadki — w bramce zdarzył się raz — dlatego dowodem iniekcji jest tryb deterministyczny.
- **Pomiar wcześniejszej wersji poprawki, jeszcze bez trybów planisty, pod skrajnym obciążeniem**
  (6 procesów obciążających przy load 14, oraz 4 równoległe vitest i 2 procesy obciążające): 5 razy
  „Test timed out in 5000ms” w teście „drogi pewna…”. Plik był wtedy 4–12 razy wolniejszy niż
  w bramce. To limit czasu testu vitest, a nie wyścig; karta zakazuje podnoszenia timeoutu.
- **Pozostałe sprawdzenia:** `tsc` RC=0, `eslint` na pliku RC=0.

## Pierwszy krok dla następcy

Uruchom `scripts/guardy_z_ci.py` z `backend/`, pod `flock`. Bieg przerwałem poleceniem STOP przed
jego końcem. Gdy wyjdzie zielony, zrób końcowy commit bez prefiksu WIP.
