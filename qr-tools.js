(function() {
  'use strict';
  var revision = 0;
  var currentId = '';
  var target = null;
  var previewUrl = '';
  var block;
  var status;
  var publicLink;
  var generate;
  var result;
  var preview;

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    preview.removeAttribute('src');
    result.hidden = true;
  }

  function init() {
    if (block) return true;
    block = document.querySelector('[data-qr-type]');
    if (!block) return false;
    status = block.querySelector('[data-qr-status]');
    publicLink = block.querySelector('[data-qr-url]');
    generate = block.querySelector('[data-qr-generate]');
    result = block.querySelector('[data-qr-result]');
    preview = block.querySelector('[data-qr-preview]');
    generate.addEventListener('click', function() { createFile('svg', false); });
    block.querySelectorAll('[data-qr-download]').forEach(function(button) {
      button.addEventListener('click', function() { createFile(button.dataset.qrDownload, true); });
    });
    return true;
  }

  function endpoint(format) {
    var query = new URLSearchParams({ type: block.dataset.qrType, id: currentId });
    if (format) {
      query.set('format', format);
      query.set('expectedUrl', target.url);
    }
    return '/admin/api/qr?' + query.toString();
  }

  async function get(url) {
    var response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      var data = await response.json().catch(function() { return {}; });
      throw new Error(data.error || 'QR kód se nepodařilo načíst. Zkuste to znovu.');
    }
    return response;
  }

  async function set(id) {
    if (!init()) return;
    var version = ++revision;
    currentId = id || '';
    target = null;
    clearPreview();
    block.querySelectorAll('button').forEach(function(button) { button.disabled = false; });
    generate.disabled = true;
    publicLink.hidden = true;
    publicLink.removeAttribute('href');
    publicLink.textContent = '';
    status.textContent = id ? 'Ověřuji veřejnou adresu…' : 'QR kód je dostupný po uložení a zveřejnění obsahu.';
    if (!id) return;
    try {
      var response = await get(endpoint());
      var data = await response.json();
      if (version !== revision) return;
      target = data;
      publicLink.textContent = data.url;
      publicLink.href = data.url;
      publicLink.hidden = false;
      generate.disabled = false;
      status.textContent = 'QR kód použije tuto uloženou veřejnou adresu.';
    } catch (error) {
      if (version === revision) status.textContent = error.message;
    }
  }

  async function createFile(format, download) {
    if (!target) return;
    var version = revision;
    var filename = target.filename;
    block.querySelectorAll('button').forEach(function(button) { button.disabled = true; });
    status.textContent = 'Ověřuji dostupnost a připravuji QR kód…';
    try {
      // Every preview and download rechecks publication and the saved URL.
      var response = await get(endpoint(format));
      var blob = await response.blob();
      if (version !== revision) return;
      if (download) {
        var fileUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = fileUrl;
        link.download = filename + '.' + format;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function() { URL.revokeObjectURL(fileUrl); }, 60000);
      } else {
        clearPreview();
        previewUrl = URL.createObjectURL(blob);
        preview.src = previewUrl;
        result.hidden = false;
      }
      status.textContent = 'Statický QR kód obsahuje přímo veřejnou adresu. Bez expirace a bez limitu skenování.';
    } catch (error) {
      if (version !== revision) return;
      clearPreview();
      status.textContent = error.message + ' Znovu otevřete obsah pro ověření aktuální adresy.';
      target = null;
      publicLink.hidden = true;
    } finally {
      if (version === revision) block.querySelectorAll('button').forEach(function(button) { button.disabled = !target; });
    }
  }

  window.drevitoQr = { set: set };
  document.addEventListener('DOMContentLoaded', function() { if (!block) set(''); });
})();
