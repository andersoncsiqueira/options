// ---------- FUNÇÕES BLACK-SCHOLES E GREGAS ----------
function normCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if (x > 0) p = 1 - p;
    return p;
}

function normPDF(x) {
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

function blackScholesPrice(S, K, T_years, r, sigma, type) {
    if (T_years <= 0) {
        if (type === 'call') return Math.max(0, S - K);
        else return Math.max(0, K - S);
    }
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T_years) / (sigma * Math.sqrt(T_years));
    const d2 = d1 - sigma * Math.sqrt(T_years);
    if (type === 'call') {
        return S * normCDF(d1) - K * Math.exp(-r * T_years) * normCDF(d2);
    } else {
        return K * Math.exp(-r * T_years) * normCDF(-d2) - S * normCDF(-d1);
    }
}

// Cálculo das Gregas
function calculateGreeks(S, K, T_years, r, sigma, type) {
    if (T_years <= 0) {
        return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
    
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T_years) / (sigma * Math.sqrt(T_years));
    const d2 = d1 - sigma * Math.sqrt(T_years);
    const pdfD1 = normPDF(d1);
    
    // Delta
    let delta;
    if (type === 'call') {
        delta = normCDF(d1);
    } else {
        delta = normCDF(d1) - 1;
    }
    
    // Gamma (mesmo para call e put)
    const gamma = pdfD1 / (S * sigma * Math.sqrt(T_years));
    
    // Theta (anual, depois dividimos por 365/252 para ter theta por dia)
    let theta_annual;
    if (type === 'call') {
        theta_annual = - (S * pdfD1 * sigma) / (2 * Math.sqrt(T_years)) - r * K * Math.exp(-r * T_years) * normCDF(d2);
    } else {
        theta_annual = - (S * pdfD1 * sigma) / (2 * Math.sqrt(T_years)) + r * K * Math.exp(-r * T_years) * normCDF(-d2);
    }
    
    // Vega (mesmo para call e put)
    const vega = S * pdfD1 * Math.sqrt(T_years);
    
    // Rho
    let rho;
    if (type === 'call') {
        rho = K * T_years * Math.exp(-r * T_years) * normCDF(d2);
    } else {
        rho = -K * T_years * Math.exp(-r * T_years) * normCDF(-d2);
    }
    
    return {
        delta: delta,
        gamma: gamma,
        theta_annual: theta_annual,
        vega: vega,
        rho: rho
    };
}

// Função auxiliar: converte dias para anos baseado na convenção
function daysToYears(days, baseDays) {
    if (days <= 0) return 0;
    return days / baseDays;
}

// ---------- GERENCIAMENTO DE ESTADO DAS OPERAÇÕES ----------
let nextId = 1;
let operations = [];

// Elementos DOM
const container = document.getElementById('optionsContainer');
const riskFreeInput = document.getElementById('riskFreeRate');
const volatilityInput = document.getElementById('volatility');
const daysToExpInput = document.getElementById('daysToExp');
const daysBaseSelect = document.getElementById('daysBaseSelect');
const addCallBtn = document.getElementById('addCallBtn');
const addPutBtn = document.getElementById('addPutBtn');
const resetAllBtn = document.getElementById('resetAllBtn');
const syncParamsBtn = document.getElementById('syncParamsBtn');

// Elementos da Calculadora BS
const calcCallBtn = document.getElementById('calcCallBtn');
const calcPutBtn = document.getElementById('calcPutBtn');
const calcS = document.getElementById('calcS');
const calcK = document.getElementById('calcK');
const calcDays = document.getElementById('calcDays');
const calcDaysBase = document.getElementById('calcDaysBase');
const calcR = document.getElementById('calcR');
const calcSigma = document.getElementById('calcSigma');
const calculateBtn = document.getElementById('calculateBtn');
const calcResultPrice = document.getElementById('calcResultPrice');
const calcResultDetails = document.getElementById('calcResultDetails');

let currentCalcType = 'call';

// Função para obter parâmetros atuais BS (em anos)
function getGlobalParams() {
    const days = parseFloat(daysToExpInput.value) || 0;
    const baseDays = parseInt(daysBaseSelect.value) || 365;
    const T_years = daysToYears(days, baseDays);
    
    return {
        r: parseFloat(riskFreeInput.value) || 0.05,
        sigma: parseFloat(volatilityInput.value) || 0.25,
        T_years: T_years,
        days: days,
        baseDays: baseDays
    };
}

// Calcula preço teórico atual com base no S atual da operação
function getCurrentOptionPrice(opt) {
    const { r, sigma, T_years } = getGlobalParams();
    if (isNaN(opt.S) || opt.S <= 0) return 0;
    return blackScholesPrice(opt.S, opt.K, T_years, r, sigma, opt.type);
}

// Adicionar nova operação
function addOperation(type, customS = null, customK = null, customQtd = 1, customEntry = null) {
    const defaultS = 100;
    const defaultK = 105;
    const S_val = customS !== null ? customS : defaultS;
    const K_val = customK !== null ? customK : defaultK;
    const qtd = customQtd;
    const theoreticalEntry = customEntry !== null ? customEntry : (() => {
        const { r, sigma, T_years } = getGlobalParams();
        return blackScholesPrice(S_val, K_val, T_years, r, sigma, type);
    })();

    const newOp = {
        id: nextId++,
        type: type,
        S: S_val,
        K: K_val,
        qtd: qtd,
        entryPrice: theoreticalEntry,
    };
    operations.push(newOp);
    renderAllCards();
}

// Atualizar campo específico da operação
function updateOperationField(id, field, value) {
    const op = operations.find(o => o.id === id);
    if (!op) return;
    if (field === 'S') op.S = parseFloat(value) || 0;
    else if (field === 'K') op.K = parseFloat(value) || 0;
    else if (field === 'qtd') op.qtd = parseFloat(value) || 0;
    else if (field === 'entryPrice') op.entryPrice = parseFloat(value) || 0;
    renderAllCards();
}

// Remover operação
function removeOperation(id) {
    operations = operations.filter(o => o.id !== id);
    renderAllCards();
}

// Simular novo preço do ativo
function simulateOperationPrice(id, simulatedS) {
    const op = operations.find(o => o.id === id);
    if (!op) return { pnl: 0, oldPrice: 0, newPrice: 0 };
    const { r, sigma, T_years } = getGlobalParams();
    let simulatedOptionPrice = 0;
    if (!isNaN(simulatedS) && simulatedS > 0) {
        simulatedOptionPrice = blackScholesPrice(simulatedS, op.K, T_years, r, sigma, op.type);
    } else {
        simulatedOptionPrice = getCurrentOptionPrice(op);
    }
    const pnlPorUnidade = simulatedOptionPrice - op.entryPrice;
    const pnlTotal = pnlPorUnidade * op.qtd;
    return { pnl: pnlTotal, simulatedPrice: simulatedOptionPrice };
}

// Renderização completa dos cards
function renderAllCards() {
    if (!container) return;
    if (operations.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1; text-align:center; background:#faf9fe; border-radius:2rem; padding:2rem; color:#6b7f8f;">✨ Nenhuma operação ainda. Adicione uma CALL ou PUT para começar.</div>`;
        return;
    }

    let html = '';
    for (let op of operations) {
        const currentTheoPrice = getCurrentOptionPrice(op);
        const pnlPorUnidade = currentTheoPrice - op.entryPrice;
        const pnlTotal = pnlPorUnidade * op.qtd;
        const pnlSymbol = pnlTotal >= 0 ? '▲' : '▼';
        
        const simId = `simInput_${op.id}`;
        
        html += `
            <div class="option-card" data-id="${op.id}">
                <div class="card-header">
                    <span class="card-title">${op.type === 'call' ? '📞 CALL' : '⛔ PUT'} · ID ${op.id}</span>
                    <span class="card-type ${op.type === 'call' ? 'type-call' : 'type-put'}">${op.type.toUpperCase()}</span>
                </div>
                
                <div class="input-group">
                    <div class="input-row">
                        <label>Preço Atual (S)</label>
                        <input type="number" step="0.5" value="${op.S}" class="field-S" data-field="S" data-id="${op.id}">
                    </div>
                    <div class="input-row">
                        <label>Strike (K)</label>
                        <input type="number" step="0.5" value="${op.K}" class="field-K" data-field="K" data-id="${op.id}">
                    </div>
                    <div class="input-row">
                        <label>Quantidade</label>
                        <input type="number" step="1" value="${op.qtd}" class="field-qtd" data-field="qtd" data-id="${op.id}">
                    </div>
                    <div class="input-row">
                        <label>Preço entrada</label>
                        <input type="number" step="0.1" value="${op.entryPrice.toFixed(2)}" class="field-entry" data-field="entryPrice" data-id="${op.id}">
                    </div>
                </div>
                
                <div class="bs-value">
                    <div class="bs-label">📐 PREÇO TEÓRICO (BS Atual)</div>
                    <div class="bs-price">R$ ${currentTheoPrice.toFixed(2)}</div>
                    <div class="bs-label" style="margin-top: 5px;">Lucro/Perda atual (vs entrada)</div>
                    <div style="font-weight:700; font-size:1rem;">${pnlSymbol} R$ ${pnlTotal.toFixed(2)} (${pnlPorUnidade.toFixed(2)} por unid)</div>
                </div>
                
                <div class="simulate-row">
                    <input type="number" id="${simId}" placeholder="Novo S (simular)" step="0.5" value="${op.S}">
                    <button class="btn-sim" data-simulate="${op.id}" data-siminput="${simId}">🔮 Simular P&L</button>
                </div>
                <div id="simResult_${op.id}" class="profit-loss" style="font-size:0.8rem; margin-top:0.3rem;">
                    💡 Clique em simular para alterar preço do ativo
                </div>
                <button class="btn-remove" data-remove="${op.id}">✖ Remover operação</button>
            </div>
        `;
    }
    container.innerHTML = html;
    
    attachCardEvents();
}

function attachCardEvents() {
    document.querySelectorAll('.field-S, .field-K, .field-qtd, .field-entry').forEach(input => {
        input.removeEventListener('change', handleFieldChange);
        input.addEventListener('change', handleFieldChange);
    });
    
    document.querySelectorAll('[data-simulate]').forEach(btn => {
        btn.removeEventListener('click', handleSimulate);
        btn.addEventListener('click', handleSimulate);
    });
    
    document.querySelectorAll('[data-remove]').forEach(btn => {
        btn.removeEventListener('click', handleRemove);
        btn.addEventListener('click', handleRemove);
    });
}

function handleFieldChange(e) {
    const input = e.target;
    const field = input.getAttribute('data-field');
    const id = parseInt(input.getAttribute('data-id'));
    let value = input.value;
    if (field === 'qtd') value = parseInt(value) || 0;
    else value = parseFloat(value) || 0;
    if (field === 'entryPrice' && value < 0) value = 0;
    if (field === 'S' && value < 0) value = 0;
    if (field === 'K' && value < 0) value = 0;
    updateOperationField(id, field, value);
}

function handleSimulate(e) {
    const btn = e.currentTarget;
    const opId = parseInt(btn.getAttribute('data-simulate'));
    const inputId = btn.getAttribute('data-siminput');
    const simInput = document.getElementById(inputId);
    if (!simInput) return;
    let simulatedS = parseFloat(simInput.value);
    if (isNaN(simulatedS)) simulatedS = 0;
    const op = operations.find(o => o.id === opId);
    if (!op) return;
    
    const result = simulateOperationPrice(opId, simulatedS);
    const resultDiv = document.getElementById(`simResult_${opId}`);
    if (resultDiv) {
        const signal = result.pnl >= 0 ? '📈 LUCRO' : '📉 PREJUÍZO';
        const colorClass = result.pnl >= 0 ? 'profit-positive' : 'profit-negative';
        resultDiv.innerHTML = `🔍 Simulação S = R$ ${simulatedS.toFixed(2)} → Opção vale R$ ${result.simulatedPrice.toFixed(2)}<br>
                               ${signal}: R$ ${result.pnl.toFixed(2)} (vs entrada R$ ${op.entryPrice.toFixed(2)})`;
        resultDiv.className = `profit-loss ${colorClass}`;
    }
}

function handleRemove(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.getAttribute('data-remove'));
    removeOperation(id);
}

function resetAllOperations() {
    operations = [];
    nextId = 1;
    renderAllCards();
}

// ---------- FUNÇÕES DA CALCULADORA BS (TEMPO EM DIAS) ----------
function updateCalculator() {
    const S = parseFloat(calcS.value) || 0;
    const K = parseFloat(calcK.value) || 0;
    const days = parseFloat(calcDays.value) || 0;
    const baseDays = parseInt(calcDaysBase.value) || 365;
    const r = parseFloat(calcR.value) || 0;
    const sigma = parseFloat(calcSigma.value) || 0;
    
    const T_years = daysToYears(days, baseDays);
    
    if (S <= 0 || K <= 0 || days <= 0 || sigma <= 0) {
        calcResultPrice.textContent = 'R$ 0.00';
        calcResultDetails.innerHTML = '<div>⚠️ Preencha todos os campos</div>';
        return;
    }
    
    const price = blackScholesPrice(S, K, T_years, r, sigma, currentCalcType);
    const greeks = calculateGreeks(S, K, T_years, r, sigma, currentCalcType);
    
    // Theta por dia (dividir o theta anual pela base)
    const theta_per_day = greeks.theta_annual / baseDays;
    
    calcResultPrice.textContent = `R$ ${price.toFixed(2)}`;
    calcResultDetails.innerHTML = `
        <div>📐 Delta: ${greeks.delta.toFixed(4)}</div>
        <div>⚡ Gamma: ${greeks.gamma.toFixed(4)}</div>
        <div>⏳ Theta: ${theta_per_day.toFixed(4)}/dia</div>
        <div>📊 Vega: ${greeks.vega.toFixed(4)}</div>
        <div>🎯 Rho: ${greeks.rho.toFixed(4)}</div>
        <div>⏱️ Tempo: ${days} dias (${T_years.toFixed(4)} anos)</div>
    `;
}

function syncParamsToOperations() {
    const r = parseFloat(calcR.value) || 0.05;
    const sigma = parseFloat(calcSigma.value) || 0.25;
    const days = parseFloat(calcDays.value) || 126;
    const baseDays = parseInt(calcDaysBase.value) || 365;
    
    riskFreeInput.value = r;
    volatilityInput.value = sigma;
    daysToExpInput.value = days;
    daysBaseSelect.value = baseDays;
    
    renderAllCards();
}

// Inicializar com exemplos
function initDemo() {
    const { r, sigma, T_years } = getGlobalParams();
    const demoCallPrice = blackScholesPrice(100, 105, T_years, r, sigma, 'call');
    const demoPutPrice = blackScholesPrice(98, 100, T_years, r, sigma, 'put');
    operations.push({
        id: nextId++,
        type: 'call',
        S: 100,
        K: 105,
        qtd: 2,
        entryPrice: demoCallPrice
    });
    operations.push({
        id: nextId++,
        type: 'put',
        S: 98,
        K: 100,
        qtd: 1,
        entryPrice: demoPutPrice
    });
    renderAllCards();
}

function bindGlobalEvents() {
    addCallBtn.addEventListener('click', () => addOperation('call'));
    addPutBtn.addEventListener('click', () => addOperation('put'));
    resetAllBtn.addEventListener('click', resetAllOperations);
    syncParamsBtn.addEventListener('click', syncParamsToOperations);
    
    riskFreeInput.addEventListener('input', () => renderAllCards());
    volatilityInput.addEventListener('input', () => renderAllCards());
    daysToExpInput.addEventListener('input', () => renderAllCards());
    daysBaseSelect.addEventListener('change', () => renderAllCards());
    
    // Eventos da calculadora
    calcCallBtn.addEventListener('click', () => {
        currentCalcType = 'call';
        calcCallBtn.classList.add('active');
        calcPutBtn.classList.remove('active');
        updateCalculator();
    });
    
    calcPutBtn.addEventListener('click', () => {
        currentCalcType = 'put';
        calcPutBtn.classList.add('active');
        calcCallBtn.classList.remove('active');
        updateCalculator();
    });
    
    calculateBtn.addEventListener('click', updateCalculator);
    
    [calcS, calcK, calcDays, calcDaysBase, calcR, calcSigma].forEach(input => {
        input.addEventListener('input', updateCalculator);
    });
}

function start() {
    bindGlobalEvents();
    initDemo();
    updateCalculator();
}

start();