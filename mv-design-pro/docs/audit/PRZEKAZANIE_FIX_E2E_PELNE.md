# Przekazanie karty FIX-E2E-PELNE (stan roboczy)

Baza: `ab750bdc6`. Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-fix-e2e-a`. Log pełnego biegu:
`/tmp/claude-0/logs/e2e_pelne_ab750bdc6.txt` (563 passed, 22 failed, 3 did not run).

Bieg kontrolny czerwonych speców na drzewie z poprawkami klas A–D (2026-10-30, 48 testów):
42 passed, 6 failed (kd6 ×2, parytety L-11, pola-w-torze, s95 pełny cykl, sld-audyt stacja).

## Trzy testy „did not run"

`uiux-przed-po-screenshot.spec.ts` ma `describe.configure({ mode: 'serial' })` (linia 58). Po porażce
„UI-04 kadrowanie SLD ciemny" (:101) Playwright pominął pozostałe testy grupy: „UI-01/UI-02
powłoka 1440×900 jasny" (:77), „UI-01/UI-02 powłoka 1920×1080 jasny" (:77) i „UI-04 kadrowanie SLD
jasny" (:101). W biegu kontrolnym wszystkie sześć testów grupy zielone.

## Tabela

| Test | Przyczyna (plik:linia) | Klasa | Stan |
|---|---|---|---|
| kanon-menu-sld:338 | spec wysyłał `hv_voltage_kv`/`transformer_sn_mva` przy równoważniku SN; od GPZ-MODEL backend odmawia (`backend/src/enm/domain_operations.py:897`) | A: ładunek `add_grid_source_sn` sprzed kanonu GPZ-MODEL | naprawione w specu, zielone |
| menu-schematu-nn:208 | jw. | A | naprawione, zielone |
| w5e-ttit-nn:228 light, dark | jw. | A | naprawione, zielone |
| zwarcie-przez-impedancje-przejscia:168 | jw. | A | naprawione, zielone |
| industrial-template-mass-flow:234 | spec szukał tekstu „Stacje: 50" ze skasowanego pasa liczników (karta K1; dziś panel na żądanie `ui2/shell/PasekNarzedzi.tsx:178`) | B: spec czyta skasowaną powierzchnię | przepisany na `mvd-narzedzie-model` → `mvd-licznik-stacje` = 50, zielone |
| zwarcia-rozplyw-screenshot:168 light, dark | literał „9,1 kA" przeżył przegenerowanie fikstury `falowniki_rozplyw_scena_gpz_feeder_wynik.json` kartą GPZ-MODEL (8,64 kA) | C: liczba-literał zamiast fikstury biegu | prąd z fikstury + formatter produkcyjny `formatMagnitudeKa`, zielone; inwentarz literałów kA w e2e: brak innych |
| sld-gpz-zwiniety:172 | od GEOMETRIA-STACJI aparat ciągłości pola GPZ na L0 pochodzi z rekordu modelu (`ui/sld/v3/scene/buildScene.ts:2867`); seed nie dawał aparatu pola GPZ → sylwetka braku danych zamiast wyłącznika | D: seed sprzed kanonu „aparat z modelu" | seed z `gpz_line_field_apparatus`, zielone |
| szablony-rola-a:39 light, dark | brak powtórzenia; okno 08:55–09:05 pełnego biegu z prawie zerowym ruchem backendu (zagłodzenie maszyny) | E: środowisko | zielone bez zmian |
| tr2w-bez-pola:240, :314 | jw. (timeout `app-ready`) | E | zielone bez zmian |
| ui02-jeden-inspektor-zrzuty:91 | jw. | E | zielone bez zmian |
| uiux-przed-po:101 (ciemny) + 3 did not run | jw. | E | zielone bez zmian |
| ux-feedback-loop:337 | jw. | E | zielone bez zmian |
| kd6-zrzuty:318 light, dark | sekcja aparatury 22 618 px: siatka kart `.mvd-apar-oceny` (`ui2/wyniki/zwarcia/aparatura/aparatura.css:224`, minimum kolumny 320 px) dzieliła sekcję 716 px na dwie kolumny po 326 px; karta werdyktu przechodziła w układ wąski (etykieta nad treścią), jedenaście pól wyjaśnienia (kontrakt werdyktu) łamało się w kolumnie ~300 px — karta 4 132 px, pole 7 149–8 036 px | J: kolumna karty werdyktu węższa niż próg pełnego układu karty | minimum kolumny = próg układu karty (480 px), węższy kontener jedna kolumna; inwentarz: `.mvd-apar-oceny` jedyna siatka z `KartaWerdyktu` (pozostałe siatki auto-fit ui2 niosą inne treści); bieg run6: karta 326 → 660 px, 4 132 → 2 426 px; sekcja 22 618 → 21 985 px — nadal > 20 000 px. Reszta to objętość treści: 3 pola × 3 rekordy × 11 pól pierwszego planu kontraktu werdyktu (samo „Wyjaśnienie” ~2 000 znaków, powtarza kryterium/wynik/limit/dowód); treść pochodzi z backendu (migracja werdyktów, inny wykonawca). Próg 20 000 px NIE podniesiony; asercja szerokości karty wzmocniona 280 → 480 px (pełny układ). Decyzja architekta (2026-11-04): zwarta prezentacja, próg bez zmian. Wdrożone: `ui2/wyniki/wzorzec/RekordWerdyktuZwijany.tsx` — rekord K jako wiersz pierwszego planu (ocena z etykiety rekordu, co oceniono, kryterium z warunkiem LaTeX, wynik z jednostką, limit z podstawą i stanem źródła, margines), pełna `KartaWerdyktu` po rozwinięciu natywnym przyciskiem z `aria-expanded`; startowo rozwinięte wyłącznie NIE_SPELNIA i NIEJEDNOZNACZNY; treść backendu bez zmian. Osobny plik, bo `KartaWerdyktu.tsx` jest przypięta jako źródło bez odczytu statusu maszynowego (pierwsza wersja w tym pliku złamała przypięcie — czerwony test `KartaWerdyktu.test.tsx`). Inwentarz: `.mvd-apar-oceny` jedyna lista rekordów K pola w sekcji aparatury. Testy: 7 statusów × {zwinięty, rozwinięty} × {mysz, Enter, spacja} + brak wyniku/limitu/marginesu + przypięcie literałów statusu w źródle; iniekcja (zawsze zwinięty, bez podstawy limitu): 21 czerwonych. Bieg e2e: patrz niżej |
| parytety-fala2:241 | DEFEKT PRODUKTU: pierwszy klik dwukliku w wartość z dowodem zaznacza wiersz (`ui2/wyniki/wzorzec/TabelaWynikow.tsx` `wybierzWiersz` → `selectFromResults`), zaznaczenie rozwija inspektor (`ui2/shell/useInspektorZaZawartoscia.ts`), tabela przepływa i drugi klik/`dblclick` trafiają w inną komórkę; dowód: bieg z pojedynczym klikiem przed dwuklikiem zielony, bez niego czerwony | I: cel dwukliku po zmianie układu wywołanej pierwszym klikiem | wspólny `ui2/shared/useCelGestuDwukliku.ts` (cel gestu = element pod pierwszym klikiem, słuchacz `window` w fazie przechwytywania; ta sama reguła co gest wieloklikowy kanwy SLD) wpięty w wartość z dowodem tabeli wyników; inwentarz `onDoubleClick`: `ValueRow` (inspektor) — pierwszy klik nie zmienia układu; `ContextTree` — drzewo w lewym doku, rozwinięcie prawego panelu go nie przesuwa; listy projektów/przypadków/szablonów, `EdytowalnaTabela` — klik nie zmienia zaznaczenia elementu; testy 3 miejsca drugiego kliku × wiersz wybieralny/niewybieralny + zakończenie gestu; iniekcja: 4 czerwone; bieg run5: zielone |
| pola-w-torze-zrzuty:36 | DEFEKT PRODUKTU: wpis historii kadrów niósł transform bez viewportu, w którym obowiązywał; pierwszy klik dwukliku otwiera inspektor (kanwa 1322 → 956 px), wpis bywa zapisany sprzed zwężenia, „Sieć” kładła stary transform na wąską kanwę, a zamknięcie inspektora dokładało 'resize' — każdy cykl przesuwał rysunek o 183 px (sonda: viewBox x −933 → −1498 → −2063 → −2628), czwarta stacja wyjeżdżała poza kanwę (`ui/sld/v3/canvas/camera.ts` akcja 'przywroc', `historiaKadrow.ts` `WpisHistoriiKadru`) | H: stan kamery zapisany bez pary transform+viewport | wpis historii i zgłoszenie kamery niosą `viewportSize` z tego samego stanu kamery; 'przywroc' przenosi kadr do bieżącego viewportu regułą 'resize' (ten sam viewport: bit w bit); testy: reduktor 2×2 viewport zapisu × powrotu + 5 cykli, workspace 2 chwile zwężenia × {1, 3} cykle; iniekcja (stary reduktor) czerwona 3 + 2; bieg run5: zielone |
| s95-budowa-z-kanwy:250 | prawy klik w środek toru dalszej połówki trafia w tło: punkt liczony, gdy kamera jeszcze jedzie po zamknięciu menu stacji (sonda: `viewBox` 701→970 szerokości po Escape, przesunięcie x jeszcze po ~1 s) | G: klik współrzędnymi przed spoczynkiem kadru albo w punkt, gdzie cel nie jest na wierzchu | wspólny `e2e/stabilnaGeometria.ts` (poll do spoczynku, porażka zamiast cichego powrotu) wpięty we wszystkie kliki natywne liczone z geometrii obiektu kanwy: s95-budowa-z-kanwy, s95-zrzuty, kanon-menu-sld, wyspy-menu-sld (duplikaty helpera skasowane), menu-schematu-nn (sztywne pauzy 400/200 ms zastąpione), k2, k3, kd5, kd8, kd11 ×2, sld-gpz-zwiniety, ui02, w5e, inspektor-karta-techniczna; poza klasą: kliki w chrom (minimapa, uchwyt panelu) i przeciągnięcia tła — cel nie zależy od kamery; bieg run5: zielone |
| sld-audyt-powykonawczy:205 (stacja) | kotwica `[data-owner-ref$="/station#sn-bus"]`: od GEOMETRIA-STACJI odcinek szyny SN stacji niesie ref sekcji `stn/<id>/sn_bus#sn-bus` (`ui/sld/shared/sldActionExecutor.ts:262`; sonda DOM: 26 ścieżek `stn/…/sn_bus#sn-bus`, zero `…/station#sn-bus`) | F: selektor sprzed kanonu refów szyn | przepisane na `[data-owner-ref^="stn/"][data-owner-ref$="#sn-bus"]`; bieg run5: zielone |

Bieg run5 (2026-10-30, 39 testów: klasy F, G, H, I i regresja klasy G): 37 passed, 2 failed (kd6 ×2).
Scalono `e29e59e2c` (karta ZU) na polecenie koordynatora — spec `zwarcie-przez-impedancje-przejscia` w wersji ZU.

Bieg run7 (wszystkie 17 speców pierwotnie czerwonych, 48 testów, HEAD e65a2b492): 45 passed, 3 failed — kd6 ×2 (otwarte, decyzja) i s95 pełny cykl (prawy klik w dalszą połówkę otworzył menu TŁA: punkt na kresce przykryty albo ruch dwufazowy). Poprawka: wspólne `punktNaWierzchu` (sonda `elementFromPoint` wzdłuż trasy) w s95-budowa-z-kanwy i s95-zrzuty, spoczynek = trzy zgodne odczyty.

Bieg run8 (s95-budowa, s95-zrzuty, kanon-menu, wyspy-menu ×3): s95-budowa zielony 3/3; s95-zrzuty czerwony 3/3 na nowej, uczciwej asercji — jedyny obiekt klasy „aparat” (aparat pola GPZ) leżał poza kadrem pod drzewem modelu (x = 91 px), a dawny klik w środek prostokąta trafiał w wiersz drzewa, więc zrzut „menu aparatu” dokumentował menu drzewa. Poprawka speca: pierwszy obiekt klasy na wierzchu, a gdy żaden — kadr całej sieci Shift+F i ponowna sonda; bieg run11 ×2: zielone.

Bieg końcowy run12 (HEAD 2862fe6c8; 17 speców pierwotnie czerwonych + 8 speców z klikami klasy G; 63 testy): 61 passed, 2 failed — wyłącznie kd6 ×2 na asercji wysokości sekcji (21 985 px < 20 000 px), decyzja otwarta (wiersz kd6).

## Martwy kod (skasowany 2026-11-04, zasada nr 3)

Inwentarz klasy „moduły bez konsumenta produkcyjnego" w łańcuchu dawnego BuildSidebar (grep importów
w `frontend/src`, `frontend/e2e`, `scripts`, `backend/tests`, `.github`):
- skasowane z testami: `ui/network-build/build-sidebar/{BuildSidebar,BuilderSection,LayersSection,NavigatorSection}.tsx`,
  `build-sidebar/__tests__/BuildSidebar.test.tsx`, `ui/network-build/dragDropController.ts` z testem;
- skasowane jako ten sam łańcuch: `ui/sld/v2/builder/BuildSequence.ts` z testem (jedyny konsument produkcyjny
  to `BuilderSection`, typ `BuildPhase`) i `ui/sld/v2/__tests__/fixtures/visualFixtures.ts` (zero importów);
  `buildGate.test.ts` bez sekcji BuildSequence;
- zostaje `build-sidebar/ReadinessSection.tsx` — konsument `station-configurator/cards/StationConfigReadinessCard.tsx`;
- strażniki: `sld_layer_id_scope_guard.py` `LEGACY_FILES` pusty (test przypina pusty zbiór),
  `sld_determinism_guards.py` bez katalogu `v2/builder` w szkielecie i bez Guard 5 (przedmiot skasowany),
  `ui/sld/v2/builder` dopisany do importów zakazanych (Guard 3);
- fałszywy docstring `SldCommandService.ts` („integracja z BuildSequence + HistoryStore") poprawiony;
  próbka ścieżki v2 w `backend/tests/ci/test_sld_v1_route_audit.py` przepięta na istniejący moduł.

## Bieg końcowy kd6 (2026-11-04)

Pod blokadą: vitest `src/ui2/wyniki/wzorzec src/ui2/wyniki/zwarcia src/ui/network-build src/ui/sld/v2` —
182 pliki, 3 038 testów zielonych (RC=0); `tsc --noEmit` RC=0; eslint zmienionych plików RC=0;
`scripts/guardy_z_ci.py` RC=0 (107 guardów, 4 603 testy własne guardów). E2E kd6 ×2, kd4 ×4,
ogniwo-zwarcie-aparatura ×2: 8 passed (RC=0). Sekcja aparatury: 21 985 → 3 611 px (próg 20 000 px bez zmian).

Znalezisko w dowodzie: zrzut `kd6-ogniwo-model-*` (zrzut elementu wyższego niż okno w przewijanym
kontenerze) malował tylko ~800 px treści, reszta pusta — dokument nie pokazywał rekordów. Spec podnosi
okno do wysokości sekcji przed zrzutem; ponowny bieg kd6 ×2: 2 passed, zrzut 716×3611 px z kompletem
rekordów. Werdyktu wizualnego (B-02) nie wystawiam — zrzuty w `frontend/test-results/zrzuty-dokumentacji/`.

## Karta APARATURA-TABELA (2026-11-04, uwagi właściciela do zrzutu kd6)

Sekcja „Wytrzymałość aparatury pól stacji" (`frontend/src/ui2/wyniki/zwarcia/aparatura/WeryfikacjaAparatury.tsx`)
to jedna tabela: jedno pole = jeden wiersz (Pole, Aparat, [ip, Ith, Ib], Tk, trzy zapasy), natywny przełącznik
z `aria-expanded` (klik w wiersz, Enter, spacja) rozwija porównanie Parametr | Obliczony | Aparat | Zapas
(szczytowy, cieplny z Tk pola i Tkr aparatu, wyłączalny). Prądy nad tabelą wyłącznie przy równych wartościach
backendu dla wszystkich pól. Założenia, wartości robocze, t_b z pochodzeniem, kompletność dowodu i karty werdyktu
wszystkich kryteriów — w „Szczegółach obliczeń" (jeden przycisk na pole); „Parametry aparatu" — jeden przycisk na
pole z modelu (`update_element_parameters`, `field: 'overrides'`). Wiersze neutralne; kolor (`data-uwaga`) tylko
na komórce z zapasem ujemnym, brakiem zapasu/limitu albo czasem nieustalonym. Jeden formater liczb
(`aparatura/format.ts`). `RekordWerdyktuZwijany` stracił konsumenta — skasowany z testem i stylami.

Przyczyny niespójności (zbadane u źródła):
- „Szyna nN" przy aparaturze SN — błąd etykiety, nie fizyki: prądy pola idą z `Bay.bus_ref` → wiersz biegu
  punktu zabudowy pola (`backend/src/application/analyses/wytrzymalosc_aparatury_pol.py`, `prady_pol_z_biegu`);
  wybrany punkt tylko wskazuje stację. Nagłówek nazywa stację, zdanie mówi, że punkt ją wskazuje.
- I_cu przy wyłącznikach SN — znamię zależne od pasma z jednego predykatu `wielkosc_kryterium_wylaczania`
  (`backend/src/application/equipment_proof/wielkosc_wylaczania.py`): SN/WN I_sc (IEC 62271-100 § 4.101),
  nN I_cu (IEC 60947-2), bezpiecznik I_1 (IEC 60282-1), pasmo nieustalone I_wył; rekordy K, dowód doboru,
  rejestr reguł, werdykt projektowy, podpowiedź i docstringi katalogu SN.
- t_b = 0,36 s w polach bez czasu — to t_b PUNKTU dla I_b (`application/solvers/short_circuit_binding.py`
  `czas_tb_punktu` → `application/analyses/protection/czas_wylaczenia_pola.py` `czas_tb_z_pol_lokalnych`:
  najkrótszy czas wyłączenia pól lokalnych szyny), nie Tk pola. Kolumna Tk pokazuje `t_clearing_s` pola albo
  „nieustalony"; t_b tylko w szczegółach z opisem pochodzenia.

Weryfikacja (pod blokadą): backend 22 pliki testów powiązanych — 7 697 passed (RC=0); vitest `src/ui2/wyniki`,
`src/ui/shared`, `src/ui/catalog`, `src/ui2/kreatory/edycja-parametrow`, `src/harness-fixtures`, `src/ui2/spaces` —
215 plików, 5 097 testów (RC=0); `tsc --noEmit` RC=0; eslint zmienionych plików RC=0; black/ruff RC=0;
`scripts/guardy_z_ci.py` RC=0 (115 strażników, 4 603 testy własne); e2e kd6 ×2, kd4 ×4, ogniwo ×2 — 8 passed,
po poprawkach układu kd6+kd4 — 6 passed. Iniekcje: 9, każda czerwona. Pin `solver_input_substitute_guard`
4503 → 4506 (pomiar: +3 pola znamienia). Zrzuty obu motywów: `docs/audit/visual/flow-ekspert/kd6-{ogniwo-model,
tclearing,szczegoly}-{light,dark}.png`, `ogniwo-aparatura-{light,dark}.png`. Werdyktu wizualnego (B-02) nie wystawiam.
