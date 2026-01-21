import "dotenv/config";
import { makeApi } from "./api.js";
import { startBot } from "./bot.js";

const app = makeApi();
app.listen(process.env.PORT || 3000, () => console.log("API online"));

startBot({
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID
});
