const Stage = require("telegraf/stage");
const WizardScene = require("telegraf/scenes/wizard");
const Preferences = require("./models/Preferences");

const alertCreationWizard = new WizardScene(
  "create_alert",
  (ctx) => {
    ctx.reply("¿Sobre qué debo alertarte?");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
    if (ctx.message.text.length == 0) {
      ctx.reply(`Debes introducir al menos una letra`);
      return ctx.scene.leave();
    } else if (
      preferences.alerts.some((alert) => alert.term === ctx.message.text)
    ) {
      ctx.reply(`Ya has agregado una alerta para "${ctx.message.text}"`);
      return ctx.scene.leave();
    }
    ctx.wizard.state.term = ctx.message.text;
    ctx.reply("¿Excepciones? (separadas por coma)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const exceptions = ctx.message.text
      .split(",")
      .map((exception) => exception.trim());
    try {
      const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
      preferences.alerts.push({
        term: ctx.wizard.state.term,
        exceptions: exceptions,
      });
      preferences.save();
    } catch (err) {
      console.log(err.stack);
    }
    ctx.replyWithMarkdown(
      `Te notificaré cuando un nombre de producto contenga:\n
*${ctx.wizard.state.term}*\n
excepto si también contiene:\n
${exceptions.map((exception) => `- _${exception}_`).join("\n")}`
    );
    return ctx.scene.leave();
  }
);
const stage = new Stage([alertCreationWizard]);

module.exports = [stage];
