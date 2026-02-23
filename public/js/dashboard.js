/**
 * Dashboard JavaScript - Main dashboard functionality
 * Per-goal stock allocation mode
 */

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    await loadGoals();
    await loadSurveyProfile();
    setupEventListeners();
    setDefaultDeadline();
    await loadExpenseDashboardWidgets();
});

let currentGoalId = null;
const expenseChartInstances = {};

const incomeRangeLabel = {
    1: 'Below 20,000/month',
    2: '20,000-50,000/month',
    3: '50,000-100,000/month',
    4: 'Above 100,000/month'
};

const savingsBucketLabel = {
    1: 'Less than 10%',
    2: '10-20%',
    3: '21-30%',
    4: 'More than 30%'
};

const riskLabelMap = {
    1: 'Low',
    2: 'Conservative',
    3: 'Moderate',
    4: 'Aggressive'
};

const timeHorizonLabel = {
    1: 'Less than 3 years',
    2: '3-5 years',
    3: '6-10 years',
    4: 'More than 10 years'
};

/**
 * Load all goals into the selector
 */
async function loadGoals() {
    try {
        const goals = await API.Goals.list();
        const select = document.getElementById('goalSelect');

        // Clear existing options (keep the first one)
        select.innerHTML = '<option value="">Select a goal...</option>';

        goals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = `${goal.name} (Target: ${formatCurrency(goal.target_value)})`;
            select.appendChild(option);
        });

        // Check for goalId in URL parameter, otherwise auto-select first goal
        const urlParams = new URLSearchParams(window.location.search);
        const goalIdParam = urlParams.get('goalId');

        if (goalIdParam && goals.some(g => g.id == goalIdParam)) {
            select.value = goalIdParam;
        } else if (goals.length > 0) {
            select.value = goals[0].id;
        }

        if (select.value) {
            await loadGoalData();
        }
    } catch (error) {
        console.error('Error loading goals:', error);
        showToast('Failed to load goals', 'error');
    }
}

/**
 * Load data for selected goal
 */
async function loadGoalData() {
    const select = document.getElementById('goalSelect');
    currentGoalId = select.value;

    if (!currentGoalId) {
        updateFeasibilitySummary(null);
        renderHabitConflictSummary(null, 'Select a goal to load habit intelligence.');
        await loadExpenseDashboardWidgets();
        return;
    }

    try {
        // Load goal-specific portfolio data
        const [portfolio, recommendations, goal, habitInsights] = await Promise.all([
            API.Portfolio.get(currentGoalId),
            API.Recommendations.get(currentGoalId).catch(() => ({ recommendations: [] })),
            API.Goals.get(currentGoalId).catch(() => null),
            API.Insights.getHabitGoalConflict().catch(() => null)
        ]);

        // Update stats cards
        updateStatsCards(portfolio.summary);



        // Update recommendations (stock engine first, habit engine fallback)
        updateRecommendations(recommendations, habitInsights);

        // Load goal progress gauge
        if (portfolio.summary) {
            Charts.createProgressGauge('progressGauge', portfolio.summary.progress_percentage || 0, 'Goal Progress');
        }

        // Load feasibility status for the selected goal
        const feasibilityPayload = {
            target_amount: goal?.target_amount ?? portfolio?.summary?.target_value,
            deadline: goal?.deadline ?? portfolio?.summary?.deadline
        };
        const feasibility = await API.Goals.assessFeasibility(feasibilityPayload).catch(() => null);
        updateFeasibilitySummary(feasibility);
        await loadHabitGoalConflictSummary();

        // Run all remaining chart/data loads in parallel
        await Promise.all([
            updateCharts(portfolio),
            loadGrowthChart(currentGoalId),
            loadRiskChart(currentGoalId),
            loadAlerts(currentGoalId),
            loadExpenseDashboardWidgets()
        ]);

    } catch (error) {
        console.error('Error loading goal data:', error);
        showToast('Failed to load goal data', 'error');
        renderHabitConflictSummary(null, 'Habit intelligence unavailable right now.');
    }
}

async function loadSurveyProfile() {
    const summaryEl = document.getElementById('surveyProfileSummary');
    if (!summaryEl) return;

    try {
        const profile = await API.UserProfile.getSurveyProfile();
        if (!profile || !profile.questionnaire_completed) {
            summaryEl.innerHTML = '<p class="survey-profile-empty">Complete onboarding questionnaire to personalize this dashboard.</p>';
            return;
        }

        const incomeText = incomeRangeLabel[profile.annual_income_range] || `Range ${profile.annual_income_range || '--'}`;
        const savingsText = savingsBucketLabel[profile.savings_percent] || `${Math.round((profile.savings_ratio || 0) * 100)}%`;
        const riskText = riskLabelMap[profile.risk_label] || `Level ${profile.risk_label || '--'}`;
        const horizonText = timeHorizonLabel[profile.time_horizon] || `Bucket ${profile.time_horizon || '--'}`;
        const goalText = profile.goal || '--';
        const occupationText = profile.occupation || '--';
        const annualEstimate = Number(profile.annual_income_estimate || 0);
        const annualEstimateText = annualEstimate > 0 ? `${formatCurrency(annualEstimate)}/year est.` : 'Not set';

        summaryEl.innerHTML = `
            <div class="survey-profile-grid">
                <div class="survey-profile-tile">
                    <span class="survey-profile-label">Occupation</span>
                    <span class="survey-profile-value">${occupationText}</span>
                </div>
                <div class="survey-profile-tile">
                    <span class="survey-profile-label">Income</span>
                    <span class="survey-profile-value">${incomeText}</span>
                    <span class="survey-profile-subvalue">${annualEstimateText}</span>
                </div>
                <div class="survey-profile-tile">
                    <span class="survey-profile-label">Savings Habit</span>
                    <span class="survey-profile-value">${savingsText}</span>
                </div>
                <div class="survey-profile-tile">
                    <span class="survey-profile-label">Risk Profile</span>
                    <span class="survey-profile-value">${riskText}</span>
                </div>
                <div class="survey-profile-tile">
                    <span class="survey-profile-label">Primary Goal</span>
                    <span class="survey-profile-value">${goalText}</span>
                </div>
                <div class="survey-profile-tile">
                    <span class="survey-profile-label">Horizon</span>
                    <span class="survey-profile-value">${horizonText}</span>
                </div>
            </div>
        `;
    } catch (error) {
        console.warn('Error loading survey profile:', error);
        summaryEl.innerHTML = '<p class="survey-profile-empty">Survey profile unavailable right now.</p>';
    }
}

/**
 * Update stats cards with portfolio data
 */
function updateStatsCards(summary) {
    if (!summary) return;

    const unrealizedPct = summary.unrealized_pnl_percentage ?? summary.pnl_percentage ?? 0;
    const totalPct = summary.total_pnl_percentage ?? unrealizedPct;

    // Portfolio Value
    document.getElementById('portfolioValue').textContent = formatCurrency(summary.total_current_value);

    const changeEl = document.getElementById('portfolioChange');
    changeEl.textContent = formatPercent(unrealizedPct);
    changeEl.className = `stat-change ${unrealizedPct >= 0 ? 'positive' : 'negative'}`;

    // Goal Progress
    document.getElementById('goalProgress').textContent = `${(summary.progress_percentage || 0).toFixed(1)}%`;
    document.getElementById('targetAmount').textContent = `Target: ${formatCurrency(summary.target_value)}`;

    // Total P&L
    document.getElementById('totalPnl').textContent = formatCurrency(summary.total_pnl);

    const pnlPercentEl = document.getElementById('pnlPercent');
    pnlPercentEl.textContent = formatPercent(totalPct);
    pnlPercentEl.className = `stat-change ${totalPct >= 0 ? 'positive' : 'negative'}`;

    // Days Remaining
    document.getElementById('daysRemaining').textContent = summary.days_remaining || 0;
    document.getElementById('deadline').textContent = `Deadline: ${formatDate(summary.deadline)}`;
}

function updateFeasibilitySummary(feasibility) {
    const el = document.getElementById('goalFeasibility');
    if (!el) return;

    if (!feasibility || !feasibility.feasibility) {
        el.textContent = 'Feasibility: Unavailable';
        return;
    }

    const confidence = Number(feasibility.confidence_score ?? 0).toFixed(1);
    el.textContent = `Feasibility: ${feasibility.feasibility} (${confidence}%)`;
}

async function loadHabitGoalConflictSummary() {
    try {
        const data = await API.Insights.getHabitGoalConflict();
        renderHabitConflictSummary(data);
    } catch (error) {
        console.warn('Error loading habit goal-conflict insights:', error);
        renderHabitConflictSummary(null, 'Habit-goal conflict engine is offline or missing input data.');
    }
}

function renderHabitConflictSummary(data, fallbackMessage = null) {
    const summaryEl = document.getElementById('habitConflictDashboardSummary');
    const metaEl = document.getElementById('habitConflictDashboardMeta');
    const roadmapEl = document.getElementById('habitConflictDashboardRoadmap');

    if (!summaryEl || !metaEl || !roadmapEl) return;

    if (!data) {
        summaryEl.textContent = fallbackMessage || 'No habit-goal conflict data available.';
        metaEl.textContent = '';
        roadmapEl.innerHTML = '';
        return;
    }

    const summary = data.unified_summary || 'No major habit-goal conflict detected for this cycle.';
    const alignment = data.ai_guidance?.financial_alignment_score || {};
    const impact = data.ai_guidance?.impact_summary || {};
    const conflictScore = Number(data.goal_conflict?.overall_conflict_score ?? 0);

    summaryEl.textContent = summary;
    metaEl.innerHTML = `
        <div><strong>Conflict Score:</strong> ${(conflictScore * 100).toFixed(1)}%</div>
        <div><strong>Alignment:</strong> ${alignment.label || '--'} (${Number(alignment.score_pct || 0).toFixed(1)}%)</div>
        <div><strong>Potential Savings:</strong> ${formatCurrency(impact.potential_savings_monthly || 0)}/month</div>
    `;

    roadmapEl.innerHTML = '';
    const roadmap = Array.isArray(data.ai_guidance?.personalized_roadmap_suggestion)
        ? data.ai_guidance.personalized_roadmap_suggestion
        : [];

    roadmap.slice(0, 3).forEach(step => {
        const li = document.createElement('li');
        li.style.marginBottom = '6px';
        li.textContent = step;
        roadmapEl.appendChild(li);
    });
}

function destroyExpenseChart(chartId) {
    if (expenseChartInstances[chartId]) {
        expenseChartInstances[chartId].destroy();
        delete expenseChartInstances[chartId];
    }
}

function setExpenseChartEmptyState(elementId, message, isVisible) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('hidden', !isVisible);
}

function setExpenseBehaviorMessage(message, isError = false) {
    const behaviorEl = document.getElementById('expenseBehaviorMessage');
    if (!behaviorEl) return;
    behaviorEl.textContent = message;
    behaviorEl.style.color = isError ? 'var(--color-accent-red)' : '#9fb8ff';
}

async function fetchDashboardJson(url) {
    const response = await fetch(url, { credentials: 'include' });
    let data = {};
    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    return data;
}

function normalizeExpenseRows(expenses) {
    return (Array.isArray(expenses) ? expenses : [])
        .map((row) => ({
            amount: Number(row.amount || 0),
            category: row.category || 'Other',
            date: row.date ? new Date(row.date) : null
        }))
        .filter((row) => Number.isFinite(row.amount) && row.amount > 0 && row.date && !Number.isNaN(row.date.getTime()));
}

function aggregateSpendingByDate(expenses, maxPoints = 14) {
    const map = new Map();

    expenses.forEach((row) => {
        const key = row.date.toISOString().slice(0, 10);
        map.set(key, (map.get(key) || 0) + row.amount);
    });

    return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-maxPoints)
        .map(([dateKey, total]) => ({
            label: new Date(dateKey).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
            value: Number(total.toFixed(2))
        }));
}

function aggregateSpendingByCategory(expenses, maxBuckets = 6) {
    const map = new Map();
    expenses.forEach((row) => {
        const key = String(row.category || 'Other').trim() || 'Other';
        map.set(key, (map.get(key) || 0) + row.amount);
    });

    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1]);

    const top = sorted.slice(0, maxBuckets);
    const rest = sorted.slice(maxBuckets);
    const otherTotal = rest.reduce((sum, [, value]) => sum + value, 0);

    if (otherTotal > 0) {
        top.push(['Other', otherTotal]);
    }

    return top.map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
}

function renderSpendingTrendChart(expenses) {
    const canvas = document.getElementById('spendingTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const points = aggregateSpendingByDate(expenses);
    const hasData = points.length > 0;
    setExpenseChartEmptyState('spendingTrendEmpty', 'Add expenses to view spending trends.', !hasData);

    destroyExpenseChart('spendingTrendChart');
    if (!hasData) return;

    expenseChartInstances.spendingTrendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: points.map((point) => point.label),
            datasets: [{
                label: 'Daily Spend',
                data: points.map((point) => point.value),
                borderColor: '#4e7cff',
                backgroundColor: 'rgba(78, 124, 255, 0.14)',
                pointBackgroundColor: '#7ea3ff',
                pointBorderColor: '#7ea3ff',
                pointRadius: 2.5,
                pointHoverRadius: 5,
                borderWidth: 2,
                fill: true,
                tension: 0.35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Spent: ${formatCurrency(ctx.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148, 163, 184, 0.12)' },
                    ticks: {
                        color: '#94a3b8',
                        callback: (value) => formatCurrency(value)
                    }
                }
            }
        }
    });
}

function renderExpenseBreakdownChart(expenses) {
    const canvas = document.getElementById('expenseBreakdownChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const buckets = aggregateSpendingByCategory(expenses);
    const hasData = buckets.length > 0;
    setExpenseChartEmptyState('expenseBreakdownEmpty', 'Add expenses to view category mix.', !hasData);

    destroyExpenseChart('expenseBreakdownChart');
    if (!hasData) return;

    const palette = ['#4e7cff', '#7a67ff', '#24c4ff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];
    expenseChartInstances.expenseBreakdownChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: buckets.map((item) => item.name),
            datasets: [{
                data: buckets.map((item) => item.value),
                backgroundColor: palette.slice(0, buckets.length),
                borderColor: '#0f1322',
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#9aa8c7',
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 14
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}`
                    }
                }
            }
        }
    });
}

async function loadExpenseDashboardWidgets() {
    const trendCanvas = document.getElementById('spendingTrendChart');
    const breakdownCanvas = document.getElementById('expenseBreakdownChart');
    if (!trendCanvas || !breakdownCanvas) return;

    setExpenseBehaviorMessage('AI: Loading behavioral analysis...');

    let normalizedExpenses = [];
    let expenseLoadError = null;
    try {
        const expenseData = await fetchDashboardJson('/api/expenses');
        normalizedExpenses = normalizeExpenseRows(expenseData);
    } catch (error) {
        expenseLoadError = error;
        console.warn('Unable to load expenses for dashboard widgets:', error.message);
    }

    renderSpendingTrendChart(normalizedExpenses);
    renderExpenseBreakdownChart(normalizedExpenses);

    if (expenseLoadError) {
        setExpenseChartEmptyState('spendingTrendEmpty', 'Unable to load expenses right now.', true);
        setExpenseChartEmptyState('expenseBreakdownEmpty', 'Unable to load expenses right now.', true);
        setExpenseBehaviorMessage(`AI: ${expenseLoadError.message || 'Behavioral analysis unavailable right now.'}`, true);
        return;
    }

    if (normalizedExpenses.length === 0) {
        setExpenseBehaviorMessage('AI: Add expenses to activate behavioral analysis.');
        return;
    }

    const shouldRunHabitEngine = normalizedExpenses.length >= 2;
    const [habitResult, profileResult] = await Promise.all([
        shouldRunHabitEngine
            ? fetchDashboardJson('/api/habit-goalconflict').then((data) => ({ ok: true, data })).catch((error) => ({ ok: false, error }))
            : Promise.resolve({ ok: false, error: new Error('Add at least 2 expenses to run habit analysis.') }),
        fetchDashboardJson('/api/get-financial-profile').then((data) => ({ ok: true, data })).catch((error) => ({ ok: false, error }))
    ]);

    if (habitResult.ok && habitResult.data) {
        const summary = habitResult.data.unified_summary || 'Behavioral analysis completed.';
        const conflictScore = Number(habitResult.data.goal_conflict?.overall_conflict_score ?? 0);
        const suffix = Number.isFinite(conflictScore) ? ` (Conflict ${(conflictScore * 100).toFixed(1)}%)` : '';
        setExpenseBehaviorMessage(`AI: ${summary}${suffix}`);
        return;
    }

    if (profileResult.ok && profileResult.data?.financial_profile) {
        const profile = profileResult.data.financial_profile;
        const score = Number(profile.stability_score ?? 0).toFixed(1);
        const label = profile.profile_label || 'Unknown';
        setExpenseBehaviorMessage(`AI: ${label} spending profile with ${score}% stability.`);
        return;
    }

    const fallback = habitResult.error?.message || profileResult.error?.message || 'Behavioral analysis unavailable right now.';
    setExpenseBehaviorMessage(`AI: ${fallback}`, true);
}




/**
 * Update charts
 */
async function updateCharts(portfolio) {
    // Portfolio value chart
    try {
        const history = await API.Portfolio.getHistory(currentGoalId, 30);
        if (history && history.length > 0) {
            Charts.createPortfolioChart('portfolioChart', history, portfolio.summary?.target_value);
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }

    // Allocation chart
    if (portfolio.allocation && portfolio.allocation.length > 0) {
        Charts.createAllocationChart('allocationChart', portfolio.allocation);
    }

    // Drawdown chart
    await loadDrawdownChart(currentGoalId);
}

/**
 * Load growth chart (Required vs Actual)
 */
async function loadGrowthChart(goalId) {
    try {
        const growthData = await API.Portfolio.getRequiredGrowth(goalId);
        if (growthData && !growthData.error) {
            Charts.createDualGrowthChart(
                'growthChart',
                growthData.required_curve || [],
                growthData.actual_curve || [],
                growthData.target_value
            );
        }
    } catch (error) {
        console.error('Error loading growth chart:', error);
    }
}

/**
 * Load drawdown chart for a specific goal
 */
async function loadDrawdownChart(goalId) {
    if (!goalId) return;
    try {
        const drawdown = await API.Portfolio.getDrawdown(goalId, 90);
        if (drawdown && drawdown.drawdown_data) {
            Charts.createDrawdownChart('drawdownChart', drawdown.drawdown_data);

            // Update badges
            document.getElementById('maxDrawdown').textContent = `Max: ${drawdown.max_drawdown?.toFixed(1) || 0}%`;
            document.getElementById('currentDrawdown').textContent = `Current: ${drawdown.current_drawdown?.toFixed(1) || 0}%`;
        }
    } catch (error) {
        console.error('Error loading drawdown:', error);
    }
}

/**
 * Load risk chart for a specific goal
 */
async function loadRiskChart(goalId) {
    if (!goalId) return;
    try {
        const risk = await API.Portfolio.getRiskMetrics(goalId);
        if (risk) {
            Charts.createRiskChart('riskChart', risk);
        }
    } catch (error) {
        console.error('Error loading risk metrics:', error);
    }
}

/**
 * Update recommendations panel
 */
function updateRecommendations(data, habitInsights = null) {
    const container = document.getElementById('recommendationsList');

    // Handle missing or invalid data
    const stockRecs = data && Array.isArray(data.recommendations) ? data.recommendations : [];
    const validStockRecs = stockRecs.filter(rec => rec && (rec.message || rec.reason || rec.detail));
    const profileContext = data?.profile_context || null;

    if (validStockRecs.length > 0) {
        const contextHtml = profileContext ? `
            <div class="recommendation-context">
                Personalized for ${profileContext.occupation || 'your profile'}:
                ${profileContext.risk_text || 'Moderate'} risk,
                goal "${profileContext.primary_goal || '--'}",
                horizon ${profileContext.time_horizon_years || '--'} years.
            </div>
        ` : '';

        container.innerHTML = contextHtml + validStockRecs.slice(0, 5).map(rec => `
            <div class="recommendation-item ${rec.priority || 'info'}">
                <span class="rec-icon">${getRecIcon((rec.type || rec.action || '').toLowerCase())}</span>
                <div class="rec-content">
                    <span class="rec-text">${rec.message || rec.reason || rec.detail || 'No message'}</span>
                    <span class="rec-meta">
                        ${rec.action ? `Action: ${rec.action}` : ''}
                        ${rec.symbol ? ` | Symbol: ${rec.symbol}` : ''}
                        ${Number.isFinite(Number(rec.quantity)) ? ` | Qty: ${rec.quantity}` : ''}
                        ${Number.isFinite(Number(rec.suggested_monthly)) ? ` | Suggested monthly: ${formatCurrency(Number(rec.suggested_monthly))}` : ''}
                    </span>
                </div>
            </div>
        `).join('');
        return;
    }

    // Fallback: Habit + Goal conflict ranked recommendations
    const ranked = Array.isArray(habitInsights?.ranked_recommendations)
        ? habitInsights.ranked_recommendations
        : [];

    if (ranked.length > 0) {
        container.innerHTML = ranked.slice(0, 3).map((rec, idx) => `
            <div class="recommendation-item moderate-priority">
                <span class="rec-icon">🧠</span>
                <div class="rec-content">
                    <span class="rec-text"><strong>#${idx + 1}</strong> ${rec.recommendation || rec.why_ranked || 'Behavioral improvement recommendation.'}</span>
                    <span class="rec-action">Potential timeline reduction: ${(Number(rec.goal_timeline_reduction_months || 0)).toFixed(1)} months</span>
                </div>
            </div>
        `).join('');
        return;
    }

    container.innerHTML = `
        <div class="recommendation-item">
            <span class="rec-icon">💡</span>
            <span class="rec-text">No personalized recommendations yet. Add expenses and goal progress data to unlock AI insights.</span>
        </div>
    `;
}

function getRecIcon(type) {
    const icons = {
        'buy': '📈',
        'sell': '📉',
        'rebalance': '⚖️',
        'diversify': '🎯',
        'protect_position': '🛡️',
        'adjust_plan': '🧮',
        'align_with_goal': '🧭',
        'liquidity_buffer': '💧',
        'automate_small_sip': '🔁',
        'risk': '⚠️',
        'goal': '🏆',
        'info': '💡'
    };
    return icons[type] || '💡';
}

/**
 * Load and display alerts
 */
async function loadAlerts(goalId) {
    try {
        const alerts = await API.Recommendations.getAlerts(goalId);
        const section = document.getElementById('alertsSection');
        const list = document.getElementById('alertsList');

        if (!alerts || alerts.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = alerts.map(alert => `
            <div class="alert-item ${alert.severity}">
                <span class="alert-icon">${getAlertIcon(alert.severity)}</span>
                <div class="alert-content">
                    <strong>${alert.title}</strong>
                    <p>${alert.message}</p>
                </div>
                <button class="btn btn-icon" onclick="dismissAlert(${alert.id})">✕</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}

function getAlertIcon(severity) {
    return severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
}

async function dismissAlert(alertId) {
    try {
        await API.Recommendations.markAlertRead(alertId);
        await loadAlerts(currentGoalId);
    } catch (error) {
        console.error('Error dismissing alert:', error);
    }
}

/**
 * Create new goal
 */
async function createGoal(event) {
    event.preventDefault();

    const goalData = {
        name: document.getElementById('goalName').value,
        description: document.getElementById('goalDescription').value,
        target_amount: parseFloat(document.getElementById('targetAmountInput').value),
        profit_buffer: parseFloat(document.getElementById('profitBuffer').value) / 100,
        deadline: document.getElementById('goalDeadline').value,
        risk_preference: document.getElementById('riskPreference').value
    };

    try {
        await API.Goals.create(goalData);
        hideModal('goalModal');
        document.getElementById('goalForm').reset();
        setDefaultDeadline();
        showToast('Goal created successfully!', 'success');
        await loadGoals();
    } catch (error) {
        showToast('Failed to create goal: ' + error.message, 'error');
    }
}

/**
 * Refresh all data
 */
async function refreshData() {
    showToast('Refreshing data...', 'info');
    await loadGoals();
    if (currentGoalId) {
        await loadGoalData();
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Chart range buttons
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const days = parseInt(e.target.dataset.range);
            if (currentGoalId) {
                try {
                    const history = await API.Portfolio.getHistory(currentGoalId, days);
                    Charts.createPortfolioChart('portfolioChart', history);
                } catch (error) {
                    console.error('Error updating chart:', error);
                }
            }
        });
    });

    // Close modals on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal('goalModal');
        }
    });
}

/**
 * Set default deadline to 1 year from now
 */
function setDefaultDeadline() {
    const deadline = document.getElementById('goalDeadline');
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    deadline.value = oneYearFromNow.toISOString().split('T')[0];
}
