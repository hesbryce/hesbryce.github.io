const API_BASE_URL = 'https://stamina-api.onrender.com'; 

// Per client, per month. The old 0.03/0.02/0.01 were test values left in from
// trialling checkout for free — they billed a 20-client trainer 60 cents a
// month, and the page's own placeholder ($1.00) already disagreed with them.
const PRICING_RATES = {
  realtime: 3.00,
  fast: 2.00,
  standard: 1.00
};

// Checked against the API's own OpenAPI spec: CheckoutRequest takes exactly
// professional_email, client_count, update_frequency, update_interval_seconds
// and monthly_price. This field is dropped on arrival, so NO trial is applied
// today and nothing in the UI promises one. It is sent so the front end is
// ready the moment that service accepts it.
const TRIAL_PERIOD_DAYS = 49;

const UPDATE_INTERVALS = {
  realtime: 3,
  fast: 30,
  standard: 90
};

let professionalEmail = '';
let selectedFrequency = 'realtime';
let clientCount = 3;

function toggleMobileMenu() {
  const hamburger = document.getElementById('hamburger-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  const menu = document.getElementById('mobile-menu');
  
  hamburger.classList.toggle('active');
  overlay.classList.toggle('active');
  menu.classList.toggle('active');
  
  if (menu.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
}

window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.modern-navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ========== EMAIL VALIDATION & NAVIGATION ==========

/**
 * The email step used to stand in front of the prices. It is now a field on the
 * calculator, read when someone actually checks out.
 */
function readEmail() {
  const input = document.getElementById('professional-email-input');
  const email = (input ? input.value : '').trim();
  if (!email || !email.includes('@') || !email.includes('.')) return '';
  professionalEmail = email;
  localStorage.setItem('professionalEmail', email);
  return email;
}

// Show the price as soon as the page is readable, and bring back an address
// this browser has used before.
(function initCalculator() {
  function start() {
    const saved = localStorage.getItem('professionalEmail');
    const input = document.getElementById('professional-email-input');
    if (saved && input && !input.value) input.value = saved;
    updatePricing();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

// ========== PRICING CALCULATION ==========
function updatePricing() {
  const slider = document.getElementById('client-count-slider');
  clientCount = parseInt(slider.value);
  document.getElementById('client-count-display').textContent = clientCount;
  
  const pricePerClient = PRICING_RATES[selectedFrequency];
  const totalPrice = (clientCount * pricePerClient).toFixed(2);

  document.getElementById('total-price').textContent = `$${totalPrice}`;
  
  const frequencyNames = {
    realtime: 'Real-time updates (3s)',
    fast: 'Fast updates (30s)',
    standard: 'Standard updates (90s)'
  };
  
  const breakdown = `${clientCount} client${clientCount !== 1 ? 's' : ''} × ${frequencyNames[selectedFrequency]}`;
  document.getElementById('price-breakdown').textContent = breakdown;
}

/**
 * Select update frequency
 * @param {string} frequency - 'realtime', 'fast', or 'standard'
 */
function selectFrequency(frequency) {
  console.log('🎛️ Frequency selected:', frequency);
  
  selectedFrequency = frequency;
  
  // Update UI - remove 'selected' class from all options
  document.querySelectorAll('.frequency-option').forEach(option => {
    option.classList.remove('selected');
  });
  
  // Add 'selected' class to clicked option
  const selectedOption = document.querySelector(`[data-frequency="${frequency}"]`);
  if (selectedOption) {
    selectedOption.classList.add('selected');
  }
  
  // Recalculate pricing
  updatePricing();
}

// ========== STRIPE CHECKOUT ==========

/**
 * Proceed to Stripe checkout with custom pricing
 */
async function proceedToCheckout() {
  console.log('🚀 Starting checkout process...');
  
  // Validate email is set
  if (!readEmail()) {
    const input = document.getElementById('professional-email-input');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
    return;
  }
  
  // Disable button during API call
  const checkoutBtn = document.getElementById('checkout-btn');
  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Creating checkout session...';
  
  try {
    // Calculate final price
    const pricePerClient = PRICING_RATES[selectedFrequency];
    const totalPrice = clientCount * pricePerClient;
    const updateInterval = UPDATE_INTERVALS[selectedFrequency];
    
    console.log('📦 Checkout data:', {
      email: professionalEmail,
      clientCount,
      frequency: selectedFrequency,
      interval: updateInterval,
      price: totalPrice
    });
    
    // Call backend to create Stripe Checkout Session
    console.log(`📡 Calling API: ${API_BASE_URL}/create-checkout-session`);
    
    const response = await fetch(`${API_BASE_URL}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        professional_email: professionalEmail,
        client_count: clientCount,
        update_frequency: selectedFrequency,
        update_interval_seconds: updateInterval,
        monthly_price: totalPrice,
        trial_period_days: TRIAL_PERIOD_DAYS
      })
    });
    
    console.log('📨 Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('❌ API error:', errorData);
      throw new Error(errorData.detail || 'Failed to create checkout session');
    }
    
    const data = await response.json();
    console.log('✅ Checkout session created:', data.session_id);
    console.log('🔗 Checkout URL:', data.checkout_url);
    
    // Redirect to Stripe Checkout
    if (data.checkout_url) {
      console.log('🔀 Redirecting to Stripe...');
      window.location.href = data.checkout_url;
    } else {
      throw new Error('No checkout URL received');
    }
    
  } catch (error) {
    console.error('❌ Checkout error:', error);
    
    // Show user-friendly error message
    let errorMessage = 'Failed to create checkout session. Please try again.';
    
    if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Cannot connect to server. Please check your internet connection.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    alert(errorMessage);
    
    // Re-enable button
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = 'Subscribe Now';
  }
}

// ========== INITIALIZATION ==========
window.onload = function() {
  // Focus email input if on first screen
  const emailInput = document.getElementById('professional-email-input');
  if (emailInput) {
    emailInput.focus();
    const savedEmail = localStorage.getItem('professionalEmail');
    if (savedEmail) {
      emailInput.value = savedEmail;
    }
  }
  const slider = document.getElementById('client-count-slider');
  if (slider) {
    slider.addEventListener('input', updatePricing);
  }
};