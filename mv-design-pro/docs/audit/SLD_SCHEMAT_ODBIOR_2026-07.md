# ODBIÓR: PRZEBUDOWA JĘZYKA RYSUNKU SLD v2 — ZE „KAFLI" NA SCHEMAT CAD/SCADA (2026-07)

Standard: `docs/sld/SLD_SCHEMAT_REDESIGN_2026-07.md`. Branch:
`claude/sld-schema-cad-scada-rqvz73`. Fixtura dowodowa: 53 stacje + power-flow
(`sldSubstrate52s`), rendery headless Chromium przez `screenshot-harness.html`.

## 1. Zakres wykonany (commity)

| Iteracja | Commit | Zakres |
|---|---|---|
| A (projekt) | `92a516e` | standard redesignu + diagnoza na renderach bazowych |
| B1 stacja-zoom | `420fd95` | MiniBlockRmuRenderer compact/detail: teksty zamiast badge-boxów, pola bez tintu, granica przerywana |
| B2 GPZ | `babcf69` | korpus-panel → granica rysunkowa; pola/sprzęgło bez teł; pomiary tekstem |
| B3 OZE | `42f8318` | `DerSourceSymbol` (PV ⎓/~, BESS ogniwo+~, FW G~); koniec rombów z wypełnieniem i pigułek |
| B4 sieć L0/L1 + kable | `d5f9fe4` | stacja = symbol planu sieci + tekst obok; etykiety kabli tekstem wzdłuż linii; GPZ-blok L0 bez panelu; maski w kolorze kanwy |

Dowody wizualne (przed/po): `docs/audit/visual/sld_schemat_2026-07_*.png`
(`_L0_przed` = stan zastany z kartami).

## 2. Test „brak kart/chipów w obszarze rysunku"

Wzrokowo (rendery finalne L0/L1/L2/stacja-zoom/GPZ): w obszarze rysunku nie ma
zaokrąglonych paneli z wypełnieniem ani chipów. Wypełnienia pozostały wyłącznie
jako: (a) stan aparatu (zamknięty=wypełniony — treść ruchowa IEC/SCADA),
(b) sygnały bezpieczeństwa (manipulacja=oliwkowy, niekompletne pole=czerwony
tint, blocker PCC), (c) occlusion w kolorze kanwy (niewidoczny), (d) markery
akcji edytora (bursztynowy przerywany „+" zakończenia kabla — afordancja stanu
niekompletnego modelu). Panele poza obszarem rysunku (badge stanu przypadku,
wskaźnik LOD, kontrolki +/−, legenda, tabliczka) — zgodnie ze standardem zostają.

## 3. Tabela odbioru per rola × widok

Skala: ✔ = SPEŁNIA, ◐ = ODSTĘPSTWO (wyjaśnione w §4), n/d = nie dotyczy widoku.

| Rola / Widok | Stacja-zoom | GPZ | OZE | Sieć L0/L1 |
|---|---|---|---|---|
| 1. Projektant sieci SN (trasy, typ/przekrój/długość, oznaczenia) | ✔ (◐ kolizje etykiet w gęstych rejonach) | ✔ | ✔ | ✔ |
| 2. Audytor ekspertyz (punkt przyłączenia, Sk"/Ik" overlay, granice) | ✔ | ✔ | ✔ | ✔ (granica własności: brak danych w modelu ⇒ brak elementu) |
| 3. Projektant OZE (moc przy źródle, tor ciągły, TR blokowy, BESS≠PV≠FW) | ✔ | n/d | ✔ | ✔ |
| 4. Projektant stacji (łańcuch aparatów, numeracja, sekcje, sprzęgła) | ✔ | ✔ | n/d | ✔ |
| 5. Zabezpieczenia / NC RfG (CT/VT, kody, moduł czytelny bez koloru) | ✔ | ✔ | ✔ (litera modułu tekstem) | n/d |
| 6. Profesor / audytor obliczeń (liczby z modelu/ResultSet, jednostki, brak=brak) | ✔ | ✔ | ✔ | ✔ |
| 7. Uzgodnienia OSD (tabliczka, rewizje, legenda — poza rysunkiem) | ✔ | ✔ | ✔ | ✔ |
| 8. Dyspozytor (stan z SYMBOLU, tor mocy, punkty NO) | ✔ | ✔ | ✔ | ✔ |
| 9. Kreślarz CAD (hierarchia kreski, zero zaokrągleń dekoracyjnych, typografia) | ✔ (◐ „RMU·P") | ✔ | ✔ | ✔ |
| 10. SCADA (kolory ruchowe: zieleń SN, czerwień WN/alarm, błękit nN, szary off) | ✔ | ✔ | ✔ | ✔ |

## 4. Odstępstwa (wszystkie wyliczone, z powodem)

1. **Kolizje etykiet przy LOD 3 w gęstych rejonach** (nazwa stacji × podpisy
   WE/WY × etykieta kabla) — ograniczenie istniejącego silnika declutter,
   obecne również przed przebudową; przebudowa języka rysunku go nie pogorszyła
   (pigułki zamienione na tekst o tym samym footprincie). Osobna praca:
   priorytety declutter dla warstwy podpisów portów.
2. **Kod typu stacji „RMU·P/RMU·O"** pozostaje na rysunku — wymagany przez
   kontrakt parity (`station.mini.type`); zdemotowany do tekstu pomocniczego.
   Docelowo: przenieść do drawera/legendy (wymaga rewizji kontraktu parity).
3. **Bursztynowe markery „+" (zakończ kabel)** — afordancja edytorska stanu
   niekompletnego modelu (kabel bez punktu końcowego), nie dekoracja; zostają
   jako sygnał braku danych.
4. **Granica własności/eksploatacji** — model (fixtura) nie niesie tych danych;
   zgodnie z zasadą „brak danych = brak elementu" nie rysujemy atrapy.
5. Przycisk KAS / flagi SPZ-LRW w GPZ — kontrolki i flagi stanu SCADA
   (interakcja operatorska), świadomie zachowane.

## 5. Bramki (stan na koniec sesji)

- `tsc --noEmit`: zielone. `eslint` (pliki zmienione): zielone.
- `vitest run --no-file-parallelism src/ui/sld/v2`: **146 plików, 2640 testów — zielone**
  (2 kontrakty zaktualizowane z zachowaniem intencji: per-role tło pola GPZ →
  rola przez `data-field-role` + symbole; klasa obciążenia kabla → kolor tekstu
  + `data-loading-class`).
- Guardy: `no_codenames_guard`, `forbidden_ui_terms_guard` — zielone.
- Determinizm/LOD: mechanizm progów i histerezy nietknięty; zmiany wyłącznie
  w warstwie rysunku (renderer/ + fragmenty rysunkowe SldCanvasV2).

## 6. Nota

Przywołane w zleceniu `SLD_PRO_STANDARD_2026-07.md` i strażnik ratchet
`visualCanon.guard.test.ts` (commity ca770c2c/c71c153c) nie istnieją w repo —
kontekst zlecenia opisywał stan innej sesji. Rolę standardu pełni
`SLD_SCHEMAT_REDESIGN_2026-07.md`; liczba literałów hex w plikach zmienianych
spadła (usunięte tła: #171B20, #1A2438, #2A2616, #3A2A2A-tint pól normalnych,
#07111C-enclosure, #0A1018/#0D2818/#5A2A1E/#1E4A2A/#0E1822-badge, #071018,
#050A12, #1A1206, #06110D, #161507, #120F05).
