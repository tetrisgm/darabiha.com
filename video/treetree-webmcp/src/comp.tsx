import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';

const FPS = 30;
export const SEGMENTS = [140, 279, 279, 643, 766, 327, 150];
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

/** The narration lives on screen: sequential caption chunks in a bottom bar. */
const Captions: React.FC<{lines: string[]; duration: number}> = ({lines, duration}) => {
  const frame = useCurrentFrame();
  const per = duration / lines.length;
  const index = Math.min(lines.length - 1, Math.floor(frame / per));
  const local = frame - index * per;
  const opacity = interpolate(local, [0, 8, per - 8, per], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 60px 26px', background: 'linear-gradient(transparent, rgba(6,9,7,.88) 30%)', textAlign: 'center'}}>
    <span style={{fontFamily: 'Arial, sans-serif', fontSize: 27, lineHeight: 1.35, color: '#f2f6f3', opacity, textShadow: '0 2px 10px rgba(0,0,0,.8)'}}>{lines[index]}</span>
  </div>;
};

const Clip: React.FC<{file: string; eyebrow: string; title: string; duration: number; lines: string[]}> = ({file, eyebrow, title, duration, lines}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: '#0b0f0c', opacity: fade(frame, duration)}}>
    <OffthreadVideo src={staticFile(`captures/${file}`)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    <div style={{position: 'absolute', left: 40, top: 34, padding: '13px 19px 15px', borderRadius: 13, background: 'rgba(246,250,247,.95)', boxShadow: '0 12px 38px rgba(0,0,0,.35)', maxWidth: 560}}>
      <div style={{fontFamily: 'Arial, sans-serif', color: '#2b7a52', fontSize: 14, fontWeight: 700, letterSpacing: 2}}>{eyebrow}</div>
      <div style={{fontFamily: 'Georgia, serif', color: '#152218', fontSize: 28, letterSpacing: -0.5, marginTop: 5}}>{title}</div>
    </div>
    <Captions lines={lines} duration={duration} />
  </AbsoluteFill>;
};

export const TreeTreeWebMCP: React.FC = () => {
  const clips: Array<{kind: 'card' | 'clip'; file?: string; eyebrow?: string; title: string; sub?: string; lines?: string[]}> = [
    {kind: 'card', title: 'TreeTree', sub: 'THE FAMILY TREE YOU CAN TALK TO · WEBMCP CHALLENGE'},
    {kind: 'clip', file: 's1-intro.webm', eyebrow: 'TREETREE.APP · LIVE', title: 'A human arrives', lines: [
      'This is TreeTree, live at treetree.app.',
      'A human arriving meets the invented Everfield family — and a four-line introduction.',
    ]},
    {kind: 'clip', file: 's2-guide.webm', eyebrow: 'THE WEBMCP GUIDE', title: 'The agent script', lines: [
      'One click opens the WebMCP guide:',
      'the exact sentences to say to your agent.',
    ]},
    {kind: 'clip', file: 's3-agent.webm', eyebrow: 'AN AGENT ARRIVES', title: 'The page adapts', lines: [
      'An agent\u2019s browser opens the page — and the chat tucks away. The agent is the chat.',
      '14 tools register before the page even hydrates \u2014 document.modelContext and navigator both.',
      'The page introduces itself, and kinship comes back in family words, computed from the graph.',
      'And the agent drives the very canvas the human is watching.',
    ]},
    {kind: 'clip', file: 's4-sandbox.webm', eyebrow: 'THE SANDBOX · /demo', title: 'Creating together', lines: [
      'In the sandbox — no sign-in, invented people — the agent creates.',
      'People added, a parent linked, a marriage recorded, narrated in the sidebar as the family grows.',
      'Undo works for either party: human click or agent call.',
      'And a full GEDCOM import runs the way a real archive ingests one.',
    ]},
    {kind: 'clip', file: 's5-repo.webm', eyebrow: 'GITHUB.COM/TETRISGM/TREETREE', title: 'Open and deployable', lines: [
      'MIT licensed. One command deploys your family\u2019s own on Cloudflare.',
      'The same intent layer serves hosted MCP and the in-page archivist \u2014 three doors, one archive.',
    ]},
    {kind: 'card', title: 'treetree.app', sub: 'HUMANS AND AGENTS, BUILDING FAMILY HISTORY TOGETHER'},
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
          : <Clip file={item.file!} eyebrow={item.eyebrow!} title={item.title} duration={duration} lines={item.lines!} />}
      </Sequence>;
    })}
  </AbsoluteFill>;
};

export const fps = FPS;
