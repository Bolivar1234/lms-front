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
async function startCheckout(st,opts={productId:1}){
  const r=await fetch(`${HOST}/api/stripe/create-payment-intent`,{method:'POST',headers:{'content-type':'application/json',Cookie:cookieFor(st.sess)},body:JSON.stringify(opts)})
  const j=await r.json().catch(()=>({})); return {s:r.status,j}
}
const waitTx=async(id,want,tries=12)=>{for(let i=0;i<tries;i++){const t=(await rest(`transactions?select=transaction_id,status&transaction_id=eq.${id}`))[0];if(t&&want.includes(t.status))return t;await sleep(2500)}return (await rest(`transactions?select=transaction_id,status&transaction_id=eq.${id}`))[0]}



// plan with a real recurring Stripe price
const prod=await stripe('products',{name:'e2e subscription test '+ts})
const price=await stripe('prices',{product:prod.j.id,unit_amount:'500',currency:'usd','recurring[interval]':'month'})
rec('recurring price created',price.s===200,price.j.id||price.j.error?.message)
const planRes=await fetch(`${SUPA}/rest/v1/plans`,{method:'POST',headers:lms({Prefer:'return=representation'}),body:JSON.stringify({tenant_id:T1,plan_name:'E2E Sub Test '+ts,price:5,duration_in_days:30,currency:'usd',payment_provider:'stripe',provider_product_id:prod.j.id,provider_price_id:price.j.id})})
const plan=(await planRes.json())[0]
rec('plan row inserted',!!plan?.plan_id,JSON.stringify(plan).slice(0,150))
const S=await mkStudent('sub')
let c=await startCheckout(S,{planId:plan.plan_id})
rec('app creates native subscription checkout',c.s===200&&c.j.clientSecret,`${c.s} ${JSON.stringify(c.j).slice(0,200)}`)
const txq=async()=>(await rest(`transactions?select=status,provider_subscription_id&transaction_id=eq.${c.j.transactionId}`))[0]
const subq=async()=>await rest(`subscriptions?select=subscription_id,subscription_status,provider_subscription_id,current_period_end,ended_at&user_id=eq.${S.id}`)
let subId
if(c.j.clientSecret){
  const piId=c.j.clientSecret.split('_secret_')[0]
  const conf=await stripe(`payment_intents/${piId}/confirm`,{payment_method:'pm_card_visa',return_url:HOST+'/en/checkout/success'})
  rec('first invoice paid',conf.j.status==='succeeded',conf.j.status||conf.j.error?.message)
  let tx;for(let i=0;i<12;i++){tx=await txq();if(tx?.status==='successful')break;await sleep(2500)}
  subId=tx?.provider_subscription_id
  const subs=await subq()
  rec('invoice.payment_succeeded(subscription_create): tx successful + active subscription row',tx?.status==='successful'&&subs.length===1&&subs[0].subscription_status==='active'&&subs[0].provider_subscription_id===subId,JSON.stringify({tx,subs}))
  // cancel -> customer.subscription.deleted
  const del=await stripe(`subscriptions/${subId}`,null,'DELETE')
  rec('subscription canceled on Stripe',del.s===200&&del.j.status==='canceled',del.j.status||del.j.error?.message)
  // Paid period is still in the future: access must continue (expire_subscription_if_due keeps it).
  await sleep(8000)
  let s2=await subq()
  rec('customer.subscription.deleted with paid period remaining: access continues',s2[0]?.subscription_status==='active',JSON.stringify(s2))
  // Elapse the deadline, redeliver the event, expect expiry.
  const past=new Date(Date.now()-86400e3).toISOString()
  await fetch(`${SUPA}/rest/v1/subscriptions?user_id=eq.${S.id}`,{method:'PATCH',headers:lms({Prefer:'return=minimal'}),body:JSON.stringify({current_period_end:past,end_date:past})})
  const evs=await stripe('events?type=customer.subscription.deleted&limit=20',null,'GET')
  const ev=(evs.j.data||[]).find(e=>e.data.object.id===subId)
  const eps=await stripe('webhook_endpoints?limit=20',null,'GET')
  const ep=(eps.j.data||[]).find(e=>e.url.includes('circles.saythanks.org/api/stripe/webhook')&&e.enabled_events.includes('customer.subscription.deleted')&&!e.application)
  const rr=ev&&ep?await stripe(`events/${ev.id}/retry`,{webhook_endpoint:ep.id}):{s:0,j:{error:{message:'event or endpoint not found'}}}
  rec('deleted event redelivered',rr.s===200,rr.j.error?.message||'ok')
  for(let i=0;i<12;i++){s2=await subq();if(s2[0]?.subscription_status!=='active')break;await sleep(2500)}
  rec('deadline elapsed: subscription expired',s2[0]?.subscription_status==='expired',JSON.stringify(s2))
}
// cleanup
const gl=await (await fetch(`${SUPA}/auth/v1/admin/generate_link`,{method:'POST',headers:adm,body:JSON.stringify({type:'magiclink',email:S.email})})).json()
const sess=await (await fetch(`${SUPA}/auth/v1/verify`,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({type:'magiclink',token_hash:gl.hashed_token||gl.properties?.hashed_token})})).json()
const d=await fetch(`${HOST}/api/account/delete`,{method:'POST',headers:{Authorization:`Bearer ${sess.access_token}`,'content-type':'application/json'},body:JSON.stringify({confirm:S.email})})
console.log('cleanup',d.status)
await fetch(`${SUPA}/rest/v1/plans?plan_id=eq.${plan.plan_id}`,{method:'PATCH',headers:lms({Prefer:'return=minimal'}),body:JSON.stringify({deleted_at:new Date().toISOString()})})
await stripe(`prices/${price.j.id}`,{active:'false'})
console.log(`${res.filter(Boolean).length}/${res.length} passed`)
