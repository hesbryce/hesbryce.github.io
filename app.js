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

// Production mode - set to false to enable console logging for debugging
const PRODUCTION_MODE = true;

// Safe logging wrapper
const safeLog = {
  error: (...args) => !PRODUCTION_MODE && console.error(...args),
  warn: (...args) => !PRODUCTION_MODE && console.warn(...args),
  log: (...args) => !PRODUCTION_MODE && console.log(...args),
  info: (...args) => !PRODUCTION_MODE && console.info(...args)
};

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
        
        // CRITICAL: Fetch monitoring status FIRST to get correct update interval
        await fetchUserMonitoringStatus();
        
        // THEN start fetching with the correct interval
        startDataFetching();
        
        // Load share code (non-blocking)
        loadExistingShareCode();
      } else {
        // Invalid userID, clear storage and show input
        safeLog.log('Stored userID is invalid, clearing...');
        disconnectUser();
      }
    } catch (error) {
      safeLog.error('Error validating stored userID:', error);
      disconnectUser();
    }
  } else if (currentFriendlyID && !currentUserID) {
    // We have a friendly ID but no userID - try to resolve it
    try {
      const encodedFriendlyID = encodeURIComponent(currentFriendlyID);
      const response = await fetch(`https://stamina-api.onrender.com/resolve-friendly-id/${encodedFriendlyID}`);
      
      if (response.ok) {
        const data = await response.json();
        currentUserID = data.userID;
        localStorage.setItem('staminaUserID', currentUserID);
        showStaminaDisplay();
        
        // Fetch monitoring status FIRST
        await fetchUserMonitoringStatus();
        
        // Start fetching with correct interval
        startDataFetching();
        loadExistingShareCode();
      } else {
        // Can't resolve, clear and show input
        safeLog.log('Cannot resolve friendly ID, clearing...');
        disconnectUser();
      }
    } catch (error) {
      safeLog.error('Error resolving friendly ID:', error);
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
    currentUserID = data.userID;
    currentFriendlyID = friendlyID;
    localStorage.setItem('staminaUserID', currentUserID);
    localStorage.setItem('staminaFriendlyID', friendlyID);
    showStaminaDisplay();
    
    // Fetch monitoring status FIRST
    await fetchUserMonitoringStatus();
    
    // Start fetching with correct interval
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
  
  const shareCodeDisplay = document.getElementById('share-code-display');
  const generateShareBtn = document.getElementById('generate-share-btn');
  if (shareCodeDisplay) shareCodeDisplay.style.display = 'none';
  if (generateShareBtn) generateShareBtn.style.display = 'block';
}

async function fetchUserMonitoringStatus() {
  if (!currentUserID) return;

  try {
    // FIXED: Use the correct endpoint that actually exists in backend
    const res = await fetch(
      `https://stamina-api.onrender.com/user/monitoring-status-by-userid/${encodeURIComponent(currentUserID)}`,
      { cache: "no-store" }
    );
    
    if (!res.ok) {
      // Endpoint doesn't exist or error - use default free tier
      safeLog.error('Failed to fetch monitoring status:', res.status);
      currentUpdateInterval = 300000; // 5 minutes default
      return;
    }
    
    const data = await res.json();
    
    // CRITICAL: Backend returns update_interval in SECONDS, we need MILLISECONDS
    const updateIntervalSeconds = data.update_interval || 300;
    currentUpdateInterval = updateIntervalSeconds * 1000; // Convert to milliseconds
    
    safeLog.info(`✅ Subscription loaded: ${updateIntervalSeconds}s updates (${currentUpdateInterval}ms)`);
    safeLog.info(`   Tier: ${data.subscription_tier}`);
    safeLog.info(`   Real-time: ${data.real_time_enabled}`);
    safeLog.info(`   Is monitored: ${data.is_monitored}`);
    
  } catch (err) {
    safeLog.error('Error fetching monitoring status:', err);
    currentUpdateInterval = 300000; // Default to 5 minutes on error
  }
}

function startDataFetching() {
  // Clear any existing interval
  if (fetchInterval) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
  
  safeLog.info(`🔄 Starting data fetching with ${currentUpdateInterval}ms (${currentUpdateInterval/1000}s) interval`);
  
  // Fetch immediately
  fetchLatest();
  
  // Set up recurring fetch with correct interval
  fetchInterval = setInterval(fetchLatest, currentUpdateInterval);
}

async function loadExistingShareCode() {
  if (!currentUserID) return;

  // Wait a moment to ensure DOM is fully loaded
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check if share code UI elements exist on this page
  const shareCodeDisplay = document.getElementById('share-code-display');
  const generateShareBtn = document.getElementById('generate-share-btn');
  
  // If the UI doesn't exist on this page, don't make the API call at all
  if (!shareCodeDisplay && !generateShareBtn) {
    safeLog.log('Share code UI not present on this page, skipping API call');
    return;
  }

  try {
    // ADVANCED: First do a silent HEAD request to check if resource exists
    // This avoids the 404 showing up in console on GET requests
    const headResponse = await fetch(
      `https://stamina-api.onrender.com/get-share-code?user_id=${encodeURIComponent(currentUserID)}`,
      { 
        method: 'HEAD',
        cache: "no-store" 
      }
    ).catch(() => null); // Silently catch any errors
    
    // If HEAD request fails or returns 404, don't proceed with GET
    if (!headResponse || headResponse.status === 404) {
      safeLog.log('No existing share code found (HEAD check)');
      if (shareCodeDisplay) shareCodeDisplay.style.display = 'none';
      if (generateShareBtn) generateShareBtn.style.display = 'block';
      return;
    }

    // Only make the GET request if HEAD succeeded
    const response = await fetch(
      `https://stamina-api.onrender.com/get-share-code?user_id=${encodeURIComponent(currentUserID)}`,
      { cache: "no-store" }
    );
    
    if (response.status === 404) {
      safeLog.log('No existing share code found');
      if (shareCodeDisplay) shareCodeDisplay.style.display = 'none';
      if (generateShareBtn) generateShareBtn.style.display = 'block';
      return;
    }

    if (!response.ok) {
      safeLog.error('Failed to load share code:', response.status);
      return;
    }

    const data = await response.json();
    if (data.share_code) {
      currentShareCode = data.share_code;
      displayShareCode(data.share_code);
      safeLog.log('✅ Share code loaded');
    } else {
      if (shareCodeDisplay) shareCodeDisplay.style.display = 'none';
      if (generateShareBtn) generateShareBtn.style.display = 'block';
    }
  } catch (error) {
    safeLog.error('Error loading share code:', error);
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
    safeLog.error('Error generating share code:', error);
    alert('Failed to generate share code. Please try again.');
  }
}

function displayShareCode(code) {
  const shareCodeText = document.getElementById('share-code-text');
  if (shareCodeText) {
    shareCodeText.textContent = code;
  }
  
  const shareCodeDisplay = document.getElementById('share-code-display');
  const generateShareBtn = document.getElementById('generate-share-btn');
  if (shareCodeDisplay) shareCodeDisplay.style.display = 'block';
  if (generateShareBtn) generateShareBtn.style.display = 'none';
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
    safeLog.error('Failed to copy:', err);
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
    
    safeLog.log(`📊 Data fetched: ${d.staminaScore}% at ${d.timestamp}`);

  } catch (err) {
    consecutiveErrors++;
    safeLog.error('Fetch error:', err);
    
    // If multiple consecutive errors, likely a real connection issue
    if (consecutiveErrors >= 3) {
      updateStatus('Connection Error');
    } else {
      // Keep previous status for transient errors
      safeLog.log('Transient error, retrying...');
    }
  }
}