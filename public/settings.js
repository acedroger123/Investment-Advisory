document.addEventListener("DOMContentLoaded", async () => {
  // --- DOM ELEMENTS ---
  const unlockBtn = document.getElementById("unlockBtn");
  const lockBtn = document.getElementById("lockBtn");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const saveNotifBtn = document.getElementById("saveNotifBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  
  // OTP Modal Elements
  const otpModal = document.getElementById("otpModal");
  const verifyOtpBtn = document.getElementById("verifyOtp");
  const cancelOtpBtn = document.getElementById("cancelOtp");
  const otpInput = document.getElementById("otpInput");

  // Profile Inputs
  const emailInput = document.getElementById("email");
  const dobInput = document.getElementById("dob");
  const countryInput = document.getElementById("country");
  const occupationInput = document.getElementById("occupation");
  const incomeInput = document.getElementById("incomeRange");

  // Notification Checkboxes
  const notifEmail = document.getElementById("notifEmail");
  const notifPush = document.getElementById("notifPush");
  const notifReport = document.getElementById("notifReport");

  // Group inputs
  const profileInputs = [emailInput, dobInput, countryInput, occupationInput, incomeInput];

  // --- 1. HELPER FUNCTIONS ---

  function lockFields() {
    profileInputs.forEach(input => {
      input.disabled = true;
      input.style.opacity = "0.7"; 
    });
    if(saveProfileBtn) saveProfileBtn.disabled = true;
    
    // Show Unlock, Hide Lock
    if(unlockBtn) unlockBtn.style.display = "inline-flex"; 
    if(lockBtn) lockBtn.style.display = "none";
  }

  function unlockFields() {
    profileInputs.forEach(input => {
      input.disabled = false;
      input.style.opacity = "1";
    });
    if(saveProfileBtn) saveProfileBtn.disabled = false;

    // Show Lock, Hide Unlock
    if(unlockBtn) unlockBtn.style.display = "none";
    if(lockBtn) lockBtn.style.display = "inline-flex";
  }

  // --- 2. INITIALIZATION ---

  // 🔒 FORCE LOCK ON PAGE LOAD (User Requirement)
  try {
    await fetch("/settings/lock", { method: "POST", credentials: "include" });
  } catch (e) {
    console.log("Auto-lock failed, session might be new.");
  }

  // Load Data
  await loadProfile();
  await loadNotifications();
  
  // Apply Lock UI immediately (since we forced the lock above)
  lockFields();

  async function loadProfile() {
    try {
      const res = await fetch("/profile/full", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      
      if(emailInput) emailInput.value = data.email || "";
      if(dobInput) dobInput.value = data.dob ? data.dob.split("T")[0] : "";
      if(countryInput) countryInput.value = data.country || "";
      if(occupationInput) occupationInput.value = data.occupation || "";
      if(incomeInput) incomeInput.value = data.annual_income_range || "";
    } catch (err) { console.error(err); }
  }

  async function loadNotifications() {
    try {
      const res = await fetch("/notifications/get", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if(notifEmail) notifEmail.checked = !!data.notif_email;
      if(notifPush) notifPush.checked = !!data.notif_push;
      if(notifReport) notifReport.checked = !!data.notif_monthly_report;
    } catch (err) { console.error(err); }
  }

  // --- 3. BUTTON HANDLERS ---

  // REQUEST OTP
  if (unlockBtn) {
    unlockBtn.onclick = async () => {
      try {
        const originalText = unlockBtn.innerHTML;
        unlockBtn.innerHTML = "Sending...";
        
        const res = await fetch("/settings/request-otp", { method: "POST", credentials: "include" });
        const result = await res.json();

        if (res.ok) {
          otpModal.style.display = "flex";
          otpInput.value = "";
          otpInput.focus();
        } else {
          alert(result.message || "Failed to send OTP");
        }
        unlockBtn.innerHTML = originalText;
      } catch (e) { alert("Network error"); }
    };
  }

  // MANUAL LOCK BUTTON
  if (lockBtn) {
    lockBtn.onclick = async () => {
      try {
        await fetch("/settings/lock", { method: "POST", credentials: "include" });
        lockFields(); 
        alert("Settings Locked");
      } catch (e) { console.error("Lock failed", e); }
    };
  }

  // VERIFY OTP SUBMIT
  if (verifyOtpBtn) {
    verifyOtpBtn.onclick = async () => {
      const otp = otpInput.value.trim();
      if (!otp) return alert("Please enter the OTP");

      try {
        const res = await fetch("/settings/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ otp })
        });

        if (res.ok) {
          otpModal.style.display = "none";
          unlockFields();
          alert("Settings Unlocked!");
        } else {
          alert("Invalid OTP");
        }
      } catch (e) { alert("Verification error"); }
    };
  }

  if (cancelOtpBtn) {
    cancelOtpBtn.onclick = () => { otpModal.style.display = "none"; };
  }

  // --- 4. SAVE HANDLERS ---
  
  const profileForm = document.getElementById("profileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        email: emailInput.value,
        dob: dobInput.value,
        country: countryInput.value,
        occupation: occupationInput.value,
        annual_income_range: incomeInput.value
      };

      try {
        const res = await fetch("/settings/update-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });

        if (res.ok) alert("Sensitive data updated successfully");
        else alert("Failed to save. Session may have expired.");
      } catch (err) { alert("Error saving profile"); }
    });
  }

  if (saveNotifBtn) {
    saveNotifBtn.onclick = async () => {
      const payload = {
        notif_email: notifEmail.checked,
        notif_push: notifPush.checked,
        notif_monthly_report: notifReport.checked
      };

      try {
        const res = await fetch("/notifications/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });

        if (res.ok) alert("Notification preferences updated");
        else alert("Failed to update notifications");
      } catch (e) { alert("Error saving preferences"); }
    };
  }

  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      if (!confirm("Are you sure you want to sign out?")) return;
      await fetch("/logout", { method: "POST", credentials: "include" });
      window.location.href = "SignIn.html";
    };
  }

  if (window.lucide) window.lucide.createIcons();
});