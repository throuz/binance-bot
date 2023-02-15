import crypto from "node:crypto";
import querystring from "node:querystring";
import env from "./env.js";
import tradeConfig from "./trade-config.js";
import { binanceFuturesAPI } from "./axios-instances.js";
import { sendLineNotify } from "./common.js";

const { SECRET_KEY } = env;
const { QUOTE_CURRENCY, SYMBOL, LEVERAGE, TP_SL_RATE, INITIAL_QUANTITY } =
  tradeConfig;

const getQuantity = (stopLossTimes) => INITIAL_QUANTITY * 2 ** stopLossTimes;

const getSignature = (queryString) =>
  crypto.createHmac("sha256", SECRET_KEY).update(queryString).digest("hex");

const getAvailableBalance = async () => {
  try {
    const totalParams = { timestamp: Date.now() };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/fapi/v1/balance?${queryString}&signature=${signature}`
    );
    const availableBalance = response.data.find(
      ({ asset }) => asset === QUOTE_CURRENCY
    ).withdrawAvailable;
    return availableBalance;
  } catch (error) {
    console.error(error.toJSON());
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

const getMarkPrice = async () => {
  try {
    const totalParams = { symbol: SYMBOL };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/fapi/v1/premiumIndex?${queryString}&signature=${signature}`
    );
    return response.data.markPrice;
  } catch (error) {
    console.error(error.toJSON());
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

const getOtherSide = (side) => {
  if (side === "BUY") {
    return "SELL";
  }
  if (side === "SELL") {
    return "BUY";
  }
};

const getTPSLPrices = async (side, stopLossTimes) => {
  try {
    let takeProfitPrice;
    let stopLossPrice;
    const markPrice = await getMarkPrice();
    const orderCostRate = LEVERAGE * FEE_RATE * 2; // 3%
    const tpslRate = TP_SL_RATE + orderCostRate * (stopLossTimes + 1);
    const higherClosingPrice = (
      Math.round(markPrice * (1 + tpslRate / LEVERAGE) * 10) / 10
    ).toString();
    const lowerClosingPrice = (
      Math.round(markPrice * (1 - tpslRate / LEVERAGE) * 10) / 10
    ).toString();
    if (side === "BUY") {
      takeProfitPrice = higherClosingPrice;
      stopLossPrice = lowerClosingPrice;
    } else {
      takeProfitPrice = lowerClosingPrice;
      stopLossPrice = higherClosingPrice;
    }
    return { takeProfitPrice, stopLossPrice };
  } catch (error) {
    console.error(error.toJSON());
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

const getSide = async () => {
  try {
    const totalParams = { symbol: SYMBOL, period: "5m", limit: "1" };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/futures/data/topLongShortPositionRatio?${queryString}&signature=${signature}`
    );
    return response.data[0].longShortRatio > 1 ? "BUY" : "SELL";
  } catch (error) {
    console.error(error.toJSON());
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

const getAvailableQuantity = async () => {
  try {
    const availableBalance = await getAvailableBalance();
    const markPrice = await getMarkPrice();
    const availableFunds = availableBalance * LEVERAGE;
    const minTradeAmount = markPrice / 1000;
    return Math.trunc(availableFunds / minTradeAmount) / 1000;
  } catch (error) {
    console.error(error.toJSON());
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

export {
  getQuantity,
  getSignature,
  getAvailableBalance,
  getMarkPrice,
  getOtherSide,
  getTPSLPrices,
  getSide,
  getAvailableQuantity
};
