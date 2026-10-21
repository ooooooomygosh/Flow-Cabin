'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSettings, DEFAULT_SETTINGS, appearanceScript } = require('../settings.cjs');
const { safeSavedWindow } = require('../policy.cjs');
test('saved appearance rejects CSS injection and clamps excessive scaling', () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ font: '"; url(https://example.com)' }).font, 'system');
  assert.equal(normalizeSettings({ zoom: 999, weight: 600, theme: 'invalid' }).zoom, 150);
  assert.equal(normalizeSettings({ weight: 600 }).weight, 400);
  assert.equal(normalizeSettings({ weight: 250 }).weight, 250);
  assert.equal(normalizeSettings({ font: 'Microsoft YaHei' }).font, 'Microsoft YaHei');
  assert.ok(appearanceScript(DEFAULT_SETTINGS).includes('system-ui'));
  assert.ok(!appearanceScript(DEFAULT_SETTINGS).includes('HarmonyOS Sans SC Bundled'));
  assert.ok(appearanceScript({ font: 'bundled' }).includes('HarmonyOS Sans SC Bundled'));
  assert.equal(normalizeSettings({ font: 'bundled' }).font, 'bundled', 'existing explicit font choice is preserved');
});
test('restore fits small work areas and clamps partly offscreen saved windows', () => {
  const area = { x: -800, y: 0, width: 800, height: 480 };
  assert.deepEqual(safeSavedWindow({ x: -750, y: 200, width: 1360, height: 900 }, area), { x: -800, y: 0, width: 800, height: 480 });
});

test('closing appearance settings restores the visible content keyboard focus only', () => {
  const { setSettingsVisibility } = require('../settings.cjs');
  const events=[], site={setVisible:value=>events.push(['visible',value]),webContents:{isDestroyed:()=>false,focus:()=>events.push(['focus'])}};
  setSettingsVisibility(site,{open:true});assert.deepEqual(events,[['visible',false]]);
  events.length=0;setSettingsVisibility(site,{open:false});assert.deepEqual(events,[['visible',true],['focus']]);
  for(const state of [{open:false,loading:true},{open:false,error:'offline'}]){events.length=0;setSettingsVisibility(site,state);assert.deepEqual(events,[['visible',false]]);}
  events.length=0;site.webContents.isDestroyed=()=>true;setSettingsVisibility(site,{open:false});assert.deepEqual(events,[['visible',true]]);
  assert.doesNotThrow(()=>setSettingsVisibility(null,{open:false}));
});

test('hidden appearance shell never steals keyboard focus back from the content', async () => {
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  let onState;const focused=[];const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{style:{},value:'',checked:false,addEventListener(){},querySelector(){return null;},append(){},focus(){focused.push(id);}});return elements.get(id);};
  const context={document:{body:{dataset:{}},getElementById:element,querySelectorAll:()=>[],createElement:()=>({append(){}})},window:{addEventListener(){},albumDesktop:{onState:fn=>{onState=fn;},command:async()=>{},settings:async()=>({settings:DEFAULT_SETTINGS,fonts:[]})}},console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8'),context);
  onState({settingsOpen:true,settings:DEFAULT_SETTINGS});await Promise.resolve();assert.equal(focused.at(-1),'settings-close');focused.length=0;
  onState({settingsOpen:false,loading:false,error:null});assert.deepEqual(focused,[],'content focus is owned by the main process');
  onState({settingsOpen:true,settings:DEFAULT_SETTINGS});focused.length=0;onState({settingsOpen:false,error:'offline'});assert.deepEqual(focused,['settings'],'visible recovery shell still gets its focus target');
});
