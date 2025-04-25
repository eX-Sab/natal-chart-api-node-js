// index.js
const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');

const app = express();
app.use(cors());
app.use(express.json());

// Set Swiss Ephemeris data path (download ephemeris files or use built-in)
swisseph.swe_set_ephe_path(__dirname + '/ephe');

const PLANETS = [
  { name: 'Sun', swe: swisseph.SE_SUN },
  { name: 'Moon', swe: swisseph.SE_MOON },
  { name: 'Mercury', swe: swisseph.SE_MERCURY },
  { name: 'Venus', swe: swisseph.SE_VENUS },
  { name: 'Mars', swe: swisseph.SE_MARS },
  { name: 'Jupiter', swe: swisseph.SE_JUPITER },
  { name: 'Saturn', swe: swisseph.SE_SATURN },
  { name: 'Uranus', swe: swisseph.SE_URANUS },
  { name: 'Neptune', swe: swisseph.SE_NEPTUNE },
  { name: 'Pluto', swe: swisseph.SE_PLUTO },
  { name: 'Chiron', swe: swisseph.SE_CHIRON },
  { name: 'North Node', swe: swisseph.SE_TRUE_NODE }
];

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

const ELEMENTS = {
  'Aries': 'Fire', 'Leo': 'Fire', 'Sagittarius': 'Fire',
  'Taurus': 'Earth', 'Virgo': 'Earth', 'Capricorn': 'Earth',
  'Gemini': 'Air', 'Libra': 'Air', 'Aquarius': 'Air',
  'Cancer': 'Water', 'Scorpio': 'Water', 'Pisces': 'Water'
};

const MODES = {
  'Aries': 'Cardinal', 'Cancer': 'Cardinal', 'Libra': 'Cardinal', 'Capricorn': 'Cardinal',
  'Taurus': 'Fixed', 'Leo': 'Fixed', 'Scorpio': 'Fixed', 'Aquarius': 'Fixed',
  'Gemini': 'Mutable', 'Virgo': 'Mutable', 'Sagittarius': 'Mutable', 'Pisces': 'Mutable'
};

function getSign(degree) {
  const signIndex = Math.floor(degree / 30);
  return SIGNS[signIndex];
}

function getDegreeInSign(degree) {
  return +(degree % 30).toFixed(2);
}

function getElementalDistribution(positions) {
  const dist = { Fire: 0, Water: 0, Earth: 0, Air: 0 };
  for (const planet in positions) {
    if (positions[planet].sign && ELEMENTS[positions[planet].sign]) {
      dist[ELEMENTS[positions[planet].sign]]++;
    }
  }
  return dist;
}

function getModalDistribution(positions) {
  const dist = { Cardinal: 0, Fixed: 0, Mutable: 0 };
  for (const planet in positions) {
    if (positions[planet].sign && MODES[positions[planet].sign]) {
      dist[MODES[positions[planet].sign]]++;
    }
  }
  return dist;
}

function getAspects(positions) {
  const aspects = [];
  const aspectTypes = [
    { type: 'Conjunction', angle: 0, orb: 8 },
    { type: 'Opposition', angle: 180, orb: 8 },
    { type: 'Trine', angle: 120, orb: 8 },
    { type: 'Square', angle: 90, orb: 8 },
    { type: 'Sextile', angle: 60, orb: 6 }
  ];
  const keys = Object.keys(positions);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = positions[keys[i]].absDegree;
      const b = positions[keys[j]].absDegree;
      if (a == null || b == null) continue;
      let diff = Math.abs(a - b);
      if (diff > 180) diff = 360 - diff;
      for (const asp of aspectTypes) {
        if (Math.abs(diff - asp.angle) <= asp.orb) {
          aspects.push({
            type: asp.type,
            between: [keys[i], keys[j]],
            orb: +(Math.abs(diff - asp.angle)).toFixed(2)
          });
        }
      }
    }
  }
  return aspects;
}

function toJulianDay({ year, month, day, hour }) {
  return swisseph.swe_julday(year, month, day, hour, swisseph.SE_GREG_CAL);
}

function parseDateTime(date, time, timezone) {
  // date: YYYY-MM-DD, time: HH:mm, timezone: e.g. "+03:30", "-05:00", "Z", or number (offset in hours)
  const [year, month, day] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  let offset = 0;
  if (typeof timezone === 'string') {
    if (timezone === 'Z') {
      offset = 0;
    } else if (/^[+-]\d{2}:\d{2}$/.test(timezone)) {
      const sign = timezone[0] === '-' ? -1 : 1;
      const [h, m] = timezone.slice(1).split(':').map(Number);
      offset = sign * (h + m / 60);
    } else if (/^[+-]?\d+(\.\d+)?$/.test(timezone)) {
      offset = parseFloat(timezone);
    }
  } else if (typeof timezone === 'number') {
    offset = timezone;
  }
  // Subtract offset to get UTC time
  const hour = hh + mm / 60 - offset;
  return { year, month, day, hour };
}

async function getPlanetPosition(jd, planet) {
  return new Promise((resolve) => {
    swisseph.swe_calc_ut(jd, planet, swisseph.SEFLG_SWIEPH, (res) => {
      resolve(res);
    });
  });
}

async function getAllPositions(jd, housesData) {
  const positions = {};
  let cusps = null;
  if (housesData) {
    if (housesData.cusps) {
      cusps = housesData.cusps;
    } else if (housesData.detail && housesData.detail.house) {
      cusps = housesData.detail.house;
    }
  }
  for (const planet of PLANETS) {
    const res = await getPlanetPosition(jd, planet.swe);
    const absDegree = res.longitude;
    const sign = getSign(absDegree);
    const degree = getDegreeInSign(absDegree);
    let house = null;
    if (cusps) {
      for (let h = 1; h <= 12; h++) {
        const start = cusps[h - 1];
        const end = cusps[h % 12];
        if (start < end) {
          if (absDegree >= start && absDegree < end) {
            house = h;
            break;
          }
        } else {
          if (absDegree >= start || absDegree < end) {
            house = h;
            break;
          }
        }
      }
    }
    positions[planet.name] = { sign, degree, house, absDegree };
  }
  return positions;
}

async function getTransits(jdNatal, jdTransit) {
  // Calculate transiting planets at jdTransit
  const transitPositions = await getAllPositions(jdTransit);
  return transitPositions;
}

function getHousesWithError(jd, lat, lon, hsys = 'P') {
  return new Promise((resolve) => {
    swisseph.swe_houses(jd, lat, lon, hsys, (err, result) => {
      if (result && (result.cusps || result.house)) {
        resolve({
          ascendant: result.ascendant || (result.ascmc ? result.ascmc[0] : undefined),
          midheaven: result.mc || (result.ascmc ? result.ascmc[1] : undefined),
          armc: result.armc || (result.ascmc ? result.ascmc[2] : undefined),
          vertex: result.vertex || (result.ascmc ? result.ascmc[3] : undefined),
          equatorialAscendant: result.equatorialAscendant || (result.ascmc ? result.ascmc[4] : undefined),
          kochCoAscendant: result.kochCoAscendant || (result.ascmc ? result.ascmc[5] : undefined),
          munkaseyCoAscendant: result.munkaseyCoAscendant || (result.ascmc ? result.ascmc[6] : undefined),
          munkaseyPolarAscendant: result.munkaseyPolarAscendant || (result.ascmc ? result.ascmc[7] : undefined),
          cusps: result.cusps || result.house,
          warning: err ? err : undefined
        });
      } else if (err) {
        resolve({ error: 'Swiss Ephemeris internal error', detail: err });
      } else {
        resolve(null);
      }
    });
  });
}

app.post('/natal-chart', async (req, res) => {
  try {
    const { date, time, lat, lon, transit_date, transit_time, hsys, timezone, transit_timezone } = req.body;
    const birth = parseDateTime(date, time, timezone);
    const jd = toJulianDay(birth);
    // Always include houses, asc, mc if lat/lon provided, even with error
    let houses = null;
    if (lat != null && lon != null) {
      houses = await getHousesWithError(jd, lat, lon, hsys);
    }
    const positions = await getAllPositions(jd, houses);
    const aspects = getAspects(positions);
    const elemental_distribution = getElementalDistribution(positions);
    const modal_distribution = getModalDistribution(positions);
    let transits = null;
    if (transit_date && transit_time) {
      const transit = parseDateTime(transit_date, transit_time, transit_timezone);
      const jdTransit = toJulianDay(transit);
      transits = await getTransits(jd, jdTransit);
    }
    for (const k in positions) delete positions[k].absDegree;
    const resultObj = {
      ...positions,
      aspects,
      elemental_distribution,
      modal_distribution,
      houses
    };
    if (transits) {
      for (const k in transits) delete transits[k].absDegree;
      resultObj.transits = transits;
    }
    res.json(resultObj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
