// Professional Dashboard JavaScript

let professionalLoggedIn = false;
let currentProfessionalID = null;
let clientsInterval = null;

const subscriptionData = {
  tier: 'free',
  max_clients: 10,
  refresh_rate: 10000
};

// Mobile menu toggle function
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

// Scroll navbar effect
window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.modern-navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// Check if professional is logged in on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedEmail = localStorage.getItem('professionalEmail');
  const isLoggedIn = localStorage.getItem('isLoggedIn');
  
  if (savedEmail && isLoggedIn === 'true') {
    currentProfessionalID = btoa(savedEmail);
    professionalLoggedIn = true;
    showDashboard();
    checkSubscription();
    startClientsFetching();
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('professional-login').style.display = 'block';
  document.getElementById('professional-dashboard').style.display = 'none';
}

function showDashboard() {
  document.getElementById('professional-login').style.display = 'none';
  document.getElementById('professional-dashboard').style.display = 'block';
}

async function professionalLogin() {
  const email = document.getElementById('email-input').value.trim().toLowerCase();
  const password = document.getElementById('password-input').value;

  if (!email || !password) {
    alert('Please enter both email and password');
    return;
  }

  if (!email.includes('@')) {
    alert('Please enter a valid email address');
    return;
  }

  try {
    currentProfessionalID = btoa(email);
    
    const storedData = localStorage.getItem(`prof_${currentProfessionalID}`);
    if (storedData) {
      const data = JSON.parse(storedData);
      if (data.password !== password) {
        alert('Incorrect password');
        return;
      }
    } else {
      const professionalData = {
        email: email,
        password: password,
        clients: [],
        createdAt: new Date().toISOString()
      };
      localStorage.setItem(`prof_${currentProfessionalID}`, JSON.stringify(professionalData));
      console.log('✓ New professional account created');
    }

    localStorage.setItem('professionalEmail', email);
    localStorage.setItem('isLoggedIn', 'true');
    professionalLoggedIn = true;

    console.log('✓ Login successful');
    
    showDashboard();
    checkSubscription();
    startClientsFetching();

  } catch (error) {
    console.error('Login error:', error);
    alert('Login failed. Please try again.');
  }
}

function checkSubscription() {
  const bannerElement = document.getElementById('subscription-banner');
  const tierElement = document.getElementById('subscription-tier');
  const limitElement = document.getElementById('client-limit');

  if (subscriptionData.tier === 'free') {
    if (bannerElement) bannerElement.style.display = 'flex';
  } else {
    if (bannerElement) bannerElement.style.display = 'none';
  }

  if (tierElement) {
    tierElement.textContent = subscriptionData.tier.charAt(0).toUpperCase() + subscriptionData.tier.slice(1);
  }
  if (limitElement) {
    limitElement.textContent = subscriptionData.max_clients;
  }
}

function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  
  professionalLoggedIn = false;
  currentProfessionalID = null;
  localStorage.removeItem('professionalEmail');
  localStorage.removeItem('isLoggedIn');
  
  document.getElementById('professional-login').style.display = 'block';
  document.getElementById('professional-dashboard').style.display = 'none';
  
  if (clientsInterval) {
    clearInterval(clientsInterval);
    clientsInterval = null;
  }
}

async function addClient() {
  const input = document.getElementById('share-code-input');
  const shareCode = input.value.trim().toUpperCase();

  if (!shareCode || shareCode.length !== 8) {
    alert('Please enter a valid 8-character share code');
    return;
  }

  try {
    const response = await fetch(`https://stamina-api.onrender.com/verify-share-code?share_code=${encodeURIComponent(shareCode)}`);
    
    if (!response.ok) {
      alert('Invalid share code. Please check and try again.');
      return;
    }

    const data = await response.json();
    
    if (!data.valid) {
      alert('Share code not found. Please verify with your client.');
      return;
    }

    const professionalData = JSON.parse(
      localStorage.getItem(`prof_${currentProfessionalID}`) || '{"clients":[]}'
    );

    if (professionalData.clients.some(c => c.userID === data.userID)) {
      alert('This client is already in your monitoring list');
      return;
    }

    if (professionalData.clients.length >= subscriptionData.max_clients) {
      alert(`You've reached your client limit (${subscriptionData.max_clients}). Upgrade your plan to add more clients.`);
      return;
    }

    const nickname = prompt('Enter a nickname for this client (optional):') || `Client ${professionalData.clients.length + 1}`;
    
    professionalData.clients.push({
      userID: data.userID,
      shareCode: shareCode,
      nickname: nickname,
      addedAt: new Date().toISOString()
    });

    localStorage.setItem(`prof_${currentProfessionalID}`, JSON.stringify(professionalData));

    input.value = '';
    alert(`✓ ${nickname} added successfully!`);
    
    fetchClients();

  } catch (error) {
    console.error('Add client error:', error);
    alert('Error adding client. Please try again.');
  }
}

function startClientsFetching() {
  fetchClients();
  if (clientsInterval) clearInterval(clientsInterval);
  clientsInterval = setInterval(fetchClients, 10000);
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
    
    console.log(`📊 Fetching live data for ${professionalData.clients.length} clients...`);
    
    const clientDataPromises = professionalData.clients.map(async (client, index) => {
      try {
        const response = await fetch(
          `https://stamina-api.onrender.com/latest?userID=${encodeURIComponent(client.userID)}`, 
          { cache: "no-store" }
        );
        
        if (response.ok) {
          const data = await response.json();
          const isStale = checkIfStale(data.timestamp);
          
          return {
            user_display: client.nickname || `Client ${index + 1}`,
            userID: client.userID,
            stamina_score: data.staminaScore,
            color: data.color,
            last_seen: data.timestamp,
            status: isStale ? 'disconnected' : 'connected'
          };
        } else {
          return {
            user_display: client.nickname || `Client ${index + 1}`,
            userID: client.userID,
            stamina_score: 0,
            color: 'gray',
            last_seen: 'No recent data',
            status: 'disconnected'
          };
        }
      } catch (error) {
        console.error(`Error fetching data for ${client.nickname}:`, error);
        return null;
      }
    });
    
    const clientData = (await Promise.all(clientDataPromises)).filter(c => c !== null);
    
    updateDashboardStats({ 
      client_count: clientData.length
    });
    
    updateClientsDisplay(clientData);

  } catch (error) {
    console.error('Dashboard fetch error:', error);
  }
}

function checkIfStale(timestampStr) {
  if (!timestampStr || timestampStr === '--' || timestampStr === 'No recent data') {
    return true;
  }
  
  try {
    const match = timestampStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s?(AM|PM)/i);
    if (!match) return true;
    
    const [, hours, minutes, seconds, ampm] = match;
    const now = new Date();
    const dataTime = new Date();
    
    let hour24 = parseInt(hours);
    if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    
    dataTime.setHours(hour24, parseInt(minutes), parseInt(seconds), 0);
    
    if (dataTime > now) {
      dataTime.setDate(dataTime.getDate() - 1);
    }
    
    const minutesSinceUpdate = (now - dataTime) / (1000 * 60);
    
    return minutesSinceUpdate > 10;
    
  } catch (error) {
    console.error('Error parsing timestamp:', error);
    return true;
  }
}

function updateDashboardStats(data) {
  document.getElementById('client-count').textContent = data.client_count || 0;

  const now = new Date();
  document.getElementById('last-refresh').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateClientsDisplay(clients) {
  const container = document.getElementById('clients-container');

  if (clients.length === 0) {
    container.innerHTML = `
      <div class="no-clients">
        <h3>No Clients Added Yet</h3>
        <p>Add your first client using their share code to start monitoring their health bar continuously.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = clients.map(client => `
    <div class="client-stamina-card">
      <div class="card-header">
        <h3>${client.user_display}</h3>
        <div class="status-indicator">
          <div class="status-dot" style="background-color: ${getStatusColor(client.status)};"></div>
          <span class="status-text">${client.status.charAt(0).toUpperCase() + client.status.slice(1)}</span>
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
        <div class="client-info">
          <p><strong>Last Update:</strong> ${client.last_seen}</p>
          <p><strong>Health Zone:</strong> ${client.color}</p>
          <button onclick="removeClient('${client.userID}')" class="remove-btn">Remove Client</button>
        </div>
      </div>
    </div>
  `).join('');
}

function removeClient(userID) {
  if (!confirm('Remove this client from your monitoring list?')) return;
  
  const professionalData = JSON.parse(
    localStorage.getItem(`prof_${currentProfessionalID}`) || '{"clients":[]}'
  );
  
  professionalData.clients = professionalData.clients.filter(c => c.userID !== userID);
  
  localStorage.setItem(`prof_${currentProfessionalID}`, JSON.stringify(professionalData));
  
  console.log('🗑️ Client removed');
  
  fetchClients();
}

function getStatusColor(status) {
  if (status === 'connected') return '#34C759';
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

function refreshClients() {
  checkSubscription();
  fetchClients();
}

// Auto-uppercase share code input
document.addEventListener('DOMContentLoaded', () => {
  const shareCodeInput = document.getElementById('share-code-input');
  if (shareCodeInput) {
    shareCodeInput.addEventListener('input', function (e) {
      e.target.value = e.target.value.toUpperCase();
    });
  }
});