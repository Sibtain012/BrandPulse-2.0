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

export default sendEmail;