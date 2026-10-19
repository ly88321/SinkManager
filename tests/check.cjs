const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
if (!process.argv[2]) {
  const { spawnSync } = require('child_process');
  for (const language of ['en','cn']) {
    console.log('\nChecking '+language.toUpperCase()+' edition');
    const result = spawnSync(process.execPath,[__filename,language],{stdio:'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
  }
  process.exit(0);
}
const english = process.argv[2] === 'en';
const filename = english ? 'SinkManager.js' : 'SinkManager_CN.js';
const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
if (english) assert(!/\p{Script=Han}/u.test(source),'English script contains untranslated Chinese text');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
new AsyncFunction(source);
const checks = [];
let response = { status: 200, text: '{"links":[],"cursor":"next"}' };
let last;
class MockRequest {
  constructor(url) { this.url = url; last = this; }
  get headers() { return { ...this._headers }; }
  set headers(value) { this._headers = { ...value }; }
  async loadString() { this.response = { statusCode: response.status }; return response.text; }
}
const storage = new Map([['SinkManager.Site','https://sink.example'],['SinkManager.Token.https://sink.example','test-secret']]);
let alertFields = [];
let alertAction = 0;
class MockAlert {
  addTextField() {} addSecureTextField() {} addAction() {} addDestructiveAction() {} addCancelAction() {}
  textFieldValue(index) { return alertFields[index]; }
  async presentAlert() { return alertAction; }
}
const context = vm.createContext({ Request: MockRequest, Alert: MockAlert, Keychain: { contains:k=>storage.has(k), get:k=>storage.get(k), set:(k,v)=>storage.set(k,v), remove:k=>storage.delete(k) }, console, checks, assert });
const definitions = source.slice(0, source.lastIndexOf('try { await main(); }'));
vm.runInContext(definitions + '\n globalThis.testing = {api, html, configure};', context);
(async()=>{
  const {api, html, configure} = context.testing;
  const page = html(true);
  const browserCode = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(browserCode);
  const helpers = source.slice(source.indexOf('  function expirationInput('), source.indexOf('  const $ = id =>'));
  const ui = vm.createContext({ URL });
  vm.runInContext(helpers + '\nglobalThis.helpers = {normalizeTarget,plainStats,statsError,statsQuery,expirationInput,expirationSeconds};',ui);
  const {expirationInput,expirationSeconds} = ui.helpers;
  for (const value of ['2030-10-19T12:30:45','2032-02-29T00:00:00']) assert.equal(expirationInput(expirationSeconds(value)),value);
  assert.equal(expirationSeconds('2030-10-19T12:30'),expirationSeconds('2030-10-19T12:30:00'));
  assert.equal(expirationSeconds(''),undefined);
  assert.equal(expirationInput(null),'');
  assert.throws(()=>expirationSeconds('2030-02-30T12:30'));
  assert.throws(()=>expirationSeconds('invalid'));
  assert(page.includes('id="expiration" type="datetime-local"'));
  checks.push('Local date/time picker conversion, seconds, leap date and invalid date checks PASS');
  const { statsQuery } = ui.helpers;
  for (const days of [7,30,90]) {
    const query = statsQuery({path:'views'},{startAt:1000,endAt:1000+days*86400,slug:'demo'});
    assert.equal(query.unit,'day'); assert.equal(query.slug,'demo');
    assert(query.clientTimezone && /^[\w+-]+(?:\/[\w+-]+)*$/.test(query.clientTimezone));
  }
  assert.equal(statsQuery({path:'views'},{startAt:1,endAt:3601}).unit,'minute');
  assert.equal(statsQuery({path:'views'},{startAt:1,endAt:86401}).unit,'hour');
  assert.equal(statsQuery({path:'metrics',type:'country'},{}).type,'country');
  assert.equal(statsQuery({path:'counters'},{}).unit,undefined);
  checks.push('Views required unit/timezone for 7/30/90 days and slug filter PASS');
  const {normalizeTarget,plainStats,statsError} = ui.helpers;
  assert.equal(normalizeTarget('example.com/path?a=1'),'https://example.com/path?a=1');
  assert.equal(normalizeTarget('http://example.com'),'http://example.com');
  assert.equal(normalizeTarget('//example.com'),'https://example.com');
  assert.throws(()=>normalizeTarget('javascript:alert(1)'));
  assert.throws(()=>normalizeTarget('https://'));
  const counters = plainStats({data:[{visits:1234,visitors:20,referers:4}]});
  assert(counters.includes(english ? 'Visits: 1,234' : '访问次数：1,234') && counters.includes(english ? 'Unique visitors: 20' : '独立访客：20'));
  assert.equal(plainStats({data:[{name:'Chrome',count:12}]}),english ? 'Chrome: 12 visits' : 'Chrome：12 次');
  assert(plainStats({data:[{time:'2026-10-19',visits:9,visitors:3}]}).includes(english ? 'Visits: 9' : '访问次数：9'));
  assert.equal(plainStats({data:[]}),english ? 'No data' : '暂无数据');
  assert(!/[{}]/.test(counters));
  assert.equal(statsError(new Error('HTTP 400\n{"statusMessage":"Validation Error"}')),'HTTP 400\nValidation Error');
  assert(page.includes('id="url" required type="text"'));
  checks.push('Plain statistics, rankings, time series, empty data and HTTPS normalization PASS');
  checks.push('Scriptable source and embedded WebView JavaScript syntax PASS');
  const list = await api('/api/link/list','GET',undefined,{cursor:'a+b /',status:'all'});
  assert.equal(list.cursor,'next');
  assert(last.url.includes('cursor=a%2Bb%20%2F'));
  assert.equal(last.headers.Authorization,'Bearer test-secret');
  checks.push('Bearer authentication and encoded query PASS');
  await api('/api/link/create','POST',{url:'https://example.com',slug:'demo'});
  assert.equal(last.headers['Content-Type'],'application/json; charset=utf-8');
  assert.equal(JSON.parse(last.body).url,'https://example.com');
  checks.push('Create request JSON Content-Type persists through native-style dictionary getter PASS');
  await api('/api/link/edit','PUT',{slug:'demo',url:'https://example.com'});
  assert.equal(last.method,'PUT'); assert.equal(JSON.parse(last.body).slug,'demo');
  await api('/api/link/delete','POST',{slug:'demo'});
  assert.equal(last.method,'POST');
  checks.push('Edit/delete methods and JSON payload PASS');
  response={status:401,text:'bad test-secret'};
  await assert.rejects(api('/api/verify'),e=>e.message.includes('HTTP 401')&&!e.message.includes('test-secret'));
  response={status:200,text:'<html>error</html>'};
  await assert.rejects(api('/api/link/list'),/JSON/);
  response={status:204,text:''}; assert.equal(await api('/api/link/delete','POST',{}),null);
  checks.push('HTTP errors, token redaction, non-JSON and empty response PASS');
  const browser = vm.createContext({window:{__queue:[{id:1,action:'token'}]}});
  const batch = vm.runInContext('(function(){return JSON.stringify(window.__queue.splice(0));})()', browser);
  assert.equal(typeof batch,'string'); assert.equal(JSON.parse(batch)[0].id,1);
  browser.window.__reply=r=>{browser.reply=r;};
  const result=vm.runInContext('(function(){window.__reply({id:1,ok:true,data:null});return "ok";})()',browser);
  assert.equal(typeof result,'string'); assert.equal(browser.reply.ok,true);
  checks.push('Both WebView bridge directions return strings PASS');
  assert(!source.includes('test-secret'));
  assert(!page.includes('test-secret'));
  response={status:200,text:'{}'};
  alertFields=['https://other.example/','Bearer next-secret'];
  const configured = await configure();
  assert.equal(configured.base,'https://other.example');
  assert.equal(storage.get('SinkManager.Token.https://other.example'),'next-secret');
  assert.equal(storage.get('SinkManager.Token.https://sink.example'),'test-secret');
  assert(!html(true).includes('next-secret'));
  alertFields=['https://third.example','wrong-secret']; response={status:401,text:'invalid'};
  await assert.rejects(configure(),/401/);
  assert.equal(storage.get('SinkManager.Site'),'https://other.example');
  response={status:200,text:'{}'};
  await api('/api/verify');
  assert(last.url.startsWith('https://other.example/'));
  assert.equal(last.headers.Authorization,'Bearer next-secret');
  alertFields=['https://other.example','']; await configure();
  alertFields=['https://other.example/dashboard','x']; await assert.rejects(configure(),/HTTPS/);
  alertFields=['https://user:password@other.example','x']; await assert.rejects(configure(),/HTTPS/);
  alertAction=1; await configure();
  assert(!storage.has('SinkManager.Token.https://other.example'));
  checks.push('Site configuration, isolated Keychain tokens, rollback and token clearing PASS');
  console.log(checks.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
