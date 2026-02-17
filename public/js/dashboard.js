/**
 * Dashboard JavaScript - Main dashboard functionality
 * Per-goal stock allocation mode
 */

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    await loadGoals();
    setupEventListeners();
    setDefaultDeadline();
});

let currentGoalId = null;

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
        return;
    }

    try {
        // Load goal-specific portfolio data
        const [portfolio, recommendations] = await Promise.all([
            API.Portfolio.get(currentGoalId),
            API.Recommendations.get(currentGoalId).catch(() => ({ recommendations: [] }))
        ]);

        // Update stats cards
        updateStatsCards(portfolio.summary);



        // Update recommendations
        updateRecommendations(recommendations);

        // Load goal progress gauge
        if (portfolio.summary) {
            Charts.createProgressGauge('progressGauge', portfolio.summary.progress_percentage || 0, 'Goal Progress');
        }

        // Run all remaining chart/data loads in parallel
        await Promise.all([
            updateCharts(portfolio),
            loadGrowthChart(currentGoalId),
            loadRiskChart(currentGoalId),
            loadAlerts(currentGoalId)
        ]);

    } catch (error) {
        console.error('Error loading goal data:', error);
        showToast('Failed to load goal data', 'error');
    }
}

/**
 * Update stats cards with portfolio data
 */
function updateStatsCards(summary) {
    if (!summary) return;

    // Portfolio Value
    document.getElementById('portfolioValue').textContent = formatCurrency(summary.total_current_value);

    const changeEl = document.getElementById('portfolioChange');
    const pnlPct = summary.pnl_percentage || 0;
    changeEl.textContent = formatPercent(pnlPct);
    changeEl.className = `stat-change ${pnlPct >= 0 ? 'positive' : 'negative'}`;

    // Goal Progress
    document.getElementById('goalProgress').textContent = `${(summary.progress_percentage || 0).toFixed(1)}%`;
    document.getElementById('targetAmount').textContent = `Target: ${formatCurrency(summary.target_value)}`;

    // Total P&L
    document.getElementById('totalPnl').textContent = formatCurrency(summary.total_pnl);

    const pnlPercentEl = document.getElementById('pnlPercent');
    pnlPercentEl.textContent = formatPercent(pnlPct);
    pnlPercentEl.className = `stat-change ${pnlPct >= 0 ? 'positive' : 'negative'}`;

    // Days Remaining
    document.getElementById('daysRemaining').textContent = summary.days_remaining || 0;
    document.getElementById('deadline').textContent = `Deadline: ${formatDate(summary.deadline)}`;
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
function updateRecommendations(data) {
    const container = document.getElementById('recommendationsList');

    // Handle missing or invalid data
    if (!data || !data.recommendations || !Array.isArray(data.recommendations) || data.recommendations.length === 0) {
        container.innerHTML = `
            <div class="recommendation-item">
                <span class="rec-icon">💡</span>
                <span class="rec-text">Add more stocks to your portfolio for personalized recommendations.</span>
            </div>
        `;
        return;
    }

    // Filter out invalid recommendations and map to HTML
    const validRecs = data.recommendations.filter(rec => rec && rec.message);

    if (validRecs.length === 0) {
        container.innerHTML = `
            <div class="recommendation-item">
                <span class="rec-icon">💡</span>
                <span class="rec-text">Add more stocks to your portfolio for personalized recommendations.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = validRecs.map(rec => `
        <div class="recommendation-item ${rec.priority || 'info'}">
            <span class="rec-icon">${getRecIcon(rec.type)}</span>
            <div class="rec-content">
                <span class="rec-text">${rec.message || 'No message'}</span>
                ${rec.action ? `<button class="btn btn-sm btn-secondary" onclick="${rec.action}">${rec.action_label || 'Take Action'}</button>` : ''}
            </div>
        </div>
    `).join('');
}

function getRecIcon(type) {
    const icons = {
        'buy': '📈',
        'sell': '📉',
        'rebalance': '⚖️',
        'diversify': '🎯',
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
