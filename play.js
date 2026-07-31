
const socket=io();const $=id=>document.getElementById(id);let code="",token="",timer;
function show(id){["join","wait","quiz","result","final"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
const param=new URLSearchParams(location.search).get("room");if(param)$("room").value=param;
$("joinBtn").onclick=()=>{code=$("room").value.trim();socket.emit("player:join",{code,name:$("name").value,token},r=>{if(!r.ok){$("error").textContent=r.error;return}token=r.token;show("wait")})};
socket.on("question",q=>{show("quiz");$("qno").textContent=`${q.index+1}/${q.total}`;$("question").textContent=q.text;$("qimg").src=q.image||"";$("qimg").classList.toggle("hidden",!q.image);$("choices").innerHTML=q.choices.map((c,i)=>`<button class="choice ${["red","blue","yellow","green"][i%4]}" data-i="${i}">${"ABCD"[i]}. ${c}</button>`).join("");document.querySelectorAll(".choice").forEach(b=>b.addEventListener("click",()=>submit(+b.dataset.i)));let left=q.seconds*10;clearInterval(timer);$("bar").style.width="100%";timer=setInterval(()=>{left--;$("bar").style.width=`${Math.max(0,left/(q.seconds*10)*100)}%`;if(left<=0)clearInterval(timer)},100)});
function submit(i){document.querySelectorAll(".choice").forEach(b=>b.disabled=true);socket.emit("player:answer",{code,answer:i,token},r=>{clearInterval(timer);show("result");$("gained").textContent=r.gained?`+${r.gained}점`:"응답이 제출되었습니다."})}
socket.on("gameFinished",r=>{show("final");$("finalRank").innerHTML=r.ranking.map((p,i)=>`<div class="leader"><b>${i+1}</b><span>${p.name}</span><b>${p.score.toLocaleString()}점</b></div>`).join("")});
socket.on("hostDisconnected",()=>{alert("진행자 연결이 종료되었습니다.");show("join")});
