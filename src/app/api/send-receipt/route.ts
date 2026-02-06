import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, name, tariff, price, invoiceId } = body;

        if (!email || !name || !tariff || !price) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
            to: email,
            subject: `Квитанция об оплате - ${tariff}`,
            html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                border-radius: 12px 12px 0 0;
                text-align: center;
              }
              .content {
                background: #f9fafb;
                padding: 30px;
                border-radius: 0 0 12px 12px;
              }
              .receipt-box {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border: 1px solid #e5e7eb;
              }
              .receipt-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #f3f4f6;
              }
              .receipt-row:last-child {
                border-bottom: none;
                font-weight: bold;
                font-size: 18px;
                color: #667eea;
              }
              .success-icon {
                width: 60px;
                height: 60px;
                background: #10b981;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                margin-bottom: 15px;
              }
              .footer {
                text-align: center;
                color: #6b7280;
                font-size: 14px;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="success-icon">✓</div>
              <h1 style="margin: 0;">Оплата успешна!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Благодарим за оплату</p>
            </div>
            
            <div class="content">
              <p>Здравствуйте, <strong>${name}</strong>!</p>
              <p>Ваша оплата успешно обработана. Услуга будет подключена в ближайшее время.</p>
              
              <div class="receipt-box">
                <h2 style="margin-top: 0; color: #374151;">Детали платежа</h2>
                <div class="receipt-row">
                  <span>Тариф:</span>
                  <strong>${tariff}</strong>
                </div>
                ${invoiceId ? `
                <div class="receipt-row">
                  <span>ID платежа:</span>
                  <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${invoiceId}</code>
                </div>
                ` : ''}
                <div class="receipt-row">
                  <span>Сумма:</span>
                  <strong>${price} сом</strong>
                </div>
              </div>
              
              <p style="color: #6b7280; font-size: 14px;">
                Если у вас возникли вопросы, свяжитесь с нами через WhatsApp: 
                <a href="https://wa.me/996556100600" style="color: #667eea;">+996 556 100 600</a>
              </p>
            </div>
            
            <div class="footer">
              <p>Это автоматическое письмо, пожалуйста, не отвечайте на него.</p>
            </div>
          </body>
        </html>
      `,
        });

        if (error) {
            console.error('❌ Email sending error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log('✅ Email sent successfully:', data);
        return NextResponse.json({ success: true, data });

    } catch (error: any) {
        console.error('❌ API route error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send email' },
            { status: 500 }
        );
    }
}
