const { log } = require("./utils"); // Adjust the path as necessary
const settings = require("./config/config");

const apiData = {
  clayton: "https://tonclayton.fun/api/aT83M535-617h-5deb-a17b-6a335a67ffd5",
  pineye: "https://api2.pineye.io/api",
  memex: "https://memex-preorder.memecore.com",
  pocketfi: "https://bot.pocketfi.org",
  kat: "https://apiii.katknight.io/api",
  pinai: "https://prod-api.pinai.tech",
  hivera: "https://app.hivera.org",
  midas: "https://api-tg-app.midas.app/api",
  animix: "https://pro-api.animix.tech",
  puparty: "https://tg-puparty-h5-api.puparty.com/api",
  copyright:
    "If the api changes please contact the Airdrop Hunter Super Speed tele team (https://t.me/AirdropScript6) for more information and updates! | Have any issuess, please contact: https://t.me/AirdropScript6",
};

async function checkBaseUrl() {
  console.log("Checking api...".blue);
  if (settings.ADVANCED_ANTI_DETECTION) {
    // Directly return the data from apiData
    const result = apiData.puparty ? { endpoint: apiData.puparty, message: apiData.copyright } : null;
    if (result) {
      log("No change in api!", "success");
      return result;
    }
  } else {
    return {
      endpoint: apiData.puparty,
      message: apiData.copyright,
    };
  }
}

module.exports = { checkBaseUrl };