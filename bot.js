const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");
 
// =====================
// SOZLAMALAR
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ORDER_ADMIN_ID = "8460149040";
const PAYMENT_ADMIN_ID = "7246005666";
const SUPER_ADMIN_ID = "8460149040";
 
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://smm-market.vercel.app/";
const BOT_USERNAME = "SMM_MARKET_BOT";
 
const CARD_NUMBER = "5614682609131794 ";
const CARD_OWNER = "Allamuratov Dilshodbek ";
const CARD_BANK = "Uzcard";
const MIN_AMOUNT = 1000;
const REFERRAL_BONUS = 100;
 
// =====================
// INIT
// =====================
const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
app.use(express.json());
 
// =====================
// STATE — xotirada saqlanadi (Supabase yo'q)
// { userId: { state, amount } }
// =====================
const userStates = new Map();
 
function getState(userId) {
  return userStates.get(String(userId)) || { state: null, amount: null };
}
 
function setState(userId, state, amount = null) {
  userStates.set(String(userId), { state, amount });
  console.log(`[STATE] ${userId} => state=${state} amount=${amount}`);
}
 
function clearState(userId) {
  userStates.delete(String(userId));
}
 
// =====================
// HELPERS
// =====================
function isAdmin(id) {
  return [ORDER_ADMIN_ID, PAYMENT_ADMIN_ID].includes(String(id));
}
 
function isSuperAdmin(id) {
  return String(id) === String(SUPER_ADMIN_ID);
}
 
async function getBalance(telegram_id) {
  try {
    const { data } = await supabase
      .from("users").select("balance")
      .eq("telegram_id", telegram_id).single();
    return data?.balance || 0;
  } catch (e) {
    return 0;
  }
}
 
async function registerUser(user, referredBy = null) {
  try {
    const { data: existing } = await supabase
      .from("users").select("telegram_id")
      .eq("telegram_id", user.id).single();
 
    if (existing) return false;
 
    await supabase.from("users").insert({
      telegram_id: user.id,
      username: user.username || null,
      full_name: `${user.first_name} ${user.last_name || ""}`.trim(),
      balance: 0,
      referred_by: referredBy || null,
      referral_count: 0,
    });
 
    if (referredBy && referredBy !== user.id) {
      const refBalance = await getBalance(referredBy);
      const { data: refUser } = await supabase
        .from("users").select("referral_count")
        .eq("telegram_id", referredBy).single();
 
      await supabase.from("users").update({
        balance: refBalance + REFERRAL_BONUS,
        referral_count: (refUser?.referral_count || 0) + 1,
      }).eq("telegram_id", referredBy);
 
      try {
        await bot.telegram.sendMessage(
          referredBy,
          `🎁 Tabriklaymiz! Taklif qilgan foydalanuvchingiz qo'shildi!\n\n` +
          `💰 Hisobingizga +${REFERRAL_BONUS.toLocaleString()} UZS bonus qo'shildi!`
        );
      } catch (e) {}
    }
 
    return true;
  } catch (e) {
    console.error("registerUser error:", e.message);
    return false;
  }
}
 
async function getGuide() {
  try {
    const { data: vid } = await supabase.from("bot_settings").select("value").eq("key", "guide_video_id").single();
    const { data: cap } = await supabase.from("bot_settings").select("value").eq("key", "guide_caption").single();
    return { videoId: vid?.value || null, caption: cap?.value || null };
  } catch (e) {
    return { videoId: null, caption: null };
  }
}
 
function mainMenu(admin = false) {
  const buttons = [
    [Markup.button.webApp("🛍 Do'konni ochish", WEBAPP_URL)],
    ["💰 Hisobim", "➕ Hisob to'ldirish"],
    ["🔗 Referal", "📖 Qo'llanma"],
    ["📦 Buyurtmalarim"],
  ];
  if (admin) buttons.push(["⚙️ Admin panel"]);
  return Markup.keyboard(buttons).resize();
}
 
// =====================
// /start
// =====================
bot.start(async (ctx) => {
  const user = ctx.from;
  const startParam = ctx.startPayload;
  const referredBy = startParam && !isNaN(parseInt(startParam)) && parseInt(startParam) !== user.id
    ? parseInt(startParam) : null;
 
  const isNew = await registerUser(user, referredBy);
  clearState(user.id);
 
  await ctx.reply(
    isNew
      ? `👋 Assalomu alaykum, ${user.first_name}!\n\nSMM MARKET ga xush kelibsiz! 🎉${referredBy ? "\n\n🎁 Referal orqali keldingiz!" : ""}`
      : `👋 Xush kelibsiz, ${user.first_name}! 🛍`,
    mainMenu(isAdmin(user.id))
  );
});
 
// =====================
// HISOBIM
// =====================
bot.hears("💰 Hisobim", async (ctx) => {
  clearState(ctx.from.id);
  const balance = await getBalance(ctx.from.id);
  const { data: u } = await supabase.from("users")
    .select("referral_count").eq("telegram_id", ctx.from.id).single();
 
  await ctx.reply(
    `💰 Sizning hisobingiz:\n\n` +
    `👤 Ism: ${ctx.from.first_name}\n` +
    `🆔 ID: ${ctx.from.id}\n` +
    `💵 Balans: ${balance.toLocaleString()} UZS\n` +
    `👥 Taklif qilganlar: ${u?.referral_count || 0} kishi`
  );
});
 
// =====================
// REFERAL
// =====================
bot.hears("🔗 Referal", async (ctx) => {
  clearState(ctx.from.id);
  const userId = ctx.from.id;
  const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;
  const { data: u } = await supabase.from("users")
    .select("referral_count").eq("telegram_id", userId).single();
 
  await ctx.reply(
    `🔗 Referal havolangiz:\n${link}\n\n` +
    `🎁 Har bir taklif uchun ${REFERRAL_BONUS.toLocaleString()} UZS olasiz!\n\n` +
    `📊 Statistika:\n` +
    `👥 Taklif qilganlar: ${u?.referral_count || 0} kishi\n` +
    `💰 Jami bonus: ${((u?.referral_count || 0) * REFERRAL_BONUS).toLocaleString()} UZS`
  );
});
 
// =====================
// QO'LLANMA
// =====================
bot.hears("📖 Qo'llanma", async (ctx) => {
  clearState(ctx.from.id);
  const { videoId, caption } = await getGuide();
 
  if (!videoId) {
    return ctx.reply("📖 Qo'llanma hali yuklanmagan. Tez orada qo'shiladi!");
  }
 
  try {
    await ctx.replyWithVideo(videoId, { caption: caption || "📖 Bot qo'llanmasi" });
  } catch (e) {
    await ctx.reply("❌ Video yuklanmadi. Qayta urinib ko'ring.");
  }
});
 
// =====================
// BUYURTMALARIM
// =====================
bot.hears("📦 Buyurtmalarim", async (ctx) => {
  clearState(ctx.from.id);
  const { data: orders } = await supabase
    .from("orders").select("*").eq("user_id", ctx.from.id)
    .order("created_at", { ascending: false }).limit(5);
 
  if (!orders?.length) return ctx.reply("📦 Sizda hali buyurtma yo'q.");
 
  let text = "📦 Sizning buyurtmalaringiz:\n\n";
  orders.forEach((o, i) => {
    const s = o.status === "completed" ? "✅ Bajarildi" : o.status === "cancelled" ? "❌ Bekor" : "⏳ Kutilmoqda";
    text += `${i + 1}. ${o.product_name}\n   💰 ${(o.amount || 0).toLocaleString()} UZS — ${s}\n\n`;
  });
  await ctx.reply(text);
});
 
// =====================
// HISOB TO'LDIRISH — 1-QADAM
// =====================
bot.hears("➕ Hisob to'ldirish", async (ctx) => {
  clearState(ctx.from.id);
  await ctx.reply(
    `➕ Hisob to'ldirish\n\n` +
    `Quyidagi kartaga to'lov qiling:\n\n` +
    `🏦 Bank: ${CARD_BANK}\n` +
    `💳 Karta: ${CARD_NUMBER}\n` +
    `👤 Egasi: ${CARD_OWNER}\n\n` +
    `To'lov qilib bo'lgach tugmani bosing 👇`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ To'lov qildim", "payment_done")],
      [Markup.button.callback("❌ Bekor qilish", "cancel_payment")],
    ])
  );
});
 
// =====================
// 2-QADAM: SUMMA SO'RASH
// =====================
bot.action("payment_done", async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch (e) {}
 
  setState(ctx.from.id, "waiting_amount");
 
  await ctx.reply(
    `💵 Qancha to'lov qildingiz?\n\n` +
    `Minimal: ${MIN_AMOUNT.toLocaleString()} UZS\n\n` +
    `Summani kiriting (masalan: 50000):`
  );
});
 
bot.action("cancel_payment", async (ctx) => {
  await ctx.answerCbQuery();
  clearState(ctx.from.id);
  try { await ctx.deleteMessage(); } catch (e) {}
  await ctx.reply("❌ Bekor qilindi.", mainMenu(isAdmin(ctx.from.id)));
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
    const buttons = [
      [Markup.button.callback("👥 Foydalanuvchilar", "admin_users")],
      [Markup.button.callback("📦 Buyurtmalar", "admin_orders")],
      [Markup.button.callback("💳 To'lov so'rovlari", "admin_payments")],
      [Markup.button.callback("📊 Statistika", "admin_stats")],
    ];
    if (isSuperAdmin(userId)) {
      buttons.push([Markup.button.callback("📹 Qo'llanma video yuklash", "admin_upload_guide")]);
    }
    return ctx.reply("⚙️ Admin Panel", Markup.inlineKeyboard(buttons));
  }
 
  const { state, amount } = getState(userId);
  console.log(`[TEXT] userId=${userId} state=${state} text="${text}"`);
 
  // =====================
  // 2-QADAM: SUMMA QABUL
  // =====================
  if (state === "waiting_amount") {
    const cleaned = text.replace(/[\s,\.]/g, "");
    const parsed = parseInt(cleaned);
 
    if (isNaN(parsed) || parsed < MIN_AMOUNT) {
      return ctx.reply(
        `❌ Noto'g'ri summa!\n\nMinimal: ${MIN_AMOUNT.toLocaleString()} UZS\n\nQayta kiriting:`
      );
    }
 
    // 3-qadam: chek kutish
    setState(userId, "waiting_check", parsed);
 
    return ctx.reply(
      `✅ Summa: ${parsed.toLocaleString()} UZS\n\n` +
      `📸 Endi to'lov chekini yuboring (rasm yoki screenshot):`
    );
  }
 
  // Qo'llanma caption
  if (state === "waiting_guide_caption") {
    const pendingVideoId = getState(userId).amount; // amount o'rniga video id saqlangan
    // Alohida map ishlatamiz guide uchun
    const videoId = guideTemp.get(String(userId));
    if (!videoId) {
      clearState(userId);
      return ctx.reply("❌ Xatolik. Qaytadan video yuboring.");
    }
    await supabase.from("bot_settings").upsert({ key: "guide_video_id", value: videoId }, { onConflict: "key" });
    await supabase.from("bot_settings").upsert({ key: "guide_caption", value: text }, { onConflict: "key" });
    clearState(userId);
    guideTemp.delete(String(userId));
    return ctx.reply("✅ Qo'llanma muvaffaqiyatli saqlandi!", mainMenu(isAdmin(userId)));
  }
});
 
// Guide video ID ni vaqtincha saqlash uchun
const guideTemp = new Map();
 
// =====================
// VIDEO HANDLER
// =====================
bot.on("video", async (ctx) => {
  const userId = ctx.from.id;
  const { state } = getState(userId);
 
  if (state === "waiting_guide_video" && isSuperAdmin(userId)) {
    const fileId = ctx.message.video.file_id;
    guideTemp.set(String(userId), fileId);
    setState(userId, "waiting_guide_caption");
    return ctx.reply("✅ Video qabul qilindi!\n\nEndi video sarlavhasini yuboring:");
  }
});
 
// =====================
// CHEK HANDLER — 3-QADAM
// =====================
bot.on(["photo", "document"], async (ctx) => {
  const userId = ctx.from.id;
  const { state, amount } = getState(userId);
 
  console.log(`[PHOTO/DOC] userId=${userId} state=${state} amount=${amount}`);
 
  if (state !== "waiting_check") return;
 
  if (!amount) {
    clearState(userId);
    return ctx.reply("❌ Xatolik. Qaytadan hisob to'ldirish tugmasini bosing.");
  }
 
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
    console.error("Payment insert error:", error.message);
    return ctx.reply("❌ Xatolik yuz berdi. Qayta urinib ko'ring.");
  }
 
  clearState(userId);
 
  // Foydalanuvchiga
  await ctx.reply(
    `✅ To'lovingiz qabul qilindi!\n\n` +
    `💵 Summa: ${amount.toLocaleString()} UZS\n\n` +
    `⏳ To'lovingiz ko'rib chiqilmoqda.\nTez orada hisobingizga qo'shiladi! 🙏`,
    mainMenu(isAdmin(userId))
  );
 
  // Adminga
  const captionText =
    `💳 Yangi to'lov so'rovi!\n\n` +
    `👤 Ism: ${user.first_name} ${user.last_name || ""}\n` +
    `📛 Username: ${user.username ? "@" + user.username : "yo'q"}\n` +
    `🆔 User ID: ${userId}\n` +
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
      await bot.telegram.sendPhoto(PAYMENT_ADMIN_ID, photo.file_id, { caption: captionText, reply_markup: keyboard });
    } else {
      await bot.telegram.sendDocument(PAYMENT_ADMIN_ID, ctx.message.document.file_id, { caption: captionText, reply_markup: keyboard });
    }
  } catch (e) {
    console.error("Admin ga xabar xatosi:", e.message);
  }
});
 
// =====================
// TO'LOV TASDIQLASH
// =====================
bot.action(/^pay_ok_(.+)_(\d+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery("✅ Tasdiqlandi!");
 
  const reqId = ctx.match[1];
  const userId = parseInt(ctx.match[2]);
  const amount = parseInt(ctx.match[3]);
 
  const newBalance = (await getBalance(userId)) + amount;
  await supabase.from("users").update({ balance: newBalance }).eq("telegram_id", userId);
  await supabase.from("payment_requests").update({ status: "approved" }).eq("id", reqId);
 
  try {
    const msg = ctx.callbackQuery.message;
    const oldText = msg.caption || msg.text || "";
    if (msg.caption !== undefined) {
      await ctx.editMessageCaption(oldText + `\n\n✅ TASDIQLANDI\n+${amount.toLocaleString()} UZS`);
    } else {
      await ctx.editMessageText(oldText + `\n\n✅ TASDIQLANDI\n+${amount.toLocaleString()} UZS`);
    }
  } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `✅ To'lovingiz tasdiqlandi!\n\n` +
    `💵 +${amount.toLocaleString()} UZS qo'shildi.\n` +
    `💰 Joriy balans: ${newBalance.toLocaleString()} UZS\n\nRahmat! 🙏`
  );
});
 
// =====================
// TO'LOV RAD ETISH
// =====================
bot.action(/^pay_no_(.+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery("❌ Rad etildi!");
 
  const reqId = ctx.match[1];
  const userId = parseInt(ctx.match[2]);
 
  await supabase.from("payment_requests").update({ status: "rejected" }).eq("id", reqId);
 
  try {
    const msg = ctx.callbackQuery.message;
    const oldText = msg.caption || msg.text || "";
    if (msg.caption !== undefined) {
      await ctx.editMessageCaption(oldText + "\n\n❌ RAD ETILDI");
    } else {
      await ctx.editMessageText(oldText + "\n\n❌ RAD ETILDI");
    }
  } catch (e) {}
 
  await bot.telegram.sendMessage(
    userId,
    `❌ To'lovingiz rad etildi.\n\nQayta urinib ko'ring yoki admin bilan bog'laning.`
  );
});
 
// =====================
// ADMIN: QO'LLANMA VIDEO
// =====================
bot.action("admin_upload_guide", async (ctx) => {
  if (!isSuperAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery();
  setState(ctx.from.id, "waiting_guide_video");
  await ctx.reply("📹 Iltimos, qo'llanma videoni yuboring:");
});
 
// =====================
// ADMIN PANEL
// =====================
bot.action("admin_users", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery();
  const { data: users, count } = await supabase.from("users")
    .select("*", { count: "exact" }).order("created_at", { ascending: false }).limit(10);
  let text = `👥 Foydalanuvchilar (jami: ${count})\n\n`;
  users?.forEach((u, i) => {
    text += `${i + 1}. ${u.full_name || "Nomsiz"} ${u.username ? "@" + u.username : ""}\n`;
    text += `   💰 ${(u.balance || 0).toLocaleString()} UZS | 👥 ${u.referral_count || 0} | ID: ${u.telegram_id}\n\n`;
  });
  await ctx.reply(text);
});
 
bot.action("admin_orders", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery();
  const { data: orders } = await supabase.from("orders")
    .select("*").order("created_at", { ascending: false }).limit(10);
  let text = `📦 So'nggi buyurtmalar\n\n`;
  if (!orders?.length) { text += "Hozircha buyurtma yo'q."; }
  else {
    orders.forEach((o, i) => {
      const s = o.status === "completed" ? "✅" : o.status === "cancelled" ? "❌" : "⏳";
      text += `${i + 1}. ${s} ${o.product_name}\n   💰 ${(o.amount || 0).toLocaleString()} UZS | ID: ${o.user_id}\n\n`;
    });
  }
  await ctx.reply(text);
});
 
bot.action("admin_payments", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery();
  const { data: payments } = await supabase.from("payment_requests")
    .select("*").order("created_at", { ascending: false }).limit(10);
  let text = `💳 So'nggi to'lov so'rovlari\n\n`;
  if (!payments?.length) { text += "Hozircha so'rov yo'q."; }
  else {
    payments.forEach((p, i) => {
      const s = p.status === "approved" ? "✅" : p.status === "rejected" ? "❌" : "⏳";
      text += `${i + 1}. ${s} ${p.full_name || "Nomsiz"}\n   💵 ${(p.amount || 0).toLocaleString()} UZS | ID: ${p.user_id}\n\n`;
    });
  }
  await ctx.reply(text);
});
 
bot.action("admin_stats", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery();
  const { count: userCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: orderCount } = await supabase.from("orders").select("*", { count: "exact", head: true });
  const { count: pendingCount } = await supabase.from("payment_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
  const { data: approved } = await supabase.from("payment_requests").select("amount").eq("status", "approved");
  const totalDeposit = approved?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
  await ctx.reply(
    `📊 Statistika\n\n` +
    `👥 Foydalanuvchilar: ${userCount}\n` +
    `📦 Buyurtmalar: ${orderCount}\n` +
    `💰 Jami to'lovlar: ${totalDeposit.toLocaleString()} UZS\n` +
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
 
  const { orderId, items, totalPrice, contact } = orderData;
  const userId = ctx.from.id;
  const user = ctx.from;
 
  const currentBalance = await getBalance(userId);
  if (currentBalance < totalPrice) {
    return ctx.reply(
      `❌ Balans yetarli emas!\n\n` +
      `💰 Balansingiz: ${currentBalance.toLocaleString()} UZS\n` +
      `🛒 Buyurtma narxi: ${totalPrice.toLocaleString()} UZS\n\n` +
      `➕ Hisobingizni to'ldiring va qayta urinib ko'ring.`
    );
  }
 
  const newBalance = currentBalance - totalPrice;
  await supabase.from("users").update({ balance: newBalance }).eq("telegram_id", userId);
 
  const productNames = items?.map(i => `${i.product} (${i.variant})`).join(", ") || "Noma'lum";
 
  const { data: order, error } = await supabase.from("orders")
    .insert({ user_id: userId, product_name: productNames, amount: totalPrice, product_id: orderId || null, status: "pending" })
    .select().single();
 
  if (error) {
    await supabase.from("users").update({ balance: currentBalance }).eq("telegram_id", userId);
    return ctx.reply("❌ Xatolik. Pulingiz qaytarildi.");
  }
 
  await ctx.reply(
    `✅ Buyurtmangiz qabul qilindi!\n\n` +
    `📦 ${productNames}\n` +
    `💰 To'landi: ${totalPrice.toLocaleString()} UZS\n` +
    `💵 Qolgan balans: ${newBalance.toLocaleString()} UZS\n` +
    `⏳ Admin tez orada bajaradi!`
  );
 
  let adminText =
    `🛒 Yangi buyurtma!\n\n` +
    `👤 ${user.first_name} ${user.last_name || ""}\n` +
    `📛 ${user.username ? "@" + user.username : "username yo'q"}\n` +
    `🆔 ID: ${userId}\n` +
    `💰 Jami: ${totalPrice.toLocaleString()} UZS\n`;
  if (contact) adminText += `📞 Aloqa: ${contact}\n`;
  adminText += `\n📦 Mahsulotlar:\n`;
  items?.forEach((item, i) => {
    adminText += `${i + 1}. ${item.product} — ${item.variant}\n`;
    if (item.userInput) adminText += `   📝 ${item.userInput}\n`;
  });
 
  await bot.telegram.sendMessage(ORDER_ADMIN_ID, adminText, {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Bajarildi", callback_data: `order_ok_${order.id}_${userId}_${totalPrice}` },
        { text: "❌ Bekor qilish", callback_data: `order_no_${order.id}_${userId}_${totalPrice}` },
      ]],
    },
  });
});
 
// =====================
// BUYURTMA TASDIQLASH
// =====================
bot.action(/^order_ok_(.+)_(\d+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery("✅ Bajarildi!");
  const [, orderId, userId] = ctx.match;
  await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ BAJARILDI"); } catch (e) {}
  await bot.telegram.sendMessage(userId, `✅ Buyurtmangiz bajarildi! Rahmat! 🙏`);
});
 
// =====================
// BUYURTMA BEKOR
// =====================
bot.action(/^order_no_(.+)_(\d+)_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  await ctx.answerCbQuery("❌ Bekor!");
  const [, orderId, userId, amount] = ctx.match;
  const uid = parseInt(userId);
  const refund = parseInt(amount);
 
  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
  const restored = (await getBalance(uid)) + refund;
  await supabase.from("users").update({ balance: restored }).eq("telegram_id", uid);
 
  try { await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ BEKOR QILINDI"); } catch (e) {}
  await bot.telegram.sendMessage(uid,
    `❌ Buyurtmangiz bajarilmadi.\n\n` +
    `💰 ${refund.toLocaleString()} UZS hisobingizga qaytarildi.\n` +
    `💵 Joriy balans: ${restored.toLocaleString()} UZS`
  );
});
 
// =====================
// SERVER
// =====================
app.get("/", (req, res) => res.json({ status: "Bot ishlayapti ✅" }));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portda ishlamoqda`));
 
bot.launch({ dropPendingUpdates: true });
console.log("✅ Bot ishga tushdi!");
 
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
