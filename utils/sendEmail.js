import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const sendEmail = async (options) => {
    // 1. Create the Transporter (The Postman)
    const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE, // or use 'host' and 'port' for other providers
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // 2. Define the Email Options
    const mailOptions = {
        from: `"BrandPulse Security" <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html, // Use HTML for clickable links
    };

    // 3. Send the Email
    await transporter.sendMail(mailOptions);
};

/**
 * Send OTP code via email for 2FA verification or registration
 * @param {string} to - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} userName - User's full name
 */
export const sendOTPEmail = async (to, otp, userName = 'User') => {
    const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 BrandPulse Security</h1>
                    <p>Email Verification Code</p>
                </div>
                <div class="content">
                    <h2>Hello ${userName},</h2>
                    <p>You requested a One-Time Password (OTP) to verify your identity. Please use the code below to complete your verification:</p>
                    
                    <div class="otp-box">
                        <p style="margin: 0; color: #666; font-size: 14px;">Your OTP Code</p>
                        <div class="otp-code">${otp}</div>
                        <p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">Valid for 1 minute</p>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Security Warning:</strong>
                        <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                            <li>Never share this code with anyone</li>
                            <li>BrandPulse will never ask for your OTP via phone or email</li>
                            <li>This code expires in 1 minute</li>
                            <li>If you didn't request this code, please secure your account immediately</li>
                        </ul>
                    </div>
                    
                    <p style="margin-top: 20px;">If you didn't request this code, please ignore this email or contact our support team.</p>
                </div>
                <div class="footer">
                    <p>© 2026 BrandPulse. All rights reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    await sendEmail({
        to: to,
        subject: 'BrandPulse - Your Verification Code',
        html: htmlTemplate
    });
};

export default sendEmail;
