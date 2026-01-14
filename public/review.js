document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
  })
})

const monthlyData = {
  month: "December 2025",

  summary: {
    income: {
      current: 4500,
      previous: 4750
    },
    expenses: {
      current: 2900,
      previous: 3150
    },
    savings: {
      current: 1600,
      previous: 1420
    }
  },

  habits: [
    { label: " Cooking at home", value: "+15%", type: "positive" },
    { label: " Using public transport", value: "+8%", type: "positive" },
    { label: " Entertainment spending", value: "-12%", type: "negative" },
    { label: " Impulse purchases", value: "-20%", type: "negative" }
  ],

  profileChanges: [
    {
      title: "Improved Financial Discipline",
      description: "Your spending consistency has improved by 12%",
      type: "green"
    },
    {
      title: "Savings Goal Progress",
      description: "On track to achieve 2 out of 3 active goals",
      type: "blue"
    },
    {
      title: "Smart Spending Detected",
      description: "You're making more informed purchasing decisions",
      type: "purple"
    }
  ],

  insights: {
    savings: {
      currentRate: 18,
      previousRate: 12,
      stabilityImprovement: 10,
      message: "Savings consistency improved, validating behavior improvement."
    },
    portfolio: {
      riskLevel: "High",
      message:
        "Portfolio risk remained high and continues to affect short-term goals."
    }
  },

  goals: {
    active: 3,
    onTrack: 2,
    attention: 1
  }
};


function calculateTrend(current, previous) {
  const diff = ((current - previous) / previous) * 100;

  return {
    value: Math.abs(diff).toFixed(0) + "%",
    direction: diff >= 0 ? "up" : "down",
    symbol: diff >= 0 ? "↑" : "↓"
  };
}

function renderHeader(month) {
  document.querySelector(".subtitle").innerText =
    `${month} Performance Summary`;
}

function renderSummaryCards(summary) {
  const cards = document.querySelectorAll(".card");

  const keys = ["income", "expenses", "savings"];

  keys.forEach((key, index) => {
    const card = cards[index];
    const trend = calculateTrend(
      summary[key].current,
      summary[key].previous
    );

    const trendSpan = card.querySelector(".trend");
    trendSpan.innerText = `${trend.symbol} ${trend.value}`;
    trendSpan.className = `trend ${trend.direction}`;

    card.querySelector("h2").innerText =
      `${summary[key].current.toLocaleString()}`;

    card.querySelector("p").innerText =
      `Previous: ${summary[key].previous.toLocaleString()}`;
  });
}

function renderHabits(habits) {
  const habitPanel = document.querySelectorAll(".panel")[0];
  habitPanel.querySelectorAll(".habit").forEach(h => h.remove());

  habits.forEach(habit => {
    const div = document.createElement("div");
    div.className = "habit";

    div.innerHTML = `
      <span>${habit.label}</span>
      <span class="${habit.type}">${habit.value}</span>
    `;

    habitPanel.appendChild(div);
  });
}


function renderProfileChanges(changes) {
  const profilePanel = document.querySelectorAll(".panel")[1];
  profilePanel.querySelectorAll(".alert").forEach(a => a.remove());

  changes.forEach(change => {
    const div = document.createElement("div");
    div.className = `alert ${change.type}`;

    div.innerHTML = `
      <strong>${change.title}</strong>
      <p>${change.description}</p>
    `;

    profilePanel.appendChild(div);
  });
}

function renderInsights(insights) {
  const insightCards = document.querySelectorAll(".insight-card");

  const savingsCard = insightCards[0];

  const savingsValues = savingsCard.querySelectorAll(".positive-value");
  savingsValues[0].innerText = `${insights.savings.currentRate}%`;
  savingsValues[1].innerText =
    `↑ ${insights.savings.stabilityImprovement}%`;

  savingsCard.querySelector(".muted").innerText =
    `(from ${insights.savings.previousRate}%)`;

  savingsCard.querySelector(".note").innerText =
    insights.savings.message;

  const portfolioCard = insightCards[1];
  const badge = portfolioCard.querySelector(".risk-badge");

  badge.innerText = insights.portfolio.riskLevel;
  badge.classList.add("risk-high");

  portfolioCard.querySelector(".muted").innerText =
    insights.portfolio.message;


}


function renderGoals(goals) {
  const goalValues = document.querySelectorAll(".goal-card h2");

  goalValues[0].innerText = goals.active;
  goalValues[1].innerText = goals.onTrack;
  goalValues[2].innerText = goals.attention;
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader(monthlyData.month);
  renderSummaryCards(monthlyData.summary);
  renderHabits(monthlyData.habits);
  renderProfileChanges(monthlyData.profileChanges);
  renderInsights(monthlyData.insights);
  renderGoals(monthlyData.goals);
});
