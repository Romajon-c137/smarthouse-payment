"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const API_URL = "https://api.dengi.o.kg/api/json/json.php";

/**
 * Минимальная реализация MD5 + HMAC-MD5 на чистом JS (без библиотек),
 * чтобы работало прямо в браузере (WebCrypto не умеет MD5).
 */

/* eslint-disable no-bitwise */
function md5cycle(x: number[], k: number[]) {
  let [a, b, c, d] = x;

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    a = (a + ((b & c) | (~b & d)) + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    a = (a + ((b & d) | (c & ~d)) + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    a = (a + (b ^ c ^ d) + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    a = (a + (c ^ (b | ~d)) + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }

  a = ff(a, b, c, d, k[0], 7, -680876936);
  d = ff(d, a, b, c, k[1], 12, -389564586);
  c = ff(c, d, a, b, k[2], 17, 606105819);
  b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897);
  d = ff(d, a, b, c, k[5], 12, 1200080426);
  c = ff(c, d, a, b, k[6], 17, -1473231341);
  b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416);
  d = ff(d, a, b, c, k[9], 12, -1958414417);
  c = ff(c, d, a, b, k[10], 17, -42063);
  b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682);
  d = ff(d, a, b, c, k[13], 12, -40341101);
  c = ff(c, d, a, b, k[14], 17, -1502002290);
  b = ff(b, c, d, a, k[15], 22, 1236535329);

  a = gg(a, b, c, d, k[1], 5, -165796510);
  d = gg(d, a, b, c, k[6], 9, -1069501632);
  c = gg(c, d, a, b, k[11], 14, 643717713);
  b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691);
  d = gg(d, a, b, c, k[10], 9, 38016083);
  c = gg(c, d, a, b, k[15], 14, -660478335);
  b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438);
  d = gg(d, a, b, c, k[14], 9, -1019803690);
  c = gg(c, d, a, b, k[3], 14, -187363961);
  b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467);
  d = gg(d, a, b, c, k[2], 9, -51403784);
  c = gg(c, d, a, b, k[7], 14, 1735328473);
  b = gg(b, c, d, a, k[12], 20, -1926607734);

  a = hh(a, b, c, d, k[5], 4, -378558);
  d = hh(d, a, b, c, k[8], 11, -2022574463);
  c = hh(c, d, a, b, k[11], 16, 1839030562);
  b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060);
  d = hh(d, a, b, c, k[4], 11, 1272893353);
  c = hh(c, d, a, b, k[7], 16, -155497632);
  b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174);
  d = hh(d, a, b, c, k[0], 11, -358537222);
  c = hh(c, d, a, b, k[3], 16, -722521979);
  b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487);
  d = hh(d, a, b, c, k[12], 11, -421815835);
  c = hh(c, d, a, b, k[15], 16, 530742520);
  b = hh(b, c, d, a, k[2], 23, -995338651);

  a = ii(a, b, c, d, k[0], 6, -198630844);
  d = ii(d, a, b, c, k[7], 10, 1126891415);
  c = ii(c, d, a, b, k[14], 15, -1416354905);
  b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571);
  d = ii(d, a, b, c, k[3], 10, -1894986606);
  c = ii(c, d, a, b, k[10], 15, -1051523);
  b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359);
  d = ii(d, a, b, c, k[15], 10, -30611744);
  c = ii(c, d, a, b, k[6], 15, -1560198380);
  b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070);
  d = ii(d, a, b, c, k[11], 10, -1120210379);
  c = ii(c, d, a, b, k[2], 15, 718787259);
  b = ii(b, c, d, a, k[9], 21, -343485551);

  x[0] = (x[0] + a) | 0;
  x[1] = (x[1] + b) | 0;
  x[2] = (x[2] + c) | 0;
  x[3] = (x[3] + d) | 0;
}

function md5blk(s: string) {
  const md5blks: number[] = [];
  for (let i = 0; i < 64; i += 4) {
    md5blks[i >> 2] =
      s.charCodeAt(i) +
      (s.charCodeAt(i + 1) << 8) +
      (s.charCodeAt(i + 2) << 16) +
      (s.charCodeAt(i + 3) << 24);
  }
  return md5blks;
}

function md5(s: string) {
  let n = s.length;
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let i: number;
  for (i = 64; i <= n; i += 64) {
    md5cycle(state, md5blk(s.substring(i - 64, i)));
  }
  s = s.substring(i - 64);
  const tail = new Array(16).fill(0);
  for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) {
    md5cycle(state, tail);
    for (i = 0; i < 16; i++) tail[i] = 0;
  }
  tail[14] = n * 8;
  md5cycle(state, tail);
  return rhex(state[0]) + rhex(state[1]) + rhex(state[2]) + rhex(state[3]);
}

function rhex(n: number) {
  const hexChr = "0123456789abcdef";
  let s = "";
  for (let j = 0; j < 4; j++) {
    s +=
      hexChr.charAt((n >> (j * 8 + 4)) & 0x0f) + hexChr.charAt((n >> (j * 8)) & 0x0f);
  }
  return s;
}

function toUtf8(str: string) {
  return unescape(encodeURIComponent(str));
}

function hmacMd5(key: string, msg: string) {
  const bkey = strToBytes(toUtf8(key));
  const data = strToBytes(toUtf8(msg));

  const blockSize = 64;
  let k = bkey.slice(0);
  if (k.length > blockSize) k = hexToBytes(md5(bytesToStr(k)));
  while (k.length < blockSize) k.push(0);

  const oKeyPad = k.map((b) => b ^ 0x5c);
  const iKeyPad = k.map((b) => b ^ 0x36);

  const inner = md5(bytesToStr(iKeyPad.concat(data)));
  const outer = md5(bytesToStr(oKeyPad.concat(hexToBytes(inner))));
  return outer;
}

function strToBytes(s: string) {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  return bytes;
}
function bytesToStr(bytes: number[]) {
  return String.fromCharCode.apply(null, bytes as any);
}
function hexToBytes(hex: string) {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}
/* eslint-enable no-bitwise */

type AnyObj = Record<string, any>;

function nowMkTime() {
  return String(Math.floor(Date.now() / 1000));
}

function generateHash(payload: AnyObj, password: string) {
  const temp: AnyObj = { ...payload };
  delete temp.hash; // как в Python: убираем hash если есть
  const jsonStr = JSON.stringify(temp); // без пробелов по умолчанию
  return hmacMd5(password, jsonStr);
}

async function postApi(payload: AnyObj) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Invalid JSON response", raw: text };
  }
}

export default function Page() {
  const [sid, setSid] = useState("");
  const [password, setPassword] = useState("");

  const [orderId, setOrderId] = useState("12345");
  const [amount, setAmount] = useState("10");
  const [desc, setDesc] = useState("Тест парковки");

  const [invoiceId, setInvoiceId] = useState<string>("");
  const [invoiceResp, setInvoiceResp] = useState<any>(null);
  const [statusResp, setStatusResp] = useState<any>(null);

  const [polling, setPolling] = useState(false);
  const pollRef = useRef<number | null>(null);

  const [logs, setLogs] = useState<string[]>([]);

  const canRun = useMemo(() => sid.trim() && password.trim(), [sid, password]);

  function addLog(obj: any) {
    const line = `${new Date().toISOString()} | ${JSON.stringify(obj)}`;
    setLogs((prev) => [line, ...prev]);
  }

  function stopPolling() {
    setPolling(false);
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createInvoice() {
    stopPolling();
    setInvoiceResp(null);
    setStatusResp(null);
    setInvoiceId("");

    const mk = nowMkTime();
    const payload: AnyObj = {
      cmd: "createInvoice",
      version: 1005,
      sid: sid.trim(),
      mktime: mk,
      lang: "ru",
      data: {
        order_id: String(orderId).trim(),
        desc: desc,
        amount: Math.round(Number(amount) * 100), // как в Python: amount * 100
        currency: "KGS",
        test: null,
        long_term: 0,
        send_push: 0,
        send_sms: 0,
        result_url: "https://primary-production-1cb86.up.railway.app/webhook/o",
      },
    };

    payload.hash = generateHash(payload, password);

    const resp = await postApi(payload);
    setInvoiceResp(resp);
    addLog({ createInvoice: resp });

    const id = resp?.data?.invoice_id;
    if (id) setInvoiceId(String(id));
  }

  async function checkPaymentOnce(invId?: string) {
    const mk = nowMkTime();
    const payload: AnyObj = {
      cmd: "statusPayment",
      version: 1005,
      sid: sid.trim(),
      mktime: mk,
      lang: "ru",
      data: {
        invoice_id: String(invId ?? invoiceId).trim(),
        order_id: String(orderId).trim(),
        mark: 0,
      },
    };
    payload.hash = generateHash(payload, password);

    const resp = await postApi(payload);
    setStatusResp(resp);
    addLog({ statusPayment: resp });

    const state = resp?.data?.status;
    if (state === "approved" || state === "canceled") {
      stopPolling();
    }
  }

  function startPolling() {
    if (!invoiceId) return;
    setPolling(true);
    // сразу проверим
    checkPaymentOnce(invoiceId);
    // далее каждые 10 сек как в Python
    pollRef.current = window.setInterval(() => {
      checkPaymentOnce(invoiceId);
    }, 10_000);
  }

  function downloadLog() {
    const content = logs.slice().reverse().join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.log";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dengi.kg — createInvoice + statusPayment (как Python, но фронт)</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0, marginBottom: 10 }}>Доступ (вводишь руками)</h2>
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>SID</label>
          <input
            value={sid}
            onChange={(e) => setSid(e.target.value)}
            placeholder="SID"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginBottom: 10 }}
          />

          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>PASSWORD (секрет)</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="PASSWORD"
            type="password"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />

          <p style={{ fontSize: 12, color: "#a00", marginTop: 10 }}>
            ⚠️ Не используй этот вариант в проде: пароль виден в браузере. Для продакшена нужно делать подпись на сервере.
          </p>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0, marginBottom: 10 }}>Параметры счёта</h2>

          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>order_id</label>
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="12345"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginBottom: 10 }}
          />

          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>amount (KGS)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10"
            inputMode="decimal"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginBottom: 10 }}
          />

          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>desc</label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Тест парковки"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button
          onClick={createInvoice}
          disabled={!canRun}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #333",
            background: canRun ? "#111" : "#999",
            color: "#fff",
            cursor: canRun ? "pointer" : "not-allowed",
          }}
        >
          1) Создать счёт (createInvoice)
        </button>

        <button
          onClick={() => checkPaymentOnce()}
          disabled={!canRun || !invoiceId}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #333",
            background: canRun && invoiceId ? "#fff" : "#1e1e1e",
            cursor: canRun && invoiceId ? "pointer" : "not-allowed",
          }}
        >
          2) Проверить 1 раз (statusPayment)
        </button>

        {!polling ? (
          <button
            onClick={startPolling}
            disabled={!canRun || !invoiceId}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #333",
              background: canRun && invoiceId ? "#fff" : "#1e1e1e",
              cursor: canRun && invoiceId ? "pointer" : "not-allowed",
            }}
          >
            3) Старт автопроверки каждые 10 сек
          </button>
        ) : (
          <button
            onClick={stopPolling}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Остановить автопроверку
          </button>
        )}

        <button
          onClick={downloadLog}
          disabled={logs.length === 0}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #333",
            background: logs.length ? "#fff" : "#1e1e1e",
            cursor: logs.length ? "pointer" : "not-allowed",
          }}
        >
          Скачать лог (transactions.log)
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14 }}>Ответ createInvoice</h3>
          {invoiceResp?.data?.qr && (
            <div style={{ marginBottom: 12, textAlign: "center" }}>
              <img
                src={invoiceResp.data.qr}
                alt="QR Code"
                style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }}
              />
            </div>
          )}
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            invoice_id: <b>{invoiceId || "—"}</b>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
            {invoiceResp ? JSON.stringify(invoiceResp, null, 2) : "—"}
          </pre>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14 }}>Ответ statusPayment</h3>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            polling: <b>{polling ? "ON" : "OFF"}</b>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
            {statusResp ? JSON.stringify(statusResp, null, 2) : "—"}
          </pre>
        </div>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14 }}>Логи (как transactions.log в Python)</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {logs.slice(0, 50).map((l, idx) => (
            <div key={idx} style={{ fontSize: 12, padding: 8, borderRadius: 10, }}>
              <p style={{ width: "100%", }}>{l}</p>
            </div>
          ))}
          {logs.length === 0 && <div style={{ fontSize: 12, color: "#666" }}>—</div>}
          {logs.length > 50 && <div style={{ fontSize: 12, color: "#666" }}>Показаны последние 50 строк</div>}
        </div>
      </div>
    </div>
  );
}