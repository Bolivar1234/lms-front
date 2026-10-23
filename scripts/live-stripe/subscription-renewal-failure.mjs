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




const A='acct_1UTNDiLs9iObyLRq'
const stp=(p,b,m='POST')=>stripe(p,b,m)
const prod=await stp('products',{name:'e2e renewal test '+ts})
const price=await stp('prices',{product:prod.j.id,unit_amount:'500',currency:'usd','recurring[interval]':'month'})
const plan=(await (await fetch(`${SUPA}/rest/v1/plans`,{method:'POST',headers:lms({Prefer:'return=representation'}),body:JSON.stringify({tenant_id:T1,plan_name:'E2E Renewal '+ts,price:5,duration_in_days:30,currency:'usd',payment_provider:'stripe',provider_product_id:prod.j.id,provider_price_id:price.j.id})})).json())[0]
rec('plan + price',!!plan?.plan_id&&price.s===200,`plan=${plan?.plan_id} ${price.j.id}`)
const S=await mkStudent('renew')
const txr=await fetch(`${SUPA}/rest/v1/transactions`,{method:'POST',headers:lms({Prefer:'return=representation'}),body:JSON.stringify({tenant_id:T1,user_id:S.id,plan_id:plan.plan_id,amount:5,currency:'usd',status:'pending',payment_provider:'stripe'})})
const tx=(await txr.json())[0];rec('pending transaction inserted',!!tx?.transaction_id,JSON.stringify(tx).slice(0,160))
const clock=await stp('test_helpers/test_clocks',{frozen_time:String(Math.floor(Date.now()/1000)),name:'e2e '+ts})
const cust=await stp('customers',{email:S.email,test_clock:clock.j.id})
await stp('payment_methods/pm_card_visa/attach',{customer:cust.j.id})
const pms=await stp(`payment_methods?customer=${cust.j.id}&type=card`,null,'GET')
const pm=pms.j.data[0].id
const sub=await stp('subscriptions',{customer:cust.j.id,'items[0][price]':price.j.id,default_payment_method:pm,'transfer_data[destination]':A,'metadata[transactionId]':String(tx.transaction_id),'metadata[userId]':S.id,'metadata[tenantId]':T1,'metadata[planId]':String(plan.plan_id)})
rec('subscription created on clock',sub.s===200&&sub.j.status==='active',sub.j.status||sub.j.error?.message)
const subq=async()=>(await rest(`subscriptions?select=subscription_status,provider_subscription_id,current_period_end&user_id=eq.${S.id}`))[0]
const wait=async(pred,tries=14)=>{let v;for(let i=0;i<tries;i++){v=await subq();if(pred(v))return v;await sleep(2500)}return v}
const s1=await wait(v=>v?.subscription_status==='active')
rec('subscription_create activates row',s1?.subscription_status==='active'&&s1.provider_subscription_id===sub.j.id,JSON.stringify(s1))
const advance=async days=>{const cur=(await stp(`test_helpers/test_clocks/${clock.j.id}`,null,'GET')).j.frozen_time
  await stp(`test_helpers/test_clocks/${clock.j.id}/advance`,{frozen_time:String(cur+days*86400)})
  for(let i=0;i<30;i++){await sleep(3000);const c=(await stp(`test_helpers/test_clocks/${clock.j.id}`,null,'GET')).j;if(c.status==='ready')return c}}
await advance(32)
const s2=await wait(v=>v&&new Date(v.current_period_end)>new Date(s1.current_period_end),20)
rec('renewal (subscription_cycle) extends current_period_end',new Date(s2.current_period_end)>new Date(s1.current_period_end),`${s1.current_period_end} -> ${s2.current_period_end} status=${s2.subscription_status}`)
// failing card
await stp('payment_methods/pm_card_chargeCustomerFail/attach',{customer:cust.j.id})
const pms2=await stp(`payment_methods?customer=${cust.j.id}&type=card`,null,'GET')
const bad=pms2.j.data.find(p=>p.id!==pm).id
await stp(`subscriptions/${sub.j.id}`,{default_payment_method:bad})
await advance(32)
const s3=await wait(v=>v?.subscription_status==='past_due',20)
rec('invoice.payment_failed marks subscription past_due',s3?.subscription_status==='past_due',JSON.stringify(s3))
// cleanup: delete clock (removes customer/sub), expire rows, delete user
await stp(`test_helpers/test_clocks/${clock.j.id}`,null,'DELETE')
const past=new Date(Date.now()-86400e3).toISOString()
await fetch(`${SUPA}/rest/v1/subscriptions?user_id=eq.${S.id}`,{method:'PATCH',headers:lms({Prefer:'return=minimal'}),body:JSON.stringify({subscription_status:'expired',current_period_end:past,end_date:past})})
const gl=await (await fetch(`${SUPA}/auth/v1/admin/generate_link`,{method:'POST',headers:adm,body:JSON.stringify({type:'magiclink',email:S.email})})).json()
const sess=await (await fetch(`${SUPA}/auth/v1/verify`,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({type:'magiclink',token_hash:gl.hashed_token||gl.properties?.hashed_token})})).json()
const d=await fetch(`${HOST}/api/account/delete`,{method:'POST',headers:{Authorization:`Bearer ${sess.access_token}`,'content-type':'application/json'},body:JSON.stringify({confirm:S.email})})
console.log('cleanup',d.status)
await fetch(`${SUPA}/rest/v1/plans?plan_id=eq.${plan.plan_id}`,{method:'PATCH',headers:lms({Prefer:'return=minimal'}),body:JSON.stringify({deleted_at:new Date().toISOString()})})
await stp(`prices/${price.j.id}`,{active:'false'})
console.log(`${res.filter(Boolean).length}/${res.length} passed`)
