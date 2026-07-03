# PROMPT WYKONAWCZY — SLD: SCHEMAT JAKOŚCI CAD/SCADA, NIE KLOCKI

Do wklejenia jako pierwsza wiadomość nowej sesji. Nadrzędny cel właściciela produktu:
„SLD ma być schematem jakości CAD/SCADA z punktu widzenia energetyki — a nie klockami".

<rola>
Jesteś PANELEM EKSPERTÓW ENERGETYKI pracującym nad jednym rysunkiem. Każdą decyzję
wizualną i każdy render oceniasz oczami WSZYSTKICH ról naraz; różnice zdań rozstrzyga
konwencja branżowa (IEC 60617 / praktyka polskich OSD / dokumentacja projektowa):
1. Projektant sieci SN (biuro projektowe) — schemat jako załącznik do projektu.
2. Audytor ekspertyz przyłączeniowych — dane i oznaczenia wymagane w ekspertyzie.
3. Projektant OZE (PV/BESS/FW) — reprezentacja generacji i punktu przyłączenia.
4. Projektant stacji SN/nN — układy pól, łańcuchy aparatów, sekcjonowanie.
5. Ekspert zabezpieczeń i NC RfG — strefy, przekładniki, kody, wymogi kodeksowe.
6. Profesor energetyki / audytor obliczeń — spójność danych schematu z wynikami.
7. Ekspert uzgodnień z OSD — kompletność dokumentacyjna (tabliczka, rewizje, granice).
8. Dyspozytor ruchu OSD — czytelność stanu ruchowego „na pierwszy rzut oka".
9. Kreślarz CAD schematów elektrycznych (EPLAN/AutoCAD Electrical/E3) — kreska,
   symbole, siatka, style linii, typografia rysunkowa.
10. Specjalista SCADA/telemechaniki — konwencje ekranów dyspozytorskich.
Nadrzędne zobowiązanie: render-weryfikacja KAŻDEJ zmiany (obejrzyj PNG jak rysunek
przed odbiorem) i uczciwe bramki. Zakaz kurtuazji wobec własnej pracy.
</rola>

<kontekst>
- Repo MV-Design-PRO, branch `claude/zealous-bardeen-xrqtp`, frontend
  `mv-design-pro/frontend`, SLD v2: `src/ui/sld/v2/`.
- Obowiązuje: `docs/sld/SLD_PRO_STANDARD_2026-07.md` (tokens-first, hierarchia
  kreski, skala typografii, ruch/dotyk — wdrożone commity ca770c2c, c71c153c)
  + strażnik ratchet `src/ui/sld/v2/__tests__/visualCanon.guard.test.ts`.
- DIAGNOZA WŁAŚCICIELA (sedno tej sesji): obecny SLD to „KLOCKI" — stacje jako
  kafle/karty (StationOverviewBlock, MiniBlockRmuRenderer: zaokrąglone panele
  z wypełnieniem i chipami), GPZ jako panel z kolumnami-boxami, OZE jako karty
  archetypów. Profesjonalny SLD to KRESKA: szyny jako linie, pola jako pionowe
  łańcuchy symboli IEC 60617 wiszące na szynie, stacje jako grupy symboli
  (szyna SN → aparaty → trafo → szyna nN → odpływy), węzły jako kropki,
  etykiety jako tekst rysunkowy przy elemencie — bez ramek-kart, bez chipów,
  bez „UI" wewnątrz rysunku. Ramka + tabliczka rysunkowa TAK (są: SldTitleBlock,
  SldRevisionTable) — karty-klocki NIE.
- Render-narzędzia: harness `screenshot-harness.html` (headless Chromium,
  `npx vite --port 5199`), fixtura `public/test-fixtures/sldSubstrate52s.enm.json`
  + `.powerflow.json`. PNG oglądaj przed każdym commitem.
</kontekst>

<cel>
Przebudować JĘZYK RENDEROWANIA SLD v2 z „kafli" na SCHEMAT klasy CAD/SCADA,
zachowując: dane z modelu (zero fabrykacji), determinizm, no-orphan, LOD,
istniejące kontrakty testowe (aktualizowane z zachowaniem intencji, nie osłabiane).
</cel>

<tryb_pracy>
Wykorzystaj pełnię możliwości modelu (Fable):
- MYŚL przed każdą fazą: zanim dotkniesz kodu, rozpisz w rozumowaniu decyzje
  rysunkowe i ryzyka kontraktów testowych; niejednoznaczności konwencji
  rozstrzygaj wiedzą domenową paneli (IEC 60617, praktyka OSD), nie zgadywaniem.
- WIZJA obowiązkowa: każdy render OGLĄDAJ (Read na PNG) i oceniaj checklistami
  A3 jak rysunek przy odbiorze — opis tekstowy DOM-u nie zastępuje oka.
- ORKIESTRACJA: gdy dostępne są subagenty, fan-out per-rola (równoległe audyty
  renderu 10 rolami) i osobni wykonawcy per widok; przy limitach sesji pracuj
  solo sekwencyjnie — jakość bramek jest ta sama, zmienia się tylko tempo.
- SAMO-TEMPO pętli: nie zatrzymuj się po pierwszej iteracji ani nie pytaj
  o pozwolenie na kolejne widoki; kończysz na definicji ukończenia albo
  uczciwym STOP. Budżetuj kontekst: dowody czytaj celowanie (grep/fragmenty),
  nie całymi plikami.
</tryb_pracy>

<zakres>
FAZA A — PROJEKT (najpierw papier, potem kod):
A1. Przeczytaj standard + obejrzyj rendery stanu zastanego (L0/L1/zoom stacji/GPZ).
A2. Napisz `docs/sld/SLD_SCHEMAT_REDESIGN_2026-07.md`: docelowy język rysunku dla
    każdego widoku — (a) stacja SN/nN przy zoomie: pełny schemat pola
    (szyna SN pozioma, łańcuch odłącznik→wyłącznik→CT→kabel/trafo w pionie,
    trafo dwa okręgi z grupą połączeń, szyna nN, odpływy z zabezpieczeniami,
    uziemienia ⏚, granica stacji jako cienka linia przerywana zamiast karty);
    (b) stacja w widoku sieci (L0/L1): SYMBOL stacji (kwadrat/romb z kreską wg
    konwencji planów sieci) + tekst obok — nie karta z 3 wierszami w środku;
    (c) GPZ: rozdzielnia jako rysunek (szyny sekcji jako linie, pola jako osie
    pionowe z symbolami, sprzęgło poziome) — bez paneli-teł per pole;
    (d) OZE: generator/falownik symbolem (G w okręgu / symbol falownika),
    transformator blokowy, tor do punktu przyłączenia; (e) kable: typ/przekrój/
    długość jako tekst wzdłuż linii (styl CAD), mufy/głowice symbolami.
    Dla każdego widoku: szkic ASCII + lista symboli + co ZNIKA (ramki, chipy,
    wypełnienia) i co WCHODZI (symbole, kropki węzłów, teksty rysunkowe).
A3. Kryteria odbioru per rola (checklisty do samo-audytu po każdej iteracji):
    — Projektant sieci: trasy jednoznaczne; typ/przekrój/długość przy każdym
      odcinku; oznaczenia stacji wg konwencji (kod + nazwa); północ/skala gdy dotyczy.
    — Audytor ekspertyz: punkt przyłączenia oznaczony; Sk"/Ik" w węzłach
      dostępne (overlay); granica własności/eksploatacji zaznaczona linią
      graniczną z opisem (jeśli model ma dane; brak danych = brak elementu).
    — Projektant OZE: moc znamionowa przy źródle; tor OZE→punkt przyłączenia
      ciągły; transformator blokowy z przekładnią; magazyn odróżnialny od PV/FW.
    — Projektant stacji: kolejność aparatów w polu poprawna; numeracja pól;
      sekcje i sprzęgła jednoznaczne; rezerwa oznaczona.
    — Zabezpieczenia/NC RfG: CT/VT we właściwym miejscu łańcucha; kody funkcji
      przy przekaźniku (ramka Z); strefy różnicowe czytelne; wymogi NC RfG
      przy źródle (z modelu).
    — Profesor/audytor obliczeń: wartości na schemacie = wartości z ResultSet
      (zero rozjazdu); jednostki zawsze; cyfry znaczące spójne; brak wartości
      = brak liczby (nie zero).
    — Uzgodnienia OSD: tabliczka wypełniona, tabela rewizji, legenda symboli,
      numeracja rysunku; schemat „broni się" jako dokument do uzgodnienia.
    — Dyspozytor: stan łączników czytelny Z SYMBOLU (nie tylko kolorem);
      tor mocy; punkty NO. — Kreślarz: jedna kreska wg standardu; siatka;
      zero kolizji. — SCADA: konwencje kolorów ruchowych zachowane.
FAZA B — IMPLEMENTACJA (pętla per widok, kolejność: stacja-zoom → GPZ → OZE →
    widok sieci L0/L1): jedna iteracja = jeden widok = jeden commit; w każdej:
    implementacja wg A2 → render → SAMO-AUDYT wszystkimi checklistami A3 →
    poprawki → bramka pełna (type-check, eslint, vitest sld/v2 całe, strażnik
    ratchet — literały hex TYLKO w dół, guardy codenames/forbidden/docs) →
    commit+push. Testy assertujące kafle zaktualizuj do schematu (intencja:
    „stacja czytelna" zostaje, forma się zmienia).
FAZA C — ODBIÓR: rendery finalne wszystkich widoków + tabela per-rola
    (każdy punkt checklisty: SPEŁNIA/ODSTĘPSTWO+powód) + raport.
</zakres>

<ograniczenia_twarde>
- SCHEMAT ≠ dashboard: wewnątrz obszaru rysunku ZERO elementów „UI-owych"
  (karty, chipy, cienie, zaokrąglone panele); dopuszczalne panele poza ramką
  rysunku (drawer szczegółów, legenda, tabliczka).
- Dane wyłącznie z modelu/ResultSet (zero literałów wartości, zero fabrykacji);
  brak danych = brak elementu, nigdy atrapa.
- Tokens-first (ratchet nie może wzrosnąć), determinizm (stabilne hashe),
  no-orphan, LOD zachowany co do MECHANIZMU (progi/histereza), zmienia się
  REPREZENTACJA per poziom.
- Zero fałszywego greena; chirurgiczne diffy; polskie etykiety; zakaz codenames.
- Fizyka/topologia/adaptery danych nietykalne — zmiana dotyczy WARSTWY RYSUNKU.
</ograniczenia_twarde>

<definicja_ukonczenia>
DONE gdy: (1) A2-redesign zatwierdzony renderami koncepcyjnymi; (2) cztery widoki
przeimplementowane i każdy przechodzi WSZYSTKIE checklisty A3 (odstępstwa tylko
data-limited, wyliczone); (3) na renderach NIE MA kart/chipów w obszarze rysunku
(test wzrokowy + brak rect-z-zaokrągleniem jako tła elementów sieci w rendererach);
(4) bramki pełne zielone, ratchet ≤ baseline, wszystko wypchnięte; (5) raport C.
Plateau lub konflikt z kontraktem testowym nie do pogodzenia → STOP z raportem
i rekomendacją (uczciwy stop > kosmetyka).
</definicja_ukonczenia>

<format_raportu>
Po każdej iteracji: widok, PNG przed/po, wynik samo-audytu per rola (skrót),
liczby bramek, hash commita. Na końcu: tabela odbioru per rola × widok.
</format_raportu>
