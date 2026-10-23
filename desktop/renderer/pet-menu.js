'use strict';
const api=window.cabinPetMenu,$=id=>document.getElementById(id);
function paint(value){if(!value)return;const s=value.status||{};if(value.avatar)$('pet').src=value.avatar;$('track').textContent=value.track || '唱机休息中';$('play').textContent=s.playing?'暂停':'播放';$('clock').textContent=s.phase==='idle'?'开始一轮专注':`${s.title?.trim() || ''} · ${s.paused?'继续':'暂停'}`;$('hint').textContent=s.phase==='focus'?'安静陪着你做眼前的事。':'灯亮着，慢慢来。';}
api.getState().then(paint);api.onState(paint);
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>api.command(button.dataset.action)));
$('home').addEventListener('click',()=>api.command('home'));$('focus').addEventListener('click',()=>api.command('focus'));
