document.addEventListener("DOMContentLoaded", async () => {
  const email = document.getElementById("email")
  const dob = document.getElementById("dob")
  const country = document.getElementById("country")
  const occupation = document.getElementById("occupation")
  const annualIncome = document.getElementById("annual_income_range")

  const unlockBtn = document.getElementById("unlockSensitiveBtn")
  const saveSensitiveBtn = document.getElementById("saveSensitiveBtn")

  const notifEmail = document.getElementById("notifEmail")
  const notifPush = document.getElementById("notifPush")
  const notifMonthly = document.getElementById("notifMonthly")
  const saveNotificationsBtn = document.getElementById("saveNotifications")

  /* ---------- HARD LOCK ---------- */
  lockFields()

  function lockFields() {
    email.disabled = true
    dob.disabled = true
    country.disabled = true
    occupation.disabled = true
    annualIncome.disabled = true
    saveSensitiveBtn.disabled = true
  }

  function unlockFields() {
    email.disabled = false
    dob.disabled = false
    country.disabled = false
    occupation.disabled = false
    annualIncome.disabled = false
    saveSensitiveBtn.disabled = false
  }

  /* ---------- LOAD PROFILE ---------- */
  async function loadProfile() {
    const res = await fetch("/profile/full", { credentials: "include" })
    if (!res.ok) return

    const data = await res.json()

    email.value = data.email || ""
    dob.value = data.dob ? data.dob.split("T")[0] : ""
    country.value = data.country || ""
    occupation.value = data.occupation || ""
    annualIncome.value = data.annual_income_range || ""
  }

  /* ---------- LOAD NOTIFICATIONS ---------- */
  async function loadNotifications() {
    const res = await fetch("/notifications/get", {
      credentials: "include"
    })
    if (!res.ok) return

    const data = await res.json()

    notifEmail.checked = !!data.notif_email
    notifPush.checked = !!data.notif_push
    notifMonthly.checked = !!data.notif_monthly_report
  }

  /* ---------- OTP REQUEST ---------- */
  unlockBtn.addEventListener("click", async () => {
    const res = await fetch("/settings/request-otp", {
      method: "POST",
      credentials: "include"
    })

    if (!res.ok) {
      alert("Failed to send OTP")
      return
    }

    window.location.href = "verify-otp.html"
  })

  /* ---------- CHECK OTP UNLOCK ---------- */
  async function checkSensitiveUnlock() {
    const res = await fetch("/auth/check", { credentials: "include" })
    if (!res.ok) return

    const data = await res.json()

    if (data.sensitive_unlocked === true) {
      unlockFields()
    } else {
      lockFields()
    }
  }

  /* ---------- SAVE SENSITIVE DATA ---------- */
  saveSensitiveBtn.addEventListener("click", async () => {
    const payload = {
      email: email.value,
      dob: dob.value,
      country: country.value,
      occupation: occupation.value,
      annual_income_range: annualIncome.value
    }

    const res = await fetch("/settings/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      alert("Failed to save sensitive data")
      return
    }

    alert("Sensitive data updated successfully")
    lockFields()
  })

  /* ---------- SAVE NOTIFICATIONS ---------- */
  saveNotificationsBtn.addEventListener("click", async () => {
    const res = await fetch("/notifications/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        notif_email: notifEmail.checked,
        notif_push: notifPush.checked,
        notif_monthly_report: notifMonthly.checked
      })
    })

    if (!res.ok) {
      alert("Failed to update notifications")
      return
    }

    alert("Notification preferences updated")
  })

  /* ---------- INIT ---------- */
  await loadProfile()
  await loadNotifications()
  await checkSensitiveUnlock()
})

/* ---------- LOGOUT ---------- */
function logout() {
  fetch("/logout", { method: "POST", credentials: "include" })
  window.location.href = "SignIn.html"
}
