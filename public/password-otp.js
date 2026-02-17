document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("requestOtpForm");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailInput = document.getElementById("email");
      const email = emailInput.value.trim();
      const btn = form.querySelector("button[type='submit']");
      const originalBtnText = btn.innerHTML;

      if (!email) {
        alert("Email required");
        return;
      }

      try {
        // UI Loading State
        btn.innerHTML = "Sending...";
        btn.disabled = true;

        const res = await fetch("/password/request-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.message || "Failed to send OTP");
          btn.innerHTML = originalBtnText;
          btn.disabled = false;
          return;
        }

        // Success: Redirect to the Verification Page
        // (Old code just alerted, but new flow requires moving to next step)
        window.location.href = "verify-otp.html";

      } catch (err) {
        console.error("OTP Request Error:", err);
        alert("Server connection error");
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
      }
    });
  }
  
  // Initialize icons
  if (window.lucide) window.lucide.createIcons();
});