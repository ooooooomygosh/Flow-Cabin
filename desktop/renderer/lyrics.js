'use strict';
async function update(){try{const state=await window.cabinLyrics.read();document.querySelector('#title').textContent=state?.title||'心流小屋';document.querySelector('#current').textContent=state?.current||'暂无歌词，可在小屋歌词册中导入。';document.querySelector('#next').textContent=state?.next||'';}catch{}setTimeout(update,350);}update();
