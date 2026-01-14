document.addEventListener("DOMContentLoaded", async () => {
  /* ================== ELEMENTS ================== */
  const email = document.getElementById("email")
  const dob = document.getElementById("dob")

  const country = document.getElementById("country")
  const occupation = document.getElementById("occupation")
  const annualIncome = document.getElementById("annual_income_range")

  const editBtn = document.getElementById("editProfileBtn")
  const saveBtn = document.getElementById("saveProfileBtn")
  const verifyEmailBtn = document.getElementById("verifyEmailBtn")
  const saveIdentityBtn = document.getElementById("saveIdentityBtn")

  const alertBox = document.getElementById("profileAlert")

 
  


  /* ================== NOTIFICATIONS ================== */
  saveNotifBtn?.addEventListener("click", async () => {
    try {
      const res = await fetch("/notifications/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          notif_email: !!notifEmail.checked,
          notif_push: !!notifPush.checked,
          notif_monthly_report: !!notifMonthly.checked
        })
      })

      const result = await res.json()
      alert(result.message)
    } catch {
      alert("Failed to update notification settings")
    }
  })

  /* ================== HELPERS ================== */
  
  async function loadFullProfile() {
    const res = await fetch("/profile/full", {
      credentials: "include"
    })
    if (!res.ok) return

    const data = await res.json()

    email.value = data.email || ""
    dob.value = data.dob ? data.dob.split("T")[0] : ""

    country.value = data.country || ""
    occupation.value = data.occupation || ""
    annualIncome.value = data.annual_income_range || ""

    email.disabled = true
    dob.disabled = true

    lockProfile()
  }

  async function loadProfileStatus() {
    const res = await fetch("/profile/status", {
      credentials: "include"
    })
    if (!res.ok) return

    const status = await res.json()

    if (!status.completed) {
      showAlert(
        "Your profile is incomplete. Please update your details.",
        "blue"
      )
    } else {
      showAlert("Profile up to date.", "green")
    }
  }

  
})

/* ================== LOGOUT ================== */
function logout() {
  fetch("/logout", {
    method: "POST",
    credentials: "include"
  })
  window.location.href = "SignIn.html"
}
