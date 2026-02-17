/* --- Global Toggle Function (Used by HTML onclick) --- */
function toggle() {
  const input = document.getElementById("password");
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      if (!email || !password) {
        alert("Please enter both email and password.");
        return;
      }

      try {
        // 1. Attempt Login via Node.js Gateway
        const response = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (!response.ok) {
          alert(result.message || "Invalid credentials");
          return;
        }

        // 2. Intelligence-Based Routing
        // We check if the user has a profile for the AI models to work with
        const guard = await fetch("/auth/check", {
          credentials: "include"
        });

        const g = await guard.json();

        

        if (g.questionnaire_completed) {
          // Existing user with AI profile -> Go to Dashboard
          window.location.href = "dashboard.html";
        } else {
          // New user -> Must complete questionnaire for AI models (Stability/Feasibility) to function
          window.location.href = "questionnaire.html"; 
        }

      } catch (err) {
        console.error("Login error:", err);
        alert("Server connection error. Please try again.");
      }
    });
  }
  
  // Initialize icons for the UI
  if (window.lucide) window.lucide.createIcons();
});