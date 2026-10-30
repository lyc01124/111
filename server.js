const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(__dirname));

app.post('/gen', (req,res)=>{
  res.json({ok:true,code:"TEST123456"});
})
app.get('/list', (req,res)=>{
  res.json({data:[]});
})
app.get('/fmt/:ms', (req,res)=>{
  res.send("10分");
})
app.post('/api/delete-code', (req,res)=>{
  res.json({ok:true});
})
app.get('/', (req,res)=>{
  res.sendFile(__dirname + '/index.html');
})

app.listen(PORT,()=>{
  console.log("✅测试服务启动成功 port:",PORT);
})
