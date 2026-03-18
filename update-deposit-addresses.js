/**
 * Update Deposit Modal with Dynamic Addresses
 * This script updates the deposit modal to show addresses from the API
 * Add this script to your wallet.html after the main wallet script
 */

(function() {
  'use strict';

  const API_URL = 'http://localhost:5001';

  // Function to update deposit modal addresses
  async function updateDepositAddresses() {
    try {
      // Fetch addresses from public API
      const response = await fetch(`${API_URL}/api/crypto-addresses-public`);
      const data = await response.json();

      if (data.success && data.addresses) {
        // Create a map of addresses by symbol
        const addressMap = {};
        data.addresses.forEach(addr => {
          addressMap[addr.symbol.toUpperCase()] = addr.address;
        });

        // Update all address displays in the deposit modal
        updateAddressDisplay('bitcoin', 'BTC', addressMap['BTC']);
        updateAddressDisplay('ethereum', 'ETH', addressMap['ETH']);
        updateAddressDisplay('litecoin', 'LTC', addressMap['LTC']);
        updateAddressDisplay('usdt', 'USDT', addressMap['USDT']);

        console.log('✅ Deposit modal addresses updated from API');
      }
    } catch (error) {
      console.error('❌ Error updating deposit addresses:', error);
    }
  }

  // Helper function to update a specific address display
  function updateAddressDisplay(cryptoType, symbol, address) {
    // Try different possible ID patterns
    const possibleIds = [
      `${cryptoType}AddressDisplay`,
      `deposit${symbol}Address`,
      `${symbol}Address`,
      `depositAddressDisplay${symbol}`,
      `address-${cryptoType}`,
      `${cryptoType}-address`
    ];

    let element = null;
    for (let id of possibleIds) {
      element = document.getElementById(id);
      if (element) break;
    }

    // If not found by ID, try by class
    if (!element) {
      const possibleClasses = [
        `.${cryptoType}-address`,
        `.${symbol}-address`,
        `[data-crypto="${cryptoType}"]`,
        `[data-symbol="${symbol}"]`
      ];

      for (let selector of possibleClasses) {
        element = document.querySelector(selector);
        if (element) break;
      }
    }

    // Update the element if found
    if (element && address) {
      element.textContent = address;
      element.dataset.address = address;
      console.log(`✅ Updated ${symbol} address: ${address}`);
    } else if (!element) {
      console.warn(`⚠️ Could not find element for ${symbol} address`);
    }
  }

  // Update addresses when page loads
  function init() {
    updateDepositAddresses();

    // Also update when deposit modal is opened
    // Listen for modal open events
    document.addEventListener('click', function(e) {
      // Check if a deposit button was clicked
      if (e.target.classList.contains('deposit-btn') || 
          e.target.classList.contains('btn-deposit') ||
          e.target.textContent.toLowerCase().includes('deposit')) {
        // Wait a moment for modal to render, then update
        setTimeout(updateDepositAddresses, 100);
      }
    });

    // Also listen for modal show events
    const modalElements = document.querySelectorAll('[id*="modal"], [class*="modal"]');
    modalElements.forEach(modal => {
      // If using Bootstrap or similar
      if (modal.addEventListener) {
        modal.addEventListener('show.bs.modal', updateDepositAddresses);
        modal.addEventListener('shown.bs.modal', updateDepositAddresses);
      }
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for manual control
  window.updateDepositAddresses = updateDepositAddresses;
})();
