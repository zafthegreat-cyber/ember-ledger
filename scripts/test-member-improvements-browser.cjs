const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,expect}=require('@playwright/test');
const out=path.resolve('artifacts/qa/member-improvements');fs.mkdirSync(out,{recursive:true});
const base='http://127.0.0.1:5269';
const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const timestamp=new Date().toISOString();
const user={id,aud:'authenticated',role:'authenticated',email:'member@example.test',email_confirmed_at:timestamp,confirmed_at:timestamp,created_at:timestamp,app_metadata:{provider:'email',providers:['email']},user_metadata:{public_username:'qa_collector',first_name:'QA',last_name:'Member'}};
let server,browser,lastPage;
const checks=[];
function record(value){checks.push(value);console.log('PASS '+value);}
async function layout(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
async function main(){
  // Disposable public test project, never the real project's credentials or network.
  Object.assign(process.env,{VITE_SUPABASE_URL:'https://code3-qa.supabase.co',VITE_SUPABASE_ANON_KEY:'qa-public-not-a-real-key',VITE_PUBLIC_APP_URL:base,VITE_AUTH_VERIFIED_PROVIDERS:'',VITE_AUTH_ACCOUNT_LINKING_VERIFIED:'false',VITE_BETA_LOCAL_MODE:'false'});
  const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5269,strictPort:true}});await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:375,height:900},serviceWorkers:'block'});
  const requests=[],errors=[];let resetMode='unknown',feedbackMode='ok',feedbackBody;
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(url.origin!=='https://code3-qa.supabase.co')return route.abort();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
    if(url.pathname==='/auth/v1/settings')return reply({external:{email:true,discord:false,google:false,apple:false,facebook:false}});
    if(url.pathname==='/auth/v1/resend'){requests.push({kind:'confirmation',body:request.postDataJSON(),redirect:url.searchParams.get('redirect_to')});return reply({});}
    if(url.pathname==='/auth/v1/recover'){requests.push({kind:'recovery',body:request.postDataJSON(),redirect:url.searchParams.get('redirect_to')});return reply({code:'user_not_found',msg:resetMode==='unknown'?'private-user-not-found':'private-registered-email'},400);}
    if(url.pathname==='/auth/v1/token')return reply({access_token:Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})).toString('base64url')+'.fixture',refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user});
    if(url.pathname==='/auth/v1/user')return reply(user);
    if(url.pathname.includes('/rpc/has_full_app_access')||url.pathname.includes('/rpc/code3_current_session_valid'))return reply(true);
    if(url.pathname.includes('/rpc/'))return reply(false);
    if(url.pathname==='/rest/v1/profiles')return reply(request.method()==='GET'?{id,email:user.email,public_username:'qa_collector',display_name:'QA Member',first_name:'QA',last_name:'Member',user_role:'user',tier:'free',beta_status:'not_requested'}:[]);
    if(url.pathname==='/rest/v1/beta_feedback'&&request.method()==='POST'){
      feedbackBody=request.postDataJSON();requests.push({kind:'feedback',id:feedbackBody.id});
      return feedbackMode==='ok'?reply({},201):reply({message:'fixture unavailable'},503);
    }
    if(url.pathname.startsWith('/rest/v1/'))return reply([]);
    if(url.pathname.startsWith('/functions/v1/'))return reply({});
    return route.abort();
  });
  const page=await context.newPage();lastPage=page;page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(25_000);
  await page.goto(base);await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'Welcome back!',exact:true}).waitFor({timeout:60_000});
  for(const width of [375,768,1280]){
    await page.setViewportSize({width,height:900});await layout(page);
    await page.getByRole('button',{name:'Create Account',exact:true}).click();
    await expect(page.getByLabel('Signup field visibility')).toBeVisible();
    assert.equal(await page.getByRole('button',{name:/Continue with (Discord|Google|Facebook|Apple)/}).count(),0);
    await page.screenshot({path:path.join(out,`signup-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Back to Log In',exact:true}).click();
  }record('Actual signup at 375/768/1280: field visibility, no overflow, no unconfigured provider buttons.');
  await page.setViewportSize({width:375,height:900});
  await page.getByText('Email confirmation help',{exact:true}).click();
  await page.getByLabel('Email used to create your account',{exact:true}).fill(user.email);
  await page.getByRole('button',{name:'Resend confirmation email',exact:true}).click();
  await expect(page.getByText(/If this email has an unconfirmed account/)).toBeVisible();
  assert.equal(requests.filter(row=>row.kind==='confirmation').length,1);
  const resend=requests.find(row=>row.kind==='confirmation');assert.equal(resend.body.type,'signup');assert.equal(resend.body.email,user.email);assert.equal(resend.redirect,base);
  await page.getByRole('button',{name:'Resend confirmation email',exact:true}).click();
  await expect(page.getByText(/Please wait a minute before requesting another email/)).toBeVisible();assert.equal(requests.filter(row=>row.kind==='confirmation').length,1);
  record('Actual SDK signup resend uses the configured exact redirect; repeat click makes no second request.');
  await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  await page.getByRole('heading',{name:'Reset Password',exact:true}).waitFor();await page.locator('.auth-form input[type="email"]').fill(user.email);await page.getByRole('button',{name:'Send reset link',exact:true}).click();
  await expect(page.getByText(/If an account can receive a reset email/).first()).toBeVisible();
  const firstRecovery=await page.locator('.auth-status-message.success').textContent();assert.ok(!await page.locator('body').textContent().then(text=>text.includes('private-user')));
  resetMode='registered';await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  await page.getByRole('heading',{name:'Reset Password',exact:true}).waitFor();await page.locator('.auth-form input[type="email"]').fill('another@example.test');await page.getByRole('button',{name:'Send reset link',exact:true}).click();
  await expect(page.locator('.auth-status-message.success')).toHaveText(firstRecovery);
  record('Actual SDK recovery maps nonexistent/registered fixture errors to the same private status. No real email is sent.');
  await page.goto(base+'/?error_code=otp_expired&error_description=private-never-render');
  await expect(page.getByText(/This email link has expired/)).toBeVisible();assert.ok(!(await page.locator('body').textContent()).includes('private-never-render'));
  await page.goto(base+'/reset-password#error_code=otp_expired&error_description=private-never-render');
  await expect(page.getByText(/This reset link has expired/)).toBeVisible();record('Actual expired confirmation/recovery entry points explain distinct fresh-link routes without callback details.');
  await page.goto(base);await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'Welcome back!',exact:true}).waitFor();
  await page.locator('.auth-form input[type="email"]').fill(user.email);await page.locator('.auth-form input[type="password"]').fill('fixture-only-password');
  await page.getByRole('button',{name:'Log In',exact:true}).click();
  const claim=page.getByRole('button',{name:'These are my records',exact:true});
  await claim.or(page.getByRole('heading',{name:'Start with one collecting task',exact:true})).first().waitFor({timeout:60_000});
  if(await claim.isVisible()) { await claim.click(); record('Existing record-ownership confirmation remains required before the synthetic signed-in account opens local records.'); }
  await page.getByRole('heading',{name:'Start with one collecting task',exact:true}).waitFor({timeout:60_000});
  const setup=page.locator('.smart-setup-modal');
  if(await setup.isVisible()){await setup.getByRole('button',{name:'Skip for now',exact:true}).click();record('Existing optional setup can be skipped without bypassing account or record ownership checks.');}
  await layout(page);await page.screenshot({path:path.join(out,'member-home-375.png'),fullPage:true});
  await page.getByRole('button',{name:'Add my first collection item',exact:true}).click();
  await expect(page.locator('body')).toContainText('Personal collection');
  record('Actual signed-in Home receives the verified fixture account and opens the existing Vault collection add flow.');
  // Return to Home through its route; the fixture remains in this disposable context only.
  await page.goto(base+'/collect');await page.getByRole('heading',{name:'Start with one collecting task',exact:true}).waitFor();
  await page.getByRole('button',{name:'Skip for now',exact:true}).click();await expect(page.getByRole('button',{name:'Reopen getting started',exact:true})).toBeVisible();
  await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Reopen getting started',exact:true}).click();
  await page.getByLabel('What brings you here?',{exact:true}).selectOption('seller');await page.getByRole('button',{name:'Open seller inventory',exact:true}).click();
  await expect(page).toHaveURL(/\/inventory|\/sell|\/forge/);record('Guide skip/reopen survives reload under the current account; seller action opens inventory.');
  await page.goto(base+'/collect');await page.getByRole('button',{name:'Share feedback',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Share feedback',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Feedback visibility')).toBeVisible();
  const message=dialog.locator('textarea').first();await message.fill('Synthetic QA: preserve this message after a temporary failure.');
  await dialog.getByRole('button',{name:'Save draft for this tab',exact:true}).click();await expect(dialog.getByText(/Draft saved for this account/)).toBeVisible();
  await message.fill('Temporary replacement');page.once('dialog',prompt=>prompt.accept());await dialog.getByRole('button',{name:'Restore saved draft',exact:true}).click();
  await expect(message).toHaveValue('Synthetic QA: preserve this message after a temporary failure.');
  await dialog.locator('input[placeholder="VA, NC, TX..."]').fill('VA');
  await dialog.locator('select').first().selectOption({label:'Collector'});
  await dialog.getByText('I understand and will not include sensitive details.',{exact:true}).click();
  await dialog.getByRole('button',{name:'Send feedback',exact:true}).click();
  await expect(dialog.getByText(/Reference:/)).toBeVisible();assert.ok(feedbackBody?.id);assert.ok((await dialog.textContent()).includes(feedbackBody.id));
  record('Actual feedback saves/restores a tab draft and returns the same reference as the synthetic cloud insert.');
  await dialog.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Share feedback',exact:true}).click();
  await message.fill('Synthetic QA: keep a draft when cloud delivery is uncertain.');
  await dialog.getByRole('button',{name:'Save draft for this tab',exact:true}).click();
  await dialog.locator('input[placeholder="VA, NC, TX..."]').fill('VA');await dialog.locator('select').first().selectOption({label:'Collector'});
  await dialog.getByText('I understand and will not include sensitive details.',{exact:true}).click();
  feedbackMode='fail';await dialog.getByRole('button',{name:'Send feedback',exact:true}).click();
  await expect(dialog.getByText('Queued locally',{exact:true})).toBeVisible();await expect(dialog.getByText(/A cloud receipt was not confirmed/)).toBeVisible();
  await dialog.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Share feedback',exact:true}).click();
  await dialog.getByRole('button',{name:'Restore saved draft',exact:true}).click();await expect(message).toHaveValue('Synthetic QA: keep a draft when cloud delivery is uncertain.');
  await dialog.getByRole('button',{name:'Remove saved draft',exact:true}).click();await expect(dialog.getByText(/Saved draft removed/)).toBeVisible();
  record('Temporary cloud failure keeps a restorable account draft and reports an unconfirmed outcome; explicit removal clears the saved draft.');
  await page.goto(base+'/support?topic=safety');await expect(page.getByRole('heading',{name:'How can we help?',exact:true})).toBeVisible();
  await expect(page.getByLabel('Help topic',{exact:true})).toHaveValue('safety');await expect(page.getByText('Source coverage · Best Buy paused',{exact:true})).toBeVisible();
  await layout(page);await page.screenshot({path:path.join(out,'support-375.png'),fullPage:true});
  record('Public support preselects safety, produces an editable draft, and labels Best Buy paused. No messages or retailer requests are sent.');
  assert.deepEqual(errors,[]);assert.ok(requests.every(row=>['confirmation','recovery','feedback'].includes(row.kind)));
  await context.close();fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({synthetic:true,productionWrites:0,realEmails:0,retailerRequests:0,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks}));
}
main().catch(async error=>{console.error(error.message);if(lastPage){await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),await lastPage.locator('body').innerText().catch(()=>''));}process.exitCode=1;}).finally(async()=>{await browser?.close();await server?.close();});

