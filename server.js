const express=require('express');
const http=require('http');
const path=require('path');
const QRCode=require('qrcode');
const {Server}=require('socket.io');
const {createClient}=require('@supabase/supabase-js');

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});
const PORT=Number(process.env.PORT||3000);
const MAX_PLAYERS=40;
const IMAGE_BUCKET=process.env.SUPABASE_IMAGE_BUCKET||'question-images';
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

app.use(express.static(path.join(__dirname,'public')));
app.use(express.json({limit:'12mb'}));
let questions=[];
const rooms=new Map();

async function refreshQuestions(){
  const {data,error}=await supabase.from('questions').select('*').order('sort_order',{ascending:true}).order('id',{ascending:true});
  if(error) throw error;
  questions=(data||[]).map(q=>({id:q.id,text:q.text,choices:q.choices,correct:q.correct,seconds:q.seconds,image:q.image_url||'',sort_order:q.sort_order}));
  return questions;
}
function normalize(body){
  const text=String(body.text||'').trim().slice(0,500);
  const choices=(body.choices||[]).map(v=>String(v||'').trim()).filter(Boolean).slice(0,4);
  if(!text) throw new Error('문제를 입력하세요.');
  if(choices.length<2) throw new Error('선택지를 2개 이상 입력하세요.');
  const correct=body.correct===null||body.correct==='null'?null:Number(body.correct);
  if(correct!==null&&(!Number.isInteger(correct)||correct<0||correct>=choices.length)) throw new Error('정답 선택을 확인하세요.');
  return {text,choices,correct,seconds:Math.min(120,Math.max(5,Number(body.seconds)||20))};
}
async function uploadImage(value){
  if(!value||!String(value).startsWith('data:image/')) return String(value||'');
  const m=String(value).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if(!m) throw new Error('이미지 형식을 확인하세요.');
  const mime=m[1],buffer=Buffer.from(m[2],'base64');
  if(buffer.length>4*1024*1024) throw new Error('이미지는 4MB 이하만 가능합니다.');
  const ext=mime.includes('png')?'png':mime.includes('webp')?'webp':mime.includes('gif')?'gif':'jpg';
  const filename=`${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from(IMAGE_BUCKET).upload(filename,buffer,{contentType:mime,upsert:false});
  if(error) throw new Error(`이미지 저장 실패: ${error.message}`);
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filename).data.publicUrl;
}
function newCode(){let c;do c=String(Math.floor(100000+Math.random()*900000));while(rooms.has(c));return c;}
function publicPlayers(r){return [...r.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,answered:p.answered,lastCorrect:p.lastCorrect}));}
function ranking(r){return publicPlayers(r).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));}
function state(r){return {code:r.code,status:r.status,index:r.index,total:questions.length,players:publicPlayers(r),ranking:ranking(r)};}
function finishQuestion(r){
  if(r.status!=='question') return;
  clearTimeout(r.timer);r.status='result';
  const q=questions[r.index];
  io.to(r.code).emit('questionResult',{correct:q.correct,correctText:q.correct===null?null:q.choices[q.correct],counts:q.choices.map((_,i)=>[...r.players.values()].filter(p=>p.answer===i).length),ranking:ranking(r).slice(0,10)});
}

app.get('/health',(_,res)=>res.json({ok:true}));
app.get('/api/questions',async(_,res)=>{try{res.json(await refreshQuestions());}catch(e){console.error(e);res.status(500).json({error:'문제를 불러오지 못했습니다.'});}});
app.post('/api/questions',async(req,res)=>{try{
  const q=normalize(req.body||{}),image=await uploadImage(req.body.image||'');
  const {data,error}=await supabase.from('questions').insert({text:q.text,choices:q.choices,correct:q.correct,seconds:q.seconds,image_url:image||null,sort_order:questions.length}).select().single();
  if(error) throw error;await refreshQuestions();res.json({ok:true,question:data});
}catch(e){console.error(e);res.status(400).json({error:e.message||'저장 실패'});}});
app.put('/api/questions/:id',async(req,res)=>{try{
  const q=normalize(req.body||{});let image=String(req.body.image||'');if(image.startsWith('data:image/')) image=await uploadImage(image);
  const {error}=await supabase.from('questions').update({text:q.text,choices:q.choices,correct:q.correct,seconds:q.seconds,image_url:image||null}).eq('id',Number(req.params.id));
  if(error) throw error;await refreshQuestions();res.json({ok:true});
}catch(e){console.error(e);res.status(400).json({error:e.message||'수정 실패'});}});
app.delete('/api/questions/:id',async(req,res)=>{try{const {error}=await supabase.from('questions').delete().eq('id',Number(req.params.id));if(error)throw error;await refreshQuestions();res.json({ok:true});}catch(e){res.status(500).json({error:'삭제 실패'});}});
app.get('/api/qr/:code',async(req,res)=>{const base=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||`${req.protocol}://${req.get('host')}`;try{res.type('png').send(await QRCode.toBuffer(`${base}/play.html?room=${encodeURIComponent(req.params.code)}`,{width:440,margin:2}));}catch{res.status(500).send('QR 생성 실패');}});

io.on('connection',socket=>{
  socket.on('host:create',async(_,ack)=>{try{await refreshQuestions();if(!questions.length)return ack({ok:false,error:'먼저 문제를 1개 이상 만들어 주세요.'});const code=newCode(),r={code,hostId:socket.id,players:new Map(),status:'lobby',index:-1,timer:null,startedAt:0};rooms.set(code,r);socket.join(code);ack({ok:true,code,state:state(r)});}catch{ack({ok:false,error:'데이터베이스 연결을 확인하세요.'});}});
  socket.on('player:join',({code,name,token},ack)=>{const r=rooms.get(String(code));if(!r)return ack({ok:false,error:'존재하지 않는 방입니다.'});name=String(name||'').trim().slice(0,16);if(!name)return ack({ok:false,error:'닉네임을 입력하세요.'});let p=token?[...r.players.values()].find(x=>x.token===token):null;if(!p){if(r.players.size>=MAX_PLAYERS)return ack({ok:false,error:'40명 정원이 찼습니다.'});if([...r.players.values()].some(x=>x.name===name))return ack({ok:false,error:'이미 사용 중인 닉네임입니다.'});p={id:socket.id,token:token||crypto.randomUUID(),name,score:0,answered:false,answer:null,lastCorrect:null};r.players.set(socket.id,p);}else{r.players.delete(p.id);p.id=socket.id;r.players.set(socket.id,p);}socket.join(r.code);io.to(r.hostId).emit('room:update',state(r));ack({ok:true,token:p.token,state:state(r)});});
  socket.on('host:startNext',({code},ack=()=>{})=>{const r=rooms.get(String(code));if(!r||r.hostId!==socket.id)return ack({ok:false});if(r.index+1>=questions.length){r.status='finished';io.to(code).emit('gameFinished',{ranking:ranking(r)});return ack({ok:true,finished:true});}r.index++;r.status='question';r.startedAt=Date.now();for(const p of r.players.values()){p.answered=false;p.answer=null;p.lastCorrect=null;}const q=questions[r.index];io.to(code).emit('question',{index:r.index,total:questions.length,text:q.text,choices:q.choices,seconds:q.seconds||20,image:q.image||''});r.timer=setTimeout(()=>finishQuestion(r),(q.seconds||20)*1000);ack({ok:true});});
  socket.on('player:answer',({code,answer,token},ack=()=>{})=>{const r=rooms.get(String(code)),p=r?[...r.players.values()].find(x=>x.token===token):null;if(!r||!p||r.status!=='question'||p.answered)return ack({ok:false});const q=questions[r.index],elapsed=Math.max(0,Date.now()-r.startedAt),limit=(q.seconds||20)*1000;p.answered=true;p.answer=Number(answer);p.lastCorrect=q.correct===null?null:Number(answer)===q.correct;let gained=0;if(p.lastCorrect){gained=500+Math.round(500*Math.max(0,1-elapsed/limit));p.score+=gained;}ack({ok:true,gained});io.to(r.hostId).emit('room:update',state(r));if(r.players.size&&[...r.players.values()].every(x=>x.answered))finishQuestion(r);});
  socket.on('host:finish',({code})=>{const r=rooms.get(String(code));if(!r||r.hostId!==socket.id)return;clearTimeout(r.timer);r.status='finished';io.to(code).emit('gameFinished',{ranking:ranking(r)});});
  socket.on('disconnect',()=>{for(const r of rooms.values())if(r.hostId===socket.id){clearTimeout(r.timer);io.to(r.code).emit('hostDisconnected');rooms.delete(r.code);break;}});
});

if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){console.error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');process.exit(1);}
refreshQuestions().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`RADIQ Live: http://localhost:${PORT}`))).catch(e=>{console.error('Supabase 연결 실패',e);process.exit(1);});
