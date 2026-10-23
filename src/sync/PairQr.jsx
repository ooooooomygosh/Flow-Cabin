import { parsePairingPayload } from './pairing-model.mjs';
import React, { useEffect, useRef, useState } from 'react';
const validInvite = data => data?.type === 'flow-cabin-pair' && data.version === 1 && /^[a-f0-9]{64}$/i.test(data.pin) && /^[a-f0-9]{64}$/i.test(data.token) && Number.isFinite(data.expiresAt) && data.expiresAt > Date.now();
export default function PairQr({ invite, onScan }) {
  const [src, setSrc] = useState(''), [scanning, setScanning] = useState(false), [message, setMessage] = useState('');
  const video = useRef(null), stream = useRef(null), generation = useRef(0);
  const stop = () => { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setScanning(false); window.albumMobile?.endCameraScan?.().catch?.(() => {}); };
  useEffect(() => {
    let disposed = false, timer; setSrc('');
    if (validInvite(invite)) import('qrcode').then(({ default: qr }) => qr.toDataURL(JSON.stringify(invite), { errorCorrectionLevel: 'M', width: 320, margin: 3, color: { dark: '#23170e', light: '#fff4de' } })).then(value => { if (!disposed) { setSrc(value); timer = setTimeout(() => setSrc(''), Math.max(0, invite.expiresAt - Date.now())); } }).catch(() => setMessage('二维码未能生成，请复制下方配对载荷。'));
    return () => { disposed = true; clearTimeout(timer); };
  }, [invite]);
  useEffect(() => { const hidden = () => { if (document.hidden) stop(); }; document.addEventListener('visibilitychange', hidden); return () => document.removeEventListener('visibilitychange', hidden); }, []);
  useEffect(() => () => { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); window.albumMobile?.endCameraScan?.().catch?.(() => {}); }, []);
  const scan = async () => {
    stop(); const epoch = generation.current; setMessage('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('当前客户端不支持摄像头，请粘贴配对载荷。');
      await window.albumMobile?.endCameraScan?.();
      await window.albumMobile?.beginCameraScan?.();
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } }, audio: false });
      if (epoch !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; setScanning(true);
      const { default: decode } = await import('jsqr');
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!video.current || epoch !== generation.current) return stop();
      video.current.srcObject = media; await video.current.play();
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true }), deadline = Date.now() + 120000;
      const tick = () => {
        if (epoch !== generation.current) return;
        if (!video.current || Date.now() > deadline) { stop(); setMessage('扫描已结束，可重试或粘贴配对载荷。'); return; }
        if (video.current.readyState >= 2) {
          canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight; context.drawImage(video.current, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height), result = decode(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (result) { try { const data = parsePairingPayload(result.data); onScan(data); stop(); setMessage('已读取，请核对证书指纹后配对。'); return; } catch (e) { setMessage(e.message); } }
        }
        setTimeout(tick, 120);
      }; tick();
    } catch { stop(); setMessage('未能使用摄像头，请允许相机权限或复制配对载荷。'); }
  };
  return <div className="lan-qr">{src && <figure><img src={src} width="240" height="240" alt="两分钟有效的心流小屋配对二维码"/><figcaption>在自己的另一台设备上扫描，核对指纹后配对。</figcaption></figure>}<button type="button" onClick={scanning ? stop : scan}>{scanning ? '停止扫描' : '扫描另一台小屋的二维码'}</button>{scanning && <video ref={video} muted playsInline aria-label="配对二维码取景" style={{ width: '100%', maxHeight: 260 }}/>}<p role="status">{message}</p></div>;
}
