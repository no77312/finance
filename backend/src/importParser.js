import { assetMarkets, holdingCurrencies, positionVisibilities } from "./domain.js";

const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const importSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    holdings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          symbol: { type: "string" },
          assetName: { type: "string" },
          market: { type: "string", enum: Array.from(assetMarkets) },
          quantity: { type: ["number", "null"] },
          averageCost: { type: ["number", "null"] },
          lastPrice: { type: ["number", "null"] },
          marketValue: { type: ["number", "null"] },
          currency: { type: "string", enum: Array.from(holdingCurrencies) },
          visibility: { type: "string", enum: Array.from(positionVisibilities) },
          brokerName: { type: "string" },
          accountName: { type: "string" },
          accountKey: { type: "string" },
          confidence: { type: "number" },
          note: { type: "string" },
          rawText: { type: "string" }
        },
        required: [
          "symbol",
          "assetName",
          "market",
          "quantity",
          "averageCost",
          "lastPrice",
          "marketValue",
          "currency",
          "visibility",
          "brokerName",
          "accountName",
          "accountKey",
          "confidence",
          "note",
          "rawText"
        ]
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["holdings", "warnings"]
};

export async function parseScreenshotImport({
  ocrText,
  imageDataURL = "",
  defaultVisibility = "full",
  brokerHint = "",
  locale = "zh-Hans"
}) {
  const text = cleanText(ocrText);
  const imageURL = cleanImageDataURL(imageDataURL);
  const visibility = positionVisibilities.has(defaultVisibility) ? defaultVisibility : "full";
  if (!text && !imageURL) {
    return {
      source: "fallback",
      holdings: [],
      warnings: ["没有识别到可解析的持仓文字。"]
    };
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const parsed = await parseWithOpenAI({ text, imageURL, visibility, brokerHint, locale });
      return {
        source: "model",
        holdings: normalizeDrafts(parsed.holdings, visibility, brokerHint),
        warnings: parsed.warnings ?? []
      };
    } catch (error) {
      const fallback = parseWithRules({ text, visibility, hasModelKey: true });
      return {
        ...fallback,
        warnings: [
          `大模型解析暂不可用，已使用基础规则解析。${openAIErrorSummary(error)}`,
          ...fallback.warnings
        ]
      };
    }
  }

  if (!text) {
    return {
      source: "fallback",
      holdings: [],
      warnings: ["截图图片解析需要配置 OPENAI_API_KEY；当前只能解析 OCR 文字。"]
    };
  }

  return parseWithRules({ text, visibility, hasModelKey: false });
}

async function parseWithOpenAI({ text, imageURL, visibility, brokerHint, locale }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const userContent = [
    {
      type: "input_text",
      text: [
        `默认可见性：${visibility}`,
        `语言环境：${locale}`,
        `券商提示：${brokerHint || "未知"}`,
        imageURL ? "请优先直接识别图片中的持仓表格，OCR 文本仅供辅助。" : "未提供图片，请从 OCR 文本中解析。",
        text ? "辅助 OCR 文本：" : "没有辅助 OCR 文本。",
        text || ""
      ].join("\n")
    }
  ];

  if (imageURL) {
    userContent.push({
      type: "input_image",
      image_url: imageURL
    });
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        store: false,
        temperature: 0.1,
        max_output_tokens: 5000,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "你是持仓截图解析器。只输出符合 schema 的 JSON。",
                  "任务：直接阅读券商持仓截图中的表格和列标题，提取可导入的持仓草稿；OCR 文本只作为辅助。",
                  "只提取股票、ETF、基金、现金、加密资产等真实持仓行；忽略总资产、今日盈亏、广告、按钮和导航文案。",
                  "暂不支持期权合约：Interactive Brokers 等截图中带有 Call、Put、到期日、行权价的期权行不要作为股票持仓返回。",
                  "字段不确定时用 null，不要编造数量、成本或现价。",
                  "如果截图没有显示股票代码，或者股票名称被省略/截断，必须使用 web_search 在线查询补全代码和完整名称；优先查交易所、券商、权威财经网站。",
                  "联网查询能唯一确认时，symbol 填股票代码，assetName 填完整名称；没有唯一结果时也必须返回持仓，symbol 暂用截图中的可见名称，assetName 用可见名称，并在 note 或 warnings 标记“缺少股票代码，需人工确认”。",
                  "averageCost 成本价不是必填；截图没有成本价时必须返回 null，不要用现价、盈亏或涨跌幅代替。",
                  "quantity 和 lastPrice 是导入更关键的字段；如果截图有市值和现价但没有数量，可用 市值 ÷ 现价 推算数量，并在 note 或 warnings 说明。",
                  "market 只能是 usStock、hkStock、cnStock、fund、crypto、cash。",
                  "currency 只能是 USD、HKD、CNY、SGD。",
                  "A 股、同花顺、华宝证券等国内券商：中文股票名在第一列，列名可能是 市值、成本/现价、当日盈亏、盈亏；第一列下方数字常是市值，不是数量。",
                  "港股价格带 HK$ 或界面标记“深港/沪港”时 currency 通常是 HKD，market 用 hkStock；A 股代码 6 位且无 HK$ 时 market 用 cnStock、currency 用 CNY。",
                  "IBKR/Interactive Brokers：Instrument 是标的，Last 是现价，Position 是数量，MKT VAL/Mkt Val 是总市值；成本价常常不在截图中，应返回 averageCost:null。",
                  "visibility 使用用户默认值。",
                  "brokerName 识别券商或交易 App 名称，例如 富途、老虎、Interactive Brokers；未知时返回空字符串。",
                  "accountName 识别账户类型、账户名、账号尾号或截图中的账户标签；未知时返回空字符串。",
                  "accountKey 用来判断多张截图是否来自同一个券商账户：优先使用 券商+账户尾号/账户类型；没有账户信息时使用券商或 App 界面名；未知时返回空字符串。",
                  "同一个券商账户的分页或重复截图必须使用相同 accountKey；不同券商界面必须使用不同 accountKey。",
                  "accountKey 不要包含文件名、截图序号、时间、持仓标的或会随截图变化的内容。",
                  "如果截图列名是“市值/数量”，同一行上方数字是市值，下方数字是数量。",
                  "如果截图列名是“现价/成本”，同一行上方数字是现价 lastPrice，下方数字是持仓成本 averageCost。",
                  "如果截图列名是“成本/现价”，同一行上方数字是 averageCost，下方数字是 lastPrice。",
                  "可用 市值 ÷ 数量 校验现价；不要把成本价和现价调换。",
                  "confidence 取 0 到 1，低于 0.7 的记录仍可返回，但要在 warnings 说明。"
                ].join("\n")
              }
            ]
          },
          {
            role: "user",
            content: userContent
          }
        ],
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        text: {
          format: {
            type: "json_schema",
            name: "position_import_parse",
            strict: true,
            schema: importSchema
          }
        }
      })
    });

    if (!response.ok) {
      const message = await openAIErrorMessage(response);
      throw new Error(`OpenAI returned ${response.status}${message ? `: ${message}` : ""}`);
    }

    const data = await response.json();
    const outputText = extractOutputText(data);
    if (!outputText) {
      throw new Error("OpenAI response did not contain text output.");
    }
    return JSON.parse(outputText);
  } finally {
    clearTimeout(timeout);
  }
}

function parseWithRules({ text, visibility, hasModelKey = false }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const holdings = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const symbol = symbolFromLine(line);
    if (!symbol) {
      continue;
    }

    const context = contextForSymbol(lines, index);
    const numericContext = context.replace(new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g"), " ");
    const numbers = numbersFromText(numericContext);
    const currency = currencyFromText(context, symbol);
    const market = marketFromSymbol(symbol, context);
    const marketValue = numberAfterCurrency(numericContext) ?? null;

    holdings.push({
      symbol,
      assetName: assetNameFromContext(context, symbol),
      market,
      quantity: numbers[0] ?? null,
      averageCost: numbers[1] ?? null,
      lastPrice: numbers[2] ?? null,
      marketValue,
      currency,
      visibility,
      confidence: numbers.length >= 3 ? 0.55 : 0.35,
      note: "截图导入草稿",
      rawText: context
    });
  }

  return {
    source: "fallback",
    holdings: dedupeDrafts(normalizeDrafts(holdings, visibility)),
    warnings: hasModelKey
      ? ["已回退到基础规则解析；请在确认页核对数量、成本和现价。"]
      : ["当前未配置 OPENAI_API_KEY，已使用基础规则解析；请在确认页核对数量、成本和现价。"]
  };
}

async function openAIErrorMessage(response) {
  try {
    const data = await response.json();
    return cleanOpenAIError(data.error?.message ?? data.error ?? "");
  } catch {
    return "";
  }
}

function openAIErrorSummary(error) {
  const message = cleanOpenAIError(error?.message ?? "");
  return message ? `（${message}）` : "";
}

function cleanOpenAIError(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/sk-proj-[A-Za-z0-9_-]+/g, "sk-proj-***")
    .trim();
}

function contextForSymbol(lines, startIndex) {
  const contextLines = [lines[startIndex]];
  for (let index = startIndex + 1; index < lines.length && contextLines.length < 4; index += 1) {
    if (symbolFromLine(lines[index])) {
      break;
    }
    contextLines.push(lines[index]);
  }
  return contextLines.join(" ");
}

function normalizeDrafts(drafts = [], fallbackVisibility, fallbackBrokerName = "") {
  return drafts
    .map((draft) => {
      const symbol = cleanSymbol(draft.symbol);
      if (!symbol) {
        return null;
      }

      const market = assetMarkets.has(draft.market) ? draft.market : marketFromSymbol(symbol, draft.rawText ?? "");
      const currency = holdingCurrencies.has(draft.currency)
        ? draft.currency
        : currencyFromText(draft.rawText ?? "", symbol);
      const visibility = positionVisibilities.has(draft.visibility) ? draft.visibility : fallbackVisibility;
      const brokerName = cleanString(draft.brokerName) || cleanString(fallbackBrokerName);
      const accountName = cleanString(draft.accountName);
      const accountKey = cleanAccountKey(draft.accountKey || [brokerName, accountName].filter(Boolean).join(":"));
      const normalizedPrices = normalizePriceAndCost({
        quantity: optionalPositive(draft.quantity),
        averageCost: optionalNonNegative(draft.averageCost),
        lastPrice: optionalNonNegative(draft.lastPrice),
        marketValue: optionalNonNegative(draft.marketValue)
      });

      return {
        symbol,
        assetName: cleanString(draft.assetName) || symbol,
        market,
        quantity: normalizedPrices.quantity,
        averageCost: normalizedPrices.averageCost,
        lastPrice: normalizedPrices.lastPrice,
        marketValue: normalizedPrices.marketValue,
        currency,
        visibility,
        brokerName,
        accountName,
        accountKey,
        confidence: clamp(Number(draft.confidence), 0, 1) || 0.4,
        note: cleanString(draft.note),
        rawText: cleanString(draft.rawText)
      };
    })
    .filter(Boolean);
}

function normalizePriceAndCost({ quantity, averageCost, lastPrice, marketValue }) {
  let normalizedQuantity = quantity;
  let normalizedLastPrice = lastPrice;

  if (normalizedQuantity === null && marketValue !== null && normalizedLastPrice !== null && normalizedLastPrice > 0) {
    normalizedQuantity = roundImportNumber(marketValue / normalizedLastPrice);
  }

  if (normalizedLastPrice === null && marketValue !== null && normalizedQuantity !== null && normalizedQuantity > 0) {
    normalizedLastPrice = roundImportNumber(marketValue / normalizedQuantity);
  }

  if (
    normalizedQuantity
    && marketValue
    && averageCost !== null
    && normalizedLastPrice !== null
    && pricesAreClose(marketValue / normalizedQuantity, averageCost)
    && !pricesAreClose(marketValue / normalizedQuantity, normalizedLastPrice)
  ) {
    return {
      quantity: normalizedQuantity,
      averageCost: normalizedLastPrice,
      lastPrice: averageCost,
      marketValue
    };
  }

  return {
    quantity: normalizedQuantity,
    averageCost,
    lastPrice: normalizedLastPrice,
    marketValue
  };
}

function roundImportNumber(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function pricesAreClose(first, second) {
  const difference = Math.abs(Number(first) - Number(second));
  const scale = Math.max(1, Math.abs(Number(first)), Math.abs(Number(second)));
  return difference / scale <= 0.01 || difference <= 0.05;
}

function dedupeDrafts(drafts) {
  const seen = new Set();
  return drafts.filter((draft) => {
    const key = `${draft.symbol}|${draft.currency}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function cleanText(value) {
  return cleanString(value).slice(0, 12000);
}

function cleanImageDataURL(value) {
  const dataURL = cleanString(value);
  if (!dataURL) {
    return "";
  }

  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(dataURL)) {
    return "";
  }

  return dataURL.slice(0, 6 * 1024 * 1024);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanAccountKey(value) {
  return cleanString(value)
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function cleanSymbol(value) {
  const text = cleanString(value)
    .replace(/^(HK|US|SH|SZ)\./i, "")
    .trim();
  const asciiSymbol = text.replace(/[^A-Za-z0-9.-]/g, "").toUpperCase();
  if (asciiSymbol) {
    return asciiSymbol;
  }
  return text.replace(/\s+/g, "").slice(0, 32);
}

function symbolFromLine(line) {
  const marketPrefixed = line.match(/\b(?:HK|US|SH|SZ)\.([A-Z0-9]{1,8})\b/i);
  if (marketPrefixed) {
    return cleanSymbol(marketPrefixed[1]);
  }

  const hkCode = line.match(/\b\d{4,5}\b/);
  if (hkCode) {
    return hkCode[0];
  }

  const cnCode = line.match(/\b[036]\d{5}\b/);
  if (cnCode) {
    return cnCode[0];
  }

  const ticker = line.match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,3})?\b/);
  if (ticker && !["USD", "HKD", "CNY", "SGD", "ETF", "IPO"].includes(ticker[0])) {
    return cleanSymbol(ticker[0]);
  }

  return "";
}

function marketFromSymbol(symbol, text) {
  const upperText = text.toUpperCase();
  if (/^(BTC|ETH|SOL|DOGE|USDT|USDC)$/.test(symbol) || /加密|CRYPTO/.test(upperText)) {
    return "crypto";
  }
  if (/基金|ETF|FUND/.test(upperText)) {
    return "fund";
  }
  if (/港股|HKD|HK\./.test(upperText) || /^\d{4,5}$/.test(symbol)) {
    return "hkStock";
  }
  if (/A股|沪|深|CNY|SH\.|SZ\./.test(upperText) || /^[036]\d{5}$/.test(symbol)) {
    return "cnStock";
  }
  if (/现金|CASH/.test(upperText)) {
    return "cash";
  }
  return "usStock";
}

function currencyFromText(text, symbol) {
  const upperText = text.toUpperCase();
  for (const currency of holdingCurrencies) {
    if (upperText.includes(currency)) {
      return currency;
    }
  }
  if (/HK\$|港元|港币|港股|^\d{4,5}$/.test(upperText) || /^\d{4,5}$/.test(symbol)) {
    return "HKD";
  }
  if (/¥|人民币|A股|沪|深|^[036]\d{5}$/.test(upperText) || /^[036]\d{5}$/.test(symbol)) {
    return "CNY";
  }
  if (/S\$|SGD|新元|新币/.test(upperText)) {
    return "SGD";
  }
  return "USD";
}

function assetNameFromContext(context, symbol) {
  const withoutSymbol = context.replace(symbol, " ").trim();
  const words = withoutSymbol.split(/\s+/).filter((word) => !looksNumeric(word));
  return words.slice(0, 4).join(" ") || symbol;
}

function numbersFromText(text) {
  return Array.from(text.matchAll(/[-+]?\d[\d,]*(?:\.\d+)?\s*[Kk万]?/g))
    .map((match) => parseCompactNumber(match[0]))
    .filter((value) => value !== null && value > 0)
    .slice(0, 6);
}

function numberAfterCurrency(text) {
  const match = text.match(/(?:HK\$|US\$|S\$|[$¥]|USD|HKD|CNY|SGD)\s*([-+]?\d[\d,]*(?:\.\d+)?\s*[Kk万]?)/i);
  return match ? parseCompactNumber(match[1]) : null;
}

function parseCompactNumber(value) {
  const raw = cleanString(value).replace(/,/g, "");
  const match = raw.match(/^([-+]?\d+(?:\.\d+)?)\s*([Kk万])?$/);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  if (!Number.isFinite(number)) {
    return null;
  }

  switch (match[2]) {
  case "K":
  case "k":
    return number * 1000;
  case "万":
    return number * 10000;
  default:
    return number;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksNumeric(value) {
  return parseCompactNumber(value) !== null || /[%$¥]/.test(value);
}

function optionalPositive(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function optionalNonNegative(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
