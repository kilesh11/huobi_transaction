import * as dotenv from "dotenv";
dotenv.config();
import moment from "moment";
import CryptoJS from "crypto-js";
import { HmacSHA256 } from "crypto-js";
import qs from "qs";
import url from "url";
import { httpClient as defaultHttpClient } from "./httpClient";

declare type HbApiResponse = Record<string, unknown> | unknown[] | null | any;
declare interface HbRawAPIResponse {
    status?: string;
    code?: number;
    data: HbApiResponse;
}

const api_key = process.env.API_KEY ?? "";
const secret = process.env.API_SECRET ?? "";

const apiBaseUrl = "https://api.huobi.pro";

export const restApi = async ({
    path,
    method,
    query,
    body,
    timeout = 5000
}: {
    path: string;
    method: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    timeout?: number;
}): Promise<HbApiResponse> => {
    const signPayload: Record<string, string | number | boolean | unknown> = {
        ...getDefaultSignPayload(),
        ...query
    };
    const baseUrl = url.parse(apiBaseUrl).host;
    if (!baseUrl) {
        const error = new Error("api base url invalid");
        console.error(error.message, { error });
        throw error;
    }
    const signedQuery = buildQueryStringWithSignedSHA({
        method,
        baseUrl,
        path,
        signPayload
    });
    return callApi({ method, path, query: signedQuery, body, timeout });
};

const getDefaultSignPayload = () => {
    return {
        AccessKeyId: api_key,
        SignatureMethod: "HmacSHA256",
        SignatureVersion: 2,
        Timestamp: moment.utc().format("YYYY-MM-DDTHH:mm:ss")
    };
};

const buildQueryStringWithSignedSHA = ({
    method,
    baseUrl,
    path,
    signPayload
}: {
    method: string;
    baseUrl: string;
    path: string;
    signPayload: Record<string, string | number | boolean | unknown>;
}) => {
    const params = Object.entries(signPayload).map((_) => _);
    params.sort((a, b) => {
        if (a[0] === b[0]) {
            return 0;
        }
        return a[0] < b[0] ? -1 : 1;
    });

    const query: Record<string, string | number | boolean | unknown> = {};
    params.forEach(([k, v]) => {
        query[k] = v;
    });

    const queryString = qs.stringify(query);

    const meta = [method, baseUrl, path, queryString].join("\n");
    const hash = HmacSHA256(meta, secret);
    const signature = CryptoJS.enc.Base64.stringify(hash);

    query["Signature"] = signature;

    return query;
};

const callApi = async ({
    method,
    path,
    query,
    body,
    timeout = 5000
}: {
    path: string;
    method: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    timeout?: number;
}): Promise<HbApiResponse> => {
    const url = `${apiBaseUrl}${path}`;

    try {
        const response = await defaultHttpClient({
            url,
            method,
            timeout,
            headers: {
                "Content-Type": "application/json",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36"
            },
            query,
            body
        });

        const data: HbRawAPIResponse = response.data;
        if (data?.status == "ok" || data?.code == 200) {
            console.log(`API call success. method=[${method}], url=[${url}]`);
            return data?.data ?? null;
        } else {
            console.error(`API return error. method=[${method}], url=[${url}]`);
            return data;
        }
    } catch (error: any) {
        console.error(`API error. method=[${method}], url=[${url}]`, {
            error: error.message,
            stack: error.stack
        });
        return null;
    }
};
