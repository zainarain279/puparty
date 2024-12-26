const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, isTokenExpired, saveToken, loadData } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");

class ClientAPI {
  constructor(accountIndex, initData, session_name, baseURL, token) {
    this.tokenFile = "tokens.json";
    this.accountIndex = accountIndex;
    this.queryId = initData;
    this.headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      "Content-Type": "application/json",
      "sec-ch-ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
      version: "1.1.0",
      source: "ios",
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-site": "same-site",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "accept-language": "en-US,en;q=0.9",
      gameversion: "1.3.1",
      "access-control-allow-origin": "*",
      "company-code": "7",
      origin: "https://h5.puparty.com",
      referer: "https://h5.puparty.com/",
    };
    this.session_name = session_name;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    // this.wallets = this.loadWallets();
    this.baseURL = baseURL;
    this.token = token;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Create user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(url, method, data = {}, retries = 1) {
    const headers = {
      ...this.headers,
      token: this.token,
    };
    let currRetries = 0,
      success = false;
    do {
      currRetries++;
      try {
        const response = await axios({
          method,
          url,
          data,
          headers,
          timeout: 30000,
        });

        success = true;
        if ([200, 201, 304].includes(response.status) && response.data.code == 0) {
          return { success: true, data: response.data.data };
        } else if (response.data.code == 10001 && response.data.msg == "login expire") {
          this.log(`Token has expired! Getting new token...`);
          success = false;
          await this.getValidToken(true);
          if (currRetries == retries) return { success: false, data: response.data };
        } else return { success: false, data: response.data, error: response?.data?.msg };
      } catch (error) {
        this.log(`Request failed: ${url} | ${error.message} | trying again...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
    } while (currRetries < retries && !success);
  }

  async login() {
    const headers = {
      ...this.headers,
    };
    let currRetries = 0,
      success = false;
    const url = `${this.baseURL}/v1/member/login`;
    // console.log(headers);
    do {
      currRetries++;
      try {
        const response = await axios.post(
          url,
          {
            initData: this.queryId,
            pid: null,
            source: "ios",
            tgVersion: "8.0",
          },
          { headers }
        );
        success = true;
        return { success: true, data: response.data.data };
      } catch (error) {
        // console.log(error);
        this.log(`Request failed: ${url} | ${error.message} | trying again...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        return { success: false, error: error.message };
      }
    } while (currRetries < 2 && !success);
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/v1/member/info`, "post", {});
  }

  async chheckUserExist() {
    return this.makeRequest(`${this.baseURL}/v1/member/asset/pup/collect/exist`, "post", {});
  }

  async getSetting() {
    return this.makeRequest(`${this.baseURL}/v1/member/setting/get`, "post", {});
  }

  async getAds() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/ad/get`, "post", {});
  }

  async getFreeGold() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/gold/free`, "post", {});
  }

  async getAllCards() {
    return this.makeRequest(`${this.baseURL}/v1/game/card/getAll`, "post", {});
  }

  async getAllGroups() {
    return this.makeRequest(`${this.baseURL}/v1/game/card/group/getAll`, "post", {});
  }

  async getAllPets() {
    return this.makeRequest(`${this.baseURL}/v1/game/pet/query`, "post", {});
  }

  async getAllCurrentPets() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/index`, "post", {});
  }

  // async getConfig() {
  //   return this.makeRequest(`${this.baseURL}/v1/member/config`, "post", {});
  // }

  async getPets() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/produce`, "post");
  }

  async getTasks() {
    return this.makeRequest(`${this.baseURL}/v1/member/task/query`, "post", {});
  }

  async completeTask(code) {
    return this.makeRequest(`${this.baseURL}/v1/member/task/${code}`, "post", {});
  }

  async checkTask(code) {
    return this.makeRequest(`${this.baseURL}/v1/member/task/${code}/check`, "post", {});
  }

  async getPPTs(payload) {
    return this.makeRequest(`${this.baseURL}/v1/member/asset/collect/query`, "post", {
      pageNum: 1,
      pageSize: 48,
    });
  }

  async collectPPT(payload) {
    return this.makeRequest(`${this.baseURL}/v1/member/asset/collect/receive`, "post", payload);
  }

  async collectOffline(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/offline/gold/collect`, "post", payload);
  }

  async collectOnline(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/index`, "post", payload);
  }
  // {
  //   "currency": 1,
  //   "sign": "ZysSkjlAXoqAeK19dTGDwlGsN/kV8ZV2rV6iu8Yb138/4FV7NRErZ0JlAV7x07jm"
  // }

  async getShop() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/shop`, "post", {});
  }

  async mergePet(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/merge`, "post", payload);
  }

  async byPet(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/purchase`, "post", payload);
  }

  async getUserBalance() {
    return this.makeRequest(`${this.baseURL}/user/user-balance`, "get");
  }

  async getValidToken(isNew = false) {
    const userId = this.session_name;
    const existingToken = this.token;

    // && !isTokenExpired(existingToken)
    if (existingToken && !isNew) {
      this.log("Using valid token", "success");
      return existingToken;
    }
    this.log("Token not found or expired, logging in...", "warning");

    const loginResult = await this.login();
    // console.log(loginResult);
    const token = loginResult?.data?.token || loginResult?.data?.data?.token;
    if (loginResult.success && token) {
      saveToken(userId, token);
      this.token = token;
      return token;
    }

    throw new Error(`No valid token found: ${loginResult.error}`);
  }

  async handleMergePet(data) {
    this.log(`Starting buy and merge pet...`);
    let { pets, maxSlot, maxLevel } = data;

    const levelMap = {};

    const allMaxLevels = pets.every((item) => item.level === 7);
    if (allMaxLevels) {
      return this.log(`All pet max level: ${maxLevel}`, "warning");
    }

    // Đếm số lượng pets theo level
    pets
      .map((item, index) => ({ ...item, pos: index }))
      .forEach((pet) => {
        if (!levelMap[pet.level]) {
          levelMap[pet.level] = [];
        }
        levelMap[pet.level].push(pet);
      });

    const pairs = [];

    // Ghép các pets thành cặp
    for (const level in levelMap) {
      const group = levelMap[level];
      while (group.length > 1) {
        const first = group.pop();
        const second = group.pop();
        pairs.push([first.pos, second.pos]);
      }
    }

    if (pairs.length == 0) {
      this.log(`No pets avalible to merge`, "warning");
    }

    for (const pair of pairs) {
      await sleep(1);
      const resMerge = await this.mergePet({
        pos1: pair[0],
        pos2: pair[1],
      });
      if (resMerge.success) {
        this.log(
          `Merge pet successfully! | Max level pet now: ${resMerge.data.maxLevel} | Current pets: ${resMerge.data.pets.length} | Profit: ${resMerge.data.onlineGoldPerSecond}/second`,
          "success"
        );
        pets = resMerge.data.pets;
        data = resMerge.data;
      } else {
        this.log(`Merge pet failed!`, "warning");
      }
    }

    ///buy pet===============
    try {
      if (pets.length < maxSlot) {
        // const level = data.maxLevel - 1;
        // console.log(data);
        let { level, goldPrice } = data.quickPurchase;

        if (settings.AUTO_QUICK_BUY && goldPrice && +goldPrice > +data.gold) {
          return this.log(`No enough gold to buy!`, "warning");
        }
        let currentSlot = pets.length;
        if (!settings.AUTO_QUICK_BUY && settings.LEVEL_CUSTOM_BUY < data.maxLevel) {
          const resShop = await this.getShop();
          if (resShop.success) {
            const petCustomBuy = resShop.data.items.filter((item) => item.goldPrice != 0 && item.level == settings.LEVEL_CUSTOM_BUY);
            if (!petCustomBuy || petCustomBuy?.goldPrice > data.gold) {
              return this.log(`No enough gold to buy custom pet!`, "warning");
            }
          }
          level = settings.LEVEL_CUSTOM_BUY;
        }
        const payload = {
          currency: 1,
          level: level,
        };
        while (currentSlot <= maxSlot) {
          currentSlot++;
          await sleep(1);
          const resBuy = await this.byPet(payload);
          if (resBuy.success) {
            data = resBuy.data;
            this.log(`Buy pet level ${level} successfully! | Balance: ${resBuy.data.gold} | Profit: ${resBuy.data.onlineGoldPerSecond}/second`, "success");
          } else {
            this.log(`Buy pet level ${level} failed! | Balance: ${data.gold}`, "warning");
          }
        }
        if (data.maxLevel >= settings.MAX_LEVEL_PET) {
          return;
        } else {
          await this.handleMergePet(data);
        }
      }
    } catch (error) {
      this.log(`Error buy pet: ${error.message}`);
    }
    return pairs;
  }

  async handleTasks() {
    const resTasks = await this.getTasks();
    if (resTasks.success) {
      const tasks = resTasks.data.filter((t) => !settings.SKIP_TASKS.includes(t.code));
      if (tasks.length > 0) {
        for (const task of tasks) {
          await sleep(1);
          this.log(`Completting task ${task.code} | ${task.name}...`);
          let resCom = null;
          if (task.code == "signIn") {
            resCom = await this.completeTask(task.code);
            if (resCom.success) {
              this.log(`checkin successful`, "success");
            }
          } else if (task.code == "online") {
            await this.getAllCurrentPets();
          } else {
            resCom = await this.checkTask(task.code);
            if (resCom.success) {
              this.log(`Completed task ${task.code} | ${task.name} successfully!`, "success");
            } else {
              this.log(`Completed task ${task.code} | ${task.name} failed!`, "warning");
            }
          }
        }
      } else {
        this.log(`No tasks to complete!`, "warning");
      }
    }
  }
  async handleMinning() {
    const resPtt = await this.getPPTs();
    if (resPtt.success) {
      const ptts = resPtt.data.list.filter((t) => !t.received);
      if (ptts.length > 0) {
        for (const ptt of ptts) {
          await sleep(1);
          const resCollect = await this.collectPPT({ id: ptt.id });
          if (resCollect.success) {
            this.log(`Mining block ${ptt.id} successfully! | Reward: ${ptt.pup}`, "success");
          } else {
            this.log(`Mining block ${ptt.id} failed!`, "warning");
          }
        }
      } else {
        this.log(`No block to minning!`, "warning");
      }
    }
  }

  async handlePing() {
    const resgetPet = await this.getPets();
    if (resgetPet.success) {
      this.log(`Ping successful! | Balance:${resgetPet.data.gold} | Profit: ${resgetPet.data.onlineGoldPerSecond}/second`, "success");
    } else {
      this.log(`Ping failed!`, "warning");
    }
  }

  async handleAds() {
    const resAds = await this.getAds();
    if (resAds.success) {
      const { totalTimes, useTimes, videoRatio, coolDownTime, lastTime, goldIntimacy: freeClaim } = resAds.data;
      if (freeClaim) {
        const resFree = await this.getFreeGold();
        if (resFree.success) {
          this.log(`Claiming Free gold success!`, "success");
        }
      }
    } else {
      this.log(`handle Ads failed!`, "warning");
    }
  }

  async processAccount() {
    const token = await this.getValidToken();
    if (!token) {
      this.log("Login failed after. Skip account.", "error");
      return;
    }

    let infoData = null;
    let retries = 0;
    while (retries < 2) {
      retries++;
      infoData = await this.getUserInfo();
      if (infoData.success) {
        break;
      }
    }
    const petCurData = await this.getAllCurrentPets();

    if (infoData.success) {
      const { name, power } = infoData.data;
      const { gold, maxLevel } = petCurData.data;
      this.log(`Name: ${name} | Balance: ${gold} | Max Level Pet: ${maxLevel} | Power: ${power}`);

      // const inntervalID = setInterval(this.handlePing, 4000);
      await this.handlePing();

      await this.handleAds();

      if (settings.AUTO_TASK) {
        await this.handleTasks();
      }
      if (settings.AUTO_MINING) {
        await this.handleMinning();
      }
      if (settings.AUTO_BUY_AND_MERGE_PET) {
        await this.handleMergePet(petCurData.data);
      }

      if (settings.AUTO_ONLINE) {
        while (true) {
          await sleep(4);
          const resPing = await this.handlePing();
          if (!resPing) return;
          const { quickPurchase } = resPing;
          if (+resPing.gold > +quickPurchase.goldPrice && settings.AUTO_BUY_AND_MERGE_PET) {
            await this.handleMergePet(resPing);
          }
        }
      }
    } else {
      this.log("Can't get info user, try get new query_Id again...skippig", "error");
      return;
    }
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Wait ${Math.floor(i / 60)} minute ${i % 60} seconds to continue`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Start new loop...`);
}

async function main() {
  console.clear(); // Clears the terminal for a clean start
  console.log(`
░▀▀█░█▀█░▀█▀░█▀█
░▄▀░░█▀█░░█░░█░█
░▀▀▀░▀░▀░▀▀▀░▀░▀
╔══════════════════════════════════╗
║                                  ║
║  ZAIN ARAIN                      ║
║  AUTO SCRIPT MASTER              ║
║                                  ║
║  JOIN TELEGRAM CHANNEL NOW!      ║
║  https://t.me/AirdropScript6              ║
║  @AirdropScript6 - OFFICIAL      ║
║  CHANNEL                         ║
║                                  ║
║  FAST - RELIABLE - SECURE        ║
║  SCRIPTS EXPERT                  ║
║                                  ║
╚══════════════════════════════════╝
`);

  console.log(
    colors.yellow(
      "Tool developed by tele group Airdrop Hunter Super Speed (https://t.me/AirdropScript6)"
    )
  );

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`API ID not found, try again later!`.red);
  console.log(`${message}`.yellow);

  const data = loadData("data.txt");
  let tokens = {};

  try {
    tokens = require("./tokens.json");
  } catch (error) {
    tokens = {};
  }

  const maxThreads = settings.MAX_THEADS_NO_PROXY; // số luồng

  while (true) {
    for (let i = 0; i < data.length; i += maxThreads) {
      const batch = data.slice(i, i + maxThreads);

      const promises = batch.map(async (initData, indexInBatch) => {
        const accountIndex = i + indexInBatch;
        const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
        const firstName = userData.first_name || "";
        const lastName = userData.last_name || "";
        const session_name = userData.id;

        console.log(`=========Account ${accountIndex + 1}| ${firstName + " " + lastName}`.green);
        const client = new ClientAPI(accountIndex, initData, session_name, hasIDAPI, tokens[userData.id]);
        client.set_headers();

        return timeout(client.processAccount(), 60 * 60 * 1000).catch((err) => {
          client.log(`Account processing error: ${err.message}`, "error");
        });
      });
      await Promise.allSettled(promises);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    console.log(`Complete all accounts | Waiting ${settings.TIME_SLEEP} phút...`);
    await wait(settings.TIME_SLEEP * 60);
    // await sleep(settings.TIME_SLEEP * 60);
  }
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});