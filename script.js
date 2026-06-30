const API_BASE = 'https://api.coingecko.com/api/v3';
let API_KEY = '';

async function getApiKey() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '';
    }
    
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        API_KEY = data.apiKey;
        console.log('🔑 API Key:', API_KEY ? '✅ Loaded' : '❌ Not found');
        return API_KEY;
    } catch (error) {
        console.error('Error loading API key:', error);
        return '';
    }
}

function generateCryptoIcon(symbol, color = '#6c63ff') {
    const text = symbol.substring(0, 2).toUpperCase();
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r="14" fill="${color}" opacity="0.2"/>
            <circle cx="14" cy="14" r="12" fill="${color}" opacity="0.8"/>
            <text x="14" y="17" text-anchor="middle" font-family="Arial, sans-serif" 
                  font-size="10" font-weight="bold" fill="#ffffff">${text}</text>
        </svg>
    `;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const CRYPTO_ICONS = {
    'bitcoin': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    'ethereum': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    'tether': 'https://assets.coingecko.com/coins/images/325/large/tether.png',
    'binancecoin': 'https://assets.coingecko.com/coins/images/825/large/bnb.png',
    'bnb': 'https://assets.coingecko.com/coins/images/825/large/bnb.png',
    'cardano': 'https://assets.coingecko.com/coins/images/2010/large/cardano.png',
    'solana': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    'ripple': 'https://assets.coingecko.com/coins/images/44/large/ripple.png',
    'dogecoin': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
    'polkadot': 'https://assets.coingecko.com/coins/images/121/large/polkadot.png',
    'avalanche-2': 'https://assets.coingecko.com/coins/images/1069/large/avalanche.png',
};

function getCryptoIconUrl(id, symbol) {
    if (CRYPTO_ICONS[id]) {
        return CRYPTO_ICONS[id];
    }
    return generateCryptoIcon(symbol);
}

const CRYPTO_IDS = [
    'bitcoin', 
    'ethereum', 
    'tether', 
    'binancecoin', 
    'cardano', 
    'solana', 
    'ripple', 
    'dogecoin', 
    'polkadot', 
    'avalanche-2'
];

let watchlist = JSON.parse(localStorage.getItem('crypto-watchlist')) || [];
let currentFilter = 'all';
let currentSearch = '';
let allCryptos = [];
let chartInstance = null;
let currentPeriod = '30D';
let isLoading = false;
let visibleCount = 10;
let historicalDataCache = {};
let isChartUpdating = false;

function formatPrice(price) {
    if (price >= 1) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 0.01) return '$' + price.toFixed(4);
    return '$' + price.toFixed(6);
}

function formatChange(change) {
    return (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
}

function formatMarketCap(mcap) {
    if (mcap >= 1e12) return '$' + (mcap / 1e12).toFixed(2) + 'T';
    if (mcap >= 1e9) return '$' + (mcap / 1e9).toFixed(2) + 'B';
    if (mcap >= 1e6) return '$' + (mcap / 1e6).toFixed(2) + 'M';
    return '$' + mcap.toFixed(0);
}

const btcPrice = document.getElementById('btcPrice');
const btcChange = document.getElementById('btcChange');
const ethPrice = document.getElementById('ethPrice');
const ethChange = document.getElementById('ethChange');
const marketCap = document.getElementById('marketCap');
const marketCapChange = document.getElementById('marketCapChange');
const volume = document.getElementById('volume');
const volumeChange = document.getElementById('volumeChange');
const cryptoTableBody = document.getElementById('cryptoTableBody');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const resultCount = document.getElementById('resultCount');
const refreshBtn = document.getElementById('refreshBtn');
const themeToggle = document.getElementById('themeToggle');
const toast = document.getElementById('toast');
const chartContainer = document.getElementById('chartContainer');
const chartLegend = document.getElementById('chartLegend');

async function fetchCryptoData() {
    try {
        let url = `${API_BASE}/coins/markets?vs_currency=usd&ids=${CRYPTO_IDS.join(',')}&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h`;
        
        if (API_KEY) {
            url += `&x_cg_demo_api_key=${API_KEY}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 429) {
                showToast('Rate limit exceeded. Please wait a moment.', 'error');
            } else if (response.status === 401) {
                showToast('Invalid API key. Please check your key.', 'error');
            } else {
                showToast(`API Error: ${response.status}`, 'error');
            }
            throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('No data received from API');
        }
        
        allCryptos = data;
        return data;
    } catch (error) {
        console.error('Error fetching crypto data:', error);
        showToast('Using fallback data.', 'info');
        return generateFallbackData();
    }
}

function generateFallbackData() {
    const names = ['Bitcoin', 'Ethereum', 'Tether', 'BNB', 'Cardano', 'Solana', 'Ripple', 'Dogecoin', 'Polkadot', 'Avalanche'];
    const symbols = ['BTC', 'ETH', 'USDT', 'BNB', 'ADA', 'SOL', 'XRP', 'DOGE', 'DOT', 'AVAX'];
    return names.map((name, i) => ({
        id: symbols[i].toLowerCase(),
        name: name,
        symbol: symbols[i],
        current_price: 1000 + Math.random() * 60000,
        market_cap: 1000000000 + Math.random() * 100000000000,
        price_change_percentage_24h: (Math.random() - 0.5) * 20,
        sparkline_in_7d: { price: Array(7).fill(0).map(() => 1000 + Math.random() * 60000) }
    }));
}

async function fetchGlobalData() {
    try {
        let url = `${API_BASE}/global`;
        
        if (API_KEY) {
            url += `?x_cg_demo_api_key=${API_KEY}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('Error fetching global data:', error);
        return {
            total_market_cap: { usd: 2450000000000 },
            total_volume: { usd: 89200000000 },
            market_cap_change_percentage_24h_usd: 1.85
        };
    }
}

async function fetchHistoricalData(coinId, days) {
    const cacheKey = `${coinId}_${days}`;
    
    if (historicalDataCache[cacheKey]) {
        return historicalDataCache[cacheKey];
    }
    
    try {
        let url = `${API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
        
        if (API_KEY) {
            url += `&x_cg_demo_api_key=${API_KEY}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.prices || data.prices.length === 0) {
            throw new Error('No historical data received');
        }
        
        historicalDataCache[cacheKey] = data;
        return data;
    } catch (error) {
        console.error(`Error fetching historical data for ${coinId}:`, error);
        const mockData = generateMockHistoricalData(days);
        historicalDataCache[cacheKey] = mockData;
        return mockData;
    }
}

function generateMockHistoricalData(days) {
    const prices = [];
    const now = Date.now();
    const basePrice = 40000 + Math.random() * 30000;
    
    for (let i = days; i >= 0; i--) {
        const price = basePrice + (Math.random() - 0.5) * 5000 * (i / days);
        prices.push([now - i * 24 * 60 * 60 * 1000, price]);
    }
    
    return { prices: prices };
}

function renderStats(data) {
    const btc = data.find(c => c.id === 'bitcoin');
    const eth = data.find(c => c.id === 'ethereum');
    
    if (btc) {
        btcPrice.textContent = formatPrice(btc.current_price);
        btcChange.textContent = formatChange(btc.price_change_percentage_24h);
        btcChange.className = `stat-change ${btc.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}`;
    }
    
    if (eth) {
        ethPrice.textContent = formatPrice(eth.current_price);
        ethChange.textContent = formatChange(eth.price_change_percentage_24h);
        ethChange.className = `stat-change ${eth.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}`;
    }
}

function renderWatchlist(data) {
    let filtered = [...data];
    
    if (currentSearch) {
        filtered = filtered.filter(crypto =>
            crypto.name.toLowerCase().includes(currentSearch.toLowerCase()) ||
            crypto.symbol.toLowerCase().includes(currentSearch.toLowerCase())
        );
    }
    
    if (currentFilter === 'gainers') {
        filtered = filtered.filter(c => c.price_change_percentage_24h > 0);
    } else if (currentFilter === 'losers') {
        filtered = filtered.filter(c => c.price_change_percentage_24h < 0);
    } else if (currentFilter === 'watchlist') {
        filtered = filtered.filter(c => watchlist.includes(c.id));
    }
    
    filtered.sort((a, b) => b.market_cap - a.market_cap);
    
    const visibleData = filtered.slice(0, visibleCount);
    
    resultCount.textContent = `Showing ${visibleData.length} of ${filtered.length} cryptocurrencies`;
    
    if (visibleData.length === 0) {
        cryptoTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">
                    <i class="fas fa-search" style="font-size:2rem;display:block;margin-bottom:12px;"></i>
                    No cryptocurrencies found
                </td>
            </tr>
        `;
        loadMoreBtn.style.display = 'none';
        return;
    }
    
    cryptoTableBody.innerHTML = visibleData.map((crypto, index) => {
        const iconUrl = getCryptoIconUrl(crypto.id, crypto.symbol);
        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="crypto-info">
                        <img src="${iconUrl}" 
                             alt="${crypto.name}"
                             width="28" 
                             height="28"
                             style="border-radius:50%;"
                             onerror="this.src='${generateCryptoIcon(crypto.symbol)}'"
                        />
                        <div>
                            <div class="crypto-name">${crypto.name}</div>
                            <div class="crypto-symbol">${crypto.symbol.toUpperCase()}</div>
                        </div>
                    </div>
                </td>
                <td class="price">${formatPrice(crypto.current_price)}</td>
                <td class="change ${crypto.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}">
                    ${formatChange(crypto.price_change_percentage_24h)}
                </td>
                <td>${formatMarketCap(crypto.market_cap)}</td>
                <td>
                    <button class="watchlist-btn ${watchlist.includes(crypto.id) ? 'active' : ''}" 
                            onclick="toggleWatchlist('${crypto.id}')">
                        <i class="fas ${watchlist.includes(crypto.id) ? 'fa-star' : 'fa-star'}"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    loadMoreBtn.style.display = filtered.length > visibleData.length ? 'inline-flex' : 'none';
}

async function updateChart(data, days) {
    if (isChartUpdating) return;
    isChartUpdating = true;
    
    try {
        const ctx = document.getElementById('cryptoChart').getContext('2d');
        
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        
        if (!data || data.length === 0) {
            showToast('No data available for chart', 'error');
            isChartUpdating = false;
            return;
        }
        
        const topCoins = data.slice(0, 10);
        const colors = [
            '#f7931a', '#627eea', '#26a17b', '#f3ba2f', '#0033ad', 
            '#9945ff', '#00aae4', '#c2a633', '#e6007a', '#e84142'
        ];
        
        const chartData = {
            labels: [],
            datasets: []
        };
        
        let hasData = false;
        
        for (let i = 0; i < topCoins.length; i++) {
            const coin = topCoins[i];
            const historicalData = await fetchHistoricalData(coin.id, days);
            
            if (!historicalData || !historicalData.prices || historicalData.prices.length === 0) {
                continue;
            }
            
            const prices = historicalData.prices.map(item => item[1]);
            
            if (i === 0) {
                const dates = historicalData.prices.map(item => new Date(item[0]));
                chartData.labels = dates.map(date => {
                    if (days <= 1) {
                        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } else if (days <= 7) {
                        return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
                    } else {
                        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    }
                });
            }
            
            chartData.datasets.push({
                label: coin.symbol.toUpperCase(),
                data: prices,
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '20',
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5,
                borderWidth: 2,
                spanGaps: true
            });
            
            hasData = true;
        }
        
        if (!hasData) {
            throw new Error('No historical data available for any coin');
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: {
                                size: 11,
                                weight: '500'
                            },
                            boxWidth: 12,
                            padding: 10,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.parsed.y.toLocaleString('en-US', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                });
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(255,255,255,0.05)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            maxTicksLimit: days <= 1 ? 12 : 20,
                            maxRotation: 45,
                            autoSkip: true
                        }
                    }
                }
            }
        });
        
        console.log(`📈 Chart updated with ${chartData.datasets.length} cryptocurrencies for ${days} days`);
        
    } catch (error) {
        console.error('Error updating chart:', error);
        showToast('Error loading chart data.', 'error');
        initFallbackChart(data);
    } finally {
        isChartUpdating = false;
    }
}

function initFallbackChart(data) {
    const ctx = document.getElementById('cryptoChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    
    const topCoins = data.slice(0, 10);
    const labels = topCoins.map(c => c.symbol.toUpperCase());
    const prices = topCoins.map(c => c.current_price);
    const colors = ['#f7931a', '#627eea', '#26a17b', '#f3ba2f', '#0033ad', '#9945ff', '#00aae4', '#c2a633', '#e6007a', '#e84142'];
    
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Current Price (USD)',
                data: prices,
                backgroundColor: colors.map((c, i) => c + '80'),
                borderColor: colors,
                borderWidth: 2,
                borderRadius: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '$' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255,255,255,0.05)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#94a3b8'
                    }
                }
            }
        }
    });
}

window.toggleWatchlist = function(id) {
    const index = watchlist.indexOf(id);
    if (index > -1) {
        watchlist.splice(index, 1);
        showToast(`Removed from watchlist`, 'info');
    } else {
        watchlist.push(id);
        showToast(`Added to watchlist ⭐`, 'success');
    }
    localStorage.setItem('crypto-watchlist', JSON.stringify(watchlist));
    renderWatchlist(allCryptos);
};

searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    clearSearch.classList.toggle('visible', currentSearch.length > 0);
    visibleCount = 10;
    renderWatchlist(allCryptos);
});

clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    currentSearch = '';
    clearSearch.classList.remove('visible');
    visibleCount = 10;
    renderWatchlist(allCryptos);
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        visibleCount = 10;
        renderWatchlist(allCryptos);
    });
});

document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const daysMap = {
            '1D': 1,
            '7D': 7,
            '30D': 30,
            '90D': 90,
            '1Y': 365
        };
        
        const period = this.dataset.period;
        currentPeriod = period;
        const daysToFetch = daysMap[period] || 30;
        
        showToast(`Loading ${period} chart...`, 'info');
        await updateChart(allCryptos, daysToFetch);
        showToast(`📈 ${period} chart updated!`, 'success');
    });
});

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

let isDark = true;

themeToggle.addEventListener('click', () => {
    isDark = !isDark;
    const root = document.documentElement;
    if (isDark) {
        root.style.setProperty('--bg-primary', '#0a0e1a');
        root.style.setProperty('--text-primary', '#ffffff');
        root.style.setProperty('--text-secondary', 'rgba(255,255,255,0.7)');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        root.style.setProperty('--bg-primary', '#f0f2f5');
        root.style.setProperty('--text-primary', '#0a0e1a');
        root.style.setProperty('--text-secondary', 'rgba(0,0,0,0.7)');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
    showToast(`Switched to ${isDark ? 'dark' : 'light'} mode`, 'info');
});

refreshBtn.addEventListener('click', () => {
    refreshBtn.querySelector('i').classList.add('fa-spin');
    loadData();
    setTimeout(() => {
        refreshBtn.querySelector('i').classList.remove('fa-spin');
        showToast('Data refreshed!', 'success');
    }, 1500);
});

loadMoreBtn.addEventListener('click', () => {
    visibleCount += 10;
    renderWatchlist(allCryptos);
    showToast(`Showing ${visibleCount} cryptocurrencies`, 'info');
});

async function loadData() {
    if (isLoading) return;
    isLoading = true;
    
    try {
        if (!API_KEY) {
            await getApiKey();
        }
        
        const [cryptoData, globalData] = await Promise.all([
            fetchCryptoData(),
            fetchGlobalData()
        ]);
        
        allCryptos = cryptoData;
        
        if (globalData) {
            marketCap.textContent = formatMarketCap(globalData.total_market_cap?.usd || 2450000000000);
            volume.textContent = formatMarketCap(globalData.total_volume?.usd || 89200000000);
            const mcapChange = globalData.market_cap_change_percentage_24h_usd || 1.85;
            marketCapChange.textContent = formatChange(mcapChange);
            marketCapChange.className = `stat-change ${mcapChange >= 0 ? 'positive' : 'negative'}`;
        }
        
        renderStats(cryptoData);
        renderWatchlist(cryptoData);
        
        const daysMap = {
            '1D': 1,
            '7D': 7,
            '30D': 30,
            '90D': 90,
            '1Y': 365
        };
        const daysToFetch = daysMap[currentPeriod] || 30;
        
        await updateChart(cryptoData, daysToFetch);
        
        console.log('🚀 Crypto Dashboard Loaded!');
        console.log(`📊 ${cryptoData.length} cryptocurrencies loaded`);
        console.log(`⭐ ${watchlist.length} in watchlist`);
        console.log(`📈 Chart period: ${currentPeriod}`);
        console.log(`🔑 API Key: ${API_KEY ? '✅ Configured' : '❌ Not configured'}`);
        
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Error loading data. Please refresh.', 'error');
    } finally {
        isLoading = false;
    }
}

setInterval(() => {
    loadData();
}, 60000);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        refreshBtn.click();
    }
    if (e.key === 'Escape') {
        clearSearch.click();
        searchInput.blur();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.time-btn[data-period="30D"]')?.classList.add('active');
    currentPeriod = '30D';
    loadData();
});

console.log('%c🚀 CryptoVault Dashboard', 'font-size:24px;font-weight:bold;color:#6c63ff;');
console.log('%c📊 Live Crypto Data | Dark Glass Theme', 'font-size:14px;color:#888;');
console.log('%c⭐ Watchlist: ' + watchlist.length + ' coins', 'font-size:14px;color:#888;');
console.log('%c📈 Shows ALL 10 cryptocurrencies with different colors!', 'font-size:14px;color:#f9ca24;');