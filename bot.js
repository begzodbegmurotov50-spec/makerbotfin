Copy

const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");
 
// =====================
// SOZLAMALAR
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN || "8670746601:AAFwsnaGTE3bWhHMrCPyVGfWyfsGjWAnK";
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || "8475619369";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://xihnhbvykyjdwccvueum.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaG5oYnZ5a3lqZHdjY3Z1ZXVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY4NzI5MywiZXhwIjoyMDk0MjYzMjkzfQ.IZfWneNtSQaGwkjx5O6eC8K4lG88_G35R5CNADwqW28";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://my-market-one.vercel.app";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://makerbotfin.onrender.com/api/bot";
 
// Karta ma'lumotlari
const CARD_NUMBER = "9860 0301 0450 7279";
const CARD_OWNER = "SH / K";
const CARD_BANK = "HUMO CARD";
const CARD_PHONE = "+998918413431";
 
// =====================
// INIT
// =====================
const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
app.use(express.json());
 
// =====================
// HELPERS
// =====================
async function getBalance(telegram_id) {
  const { data } = await supabase
    .from("users")
    .select("balance")
    .eq("telegram_id", telegram_id)
    .single();
  return data?.balance || 0;
}
 
async function registerUser(user) {
  await supabase.from("users").upsert(
    {
      telegram_id: user.id,
      username: user.username || null,
      full_name: `${user.first_name} ${user.last_name || ""}`.trim(),
      balance: 0,
    },
    { onConflict: "telegram_id", ignoreDuplicates: true }
  );
}
 
function isAdmin(id) {
  return String(id) === String(ADMIN_ID);
}
 
function mainMenu(admin = false) {
  const buttons = [
    [Markup.button.webApp("🛒 Do'konni ochish", WEBAPP_URL)],
    ["💰 Hisobim", "➕ Hisob to'ldirish"],
  ];
  if (admin) buttons.push(["⚙️ Admin panel"]);
  return Markup.keyboard(buttons).resize();
}
 
// =====================
// /start
// =====================
bot.start(async (ctx) => {
  await registerUser(ctx.from);
  await ctx.reply(
    `👋 Xush kelibsiz, ${ctx.from.first_name}!\n\nKIMOTO MARKET ga xush kelibsiz! 🛒`,
    mainMenu(isAdmin(ctx.from.id))
  );
});
 
// =====================
// HISOBIM
// =====================
bot.hears("💰 Hisobim", async (ctx) => {
  const balance = await getBalance(ctx.from.id);
  await ctx.reply(
    `💰 Sizning hisobingiz\n\n` +
    `👤 Ism: ${ctx.from.first_name}\n` +
    `🆔 ID: ${ctx.from.id}\n` +
    `💵 Balans: ${balance.toLocaleString()} UZS`,
    { parse_mode: "HTML" }
  );
});
 
// =====================
// HISOB TO'LDIRISH
// =====================
bot.hears("➕ Hisob to'ldirish", async (ctx) => {
  await ctx.reply(
    `TO'LOV UCHUN KARTA\n\n` +
    `🏦 ${CARD_BANK}\n` +
    `💳 ${CARD_NUMBER}\n` +
    `👤 ISM FAMILIYA: ${CARD_OWNER}\n` +
    `📞 ULANGAN RAQAM: ${CARD_PHONE}\n\n` +
    `✅ To'lov qilgandan keyin chekni yuboring!`,
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ To'lov qildim", "payment_done")],
        [Markup.button.callback("❌ Bekor qilish", "cancel_payment")],
      ]),
    }
  );
});
 
bot.action("payment_done", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("💵 Qancha to'ldirmoqchisiz? Faqat raqam yozing (masalan: 50000)");
  await supabase.from("user_states").upsert(
    { telegram_id: ctx.from.id, state: "waiting_amount" },
    { onConflict: "telegram_id" }
  );
});
 
bot.action("cancel_payment", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await ctx.reply("❌ Bekor qilindi.", mainMenu(isAdmin(ctx.from.id)));
});
 
// =====================
// MATN HANDLER
// =====================
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
 
  if (text === "⚙️ Admin panel") {
    if (!isAdmin(userId)) return ctx.reply("❌ Ruxsat yo'q!");
    return ctx.reply(
      "⚙️ Admin Panel",
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("👥 Foydalanuvchilar", "admin_users")],
          [Markup.button.callback("📦 Buyurtmalar", "admin_orders")],
          [Markup.button.callback("💳 To'lov so'rovlari", "admin_payments")],
          [Markup.button.callback("📊 Statistika", "admin_stats")],
        ]),
      }
    );
  }
 
  const { data: stateData } = await supabase
    .from("user_states")
    .select("state, pending_amount")
    .eq("telegram_id", userId)
    .single();
 
  const state = stateData?.state;
 
  if (state === "waiting_amount") {
    const amount = parseInt(text.replace(/\s/g, "").replace(/,/g, ""));
    if (isNaN(amount) || amount < 1000) {
      return ctx.reply("❌ Noto'g'ri summa. Minimal 1,000 UZS. Qayta kiriting:");
    }
    await supabase.from("user_states").upsert(
      { telegram_id: userId, state: "waiting_check", pending_amount: amount },
      { onConflict: "telegram_id" }
    );
    return ctx.reply(
      `✅ Summa: ${amount.toLocaleString()} UZS\n\n📸 Endi to'lov chekini yuboring (rasm yoki screenshot)`
    );
  }
});
 
// =====================
// CHEK HANDLER
// =====================
bot.on(["photo", "document"], async (ctx) => {
  const userId = ctx.from.id;
 
  const { data: stateData } = await supabase
    .from("user_states")
    .select("state, pending_amount")
    .eq("telegram_id", userId)
    .single();
 
  if (stateData?.state !== "waiting_check") return;
 
  const amount = stateData.pending_amount;
  const user = ctx.from;
 
  const { data: payReq, error } = await supabase
    .from("payment_requests")
    .insert({
      user_id: userId,
      username: user.username || null,
      full_name: `${user.first_name} ${user.last_name || ""}`.trim(),
      amount: amount,
      status: "pending",
    })
    .select()
    .single();
 
  if (error) {
    console.error("Payment request error:", error.message);
    return ctx.reply("❌ Xatolik yuz berdi. Qayta urinib ko'ring.");
  }
 
  await supabase.from("user_states").upsert(
    { telegram_id: userId, state: null, pending_amount: null },
    { onConflict: "telegram_id" }
  );
 
  await ctx.reply(
    `✅ Chekingiz qabul qilindi!\n💵 Summa: ${amount.toLocaleString()} UZS\n⏳ Admin tekshirib, hisobingizga qo'shadi. Kuting!`
  );
 
  const caption =
    `Yangi to'lov so'rovi!\n\n` +
    `👤 Ism: ${user.first_name} ${user.last_name || ""}\n` +
    `🆔 Telegram ID: ${userId}\n` +
    `📛 Username: ${user.username ? "@" + user.username : "yo'q"}\n` +
    `💵 Summa: ${amount.toLocaleString()} UZS\n` +
    `🕐 Vaqt: ${new Date().toLocaleString("uz-UZ")}\n` +
    `🆔 So'rov ID: ${payReq.id}`;
 
  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Tasdiqlash", callback_data: `pay_ok_${payReq.id}_${userId}_${amount}` },
      { text: "❌ Rad etish", callback_data: `pay_no_${payReq.id}_${userId}` },
    ]],
  };
 
  try {
    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      await bot.telegram.sendPhoto(ADMIN_ID, photo.file_id, {
        caption,
        reply_markup: keyboard,
      });
    } else {
      await bot.telegram.sendDocument(ADMIN_ID, ctx.message.document.file_id, {
        caption,
        reply_markup: keyboard,
      });
    }
  } catch (e) {
    console.error("Admin xabar xatosi:", e.message);
  }
});
 
// =====================
// TO'LOV TASDIQLASH
// =====================
bot.action(/^pay_ok_(.+)_(\d+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const reqId = ctx.match[1];
  const userId = parseInt(ctx.match[2]);
  const amount = parseInt(ctx.match[3]);
 
  const currentBalance = await getBalance(userId);
  const newBalance = currentBalance + amount;
 
  await supabase.from("users").update({ balance: newBalance }).eq("telegram_id", userId);
  await supabase.from("payment_requests").update({ status: "approved" }).eq("id", reqId);
 
  try {
    const oldCaption = ctx.callbackQuery.message.caption || "";
    await ctx.editMessageCaption(oldCaption + "\n\n✅ TASDIQLANDI");
  } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `✅ To'lovingiz tasdiqlandi!\n\n💵 +${amount.toLocaleString()} UZS qo'shildi.\n💰 Joriy balans: ${newBalance.toLocaleString()} UZS\n\nRahmat!`
  );
  await ctx.answerCbQuery("✅ Tasdiqlandi!");
});
 
// =====================
// TO'LOV RAD ETISH
// =====================
bot.action(/^pay_no_(.+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const reqId = ctx.match[1];
  const userId = parseInt(ctx.match[2]);
 
  await supabase.from("payment_requests").update({ status: "rejected" }).eq("id", reqId);
 
  try {
    const oldCaption = ctx.callbackQuery.message.caption || "";
    await ctx.editMessageCaption(oldCaption + "\n\n❌ RAD ETILDI");
  } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `❌ Arizangiz qabul qilinmadi.\n\nTo'lovingiz tasdiqlanmadi. Qayta urinib ko'ring yoki admin bilan bog'laning.`
  );
  await ctx.answerCbQuery("❌ Rad etildi!");
});
 
// =====================
// ADMIN PANELI
// =====================
bot.action("admin_users", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const { data: users, count } = await supabase
    .from("users").select("*", { count: "exact" })
    .order("created_at", { ascending: false }).limit(10);
  let text = `👥 Foydalanuvchilar (jami: ${count})\n\n`;
  users?.forEach((u, i) => {
    text += `${i + 1}. ${u.full_name || "Nomsiz"} ${u.username ? "@" + u.username : ""}\n`;
    text += `   💰 ${(u.balance || 0).toLocaleString()} UZS | ID: ${u.telegram_id}\n\n`;
  });
  await ctx.answerCbQuery();
  await ctx.reply(text);
});
 
bot.action("admin_orders", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const { data: orders } = await supabase
    .from("orders").select("*")
    .order("created_at", { ascending: false }).limit(10);
  let text = `📦 So'nggi buyurtmalar\n\n`;
  if (!orders?.length) { text += "Hozircha buyurtma yo'q."; }
  else {
    orders.forEach((o, i) => {
      const s = o.status === "completed" ? "✅" : o.status === "cancelled" ? "❌" : "⏳";
      text += `${i + 1}. ${s} ${o.product_name}\n   💰 ${(o.amount || 0).toLocaleString()} UZS\n\n`;
    });
  }
  await ctx.answerCbQuery();
  await ctx.reply(text);
});
 
bot.action("admin_payments", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const { data: payments } = await supabase
    .from("payment_requests").select("*")
    .order("created_at", { ascending: false }).limit(10);
  let text = `💳 So'nggi to'lov so'rovlari\n\n`;
  if (!payments?.length) { text += "Hozircha so'rov yo'q."; }
  else {
    payments.forEach((p, i) => {
      const s = p.status === "approved" ? "✅" : p.status === "rejected" ? "❌" : "⏳";
      text += `${i + 1}. ${s} ${p.full_name || "Nomsiz"}\n   💵 ${(p.amount || 0).toLocaleString()} UZS\n\n`;
    });
  }
  await ctx.answerCbQuery();
  await ctx.reply(text);
});
 
bot.action("admin_stats", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const { count: userCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: orderCount } = await supabase.from("orders").select("*", { count: "exact", head: true });
  const { count: pendingCount } = await supabase.from("payment_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
  const { data: approved } = await supabase.from("payment_requests").select("amount").eq("status", "approved");
  const totalDeposit = approved?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
  await ctx.answerCbQuery();
  await ctx.reply(
    `📊 Statistika\n\n` +
    `👥 Foydalanuvchilar: ${userCount}\n` +
    `📦 Buyurtmalar: ${orderCount}\n` +
    `💰 Tasdiqlangan to'lovlar: ${totalDeposit.toLocaleString()} UZS\n` +
    `⏳ Kutilayotgan: ${pendingCount}`
  );
});
 
// =====================
// WEB APP BUYURTMA
// =====================
bot.on("web_app_data", async (ctx) => {
  let orderData;
  try { orderData = JSON.parse(ctx.webAppData.data.text()); }
  catch (e) { return ctx.reply("❌ Ma'lumot noto'g'ri formatda."); }
 
  const { name, amount, product_id } = orderData;
  const userId = ctx.from.id;
 
  const { data: order, error } = await supabase.from("orders")
    .insert({ user_id: userId, product_name: name, amount, product_id: product_id || null, status: "pending" })
    .select().single();
 
  if (error) return ctx.reply("❌ Buyurtma saqlashda xatolik.");
 
  await ctx.reply(`✅ Buyurtma qabul qilindi!\n📦 ${name}\n💰 ${amount} UZS`);
 
  await bot.telegram.sendMessage(
    ADMIN_ID,
    `🛒 Yangi buyurtma!\n\n👤 ${ctx.from.first_name} (ID: ${userId})\n📦 ${name}\n💰 ${amount} UZS\n🆔 ${order.id}`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Tasdiqlash", callback_data: `order_ok_${order.id}_${userId}` },
          { text: "❌ Bekor qilish", callback_data: `order_no_${order.id}_${userId}` },
        ]],
      },
    }
  );
});
 
bot.action(/^order_ok_(.+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const [, orderId, userId] = ctx.match;
  await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ TASDIQLANDI"); } catch (e) {}
  await bot.telegram.sendMessage(userId, `✅ Buyurtmangiz tasdiqlandi! Rahmat!`);
  await ctx.answerCbQuery("✅ Tasdiqlandi!");
});
 
bot.action(/^order_no_(.+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const [, orderId, userId] = ctx.match;
  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ BEKOR QILINDI"); } catch (e) {}
  await bot.telegram.sendMessage(userId, `❌ Buyurtmangiz bekor qilindi.`);
  await ctx.answerCbQuery("❌ Bekor qilindi!");
});
 
// =====================
// WEBHOOK ENDPOINT
// =====================
app.post("/api/bot", (req, res) => {
  bot.handleUpdate(req.body, res);
});
 
app.get("/", (req, res) => res.json({ status: "Bot ishlayapti ✅" }));
 
// =====================
// ISHGA TUSHIRISH
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server ${PORT} portda ishlamoqda`);
  await bot.telegram.setWebhook(WEBHOOK_URL);
  console.log(`Webhook o'rnatildi: ${WEBHOOK_URL}`);
});
