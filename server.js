
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 40;
const QUESTION_FILE = path.join(__dirname, "questions.json");

app.use(express.static(__dirname));
app.use(express.json({ limit: "12mb" }));

let questions = loadQuestions();
const rooms = new Map();

function loadQuestions() {
  try { return JSON.parse(fs.readFileSync(QUESTION_FILE, "utf8")); }
  catch { return []; }
}
function saveQuestions() {
  fs.writeFileSync(QUESTION_FILE, JSON.stringify(questions, null, 2), "utf8");
}
function roomCode() {
  let code;
  do code = String(Math.floor(100000 + Math.random() * 900000));
  while (rooms.has(code));
  return code;
}
function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id:p.id, name:p.name, score:p.score, answered:p.answered
  }));
}
function ranking(room) {
  return publicPlayers(room).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
}
function state(room) {
  return {
    code:room.code, status:room.status, index:room.index,
    total:questions.length, players:publicPlayers(room), ranking:ranking(room)
  };
}
function finishQuestion(room) {
  if (room.status !== "question") return;
  if (room.timer) clearTimeout(room.timer);
  room.status = "result";
  const q = questions[room.index];
  const counts = q.choices.map((_,i)=>[...room.players.values()].filter(p=>p.answer===i).length);
  io.to(room.code).emit("questionResult", {
    correct:q.correct, counts, ranking:ranking(room).slice(0,10)
  });
}

app.get("/api/questions", (_,res)=>res.json(questions));
app.post("/api/questions", (req,res)=>{
  const q = req.body || {};
  if (!q.text || !Array.isArray(q.choices)) return res.status(400).json({error:"문제와 선택지가 필요합니다."});
  const choices = q.choices.map(x=>String(x||"").trim()).filter(Boolean).slice(0,4);
  if (choices.length < 2) return res.status(400).json({error:"선택지를 2개 이상 입력하세요."});
  const item = {
    text:String(q.text).trim().slice(0,500),
    choices,
    correct:q.correct === null ? null : Number(q.correct),
    seconds:Math.min(120, Math.max(5, Number(q.seconds)||15)),
    image:String(q.image||"").slice(0, 10_000_000)
  };
  if (item.correct !== null && (item.correct < 0 || item.correct >= choices.length)) {
    return res.status(400).json({error:"정답 선택을 확인하세요."});
  }
  questions.push(item); saveQuestions();
  res.json({ok:true, index:questions.length-1, question:item});
});
app.put("/api/questions/:index", (req,res)=>{
  const i = Number(req.params.index);
  if (!Number.isInteger(i) || !questions[i]) return res.status(404).json({error:"문제를 찾을 수 없습니다."});
  const q = req.body || {};
  const choices = (q.choices||[]).map(x=>String(x||"").trim()).filter(Boolean).slice(0,4);
  if (!q.text || choices.length < 2) return res.status(400).json({error:"문제와 선택지를 2개 이상 입력하세요."});
  questions[i] = {
    text:String(q.text).trim().slice(0,500),
    choices,
    correct:q.correct === null ? null : Number(q.correct),
    seconds:Math.min(120, Math.max(5, Number(q.seconds)||15)),
    image:String(q.image||"").slice(0, 10_000_000)
  };
  saveQuestions(); res.json({ok:true});
});
app.delete("/api/questions/:index", (req,res)=>{
  const i = Number(req.params.index);
  if (!Number.isInteger(i) || !questions[i]) return res.status(404).json({error:"문제를 찾을 수 없습니다."});
  questions.splice(i,1); saveQuestions(); res.json({ok:true});
});
app.get("/api/qr/:code", async (req,res)=>{
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const url = `${base}/play.html?room=${encodeURIComponent(req.params.code)}`;
  try {
    const png = await QRCode.toBuffer(url, {width:440, margin:2});
    res.type("png").send(png);
  } catch { res.status(500).send("QR 생성 실패"); }
});

io.on("connection", socket=>{
  socket.on("host:create", (_,ack)=>{
    if (!questions.length) return ack({ok:false,error:"먼저 문제를 1개 이상 만들어 주세요."});
    const code = roomCode();
    const room = {code, hostId:socket.id, players:new Map(), status:"lobby", index:-1, timer:null, startedAt:0};
    rooms.set(code,room); socket.join(code);
    ack({ok:true,code,state:state(room)});
  });

  socket.on("player:join", ({code,name,token},ack)=>{
    const room = rooms.get(String(code));
    if (!room) return ack({ok:false,error:"존재하지 않는 방입니다."});
    name=String(name||"").trim().slice(0,16);
    if (!name) return ack({ok:false,error:"닉네임을 입력하세요."});
    let player=token?[...room.players.values()].find(p=>p.token===token):null;
    if (!player) {
      if (room.players.size>=MAX_PLAYERS) return ack({ok:false,error:"40명 정원이 찼습니다."});
      if ([...room.players.values()].some(p=>p.name===name)) return ack({ok:false,error:"이미 사용 중인 닉네임입니다."});
      player={id:socket.id,token:token||crypto.randomUUID(),name,score:0,answered:false,answer:null};
      room.players.set(socket.id,player);
    } else {
      room.players.delete(player.id); player.id=socket.id; room.players.set(socket.id,player);
    }
    socket.join(room.code);
    io.to(room.hostId).emit("room:update",state(room));
    ack({ok:true,token:player.token,state:state(room)});
  });

  socket.on("host:startNext",({code},ack=()=>{})=>{
    const room=rooms.get(String(code));
    if (!room || room.hostId!==socket.id) return ack({ok:false});
    if (room.index+1>=questions.length) {
      room.status="finished"; io.to(code).emit("gameFinished",{ranking:ranking(room)});
      return ack({ok:true,finished:true});
    }
    room.index++; room.status="question"; room.startedAt=Date.now();
    for (const p of room.players.values()) {p.answered=false;p.answer=null;}
    const q=questions[room.index];
    io.to(code).emit("question",{
      index:room.index,total:questions.length,text:q.text,choices:q.choices,
      seconds:q.seconds||15,image:q.image||""
    });
    room.timer=setTimeout(()=>finishQuestion(room),(q.seconds||15)*1000);
    ack({ok:true});
  });

  socket.on("player:answer",({code,answer,token},ack=()=>{})=>{
    const room=rooms.get(String(code));
    const p=room?[...room.players.values()].find(x=>x.token===token):null;
    if (!room||!p||room.status!=="question"||p.answered) return ack({ok:false});
    const q=questions[room.index];
    const elapsed=Math.max(0,Date.now()-room.startedAt);
    const limit=(q.seconds||15)*1000;
    p.answered=true; p.answer=Number(answer);
    let gained=0;
    if (q.correct!==null && Number(answer)===q.correct) {
      gained=500+Math.round(500*Math.max(0,1-elapsed/limit));
      p.score+=gained;
    }
    ack({ok:true,gained});
    io.to(room.hostId).emit("room:update",state(room));
    if (room.players.size && [...room.players.values()].every(x=>x.answered)) finishQuestion(room);
  });

  socket.on("host:finish",({code})=>{
    const room=rooms.get(String(code));
    if (!room||room.hostId!==socket.id) return;
    if(room.timer)clearTimeout(room.timer);
    room.status="finished"; io.to(code).emit("gameFinished",{ranking:ranking(room)});
  });

  socket.on("disconnect",()=>{
    for(const room of rooms.values()){
      if(room.hostId===socket.id){
        io.to(room.code).emit("hostDisconnected");
        if(room.timer)clearTimeout(room.timer);
        rooms.delete(room.code); break;
      }
    }
  });
});

server.listen(PORT,()=>console.log(`Berry Quiz Live V2: http://localhost:${PORT}`));
