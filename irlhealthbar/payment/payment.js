// ========== CONFIGURATION ==========

// IMPORTANT: Change this to your deployed backend URL
const API_BASE_URL = 'https://stamina-api.onrender.com'; 

// Pricing rates per client per month
const PRICING_RATES = {
  realtime: 0.33,  // 10 second updates - 3 clients = $1/month
  fast: 0.25,      // 30 second updates
  standard: 0.17   // 90 second updates
};

// Update intervals in seconds
const UPDATE_INTERVALS = {
  realtime: 10,
  fast: 30,
  standard: 90
};

// ========== STATE MANAGEMENT ==========

let professionalEmail = '';
let selectedFrequency = 'realtime';
let clientCount = 3;

// ========== MOBILE MENU FUNCTIONS ==========

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

// ========== NAVBAR SCROLL EFFECT ==========

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
 * Proceed to pricing calculator after email validation
 */
function proceedToPlans() {
  const emailInput = document.getElementById('professional-email-input');
  const email = emailInput.value.trim();
  
  console.log('🔍 Validating email:', email);
  
  // Validate email
  if (!email || !email.includes('@') || !email.includes('.')) {
    alert('Please enter a valid email address');
    return;
  }
  
  // Store email
  professionalEmail = email;
  localStorage.setItem('professionalEmail', email);
  
  console.log('✅ Email validated:', email);
  console.log('📧 Stored email:', professionalEmail);
  
  // Show pricing calculator
  document.getElementById('professional-id-section').style.display = 'none';
  document.getElementById('pricing-calculator').style.display = 'block';
  
  // Initialize pricing display
  updatePricing();
  
  console.log('✅ Pricing calculator shown');
}

/**
 * Go back to email input
 */
function goBack() {
  console.log('⬅️ Going back to email input');
  document.getElementById('professional-id-section').style.display = 'block';
  document.getElementById('pricing-calculator').style.display = 'none';
}

// ========== PRICING CALCULATION ==========

/**
 * Update pricing display based on current selections
 */
function updatePricing() {
  // Get current client count from slider
  const slider = document.getElementById('client-count-slider');
  clientCount = parseInt(slider.value);
  
  // Update client count display
  document.getElementById('client-count-display').textContent = clientCount;
  
  // Calculate total price
  const pricePerClient = PRICING_RATES[selectedFrequency];
  const totalPrice = (clientCount * pricePerClient).toFixed(2);
  
  // Update price display
  document.getElementById('total-price').textContent = `$${totalPrice}`;
  
  // Update breakdown text
  const frequencyNames = {
    realtime: 'Real-time updates (10s)',
    fast: 'Fast updates (30s)',
    standard: 'Standard updates (90s)'
  };
  
  const breakdown = `${clientCount} client${clientCount !== 1 ? 's' : ''} × ${frequencyNames[selectedFrequency]}`;
  document.getElementById('price-breakdown').textContent = breakdown;
  
  console.log('💰 Pricing updated:', {
    clientCount,
    frequency: selectedFrequency,
    pricePerClient,
    totalPrice: `$${totalPrice}`
  });
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
  if (!professionalEmail) {
    console.error('❌ No email set');
    alert('Please enter your email first');
    goBack();
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
        monthly_price: totalPrice
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
  console.log('🎬 Payment page initialized');
  console.log('🔧 API Base URL:', API_BASE_URL);
  
  // Focus email input if on first screen
  const emailInput = document.getElementById('professional-email-input');
  if (emailInput) {
    emailInput.focus();
    
    // Check for saved email
    const savedEmail = localStorage.getItem('professionalEmail');
    if (savedEmail) {
      emailInput.value = savedEmail;
      console.log('📧 Restored saved email:', savedEmail);
    }
  }
  
  // Initialize slider listener
  const slider = document.getElementById('client-count-slider');
  if (slider) {
    slider.addEventListener('input', updatePricing);
    console.log('🎚️ Slider initialized');
  }
  
  // Log pricing configuration
  console.log('💰 Pricing rates:', PRICING_RATES);
  console.log('⏱️ Update intervals:', UPDATE_INTERVALS);
  
  console.log('✅ Initialization complete');
};

// ========== HELPER FUNCTIONS ==========

/**
 * Test backend connection
 */
async function testBackendConnection() {
  try {
    console.log('🧪 Testing backend connection...');
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Backend is healthy:', data);
    return true;
  } catch (error) {
    console.error('❌ Backend connection failed:', error);
    return false;
  }
}

// Make function available in console for debugging
window.testBackendConnection = testBackendConnection;

console.log('💡 Debug tip: Run testBackendConnection() in console to test your backend');