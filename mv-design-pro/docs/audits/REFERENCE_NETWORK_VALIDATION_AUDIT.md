# Walidacja sieci referencyjnych — IEC 60909 / pandapower

## Cel

Dodać jawnie źródłowaną sieć referencyjną, która potwierdza poprawność wyników
zwarciowych przez porównanie naszego solvera IEC 60909 z wartościami
referencyjnymi, a nie przez przepisywanie `expected` jako `actual`.

## Źródła

- pandapower `shortcircuit.calc_sc`:
  https://pandapower.readthedocs.io/en/v3.3.2/shortcircuit/run.html
  metoda równoważnego źródła napięciowego wg DIN/IEC EN 60909.
- pandapower `networks.create_cigre_network_mv`:
  https://pandapower.readthedocs.io/en/latest/networks/cigre.html
  publiczny benchmark CIGRE MV.
- Thurner, Braun, arXiv:1802.01502:
  https://arxiv.org/abs/1802.01502
  opis implementacji IEC 60909 w pandapower i walidacji względem oprogramowania
  komercyjnego oraz przykładów z literatury.
- `pandapower-iec60909-radial`: minimalna sieć 20 kV zgodna z receptą
  `calc_sc`, dobrana tak, aby dowód obliczeniowy mógł pokazać pełny wywód:
  `Z_k`, `|Z_k|`, `I_k''`, `i_p`, `I_th`, `S_k''`.

## Decyzje

- Accepted: dodać `pandapower-iec60909-radial` jako osobną sieć referencyjną.
- Accepted: `/api/v1/reference-networks/*/run` liczy zwarcia naszym solverem
  `ShortCircuitIEC60909Solver`.
- Accepted: `expected JSON` służy wyłącznie jako baza porównania.
- Accepted: wynik `run` przenosi `white_box_trace`, żeby raport walidacyjny i
  dowód LaTeX mogły pokazać pełny ślad obliczeń.
- Rejected: kopiowanie `expected.short_circuit` do `actual.short_circuit`.
  To nie jest walidacja solvera.

## Sieć referencyjna

`pandapower-iec60909-radial`

- `GRID-20KV`: idealne źródło 20 kV.
- `BUS-01`: punkt zwarcia.
- `LINE-20KV-01`: 1 km, `R = 0,2 Ω/km`, `X = 0,4 Ω/km`.
- Zwarcie: `3F`, `c = 1,10`, `t_k = 1 s`.

Wartości referencyjne:

- `Z_k = 0,2 + j0,4 Ω`
- `|Z_k| = 0,4472135955 Ω`
- `I_k'' = 28,401877872 kA`
- `i_p = 49,752718561 kA`
- `I_th = 28,401877872 kA`
- `S_k'' = 983,8699101 MVA`

## Komendy walidacyjne

```powershell
cd mv-design-pro/backend
.\.venv\Scripts\python.exe -m pytest tests\application\reference_networks tests\test_short_circuit_iec60909.py -q
.\.venv\Scripts\ruff.exe check src\application\reference_networks\computation.py src\application\reference_networks\library.py src\application\reference_networks\builders\pandapower_iec60909_radial.py src\api\reference_networks.py tests\application\reference_networks\test_api_reference_networks.py tests\application\reference_networks\test_library.py
```

## Status

- Sieć referencyjna dodana do registry.
- API detail pokazuje `expected_sc_count = 1`.
- API run zwraca `BUS-01__3F` z rzeczywistym `white_box_trace`.
- API validate zwraca `PASS`.
- Testy referencyjne przechodzą: `117 passed, 5 skipped`.
