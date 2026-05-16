const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

const BOT_TOKEN = "8670746601:AAFwsnaGTE3bWhHMrCXPyVGFwYfszGjWAnk";
const ADMIN_ID = "8475619369";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://my-market-one.vercel.app";

const CARD_INFO = `💳 *TO'LOV UCHUN KARTA*

😈 HUMO CARD
💳 \`9860 0301 0450 7279\`
✈️ ISM FAMILIYA: *SH / K*
📞 ULANGAN RAQAM: *+998918413431*

✅ To'lov qilgandan keyin chekni yuboring!`;

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
app.use(express.json());

const userMenu = Markup.keyboard([
  ["🛒 Do'konni ochish", "💰 Hisobim"],
  ["💳 Hisob to'ldirish", "📋 Buyurtmalarim"],
]).resize();

const adminMenu = Markup.keyboard([
  ["👥 Foydalanuvchilar", "📦 Buyurtmalar"],
  ["💰 To'lovlar", "📊 Statistika"],
  ["🔙 Foydalanuvchi rejimi"],
]).resize();

bot.start(async (ctx) => {
  const user = ctx.from;
  await supabase.from("users").upsert(
    { telegram_id: user.id, username: user.username || null, full_name: `${user.first_name} ${user.last_name || ""}`.trim(), balance: 0 },
    { onConflict: "telegram_id" }
  );
  const isAdmin = String(user.id) === String(ADMIN_ID);
  await ctx.reply(
    `👋 Xush kelibsiz, *${user.first_name}*!\n\nKIMOTO MARKET botiga xush kelibsiz! 🛒`,
    { parse_mode: "Markdown", ...(isAdmin ? adminMenu : userMenu) }
  );
});

bot.hears("🛒 Do'konni ochish", async (ctx) => {
  await ctx.reply("Do'konni ochish uchun:", Markup.inlineKeyboard([[Markup.button.url("🛒 Kimoto Market", WEBAPP_URL)]]));
});

bot.hears("💰 Hisobim", async (ctx) => {
  const { data: user } = await supabase.from("users").select("*").eq("telegram_id", ctx.from.id).single();
  if (!user) return ctx.reply("Foydalanuvchi topilmadi!");
  await ctx.reply(
    `💰 *Hisobingiz*\n\n👤 Ism: *${user.full_name}*\n🆔 ID: \`${user.telegram_id}\`\n💵 Balans: *${(user.balance || 0).toLocaleString()} UZS*`,
    { parse_mode: "Markdown" }
  );
});

bot.hears("💳 Hisob to'ldirish", async (ctx) => {
  await supabase.from("users").update({ state: "waiting_amount" }).eq("telegram_id", ctx.from.id);
  await ctx.reply(CARD_INFO, { parse_mode: "Markdown" });
  await ctx.reply("💰 Qancha to'ldirmoqchisiz? Faqat raqam yozing (masalan: *50000*)", { parse_mode: "Markdown" });
});

bot.hears("📋 Buyurtmalarim", async (ctx) => {
  const { data: orders } = await supabase.from("orders").select("*").eq("user_id", ctx.from.id).order("created_at", { ascending: false }).limit(5);
  if (!orders || orders.length === 0) return ctx.reply("📋 Sizda hali buyurtmalar yo'q.");
  let text = "📋 *So'nggi buyurtmalaringiz:*\n\n";
  orders.forEach((o, i) => {
    const s = o.status === "completed" ? "✅" : o.status === "cancelled" ? "❌" : "⏳";
    text += `${i + 1}. ${s} ${o.product_name} — *${o.amount} UZS*\n`;
  });
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.hears("👥 Foydalanuvchilar", async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  const { data: users } = await supabase.from("users").select("*");
  let text = `👥 *Foydalanuvchilar: ${users?.length || 0} ta*\n\n`;
  users?.slice(0, 15).forEach((u) => { text += `• ${u.full_name} (@${u.username || "nomsiz"}) — *${(u.balance || 0).toLocaleString()} UZS*\n`; });
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.hears("📦 Buyurtmalar", async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  const { data: orders } = await supabase.from("orders").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(10);
  if (!orders || orders.length === 0) return ctx.reply("📦 Kutayotgan buyurtmalar yo'q.");
  let text = `📦 *Kutayotgan buyurtmalar: ${orders.length} ta*\n\n`;
  orders.forEach((o, i) => { text += `${i + 1}. 👤 ID: ${o.user_id}\n   📦 ${o.product_name} — *${o.amount} UZS*\n\n`; });
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.hears("💰 To'lovlar", async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  const { data: payments } = await supabase.from("payments").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(10);
  if (!payments || payments.length === 0) return ctx.reply("💰 Kutayotgan to'lovlar yo'q.");
  for (const p of payments) {
    await bot.telegram.sendMessage(ADMIN_ID,
      `💰 *Yangi to'lov*\n\n👤 @${p.username || "nomsiz"} (ID: \`${p.user_id}\`)\n💵 Summa: *${p.amount.toLocaleString()} UZS*\n⏰ ${new Date(p.created_at).toLocaleString()}`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[
        { text: "✅ Tasdiqlash", callback_data: `pay_approve_${p.id}_${p.user_id}_${p.amount}` },
        { text: "❌ Bekor qilish", callback_data: `pay_cancel_${p.id}_${p.user_id}` },
      ]] } }
    );
  }
});

bot.hears("📊 Statistika", async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  const { count: u } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: o } = await supabase.from("orders").select("*", { count: "exact", head: true });
  const { count: p } = await supabase.from("payments").select("*", { count: "exact", head: true });
  await ctx.reply(`📊 *Statistika*\n\n👥 Foydalanuvchilar: *${u}*\n📦 Buyurtmalar: *${o}*\n💰 To'lovlar: *${p}*`, { parse_mode: "Markdown" });
});

bot.hears("🔙 Foydalanuvchi rejimi", async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  await ctx.reply("Foydalanuvchi rejimi:", userMenu);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/") || ["🛒 Do'konni ochish","💰 Hisobim","💳 Hisob to'ldirish","📋 Buyurtmalarim","👥 Foydalanuvchilar","📦 Buyurtmalar","💰 To'lovlar","📊 Statistika","🔙 Foydalanuvchi rejimi"].includes(text)) return;

  const { data: user } = await supabase.from("users").select("*").eq("telegram_id", ctx.from.id).single();
  if (!user) return;

  if (user.state === "waiting_amount") {
    const amount = parseInt(text.replace(/\D/g, ""));
    if (!amount || amount < 1000) return ctx.reply("❌ Kamida 1,000 UZS kiriting!");
    await supabase.from("payments").insert({ user_id: ctx.from.id, username: ctx.from.username || null, amount, status: "waiting_check" });
    await supabase.from("users").update({ state: "waiting_check" }).eq("telegram_id", ctx.from.id);
    await ctx.reply(`✅ *${amount.toLocaleString()} UZS* uchun to'lov:\n\n${CARD_INFO}\n\n📸 Endi to'lov chekini (screenshot) yuboring!`, { parse_mode: "Markdown" });
  }
});

bot.on("photo", async (ctx) => {
  const { data: user } = await supabase.from("users").select("*").eq("telegram_id", ctx.from.id).single();
  if (!user || user.state !== "waiting_check") return;

  const { data: payment } = await supabase.from("payments").select("*").eq("user_id", ctx.from.id).eq("status", "waiting_check").order("created_at", { ascending: false }).limit(1).single();
  if (!payment) return ctx.reply("❌ To'lov topilmadi. Qaytadan boshlang.");

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption: `💰 *Yangi to'lov cheki!*\n\n👤 @${ctx.from.username || "nomsiz"}\n🆔 ID: \`${ctx.from.id}\`\n💵 Summa: *${payment.amount.toLocaleString()} UZS*\n⏰ ${new Date().toLocaleString("uz")}`,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[
      { text: "✅ Tasdiqlash", callback_data: `pay_approve_${payment.id}_${ctx.from.id}_${payment.amount}` },
      { text: "❌ Bekor qilish", callback_data: `pay_cancel_${payment.id}_${ctx.from.id}` },
    ]] },
  });

  await supabase.from("payments").update({ status: "pending" }).eq("id", payment.id);
  await supabase.from("users").update({ state: null }).eq("telegram_id", ctx.from.id);
  await ctx.reply("✅ Chekingiz qabul qilindi! Admin tekshirib, hisob to'ldiriladi. ⏳");
});

bot.action(/^pay_approve_(.+)_(\d+)_(\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const [, paymentId, userId, amountStr] = ctx.match;
  const amount = parseInt(amountStr);
  const { data: user } = await supabase.from("users").select("balance").eq("telegram_id", userId).single();
  const newBalance = (user?.balance || 0) + amount;
  await supabase.from("users").update({ balance: newBalance }).eq("telegram_id", userId);
  await supabase.from("payments").update({ status: "completed" }).eq("id", paymentId);
  try { await ctx.editMessageCaption(ctx.callbackQuery.message.caption + "\n\n✅ *TASDIQLANDI*", { parse_mode: "Markdown" }); } catch(e) {}
  await bot.telegram.sendMessage(userId,
    `✅ *To'lovingiz tasdiqlandi!*\n\n💵 Qo'shildi: *+${amount.toLocaleString()} UZS*\n💰 Yangi balans: *${newBalance.toLocaleString()} UZS*\n\nRahmat! 🎉`,
    { parse_mode: "Markdown" }
  );
  await ctx.answerCbQuery("✅ Tasdiqlandi!");
});

bot.action(/^pay_cancel_(.+)_(\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  const [, paymentId, userId] = ctx.match;
  await supabase.from("payments").update({ status: "cancelled" }).eq("id", paymentId);
  try { await ctx.editMessageCaption(ctx.callbackQuery.message.caption + "\n\n❌ *BEKOR QILINDI*", { parse_mode: "Markdown" }); } catch(e) {}
  await bot.telegram.sendMessage(userId, `❌ *Arizangiz qabul qilinmadi!*\n\nTo'lovingiz tasdiqlanmadi. To'g'ri chek yuboring yoki admin bilan bog'laning.`, { parse_mode: "Markdown" });
  await ctx.answerCbQuery("❌ Bekor qilindi!");
});

bot.action(/^approve_(.+)_(\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  const [, orderId, userId] = ctx.match;
  await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ *TASDIQLANDI*", { parse_mode: "Markdown" }); } catch(e) {}
  await bot.telegram.sendMessage(userId, `✅ *Buyurtmangiz tasdiqlandi!*\n\nTez orada yetkaziladi. Rahmat! 🙏`, { parse_mode: "Markdown" });
  await ctx.answerCbQuery("✅ Tasdiqlandi!");
});

bot.action(/^cancel_(.+)_(\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  const [, orderId, userId] = ctx.match;
  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ *BEKOR QILINDI*", { parse_mode: "Markdown" }); } catch(e) {}
  await bot.telegram.sendMessage(userId, `❌ *Buyurtmangiz bekor qilindi.*`, { parse_mode: "Markdown" });
  await ctx.answerCbQuery("❌ Bekor qilindi!");
});

bot.on("web_app_data", async (ctx) => {
  let orderData;
  try { orderData = JSON.parse(ctx.webAppData.data.text()); } catch (e) { return ctx.reply("❌ Ma'lumot noto'g'ri."); }
  const { name, amount, product_id } = orderData;
  const userId = ctx.from.id;
  const { data: order, error } = await supabase.from("orders").insert({ user_id: userId, product_name: name, amount, product_id: product_id || null, status: "pending" }).select().single();
  if (error) return ctx.reply("❌ Buyurtma saqlashda xatolik.");
  await ctx.reply(`✅ Buyurtmangiz qabul qilindi!\n\n📦 ${name}\n💰 ${amount} UZS\n⏳ Ko'rib chiqilmoqda...`);
  await bot.telegram.sendMessage(ADMIN_ID,
    `🛒 *Yangi buyurtma!*\n\n👤 @${ctx.from.username || "nomsiz"} (ID: \`${userId}\`)\n📦 *${name}*\n💰 *${amount} UZS*`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[
      { text: "✅ Tasdiqlash", callback_data: `approve_${order.id}_${userId}` },
      { text: "❌ Bekor qilish", callback_data: `cancel_${order.id}_${userId}` },
    ]] } }
  );
});

app.post("/api/bot", (req, res) => { bot.handleUpdate(req.body, res); });
app.get("/api/bot", (req, res) => { res.json({ status: "Bot ishlayapti ✅" }); });

module.exports = app;
