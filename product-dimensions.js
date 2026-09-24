(function(root) {
  'use strict';
  function formatProductDimensions(product) {
    var fields = [['height_cm', 'Výška'], ['width_cm', 'Šířka'], ['length_cm', 'Délka']];
    var available = fields.map(function(field) {
      var value = Number(product[field[0]]);
      return Number.isFinite(value) && value > 0
        ? { label: field[1], value: value.toLocaleString('cs-CZ', { maximumFractionDigits: 20 }) }
        : null;
    }).filter(Boolean);
    if (available.length === 3) return available.map(function(field) { return field.value; }).join(' × ') + ' cm';
    return available.map(function(field) { return field.label + ': ' + field.value + ' cm'; }).join(' · ');
  }
  if (typeof module === 'object' && module.exports) module.exports = formatProductDimensions;
  else root.formatProductDimensions = formatProductDimensions;
})(typeof window === 'object' ? window : this);
