// index.js for Natal Chart API
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
      // Use result if present, otherwise use err (which may contain the data)
      const data = result || err;
      const ascmc = data && data.ascmc ? data.ascmc : [];
      resolve({
        ascendant: data?.ascendant || ascmc[0],
        midheaven: data?.mc || ascmc[1],
        armc: data?.armc,
        vertex: data?.vertex,
        equatorialAscendant: data?.equatorialAscendant,
        kochCoAscendant: data?.kochCoAscendant,
        munkaseyCoAscendant: data?.munkaseyCoAscendant,
        munkaseyPolarAscendant: data?.munkaseyPolarAscendant,
        cusps: data?.cusps || data?.house,
        warning: err && result ? err : undefined
      });
    });
  });
}

app.post('/natal-chart', async (req, res) => {
  try {
    // Extract meta fields from request
    const { name, birth, chart_settings, transit_chart } = req.body;
    // Fallback for legacy/simple requests
    let birthData = birth || {};
    if (!birthData.date && req.body.date) {
      birthData = {
        date: req.body.date,
        time: req.body.time,
        timezone: req.body.timezone,
        location: {
          lat: req.body.lat,
          lon: req.body.lon,
          city: req.body.city || undefined
        }
      };
    }
    const hsys = (chart_settings && chart_settings.house_system) || req.body.hsys || 'P';
    // Parse birth datetime
    const birthDT = parseDateTime(birthData.date, birthData.time, birthData.timezone);
    const jd = toJulianDay(birthDT);
    const lat = birthData.location?.lat ?? req.body.lat;
    const lon = birthData.location?.lon ?? req.body.lon;
    // Houses and angles
    let houses = null;
    if (lat != null && lon != null) {
      console.log("lat lon provided and not null");
      houses = await getHousesWithError(jd, lat, lon, hsys);
    }
    
    // Helper to get retrograde from Swiss Ephemeris speed
    async function getPlanetPositionWithRetro(jd, planet) {
      return new Promise((resolve) => {
        swisseph.swe_calc_ut(jd, planet, swisseph.SEFLG_SWIEPH, (res) => {
          resolve({ ...res, retrograde: res.speed < 0 });
        });
      });
    }
    // Natal chart planets
    const natalPositions = {};
    for (const planet of PLANETS) {
      const res = await getPlanetPositionWithRetro(jd, planet.swe);
      const absDegree = res.longitude;
      const sign = getSign(absDegree);
      const degree = +(absDegree % 30).toFixed(2);
      let house = null;
      if (houses && houses.cusps) {
        for (let h = 1; h <= 12; h++) {
          const start = houses.cusps[h - 1];
          const end = houses.cusps[h % 12];
          if (start < end) {
            if (absDegree >= start && absDegree < end) { house = h; break; }
          } else {
            if (absDegree >= start || absDegree < end) { house = h; break; }
          }
        }
      }
      natalPositions[planet.name.replace('North Node', 'NorthNode')] = {
        sign,
        degree,
        house,
        retrograde: res.retrograde
      };
    }
    // Ascendant & MC
    const ascDegree = houses?.ascendant;
    const mcDegree = houses?.midheaven;
    const ascendant = ascDegree != null ? { sign: getSign(ascDegree), degree: +(ascDegree % 30).toFixed(2) } : null;
    const midheaven = mcDegree != null ? { sign: getSign(mcDegree), degree: +(mcDegree % 30).toFixed(2) } : null;
    const housesArr = houses?.cusps ? houses.cusps.map(x => +x.toFixed(2)) : null;
    // Aspects (natal)
    const natalAbs = {};
    for (const planet in natalPositions) {
      // Recompute absDegree for aspect calculation
      const idx = PLANETS.findIndex(p => p.name.replace('North Node', 'NorthNode') === planet);
      if (idx >= 0) {
        const res = await getPlanetPositionWithRetro(jd, PLANETS[idx].swe);
        natalAbs[planet] = { absDegree: res.longitude };
      }
    }
    const natalAspects = getAspects(natalAbs);
    // Transit chart
    let transitResult = null;
    if (transit_chart && transit_chart.date && transit_chart.time) {
      const transitDT = parseDateTime(transit_chart.date, transit_chart.time, transit_chart.timezone);
      const jdTransit = toJulianDay(transitDT);
      // Transit planets
      const transitPositions = {};
      for (const planet of PLANETS) {
        const res = await getPlanetPositionWithRetro(jdTransit, planet.swe);
        const absDegree = res.longitude;
        const sign = getSign(absDegree);
        const degree = +(absDegree % 30).toFixed(2);
        let house = null;
        if (houses && houses.cusps) {
          for (let h = 1; h <= 12; h++) {
            const start = houses.cusps[h - 1];
            const end = houses.cusps[h % 12];
            if (start < end) {
              if (absDegree >= start && absDegree < end) { house = h; break; }
            } else {
              if (absDegree >= start || absDegree < end) { house = h; break; }
            }
          }
        }
        transitPositions[planet.name.replace('North Node', 'NorthNode')] = {
          sign,
          degree,
          house
        };
      }
      // Aspects to natal
      const transitAbs = {};
      for (const planet in transitPositions) {
        const idx = PLANETS.findIndex(p => p.name.replace('North Node', 'NorthNode') === planet);
        if (idx >= 0) {
          const res = await getPlanetPositionWithRetro(jdTransit, PLANETS[idx].swe);
          transitAbs[planet] = { absDegree: res.longitude };
        }
      }
      // Aspects between transit and natal
      const aspectTypes = [
        { type: 'Conjunction', angle: 0, orb: 8 },
        { type: 'Opposition', angle: 180, orb: 8 },
        { type: 'Trine', angle: 120, orb: 8 },
        { type: 'Square', angle: 90, orb: 8 },
        { type: 'Sextile', angle: 60, orb: 6 }
      ];
      const aspects_to_natal = [];
      for (const nat in natalAbs) {
        for (const trn in transitAbs) {
          const a = natalAbs[nat].absDegree;
          const b = transitAbs[trn].absDegree;
          if (a == null || b == null) continue;
          let diff = Math.abs(a - b);
          if (diff > 180) diff = 360 - diff;
          for (const asp of aspectTypes) {
            if (Math.abs(diff - asp.angle) <= asp.orb) {
              aspects_to_natal.push({
                type: asp.type,
                between: [`Natal ${nat}`, `Transit ${trn}`],
                orb: +(Math.abs(diff - asp.angle)).toFixed(2)
              });
            }
          }
        }
      }
      transitResult = {
        date: transit_chart.date,
        planets: transitPositions,
        aspects_to_natal
      };
    }
    // Compose response
    const response = {
      meta: {
        name: name || req.body.name || null,
        birth: {
          date: birthData.date,
          time: birthData.time,
          timezone: birthData.timezone,
          location: birthData.location
        },
        chart_settings: chart_settings || {
          zodiac: 'tropical',
          house_system: hsys === 'P' ? 'Placidus' : hsys
        }
      },
      natal_chart: {
        ascendant,
        midheaven,
        houses: housesArr,
        planets: natalPositions,
        aspects: natalAspects
      },
      transit_chart: transitResult
    };
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
