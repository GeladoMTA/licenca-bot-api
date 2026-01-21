import "dotenv/config";
import { makeApi } from "./api.js";
import { startBot } from "./bot.js";

const app = makeApi();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("API online"));

startBot({
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID
});
