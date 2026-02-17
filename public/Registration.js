/* --- Global Toggle Function (Used by HTML onclick) --- */
function toggle(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const form = document.getElementById("registerForm");
  const modal = document.getElementById("privacyModal");
  const acceptBtn = document.getElementById("acceptBtn");

  // --- 1. HANDLE REGISTRATION ---
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Get Values
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const confirm = document.getElementById("confirmPassword").value;

      // Validation Logic
      if (password !== confirm) {
        alert("Passwords do not match");
        return;
      }
      if (name.length < 3 || password.length < 6) {
        alert("Invalid details: Name must be 3+ chars and password 6+ chars.");
        return;
      }

      // API Call to Node.js /register route
      try {
        const res = await fetch("/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, email, password })
        });

        const result = await res.json();

        if (!res.ok) {
          alert(result.message || "Registration failed");
          return;
        }

        // Success: Open Privacy Modal to get Consent for AI Analysis
        if (modal) {
          modal.style.display = "flex";
        } else {
          // Fallback if modal isn't present in HTML
          window.location.href = "questionnaire.html";
        }

      } catch (err) {
        console.error("Registration error:", err);
        alert("Server error. Please try again later.");
      }
    });
  }

  // --- 2. HANDLE CONSENT (Modal Action) ---
  
  if (acceptBtn) {
    acceptBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include"
        });

        if (res.ok) {
          // Success: New user must complete the Questionnaire to calibrate AI models
          window.location.href = "questionnaire.html";
        } else {
          alert("Failed to process consent. Please try again.");
        }
      } catch (err) {
        console.error("Consent error:", err);
        alert("Network error during consent.");
      }
    });
  }
});