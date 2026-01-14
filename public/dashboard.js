document.addEventListener("DOMContentLoaded", async () => {
  const alertBox = document.getElementById("dashboardAlert")

  /* ---------- AUTH CHECK ---------- */
  try {
    const authRes = await fetch("/auth/check", {
      credentials: "include"
    })

    const auth = await authRes.json()

    if (!auth.logged_in) {
      window.location.href = "SignIn.html"
      return
    }
  } catch (err) {
    console.error("Auth check failed", err)
    window.location.href = "SignIn.html"
    return
  }

  /* ---------- PROFILE STATUS CHECK ---------- */
  try {
    const statusRes = await fetch("/profile/status", {
      credentials: "include"
    })

    const status = await statusRes.json()
    console.log("PROFILE STATUS:", status)

    if (!status.completed && alertBox) {
      alertBox.innerText =
        "Your profile is incomplete. Please update your details in Settings."
      alertBox.style.display = "block"
    } else if (alertBox) {
      alertBox.style.display = "none"
    }
  } catch (err) {
    console.error("Profile status fetch failed", err)
  }

  /* ---------- NAV ACTIVE STATE ---------- */
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-item")
        .forEach(b => b.classList.remove("active"))

      btn.classList.add("active")
    })
  })
})

const dashboardData = {
  income: {
    value: "$5,420",
    change: "▲ 3.2% vs last month",
    positive: true
  },
  expenses: {
    value: "$3,850",
    change: "▼ 2.1% vs last month",
    positive: false
  },
  savings: {
    rate: "29%",
    change: "▲ 5.4% vs last month"
  },
  goalFeasibility: "High",

  aiNotes: {
    pie: "📌 AI: Fixed expenses show high stability",
    line: "📌 AI: Moderate volatility detected",
    savings: "📌 Upward trend indicates improving financial health"
  },

  stability: {
    level: "medium",
    text: "Spending behavior is moderately stable."
  },

  categoryAlerts: [
    { type: "danger", text: "Dining expenses spike on weekends." },
    { type: "info", text: "Shopping shows irregular behavior." }
  ],

  goals: [
    { name: "Emergency Fund", level: "medium", progress: 65 },
    { name: "Vacation Savings", level: "high", progress: 80 },
    { name: "Home Down Payment", level: "low", progress: 35 },
    { name: "Car Fund", level: "medium", progress: 50 }
  ],

  portfolio: {
    riskPercent: 75,
    info: "Volatility: 75% <br> Suitability: Low for short-term goals"
  },

  recommendations: [
    { type: "danger", text: "Reducing dining expenses may improve Emergency Fund feasibility." },
    { type: "info", text: "Expense stability is advised before increasing risk." },
    { type: "success", text: "Allocate 5% more to high-feasibility goals." }
  ],

  summary: [
    "✔ Spending stability improved compared to last month",
    "✔ Discretionary spending reduced by 12%",
    "✔ Next focus: Reduce dining expenses"
  ]
};

document.getElementById("incomeValue").textContent = dashboardData.income.value;
document.getElementById("incomeChange").textContent = dashboardData.income.change;
document.getElementById("incomeChange").className = dashboardData.income.positive ? "positive" : "negative";

document.getElementById("expenseValue").textContent = dashboardData.expenses.value;
document.getElementById("expenseChange").textContent = dashboardData.expenses.change;
document.getElementById("expenseChange").className = dashboardData.expenses.positive ? "positive" : "negative";

document.getElementById("savingsRate").textContent = dashboardData.savings.rate;
document.getElementById("savingsChange").textContent = dashboardData.savings.change;
document.getElementById("savingsChange").className = "positive";

const goalBadge = document.getElementById("goalFeasibility");
goalBadge.textContent = dashboardData.goalFeasibility;
goalBadge.classList.add(dashboardData.goalFeasibility.toLowerCase());

document.getElementById("expensePieNote").textContent = dashboardData.aiNotes.pie;
document.getElementById("expenseLineNote").textContent = dashboardData.aiNotes.line;
document.getElementById("savingsNote").textContent = dashboardData.aiNotes.savings;

document.getElementById("stabilityText").textContent = dashboardData.stability.text;
document.getElementById("stabilityBar").classList.add(dashboardData.stability.level);


const goalsContainer = document.getElementById("goalsContainer");
dashboardData.goals.forEach(goal => {
  goalsContainer.innerHTML += `
    <div class="goal">
      ${goal.name} <span class="badge ${goal.level}">${goal.level}</span>
      <div class="progress">
        <div class="progress-fill ${goal.level}" style="width:${goal.progress}%"></div>
      </div>
    </div>
  `;
});

const alertBox = document.getElementById("categoryAlerts");
dashboardData.categoryAlerts.forEach(a => {
  alertBox.innerHTML += `<div class="alert ${a.type}">${a.text}</div>`;
});

const recBox = document.getElementById("recommendations");
dashboardData.recommendations.forEach(r => {
  recBox.innerHTML += `<div class="alert ${r.type}">${r.text}</div>`;
});

const summaryBox = document.getElementById("summaryPoints");
dashboardData.summary.forEach(point => {
  summaryBox.innerHTML += `<p>${point}</p>`;
});


document.getElementById("riskMarker").style.left = dashboardData.portfolio.riskPercent + "%";
document.getElementById("riskInfo").innerHTML = dashboardData.portfolio.info;

new Chart(expensePie, {
  type: "doughnut",
  data: {
    labels: ["Fixed", "Variable", "Discretionary"],
    datasets: [{ data: [45, 30, 25] }]
  }
});


new Chart(expenseLine, {
  type: "line",
  data: {
    labels: ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan"],
    datasets: [{ data: [3200, 3700, 3400, 4000, 3800, 3950] }]
  }
});

new Chart(categoryLine, {
  type: "line",
  data: {
    labels: ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan"],
    datasets: [
      { label: "Dining", data: [450,520,480,580,620,550] },
      { label: "Shopping", data: [380,340,420,290,510,380] }
    ]
  }
});

new Chart(savingsArea, {
  type: "line",
  data: {
    labels: ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan"],
    datasets: [{ data: [22,25,27,24,26,29], fill:true }]
  }
});

