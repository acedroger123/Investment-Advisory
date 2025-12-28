document.getElementById("questionnaireForm").addEventListener("submit", async (e) => {
  e.preventDefault()

  const data = {
    user_id: 1,
    age_group: parseInt(document.getElementById("age_group").value),
    income_range: parseInt(document.getElementById("income_range").value),
    savings_percent: parseInt(document.getElementById("savings_percent").value),
    investment_experience: parseInt(document.getElementById("investment_experience").value),
    instruments_used_count: parseInt(document.getElementById("instruments_used_count").value),
    financial_comfort: parseInt(document.getElementById("financial_comfort").value),
    loss_reaction: parseInt(document.getElementById("loss_reaction").value),
    return_priority: parseInt(document.getElementById("return_priority").value),
    volatility_comfort: parseInt(document.getElementById("volatility_comfort").value),
    risk_label: 0
  }

  const response = await fetch("http://localhost:3000/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })

  const result = await response.json()
  alert(result.message)
})
