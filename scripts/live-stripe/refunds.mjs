import fs from 'fs'
import crypto from 'crypto'
const env = Object.fromEntries(fs.readFileSync(process.env.ENV_FILE||new URL('../../.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const SUPA='https://api-staging.saythanks.org', ANON=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY, SR=env.SUPABASE_SERVICE_ROLE_KEY
const SK=process.env.STRIPE_RK
const HOST='https://e2e-school.circles.saythanks.org'
const T1='7e570000-0000-4000-8000-00000000e2e1'
const adm={apikey:SR,Authorization:`Bearer ${SR}`,'content-type':'application/json'}
const lms=(x={})=>({...adm,'Accept-Profile':'lms','Content-Profile':'lms',...x})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const res=[]; const rec=(n,ok,d)=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}  ${d}`)}
const rest=async q=>(await (await fetch(`${SUPA}/rest/v1/${q}`,{headers:lms()})).json())
const stripe=async(path,body,method='POST')=>{const r=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${SK}`,'content-type':'application/x-www-form-urlencoded'},body:body?new URLSearchParams(body):undefined});return {s:r.status,j:await r.json()}}
const ts=Date.now()
async function mkStudent(label){
  const email=`stripe-retest-${label}-${ts}@example.invalid`
  const u=await (await fetch(`${SUPA}/auth/v1/admin/users`,{method:'POST',headers:adm,body:JSON.stringify({email,password:crypto.randomBytes(18).toString('base64url'),email_confirm:true,app_metadata:{tenant_id:T1}})})).json()
  await fetch(`${SUPA}/rest/v1/tenant_users`,{method:'POST',headers:lms({Prefer:'return=minimal'}),body:JSON.stringify({tenant_id:T1,user_id:u.id,role:'student',status:'active'})})
  const gl=await (await fetch(`${SUPA}/auth/v1/admin/generate_link`,{method:'POST',headers:adm,body:JSON.stringify({type:'magiclink',email})})).json()
  const sess=await (await fetch(`${SUPA}/auth/v1/verify`,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({type:'magiclink',token_hash:gl.hashed_token||gl.properties?.hashed_token})})).json()
  return {id:u.id,email,sess}
}
const cookieFor=s=>{const base='sb-api-staging-auth-token';const val='base64-'+Buffer.from(JSON.stringify(s)).toString('base64url');const p=val.match(/.{1,3180}/g);return p.length===1?`${base}=${p[0]}`:p.map((x,i)=>`${base}.${i}=${x}`).join('; ')}
async function startCheckout(st){
  const r=await fetch(`${HOST}/api/stripe/create-payment-intent`,{method:'POST',headers:{'content-type':'application/json',Cookie:cookieFor(st.sess)},body:JSON.stringify({productId:1})})
  const j=await r.json().catch(()=>({})); return {s:r.status,j}
}
const waitTx=async(id,want,tries=12)=>{for(let i=0;i<tries;i++){const t=(await rest(`transactions?select=transaction_id,status&transaction_id=eq.${id}`))[0];if(t&&want.includes(t.status))return t;await sleep(2500)}return (await rest(`transactions?select=transaction_id,status&transaction_id=eq.${id}`))[0]}


const S=await mkStudent('refund')
let c=await startCheckout(S)
rec('PI created',c.s===200&&c.j.clientSecret,`${c.s} tx=${c.j.transactionId}`)
const piId=c.j.clientSecret.split('_secret_')[0]
const conf=await stripe(`payment_intents/${piId}/confirm`,{payment_method:'pm_card_visa',return_url:HOST+'/en/checkout/success'})
rec('PI succeeded',conf.j.status==='succeeded',conf.j.status||conf.j.error?.message)
const amount=conf.j.amount
let tx=await waitTx(c.j.transactionId,['successful'])
rec('tx successful',tx?.status==='successful',tx?.status)
const txFull=async()=>(await rest(`transactions?select=status,refunded_amount&transaction_id=eq.${c.j.transactionId}`))[0]
const entq=async()=>await rest(`entitlements?select=status,revoked_at&user_id=eq.${S.id}`)
const waitFor=async(fn,pred,tries=12)=>{let v;for(let i=0;i<tries;i++){v=await fn();if(pred(v))return v;await sleep(2500)}return v}
// partial
const r1=await stripe('refunds',{payment_intent:piId,amount:String(Math.floor(amount/4))})
rec('partial refund created',r1.s===200,`${r1.s} ${r1.j.error?.message||r1.j.status} amount=${r1.j.amount}/${amount}`)
const t1=await waitFor(txFull,t=>t&&Number(t.refunded_amount)>0)
rec('partial: refunded_amount set, status stays successful, entitlement active',Number(t1.refunded_amount)===Math.floor(amount/4)/100&&t1.status==='successful'&&(await entq())[0]?.status==='active',JSON.stringify(t1)+JSON.stringify(await entq()))
// full
const r2=await stripe('refunds',{payment_intent:piId})
rec('remaining refund created',r2.s===200,`${r2.s} ${r2.j.error?.message||r2.j.status} amount=${r2.j.amount}`)
const t2=await waitFor(txFull,t=>t&&t.status==='refunded')
const e2=await entq()
rec('full: status refunded, refunded_amount=total, entitlement revoked',t2.status==='refunded'&&Number(t2.refunded_amount)===amount/100&&e2[0]?.status==='revoked',JSON.stringify(t2)+JSON.stringify(e2))
// redelivery
const evs=await stripe(`events?type=charge.refunded&limit=5`,null,'GET')
const evt=(evs.j.data||[]).find(e=>e.data.object.payment_intent===piId)
rec('found charge.refunded event',!!evt,evt?.id)
if(evt){
  const eps=await stripe('webhook_endpoints?limit=20',null,'GET')
  const targets=(eps.j.data||[]).filter(ep=>ep.url.includes('circles.saythanks.org'))
  let ok=0,bad=0
  for(const ep of targets){
    const rr=await stripe(`events/${evt.id}/retry`,{webhook_endpoint:ep.id})
    console.log('retry',ep.id,rr.s,rr.j.error?.message||'ok')
    if(rr.s===200)ok++;else bad++}
  rec('event redelivered to every circles.saythanks.org endpoint',targets.length>0&&ok===targets.length&&bad===0,`ok=${ok} failed=${bad} endpoints=${targets.length}`)
  await sleep(6000)
  const t3=await txFull()
  rec('redelivery idempotent: unchanged',t3.status==='refunded'&&Number(t3.refunded_amount)===amount/100,JSON.stringify(t3))
}
// cleanup
const gl=await (await fetch(`${SUPA}/auth/v1/admin/generate_link`,{method:'POST',headers:adm,body:JSON.stringify({type:'magiclink',email:S.email})})).json()
const sess=await (await fetch(`${SUPA}/auth/v1/verify`,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({type:'magiclink',token_hash:gl.hashed_token||gl.properties?.hashed_token})})).json()
const d=await fetch(`${HOST}/api/account/delete`,{method:'POST',headers:{Authorization:`Bearer ${sess.access_token}`,'content-type':'application/json'},body:JSON.stringify({confirm:S.email})})
console.log('cleanup',d.status)
console.log(`${res.filter(Boolean).length}/${res.length} passed`)
