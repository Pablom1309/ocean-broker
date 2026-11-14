// Obtiene los locales que pueden comprar salmón en la comuna de Santiago desde OpenStreetMap.
const comuna = require('./comuna.json');

const SERVIDORES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Rubros que pueden comprar salmón. El primero que calza gana.
const RUBROS = [
  ['sushi', /sushi|japanese|nikkei|ramen/i, /sushi|maki|nikkei|temaki|sashimi|nigiri|\brolls?\b|ramen/i],
  ['peruano', /peruvian|ceviche/i, /peruan|cevich|\bper[uú]\b/i],
  ['mariscos', /seafood|fish/i, /marisc|pescad|\bdel mar\b/i],
  ['poke', /poke|hawaiian/i, /\bpoke\b/i],
  ['asiatico', /asian|thai|korean|vietnamese|fusion/i, null],
  ['internacional', /international|fine_dining|mediterranean|french|spanish/i, null],
];

function rubroDe(t) {
  if (/seafood|fishmonger/.test(t.shop || '') || (t.shop && /pescad|marisc|salm[oó]n/i.test(t.name || ''))) return 'pescaderia';
  if (t.tourism === 'hotel') return 'hotel';
  for (const [id, cocina, nombre] of RUBROS) {
    if (cocina.test(t.cuisine || '') || (nombre && nombre.test(t.name || ''))) return id;
  }
  return null;
}

function consulta() {
  const xs = comuna.coordinates[0].map((p) => p[0]);
  const ys = comuna.coordinates[0].map((p) => p[1]);
  const caja = [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)].join(',');
  const comida = '["amenity"~"restaurant|fast_food|cafe|bar|pub|food_court"]';
  return `[out:json][timeout:50][bbox:${caja}];(` +
    `nwr${comida}["cuisine"~"sushi|japanese|nikkei|ramen|peruvian|seafood|fish|ceviche|poke|hawaiian|asian|thai|korean|vietnamese|fusion|international|fine_dining|mediterranean|french|spanish",i];` +
    `nwr${comida}["name"~"sushi|maki|nikkei|temaki|sashimi|nigiri|roll|poke|cevich|peruan|marisc|pescad",i];` +
    'nwr["shop"~"seafood|fishmonger"];' +
    'nwr["shop"]["name"~"sushi|pescad|marisc|salm",i];' +
    'nwr["tourism"="hotel"];' +
    ');out center tags;';
}

// Punto dentro del polígono (ray casting). El anillo usa [lon, lat].
function dentroDeComuna(lat, lon) {
  const anillo = comuna.coordinates[0];
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function limpiar(v) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null;
}

// Convierte un elemento de OpenStreetMap en un local, o null si no sirve.
function aLocal(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!dentroDeComuna(lat, lon)) return null;
  const rubro = rubroDe(t);
  if (!rubro) return null;
  const calle = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    osm_id: `${el.type}/${el.id}`,
    nombre: limpiar(t.name) || 'Local sin nombre',
    direccion: limpiar(calle) || limpiar(t['addr:full']),
    telefono: limpiar(t.phone || t['contact:phone'] || t['contact:mobile']),
    web: limpiar(t.website || t['contact:website'] || t['contact:instagram'] || t['contact:facebook']),
    horario: limpiar(t.opening_hours),
    cocina: limpiar(t.cuisine),
    rubro,
    lat,
    lon,
  };
}

function aLocales(elementos) {
  const vistos = new Set();
  const salida = [];
  for (const el of elementos || []) {
    const l = aLocal(el);
    if (l && !vistos.has(l.osm_id)) {
      vistos.add(l.osm_id);
      salida.push(l);
    }
  }
  return salida;
}

// Devuelve { locales, fuente }. Si OpenStreetMap no responde usa la copia guardada.
async function descargarLocales() {
  const cuerpo = 'data=' + encodeURIComponent(consulta());
  for (const url of SERVIDORES) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'mapa-sushi-santiago/1.0' },
        body: cuerpo,
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const datos = await r.json();
      const locales = aLocales(datos.elements);
      if (locales.length) return { locales, fuente: 'openstreetmap' };
    } catch (e) {
      // probar el siguiente servidor
    }
  }
  try {
    return { locales: aLocales(require('./semilla.json').elements), fuente: 'copia' };
  } catch (e) {
    // sin copia guardada
  }
  return { locales: [], fuente: 'ninguna' };
}

module.exports = { comuna, consulta, rubroDe, dentroDeComuna, aLocal, aLocales, descargarLocales };
