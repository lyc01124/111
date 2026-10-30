const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

const DATA_PATH = path.join(__dirname, 'data.json');
const TIME_PATH = path.join(__dirname, 'time.json');

// 初始化文件
function init() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify([]));
  if (!fs.existsSync(TIME_PATH)) fs.writeFileSync(TIME_PATH, JSON.stringify({}));
}
init();

const CACHE_TTL = 120 * 1000;
let cache = { list: { value: null, time: 0 } };

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

function readAll() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function saveAll(arr) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(arr));
  cache.list.value = arr;
  cache.list.time = Date.now();
}
function readTimeMap() {
  return JSON.parse(fs.readFileSync(TIME_PATH, 'utf8'));
}
function saveTimeMap(map) {
  fs.writeFileSync(TIME_PATH, JSON.stringify(map));
}

// 解析时长：S秒 F分 H小时 T天 Y年
function parsePrefix(prefix) {
  const m = prefix.match(/^(\d+)([SFHTY])$/i);
  if (!m) return null;
  const num = parseInt(m[1]);
  const unit = m[2].toUpperCase();
  const map = {
    S: 1000,
    F: 60 * 1000,
    H: 60 * 60 * 1000,
    T: 24 * 60 * 60 * 1000,
    Y: 365 * 24 * 60 * 60 * 1000
  };
  return num * map[unit];
}

// 生成卡密
app.post('/gen', (req, res) => {
  const { prefix } = req.body;
  if (!prefix) return res.json({ ok: false, msg: "请输入前缀" });
  const durMs = parsePrefix(prefix);
  if (!durMs) return res.json({ ok: false, msg: "格式错误，示例：1F" });

  const code = crypto.randomBytes(8).toString('hex').slice(0, 10).toUpperCase();
  const all = readAll();
  const id = all.length + 1;
  const now = Date.now();
  const expireAt = now + durMs;

  all.push({ id, code, active: '0', activateAt: null, expireAt });
  saveAll(all);
  const tm = readTimeMap();
  tm[code] = expireAt;
  saveTimeMap(tm);
  return res.json({ ok: true, code });
});

// 获取列表
app.get('/list', (req, res) => {
  const now = Date.now();
  if (cache.list.value && now - cache.list.time < CACHE_TTL) {
    return res.json({ data: cache.list.value });
  }
  const data = readAll();
  cache.list.value = data;
  cache.list.time = now;
  return res.json({ data });
});

// 格式化剩余时间
app.get('/fmt/:ms', (req, res) => {
  const remainMs = Number(req.params.ms);
  if (!remainMs || remainMs <= 0) return res.send("已过期");
  let t = remainMs;
  const d = Math.floor(t / (1000*60*60*24)); t -= d * (1000*60*60*24);
  const h = Math.floor(t / (1000*60*60)); t -= h * (1000*60*60);
  const m = Math.floor(t / (1000*60)); t -= m * (1000*60);
  const s = Math.floor(t / 1000);
  const arr = [];
  if(d>0) arr.push(`${d}天`);
  if(h>0) arr.push(`${h}时`);
  if(m>0) arr.push(`${m}分`);
  if(s>0) arr.push(`${s}秒`);
  res.send(arr.join(' '));
});

// 删除卡密（这里已经修复双点问题）
app.post('/api/delete-code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, msg: "缺少code" });
  let all = readAll().filter(it => it.code !== code);
  all = all.map((it, idx) => ({ ...it, id: idx + 1 }));
  saveAll(all);
  const tm = readTimeMap();
  delete tm[code];
  saveTimeMap(tm);
  return res.json({ ok: true });
});

// 激活接口 /activate
app.post('/activate', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, msg: "缺少code" });
  const all = readAll();
  const item = all.find(x => x.code === code);
  if (!item) return res.json({ ok: false, msg: "卡密不存在" });
  if (item.active === '1') return res.json({ ok: false, msg: "已经激活过了" });
  const now = Date.now();
  if (now > item.expireAt) return res.json({ ok: false, msg: "卡密已过期" });

  item.active = '1';
  item.activateAt = now;
  saveAll(all);
  return res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log("✅服务启动成功 port:", PORT);
});
