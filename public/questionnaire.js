document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("questionnaireForm");
  const steps = Array.from(document.querySelectorAll(".step"));
  const progressSteps = Array.from(document.querySelectorAll(".progress-step"));

  if (!form || steps.length === 0) return;

  let currentStep = 0;
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitBtnDefaultText = submitBtn ? submitBtn.textContent : "Submit & Finish";

  function showStep(index) {
    currentStep = Math.max(0, Math.min(index, steps.length - 1));

    steps.forEach((step, idx) => {
      step.classList.toggle("active", idx === currentStep);
    });

    progressSteps.forEach((step, idx) => {
      step.classList.toggle("active", idx === currentStep);
      step.classList.toggle("completed", idx < currentStep);
    });
  }

  function toInt(id, fallback = 0) {
    const value = Number.parseInt(document.getElementById(id)?.value ?? "", 10);
    return Number.isFinite(value) ? value : fallback;
  }

  function riskFromAnswers(payload) {
    const score =
      (payload.loss_reaction +
        payload.return_priority +
        payload.volatility_comfort +
        payload.financial_comfort +
        payload.investment_experience) / 5;

    if (score >= 3.5) return 4; // Aggressive
    if (score >= 2.8) return 3; // Moderate
    if (score >= 2.0) return 2; // Conservative
    return 1; // Low
  }

  function buildPayload() {
    const payload = {
      age_group: toInt("age_group", 1),
      occupation: document.getElementById("occupation")?.value || "Other",
      income_range: toInt("income_range", 1),
      savings_percent: toInt("savings_percent", 1),
      investment_experience: toInt("investment_experience", 1),
      instruments_used_count: toInt("instruments_used_count", 0),
      financial_comfort: toInt("financial_comfort", 3),
      loss_reaction: toInt("loss_reaction", 1),
      return_priority: toInt("return_priority", 2),
      volatility_comfort: toInt("volatility_comfort", 2),
      goal: document.getElementById("goal")?.value || "Wealth",
      time_horizon: toInt("time_horizon", 2)
    };

    payload.risk_label = riskFromAnswers(payload);
    return payload;
  }

  async function guardQuestionnaireAccess() {
    try {
      const res = await fetch("/guard/questionnaire", { credentials: "include" });
      if (!res.ok) {
        window.location.href = "SignIn.html";
        return false;
      }

      const data = await res.json().catch(() => ({}));
      if (!data.allowed) {
        window.location.href = "SignIn.html";
        return false;
      }
      return true;
    } catch (err) {
      console.error("Questionnaire guard error:", err);
      window.location.href = "SignIn.html";
      return false;
    }
  }

  window.nextStep = function nextStep() {
    if (currentStep < steps.length - 1) showStep(currentStep + 1);
  };

  window.prevStep = function prevStep() {
    if (currentStep > 0) showStep(currentStep - 1);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = buildPayload();

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    try {
      const res = await fetch("/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "SignIn.html";
          return;
        }
        alert(data.message || "Failed to save questionnaire");
        return;
      }

      window.location.href = "dashboard.html";
    } catch (err) {
      console.error("Questionnaire submit error:", err);
      alert("Server error. Please try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtnDefaultText;
      }
    }
  });

  const allowed = await guardQuestionnaireAccess();
  if (!allowed) return;
  showStep(0);
});
