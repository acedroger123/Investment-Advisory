document.getElementById("sendOtpBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim()
  if (!email) return alert("Email required")

  const res = await fetch("/password/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email })
  })

  if (!res.ok) return alert("Failed to send OTP")
  alert("OTP sent to your email")
})

document.getElementById("verifyOtpBtn").addEventListener("click", async () => {
  const otp = document.getElementById("otp").value.trim()
  if (!otp) return alert("OTP required")

  const res = await fetch("/password/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ otp })
  })

  if (!res.ok) return alert("Invalid or expired OTP")

  window.location.href = "change-password.html"
})