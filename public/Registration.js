/* --- Global Toggle Function (Used by HTML onclick) --- */
function toggle(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

const NAME_REGEX = /^[A-Za-z]+(?:[ '.-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const PASSWORD_ALLOWED_SPECIALS = "!@#$%^&*";
const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*]+$/;

function setError(id, message) {
  const field = document.getElementById(id);
  if (!field) return;
  field.textContent = message || "";
}

function clearErrors() {
  setError("nameError", "");
  setError("emailError", "");
  setError("passwordError", "");
  setError("confirmPasswordError", "");
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function validateName(name) {
  if (!name) return "Name is required.";
  if (name.length < 3 || name.length > 50) {
    return "Name must be between 3 and 50 characters.";
  }
  if (!NAME_REGEX.test(name)) {
    return "Use only letters, spaces, apostrophes, periods, and hyphens.";
  }
  return "";
}

function validateEmail(email) {
  if (!email) return "Email is required.";
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    return "Enter a valid email address.";
  }
  return "";
}

function validatePassword(password) {
  const value = String(password || "");

  if (value.length < 8 || value.length > 64) {
    return "Password must be 8 to 64 characters long.";
  }
  if (!PASSWORD_ALLOWED_REGEX.test(value)) {
    return `Allowed special characters: ${PASSWORD_ALLOWED_SPECIALS}`;
  }

  const hasRequiredMix =
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[!@#$%^&*]/.test(value);

  if (!hasRequiredMix) {
    return "Use uppercase, lowercase, number, and one special character.";
  }
  return "";
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
      clearErrors();

      // Get Values
      const name = normalizeName(document.getElementById("name").value);
      const email = document.getElementById("email").value.trim().toLowerCase();
      const password = document.getElementById("password").value;
      const confirm = document.getElementById("confirmPassword").value;

      // Validation Logic
      const nameError = validateName(name);
      const emailError = validateEmail(email);
      const passwordError = validatePassword(password);
      const confirmError = password === confirm ? "" : "Passwords do not match.";

      setError("nameError", nameError);
      setError("emailError", emailError);
      setError("passwordError", passwordError);
      setError("confirmPasswordError", confirmError);

      if (nameError || emailError || passwordError || confirmError) {
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
