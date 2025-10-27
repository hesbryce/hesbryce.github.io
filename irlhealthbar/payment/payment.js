const API_BASE_URL = 'https://stamina-api.onrender.com'; // Your FastAPI backend

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

// State
let professionalEmail = '';
let selectedFrequency = 'realtime';
let clientCount = 3;

// ========== MOBILE MENU ==========
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

// ========== NAVBAR SCROLL ==========
window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.modern-navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ========== EMAIL VALIDATION ==========
/**
 * Proceed to pricing calculator after email validation
 */
function proceedToPlans() {
  const emailInput = document.getElementById('professional-email-input');
  const email = emailInput.value.trim();
  
  // Validate email
  if (!email || !email.includes('@') || !email.includes('.')) {
    alert('Please enter a valid email address');
    return;
  }
  
  // Store email
  professionalEmail = email;
  localStorage.setItem('professionalEmail', email);
  
  // Show pricing calculator
  document.getElementById('professional-id-section').style.display = 'none';
  document.getElementById('pricing-calculator').style.display = 'block';
  
  // Initialize pricing display
  updatePricing();
}

/**
 * Go back to email input
 */
function goBack() {
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
  
  document.getElementById('price-breakdown').textContent = 
    `${clientCount} client${clientCount !== 1 ? 's' : ''} × ${frequencyNames[selectedFrequency]}`;
}

/**
 * Select update frequency
 * @param {string} frequency - 'realtime', 'fast', or 'standard'
 */
function selectFrequency(frequency) {
  selectedFrequency = frequency;
  
  // Update UI
  document.querySelectorAll('.frequency-option').forEach(option => {
    option.classList.remove('selected');
  });
  event.target.closest('.frequency-option').classList.add('selected');
  
  // Recalculate pricing
  updatePricing();
}

// ========== CHECKOUT ==========
/**
 * Proceed to Stripe checkout with custom pricing
 */
async function proceedToCheckout() {
  if (!professionalEmail) {
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
    
    // Call backend to create Stripe Checkout Session
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
    
    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }
    
    const data = await response.json();
    
    // Redirect to Stripe Checkout
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      throw new Error('No checkout URL received');
    }
    
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Failed to create checkout session. Please try again.');
    
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
    
    // Check for saved email
    const savedEmail = localStorage.getItem('professionalEmail');
    if (savedEmail) {
      emailInput.value = savedEmail;
    }
  }
  
  // Initialize slider listener
  const slider = document.getElementById('client-count-slider');
  if (slider) {
    slider.addEventListener('input', updatePricing);
  }
};