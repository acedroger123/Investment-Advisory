
document.addEventListener("DOMContentLoaded", async () => {
  // 0. Chart.js Defaults (Safe check)
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#1e293b';
    Chart.defaults.font.family = 'Inter';
  }

  const hlContainer = document.getElementById("highlightsContainer");
  const goalContainer = document.getElementById("goalsProgressContainer");

  // --- 1. FETCH REAL DATA FROM BACKEND ---
  async function fetchReviewData() {
    console.log("Fetching review data...");
    try {
      // Helper for safe fetching
      const safeJson = async (fetchPromise) => {
        try {
          const res = await fetchPromise;
          if (!res.ok) {
            console.warn(`Fetch failed: ${res.status}`);
            return null;
          }
          return await res.json();
        } catch (e) {
          console.warn("Fetch error:", e);
          return null;
        }
      };

      // A. Fetch Income (Profile)
      // Default empty object if fails
      const profile = await safeJson(fetch("/profile/full", { credentials: "include" })) || {};

      // B. Fetch Expenses Aggregations
      // Default empty array if fails (e.g. server down/restarting)
      const breakdown = await safeJson(fetch("/api/expenses/breakdown", { credentials: "include" })) || [];
      const weekly = await safeJson(fetch("/api/expenses/weekly", { credentials: "include" })) || [];

      // Ensure they are arrays (handle 500 error JSON responses)
      const breakdownArr = Array.isArray(breakdown) ? breakdown : [];
      const weeklyArr = Array.isArray(weekly) ? weekly : [];

      // C. Fetch Goals (Investment Goals via FastAPI or Legacy)
      let goals = [];
      try {
        if (window.API && API.Goals) {
          // Try new system first
          goals = await API.Goals.list().catch(() => null);
        }

        // Fallback to legacy if API missing or list returned null
        if (!goals) {
          const g = await safeJson(fetch("/api/goals", { credentials: "include" }));
          goals = Array.isArray(g) ? g : [];
        }
      } catch (e) {
        console.warn("Goals fetch error:", e);
        goals = [];
      }
      if (!Array.isArray(goals)) goals = [];

      // D. Fetch Goal Progress
      const goalProgressData = await fetchGoalProgress(goals);

      console.log("Processing data:", {
        profile: !!profile,
        breakdown: breakdownArr.length,
        weekly: weeklyArr.length,
        goals: goalProgressData.length
      });

      processAndRender(profile, breakdownArr, weeklyArr, goalProgressData);

    } catch (err) {
      console.error("Critical Review Data Load Error:", err);
      // Ensure UI shows something even if criticial fail
      processAndRender({}, [], [], []);
    }
  }

  async function fetchGoalProgress(goals) {
    if (!goals || goals.length === 0) return [];

    const promises = goals.map(async (g) => {
      try {
        // Try to get portfolio summary for investment goals
        if (window.API && API.Portfolio) {
          const portfolio = await API.Portfolio.get(g.id);
          return {
            name: g.name,
            target: parseFloat(g.target_value || g.target_amount || 0),
            current: parseFloat(portfolio.summary?.total_current_value || 0),
            progress: portfolio.summary?.progress_percentage || 0
          };
        } else {
          throw new Error("No API");
        }
      } catch (e) {
        // Fallback for legacy goals (no portfolio data)
        return {
          name: g.name,
          target: parseFloat(g.target_value || g.target_amount || 0),
          current: 0,
          progress: 0
        };
      }
    });

    return await Promise.all(promises);
  }

  // --- 2. PROCESSING LOGIC ---
  function processAndRender(profile, breakdown, weekly, goalsData) {
    // --- Calculate Totals ---
    const totalExpenses = breakdown.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);

    // Estimate Income
    let monthlyIncome = 60000; // Default fallback
    if (profile && profile.annual_income_range) {
      try {
        const match = profile.annual_income_range.match(/(\d+)/);
        if (match) {
          const lowerLakhs = parseInt(match[1], 10);
          monthlyIncome = (lowerLakhs * 100000) / 12;
        }
      } catch (e) { console.warn("Income parse error", e); }
    }

    const saved = monthlyIncome - totalExpenses;
    const savingsRate = monthlyIncome > 0 ? Math.round((saved / monthlyIncome) * 100) : 0;

    // --- Render KPI Stats ---
    updateText("incomeVal", formatCurrency(monthlyIncome));
    updateText("expensesVal", formatCurrency(totalExpenses));
    updateText("savedVal", formatCurrency(saved));
    updateText("rateVal", `${savingsRate}%`);

    // --- Render Highlights ---
    renderHighlights(hlContainer, totalExpenses, breakdown, weekly);

    // --- Render Goals ---
    renderGoals(goalContainer, goalsData);

    // --- Render Charts ---
    renderCharts(breakdown, weekly);
  }

  function updateText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  function renderHighlights(container, totalExpenses, breakdown, weekly) {
    if (!container) return;
    container.innerHTML = "";

    const highlights = [];

    // 1. Expense Alert
    const avgWeekly = totalExpenses / 4;
    const currentWeekTotal = weekly.reduce((sum, d) => sum + parseFloat(d.total || 0), 0);

    if (currentWeekTotal > avgWeekly * 1.2 && avgWeekly > 0) {
      highlights.push({ text: "Alert: This week's spending is 20% above average.", type: "neg" });
    } else if (currentWeekTotal < avgWeekly * 0.8 && currentWeekTotal > 0) {
      highlights.push({ text: "Great! Spending is below weekly average.", type: "pos" });
    }

    // 2. Category Alert
    const sortedCats = [...breakdown].sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
    if (sortedCats.length > 0) {
      const topCat = sortedCats[0];
      highlights.push({ text: `Top spending: ${topCat.category} (${formatCurrency(topCat.total)})`, type: "neutral" });
    }

    if (highlights.length === 0) {
      highlights.push({ text: "No special alerts for this month yet.", type: "neutral" });
    }

    // Render
    highlights.forEach(h => {
      const div = document.createElement("div");
      div.className = `highlight-item ${h.type === 'pos' ? 'highlight-positive' : h.type === 'neg' ? 'highlight-negative' : ''}`;
      const icon = h.type === 'pos' ? '📈' : h.type === 'neg' ? '⚠️' : 'ℹ️';
      div.innerHTML = `<span>${icon}</span> <span>${h.text}</span>`;
      container.appendChild(div);
    });
  }

  function renderGoals(container, goals) {
    if (!container) return;
    container.innerHTML = "";

    if (goals.length === 0) {
      container.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:0.9rem;">No active goals found.</div>';
      return;
    }

    goals.slice(0, 3).forEach(g => {
      let percent = g.target > 0 ? (g.current / g.target) * 100 : 0;
      percent = Math.min(100, Math.max(0, percent));

      const div = document.createElement("div");
      div.className = "goal-row";
      div.innerHTML = `
              <div class="goal-header">
                <span>${g.name}</span>
                <span style="color: var(--text-muted)">${formatCurrency(g.current)} / ${formatCurrency(g.target)}</span>
              </div>
              <div class="goal-track">
                <div class="goal-fill" style="width: ${percent}%; background-color: var(--color-accent-blue, #3b82f6);"></div>
              </div>
            `;
      container.appendChild(div);
    });
  }

  function renderCharts(breakdown, weekly) {
    if (typeof Chart === 'undefined') return;

    // Pie Chart (Expenses)
    const categories = breakdown.map(b => b.category);
    const data = breakdown.map(b => parseFloat(b.total || 0));

    const pieCtx = document.getElementById('categoryPie');
    if (pieCtx) {
      // Destroy existing chart if stored on canvas property
      if (pieCtx.chartInstance) pieCtx.chartInstance.destroy();

      pieCtx.chartInstance = new Chart(pieCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: categories.length ? categories : ['No Data'],
          datasets: [{
            data: data.length ? data : [1], // Placeholder if empty
            backgroundColor: data.length ? ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] : ['#1e293b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'right', labels: { usePointStyle: true, color: '#94a3b8' } }
          }
        }
      });
    }

    // Weekly Bar Chart
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weeklyData = new Array(7).fill(0);

    weekly.forEach(item => {
      const idx = parseInt(item.day_idx); // 0-6
      if (!isNaN(idx) && idx >= 0 && idx < 7) {
        weeklyData[idx] = parseFloat(item.total || 0);
      }
    });

    const barCtx = document.getElementById('weeklyBar');
    if (barCtx) {
      if (window.myBarChart) window.myBarChart.destroy();

      window.myBarChart = new Chart(barCtx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: days.map(d => d.substring(0, 3)),
          datasets: [{
            label: 'Spending',
            data: weeklyData,
            backgroundColor: '#3b82f6',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v) => '₹' + v.toLocaleString(), color: '#94a3b8' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: {
              ticks: { color: '#94a3b8' },
              grid: { display: false }
            }
          }
        }
      });
    }
  }

  function formatCurrency(val) {
    if (window.formatCurrency) return window.formatCurrency(val);
    return '₹' + (val || 0).toLocaleString('en-IN');
  }

  fetchReviewData();
});