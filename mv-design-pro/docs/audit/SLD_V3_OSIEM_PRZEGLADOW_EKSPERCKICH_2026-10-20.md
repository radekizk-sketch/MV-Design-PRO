# SLD-VIS-E2E — osiem szczegółowych przeglądów eksperckich i poprawki w kodzie

**Status:** raport inspekcji kodu i istniejących renderów + wdrożone korekty, NIE pełny odbiór E2E. **Odrzucona poprzednia KARTA WYKONAWCZA przestaje obowiązywać.**
**Wykonawca:** GPT-6. **Nie uruchomiono ośmiu osobnych instancji agentów AI.** Zastosowano osiem odrębnych perspektyw kontrolnych, wskazano konkretne dowody, sprawdzono funkcje i wdrożono poprawki na gałęzi roboczej. Nie należy podszywać się pod niezależny zespół ludzi lub modeli.
**Źródło:** GitHub `radekizk-sketch/MV-Design-PRO`, punkt odniesienia `main@8f7ed3c`; gałąź robocza `audit/sld-v3-wizualny-20261020`; PR #482 DRAFT.
**Materiały:** `docs/audit/visual/schemat-10/s3-l0.png`, `s3-l1.png`, `s3-l2.png`, `s4-ekran-l1.png`, `s5-zoom-1.png`, `s5-zoom-2.png`, `s5-zoom-3.png`, `w2c-l2-tor-sn.png`; kod konkretnie wymieniony niżej.
**Reguła kwalifikacji:** OBRAZ (rzeczywista obserwacja archiwalnego PNG) / KOD (istniejące źródło) / ZMIENIONO (commit na gałęzi audytu) / NIEZWERYFIKOWANO (brak bieżącej reprodukcji). Nie zamieniać NIEZWERYFIKOWANO w PASS.

## RECENZJA 1 — projektant sieci SN (PSN)

**Pytanie kontrolne:** czy da się prześledzić tor GPZ → właściwe pole SN → port/głowica → odcinek → port stacji oraz odróżnić mostek niepołączony od węzła T?
**Dowód z obrazu:** `s5-zoom-3.png` pokazuje podpisane dwa przęsła GPZ↔S01 (YAKXS 3×120/16, 105 m) oraz S01↔S02 (linia napowietrzna Al 120 mm², 80 m), trzy kolumny pól liniowych i osobną kolumnę TR. Pełne obrazy `s3-l0/l1/l2.png` nie pozwalają odczytać aparatury na skali całego arkusza. Nie jest to dowód zerwanego toru w ENM, lecz konkretna wada prezentacji arkusza.
**Dowód kodowy:** `scene/crossings.ts:91` `interiorCrossings` bada ścisłe przecięcia, `:220` `crossingBusGaps` zabrania mostkowania szyn. `SLD_CAD_SPEC_V3.md` §12.3 wiąże kabel z głowicą i portem. Tych funkcji NIE przepisywać.
**Niezweryfikowane:** czy rzeczywisty GPZ, dwa pola zasilania i punkt odgałęzienia w aktualnym modelu spełniają port-connectivity i brak fałszywych T-węzłów po zmianie LOD i łamaniu arkusza.
**Test rozstrzygający:** dla każdej krawędzi ENM odczytać `from_terminal_id` i `to_terminal_id`, porównać referencje portów końców SVG; wstawić 1 przecięcie dwóch niepołączonych odcinków i dowieść braku kropki węzłowej; wstawić prawdziwy punkt połączenia i dowieść obecności kropki. Wynik porównać między L0/L1/L2 oraz z grafem, nie tylko ze współrzędnymi.
**Werdykt PSN:** wizualnie L2 stacji częściowo poprawny; globalny L0/L1 nieczytelny jako samodzielny rysunek; topologia rzeczywista UNKNOWN.

## RECENZJA 2 — projektant pól i aparatury SN (POLA)

**Dowód z obrazu:** w `s5-zoom-3.png` oznaczenia `Q1` i `QE1` powtarzają się w polach. Bez etykiety pola dają wieloznaczność przy odczycie arkusza.
**Dowód kodowy:** `compose/directions.ts:146–159` numeruje zastępczo pola F01/F02, FT1 itd.; `:189–199` `fieldCaptionAt` łączy numer i rolę. Komentarz `:130–136` wskazuje lukę `bay_number` w read-modelu stacji; to oznaczenie konwencji, nie zawsze rzeczywisty numer aparatu z dokumentacji.
**Mechanizm:** `compose/apparatusSequence.ts:343–391` `apparatusIdentifiers` preferuje oznaczenie urządzenia z danych, a przy jego braku tworzy identyfikator z konwencji. Dwie etykiety Q1 w różnych polach mogą być poprawne wyłącznie przy stabilnym kontekście `station_ref + bay_ref`.
**Krytyczna poprawka dowodowa:** w generatorze W2c pole BESS w przypadku 7 miało **fałszywą rolę `DER_PV`**, gdyż `ozeBay()` zawsze zwracało PV. Zmieniono `ozeBay(id, kind)` oraz `snBays` przypadku 7; BESS ma `FIELD_ROLE.DER_BESS`, PV `FIELD_ROLE.DER_PV`. Dotyczy to fixture/testowego obrazu, nie stwierdzono identycznego błędu w produkcyjnym ENM.
**Test rozstrzygający:** pola `RMU_LINE`, `RMU_TRANSFORMER`, `DER_PV`, `DER_BESS`, pomiarowe i sprzęgłowe: porównać typ/ilość/aparat `Bay.primary_devices` z instancją `symbolId`, `deviceRef`, kolejnością `placement`, stroną zasilania i stanem. Negatyw: brak CT w ENM nie może wstawić CT na obrazie.
**Werdykt POLA:** błąd nazwy roli BESS w generatorze naprawiono w kodzie; rzeczywiste pole OEM i identyfikator globalny wymagają E2E.

## RECENZJA 3 — operator sieci i NOP (RUCH)

**Dowód kodowy:** `scripts/sld_v3_render_roles.mjs:171` ustanawia stan `energizedByTestId[...] = index % 2 === 0`. Nie istnieje żadna relacja między parzystością indeksu SVG i elektrycznym stanem sieci.
**Kontrast produkcyjny:** `canvas/SldCanvasV3Workspace.tsx:597` korzysta z `buildSupplyPathHighlight`; to propagacja topologiczna przez łączniki, nie liczbowy wynik analizy przepływu ani potwierdzenie napięcia pomiarowego. Stany tych trzech źródeł wiedzy muszą być rozróżnialne.
**Potwierdzona poprawka:** usunięto generator syntetycznych stanów `index % 2 === 0`. Scenariusz operatora wywołuje teraz **produkcyjną funkcję** `buildEnergizationOverlay(enm)` z `SldCanvasV3Workspace.tsx`; na obrazie jest napis `NAKŁADKA TOPOLOGICZNA ENM — NIE WYNIK ROZPŁYWU ANI POMIAR NAPIĘCIA`. Scenariusz potwierdza spójność graficzną propagacji topologicznej, nie pomiarów. Usunięto również sztywne ścieżki kontenera i Chromium. Wynik runtime nadal wymaga potwierdzenia nowym PNG.
**NOP:** `schemat-10/README.md` informuje, że badana fixtura nie ma realnego NOP, a S3 demonstruje dodany znacznik. To nie potwierdza stanu aparatu, otwartego pierścienia ani identyfikacji miejsca przerwy.
**Test rozstrzygający:** dany rzeczywisty `device_ref`/`switch_ref` w stanie OPEN → CLOSED zmienia topologię i wizualny stan dokładnie jednego aparatu, po czym wymusza nowy przypadek obliczeniowy; przy danych UNKNOWN nie wolno domyślnie kolorować jako zasilonego.
**Werdykt RUCH:** obrazy demonstracyjne nie mogą uzyskać odbioru ruchowego; rzeczywisty NOP = UNKNOWN.

## RECENZJA 4 — zabezpieczenia, CT/VT, uziemniki (EAZ)

**Dowód kodowy:** `scripts/render_schemat10_w2c.tsx:67–91`: pole OZE ma jawnie listę `DS, CB, CT, VT(OFF_PATH), DS, ES(GROUND_BRANCH), SURGE_ARRESTER, CABLE_HEAD`. To opis referencyjnej konfiguracji pola, nie dowód istnienia nastaw EAZ, poprawności przekładni CT lub sposobu uziemienia.
**Bramki istniejące w projekcie:** `sld_v3_acceptance.mjs` używa `allVtParallel`, `allCtAnnotationsValid`, `allProtectionMarkingsValid`, `allSecondaryLinksValid`, ale wykonanie nowego przebiegu na PR jest niezbędne. Zielona wyrocznia geometrii nie dowodzi poprawnego doboru nastaw ani klasy CT.
**Sposób falsyfikacji:** dla pola z VT wstawić świadomie `placement=MIDSTREAM` i dowieść odrzucenia renderu/sondy; dla uziemnika OPEN test nie może pozwolić na znak graficznie zamknięty; dla CT niepoprawnie powiązanego z innym `bay_ref` dowieść blokady. Sprawdzić `protection_ref`, `protection_codes`, `device_ref`, `Measurement.purpose`.
**Werdykt EAZ:** poprawna gramatyka bazowych symboli nie wystarcza; rzeczywiste powiązania CT/VT/EAZ i nastawy = UNKNOWN.

## RECENZJA 5 — źródła PV, BESS i bilans transformatora (DER)

**Dowód z obrazu:** `w2c-l2-tor-sn.png`, przypadki 2, 7, 8 — oddzielne tory z TR blokowym dla DER, wspólna szyna SN w przypadku 7. Obecność osobnego transformatora DER jest wizualnie prawidłowym zamiarem i nie należy go zastępować symbolem PV na szynie SN.
**Błąd 1:** pole BESS było reprezentowane jako `DER_PV`; poprawiono w kodzie generatora na `DER_BESS`.
**Błąd 2:** na oryginalnym W2c podpisy PV/BESS nachodzą na opis stacji. Przyczyną był osobny wzór na pozycję napisów DER (współrzędne świata) i osobna stała Y tabliczki stacji (współrzędne ekranu).
**Poprawka:** `render_schemat10_w2c.tsx` używa teraz `resolveLabels` dla nazw, oznaczeń aparatów, portów, DER i szyn, następnie `planSceneLabels`, `plannedLabelCollisions`, `plannedLabelObstacleCollisions`. Obszary symboli i przewodów są przeszkodami; utrata tożsamości blokuje generację PNG zamiast ukryć wadę.
**Uwaga bilansowa:** `s5-zoom-3.png` S01 ma TR=630 kVA i odbiór `P=0,900 MW, Q=0,297 Mvar`. Pozorna moc samego odbioru wynosi `sqrt(0,900²+0,297²)=0,9477 MVA`, czyli 150,4% Sn TR. Nie stanowi to jeszcze przeciążenia: PV ma 500 kW mocy znamionowej, lecz rzeczywiste P/Q na zaciskach i moc przez TR nie są znane. Zakazane jest podawanie β TR jako 150,4% bez wyniku rozpływu netto.
**Test rozstrzygający:** w tym samym `StudyRun` i tym samym węźle terminala TR odczytać P, Q, S, I i znak przepływu; zmienić P źródła, powtórzyć wynik; nakładka i tabliczka muszą aktualizować się zgodnie z rewizją.
**Werdykt DER:** błąd semantyczny generatora poprawiono; E2E PV/BESS i właściwy przepływ TR = UNKNOWN.

## RECENZJA 6 — znaki IEC i standard stacji (NORMY)

**Konflikt wykryty:** `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md:73–83` poprzednio wymagał min. CB+DS+CT+VT w każdym polu i traktował brak przekładników jako wadę. W tej postaci przepis jest sprzeczny z nadrzędnymi regułami projektowymi RMU, pól transformatorowych i pomiarowych.
**Poprawka wdrożona:** zastąpiono sekcję AC-04 wymaganiem zgodności symboli z `Bay.primary_devices`, zatwierdzonym szablonem technologicznym i rzeczywistą rolą pola. Dodano odrębne przypadki RMU-L, pól wyłącznikowych, transformatorowych, pomiarowych i negatywy braku urządzenia.
**Granica dowodowa:** identyfikacja ogólnych symboli na rysunku nie oznacza potwierdzonej zgodności z każdą odpowiednią pozycją PN-EN 60617. Odbiór pełnej biblioteki wymaga tabeli `symbolId → numer symbolu normowego → wariant → ścieżka wektorowa → przykład poprawny/negatywny`, bez nadawania numerów normowych z pamięci.
**Werdykt NORMY:** poprawiono sprzeczne wymaganie odbiorowe; szczegółowa certyfikacja symboli = UNKNOWN.

## RECENZJA 7 — geometria, etykiety i czytelność CAD (CAD)

**Obraz S3:** pełny arkusz L0/L1/L2 zawiera zbyt małe symbole i mikrotekst w skali publikacyjnej; nie wolno opisywać tego jako braków ENM. Powiększenie S5 L2 ma czytelny układ czterech kolumn stacji, lecz wymaga własnych oznaczników F01/F02/F03/FT1 na aktualnym HEAD.
**Mechanizm w kodzie:** `canvas/labelLegibility.ts:~456–680` planuje tekst względem skali, ogranicza proporcje i jawnie zlicza ukryte szczegóły; `SldCanvasV3.tsx` renderuje `SceneLabelNode` z prostokąta planu i atrybutem właściciela. Nowy W2c korzysta z tych samych funkcji rozstrzygania planu, lecz sam jest nadal artefaktem dowodowym, a NIE aplikacyjną kanwą.
**Wdrożone:** zamiast przenoszenia podpisów o arbitralne piksele W2c wyznacza wspólną geometrię slotów, plan etykiet w skali i bramkę: `kolizje tekst-tekst == 0`, `tekst-symbol == 0`, `tekst-przewód == 0`, `utracone tożsamości == 0`.
**Testy konieczne:** na obrazach końcowych z React sprawdzić 1440×900, 1920×1080, L0/L1/L2, jasny/ciemny, kamerę i eksport. Test tego samego pliku SVG bez kamery aplikacji jest niewystarczający do odbioru.
**Werdykt CAD:** pierwotna kolizja W2c potwierdzona; poprawka z kontrolą odrzucającą wadliwy obraz zapisana, ale nowe PNG i pomiar finalny = UNKNOWN do zakończenia CI.

## RECENZJA 8 — determinizm, weryfikacja, wiarygodność dowodu (QA)

**Potwierdzony błąd procesu:** generator W2c dawał zrzut z błędnymi etykietami, mimo że silnik produkcyjny ma sondy kolizji. Jego skrypt działał poza wcześniejszą bramką `accept:sld-v3` i poza `tsconfig` frontendu. Odrębny generator roli operatorskiej używał sztucznych stanów parzystości indeksów.
**Wdrożone:** skrypt renderu roli ma przenośny katalog z `os.tmpdir()` oraz opcjonalny `SLD_V3_CHROMIUM_PATH`; fałszywy stan `index%2` zastąpiono wywołaniem produkcyjnej topologii. W2c używa wspólnego planu etykiet; do `.github/workflows/sld-determinism.yml` dodano uruchomienie W2c, rasteryzację Chromium oraz dwa archiwa `sld-w2c-visual-evidence` (SVG/PNG) i `sld-v3-role-evidence` (PNG ról).
**Dowód odczytu źródła:** po zapisaniu ponownie pobrano skrypty i potwierdzono obecność wymaganych funkcji/importów oraz usunięcie wcześniejszych niezależnych `bandRows`/`derLabels`; to kontrola statyczna, nie wykonanie.
**Stan CI:** GitHub uruchamia workflow po zapisaniu commitów. Wynik należy odczytać z przebiegu związanego z NAJNOWSZYM SHA, nie z dawnym zielonym commitem. Nie ustawiono ręcznie PASS. Bieżący HEAD może mieć zadania queued/in_progress.
**Test negatywny wymagany po CI:** celowo wymusić konflikt etykiet przez modyfikację własnego fixture lub slotu oraz dowieść, że generator kończy się kodem błędu i nie zapisuje pozornie poprawnego PNG.
**Werdykt QA:** bramka wykonawcza została rzeczywiście podpięta, lecz poprawność runtime/PNG niezweryfikowana przed zakończeniem CI.

## Zmiany dokonane samodzielnie, a nie zlecone Fable

| Obszar | Konkretna zmiana | Status |
|---|---|---|
| `frontend/scripts/render_schemat10_w2c.tsx` | Poprawa roli BESS `DER_PV → DER_BESS`, wspólny resolver i plan napisów, kolizje z symbolami i przewodami | ZAPISANO; WYKONANIE CI OCZEKUJE |
| `frontend/scripts/sld_v3_render_roles.mjs` | Przenośne ścieżki; rzeczywisty `buildEnergizationOverlay(enm)` zamiast `index%2`; napis o topologicznej (nie pomiarowej) treści | ZAPISANO; NOWE PNG OCZEKUJĄ |
| `.github/workflows/sld-determinism.yml` | Uruchomienie generatora W2c i renderów ról, rasteryzacja Chromium, dwa artefakty PNG/SVG | ZAPISANO; CI OCZEKUJE |
| `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` | Usunięcie błędnego minimum CB/DS/CT/VT z AC-04, realna macierz testów wyposażenia | ZAPISANO |
| `docs/audit/SLD_WIZUALNY_ODBIOR_2026-10-20.md` | Rejestr 15 ustaleń, ograniczenia dowodowe i 18 scenariuszy T01–T18 | ZAPISANO |

## Pozostające BLOKADY przed GO

1. Brak nowych obejrzanych obrazów z **działającej aplikacji** po zmianach. Kontrola skryptu W2c to etap pośredni, a nie końcowe E2E.
2. Brak rzeczywistego NOP w obserwowanej fixturze S3, zatem niezweryfikowane przeniesienie OPEN/CLOSED z danych na symbol i graf.
3. Brak potwierdzonej wspólnej rewizji między ENM, wynikami i renderem na przykładzie realnego rozpływu/zwarcia.
4. Nie wykonano przeglądarkowego E05 z PR #481; PR jest niescalony, read-only i nie może być podciągany do oceny `main`.
5. Nie wykonano osobnych autonomicznych recenzji AI; raport zawiera osiem dyscyplin zastosowanych przeze mnie do rzeczywistych artefaktów. Wymaganie niezależnych agentów pozostaje jawnie niezrealizowane z powodu braku narzędzia do ich uruchomienia w tej sesji.

**KOŃCOWY STATUS:** implementacja określonych zmian w kodzie i kontrakcie odbioru = WYKONANA W GAŁĘZI. Pełny odbiór inżynierski/obrazowy po CI i uruchomieniu aplikacji = NIE UKOŃCZONY. PR #482 pozostaje roboczy; żadnych fikcyjnych punktów za sam raport.
