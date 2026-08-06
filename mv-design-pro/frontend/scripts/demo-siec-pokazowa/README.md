# Sieć pokazowa — pomiar rozliczeniowy w odgałęzieniu

Zestaw skryptów wielokrotnego użytku do scenariusza z kontraktu domenowego
`mv-design-pro/docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`: magistrala OSD ze
stacjami dystrybucyjnymi wciętymi przelotowo + dwóch klientów SN (przemysłowy i
typowy 1000 kVA „+ pomiary") przyłączonych ODGAŁĘZIENIAMI od punktów ZKSN.

| Plik | Do czego służy | Wymaga |
|---|---|---|
| `seed.py` | Buduje sieć w ŻYWEJ aplikacji (projekt + przypadek + biegi SC/PF) przez REST. Tryb `--tryb po` idzie realną końcówką `/api/station-templates/{id}/apply`. Tryb `--tryb przed` to SONDA: próbuje zbudować układ sprzed karty POMIAR-ODGAŁĘZIENIE (klient wcięty przelotowo) i wymaga odmowy bramy `station.insert.pomiar_w_torze_tranzytu`. | działający backend (`BACKEND_URL`, domyślnie `http://127.0.0.1:8000`) |
| `generate-fixture.py` | Emituje BAJTOWO STABILNĄ fixturę ENM tej samej sieci (`TestClient` w procesie, bez serwera) do testów rysunku. | środowisko poetry backendu |
| `render.tsx` | Zrzuty „przed/po" produkcyjną kanwą v3, oba motywy. | `npx vite-node` + `scripts/rasterize.mjs` |

## Typowy przebieg

```bash
# 1. sieć w żywej aplikacji
cd mv-design-pro/frontend
BACKEND_URL=http://127.0.0.1:8000 python scripts/demo-siec-pokazowa/seed.py \
    --tryb po --wynik /tmp/po.json --enm /tmp/po.enm.json

# 1b. sonda: układ sprzed karty MUSI zostać odrzucony przez bramę kontraktu
BACKEND_URL=http://127.0.0.1:8000 python scripts/demo-siec-pokazowa/seed.py \
    --tryb przed --wynik /tmp/przed.json

# 2. fixtura testów rysunku (bez serwera; regeneracja po zmianie modelu)
cd ../backend && poetry run python ../frontend/scripts/demo-siec-pokazowa/generate-fixture.py

# 3. zrzuty, oba motywy (bez POMIAR_ODG_PRZED renderuje sam wariant „po")
cd ../frontend
CANON_OUT=/tmp/pokazowa npx vite-node scripts/demo-siec-pokazowa/render.tsx
CANON_OUT=/tmp/pokazowa node scripts/rasterize.mjs
```

Zrzuty „przed" (klienci wcięci w magistralę) powstały PRZED założeniem bramy
domenowej i nie da się ich odtworzyć tym skryptem — stary układ jest dziś
nieosiągalny na żywym backendzie i to jest stan projektowany. Zostają w
`docs/sld/audyt-2026-08/` jako dokument porównawczy; `render.tsx` przyjmie
dowolną migawkę przez `POMIAR_ODG_PRZED`, jeśli kiedyś trzeba będzie porównać
inny wariant.

Zrzuty odbioru karty leżą w `mv-design-pro/docs/sld/audyt-2026-08/pomiar-odg-*.png`.

## Uwaga o rysunku (etap 3 kontraktu)

Scena SLD v3 nie zna jeszcze punktów odgałęzienia jako początku lateralu, więc
w wariancie `po` stacje klientów nie są rysowane (scena zgłasza to w
`stopNotes`, a `render.tsx` wypisuje tę lukę pod rysunkiem). Luka jest przypięta
testem `src/ui/sld/v3/scene/__tests__/buildScene.pomiarOdgalezienie.test.ts`
i opisana w §4 kontraktu oraz w rejestrze konfliktów (wiersz `POMIAR-ODG`).
