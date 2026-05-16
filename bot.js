
Copy

const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");
 
// =====================
// SOZLAMALAR
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN || "8670746601:AAFwsnaGTE3bWhHMrCXPyVGFwYfszGjWAnk";
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || "8475619369";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://xihnhbvykyjdwccvueum.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaG5oYnZ5a3lqZHdjY3Z1ZXVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY4NzI5MywiZXhwIjoyMDk0MjYzMjkzfQ.IZfWneNtSQaGwkjx5O6eC8K4lG88_G35R5CNADwqW28";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://my-market-one.vercel.app";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://makerbotfin.onrender.com/api/bot";
 
// Karta
const CARD_NUMBER = "9860 0301 0450 7279";
const CARD_OWNER = "SH / K";
const CARD_BANK = "HUMO CARD";
const CARD_PHONE = "+998918413431";
const MIN_AMOUNT = 1000;
 
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
    .from("users").select("balance")
    .eq("telegram_id", telegram_id).single();
  return data?.balance || 0;
}
 
async function registerUser(user) {
  await supabase.from("users").upsert({
    telegram_id: user.id,
    username: user.username || null,
    full_name: `${user.first_name} ${user.last_name || ""}`.trim(),
    balance: 0,
  }, { onConflict: "telegram_id", ignoreDuplicates: true });
}
 
async function getState(telegram_id) {
  const { data } = await supabase
    .from("user_states").select("state, pending_amount")
    .eq("telegram_id", telegram_id).single();
  return data || null;
}
 
async function setState(telegram_id, state, pending_amount = null) {
  await supabase.from("user_states").upsert(
    { telegram_id, state, pending_amount },
    { onConflict: "telegram_id" }
  );
}
 
function isAdmin(id) {
  return String(id) === String(ADMIN_ID);
}
 
function mainMenu(admin = false) {
  const buttons = [
    [Markup.button.webApp("🛍 Do'konni ochish", WEBAPP_URL)],
    ["💰 Hisobim", "➕ Hisob to'ldirish"],
    ["📦 Buyurtmalarim"],
  ];
  if (admin) buttons.push(["⚙️ Admin panel"]);
  return Markup.keyboard(buttons).resize();
}
 
// =====================
// /start
// =====================
bot.start(async (ctx) => {
  await registerUser(ctx.from);
  await setState(ctx.from.id, null);
  await ctx.reply(
    `👋 Assalomu alaykum, ${ctx.from.first_name}!\n\n🛍 KIMOTO MARKET ga xush kelibsiz!\n\nQuyidagi tugmalardan foydalaning:`,
    mainMenu(isAdmin(ctx.from.id))
  );
});
 
// =====================
// HISOBIM
// =====================
bot.hears("💰 Hisobim", async (ctx) => {
  await setState(ctx.from.id, null);
  const balance = await getBalance(ctx.from.id);
  await ctx.reply(
    `💰 Sizning hisobingiz:\n\n` +
    `👤 Ism: ${ctx.from.first_name}\n` +
    `🆔 ID: ${ctx.from.id}\n` +
    `💵 Balans: ${balance.toLocaleString()} UZS`
  );
});
 
// =====================
// BUYURTMALARIM
// =====================
bot.hears("📦 Buyurtmalarim", async (ctx) => {
  await setState(ctx.from.id, null);
  const { data: orders } = await supabase
    .from("orders").select("*")
    .eq("user_id", ctx.from.id)
    .order("created_at", { ascending: false })
    .limit(5);
 
  if (!orders?.length) {
    return ctx.reply("📦 Sizda hali buyurtma yo'q.");
  }
 
  let text = "📦 Sizning buyurtmalaringiz:\n\n";
  orders.forEach((o, i) => {
    const s = o.status === "completed" ? "✅ Bajarildi" : o.status === "cancelled" ? "❌ Bekor qilindi" : "⏳ Kutilmoqda";
    text += `${i + 1}. ${o.product_name}\n   💰 ${(o.amount || 0).toLocaleString()} UZS\n   📌 ${s}\n\n`;
  });
  await ctx.reply(text);
});
 
// =====================
// HISOB TO'LDIRISH
// =====================
bot.hears("➕ Hisob to'ldirish", async (ctx) => {
  await setState(ctx.from.id, null);
  await ctx.reply(
    `➕ Hisob to'ldirish\n\n` +
    `Quyidagi kartaga to'lov qiling:\n\n` +
    `🏦 Bank: ${CARD_BANK}\n` +
    `💳 Karta: ${CARD_NUMBER}\n` +
    `👤 Egasi: ${CARD_OWNER}\n` +
    `📞 Raqam: ${CARD_PHONE}\n\n` +
    `To'lov qilib bo'lgach, tugmani bosing 👇`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ To'lov qildim", "payment_done")],
      [Markup.button.callback("🔙 Orqaga", "back_main")],
    ])
  );
});
 
bot.action("payment_done", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `💵 Qancha to'lov qildingiz?\n\nMinimal: ${MIN_AMOUNT.toLocaleString()} UZS\n\nFaqat raqam yozing (masalan: 50000):`
  );
  await setState(ctx.from.id, "waiting_amount");
});
 
bot.action("back_main", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await setState(ctx.from.id, null);
});
 
// =====================
// MATN HANDLER
// =====================
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
 
  // Admin panel
  if (text === "⚙️ Admin panel") {
    if (!isAdmin(userId)) return ctx.reply("❌ Ruxsat yo'q!");
    return ctx.reply(
      "⚙️ Admin Panel",
      Markup.inlineKeyboard([
        [Markup.button.callback("👥 Foydalanuvchilar", "admin_users")],
        [Markup.button.callback("📦 Buyurtmalar", "admin_orders")],
        [Markup.button.callback("💳 To'lov so'rovlari", "admin_payments")],
        [Markup.button.callback("📊 Statistika", "admin_stats")],
      ])
    );
  }
 
  const stateData = await getState(userId);
  const state = stateData?.state;
 
  // Summa kutilmoqda
  if (state === "waiting_amount") {
    const amount = parseInt(text.replace(/\s/g, "").replace(/,/g, ""));
    if (isNaN(amount) || amount < MIN_AMOUNT) {
      return ctx.reply(`❌ Minimal summa ${MIN_AMOUNT.toLocaleString()} UZS. Qayta kiriting:`);
    }
    await setState(userId, "waiting_check", amount);
    return ctx.reply(
      `✅ Summa: ${amount.toLocaleString()} UZS\n\n` +
      `Quyidagi ma'lumotlarni tasdiqlang:\n\n` +
      `🏦 Bank: ${CARD_BANK}\n` +
      `💳 Karta: ${CARD_NUMBER}\n` +
      `💵 Summa: ${amount.toLocaleString()} UZS\n\n` +
      `✅ To'lovni amalga oshirdingizmi? Chekni yuboring (rasm yoki screenshot):`,
    );
  }
});
 
// =====================
// CHEK HANDLER (rasm/fayl)
// =====================
bot.on(["photo", "document"], async (ctx) => {
  const userId = ctx.from.id;
  const stateData = await getState(userId);
 
  if (stateData?.state !== "waiting_check") return;
 
  const amount = stateData.pending_amount;
  const user = ctx.from;
 
  const { data: payReq, error } = await supabase
    .from("payment_requests")
    .insert({
      user_id: userId,
      username: user.username || null,
      full_name: `${user.first_name} ${user.last_name || ""}`.trim(),
      amount,
      status: "pending",
    })
    .select().single();
 
  if (error) {
    console.error("Payment error:", error.message);
    return ctx.reply("❌ Xatolik yuz berdi. Qayta urinib ko'ring.");
  }
 
  await setState(userId, null, null);
 
  await ctx.reply(
    `✅ Chekingiz qabul qilindi!\n\n` +
    `💵 Summa: ${amount.toLocaleString()} UZS\n` +
    `⏳ Admin tekshirib, hisobingizga qo'shadi.\n\n` +
    `Tez orada xabar beramiz! 🙏`,
    mainMenu(isAdmin(userId))
  );
 
  // Adminga xabar
  const caption =
    `🔔 Yangi to'lov so'rovi!\n\n` +
    `👤 ${user.first_name} ${user.last_name || ""}\n` +
    `📛 ${user.username ? "@" + user.username : "username yo'q"}\n` +
    `🆔 ID: ${userId}\n` +
    `💵 Summa: ${amount.toLocaleString()} UZS\n` +
    `🕐 Vaqt: ${new Date().toLocaleString("uz-UZ")}\n\n` +
    `Tasdiqlaysizmi?`;
 
  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Tasdiqlash", callback_data: `pay_ok_${payReq.id}_${userId}_${amount}` },
      { text: "❌ Rad etish", callback_data: `pay_no_${payReq.id}_${userId}` },
    ]],
  };
 
  try {
    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      await bot.telegram.sendPhoto(ADMIN_ID, photo.file_id, { caption, reply_markup: keyboard });
    } else {
      await bot.telegram.sendDocument(ADMIN_ID, ctx.message.document.file_id, { caption, reply_markup: keyboard });
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
    const old = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
    if (ctx.callbackQuery.message.caption !== undefined) {
      await ctx.editMessageCaption(old + "\n\n✅ TASDIQLANDI");
    } else {
      await ctx.editMessageText(old + "\n\n✅ TASDIQLANDI");
    }
  } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `✅ To'lovingiz tasdiqlandi!\n\n` +
    `💵 Hisobingizga +${amount.toLocaleString()} UZS qo'shildi.\n` +
    `💰 Joriy balans: ${newBalance.toLocaleString()} UZS\n\n` +
    `Xaridingiz uchun rahmat! 🙏`
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
    const old = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
    if (ctx.callbackQuery.message.caption !== undefined) {
      await ctx.editMessageCaption(old + "\n\n❌ RAD ETILDI");
    } else {
      await ctx.editMessageText(old + "\n\n❌ RAD ETILDI");
    }
  } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `❌ To'lovingiz rad etildi.\n\n` +
    `Afsuski to'lovingiz tasdiqlanmadi.\n` +
    `Savollar bo'lsa admin bilan bog'laning.`
  );
  await ctx.answerCbQuery("❌ Rad etildi!");
});
 
// =====================
// WEB APP BUYURTMA (saytdan)
// =====================
bot.on("web_app_data", async (ctx) => {
  let orderData;
  try { orderData = JSON.parse(ctx.webAppData.data.text()); }
  catch (e) { return ctx.reply("❌ Ma'lumot noto'g'ri formatda."); }
 
  const { name, amount, product_id } = orderData;
  const userId = ctx.from.id;
  const user = ctx.from;
 
  const { data: order, error } = await supabase.from("orders")
    .insert({ user_id: userId, product_name: name, amount, product_id: product_id || null, status: "pending" })
    .select().single();
 
  if (error) return ctx.reply("❌ Buyurtma saqlashda xatolik.");
 
  await ctx.reply(
    `✅ Buyurtmangiz qabul qilindi!\n\n` +
    `📦 Mahsulot: ${name}\n` +
    `💰 Narxi: ${amount} UZS\n` +
    `⏳ Admin tasdiqlashini kuting...`
  );
 
  // Adminga xabar
  await bot.telegram.sendMessage(
    ADMIN_ID,
    `🛒 Yangi buyurtma!\n\n` +
    `👤 ${user.first_name} ${user.last_name || ""}\n` +
    `📛 ${user.username ? "@" + user.username : "username yo'q"}\n` +
    `🆔 ID: ${userId}\n` +
    `📦 Mahsulot: ${name}\n` +
    `💰 Narxi: ${amount} UZS\n` +
    `🕐 Vaqt: ${new Date().toLocaleString("uz-UZ")}\n\n` +
    `Tasdiqlaysizmi?`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Bajarildi", callback_data: `order_ok_${order.id}_${userId}` },
          { text: "❌ Bajarilmadi", callback_data: `order_no_${order.id}_${userId}` },
        ]],
      },
    }
  );
});
 
// =====================
// BUYURTMA TASDIQLASH
// =====================
bot.action(/^order_ok_(.+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const [, orderId, userId] = ctx.match;
 
  await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
 
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ BAJARILDI"); } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `✅ Buyurtmangiz bajarildi!\n\nMahsulotingiz tez orada yetkaziladi yoki aktivlanadi.\nRahmat! 🙏`
  );
  await ctx.answerCbQuery("✅ Bajarildi!");
});
 
// =====================
// BUYURTMA BEKOR QILISH
// =====================
bot.action(/^order_no_(.+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const [, orderId, userId] = ctx.match;
 
  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
 
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ BAJARILMADI"); } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `❌ Buyurtmangiz bajarilmadi.\n\nAfsuski bu buyurtmani amalga oshirib bo'lmadi.\nSavollar bo'lsa admin bilan bog'laning.`
  );
  await ctx.answerCbQuery("❌ Bajarilmadi!");
});
 
// =====================
// ADMIN PANELI
// =====================
bot.action("admin_users", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const { data: users, count } = await supabase.from("users")
    .select("*", { count: "exact" })
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
  const { data: orders } = await supabase.from("orders")
    .select("*").order("created_at", { ascending: false }).limit(10);
 
  let text = `📦 So'nggi buyurtmalar\n\n`;
  if (!orders?.length) { text += "Hozircha buyurtma yo'q."; }
  else {
    orders.forEach((o, i) => {
      const s = o.status === "completed" ? "✅" : o.status === "cancelled" ? "❌" : "⏳";
      text += `${i + 1}. ${s} ${o.product_name} — ${(o.amount || 0).toLocaleString()} UZS\n`;
      text += `   ID: ${o.user_id}\n\n`;
    });
  }
  await ctx.answerCbQuery();
  await ctx.reply(text);
});
 
bot.action("admin_payments", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const { data: payments } = await supabase.from("payment_requests")
    .select("*").order("created_at", { ascending: false }).limit(10);
 
  let text = `💳 So'nggi to'lov so'rovlari\n\n`;
  if (!payments?.length) { text += "Hozircha so'rov yo'q."; }
  else {
    payments.forEach((p, i) => {
      const s = p.status === "approved" ? "✅" : p.status === "rejected" ? "❌" : "⏳";
      text += `${i + 1}. ${s} ${p.full_name || "Nomsiz"} — ${(p.amount || 0).toLocaleString()} UZS\n`;
      text += `   ID: ${p.user_id}\n\n`;
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
    `💰 Jami to'lovlar: ${totalDeposit.toLocaleString()} UZS\n` +
    `⏳ Kutilayotgan: ${pendingCount}`
  );
});
 
// =====================
// WEBHOOK
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
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log(`Webhook: ${WEBHOOK_URL}`);
  } catch (e) {
    console.error("Webhook xatosi:", e.message);
  }
});
