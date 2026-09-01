import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';

const ease = (frame: number, duration: number) => interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: '#edf4f0', color: '#17221c', alignItems: 'center', justifyContent: 'center', opacity: ease(frame, 48)}}>
    <div style={{textAlign: 'center', transform: `translateY(${interpolate(frame, [0, 22], [22, 0], {extrapolateRight: 'clamp'})}px)`}}>
      <div style={{fontFamily: 'Georgia, serif', fontSize: 106, letterSpacing: -5}}>Darabiha</div>
      <div style={{fontFamily: 'Arial, sans-serif', fontSize: 24, color: '#557064', marginTop: 18, letterSpacing: 1.7}}>A LIVING FAMILY ARCHIVE</div>
    </div>
  </AbsoluteFill>;
};

const Still: React.FC<{file: string; eyebrow: string; title: string; duration: number; anchor?: 'left' | 'right'}> = ({file, eyebrow, title, duration, anchor = 'left'}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, duration], [1.065, 1.015], {extrapolateRight: 'clamp'});
  const x = interpolate(frame, [0, duration], [anchor === 'left' ? 35 : -35, 0], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{background: '#0d100f', opacity: ease(frame, duration), overflow: 'hidden'}}>
    <Img src={staticFile(`captures/${file}`)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${x}px) scale(${scale})`}} />
    <div style={{position: 'absolute', left: 74, bottom: 65, padding: '22px 28px 24px', borderRadius: 18, background: 'rgba(248,250,249,.94)', boxShadow: '0 18px 55px rgba(0,0,0,.22)'}}>
      <div style={{fontFamily: 'Arial, sans-serif', color: '#28734f', fontSize: 16, fontWeight: 700, letterSpacing: 2}}>{eyebrow}</div>
      <div style={{fontFamily: 'Georgia, serif', color: '#16231b', fontSize: 42, letterSpacing: -1, marginTop: 7}}>{title}</div>
    </div>
  </AbsoluteFill>;
};

const Motion: React.FC = () => {
  const frame = useCurrentFrame();
  const duration = 292;
  const scale = interpolate(frame, [0, duration], [1.015, 1.105], {extrapolateRight: 'clamp'});
  const x = interpolate(frame, [0, duration], [0, -34], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [0, duration], [0, 10], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{background: '#070a08', opacity: ease(frame, duration), overflow: 'hidden'}}>
    <OffthreadVideo src={staticFile('captures/tree-motion.mov')} muted style={{width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${x}px, ${y}px) scale(${scale})`}} />
    <div style={{position: 'absolute', right: 58, top: 48, padding: '13px 18px', borderRadius: 999, background: 'rgba(248,250,249,.9)', color: '#20352a', fontFamily: 'Arial, sans-serif', fontSize: 19, fontWeight: 650, boxShadow: '0 12px 38px rgba(0,0,0,.18)'}}>Pan · zoom · explore</div>
  </AbsoluteFill>;
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: '#18241e', color: '#f4f7f5', alignItems: 'center', justifyContent: 'center', opacity: interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'})}}>
    <div style={{fontFamily: 'Georgia, serif', fontSize: 74, letterSpacing: -2.5}}>Every family story, connected.</div>
    <div style={{fontFamily: 'Arial, sans-serif', fontSize: 22, color: '#a9c4b6', marginTop: 22, letterSpacing: 1.2}}>DARABIHA.COM</div>
  </AbsoluteFill>;
};

export const DarabihaTour: React.FC = () => <AbsoluteFill style={{background: '#0c100e'}}>
  <Sequence durationInFrames={36}><Intro /></Sequence>
  <Sequence from={28} durationInFrames={292} premountFor={30}><Motion /></Sequence>
  <Sequence from={308} durationInFrames={72} premountFor={30}><Still file="profile.png" eyebrow="A LIVING RECORD" title="Open any person to see their story" duration={72} anchor="right" /></Sequence>
  <Sequence from={368} durationInFrames={52}><Outro /></Sequence>
</AbsoluteFill>;
