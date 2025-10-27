// Payment Page JavaScript for IRL Health Bar Professional Plans

// Stripe Payment Links (LIVE MODE)
const PAYMENT_LINKS = {
    basic: 'https://buy.stripe.com/8wM3cv8g980h6u06380Fi00',
    premium: 'https://buy.stripe.com/3cI3cv2VP5S96u0crw0Fi02'
  };
  
  let professionalEmail = '';
  
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
  
  /**
   * Proceed to pricing plans after email validation
   */
  function proceedToPlans() {
    const emailInput = document.getElementById('professional-email-input');
    const email = emailInput.value.trim();
  
    if (!email || !email.includes('@') || !email.includes('.')) {
      alert('Please enter a valid email address');
      return;
    }
  
    professionalEmail = email;
    localStorage.setItem('professionalEmail', email);

    document.getElementById('professional-id-section').style.display = 'none';
    document.getElementById('pricing-plans').style.display = 'block';
  }
  
  function goBack() {
    document.getElementById('professional-id-section').style.display = 'block';
    document.getElementById('pricing-plans').style.display = 'none';
  }
  
  /**
   * Select a pricing plan and redirect to Stripe checkout
   * @param {string} planType - Either 'basic' or 'premium'
   */
  function selectPlan(planType) {
    if (!professionalEmail) {
      alert('Please enter your email first');
      goBack();
      return;
    }
  
    // Redirect directly to Stripe Payment Link
    window.location.href = PAYMENT_LINKS[planType];
  }

  window.onload = function () {
    const emailInput = document.getElementById('professional-email-input');
    if (emailInput) {
      emailInput.focus();
    }
  };