# RECENZJA ZESPOŁU EKSPERCKIEGO — SLD L2: POLA SN, OZE, OPISY LINII, WARSTWA WYNIKOWA (2026-07-23) — WIĄŻĄCA

Status: **WIĄŻĄCA — warunki odbioru L2** (uwagi właściciela 2026-07-23, po
audycie powykonawczym `AUDYT_POWYKONAWCZY_SLD_2026-07.md`). Werdykt: **NIE
ZATWIERDZAĆ** — layout globalny na dobrym poziomie, warstwa inżynierska L2 zbyt
uproszczona. Sedno: **schemat ma być bezpośrednim odwzorowaniem modelu sieci i
konfiguracji kreatora, nie jednym uniwersalnym szablonem pola.**

## §1 Wyposażenie pola Z KREATORA, nie ze stałego szablonu (P0)
Zakaz renderu wszystkich pól liniowych jako identycznego zestawu
(łącznik+głowica+uziemnik). Różnicować co najmniej: liniowe z CB / z LBS /
z LBS-FUSE; transformatorowe z CB / z LBS-FUSE; pomiarowe; sprzęgła; sekcyjne;
źródłowe DER; baterii kondensatorów; potrzeb własnych; z CT; z VT; z SA;
z zabezpieczeniem i automatyką. Każdy aparat wybrany w kreatorze widoczny w
PRAWIDŁOWEJ KOLEJNOŚCI toru pierwotnego (przykłady: szyna→odłącznik→CT→CB→
uziemnik od kabla→SA→głowica→kabel; albo szyna→LBS→bezpieczniki→uziemnik→
głowica→kabel). Zakaz wymuszania jednego schematu aparaturowego dla wszystkich
producentów. KONTRAKT: `buildScene` dostaje GOTOWĄ listę wyposażenia pola z
modelu domenowego (FieldEquipment: fieldId, function
LINE/TRANSFORMER/COUPLER/SECTION/METERING/DER/CAPACITOR/AUXILIARY, devices[]
{type CB/LBS/DISCONNECTOR/FUSE/EARTH_SWITCH/CT/VT/SURGE_ARRESTER/CABLE_HEAD/
PROTECTION_RELAY, state OPEN/CLOSED/EARTHED, side BUS/LINE/TRANSFORMER}).
UI nie zgaduje wyposażenia z nazwy pola.

## §2 Pola rozróżnialne funkcyjnie (P1)
Podpis pola: funkcja + oznaczenie + kierunek + typ aparatu głównego + stan
(+ producent/typ rozdzielnicy na wyższym LOD). Przykład: „Pole L-01 — kier.
S02 · wyłącznikowe · Q1 zamknięty · uziemnik QE1 otwarty". Zakaz powrotu do
WE/WY. Rozróżnienie z REALNEJ funkcji: liniowe/transformatorowe/sekcyjne/
pomiarowe/sprzęgłowe/źródłowe/odgałęźne.

## §3–§4 PV: pełny, jednoznaczny tor przyłączenia (P0)
PV nie może wisieć poziomo z boku jak dekoracja. Pokazać pełny tor: PV→
falownik→rozdzielnia AC nN→aparat zabezpieczający→TR→pole SN→szyna SN.
Wariant A (za TR SN/nN): szyna SN→pole TR→TR→SZYNA nN→zabezpieczenie odpływu
PV→falownik; odbiór i PV na tej samej szynie nN; przepływ dwukierunkowy.
Wariant B (TR blokowy): szyna SN→pole źródłowe→kabel SN→TR blokowy→
rozdzielnia AC→falowniki. Zakaz symbolu PV na pojedynczej kresce bez: poziomu
napięcia, aparatu przyłączeniowego, punktu przyłączenia, TR (jeśli jest),
rozróżnienia DC/AC, trybu pracy. Symbolika: PV=romb/jawny falownik,
BESS=kwadrat(bateria), generator=okrąg; TRÓJKĄT ZAREZERWOWANY dla głowicy.

## §5 Światła równoległych kabli (P0)
Zakaz prowadzenia dwóch kabli tak blisko, że wyglądają jak przewód podwójny.
Nowe kontrakty: MIN_PARALLEL_CABLE_CLEARANCE, MIN_CABLE_LABEL_CLEARANCE,
MIN_JUNCTION_CLEARANCE, MIN_FIELD_EXIT_CLEARANCE. Każdy kabel wychodzi z osi
WŁASNEJ głowicy; przy zbliżeniu tras: odrębne osie, zero nakładania,
jednoznaczne węzły, miejsce na etykietę.

## §6 Głowice kablowe jednoznaczne (P0, w §1)
Każda linia kablowa z pola SN zaczyna się na głowicy (nie na szynie/punkcie
abstrakcyjnym): szyna→aparat→uziemnik→głowica→kabel. Rozróżnić: głowicę,
przyłącze linii napowietrznej, mufę, punkt przejścia kabel–napowietrzna.

## §7 Etykiety techniczne linii (P0)
Minimum kabel: relacja · typ · żyły×przekrój · napięcie · długość (np.
„S01 ↔ S02 · YAKXS 3×1×240 mm² · 12/20 kV · l = 680 m"). Minimum
napowietrzna: relacja · typ · przekrój · długość. Etykieta ZAKOTWICZONA do
linii (nie luźno nad schematem). Hierarchia: L0 relacja; L1 typ+długość;
L2 pełne dane + podstawowe wyniki.

## §8–§9 Warstwa wynikowa na L2 (P0), bez zmiany geometrii
Gdy wyniki są i użytkownik włączy warstwę: rozpływ (węzły U kV/p.u./ΔU%/kąt;
linie P/Q/I/obciążenie%/ΔP/ΔQ; TR P/Q/S/obciążenie/straty/zaczep; PV/BESS
Pgen/Qgen/cosφ/tryb/limit Q), zwarcia (Ik″3f/2f/1f, ip, Ith, Sk″), spadki
(ΔU V/%), obciążalność (I/Iz, rezerwa). Nakładka NA kanoniczny layout: zakaz
przesuwania stacji/aparatury, zmiany kotwic L0/L1/L2, wydłużania linii,
kolizji opisów; footprint wyników w budżecie etykiet lub deterministyczne
callouty.

## §10–§11 Opis stacji przy symbolu; szyna nN realna (P0)
Blok opisu stacji bezpośrednio pod symbolem/przy osi TR, w bbox poddrzewa,
bez przecinania kabli — nie pośrodku pustki. Rozdzielić: nazwa/oznaczenie/
typ/moc TR/układ nN/obciążenie/źródła za TR. Jeżeli opis mówi „Szyna nN
0,4 kV" — szyna nN MUSI mieć geometrię: TR→aparat główny nN→szyna nN→odbiór→
odpływ PV; inaczej opis ograniczyć (zakaz opisywania niewidocznej topologii).

## §12–§15 Pole TR dopowiedziane; symbole aparatów czytelne; CT/VT/SA/
zabezpieczenia wg konfiguracji; uziemnik z boku toru (P0/P1)
Pole TR z wyposażeniem z kreatora (CB+CT+uziemnik+SA+głowica+TR albo
LBS-FUSE+bezpieczniki+uziemnik+głowica+TR), z czytelnym rozdziałem aparat/
głowica/przewód/strony SN i nN. Symbol aparatu ważniejszy niż etykieta
(Q1 nie wystarczy — geometria mówi typ i stan). CT/VT/SA/zabezpieczenia/SPZ/
ziemnozwarciowe wg konfiguracji i zakresu LOD; zabezpieczenie jako urządzenie
wtórne powiązane z CT/VT/cewką CB (nie wielki blok w torze); VT opisany jako
przekładnik napięciowy. Uziemnik bocznie od toru (od strony kabla/TR), stan
jawny; nie mieszać uziemnika/symbolu uziemienia/punktu neutralnego.

## §16 Kierunek i znak przepływu (P1, warstwa wynikowa)
Przy PV przepływ bywa odwrotny: strzałka przepływu + znak P + wartość ze
znakiem (+ opcjonalny kolor); kierunek NIE kodowany wyłącznie kolorem.

## §17 Etykiety przypisane do obiektów (P0)
Każda etykieta: właściciel (id), kotwica na obiekcie, deterministyczne
położenie, przewidziany bbox, zakaz dryfu do sąsiedniej gałęzi. Dotyczy
relacji linii, typu, długości, nazw sekcji/pól, wyników.

## §18 Podwarstwy L2 (P1)
L2-A aparatura pierwotna · L2-B pomiary+zabezpieczenia · L2-C dane katalogowe
· L2-D wyniki. Użytkownik włącza kombinacje; tożsamość i kotwica stacji
niezmienne.

## §19 Zasada globalna
Poprawka działa dla: GPZ, ZKSN, stacji przelotowych/odgałęźnych/końcowych,
z PV/BESS/generatorem, wielotransformatorowych, pól pomiarowych/sekcyjnych/
sprzęgieł, punktów NO, linii kablowych/napowietrznych/mieszanych. Każdy
wariant wyposażenia z kreatora ma wariant symboliczny i test akceptacyjny.

## §20 Macierz testowa obowiązkowa
Liniowe: LBS+uziemnik · CB+CT+uziemnik · LBS+bezpieczniki · CB+CT+SA.
Transformatorowe: LBS-FUSE+uziemnik · CB+CT+zabezpieczenie · CB+CT+VT+zab.
Źródłowe: PV za TR SN/nN · PV z TR blokowym · BESS za TR · BESS z TR
blokowym · generator synchroniczny. Linie: kabel krótki/długi · napowietrzna
· mieszany · dwa równoległe kable. Wyniki: load flow · short circuit ·
voltage drop · thermal · protection. Per test: zgodność z kreatorem,
kolejność aparatów, ciągłość toru, zero kolizji, pełne etykiety, poprawne
wyniki, kotwica L0=L1=L2.

## PRIORYTETY
P0: 1) wyposażenie pól z kreatora; 2) pełny tor PV; 3) światła równoległych
kabli; 4) etykiety typ/przekrój/długość linii; 5) opcjonalna warstwa wyników;
6) realna szyna nN gdy opisana; 7) pole TR; 8) etykiety związane z obiektami.
P1: 1) CT/VT/SA/zabezpieczenia wg konfiguracji; 2) rozróżnienie wariantów
pól; 3) czytelność symboli aparatów; 4) podwarstwy L2; 5) pełna macierz
testów wyposażenia.

## WARUNKI ODBIORU (wszystkie jednocześnie)
Każde pole == konfiguracja kreatora · brak uniwersalnego szablonu · PV z
pełnym torem · światła kabli · każda linia z relacją/typem/przekrojem/
długością · wyniki jako warstwa · szyna nN pokazana gdy opisana · kolejność
aparatów poprawna · CT≠VT · uziemniki poprawnie umieszczone ze stanem ·
etykiety bez kolizji · wyniki nie zmieniają kotwic · L0/L1/L2 jedna
tożsamość · działa dla wszystkich wspieranych typów realnych sieci SN.

## PROGRAM WDROŻENIA „L2-PRZEMYSŁOWE" (fazy — zarządca Fable, wykonawcy Opus)
- **W1 (P0.1+P0.7+§6):** kontrakt FieldEquipment end-to-end (recon realnych
  danych Bay/primary_devices/bay_template_ref → adapter → scena) + render
  toru pierwotnego pola Z DANYCH (kolejność, stany, uziemnik bocznie,
  głowica zawsze na styku kabla) + pole TR dopowiedziane.
- **W2 (P0.2+P0.6):** pełny tor DER (wariant A: realna szyna nN z aparatem
  głównym, odbiór i PV na szynie; wariant B: pole źródłowe SN + TR blokowy)
  + zakaz opisu niewidocznej topologii; absorbuje kartę GS-4b (Z2 audytu).
- **W3 (P0.3+P0.4+P0.8):** światła kabli (4 nowe kontrakty), etykiety
  techniczne linii z katalogu (relacja/typ/przekrój/napięcie/długość)
  zakotwiczone do właściciela, hierarchia L0/L1/L2.
- **W4 (P0.5+§9+§16):** warstwa wynikowa L2 (reużycie istniejących overlay
  v3: przepływ/zwarcia/OLTC → rozszerzenie o kontrakty §8) bez zmiany
  geometrii, kierunek ze strzałką i znakiem.
- **W5 (P1):** CT/VT/SA/zabezpieczenia wg konfiguracji, podpisy funkcyjne
  pól (§2), czytelność symboli (§13), podwarstwy L2 (§18), pełna macierz
  testowa (§20).
