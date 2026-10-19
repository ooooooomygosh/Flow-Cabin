import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as onboardingModel from '../onboarding/onboarding-model.mjs';
import { createPlayerAdapter } from '../onboarding/onboarding-adapter.mjs';
import { desktopCommand } from '../desktop-client';
import { musicRequest } from '../room-playback.mjs';
import { version as currentVersion } from '../../package.json';

// First-run guide and the settings hub (section '' = closed; 'music/accounts'
// is 音源 › 账户与文件夹), plus the window events and companion commands that open them.
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
    // A resumed update keeps its saved step; only a new version gap starts at
    // the release list. Restarting it on every launch would lose the user's place.
    const next = onboardingModel.applyLaunchPlan(current.current, plan, currentVersion);
    if (next !== current.current) saveOnboarding(next);
    setWizardMode(plan.mode);
    setWizard(true);
  }, [loading, loadError, firstVisit, itemCount]);
  useEffect(() => { if (hubRequest?.section) setHub(hubRequest.section); }, [hubRequest]);
  const restartOnboarding = useCallback(() => { setHub(''); saveOnboarding(onboardingModel.reopen(current.current)); setWizardMode('manual'); setWizard(true); }, [saveOnboarding]);
  const closeWizard = useCallback((reason = 'later') => {
    setWizard(false);
    // Version updates are a guided check, not a one-tap dismissal: closing one
    // keeps it active so the next launch resumes at the same step.
    const action = reason === 'skip' && wizardMode === 'update' ? 'later' : reason;
    if (action === 'skip') saveOnboarding(onboardingModel.skip(current.current, currentVersion));
    else if (action === 'done') saveOnboarding(onboardingModel.complete(current.current, currentVersion));
    // 'later' keeps status 'active' so the next launch resumes this step.
    setWizardMode(action === 'later' ? wizardMode : '');
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
  return { env, playerAdapter, hub, setHub, onboarding, saveOnboarding, wizard, closeWizard, restartOnboarding, openMusicSettings };
}
