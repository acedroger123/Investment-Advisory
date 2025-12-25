document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault()

  const name = document.getElementById("name").value.trim()
  const email = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value
  const confirmPassword = document.getElementById("confirmPassword").value

  clearErrors()

  let valid = true

  if (name.length < 3) {
    showError("nameError", "Enter a valid name")
    valid = false
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("emailError", "Enter a valid email")
    valid = false
  }

  if (password.length < 6) {
    showError("passwordError", "Password must be at least 6 characters")
    valid = false
  }

  if (password !== confirmPassword) {
    showError("confirmPasswordError", "Passwords do not match")
    valid = false
  }

  if (!valid) return

  const response = await fetch("http://localhost:3000/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
  })

  const result = await response.json()

  if (result.message === "Registration successful") {
    document.getElementById("privacyModal").style.display = "flex"
  } else {
    alert(result.message)
  }
})

document.getElementById("acceptBtn").addEventListener("click", () => {
  window.location.href = "questionnaire.html"
})

function showError(id, message) {
  document.getElementById(id).innerText = message
}

function clearErrors() {
  document.querySelectorAll(".error").forEach(e => e.innerText = "")
}
