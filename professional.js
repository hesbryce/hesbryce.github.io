// Professional Dashboard JavaScript

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

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

const subscriptionData = {
  tier: 'free',
  max_clients: 10,
  refresh_rate: 10000,
  update_interval: 300
};

const API_BASE_URL = 'https://stamina-api.onrender.com';

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
// RATE LIMITER
// ─────────────────────────────────────────────
const RateLimiter = {
  store: {},
  limits: {
    login:     { max: 5,  windowMs: 5 * 60 * 1000 },
    addClient: { max: 10, windowMs: 1 * 60 * 1000 },
    fetchData: { max: 60, windowMs: 1 * 60 * 1000 },
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
  if (user) {
    currentProfessionalID = user.uid;
    currentUserEmail      = user.email;
    professionalLoggedIn  = true;

    updateHeroCopy(true);
    showDashboard();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      showPaymentSuccessMessage();
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    await loadSubscriptionFromBackend();
    startClientsFetching();

  } else {
    currentProfessionalID = null;
    currentUserEmail      = null;
    professionalLoggedIn  = false;

    if (clientsInterval) { clearInterval(clientsInterval); clientsInterval = null; }

    updateHeroCopy(false);
    showLogin();
  }
});

// ─────────────────────────────────────────────
// SUBSCRIPTION
// ─────────────────────────────────────────────
async function loadSubscriptionFromBackend() {
  try {
    const response = await authFetch(`${API_BASE_URL}/professional/subscription-status`);
    if (!response.ok) { console.error('Failed to load subscription:', response.status); return; }
    const subscription = await response.json();
    subscriptionData.tier            = subscription.tier || 'free';
    subscriptionData.max_clients     = subscription.max_clients || 10;
    subscriptionData.update_interval = subscription.update_interval || 300;
    updateSubscriptionUI(subscription);
    localStorage.setItem('subscription', JSON.stringify(subscription));
  } catch (error) {
    console.error('Error loading subscription:', error);
  }
}

function updateSubscriptionUI(subscription) {
  const tierElement = document.getElementById('subscription-tier');
  if (tierElement) {
    tierElement.textContent = subscription.tier.toUpperCase();
    tierElement.className   = `tier-badge tier-${subscription.tier}`;
  }
  const limitElement = document.getElementById('client-limit');
  if (limitElement) limitElement.textContent = subscription.max_clients;
  const bannerElement = document.getElementById('subscription-banner');
  if (bannerElement) {
    bannerElement.style.display = (subscription.has_subscription && subscription.tier !== 'free') ? 'none' : 'flex';
  }
  const refreshRateElement = document.getElementById('refresh-rate');
  if (refreshRateElement) refreshRateElement.textContent = getIntervalText(subscription.update_interval);
}

function getIntervalText(intervalSeconds) {
  if (intervalSeconds <= 10)  return 'Real-time (10s)';
  if (intervalSeconds <= 30)  return 'Fast (30s)';
  if (intervalSeconds <= 90)  return 'Standard (90s)';
  if (intervalSeconds <= 300) return 'Free (5min)';
  return `Every ${intervalSeconds}s`;
}

// ─────────────────────────────────────────────
// UI STATE
// ─────────────────────────────────────────────
function showLogin() {
  document.getElementById('professional-auth').style.display     = 'block';
  document.getElementById('sign-in-form').style.display          = 'none';
  document.getElementById('professional-dashboard').style.display = 'none';
  updateHeroCopy(false);
}

function showAuthOptions() {
  document.getElementById('professional-auth').style.display     = 'block';
  document.getElementById('sign-in-form').style.display          = 'none';
  document.getElementById('professional-dashboard').style.display = 'none';
}

function showSignIn() {
  document.getElementById('professional-auth').style.display     = 'none';
  document.getElementById('sign-in-form').style.display          = 'block';
  document.getElementById('professional-dashboard').style.display = 'none';
}

function goToSignUp() {
  window.location.href = '/payment/index.html';
}

function showDashboard() {
  document.getElementById('professional-auth').style.display     = 'none';
  document.getElementById('sign-in-form').style.display          = 'none';
  document.getElementById('professional-dashboard').style.display = 'block';
  updateHeroCopy(true);
}

function updateHeroCopy(isLoggedIn) {
  const heroTitle    = document.getElementById('hero-title');
  const heroSubtitle = document.getElementById('hero-subtitle');
  if (isLoggedIn) {
    heroTitle.textContent    = "Monitor Your Clients' Health Bars";
    heroSubtitle.textContent = 'Add clients using share codes from the IRL Health Bar app.';
  } else {
    heroTitle.textContent    = 'Professional Dashboard';
    heroSubtitle.textContent = "Sign in to monitor your clients' health data in real-time.";
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
async function professionalLogin() {
  try { RateLimiter.check('login'); } catch (err) { alert(err.message); return; }

  const email    = document.getElementById('email-input').value.trim().toLowerCase();
  const password = document.getElementById('password-input').value;

  if (!email || !password) { alert('Please enter both email and password'); return; }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles all UI changes from here
  } catch (error) {
    console.error('Login error:', error.code);
    if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(error.code)) {
      alert('Incorrect email or password.');
    } else if (error.code === 'auth/too-many-requests') {
      alert('Too many attempts. Please try again later.');
    } else {
      alert('Login failed. Please try again.');
    }
  }
}

async function professionalSignUp() {
  const email    = document.getElementById('email-input').value.trim().toLowerCase();
  const password = document.getElementById('password-input').value;

  if (!email || !password) { alert('Please enter both email and password'); return; }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles all UI changes from here
  } catch (error) {
    console.error('Sign up error:', error.code);
    if (error.code === 'auth/email-already-in-use') {
      alert('An account with this email already exists. Please sign in instead.');
    } else if (error.code === 'auth/weak-password') {
      alert('Password must be at least 6 characters.');
    } else {
      alert('Sign up failed. Please try again.');
    }
  }
}

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
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
async function addClient() {
  try { RateLimiter.check('addClient'); } catch (err) { alert(err.message); return; }

  const input     = document.getElementById('share-code-input');
  const shareCode = input.value.trim().toUpperCase();

  if (!shareCode || shareCode.length !== 8) { alert('Please enter a valid 8-character share code'); return; }
  if (!professionalLoggedIn) { alert('Please login first'); return; }

  try {
    const response = await authFetch(`${API_BASE_URL}/professional/add-client-by-code`, {
      method: 'POST',
      body:   JSON.stringify({ share_code: shareCode })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.detail || 'Failed to add client'}`);
      return;
    }

    const data             = await response.json();
    const professionalData = JSON.parse(
      localStorage.getItem(`prof_${currentProfessionalID}`) || '{"clients":[]}'
    );

    if (professionalData.clients.some(c => c.userID === data.client_user_id)) {
      alert('This client is already in your monitoring list'); return;
    }
    if (professionalData.clients.length >= subscriptionData.max_clients) {
      alert(`You've reached your client limit (${subscriptionData.max_clients}). Upgrade your plan to add more clients.`); return;
    }

    const nickname = prompt('Enter a nickname for this client (optional):') || `Client ${professionalData.clients.length + 1}`;

    professionalData.clients.push({
      userID: data.client_user_id, shareCode, nickname, addedAt: new Date().toISOString()
    });

    localStorage.setItem(`prof_${currentProfessionalID}`, JSON.stringify(professionalData));
    input.value = '';
    alert(`Added ${nickname} successfully! Update interval: ${data.update_interval_seconds}s`);
    fetchClients();

  } catch (error) {
    console.error('Add client error:', error);
    alert('Error adding client. Please try again.');
  }
}

// ─────────────────────────────────────────────
// CLIENT FETCHING
// ─────────────────────────────────────────────
function startClientsFetching() {
  fetchClients();
  if (clientsInterval) clearInterval(clientsInterval);
  clientsInterval = setInterval(() => {
    try { RateLimiter.check('fetchData'); fetchClients(); }
    catch (err) { console.warn('Fetch rate limited, skipping tick'); }
  }, 3000);
  console.log('Dashboard auto-refresh: every 3 seconds');
}

async function fetchClients() {
  if (!professionalLoggedIn || !currentProfessionalID) return;

  try {
    const professionalData = JSON.parse(
      localStorage.getItem(`prof_${currentProfessionalID}`) || '{"clients":[]}'
    );

    if (professionalData.clients.length === 0) {
      updateDashboardStats({ client_count: 0 });
      updateClientsDisplay([]);
      return;
    }

    const clientDataPromises = professionalData.clients.map(async (client, index) => {
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

function checkIfStale(timestampStr) {
  if (!timestampStr || timestampStr === '--' || timestampStr === 'No recent data') return true;
  try {
    const match = timestampStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s?(AM|PM)/i);
    if (!match) return true;
    const [, hours, minutes, seconds, ampm] = match;
    const now = new Date(), dataTime = new Date();
    let hour24 = parseInt(hours);
    if (ampm.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
    else if (ampm.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
    dataTime.setHours(hour24, parseInt(minutes), parseInt(seconds), 0);
    if (dataTime > now) dataTime.setDate(dataTime.getDate() - 1);
    return (now - dataTime) / (1000 * 60) > 10;
  } catch (error) {
    console.error('Error parsing timestamp:', error);
    return true;
  }
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
              <div class="fill-bar" style="width: ${Math.max(client.stamina_score, 20)}%; background: ${getStaminaGradient(client.stamina_score)};">
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
            <span class="detail-value">${client.last_seen}</span>
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
  if (!confirm('Remove this client from your monitoring list?')) return;
  const professionalData = JSON.parse(
    localStorage.getItem(`prof_${currentProfessionalID}`) || '{"clients":[]}'
  );
  professionalData.clients = professionalData.clients.filter(c => c.userID !== userID);
  localStorage.setItem(`prof_${currentProfessionalID}`, JSON.stringify(professionalData));
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
  document.getElementById('share-code-input')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
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