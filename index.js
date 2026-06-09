// ============================================
// CONFIGURAÇÃO DO SUPABASE (SUAS CREDENCIAIS)
// ============================================
const SUPABASE_URL = 'https://bvbwwypxwxwljezymiva.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9pGdZp9g3Ia7P1xU9rGoHg_s6toKyRU';

console.log('🚀 Iniciando com URL:', SUPABASE_URL);

let supabase = null;
let currentUser = null;
let operations = [];

// ============================================
// FUNÇÕES BLACK-SCHOLES
// ============================================
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

function calculateGreeks(S, K, T_years, r, sigma, type) {
    if (T_years <= 0) {
        return { delta: 0, gamma: 0, theta_annual: 0, vega: 0, rho: 0 };
    }
    
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T_years) / (sigma * Math.sqrt(T_years));
    const d2 = d1 - sigma * Math.sqrt(T_years);
    const pdfD1 = normPDF(d1);
    
    let delta = type === 'call' ? normCDF(d1) : normCDF(d1) - 1;
    const gamma = pdfD1 / (S * sigma * Math.sqrt(T_years));
    
    let theta_annual;
    if (type === 'call') {
        theta_annual = - (S * pdfD1 * sigma) / (2 * Math.sqrt(T_years)) - r * K * Math.exp(-r * T_years) * normCDF(d2);
    } else {
        theta_annual = - (S * pdfD1 * sigma) / (2 * Math.sqrt(T_years)) + r * K * Math.exp(-r * T_years) * normCDF(-d2);
    }
    
    const vega = S * pdfD1 * Math.sqrt(T_years);
    let rho = type === 'call' ? K * T_years * Math.exp(-r * T_years) * normCDF(d2) : -K * T_years * Math.exp(-r * T_years) * normCDF(-d2);
    
    return { delta, gamma, theta_annual, vega, rho };
}

function daysToYears(days, baseDays) {
    if (days <= 0) return 0;
    return days / baseDays;
}

function getGlobalParams() {
    const days = parseFloat(document.getElementById('daysToExp')?.value) || 126;
    const baseDays = parseInt(document.getElementById('daysBaseSelect')?.value) || 365;
    const T_years = daysToYears(days, baseDays);
    
    return {
        r: parseFloat(document.getElementById('riskFreeRate')?.value) || 0.05,
        sigma: parseFloat(document.getElementById('volatility')?.value) || 0.25,
        T_years: T_years,
        days: days,
        baseDays: baseDays
    };
}

function getCurrentOptionPriceFromOp(op) {
    const { r, sigma, T_years } = getGlobalParams();
    return blackScholesPrice(op.preco_atual, op.strike, T_years, r, sigma, op.tipo);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================================
// CRUD OPERAÇÕES COM SUPABASE
// ============================================
async function loadOperations() {
    console.log('📥 loadOperations chamado. Supabase:', !!supabase, 'CurrentUser:', !!currentUser);
    
    if (!supabase) {
        console.log('❌ Supabase não inicializado');
        renderEmptyState('Supabase não inicializado. Verifique suas credenciais.');
        return;
    }
    
    if (!currentUser) {
        console.log('❌ Usuário não logado');
        renderEmptyState('🔐 Faça login para ver suas operações');
        return;
    }
    
    const loadingDiv = document.getElementById('loadingIndicator');
    if (loadingDiv) loadingDiv.style.display = 'block';
    
    try {
        console.log('📡 Buscando operações para usuário:', currentUser.id);
        
        const { data, error } = await supabase
            .from('operacoes')
            .select('*')
            .order('id', { ascending: false });
        
        if (loadingDiv) loadingDiv.style.display = 'none';
        
        if (error) {
            console.error('❌ Erro Supabase:', error);
            showToast('Erro ao carregar: ' + error.message, 'error');
            renderEmptyState('Erro: ' + error.message);
            return;
        }
        
        console.log('✅ Dados recebidos:', data?.length || 0, 'registros');
        operations = data || [];
        
        if (operations.length === 0) {
            renderEmptyState('📭 Nenhuma operação. Clique em + Adicionar para começar!');
        } else {
            renderOperationsCards();
        }
    } catch (err) {
        console.error('❌ Exceção:', err);
        if (loadingDiv) loadingDiv.style.display = 'none';
        renderEmptyState('Erro de conexão: ' + err.message);
    }
}

async function addOperationToDB(tipo, preco_atual, strike, quantidade, preco_entrada) {
    console.log('➕ Adicionando operação...');
    
    if (!supabase) {
        showToast('Supabase não configurado!', 'error');
        return false;
    }
    
    if (!currentUser) {
        showToast('Faça login primeiro! Clique em "Entrar / Cadastrar"', 'error');
        return false;
    }
    
    try {
        const { data, error } = await supabase
            .from('operacoes')
            .insert([{
                tipo: tipo,
                preco_atual: preco_atual,
                strike: strike,
                quantidade: quantidade,
                preco_entrada: preco_entrada,
                user_id: currentUser.id
            }])
            .select();
        
        if (error) {
            console.error('❌ Erro ao inserir:', error);
            showToast('Erro: ' + error.message, 'error');
            return false;
        }
        
        console.log('✅ Inserido com sucesso:', data);
        showToast('✅ Operação adicionada!', 'success');
        await loadOperations();
        return true;
    } catch (err) {
        console.error('❌ Exceção:', err);
        showToast('Erro: ' + err.message, 'error');
        return false;
    }
}

async function updateOperationInDB(id, updates) {
    if (!supabase || !currentUser) return false;
    
    try {
        const { error } = await supabase
            .from('operacoes')
            .update(updates)
            .eq('id', id);
        
        if (error) {
            showToast('Erro ao atualizar: ' + error.message, 'error');
            return false;
        }
        
        await loadOperations();
        return true;
    } catch (err) {
        console.error('❌ Erro:', err);
        return false;
    }
}

async function deleteOperationFromDB(id) {
    if (!supabase || !currentUser) return false;
    
    if (!confirm('Tem certeza que deseja remover esta operação?')) return false;
    
    try {
        const { error } = await supabase
            .from('operacoes')
            .delete()
            .eq('id', id);
        
        if (error) {
            showToast('Erro ao deletar: ' + error.message, 'error');
            return false;
        }
        
        showToast('✅ Operação removida!', 'success');
        await loadOperations();
        return true;
    } catch (err) {
        console.error('❌ Erro:', err);
        return false;
    }
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderOperationsCards() {
    const container = document.getElementById('optionsContainer');
    
    if (!container) return;
    
    if (!operations || operations.length === 0) {
        container.innerHTML = `<div class="empty-state">✨ Nenhuma operação ainda. Clique em "Adicionar" para começar.</div>`;
        return;
    }
    
    let html = '';
    for (let op of operations) {
        const currentPrice = getCurrentOptionPriceFromOp(op);
        const pnlPorUnidade = currentPrice - op.preco_entrada;
        const pnlTotal = pnlPorUnidade * op.quantidade;
        const pnlSymbol = pnlTotal >= 0 ? '▲' : '▼';
        const pnlClass = pnlTotal >= 0 ? 'profit-positive' : 'profit-negative';
        
        html += `
            <div class="option-card" data-id="${op.id}">
                <div class="card-header">
                    <span class="card-title">${op.tipo === 'call' ? '📞 CALL' : '⛔ PUT'} · ID ${op.id}</span>
                    <span class="card-type ${op.tipo === 'call' ? 'type-call' : 'type-put'}">${op.tipo.toUpperCase()}</span>
                </div>
                <div class="input-group">
                    <div class="input-row">
                        <label>Preço Atual (S)</label>
                        <input type="number" step="0.5" value="${op.preco_atual}" class="field-S" data-field="preco_atual" data-id="${op.id}">
                    </div>
                    <div class="input-row">
                        <label>Strike (K)</label>
                        <input type="number" step="0.5" value="${op.strike}" class="field-K" data-field="strike" data-id="${op.id}">
                    </div>
                    <div class="input-row">
                        <label>Quantidade</label>
                        <input type="number" step="1" value="${op.quantidade}" class="field-qtd" data-field="quantidade" data-id="${op.id}">
                    </div>
                    <div class="input-row">
                        <label>Preço entrada</label>
                        <input type="number" step="0.1" value="${op.preco_entrada.toFixed(2)}" class="field-entry" data-field="preco_entrada" data-id="${op.id}">
                    </div>
                </div>
                <div class="bs-value">
                    <div class="bs-label">📐 PREÇO TEÓRICO (BS Atual)</div>
                    <div class="bs-price">R$ ${currentPrice.toFixed(2)}</div>
                    <div class="bs-label">Lucro/Perda atual</div>
                    <div class="${pnlClass}" style="font-weight:700; padding:0.3rem; margin-top:0.5rem;">${pnlSymbol} R$ ${pnlTotal.toFixed(2)} (${pnlPorUnidade.toFixed(2)}/unid)</div>
                </div>
                <button class="btn-remove" data-remove="${op.id}">✖ Remover operação</button>
            </div>
        `;
    }
    container.innerHTML = html;
    attachCardEvents();
}

function renderEmptyState(message) {
    const container = document.getElementById('optionsContainer');
    if (container) {
        container.innerHTML = `<div class="empty-state">✨ ${message}</div>`;
    }
}

function attachCardEvents() {
    document.querySelectorAll('.field-S, .field-K, .field-qtd, .field-entry').forEach(input => {
        input.removeEventListener('change', handleFieldChange);
        input.addEventListener('change', handleFieldChange);
    });
    
    document.querySelectorAll('[data-remove]').forEach(btn => {
        btn.removeEventListener('click', handleRemove);
        btn.addEventListener('click', handleRemove);
    });
}

async function handleFieldChange(e) {
    const input = e.target;
    const field = input.getAttribute('data-field');
    const id = parseInt(input.getAttribute('data-id'));
    let value = parseFloat(input.value);
    if (isNaN(value)) value = 0;
    
    await updateOperationInDB(id, { [field]: value });
}

async function handleRemove(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.getAttribute('data-remove'));
    await deleteOperationFromDB(id);
}

// ============================================
// AUTENTICAÇÃO
// ============================================
async function initSupabase() {
    console.log('🔧 Inicializando Supabase...');
    
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase cliente criado');
        
        // Verificar sessão atual
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('❌ Erro na sessão:', error);
            updateAuthUI(false);
            return false;
        }
        
        if (session) {
            console.log('✅ Usuário já logado:', session.user.email);
            currentUser = session.user;
            updateAuthUI(true, session.user.email);
            await loadOperations();
        } else {
            console.log('📭 Nenhuma sessão ativa');
            updateAuthUI(false);
            renderEmptyState('🔐 Faça login para começar');
        }
        
        // Escutar mudanças de autenticação
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔔 Auth state change:', event, session?.user?.email);
            
            if (session) {
                currentUser = session.user;
                updateAuthUI(true, session.user.email);
                await loadOperations();
            } else {
                currentUser = null;
                updateAuthUI(false);
                operations = [];
                renderEmptyState('🔐 Faça login para ver suas operações');
            }
        });
        
        return true;
    } catch (err) {
        console.error('❌ Erro ao inicializar Supabase:', err);
        updateAuthUI(false);
        return false;
    }
}

async function handleLogin() {
    if (!supabase) {
        showToast('Erro: Supabase não inicializado', 'error');
        return;
    }
    
    const email = prompt('📧 Digite seu email para receber o link de acesso:');
    if (!email) return;
    
    try {
        const { error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true,
            }
        });
        
        if (error) {
            showToast('❌ Erro: ' + error.message, 'error');
        } else {
            showToast('✨ Magic link enviado! Verifique seu email.', 'success');
        }
    } catch (err) {
        showToast('❌ Erro: ' + err.message, 'error');
    }
}

async function handleLogout() {
    if (!supabase) return;
    
    try {
        await supabase.auth.signOut();
        currentUser = null;
        operations = [];
        updateAuthUI(false);
        renderEmptyState('🔐 Logout realizado. Faça login para continuar.');
        showToast('✅ Logout realizado com sucesso!', 'success');
    } catch (err) {
        showToast('❌ Erro ao fazer logout: ' + err.message, 'error');
    }
}

function updateAuthUI(isLoggedIn, email = '') {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userEmail = document.getElementById('userEmail');
    const addCallBtn = document.getElementById('addCallBtn');
    const addPutBtn = document.getElementById('addPutBtn');
    
    if (isLoggedIn) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (userEmail) {
            userEmail.style.display = 'block';
            userEmail.textContent = `👤 Logado: ${email}`;
        }
        if (addCallBtn) addCallBtn.disabled = false;
        if (addPutBtn) addPutBtn.disabled = false;
    } else {
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (userEmail) userEmail.style.display = 'none';
        if (addCallBtn) addCallBtn.disabled = false;
        if (addPutBtn) addPutBtn.disabled = false;
    }
}

// ============================================
// CALCULADORA
// ============================================
let currentCalcType = 'call';

function updateCalculator() {
    const S = parseFloat(document.getElementById('calcS')?.value) || 0;
    const K = parseFloat(document.getElementById('calcK')?.value) || 0;
    const days = parseFloat(document.getElementById('calcDays')?.value) || 0;
    const baseDays = parseInt(document.getElementById('calcDaysBase')?.value) || 365;
    const r = parseFloat(document.getElementById('calcR')?.value) || 0;
    const sigma = parseFloat(document.getElementById('calcSigma')?.value) || 0;
    
    const T_years = daysToYears(days, baseDays);
    
    if (S <= 0 || K <= 0 || days <= 0 || sigma <= 0) {
        const priceEl = document.getElementById('calcResultPrice');
        const detailsEl = document.getElementById('calcResultDetails');
        if (priceEl) priceEl.textContent = 'R$ 0.00';
        if (detailsEl) detailsEl.innerHTML = '<div>⚠️ Preencha todos os campos</div>';
        return;
    }
    
    const price = blackScholesPrice(S, K, T_years, r, sigma, currentCalcType);
    const greeks = calculateGreeks(S, K, T_years, r, sigma, currentCalcType);
    const theta_per_day = greeks.theta_annual / baseDays;
    
    const priceEl = document.getElementById('calcResultPrice');
    const detailsEl = document.getElementById('calcResultDetails');
    
    if (priceEl) priceEl.textContent = `R$ ${price.toFixed(2)}`;
    if (detailsEl) {
        detailsEl.innerHTML = `
            <div>📐 Delta: ${greeks.delta.toFixed(4)}</div>
            <div>⚡ Gamma: ${greeks.gamma.toFixed(4)}</div>
            <div>⏳ Theta: ${theta_per_day.toFixed(4)}/dia</div>
            <div>📊 Vega: ${greeks.vega.toFixed(4)}</div>
            <div>🎯 Rho: ${greeks.rho.toFixed(4)}</div>
            <div>⏱️ Tempo: ${days} dias (${T_years.toFixed(4)} anos)</div>
        `;
    }
}

function syncParamsToOperations() {
    const r = parseFloat(document.getElementById('calcR')?.value) || 0.05;
    const sigma = parseFloat(document.getElementById('calcSigma')?.value) || 0.25;
    const days = parseFloat(document.getElementById('calcDays')?.value) || 126;
    const baseDays = parseInt(document.getElementById('calcDaysBase')?.value) || 365;
    
    const riskFree = document.getElementById('riskFreeRate');
    const volatility = document.getElementById('volatility');
    const daysToExp = document.getElementById('daysToExp');
    const daysBase = document.getElementById('daysBaseSelect');
    
    if (riskFree) riskFree.value = r;
    if (volatility) volatility.value = sigma;
    if (daysToExp) daysToExp.value = days;
    if (daysBase) daysBase.value = baseDays;
    
    loadOperations();
    showToast('🔄 Parâmetros sincronizados!', 'success');
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM carregado, inicializando...');
    
    // Inicializar Supabase primeiro
    await initSupabase();
    
    // TABS
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            // Recarregar operações quando voltar para a tab
            if (tabId === 'operations' && currentUser) {
                loadOperations();
            }
        });
    });
    
    // Botões de adicionar
    const addCallBtn = document.getElementById('addCallBtn');
    const addPutBtn = document.getElementById('addPutBtn');
    
    if (addCallBtn) {
        addCallBtn.addEventListener('click', async () => {
            if (!currentUser) {
                showToast('🔐 Faça login primeiro!', 'error');
                return;
            }
            const { r, sigma, T_years } = getGlobalParams();
            const preco_teorico = blackScholesPrice(100, 105, T_years, r, sigma, 'call');
            await addOperationToDB('call', 100, 105, 1, preco_teorico);
        });
    }
    
    if (addPutBtn) {
        addPutBtn.addEventListener('click', async () => {
            if (!currentUser) {
                showToast('🔐 Faça login primeiro!', 'error');
                return;
            }
            const { r, sigma, T_years } = getGlobalParams();
            const preco_teorico = blackScholesPrice(100, 105, T_years, r, sigma, 'put');
            await addOperationToDB('put', 100, 105, 1, preco_teorico);
        });
    }
    
    // Botão refresh
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadOperations);
    
    // Botões auth
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // Sincronizar parâmetros
    const syncBtn = document.getElementById('syncParamsBtn');
    if (syncBtn) syncBtn.addEventListener('click', syncParamsToOperations);
    
    // Eventos da calculadora
    const calcCallBtn = document.getElementById('calcCallBtn');
    const calcPutBtn = document.getElementById('calcPutBtn');
    const calculateBtn = document.getElementById('calculateBtn');
    
    if (calcCallBtn) {
        calcCallBtn.addEventListener('click', () => {
            currentCalcType = 'call';
            calcCallBtn.classList.add('active');
            calcPutBtn?.classList.remove('active');
            updateCalculator();
        });
    }
    
    if (calcPutBtn) {
        calcPutBtn.addEventListener('click', () => {
            currentCalcType = 'put';
            calcPutBtn.classList.add('active');
            calcCallBtn?.classList.remove('active');
            updateCalculator();
        });
    }
    
    if (calculateBtn) calculateBtn.addEventListener('click', updateCalculator);
    
    // Inputs da calculadora
    const calcInputs = ['calcS', 'calcK', 'calcDays', 'calcDaysBase', 'calcR', 'calcSigma'];
    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateCalculator);
    });
    
    // Parâmetros globais
    const globalInputs = ['riskFreeRate', 'volatility', 'daysToExp', 'daysBaseSelect'];
    globalInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            if (currentUser) renderOperationsCards();
        });
    });
    
    // Calcular inicial
    updateCalculator();
    
    console.log('✅ Inicialização completa!');
});