/*
  Meta pixel for the IRL Health Bar site — dataset "IRL Health Bar Web".

  Reports a page view, and a Lead whenever someone clicks through to the App
  Store (the deepest signal available, since the app carries no Meta SDK).
  Links are found by destination rather than by class, so this keeps working
  as pages change.

  get.html deliberately keeps its own inline copy instead of loading this file:
  it is the ad landing page and stays self-contained so it loads fast in the
  Instagram and Facebook in-app browsers.
*/
(function () {
  "use strict";
  var PIXEL_ID = "1073590775379869";

  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');

  function trackAppStoreTaps() {
    var links = document.querySelectorAll('a[href*="apps.apple.com"]');
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function () {
        if (window.fbq) {
          fbq('track', 'Lead', {
            content_name: 'IRL Health Bar',
            content_category: 'app_store_tap'
          });
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackAppStoreTaps);
  } else {
    trackAppStoreTaps();
  }
})();
