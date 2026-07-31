
const socket=io();let code="";const $=id=>document.getElementById(id);
function show(id){["start","lobby","game","final"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
function renderPlayers(s){$("count").textContent=s.players.length;$("players").innerHTML=s.players.map(p=>`<span class="pill">${p.name}</span>`).join("")}
function renderRank(rows,target="rank"){$(target).innerHTML=rows.map((p,i)=>`<div class="leader"><b>${i+1}</b><span>${p.name}</span><b>${p.score.toLocaleString()}점</b></div>`).join("")}
$("create").onclick=()=>socket.emit("host:create",{},r=>{if(!r.ok){$("error").textContent=r.error;return}code=r.code;$("code").textContent=code;$("qr").src=`/api/qr/${code}`;show("lobby");renderPlayers(r.state)});
$("next").onclick=()=>{show("game");socket.emit("host:startNext",{code})};
$("next2").onclick=()=>{$("next2").classList.add("hidden");socket.emit("host:startNext",{code})};
$("finish").onclick=()=>socket.emit("host:finish",{code});
socket.on("room:update",s=>{renderPlayers(s);$("answered").textContent=s.players.filter(p=>p.answered).length;$("totalPlayers").textContent=s.players.length;renderRank(s.ranking.slice(0,10))});
socket.on("question",q=>{$("qno").textContent=`${q.index+1} / ${q.total}`;$("question").textContent=q.text;$("qimg").src=q.image||"";$("qimg").classList.toggle("hidden",!q.image);$("answers").innerHTML=q.choices.map((c,i)=>`<div class="choice ${["red","blue","yellow","green"][i%4]}" style="padding:22px;border-radius:16px;color:white;font-weight:800">${"ABCD"[i]}. ${c}</div>`).join("");$("answered").textContent=0});
socket.on("questionResult",r=>{$("next2").classList.remove("hidden");renderRank(r.ranking)});
socket.on("gameFinished",r=>{show("final");renderRank(r.ranking,"finalRank")});
