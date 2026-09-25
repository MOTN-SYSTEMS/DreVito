(function(root) {
  'use strict';
  function coordinate(value) {
    if (value === null || value === undefined || value === '' || !['number', 'string'].includes(typeof value)) return 50;
    var number = Number(value);
    return Number.isFinite(number) ? Math.round(Math.max(0, Math.min(100, number)) * 100) / 100 : 50;
  }
  function normalize(photo) {
    return { focal_x: coordinate(photo && photo.focal_x), focal_y: coordinate(photo && photo.focal_y) };
  }
  function style(photo) {
    var position = normalize(photo);
    return position.focal_x + '% ' + position.focal_y + '%';
  }
  var api = { coordinate: coordinate, normalize: normalize, style: style };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImagePosition = api;
})(typeof window !== 'undefined' ? window : globalThis);
