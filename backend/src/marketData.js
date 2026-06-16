const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function enrichHoldingWithPreviousClose(holding) {
  const quote = await fetchPreviousClose(holding);
  if (!quote) {
    return holding;
  }

  return applyQuoteToHolding(holding, quote);
}

export async function refreshHoldingsWithPreviousClose(holdings) {
  const quoteCache = new Map();
  const failed = [];
  const refreshedHoldings = [];

  for (const holding of holdings) {
    const key = quoteKey(holding);
    let quote = quoteCache.get(key);

    if (quote === undefined) {
      quote = await fetchPreviousClose(holding);
      quoteCache.set(key, quote);
    }

    if (quote) {
      refreshedHoldings.push(applyQuoteToHolding(holding, quote));
    } else {
      failed.push({
        symbol: holding.symbol,
        market: holding.market,
        message: "未找到可用的 T-1 收盘价"
      });
      refreshedHoldings.push(holding);
    }
  }

  const updatedCount = refreshedHoldings.filter((holding, index) => {
    return Number(holding.lastPrice) !== Number(holdings[index].lastPrice)
      || holding.priceDate !== holdings[index].priceDate;
  }).length;

  return {
    holdings: refreshedHoldings,
    updatedCount,
    failed
  };
}

async function fetchPreviousClose(holding) {
  if (process.env.PRICE_REFRESH_DISABLED === "1" || holding.market === "cash") {
    return null;
  }

  const provider = process.env.MARKET_DATA_PROVIDER || (process.env.ALPHA_VANTAGE_API_KEY ? "alpha_vantage" : "disabled");

  if (provider === "alpha_vantage" || provider === "alpha_vantage_with_yahoo_fallback") {
    const alphaQuote = await fetchAlphaVantageDailyClose(holding);
    if (alphaQuote) {
      return alphaQuote;
    }
  }

  if (provider === "yahoo" || provider === "alpha_vantage_with_yahoo_fallback") {
    return fetchYahooDailyClose(holding);
  }

  return null;
}

async function fetchAlphaVantageDailyClose(holding) {
  const apikey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apikey) {
    return null;
  }

  if (holding.market === "crypto") {
    return fetchAlphaVantageCryptoDailyClose(holding, apikey);
  }

  const symbol = alphaVantageSymbol(holding);
  if (!symbol) {
    return null;
  }

  const url = new URL(ALPHA_VANTAGE_URL);
  url.searchParams.set("function", "TIME_SERIES_DAILY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("apikey", apikey);

  try {
    const data = await fetchJson(url);
    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries || typeof timeSeries !== "object") {
      return null;
    }

    const latestDate = Object.keys(timeSeries).sort().reverse()[0];
    const close = Number(timeSeries[latestDate]?.["4. close"]);
    if (!latestDate || !Number.isFinite(close) || close <= 0) {
      return null;
    }

    return {
      close,
      date: latestDate,
      source: `alpha_vantage:${symbol}`
    };
  } catch {
    return null;
  }
}

async function fetchAlphaVantageCryptoDailyClose(holding, apikey) {
  const symbol = cleanSymbol(holding.symbol);
  const market = cleanSymbol(holding.currency || "USD");
  if (!symbol || !market) {
    return null;
  }

  const url = new URL(ALPHA_VANTAGE_URL);
  url.searchParams.set("function", "DIGITAL_CURRENCY_DAILY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("market", market);
  url.searchParams.set("apikey", apikey);

  try {
    const data = await fetchJson(url);
    const timeSeries = data["Time Series (Digital Currency Daily)"] ?? firstTimeSeries(data);
    if (!timeSeries || typeof timeSeries !== "object") {
      return null;
    }

    const latestDate = Object.keys(timeSeries).sort().reverse()[0];
    const close = closeValue(timeSeries[latestDate], market);
    if (!latestDate || !Number.isFinite(close) || close <= 0) {
      return null;
    }

    return {
      close,
      date: latestDate,
      source: `alpha_vantage:${symbol}-${market}`
    };
  } catch {
    return null;
  }
}

async function fetchYahooDailyClose(holding) {
  const symbol = yahooSymbol(holding);
  if (!symbol) {
    return null;
  }

  const url = new URL(`${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "10d");
  url.searchParams.set("interval", "1d");

  try {
    const data = await fetchJson(url);
    const result = data.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];

    for (let index = timestamps.length - 1; index >= 0; index -= 1) {
      const close = Number(closes[index]);
      if (!Number.isFinite(close) || close <= 0) {
        continue;
      }

      return {
        close,
        date: isoDateFromUnixSeconds(timestamps[index]),
        source: `yahoo:${symbol}`
      };
    }
  } catch {
    return null;
  }

  return null;
}

function applyQuoteToHolding(holding, quote) {
  return {
    ...holding,
    lastPrice: quote.close,
    priceDate: quote.date,
    priceSource: quote.source,
    priceUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PositionCircle/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Market data returned ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function yahooSymbol(holding) {
  const symbol = cleanSymbol(holding.symbol);
  switch (holding.market) {
  case "hkStock":
    return `${symbol.padStart(4, "0")}.HK`;
  case "cnStock":
    return `${symbol}.${symbol.startsWith("6") ? "SS" : "SZ"}`;
  case "crypto":
    return `${symbol}-${holding.currency || "USD"}`;
  case "usStock":
  case "fund":
    return symbol;
  default:
    return "";
  }
}

function alphaVantageSymbol(holding) {
  const symbol = cleanSymbol(holding.symbol);
  switch (holding.market) {
  case "cnStock":
    return `${symbol}.${symbol.startsWith("6") ? "SHH" : "SHZ"}`;
  case "usStock":
  case "fund":
    return symbol;
  default:
    return "";
  }
}

function quoteKey(holding) {
  return `${holding.market}|${holding.symbol}|${holding.currency}`;
}

function cleanSymbol(value) {
  return String(value ?? "")
    .trim()
    .replace(/^(HK|US|SH|SZ)\./i, "")
    .toUpperCase();
}

function firstTimeSeries(data) {
  return Object.entries(data).find(([key, value]) => {
    return key.toLowerCase().includes("time series") && value && typeof value === "object";
  })?.[1];
}

function closeValue(entry, currency) {
  if (!entry || typeof entry !== "object") {
    return Number.NaN;
  }

  const candidates = [
    "4. close",
    `4a. close (${currency})`,
    `4b. close (${currency})`,
    `4a. close (${currency.toLowerCase()})`,
    `4b. close (${currency.toLowerCase()})`,
    "4b. close (USD)",
    "4a. close (USD)"
  ];

  for (const key of candidates) {
    const value = Number(entry[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  const closeEntry = Object.entries(entry).find(([key, value]) => {
    return key.toLowerCase().includes("close") && Number.isFinite(Number(value)) && Number(value) > 0;
  });
  return Number(closeEntry?.[1]);
}

function isoDateFromUnixSeconds(value) {
  return new Date(Number(value) * 1000).toISOString().slice(0, 10);
}
