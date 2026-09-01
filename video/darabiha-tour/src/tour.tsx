import React from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const scenes = [
  {file: 'family.png', eyebrow: 'FAMILY VIEW', title: 'Start with the people closest to you', body: 'Move naturally through parents, siblings, children, and earlier generations.'},
  {file: 'tree.png', eyebrow: 'TREE', title: 'See the whole archive', body: 'Pan and zoom across more than four hundred connected family records.'},
  {file: 'profile.png', eyebrow: 'PEOPLE', title: 'Every person has a living record', body: 'Dates, places, relationships, photographs, biography, and notes stay together.'},
  {file: 'list.png', eyebrow: 'LIST', title: 'Find anyone quickly', body: 'Browse and search the archive without losing the family context.'},
  {file: 'timeline.png', eyebrow: 'TIMELINE', title: 'Follow the family through time', body: 'Births, lives, and stories become a shared chronology.'},
  {file: 'calendar.png', eyebrow: 'CALENDAR', title: 'Return to meaningful dates', body: 'See birthdays, anniversaries, and the moments preserved by the family.'},
  {file: 'map.png', eyebrow: 'MAP', title: 'Trace where the family has lived', body: 'Places across generations become part of the story.'},
  {file: 'numbers.png', eyebrow: 'THE ARCHIVE', title: 'Understand the shape of the family', body: 'Generations, places, dates, and records become legible at a glance.'},
] as const;

const fade = (frame: number, duration: number) =>
  interpolate(frame, [0, 12, duration - 14, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 26], [28, 0], {extrapolateRight: 'clamp'});
  const opacity = interpolate(frame, [0, 18, 80, 100], [0, 1, 1, 0], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#edf4f0', color: '#17221c', alignItems: 'center', justifyContent: 'center', opacity}}>
      <div style={{textAlign: 'center', transform: `translateY(${enter}px)`}}>
        <div style={{fontFamily: 'Georgia, serif', fontSize: 112, letterSpacing: -5}}>Darabiha</div>
        <div style={{fontFamily: 'Arial, sans-serif', fontSize: 28, color: '#557064', marginTop: 22, letterSpacing: 1.5}}>A LIVING FAMILY ARCHIVE</div>
      </div>
    </AbsoluteFill>
  );
};

const Scene: React.FC<{scene: (typeof scenes)[number]; duration: number; index: number}> = ({scene, duration, index}) => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, duration);
  const scale = interpolate(frame, [0, duration], [1.035, 1], {extrapolateRight: 'clamp'});
  const imageX = interpolate(frame, [0, duration], [index % 2 ? 8 : -8, 0], {extrapolateRight: 'clamp'});
  const textY = interpolate(frame, [7, 28], [26, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#eaf2ee', opacity, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 74% 28%, #f9fcfa 0, #e8f1ed 54%, #dce9e3 100%)'}} />
      <div style={{position: 'absolute', left: 82, top: 84, width: 1756, height: 912, borderRadius: 30, overflow: 'hidden', boxShadow: '0 30px 90px rgba(33, 62, 48, .18)', background: '#fff', transform: `translateX(${imageX}px) scale(${scale})`}}>
        <Img src={staticFile(`captures/${scene.file}`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </div>
      <div style={{position: 'absolute', left: 126, bottom: 116, width: 820, padding: '30px 34px 32px', borderRadius: 22, background: 'rgba(250,252,250,.94)', boxShadow: '0 18px 60px rgba(20,45,32,.15)', transform: `translateY(${textY}px)`}}>
        <div style={{fontFamily: 'Arial, sans-serif', color: '#28734f', fontSize: 18, fontWeight: 700, letterSpacing: 2.4}}>{scene.eyebrow}</div>
        <div style={{fontFamily: 'Georgia, serif', color: '#16231b', fontSize: 48, lineHeight: 1.08, letterSpacing: -1.5, marginTop: 10}}>{scene.title}</div>
        <div style={{fontFamily: 'Arial, sans-serif', color: '#587065', fontSize: 24, lineHeight: 1.35, marginTop: 14}}>{scene.body}</div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#18241e', color: '#f4f7f5', alignItems: 'center', justifyContent: 'center', opacity}}>
      <div style={{fontFamily: 'Georgia, serif', fontSize: 86, letterSpacing: -3}}>Every family story, connected.</div>
      <div style={{fontFamily: 'Arial, sans-serif', fontSize: 25, color: '#a9c4b6', marginTop: 26, letterSpacing: 1}}>DARABIHA.COM</div>
    </AbsoluteFill>
  );
};

export const DarabihaTour: React.FC = () => {
  const {fps} = useVideoConfig();
  const intro = 100;
  const sceneDuration = 90;
  return (
    <AbsoluteFill style={{background: '#eaf2ee'}}>
      <Sequence durationInFrames={intro}><Intro /></Sequence>
      {scenes.map((scene, index) => (
        <Sequence key={scene.file} from={intro + index * sceneDuration - index * 8} durationInFrames={sceneDuration} premountFor={fps}>
          <Scene scene={scene} duration={sceneDuration} index={index} />
        </Sequence>
      ))}
      <Sequence from={756} durationInFrames={114}><Outro /></Sequence>
    </AbsoluteFill>
  );
};
