// Baut die Rechenkern-Dateien zu einem Modul zusammen (wie im Browser ein gemeinsamer Gültigkeitsbereich)
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src'), DATA = path.join(__dirname, '..', 'data');
const NAMES = 'tailBoomDyn, resonance, boomModes, liftEffectiveness, flutterRoots, dboxGeom, MAT_SEL, QPROP_FOIL, rowCl, derivatives, lonMatrix, latMatrix, flightDynamics, classifyLon, classifyLat, propGeometry, bemt, propTable, propOperate, propMaxThrust, climbGlide, propMap, sectionCoef, MOTOR_POS, geomPositions, neutralPoint, massItems, balance, tailLoad, finShade, slipstream, MAT, aeroelastic, wingSections, beamModel, beamModes, divergence, flutterSearch, eigReal, jacobiEig, genSymEig, matInv, luDecomp, luSolve, zeros, matMul, vlmWing, hsW, wingLateral, G, DEG, RAD, clamp, rhoAt, nuAt, setAirfoils, foilByKey, profileCd, foilMeta, foilBest, planform, liftingLine, llAt, aero, flightPower, buildCase, structureMass, powerCurve, stallSpeed, envClear, envWeather, decodeSite, genWeather, monthlyStats, daySeries, mission, missionMargin, periodic, seasonSweep, seasonWindow, yearSim, runDay, solarGeometry, missionPerf, sora, tornado, monteCarlo, fitPower, parseFlightData, dayOfYear, yearOf, isoOfDay, DEFAULT_PARAMS, DEFAULT_COMPS, REFS, windStats, fireDetection, bandRad, dailyH0, gustLoad, cellPanels, geomFactors, sunDay, sunTimes, sinElev, clearSky, NSTEP, DT, hm, UNC, AEC, MITIG, IGRC, DENS, COLS, sweep, SWEEPS, compareAirfoils, studyPoint, range';
function load() {
  const files = ['linalg.js', 'core.js', 'vlm.js', 'sim.js', 'ext.js', 'defaults.js'].concat(fs.existsSync(path.join(SRC, 'layout.js')) ? ['layout.js'] : []).concat(fs.existsSync(path.join(SRC, 'prop.js')) ? ['prop.js'] : []).concat(fs.existsSync(path.join(SRC, 'aeroel.js')) ? ['aeroel.js'] : []).concat(fs.existsSync(path.join(SRC, 'dyn.js')) ? ['dyn.js'] : []);
  const extra = (process.env.EXTRA_NAMES || '');
  const code = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n') + `\nmodule.exports = { ${NAMES}${extra ? ', ' + extra : ''} };\n`;
  const tmp = path.join(__dirname, '_model.cjs');
  fs.writeFileSync(tmp, code);
  delete require.cache[require.resolve(tmp)];
  const U = require(tmp);
  U.setAirfoils(JSON.parse(fs.readFileSync(path.join(DATA, 'airfoils.json'), 'utf8')));
  U.weather = JSON.parse(fs.readFileSync(path.join(DATA, 'weather.json'), 'utf8'));
  return U;
}
module.exports = { load };
