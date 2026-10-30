// Professional Dashboard JavaScript

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

// ─────────────────────────────────────────────
// FIREBASE INIT
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCKkf8U9llEmpkIJv9WSPM12eXu8TRcD0c",
  authDomain: "irl-healthbar.firebaseapp.com",
  projectId: "irl-healthbar",
  storageBucket: "irl-healthbar.firebasestorage.app",
  messagingSenderId: "847361155213",
  appId: "1:847361155213:web:4f299c78bb1c1e7de1c2c4",
  measurementId: "G-EK4E1LPC12"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let professionalLoggedIn  = false;
let currentProfessionalID = null;  // Firebase user.uid
let currentUserEmail      = null;  // Firebase user.email
let clientsInterval       = null;
let expandedDetails       = new Set();
let authResolved          = false;  // has Firebase answered about the session yet
let subscriptionLoaded    = false;  // did /subscription-status actually answer

const subscriptionData = {
  tier: 'free',
  max_clients: 10,
  refresh_rate: 10000,
  update_interval: 300
};

const API_BASE_URL = 'https://stamina-api.onrender.com';

// Loose on purpose. The authority on whether an email exists is Firebase;
// this only catches the typo that would otherwise cost a round trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A reading older than this is not telling you anything about right now.
const STALE_AFTER_SECONDS = 600;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Escapes strings before inserting into innerHTML — prevents XSS
function escapeHtml(str) {
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

// Returns a fresh JWT token — Firebase auto-refreshes when expired
async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

// fetch() wrapper that attaches Authorization: Bearer <token> automatically
async function authFetch(url, options = {}) {
  const token = await getAuthToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
}

// ─────────────────────────────────────────────
// FORM FEEDBACK
// Every failure here used to arrive as alert() — a modal the trainer had to
// dismiss before they could even see the field they got wrong.
// ─────────────────────────────────────────────
function setMsg(id, text, kind) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('is-error', kind === 'error');
  el.classList.toggle('is-ok',    kind === 'ok');
}

// Holds a button while its request is in flight, so a second click cannot
// fire a second sign-in.
async function withBusy(btnId, label, fn) {
  const btn  = document.getElementById(btnId);
  const was  = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { return await fn(); }
  finally { if (btn) { btn.disabled = false; btn.textContent = was; } }
}

// ─────────────────────────────────────────────
// RATE LIMITER
// ─────────────────────────────────────────────
const RateLimiter = {
  store: {},
  limits: {
    login:     { max: 5,  windowMs: 5 * 60 * 1000 },
    addClient: { max: 10, windowMs: 1 * 60 * 1000 },
    fetchData: { max: 60, windowMs: 1 * 60 * 1000 },
    reset:     { max: 3,  windowMs: 5 * 60 * 1000 },
  },
  check(action) {
    const limit = this.limits[action];
    if (!limit) return;
    const now   = Date.now();
    const entry = this.store[action] || { count: 0, resetAt: now + limit.windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + limit.windowMs; }
    entry.count++;
    this.store[action] = entry;
    if (entry.count > limit.max) {
      const waitSec = Math.ceil((entry.resetAt - now) / 1000);
      throw new Error(`Too many attempts. Try again in ${waitSec}s.`);
    }
  }
};

// ─────────────────────────────────────────────
// AUTH STATE — single source of truth for all UI
// Fires on page load, login, and logout automatically
// ─────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  authResolved = true;

  if (user) {
    currentProfessionalID = user.uid;
    currentUserEmail      = user.email;
    professionalLoggedIn  = true;

    const who = document.getElementById('session-email');
    if (who) who.textContent = user.email || 'this account';
    if (user.email) localStorage.setItem('professionalEmail', user.email);

    updateHeroCopy(true);
    showDashboard();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      showPaymentSuccessMessage();
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Subscription first: it decides how often the dashboard may poll.
    await loadSubscriptionFromBackend();
    startClientsFetching();

  } else {
    currentProfessionalID = null;
    currentUserEmail      = null;
    professionalLoggedIn  = false;

    if (clientsInterval) { clearInterval(clientsInterval); clientsInterval = null; }

    updateHeroCopy(false);

    // If coming from payment, show account creation instead of login
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      showCreateAccount();
    } else {
      showLogin();
    }
  }
});

// With no network at all the callback above never fires, and the page would
// sit on "Checking your session" forever. Show the pitch instead.
setTimeout(() => {
  if (!authResolved) {
    console.warn('Firebase did not answer in time; falling back to signed-out view');
    showLogin();
  }
}, 8000);

// ─────────────────────────────────────────────
// SUBSCRIPTION
// ─────────────────────────────────────────────
async function loadSubscriptionFromBackend() {
  try {
    const response = await authFetch(`${API_BASE_URL}/professional/subscription-status`);
    if (!response.ok) { console.error('Failed to load subscription:', response.status); return; }
    const subscription = await response.json();
    subscriptionLoaded = true;
    subscriptionData.tier            = subscription.tier || 'free';
    subscriptionData.max_clients     = subscription.max_clients || 10;
    subscriptionData.update_interval = subscription.update_interval || 300;
    updateSubscriptionUI(subscription);
    localStorage.setItem('subscription', JSON.stringify(subscription));
  } catch (error) {
    console.error('Error loading subscription:', error);
  }
}

/* The server answers add-client-by-code with "Subscription not active" for an
   account with no plan, so a dashboard that offers a 10-client limit and a
   refresh rate to that account is describing something it cannot do. Decide
   once here what the account may actually do, and let the UI follow.

   `has_subscription` is trusted when present but not required: an account on a
   named tier is paying whether or not the field came along. The status
   endpoint has returned `tier: "none"` for an unknown id and `tier: "free"`
   for a real account with no plan, so both of those are "not paid". */
function updateSubscriptionUI(subscription) {
  const tier = subscription.tier || 'free';
  const paid = subscription.has_subscription === true
            || (tier !== 'free' && tier !== 'none');

  const tierElement = document.getElementById('subscription-tier');
  if (tierElement) {
    tierElement.textContent = tier.toUpperCase();
    tierElement.className   = `tier-badge tier-${tier}`;
  }
  // No plan, no clients — whatever max_clients says.
  const limitElement = document.getElementById('client-limit');
  if (limitElement) limitElement.textContent = paid ? (subscription.max_clients ?? 10) : '\u2014';

  // The banner used to be a bare upgrade nag that said nothing. Now it is
  // whichever of two true things applies.
  const banner = document.getElementById('subscription-banner');
  if (banner) {
    const rate = document.getElementById('tier-banner-rate');
    const sub  = document.getElementById('tier-banner-sub');
    if (paid) {
      if (rate) rate.textContent = getIntervalText(subscription.update_interval);
      if (sub)  sub.textContent  = `Your ${tier} plan is active.`;
    } else {
      if (rate) rate.textContent = 'Subscription not active';
      if (sub)  sub.textContent  = 'Adding a client needs a plan the server recognises.';
    }
    banner.classList.toggle('is-paid', paid);
    banner.style.display = 'flex';
  }

  setAddClientEnabled(paid);
}

/* Offering the form to an account the server will refuse is a round trip that
   could only ever fail, and the trainer reads the refusal as something they
   did wrong. Say it before they type. Left enabled when the status call never
   answered — a failed lookup is not evidence against the account. */
function setAddClientEnabled(enabled) {
  const section = document.querySelector('.add-client-section');
  if (section) section.classList.toggle('is-locked', !enabled);

  [document.getElementById('share-code-input'),
   document.getElementById('client-nickname-input'),
   document.getElementById('add-client-btn')
  ].forEach(el => { if (el) el.disabled = !enabled; });

  setMsg('add-client-msg',
         enabled ? '' : 'Your subscription is not active, so the server will not attach a client yet.',
         enabled ? undefined : 'error');
}

function getIntervalText(intervalSeconds) {
  const s = Number(intervalSeconds);
  if (!Number.isFinite(s) || s <= 0) return 'Updating every 5 min';
  if (s <= 10)  return 'Updating every 10s';
  if (s <= 30)  return 'Updating every 30s';
  if (s <= 90)  return 'Updating every 90s';
  if (s <= 300) return 'Updating every 5 min';
  return `Updating every ${Math.round(s / 60)} min`;
}

// ─────────────────────────────────────────────
// PITCH + LIVE DEMO
// ─────────────────────────────────────────────
// Enter a share code from the Watch or iPhone app and the real bar loads.
// Same endpoints the home page's pitch mode uses: a friendly ID resolves to a
// user, and /latest carries that user's current score.
(function demoBox() {
  const form = document.getElementById('demo-form');
  if (!form) return;
  const input = document.getElementById('demo-code');
  const btn   = document.getElementById('demo-btn');
  const msg   = document.getElementById('demo-msg');
  const panel = document.getElementById('demo-result');
  const fill  = document.getElementById('demo-fill');
  const score = document.getElementById('demo-score');
  const foot  = document.getElementById('demo-foot');

  function say(text, isError) {
    msg.textContent = text;
    msg.classList.toggle('is-error', !!isError);
  }

  /* Two different code systems live behind this API, and the demo only knew
     one of them. /resolve-friendly-id is the friendly-ID namespace that the
     home page's pitch mode uses; share codes issued by the apps go through
     GET /{share_code}, which is what the OBS widget reads and what the
     trainer dashboard redeems. A code from one app resolved, a code from the
     other did not.

     So ask the public share-code endpoint first, since that is the code the
     Share screen actually prints, and fall back to the friendly ID. The
     fallback is the only one that reports appType, so the app is named only
     when that path answered. */
  async function lookup(code) {
    const pub = await fetch(API_BASE_URL + '/' + encodeURIComponent(code));
    if (pub.ok) {
      const d = await pub.json();
      return {
        score: d.stamina_score,
        timestamp: d.timestamp_cst,
        appType: null,                 // this endpoint does not say
        realtime: !!d.realtime
      };
    }
    if (pub.status !== 404) throw new Error('share code ' + pub.status);

    const r = await fetch(API_BASE_URL + '/resolve-friendly-id/' + encodeURIComponent(code));
    if (r.status === 404) return null;        // unknown in both namespaces
    if (!r.ok) throw new Error('resolve ' + r.status);
    const { userID } = await r.json();

    const l = await fetch(API_BASE_URL + '/latest?userID=' + encodeURIComponent(userID),
                          { cache: 'no-store' });
    if (l.status === 404) return { noReadingYet: true };
    if (!l.ok) throw new Error('latest ' + l.status);
    const d = await l.json();
    return {
      score: d.staminaScore,
      timestamp: d.timestamp,
      appType: d.appType || null,
      realtime: false
    };
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (code.length !== 8) {
      say('A share code is 8 characters.', true);
      input.focus();
      return;
    }

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Checking\u2026';
    say('');

    try {
      const res = await lookup(code);

      if (!res) {
        say('No match. Share codes expire — open Share in the app for a fresh one.', true);
        panel.hidden = true;
        return;
      }
      if (res.noReadingYet) {
        say('That code works, but the app has not sent a reading yet.', true);
        panel.hidden = true;
        return;
      }

      const pct = Math.max(0, Math.min(100, parseInt(res.score, 10) || 0));
      const isWorkout = res.appType === 'workout';
      const age = window.IRLTime ? window.IRLTime.ageSeconds(res.timestamp) : null;
      const stale = age !== null && age > 600;

      score.textContent = pct + '%';
      fill.style.width = pct + '%';
      panel.classList.toggle('is-workout', isWorkout);
      panel.classList.toggle('is-stale', stale);
      /* `realtime` describes what the plan allows, not what arrived. Saying
         "Live" above a bar whose own footnote reads "13h ago" is a
         contradiction the viewer can see, so staleness wins. */
      document.getElementById('demo-bar-label').textContent =
        stale      ? 'Last reading'
        : isWorkout ? 'Workout app'
        : res.realtime ? 'Live' : 'Latest reading';

      const when = (window.IRLTime && res.timestamp)
        ? window.IRLTime.relative(res.timestamp) + ' \u00b7 ' + window.IRLTime.localTime(res.timestamp)
        : res.timestamp || '';
      const notes = [when ? 'Updated ' + when : 'No timestamp'];
      if (isWorkout) notes.push('from the workout app, not the bar on your watch face');
      if (stale) notes.push('nothing newer has reached the server');
      foot.textContent = notes.join(' \u00b7 ');

      panel.hidden = false;
      say('This is the bar a trainer sees for you.');
    } catch (err) {
      say('Could not reach the server. Try again in a moment.', true);
      panel.hidden = true;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
})();

// ─────────────────────────────────────────────
// UI STATE
//
// Showing a view means hiding every other one, so the list lives here once.
// Each show* function used to name the sections it knew about, and
// #create-account-form was on none of those lists — so a trainer who had just
// paid and signed up kept "Payment received" sitting above their dashboard.
// ─────────────────────────────────────────────
const SECTIONS = [
  'auth-boot', 'trainer-pitch', 'professional-auth',
  'create-account-form', 'sign-in-form', 'professional-dashboard'
];

function showSections(visible) {
  SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible.includes(id) ? 'block' : 'none';
  });
}

function showLogin() {
  showSections(['trainer-pitch', 'professional-auth']);
  updateHeroCopy(false);
}

function showAuthOptions() {
  setMsg('signin-msg', '');
  showSections(['trainer-pitch', 'professional-auth']);
  updateHeroCopy(false);
}

function showSignIn() {
  setMsg('signin-msg', '');
  showSections(['sign-in-form']);
  updateHeroCopy(false);
  document.getElementById('email-input')?.focus();
}

function goToSignUp() {
  window.location.href = '/payment/index.html';
}

function showDashboard() {
  showSections(['professional-dashboard']);
  updateHeroCopy(true);
}

function updateHeroCopy(isLoggedIn) {
  const heroTitle    = document.getElementById('hero-title');
  const heroSubtitle = document.getElementById('hero-subtitle');
  if (isLoggedIn) {
    heroTitle.textContent    = 'Your clients, right now.';
    heroSubtitle.textContent = 'Every bar below refreshes on its own.';
  } else {
    heroTitle.textContent    = "Every client's recovery, on one screen.";
    heroSubtitle.textContent = 'Clients share a code from the app. You watch their bar move.';
  }
}

function toggleMobileMenu() {
  const hamburger = document.getElementById('hamburger-menu');
  const overlay   = document.getElementById('mobile-menu-overlay');
  const menu      = document.getElementById('mobile-menu');
  hamburger.classList.toggle('active');
  overlay.classList.toggle('active');
  menu.classList.toggle('active');
  document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
}

window.addEventListener('scroll', () => {
  document.querySelector('.modern-navbar')?.classList.toggle('scrolled', window.scrollY > 50);
});

function showPaymentSuccessMessage() {
  const banner = document.createElement('div');
  banner.className = 'payment-success-banner';
  banner.innerHTML = `
    <div class="success-content">
      <span class="success-text">Payment successful! Your subscription is now active.</span>
      <button class="close-banner" onclick="this.parentElement.parentElement.remove()">x</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => { banner.classList.add('closing'); setTimeout(() => banner.remove(), 300); }, 5000);
}

// ─────────────────────────────────────────────
// AUTH FUNCTIONS
// ─────────────────────────────────────────────
function signInError(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match an account.';
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/user-disabled':
      return 'This account is disabled. Reply to your receipt and we will sort it out.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, or reset your password below.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    default:
      return 'Could not sign in. Try again in a moment.';
  }
}

async function professionalLogin() {
  const email    = document.getElementById('email-input').value.trim().toLowerCase();
  const password = document.getElementById('password-input').value;

  if (!EMAIL_RE.test(email)) {
    setMsg('signin-msg', 'That does not look like an email address.', 'error');
    document.getElementById('email-input').focus();
    return;
  }
  if (!password) {
    setMsg('signin-msg', 'Enter your password.', 'error');
    document.getElementById('password-input').focus();
    return;
  }

  try { RateLimiter.check('login'); }
  catch (err) { setMsg('signin-msg', err.message, 'error'); return; }

  setMsg('signin-msg', '');
  await withBusy('signin-btn', 'Signing in\u2026', async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged takes the UI from here
    } catch (error) {
      console.error('Login error:', error.code);
      setMsg('signin-msg', signInError(error.code), 'error');
    }
  });
}

// A forgotten password was a dead end: this page offered sign in and sign up
// and nothing else, so a paying trainer who lost their password lost their
// dashboard. Firebase mails them a link.
async function sendReset() {
  const field = document.getElementById('email-input');
  const email = field.value.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    setMsg('signin-msg', 'Put your email in the field above, then tap this again.', 'error');
    field.focus();
    return;
  }

  try { RateLimiter.check('reset'); }
  catch (err) { setMsg('signin-msg', err.message, 'error'); return; }

  // Deliberately worded the same whether or not the account exists. Otherwise
  // this box is a way to ask the site which email addresses are customers.
  const sent = 'If that email has an account, a reset link is on its way. Check spam too.';

  setMsg('signin-msg', '');
  await withBusy('reset-btn', 'Sending\u2026', async () => {
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg('signin-msg', sent, 'ok');
    } catch (error) {
      console.error('Reset error:', error.code);
      if (error.code === 'auth/user-not-found') {
        setMsg('signin-msg', sent, 'ok');
      } else if (error.code === 'auth/too-many-requests') {
        setMsg('signin-msg', 'Too many reset requests. Try again in a few minutes.', 'error');
      } else if (error.code === 'auth/network-request-failed') {
        setMsg('signin-msg', 'No connection. Check your network and try again.', 'error');
      } else {
        setMsg('signin-msg', 'Could not send the reset email. Try again in a moment.', 'error');
      }
    }
  });
}

function showCreateAccount() {
  setMsg('signup-msg', '');
  showSections(['create-account-form']);
  updateHeroCopy(false);

  // Checkout already asked for an email. Asking twice is how a trainer ends up
  // with a subscription on one address and an account on another.
  const savedEmail = localStorage.getItem('professionalEmail') || '';
  const emailInput = document.getElementById('signup-email-input');
  if (emailInput && savedEmail) emailInput.value = savedEmail;
  if (savedEmail) document.getElementById('signup-password-input')?.focus();
  else emailInput?.focus();
}

async function professionalSignUp() {
  const emailEl    = document.getElementById('signup-email-input');
  const passwordEl = document.getElementById('signup-password-input');
  const email      = (emailEl?.value || '').trim().toLowerCase();
  const password   = passwordEl?.value || '';

  if (!EMAIL_RE.test(email)) {
    setMsg('signup-msg', 'That does not look like an email address.', 'error');
    emailEl?.focus();
    return;
  }
  if (password.length < 6) {
    setMsg('signup-msg', 'Use at least 6 characters.', 'error');
    passwordEl?.focus();
    return;
  }

  setMsg('signup-msg', '');
  await withBusy('signup-btn', 'Creating\u2026', async () => {
    try {
      localStorage.setItem('professionalEmail', email);
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged takes the UI from here, and clears ?payment=success
      // once it has shown the receipt banner.
    } catch (error) {
      console.error('Sign up error:', error.code);
      if (error.code === 'auth/email-already-in-use') {
        setMsg('signup-msg', 'That email already has an account. Sign in instead.', 'error');
      } else if (error.code === 'auth/weak-password') {
        setMsg('signup-msg', 'That password is too short. Six characters or more.', 'error');
      } else if (error.code === 'auth/invalid-email') {
        setMsg('signup-msg', 'That does not look like an email address.', 'error');
      } else if (error.code === 'auth/network-request-failed') {
        setMsg('signup-msg', 'No connection. Check your network and try again.', 'error');
      } else {
        setMsg('signup-msg', 'Could not create the account. Try again in a moment.', 'error');
      }
    }
  });
}

async function logout() {
  if (!confirm('Sign out of this dashboard?')) return;
  try {
    await signOut(auth);
    // onAuthStateChanged handles cleanup
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function checkSubscription() {
  const bannerElement = document.getElementById('subscription-banner');
  const tierElement   = document.getElementById('subscription-tier');
  const limitElement  = document.getElementById('client-limit');
  if (subscriptionData.tier === 'free') {
    if (bannerElement) bannerElement.style.display = 'flex';
  } else {
    if (bannerElement) bannerElement.style.display = 'none';
  }
  if (tierElement) tierElement.textContent = subscriptionData.tier.charAt(0).toUpperCase() + subscriptionData.tier.slice(1);
  if (limitElement) limitElement.textContent = subscriptionData.max_clients;
}

// ─────────────────────────────────────────────
// ADD CLIENT
// ─────────────────────────────────────────────
// The client list lives under the trainer's Firebase uid, so two accounts on
// one browser never see each other's clients.
function readClients() {
  try {
    const raw = localStorage.getItem(`prof_${currentProfessionalID}`) || '{"clients":[]}';
    return JSON.parse(raw).clients || [];
  } catch (error) {
    console.warn('Client list unreadable, starting empty:', error);
    return [];
  }
}

function writeClients(clients) {
  localStorage.setItem(`prof_${currentProfessionalID}`, JSON.stringify({ clients }));
}

/* The server's own reason comes first. The first version of this mapped 401
   and 403 to "your session expired" and threw the body away, which turned a
   403 that knew exactly what was wrong into a lie — the token was fine, since
   /professional/subscription-status had just answered with it. Only invent a
   message when the server did not send one. */
function addClientError(status, detail, live) {
  if (detail) return detail;
  if (status === 404) {
    return live
      ? 'That code is live, but this dashboard could not attach it to your account.'
      : 'No match. Share codes expire \u2014 ask your client for a fresh one from Share.';
  }
  if (status === 401) return 'Your session expired. Sign out and back in.';
  if (status === 403) return 'This account is not allowed to add clients. Check your plan.';
  if (status === 429) return 'Too many requests. Give it a minute.';
  if (status >= 500)  return 'The server had a problem with that. Try again in a moment.';
  return 'Could not add that client. Try again in a moment.';
}

/* Two different things are called a share code here, and only one of them is
   redeemable by a trainer. GET /{code} answers for the viewing code the app's
   Share screen prints — the one the OBS widget and the demo box read — while
   /verify-share-code answers for the pairing code the professional flow
   redeems, and it reports valid:false for a viewing code that is very much
   live. Asking the read path first means a refusal can be described as what it
   is, instead of blamed on a code that works fine. */
async function codeIsLive(code) {
  try {
    const r = await fetch(`${API_BASE_URL}/${encodeURIComponent(code)}`, { cache: 'no-store' });
    return r.ok;
  } catch (_) {
    return null;   // could not ask; not a reason to hold up the real request
  }
}

// FastAPI sends `detail` as a string for a raised HTTPException and as an array
// of objects for a validation failure. Only the string is worth showing.
function detailText(body) {
  const d = body && body.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(e => e && e.msg).filter(Boolean).join('. ');
  return '';
}

async function addClient() {
  const input     = document.getElementById('share-code-input');
  const nickEl    = document.getElementById('client-nickname-input');
  const shareCode = input.value.trim().toUpperCase();
  const typedNick = (nickEl?.value || '').trim();

  if (shareCode.length !== 8) {
    setMsg('add-client-msg', 'A share code is 8 characters.', 'error');
    input.focus();
    return;
  }
  if (!professionalLoggedIn) {
    setMsg('add-client-msg', 'Your session expired. Sign out and back in.', 'error');
    return;
  }

  try { RateLimiter.check('addClient'); }
  catch (err) { setMsg('add-client-msg', err.message, 'error'); return; }

  // Check the limit before spending a request on it.
  const stored = readClients();
  if (stored.length >= subscriptionData.max_clients) {
    setMsg('add-client-msg',
      `You are at your limit of ${subscriptionData.max_clients} clients. A bigger plan raises it.`,
      'error');
    return;
  }

  setMsg('add-client-msg', '');
  await withBusy('add-client-btn', 'Adding\u2026', async () => {
    try {
      const live = await codeIsLive(shareCode);
      if (live === false) {
        setMsg('add-client-msg',
          'No match. Share codes expire \u2014 ask your client for a fresh one from Share.',
          'error');
        return;
      }

      const response = await authFetch(`${API_BASE_URL}/professional/add-client-by-code`, {
        method: 'POST',
        body:   JSON.stringify({ share_code: shareCode })
      });

      if (!response.ok) {
        let detail = '';
        try { detail = detailText(await response.json()); } catch (_) { /* no body */ }
        // Logged as well as shown. The status says whether a refusal is about
        // the token, the plan or the code, and `live` says whether the code
        // itself resolves — which it can, while still not being redeemable.
        console.error('add-client-by-code failed:', response.status,
                      detail || '(no detail)', '| code resolves:', live);
        setMsg('add-client-msg', addClientError(response.status, detail, live), 'error');
        return;
      }

      const data = await response.json();

      if (stored.some(c => c.userID === data.client_user_id)) {
        setMsg('add-client-msg', 'That client is already on your list.', 'error');
        return;
      }

      // An empty name field means "name it for me" — unlike the old prompt(),
      // where hitting Cancel added the client anyway.
      const nickname = typedNick || `Client ${stored.length + 1}`;
      stored.push({
        userID: data.client_user_id, shareCode, nickname, addedAt: new Date().toISOString()
      });
      writeClients(stored);

      input.value = '';
      if (nickEl) nickEl.value = '';
      setMsg('add-client-msg', `${nickname} is on your list.`, 'ok');
      input.focus();
      fetchClients();

    } catch (error) {
      console.error('Add client error:', error);
      setMsg('add-client-msg', 'Could not reach the server. Try again in a moment.', 'error');
    }
  });
}

// ─────────────────────────────────────────────
// CLIENT FETCHING
// ─────────────────────────────────────────────
/* Refresh rate is the only thing the plans are sold on, and this dashboard
   ignored it: everyone polled every 3 seconds, so a free account got the
   real-time tier for nothing and the paid tiers bought no more than the
   pricing page's word for it. Poll at the rate the account actually has.

   If /subscription-status never answered, do not hand a paying trainer the
   free default — poll fast and let the next load settle it. */
function pollIntervalMs() {
  if (!subscriptionLoaded) return 10000;
  return Math.max(3000, (Number(subscriptionData.update_interval) || 300) * 1000);
}

function startClientsFetching() {
  fetchClients();
  if (clientsInterval) clearInterval(clientsInterval);
  const ms = pollIntervalMs();
  clientsInterval = setInterval(() => {
    try { RateLimiter.check('fetchData'); fetchClients(); }
    catch (err) { console.warn('Fetch rate limited, skipping tick'); }
  }, ms);
  console.log(`Dashboard auto-refresh: every ${ms / 1000}s`);
}

async function fetchClients() {
  if (!professionalLoggedIn || !currentProfessionalID) return;

  try {
    const clients = readClients();

    if (clients.length === 0) {
      updateDashboardStats({ client_count: 0 });
      updateClientsDisplay([]);
      return;
    }

    const clientDataPromises = clients.map(async (client, index) => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/latest?userID=${encodeURIComponent(client.userID)}`,
          { cache: 'no-store' }
        );
        if (response.ok) {
          const data    = await response.json();
          const isStale = checkIfStale(data.timestamp);
          const appType = data.appType || 'recovery';
          return {
            user_display:  escapeHtml(client.nickname || `Client ${index + 1}`),
            userID:        client.userID,
            stamina_score: data.staminaScore,
            color:         escapeHtml(data.color || ''),
            last_seen:     escapeHtml(data.timestamp || ''),
            status:        isStale ? 'disconnected' : (appType === 'workout' ? 'workout' : 'connected'),
            appType
          };
        } else {
          return {
            user_display:  escapeHtml(client.nickname || `Client ${index + 1}`),
            userID:        client.userID,
            stamina_score: 0,
            color:         'gray',
            last_seen:     'No recent data',
            status:        'disconnected',
            appType:       'recovery'
          };
        }
      } catch (error) {
        console.error(`Error fetching data for ${client.nickname}:`, error);
        return null;
      }
    });

    const clientData = (await Promise.all(clientDataPromises)).filter(c => c !== null);
    updateDashboardStats({ client_count: clientData.length });
    updateClientsDisplay(clientData);

  } catch (error) {
    console.error('Dashboard fetch error:', error);
  }
}

/* This had its own copy of the timestamp parser, and it was wrong in exactly
   the way irl-time.js exists to fix: setHours() stamps the server's Central
   wall-clock hours onto the VIEWER's timezone. A reading seconds old came out
   hours stale, so every client showed Disconnected to any trainer outside
   Central — while the card's own "Last Update" line, which already went
   through IRLTime, said the reading was current. One parser now. */
function checkIfStale(timestampStr) {
  if (!timestampStr || timestampStr === '--' || timestampStr === 'No recent data') return true;
  const age = window.IRLTime ? window.IRLTime.ageSeconds(timestampStr) : null;
  return age === null || age > STALE_AFTER_SECONDS;
}

function updateDashboardStats(data) {
  document.getElementById('client-count').textContent = data.client_count || 0;
  document.getElementById('last-refresh').textContent =
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateClientsDisplay(clients) {
  const container = document.getElementById('clients-container');

  if (clients.length === 0) {
    container.innerHTML = `
      <div class="no-clients">
        <h3>No Clients Added Yet</h3>
        <p>Add your first client using their share code to start monitoring their health bar continuously.</p>
      </div>`;
    return;
  }

  container.innerHTML = clients.map((client, index) => {
    const statusDisplay = client.status === 'workout' ? 'Workout Active'
      : client.status.charAt(0).toUpperCase() + client.status.slice(1);
    const statusColor = client.status === 'workout' ? '#007AFF' : getStatusColor(client.status);

    return `
    <div class="client-stamina-card">
      <div class="card-header">
        <h3>${client.user_display}</h3>
        <div class="status-indicator">
          <div class="status-dot" style="background-color: ${statusColor};"></div>
          <span class="status-text">${statusDisplay}</span>
        </div>
      </div>
      <div class="stamina-display">
        <div class="stamina-container">
          <div class="stamina-bar-wrapper">
            <div class="stamina-bar">
              <div class="fill-bar" style="width: ${Math.min(100, Math.max(0, client.stamina_score))}%; background: ${getStaminaGradient(client.stamina_score)};">
                <div class="highlight-shine"></div>
              </div>
            </div>
            <div class="percentage-text">
              <span class="percentage-number">${client.stamina_score}</span>
              <span class="percentage-symbol">%</span>
            </div>
          </div>
        </div>
        <button class="details-toggle" onclick="toggleDetails('details-${index}', this)">
          <span>Details</span>
          <svg class="chevron" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 8L2 4h8L6 8z"/>
          </svg>
        </button>
        <div class="client-details" id="details-${index}">
          <div class="detail-item">
            <span class="detail-label">Last Update:</span>
            <span class="detail-value">${
              window.IRLTime && client.last_seen
                ? escapeHtml(window.IRLTime.relative(client.last_seen) + ' · ' + window.IRLTime.localTime(client.last_seen))
                : escapeHtml(client.last_seen || '—')
            }</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Health Zone:</span>
            <span class="detail-value">${client.color}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Data Source:</span>
            <span class="detail-value">${client.appType === 'workout' ? 'Workout App' : 'IRL Health Bar'}</span>
          </div>
          <button onclick="removeClient('${client.userID}')" class="remove-btn">Remove Client</button>
        </div>
      </div>
    </div>`;
  }).join('');

  expandedDetails.forEach(detailsId => {
    const el = document.getElementById(detailsId);
    if (!el) return;
    el.classList.add('expanded');
    const button = el.previousElementSibling;
    if (button?.classList.contains('details-toggle')) {
      const chevron = button.querySelector('.chevron');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
  });
}

function removeClient(userID) {
  if (!confirm('Remove this client from your dashboard?')) return;
  writeClients(readClients().filter(c => c.userID !== userID));
  setMsg('add-client-msg', '');
  fetchClients();
}

function getStatusColor(status) {
  if (status === 'connected' || status === 'workout') return '#34C759';
  if (status === 'disconnected') return '#FF9500';
  return '#8E8E93';
}

function getStaminaGradient(percentage) {
  if (percentage >= 91) return 'linear-gradient(90deg, #007AFF80, #007AFF)';
  if (percentage >= 86) return 'linear-gradient(90deg, #34C75980, #34C759)';
  if (percentage >= 76) return 'linear-gradient(90deg, #FFCC02, #34C759)';
  if (percentage >= 51) return 'linear-gradient(90deg, #FFCC02, #FFCC02)';
  if (percentage >= 40) return 'linear-gradient(90deg, #FFCC02, #FF9500)';
  if (percentage >= 30) return 'linear-gradient(90deg, #FF950080, #FF9500)';
  return 'linear-gradient(90deg, #FF384580, #FF3B30)';
}

function refreshClients() { checkSubscription(); fetchClients(); }

document.addEventListener('DOMContentLoaded', () => {
  // Share codes are printed uppercase in the app; names are not.
  document.getElementById('share-code-input')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
    setMsg('add-client-msg', '');
  });
});

function toggleDetails(detailsId, button) {
  const el      = document.getElementById(detailsId);
  const chevron = button.querySelector('.chevron');
  if (el.classList.contains('expanded')) {
    el.classList.remove('expanded');
    chevron.style.transform = 'rotate(0deg)';
    expandedDetails.delete(detailsId);
  } else {
    el.classList.add('expanded');
    chevron.style.transform = 'rotate(180deg)';
    expandedDetails.add(detailsId);
  }
}

// ─────────────────────────────────────────────
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// Required because this file is loaded as type="module"
// ─────────────────────────────────────────────
window.showSignIn      = showSignIn;
window.sendReset       = sendReset;
window.goToSignUp      = goToSignUp;
window.showAuthOptions = showAuthOptions;
window.professionalLogin = professionalLogin;
window.professionalSignUp = professionalSignUp;
window.showCreateAccount = showCreateAccount;
window.addClient       = addClient;
window.refreshClients  = refreshClients;
window.logout          = logout;
window.toggleMobileMenu = toggleMobileMenu;
window.toggleDetails   = toggleDetails;
window.removeClient    = removeClient;