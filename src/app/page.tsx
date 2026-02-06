"use client";

import React, { useState, useEffect, useRef } from "react";
import { createInvoice, checkPaymentStatus, PaymentPoller, cancelInvoice, sendToTelegram } from "@/lib/dengi-api";

// O!Денги API credentials from environment variables
const DENGI_SID = process.env.NEXT_PUBLIC_DENGI_SID || "";
const DENGI_PASSWORD = process.env.NEXT_PUBLIC_DENGI_PASSWORD || "";

const TARIFFS = [
  { id: 1, period: "1 месяц", price: 1 },
  { id: 6, period: "6 месяцев", price: 2 },
  { id: 12, period: "1 год", price: 3 },
];

const HOUSES = [
  { id: "dsu", name: "ДСУ", blocks: ["A", "B", "C"] },
  { id: "kurmanjan", name: "Курманжан Датка", blocks: ["1", "2", "3", "4", "5", "6"] },
  { id: "lenina", name: "Ленина", blocks: ["1", "2", "3", "4", "5", "6"] },
];

export default function Page() {
  // Page state - now 3 steps: tariff -> form -> qr
  const [currentStep, setCurrentStep] = useState<"tariff" | "form" | "qr">("tariff");

  // Form data
  const [selectedTariff, setSelectedTariff] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selectedHouse, setSelectedHouse] = useState("");
  const [selectedBlock, setSelectedBlock] = useState("");
  const [floor, setFloor] = useState("");
  const [entrance, setEntrance] = useState("");
  const [apartment, setApartment] = useState("");

  // Payment state
  const [invoiceId, setInvoiceId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState(180); // Countdown from 180 seconds (3 minutes)
  const [isChecking, setIsChecking] = useState(false); // Loading animation for status check
  const [nextCheckIn, setNextCheckIn] = useState(3); // Seconds until next check
  const [emailSent, setEmailSent] = useState(false); // Track if receipt email has been sent

  // Payment poller
  const pollerRef = useRef<PaymentPoller | null>(null);
  const cancelTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get current tariff
  const currentTariff = TARIFFS.find((t) => t.id === selectedTariff);
  const currentHouseData = HOUSES.find((h) => h.id === selectedHouse);

  // Validate step 1 (tariff)
  const validateTariffStep = () => {
    // Tariff is always selected by default, so always valid
    return true;
  };

  // Validate step 2 (form data)
  const validateFormStep = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = "Введите имя";
    if (!phone.trim()) newErrors.phone = "Введите телефон";
    if (!email.trim()) newErrors.email = "Введите email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "Некорректный email";
    if (!selectedHouse) newErrors.house = "Выберите дом";
    if (!selectedBlock) newErrors.block = "Выберите блок";
    if (!floor.trim()) newErrors.floor = "Введите этаж";
    if (!entrance.trim()) newErrors.entrance = "Введите подъезд";
    if (!apartment.trim()) newErrors.apartment = "Введите квартиру";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Cleanup poller and timers on unmount
  useEffect(() => {
    return () => {
      pollerRef.current?.stop();
      if (cancelTimeoutRef.current) {
        window.clearTimeout(cancelTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const handleNextFromTariff = () => {
    if (validateTariffStep()) {
      setCurrentStep("form");
    }
  };

  const handleNextFromForm = async () => {
    if (validateFormStep()) {
      setIsProcessing(true);
      setCurrentStep("qr");

      // Generate unique order ID
      const newOrderId = `ORD-${Date.now()}`;
      setOrderId(newOrderId);

      // Get form data
      const currentTariff = TARIFFS.find((t) => t.id === selectedTariff);
      const currentHouse = HOUSES.find((h) => h.id === selectedHouse);

      // Create description
      const description = `Подписка ${currentTariff?.period} - ${currentHouse?.name} блок ${selectedBlock}, кв ${apartment}`;

      // Pack all form data into products field
      const formDataJson = JSON.stringify({
        tariff: currentTariff?.period,
        price: currentTariff?.price,
        name,
        phone,
        email,
        house: currentHouse?.name,
        block: selectedBlock,
        floor,
        entrance,
        apartment,
      });

      try {
        // Create invoice with products containing all form data
        const response = await createInvoice({
          orderId: newOrderId,
          amount: currentTariff?.price || 100,
          description,
          sid: DENGI_SID,
          password: DENGI_PASSWORD,
          products: {
            id: newOrderId,
            name: formDataJson,
            amount: String(currentTariff?.price || 100),
            count: null,
          },
        });

        if (response.data?.invoice_id) {
          const newInvoiceId = response.data.invoice_id;
          setInvoiceId(newInvoiceId);
          setQrCode(response.data.qr || "");

          // Start polling for payment status
          if (!pollerRef.current) {
            pollerRef.current = new PaymentPoller();
          }

          // Reset countdown to 3 minutes
          setCountdown(180);
          setNextCheckIn(3);

          pollerRef.current.start(
            {
              invoiceId: newInvoiceId,
              orderId: newOrderId,
              sid: DENGI_SID,
              password: DENGI_PASSWORD,
            },
            async (status) => {
              // Show checking animation
              setIsChecking(true);

              const state = status.data?.status || "";
              setPaymentStatus(state);

              // Hide checking animation after 500ms
              setTimeout(() => setIsChecking(false), 500);

              // Handle successful payment
              if (state === "approved") {
                // Stop polling
                pollerRef.current?.stop();

                // Clear cancel timeout
                if (cancelTimeoutRef.current) {
                  window.clearTimeout(cancelTimeoutRef.current);
                  cancelTimeoutRef.current = null;
                }

                // Clear countdown interval
                if (countdownIntervalRef.current) {
                  window.clearInterval(countdownIntervalRef.current);
                  countdownIntervalRef.current = null;
                }

                // Send to Telegram
                await sendToTelegram({
                  tariff: currentTariff?.period || "",
                  price: currentTariff?.price || 0,
                  name,
                  phone,
                  email,
                  house: currentHouse?.name || "",
                  block: selectedBlock,
                  floor,
                  entrance,
                  apartment,
                  orderId: newOrderId,
                  invoiceId: newInvoiceId,
                });

                // Send receipt email
                if (!emailSent) {
                  try {
                    console.log("📧 Sending receipt email to:", email);
                    const emailResponse = await fetch("/api/send-receipt", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email,
                        name,
                        tariff: currentTariff?.period || "",
                        price: currentTariff?.price || 0,
                        invoiceId: newInvoiceId,
                      }),
                    });

                    if (emailResponse.ok) {
                      console.log("✅ Receipt email sent successfully");
                      setEmailSent(true);
                    } else {
                      const error = await emailResponse.json();
                      console.error("❌ Failed to send email:", error);
                    }
                  } catch (error) {
                    console.error("❌ Email sending error:", error);
                  }
                }
              }
            }
          );

          // Start countdown timer (updates every second)
          countdownIntervalRef.current = window.setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

          // Set 3-minute timeout for auto-cancel
          cancelTimeoutRef.current = window.setTimeout(async () => {
            // Check if payment is still pending
            if (paymentStatus !== "approved" && paymentStatus !== "canceled") {
              console.log("⏰ Payment timeout - canceling invoice...");

              // Stop polling
              pollerRef.current?.stop();

              // Clear countdown interval
              if (countdownIntervalRef.current) {
                window.clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }

              // Cancel the invoice via API
              try {
                const cancelResult = await cancelInvoice({
                  invoiceId: newInvoiceId,
                  sid: DENGI_SID,
                  password: DENGI_PASSWORD,
                });

                console.log("✅ Invoice canceled successfully:", cancelResult);

                // Update status to show failure message
                setPaymentStatus("canceled");
              } catch (error) {
                console.error("❌ Failed to cancel invoice:", error);

                // Still show canceled UI even if API fails
                setPaymentStatus("canceled");
              }
            }
          }, 180000); // 180 seconds = 3 minutes
        } else {
          console.error("Failed to create invoice:", response);
        }
      } catch (error) {
        console.error("Error creating invoice:", error);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleBack = () => {
    if (currentStep === "qr") setCurrentStep("form");
    else if (currentStep === "form") setCurrentStep("tariff");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Step 1: Tariff Selection */}
      {currentStep === "tariff" && (
        <div
          style={{
            maxWidth: "500px",
            width: "100%",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(10px)",
            borderRadius: "24px",
            padding: "32px",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            animation: "slideIn 0.5s ease-out",
          }}
        >
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              marginBottom: "8px",
              textAlign: "center",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Выберите тариф
          </h1>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "14px", marginBottom: "32px" }}>
            Шаг 1 из 3
          </p>

          {/* Tariff Selection */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {TARIFFS.map((tariff) => (
                <button
                  key={tariff.id}
                  onClick={() => setSelectedTariff(tariff.id)}
                  style={{
                    padding: "20px 8px",
                    borderRadius: "12px",
                    border: selectedTariff === tariff.id ? "2px solid #667eea" : "2px solid #e5e7eb",
                    background: selectedTariff === tariff.id ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "#fff",
                    color: selectedTariff === tariff.id ? "#fff" : "#374151",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    transform: selectedTariff === tariff.id ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  <div>{tariff.period}</div>
                  <div style={{ fontSize: "18px", marginTop: "8px" }}>{tariff.price} с</div>
                </button>
              ))}
            </div>
          </div>

          {/* Price Display */}
          <div
            style={{
              padding: "24px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)",
              marginBottom: "32px",
              textAlign: "center",
              border: "1px solid #667eea30",
            }}
          >
            <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>Итого к оплате</div>
            <div
              style={{
                fontSize: "36px",
                fontWeight: 700,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {currentTariff?.price} с
            </div>
          </div>

          {/* Next Button */}
          <button
            onClick={handleNextFromTariff}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
            }}
          >
            Далее
          </button>
        </div>
      )}

      {/* Step 2: Form Data */}
      {currentStep === "form" && (
        <div
          style={{
            maxWidth: "500px",
            width: "100%",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(10px)",
            borderRadius: "24px",
            padding: "32px",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            animation: "slideIn 0.5s ease-out",
          }}
        >
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              marginBottom: "8px",
              textAlign: "center",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Ваши данные
          </h1>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>
            Шаг 2 из 3
          </p>

          {/* Name */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
              Имя <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({ ...errors, name: "" });
              }}
              placeholder="Введите ваше имя"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: errors.name ? "2px solid #ef4444" : "2px solid #e5e7eb",
                fontSize: "15px",
                transition: "border-color 0.3s ease",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = errors.name ? "#ef4444" : "#667eea")}
              onBlur={(e) => (e.target.style.borderColor = errors.name ? "#ef4444" : "#e5e7eb")}
            />
            {errors.name && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>{errors.name}</div>}
          </div>

          {/* Phone */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
              Телефон <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (errors.phone) setErrors({ ...errors, phone: "" });
              }}
              placeholder="+996"
              type="tel"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: errors.phone ? "2px solid #ef4444" : "2px solid #e5e7eb",
                fontSize: "15px",
                transition: "border-color 0.3s ease",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = errors.phone ? "#ef4444" : "#667eea")}
              onBlur={(e) => (e.target.style.borderColor = errors.phone ? "#ef4444" : "#e5e7eb")}
            />
            {errors.phone && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>{errors.phone}</div>}
          </div>

          {/* Email */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
              Email для квитанции <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: "" });
              }}
              placeholder="example@mail.com"
              type="email"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: errors.email ? "2px solid #ef4444" : "2px solid #e5e7eb",
                fontSize: "15px",
                transition: "border-color 0.3s ease",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = errors.email ? "#ef4444" : "#667eea")}
              onBlur={(e) => (e.target.style.borderColor = errors.email ? "#ef4444" : "#e5e7eb")}
            />
            {errors.email && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>{errors.email}</div>}
          </div>

          {/* Address Selection */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
              Адрес <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <select
              value={selectedHouse}
              onChange={(e) => {
                setSelectedHouse(e.target.value);
                setSelectedBlock("");
                if (errors.house) setErrors({ ...errors, house: "" });
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: errors.house ? "2px solid #ef4444" : "2px solid #e5e7eb",
                fontSize: "15px",
                transition: "border-color 0.3s ease",
                outline: "none",
                cursor: "pointer",
                background: "#fff",
              }}
              onFocus={(e) => (e.target.style.borderColor = errors.house ? "#ef4444" : "#667eea")}
              onBlur={(e) => (e.target.style.borderColor = errors.house ? "#ef4444" : "#e5e7eb")}
            >
              <option value="">Выберите дом</option>
              {HOUSES.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.name}
                </option>
              ))}
            </select>
            {errors.house && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>{errors.house}</div>}
          </div>

          {/* Block Selection */}
          {selectedHouse && (
            <div style={{ marginBottom: "20px", animation: "fadeIn 0.3s ease-out" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Блок <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {currentHouseData?.blocks.map((block) => (
                  <button
                    key={block}
                    onClick={() => {
                      setSelectedBlock(block);
                      if (errors.block) setErrors({ ...errors, block: "" });
                    }}
                    style={{
                      padding: "12px",
                      borderRadius: "10px",
                      border: selectedBlock === block ? "2px solid #667eea" : errors.block ? "2px solid #ef4444" : "2px solid #e5e7eb",
                      background: selectedBlock === block ? "#667eea" : "#fff",
                      color: selectedBlock === block ? "#fff" : "#374151",
                      fontWeight: 600,
                      fontSize: "14px",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                    }}
                  >
                    {block}
                  </button>
                ))}
              </div>
              {errors.block && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>{errors.block}</div>}
            </div>
          )}

          {/* Floor, Entrance, Apartment - 3 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "32px" }}>
            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Этаж <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                value={floor}
                onChange={(e) => {
                  setFloor(e.target.value);
                  if (errors.floor) setErrors({ ...errors, floor: "" });
                }}
                placeholder="№"
                type="number"
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: "12px",
                  border: errors.floor ? "2px solid #ef4444" : "2px solid #e5e7eb",
                  fontSize: "15px",
                  transition: "border-color 0.3s ease",
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = errors.floor ? "#ef4444" : "#667eea")}
                onBlur={(e) => (e.target.style.borderColor = errors.floor ? "#ef4444" : "#e5e7eb")}
              />
              {errors.floor && <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>{errors.floor}</div>}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Подъезд <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                value={entrance}
                onChange={(e) => {
                  setEntrance(e.target.value);
                  if (errors.entrance) setErrors({ ...errors, entrance: "" });
                }}
                placeholder="№"
                type="number"
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: "12px",
                  border: errors.entrance ? "2px solid #ef4444" : "2px solid #e5e7eb",
                  fontSize: "15px",
                  transition: "border-color 0.3s ease",
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = errors.entrance ? "#ef4444" : "#667eea")}
                onBlur={(e) => (e.target.style.borderColor = errors.entrance ? "#ef4444" : "#e5e7eb")}
              />
              {errors.entrance && <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>{errors.entrance}</div>}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Квартира <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                value={apartment}
                onChange={(e) => {
                  setApartment(e.target.value);
                  if (errors.apartment) setErrors({ ...errors, apartment: "" });
                }}
                placeholder="№"
                type="number"
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: "12px",
                  border: errors.apartment ? "2px solid #ef4444" : "2px solid #e5e7eb",
                  fontSize: "15px",
                  transition: "border-color 0.3s ease",
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = errors.apartment ? "#ef4444" : "#667eea")}
                onBlur={(e) => (e.target.style.borderColor = errors.apartment ? "#ef4444" : "#e5e7eb")}
              />
              {errors.apartment && <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>{errors.apartment}</div>}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
            <button
              onClick={handleBack}
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "2px solid #667eea",
                background: "transparent",
                color: "#667eea",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#667eea10")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Назад
            </button>
            <button
              onClick={handleNextFromForm}
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
              }}
            >
              К оплате
            </button>
          </div>
        </div>
      )}

      {/* Step 3: QR Code */}
      {currentStep === "qr" && (
        <div
          style={{
            maxWidth: "500px",
            width: "100%",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(10px)",
            borderRadius: "24px",
            padding: "40px",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            textAlign: "center",
            animation: "slideIn 0.5s ease-out",
          }}
        >
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              marginBottom: "8px",
              color: "#fff",
              background:
                paymentStatus === "approved"
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {paymentStatus === "approved"
              ? "Оплата успешно завершена!"
              : isProcessing
                ? "Создание платежа..."
                : "Отсканируйте QR-код"}
          </h2>

          <p
            style={{
              fontSize: "14px",
              color: "#374151",
              marginBottom: "8px",
              fontWeight: 500,
            }}
          >
            {paymentStatus === "approved"
              ? "Спасибо за оплату!"
              : "для завершения оплаты в приложении O!Деньги"}
          </p>

          <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "32px" }}>
            {paymentStatus === "approved"
              ? "Услуга будет подключена в ближайшее время, а квитанция отправлена на вашу почту"
              : "Шаг 3 из 3"}
          </p>

          {/* QR Code / Success Display */}
          {isProcessing ? (
            <div
              style={{
                width: "280px",
                height: "280px",
                margin: "0 auto 32px",
                background: "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #667eea30",
              }}
            >
              <div style={{ fontSize: "14px", color: "#667eea" }}>Загрузка...</div>
            </div>
          ) : paymentStatus === "approved" ? (
            // Success screen with animated checkmark in green circle
            <div
              style={{
                width: "280px",
                height: "280px",
                margin: "0 auto 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "160px",
                  height: "160px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 40px rgba(16, 185, 129, 0.3)",
                  animation: "checkmarkPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
                }}
              >
                <svg style={{
                  animation: "checkmarkDraw 0.5s ease-out 0.3s forwards",
                  strokeDasharray: 50,
                  strokeDashoffset: 50,
                }} width="80"
                  height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.55018 15.15L18.0252 6.675C18.2252 6.475 18.4585 6.375 18.7252 6.375C18.9918 6.375 19.2252 6.475 19.4252 6.675C19.6252 6.875 19.7252 7.11267 19.7252 7.388C19.7252 7.66333 19.6252 7.90067 19.4252 8.1L10.2502 17.3C10.0502 17.5 9.81685 17.6 9.55018 17.6C9.28351 17.6 9.05018 17.5 8.85018 17.3L4.55018 13C4.35018 12.8 4.25418 12.5627 4.26218 12.288C4.27018 12.0133 4.37451 11.7757 4.57518 11.575C4.77585 11.3743 5.01351 11.2743 5.28818 11.275C5.56285 11.2757 5.80018 11.3757 6.00018 11.575L9.55018 15.15Z" fill="white" />
                </svg>
              </div>
            </div>
          ) : paymentStatus === "canceled" ? (
            // Canceled/Timeout screen with sad emoji
            <div
              style={{
                margin: "0 auto 32px",
                padding: "24px",
                background: "linear-gradient(135deg, #f59e0b15 0%, #f59e0b15 100%)",
                borderRadius: "20px",
                border: "1px solid #f59e0b",
                animation: "fadeIn 0.5s ease-out",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "80px", marginBottom: "16px" }}>😔</div>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#374151", marginBottom: "12px" }}>
                Время ожидания истекло
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#6b7280",
                  lineHeight: "1.6",
                  marginBottom: "16px",
                }}
              >
                Если вы уже оплатили и система не поняла, отправьте чек по номеру:
              </div>
              <a
                href="https://wa.me/996556100600"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  background: "#25D366",
                  color: "#fff",
                  borderRadius: "12px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  transition: "transform 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <span style={{ fontSize: "20px" }}>📱</span>
                +996 556 100 600
              </a>
            </div>
          ) : paymentStatus === "processing" ? (
            // Processing state with loader (QR scanned, waiting for payment)
            <div
              style={{
                width: "280px",
                height: "280px",
                margin: "0 auto 32px",
                background: "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)",
                borderRadius: "20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #667eea",
                animation: "fadeIn 0.5s ease-out",
                gap: "20px",
              }}
            >
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  border: "4px solid #667eea30",
                  borderTopColor: "#667eea",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#667eea",
                  textAlign: "center",
                }}
              >
                QR отсканирован
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#6b7280",
                  textAlign: "center",
                  maxWidth: "200px",
                }}
              >
                Ожидаем подтверждения оплаты...
              </div>
            </div>
          ) : qrCode ? (
            <div
              style={{
                width: "280px",
                height: "280px",
                margin: "0 auto 32px",
                background: "#fff",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #667eea30",
                padding: "20px",
                animation: "fadeIn 0.5s ease-out",
              }}
            >
              <img
                src={qrCode}
                alt="QR Code"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          ) : (
            <div
              style={{
                width: "280px",
                height: "280px",
                margin: "0 auto 32px",
                background: "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #667eea30",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              <div
                style={{
                  width: "240px",
                  height: "240px",
                  background: "#fff",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "72px",
                }}
              >
                📱
              </div>
            </div>
          )}

          {/* Countdown Timer */}
          {paymentStatus !== "approved" && paymentStatus !== "canceled" && countdown > 0 && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                borderRadius: "12px",
                background: countdown <= 30
                  ? "linear-gradient(135deg, #ef444415 0%, #dc262615 100%)"
                  : "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)",
                border: countdown <= 30 ? "1px solid #ef4444" : "1px solid #667eea30",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                  {countdown <= 30 ? "⚠️ Осталось времени:" : "⏱ Осталось времени:"}
                </div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color: countdown <= 30 ? "#dc2626" : "#667eea",
                  }}
                >
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#6b7280", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Следующая проверка через:</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#667eea" }}>{nextCheckIn} сек</span>
              </div>
            </div>
          )}

          {/* Checking Indicator */}
          {isChecking && paymentStatus !== "approved" && paymentStatus !== "canceled" && (
            <div
              style={{
                marginBottom: "16px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)",
                border: "1px solid #667eea30",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                justifyContent: "center",
                animation: "fadeIn 0.2s ease-out",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  border: "2px solid #667eea",
                  borderTopColor: "transparent",
                  animation: "spin 0.6s linear infinite",
                }}
              />
              <div style={{ fontSize: "12px", color: "#667eea", fontWeight: 600 }}>
                Проверка статуса...
              </div>
            </div>
          )}

          {/* Info Box (only show when not approved) */}
          {paymentStatus !== "approved" && (
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #667eea10 0%, #764ba210 100%)",
                border: "1px solid #667eea20",
                marginBottom: "24px",
              }}
            >
            </div>
          )}

          <button
            onClick={handleBack}
            disabled={isProcessing}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "2px solid #667eea",
              background: "transparent",
              color: "#667eea",
              fontSize: "15px",
              fontWeight: 600,
              cursor: isProcessing ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
              opacity: isProcessing ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isProcessing) e.currentTarget.style.background = "#667eea10";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Назад к данным
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
        }

        @keyframes checkmarkPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes checkmarkDraw {
          to {
            strokeDashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}