
const $=id=>document.getElementById(id);
let questions=[], imageData="", editing=-1;
async function load(){questions=await fetch("/api/questions").then(r=>r.json());render();}
function render(){
 $("list").innerHTML=questions.map((q,i)=>`<div class="question-item">
 <b>${i+1}. ${escapeHtml(q.text)}</b>
 ${q.image?`<div><img class="preview" src="${q.image}" alt="문제 이미지"></div>`:""}
 <ol type="A">${q.choices.map(c=>`<li>${escapeHtml(c)}</li>`).join("")}</ol>
 <small>정답: ${q.correct===null?"없음":String.fromCharCode(65+q.correct)} · ${q.seconds}초</small><br><br>
 <button data-edit="${i}" class="secondary">수정</button> <button data-del="${i}" class="danger">삭제</button></div>`).join("");
 document.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>edit(+b.dataset.edit)));
 document.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>del(+b.dataset.del)));
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
$("image").addEventListener("change",()=>{
 const f=$("image").files[0]; if(!f){imageData="";return}
 if(f.size>4*1024*1024){$("msg").textContent="이미지는 4MB 이하로 선택하세요.";return}
 const r=new FileReader();r.onload=()=>{imageData=r.result;$("preview").src=imageData;$("preview").classList.remove("hidden")};r.readAsDataURL(f);
});
$("save").addEventListener("click",async()=>{
 const choices=[$("c0").value,$("c1").value,$("c2").value,$("c3").value];
 const correct=$("correct").value==="null"?null:Number($("correct").value);
 const body={text:$("text").value,choices,correct,seconds:Number($("seconds").value),image:imageData};
 const url=editing<0?"/api/questions":`/api/questions/${editing}`;
 const method=editing<0?"POST":"PUT";
 const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const x=await r.json();$("msg").textContent=x.ok?"저장했습니다.":x.error;
 if(x.ok){clear();load();}
});
function edit(i){const q=questions[i];editing=i;$("text").value=q.text;[0,1,2,3].forEach(n=>$( "c"+n ).value=q.choices[n]||"");$("correct").value=q.correct===null?"null":String(q.correct);$("seconds").value=q.seconds;imageData=q.image||"";$("preview").src=imageData;$("preview").classList.toggle("hidden",!imageData);$("save").textContent="수정 저장";$("cancel").classList.remove("hidden");scrollTo({top:0,behavior:"smooth"});}
async function del(i){if(!confirm("이 문제를 삭제할까요?"))return;await fetch(`/api/questions/${i}`,{method:"DELETE"});load();}
function clear(){editing=-1;$("text").value="";[0,1,2,3].forEach(n=>$( "c"+n ).value="");$("correct").value="0";$("seconds").value=15;$("image").value="";imageData="";$("preview").classList.add("hidden");$("save").textContent="문제 추가";$("cancel").classList.add("hidden");}
$("cancel").addEventListener("click",clear);load();
