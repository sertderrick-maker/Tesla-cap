// user-data.js - Include this in ALL pages to load user data
// Add this line in your HTML: <script src="user-data.js"></script>

window.addEventListener('load', () => {
  try {
    const userJson = localStorage.getItem('user');
    if (!userJson) {
      console.error('No user data found. Redirecting to login...');
      window.location.href = 'login.html';
      return;
    }

    const user = JSON.parse(userJson);
    
    // Update user name in sidebar
    const userName = document.getElementById('userName');
    if (userName) {
      userName.textContent = `${user.firstName} ${user.lastName}`;
    }

    // Update user email in sidebar
    const userEmail = document.getElementById('userEmail');
    if (userEmail) {
      userEmail.textContent = user.email;
    }

    // Update user initial in avatar
    const userInitial = document.getElementById('userInitial');
    if (userInitial) {
      const initial = user.firstName.charAt(0).toUpperCase();
      userInitial.textContent = initial;
    }

    // Update welcome message (if it exists on the page)
    const welcomeHeading = document.querySelector('.header-section h1');
    if (welcomeHeading && welcomeHeading.textContent.includes('Welcome back')) {
      welcomeHeading.textContent = `Welcome back, ${user.firstName} ${user.lastName}`;
    }

    // ✅ NEW: Fill KYC form fields with user data
    const firstNameInput = document.querySelector('input[type="text"][value="Jeremy"]');
    if (firstNameInput) {
      firstNameInput.value = user.firstName;
    }

    const lastNameInput = document.querySelector('input[type="text"][value="Frey"]');
    if (lastNameInput) {
      lastNameInput.value = user.lastName;
    }

    // Alternative: Find by label text (more reliable)
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
      const label = input.previousElementSibling;
      if (label && label.textContent.includes('First Name')) {
        input.value = user.firstName;
      }
      if (label && label.textContent.includes('Last Name')) {
        input.value = user.lastName;
      }
    });

    console.log(`✅ User loaded: ${user.firstName} ${user.lastName}`);
  } catch (error) {
    console.error('Error loading user data:', error);
    window.location.href = 'login.html';
  }
});

// Logout function
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
  }
}

// Go to wallet
function goToWallet() {
  window.location.href = 'wallet.html';
}
