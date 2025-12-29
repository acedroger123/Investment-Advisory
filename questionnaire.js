/* ---------- SESSION GUARD (NON-NEGOTIABLE) ---------- */
const storedUserId = localStorage.getItem("user_id")

if (!storedUserId) {
  alert("Session expired. Please login again.")
  window.location.href = "SignIn.html"
  throw new Error("user_id missing in localStorage")
}

const user_id = parseInt(storedUserId)

/* ---------- WIZARD STATE ---------- */
let currentStep = 0

const steps = document.querySelectorAll(".step")
const progressSpans = document.querySelectorAll(".progress span")

function showStep(index) {
  steps.forEach((step, i) => {
    step.classList.toggle("active", i === index)
    progressSpans[i].classList.toggle("active", i <= index)
  })
}

/* ---------- VALIDATION ---------- */
function validateStep(stepIndex) {
  const inputs = steps[stepIndex].querySelectorAll("select, input")
  let valid = true

  inputs.forEach(input => {
    if (input.type === "range") return

    if (!input.value || input.value.trim() === "") {
      input.style.border = "2px solid red"
      valid = false
    } else {
      input.style.border = "1px solid #ddd"
    }
  })

  if (!valid) {
    alert("Please fill all fields before continuing.")
  }

  return valid
}

/* ---------- NAVIGATION ---------- */
function nextStep() {
  if (!validateStep(currentStep)) return
  if (currentStep < steps.length - 1) {
    currentStep++
    showStep(currentStep)
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--
    showStep(currentStep)
  }
}

/* ---------- FINAL SUBMIT ---------- */
document.getElementById("questionnaireForm").addEventListener("submit", async (e) => {
  e.preventDefault()

  if (!validateStep(currentStep)) return

  const data = {
    user_id,

    age_group: parseInt(document.getElementById("age_group").value),
    occupation: document.getElementById("occupation").value,
    income_range: parseInt(document.getElementById("income_range").value),
    savings_percent: parseInt(document.getElementById("savings_percent").value),

    investment_experience: parseInt(document.getElementById("investment_experience").value),
    instruments_used_count: parseInt(document.getElementById("instruments_used_count").value),
    financial_comfort: parseInt(document.getElementById("financial_comfort").value),

    loss_reaction: parseInt(document.getElementById("loss_reaction").value),
    return_priority: parseInt(document.getElementById("return_priority").value),
    volatility_comfort: parseInt(document.getElementById("volatility_comfort").value),

    goal: document.getElementById("goal").value,
    time_horizon: parseInt(document.getElementById("time_horizon").value),

    risk_label: calculateRiskLabel()
  }

  const response = await fetch("http://localhost:3000/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })

  const result = await response.json()

  if (response.ok) {
    window.location.href = "dashboard.html"
  } else {
    alert(result.message || "Error submitting questionnaire")
  }
})

/* ---------- RISK SCORE LOGIC ---------- */
function calculateRiskLabel() {
  const investment_experience = parseInt(document.getElementById("investment_experience").value)
  const instruments_used_count = parseInt(document.getElementById("instruments_used_count").value)
  const financial_comfort = parseInt(document.getElementById("financial_comfort").value)
  const loss_reaction = parseInt(document.getElementById("loss_reaction").value)
  const return_priority = parseInt(document.getElementById("return_priority").value)
  const volatility_comfort = parseInt(document.getElementById("volatility_comfort").value)

  let score = 0
  score += investment_experience
  score += instruments_used_count
  score += financial_comfort
  score += loss_reaction
  score += return_priority
  score += volatility_comfort

  if (score >= 20) return 3
  if (score >= 14) return 2
  return 1
}
