/* ===================================================================
   Standardwerte: Auslegung Waldbrand-UAV, Komponenten, Referenzflugzeuge
   =================================================================== */
const DEFAULT_PARAMS = {
  // Flügel und Leitwerk
  span: 5.5, area: 1.5, planform: 'rect_taper', taper: 0.5, centerFrac: 0.55, washout: 1.5, dihedral: 3, sweep: 0,
  airfoil: 'sd7032', transition: 'free', tailAirfoil: 'naca0010',
  vH: 0.45, vV: 0.025, tailArm: 1.7, arH: 5, arV: 1.6,
  fusL: 1.3, fusD: 0.16, boomD: 0.03, fusFlow: 'turb', kInt: 10, kDrag: 5, zTail: 0.15, etaTail: 90,
  // Anordnung: Rumpf, Leitwerk, Motor; Längsaufteilung und Trimmung
  fusType: 'pod', tailType: 'cross', motorPos: 'nose', coneD: 0.05, wCone: 0.45,
  xWingLE: 0.5, trimMode: 'battery', smTarget: 10, xBatt: 0.45, zBatt: 0, htSolar: 0,
  // Verkabelung
  wireModel: 'model', mWireFix: 0.3, wireExtra: 15, wireDropSol: 1.5,
  // Ruder
  nAilSeg: 2, ailEta0: 0.5, ailEta1: 0.95, ailCf: 0.25, ailMax: 20, elevCf: 0.35, elevMax: 25, rudCf: 0.4, rudMax: 25, vCross: 2, cgTol: 2, nCtrl: 1.5,
  wCtrl: 0.5, ctrlXcg: 40, ctrlBal: 0, kServo: 10, elevPivot: 23, gvtAil: 0, gvtElev: 0, gvtRud: 0, gvtB1: 0, gvtT1: 0, gvtFin: 0, gvtHT: 0,
  // Start und Landung (kein Fahrwerk)
  landGear: 'skid', vSink: 1.5, skidStroke: 0.04, bellyStroke: 0.015, skidCdA: 4, wBelly: 0.6, landPitch: 5,
  launch: 'catapult', launchRail: 2.5, launchAngle: 10, vHand: 7, vLaunchK: 1.2, nLaunchMax: 8,
  // Flugzustand
  v: 13, vmax: 25, mtomLimit: 15, turnFrac: 30, bank: 20, hAGL: 120, alt: 600, turbDay: 0, zuschlag: 0,
  // Antrieb
  propModel: 'model', etaTotal: 60, propD: 0.6, nProp: 1, etaProfile: 88, etaMotor: 85, etaEsc: 95, etaGear: 100, mAntrieb: 0.6,
  propGeom: 'design', propPitch: 0.45, propChord: 0.7, propBlades: 2, propFoil: 'qprop', motKv: 140, motR: 0.1, motI0: 0.3, motImax: 30, nCells: 6, cellV: 3.6, gearRatio: 1,
  powerModel: 'physik', pMeas: 60, mMeas: 13, rhoMeas: 1.15, fitA: 0, fitB: 0, fitM: 8.2, fitRho: 1.11,
  // Struktur
  structMode: 'model', mZelle: 7.5, nLimit: 4, safety: 1.5, gustU: 15.24, vGust: 18, sparType: 'caps', sparH: 85, capMin: 3, xSpar: 28,
  matCap: 'cfk_ud', matWeb: 'balsa_gfk', matSkin: 'foam_cfk', matBoom: 'cfk_roll', matKnock: 55, splits: 'center', splitEta: 0.5,
  deflMax: 10, wWeb: 0.45, ribSpacing: 0.15, wRib: 0.5, wLE: 0.2, wSkin: 0.05, wTE: 0.035, mJoint: 0.06,
  wTail: 0.35, boomLin: 0.09, wFus: 0.8, mFusFix: 0.15, rugged: 15, battInWing: false,
  // Akku
  mBatt: 3.0, battSpec: 230, reserve: 20, etaCharge: 95, etaDischarge: 97, battHealth: 100, battTempCoef: 0.6, battHeat: 8, chargeC: 0.5, noColdCharge: true, battRAh: 0.15, hStore: 0,
  // Solar
  solarArea: 1.0, cellEff: 23, solarAreal: 0.7, solarGeom: 'profil', cellX0: 8, cellX1: 85, stringLayout: 'span', camberEta: 95,
  mpptEff: 97, laminateLoss: 3, wiringLoss: 2, soiling: 1, tempCoef: 0.32, cellHeat: 0.02, albedo: 0.15,
  // Umgebung
  date: '2026-06-21', lat: 47.5, lon: 14.5, tz: 'auto', tMax: 25, tMin: 12, sky: 100, weather: 'clear', genYears: 20, genSeed: 7,
  wind10: 3, hellmann: 0.2, weibullK: 2, turbLevel: 'light', apBand: 1.5, irTau: 10, rgbExp: 1,
  // Einsatz
  tStart: '08:00', tEnd: '20:00', tExcReq: 6.9,
  irHFOV: 50, irRes: 640, irResV: 512, irNETD: 50, rgbHFOV: 70, rgbRes: 4000, rgbResV: 3000, overlap: 20, areaKm2: 50, legKm: 5,
  fireT: 800, bgT: 300, clutterDT: 10, fireRef: 1,
  // SORA 2.5
  density: '50', m1a: 0, m1b: 0, m1c: 0, m2: -1, aec: 10, arcStrat: 0, opsRadius: 10
};

const GROUPS = [['av', 'Basis-Avionik'], ['sich', 'Luftraum & Sicherheit'], ['kom', 'Kommunikation'], ['sens', 'Sensorik'], ['mar', 'Maritim'], ['own', 'Eigene']];
const SCHED = [['always', 'immer'], ['mission', 'im Einsatzfenster'], ['day', 'bei Tag'], ['night', 'bei Nacht']];
// m in g, p in W, d Einschaltdauer %, cda Widerstandsfläche cm² (Anbauten außen)
const DEFAULT_COMPS = [
  { id: 'ap', name: 'Autopilot + GNSS (Pixhawk-Klasse)', group: 'av', m: 80, p: 2.5, d: 100, on: true, sched: 'always', cda: 0, x: 0.55, y: 0, z: 0 },
  { id: 'servo', name: 'Servos an den Rudern, Haltelast im Mittel', group: 'av', m: 180, p: 3, d: 100, on: true, sched: 'always', cda: 0, x: 1.2, y: 0, z: 0 },
  { id: 'pitot', name: 'Fahrtmesser (Pitot + Sensor)', group: 'av', m: 15, p: 0.1, d: 100, on: true, sched: 'always', cda: 1.5, x: 0.05, y: 0, z: 0 },
  { id: 'mppt', name: 'Solar-MPPT-Laderegler', group: 'av', m: 60, p: 0.5, d: 100, on: true, sched: 'always', cda: 0, x: 0.6, y: 0, z: 0 },
  { id: 'lights', name: 'Positions- und Blitzlichter', group: 'av', m: 30, p: 1.5, d: 100, on: true, sched: 'always', cda: 1, x: 0.62, y: 2.7, z: 0.15 },
  { id: 'heat', name: 'Akkuheizung (Heizfolie, thermostatisch)', group: 'av', m: 25, p: 4, d: 40, on: false, sched: 'night', cda: 0, x: 0.45, y: 0, z: 0 },
  { id: 'flarm', name: 'FLARM + ADS-B In + Remote ID', group: 'sich', m: 50, p: 1.4, d: 100, on: true, sched: 'always', cda: 2, x: 0.7, y: 0, z: 0 },
  { id: 'chute', name: 'Rettungsfallschirm (M2)', group: 'sich', m: 550, p: 0, d: 100, on: true, sched: 'always', cda: 0, x: 0.62, y: 0, z: 0 },
  { id: 'fts', name: 'Unabhängige Fallschirmauslösung', group: 'sich', m: 40, p: 0.3, d: 100, on: true, sched: 'always', cda: 0, x: 0.66, y: 0, z: 0 },
  { id: 'telem', name: 'Telemetriefunk 868 MHz', group: 'kom', m: 40, p: 1, d: 100, on: true, sched: 'always', cda: 2, x: 0.8, y: 0, z: 0 },
  { id: 'lte', name: 'LTE-Modem', group: 'kom', m: 60, p: 2.5, d: 100, on: true, sched: 'always', cda: 2, x: 0.85, y: 0, z: 0 },
  { id: 'irid', name: 'Iridium-Kurznachrichtenmodem (C2-Backup)', group: 'kom', m: 35, p: 1.5, d: 20, on: true, sched: 'always', cda: 1, x: 0.9, y: 0, z: 0 },
  { id: 'video', name: 'Video-Downlink (Dauerstream)', group: 'kom', m: 120, p: 7, d: 100, on: false, sched: 'mission', cda: 2, x: 0.4, y: 0, z: 0 },
  { id: 'ir', name: 'Radiometrische LWIR-Wärmebildkamera (640)', group: 'sens', m: 80, p: 1.2, d: 100, on: true, sched: 'mission', cda: 4, x: 0.12, y: 0, z: -0.05 },
  { id: 'rgb', name: 'RGB-Kamera, fest montiert', group: 'sens', m: 70, p: 2.5, d: 100, on: true, sched: 'day', cda: 3, x: 0.14, y: 0, z: -0.05 },
  { id: 'pm', name: 'Partikelsensor PM1 / 2,5 / 10', group: 'sens', m: 35, p: 0.35, d: 100, on: true, sched: 'mission', cda: 1, x: 0.2, y: 0, z: 0 },
  { id: 'gas', name: 'CO + CO₂ (NDIR) + Temp./Feuchte/Druck', group: 'sens', m: 50, p: 0.4, d: 100, on: true, sched: 'mission', cda: 1, x: 0.25, y: 0, z: 0 },
  { id: 'cpu', name: 'Edge-Rechner (Pi 5 + KI-Beschleuniger)', group: 'sens', m: 100, p: 7, d: 50, on: true, sched: 'mission', cda: 0, x: 0.35, y: 0, z: 0 },
  { id: 'gimbal', name: 'Gimbal EO/IR mit Zoom + Laser-Entfernungsmesser', group: 'sens', m: 650, p: 12, d: 100, on: false, sched: 'mission', cda: 45, x: 0.25, y: 0, z: -0.1 },
  { id: 'lrf', name: 'Laser-Entfernungsmesser-Modul (einzeln)', group: 'sens', m: 45, p: 1.5, d: 10, on: false, sched: 'mission', cda: 2, x: 0.16, y: 0, z: -0.05 },
  { id: 'ms', name: 'Multispektralkamera', group: 'sens', m: 250, p: 5, d: 100, on: false, sched: 'day', cda: 8, x: 0.3, y: 0, z: -0.05 },
  { id: 'lidar', name: 'LiDAR + präzises INS', group: 'sens', m: 400, p: 8, d: 100, on: false, sched: 'mission', cda: 25, x: 0.3, y: 0, z: -0.05 },
  { id: 'swir', name: 'SWIR-Kamera', group: 'sens', m: 220, p: 4.5, d: 100, on: false, sched: 'mission', cda: 5, x: 0.2, y: 0, z: -0.05 },
  { id: 'ais', name: 'AIS-Empfänger', group: 'mar', m: 40, p: 0.8, d: 100, on: false, sched: 'always', cda: 3, x: 0.9, y: 0, z: 0 },
  { id: 'pol', name: 'Polarisationskamera', group: 'mar', m: 100, p: 3, d: 100, on: false, sched: 'day', cda: 5, x: 0.2, y: 0, z: -0.05 },
  { id: 'sdr', name: 'SDR-Spektrummonitor', group: 'mar', m: 120, p: 4, d: 100, on: false, sched: 'mission', cda: 2, x: 0.8, y: 0, z: 0 }
];

/* ---------- Referenzflugzeuge (Validierung) ----------
   ref: veröffentlichte Werte, gegen die das Modell geprüft wird. */
const REFS = {
  atlantik: {
    name: 'AtlantikSolar AS-2 (ETH Zürich)',
    src: 'Oettershagen et al. 2017, J. Field Robotics 34, Tab. 4 (Massen gemessen); Werkzeug fw_conceptual_design (Leutenegger/ETH)',
    params: {
      span: 5.69, area: 1.735, planform: 'rect_taper', taper: 0.6, centerFrac: 0.7, washout: 0, dihedral: 2, airfoil: 'mh139f_xf', transition: 'free', battInWing: true,
      vH: 0.4, vV: 0.02, tailArm: 1.45, fusL: 0.9, fusD: 0.12, boomD: 0.025, kDrag: 0, kInt: 10,
      v: 8.6, vmax: 15, vGust: 15, turnFrac: 0, bank: 20, hAGL: 0, alt: 536, mAntrieb: 0.28,
      propModel: 'model', propD: 0.66, etaProfile: 89, etaMotor: 80.6, etaEsc: 95, etaGear: 95,
      structMode: 'model', mZelle: 1.54, rugged: 0, splits: 'outer', splitEta: 0.42, mFusFix: 0.05, fusType: 'pod', tailType: 'cross', motorPos: 'nose', trimMode: 'wing', xWingLE: 0.3, xBatt: 0.3,
      landGear: 'belly', wBelly: 0, launch: 'hand', vHand: 8, wireModel: 'fix', mWireFix: 0.628, nAilSeg: 1,
      mBatt: 2.92, battSpec: 251, reserve: 0, battHealth: 100, battHeat: 30, battTempCoef: 0,
      solarArea: 1.35, cellEff: 23.7, solarAreal: 0.622, solarGeom: 'flach', camberEta: 95, mpptEff: 97, laminateLoss: 0, wiringLoss: 0, soiling: 0, cellHeat: 0, tempCoef: 0.3,
      date: '2015-06-21', lat: 47.6, lon: 8.53, tz: 'auto', tMax: 25, tMin: 25, sky: 100, turbDay: 0, weather: 'clear', tStart: '08:00', tEnd: '20:00'
    },
    comps: [
      { id: 'as-av', name: 'Avionik + Nutzlast AtlantikSolar (ohne Kabel)', group: 'av', m: 592, p: 6, d: 100, on: true, sched: 'always', cda: 0 },
      { id: 'as-mppt', name: 'MPPT AtlantikSolar', group: 'av', m: 120, p: 0, d: 100, on: true, sched: 'always', cda: 0 }
    ],
    // Massen gemessen nach Oettershagen et al. 2017, Tab. 4: Avionik 1,22 kg = 592 g Geräte + 628 g Kabel und Beschläge, Struktur 1,52 kg
    ref: { mTotal: 6.92, mStruct: 1.52, mWire: 0.628, pProp: 35.8, pTotal: 41.8, tExc: 7.0 }
  },
  skysailor: {
    name: 'Sky-Sailor (ETH/EPFL, Noth)',
    src: 'Noth, Engel, Siegwart 2006 (Sky-Sailor-Paper, EPFL Infoscience 97522)',
    params: {
      span: 3.2, area: 0.776, planform: 'rect_taper', taper: 0.6, centerFrac: 0.6, washout: 0, airfoil: 'sd7037', transition: 'free',
      vH: 0.4, vV: 0.02, tailArm: 0.9, fusL: 0.6, fusD: 0.08, boomD: 0.015, kDrag: 0,
      v: 8.2, vmax: 14, vGust: 13, turnFrac: 0, hAGL: 0, alt: 500, mAntrieb: 0.25,
      propModel: 'model', propD: 0.6, etaProfile: 85, etaMotor: 85, etaEsc: 95, etaGear: 92,
      structMode: 'model', rugged: 0, splits: 'center', mJoint: 0.03, mFusFix: 0.03, fusType: 'pod', tailType: 'cross', motorPos: 'nose', trimMode: 'wing', xWingLE: 0.2, xBatt: 0.2,
      landGear: 'belly', wBelly: 0, launch: 'hand', vHand: 7, nAilSeg: 1,
      mBatt: 1.2, battSpec: 173, reserve: 0, battHeat: 30, battTempCoef: 0,
      solarArea: 0.512, cellEff: 17, solarAreal: 0.4, solarGeom: 'flach', camberEta: 95, mpptEff: 97, laminateLoss: 0, wiringLoss: 0, soiling: 0, cellHeat: 0,
      date: '2008-06-21', lat: 47.4, lon: 8.5, tMax: 25, tMin: 15
    },
    comps: [{ id: 'ss-av', name: 'Avionik, MPPT, Nutzlast Sky-Sailor', group: 'av', m: 250, p: 2, d: 100, on: true, sched: 'always', cda: 0 }],
    ref: { mTotal: 2.5, mStruct: 0.6, pTotal: 13.2 }
  }
};
