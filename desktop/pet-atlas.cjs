'use strict';
const { SITE_ORIGIN }=require('./policy.cjs');
const PET_ORIGIN='album-desktop://pet';
function createPetAtlasRoute({getSite}) {
  return async request=>{
    let url;try{url=new URL(request.url);}catch{return new Response('Forbidden',{status:403});}
    if(url.origin!==SITE_ORIGIN || url.username || url.password || url.search || url.hash || !/^\/desktop-pets\/packs\/[a-z0-9][a-z0-9_-]{0,63}\/atlas\.png$/.test(url.pathname) || !['GET','HEAD'].includes(request.method))return new Response('Forbidden',{status:403});
    const origin=request.headers.get('origin');if(origin && origin!==PET_ORIGIN)return new Response('Forbidden',{status:403});
    const site=getSite();if(!site || site.isDestroyed?.())return new Response('Cabin unavailable',{status:503});
    // Fetch through the main page's private session and its local site router.
    // No cookies, request headers, remote fetches or arbitrary URLs are forwarded.
    try{const result=await site.session.fetch(new Request(url.href,{method:request.method,redirect:'error'}));if(!result.ok || !/^image\/png(?:;|$)/.test(result.headers.get('content-type') || ''))return new Response('Atlas unavailable',{status:404});return new Response(request.method==='HEAD'?null:result.body,{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':PET_ORIGIN,'Vary':'Origin'}});}catch{return new Response('Atlas unavailable',{status:503});}
  };
}
module.exports={createPetAtlasRoute,PET_ORIGIN};
