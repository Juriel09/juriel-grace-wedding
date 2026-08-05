/* Turning a phone photo into something a wedding guest can actually send.

   Each file is redrawn at long-edge 2400px and re-encoded as JPEG — usually
   under a megabyte, still sharp enough to print, and iPhone HEIC comes out the
   other side as something Windows can open. Then they go up ONE AT A TIME: a
   hundred phones hitting one Apps Script deployment will occasionally be
   refused, and a serial queue with retries turns that into a slower upload
   rather than a lost photo. Nothing ever fails silently. */
(function () {
  "use strict";
  window.W = window.W || {};

  var MAX_EDGE = 2400;
  var QUALITY = 0.85;
  var MAX_BATCH = 10;
  var RETRIES = 2;

  var api = window.W.shareApi;
  var queueEl, hooks = {}, pending = [], running = false, uid = 0;

  var MESSAGES = {
    closed: "the album isn’t open yet",
    type: "photos only, please",
    too_large: "that photo is too large",
    rate: "give us a moment, then try again",
    server: "something went wrong"
  };

  /* createImageBitmap is the floor this whole pipeline stands on — no bitmap,
     no resize, no HEIC→JPEG. iOS Safari 14 and older don't have it, and there
     is no useful fallback: sending a 12MB HEIC raw would fail server-side
     anyway. Better to say so plainly than to queue photos that can't go. */
  function canShrink() { return typeof createImageBitmap === "function"; }

  /* The re-encode below rasterises the pixels and drops EXIF with them, so the
     camera's rotation has to be baked in here or portrait photos land sideways
     on the wall. "from-image" is the modern default, but a few older engines
     reject the options argument outright — fall back rather than lose a photo. */
  function bitmap(file) {
    return createImageBitmap(file, { imageOrientation: "from-image" })
      .catch(function () { return createImageBitmap(file); });
  }

  function shrink(file) {
    // Promise.resolve() first: on a browser without createImageBitmap the call
    // throws synchronously, and a synchronous throw out of send() would escape
    // pump()'s .then() and leave `running` latched true — every later photo
    // stuck at "waiting" with nothing left to restart the queue.
    return Promise.resolve().then(function () {
      return bitmap(file);
    }).then(function (bmp) {
      var fit = window.W.imageFit.fitWithin(bmp.width, bmp.height, MAX_EDGE);
      if (!fit.w) throw new Error("bad image");
      var c = document.createElement("canvas");
      c.width = fit.w; c.height = fit.h;
      c.getContext("2d").drawImage(bmp, 0, 0, fit.w, fit.h);
      if (bmp.close) bmp.close();
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { b ? res(b) : rej(new Error("encode")); }, "image/jpeg", QUALITY);
      });
    });
  }

  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        var comma = s.indexOf(",");
        comma > -1 ? res(s.substring(comma + 1)) : rej(new Error("read"));
      };
      fr.onerror = function () { rej(new Error("read")); };
      fr.readAsDataURL(blob);
    });
  }

  function row(item) {
    var li = document.createElement("li");
    li.id = "q" + item.id;
    var img = document.createElement("img");
    img.src = item.preview; img.alt = "";
    var name = document.createElement("span");
    name.className = "sh-qname";
    name.textContent = item.file.name || "photo";
    var state = document.createElement("span");
    state.className = "sh-qstate";
    state.textContent = "waiting";
    li.appendChild(img); li.appendChild(name); li.appendChild(state);
    queueEl.appendChild(li);
    return li;
  }

  function mark(item, cls, text) {
    var li = document.getElementById("q" + item.id);
    if (!li) return;
    li.classList.remove("is-done", "is-failed");
    if (cls) li.classList.add(cls);
    li.querySelector(".sh-qstate").textContent = text;
  }

  function offerRetry(item) {
    var li = document.getElementById("q" + item.id);
    if (!li || li.querySelector(".sh-qretry")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sh-qretry";
    b.textContent = "try again";
    b.addEventListener("click", function () {
      b.remove();
      item.attempt = 0;
      mark(item, null, "waiting");
      pending.push(item);
      pump();
    });
    li.appendChild(b);
  }

  function send(item) {
    mark(item, null, "sending…");
    return shrink(item.file)
      .then(toBase64)
      .then(function (b64) {
        return api.upload({
          tag: api.tag(),
          filename: item.file.name || "photo.jpg",
          mime: "image/jpeg",
          data: b64
        });
      })
      .then(function (res) {
        if (res && res.ok) {
          mark(item, "is-done", "sent ✓");
          if (hooks.onUploaded) hooks.onUploaded(res.id, item.preview);
          return;
        }
        var err = (res && res.error) || "server";
        // a rejection the server will keep making is not worth retrying
        if (err === "closed" || err === "type" || err === "too_large") {
          mark(item, "is-failed", MESSAGES[err]);
          if (hooks.toast) hooks.toast(MESSAGES[err]);
          return;
        }
        throw new Error(err);
      })
      .catch(function (e) {
        if (item.attempt < RETRIES) {
          item.attempt++;
          mark(item, null, "retrying…");
          return new Promise(function (r) { setTimeout(r, 900 * item.attempt); })
            .then(function () { return send(item); });
        }
        mark(item, "is-failed", "didn’t send");
        offerRetry(item);
        if (hooks.toast) hooks.toast(MESSAGES[String(e.message)] || "some photos didn’t send");
      });
  }

  function pump() {
    if (running) return;
    var item = pending.shift();
    if (!item) return;
    running = true;
    // `running` has to be cleared on every path there is. send() already catches
    // its own failures, but anything that escaped it — or threw before send()
    // returned a promise at all — would latch the queue shut for the rest of the
    // night, with every remaining photo sitting at "waiting" and no way back.
    var done = function () { running = false; pump(); };
    Promise.resolve().then(function () { return send(item); }).then(done, function (e) {
      console.error("shareUpload: queue error", e);
      mark(item, "is-failed", "didn’t send");
      offerRetry(item);
      done();
    });
  }

  function accept(files) {
    var list = [], i;
    for (i = 0; i < files.length; i++) {
      if (String(files[i].type || "").indexOf("image/") === 0) list.push(files[i]);
    }
    var droppedVideo = list.length < files.length;
    if (!list.length) {
      // nothing left to send, but a guest who picked only videos still needs
      // to hear that — the batch-cap message never applies here
      if (droppedVideo && hooks.toast) hooks.toast("photos only, please");
      return;
    }
    // nothing below this line can work without it, and a queue of rows that
    // will never move is worse than an honest refusal
    if (!canShrink()) {
      if (hooks.toast) hooks.toast("this browser can’t send photos — try Chrome or update iOS");
      return;
    }
    var overCap = list.length > MAX_BATCH;
    if (overCap) list = list.slice(0, MAX_BATCH);
    // both messages can be true at once (12 photos + 3 videos picked together);
    // share.js's toast() has no queue, so a second call silently clobbers the
    // first — say both facts in one toast rather than lose one of them
    if (droppedVideo && overCap && hooks.toast) {
      hooks.toast("photos only, please. sending the first " + MAX_BATCH + " — add the rest after");
    } else if (droppedVideo && hooks.toast) {
      hooks.toast("photos only, please");
    } else if (overCap && hooks.toast) {
      hooks.toast("sending the first " + MAX_BATCH + " — add the rest after");
    }
    list.forEach(function (f) {
      var item = { id: ++uid, file: f, attempt: 0, preview: URL.createObjectURL(f) };
      row(item);
      pending.push(item);
    });
    pump();
  }

  function init(opts) {
    hooks = opts || {};
    queueEl = document.getElementById("queue");
    var input = document.getElementById("pickInput");
    var btn = document.getElementById("pickBtn");
    if (!input || !queueEl) return;

    input.addEventListener("change", function () {
      accept(input.files || []);
      input.value = "";                  // so picking the same photo twice still fires
    });
    // the label already opens the picker on click; this is only for keyboard users
    if (btn) {
      btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
      });
    }
  }

  window.W.shareUpload = { init: init };
})();
