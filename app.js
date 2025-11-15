let currentUpdateInterval = 5000; 
let isLoading = true;
let shimmerX = -120;
let shimmerInterval = null;
let currentUserID = localStorage.getItem('staminaUserID') || null;
let currentFriendlyID = localStorage.getItem('staminaFriendlyID') || null;
let fetchInterval = null;
let currentShareCode = null;
let consecutiveErrors = 0;
let lastSuccessfulFetch = null;

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

// Initialize the page based on stored credentials
async function initializePage() {
  if (currentUserID && currentFriendlyID) {
    // Validate the stored userID is still valid
    try {
      const response = await fetch(`https://stamina-api.onrender.com/latest?userID=${encodeURIComponent(currentUserID)}`, {
        cache: "no-store"
      });
      
      if (response.ok || response.status === 404) {
        // Valid userID (404 just means no data yet)
        showStaminaDisplay();
        await fetchUserMonitoringStatus();
        startDataFetching();
        loadExistingShareCode();
      } else {
        // Invalid userID, clear storage and show input
        console.log('Stored userID is invalid, clearing...');
        disconnectUser();
      }
    } catch (error) {
      console.error('Error validating stored userID:', error);
      disconnectUser();
    }
  } else if (currentFriendlyID && !currentUserID) {
    // We have a friendly ID but no userID - try to resolve it
    try {
      const encodedFriendlyID = encodeURIComponent(currentFriendlyID);
      const response = await fetch(`https://stamina-api.onrender.com/resolve-friendly-id/${encodedFriendlyID}`);
      
      if (response.ok) {
        const data = await response.json();
        currentUserID = data.userID;  // Changed from data.user_id
        localStorage.setItem('staminaUserID', currentUserID);
        showStaminaDisplay();
        await fetchUserMonitoringStatus();
        startDataFetching();
        loadExistingShareCode();
      } else {
        // Can't resolve, clear and show input
        console.log('Cannot resolve friendly ID, clearing...');
        disconnectUser();
      }
    } catch (error) {
      console.error('Error resolving friendly ID:', error);
      disconnectUser();
    }
  } else {
    showUserInput();
  }
}

// Call initialization
initializePage();

function showUserInput() {
  document.getElementById('user-input-section').style.display = 'block';
  document.getElementById('stamina-display').style.display = 'none';
  if (fetchInterval) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
}

function showStaminaDisplay() {
  document.getElementById('user-input-section').style.display = 'none';
  document.getElementById('stamina-display').style.display = 'block';
  startShimmer();
}

function toggleShareSection() {
  const content = document.getElementById('share-content');
  const icon = document.getElementById('toggle-icon');
  const isExpanded = content.classList.contains('expanded');
  if (isExpanded) {
    content.classList.remove('expanded');
    icon.classList.remove('expanded');
  } else {
    content.classList.add('expanded');
    icon.classList.add('expanded');
  }
}

async function connectUser() {
  const input = document.getElementById('userID-input');
  const friendlyID = input.value.trim().toUpperCase();

  if (!friendlyID || friendlyID.length !== 8) {
    alert('Please enter a valid 8-character Share Code');
    return;
  }

  try {
    const encodedFriendlyID = encodeURIComponent(friendlyID);
    const response = await fetch(`https://stamina-api.onrender.com/resolve-friendly-id/${encodedFriendlyID}`);
    if (response.status === 410) {
      alert('This Share Code has expired. Please get a new one from the app settings.');
      return;
    }
    if (!response.ok) {
      alert('Share Code not found. Please check and try again.');
      return;
    }
    const data = await response.json();
    currentUserID = data.userID;  // Changed from data.user_id
    currentFriendlyID = friendlyID;
    localStorage.setItem('staminaUserID', currentUserID);
    localStorage.setItem('staminaFriendlyID', friendlyID);
    showStaminaDisplay();
    await fetchUserMonitoringStatus();
    startDataFetching();
    loadExistingShareCode();
  } catch (error) {
    alert('Failed to connect: ' + error.message);
  }
}

function disconnectUser() {
  currentUserID = null;
  currentFriendlyID = null;
  currentShareCode = null;
  localStorage.removeItem('staminaUserID');
  localStorage.removeItem('staminaFriendlyID');
  showUserInput();
  updateStatus('Not Connected');
  document.getElementById('score').textContent = '--';
  stopShimmer();
  if (fetchInterval) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
  document.getElementById('stamina-bar').classList.remove('background-bar');
  document.getElementById('stamina-bar').classList.add('loading-bar');
  document.getElementById('loading-label').style.display = 'block';
  document.getElementById('loading-label').style.opacity = '1';
  document.getElementById('shimmer').style.display = 'block';
  document.getElementById('shimmer').style.opacity = '1';
  document.getElementById('userID-input').value = '';
  isLoading = true;
  document.getElementById('share-code-display').style.display = 'none';
  document.getElementById('generate-share-btn').style.display = 'block';
}

async function fetchUserMonitoringStatus() {
  if (!currentUserID) return;

  try {
    const res = await fetch(`https://stamina-api.onrender.com/user-monitoring-status?userID=${encodeURIComponent(currentUserID)}`);
    if (!res.ok) {
      console.error('Failed to fetch monitoring status:', res.status);
      currentUpdateInterval = 5000;
      return;
    }
    const data = await res.json();
    const isMonitoring = data.is_monitoring || false;
    const isPremium = data.is_premium || false;
    if (isMonitoring) {
      currentUpdateInterval = 10000;
      console.log(currentUpdateInterval);
    } else if (isPremium) {
      currentUpdateInterval = 60000;
      console.log(currentUpdateInterval);
    } else {
      currentUpdateInterval = 300000;
      console.log(currentUpdateInterval);
    }
  } catch (err) {
    console.error('Error fetching monitoring status:', err);
    currentUpdateInterval = 5000;
  }
}

function startDataFetching() {
  if (fetchInterval) {
    clearInterval(fetchInterval);
  }
  fetchLatest();
  fetchInterval = setInterval(fetchLatest, currentUpdateInterval);
}

async function loadExistingShareCode() {
  if (!currentUserID) return;

  try {
    const response = await fetch(`https://stamina-api.onrender.com/get-share-code?userID=${encodeURIComponent(currentUserID)}`);
    
    if (response.status === 404) {
      document.getElementById('share-code-display').style.display = 'none';
      document.getElementById('generate-share-btn').style.display = 'block';
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to load share code');
    }

    const data = await response.json();
    if (data.share_code) {
      currentShareCode = data.share_code;
      displayShareCode(data.share_code);
    } else {
      document.getElementById('share-code-display').style.display = 'none';
      document.getElementById('generate-share-btn').style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading share code:', error);
  }
}

async function generateShareCode() {
  if (!currentUserID) {
    alert('Please connect first');
    return;
  }

  try {
    const response = await fetch('https://stamina-api.onrender.com/generate-share-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: currentUserID
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate share code');
    }

    const data = await response.json();
    currentShareCode = data.share_code;
    displayShareCode(data.share_code);
  } catch (error) {
    alert('Failed to generate share code: ' + error.message);
  }
}

function displayShareCode(code) {
  document.getElementById('share-code-text').textContent = code;
  document.getElementById('share-code-display').style.display = 'block';
  document.getElementById('generate-share-btn').style.display = 'none';
}

function copyShareCode() {
  if (!currentShareCode) return;

  const textElement = document.getElementById('share-code-text');
  
  navigator.clipboard.writeText(currentShareCode).then(() => {
    const originalText = textElement.textContent;
    textElement.textContent = 'Copied!';
    textElement.style.color = '#34C759';
    
    setTimeout(() => {
      textElement.textContent = originalText;
      textElement.style.color = '';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    alert('Failed to copy code');
  });
}

function startShimmer() {
  if (shimmerInterval) return;
  shimmerInterval = setInterval(() => {
    shimmerX += 4;
    if (shimmerX > 120) shimmerX = -120;
    const shimmer = document.getElementById('shimmer');
    if (shimmer) {
      shimmer.style.left = `${shimmerX}%`;
    }
  }, 30);
}

function stopShimmer() {
  if (shimmerInterval) {
    clearInterval(shimmerInterval);
    shimmerInterval = null;
  }
}

function startPulse() {
  const fillBar = document.getElementById('fill-bar');
  if (fillBar) {
    fillBar.classList.add('pulse');
  }
}

function parseTimestamp(timestampStr) {
  if (!timestampStr || timestampStr === '--') return null;

  const match = timestampStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s?(AM|PM)\s?CST/i);
  if (!match) return null;

  const [, hours, minutes, seconds, ampm] = match;
  const now = new Date();
  const timestamp = new Date();

  let hour24 = parseInt(hours);
  if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
    hour24 = 0;
  }

  timestamp.setHours(hour24);
  timestamp.setMinutes(parseInt(minutes));
  timestamp.setSeconds(parseInt(seconds));
  timestamp.setMilliseconds(0);

  if (timestamp > now) {
    timestamp.setDate(timestamp.getDate() - 1);
  }

  return timestamp;
}

function isDataStale(timestamp) {
  if (!timestamp) return false;

  const dataTime = parseTimestamp(timestamp);
  if (!dataTime) return false;

  const now = new Date();
  const minutesSinceUpdate = (now - dataTime) / (1000 * 60);

  // Use tier-based staleness detection
  // Free tier: 5 min interval + 2 min grace = 7 minutes before "disconnected"
  // Premium tier: 1 min interval + 1 min grace = 2 minutes
  // Pro tier: 10 sec interval + 30 sec grace = 40 seconds
  const staleThreshold = Math.max((currentUpdateInterval / 1000 / 60) * 1.4, 2);
  
  return minutesSinceUpdate > staleThreshold;
}

function getGradientColors(percentage) {
  if (percentage >= 91) return ['#007AFF80', '#007AFF'];
  if (percentage >= 86) return ['#34C75980', '#34C759'];
  if (percentage >= 76) return ['#FFCC02', '#34C759'];
  if (percentage >= 51) return ['#FFCC02', '#FFCC02'];
  if (percentage >= 40) return ['#FFCC02', '#FF9500'];
  if (percentage >= 30) return ['#FF950080', '#FF9500'];
  return ['#FF384580', '#FF3B30'];
}

function updateStaminaBar(percentage) {
  const minFillFraction = 0.2;
  const displayFrac = Math.max(Math.min(percentage / 100, 1), minFillFraction);
  const colors = getGradientColors(percentage);
  const fillBar = document.getElementById('fill-bar');
  const staminaBar = document.getElementById('stamina-bar');
  const loadingLabel = document.getElementById('loading-label');

  if (isLoading) {
    isLoading = false;
    stopShimmer();

    setTimeout(() => {
      staminaBar.classList.remove('loading-bar');
      staminaBar.classList.add('background-bar');
      loadingLabel.style.opacity = '0';
      document.getElementById('shimmer').style.opacity = '0';

      setTimeout(() => {
        loadingLabel.style.display = 'none';
        document.getElementById('shimmer').style.display = 'none';
        startPulse();
      }, 300);
    }, 100);
  }

  requestAnimationFrame(() => {
    fillBar.style.width = `${displayFrac * 100}%`;
    fillBar.style.background = `linear-gradient(90deg, ${colors[0]}, ${colors[1]})`;
  });
}

function updateStatus(status, timestamp = null) {
  const statusElement = document.getElementById('status');
  const statusDot = document.getElementById('status-dot');
  const statusTimestamp = document.getElementById('status-timestamp');

  if (statusElement.textContent !== status) {
    statusElement.textContent = status;
  }

  // Update timestamp display with "Last Seen" or "Updated"
  if (timestamp) {
    const relativeTime = getRelativeTime(timestamp);
    
    if (status === 'Connected') {
      // Show when data was last updated
      statusTimestamp.textContent = `Updated ${relativeTime}`;
    } else if (status === 'Disconnected') {
      // Show when we last saw them
      statusTimestamp.textContent = `Last seen ${relativeTime}`;
    } else {
      // For other statuses, just show the time
      statusTimestamp.textContent = relativeTime;
    }
    statusTimestamp.style.display = 'block';
  } else {
    statusTimestamp.style.display = 'none';
  }

  let color = '#8E8E93';
  if (status === 'Connected') color = '#34C759';
  else if (status === 'Loading...') color = '#FFCC02';
  else if (status === 'Disconnected') color = '#FF9500';
  else if (status === 'Connection Error') color = '#FF3B30';
  else if (status === 'Session Ended') color = '#FF3B30';
  else if (status === 'No data available') color = '#8E8E93';

  statusDot.style.backgroundColor = color;
}

function formatTimestamp(timestampStr) {
  if (!timestampStr || timestampStr === '--') return '';

  // Parse the timestamp (format: "HH:MM:SS AM/PM CST")
  const match = timestampStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s?(AM|PM)/i);
  if (!match) return timestampStr;

  const [, hours, minutes, , ampm] = match;
  
  // Return formatted time without seconds
  return `${hours}:${minutes} ${ampm}`;
}

function getRelativeTime(timestampStr) {
  const dataTime = parseTimestamp(timestampStr);
  if (!dataTime) return '';

  const now = new Date();
  const diffMs = now - dataTime;
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return formatTimestamp(timestampStr);
}

async function fetchLatest() {
  if (!currentUserID) {
    updateStatus('No user connected');
    return;
  }

  try {
    const res = await fetch(`https://stamina-api.onrender.com/latest?userID=${encodeURIComponent(currentUserID)}`, {
      cache: "no-store"
    });

    if (res.status === 404) {
      updateStatus('No data available');
      document.getElementById("score").textContent = "--";
      consecutiveErrors = 0; // Reset error count for 404s
      return;
    }

    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    
    const d = await res.json();
    
    // Reset error counter on successful fetch
    consecutiveErrors = 0;
    lastSuccessfulFetch = new Date();

    if (isDataStale(d.timestamp)) {
      updateStatus('Disconnected', d.timestamp);
    } else {
      updateStatus('Connected', d.timestamp);
    }

    document.getElementById("score").textContent = d.staminaScore ?? "--";
    updateStaminaBar(parseInt(d.staminaScore) || 0);

  } catch (err) {
    consecutiveErrors++;
    console.error('Fetch error:', err);
    
    // If multiple consecutive errors, likely a real connection issue
    if (consecutiveErrors >= 3) {
      updateStatus('Connection Error');
    } else {
      // Keep previous status for transient errors
      console.log('Transient error, retrying...');
    }
  }
}