import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as onboardingModel from '../onboarding/onboarding-model.mjs';
import { createPlayerAdapter } from '../onboarding/onboarding-adapter.mjs';
import { desktopCommand } from '../desktop-client';
import { musicRequest } from '../room-playback.mjs';

// First-run guide and the settings hub (section '' = closed; 'music/accounts'
// is 音源 › 账户与文件夹), plus the window events and companion commands that open them.
export default function useOnboardingFlow({ client, loading, loadError, firstVisit, itemCount, hubRequest, notify }) {
  const [hub, setHub] = useState('');
  const env = useMemo(() => onboardingModel.detectEnv(window), [client]);
  const playerAdapter = useMemo(() => createPlayerAdapter({ env, command: desktopCommand, request: musicRequest }), [env]);
  const [onboarding, setOnboarding] = useState(() => onboardingModel.readOnboarding(localStorage));
  const [wizard, setWizard] = useState(false);
  const welcomeChecked = useRef(false), current = useRef(onboarding); current.current = onboarding;
  const saveOnboarding = useCallback((next) => { setOnboarding(next); try { onboardingModel.writeOnboarding(localStorage, next); } catch { notify?.('这次未能记住引导进度，下次仍可从「设置 › 关于」重新引导。'); } }, [notify]);
  useEffect(() => {
    if (loading || loadError || welcomeChecked.current) return;
    welcomeChecked.current = true;
    if (onboardingModel.shouldAutoOpen(current.current, { isNew: firstVisit && !itemCount })) { setWizard(true); if (current.current.status === 'new') saveOnboarding(onboardingModel.start(current.current)); }
  }, [loading, loadError, firstVisit, itemCount]);
  useEffect(() => { if (hubRequest?.section) setHub(hubRequest.section); }, [hubRequest]);
  const restartOnboarding = useCallback(() => { setHub(''); saveOnboarding(onboardingModel.reopen(current.current)); setWizard(true); }, [saveOnboarding]);
  const closeWizard = useCallback((reason) => {
    setWizard(false);
    if (reason === 'skip') saveOnboarding(onboardingModel.skip(current.current));
    else if (reason === 'done') saveOnboarding(onboardingModel.complete(current.current));
    // 'later' keeps status 'active' so the next launch resumes this step.
  }, [saveOnboarding]);
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
