/**
 * Rebalancing Page JavaScript
 * Handles portfolio analysis and rebalancing recommendations
 * Covers all 12 sections of the comprehensive rebalancing page
 */

let currentGoalId = null;
let analysisData = null;

document.addEventListener('DOMContentLoaded', () => {
    loadGoals();
});

// ==========================================
// DATA LOADING
// ==========================================

async function loadGoals() {
    try {
        const goals = await API.Goals.list();
        const select = document.getElementById('goalSelect');

        goals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = `${goal.name} (${formatCurrency(goal.target_value)})`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading goals:', error);
        showToast('Could not load goals', 'error');
    }
}

async function analyzePortfolio() {
    const goalId = document.getElementById('goalSelect').value;

    if (!goalId) {
        showToast('Please select a goal first', 'error');
        return;
    }

    currentGoalId = goalId;

    // Show loading state
    const btn = document.getElementById('analyzeBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Analyzing...';
    showToast('Analyzing portfolio...', 'info');

    try {
        // Fetch ALL data in parallel for maximum performance
        const [portfolio, analysis, rebalancing, buySuggestions, riskMetrics, history, alerts] = await Promise.all([
            API.Portfolio.get(goalId),
            API.Recommendations.get(goalId),
            API.Recommendations.getRebalancing(goalId),
            API.Recommendations.getBuySuggestions(goalId).catch(() => []),
            API.Portfolio.getRiskMetrics(goalId).catch(() => ({})),
            API.Portfolio.getHistory(goalId, 90).catch(() => []),
            API.Recommendations.getAlerts(goalId).catch(() => [])
        ]);

        analysisData = { portfolio, analysis, rebalancing, buySuggestions, riskMetrics, history, alerts };

        // Hide empty state, show all sections
        document.getElementById('emptyState').style.display = 'none';
        showAllSections();

        // Populate all 12 sections
        renderPortfolioSummary(portfolio);
        renderRebalanceStatus(analysis, rebalancing);
        renderAllocationOverview(portfolio.allocation || [], analysis);
        renderRiskIndicator(riskMetrics);
        renderDriftDetails(rebalancing);
        renderRecommendations(analysis);
        renderIssues(analysis);
        renderAdjustmentSuggestions(rebalancing);
        renderGoalImpact(portfolio, analysis);
        renderHistoryLog(alerts);
        renderCharts(portfolio, rebalancing, history);

        showToast('Analysis complete!', 'success');

    } catch (error) {
        console.error('Error analyzing portfolio:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Analyze Portfolio';
    }
}

function showAllSections() {
    const sections = [
        'portfolioSummary', 'rebalanceStatus', 'allocationRiskSection',
        'driftSection', 'recsSection', 'adjustmentsSection',
        'goalImpactSection', 'historyLogSection', 'chartsSection',
        'actionsSection', 'infoSection'
    ];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = id === 'portfolioSummary' ? 'grid'
                : id === 'chartsSection' ? 'grid'
                    : 'block';
        }
    });
}

// ==========================================
// SECTION 1: Portfolio Summary
// ==========================================

function renderPortfolioSummary(portfolio) {
    const summary = portfolio.summary || {};

    document.getElementById('totalValue').textContent = formatCurrency(summary.total_current_value || 0);
    document.getElementById('totalInvested').textContent = formatCurrency(summary.total_invested || 0);

    const pnl = summary.total_unrealized_pnl || 0;
    const pnlPct = summary.pnl_percentage || 0;
    const pnlEl = document.getElementById('unrealizedPnl');
    pnlEl.textContent = formatCurrency(pnl);
    pnlEl.style.color = pnl >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)';

    const pctEl = document.getElementById('pnlPercent');
    pctEl.textContent = `${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
    pctEl.className = `stat-change ${pnl >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('goalProgress').textContent = `${(summary.progress_percentage || 0).toFixed(1)}%`;
}

// ==========================================
// SECTION 4: Rebalancing Status Indicator
// ==========================================

function renderRebalanceStatus(analysis, rebalancing) {
    const statusCard = document.getElementById('statusCard');
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusReason = document.getElementById('statusReason');
    const lastEvalDate = document.getElementById('lastEvalDate');

    const status = rebalancing.status || 'BALANCED';
    const issues = analysis.issues || [];

    if (status === 'REBALANCE_SUGGESTED' || issues.length > 0) {
        statusCard.className = 'rb-status-card rb-status-warning';
        statusIcon.textContent = '⚠️';
        statusTitle.textContent = 'Rebalancing Recommended';

        const reasons = issues.map(i => i.type).slice(0, 3);
        statusReason.textContent = reasons.length > 0
            ? `Reasons: ${reasons.join(', ')}`
            : 'Portfolio drift exceeds threshold';
    } else if (status === 'NO_HOLDINGS') {
        statusCard.className = 'rb-status-card rb-status-neutral';
        statusIcon.textContent = '📭';
        statusTitle.textContent = 'No Holdings Found';
        statusReason.textContent = 'Add stocks to your goal to see rebalancing analysis.';
    } else {
        statusCard.className = 'rb-status-card rb-status-ok';
        statusIcon.textContent = '✅';
        statusTitle.textContent = 'Portfolio is Balanced';
        statusReason.textContent = 'No rebalancing action needed at this time.';
    }

    lastEvalDate.textContent = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

// ==========================================
// SECTION 2: Asset Allocation Overview
// ==========================================

function renderAllocationOverview(allocation, analysis) {
    // Destroy existing charts
    if (window._currentAllocChart) window._currentAllocChart.destroy();
    if (window._targetAllocChart) window._targetAllocChart.destroy();

    if (!allocation || allocation.length === 0) return;

    const numHoldings = allocation.length;
    const targetWeight = (100 / numHoldings).toFixed(1);
    const targetAllocation = allocation.map(a => ({
        symbol: a.symbol,
        weight: parseFloat(targetWeight)
    }));

    // Current allocation donut
    const ctx1 = document.getElementById('currentAllocChart');
    if (ctx1) {
        window._currentAllocChart = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: allocation.map(a => a.symbol),
                datasets: [{
                    data: allocation.map(a => a.weight),
                    backgroundColor: Charts.COLORS ? [
                        '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
                        '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#84cc16'
                    ].slice(0, allocation.length) : [],
                    borderColor: '#0f0f1a',
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: '#94a3b8', usePointStyle: true, padding: 10, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toFixed(1)}%` } }
                }
            }
        });
    }

    // Target allocation donut
    const ctx2 = document.getElementById('targetAllocChart');
    if (ctx2) {
        window._targetAllocChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: targetAllocation.map(a => a.symbol),
                datasets: [{
                    data: targetAllocation.map(a => a.weight),
                    backgroundColor: [
                        '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
                        '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#84cc16'
                    ].slice(0, targetAllocation.length),
                    borderColor: '#0f0f1a',
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: '#94a3b8', usePointStyle: true, padding: 10, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toFixed(1)}%` } }
                }
            }
        });
    }
}

// ==========================================
// SECTION 8: Risk Level Indicator
// ==========================================

function renderRiskIndicator(metrics) {
    const riskLevel = metrics.risk_level || 'N/A';
    const volatility = metrics.volatility || 0;
    const sharpe = metrics.sharpe_ratio || 0;
    const diversification = metrics.diversification_score || 0;
    const concentration = metrics.concentration_score || 0;

    document.getElementById('riskVolatility').textContent = `${volatility.toFixed(1)}%`;
    document.getElementById('riskSharpe').textContent = sharpe.toFixed(2);
    document.getElementById('riskDiversification').textContent = `${diversification.toFixed(0)}%`;
    document.getElementById('riskConcentration').textContent = concentration.toFixed(1);

    // Risk gauge
    const riskScore = riskLevel === 'HIGH' ? 85 : riskLevel === 'MODERATE' ? 50 : 20;
    Charts.createProbabilityGauge('riskGauge', 100 - riskScore, riskLevel);

    // Explanation
    const explanations = {
        'HIGH': `Your portfolio has high risk with ${volatility.toFixed(1)}% annualized volatility. Consider diversifying to reduce concentration and lower overall risk.`,
        'MODERATE': `Your portfolio has moderate risk. Volatility is ${volatility.toFixed(1)}% annually. The portfolio is reasonably balanced but could benefit from further diversification.`,
        'LOW': `Your portfolio is well-diversified with low risk. Volatility is only ${volatility.toFixed(1)}% annually. Great job maintaining a balanced allocation!`,
        'N/A': 'Add holdings to see risk assessment.'
    };
    document.getElementById('riskExplanation').textContent = explanations[riskLevel] || explanations['N/A'];
}

// ==========================================
// SECTION 3: Allocation Drift Details
// ==========================================

function renderDriftDetails(rebalancing) {
    const tbody = document.getElementById('driftBody');
    const suggestions = rebalancing.suggestions || [];
    const allocation = analysisData?.portfolio?.allocation || [];

    if (allocation.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No holdings to analyze</td></tr>';
        return;
    }

    const numHoldings = allocation.length;
    const targetWeight = 100 / numHoldings;

    tbody.innerHTML = allocation.map(asset => {
        const currentWeight = asset.weight || 0;
        const deviation = currentWeight - targetWeight;
        const absDeviation = Math.abs(deviation);

        let status, statusClass;
        if (absDeviation < 2) {
            status = 'Balanced';
            statusClass = 'balanced';
        } else if (deviation > 0) {
            status = 'Overweight';
            statusClass = 'overweight';
        } else {
            status = 'Underweight';
            statusClass = 'underweight';
        }

        return `
            <tr>
                <td><span class="symbol-badge">${asset.symbol}</span></td>
                <td>${currentWeight.toFixed(1)}%</td>
                <td>${targetWeight.toFixed(1)}%</td>
                <td class="${deviation >= 0 ? 'text-danger' : 'text-success'}">${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%</td>
                <td><span class="drift-status ${statusClass}">${status}</span></td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// SECTION 5: Rebalancing Recommendations
// ==========================================

function renderRecommendations(analysis) {
    const container = document.getElementById('recommendationsList');
    const recommendations = analysis.recommendations || [];

    if (recommendations.length === 0) {
        container.innerHTML = `
            <div class="success-message">
                <span class="icon">✅</span>
                <p>No specific recommendations at this time. Your portfolio looks healthy!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = recommendations.map(rec => `
        <div class="recommendation-item ${(rec.priority || 'moderate')}-priority">
            <div class="rec-icon">${getRecIcon(rec.type)}</div>
            <div class="rec-content">
                <span class="rec-action">${rec.action || rec.type || 'Recommendation'}</span>
                <p class="rec-text">${rec.detail || rec.description || rec.reason || ''}</p>
                ${rec.impact ? `<span class="rec-impact">Impact: ${rec.impact}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function renderIssues(analysis) {
    const container = document.getElementById('issuesList');
    const issues = analysis.issues || [];
    const badge = document.getElementById('issuesBadge');

    badge.textContent = `${issues.length} Issue${issues.length !== 1 ? 's' : ''}`;
    badge.className = `badge ${issues.length > 0 ? 'badge-warning' : 'badge-success'}`;

    if (issues.length === 0) {
        container.innerHTML = `
            <div class="success-message">
                <span class="icon">✅</span>
                <p>No issues detected! Your portfolio looks healthy.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = issues.map(issue => `
        <div class="issue-item ${(issue.severity || 'medium').toLowerCase()}">
            <div class="issue-icon">${getIssueIcon(issue.type)}</div>
            <div class="issue-content">
                <strong>${issue.type}</strong>
                <p>${issue.detail || ''}</p>
                ${issue.impact ? `<span class="rec-impact">Impact: ${issue.impact}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function getIssueIcon(type) {
    const icons = {
        'concentration': '⚠️', 'under_diversified': '📊', 'drift': '↔️',
        'underweight': '⬇️', 'overweight': '⬆️', 'no_holdings': '📭', 'low_progress': '🎯'
    };
    return icons[type] || '⚠️';
}

function getRecIcon(type) {
    const icons = {
        'buy': '🛒', 'sell': '💰', 'hold': '⏸️', 'rebalance': '⚖️',
        'diversify': '🔀', 'reduce': '📉', 'increase': '📈'
    };
    return icons[type] || '💡';
}

// ==========================================
// SECTION 6: Stock-Level Adjustment Suggestions
// ==========================================

function renderAdjustmentSuggestions(rebalancing) {
    const tbody = document.getElementById('adjustmentBody');
    const suggestions = rebalancing.suggestions || [];
    const strategy = rebalancing.target_strategy || 'Equal Weight';

    document.getElementById('strategyBadge').textContent = strategy;

    if (suggestions.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">Your portfolio is well-balanced. No adjustments needed. 🎉</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = suggestions.map(s => {
        const action = s.action || 'HOLD';
        return `
            <tr class="${action.toLowerCase()}-row">
                <td><span class="action-badge ${action.toLowerCase()}">${action}</span></td>
                <td><span class="symbol-badge">${s.symbol}</span></td>
                <td>${(s.current_weight || 0).toFixed(1)}%</td>
                <td>${(s.target_weight || 0).toFixed(1)}%</td>
                <td>${s.quantity || '--'}</td>
                <td class="${(s.drift || 0) > 0 ? 'text-danger' : 'text-success'}">${(s.drift || 0) > 0 ? '+' : ''}${(s.drift || 0).toFixed(1)}%</td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// SECTION 7: Goal Impact Preview
// ==========================================

function renderGoalImpact(portfolio, analysis) {
    const summary = portfolio.summary || {};

    document.getElementById('impactGoalName').textContent = summary.goal_name || analysis.goal_name || '--';
    document.getElementById('impactTargetAmount').textContent = formatCurrency(summary.target_value || 0);
    document.getElementById('impactCurrentValue').textContent = formatCurrency(summary.total_current_value || 0);
    document.getElementById('impactRemaining').textContent = formatCurrency(summary.amount_remaining || 0);
    document.getElementById('impactDaysLeft').textContent = `${summary.days_remaining || 0} days`;

    const onTrack = analysis.on_track;
    const onTrackEl = document.getElementById('impactOnTrack');
    if (onTrack === true) {
        onTrackEl.textContent = '✅ Yes';
        onTrackEl.style.color = 'var(--color-accent-green)';
    } else if (onTrack === false) {
        onTrackEl.textContent = '❌ Behind Schedule';
        onTrackEl.style.color = 'var(--color-accent-red)';
    } else {
        onTrackEl.textContent = '--';
        onTrackEl.style.color = '';
    }

    // Progress gauge
    const progress = summary.progress_percentage || 0;
    Charts.createProgressGauge('goalProgressGauge', progress, 'Goal Progress');
}

// ==========================================
// SECTION 9: Historical Rebalancing Log
// ==========================================

function renderHistoryLog(alerts) {
    const container = document.getElementById('rebalanceTimeline');

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state-small">
                <p>No rebalancing alerts or history yet. Run your first analysis above!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = alerts.map(alert => {
        const severityClass = alert.severity === 'critical' ? 'high' : alert.severity || 'medium';
        const icon = alert.type === 'rebalance' ? '⚖️' :
            alert.type === 'drift' ? '↔️' :
                alert.type === 'concentration' ? '⚠️' : '📊';

        return `
            <div class="rb-timeline-item ${severityClass}">
                <div class="rb-timeline-dot"></div>
                <div class="rb-timeline-content">
                    <div class="rb-timeline-header">
                        <span class="rb-timeline-icon">${icon}</span>
                        <strong>${alert.title || alert.type}</strong>
                        <span class="rb-timeline-date">${formatDate(alert.created_at)}</span>
                    </div>
                    <p>${alert.message}</p>
                    <span class="badge badge-${alert.severity === 'critical' ? 'danger' : 'warning'}">${alert.severity || 'info'}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// SECTION 10: Supporting Visual Charts
// ==========================================

function renderCharts(portfolio, rebalancing, history) {
    renderAllocationCompareChart(portfolio.allocation || [], rebalancing);
    renderPortfolioTrendChart(history);
}

function renderAllocationCompareChart(allocation, rebalancing) {
    const ctx = document.getElementById('allocationCompareChart');
    if (!ctx) return;

    if (window._allocCompareChart) window._allocCompareChart.destroy();

    if (!allocation || allocation.length === 0) return;

    const numHoldings = allocation.length;
    const targetWeight = 100 / numHoldings;

    const labels = allocation.map(a => a.symbol);
    const currentData = allocation.map(a => a.weight.toFixed(1));
    const targetData = allocation.map(() => targetWeight.toFixed(1));

    window._allocCompareChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Current %',
                    data: currentData,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: 'Target %',
                    data: targetData,
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' }, max: 100 }
            }
        }
    });
}

function renderPortfolioTrendChart(history) {
    const ctx = document.getElementById('portfolioTrendChart');
    if (!ctx) return;

    if (window._portfolioTrendChart) window._portfolioTrendChart.destroy();

    if (!history || history.length === 0) {
        // Show empty state
        window._portfolioTrendChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['No data available'], datasets: [{ label: 'Portfolio Value', data: [0], borderColor: '#6366f1' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
        return;
    }

    const labels = history.map(h => h.date);
    const values = history.map(h => h.value);

    window._portfolioTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Portfolio Value',
                data: values,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 15, 26, 0.9)',
                    callbacks: { label: (ctx) => formatCurrency(ctx.raw) }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: (v) => formatCurrency(v) } }
            }
        }
    });
}

// ==========================================
// SECTION 11: User Actions
// ==========================================

function exportRecommendations() {
    if (!analysisData) {
        showToast('Run analysis first before exporting', 'error');
        return;
    }

    const { analysis, rebalancing } = analysisData;
    const lines = [
        '===== PORTFOLIO REBALANCING REPORT =====',
        `Date: ${new Date().toLocaleString()}`,
        `Goal: ${analysis.goal_name || 'N/A'}`,
        '',
        '--- Portfolio Summary ---',
        `Portfolio Value: ${formatCurrency(analysis.portfolio_value || 0)}`,
        `Progress: ${(analysis.progress || 0).toFixed(1)}%`,
        `Diversification: ${(analysis.diversification_score || 0).toFixed(0)}%`,
        '',
        '--- Issues ---',
        ...(analysis.issues || []).map(i => `• [${i.severity || 'medium'}] ${i.title || i.type}: ${i.description || i.message}`),
        '',
        '--- Recommendations ---',
        ...(analysis.recommendations || []).map(r => `• ${r.action || r.title}: ${r.description || r.reason}`),
        '',
        '--- Adjustment Suggestions ---',
        ...(rebalancing.suggestions || []).map(s => `• ${s.action} ${s.symbol}: ${s.quantity || 0} shares (drift: ${(s.drift || 0).toFixed(1)}%)`),
        '',
        '⚠️ Disclaimer: These are suggestions only. No real trades are executed.',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rebalancing-report-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Report exported!', 'success');
}

// ==========================================
// PAGE-SPECIFIC STYLES
// ==========================================

const style = document.createElement('style');
style.textContent = `
    /* Rebalancing Status Section */
    .rb-status-section {
        margin-bottom: var(--spacing-xl);
    }

    .rb-status-card {
        display: flex;
        align-items: center;
        gap: var(--spacing-xl);
        padding: var(--spacing-xl);
        border-radius: var(--radius-xl);
        background: var(--bg-card);
        border: 1px solid var(--glass-border);
        backdrop-filter: var(--glass-blur);
        transition: all var(--transition-base);
    }

    .rb-status-card.rb-status-ok {
        border-left: 4px solid var(--color-accent-green);
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, var(--bg-card) 100%);
    }

    .rb-status-card.rb-status-warning {
        border-left: 4px solid var(--color-accent-orange);
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, var(--bg-card) 100%);
    }

    .rb-status-card.rb-status-neutral {
        border-left: 4px solid var(--text-muted);
    }

    .rb-status-icon {
        font-size: 3rem;
        flex-shrink: 0;
    }

    .rb-status-content h3 {
        font-size: var(--font-size-xl);
        margin-bottom: var(--spacing-xs);
    }

    .rb-status-content p {
        color: var(--text-secondary);
        margin-bottom: var(--spacing-md);
    }

    .rb-status-meta {
        display: flex;
        gap: var(--spacing-xl);
        flex-wrap: wrap;
    }

    .rb-meta-item {
        font-size: var(--font-size-sm);
        color: var(--text-muted);
    }

    /* Two Column Layout */
    .rb-two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing-lg);
        margin-bottom: var(--spacing-xl);
    }

    @media (max-width: 1024px) {
        .rb-two-col {
            grid-template-columns: 1fr;
        }
    }

    /* Allocation Charts */
    .rb-alloc-charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing-md);
    }

    .rb-alloc-chart-item h4 {
        text-align: center;
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        margin-bottom: var(--spacing-sm);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* Risk Section */
    .rb-risk-content {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
    }

    .rb-risk-gauge-container {
        height: 160px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .rb-risk-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing-sm);
    }

    .rb-risk-metric {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
    }

    .rb-risk-metric .label {
        font-size: var(--font-size-sm);
        color: var(--text-muted);
    }

    .rb-risk-metric .value {
        font-weight: 600;
        font-size: var(--font-size-base);
    }

    .rb-risk-explanation {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        padding: var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
        border-left: 3px solid var(--color-primary);
        line-height: 1.6;
    }

    /* Drift Section */
    #driftSection {
        margin-bottom: var(--spacing-xl);
    }

    .drift-status {
        display: inline-block;
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .drift-status.balanced {
        background: rgba(16, 185, 129, 0.2);
        color: var(--color-accent-green);
    }

    .drift-status.overweight {
        background: rgba(239, 68, 68, 0.2);
        color: var(--color-accent-red);
    }

    .drift-status.underweight {
        background: rgba(245, 158, 11, 0.2);
        color: var(--color-accent-orange);
    }

    .text-danger { color: var(--color-accent-red); }
    .text-success { color: var(--color-accent-green); }

    /* Recommendations & Issues */
    .rb-disclaimer {
        margin-top: var(--spacing-md);
        padding: var(--spacing-md);
        background: rgba(245, 158, 11, 0.1);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        color: var(--color-accent-orange);
        border: 1px solid rgba(245, 158, 11, 0.2);
    }

    .issue-item {
        display: flex;
        gap: var(--spacing-md);
        padding: var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-sm);
        border-left: 3px solid var(--color-accent-orange);
    }

    .issue-item.high {
        border-left-color: var(--color-accent-red);
        background: rgba(239, 68, 68, 0.1);
    }

    .issue-item.low {
        border-left-color: var(--color-accent-green);
    }

    .issue-icon { font-size: var(--font-size-xl); }

    .issue-content strong {
        display: block;
        margin-bottom: var(--spacing-xs);
    }

    .issue-content p {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        margin: 0;
    }

    .success-message {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
        padding: var(--spacing-lg);
        background: rgba(16, 185, 129, 0.1);
        border-radius: var(--radius-md);
        border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .success-message .icon { font-size: var(--font-size-2xl); }

    .recommendation-item {
        display: flex;
        gap: var(--spacing-md);
        padding: var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-sm);
        border-left: 3px solid var(--color-primary);
    }

    .recommendation-item.high-priority {
        border-left-color: var(--color-accent-red);
    }

    .rec-content { flex: 1; }

    .rec-action {
        font-weight: 600;
        color: var(--color-primary-light);
    }

    .rec-text {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        margin: var(--spacing-xs) 0;
    }

    .rec-impact {
        font-size: var(--font-size-xs);
        color: var(--color-accent-green);
    }

    /* Adjustment Table */
    #adjustmentsSection {
        margin-bottom: var(--spacing-xl);
    }

    .action-badge {
        display: inline-block;
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);
        font-weight: 600;
        font-size: var(--font-size-sm);
    }

    .action-badge.buy {
        background: rgba(16, 185, 129, 0.2);
        color: var(--color-accent-green);
    }

    .action-badge.sell {
        background: rgba(239, 68, 68, 0.2);
        color: var(--color-accent-red);
    }

    .action-badge.hold {
        background: rgba(245, 158, 11, 0.2);
        color: var(--color-accent-orange);
    }

    .buy-row { background: rgba(16, 185, 129, 0.05); }
    .sell-row { background: rgba(239, 68, 68, 0.05); }

    .symbol-badge {
        display: inline-block;
        padding: 2px 8px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-sm);
        font-weight: 600;
        font-size: var(--font-size-sm);
        color: var(--color-primary-light);
    }

    /* Goal Impact */
    .rb-goal-impact-grid {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: var(--spacing-xl);
        align-items: center;
    }

    @media (max-width: 768px) {
        .rb-goal-impact-grid {
            grid-template-columns: 1fr;
        }
    }

    .rb-goal-gauge-wrapper {
        height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .rb-goal-details {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--spacing-md);
    }

    @media (max-width: 768px) {
        .rb-goal-details {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    .rb-goal-detail-item {
        padding: var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
        text-align: center;
    }

    .rb-goal-detail-item .label {
        display: block;
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: var(--spacing-xs);
    }

    .rb-goal-detail-item .value {
        font-weight: 600;
        font-size: var(--font-size-lg);
    }

    /* Timeline */
    #historyLogSection {
        margin-bottom: var(--spacing-xl);
    }

    .rb-timeline {
        position: relative;
        padding-left: var(--spacing-xl);
    }

    .rb-timeline::before {
        content: '';
        position: absolute;
        left: 8px;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--glass-border);
    }

    .rb-timeline-item {
        position: relative;
        padding: var(--spacing-md);
        margin-bottom: var(--spacing-md);
        background: var(--glass-bg);
        border-radius: var(--radius-md);
        border-left: 3px solid var(--color-primary);
    }

    .rb-timeline-item.high {
        border-left-color: var(--color-accent-red);
    }

    .rb-timeline-dot {
        position: absolute;
        left: calc(-1 * var(--spacing-xl) - 3px);
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--color-primary);
        border: 2px solid var(--bg-primary);
    }

    .rb-timeline-item.high .rb-timeline-dot {
        background: var(--color-accent-red);
    }

    .rb-timeline-header {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        margin-bottom: var(--spacing-xs);
        flex-wrap: wrap;
    }

    .rb-timeline-date {
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        margin-left: auto;
    }

    .rb-timeline-content p {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        margin: var(--spacing-xs) 0;
    }

    /* Actions Bar */
    .rb-actions-bar {
        display: flex;
        gap: var(--spacing-md);
        justify-content: center;
        padding: var(--spacing-xl);
        margin-bottom: var(--spacing-xl);
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        border: 1px solid var(--glass-border);
    }

    /* Info Cards */
    .rb-info-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--spacing-lg);
        margin-bottom: var(--spacing-xl);
    }

    @media (max-width: 1024px) {
        .rb-info-grid {
            grid-template-columns: 1fr;
        }
    }

    .rb-info-card {
        padding: var(--spacing-xl);
        background: var(--bg-card);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-xl);
        text-align: center;
        transition: all var(--transition-base);
    }

    .rb-info-card:hover {
        transform: translateY(-2px);
        border-color: var(--color-primary);
    }

    .rb-info-icon {
        font-size: 2.5rem;
        margin-bottom: var(--spacing-md);
    }

    .rb-info-card h4 {
        font-size: var(--font-size-lg);
        margin-bottom: var(--spacing-sm);
    }

    .rb-info-card p {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        line-height: 1.6;
    }

    /* Empty State */
    .empty-state {
        text-align: center;
        padding: var(--spacing-2xl) var(--spacing-xl);
    }

    .empty-content h3 {
        font-size: var(--font-size-2xl);
        margin-bottom: var(--spacing-md);
    }

    .empty-content p {
        color: var(--text-secondary);
        margin-bottom: var(--spacing-sm);
    }

    .empty-state-small {
        text-align: center;
        padding: var(--spacing-xl);
        color: var(--text-muted);
    }

    /* Footer */
    .footer {
        text-align: center;
        padding: var(--spacing-lg);
        border-top: 1px solid var(--glass-border);
        margin-top: var(--spacing-2xl);
        color: var(--text-muted);
        font-size: var(--font-size-sm);
    }

    /* Goal Impact Section */
    #goalImpactSection {
        margin-bottom: var(--spacing-xl);
    }
`;
document.head.appendChild(style);
