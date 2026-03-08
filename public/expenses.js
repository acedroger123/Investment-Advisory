document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("addModal");
  const openBtn = document.getElementById("openAddModal");
  const closeBtn = document.getElementById("closeModalIcon");
  const cancelBtn = document.getElementById("cancelModal");
  const overlay = document.getElementById("modalOverlay");
  const form = document.getElementById("expenseForm");
  const list = document.getElementById("expenseList");
  const syncBtn = document.getElementById("syncGmailBtn");
  const uploadPdfBtn = document.getElementById("uploadPdfBtn");
  const pdfInput = document.getElementById("pdfUploadInput");
  const aiInsightsContainer = document.getElementById("ai-insights-container");
  const habitText = document.getElementById("habitText");
  const modalTitle = document.getElementById("expenseModalTitle");
  const saveExpenseBtn = document.getElementById("saveExpenseBtn");
  const categoryInput = document.getElementById("category");
  const amountInput = document.getElementById("amount");
  const dateInput = document.getElementById("date");
  const noteInput = document.getElementById("note");

  let expenses = [];
  let editingExpenseId = null;

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

  const todayDateOnly = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const toInputDate = (value) => {
    if (!value) return "";
    const raw = String(value);
    const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";

    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const parseDateOnly = (value) => {
    const raw = String(value ?? "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      const dateObj = new Date(y, m - 1, d);
      if (
        !Number.isNaN(dateObj.getTime()) &&
        dateObj.getFullYear() === y &&
        dateObj.getMonth() === m - 1 &&
        dateObj.getDate() === d
      ) {
        return dateObj;
      }
      return null;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  };

  const inferNature = (category) => {
    const fixedCategories = ["Rent", "EMI", "Insurance", "Loan Payments", "Other - Fixed"];
    const discretionaryCategories = ["Dining Out", "Shopping", "Entertainment", "Subscriptions", "Travel", "Other - Discretionary"];
    if (fixedCategories.includes(category)) return "Fixed";
    if (discretionaryCategories.includes(category)) return "Discretionary";
    return "Variable";
  };

  const messageFromPayload = (payload, fallbackMessage) =>
    payload?.message || payload?.detail?.message || payload?.detail || fallbackMessage;

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

  function renderCategoryStability(rows) {
    const tbody = document.getElementById("categoryStabilityList");
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5;">No stability data yet. Add more expenses across multiple categories.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((r) => {
      const score = Number(r.stablity_score ?? r.stability_score ?? 0);
      const rating = score >= 70
        ? '<span style="color:#4ade80;">✅ Stable</span>'
        : score >= 40
          ? '<span style="color:#fbbf24;">⚠️ Moderate</span>'
          : '<span style="color:#f87171;">❌ Unstable</span>';

      return `<tr>
        <td>${escapeHtml(r.month)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>₹${Number(r.mean_spend ?? 0).toLocaleString("en-IN")}</td>
        <td>${score.toFixed(1)}</td>
        <td>${rating}</td>
      </tr>`;
    }).join("");
  }

  function renderOverspending(rows) {
    const tbody = document.getElementById("overspendingList");
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.5;">No data available.</td></tr>';
      return;
    }

    const flagged = rows.filter((r) => r.is_overspending);
    if (flagged.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#4ade80;">✅ No overspending detected across all categories.</td></tr>';
      return;
    }

    tbody.innerHTML = flagged.map((r) => {
      const d = new Date(r.timestamp);
      const date = Number.isNaN(d.getTime()) ? r.timestamp : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td style="font-weight:600;">₹${Number(r.amount).toLocaleString("en-IN")}</td>
        <td><span style="color:#f87171; font-weight:600;">⚠️ Over Budget</span></td>
      </tr>`;
    }).join("");
  }

  function renderAnomalies(rows) {
    const tbody = document.getElementById("anomalyList");
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.5;">No data available.</td></tr>';
      return;
    }

    const flagged = rows.filter((r) => r.is_anomaly);
    if (flagged.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#4ade80;">✅ No statistical anomalies detected.</td></tr>';
      return;
    }

    tbody.innerHTML = flagged.map((r) => {
      const d = new Date(r.timestamp);
      const date = Number.isNaN(d.getTime()) ? r.timestamp : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td style="font-weight:600;">₹${Number(r.amount).toLocaleString("en-IN")}</td>
        <td><span style="color:#fb923c; font-weight:600;">🚨 Anomaly</span></td>
      </tr>`;
    }).join("");
  }

  function renderClusters(rows) {
    const tbody = document.getElementById("clusterList");
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.5;">No cluster data yet. Add more expenses to enable clustering.</td></tr>';
      return;
    }

    const colorMap = {
      low: { color: "#4ade80", label: "🟢 Low" },
      medium: { color: "#fbbf24", label: "🟡 Medium" },
      high: { color: "#f87171", label: "🔴 High" }
    };

    tbody.innerHTML = rows.map((r) => {
      const d = new Date(r.timestamp);
      const date = Number.isNaN(d.getTime()) ? r.timestamp : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const cluster = String(r.cluster_label || "unknown").toLowerCase();
      const c = colorMap[cluster] || { color: "#a1a1aa", label: cluster };
      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>₹${Number(r.amount).toLocaleString("en-IN")}</td>
        <td><span style="color:${c.color}; font-weight:600;">${c.label}</span></td>
      </tr>`;
    }).join("");
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

    const fallbackMessage = messageFromPayload(habitResponse.data, "Habit engine unavailable right now.");
    habitText.innerHTML = `<p class="expense-insight-empty">${escapeHtml(fallbackMessage)}</p>`;
  }

  function clearDynamicCategories() {
    if (!categoryInput) return;
    const dynamicOptions = categoryInput.querySelectorAll("option[data-dynamic='true']");
    dynamicOptions.forEach((option) => option.remove());
  }

  function ensureCategoryOption(category) {
    if (!categoryInput || !category) return;
    const existing = Array.from(categoryInput.options).some((option) => option.value === category);
    if (existing) return;

    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.setAttribute("data-dynamic", "true");
    categoryInput.appendChild(option);
  }

  function setFormMode(isEdit) {
    if (modalTitle) modalTitle.textContent = isEdit ? "Edit Transaction" : "Add Transaction";
    if (saveExpenseBtn) saveExpenseBtn.textContent = isEdit ? "Update Transaction" : "Save Transaction";
  }

  function closeModalAndReset() {
    editingExpenseId = null;
    setFormMode(false);
    clearDynamicCategories();
    if (form) form.reset();
    if (modal) modal.classList.remove("active");
  }

  function openAddModal() {
    editingExpenseId = null;
    setFormMode(false);
    clearDynamicCategories();
    if (form) form.reset();
    if (modal) modal.classList.add("active");
  }

  function openEditModal(expense) {
    if (!expense) return;
    editingExpenseId = expense.id;
    setFormMode(true);
    ensureCategoryOption(expense.category);

    if (amountInput) amountInput.value = Number(expense.amount || 0);
    if (categoryInput) categoryInput.value = expense.category || "";
    if (dateInput) dateInput.value = toInputDate(expense.date);
    if (noteInput) noteInput.value = expense.note || "";
    if (modal) modal.classList.add("active");
  }

  async function fetchExpenses() {
    try {
      const res = await fetch("/api/expenses", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) window.location.href = "SignIn.html";
        return;
      }

      const rows = await res.json();
      const today = todayDateOnly();
      expenses = (Array.isArray(rows) ? rows : []).filter((expense) => {
        const parsedDate = parseDateOnly(expense.date);
        return parsedDate && parsedDate.getTime() <= today.getTime();
      });

      renderExpenses();
      updateAIInsights();
    } catch (err) {
      console.error("Error fetching expenses:", err);
    }
  }

  function renderExpenses() {
    if (!list) return;
    list.innerHTML = "";

    let total = 0;
    let fixed = 0;
    let discretionary = 0;

    if (!expenses.length) {
      list.innerHTML = '<tr class="empty-row"><td colspan="6">No expenses yet. Add one to get started.</td></tr>';
    }

    expenses.forEach((expense) => {
      const amount = parseFloat(expense.amount);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      total += safeAmount;

      if (expense.nature === "Fixed") fixed += safeAmount;
      if (expense.nature === "Discretionary" || expense.nature === "Variable") discretionary += safeAmount;

      const parsedDate = parseDateOnly(expense.date);
      const formattedDate = parsedDate
        ? parsedDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "-";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(formattedDate)}</td>
        <td><span class="badge" style="background: rgba(99, 102, 241, 0.2); color: var(--color-primary-light); padding: 4px 8px; border-radius: 4px;">${escapeHtml(expense.category || "Miscellaneous")}</span></td>
        <td><span style="font-size: 0.8rem; opacity: 0.7;">${escapeHtml(expense.nature || "Variable")}</span></td>
        <td style="font-weight: 600;">₹${safeAmount.toLocaleString("en-IN")}</td>
        <td style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(expense.note || "")}</td>
        <td class="expense-actions-cell">
          <button type="button" class="expense-action-btn expense-action-edit" data-action="edit" data-id="${expense.id}">Edit</button>
          <button type="button" class="expense-action-btn expense-action-delete" data-action="delete" data-id="${expense.id}">Delete</button>
        </td>
      `;
      list.appendChild(tr);
    });

    const totalEl = document.getElementById("totalAmount");
    const fixedEl = document.getElementById("fixedStat");
    const discEl = document.getElementById("discretionaryStat");

    if (totalEl) totalEl.innerText = `₹${total.toLocaleString("en-IN")}`;
    if (fixedEl) fixedEl.innerText = total ? `${Math.round((fixed / total) * 100)}%` : "0%";
    if (discEl) discEl.innerText = total ? `${Math.round((discretionary / total) * 100)}%` : "0%";
  }

  async function deleteExpense(expenseId) {
    if (!Number.isInteger(expenseId) || expenseId <= 0) return;
    if (!window.confirm("Delete this expense entry?")) return;

    try {
      const response = await fetch(`/api/expenses/${expenseId}`, {
        method: "DELETE",
        credentials: "include"
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        alert(messageFromPayload(payload, "Failed to delete expense"));
        return;
      }

      await fetchExpenses();
    } catch (error) {
      alert("Network error while deleting expense.");
    }
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();

    const amount = Number(amountInput?.value);
    const category = String(categoryInput?.value || "").trim();
    const date = String(dateInput?.value || "").trim();
    const note = String(noteInput?.value || "").trim();

    const parsedDate = parseDateOnly(date);
    if (!parsedDate) {
      alert("Please select a valid expense date.");
      return;
    }
    if (parsedDate.getTime() > todayDateOnly().getTime()) {
      alert("Future-dated expenses are not allowed.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Amount must be a positive number.");
      return;
    }
    if (!category) {
      alert("Please select a category.");
      return;
    }

    let nature = inferNature(category);
    if (editingExpenseId !== null) {
      const existing = expenses.find((item) => Number(item.id) === editingExpenseId);
      if (existing && existing.category === category && existing.nature) {
        nature = existing.nature;
      }
    }

    const endpoint = editingExpenseId === null
      ? "/api/expenses"
      : `/api/expenses/${editingExpenseId}`;
    const method = editingExpenseId === null ? "POST" : "PUT";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, category, date, note, nature })
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        alert(messageFromPayload(payload, "Failed to save expense"));
        return;
      }

      closeModalAndReset();
      await fetchExpenses();
    } catch (error) {
      alert("Network error while saving expense.");
    }
  }

  const handleAction = async (btn, apiEndpoint, method = "GET", body = null) => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';
    btn.disabled = true;
    if (window.lucide) lucide.createIcons();

    try {
      const options = { method, credentials: "include" };
      if (body) options.body = body;

      const response = await fetch(apiEndpoint, options);
      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        alert(`Error: ${messageFromPayload(data, "Request failed")}`);
        return;
      }

      const added = Number(data.found_transactions ?? 0);
      const duplicates = Number(data.duplicates_skipped ?? 0);
      if (Number.isFinite(added) || Number.isFinite(duplicates)) {
        alert(`${data.message || "Completed"} Added ${Math.max(0, added)} transaction(s), skipped ${Math.max(0, duplicates)} duplicate(s).`);
      } else {
        alert(data.message || "Action completed successfully.");
      }
      await fetchExpenses();
    } catch (err) {
      alert("Network error. Please check if backend services are running.");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      if (window.lucide) lucide.createIcons();
    }
  };

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

      renderCategoryStability(financialProfileRes.data.category_stability);
      renderOverspending(financialProfileRes.data.overspending);
      renderAnomalies(financialProfileRes.data.anomaly);
      renderClusters(financialProfileRes.data.expense_clusters);
    } else {
      renderCategoryStability([]);
      renderOverspending([]);
      renderAnomalies([]);
      renderClusters([]);
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

  if (dateInput) {
    dateInput.max = toInputDate(todayDateOnly());
  }

  if (openBtn) openBtn.onclick = openAddModal;
  if (closeBtn) closeBtn.onclick = closeModalAndReset;
  if (overlay) overlay.onclick = closeModalAndReset;
  if (cancelBtn) cancelBtn.onclick = closeModalAndReset;
  if (form) form.onsubmit = handleExpenseSubmit;

  if (list) {
    list.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const expenseId = Number.parseInt(button.dataset.id, 10);
      if (!Number.isInteger(expenseId)) return;

      const action = button.dataset.action;
      if (action === "edit") {
        const expense = expenses.find((item) => Number(item.id) === expenseId);
        openEditModal(expense);
      } else if (action === "delete") {
        await deleteExpense(expenseId);
      }
    });
  }

  if (syncBtn) syncBtn.onclick = () => handleAction(syncBtn, "/api/sync-emails");

  if (uploadPdfBtn && pdfInput) {
    uploadPdfBtn.onclick = () => pdfInput.click();
    pdfInput.onchange = () => {
      const file = pdfInput.files && pdfInput.files[0];
      if (!file) return;

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        alert("Please upload a PDF statement.");
        pdfInput.value = "";
        return;
      }

      const maxBytes = 8 * 1024 * 1024;
      if (file.size > maxBytes) {
        alert("Statement file is too large. Max size is 8MB.");
        pdfInput.value = "";
        return;
      }

      const formData = new FormData();
      formData.append("statement", file);
      handleAction(uploadPdfBtn, "/api/upload-statement", "POST", formData);
      pdfInput.value = "";
    };
  }

  fetchExpenses();
});
