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

  if (!response.ok) {
    alert(result.message)
    return
  }

  // store logged-in user
  localStorage.setItem("user_id", result.user_id)

  // redirect based on questionnaire status
  if (result.questionnaire_completed) {
    window.location.href = "dashboard.html"
  } else {
    window.location.href = "questionnaire.html"
  }
})

function showError(id, message) {
  document.getElementById(id).innerText = message
}

function clearErrors() {
  document.querySelectorAll(".error").forEach(el => el.innerText = "")
}

function togglePassword(inputId, toggleElement) {
  const input = document.getElementById(inputId)

  if (input.type === "password") {
    input.type = "text"
    toggleElement.innerText = "Hide"
  } else {
    input.type = "password"
    toggleElement.innerText = "Show"
  }
}
