document.addEventListener("DOMContentLoaded", () => {
  // --- DOM ELEMENTS (Updated IDs to match new white box) ---
  const modal = document.getElementById("addModal");
  const openBtn = document.getElementById("openAddModal");
  // Updated to match the top-right 'X' icon
  const closeBtn = document.getElementById("closeModalIcon");
  const form = document.getElementById("expenseForm");
  const list = document.getElementById("expenseList");
  const syncBtn = document.getElementById("syncGmailBtn");
  const aiInsightsContainer = document.getElementById("ai-insights-container");
  const habitText = document.getElementById("habitText");

  // State to hold real expenses from Database
  let expenses = [];

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatINR = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "₹0";
    return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  async function fetchJson(endpoint) {
    try {
      const response = await fetch(endpoint, { credentials: "include" });
      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { message: "Network error", detail: String(error) } };
    }
  }

  function renderAIInsights(cards) {
    if (!aiInsightsContainer) return;

    if (!Array.isArray(cards) || cards.length === 0) {
      aiInsightsContainer.innerHTML = '<p class="expense-insight-empty">No AI insights available right now.</p>';
      return;
    }

    aiInsightsContainer.innerHTML = cards
      .slice(0, 5)
      .map((card) => `
        <div class="expense-insight-item">
          <div class="expense-insight-title">${escapeHtml(card.title)}</div>
          <div class="expense-insight-text">${escapeHtml(card.text)}</div>
        </div>
      `)
      .join("");
  }

  function renderHabitDetection(habitResponse) {
    if (!habitText) return;

    if (habitResponse.ok) {
      const payload = habitResponse.data || {};
      const confidenceRaw = Number(payload.habit_confidence ?? 0);
      const confidencePct = Number.isFinite(confidenceRaw)
        ? Math.round((confidenceRaw <= 1 ? confidenceRaw * 100 : confidenceRaw))
        : 0;
      const intervention = payload.intervention_level || "Low";
      const summary = payload.unified_summary || "Habit analysis completed.";
      const conflictScoreRaw = Number(payload.goal_conflict?.overall_conflict_score);
      const conflictScore = Number.isFinite(conflictScoreRaw)
        ? `${(conflictScoreRaw * 100).toFixed(1)}%`
        : "N/A";
      const alerts = Array.isArray(payload.transaction_alert) ? payload.transaction_alert : [];

      habitText.innerHTML = `
        <div class="expense-habit-metric">
          <strong>Intervention:</strong> ${escapeHtml(intervention)}
          <span>|</span>
          <strong>Confidence:</strong> ${confidencePct}%
          <span>|</span>
          <strong>Goal Conflict:</strong> ${escapeHtml(conflictScore)}
        </div>
        <div class="expense-habit-summary">${escapeHtml(summary)}</div>
        ${alerts.length > 0
          ? `<ul class="expense-habit-alerts">${alerts
            .slice(0, 3)
            .map((alert) => `<li>${escapeHtml(alert)}</li>`)
            .join("")}</ul>`
          : ""}
      `;
      return;
    }

    const fallbackMessage =
      habitResponse.data?.message ||
      habitResponse.data?.detail?.message ||
      habitResponse.data?.detail ||
      "Habit engine unavailable right now.";

    habitText.innerHTML = `<p class="expense-insight-empty">${escapeHtml(fallbackMessage)}</p>`;
  }

  // --- 1. MODAL LOGIC (Using .active class — matches goal modal) ---
  if (openBtn) openBtn.onclick = () => modal.classList.add("active");
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove("active");
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.onclick = () => modal.classList.remove("active");

  // --- 2. FETCH FROM DATABASE ---
  async function fetchExpenses() {
    try {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) window.location.href = "SignIn.html";
        return;
      }
      expenses = await res.json();
      renderExpenses();

      // TRIGGER AI ANALYSIS REFRESH
      updateAIInsights();
    } catch (err) {
      console.error("Error fetching expenses:", err);
    }
  }

  // --- 3. RENDER LOGIC ---
  function renderExpenses() {
    if (!list) return;
    list.innerHTML = "";
    let total = 0;
    let fixed = 0;
    let discretionary = 0;

    expenses.forEach(e => {
      const amount = parseFloat(e.amount);
      total += amount;

      // Logic for Stability Model features (Fixed vs Discretionary)
      if (e.nature === "Fixed") fixed += amount;
      if (e.nature === "Discretionary" || e.nature === "Variable") discretionary += amount;

      const dateObj = new Date(e.date);
      const formattedDate = dateObj.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formattedDate}</td>
        <td><span class="badge" style="background: rgba(99, 102, 241, 0.2); color: var(--color-primary-light); padding: 4px 8px; border-radius: 4px;">${e.category}</span></td>
        <td><span style="font-size: 0.8rem; opacity: 0.7;">${e.nature}</span></td>
        <td style="font-weight: 600;">₹${amount.toLocaleString('en-IN')}</td>
        <td style="color: var(--text-muted); font-size: 0.9rem;">${e.note || ''}</td>
      `;
      list.appendChild(tr);
    });

    // Update KPI Cards on the Expense Page
    const totalEl = document.getElementById("totalAmount");
    const fixedEl = document.getElementById("fixedStat");
    const discEl = document.getElementById("discretionaryStat");

    if (totalEl) totalEl.innerText = `₹${total.toLocaleString('en-IN')}`;
    if (fixedEl) fixedEl.innerText = total ? Math.round((fixed / total) * 100) + "%" : "0%";
    if (discEl) discEl.innerText = total ? Math.round((discretionary / total) * 100) + "%" : "0%";
  }

  // --- 4. MANUAL ADD EXPENSE ---
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();

      const amount = Number(document.getElementById("amount").value);
      const category = document.getElementById("category").value;
      const date = document.getElementById("date").value;
      const note = document.getElementById("note").value;

      // AUTO-ASSIGN NATURE for ML Features
      let nature = "Variable";
      if (["Rent", "Utilities", "EMI", "Insurance", "Bills"].includes(category)) nature = "Fixed";
      else if (["Entertainment", "Shopping", "Dining Out"].includes(category)) nature = "Discretionary";

      try {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount, category, date, note, nature })
        });

        if (res.ok) {
          modal.classList.remove("active");
          form.reset();
          fetchExpenses(); // Refresh table from PostgreSQL
        }
      } catch (err) {
        console.error("Error adding expense:", err);
      }
    };
  }

  // --- 5. SYNC GMAIL & PDF UPLOAD ---
  const handleAction = async (btn, apiEndpoint, method = "GET", body = null) => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';
    btn.disabled = true;
    if (window.lucide) lucide.createIcons();

    try {
      const options = { method, credentials: "include" };
      if (body) options.body = body;

      const response = await fetch(apiEndpoint, options);
      const data = await response.json();

      if (response.ok) {
        alert(`Success! Found ${data.found_transactions} transactions.`);
        fetchExpenses();
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Network error. Please check if Python APIs are running.");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      if (window.lucide) lucide.createIcons();
    }
  };

  if (syncBtn) syncBtn.onclick = () => handleAction(syncBtn, "/api/sync-emails");

  const uploadPdfBtn = document.getElementById("uploadPdfBtn");
  const pdfInput = document.getElementById("pdfUploadInput");

  if (uploadPdfBtn && pdfInput) {
    uploadPdfBtn.onclick = () => pdfInput.click();
    pdfInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("statement", file);
      handleAction(uploadPdfBtn, "/api/upload-statement", "POST", formData);
      pdfInput.value = "";
    };
  }

  // --- 6. SYNC WITH PYTHON ML MODELS ---
  async function updateAIInsights() {
    renderAIInsights([{ title: "Loading AI insights...", text: "Analyzing your recent expenses." }]);
    if (habitText) {
      habitText.innerHTML = '<p class="expense-insight-empty">Running habit detection...</p>';
    }

    const shouldRunHabitEngine = expenses.length >= 2;
    const [financialProfileRes, aiAnalysisRes, habitRes] = await Promise.all([
      fetchJson("/api/get-financial-profile"),
      fetchJson("/api/ai-analysis"),
      shouldRunHabitEngine
        ? fetchJson("/api/habit-goalconflict")
        : Promise.resolve({
          ok: false,
          status: 400,
          data: { message: "Add at least 2 expenses to detect habits." }
        })
    ]);

    const cards = [];

    if (financialProfileRes.ok && financialProfileRes.data?.financial_profile) {
      const fp = financialProfileRes.data.financial_profile;
      const confidenceRaw = Number(fp.confidence ?? 0);
      const confidencePct = Number.isFinite(confidenceRaw)
        ? `${Math.round((confidenceRaw <= 1 ? confidenceRaw * 100 : confidenceRaw))}%`
        : "N/A";
      cards.push({
        title: `Financial Profile: ${fp.profile_label || "Unknown"}`,
        text: `Spending stability ${Number(fp.stability_score || 0).toFixed(1)}% with confidence ${confidencePct}.`
      });
    }

    if (aiAnalysisRes.ok && Array.isArray(aiAnalysisRes.data?.suggestions)) {
      aiAnalysisRes.data.suggestions.slice(0, 2).forEach((insight) => {
        cards.push({
          title: insight.title || "AI Insight",
          text: insight.text || "No details provided."
        });
      });
    }

    if (habitRes.ok) {
      const monthlyDirection = habitRes.data?.ai_guidance?.monthly_strategic_direction;
      const primaryStrategy = habitRes.data?.primary_strategy;
      const impact = habitRes.data?.ai_guidance?.impact_summary;

      if (primaryStrategy) {
        cards.push({
          title: "Primary Strategy",
          text: primaryStrategy
        });
      }

      if (monthlyDirection) {
        cards.push({
          title: "Monthly Direction",
          text: monthlyDirection
        });
      }

      if (impact && Number.isFinite(Number(impact.potential_savings_monthly))) {
        cards.push({
          title: "Potential Impact",
          text: `Save around ${formatINR(impact.potential_savings_monthly)}/month, cover ${Number(
            impact.goal_gap_covered_pct || 0
          ).toFixed(1)}% gap, reduce timeline by ${Number(
            impact.timeline_reduction_months || 0
          ).toFixed(1)} months.`
        });
      }
    }

    renderAIInsights(cards);
    renderHabitDetection(habitRes);

    if (!financialProfileRes.ok && !aiAnalysisRes.ok && !habitRes.ok) {
      console.warn("AI services unreachable. Ensure Python APIs are running.");
    }
  }

  // Initial Load
  fetchExpenses();
});
