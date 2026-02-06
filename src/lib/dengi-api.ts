/**
 * Dengi.kg API integration module
 * Handles invoice creation and payment status checking
 */

import { hmacMd5 } from "./crypto";

const API_URL = "https://api.dengi.o.kg/api/json/json.php";

// Type definitions
type AnyObj = Record<string, any>;

export interface CreateInvoiceParams {
    orderId: string;
    amount: number; // in KGS (will be converted to tyiyn automatically)
    description: string;
    sid: string;
    password: string;
    resultUrl?: string; // Optional webhook URL
    products?: {
        id: string;
        name: string;
        amount: string;
        count: string | null;
    };
}

export interface InvoiceResponse {
    data?: {
        invoice_id: string;
        qr?: string; // Base64 QR code image
    };
    error?: string;
    raw?: string;
}

export interface PaymentStatusParams {
    invoiceId: string;
    orderId: string;
    sid: string;
    password: string;
}

export interface StatusResponse {
    data?: {
        status: "approved" | "canceled" | "pending" | string;
        [key: string]: any;
    };
    error?: string;
    raw?: string;
}

/**
 * Get current Unix timestamp in seconds
 */
function nowMkTime(): string {
    return String(Math.floor(Date.now() / 1000));
}

/**
 * Generate HMAC-MD5 hash for API authentication
 */
function generateHash(payload: AnyObj, password: string): string {
    const temp: AnyObj = { ...payload };
    delete temp.hash;
    const jsonStr = JSON.stringify(temp);
    return hmacMd5(password, jsonStr);
}

/**
 * Send POST request to Dengi.kg API
 */
async function postApi(payload: AnyObj): Promise<any> {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { error: "Invalid JSON response", raw: text };
    }
}

/**
 * Create a payment invoice
 * @param params Invoice creation parameters
 * @returns Invoice response with invoice_id and QR code
 */
export async function createInvoice(params: CreateInvoiceParams): Promise<InvoiceResponse> {
    const mk = nowMkTime();
    const payload: AnyObj = {
        cmd: "createInvoice",
        version: 1005,
        sid: params.sid.trim(),
        mktime: mk,
        lang: "ru",
        data: {
            order_id: String(params.orderId).trim(),
            desc: params.description,
            amount: Math.round(params.amount * 100), // Convert KGS to tyiyn
            currency: "KGS",
            test: null,
            long_term: 0,
            send_push: 0,
            send_sms: 0,
            result_url: params.resultUrl || "https://primary-production-1cb86.up.railway.app/webhook/o",
        },
    };

    // Add products if provided
    if (params.products) {
        payload.data.products = params.products;
    }

    payload.hash = generateHash(payload, params.password);

    return await postApi(payload);
}

/**
 * Check payment status
 * @param params Status check parameters
 * @returns Payment status response
 */
export async function checkPaymentStatus(params: PaymentStatusParams): Promise<StatusResponse> {
    const mk = nowMkTime();
    const payload: AnyObj = {
        cmd: "statusPayment",
        version: 1005,
        sid: params.sid.trim(),
        mktime: mk,
        lang: "ru",
        data: {
            invoice_id: String(params.invoiceId).trim(),
            order_id: String(params.orderId).trim(),
            mark: 0,
        },
    };

    payload.hash = generateHash(payload, params.password);

    console.log("📊 Checking payment status:", { invoiceId: params.invoiceId, orderId: params.orderId });

    const response = await postApi(payload);

    // Extract status from payments array (API returns status in payments[0].status)
    if (response.data?.payments && Array.isArray(response.data.payments) && response.data.payments.length > 0) {
        const payment = response.data.payments[0];
        const paymentStatus = payment.status;

        console.log("✅ Payment status from API:", paymentStatus, payment);

        // Normalize response to have status at data.status for compatibility
        // Only set status if we have real payment data (QR was scanned)
        response.data.status = paymentStatus;
    } else {
        // No payments found - QR not scanned yet
        // Don't set any status, keep showing QR code
        console.log("⚠️ No payments found - QR not scanned yet:", response);
        response.data.status = ""; // Clear status to keep showing QR
    }

    return response;
}

/**
 * Payment polling manager
 */
export class PaymentPoller {
    private intervalId: number | null = null;
    private onStatusUpdate?: (status: StatusResponse) => void;
    private params?: PaymentStatusParams;

    /**
     * Start polling for payment status every 10 seconds
     * @param params Status check parameters
     * @param onStatusUpdate Callback for status updates
     */
    start(params: PaymentStatusParams, onStatusUpdate: (status: StatusResponse) => void) {
        this.stop(); // Stop any existing polling
        this.params = params;
        this.onStatusUpdate = onStatusUpdate;

        // Check immediately
        this.checkOnce();

        // Then check every 10 seconds
        this.intervalId = window.setInterval(() => {
            this.checkOnce();
        }, 10_000);
    }

    /**
     * Stop polling
     */
    stop() {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Check status once
     */
    private async checkOnce() {
        if (!this.params || !this.onStatusUpdate) return;

        const status = await checkPaymentStatus(this.params);
        this.onStatusUpdate(status);

        // Stop polling if payment is complete
        const state = status?.data?.status;
        if (state === "approved" || state === "canceled") {
            this.stop();
        }
    }

    /**
     * Check if currently polling
     */
    isPolling(): boolean {
        return this.intervalId !== null;
    }
}

export interface CancelInvoiceParams {
    invoiceId: string;
    sid: string;
    password: string;
}

export interface CancelResponse {
    data?: {
        [key: string]: any;
    };
    error?: string;
    raw?: string;
}

/**
 * Cancel a payment invoice
 * @param params Cancel parameters
 * @returns Cancel response
 */
export async function cancelInvoice(params: CancelInvoiceParams): Promise<CancelResponse> {
    const mk = nowMkTime();
    const payload: AnyObj = {
        cmd: "invoiceCancel",
        version: 1005,
        sid: params.sid.trim(),
        mktime: mk,
        lang: "ru",
        data: {
            invoice_id: String(params.invoiceId).trim(),
        },
    };

    payload.hash = generateHash(payload, params.password);

    console.log("🚫 Canceling invoice:", { invoiceId: params.invoiceId, payload });

    const response = await postApi(payload);

    console.log("🚫 Cancel response:", response);

    return response;
}

export interface TelegramMessage {
    tariff: string;
    price: number;
    name: string;
    phone: string;
    email: string;
    house: string;
    block: string;
    floor: string;
    entrance: string;
    apartment: string;
    orderId: string;
    invoiceId: string;
}

/**
 * Send payment details to Telegram bot
 * @param message Payment and form data
 * @returns Response from Telegram API
 */
export async function sendToTelegram(message: TelegramMessage): Promise<any> {
    const botToken = "8343030268:AAECP46WFC3XZvtLBwttO8aG4z9GnJUwAqg";
    const chatId = "1076569603";

    const text = `
*Новая подписка оформлена!*

📋 *Тариф:* ${message.tariff} (${message.price} с)

👤 *Клиент:*
• Имя: ${message.name}
• Телефон: ${message.phone}
• Email: ${message.email}

🏠 *Адрес:*
• Дом: ${message.house}
• Блок: ${message.block}
• Этаж: ${message.floor}
• Подъезд: ${message.entrance}
• Квартира: ${message.apartment}

💳 *Платёж:*
• Order ID: \`${message.orderId}\`
• Invoice ID: \`${message.invoiceId}\`
`.trim();

    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: "Markdown",
            }),
        });
        return await response.json();
    } catch (error) {
        console.error("Failed to send Telegram message:", error);
        return { error: String(error) };
    }
}
