const fs = require('fs');
const usa = JSON.parse(fs.readFileSync('src/data/maps/USA.geo.json', 'utf8'));

// Contiguous US bounding box (approximate)
const minLon = -125;
const maxLon = -66;
const minLat = 24;
const maxLat = 49.5;

let newPolygons = [];

if (usa.features[0].geometry.type === 'MultiPolygon') {
  for (let polygon of usa.features[0].geometry.coordinates) {
    // Check first point of the first ring
    let [lon, lat] = polygon[0][0];
    if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
      newPolygons.push(polygon);
    }
  }
  usa.features[0].geometry.coordinates = newPolygons;
} else if (usa.features[0].geometry.type === 'Polygon') {
  // It's just one polygon, keep it (unlikely for USA)
}

fs.writeFileSync('src/data/maps/USA_contiguous.geo.json', JSON.stringify(usa));
console.log('Filtered USA map created.');
