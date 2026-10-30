/*
  Reading the API's timestamps.

  /latest and /health return a bare wall-clock string — "06:31:28 PM CST" —
  with no date and no real offset. Two things are true about it:

    1. It is America/Chicago wall time. Checked against /health, which said
       05:56:54 PM while Chicago read 05:56:55 PM CDT. A fixed UTC-6 would
       have been 04:56:55 PM, so the "CST" suffix is a label the server prints
       year round, not the offset it used.

    2. It carries no date, so the date has to be inferred. A reading can only
       be in the past, so if today's Chicago date puts it in the future it
       belongs to yesterday.

  The old parser (app.js) stamped those hours onto the VIEWER's timezone. In
  Pacific that lands an hour and a half ahead of now, the day gets rolled back,
  and a reading seconds old reports as ~21 hours stale — which is why a live
  bar showed "Disconnected" for everyone outside Central.

  This is a stopgap. docs/api-changes.md asks the API for ISO-8601 UTC; once
  that ships, this file can go and Date() can do the work.
*/
(function (global) {
  'use strict';

  var ZONE = 'America/Chicago';

  function zoneParts(instant) {
    var dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var out = {};
    dtf.formatToParts(instant).forEach(function (p) {
      if (p.type !== 'literal') out[p.type] = p.value;
    });
    return out;
  }

  /* How far ahead of UTC Chicago is at a given instant, in minutes.
     -300 during CDT, -360 during CST — worked out from the zone itself, so
     the DST changeover needs no special casing. */
  function offsetMinutes(instant) {
    var p = zoneParts(instant);
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day,
                         p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second);
    /* Rounded because asUTC is whole seconds while getTime() carries the
       current millisecond, so the division came out fractional and leaked
       "now" into every parse — two calls a moment apart returned instants that
       differed by a few milliseconds. Every real UTC offset is a whole number
       of minutes, so rounding is the answer rather than a fudge. */
    return Math.round((asUTC - instant.getTime()) / 60000);
  }

  /* "06:31:28 PM CST" -> Date, or null if it is not that shape. */
  function parse(str) {
    if (!str || str === '--') return null;
    var m = String(str).match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
    if (!m) {
      // Already ISO? Then the API change landed and this can just parse it.
      var iso = new Date(str);
      return isNaN(iso.getTime()) ? null : iso;
    }

    var hour = parseInt(m[1], 10);
    var isPM = /pm/i.test(m[4]);
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    var now = new Date();
    var today = zoneParts(now);
    var guess = Date.UTC(+today.year, +today.month - 1, +today.day,
                         hour, +m[2], +m[3]) - offsetMinutes(now) * 60000;

    // A minute of slack: clocks drift, and a reading is never from the future.
    if (guess > now.getTime() + 60000) guess -= 86400000;
    return new Date(guess);
  }

  /* Seconds since the reading, or null when it cannot be read. */
  function ageSeconds(str) {
    var d = parse(str);
    return d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 1000)) : null;
  }

  /* "just now" / "4m ago" / "3h ago" — in the viewer's own terms. */
  function relative(str) {
    var s = ageSeconds(str);
    if (s === null) return '';
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  /* The reading's clock time where the viewer is, not where the server is. */
  function localTime(str) {
    var d = parse(str);
    return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  }

  /* Which field on an API response actually carries the time.

     The API is moving from a bare wall clock to a real instant, and the two
     shapes have to work at once: the server change ships separately from this
     site, and the watch, Roku and Chrome extension still read the old fields,
     so they are not going away. Prefer the instant, fall back to whichever
     wall-clock field that endpoint uses, and parse() handles either. */
  function pick(obj) {
    if (!obj) return null;
    return obj.timestamp_utc || obj.timestamp_cst || obj.timestamp || null;
  }

  global.IRLTime = {
    pick: pick,
    parse: parse,
    ageSeconds: ageSeconds,
    relative: relative,
    localTime: localTime
  };
})(window);
