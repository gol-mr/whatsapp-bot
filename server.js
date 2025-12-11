const express = require("express");
const fetch = require("node-fetch");
const cron = require("node-cron");
const Twilio = require("twilio");

// --- ENV ---
const PORT = process.env.PORT || 10000;
const BASE44_API_KEY = process.env.BASE44_API_KEY;
const BASE44_ORDERS_URL = process.env.BASE44_ORDERS_URL;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM;

const app = express();
app.use(express.json());

const client = Twilio(TWILIO_SID, TWILIO_TOKEN);

// ----------------------------------------------------------------------------
// WHATSAPP SENDER
// ----------------------------------------------------------------------------
async function sendWhatsApp(to, message) {
    if (!to) return;

    try {
        await client.messages.create({
            body: message,
            from: TWILIO_FROM,
            to: `whatsapp:${to}`
        });
        console.log("WhatsApp sent →", to);
    } catch (err) {
        console.log("Twilio error:", err.message);
    }
}

// ----------------------------------------------------------------------------
// FETCH ORDERS FROM BASE44
// ----------------------------------------------------------------------------
async function getOrders() {
    try {
        const res = await fetch(BASE44_ORDERS_URL, {
            headers: { "api_key": BASE44_API_KEY }
        });
        const data = await res.json();
        return data;
    } catch (err) {
        console.log("Base44 fetch error:", err.message);
        return [];
    }
}

// ----------------------------------------------------------------------------
// MESSAGES
// ----------------------------------------------------------------------------
function msg48h(gameName) {
    return `היי, במידה ולא קיבלתם את הכרטיסים שלכם עדיין – הכל בסדר 😊
רוב הספקים שולחים את הכרטיסים עד 24 שעות לפני המשחק.
אנחנו נעדכן אתכם ברגע שנקבל אותם מהמועדון.`;
}

function msg10h(gameName) {
    return `היי! עוד מעט המשחק ⚽🔥
רצוי להגיע לפחות שעתיים לפני.
חובה להיכנס לאיצטדיון עד 45 דק' לפני.
ואל תשכחו לתייג אותנו 😉`;
}

function msg60m() {
    return `היי! האם נכנסתם והכול תקין? 🙂
אם לא – אתם מפספסים רגעים מדהימים מהחימום והתמונות.
נשמח לשמוע מכם!`;
}

function reviewMessage() {
    return `היי! מקווים שנהנתם במשחק 🎉⚽
נשמח אם תוכלו להשאיר עלינו ביקורת חיובית 🙂
ובשמחה תצרפו תמונות!
https://g.page/r/CccXby7J1kW7EBM/review`;
}

// ----------------------------------------------------------------------------
// GAME SCHEDULER (RUNS EVERY MINUTE)
// ----------------------------------------------------------------------------
cron.schedule("* * * * *", async () => {
    console.log("Checking game reminders…");

    const orders = await getOrders();
    const now = new Date();

    for (let order of orders) {
        if (!order.gameDate || !order.customerPhone) continue;

        const phone = order.customerPhone;
        const gameDate = new Date(order.gameDate);

        const diffHours = (gameDate - now) / (1000 * 60 * 60);
        const diffMinutes = (gameDate - now) / (1000 * 60);
        const diffAfterHours = (now - gameDate) / (1000 * 60 * 60);

        // 48h BEFORE
        if (diffHours < 48 && diffHours > 47.9) {
            sendWhatsApp(phone, msg48h(order.gameName));
        }

        // 10h BEFORE
        if (diffHours < 10 && diffHours > 9.9) {
            sendWhatsApp(phone, msg10h(order.gameName));
        }

        // 60m BEFORE
        if (diffMinutes < 60 && diffMinutes > 59) {
            sendWhatsApp(phone, msg60m());
        }

        // 40h AFTER — REVIEW
        if (diffAfterHours > 40 && diffAfterHours < 40.1 && !order.reviewRequestSent) {
            sendWhatsApp(phone, reviewMessage());
        }
    }
});

// ----------------------------------------------------------------------------
// BIRTHDAY SCHEDULER (RUNS DAILY AT 07:00)
// ----------------------------------------------------------------------------
cron.schedule("0 7 * * *", async () => {
    console.log("Checking birthdays…");

    const orders = await getOrders();
    const now = new Date();
    const today = `${now.getMonth() + 1}-${now.getDate()}`;

    const sent = new Set();

    for (let order of orders) {
        if (!order.customerBirthDate || !order.customerPhone) continue;

        const bd = new Date(order.customerBirthDate);
        const bdKey = `${bd.getMonth() + 1}-${bd.getDate()}`;

        if (bdKey === today && !sent.has(order.customerPhone)) {
            sendWhatsApp(
                order.customerPhone,
                "מזל טוב! 🎉🎂 מאחלים לכם יום מקסים ומלא בשמחה!"
            );
            sent.add(order.customerPhone);
        }
    }
});

// ----------------------------------------------------------------------------
// SERVER CHECK
// ----------------------------------------------------------------------------
app.get("/", (req, res) => {
    res.send("WhatsApp Bot is running.");
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
