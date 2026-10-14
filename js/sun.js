// Solar elevation for a place and time. NOAA's simplified formulas, good to a degree or so.
// Used to paint the day strip with real light, and to tint the page by the hour.

export const CITIES = {
  uk: { name: 'London', lat: 51.5, lon: -0.12 },
  us: { name: 'New York', lat: 40.7, lon: -74.0 },
  au: { name: 'Sydney', lat: -33.9, lon: 151.2 },
  europe: { name: 'Paris', lat: 48.86, lon: 2.35 },
  international: { name: 'Greenwich', lat: 51.48, lon: 0 },
};

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;

export function solarElevation(date, lat, lon) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const hourUtc = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = 2 * Math.PI / 365 * (dayOfYear - 1 + (hourUtc - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const timeOffset = eqTime + 4 * lon;
  const trueSolarMinutes = (hourUtc * 60 + timeOffset + 1440) % 1440;
  let hourAngle = trueSolarMinutes / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const cosZenith = Math.sin(rad(lat)) * Math.sin(decl) + Math.cos(rad(lat)) * Math.cos(decl) * Math.cos(rad(hourAngle));
  return 90 - deg(Math.acos(Math.max(-1, Math.min(1, cosZenith))));
}

// Maps elevation (degrees) to a sky colour. Dark navy at night, amber at the horizon, pale gold by day.
export function skyColour(elev) {
  const stops = [
    [-18, [22, 24, 48]],
    [-6, [52, 40, 88]],
    [0, [224, 120, 64]],
    [6, [246, 190, 100]],
    [20, [250, 228, 170]],
    [60, [252, 246, 222]],
  ];
  if (elev <= stops[0][0]) return rgb(stops[0][1]);
  if (elev >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
  for (let i = 1; i < stops.length; i++) {
    if (elev <= stops[i][0]) {
      const [e0, c0] = stops[i - 1], [e1, c1] = stops[i];
      const t = (elev - e0) / (e1 - e0);
      return rgb(c0.map((v, k) => Math.round(v + (c1[k] - v) * t)));
    }
  }
  return rgb(stops[stops.length - 1][1]);
}
const rgb = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
