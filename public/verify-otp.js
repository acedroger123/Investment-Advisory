document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("otpForm");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const otpInput = document.getElementById("otp");
      const otp = otpInput.value.trim();
      const btn = form.querySelector("button[type='submit']");
      const originalBtnText = btn.innerHTML;

      // Basic Validation
      if (otp.length !== 6) {
        alert("Please enter a valid 6-digit OTP");
        return;
      }

      try {
        // UI Loading State
        btn.innerHTML = "Verifying...";
        btn.disabled = true;

        // API Call
        const res = await fetch("/settings/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ otp })
        });

        const result = await res.json();

        if (!res.ok) {
          alert(result.message || "Verification failed");
          btn.innerHTML = originalBtnText;
          btn.disabled = false;
          return;
        }

        // Success: Redirect back to Settings
        window.location.href = "settings.html";

      } catch (err) {
        console.error("OTP Verify Error:", err);
        alert("Server error. Please try again.");
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
      }
    });
  }
  
  // Initialize icons
  if (window.lucide) window.lucide.createIcons();
});