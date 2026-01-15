document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("otpForm")

  form.addEventListener("submit", async (e) => {
    e.preventDefault()

    const otp = document.getElementById("otp").value.trim()

    if (otp.length !== 6) {
      alert("Please enter a valid 6-digit OTP")
      return
    }

    try {
      const res = await fetch("/settings/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp })
      })

      const result = await res.json()

      if (!res.ok) {
        alert(result.message)
        return
      }

      window.location.href = "settings.html"

    } catch {
      alert("Server error. Please try again.")
    }
  })

})
