document.addEventListener("DOMContentLoaded", async () => {

  try {
    const guardRes = await fetch("/guard/questionnaire", {
      credentials: "include"
    })

    const guard = await guardRes.json()

    if (!guard.allowed) {
      window.location.href = "dashboard.html"
      return
    }
  } catch {
    window.location.href = "SignIn.html"
    return
  }

  const form = document.getElementById("questionnaireForm")
  const steps = document.querySelectorAll(".step")
  const progressSpans = document.querySelectorAll(".progress span")

  const age_group = document.getElementById("age_group")
  const occupation = document.getElementById("occupation")
  const income_range = document.getElementById("income_range")
  const savings_percent = document.getElementById("savings_percent")

  const investment_experience = document.getElementById("investment_experience")
  const instruments_used_count = document.getElementById("instruments_used_count")
  const financial_comfort = document.getElementById("financial_comfort")

  const loss_reaction = document.getElementById("loss_reaction")
  const return_priority = document.getElementById("return_priority")
  const volatility_comfort = document.getElementById("volatility_comfort")

  const goal = document.getElementById("goal")
  const time_horizon = document.getElementById("time_horizon")

  let currentStep = 0

  function showStep(index) {
    steps.forEach((step, i) => {
      step.classList.toggle("active", i === index)
      progressSpans[i].classList.toggle("active", i <= index)
    })
  }

  function validateStep(stepIndex) {
    const inputs = steps[stepIndex].querySelectorAll("select, input")

    for (const input of inputs) {
      if (input.type === "range") continue
      if (!input.value) {
        alert("Please fill all fields before continuing.")
        return false
      }
    }
    return true
  }

  window.nextStep = () => {
    if (!validateStep(currentStep)) return
    if (currentStep < steps.length - 1) {
      currentStep++
      showStep(currentStep)
    }
  }

  window.prevStep = () => {
    if (currentStep > 0) {
      currentStep--
      showStep(currentStep)
    }
  }

  showStep(currentStep)

  function calculateRiskLabel() {
    let score = 0

    score += Number(investment_experience.value)
    score += Number(instruments_used_count.value)
    score += Number(financial_comfort.value)
    score += Number(loss_reaction.value)
    score += Number(return_priority.value)
    score += Number(volatility_comfort.value)

    if (score >= 20) return 3
    if (score >= 14) return 2
    return 1
  }

  form.addEventListener("submit", async e => {
    e.preventDefault()

    if (!validateStep(currentStep)) return

    const payload = {
      age_group: Number(age_group.value),
      occupation: occupation.value,
      income_range: Number(income_range.value),
      savings_percent: Number(savings_percent.value),
      investment_experience: Number(investment_experience.value),
      instruments_used_count: Number(instruments_used_count.value),
      financial_comfort: Number(financial_comfort.value),
      loss_reaction: Number(loss_reaction.value),
      return_priority: Number(return_priority.value),
      volatility_comfort: Number(volatility_comfort.value),
      goal: goal.value,
      time_horizon: Number(time_horizon.value),
      risk_label: calculateRiskLabel()
    }

    try {
      const response = await fetch("/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        window.location.href = "dashboard.html"
        return
      }

      if (response.status === 401) {
        window.location.href = "SignIn.html"
        return
      }

      const result = await response.json()
      alert(result.message || "Survey submission failed")

    } catch {
      alert("Server error during submission")
    }
  })
})
