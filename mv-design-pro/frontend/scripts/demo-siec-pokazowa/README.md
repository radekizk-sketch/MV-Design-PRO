# Sieć pokazowa — pomiar rozliczeniowy w odgałęzieniu

Zestaw skryptów wielokrotnego użytku do scenariusza z kontraktu domenowego
`mv-design-pro/docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`: magistrala OSD z
TRZEMA stacjami dystrybucyjnymi wciętymi przelotowo (630 / 400 / 1250 kVA —
każda z polem odpływowym, więc ciąg biegnie przez nie dalej) + dwóch klientów SN
(przemysłowy i typowy 1000 kVA „+ pomiary") przyłączonych ODGAŁĘZIENIAMI.
Ostatnie przęsło magistrali jest NAPOWIETRZNE, więc sieć niesie OBA rodzaje
punktu odgałęźnego: ZKSN (odcinek kablowy) i słup rozgałęźny (odcinek
napowietrzny).

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

## Rysunek (etap 3 kontraktu — WDROŻONY)

Scena SLD v3 rysuje punkty odgałęźne i całe ciągi za nimi (karta ODG-RYSUNEK):
`render.tsx` wypisuje pod rysunkiem POMIAR pokrycia wprost ze sceny — ile punktów
odgałęźnych narysowano z ilu w modelu, ile odgałęzień i ile ciągów pominięto.
Zrzuty odbioru etapu 3: `mv-design-pro/docs/sld/audyt-2026-08/odg-rysunek-po-*.png`
(L0 przegląd + L2 stacje i aparatura, oba motywy). Zrzuty etapu 2 (porównanie
„przed/po" dla drogi zabudowy): `docs/sld/audyt-2026-08/pomiar-odg-*.png`.

Kontrakt rysunku sprawdza test `src/ui/sld/v3/scene/__tests__/buildScene.pomiarOdgalezienie.test.ts`
(iloczyn cech: {ZKSN, słup rozgałęźny} × {przęsło w ciągu, ogon otwarty} ×
{L0, L1, L2}) oraz wyrocznia `branchPointCoverageGaps` w `scene/buildScene.ts`.
