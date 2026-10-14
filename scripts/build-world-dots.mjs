// Turns the world-atlas land TopoJSON into a dot-matrix grid for the four desks map.
// Usage: node scripts/build-world-dots.mjs path/to/land-110m.json
// Get the file with: npm pack world-atlas@2.0.2 && tar xzf world-atlas-2.0.2.tgz
// Output: data/world-dots.json, a list of rows of 0/1 on an equirectangular grid.
import { readFile, writeFile } from 'node:fs/promises';

const COLS = 192, ROWS = 84;          // 1.875 degrees per cell, latitude 84N to 60S
const LAT_TOP = 84, LAT_BOTTOM = -60;

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-world-dots.mjs land-110m.json'); process.exit(1); }
const topo = JSON.parse(await readFile(src, 'utf8'));

// Decode TopoJSON arcs (delta-encoded, quantised).
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
function ring(arcIdx) {
  const pts = [];
  for (const i of arcIdx) {
    const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    for (const p of a) pts.push(p);
  }
  return pts;
}
const polygons = [];
for (const obj of Object.values(topo.objects)) {
  const geoms = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
  for (const g of geoms) {
    if (g.type === 'Polygon') polygons.push(g.arcs.map(ring));
    if (g.type === 'MultiPolygon') for (const poly of g.arcs) polygons.push(poly.map(ring));
  }
}

function inRing(pt, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function onLand(lon, lat) {
  for (const poly of polygons) {
    if (!inRing([lon, lat], poly[0])) continue;
    let hole = false;
    for (let k = 1; k < poly.length; k++) if (inRing([lon, lat], poly[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

const rows = [];
let count = 0;
for (let r = 0; r < ROWS; r++) {
  const lat = LAT_TOP - (r + 0.5) * (LAT_TOP - LAT_BOTTOM) / ROWS;
  let row = '';
  for (let c = 0; c < COLS; c++) {
    const lon = -180 + (c + 0.5) * 360 / COLS;
    const land = onLand(lon, lat);
    row += land ? '1' : '0';
    if (land) count++;
  }
  rows.push(row);
}
await writeFile('data/world-dots.json', JSON.stringify({ cols: COLS, rows: ROWS, latTop: LAT_TOP, latBottom: LAT_BOTTOM, grid: rows }));
console.error(`wrote data/world-dots.json: ${count} land dots on a ${COLS}x${ROWS} grid`);
