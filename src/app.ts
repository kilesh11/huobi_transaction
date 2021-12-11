import * as dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import axios from "axios";
import { restApi } from "./util";

const api_key = process.env.API_KEY ?? "";
const secret = process.env.API_SECRET ?? "";
const accountID = process.env.ACCOUNT_ID ?? "";

const apiUrl = "https://api.huobi.pro";
const orderBook = "/market/depth";
const balanceUrl = `/v1/account/accounts/${accountID}/balance`;
const placeOrderUrl = "/v1/order/orders/place";

// const bestAskPrice = "/spot/quote/v1/ticker/book_ticker";
// const serverTimeUrl = "/spot/v1/time";

const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getSignature = (parameters: object, secret: string) => {
    var orderedParams = "";
    Object.keys(parameters)
        .sort()
        .forEach(function (key: string) {
            // @ts-ignore: Unreachable code error
            orderedParams += key + "=" + parameters[key] + "&";
        });
    orderedParams = orderedParams.substring(0, orderedParams.length - 1);

    return crypto.createHmac("sha256", secret).update(orderedParams).digest("hex");
};

const getBalance = async (symbol: string) => {
    try {
        const response = await restApi({
            path: balanceUrl,
            method: "GET"
        });
        return response?.list.find((coin: any) => coin.currency === symbol && coin.type === "trade")
            .balance;
    } catch (err) {
        console.log(`Error in getting ${symbol} balance: ${err}`);
        return "0";
    }
};

const placeOrder = async (
    price: string,
    symbol: string,
    side: "Sell" | "Buy",
    { qty, freeUSDT }: { qty?: number; freeUSDT?: number }
) => {
    const floatPrice = parseFloat(price);
    const finalPrice =
        side === "Buy"
            ? Math.floor(floatPrice * 1.01 * 100) / 100
            : Math.floor(floatPrice * 100) / 100;
    const finalQty = qty
        ? Math.floor(qty * 100) / 100
        : freeUSDT
        ? Math.floor((freeUSDT / finalPrice) * 100) / 100
        : 0;
    console.dir(`freeUSDT: ${freeUSDT}`);
    console.dir(`finalPrice: ${finalPrice}`);
    if (freeUSDT) console.dir(`qty: ${freeUSDT / finalPrice}`);
    console.dir(`finalQty: ${finalQty}`);
    const body = {
        "account-id": "37909432",
        amount: finalQty,
        price: finalPrice,
        symbol,
        type: "buy-limit"
    };
    const response = await restApi({
        path: placeOrderUrl,
        method: "POST",
        body
    });
    // console.dir(response);
    return response;
};

const getOrderBook = async (symbol: string) => {
    try {
        const orderBookparams = { symbol, type: "step0", depth: "5" };
        const { data } = await axios.get(`${apiUrl}${orderBook}`, {
            params: { ...orderBookparams }
        });
        console.log(`API call success. method=[GET], url=[${apiUrl}${orderBook}]`);
        return data.tick;
    } catch (err) {
        console.log(`Error in getting order Book`);
        return undefined;
    }
};

const loopFunction = async (
    symbol: string,
    side: "Buy" | "Sell",
    options: { qty?: number; freeUSDT?: number }
) => {
    try {
        const orderBook = await getOrderBook(symbol);
        if (orderBook) {
            if (orderBook.asks.length > 0) {
                console.dir(
                    `Ask Price: ${orderBook.asks[0][0]} Bid Price: ${orderBook.bids[0][0]}`
                );
                const price = side === "Buy" ? orderBook.asks[0][0] : orderBook.bids[0][0];
                const returnObj = await placeOrder(price, symbol, side, options);
                if (returnObj.status === "error") {
                    console.dir(
                        `Place Order Error: ${returnObj["err-code"]} ${returnObj["err-msg"]}`
                    );
                    return { boughtAll: false, latestBalance: undefined };
                }
                const latestBalance = parseFloat(await getBalance("usdt"));
                console.dir(`Free USDT: ${latestBalance}`);
                if (latestBalance > 20) {
                    return { boughtAll: false, latestBalance };
                }
                return { boughtAll: false, latestBalance };
            }
            console.log(`no ${symbol} order book yet`);
            return { boughtAll: false, latestBalance: options.freeUSDT };
        }
        return { boughtAll: false, latestBalance: undefined };
    } catch (err) {
        console.log(`Error in Loop Function: ${err}`);
        return { boughtAll: false, latestBalance: undefined };
    }
};

(async () => {
    let finish = false;
    let freeUSDT = parseFloat(await getBalance("usdt"));
    console.dir(`Free USDT: ${freeUSDT}`);
    while (!finish) {
        const [{ boughtAll, latestBalance }] = await Promise.all([
            loopFunction("imxusdt", "Buy", { freeUSDT }),
            timeout(2200)
        ]);
        finish = boughtAll;
        if (latestBalance) freeUSDT = latestBalance;
    }
    console.dir("Process completed");
})().catch((err) => {
    console.error(err);
});
