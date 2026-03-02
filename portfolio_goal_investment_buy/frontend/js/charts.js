/**
 * Chart configurations and utilities using Chart.js
 * Extended with all required chart types: Gauges, Candlestick, Drawdown, Risk
 */

// Chart.js global defaults
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
Chart.defaults.font.family = "'Inter', sans-serif";

// Chart instances storage
const chartInstances = {};

// Color palette
const COLORS = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#06b6d4',
    purple: '#a855f7',
    teal: '#14b8a6',
    orange: '#f97316',
    lime: '#84cc16'
};

const CHART_COLORS = [
    COLORS.primary, COLORS.secondary, COLORS.info, COLORS.success, COLORS.warning,
    COLORS.danger, COLORS.purple, COLORS.teal, COLORS.orange, COLORS.lime
];

// ==========================================
// 1. PORTFOLIO VALUE LINE CHART
// ==========================================
function createPortfolioChart(canvasId, data, targetValue = null) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const labels = data.map(d => d.date || d.label);
    const values = data.map(d => d.value);

    const datasets = [
        {
            label: 'Portfolio Value',
            data: values,
            borderColor: COLORS.primary,
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointBackgroundColor: COLORS.primary,
            borderWidth: 2,
        }
    ];

    if (targetValue) {
        datasets.push({
            label: 'Target Value',
            data: new Array(labels.length).fill(targetValue),
            borderColor: COLORS.success,
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
        });
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 20 } },
                tooltip: {
                    backgroundColor: 'rgba(15, 15, 26, 0.9)',
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { callback: (v) => formatCurrency(v) } }
            }
        }
    });

    return chartInstances[canvasId];
}

// ==========================================
// 2. REQUIRED VS ACTUAL GROWTH (DUAL LINE)
// ==========================================
function createDualGrowthChart(canvasId, requiredData, actualData, targetValue) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: requiredData.map(d => d.date),
            datasets: [
                {
                    label: 'Required Growth',
                    data: requiredData.map(d => d.value),
                    borderColor: COLORS.warning,
                    borderDash: [8, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                },
                {
                    label: 'Actual Growth',
                    data: actualData.map(d => d.value),
                    borderColor: COLORS.primary,
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.4,
                },
                {
                    label: 'Target',
                    data: new Array(requiredData.length).fill(targetValue),
                    borderColor: COLORS.success,
                    borderDash: [2, 2],
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { callback: (v) => formatCurrency(v) } }
            }
        }
    });

    return chartInstances[canvasId];
}

// ==========================================
// 3. ASSET ALLOCATION PIE/DONUT CHART
// ==========================================
function createAllocationChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    if (!data || data.length === 0) {
        return null;
    }

    const labels = data.map(d => d.symbol || d.name);
    const values = data.map(d => d.weight || d.value);

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: CHART_COLORS.slice(0, data.length),
                borderColor: '#0f0f1a',
                borderWidth: 2,
                hoverOffset: 10,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: true, position: 'right', labels: { usePointStyle: true, padding: 15 } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toFixed(1)}%` } }
            }
        }
    });

    return chartInstances[canvasId];
}

// ==========================================
// 4. GOAL PROGRESS GAUGE (Circular)
// ==========================================
function createProgressGauge(canvasId, progress, label = 'Progress') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const progressValue = Math.min(progress, 100);
    const remaining = 100 - progressValue;

    const progressColor = progressValue >= 80 ? COLORS.success :
        progressValue >= 50 ? COLORS.warning : COLORS.primary;

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [label, 'Remaining'],
            datasets: [{
                data: [progressValue, remaining],
                backgroundColor: [progressColor, 'rgba(255,255,255,0.1)'],
                borderWidth: 0,
                circumference: 270,
                rotation: 225,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '80%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        },
        plugins: [{
            id: 'gaugeText',
            afterDraw: (chart) => {
                const { ctx, width, height } = chart;
                ctx.save();
                ctx.font = 'bold 28px Inter';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.fillText(`${progressValue.toFixed(0)}%`, width / 2, height / 2 + 10);
                ctx.font = '14px Inter';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText(label, width / 2, height / 2 + 35);
                ctx.restore();
            }
        }]
    });

    return chartInstances[canvasId];
}

// ==========================================
// 5. SUCCESS PROBABILITY GAUGE (Semi-circular)
// ==========================================
function createProbabilityGauge(canvasId, probability, riskLevel = 'Moderate') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const probValue = Math.min(Math.max(probability, 0), 100);
    const remaining = 100 - probValue;

    const probColor = probValue >= 70 ? COLORS.success :
        probValue >= 40 ? COLORS.warning : COLORS.danger;

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Success', 'Failure'],
            datasets: [{
                data: [probValue, remaining],
                backgroundColor: [probColor, 'rgba(255,255,255,0.1)'],
                borderWidth: 0,
                circumference: 180,
                rotation: 270,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        },
        plugins: [{
            id: 'probabilityText',
            afterDraw: (chart) => {
                const { ctx, width, height } = chart;
                ctx.save();
                ctx.font = 'bold 32px Inter';
                ctx.fillStyle = probColor;
                ctx.textAlign = 'center';
                ctx.fillText(`${probValue.toFixed(0)}%`, width / 2, height * 0.65);
                ctx.font = '12px Inter';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('Success Probability', width / 2, height * 0.8);
                ctx.font = 'bold 14px Inter';
                ctx.fillStyle = probColor;
                ctx.fillText(riskLevel + ' Risk', width / 2, height * 0.92);
                ctx.restore();
            }
        }]
    });

    return chartInstances[canvasId];
}

// ==========================================
// 6. STOCK PRICE CHART (Line + Candlestick-like)
// ==========================================
function createStockPriceChart(canvasId, data, showCandlestick = false) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const labels = data.map(d => d.date);

    if (showCandlestick) {
        // Bar chart simulating candlesticks (green for up, red for down)
        const colors = data.map(d => d.close >= d.open ? COLORS.success : COLORS.danger);

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Price Range',
                    data: data.map(d => [d.low, d.high]),
                    backgroundColor: colors.map(c => c + '40'),
                    borderColor: colors,
                    borderWidth: 1,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const d = data[ctx.dataIndex];
                                return [
                                    `Open: ${formatCurrency(d.open)}`,
                                    `High: ${formatCurrency(d.high)}`,
                                    `Low: ${formatCurrency(d.low)}`,
                                    `Close: ${formatCurrency(d.close)}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { ticks: { callback: (v) => formatCurrency(v) } }
                }
            }
        });
    } else {
        // Simple line chart
        chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Close Price',
                    data: data.map(d => d.close),
                    borderColor: COLORS.primary,
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
                    y: { ticks: { callback: (v) => formatCurrency(v) } }
                }
            }
        });
    }

    return chartInstances[canvasId];
}

// ==========================================
// 7. DRAWDOWN CHART (Area)
// ==========================================
function createDrawdownChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const labels = data.map(d => d.date);
    const values = data.map(d => -Math.abs(d.drawdown)); // Negative values for visual

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Drawdown',
                data: values,
                borderColor: COLORS.danger,
                backgroundColor: 'rgba(239, 68, 68, 0.3)',
                fill: 'origin',
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `Drawdown: ${Math.abs(ctx.raw).toFixed(2)}%` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
                y: {
                    reverse: false,
                    max: 0,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { callback: (v) => `${Math.abs(v).toFixed(0)}%` }
                }
            }
        }
    });

    return chartInstances[canvasId];
}

// ==========================================
// 8. RISK EXPOSURE CHART (Bar/Gauge)
// ==========================================
function createRiskChart(canvasId, metrics) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const labels = ['Volatility', 'Concentration', 'Diversification', 'Sharpe Ratio'];
    const values = [
        Math.min(metrics.volatility || 0, 50) / 50 * 100,
        Math.min(metrics.concentration_score || 0, 100),
        metrics.diversification_score || 0,
        Math.min(Math.max(metrics.sharpe_ratio || 0, -2), 3) / 3 * 100
    ];

    const colors = [
        values[0] > 60 ? COLORS.danger : values[0] > 30 ? COLORS.warning : COLORS.success,
        values[1] > 50 ? COLORS.danger : values[1] > 30 ? COLORS.warning : COLORS.success,
        values[2] > 50 ? COLORS.success : values[2] > 30 ? COLORS.warning : COLORS.danger,
        values[3] > 50 ? COLORS.success : values[3] > 30 ? COLORS.warning : COLORS.danger,
    ];

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Risk Score',
                data: values,
                backgroundColor: colors.map(c => c + '80'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const idx = ctx.dataIndex;
                            if (idx === 0) return `Volatility: ${metrics.volatility?.toFixed(1)}%`;
                            if (idx === 1) return `Concentration (HHI): ${metrics.concentration_score?.toFixed(1)}`;
                            if (idx === 2) return `Diversification: ${metrics.diversification_score?.toFixed(1)}%`;
                            return `Sharpe Ratio: ${metrics.sharpe_ratio?.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: { max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y: { grid: { display: false } }
            }
        }
    });

    return chartInstances[canvasId];
}

// ==========================================
// 9. STRESS TEST BAR CHART
// ==========================================
function createStressTestChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const labels = data.map(d => d.scenario);
    const originalValues = data.map(d => d.original_value);
    const stressedValues = data.map(d => d.stressed_value);

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Original Value',
                    data: originalValues,
                    backgroundColor: COLORS.primary + '80',
                    borderColor: COLORS.primary,
                    borderWidth: 1,
                },
                {
                    label: 'Stressed Value',
                    data: stressedValues,
                    backgroundColor: COLORS.danger + '80',
                    borderColor: COLORS.danger,
                    borderWidth: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: (v) => formatCurrency(v) } }
            }
        }
    });

    return chartInstances[canvasId];
}

// ==========================================
// 10. MONTE CARLO HISTOGRAM
// ==========================================
function createHistogramChart(canvasId, histogramData, targetValue = null) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const labels = histogramData.bin_centers || histogramData.bin_edges?.slice(0, -1) || [];
    const counts = histogramData.counts || [];

    const colors = labels.map(value =>
        value >= targetValue ? COLORS.success + 'B0' : COLORS.danger + 'B0'
    );

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(v => formatCurrency(v)),
            datasets: [{
                label: 'Simulation Outcomes',
                data: counts,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('B0', 'FF')),
                borderWidth: 1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = counts.reduce((a, b) => a + b, 0);
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return `${ctx.raw} simulations (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, title: { display: true, text: 'Simulations' } }
            }
        }
    });

    return chartInstances[canvasId];
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
}

function destroyAllCharts() {
    Object.keys(chartInstances).forEach(id => {
        chartInstances[id].destroy();
        delete chartInstances[id];
    });
}

// Export for use in other scripts
window.Charts = {
    createPortfolioChart,
    createDualGrowthChart,
    createAllocationChart,
    createProgressGauge,
    createProbabilityGauge,
    createStockPriceChart,
    createDrawdownChart,
    createRiskChart,
    createStressTestChart,
    createHistogramChart,
    destroyChart,
    destroyAllCharts,
    COLORS,
};
