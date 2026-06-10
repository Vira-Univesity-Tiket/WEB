import crypto from 'crypto';
import { loadBackendConfig } from '../config/backend-config/index.js';

const DEFAULT_REQUEST_URL = 'https://api.zarinpal.com/pg/v4/payment/request.json';
const DEFAULT_VERIFY_URL = 'https://api.zarinpal.com/pg/v4/payment/verify.json';
const DEFAULT_STARTPAY_URL = 'https://www.zarinpal.com/pg/StartPay/';
const DEFAULT_SANDBOX_REQUEST_URL = 'https://sandbox.zarinpal.com/pg/rest/WebGate/PaymentRequest.json';
const DEFAULT_SANDBOX_VERIFY_URL = 'https://sandbox.zarinpal.com/pg/rest/WebGate/PaymentVerification.json';
const DEFAULT_SANDBOX_STARTPAY_URL = 'https://sandbox.zarinpal.com/pg/StartPay/';

const boolFromEnv = (value) => String(value || '').trim().toLowerCase() === 'true';
const cleanUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

export const getPaymentConfig = () => {
  const backendConfig = loadBackendConfig(process.env);
  const defaultReturnUrl = backendConfig.cors.allowedOrigins[0] || '';
  const gateway = String(process.env.PAYMENT_GATEWAY || '').trim().toLowerCase();
  const sandbox = boolFromEnv(process.env.ZARINPAL_SANDBOX);
  const merchantId = String(process.env.ZARINPAL_MERCHANT_ID || '').trim();
  const callbackUrl = String(process.env.PAYMENT_CALLBACK_URL || '').trim();
  const returnUrl = cleanUrl(process.env.PAYMENT_RETURN_URL || defaultReturnUrl);
  const signatureHeader = String(process.env.PAYMENT_WEBHOOK_SIGNATURE_HEADER || 'x-zarinpal-signature').trim().toLowerCase();
  const signatureSecret = String(process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
  const timestampHeader = String(process.env.PAYMENT_WEBHOOK_TIMESTAMP_HEADER || 'x-zarinpal-timestamp').trim().toLowerCase();
  const maxSignatureAge = Number(process.env.PAYMENT_WEBHOOK_MAX_AGE_SECONDS || 5 * 60);

  const requestUrl = String(
    process.env.ZARINPAL_REQUEST_URL ||
    (sandbox ? DEFAULT_SANDBOX_REQUEST_URL : DEFAULT_REQUEST_URL)
  ).trim();
  const verifyUrl = String(
    process.env.ZARINPAL_VERIFY_URL ||
    (sandbox ? DEFAULT_SANDBOX_VERIFY_URL : DEFAULT_VERIFY_URL)
  ).trim();
  const startPayUrl = cleanUrl(
    process.env.ZARINPAL_STARTPAY_URL ||
    (sandbox ? DEFAULT_SANDBOX_STARTPAY_URL : DEFAULT_STARTPAY_URL)
  );

  return {
    gateway,
    sandbox,
    merchantId,
    callbackUrl,
    returnUrl,
    requestUrl,
    verifyUrl,
    startPayUrl,
    signatureHeader,
    signatureSecret,
    timestampHeader,
    maxSignatureAge
  };
};

export const assertPaymentConfigOrThrow = () => {
  const config = getPaymentConfig();
  const missing = [];
  if (!config.gateway) missing.push('PAYMENT_GATEWAY');
  if (!config.merchantId) missing.push('ZARINPAL_MERCHANT_ID');
  if (!config.callbackUrl) missing.push('PAYMENT_CALLBACK_URL');
  if (!config.requestUrl) missing.push('ZARINPAL_REQUEST_URL');
  if (!config.verifyUrl) missing.push('ZARINPAL_VERIFY_URL');
  if (!config.startPayUrl) missing.push('ZARINPAL_STARTPAY_URL');
  if (config.gateway !== 'zarinpal') missing.push('PAYMENT_GATEWAY must be "zarinpal"');

  if (missing.length > 0) {
    const message = `Payment config invalid: ${missing.join(', ')}`;
    const error = new Error(message);
    error.code = 'PAYMENT_CONFIG_INVALID';
    throw error;
  }

  return config;
};

export const getPaymentAvailability = () => {
  const config = getPaymentConfig();
  const reasons = [];
  if (config.gateway !== 'zarinpal') reasons.push('PAYMENT_GATEWAY must be "zarinpal"');
  if (!config.merchantId) reasons.push('ZARINPAL_MERCHANT_ID missing');
  if (!config.callbackUrl) reasons.push('PAYMENT_CALLBACK_URL missing');
  if (!config.requestUrl || !config.verifyUrl || !config.startPayUrl) reasons.push('gateway URLs missing');

  return {
    enabled: reasons.length === 0,
    reasons,
    config
  };
};

const asJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await asJson(response);
  return { ok: response.ok, status: response.status, body };
};

export const requestZarinpalPayment = async ({ amountRial, description, callbackUrl, metadata = {} }) => {
  const config = assertPaymentConfigOrThrow();
  const payload = config.sandbox
    ? {
      MerchantID: config.merchantId,
      Amount: amountRial,
      Description: description,
      CallbackURL: callbackUrl,
      Metadata: metadata
    }
    : {
      merchant_id: config.merchantId,
      amount: amountRial,
      description: description,
      callback_url: callbackUrl,
      metadata
    };

  const result = await postJson(config.requestUrl, payload);
  const code = Number(result.body?.data?.code ?? result.body?.Status ?? result.body?.status);
  const authority = String(result.body?.data?.authority || result.body?.Authority || result.body?.authority || '').trim();
  const message = String(result.body?.data?.message || result.body?.errors?.message || result.body?.message || '');

  if ((!result.ok && !authority) || !authority || (code !== 100 && code !== 101)) {
    const error = new Error(message || 'Payment gateway request failed');
    error.code = 'PAYMENT_GATEWAY_REQUEST_FAILED';
    error.gatewayCode = code;
    error.gatewayPayload = result.body;
    throw error;
  }

  return {
    authority,
    paymentUrl: `${config.startPayUrl}/${authority}`,
    gatewayCode: code,
    gatewayPayload: result.body
  };
};

export const verifyZarinpalPayment = async ({ amountRial, authority }) => {
  const config = assertPaymentConfigOrThrow();
  const payload = config.sandbox
    ? {
      MerchantID: config.merchantId,
      Amount: amountRial,
      Authority: authority
    }
    : {
      merchant_id: config.merchantId,
      amount: amountRial,
      authority
    };

  const result = await postJson(config.verifyUrl, payload);
  const code = Number(result.body?.data?.code ?? result.body?.Status ?? result.body?.status);
  const refId = String(result.body?.data?.ref_id || result.body?.RefID || result.body?.ref_id || '').trim();
  const message = String(result.body?.data?.message || result.body?.errors?.message || result.body?.message || '');
  const gatewayTransactionId = String(result.body?.data?.card_pan || result.body?.data?.transaction_id || '').trim();
  const success = code === 100 || code === 101;

  return {
    success,
    code,
    referenceId: refId,
    gatewayTransactionId,
    message,
    gatewayPayload: result.body
  };
};

const timingSafeCompare = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const normalizeSignature = (value) => String(value || '').trim().replace(/^sha256=/i, '');

export const verifyPaymentSignature = (req) => {
  const config = getPaymentConfig();
  const headerName = config.signatureHeader;
  if (!headerName) return { ok: true, reason: 'signature-header-disabled' };

  const provided = req.get(headerName);
  if (!provided) return { ok: true, reason: 'signature-not-provided' };
  if (!config.signatureSecret) return { ok: false, reason: 'signature-secret-missing' };

  const timestamp = req.get(config.timestampHeader) || '';
  if (timestamp && Number.isFinite(config.maxSignatureAge) && config.maxSignatureAge > 0) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return { ok: false, reason: 'signature-timestamp-invalid' };
    const drift = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (drift > config.maxSignatureAge) return { ok: false, reason: 'signature-expired' };
  }

  const rawBody = req.rawBody || '';
  const base = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const expected = crypto.createHmac('sha256', config.signatureSecret).update(base).digest('hex');

  if (!timingSafeCompare(normalizeSignature(provided), expected)) {
    return { ok: false, reason: 'signature-mismatch' };
  }
  return { ok: true, reason: 'signature-valid' };
};
