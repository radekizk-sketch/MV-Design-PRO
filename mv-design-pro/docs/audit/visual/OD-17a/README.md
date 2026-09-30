# Zrzuty karty OD-17a — sekcja „Ocena zgodności referencyjnej” w przestrzeni gotowości

Żywa aplikacja (prawdziwy backend), spec `frontend/e2e/ref-pakiet-zrzuty.spec.ts` z katalogiem
wyjścia przekierowanym tutaj; `przed/` — baza `d6c26c3f`, `po/` — gałąź karty; oba motywy.

Przypadek speca ma operatora domyślnego z pakietem wymagań w rejestrze (Enea), więc raport
przypadku nie niesie odmowy braku pakietu — zrzut „po” pokazuje stan „pakiet operatora obecny”
(ocena pakietów norm i producentów oraz wyłącznie pakietu OSD operatora przypadku). Ścieżka
odmowy `BRAK_PAKIETU_OSD:<operator>` (rekord `braki_pakietow` renderowany komponentem
`ui2/referencje/BrakiPakietowDanych.tsx`, 422 z polem `kod` przy jawnym żądaniu pakietu) jest
dowiedziona testami `backend/tests/network_model/test_odmowa_braku_pakietu.py`,
`backend/tests/api/test_odmowa_braku_pakietu_api.py` i
`frontend/src/ui2/spaces/gotowosc/__tests__/sekcjaZgodnosciReferencyjnej.test.tsx`, nie zrzutem.
Werdykt wizualny należy do właściciela.
