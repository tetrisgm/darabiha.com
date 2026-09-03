import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';

const FPS = 30;
// segment lengths in frames: card, then the five captures, then card
export const SEGMENTS = [150, 279, 279, 643, 766, 327, 165];
export const TOTAL = SEGMENTS.reduce((sum, item) => sum + item, 0);

const fade = (frame: number, duration: number) =>
  interpolate(frame, [0, 12, duration - 12, duration], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

const Card: React.FC<{title: string; sub: string; duration: number}> = ({title, sub, duration}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: '#101712', color: '#eef4ef', alignItems: 'center', justifyContent: 'center', opacity: fade(frame, duration)}}>
    <div style={{textAlign: 'center', transform: `translateY(${interpolate(frame, [0, 20], [18, 0], {extrapolateRight: 'clamp'})}px)`}}>
      <div style={{fontFamily: 'Georgia, serif', fontSize: 104, letterSpacing: -4}}>{title}</div>
      <div style={{fontFamily: 'Arial, sans-serif', fontSize: 26, color: '#9dbfa8', marginTop: 20, letterSpacing: 2}}>{sub}</div>
    </div>
  </AbsoluteFill>;
};

const Clip: React.FC<{file: string; eyebrow: string; title: string; duration: number}> = ({file, eyebrow, title, duration}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: '#0b0f0c', opacity: fade(frame, duration)}}>
    <OffthreadVideo src={staticFile(`captures/${file}`)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    <div style={{position: 'absolute', left: 44, bottom: 40, padding: '16px 22px 18px', borderRadius: 14, background: 'rgba(246,250,247,.95)', boxShadow: '0 14px 44px rgba(0,0,0,.35)', maxWidth: 620}}>
      <div style={{fontFamily: 'Arial, sans-serif', color: '#2b7a52', fontSize: 15, fontWeight: 700, letterSpacing: 2}}>{eyebrow}</div>
      <div style={{fontFamily: 'Georgia, serif', color: '#152218', fontSize: 33, letterSpacing: -0.5, marginTop: 6}}>{title}</div>
    </div>
  </AbsoluteFill>;
};

export const TreeTreeWebMCP: React.FC = () => {
  const clips: Array<{kind: 'card' | 'clip'; file?: string; eyebrow?: string; title: string; sub?: string; audio: string}> = [
    {kind: 'card', title: 'TreeTree', sub: 'THE FAMILY TREE YOU CAN TALK TO · WEBMCP CHALLENGE', audio: 'n0.wav'},
    {kind: 'clip', file: 's1-intro.webm', eyebrow: 'TREETREE.APP · LIVE', title: 'A human arrives: the tree, then a four-line introduction', audio: 'n1.wav'},
    {kind: 'clip', file: 's2-guide.webm', eyebrow: 'THE WEBMCP GUIDE', title: 'The exact sentences to say to your agent', audio: 'n2.wav'},
    {kind: 'clip', file: 's3-agent.webm', eyebrow: 'AN AGENT ARRIVES', title: 'Chat tucks away — 14 tools drive the page the human watches', audio: 'n3.wav'},
    {kind: 'clip', file: 's4-sandbox.webm', eyebrow: 'THE SANDBOX · /demo', title: 'The agent creates; the sidebar narrates; either can undo', audio: 'n4.wav'},
    {kind: 'clip', file: 's5-repo.webm', eyebrow: 'GITHUB.COM/TETRISGM/TREETREE', title: 'MIT · one-command Cloudflare deploy · hosted MCP too', audio: 'n5.wav'},
    {kind: 'card', title: 'treetree.app', sub: 'HUMANS AND AGENTS, BUILDING FAMILY HISTORY TOGETHER', audio: 'n6.wav'},
  ];
  let cursor = 0;
  return <AbsoluteFill style={{background: '#0b0f0c'}}>
    {clips.map((item, index) => {
      const from = cursor;
      const duration = SEGMENTS[index];
      cursor += duration;
      return <Sequence key={index} from={from} durationInFrames={duration}>
        {item.kind === 'card'
          ? <Card title={item.title} sub={item.sub!} duration={duration} />
          : <Clip file={item.file!} eyebrow={item.eyebrow!} title={item.title} duration={duration} />}
        <Audio src={staticFile(`audio/${item.audio}`)} />
      </Sequence>;
    })}
  </AbsoluteFill>;
};

export const fps = FPS;
