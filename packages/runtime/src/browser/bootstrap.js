/* VHTML deterministic bootstrap — injected before project code. */
(function () {
  'use strict';
  var mode = window.__VHTML_MODE__ || 'deterministic';
  window.__VHTML_BOOTSTRAPPED__ = true;
  if (mode !== 'deterministic') return;

  var seed = (window.__VHTML_SEED__ >>> 0) || 1;
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var random = mulberry32(seed);
  Math.random = random;

  var NativeDate = Date;
  var epoch = NativeDate.UTC(2021, 0, 1, 0, 0, 0);
  var realSetTimeout = window.setTimeout.bind(window);
  var realClearTimeout = window.clearTimeout.bind(window);
  var realRaf = window.requestAnimationFrame.bind(window);
  var clock = {
    now: 0,
    epoch: epoch,
    timers: new Map(),
    raf: new Map(),
    nextTimerId: 1,
    nextRafId: 1,
    errors: [],
    fired: 0,
    realNow: NativeDate.now.bind(NativeDate),
    realSetTimeout: realSetTimeout,
    realClearTimeout: realClearTimeout,
    realRaf: realRaf
  };
  window.__VHTML_CLOCK__ = clock;

  function VirtualDate() {
    var args = Array.prototype.slice.call(arguments);
    if (args.length === 0) return new NativeDate(epoch + clock.now);
    if (args.length === 1) return new NativeDate(args[0]);
    return new NativeDate(args[0], args[1], args[2] || 1, args[3] || 0, args[4] || 0, args[5] || 0, args[6] || 0);
  }
  VirtualDate.prototype = NativeDate.prototype;
  VirtualDate.now = function () { return epoch + clock.now; };
  VirtualDate.parse = NativeDate.parse;
  VirtualDate.UTC = NativeDate.UTC;
  Object.defineProperty(VirtualDate, 'name', { value: 'Date' });
  try { window.Date = VirtualDate; } catch (error) { /* ignore */ }

  try {
    Object.defineProperty(window.performance, 'now', {
      configurable: true,
      value: function now() { return clock.now; }
    });
  } catch (error) { /* ignore */ }

  function record(error) {
    if (clock.errors.length < 100) clock.errors.push(String((error && error.stack) || error));
  }

  function schedule(fn, delay, repeat, args) {
    if (typeof fn !== 'function') {
      // setTimeout("code") is intentionally unsupported in deterministic mode.
      if (typeof fn === 'string') record('string timer callbacks are disabled in deterministic mode');
      return 0;
    }
    var ms = Number(delay) || 0;
    if (ms < 0) ms = 0;
    var id = clock.nextTimerId++;
    clock.timers.set(id, {
      id: id,
      due: clock.now + ms,
      delay: Math.max(1, ms),
      repeat: repeat,
      fn: fn,
      args: args || []
    });
    return id;
  }

  window.setTimeout = function (fn, delay) { return schedule(fn, delay, false, Array.prototype.slice.call(arguments, 2)); };
  window.setInterval = function (fn, delay) { return schedule(fn, delay, true, Array.prototype.slice.call(arguments, 2)); };
  window.clearTimeout = function (id) { clock.timers.delete(id); };
  window.clearInterval = function (id) { clock.timers.delete(id); };
  window.requestAnimationFrame = function (fn) {
    if (typeof fn !== 'function') return 0;
    var id = clock.nextRafId++;
    clock.raf.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = function (id) { clock.raf.delete(id); };

  function dueTimer(target) {
    var best = null;
    clock.timers.forEach(function (timer) {
      if (timer.due <= target && (!best || timer.due < best.due || (timer.due === best.due && timer.id < best.id))) best = timer;
    });
    return best;
  }

  clock.fireDue = function (target) {
    var guard = 0;
    while (guard++ < 20000) {
      var timer = dueTimer(target);
      if (!timer) break;
      clock.now = timer.due;
      if (timer.repeat) timer.due += timer.delay;
      else clock.timers.delete(timer.id);
      clock.fired += 1;
      try { timer.fn.apply(window, timer.args); } catch (error) { record(error); }
    }
    if (guard >= 20000) record('deterministic timer budget exceeded');
  };

  clock.flushRaf = function () {
    var callbacks = Array.from(clock.raf.values());
    clock.raf.clear();
    for (var i = 0; i < callbacks.length; i += 1) {
      try { callbacks[i](clock.now); } catch (error) { record(error); }
    }
  };

  clock.advance = function (ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    if (ms < clock.now) {
      // Random-access backward seek: discard future timer state. Forward
      // rendering (the deterministic export path) never takes this branch.
      clock.timers.clear();
      clock.raf.clear();
      clock.now = ms;
      return;
    }
    clock.fireDue(ms);
    clock.now = ms;
    clock.flushRaf();
  };

  clock.settle = function () {
    for (var iteration = 0; iteration < 2; iteration += 1) {
      clock.fireDue(clock.now);
      clock.flushRaf();
    }
  };

  clock.takeErrors = function () {
    var errors = clock.errors.slice();
    clock.errors.length = 0;
    return errors;
  };

  try {
    if (window.crypto && window.crypto.getRandomValues) {
      Object.defineProperty(window.crypto, 'getRandomValues', {
        configurable: true,
        value: function getRandomValues(array) {
          var bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
          for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
          return array;
        }
      });
    }
  } catch (error) { /* ignore */ }

  // Disable CSS transitions; CSS animations remain available but are paused
  // and seeked by the stage runtime through the Web Animations API.
  var style = document.createElement('style');
  style.setAttribute('data-vhtml', 'deterministic');
  style.textContent = '*,*::before,*::after{transition:none!important;animation-play-state:paused!important;}';
  (document.head || document.documentElement).appendChild(style);
})();
