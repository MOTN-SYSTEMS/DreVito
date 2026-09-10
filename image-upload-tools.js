(function(root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.DrevitoAdminImage = api;
    root.drevitoPrepareAdminImage = api.prepare;
  }
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';

  var SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  var TARGET_BYTES = 3000000;
  var MAX_DIMENSION = 2400;

  function isHeic(file) {
    var type = String(file && file.type || '').toLowerCase();
    var name = String(file && file.name || '').toLowerCase();
    return type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/.test(name);
  }

  function needsNormalization(fileSize, width, height) {
    return Number(fileSize || 0) > TARGET_BYTES
      || Math.max(Number(width || 0), Number(height || 0)) > MAX_DIMENSION;
  }

  function loadImage(file) {
    var objectUrl = root.URL.createObjectURL(file);
    return new Promise(function(resolve, reject) {
      var image = new root.Image();
      image.onload = function() { resolve({ image: image, objectUrl: objectUrl }); };
      image.onerror = function() {
        root.URL.revokeObjectURL(objectUrl);
        reject(new Error('Fotku se nepodařilo přečíst. Soubor může být poškozený; zkuste jej exportovat jako JPG.'));
      };
      image.src = objectUrl;
    });
  }

  async function prepare(file) {
    if (!file) throw new Error('Vyberte fotku k nahrání.');
    if (isHeic(file)) {
      throw new Error('Fotky HEIC/HEIF zatím nelze nahrát. V telefonu je prosím exportujte nebo sdílejte jako JPG.');
    }
    if (SUPPORTED_TYPES.indexOf(String(file.type || '').toLowerCase()) === -1) {
      throw new Error('Použijte fotku ve formátu JPG, PNG, WEBP nebo GIF.');
    }

    var loaded = await loadImage(file);
    var image = loaded.image;
    try {
      var sourceWidth = image.naturalWidth || image.width;
      var sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) throw new Error('Fotka nemá platné rozměry.');
      if (!needsNormalization(file.size, sourceWidth, sourceHeight)) return file;
      if (file.type === 'image/gif') {
        throw new Error('GIF je příliš velký nebo má příliš vysoké rozlišení. Zmenšete jej pod 3 MB a nejvýše na 2400 px.');
      }

      var initialScale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
      var outputType = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';

      for (var attempt = 0; attempt < 8; attempt += 1) {
        var scale = initialScale * Math.pow(0.84, attempt);
        var width = Math.max(1, Math.round(sourceWidth * scale));
        var height = Math.max(1, Math.round(sourceHeight * scale));
        var canvas = root.document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var context = canvas.getContext('2d');
        if (!context) throw new Error('Prohlížeč nedokáže fotografii zpracovat.');
        context.drawImage(image, 0, 0, width, height);
        var quality = Math.max(0.56, 0.88 - attempt * 0.055);
        var blob = await new Promise(function(resolve) { canvas.toBlob(resolve, outputType, quality); });
        if (blob && blob.size <= TARGET_BYTES) {
          var baseName = String(file.name || 'fotka').replace(/\.[^.]+$/, '') || 'fotka';
          var extension = outputType === 'image/webp' ? '.webp' : '.jpg';
          return new root.File([blob], baseName + extension, { type: outputType, lastModified: Date.now() });
        }
      }
      throw new Error('Fotka je i po zmenšení příliš velká. Zkuste ji před nahráním zmenšit.');
    } finally {
      root.URL.revokeObjectURL(loaded.objectUrl);
    }
  }

  return {
    MAX_DIMENSION: MAX_DIMENSION,
    TARGET_BYTES: TARGET_BYTES,
    isHeic: isHeic,
    needsNormalization: needsNormalization,
    prepare: prepare
  };
});
