(function() {
  'use strict';
  var position = window.ImagePosition;
  window.ImagePositionEditor = {
    markup: function(photo, index, escapeHtml) {
      var point = position.normalize(photo);
      return '<div class="image-position" data-position-editor>' +
        '<label>Náhled ořezu<select data-position-preview aria-label="Náhled ořezu fotky ' + (index + 1) + '">' +
        '<option value="4 / 4.6">Karta / detail – počítač</option><option value="4 / 4.35">Karta – mobil</option>' +
        '<option value="4 / 4.25">Detail – mobil</option><option value="4 / 3">Galerie</option></select></label>' +
        '<div class="image-position__frame" data-position-frame><img draggable="false" src="' + escapeHtml(photo.url) + '" alt="Náhled pozice fotky ' + (index + 1) + '" style="object-position:' + position.style(photo) + '"></div>' +
        '<p class="image-position__help">Posuňte fotku tažením nebo posuvníky. Originál zůstane zachovaný. Změnu potvrdíte uložením výrobku.</p>' +
        '<label>Vlevo / vpravo<input type="range" min="0" max="100" step="1" data-position-axis="focal_x" value="' + point.focal_x + '"></label>' +
        '<label>Nahoře / dole<input type="range" min="0" max="100" step="1" data-position-axis="focal_y" value="' + point.focal_y + '"></label>' +
        '<button type="button" class="button button--secondary button--small" data-position-reset>Na střed</button></div>';
    },
    bind: function(root, getPhotos) {
      function context(target) {
        var row = target.closest('[data-index]');
        var photo = row && getPhotos()[Number(row.dataset.index)];
        return photo ? { row: row, photo: photo } : null;
      }
      function update(ctx, values) {
        Object.assign(ctx.photo, values);
        ctx.row.querySelectorAll('img').forEach(function(img) { img.style.objectPosition = position.style(ctx.photo); });
        ctx.row.querySelectorAll('[data-position-axis]').forEach(function(input) { input.value = position.coordinate(ctx.photo[input.dataset.positionAxis]); });
      }
      root.addEventListener('input', function(event) {
        var axis = event.target.dataset.positionAxis;
        var ctx = context(event.target);
        if (ctx && (axis === 'focal_x' || axis === 'focal_y')) update(ctx, { [axis]: position.coordinate(event.target.value) });
      });
      root.addEventListener('change', function(event) {
        if (!event.target.matches('[data-position-preview]')) return;
        var ctx = context(event.target);
        if (ctx) ctx.row.querySelector('[data-position-frame]').style.aspectRatio = event.target.value;
      });
      root.addEventListener('click', function(event) {
        if (!event.target.closest('[data-position-reset]')) return;
        var ctx = context(event.target);
        if (ctx) update(ctx, { focal_x: 50, focal_y: 50 });
      });
      var drag = null;
      root.addEventListener('pointerdown', function(event) {
        var frame = event.target.closest('[data-position-frame]');
        if (!frame || event.button !== 0 || !event.isPrimary) return;
        var ctx = context(frame), img = frame.querySelector('img');
        if (!ctx || !img.naturalWidth) return;
        var rect = frame.getBoundingClientRect();
        var scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        drag = { ctx: ctx, frame: frame, id: event.pointerId, x: event.clientX, y: event.clientY,
          point: position.normalize(ctx.photo), dx: img.naturalWidth * scale - rect.width, dy: img.naturalHeight * scale - rect.height };
        frame.setPointerCapture(event.pointerId);
        frame.classList.add('is-dragging');
        event.preventDefault();
      });
      root.addEventListener('pointermove', function(event) {
        if (!drag || drag.id !== event.pointerId) return;
        update(drag.ctx, {
          focal_x: drag.dx > 0.5 ? position.coordinate(drag.point.focal_x - (event.clientX - drag.x) * 100 / drag.dx) : drag.point.focal_x,
          focal_y: drag.dy > 0.5 ? position.coordinate(drag.point.focal_y - (event.clientY - drag.y) * 100 / drag.dy) : drag.point.focal_y
        });
      });
      function end(event) {
        if (!drag || drag.id !== event.pointerId) return;
        drag.frame.classList.remove('is-dragging');
        drag = null;
      }
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(type) { root.addEventListener(type, end); });
    }
  };
})();
