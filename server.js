const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;
// ========= 在这里替换成你自己的Pantry信息 =========
const PANTRY_ID = "94d02ec6-8f2f-47a6-8842-248a09d631e";
const PANTRY_SECRET = ""; // GetPantry不需要secret，留空
const BASE_URL = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}`;
// ==============================================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.json());
app.use(express.static(__dirname));
// 封装Pantry读取
async function pantryGet(basketName) {
  try {
    const url = `${BASE_URL}/basket/${basketName}`;
    const params = PANTRY_SECRET ? { secret: PANTRY_SECRET } : {};
    const resp = await axios.get(url, { params });
    return resp.data || {};
  } catch (e) {
    // basket不存在返回空对象
    return {};
  }
}
// 封装Pantry写入
async function pantryPut(basketName, payload) {
  const url = `${BASE_URL}/basket/${basketName}`;
  const params = PANTRY_SECRET ? { secret: PANTRY_SECRET } : {};
  await axios.put(url, payload, { params });
}
// 时长解析
function parsePrefix(prefix) {
  const m = prefix.match(/^(\d+)([SFHTY])$/i);
  if (!m) return null;
  const num = parseInt(m[1]);
  const unit = m[2].toUpperCase();
  const map = {
    S: 60 * 60 * 1000,
    F: 60 * 1000,
    H: 60 * 60 * 1000,
    T: 24 * 60 * 60 * 1000,
    Y: 30 * 24 * 60 * 1000
  };
  return num * map[unit];
}
// 时间码生成（修复：支持多倍时长）
function getTimeCode(unitStr) {
  // unitStr 是 F/S/H/T/Y，只取单位
  const map = {
    F: 'F0',
    S: 'S0',
    H: 'S0',
    T: 'T0',
    Y: 'Y0'
  };
  return map[unitStr] ?? 'XX';
}
// 生成卡密 16~18位
function genCode(durMs, unitChar) {
  const timeCode = getTimeCode(unitChar);
  const randLen = 14 + Math.floor(Math.random() * 3);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randStr = '';
  for (let i = 0; i < randLen; i++) {
    randStr += chars[Math.floor(Math.random() * chars.length)];
  }
  return timeCode + randStr;
}
// 【公共激活逻辑，两个激活接口复用】
async function activateCore(code) {
  const cards = await pantryGet("cards");
  const timers = await pantryGet("timers");
  if (!cards[code]) {
    return { ok: false, msg: "卡密不存在" };
  }
  const item = cards[code];
  if (item.active === "1") {
    return { ok: false, msg: "已激活" };
  }
  const now = Date.now();
  const expireAt = now + item.baseDuration;
  item.active = "1";
  item.activateAt = now;
  cards[code] = item;
  timers[code] = expireAt;
  await pantryPut("cards", cards);
  await pantryPut("timers", timers);
  return { ok: true };
}
// 生成卡密接口
app.post('/gen', async (req, res) => {
  const { prefix } = req.body;
  if (!prefix) return res.json({ ok: false, msg: "请输入时长表达式" });
  const match = prefix.match(/^(\d+)([SFHTY])$/i);
  if (!match) return res.json({ ok: false, msg: "格式错误，示例：1F / 2S" });
  const num = Number(match[1]);
  const unit = match[2].toUpperCase();
  const durMs = num * ({
    F: 60*1000, S:3600*1000, H:3600*1000, T:86400*1000, Y:2592000*1000
  }[unit]);
  const cards = await pantryGet("cards");
  let newCode;
  // 去重循环
  do {
    newCode = genCode(durMs, unit);
  } while (cards[newCode]);
  cards[newCode] = {
    id: Object.keys(cards).length + 1,
    code: newCode,
    active: "0",
    activateAt: null,
    baseDuration: durMs
  };
  await pantryPut("cards", cards);
  return res.json({ ok: true, code: newCode });
});
// 插件激活接口（你插件固定调用：/api/activate-code）
app.post('/api/activate-code', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, msg: "缺少code" });
  const ret = await activateCore(code);
  return res.json(ret);
});
// 网页端激活接口
app.post('/activate', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, msg: "缺少code" });
  const ret = await activateCore(code);
  return res.json(ret);
});
// 加时接口
app.post('/addTime', async (req, res) => {
  const { codeList, prefix } = req.body;
  if (!Array.isArray(codeList) || !prefix) return res.json({ ok: false, msg: "参数错误" });
  const addMs = parsePrefix(prefix);
  if (!addMs) return res.json({ ok: false, msg: "时长格式错误" });
  const cards = await pantryGet("cards");
  const timers = await pantryGet("timers");
  for (const code of codeList) {
    const item = cards[code];
    if (!item) continue;
    item.baseDuration += addMs;
    if (timers[code]) {
      timers[code] += addMs;
    }
    cards[code] = item;
  }
  await pantryPut("cards", cards);
  await pantryPut("timers", timers);
  return res.json({ ok: true });
});
// 获取列表 + 过期清理（Pantry没有TTL，依旧在这里清理过期）
app.get('/list', async (req, res) => {
  let cards = await pantryGet("cards");
  let timers = await pantryGet("timers");
  const now = Date.now();
  // 清理过期
  let changed = false;
  for (const c of Object.keys(timers)) {
    if (timers[c] <= now) {
      delete timers[c];
      if (cards[c]) delete cards[c];
      changed = true;
    }
  }
  if (changed) {
    await pantryPut("cards", cards);
    await pantryPut("timers", timers);
  }
  const out = Object.values(cards).map(it => {
    let remain = null;
    if (timers[it.code]) {
      remain = timers[it.code] - now;
    }
    return { ...it, remainMs: remain };
  });
  return res.json({ data: out });
});
// 时间格式化接口
app.get('/fmt/:ms', (req, res) => {
  const remainMs = Number(req.params.ms);
  if (!remainMs || remainMs <= 0) return res.send("已过期");
  let t = remainMs;
  const d = Math.floor(t / (1000*60*60*24)); t -= d * 86400000;
  const h = Math.floor(t / (1000*60*60)); t -= h * 3600000;
  const m = Math.floor(t / (1000*60)); t -= m * 60000;
  const s = Math.floor(t / 1000);
  const arr = [];
  if(d>0) arr.push(`${d}天`);
  if(h>0) arr.push(`${h}时`);
  if(m>0) arr.push(`${m}分`);
  if(s>0) arr.push(`${s}秒`);
  return res.send(arr.join(''));
});
// 删除单条卡密
app.post('/api/delete-code', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, msg: "缺少code" });
  const cards = await pantryGet("cards");
  const timers = await pantryGet("timers");
  delete cards[code];
  delete timers[code];
  await pantryPut("cards", cards);
  await pantryPut("timers", timers);
  return res.json({ ok:true });
});
app.get('/', (req,res)=>{
  res.sendFile(__dirname + "/index.html");
});
app.listen(PORT, () => {
  console.log(`服务启动，端口:${PORT}`);
});
