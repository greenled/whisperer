const { Telegraf } = require("telegraf");
const Telegram = require("telegraf/telegram");
const TelegrafInlineMenu = require("telegraf-inline-menu");
const events = require("./scraper/events");
const TuenvioScraper = require("./scraper/TuenvioScraper");
const express = require("express");

const PORT = process.env.PORT;
const URL = process.env.URL;
const token = process.env.BOT_TOKEN;
const baseUrl = process.env.BASE_URL;
const depPids = process.env.DEP_PIDS.split(",");
const include_terms = process.env.INCLUDE_TERMS.split(",");
const exclude_terms = process.env.EXCLUDE_TERMS.split(",");
const bot = new Telegraf(token);
const telegram = new Telegram(token);
const expressApp = express();
const chatIds = [];

expressApp.use(bot.webhookCallback(`/bot${token}`));
bot.telegram.setWebhook(`${URL}/bot${token}`);

bot.start((ctx) => {
  if (chatIds.indexOf(ctx.chat.id) == -1) {
    chatIds.push(ctx.chat.id);
  }
  ctx.reply("Hola");
  ctx.reply(
    `Te avisaré si hay algún producto en ${baseUrl} cuyo nombre contenga ${include_terms.join(
      ", "
    )}, excepto si también contiene ${exclude_terms.join(", ")}`
  );
});

bot.help((ctx) => {
  ctx.reply(
    "Soy un bot que te puede informar sobre la disponibilidad de determinados productos en el sitio Tuenvio"
  );
  ctx.reply("Cada 10 minutos reviso el sitio");
  ctx.reply("Puedes cambiar las preferencias con /config");
});

const menu = new TelegrafInlineMenu(
  `¿Te aviso si hay algún producto en ${baseUrl} cuyo nombre contenga ${include_terms.join(
    ", "
  )}, excepto si también contiene ${exclude_terms.join(", ")}?`
);
menu.setCommand("config");
menu.select("s", ["Sí", "No"], {
  setFunc: async (ctx, key) => {
    const index = chatIds.indexOf(ctx.chat.id);
    if (key === "Sí") {
      if (index == -1) {
        chatIds.push(ctx.chat.id);
      }
      await ctx.answerCbQuery("Te avisaré");
    } else {
      if (index > -1) {
        chatIds.splice(index, 1);
      }
      await ctx.answerCbQuery("No te avisaré");
    }
  },
  isSetFunc: (_ctx, key) =>
    (key === "Sí" && chatIds.indexOf(_ctx.chat.id) > -1) ||
    (key === "No" && chatIds.indexOf(_ctx.chat.id) == -1),
});
bot.use(menu.init());

setInterval(async () => {
  const options = {
    timeout: 30000,
  };

  const scraper = new TuenvioScraper(options);
  scraper.on(events.custom.data, ({ title, url, image, price }) => {
    if (
      include_terms.some(
        (term) => title.toLowerCase().indexOf(term.toLowerCase()) > -1
      ) &&
      exclude_terms.every(
        (term) => title.toLowerCase().indexOf(term.toLowerCase()) == -1
      )
    ) {
      for (const chatId of chatIds) {
        telegram.sendMessage(chatId, `${title} (${price}) ${url}`);
      }
    }
  });
  await scraper.run(baseUrl, depPids);
  await scraper.close();
}, 300000);

expressApp.get("/", (req, res) => {
  res.send("Hello World!");
});
expressApp.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
