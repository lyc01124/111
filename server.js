const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

const DATA_PATH = path.join(__dirname, 'data.json');
const TIME_PATH = path.join(__dirname, 'time.json');

function init() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify([]));
  if (!fs.existsSync(TIME_PATH)) fs.writeFileSync(TIME_PATH, JSON.stringify({}));
}
init();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.json());
app.use(express.static(__dirname));

function readData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function saveData(arr) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(arr, null, 2));
}
function readTime() {
  return JSON.parse(fs.readFileSync(TIME_PATH, 'utf8'));
}
function saveTime(obj) {
  fs.writeFileSync(TIME_PATH, JSON.stringify(obj, null, 2));
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
    Y: 30 * 24 * 60 * 60 * 1000
  };
  return num * map[unit];
}

// 根据时长生成前两位时间码
function getTimeCode(ms) {
  if (ms === 60 * 1000) return 'F0';
  if (ms === 60 * 60 * 1000) return 'S0';
  if (ms === 24 * 60 * 60 * 1000) return 'T0';
  if (ms === 30 * 24 * 60 * 60 * 1000) return 'Y0';
  return 'XX';
}

// 生成卡密 16~18位，前2位时间码
function genCode(durMs) {
  const timeCode = getTimeCode(durMs);
  const randLen = 14 + Math.floor(Math.random() * 3); // 14 /15 /16
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randStr = '';
  for(let i=0;i<randLen;i++){
    randStr += chars[Math.floor(Math.random() * chars.length)];
  }
  return timeCode + randStr;
}

// 生成卡密接口：只写入data.json，active=0，不进time.json
app.post('/gen', (req, res) => {
  const { prefix } = req.body;
  if (!prefix) return res.json({ ok: false, msg: "请输入时长表达式" });
  const durMs = parsePrefix(prefix);
  if (!durMs) return res.json({ ok: false, msg: "格式错误，示例：1F / 1S / 1T /1Y" });

  const all = readData();
  const code = genCode(durMs);
  const newItem = {
    id: all.length + 1,
    code,
    active: "0",
    activateAt: null,
    baseDuration: durMs
  };
  all.push(newItem);
  saveData(all);
  return res.json({ ok: true, code });
});

// 【插件激活接口】你插件里调用的：POST /api/activate-code
app.post('/api/activate-code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, msg: "缺少code" });
  const data = readData();
  const item = data.find(x => x.code === code);
  if (!item) return res.json({ ok: false, msg: "卡密不存在" });
  if (item.active === "1") return res.json({ ok: false, msg: "已激活" });

  const now = Date.now();
  const expireAt = now + item.baseDuration;
  item.active = "1";
  item.activateAt = now;
  saveData(data);

  const timeObj = readTime();
  timeObj[code] = expireAt;
  saveTime(timeObj);
  return res.json({ ok: true });
});

// 【网页手动激活接口】保留给前端页面使用
app.post('/activate', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, msg: "缺少code" });
  const data = readData();
  const item = data.find(x => x.code === code);
  if (!item) return res.json({ ok: false, msg: "卡密不存在" });
  if (item.active === "1") return res.json({ ok: false, msg: "已激活" });

  const now = Date.now();
  const expireAt = now + item.baseDuration;
  item.active = "1";
  item.activateAt = now;
  saveData(data);

  const timeObj = readTime();
  timeObj[code] = expireAt;
  saveTime(timeObj);
  return res.json({ ok: true });
});

// 加时接口
app.post('/addTime', (req, res) => {
  const { codeList, prefix } = req.body;
  if (!Array.isArray(codeList) || !prefix) return res.json({ ok: false, msg: "参数错误" });
  const addMs = parsePrefix(prefix);
  if (!addMs) return res.json({ ok: false, msg: "时长格式错误" });

  const data = readData();
  const timeObj = readTime();
  for(const code of codeList){
    const item = data.find(x=>x.code === code);
    if(!item) continue;
    // 如果正在计时，延长到期时间
    if(timeObj[code]){
      timeObj[code] += addMs;
    }
    item.baseDuration += addMs;
  }
  saveData(data);
  saveTime(timeObj);
  return res.json({ ok:true });
});

// 获取列表 + 自动校验清理规则
app.get('/list', (req, res) => {
  let data = readData();
  let timeObj = readTime();
  const now = Date.now();

  // 第一步：清理time里面已经到期的
  for(const c in timeObj){
    if(timeObj[c] <= now){
      delete timeObj[c];
    }
  }
  saveTime(timeObj);

  // 第二步：按规则清理data
  data = data.filter(item => {
    const hasInTime = !!timeObj[item.code];
    if(item.active === "1" && !hasInTime){
      return false;
    }
    return true;
  });
  // 重排id
  data = data.map((it, idx)=>({...it, id: idx+1}));
  saveData(data);

  // 组装返回数据，带上剩余时间
  const out = data.map(it=>{
    let remain = null;
    if(timeObj[it.code]){
      remain = timeObj[it.code] - now;
    }
    return {...it, remainMs: remain};
  })
  return res.json({ data: out });
});

// 格式化时间
app.get('/fmt/:ms', (req,res)=>{
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

// 删除单条
app.post('/api/delete-code', (req,res)=>{
  const {code} = req.body;
  if(!code) return res.json({ok:false,msg:"缺少code"});
  let data = readData().filter(it=>it.code!==code);
  data = data.map((it,idx)=>({...it,id:idx+1}));
  saveData(data);
  let timeObj = readTime();
  delete timeObj[code];
  saveTime(timeObj);
  return res.json({ok:true});
});

app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'));
});

app.listen(PORT,()=>{
  console.log("✅服务启动 port:",PORT);
})
