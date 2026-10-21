# Meldunek partii UI-01 / UI-02 / UI-04 programu UI/UX klasy przemysłowej (2026-10-21)

Kontrakt wiążący: `docs/uiux/KONTRAKT_UIUX_PRZEMYSLOWY_2026-10.md`. Plan i wykaz wad:
`docs/uiux/PLAN_UIUX_PRZEMYSLOWY_2026-10.md` (§4 — uzupełnienia z recenzji SLD i systemu).
Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy`, zakres partii
`8cc1f5afe..5290c045e` (18 commitów, wypchnięte). Strona oceny (zrzuty przed/po, oba motywy):
https://claude.ai/artifact/3UbDuMbgRSxe8goZ5n4YDA (prywatna — udostępnia właściciel).

**Werdykt wizualny należy do właściciela (bramka B-02).** Meldunek podaje dowody; żaden punkt
nie jest tu uznany za przyjęty.

## 1. Wynik i dowód

| Bramka (scalone drzewo `5290c045e`) | Kod wyjścia | Wynik |
|---|---|---|
| `npm test` (krok główny + krok budżetów czasu procesora) | 0 | 855 plików / 13 932 testy + 7 plików / 177 testów; 0 `it.todo` |
| `npm run type-check` | 0 | |
| `npm run lint` | 0 | |
| e2e zrzutowe (`ZRZUTY_DO_DOKUMENTACJI=1`, 5 speców) | 0 | 12 passed |
| e2e dotkniętych ekranów (18 speców) | 0 | 43 passed; strażnik drzewa zielony |
| `bramka_scalenia.py --baza 8cc1f5afe` | 1 → naprawione | patrz §1.1 |
| `guardy_z_ci.py` | 0 | KOMPLET ZIELONY, 3 775 testów własnych guardów |

### 1.1 Czerwone w bramce scalenia i co z nimi zrobiono

- `tests/ci/test_etykiety_rol_pol_sn.py` — adnotacje bloku GPZ (`compose/gpzAdnotacje.ts`,
  od GPZ-PARYTET cz. 1) brały etykiety ról pól z własnej listy („Pole zasilające” poza
  kanonem). Naprawa u źródła: etykiety z `FIELD_ROLE_LABEL_PL` / `FIELD_SOURCE_LABEL_PL`.
- `tests/ci/test_ui_no_physics_guard.py::test_ui_allowlist_matches_measured_baseline` —
  kasacja martwego `SldShortCircuitOverlay.tsx` (GPZ-PARYTET cz. 2) zdjęła jedno trafienie
  klasy b, pin nie został obniżony. Pin 7 → 6 z pomiarem i wpisem historii.
- `kosztSceny.test.ts` (liniowość kosztu planu) w kroku budżetów bramki — mediana ilorazu 3,24
  przy limicie 3. Bieg bramki szedł równolegle z pełnym `npm test` (sąsiednie procesy zawyżają
  czas procesora — dokładnie przypadek, dla którego krok budżetów jest sekwencyjny). Powtórka
  kroku budżetów w izolacji: rc=0, 177/177. Po poprawkach: 682 testy CI zielone.
- Odciski scen `kosztSceny` były czerwone od GPZ-PARYTET cz. 1 (`6c940d2e`) do cz. 3 — krok
  budżetów nie biegł w bramkach kart; cz. 3 przeliczyła je z atrybucją (bisekcja w komentarzu).

## 2. Co domknięte, z dowodem

**UI-01 (górny obszar)** — powłoka trzypasmowa K1 (`c4b4dce3e`): pasek projektu (projekt, zakres,
stan wyników, menu Widok, „Oblicz” z przyczyną blokady), pasek narzędzi trybu pracy, pasek stanu.
Skasowane: pasek przypadku, pasek tytułu, przełącznik trzech trybów zaawansowania (zastąpiony
„Szczegółami audytowymi”, bo tryby tylko ukrywały kontrolki), pasek metryk przepływu. e2e
`powloka-uklad`: kolejność pasm, brak przykrycia nazwy projektu, brak obcięć od 1440 px.

**UI-02 (wykorzystanie ekranu)**
- Panel dolny z jednego rejestru zakładek: Problemy, Przebiegi, Dziennik, **Wyniki**, **Dowody**
  (`deda2778`). Wyniki: tabela metryk z backendu (`/api/execution/runs/{run}/results/v1`),
  etykiety z rejestru `etykietyMetryk.ts` z fiksturą parytetu. Dowody: brama dostępności eksportu
  wywodu z backendu (`GET /api/analysis-runs/{run_id}/export/proof/dostepnosc`).
- **Jeden inspektor** (UI-02b, `8cadc8e35`): szuflada szczegółów w kanwie skasowana na amen
  (zasłaniała ok. połowy schematu przy 1440×900 i dublowała inspektor). Prawy inspektor dostał
  pasek działań z TEGO SAMEGO rejestru co menu kontekstowe kanwy (`akcjeElementu.ts`, jedno
  wywołanie `resolveCanvasMenuSubject`), sekcję Wyniki (brak / nieaktualne / wartość), formularz
  źródła PV/BESS/FW zapisywany przez `postDerGeneratorConfig`, „Otwórz konfigurację” odcinka
  i węzła. e2e: `elementFromPoint` w środku schematu trafia w kanwę; zapis źródła z inspektora
  (POST 201, generator w modelu). 13 iniekcji regresji, wszystkie czerwone.
- Granice paneli (K1): lewy 220–260 px, prawy 340–560 px, dolny 140–480 px.

**UI-04 (czytelność, kadrowanie)** — K2 (`08af9fea` + `316999d5`): jedno źródło zakresu kadru
(`zakresKadru.ts`) dla celu i przeszkód (predykaty parami); nowa akcja kamery z przybliżaniem
(niezmiennik „kotwica nie przybliża” zachowany); „Dopasuj widok” kadruje zaznaczenie, bez
zaznaczenia — całą sieć; menu „Dopasuj do…”; dwuklik stacji na każdym poziomie szczegółu
otwiera kadr wnętrza stacji z paskiem „Sieć › Stacja”, licznikiem i nawigacją
poprzednia/następna (porządek z danych sceny, przejęte z PR #483 bez równoległej akcji kamery);
„Poprzedni widok”; tor zasilania z backendu K6a; wskazanie z gotowości przełącza na schemat
i kadruje element. Testy: 32 kamery, 79 zakresu kadru (każda z 53 stacji fikstury), 29
warsztatu; 9 iniekcji czerwonych. Zrzuty 10 celów kadru × 2 motywy.

**GPZ — 14 `it.todo` w `compose/__tests__/gpz.test.ts`** (dług nazwany w karcie): zamknięte
zachowaniem albo kontraktem negatywnym (`KONTRAKT_NEGATYWNY_GPZ`, 5 kluczy SCADA z
uzasadnieniem phantom), 0 `it.todo` w całym `src`. Dalej w tej samej klasie (cz. 2 i 3):
uzwojenia jako klasa glifu we wszystkich miejscach składania transformatora, stan łączników
z modelu (bez `runtime_state` i zaszytych stanów DER), rodzaj źródła z modelu (bez domysłu PV,
glif „Źródło nieokreślone”) w obu adapterach, transformator pola TR GPZ w torze, wieże kilku
transformatorów jednej sekcji bez nakładania (108 przypadków iloczynu, 11 iniekcji), bilans GPZ
na granicy węzła stacji, kontrast „Następnej akcji” ≥ 4,5:1 w obu motywach. Skasowane martwe
renderery v2 (69 plików) i martwe pola widoku adaptera; dług typów poza bramką 55 → 0.

**Stan odczytu ≠ brak danych** (`922f16c87`): w 15 miejscach `ui2/oze`, `ui2/wyniki`,
`ui2/kryteria` zapytanie w toku albo nieudane nie jest już pokazywane jako „brak danych” /
„sieć w normie” / kreska; 11 iniekcji czerwonych.

## 3. Co częściowe albo do oceny

- Lewe drzewo obiektów obcina nazwy przy 1440×900 („Pole lin…”, „Sta…”) — UI-02/UI-03.
- Widok sieci przy 1440×900: rysunek wypełnia część kanwy, arkusz A–C/1–3 zostawia dużo pustego
  miejsca — do oceny właściciela w świetle UI-02 („schemat zajmuje zdecydowaną większość”).
- Prawy inspektor dopuszcza 560 px (kontrakt podaje 340–420 jako wartości wyjściowe).
- Stacja końcowa kadruje się na L1 z komunikatem „Ukryto 17 opisów — przybliż, aby zobaczyć”.
- Pas ok. 20 px przy oknach 1100×700 i 1180×780 — układ powłoki.
- Pasek narzędzi kanwy i drzewo mają drobne pismo o stałej szerokości — UI-03 (hierarchia).
- Wysokość panelu „Pole liniowe GPZ 1” w adnotacjach GPZ do oceny.

## 4. Zgłoszenia do sesji głównej

- **K5 — operacja backendu wyposażenia pola:** kreator K5 potrzebuje operacji domenowej
  zapisującej wyposażenie pola (aparaty i przekładniki pola stacji jako elementy modelu ENM
  z wiązaniem katalogowym). Nie zbudowana po tej stronie zgodnie z granicą (W5-C, wytrzymałość
  aparatury i CT prowadzi sesja główna).
- **K4 (R03)** — `SupplyPathHighlighter` i kanał `energized`/`supplyPath` adaptera nadal liczą
  zasilenie przeszukiwaniem topologii we froncie; zostawione świadomie dla K4 (wpięcie K6a).
- Commit scalający `ee35dae37` ma domyślny opis gita bez stopki — zakaz `--amend`, bez wpływu
  na treść.
- Lokalne gałęzie wykonawców (`uiux-*`) zostały w klonie; ich treść jest na gałęzi programu.
