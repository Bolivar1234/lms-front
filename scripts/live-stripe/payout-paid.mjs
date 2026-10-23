import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync(process.env.ENV_FILE||new URL('../../.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const SUPA='https://api-staging.saythanks.org',SR=env.SUPABASE_SERVICE_ROLE_KEY,SK=process.env.STRIPE_RK
const A='acct_1UTNDiLs9iObyLRq',T1='7e570000-0000-4000-8000-00000000e2e1'
const lms=(x={})=>({apikey:SR,Authorization:`Bearer ${SR}`,'Accept-Profile':'lms','Content-Profile':'lms','content-type':'application/json',...x})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const r=await fetch('https://api.stripe.com/v1/payouts',{method:'POST',headers:{Authorization:`Bearer ${SK}`,'Stripe-Account':A,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({amount:'1000',currency:'usd'})})
const po=await r.json();const t0=Date.now()
const ins=await fetch(`${SUPA}/rest/v1/payouts`,{method:'POST',headers:lms({Prefer:'return=minimal'}),body:JSON.stringify({tenant_id:T1,amount:10,currency:'usd',status:'pending',stripe_payout_id:po.id,payout_method:'stripe_connect'})})
console.log(po.id,po.status,'row',ins.status,`+${Date.now()-t0}ms`)
for(let i=0;i<8;i++){await sleep(3000);const x=(await (await fetch(`${SUPA}/rest/v1/payouts?select=status,paid_at&stripe_payout_id=eq.${po.id}`,{headers:lms()})).json())[0];console.log(i,JSON.stringify(x));if(x?.status!=='pending')break}
