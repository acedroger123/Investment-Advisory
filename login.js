document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault()

  const email = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value.trim()

  clearErrors()

  let valid = true

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("emailError", "Enter a valid email")
    valid = false
  }

  if (password.length < 6) {
    showError("passwordError", "Invalid password")
    valid = false
  }

  if (!valid) return

  const response = await fetch("http://localhost:3000/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })

  const result = await response.json()

  // ✅ SHOW DISCLAIMER ONLY AFTER SUCCESSFUL LOGIN
  if (result.message === "Login successful") {
    document.getElementById("privacyModal").style.display = "flex"
  } else {
    alert(result.message)
  }
})

function showError(id, message) {
  document.getElementById(id).innerText = message
}

function clearErrors() {
  document.querySelectorAll(".error").forEach(el => el.innerText = "")
}

// ✅ REDIRECT ONLY AFTER ACCEPTING DISCLAIMER
document.getElementById("acceptBtn").addEventListener("click", () => {
  window.location.href = "questionnaire.html"
})
