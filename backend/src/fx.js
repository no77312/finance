// 近似静态汇率，仅用于把多币种持仓折算成统一口径展示。
// 生产版本应接入实时汇率服务，这里与 groupAdvice.js 的口径保持一致。
export const FX_TO_USD = {
  USD: 1,
  HKD: 0.1282,
  CNY: 0.1392,
  SGD: 0.7421
};

export function toUSD(amount, currency) {
  const rate = FX_TO_USD[currency] ?? 1;
  return Number(amount) * rate;
}
