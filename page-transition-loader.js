/**
 * Modern Page Transition Loader
 * Professional spinner with gradient animation and smooth transitions
 */

(function() {
  'use strict';

  // Configuration
  const config = {
    minLoadTime: 300,           // Minimum time to show loader
    fadeOutDuration: 200,       // Fade out duration (ms)
    fadeInDuration: 300,        // Fade in duration (ms)
    spinnerColor: '#e31937',    // Primary color (TeslasCap red)
    accentColor: '#ff6b6b',     // Accent color
    backgroundColor: '#ffffff'  // Background color
  };

  // Create loader HTML
  function createLoader() {
    const loaderHTML = `
      <div id="page-transition-loader" class="page-transition-loader">
        <div class="loader-container">
          <div class="spinner-wrapper">
            <!-- Modern Gradient Spinner -->
            <svg class="modern-spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:${config.spinnerColor};stop-opacity:1" />
                  <stop offset="100%" style="stop-color:${config.accentColor};stop-opacity:1" />
                </linearGradient>
              </defs>
              <!-- Outer rotating ring -->
              <circle cx="50" cy="50" r="45" fill="none" stroke="url(#spinnerGradient)" stroke-width="3" stroke-linecap="round" class="spinner-ring outer-ring" />
              <!-- Inner rotating ring -->
              <circle cx="50" cy="50" r="35" fill="none" stroke="url(#spinnerGradient)" stroke-width="2" stroke-linecap="round" class="spinner-ring inner-ring" opacity="0.6" />
              <!-- Center dot -->
              <circle cx="50" cy="50" r="4" fill="url(#spinnerGradient)" class="center-dot" />
            </svg>
          </div>
          
          <!-- Loading Text -->
          <div class="loader-text">
            <p class="loading-text">Loading</p>
            <div class="dots-animation">
              <span class="dot">.</span>
              <span class="dot">.</span>
              <span class="dot">.</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      /* Page Transition Loader Styles */
      #page-transition-loader {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${config.backgroundColor};
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease-in-out;
      }

      #page-transition-loader.active {
        opacity: 1;
        pointer-events: auto;
      }

      .loader-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 30px;
      }

      .spinner-wrapper {
        position: relative;
        width: 120px;
        height: 120px;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .modern-spinner {
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 4px 12px rgba(227, 25, 55, 0.15));
      }

      /* Outer ring rotation */
      .outer-ring {
        animation: spinOuter 2s linear infinite;
        stroke-dasharray: 141;
        stroke-dashoffset: 0;
      }

      /* Inner ring rotation (opposite direction) */
      .inner-ring {
        animation: spinInner 3s linear infinite;
        stroke-dasharray: 110;
        stroke-dashoffset: 0;
      }

      /* Center dot pulse */
      .center-dot {
        animation: pulse 1.5s ease-in-out infinite;
      }

      @keyframes spinOuter {
        0% {
          transform: rotate(0deg);
          stroke-dashoffset: 0;
        }
        100% {
          transform: rotate(360deg);
          stroke-dashoffset: -141;
        }
      }

      @keyframes spinInner {
        0% {
          transform: rotate(360deg);
          stroke-dashoffset: 0;
        }
        100% {
          transform: rotate(0deg);
          stroke-dashoffset: -110;
        }
      }

      @keyframes pulse {
        0%, 100% {
          r: 4;
          opacity: 1;
        }
        50% {
          r: 6;
          opacity: 0.7;
        }
      }

      /* Loading text */
      .loader-text {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      }

      .loading-text {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
        color: ${config.spinnerColor};
        letter-spacing: 0.5px;
      }

      /* Dots animation */
      .dots-animation {
        display: flex;
        gap: 4px;
        height: 20px;
        align-items: center;
      }

      .dot {
        display: inline-block;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: ${config.spinnerColor};
        animation: dotBounce 1.4s infinite;
      }

      .dot:nth-child(2) {
        animation-delay: 0.2s;
      }

      .dot:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes dotBounce {
        0%, 80%, 100% {
          opacity: 0.5;
          transform: scale(1);
        }
        40% {
          opacity: 1;
          transform: scale(1.3);
        }
      }

      /* Fade transitions */
      .page-fade-out {
        animation: fadeOut ${config.fadeOutDuration}ms ease-in-out forwards;
      }

      .page-fade-in {
        animation: fadeIn ${config.fadeInDuration}ms ease-in-out forwards;
      }

      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* Responsive */
      @media (max-width: 768px) {
        .spinner-wrapper {
          width: 100px;
          height: 100px;
        }

        .loading-text {
          font-size: 14px;
        }

        .loader-container {
          gap: 20px;
        }
      }

      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        #page-transition-loader {
          background: #1a1a1a;
        }

        .loading-text {
          color: ${config.accentColor};
        }

        .dot {
          background: ${config.accentColor};
        }
      }
    `;

    document.head.appendChild(style);
    document.body.insertAdjacentHTML('afterbegin', loaderHTML);
  }

  // Show loader
  function showLoader() {
    const loader = document.getElementById('page-transition-loader');
    if (loader) {
      loader.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  // Hide loader
  function hideLoader() {
    const loader = document.getElementById('page-transition-loader');
    if (loader) {
      loader.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // Handle page transitions
  function handlePageTransition(event) {
    const target = event.target.closest('a');
    
    if (!target) return;

    const href = target.getAttribute('href');
    
    // Skip external links, email links, phone links, anchor links, and no-transition links
    if (!href || 
        href.startsWith('http') || 
        href.startsWith('mailto:') || 
        href.startsWith('tel:') || 
        href.startsWith('#') ||
        target.classList.contains('no-transition') ||
        target.hasAttribute('download')) {
      return;
    }

    event.preventDefault();

    // Show loader
    showLoader();

    // Fade out current page
    document.body.classList.add('page-fade-out');

    // Navigate after fade out
    const startTime = Date.now();
    const minLoadTime = config.minLoadTime;

    const navigate = () => {
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minLoadTime - elapsedTime);

      setTimeout(() => {
        window.location.href = href;
      }, remainingTime);
    };

    navigate();
  }

  // Initialize on page load
  function init() {
    // Create loader if it doesn't exist
    if (!document.getElementById('page-transition-loader')) {
      createLoader();
    }

    // Fade in current page
    document.body.classList.add('page-fade-in');

    // Hide loader when page is fully loaded
    hideLoader();

    // Add click listeners to all links
    document.addEventListener('click', handlePageTransition);

    // Handle browser back/forward buttons
    window.addEventListener('pageshow', () => {
      hideLoader();
      document.body.classList.remove('page-fade-out');
      document.body.classList.add('page-fade-in');
    });

    window.addEventListener('pagehide', () => {
      document.body.classList.remove('page-fade-in');
      document.body.classList.add('page-fade-out');
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for manual control
  window.pageTransitionLoader = {
    show: showLoader,
    hide: hideLoader,
    config: config
  };
})();
