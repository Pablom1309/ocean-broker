const test = require('node:test');
const assert = require('node:assert');
const { dentroDeComuna, aLocal, aLocales, rubroDe, consulta } = require('../api/_lib/osm');

const nodo = (tags, lat = -33.4489, lon = -70.6693, id = 1) => ({ type: 'node', id, lat, lon, tags });

test('distingue puntos dentro y fuera de la comuna', () => {
  assert.equal(dentroDeComuna(-33.4489, -70.6693), true);
  assert.equal(dentroDeComuna(-33.4170, -70.6060), false);
});

test('clasifica cada local en su rubro', () => {
  assert.equal(rubroDe({ amenity: 'restaurant', cuisine: 'sushi;peruvian' }), 'sushi');
  assert.equal(rubroDe({ amenity: 'restaurant', cuisine: 'peruvian' }), 'peruano');
  assert.equal(rubroDe({ amenity: 'restaurant', name: 'Cevichería El Puerto' }), 'peruano');
  assert.equal(rubroDe({ amenity: 'restaurant', cuisine: 'seafood' }), 'mariscos');
  assert.equal(rubroDe({ amenity: 'fast_food', cuisine: 'poke' }), 'poke');
  assert.equal(rubroDe({ amenity: 'restaurant', cuisine: 'thai' }), 'asiatico');
  assert.equal(rubroDe({ amenity: 'restaurant', cuisine: 'french' }), 'internacional');
  assert.equal(rubroDe({ shop: 'seafood' }), 'pescaderia');
  assert.equal(rubroDe({ tourism: 'hotel', name: 'Hotel Plaza' }), null);
  assert.equal(rubroDe({ amenity: 'restaurant', cuisine: 'pizza', name: 'Roma' }), null);
});

test('convierte un local con sus datos y su rubro', () => {
  const l = aLocal(nodo({ name: 'Sushi Prueba', cuisine: 'sushi', 'addr:street': 'Vergara', 'addr:housenumber': '624' }));
  assert.equal(l.direccion, 'Vergara 624');
  assert.equal(l.rubro, 'sushi');
  assert.equal(l.osm_id, 'node/1');
});

test('descarta lo que no es objetivo, lo que está fuera y los repetidos', () => {
  assert.equal(aLocal(nodo({ name: 'Pizzería Roma', cuisine: 'pizza' })), null);
  assert.equal(aLocal(nodo({ name: 'Sushi Lejos', cuisine: 'sushi' }, -33.417, -70.606)), null);
  assert.equal(aLocales([nodo({ cuisine: 'peruvian' }), nodo({ cuisine: 'peruvian' })]).length, 1);
});

test('la consulta se limita a la zona de la comuna', () => {
  assert.match(consulta(), /\[bbox:-33\.4\d+,-70\.6\d+,-33\.4\d+,-70\.6\d+\]/);
});
