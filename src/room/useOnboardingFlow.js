import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as onboardingModel from '../onboarding/onboarding-model.mjs';
import { createPlayerAdapter } from '../onboarding/onboarding-adapter.mjs';
import { desktopCommand } from '../desktop-client';
import { musicRequest } from '../room-playback.mjs';
import { version as currentVersion } from '../../package.json';
import { releaseFor } from '../onboarding/releases.mjs';
import { welcomeLetter, releaseLetter } from '../desk/post.mjs';
import { postLetter, afterDeskLit } from '../desk/usePost';

// First-run guide and the settings hub (section '' = closed; 'music/accounts'
// is 音源 › 账户与文件夹), plus the window events and companion commands that open them.
// 3.1: nothing pops over the desk on launch. As on DEsk, a first run gets a welcome letter in the post
// box 2.5 s after the desk is lit (its three steps open the guide at that step, as 设置 › 重新引导
// does), and a new version gets a letter with its notes, once.
export default function useOnboardingFlow({ client, loading, loadError, firstVisit, itemCount, hubRequest, notify }) {
  const [hub, setHub] = useState('');
  const env = useMemo(() => onboardingModel.detectEnv(window), [client]);
  const playerAdapter = useMemo(() => createPlayerAdapter({ env, command: desktopCommand, request: musicRequest }), [env]);
  const [onboarding, setOnboarding] = useState(() => onboardingModel.readOnboarding(localStorage));
  const [wizard, setWizard] = useState(false), [wizardMode, setWizardMode] = useState('');
  const welcomeChecked = useRef(false), current = useRef(onboarding); current.current = onboarding;
  const saveOnboarding = useCallback((next) => { setOnboarding(next); try { onboardingModel.writeOnboarding(localStorage, next); } catch { notify?.('这次未能记住引导进度，下次仍可从「设置 › 关于」重新引导。'); } }, [notify]);
  useEffect(() => {
    if (loading || loadError || welcomeChecked.current) return;
    welcomeChecked.current = true;
    const plan = onboardingModel.launchPlan(current.current, { isNew: firstVisit && !itemCount, currentVersion });
    if (!plan.open) return;
    // A resumed guide keeps its saved step; an update only remembers which
    // version the 新功能 sheet compares against.
    const next = onboardingModel.applyLaunchPlan(current.current, plan, currentVersion);
    if (plan.mode === 'update') {
      // The version's letter goes in the box; the version counts as seen (the whole history is in 设置 › 关于).
      postLetter(releaseLetter(releaseFor(currentVersion) || { version: currentVersion }));
      saveOnboarding(onboardingModel.dismissUpdate(next, currentVersion));
      return;
    }
    if (next !== current.current) saveOnboarding(next);
    // A first run, or a guide not finished last time: the welcome letter (only once; one thrown away stays away).
    // (not cancelled with the room: a letter posted after it is gone is still in the box next time)
    afterDeskLit(() => postLetter(welcomeLetter()), 2500);
  }, [loading, loadError, firstVisit, itemCount]);
  // The welcome letter's steps: the guide, open at that step.
  const openStep = useCallback((step) => { setHub(''); saveOnboarding(onboardingModel.goTo(current.current, onboardingModel.STEPS.includes(step) ? step : onboardingModel.STEPS[0])); setWizardMode('manual'); setWizard(true); }, [saveOnboarding]);
  const stepRef = useRef(openStep); stepRef.current = openStep;
  useEffect(() => { const on = (event) => stepRef.current(event.detail?.step); window.addEventListener('cabin:onboarding-step', on); return () => window.removeEventListener('cabin:onboarding-step', on); }, []);
  // An external request is an event, not persistent desired dialog state.
  // Effect replay (including Fast Refresh) must not reopen a dismissed request.
  const consumedHubRequest = useRef(null);
  useEffect(() => {
    if (!hubRequest?.section || consumedHubRequest.current === hubRequest) return;
    consumedHubRequest.current = hubRequest;
    setHub(hubRequest.section);
  }, [hubRequest]);
  const restartOnboarding = useCallback(() => { setHub(''); saveOnboarding(onboardingModel.reopen(current.current)); setWizardMode('manual'); setWizard(true); }, [saveOnboarding]);
  const closeWizard = useCallback((reason = 'later') => {
    setWizard(false);
    // The 新功能 sheet is seen as soon as it is closed, however that happens.
    if (wizardMode === 'update' || current.current.fromVersion) { saveOnboarding(onboardingModel.dismissUpdate(current.current, currentVersion)); setWizardMode(''); return; }
    if (reason === 'skip') saveOnboarding(onboardingModel.skip(current.current, currentVersion));
    else if (reason === 'done') saveOnboarding(onboardingModel.complete(current.current, currentVersion));
    // 'later' keeps status 'active' so the next launch resumes this step.
    setWizardMode(reason === 'later' ? wizardMode : '');
  }, [saveOnboarding, wizardMode]);
  // The guide's 更多音源 and the deck's 音源设置 open Settings on 音源 (or one page deeper).
  const openMusicSettings = useCallback((section = 'music') => setHub(section), []);
  const restart = useRef(restartOnboarding); restart.current = restartOnboarding;
  useEffect(() => {
    const receive = (event) => { const command = event.detail?.command; if (command === 'open-settings') setHub((value) => value || 'music'); if (command === 'open-about') setHub('about'); if (command === 'open-onboarding') restart.current(); };
    const open = (event) => setHub(event.detail?.section || 'music'), music = () => setHub('music');
    window.addEventListener('album-companion-command', receive); window.addEventListener('cabin-open-settings', open); window.addEventListener('cabin-open-music-settings', music);
    return () => { window.removeEventListener('album-companion-command', receive); window.removeEventListener('cabin-open-settings', open); window.removeEventListener('cabin-open-music-settings', music); };
  }, []);
  return { env, playerAdapter, hub, setHub, onboarding, saveOnboarding, wizard, closeWizard, restartOnboarding, openMusicSettings, openStep };
}
