/* --- Global Toggle Function (Used by HTML onclick) --- */
function toggle(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("changePassForm");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const newPassword = document.getElementById("newPassword").value;
      const confirmPassword = document.getElementById("confirmPassword").value;

      // 1. Client-Side Validation (From Old JS)
      if (!newPassword || newPassword.length < 8) {
        alert("Password must be at least 8 characters");
        return;
      }

      if (newPassword !== confirmPassword) {
        alert("Passwords do not match");
        return;
      }

      // 2. API Call
      try {
        const res = await fetch("/password/change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newPassword })
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.message || "Password change failed");
          return;
        }

        // 3. Success & Redirect
        alert("Password changed successfully");
        window.location.href = "SignIn.html";

      } catch (err) {
        console.error("Change password error:", err);
        alert("Server connection error");
      }
    });
  }
  
  // Initialize icons
  if (window.lucide) window.lucide.createIcons();
});