import polygonClipping from 'polygon-clipping';

// Dissolve the sweep pieces before drawing them with a single translucent fill.
// A null return means the geometry could not be safely dissolved: callers must
// show an unavailable state instead of displaying overlapping partial shadows.
export function unionShadows(collection) {
  try {
    const pieces = [];
    for (const feature of collection?.features ?? []) {
      const geometry = feature?.geometry;
      if (geometry?.type === 'Polygon') pieces.push(geometry.coordinates);
      else if (geometry?.type === 'MultiPolygon') pieces.push(...geometry.coordinates);
      else return null;
    }
    if (!pieces.length) return { type: 'FeatureCollection', features: [] };
    const coordinates = polygonClipping.union(...pieces);
    return { type: 'FeatureCollection', features: coordinates.length ? [{
      type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates },
    }] : [] };
  } catch {
    return null;
  }
}
