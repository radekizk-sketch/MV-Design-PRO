# SCHEMAT-10 S1 — dowód wizualny (V12K-135)

Zrzuty REALNEJ sieci referencyjnej (`sldSubstrate52s`, 53 stacje SN + GPZ)
renderowanej PRODUKCYJNYM torem v3 (`buildSceneV3` → `CompositionPreview`) na
trzech poziomach szczegółu. Regeneracja (deterministyczna):

```
cd mv-design-pro/frontend
CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s1.tsx   # SVG per LOD
# rasteryzacja SVG→PNG dowolnym narzędziem (np. playwright chromium)
```

| Plik | Poziom | Co pokazuje |
|------|--------|-------------|
| `s1-l0.png` | L0 „Przegląd sieci" | Magistrala (gruby tor) + stacje jako symbol zbiorczy; sylwetka kompaktowa, S-id |
| `s1-l1.png` | L1 „Widok operatorski" | Ta sama topologia i te same kotwice + aparaty główne pól, transformatory |
| `s1-l2.png` | L2 „Stacje i aparatura" | Ta sama topologia i te same kotwice + pełna aparatura pól |

## Co dowodzą (S1)

- **Jedna kotwica LOD:** środek glifu KAŻDEJ stacji (X i Y) oraz oś magistrali są
  w TYCH SAMYCH współrzędnych świata na L0/L1/L2 — zoom zmienia WYŁĄCZNIE szczegół
  rysowany, nie układ. Szerokość świata sceny jest identyczna na wszystkich LOD
  (koniec D1 „trzy światy"). Maszynowy dowód: test „JEDNA KOTWICA"
  (`buildScene.test.ts`) i `layoutEngine.substrate.test.ts`.
- **Jeden słownik LOD:** pasek statusu („Widok: …") mówi nazwami z macierzy prawdy
  LOD §3 — L0 „Przegląd sieci", L1 „Widok operatorski", L2 „Stacje i aparatura".
- **Tor elektryczny nie znika:** sonda `lod_path_probe` zielona na L0/L1/L2
  (`npm run accept:sld-v3`).

## GAP-y (poza zakresem S1 — patrz raport)

- Jednolity korytarz międzystacyjny na L0 (obecnie `busAxisY` — pełne ujednolicenie
  na `trunkCorridorYOf` wymaga głowic w symbolu zbiorczym L0).
- Wspólny OBRYS sylwetki (RMU) rysowany jawnie na L1/L2 (dziś sylwetkę niesie
  szyna wewnętrzna + aparaty; jawny obrys = kolejna faza).
