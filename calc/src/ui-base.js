/* ===================================================================
   Oberfläche Teil 1: Formatierung, Parameterbeschreibung, Zustand,
   Formulare, Ansichten-Wechsel, Neuberechnung
   =================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NF = {};
function nf(x, d = 1) {
  if (!fin(x)) return x === Infinity ? '∞' : x === -Infinity ? '−∞' : '–';
  const f = NF[d] || (NF[d] = new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return f.format(x).replace('-', '−');
}
const nfs = (x, d = 1) => (fin(x) && x > 0 ? '+' : '') + nf(x, d);
function fmtT(h) { if (!fin(h)) return '–'; let t = ((h % 24) + 24) % 24, H = Math.floor(t), M = Math.round((t - H) * 60); if (M === 60) { H = (H + 1) % 24; M = 0; } return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0'); }
function fmtDur(h) { if (!fin(h)) return h === Infinity ? '∞' : '–'; const s = h < 0 ? '−' : '', a = Math.abs(h), H = Math.floor(a), M = Math.round((a - H) * 60); return s + (M === 60 ? H + 1 + ' h' : H + ' h ' + String(M).padStart(2, '0') + ' min'); }
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function fmtDoy(n, y) { const d = new Date(Date.UTC(y || 2026, 0, n)); return d.getUTCDate() + '. ' + MONTHS[d.getUTCMonth()]; }
function pill(kind, text) { const ic = { good: '✓', warn: '!', crit: '×', info: 'i' }[kind] || 'i'; return `<span class="pill ${kind}"><span class="ic" aria-hidden="true">${ic}</span>${esc(text)}</span>`; }
const pct = x => nf(x * 100, 0) + ' %';

/* ---------- Daten aus der Seite ---------- */
const DATA = {};
function readData(id) { const el = document.getElementById(id); return el ? JSON.parse(el.textContent) : null; }

/* ---------- Parameterbeschreibung: [Schlüssel, Bezeichnung, Einheit, Schritt, min, max, Auswahl, Hilfe] ---------- */
const SEL = {
  planform: [['rect', 'Rechteck'], ['taper', 'Trapez'], ['rect_taper', 'Rechteck innen, Trapez außen'], ['ellip', 'Elliptisch (Referenz)']],
  transition: [['free', 'frei (glatte Oberfläche)'], ['trip', 'Umschlag an der Zellkante (x/c 10 %)']],
  fusFlow: [['turb', 'turbulent (vorsichtig)'], ['mixed', 'teilweise laminar']],
  powerModel: [['physik', 'Physik (Polaren, Traglinie)'], ['mess', 'Messpunkt (ETH-Skalierung)'], ['fit', 'Ausgleichskurve eigener Flugdaten']],
  propModel: [['model', 'Impulstheorie + Wirkungsgradkette'], ['bemt', 'Propeller-Kennfeld (Blattelemente) + Motormodell'], ['eta', 'fester Gesamtwirkungsgrad']],
  propGeom: [['design', 'eigener Propeller (APC-Blattform skaliert)'], ['apc10x7', 'APC 10x7E (Messvergleich)']],
  motorPos: [['nose', 'Zugpropeller in der Nase'], ['pusher', 'Druckpropeller am Rumpfende'], ['fin', 'Zugpropeller oben am Seitenleitwerk']],
  fusType: [['pod', 'Gondel mit Rohrträger'], ['glider', 'Segelflugzeugrumpf (Schale bis zum Leitwerk)'], ['twin', 'Gondel mit zwei Leitwerksträgern']],
  tailType: [['cross', 'Normalleitwerk (Höhenleitwerk am Fuß)'], ['T', 'T-Leitwerk (Höhenleitwerk oben)']],
  landGear: [['skid', 'Kufe unter dem Rumpf (GFK-Blattfeder)'], ['belly', 'Bauchlandung auf verstärktem Rumpfboden']],
  launch: [['catapult', 'Katapult (Gummi oder Druckluft)'], ['hand', 'Handstart']],
  wireModel: [['model', 'aus Leitungswegen berechnen'], ['fix', 'feste (gemessene) Masse']],
  trimMode: [['battery', 'Akku verschieben'], ['wing', 'Flügel samt Leitwerk verschieben'], ['ballast', 'Ballast'], ['none', 'keine (Lagen wie eingegeben)']],
  splits: [['center', 'in der Mitte (am Rumpf)'], ['outer', 'außen (Mittelstück + 2 Außenflügel)'], ['both', 'Mitte und außen (4 Teile)'], ['none', 'ungeteilt']],
  structMode: [['model', 'Bauweisen-Modell'], ['fix', 'feste Masse']],
  sparType: [['caps', 'Gurte mit Steg'], ['tube', 'Rohrholm']],
  solarGeom: [['profil', 'aus Profilkontur (Wölbung, Einfallswinkel)'], ['flach', 'waagerecht mit Pauschalfaktor (ETH)']],
  stringLayout: [['span', 'Strings in Spannweitenrichtung'], ['chord', 'Strings in Tiefenrichtung']],
  tz: [['auto', 'MEZ/MESZ automatisch'], ['0', 'UTC'], ['1', 'UTC+1'], ['2', 'UTC+2'], ['3', 'UTC+3'], ['-3', 'UTC−3'], ['-5', 'UTC−5'], ['-7', 'UTC−7'], ['-8', 'UTC−8']],
  weather: [['clear', 'Klarer Himmel (Modell)'], ['piemont', 'Piemont, PVGIS-TMY (echt)'], ['amsterdam', 'Amsterdam, IWEC (echt)'], ['upload', 'Eigene Datei (PVGIS, EPW)'], ['gen', 'Wettergenerator (Monatswerte)']],
  arcStrat: [[0, 'keine'], [-1, 'eine Klasse (Nachweis geringer Verkehrsdichte)']]
};
const PM = {};
[
  // Flügel
  ['span', 'Spannweite', 'm', 0.05, 1, 15], ['area', 'Flügelfläche', 'm²', 0.01, 0.2, 6], ['planform', 'Grundriss', '', 0, 0, 0, 'planform'],
  ['taper', 'Zuspitzung (Spitze/Wurzel)', '', 0.05, 0.2, 1], ['centerFrac', 'Anteil Rechteck-Mittelteil', '', 0.05, 0, 0.95],
  ['washout', 'Schränkung an der Spitze', '°', 0.5, -3, 6, null, 'Nase der Flügelspitze nach unten: verhindert Abriss an der Spitze, kostet bei kleinem Auftrieb etwas Wirkungsgrad.'],
  ['dihedral', 'V-Form der Außenflügel', '°', 0.5, 0, 12, null, 'Wirkt auf die Seitenstabilität (Spirale, Taumelschwingung) und die Einstrahlung. Die Biegung im Flug kommt als elastische V-Form hinzu.'],
  ['sweep', 'Pfeilung der t/4-Linie', '°', 1, -25, 30, null, 'Positiv nach hinten, negativ nach vorn. Verschiebt den Neutralpunkt, ändert Auftriebsanstieg, Abrissverlauf und Seitenstabilität. Vorwärtspfeilung kann bei elastischen Flügeln zur Divergenz führen (Ansicht Struktur).'],
  ['airfoil', 'Profil', '', 0, 0, 0, 'airfoil'], ['transition', 'Grenzschicht Flügel', '', 0, 0, 0, 'transition', 'Zellkanten und Laminatstufen können die laminare Lauflänge begrenzen. „Umschlag“ erzwingt ihn bei 10 % der Tiefe.'],
  // Leitwerk
  ['tailAirfoil', 'Leitwerksprofil', '', 0, 0, 0, 'tailAirfoil'], ['tailArm', 'Leitwerkshebelarm', 'm', 0.05, 0.3, 4],
  ['vH', 'Höhenleitwerksvolumen', '', 0.01, 0.2, 1, null, 'Segler und Solarflugzeuge: 0,35–0,5.'], ['vV', 'Seitenleitwerksvolumen', '', 0.002, 0.01, 0.06, null, 'Segler: 0,015–0,03.'],
  ['arH', 'Streckung Höhenleitwerk', '', 0.5, 2, 10], ['arV', 'Streckung Seitenleitwerk', '', 0.1, 0.8, 4],
  ['fusL', 'Rumpfgondel Länge', 'm', 0.05, 0.2, 3], ['fusD', 'Rumpfgondel Durchmesser', 'm', 0.01, 0.04, 0.5], ['boomD', 'Leitwerksträger Durchmesser', 'm', 0.002, 0.008, 0.08],
  ['zTail', 'Leitwerksfuß über Flügelebene', 'm', 0.01, -0.5, 1, null, 'Höhe von Trägerende bzw. Rumpfröhre am Leitwerk. Beim Normalleitwerk sitzt dort das Höhenleitwerk, beim T-Leitwerk eine Seitenleitwerkshöhe darüber. Bestimmt den Abwind am Höhenleitwerk (DATCOM).'],
  ['etaTail', 'Staudruckverhältnis am Leitwerk', '%', 1, 60, 110, null, 'Rumpf- und Flügelnachlauf senken den Staudruck. Freies Leitwerk 90–95 %, im Propellerstrahl über 100 %.'],
  ['fusFlow', 'Grenzschicht Rumpf', '', 0, 0, 0, 'fusFlow'], ['kInt', 'Interferenz und Spalte', '%', 1, 0, 50, null, 'Zuschlag auf Rumpf, Leitwerk und Anbauten für Übergänge, Spalte, Antennen.'],
  ['kDrag', 'Widerstandsreserve gesamt', '%', 1, 0, 50],
  // Flug
  ['v', 'Reisegeschwindigkeit (wahre Fahrt)', 'm/s', 0.5, 4, 40], ['vmax', 'Höchstgeschwindigkeit (SORA)', 'm/s', 1, 5, 80], ['mtomLimit', 'Zulässige Abflugmasse', 'kg', 0.5, 1, 40],
  ['turnFrac', 'Anteil Kurvenflug', '%', 5, 0, 100, null, 'Kreisen über einem Brand und Wendekurven der Suchmuster kosten Leistung und neigen die Zellen.'], ['bank', 'Querneigung im Kurvenflug', '°', 1, 0, 45],
  ['hAGL', 'Flughöhe über Grund', 'm', 10, 0, 3000], ['alt', 'Geländehöhe über NN', 'm', 10, -100, 4000],
  ['turbDay', 'Mehrverbrauch Böen/Thermik tagsüber', '%', 1, 0, 40, null, 'ETH-Ansatz aus dem 81-h-Flug: Dreieck über den Tag mit diesem Mittelwert.'], ['zuschlag', 'Zuschlag Antriebsleistung', '%', 1, 0, 100],
  ['powerModel', 'Leistungsmodell', '', 0, 0, 0, 'powerModel'], ['pMeas', 'Gemessene Antriebsleistung', 'W', 0.5, 1, 2000], ['mMeas', 'Masse bei der Messung', 'kg', 0.1, 0.5, 50], ['rhoMeas', 'Luftdichte bei der Messung', 'kg/m³', 0.01, 0.5, 1.4],
  // Längsaufteilung und Trimmung
  ['motorPos', 'Motoranordnung', '', 0, 0, 0, 'motorPos'], ['fusType', 'Rumpfform', '', 0, 0, 0, 'fusType'], ['tailType', 'Leitwerksform', '', 0, 0, 0, 'tailType'],
  ['coneD', 'Rumpfröhre am Leitwerk Durchmesser', 'm', 0.005, 0.015, 0.3], ['wCone', 'Rumpfröhre Mindest-Flächengewicht', 'kg/m²', 0.01, 0.1, 3, null, 'Schale aus CFK-Gewebe mit Harz. Wird auf Festigkeit und Beulen nachgerechnet und bei Bedarf verstärkt.'],
  ['zBatt', 'Akku Höhe über Rumpfachse', 'm', 0.01, -0.3, 0.3],
  ['trimMode', 'Schwerpunkt einstellen über', '', 0, 0, 0, 'trimMode'], ['smTarget', 'Ziel-Stabilitätsmaß', '% MAC', 1, 2, 30, null, 'Abstand Schwerpunkt vor Neutralpunkt. Segler und Solarflugzeuge: 8–15 %. Weniger spart Trimmwiderstand, mehr macht ruhiger.'],
  ['xWingLE', 'Flügelvorderkante an der Wurzel', 'm ab Bug', 0.01, 0, 3], ['xBatt', 'Akku-Schwerpunkt', 'm ab Bug', 0.01, 0, 3],
  ['wireModel', 'Verkabelung', '', 0, 0, 0, 'wireModel'], ['mWireFix', 'Kabel und Stecker gesamt', 'kg', 0.01, 0, 3],
  ['wireExtra', 'Zuschlag Kabelbaum', '%', 1, 0, 100, null, 'Kabelbinder, Schutzschlauch, Halter, Lötstellen. Leitungen und Stecker selbst sind einzeln gerechnet.'],
  ['wireDropSol', 'Spannungsfall Solarleitungen', '%', 0.1, 0.3, 5, null, 'Bei Spitzenleistung. Kleiner heißt dickere, schwerere Leitungen und weniger Verlust.'],
  ['nAilSeg', 'Querruder-Segmente je Seite', '', 1, 1, 4, null, 'Je Segment ein Servo. Lange Flügel teilen die Querruder, damit sie sich nicht verwinden.'],
  ['ailEta0', 'Querruder von', '× b/2', 0.01, 0.1, 0.9], ['ailEta1', 'Querruder bis', '× b/2', 0.01, 0.2, 1],
  ['ailCf', 'Querruder Tiefe', '× c', 0.01, 0.05, 0.6, null, 'Anteil der Flügeltiefe hinter der Drehachse. Üblich 20–30 %.'], ['ailMax', 'Querruder Vollausschlag', '°', 1, 5, 40],
  ['elevCf', 'Höhenruder Tiefe', '× c', 0.01, 0.1, 1, null, '1 heißt Pendelhöhenruder (ganze Fläche beweglich). Üblich 30–45 %.'], ['elevMax', 'Höhenruder Vollausschlag', '°', 1, 5, 40],
  ['rudCf', 'Seitenruder Tiefe', '× c', 0.01, 0.1, 1], ['rudMax', 'Seitenruder Vollausschlag', '°', 1, 5, 40],
  ['vCross', 'Seitenwind bei der Landung', 'm/s', 0.5, 0, 15, null, 'Mindestens 0,2 × Mindestfahrt (CS-23.233). Ohne Fahrwerk wird meist gegen den Wind gelandet.'],
  ['cgTol', 'Schwerpunkttoleranz', '± cm', 0.5, 0, 10, null, 'Streuung durch Beladung und Einbau. Das Höhenruder muss beide Grenzlagen trimmen können.'],
  ['nCtrl', 'Lastvielfaches für die Ruderauslegung', 'g', 0.1, 1.1, 4, null, 'Steilste Kurve, die das Höhenruder noch halten soll (1,5 g = 48° Querlage). Das Bruch-Lastvielfache gilt nur für die Struktur.'],
  ['wCtrl', 'Flächengewicht der Ruder', 'kg/m²', 0.05, 0.05, 5, null, 'Ruder samt Beplankung, Scharnier und Ruderhorn. Leichte Schaum- oder Balsaruder 0,3–0,6 kg/m².'],
  ['ctrlXcg', 'Ruderschwerpunkt hinter der Drehachse', '% Rudertiefe', 1, 10, 80, null, 'Gleichmäßig dicke Platte 50 %, keilförmiges Ruder 33 %. Messen: Ruder auf einer Schneide in der Drehachse auswiegen.'],
  ['ctrlBal', 'Massenausgleich eingebaut', '%', 5, 0, 150, null, 'Anteil des statischen Ruder-Moments, den Gewichte vor der Drehachse ausgleichen. 100 % heißt statisch ausgewogen.'],
  ['kServo', 'Steifigkeit Servo und Gestänge', 'N·m/rad', 1, 0.5, 500, null, 'Drehsteifigkeit an der Ruderachse je Servo. Bestimmt die Ruderdrehfrequenz. Spielfreie Anlenkung, kurzes Gestänge: 10–50 N·m/rad.'],
  ['gvtAil', 'Gemessen: Querruder-Drehfrequenz', 'Hz', 0.5, 0, 500, null, '0 heißt nicht gemessen, dann aus der Steifigkeit gerechnet. Messung: Servo eingeschaltet, Ruder anschlagen, Beschleunigungsaufnehmer an der Endleiste.'],
  ['gvtElev', 'Gemessen: Höhenruder-Drehfrequenz', 'Hz', 0.5, 0, 500], ['gvtRud', 'Gemessen: Seitenruder-Drehfrequenz', 'Hz', 0.5, 0, 500],
  ['gvtB1', 'Gemessen: 1. symmetrische Flügelbiegung', 'Hz', 0.05, 0, 100, null, 'Standschwingversuch am weich aufgehängten Flugzeug (Aufhängung deutlich unter der Messfrequenz). Eicht die Biegesteifigkeit des Flügels.'],
  ['gvtT1', 'Gemessen: 1. Flügeltorsion', 'Hz', 0.1, 0, 300, null, 'Eicht die Torsionssteifigkeit des Flügels.'],
  ['gvtFin', 'Gemessen: Seitenleitwerk quer', 'Hz', 0.1, 0, 300, null, 'Erste Querschwingung von Seitenleitwerk und Träger bzw. Rumpfröhre. Eicht deren Steifigkeit.'],
  ['gvtHT', 'Gemessen: Höhenleitwerk auf und ab', 'Hz', 0.1, 0, 300, null, 'Erste symmetrische Schwingung des Höhenleitwerks auf dem Träger.'],
  ['landGear', 'Landung', '', 0, 0, 0, 'landGear'], ['vSink', 'Sinkgeschwindigkeit beim Aufsetzen', 'm/s', 0.1, 0.3, 4, null, 'Auslegungswert für den Landestoß. Ruhige Wiesenlandung 0,8–1,2 m/s, harte Landung 1,5–2 m/s.'],
  ['skidStroke', 'Federweg der Kufe', 'm', 0.005, 0.005, 0.2], ['bellyStroke', 'Eindrückweg Rumpfboden', 'm', 0.002, 0.003, 0.1, null, 'Schaumstoff-Bauchpolster: wenige Zentimeter. Wenig Weg heißt hohe Stoßlast auf Akku und Einbauten.'],
  ['skidCdA', 'Kufe Widerstandsfläche', 'cm²', 0.5, 0, 50], ['wBelly', 'Verstärkung Rumpfboden', 'kg/m²', 0.05, 0, 3],
  ['landPitch', 'Lage beim Aufsetzen (Nase hoch)', '°', 1, -5, 20],
  ['launch', 'Start', '', 0, 0, 0, 'launch'], ['launchRail', 'Schienenlänge Katapult', 'm', 0.1, 0.5, 10], ['launchAngle', 'Neigung der Startschiene', '°', 1, 0, 30],
  ['vHand', 'Abwurfgeschwindigkeit Handstart', 'm/s', 0.5, 2, 15, null, 'Laufender Werfer mit Wurf: 6–9 m/s. Schwere Flugzeuge lassen sich kaum schneller werfen.'],
  ['vLaunchK', 'Startgeschwindigkeit / Mindestfahrt', '', 0.05, 1, 1.6], ['nLaunchMax', 'Zulässige Startbeschleunigung', 'g', 0.5, 2, 30, null, 'Grenze der Einbauten (Kameras, Akkuhalter). Kleinere Werte brauchen eine längere Schiene.'],
  ['htSolar', 'Zellen auf dem Höhenleitwerk', '% HLW', 5, 0, 95, null, 'Anteil der Höhenleitwerksfläche mit Zellen. Waagerecht, mit Schatten des Seitenleitwerks über alle Kurse gemittelt.'],
  // Antrieb
  ['propModel', 'Antriebsmodell', '', 0, 0, 0, 'propModel'], ['etaTotal', 'Gesamtwirkungsgrad', '%', 1, 10, 95],
  ['propD', 'Propellerdurchmesser', 'm', 0.02, 0.1, 2.5], ['nProp', 'Anzahl Propeller', '', 1, 1, 4], ['etaProfile', 'Propeller-Profilwirkungsgrad', '%', 1, 50, 98, null, 'Anteil nach Abzug der Strahlverluste (Impulstheorie): Profil- und Drallverluste. Gute Langsamflugpropeller 85–90 %.'],
  ['etaMotor', 'Motorwirkungsgrad', '%', 1, 50, 98], ['etaEsc', 'Reglerwirkungsgrad', '%', 1, 70, 99.5], ['etaGear', 'Getriebewirkungsgrad', '%', 1, 70, 100], ['mAntrieb', 'Masse Antrieb (Motor, Regler, Propeller)', 'kg', 0.01, 0, 5],
  ['propGeom', 'Propeller', '', 0, 0, 0, 'propGeom'], ['propPitch', 'Steigung', 'm', 0.01, 0.05, 2, null, 'Geometrische Steigung bei 75 % Radius. Solar-UAV: Steigung/Durchmesser 0,6–0,8.'],
  ['propChord', 'Blatttiefe relativ zu APC', '', 0.05, 0.3, 1.6, null, 'Skaliert die Tiefenverteilung des APC 10x7E. Klapppropeller sind schlanker (0,6–0,8).'], ['propBlades', 'Blattzahl', '', 1, 2, 6],
  ['propFoil', 'Blattprofil', '', 0, 0, 0, 'propFoil', 'Generisch nach QPROP trifft dünne, gewölbte Propellerprofile am besten (Validierung). Tragflügelprofile aus der Datenbank sind für Propeller meist zu optimistisch im Widerstand und zu schwach gewölbt.'],
  ['motKv', 'Motor-Drehzahlkonstante Kv', 'U/min/V', 5, 20, 3000], ['motR', 'Wicklungswiderstand', 'Ω', 0.005, 0.005, 2], ['motI0', 'Leerlaufstrom', 'A', 0.05, 0, 10], ['motImax', 'Maximalstrom', 'A', 1, 1, 200],
  ['nCells', 'Zellen in Reihe', 's', 1, 1, 14], ['cellV', 'Zellspannung (Mittel)', 'V', 0.05, 2.5, 4.2, null, 'Li-Ion 3,6 V, LiPo 3,7 V. Begrenzt Höchstdrehzahl und Steigleistung.'], ['gearRatio', 'Getriebeuntersetzung', '', 0.1, 1, 10],
  // Struktur
  ['structMode', 'Strukturmasse', '', 0, 0, 0, 'structMode'], ['mZelle', 'Feste Strukturmasse', 'kg', 0.1, 0.2, 30],
  ['rugged', 'Zuschlag Robustheit (Feldbetrieb)', '%', 5, 0, 200, null, 'AtlantikSolar-Bauweise ist ein Rekordflugzeug. Für Feldeinsätze, Landungen auf Wiesen und häufigen Transport 15–50 % ansetzen.'],
  ['nLimit', 'Manöver-Lastvielfaches', 'g', 0.1, 2, 9], ['safety', 'Sicherheitsfaktor', '', 0.05, 1.2, 2.5], ['vGust', 'Böen-Auslegungsgeschwindigkeit', 'm/s', 0.5, 5, 60], ['gustU', 'Böengeschwindigkeit', 'm/s', 0.5, 3, 25],
  ['deflMax', 'Max. Durchbiegung der Spitze bei 1 g', '% b/2', 1, 2, 30], ['battInWing', 'Akku im Flügel verteilt (entlastet den Holm)', '', 0, 0, 0, 'bool'],
  ['sparType', 'Holmbauweise', '', 0, 0, 0, 'sparType'], ['sparH', 'Holmhöhe / Profildicke', '%', 1, 50, 98],
  ['xSpar', 'Holmlage', '% Tiefe', 1, 15, 50, null, 'Die elastische Achse liegt knapp vor dem Holm. Liegt sie hinter dem Neutralpunkt der Profile (25 %), droht Divergenz; liegt der Profilschwerpunkt weit dahinter, sinkt die Flattergeschwindigkeit.'],
  ['matCap', 'Holmgurte', '', 0, 0, 0, 'matCap'], ['matWeb', 'Holmsteg', '', 0, 0, 0, 'matWeb'], ['matSkin', 'Nasenbeplankung (Torsionsnase)', '', 0, 0, 0, 'matSkin', 'Bestimmt die Torsionssteifigkeit und damit Torsionsfrequenz, Flatter- und Divergenzgeschwindigkeit.'], ['matBoom', 'Leitwerksträger', '', 0, 0, 0, 'matBoom'],
  ['matKnock', 'Abminderung der Festigkeit', '%', 1, 20, 100, null, 'Zulässige Gurtspannung = Kennwert × Abminderung. Handlaminat, Feuchte, Temperatur, Kerben, Streuung: 45–60 %.'],
  ['splits', 'Flügelteilung', '', 0, 0, 0, 'splits'], ['splitEta', 'Lage der Außenteilung', '× b/2', 0.02, 0.2, 0.8],
  ['capMin', 'Mindest-Gurtquerschnitt', 'mm²', 0.5, 0, 50], ['wWeb', 'Holmsteg Flächengewicht', 'kg/m²', 0.05, 0, 3], ['ribSpacing', 'Rippenabstand', 'm', 0.01, 0.05, 0.6], ['wRib', 'Rippen Flächengewicht', 'kg/m²', 0.05, 0, 3],
  ['wLE', 'Nasenbeplankung', 'kg/m²', 0.01, 0, 2], ['wSkin', 'Bespannung', 'kg/m²', 0.005, 0, 1], ['wTE', 'Endleiste und Ruder', 'kg/m', 0.005, 0, 0.5], ['mJoint', 'Beschläge je Steckung', 'kg', 0.01, 0, 1, null, 'Zusätzlich zur rechnerischen Steckungszunge: Hülsen, Stifte, Stecker, Verriegelung.'],
  ['wTail', 'Leitwerk Flächengewicht', 'kg/m²', 0.01, 0, 3], ['boomLin', 'Leitwerksträger', 'kg/m', 0.01, 0, 1], ['wFus', 'Gondel Flächengewicht', 'kg/m²', 0.05, 0, 5], ['mFusFix', 'Gondel Einbauten', 'kg', 0.01, 0, 5],
  // Akku
  ['mBatt', 'Akkumasse', 'kg', 0.05, 0, 20], ['battSpec', 'Energiedichte (Pack)', 'Wh/kg', 5, 50, 450, null, 'Ganzer Pack inkl. Verbinder und BMS. Li-Ion 18650/21700: 200–260 Wh/kg.'],
  ['reserve', 'Reserve bei Landung', '%', 1, 0, 60], ['etaCharge', 'Ladewirkungsgrad', '%', 0.5, 70, 100], ['etaDischarge', 'Entladewirkungsgrad', '%', 0.5, 70, 100],
  ['battHealth', 'Alterung (Restkapazität)', '%', 1, 50, 100], ['battTempCoef', 'Kapazitätsverlust unter 20 °C', '%/K', 0.1, 0, 3], ['battHeat', 'Akku wärmer als Umgebung', 'K', 1, 0, 40, null, 'Isolierung, Eigenwärme und Heizung. Bestimmt Kapazität in der kältesten Nachtstunde.'],
  ['battRAh', 'Spezifischer Innenwiderstand', 'Ω·Ah', 0.01, 0.005, 2, null, 'Gleichstrom-Innenwiderstand einer Zelle mal ihrer Kapazität, bei 50 % Ladung und Akkutemperatur. Hochenergie-Rundzellen 0,1–0,2 Ω·Ah, Hochstrom-LiPo 0,02–0,05 Ω·Ah. Steigt bei Kälte stark an.'],
  ['hStore', 'Energie in der Höhe speichern bis', 'm über Einsatzhöhe', 10, 0, 2000, null, 'Solarüberschuss, den der Akku nicht mehr aufnimmt, hebt das Flugzeug; abends gleitet es zurück, bevor der Akku entladen wird. 0 heißt aus. Höhengrenze der Betriebsgenehmigung beachten.'],
  ['chargeC', 'Max. Laderate', 'C', 0.05, 0.1, 3], ['noColdCharge', 'Nicht unter 0 °C laden', '', 0, 0, 0, 'bool'],
  // Solar
  ['solarArea', 'Zellfläche Flügel', 'm²', 0.01, 0, 6], ['cellEff', 'Zellwirkungsgrad', '%', 0.1, 5, 35], ['solarAreal', 'Flächengewicht Modul', 'kg/m²', 0.01, 0.1, 3, null, 'Zellen mit Einbettung. AtlantikSolar: 0,62 kg/m².'],
  ['solarGeom', 'Einstrahlungsmodell', '', 0, 0, 0, 'solarGeom'], ['camberEta', 'Pauschaler Wölbungsfaktor', '%', 0.5, 50, 100],
  ['cellX0', 'Zellen ab Flügeltiefe', '%', 1, 0, 60], ['cellX1', 'Zellen bis Flügeltiefe', '%', 1, 30, 100], ['stringLayout', 'Verschaltung', '', 0, 0, 0, 'stringLayout', 'In Tiefenrichtung verschaltete Strings begrenzt die schlechtest beschienene Zelle.'],
  ['mpptEff', 'MPPT-Wirkungsgrad', '%', 0.5, 80, 100], ['laminateLoss', 'Verlust Laminat/Folie', '%', 0.5, 0, 20], ['wiringLoss', 'Verlust Leitungen, Fehlanpassung', '%', 0.5, 0, 20], ['soiling', 'Verschmutzung', '%', 0.5, 0, 20],
  ['tempCoef', 'Temperaturkoeffizient', '%/K', 0.01, 0, 1], ['cellHeat', 'Zellerwärmung', 'K/(W/m²)', 0.005, 0, 0.06, null, '0,02 heißt 20 K über Luft bei 1000 W/m². Fahrtwind kühlt die Zellen.'], ['albedo', 'Bodenreflexion (Albedo)', '', 0.01, 0, 0.9],
  // Umgebung
  ['date', 'Auslegungstag', '', 0, 0, 0, 'date'], ['lat', 'Breite', '°', 0.1, -66, 66], ['lon', 'Länge', '°', 0.1, -180, 180], ['tz', 'Zeitzone', '', 0, 0, 0, 'tz'],
  ['tMax', 'Lufttemperatur Maximum (Boden)', '°C', 1, -30, 50], ['tMin', 'Lufttemperatur Minimum (Boden)', '°C', 1, -40, 40], ['sky', 'Einstrahlung relativ zu klarem Himmel', '%', 5, 10, 120],
  // Wetter
  ['weather', 'Wetterdaten für die Jahresstatistik', '', 0, 0, 0, 'weather'], ['genYears', 'Simulierte Jahre (Generator)', '', 1, 1, 50], ['genSeed', 'Startwert Zufall', '', 1, 1, 9999],
  ['wind10', 'Mittlerer Wind in 10 m', 'm/s', 0.5, 0, 25], ['hellmann', 'Hellmann-Exponent', '', 0.01, 0.05, 0.5, null, 'Offenes Land 0,14–0,2, Wald und Hügel 0,25–0,35.'], ['weibullK', 'Weibull-Formfaktor', '', 0.1, 1.1, 4],
  // Einsatz
  ['tStart', 'Start', '', 0, 0, 0, 'time'], ['tEnd', 'Landung', '', 0, 0, 0, 'time'], ['tExcReq', 'Geforderte Excess Time', 'h', 0.1, 0, 12, null, 'ETH-Robustheitsmaß: Restflugzeit am Morgen. AtlantikSolar forderte rund 7 h für Dauerflug mit Schlechtwetterreserve.'],
  ['irHFOV', 'Wärmebild Bildwinkel horizontal', '°', 1, 5, 120], ['irRes', 'Wärmebild Pixel horizontal', 'px', 1, 80, 2000], ['irResV', 'Wärmebild Pixel vertikal', 'px', 1, 60, 2000], ['irNETD', 'Wärmebild NETD', 'mK', 5, 10, 200],
  ['rgbHFOV', 'RGB Bildwinkel horizontal', '°', 1, 5, 120], ['rgbRes', 'RGB Pixel horizontal', 'px', 10, 320, 12000], ['rgbResV', 'RGB Pixel vertikal', 'px', 10, 240, 9000],
  ['overlap', 'Seitliche Überlappung', '%', 5, 0, 80], ['areaKm2', 'Zu überwachende Fläche', 'km²', 1, 0.1, 5000], ['legKm', 'Länge der Suchbahnen', 'km', 0.5, 0.2, 50],
  ['fireT', 'Brandtemperatur', 'K', 50, 450, 1500], ['bgT', 'Hintergrund', 'K', 1, 250, 340], ['clutterDT', 'Erkennungsschwelle über Hintergrund', 'K', 1, 1, 60, null, 'Sonnenbeschienene Felsen und Dächer erreichen 20–40 K über Umgebung. Die Schwelle bestimmt Fehlalarme.'], ['fireRef', 'Bezugsbrand für max. Flughöhe', 'm²', 0.1, 0.01, 100],
  // SORA
  ['density', 'Bevölkerungsdichte im Betriebsgebiet', '', 0, 0, 0, 'density'], ['m1a', 'M1(A) Abschirmung', '', 0, 0, 0, 'm1a'], ['m1b', 'M1(B) Betriebliche Beschränkungen', '', 0, 0, 0, 'm1b'], ['m1c', 'M1(C) Bodenbeobachtung', '', 0, 0, 0, 'm1c'], ['m2', 'M2 Fallschirm', '', 0, 0, 0, 'm2'],
  ['aec', 'Luftraum (Begegnungsklasse AEC)', '', 0, 0, 0, 'aec'], ['arcStrat', 'Strategische Luftrisiko-Minderung', '', 0, 0, 0, 'arcStrat'], ['opsRadius', 'Radius Betriebsgebiet', 'km', 0.5, 0.1, 100],
  // Fit
  ['fitM', 'Masse bei den Messflügen', 'kg', 0.1, 0.5, 50], ['fitRho', 'Luftdichte bei den Messflügen', 'kg/m³', 0.01, 0.5, 1.4]
].forEach(([k, l, u, step, min, max, sel, help]) => { PM[k] = { k, l, u, step, min, max, sel, help }; });

const FORMS = {
  quick: ['span', 'area', 'airfoil', 'v', 'mBatt', 'solarArea', 'date', 'lat', 'tStart', 'tEnd', 'tMax', 'tMin'],
  wing: ['span', 'area', 'planform', 'taper', 'centerFrac', 'washout', 'dihedral', 'sweep', 'airfoil', 'transition'],
  tail: ['tailAirfoil', 'tailArm', 'vH', 'vV', 'arH', 'arV', 'zTail', 'etaTail', 'fusL', 'fusD', 'boomD', 'fusFlow', 'kInt', 'kDrag'],
  config: ['fusType', 'motorPos', 'tailType', 'zTail', 'fusL', 'fusD', 'coneD', 'boomD', 'tailArm'],
  layout: ['trimMode', 'smTarget', 'xWingLE', 'xBatt', 'zBatt', 'battInWing', 'mAntrieb'],
  layout2: ['htSolar', 'zTail', 'etaTail', 'tailArm', 'vH', 'fusL'],
  wire: ['wireModel', 'mWireFix', 'wireExtra', 'wireDropSol', 'nAilSeg', 'ailEta0', 'ailEta1'],
  ctrl: ['ailEta0', 'ailEta1', 'ailCf', 'ailMax', 'nAilSeg', 'elevCf', 'elevMax', 'rudCf', 'rudMax', 'vCross', 'cgTol', 'nCtrl', 'vH', 'vV'],
  ground: ['landGear', 'vSink', 'skidStroke', 'bellyStroke', 'skidCdA', 'wBelly', 'landPitch', 'launch', 'launchRail', 'launchAngle', 'vHand', 'vLaunchK', 'nLaunchMax'],
  dyn: ['dihedral', 'sweep', 'vV', 'arV', 'vH', 'tailArm', 'smTarget', 'v'],
  flight: ['v', 'vmax', 'mtomLimit', 'turnFrac', 'bank', 'hAGL', 'alt', 'turbDay', 'powerModel', 'pMeas', 'mMeas', 'rhoMeas', 'zuschlag'],
  prop: ['propModel', 'etaTotal', 'propD', 'nProp', 'etaProfile', 'etaMotor', 'etaEsc', 'etaGear', 'mAntrieb'],
  propb: ['propModel', 'propGeom', 'propD', 'propPitch', 'propChord', 'propBlades', 'propFoil'],
  motor: ['motKv', 'motR', 'motI0', 'motImax', 'nCells', 'cellV', 'gearRatio', 'etaEsc', 'etaGear', 'mAntrieb'],
  struct: ['structMode', 'mZelle', 'rugged', 'nLimit', 'safety', 'vGust', 'gustU', 'deflMax', 'battInWing'],
  struct2: ['sparType', 'sparH', 'xSpar', 'capMin', 'wWeb', 'ribSpacing', 'wRib', 'wLE', 'wSkin', 'wTE', 'mJoint', 'wTail', 'boomLin', 'wFus', 'wCone', 'mFusFix'],
  mat: ['matCap', 'matWeb', 'matSkin', 'matBoom', 'matKnock', 'sparType', 'xSpar', 'vmax'],
  split: ['splits', 'splitEta', 'mJoint'],
  vib: ['wCtrl', 'ctrlXcg', 'ctrlBal', 'kServo', 'gvtAil', 'gvtElev', 'gvtRud', 'gvtB1', 'gvtT1', 'gvtFin', 'gvtHT'],
  env: ['date', 'tz', 'lat', 'lon', 'alt', 'hAGL', 'tMax', 'tMin', 'sky'],
  batt: ['mBatt', 'battSpec', 'reserve', 'battHealth', 'etaCharge', 'etaDischarge', 'battTempCoef', 'battHeat', 'chargeC', 'noColdCharge', 'nCells', 'cellV', 'battRAh', 'hStore'],
  solar: ['solarArea', 'cellEff', 'solarAreal', 'solarGeom', 'camberEta', 'cellX0', 'cellX1', 'stringLayout'],
  solar2: ['mpptEff', 'laminateLoss', 'wiringLoss', 'soiling', 'tempCoef', 'cellHeat', 'albedo'],
  wx: ['weather', 'genYears', 'genSeed'],
  wind: ['wind10', 'hellmann', 'weibullK'],
  mission: ['tStart', 'tEnd', 'tExcReq', 'hAGL', 'v', 'areaKm2', 'legKm', 'overlap'],
  sensor: ['irHFOV', 'irRes', 'irResV', 'irNETD', 'rgbHFOV', 'rgbRes', 'rgbResV'],
  fire: ['fireT', 'bgT', 'clutterDT', 'fireRef'],
  sora: ['density', 'm1a', 'm1b', 'm1c', 'm2', 'aec', 'arcStrat', 'vmax', 'opsRadius'],
  fit: ['fitM', 'fitRho']
};
// Felder, die nur in bestimmten Modi gelten
const SHOW_IF = {
  taper: P => P.planform === 'taper' || P.planform === 'rect_taper', centerFrac: P => P.planform === 'rect_taper',
  pMeas: P => P.powerModel === 'mess', mMeas: P => P.powerModel === 'mess', rhoMeas: P => P.powerModel === 'mess',
  etaTotal: P => P.propModel === 'eta', propD: P => P.propModel !== 'eta' && P.propGeom !== 'apc10x7', nProp: P => P.propModel === 'model', etaProfile: P => P.propModel === 'model', etaMotor: P => P.propModel === 'model', etaEsc: P => P.propModel !== 'eta', etaGear: P => P.propModel !== 'eta',
  mZelle: P => P.structMode === 'fix', rugged: P => P.structMode !== 'fix', nLimit: P => P.structMode !== 'fix', safety: P => P.structMode !== 'fix', vGust: P => P.structMode !== 'fix', gustU: P => P.structMode !== 'fix', deflMax: P => P.structMode !== 'fix', battInWing: P => P.structMode !== 'fix',
  camberEta: P => P.solarGeom === 'flach', cellX0: P => P.solarGeom !== 'flach', cellX1: P => P.solarGeom !== 'flach', stringLayout: P => P.solarGeom !== 'flach',
  genYears: P => P.weather === 'gen', genSeed: P => P.weather === 'gen',
  coneD: P => P.fusType === 'glider', wCone: P => P.fusType === 'glider', boomD: P => P.fusType !== 'glider', boomLin: P => P.fusType !== 'glider',
  mWireFix: P => P.wireModel === 'fix', wireExtra: P => P.wireModel !== 'fix', wireDropSol: P => P.wireModel !== 'fix',
  skidStroke: P => P.landGear === 'skid', skidCdA: P => P.landGear === 'skid', bellyStroke: P => P.landGear === 'belly', wBelly: P => P.landGear === 'belly',
  launchRail: P => P.launch === 'catapult', launchAngle: P => P.launch === 'catapult', nLaunchMax: P => P.launch === 'catapult', vHand: P => P.launch === 'hand',
  xWingLE: P => P.trimMode !== 'wing', xBatt: P => !(P.trimMode === 'battery' || P.battInWing), smTarget: P => P.trimMode !== 'none',
  splitEta: P => P.splits === 'outer' || P.splits === 'both',
  propPitch: P => P.propGeom !== 'apc10x7', propChord: P => P.propGeom !== 'apc10x7', propBlades: P => P.propGeom !== 'apc10x7'
};
function selOptions(key) {
  if (key === 'airfoil' || key === 'tailAirfoil') {
    const tail = key === 'tailAirfoil', cats = {};
    for (const f of AF.db.foils) if (!!f.tail === tail) (cats[f.cat] = cats[f.cat] || []).push(f);
    return Object.entries(cats).map(([c, fs]) => `<optgroup label="${esc(c)}">${fs.map(f => `<option value="${esc(f.key)}">${esc(f.name)} · ${nf(f.t * 100, 1)} %</option>`).join('')}</optgroup>`).join('');
  }
  if (key === 'propFoil') return `<option value="qprop">Generisch (QPROP, Drela)</option><optgroup label="Profildatenbank">${AF.db.foils.map(f => `<option value="${esc(f.key)}">${esc(f.name)}</option>`).join('')}</optgroup>`;
  if (MAT_SEL[key]) return MAT_SEL[key].map(k => `<option value="${k}">${esc(MAT[k].name)}</option>`).join('');
  if (key === 'density') return DENS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  if (key === 'aec') return AEC.map(([n, l, a]) => `<option value="${n}">AEC ${n}: ${esc(l)} (ARC-${a})</option>`).join('');
  if (MITIG[key]) return MITIG[key].opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  return (SEL[key] || []).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
}
function fieldHTML(k, form) {
  const m = PM[k]; if (!m) return '';
  const id = `f-${form}-${k}`, help = m.help ? `<span class="help">${esc(m.help)}</span>` : '';
  const lab = `${esc(m.l)}${m.u ? ` <span class="u">${esc(m.u)}</span>` : ''}`;
  const wide = ['airfoil', 'tailAirfoil', 'planform', 'transition', 'powerModel', 'propModel', 'structMode', 'solarGeom', 'stringLayout', 'weather', 'density', 'aec', 'arcStrat', 'm1a', 'm1b', 'm1c', 'm2', 'sparType', 'fusFlow', 'tz', 'motorPos', 'fusType', 'tailType', 'landGear', 'launch', 'wireModel', 'trimMode', 'splits', 'matCap', 'matWeb', 'matSkin', 'matBoom', 'propGeom', 'propFoil'].includes(k) || m.help ? ' wide' : '';
  if (m.sel === 'bool') return `<div class="field chk wide" data-fk="${k}"><input type="checkbox" id="${id}" data-k="${k}"><label for="${id}">${lab}</label>${help}</div>`;
  if (m.sel === 'date') return `<div class="field" data-fk="${k}"><label for="${id}">${lab}</label><input type="date" id="${id}" data-k="${k}"></div>`;
  if (m.sel === 'time') return `<div class="field" data-fk="${k}"><label for="${id}">${lab}</label><input type="time" id="${id}" data-k="${k}"></div>`;
  if (m.sel) return `<div class="field${wide}" data-fk="${k}"><label for="${id}">${lab}</label><select id="${id}" data-k="${k}">${selOptions(m.sel === true ? k : m.sel)}</select>${help}</div>`;
  return `<div class="field${wide}" data-fk="${k}"><label for="${id}">${lab}</label><input type="number" id="${id}" data-k="${k}" step="${m.step}" min="${m.min}" max="${m.max}" inputmode="decimal">${help}</div>`;
}
function buildForms() {
  $$('[data-form]').forEach(el => { const f = el.dataset.form; el.innerHTML = (FORMS[f] || []).map(k => fieldHTML(k, f)).join(''); });
  fillForms();
}
function fillForms() {
  const P = S.params;
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k, v = P[k];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el) el.value = v == null ? '' : String(v);
  });
  $$('[data-fk]').forEach(el => { const f = SHOW_IF[el.dataset.fk]; el.hidden = f ? !f(P) : false; });
}
function readField(el) {
  const k = el.dataset.k, m = PM[k];
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') { const x = Number(el.value); if (el.value === '' || !fin(x)) return undefined; return x; }
  const def = DEFAULT_PARAMS[k];
  if (typeof def === 'number') { const x = Number(el.value); return fin(x) ? x : undefined; }
  return el.value;
}
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.k) return;
  const v = readField(el); if (v === undefined) return;
  S.params[el.dataset.k] = v;
  // gleiche Größe in anderen Formularen nachziehen
  $$(`[data-k="${el.dataset.k}"]`).forEach(o => { if (o !== el) { if (o.type === 'checkbox') o.checked = !!v; else o.value = String(v); } });
  if (['planform', 'powerModel', 'propModel', 'structMode', 'solarGeom', 'weather', 'motorPos', 'fusType', 'tailType', 'landGear', 'launch', 'wireModel', 'trimMode', 'battInWing', 'splits', 'propGeom'].includes(el.dataset.k)) fillForms();
  if (el.dataset.k === 'weather') onWeatherChange();
  markPreset(); schedule();
});
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.k && el.type === 'number') { const v = readField(el); if (v === undefined) el.value = String(S.params[el.dataset.k]); } });

/* ---------- Zustand ---------- */
const STORE_KEY = 'waldbrand-uav-v5', OLD_KEY = 'waldbrand-uav-budget-v1', VIEW_KEY = 'waldbrand-uav-v5-view';
let S = null;
function defaultState() { return { v: 7, params: { ...DEFAULT_PARAMS }, comps: DEFAULT_COMPS.map(c => ({ ...c })), gen: null, preset: 'design' }; }
// Ältere Stände (bis Version 6): vier Motoranordnungen und Trägerzahl auf die neuen Varianten abbilden
function migrateParams(p) {
  const o = { ...p };
  if (o.fusType === undefined && Number(o.nBooms) >= 2) o.fusType = 'twin';
  if (o.motorPos === 'pod') o.motorPos = 'pusher';
  else if (o.motorPos === 'tail') o.motorPos = 'fin';
  else if (o.motorPos === 'wing') o.motorPos = 'nose';
  if (o.mGear !== undefined && o.landGear === undefined) o.landGear = Number(o.mGear) > 0 ? 'skid' : 'belly';
  return o;
}
function sanitize(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  const p = migrateParams(raw.params || {});
  for (const k of Object.keys(DEFAULT_PARAMS)) {
    const d = DEFAULT_PARAMS[k], v = p[k];
    if (v === undefined || v === null) continue;
    if (typeof d === 'number') { const x = Number(v); if (fin(x)) s.params[k] = x; }
    else if (typeof d === 'boolean') s.params[k] = !!v;
    else s.params[k] = String(v);
  }
  if (Array.isArray(raw.comps)) {
    s.comps = raw.comps.filter(c => c && typeof c === 'object').map(c => ({
      id: String(c.id || 'own-' + Math.random().toString(36).slice(2, 8)), name: String(c.name || 'Komponente').slice(0, 120), group: GROUPS.some(g => g[0] === c.group) ? c.group : 'own',
      m: fin(Number(c.m)) ? Number(c.m) : 0, p: fin(Number(c.p)) ? Number(c.p) : 0, d: fin(Number(c.d)) ? clamp(Number(c.d), 0, 100) : 100, on: c.on !== false,
      sched: SCHED.some(x => x[0] === c.sched) ? c.sched : 'always', cda: fin(Number(c.cda)) ? Number(c.cda) : 0, note: typeof c.note === 'string' ? c.note.slice(0, 1000) : undefined,
      x: fin(Number(c.x)) ? clamp(Number(c.x), -0.5, 6) : compX(c.id), y: fin(Number(c.y)) ? Number(c.y) : 0, z: fin(Number(c.z)) ? clamp(Number(c.z), -0.5, 1) : compZ(c.id)
    }));
  }
  if (raw.gen && Array.isArray(raw.gen.months) && raw.gen.months.length === 12) s.gen = { src: String(raw.gen.src || ''), months: raw.gen.months.map(m => ({ kt: clamp(Number(m.kt) || 0.4, 0.05, 0.8), T: Number(m.T) || 10, amp: Number(m.amp) || 8, ws: Number(m.ws) || 2 })) };
  if (!AF.map.has(s.params.airfoil)) s.params.airfoil = DEFAULT_PARAMS.airfoil;
  if (!AF.map.has(s.params.tailAirfoil)) s.params.tailAirfoil = DEFAULT_PARAMS.tailAirfoil;
  s.preset = typeof raw.preset === 'string' ? raw.preset : '';
  return s;
}
// Längslage einer Komponente ohne gespeicherte Lage (ältere Stände): Vorgabe aus der Standardliste
function compX(id) { const d = DEFAULT_COMPS.find(c => c.id === id); return d && fin(d.x) ? d.x : 0.5; }
function compZ(id) { const d = DEFAULT_COMPS.find(c => c.id === id); return d && fin(d.z) ? d.z : 0; }
// Übernahme aus der Vorgängerversion des Rechners (gleiche Grundgrößen)
function migrateOld(o) {
  const s = defaultState(), p = o.params || {};
  for (const k of ['span', 'area', 'mBatt', 'battSpec', 'reserve', 'etaCharge', 'etaDischarge', 'solarArea', 'cellEff', 'solarAreal', 'date', 'lat', 'lon', 'alt', 'tStart', 'tEnd', 'sky', 'tExcReq', 'vmax', 'density', 'm2', 'v', 'mtomLimit', 'turbDay'])
    if (p[k] !== undefined) s.params[k] = typeof DEFAULT_PARAMS[k] === 'number' ? Number(p[k]) : String(p[k]);
  if (p.tGround !== undefined) { s.params.tMax = Number(p.tGround); s.params.tMin = Number(p.tGround) - 12; }
  if (p.arc) s.params.aec = { a: 12, b: 10, c: 8, d: 4 }[p.arc] || 10;
  if (Array.isArray(o.comps)) {
    const byId = new Map(DEFAULT_COMPS.map(c => [c.id, c]));
    s.comps = o.comps.map(c => ({ ...(byId.get(c.id) || { sched: 'always', cda: 0 }), ...c }));
  }
  return sanitize(s);
}
function loadState() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return sanitize(JSON.parse(raw)); } catch (e) { /* ignorieren */ }
  try { const old = localStorage.getItem(OLD_KEY); if (old) return migrateOld(JSON.parse(old)); } catch (e) { /* ignorieren */ }
  return defaultState();
}
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignorieren */ } }, 300); }

/* ---------- Vorlagen ---------- */
function applyPreset(key) {
  const st = defaultState();
  if (key !== 'design' && REFS[key]) { st.params = { ...DEFAULT_PARAMS, ...REFS[key].params }; st.comps = REFS[key].comps.map(c => ({ ...c })); }
  st.gen = S ? S.gen : null; st.preset = key;
  S = st; buildForms(); renderCompTable(); invalidateAll(); schedule(true); save();
}
function markPreset() { S.preset = ''; const el = $('#preset-sel'); if (el) el.value = ''; }

/* ---------- Ansichten ---------- */
const VIEWS = ['uebersicht', 'flugzeug', 'konfiguration', 'schwerpunkt', 'struktur', 'antrieb', 'flugdynamik', 'ruder', 'profile', 'komponenten', 'energie', 'wetter', 'einsatz', 'robustheit', 'sora', 'validierung', 'team'];
let VIEW = 'uebersicht';
function showView(v) {
  if (!VIEWS.includes(v) || !document.getElementById('v-' + v)) v = 'uebersicht';
  VIEW = v;
  $$('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
  $$('#views a').forEach(a => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignorieren */ }
  renderView(true);
}
window.addEventListener('hashchange', () => showView(location.hash.replace('#', '')));

/* ---------- Neuberechnung ---------- */
let R = null, recTimer = null, dirty = {};
const currentR = () => R;
function invalidateAll() { dirty = { all: true }; }
function schedule(now) {
  clearTimeout(recTimer);
  invalidateAll();
  recTimer = setTimeout(() => { recompute(); save(); }, now ? 0 : 140);
}
function computeBase() {
  const P = S.params, comps = S.comps;
  const C = buildCase(P, comps), n = dayOfYear(P.date), y = yearOf(P.date);
  const e = envClear(P, n, y), ser = daySeries(C, e);
  const mis = mission(C, ser, ser, true), per = periodic(C, ser, true), margin = missionMargin(C, ser);
  const pc = powerCurve(C), so = sora(P, C.m), mp = missionPerf(C);
  let eSol = 0, eCons = 0, eNight = 0, peak = 0, cold = 0;
  for (let i = 0; i < NSTEP; i++) { eSol += ser.ps[i] * DT; eCons += ser.pc[i] * DT; if (ser.ps[i] < ser.pc[i]) eNight += (ser.pc[i] - ser.ps[i]) * DT; peak = Math.max(peak, ser.ps[i]); cold += ser.cold[i]; }
  return { P, comps, C, n, y, e, ser, mis, per, margin, pc, so, mp, eSol, eCons, eNight, peak, cold: cold * DT };
}
function recompute() {
  try { R = computeBase(); }
  catch (err) { console.error(err); $('#strip').innerHTML = `<div style="grid-column:1/-1">${pill('crit', 'Rechenfehler: ' + err.message)}</div>`; return; }
  renderStrip(R);
  renderView(false);
}
const viewDone = {};
function renderView(force) {
  if (!R) return;
  const fn = RENDER[VIEW];
  if (fn) { try { fn(R, force); } catch (err) { console.error(err); } }
}
